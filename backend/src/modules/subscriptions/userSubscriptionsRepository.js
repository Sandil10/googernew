const pool = require('../../config/database');

let tableReady = false;
let tableReadyPromise = null;

const ensureTable = async () => {
    if (tableReady) return;
    if (tableReadyPromise) return tableReadyPromise;

    tableReadyPromise = (async () => {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_plan_subscriptions (
                id            SERIAL PRIMARY KEY,
                user_id       INTEGER       NOT NULL,
                plan_id       INTEGER       NOT NULL,
                plan_slug     VARCHAR(60)   NOT NULL,
                plan_name     VARCHAR(120)  NOT NULL,
                price_paid    DECIMAL(12,2) NOT NULL DEFAULT 0,
                duration_days INTEGER       NOT NULL DEFAULT 30,
                status        VARCHAR(20)   NOT NULL DEFAULT 'active',
                auto_renew    BOOLEAN       NOT NULL DEFAULT TRUE,
                started_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                expires_at    TIMESTAMP,
                cancelled_at  TIMESTAMP,
                created_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`ALTER TABLE user_plan_subscriptions ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN NOT NULL DEFAULT TRUE;`);
        await pool.query(`ALTER TABLE user_plan_subscriptions ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP;`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_plan_subscriptions_user ON user_plan_subscriptions(user_id, status);`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_plan_subscriptions_user_started_at ON user_plan_subscriptions(user_id, started_at DESC);`);

        tableReady = true;
    })();

    try {
        await tableReadyPromise;
    } finally {
        tableReadyPromise = null;
    }
};

const getActiveSubscriptionWithGrace = async (userId, graceSeconds) => {
    const { rows } = await pool.query(
        `SELECT ups.*,
                (ups.expires_at IS NOT NULL AND ups.expires_at <= NOW()) AS in_grace_period,
                CASE
                    WHEN ups.expires_at IS NOT NULL THEN ups.expires_at + (
                        COALESCE(NULLIF(sp.extra->>'grace_period_value', '')::numeric, $2) *
                        CASE LOWER(COALESCE(sp.extra->>'grace_period_unit', 'seconds'))
                            WHEN 'minutes' THEN INTERVAL '1 minute'
                            WHEN 'hours' THEN INTERVAL '1 hour'
                            WHEN 'days' THEN INTERVAL '1 day'
                            ELSE INTERVAL '1 second'
                        END
                    )
                    ELSE NULL
                END AS grace_ends_at
         FROM user_plan_subscriptions ups
         LEFT JOIN subscription_plans sp ON sp.id = ups.plan_id
         WHERE ups.user_id = $1 AND ups.status = 'active'
           AND (ups.expires_at IS NULL OR ups.expires_at + (
                COALESCE(NULLIF(sp.extra->>'grace_period_value', '')::numeric, $2) *
                CASE LOWER(COALESCE(sp.extra->>'grace_period_unit', 'seconds'))
                    WHEN 'minutes' THEN INTERVAL '1 minute'
                    WHEN 'hours' THEN INTERVAL '1 hour'
                    WHEN 'days' THEN INTERVAL '1 day'
                    ELSE INTERVAL '1 second'
                END
           ) > NOW())
         ORDER BY ups.started_at DESC, ups.id DESC
         LIMIT 1`,
        [userId, graceSeconds]
    );
    return rows[0] || null;
};

const planExistsById = async (planId) => {
    const result = await pool.query('SELECT 1 FROM subscription_plans WHERE id = $1', [planId]);
    return result.rowCount > 0;
};

const cancelSubscriptionById = async (id) => {
    await pool.query(`UPDATE user_plan_subscriptions SET status = 'cancelled', cancelled_at = NOW() WHERE id = $1`, [id]);
};

const connect = () => pool.connect();

const getExistingSubscriptionForSubscribe = async (client, userId, graceSeconds) => {
    const result = await client.query(
        `SELECT ups.id,
                ups.plan_id,
                ups.expires_at,
                (ups.expires_at IS NOT NULL AND ups.expires_at <= NOW()) AS in_grace_period,
                sp.id AS plan_exists
         FROM user_plan_subscriptions ups
         LEFT JOIN subscription_plans sp ON sp.id = ups.plan_id
         WHERE ups.user_id = $1 AND ups.status = 'active'
           AND (ups.expires_at IS NULL OR ups.expires_at + (
                COALESCE(NULLIF(sp.extra->>'grace_period_value', '')::numeric, $2) *
                CASE LOWER(COALESCE(sp.extra->>'grace_period_unit', 'seconds'))
                    WHEN 'minutes' THEN INTERVAL '1 minute'
                    WHEN 'hours' THEN INTERVAL '1 hour'
                    WHEN 'days' THEN INTERVAL '1 day'
                    ELSE INTERVAL '1 second'
                END
           ) > NOW())
         ORDER BY ups.started_at DESC, ups.id DESC
         LIMIT 1`,
        [userId, graceSeconds]
    );
    return result.rows[0] || null;
};

const cancelExistingSubscription = async (client, id) => {
    await client.query(
        `UPDATE user_plan_subscriptions SET status = 'cancelled', cancelled_at = NOW() WHERE id = $1`,
        [id]
    );
};

const insertSubscription = async (client, payload) => {
    const { rows } = await client.query(
        `INSERT INTO user_plan_subscriptions
            (user_id, plan_id, plan_slug, plan_name, price_paid, duration_days, status, started_at, expires_at)
         VALUES (
            $1, $2, $3, $4, $5, $6, 'active',
            CASE WHEN $8::boolean THEN $9::timestamp ELSE NOW() END,
            CASE WHEN $8::boolean THEN $9::timestamp ELSE NOW() END + (($7::text || ' seconds')::interval)
         )
         RETURNING *`,
        [
            payload.userId,
            payload.plan.id,
            payload.plan.slug,
            payload.plan.name,
            payload.price,
            payload.plan.duration_days,
            payload.planDurationSeconds,
            payload.isSamePlanGraceRenewal,
            payload.previousExpiry || null,
        ]
    );
    return rows[0] || null;
};

const applyPlanBadgeToUser = async (client, userId, badgeColor, tickColor) => {
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_badge_color VARCHAR(40) DEFAULT NULL`).catch(() => {});
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_badge_tick_color VARCHAR(40) DEFAULT NULL`).catch(() => {});
    await client.query(
        `UPDATE users SET is_verified = true, verification_status = 'Verified',
         verification_badge_color = $1, verification_badge_tick_color = $2 WHERE id = $3`,
        [badgeColor, tickColor, userId]
    );
};

// A plan's badge is copied onto the user row when they subscribe, so editing
// the plan's colours afterwards would otherwise leave every existing
// subscriber wearing the old tick until they resubscribed. Re-apply the
// current colours to everyone still holding this plan, using the same
// active-and-within-grace test as `getActivePlanBadge`.
const applyPlanBadgeToActiveSubscribers = async (planId, badgeColor, tickColor, graceSeconds) => {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_badge_color VARCHAR(40) DEFAULT NULL`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_badge_tick_color VARCHAR(40) DEFAULT NULL`).catch(() => {});
    const result = await pool.query(
        `UPDATE users u
         SET is_verified = true,
             verification_status = 'Verified',
             verification_badge_color = $1,
             verification_badge_tick_color = $2
         WHERE EXISTS (
             SELECT 1 FROM user_plan_subscriptions ups
             WHERE ups.user_id = u.id
               AND ups.plan_id = $3
               AND ups.status = 'active'
               AND (ups.expires_at IS NULL OR ups.expires_at + (($4::text || ' seconds')::interval) > NOW())
         )
           AND (
               u.verification_badge_color IS DISTINCT FROM $1
               OR u.verification_badge_tick_color IS DISTINCT FROM $2
               OR u.is_verified IS DISTINCT FROM true
           )
         RETURNING u.id`,
        [badgeColor, tickColor, planId, graceSeconds]
    );
    return result.rowCount || 0;
};

const updateAutoRenew = async (autoRenew, userId) => {
    const { rows } = await pool.query(
        `UPDATE user_plan_subscriptions
         SET auto_renew = $1
         WHERE user_id = $2 AND status = 'active'
         RETURNING *`,
        [autoRenew, userId]
    );
    return rows[0] || null;
};

const getUserBadgeInfo = async (userId) => {
    const result = await pool.query(
        `SELECT is_verified, verification_badge_color, verification_badge_tick_color
         FROM users WHERE id = $1 LIMIT 1`,
        [userId]
    ).catch(() => ({ rows: [] }));
    return result.rows[0] || null;
};

const getActivePlanBadge = async (userId, graceSeconds) => {
    const result = await pool.query(
        `SELECT sp.verified_tick, sp.badge_color, sp.extra
         FROM user_plan_subscriptions ups
         JOIN subscription_plans sp ON sp.id = ups.plan_id
         WHERE ups.user_id = $1 AND ups.status = 'active'
           AND (ups.expires_at IS NULL OR ups.expires_at + (($2::text || ' seconds')::interval) > NOW())
         ORDER BY ups.started_at DESC, ups.id DESC LIMIT 1`,
        [userId, graceSeconds]
    );
    return result.rows[0] || null;
};

// A paid-plan badge is valid only while the account still has a paid plan or
// is inside that plan's grace period. Clear stale badge fields after grace so
// every client using the shared badge endpoint sees the same result.
const clearBadgesWithoutActivePaidPlan = async (graceSeconds) => {
    const result = await pool.query(
        `UPDATE users u
         SET is_verified = FALSE,
             verification_status = 'None',
             verification_badge_color = NULL,
             verification_badge_tick_color = NULL
         WHERE u.is_verified = TRUE
           AND NOT EXISTS (
               SELECT 1
               FROM user_plan_subscriptions ups
               INNER JOIN subscription_plans sp ON sp.id = ups.plan_id
               WHERE ups.user_id = u.id
                 AND ups.status = 'active'
                 AND COALESCE(sp.price, 0) > 0
                 AND (
                     ups.expires_at IS NULL
                     OR ups.expires_at + (
                         COALESCE(NULLIF(sp.extra->>'grace_period_value', '')::numeric, $1) *
                         CASE LOWER(COALESCE(sp.extra->>'grace_period_unit', 'days'))
                             WHEN 'minutes' THEN INTERVAL '1 minute'
                             WHEN 'hours' THEN INTERVAL '1 hour'
                             WHEN 'days' THEN INTERVAL '1 day'
                             ELSE INTERVAL '1 second'
                         END
                     ) > NOW()
                 )
           )
         RETURNING u.id`,
        [Math.max(0, Math.floor(Number(graceSeconds) || 0))]
    );
    return result.rowCount || 0;
};

const getUsageCounts = async (userId) => {
    const [googDailyRes, googTotalRes, productRes, savedRes, savedAdRes, uploadContentTotalRes, uploadContentDailyRes] = await Promise.all([
        pool.query(
            `SELECT COUNT(*)::int AS c
             FROM goog_posts
             WHERE user_id = $1
               AND created_at >= CURRENT_DATE
               AND created_at < CURRENT_DATE + INTERVAL '1 day'`,
            [userId]
        ),
        pool.query('SELECT COUNT(*)::int AS c FROM goog_posts WHERE user_id = $1', [userId]),
        pool.query("SELECT COUNT(*)::int AS c FROM market WHERE user_id = $1 AND status != 'deleted'", [userId]),
        pool.query('SELECT COUNT(*)::int AS c FROM saved_googs WHERE user_id = $1', [userId]).catch(() => ({ rows: [{ c: 0 }] })),
        pool.query(
            `SELECT ad_media_type, COUNT(*)::int AS c
             FROM ad_saves
             WHERE user_id = $1 AND ad_source_type = 'upload'
             GROUP BY ad_media_type`,
            [userId]
        ).catch(() => ({ rows: [] })),
        pool.query('SELECT COUNT(*)::int AS c FROM upload_contents WHERE user_id = $1', [userId]).catch(() => ({ rows: [{ c: 0 }] })),
        pool.query(
            `SELECT COUNT(*)::int AS c
             FROM upload_contents
             WHERE user_id = $1
               AND created_at >= CURRENT_DATE`,
            [userId]
        ).catch(() => ({ rows: [{ c: 0 }] })),
    ]);

    return {
        googCount: googDailyRes.rows[0].c,
        googDailyCount: googDailyRes.rows[0].c,
        googTotalCount: googTotalRes.rows[0].c,
        productCount: productRes.rows[0].c,
        savedAdRows: savedAdRes.rows || [],
        savedGoogCount: savedRes.rows[0].c,
        uploadContentDailyCount: uploadContentDailyRes.rows[0].c,
        uploadContentTotalCount: uploadContentTotalRes.rows[0].c,
    };
};

const disableAutoRenewForActiveSubscription = async (userId, graceSeconds) => {
    const { rows } = await pool.query(
        `UPDATE user_plan_subscriptions
         SET auto_renew = FALSE
         WHERE user_id = $1
           AND status = 'active'
           AND (expires_at IS NULL OR expires_at + (($2::text || ' seconds')::interval) > NOW())
         RETURNING *`,
        [userId, graceSeconds]
    );
    return rows[0] || null;
};

module.exports = {
    applyPlanBadgeToActiveSubscribers,
    applyPlanBadgeToUser,
    cancelExistingSubscription,
    cancelSubscriptionById,
    connect,
    disableAutoRenewForActiveSubscription,
    ensureTable,
    getActivePlanBadge,
    clearBadgesWithoutActivePaidPlan,
    getActiveSubscriptionWithGrace,
    getExistingSubscriptionForSubscribe,
    getUsageCounts,
    getUserBadgeInfo,
    insertSubscription,
    planExistsById,
    updateAutoRenew,
};
