const pool = require('../config/database');
const subscriptionPlansCtrl = require('./subscriptionPlansController');
const { getGraceDurationSeconds, getPlanDurationSeconds } = require('../utils/subscriptionRenewal');
const { recordSubscriptionPayment } = require('../../../../shared/utils/financeCommands');

let tableReady = false;

// Reuse the plans controller's ensure logic by hitting its public list once.
// That seeds the subscription_plans table if it doesn't exist.
const ensurePlansTable = async () => {
    try {
        await pool.query(`SELECT 1 FROM subscription_plans LIMIT 1`);
    } catch {
        // Trigger the plans-table creation through a no-op call
        await subscriptionPlansCtrl.getPublicPlans({ }, { status: () => ({ json: () => {} }) });
    }
};

const ensureTable = async () => {
    if (tableReady) return;

    await pool.query(`
        CREATE TABLE IF NOT EXISTS user_plan_subscriptions (
            id            SERIAL PRIMARY KEY,
            user_id       INTEGER       NOT NULL,
            plan_id       INTEGER       NOT NULL,
            plan_slug     VARCHAR(60)   NOT NULL,
            plan_name     VARCHAR(120)  NOT NULL,
            price_paid    DECIMAL(12,2) NOT NULL DEFAULT 0,
            duration_days INTEGER       NOT NULL DEFAULT 30,
            status        VARCHAR(20)   NOT NULL DEFAULT 'active', -- active | cancelled | expired
            auto_renew    BOOLEAN       NOT NULL DEFAULT TRUE,
            started_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            expires_at    TIMESTAMP,
            cancelled_at  TIMESTAMP,
            created_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Migration for existing tables
    await pool.query(`ALTER TABLE user_plan_subscriptions ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN NOT NULL DEFAULT TRUE;`);
    await pool.query(`ALTER TABLE user_plan_subscriptions ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP;`);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_plan_subscriptions_user ON user_plan_subscriptions(user_id, status);`);

    tableReady = true;
};

const getUserId = (req) => req.user?.id || req.user?.userId;

// GET /me — currently active subscription (if any)
exports.getMySubscription = async (req, res) => {
    try {
        await ensureTable();
        const userId = getUserId(req);
        if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

        const graceSeconds = getGraceDurationSeconds();
        const { rows } = await pool.query(
            `SELECT ups.*,
                    (ups.expires_at IS NOT NULL AND ups.expires_at <= NOW()) AS in_grace_period,
                    CASE
                        WHEN ups.expires_at IS NOT NULL THEN ups.expires_at + (($2::text || ' seconds')::interval)
                        ELSE NULL
                    END AS grace_ends_at
             FROM user_plan_subscriptions ups
             LEFT JOIN subscription_plans sp ON sp.id = ups.plan_id
             WHERE ups.user_id = $1 AND ups.status = 'active'
               AND (ups.expires_at IS NULL OR ups.expires_at + (($2::text || ' seconds')::interval) > NOW())
             ORDER BY ups.started_at DESC
             LIMIT 1`,
            [userId, graceSeconds]
        );

        if (!rows[0]) {
            const basicPlan = await pool.query("SELECT * FROM subscription_plans WHERE slug = 'basic' LIMIT 1");
            if (basicPlan.rows.length > 0) {
                const bp = basicPlan.rows[0];
                return res.status(200).json({ 
                    success: true, 
                    subscription: {
                        plan_id: bp.id,
                        plan_slug: bp.slug,
                        plan_name: bp.name,
                        price_paid: 0,
                        duration_days: 0,
                        status: 'active',
                        expires_at: null,
                        auto_renew: false
                    } 
                });
            }
            return res.status(200).json({ success: true, subscription: null });
        }

        // If the plan was deleted, auto-cancel this orphaned subscription
        const planExists = await pool.query(
            'SELECT 1 FROM subscription_plans WHERE id = $1',
            [rows[0].plan_id]
        );
        if (planExists.rowCount === 0) {
            await pool.query(
                `UPDATE user_plan_subscriptions SET status = 'cancelled', cancelled_at = NOW() WHERE id = $1`,
                [rows[0].id]
            );
            return res.status(200).json({ success: true, subscription: null });
        }

        return res.status(200).json({ success: true, subscription: rows[0] });
    } catch (err) {
        console.error('[userSubscriptions] getMySubscription error:', err);
        return res.status(500).json({ success: false, message: 'Failed to fetch subscription' });
    }
};

// POST /subscribe — deducts wallet, creates active subscription
exports.subscribe = async (req, res) => {
    const client = await pool.connect();
    try {
        await ensureTable();
        await ensurePlansTable();
        const userId = getUserId(req);
        if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

        const { plan_id, switch_plan } = req.body || {};
        if (!plan_id) return res.status(400).json({ success: false, message: 'plan_id is required' });
        if (plan_id < 0) return res.status(400).json({ success: false, message: 'Demo plans cannot be purchased — please ensure plans are loaded from the server' });

        console.log(`[userSubscriptions] subscribe attempt: userId=${userId} plan_id=${plan_id}`);

        await client.query('BEGIN');

        // Fetch plan
        const planRes = await client.query(
            `SELECT id, slug, name, price, duration_days, is_active, verified_tick, badge_color, extra
             FROM subscription_plans WHERE id = $1`,
            [plan_id]
        );
        if (planRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Plan not found' });
        }
        const plan = planRes.rows[0];
        if (!plan.is_active) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: 'Plan is not active' });
        }

        // Cancel any existing active subscription before subscribing to a new plan
        // (covers: orphaned/deleted-plan subs, and plan upgrades/switches)
        const graceSeconds = getGraceDurationSeconds();
        const existing = await client.query(
            `SELECT ups.id,
                    ups.plan_id,
                    ups.expires_at,
                    (ups.expires_at IS NOT NULL AND ups.expires_at <= NOW()) AS in_grace_period,
                    sp.id AS plan_exists
             FROM user_plan_subscriptions ups
             LEFT JOIN subscription_plans sp ON sp.id = ups.plan_id
             WHERE ups.user_id = $1 AND ups.status = 'active'
               AND (ups.expires_at IS NULL OR ups.expires_at + (($2::text || ' seconds')::interval) > NOW())
             ORDER BY ups.started_at DESC, ups.id DESC
             LIMIT 1`,
            [userId, graceSeconds]
        );
        const existingSub = existing.rows[0] || null;
        const isSamePlanGraceRenewal = !!(
            existingSub &&
            Number(existingSub.plan_id) === Number(plan.id) &&
            existingSub.in_grace_period &&
            existingSub.expires_at
        );
        if (existingSub && Number(existingSub.plan_id) === Number(plan.id) && !isSamePlanGraceRenewal) {
            await client.query('COMMIT');
            return res.status(200).json({ success: true, subscription: existingSub });
        }
        if (existingSub && Number(existingSub.plan_id) !== Number(plan.id) && switch_plan !== true) {
            await client.query('ROLLBACK');
            return res.status(409).json({ success: false, message: 'Confirm plan switch is required' });
        }
        if (existing.rows.length > 0) {
            // Cancel the existing subscription — whether it's a deleted plan or an active upgrade
            await client.query(
                `UPDATE user_plan_subscriptions SET status = 'cancelled', cancelled_at = NOW() WHERE id = $1`,
                [existingSub.id]
            );
        }

        const price = parseFloat(plan.price);
        try {
            await recordSubscriptionPayment(client, {
                subscriberUserId: userId,
                amount: price,
                planName: plan.name,
            });
        } catch (financeErr) {
            if (financeErr.code === 'USER_NOT_FOUND') {
                await client.query('ROLLBACK');
                return res.status(404).json({ success: false, message: 'User not found' });
            }

            if (financeErr.code === 'INSUFFICIENT_WALLET_BALANCE') {
                await client.query('ROLLBACK');
                return res.status(402).json({
                    success: false,
                    message: 'Insufficient wallet balance',
                    balance: financeErr.currentBalance,
                    price,
                });
            }

            if (financeErr.code === 'GOOGER_WALLET_NOT_CONFIGURED') {
                await client.query('ROLLBACK');
                return res.status(500).json({ success: false, message: financeErr.message });
            }

            throw financeErr;
        }

        // Insert subscription — compute expires_at in JS to avoid SQL type inference on $6
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
                userId,
                plan.id,
                plan.slug,
                plan.name,
                price,
                plan.duration_days,
                getPlanDurationSeconds(plan),
                isSamePlanGraceRenewal,
                existingSub?.expires_at || null,
            ]
        );

        // Auto-apply badge from plan — always overrides any existing badge when plan has verified_tick
        if (plan.verified_tick) {
            await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_badge_color VARCHAR(40) DEFAULT NULL`).catch(() => {});
            await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_badge_tick_color VARCHAR(40) DEFAULT NULL`).catch(() => {});
            const extra = plan.extra || {};
            const badgeColor = extra.badge_custom_color || plan.badge_color || 'blue';
            const tickColor = extra.badge_tick_color || null;
            await client.query(
                `UPDATE users SET is_verified = true, verification_status = 'Verified',
                 verification_badge_color = $1, verification_badge_tick_color = $2 WHERE id = $3`,
                [badgeColor, tickColor, userId]
            );
        }

        await client.query('COMMIT');
        return res.status(201).json({ success: true, subscription: rows[0] });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[userSubscriptions] subscribe error:', err);
        return res.status(500).json({ success: false, message: `Failed to subscribe: ${err.message || err.code || 'unknown error'}` });
    } finally {
        client.release();
    }
};

// PATCH /auto-renew — toggle auto-renew flag on active subscription
exports.setAutoRenew = async (req, res) => {
    try {
        await ensureTable();
        const userId = getUserId(req);
        if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

        const { auto_renew } = req.body || {};
        if (typeof auto_renew !== 'boolean') {
            return res.status(400).json({ success: false, message: 'auto_renew (boolean) is required' });
        }

        const { rows } = await pool.query(
            `UPDATE user_plan_subscriptions
             SET auto_renew = $1
             WHERE user_id = $2 AND status = 'active'
             RETURNING *`,
            [auto_renew, userId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'No active subscription found' });
        }
        return res.status(200).json({ success: true, subscription: rows[0] });
    } catch (err) {
        console.error('[userSubscriptions] setAutoRenew error:', err);
        return res.status(500).json({ success: false, message: 'Failed to update auto-renew' });
    }
};

// GET /badge/:userId — public, returns verified_tick + badge_color for a user
exports.getBadge = async (req, res) => {
    try {
        await ensureTable();
        const { userId } = req.params;

        // Check user-level manual badge assignment first (set by admin)
        const userRes = await pool.query(
            `SELECT is_verified, verification_badge_color, verification_badge_tick_color
             FROM users WHERE id = $1 LIMIT 1`,
            [userId]
        ).catch(() => ({ rows: [] }));
        const user = userRes.rows[0];

        if (user?.is_verified && user?.verification_badge_color) {
            return res.json({
                success: true,
                badge: {
                    color: user.verification_badge_color,
                    tickColor: user.verification_badge_tick_color || null,
                },
            });
        }

        // Fall back to plan-based badge
        const { rows } = await pool.query(
            `SELECT sp.verified_tick, sp.badge_color, sp.extra
             FROM user_plan_subscriptions ups
             JOIN subscription_plans sp ON sp.id = ups.plan_id
             WHERE ups.user_id = $1 AND ups.status = 'active'
               AND (ups.expires_at IS NULL OR ups.expires_at + (($2::text || ' seconds')::interval) > NOW())
             ORDER BY ups.started_at DESC LIMIT 1`,
            [userId, getGraceDurationSeconds()]
        );
        if (!rows[0] || !rows[0].verified_tick) {
            // Also show badge if user has is_verified but no custom color (use default color)
            if (user?.is_verified) {
                return res.json({ success: true, badge: { color: 'blue', tickColor: null } });
            }
            return res.json({ success: true, badge: null });
        }
        const extra = rows[0].extra || {};
        return res.json({
            success: true,
            badge: {
                color: extra.badge_custom_color || rows[0].badge_color,
                tickColor: extra.badge_tick_color || null,
            },
        });
    } catch (err) {
        console.error('[userSubscriptions] getBadge error:', err);
        return res.json({ success: true, badge: null });
    }
};

// GET /my-usage — returns user's current usage vs their plan limits
exports.getMyUsage = async (req, res) => {
    try {
        await ensureTable();
        const userId = getUserId(req);
        if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

        const { getUserPlanLimits } = require('../utils/planLimits');
        const limits = await getUserPlanLimits(userId);

        const [googRes, productRes, savedRes, savedAdRes] = await Promise.all([
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
        ]);
        const savedAdCounts = { photo: 0, video: 0 };
        for (const row of savedAdRes.rows || []) {
            if (row.ad_media_type === 'photo' || row.ad_media_type === 'video') {
                savedAdCounts[row.ad_media_type] = row.c;
            }
        }

        return res.json({
            success: true,
            usage: {
                googCount:       googRes.rows[0].c,
                productCount:    productRes.rows[0].c,
                savedGoogCount:  savedRes.rows[0].c,
                savedPhotoAdCount: savedAdCounts.photo,
                savedVideoAdCount: savedAdCounts.video,
                writeGoogLimit:      limits.writeGoogLimit,
                googLetterLimit:     limits.googLetterLimit,
                productUploadLimit:  limits.productUploadLimit,
                saveGoogLimit:       limits.saveGoogLimit,
                photoAdsSaveLimit:   limits.photoAdsSaveLimit,
                videoAdsSaveLimit:   limits.videoAdsSaveLimit,
                googAtLimit:     googRes.rows[0].c >= limits.writeGoogLimit,
                productAtLimit:  productRes.rows[0].c >= limits.productUploadLimit,
            },
        });
    } catch (err) {
        console.error('[userSubscriptions] getMyUsage error:', err);
        return res.status(500).json({ success: false, message: 'Failed to fetch usage' });
    }
};

// GET /debug-plan — raw DB plan data (no auth needed, remove after debugging)
exports.debugPlan = async (req, res) => {
    try {
        const allPlans = await pool.query(
            `SELECT id, slug, name, googs_limit, extra FROM subscription_plans WHERE is_active = TRUE ORDER BY id`
        );
        return res.json({ plans: allPlans.rows });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

// GET /features — full normalized feature set for the logged-in user
exports.getMyFeatures = async (req, res) => {
    try {
        await ensureTable();
        const userId = getUserId(req);
        if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

        const { getUserSubscriptionFeatures } = require('../utils/planLimits');
        const features = await getUserSubscriptionFeatures(userId);
        // Debug: log full raw extra so we can see every key the admin stored
        console.log('[getMyFeatures] plan:', features.plan_slug, 'write_goog_color_limit:', features.write_goog_color_limit, 'raw extra:', JSON.stringify(features.extra));
        return res.json({ success: true, features });
    } catch (err) {
        console.error('[userSubscriptions] getMyFeatures error:', err);
        return res.status(500).json({ success: false, message: 'Failed to fetch features' });
    }
};

// POST /cancel — stop renewal; paid features remain active until expires_at
exports.cancelSubscription = async (req, res) => {
    try {
        await ensureTable();
        const userId = getUserId(req);
        if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

        const { rows } = await pool.query(
            `UPDATE user_plan_subscriptions
             SET auto_renew = FALSE
             WHERE user_id = $1
               AND status = 'active'
               AND (expires_at IS NULL OR expires_at + (($2::text || ' seconds')::interval) > NOW())
             RETURNING *`,
            [userId, getGraceDurationSeconds()]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'No active subscription found' });
        }

        return res.status(200).json({ success: true, subscription: rows[0] });
    } catch (err) {
        console.error('[userSubscriptions] cancelSubscription error:', err);
        return res.status(500).json({ success: false, message: 'Failed to cancel subscription' });
    }
};
