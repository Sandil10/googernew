const pool = require('../config/database');

const AD_TYPES = ['photo_video_ad', 'product_promote_ad', 'profile_promote_ad'];
const DEFAULTS = { min_multiplier: 300, max_multiplier: 500 };

let tableReady = false;

const ensureReachSettingsTable = async () => {
    if (tableReady) return;

    await pool.query(`
        CREATE TABLE IF NOT EXISTS reach_settings (
            id SERIAL PRIMARY KEY,
            ad_type VARCHAR(50) UNIQUE NOT NULL,
            min_multiplier DECIMAL(10, 2) NOT NULL DEFAULT 300,
            max_multiplier DECIMAL(10, 2) NOT NULL DEFAULT 500,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Seed defaults for any missing ad types
    for (const adType of AD_TYPES) {
        await pool.query(`
            INSERT INTO reach_settings (ad_type, min_multiplier, max_multiplier)
            VALUES ($1, $2, $3)
            ON CONFLICT (ad_type) DO NOTHING;
        `, [adType, DEFAULTS.min_multiplier, DEFAULTS.max_multiplier]);
    }

    tableReady = true;
};

exports.getReachSettingsPublic = async (req, res) => {
    try {
        await ensureReachSettingsTable();

        const { rows } = await pool.query(
            `SELECT ad_type, min_multiplier, max_multiplier, updated_at
             FROM reach_settings
             WHERE ad_type = ANY($1)
             ORDER BY ad_type`,
            [AD_TYPES]
        );

        return res.status(200).json(
            rows.map((r) => ({
                ad_type: r.ad_type,
                min_multiplier: Number(r.min_multiplier),
                max_multiplier: Number(r.max_multiplier),
                updated_at: r.updated_at,
            }))
        );
    } catch (err) {
        console.error('[reachSettings] getReachSettingsPublic error:', err);
        return res.status(500).json({ success: false, message: 'Failed to fetch reach settings' });
    }
};

// Admin write endpoint (used by admin panel)
exports.upsertReachSettings = async (req, res) => {
    try {
        await ensureReachSettingsTable();

        const { ad_type, min_multiplier, max_multiplier } = req.body;

        if (!AD_TYPES.includes(ad_type)) {
            return res.status(400).json({ success: false, message: 'Invalid ad_type' });
        }
        if (typeof min_multiplier !== 'number' || typeof max_multiplier !== 'number') {
            return res.status(400).json({ success: false, message: 'min_multiplier and max_multiplier must be numbers' });
        }
        if (min_multiplier < 0 || max_multiplier < min_multiplier) {
            return res.status(400).json({ success: false, message: 'max_multiplier must be >= min_multiplier and both must be >= 0' });
        }

        const { rows } = await pool.query(`
            INSERT INTO reach_settings (ad_type, min_multiplier, max_multiplier, updated_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (ad_type) DO UPDATE
              SET min_multiplier = EXCLUDED.min_multiplier,
                  max_multiplier = EXCLUDED.max_multiplier,
                  updated_at = NOW()
            RETURNING *
        `, [ad_type, min_multiplier, max_multiplier]);

        return res.status(200).json({
            success: true,
            setting: {
                ad_type: rows[0].ad_type,
                min_multiplier: Number(rows[0].min_multiplier),
                max_multiplier: Number(rows[0].max_multiplier),
                updated_at: rows[0].updated_at,
            },
        });
    } catch (err) {
        console.error('[reachSettings] upsertReachSettings error:', err);
        return res.status(500).json({ success: false, message: 'Failed to update reach settings' });
    }
};
