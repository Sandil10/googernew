const pool = require('../../config/database');

let tableReady = false;
let tableReadyPromise = null;

const ensureTable = async () => {
    if (tableReady) return;
    if (tableReadyPromise) return tableReadyPromise;

    tableReadyPromise = (async () => {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS subscription_plans (
                id              SERIAL PRIMARY KEY,
                slug            VARCHAR(60)   NOT NULL UNIQUE,
                name            VARCHAR(120)  NOT NULL,
                price           DECIMAL(12,2) NOT NULL DEFAULT 0,
                duration_days   INTEGER       NOT NULL DEFAULT 30,
                badge_color     VARCHAR(40)   DEFAULT 'silver',
                accent_color    VARCHAR(40)   DEFAULT 'zinc',
                googs_limit     INTEGER       NOT NULL DEFAULT 5,
                verified_tick   BOOLEAN       NOT NULL DEFAULT TRUE,
                features        JSONB         NOT NULL DEFAULT '[]'::jsonb,
                extra           JSONB         NOT NULL DEFAULT '{}'::jsonb,
                is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
                is_free         BOOLEAN       NOT NULL DEFAULT FALSE,
                is_default      BOOLEAN       NOT NULL DEFAULT FALSE,
                sort_order      INTEGER       NOT NULL DEFAULT 0,
                created_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
                updated_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;`);
        await pool.query(`ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS is_free BOOLEAN NOT NULL DEFAULT FALSE;`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_subscription_plans_active ON subscription_plans(is_active, sort_order);`);

        await pool.query(`
            DELETE FROM subscription_plans
            WHERE slug IN ('starter','pro','elite')
              AND id NOT IN (SELECT DISTINCT plan_id FROM user_plan_subscriptions)
        `).catch(() => {});

        await pool.query(
            `INSERT INTO subscription_plans
                (slug, name, price, duration_days, badge_color, accent_color, googs_limit, verified_tick,
                 features, extra, is_active, is_free, is_default, sort_order)
             VALUES ('basic', 'Basic', 0, 0, 'silver', 'zinc', 5, FALSE,
                     '["Write goog (up to 5)", "Goog letter limit â€“ 75 characters", "ðŸ”» Product Upload Limit â€“ 15"]'::jsonb,
                     '{"write_goog_limit":5,"product_upload_limit":15,"goog_letter_limit":75,"content_upload_limit":5,"content_daily_upload_limit":1,"content_video_limit_minutes":1,"ads_expiry_days":30,"text_messaging":true,"voice_calls":true,"video_calls":false,"chat_auto_delete_24h":true}'::jsonb,
                     TRUE, TRUE, TRUE, 0)
             ON CONFLICT (slug) DO UPDATE SET
                 is_default = TRUE,
                 is_active  = TRUE,
                 is_free    = TRUE,
                 price      = 0,
                 duration_days = 0,
                 updated_at = NOW()`
        );

        await pool.query(`
            UPDATE subscription_plans
            SET extra = COALESCE(extra, '{}'::jsonb)
                || CASE WHEN extra->>'content_upload_limit' IS NULL THEN jsonb_build_object('content_upload_limit', CASE WHEN is_default OR slug = 'basic' THEN 5 WHEN slug = 'package-1' THEN 15 WHEN slug = 'package-2' THEN 30 WHEN slug = 'package-3' THEN 50 ELSE 15 END) ELSE '{}'::jsonb END
                || CASE WHEN extra->>'content_daily_upload_limit' IS NULL THEN jsonb_build_object('content_daily_upload_limit', CASE WHEN is_default OR slug = 'basic' THEN 1 WHEN slug = 'package-1' THEN 3 WHEN slug = 'package-2' THEN 5 WHEN slug = 'package-3' THEN 10 ELSE 3 END) ELSE '{}'::jsonb END
                || CASE WHEN extra->>'content_video_limit_minutes' IS NULL THEN jsonb_build_object('content_video_limit_minutes', CASE WHEN is_default OR slug = 'basic' THEN 1 WHEN slug = 'package-1' THEN 5 WHEN slug = 'package-2' THEN 10 WHEN slug = 'package-3' THEN 20 ELSE 5 END) ELSE '{}'::jsonb END,
                updated_at = NOW()
            WHERE extra->>'content_upload_limit' IS NULL
               OR extra->>'content_daily_upload_limit' IS NULL
               OR extra->>'content_video_limit_minutes' IS NULL
        `);

        tableReady = true;
    })();

    try {
        await tableReadyPromise;
    } finally {
        tableReadyPromise = null;
    }
};

const getUserActivePlan = async (userId, graceSeconds) => {
    const { rows } = await pool.query(
        `SELECT sp.id, sp.slug, sp.name, sp.price, sp.duration_days,
                sp.badge_color, sp.features, sp.googs_limit, sp.verified_tick, sp.extra,
                ups.started_at, ups.expires_at, ups.status
         FROM user_plan_subscriptions ups
         JOIN subscription_plans sp ON sp.id = ups.plan_id
         WHERE ups.user_id = $1 AND ups.status = 'active'
           AND (ups.expires_at IS NULL OR ups.expires_at + (($2::text || ' seconds')::interval) > NOW())
         ORDER BY ups.started_at DESC LIMIT 1`,
        [userId, graceSeconds]
    );
    return rows[0] || null;
};

const getDefaultActivePlan = async () => {
    const result = await pool.query(
        `SELECT id, slug, name, price, duration_days, badge_color, features, googs_limit, verified_tick, extra
         FROM subscription_plans WHERE is_default = TRUE AND is_active = TRUE LIMIT 1`
    );
    return result.rows[0] || null;
};

const getPublicPaidPlans = async () => {
    const result = await pool.query(
        `SELECT id, slug, name, price, duration_days, badge_color, accent_color,
                googs_limit, verified_tick, features, extra, sort_order
         FROM subscription_plans
         WHERE is_active = TRUE AND is_free = FALSE
         ORDER BY sort_order ASC, price ASC`
    );
    return result.rows;
};

const getAllPlans = async () => {
    const result = await pool.query(`SELECT * FROM subscription_plans ORDER BY sort_order ASC, price ASC`);
    return result.rows;
};

const createPlan = async (payload) => {
    const { rows } = await pool.query(
        `INSERT INTO subscription_plans
            (slug, name, price, duration_days, badge_color, accent_color,
             googs_limit, verified_tick, features, extra, is_active, is_free, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13)
         RETURNING *`,
        [
            payload.slug,
            payload.name,
            payload.price,
            payload.duration_days,
            payload.badge_color,
            payload.accent_color,
            payload.googs_limit,
            payload.verified_tick,
            JSON.stringify(payload.features),
            JSON.stringify(payload.extra),
            payload.is_active,
            payload.is_free,
            payload.sort_order,
        ]
    );
    return rows[0] || null;
};

const getPlanFeaturesAndExtra = async (id) => {
    const result = await pool.query('SELECT features, extra FROM subscription_plans WHERE id = $1', [id]);
    return result.rows[0] || null;
};

const updatePlan = async (id, payload) => {
    const { rows } = await pool.query(
        `UPDATE subscription_plans SET
            slug          = COALESCE($1, slug),
            name          = COALESCE($2, name),
            price         = COALESCE($3, price),
            duration_days = COALESCE($4, duration_days),
            badge_color   = COALESCE($5, badge_color),
            accent_color  = COALESCE($6, accent_color),
            googs_limit   = COALESCE($7, googs_limit),
            verified_tick = COALESCE($8, verified_tick),
            features      = $9::jsonb,
            extra         = COALESCE($10::jsonb, extra),
            is_active     = COALESCE($11, is_active),
            is_free       = COALESCE($12, is_free),
            sort_order    = COALESCE($13, sort_order),
            updated_at    = NOW()
         WHERE id = $14
         RETURNING *`,
        [
            payload.slug,
            payload.name,
            payload.price,
            payload.duration_days,
            payload.badge_color,
            payload.accent_color,
            payload.googs_limit,
            payload.verified_tick,
            JSON.stringify(payload.features),
            payload.extraJson,
            payload.is_active,
            payload.is_free,
            payload.sort_order,
            id,
        ]
    );
    return rows[0] || null;
};

const connect = () => pool.connect();

const cancelActiveSubscriptionsByPlanId = async (client, planId) => {
    const result = await client.query(
        `UPDATE user_plan_subscriptions
         SET status = 'cancelled', cancelled_at = NOW()
         WHERE plan_id = $1 AND status = 'active'`,
        [planId]
    );
    return result.rowCount;
};

const deletePlanById = async (client, id) => {
    const result = await client.query('DELETE FROM subscription_plans WHERE id = $1', [id]);
    return result.rowCount;
};

const getDebugPlans = async () => {
    const result = await pool.query(
        `SELECT id, slug, name, googs_limit, extra FROM subscription_plans WHERE is_active = TRUE ORDER BY id`
    );
    return result.rows;
};

const findPlanByIdForSubscribe = async (client, planId) => {
    const result = await client.query(
        `SELECT id, slug, name, price, duration_days, is_active, verified_tick, badge_color, extra
         FROM subscription_plans WHERE id = $1`,
        [planId]
    );
    return result.rows[0] || null;
};

const findBasicPlan = async () => {
    const result = await pool.query("SELECT * FROM subscription_plans WHERE slug = 'basic' LIMIT 1");
    return result.rows[0] || null;
};

module.exports = {
    cancelActiveSubscriptionsByPlanId,
    connect,
    createPlan,
    deletePlanById,
    ensureTable,
    findBasicPlan,
    findPlanByIdForSubscribe,
    getAllPlans,
    getDebugPlans,
    getDefaultActivePlan,
    getPlanFeaturesAndExtra,
    getPublicPaidPlans,
    getUserActivePlan,
    updatePlan,
};
