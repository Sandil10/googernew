const pool = require('../config/database');

const ADMIN_PANEL_URL = (process.env.ADMIN_PANEL_URL || 'http://localhost:3002').replace(/\/$/, '');

const DEFAULT_SETTINGS = {
    min_upload_price: 100,
    max_upload_price: 10000,
    flash_content_price: 100,
    flash_preview_seconds: 5,
    flash_auto_play: false,
    default_topic: 'Technology',
    default_content_access_mode: 'unblurred',
    normal_user_video_limit_seconds: 60,
    subscribed_user_video_limit_seconds: 180,
    commission_tiers: [],
    subscription_commission_tiers: [],
};

let tableReady = false;

const ensureTable = async () => {
    if (tableReady) return;

    await pool.query(`
        CREATE TABLE IF NOT EXISTS upload_control_settings (
            id SERIAL PRIMARY KEY,
            min_upload_price DECIMAL(12, 2) NOT NULL DEFAULT 100,
            max_upload_price DECIMAL(12, 2) NOT NULL DEFAULT 10000,
            flash_content_price DECIMAL(12, 2) NOT NULL DEFAULT 100,
            flash_preview_seconds INTEGER NOT NULL DEFAULT 5,
            flash_auto_play BOOLEAN NOT NULL DEFAULT false,
            default_topic VARCHAR(80) NOT NULL DEFAULT 'Technology',
            default_content_access_mode VARCHAR(20) NOT NULL DEFAULT 'unblurred',
            normal_user_video_limit_seconds INTEGER NOT NULL DEFAULT 60,
            subscribed_user_video_limit_seconds INTEGER NOT NULL DEFAULT 180,
            commission_tiers JSONB NOT NULL DEFAULT '[]'::jsonb,
            subscription_commission_tiers JSONB NOT NULL DEFAULT '[]'::jsonb,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await pool.query(`
        ALTER TABLE upload_control_settings
        ADD COLUMN IF NOT EXISTS commission_tiers JSONB NOT NULL DEFAULT '[]'::jsonb
    `);
    await pool.query(`
        ALTER TABLE upload_control_settings
        ADD COLUMN IF NOT EXISTS subscription_commission_tiers JSONB NOT NULL DEFAULT '[]'::jsonb
    `);
    await pool.query(`ALTER TABLE upload_control_settings ADD COLUMN IF NOT EXISTS flash_content_price DECIMAL(12, 2) NOT NULL DEFAULT 100`);
    await pool.query(`ALTER TABLE upload_control_settings ADD COLUMN IF NOT EXISTS flash_preview_seconds INTEGER NOT NULL DEFAULT 5`);
    await pool.query(`ALTER TABLE upload_control_settings ADD COLUMN IF NOT EXISTS flash_auto_play BOOLEAN NOT NULL DEFAULT false`);

    await pool.query(`
        ALTER TABLE upload_control_settings
        ADD COLUMN IF NOT EXISTS normal_user_video_limit_seconds INTEGER NOT NULL DEFAULT 60
    `);

    await pool.query(`
        ALTER TABLE upload_control_settings
        ADD COLUMN IF NOT EXISTS subscribed_user_video_limit_seconds INTEGER NOT NULL DEFAULT 180
    `);

    await pool.query(`
        INSERT INTO upload_control_settings (
            min_upload_price,
            max_upload_price,
            flash_content_price,
            flash_preview_seconds,
            flash_auto_play,
            default_topic,
            default_content_access_mode
        )
        SELECT $1, $2, $3, $4, $5, $6, $7
        WHERE NOT EXISTS (
            SELECT 1 FROM upload_control_settings
        )
    `, [
        DEFAULT_SETTINGS.min_upload_price,
        DEFAULT_SETTINGS.max_upload_price,
        DEFAULT_SETTINGS.flash_content_price,
        DEFAULT_SETTINGS.flash_preview_seconds,
        DEFAULT_SETTINGS.flash_auto_play,
        DEFAULT_SETTINGS.default_topic,
        DEFAULT_SETTINGS.default_content_access_mode,
    ]);

    tableReady = true;
};

const normalizeRow = (row) => ({
    min_upload_price: Number(row?.min_upload_price ?? DEFAULT_SETTINGS.min_upload_price),
    max_upload_price: Number(row?.max_upload_price ?? DEFAULT_SETTINGS.max_upload_price),
    flash_content_price: Number(row?.flash_content_price ?? DEFAULT_SETTINGS.flash_content_price),
    flash_preview_seconds: Number(row?.flash_preview_seconds ?? DEFAULT_SETTINGS.flash_preview_seconds),
    flash_auto_play: Boolean(row?.flash_auto_play ?? DEFAULT_SETTINGS.flash_auto_play),
    default_topic: String(row?.default_topic || DEFAULT_SETTINGS.default_topic),
    default_content_access_mode: row?.default_content_access_mode === 'blurred' ? 'blurred' : 'unblurred',
    normal_user_video_limit_seconds: Number(row?.normal_user_video_limit_seconds ?? DEFAULT_SETTINGS.normal_user_video_limit_seconds),
    subscribed_user_video_limit_seconds: Number(row?.subscribed_user_video_limit_seconds ?? DEFAULT_SETTINGS.subscribed_user_video_limit_seconds),
    commission_tiers: Array.isArray(row?.commission_tiers) ? row.commission_tiers : DEFAULT_SETTINGS.commission_tiers,
    subscription_commission_tiers: Array.isArray(row?.subscription_commission_tiers) ? row.subscription_commission_tiers : DEFAULT_SETTINGS.subscription_commission_tiers,
    updated_at: row?.updated_at || null,
});

const fetchAdminPanelSettings = async () => {
    if (typeof fetch !== 'function') return null;
    try {
        const response = await fetch(`${ADMIN_PANEL_URL}/api/admin/customization/upload-control/public`, {
            method: 'GET',
            headers: { Accept: 'application/json' },
        });
        if (!response.ok) return null;
        const data = await response.json();
        return data ? normalizeRow(data?.settings || data) : null;
    } catch (error) {
        console.warn('[uploadControl] admin panel settings fallback unavailable:', error.message);
        return null;
    }
};

exports.getPublic = async (_req, res) => {
    try {
        await ensureTable();
        const adminPanelSettings = await fetchAdminPanelSettings();
        if (adminPanelSettings) {
            return res.json(adminPanelSettings);
        }

        const { rows } = await pool.query(`
            SELECT *
            FROM upload_control_settings
            ORDER BY id ASC
            LIMIT 1
        `);
        return res.json(normalizeRow(rows[0]));
    } catch (error) {
        console.error('[uploadControl] getPublic error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch upload control settings' });
    }
};

exports.update = async (req, res) => {
    try {
        await ensureTable();

        if (!(await assertAdmin(req.user?.id))) {
            return res.status(403).json({ success: false, message: 'Admin access required.' });
        }

        const currentSettings = normalizeRow((await pool.query(`
            SELECT *
            FROM upload_control_settings
            ORDER BY id ASC
            LIMIT 1
        `)).rows[0]);
        const minUploadPrice = Number(req.body?.min_upload_price ?? req.body?.minUploadPrice);
        const maxUploadPrice = Number(req.body?.max_upload_price ?? req.body?.maxUploadPrice);
        const flashContentPrice = Number(req.body?.flash_content_price ?? req.body?.flashContentPrice ?? currentSettings.flash_content_price);
        const flashPreviewSeconds = Number(req.body?.flash_preview_seconds ?? req.body?.flashPreviewSeconds ?? currentSettings.flash_preview_seconds);
        const flashAutoPlay = Boolean(req.body?.flash_auto_play ?? req.body?.flashAutoPlay ?? currentSettings.flash_auto_play);
        const normalUserVideoLimitSeconds = Number(req.body?.normal_user_video_limit_seconds ?? req.body?.normalUserVideoLimitSeconds);
        const subscribedUserVideoLimitSeconds = Number(req.body?.subscribed_user_video_limit_seconds ?? req.body?.subscribedUserVideoLimitSeconds);
        const defaultTopic = String(req.body?.default_topic ?? req.body?.defaultTopic ?? currentSettings.default_topic).trim();
        const defaultContentAccessMode = String(
            req.body?.default_content_access_mode ?? req.body?.defaultContentAccessMode ?? currentSettings.default_content_access_mode
        ).trim();
        const rawCommissionTiers = req.body?.commission_tiers ?? req.body?.commissionTiers ?? currentSettings.commission_tiers;
        const rawSubscriptionCommissionTiers = req.body?.subscription_commission_tiers ?? req.body?.subscriptionCommissionTiers ?? currentSettings.subscription_commission_tiers;
        const commissionTiers = Array.isArray(rawCommissionTiers)
            ? rawCommissionTiers
                .map((tier) => ({
                    min: Number(tier?.min ?? 0),
                    max: Number(tier?.max ?? 0),
                    commission: Number(tier?.commission ?? 0),
                }))
                .filter((tier) => Number.isFinite(tier.min) && Number.isFinite(tier.max) && Number.isFinite(tier.commission) && tier.min >= 0 && tier.max >= tier.min && tier.commission >= 0 && tier.commission <= 100)
            : [];
        const subscriptionCommissionTiers = Array.isArray(rawSubscriptionCommissionTiers)
            ? rawSubscriptionCommissionTiers
                .map((tier) => ({
                    min: Number(tier?.min ?? 0),
                    max: Number(tier?.max ?? 0),
                    commission: Number(tier?.commission ?? 0),
                }))
                .filter((tier) => Number.isFinite(tier.min) && Number.isFinite(tier.max) && Number.isFinite(tier.commission) && tier.min >= 0 && tier.max >= tier.min && tier.commission >= 0 && tier.commission <= 100)
            : [];

        if (!Number.isFinite(minUploadPrice) || minUploadPrice < 0) {
            return res.status(400).json({ success: false, message: 'Minimum upload price must be 0 or greater' });
        }

        if (!Number.isFinite(maxUploadPrice) || maxUploadPrice < minUploadPrice) {
            return res.status(400).json({ success: false, message: 'Maximum upload price must be greater than or equal to minimum upload price' });
        }
        for (let index = 0; index < subscriptionCommissionTiers.length; index += 1) {
            const tier = subscriptionCommissionTiers[index];
            if (index > 0) {
                const previousTier = subscriptionCommissionTiers[index - 1];
                if (tier.min <= previousTier.max) {
                    return res.status(400).json({ success: false, message: 'Subscription commission tiers cannot overlap. Adjust the price ranges and try again.' });
                }
            }
        }
        if (!Number.isFinite(flashContentPrice) || flashContentPrice <= 0) {
            return res.status(400).json({ success: false, message: 'Flash content price must be greater than 0' });
        }
        if (!Number.isFinite(flashPreviewSeconds) || flashPreviewSeconds < 1) {
            return res.status(400).json({ success: false, message: 'Flash preview time must be at least 1 second' });
        }

        if (!defaultTopic) {
            return res.status(400).json({ success: false, message: 'Default topic is required' });
        }

        if (!['blurred', 'unblurred'].includes(defaultContentAccessMode)) {
            return res.status(400).json({ success: false, message: 'Default content access mode is invalid' });
        }

        if (!Number.isFinite(normalUserVideoLimitSeconds) || normalUserVideoLimitSeconds < 1) {
            return res.status(400).json({ success: false, message: 'Normal user video limit must be at least 1 second' });
        }

        if (!Number.isFinite(subscribedUserVideoLimitSeconds) || subscribedUserVideoLimitSeconds < normalUserVideoLimitSeconds) {
            return res.status(400).json({ success: false, message: 'Subscriber video limit must be greater than or equal to normal user video limit' });
        }

        const { rows } = await pool.query(`
            UPDATE upload_control_settings
            SET min_upload_price = $1,
                max_upload_price = $2,
                flash_content_price = $3,
                flash_preview_seconds = $4,
                flash_auto_play = $5,
                default_topic = $6,
                default_content_access_mode = $7,
                normal_user_video_limit_seconds = $8,
                subscribed_user_video_limit_seconds = $9,
                commission_tiers = $10::jsonb,
                subscription_commission_tiers = $11::jsonb,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = (
                SELECT id
                FROM upload_control_settings
                ORDER BY id ASC
                LIMIT 1
            )
            RETURNING *
        `, [
            minUploadPrice,
            maxUploadPrice,
            flashContentPrice,
            Math.floor(flashPreviewSeconds),
            flashAutoPlay,
            defaultTopic,
            defaultContentAccessMode,
            normalUserVideoLimitSeconds,
            subscribedUserVideoLimitSeconds,
            JSON.stringify(commissionTiers),
            JSON.stringify(subscriptionCommissionTiers),
        ]);

        return res.json({ success: true, settings: normalizeRow(rows[0]) });
    } catch (error) {
        console.error('[uploadControl] update error:', error);
        return res.status(500).json({ success: false, message: 'Failed to update upload control settings' });
    }
};
