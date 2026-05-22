const pool = require('../config/database');
const subscriptionPlansCtrl = require('./subscriptionPlansController');

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

        const { rows } = await pool.query(
            `SELECT ups.*
             FROM user_plan_subscriptions ups
             LEFT JOIN subscription_plans sp ON sp.id = ups.plan_id
             WHERE ups.user_id = $1 AND ups.status = 'active'
               AND (ups.expires_at IS NULL OR ups.expires_at > NOW())
             ORDER BY ups.started_at DESC
             LIMIT 1`,
            [userId]
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

        const { plan_id } = req.body || {};
        if (!plan_id) return res.status(400).json({ success: false, message: 'plan_id is required' });
        if (plan_id < 0) return res.status(400).json({ success: false, message: 'Demo plans cannot be purchased — please ensure plans are loaded from the server' });

        console.log(`[userSubscriptions] subscribe attempt: userId=${userId} plan_id=${plan_id}`);

        await client.query('BEGIN');

        // Fetch plan
        const planRes = await client.query(
            `SELECT id, slug, name, price, duration_days, is_active
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
        const existing = await client.query(
            `SELECT ups.id, ups.plan_id, sp.id AS plan_exists
             FROM user_plan_subscriptions ups
             LEFT JOIN subscription_plans sp ON sp.id = ups.plan_id
             WHERE ups.user_id = $1 AND ups.status = 'active'
               AND (ups.expires_at IS NULL OR ups.expires_at > NOW())
             LIMIT 1`,
            [userId]
        );
        if (existing.rows.length > 0) {
            // Cancel the existing subscription — whether it's a deleted plan or an active upgrade
            await client.query(
                `UPDATE user_plan_subscriptions SET status = 'cancelled', cancelled_at = NOW() WHERE id = $1`,
                [existing.rows[0].id]
            );
        }

        // Lock and check wallet balance
        const balRes = await client.query('SELECT wallet_balance FROM users WHERE id = $1 FOR UPDATE', [userId]);
        if (balRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        const balance = parseFloat(balRes.rows[0].wallet_balance || 0);
        const price = parseFloat(plan.price);

        if (balance < price) {
            await client.query('ROLLBACK');
            return res.status(402).json({ success: false, message: 'Insufficient wallet balance', balance, price });
        }

        // Deduct
        await client.query(
            'UPDATE users SET wallet_balance = wallet_balance - $1 WHERE id = $2',
            [price, userId]
        );

        // Insert subscription — compute expires_at in JS to avoid SQL type inference on $6
        const expiresAt = new Date(Date.now() + plan.duration_days * 24 * 60 * 60 * 1000);
        const { rows } = await client.query(
            `INSERT INTO user_plan_subscriptions
                (user_id, plan_id, plan_slug, plan_name, price_paid, duration_days, status, expires_at)
             VALUES ($1, $2, $3, $4, $5, $6, 'active', $7)
             RETURNING *`,
            [userId, plan.id, plan.slug, plan.name, price, plan.duration_days, expiresAt]
        );

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
        const { rows } = await pool.query(
            `SELECT sp.verified_tick, sp.badge_color
             FROM user_plan_subscriptions ups
             JOIN subscription_plans sp ON sp.id = ups.plan_id
             WHERE ups.user_id = $1 AND ups.status = 'active'
               AND (ups.expires_at IS NULL OR ups.expires_at > NOW())
             ORDER BY ups.started_at DESC LIMIT 1`,
            [userId]
        );
        if (!rows[0] || !rows[0].verified_tick) {
            return res.json({ success: true, badge: null });
        }
        return res.json({ success: true, badge: { color: rows[0].badge_color } });
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

        const [googRes, productRes, savedRes] = await Promise.all([
            pool.query('SELECT COUNT(*)::int AS c FROM goog_posts WHERE user_id = $1', [userId]),
            pool.query("SELECT COUNT(*)::int AS c FROM market WHERE user_id = $1 AND status != 'deleted'", [userId]),
            pool.query('SELECT COUNT(*)::int AS c FROM saved_googs WHERE user_id = $1', [userId]).catch(() => ({ rows: [{ c: 0 }] })),
        ]);

        return res.json({
            success: true,
            usage: {
                googCount:       googRes.rows[0].c,
                productCount:    productRes.rows[0].c,
                savedGoogCount:  savedRes.rows[0].c,
                writeGoogLimit:      limits.writeGoogLimit,
                googLetterLimit:     limits.googLetterLimit,
                productUploadLimit:  limits.productUploadLimit,
                saveGoogLimit:       limits.saveGoogLimit,
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

// POST /cancel — cancel current active subscription
exports.cancelSubscription = async (req, res) => {
    try {
        await ensureTable();
        const userId = getUserId(req);
        if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

        const { rows } = await pool.query(
            `UPDATE user_plan_subscriptions
             SET status = 'cancelled', cancelled_at = NOW()
             WHERE user_id = $1 AND status = 'active'
             RETURNING *`,
            [userId]
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
