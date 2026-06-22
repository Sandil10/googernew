const pool = require('../config/database');
const { getGraceDurationSeconds, getPlanIntervalLabel, getTestDurationMinutes } = require('../utils/subscriptionRenewal');

let tableReady = false;
let tableReadyPromise = null;
const PUBLIC_PLANS_CACHE_TTL_MS = Math.max(
    0,
    Number.parseInt(process.env.PUBLIC_SUBSCRIPTION_PLANS_CONTROLLER_CACHE_TTL_MS || '30000', 10) || 30000
);
let publicPlansCache = null;

const getCachedPublicPlans = () => {
    if (!publicPlansCache) return null;
    if (publicPlansCache.expiresAt <= Date.now()) {
        publicPlansCache = null;
        return null;
    }
    return publicPlansCache.payload;
};

const setCachedPublicPlans = (payload) => {
    if (PUBLIC_PLANS_CACHE_TTL_MS <= 0) return;
    publicPlansCache = {
        payload,
        expiresAt: Date.now() + PUBLIC_PLANS_CACHE_TTL_MS,
    };
};

const invalidatePublicPlansCache = () => {
    publicPlansCache = null;
};

// Rebuild auto-generated feature lines from extra limit fields.
// Manual features (not matching known auto patterns) are preserved.
const syncAutoFeatures = (features = [], extra = {}) => {
    const manual = features.filter(f =>
        !f.startsWith('Create up to ') &&
        !f.startsWith('Upload up to ') &&
        !f.includes('characters per Goog')
    );
    const auto = [];
    if (extra.write_goog_limit != null)    auto.push(`Create up to ${extra.write_goog_limit} Googs`);
    if (extra.goog_letter_limit != null)   auto.push(`${extra.goog_letter_limit} characters per Goog`);
    if (extra.product_upload_limit != null) auto.push(`Upload up to ${extra.product_upload_limit} products`);
    return [...auto, ...manual];
};

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

    // Migrations for existing tables
    await pool.query(`ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;`);
    await pool.query(`ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS is_free BOOLEAN NOT NULL DEFAULT FALSE;`);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_subscription_plans_active ON subscription_plans(is_active, sort_order);`);

    // One-time cleanup: remove auto-seeded paid plans that no user has ever purchased.
    // Plans with active or past subscriptions are kept so billing history stays intact.
    await pool.query(`
        DELETE FROM subscription_plans
        WHERE slug IN ('starter','pro','elite')
          AND id NOT IN (SELECT DISTINCT plan_id FROM user_plan_subscriptions)
    `).catch(() => {});

    // Ensure basic plan row exists — values are managed entirely via admin panel
    await pool.query(
        `INSERT INTO subscription_plans
            (slug, name, price, duration_days, badge_color, accent_color, googs_limit, verified_tick,
             features, extra, is_active, is_free, is_default, sort_order)
         VALUES ('basic', 'Basic', 0, 0, 'silver', 'zinc', 5, FALSE,
                 '["Write goog (up to 5)", "Goog letter limit – 75 characters", "🔻 Product Upload Limit – 15"]'::jsonb,
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

exports.getMyPlan = async (req, res) => {
    try {
        await ensureTable();
        const userId = req.user?.id || req.user?.userId;
        if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

        const { rows } = await pool.query(
            `SELECT sp.id, sp.slug, sp.name, sp.price, sp.duration_days,
                    sp.badge_color, sp.features, sp.googs_limit, sp.verified_tick, sp.extra,
                    ups.started_at, ups.expires_at, ups.status
             FROM user_plan_subscriptions ups
             JOIN subscription_plans sp ON sp.id = ups.plan_id
             WHERE ups.user_id = $1 AND ups.status = 'active'
               AND (ups.expires_at IS NULL OR ups.expires_at + (($2::text || ' seconds')::interval) > NOW())
             ORDER BY ups.started_at DESC LIMIT 1`,
            [userId, getGraceDurationSeconds()]
        );

        if (rows.length > 0) {
            return res.json({ success: true, data: rows[0], is_basic: false });
        }

        const basic = await pool.query(
            `SELECT id, slug, name, price, duration_days, badge_color, features, googs_limit, verified_tick, extra
             FROM subscription_plans WHERE is_default = TRUE AND is_active = TRUE LIMIT 1`
        );
        if (basic.rows.length > 0) {
            return res.json({ success: true, data: { ...basic.rows[0], started_at: null, expires_at: null, status: 'active' }, is_basic: true });
        }

        return res.json({ success: true, data: null, is_basic: true });
    } catch (err) {
        console.error('[subscriptionPlans] getMyPlan error:', err);
        return res.status(500).json({ success: false, message: 'Failed to fetch plan' });
    }
};

exports.getPublicPlans = async (req, res) => {
    try {
        await ensureTable();
        const cached = getCachedPublicPlans();
        if (cached) {
            return res.status(200).json(cached);
        }
        const { rows } = await pool.query(
            `SELECT id, slug, name, price, duration_days, badge_color, accent_color,
                    googs_limit, verified_tick, features, extra, sort_order
             FROM subscription_plans
             WHERE is_active = TRUE AND is_free = FALSE
             ORDER BY sort_order ASC, price ASC`
        );
        const payload = {
            success: true,
            plans: rows.map((plan) => ({
                ...plan,
                billing_interval_label: getPlanIntervalLabel(plan),
                test_duration_minutes: getTestDurationMinutes() || null,
            })),
        };
        setCachedPublicPlans(payload);
        return res.status(200).json(payload);
    } catch (err) {
        console.error('[subscriptionPlans] getPublicPlans error:', err);
        return res.status(500).json({ success: false, message: 'Failed to fetch subscription plans' });
    }
};

exports.getAllPlans = async (req, res) => {
    try {
        await ensureTable();
        const { rows } = await pool.query(
            `SELECT * FROM subscription_plans ORDER BY sort_order ASC, price ASC`
        );
        return res.status(200).json({ success: true, plans: rows });
    } catch (err) {
        console.error('[subscriptionPlans] getAllPlans error:', err);
        return res.status(500).json({ success: false, message: 'Failed to fetch subscription plans' });
    }
};

exports.createPlan = async (req, res) => {
    try {
        await ensureTable();
        const {
            slug, name, price, duration_days,
            badge_color, accent_color, googs_limit, verified_tick,
            features, extra, is_active, is_free, sort_order,
        } = req.body || {};

        if (!slug || !name) {
            return res.status(400).json({ success: false, message: 'slug and name are required' });
        }

        const mergedFeatures = syncAutoFeatures(features ?? [], extra ?? {});
        const { rows } = await pool.query(
            `INSERT INTO subscription_plans
                (slug, name, price, duration_days, badge_color, accent_color,
                 googs_limit, verified_tick, features, extra, is_active, is_free, sort_order)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13)
             RETURNING *`,
            [
                slug, name, price ?? 0, duration_days ?? 30,
                badge_color ?? 'silver', accent_color ?? 'zinc',
                googs_limit ?? 5, verified_tick ?? true,
                JSON.stringify(mergedFeatures),
                JSON.stringify(extra ?? {}),
                is_active ?? true, is_free ?? false, sort_order ?? 0,
            ]
        );
        invalidatePublicPlansCache();
        return res.status(201).json({ success: true, plan: rows[0] });
    } catch (err) {
        console.error('[subscriptionPlans] createPlan error:', err);
        if (err.code === '23505') {
            return res.status(409).json({ success: false, message: 'A plan with this slug already exists' });
        }
        return res.status(500).json({ success: false, message: 'Failed to create plan' });
    }
};

exports.updatePlan = async (req, res) => {
    try {
        await ensureTable();
        const { id } = req.params;
        const {
            slug, name, price, duration_days,
            badge_color, accent_color, googs_limit, verified_tick,
            features, extra, is_active, is_free, sort_order,
        } = req.body || {};

        // Fetch current state to merge features correctly
        const current = await pool.query('SELECT features, extra FROM subscription_plans WHERE id = $1', [id]);
        const currentFeatures = current.rows[0]?.features || [];
        const currentExtra   = current.rows[0]?.extra || {};
        const mergedExtra    = extra !== undefined ? extra : currentExtra;
        const mergedFeatures = syncAutoFeatures(
            features !== undefined ? features : currentFeatures,
            mergedExtra
        );

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
                slug ?? null, name ?? null, price ?? null, duration_days ?? null,
                badge_color ?? null, accent_color ?? null, googs_limit ?? null, verified_tick ?? null,
                JSON.stringify(mergedFeatures),
                extra !== undefined ? JSON.stringify(extra) : null,
                is_active ?? null, is_free ?? null, sort_order ?? null,
                id,
            ]
        );

        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Plan not found' });
        invalidatePublicPlansCache();
        return res.status(200).json({ success: true, plan: rows[0] });
    } catch (err) {
        console.error('[subscriptionPlans] updatePlan error:', err);
        return res.status(500).json({ success: false, message: 'Failed to update plan' });
    }
};

exports.deletePlan = async (req, res) => {
    const client = await pool.connect();
    try {
        await ensureTable();
        const { id } = req.params;

        await client.query('BEGIN');

        // Cancel all active user subscriptions tied to this plan
        const cancelled = await client.query(
            `UPDATE user_plan_subscriptions
             SET status = 'cancelled', cancelled_at = NOW()
             WHERE plan_id = $1 AND status = 'active'`,
            [id]
        );

        // Delete the plan itself
        const { rowCount } = await client.query('DELETE FROM subscription_plans WHERE id = $1', [id]);
        if (rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Plan not found' });
        }

        await client.query('COMMIT');
        invalidatePublicPlansCache();
        return res.status(200).json({ success: true, subscriptions_cancelled: cancelled.rowCount });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[subscriptionPlans] deletePlan error:', err);
        return res.status(500).json({ success: false, message: 'Failed to delete plan' });
    } finally {
        client.release();
    }
};
