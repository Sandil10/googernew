const pool = require('../config/database');

const AD_TYPES = ['photo_video_ad', 'product_promote_ad', 'profile_promote_ad'];

let tableReady = false;

const ensureReachTiersTable = async () => {
    if (tableReady) return;

    await pool.query(`
        CREATE TABLE IF NOT EXISTS reach_tiers (
            id                   SERIAL PRIMARY KEY,
            ad_type              VARCHAR(50)    NOT NULL,
            budget_from          DECIMAL(12,2)  NOT NULL,
            budget_to            DECIMAL(12,2)  NOT NULL,
            min_days             INTEGER        NOT NULL DEFAULT 1,
            max_days             INTEGER        NOT NULL DEFAULT 1,
            min_multiplier       DECIMAL(10,4)  NOT NULL DEFAULT 0,
            max_multiplier       DECIMAL(10,4)  NOT NULL DEFAULT 0,
            max_reach_multiplier DECIMAL(10,4)  DEFAULT NULL,
            created_at           TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
            updated_at           TIMESTAMP      DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Migrate: add max_reach_multiplier if the table already existed with max_reach_cap
    await pool.query(`
        ALTER TABLE reach_tiers
            ADD COLUMN IF NOT EXISTS max_reach_multiplier DECIMAL(10,4) DEFAULT NULL;
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_reach_tiers_ad_type ON reach_tiers(ad_type);
    `);

    tableReady = true;
};

// Public — no auth required
exports.getReachTiersPublic = async (req, res) => {
    try {
        await ensureReachTiersTable();

        const { ad_type } = req.query;

        if (!ad_type || !AD_TYPES.includes(ad_type)) {
            return res.status(400).json({ success: false, message: `ad_type must be one of: ${AD_TYPES.join(', ')}` });
        }

        const { rows } = await pool.query(
            `SELECT id, ad_type, budget_from, budget_to, min_days, max_days,
                    min_multiplier, max_multiplier, max_reach_multiplier, created_at, updated_at
             FROM reach_tiers
             WHERE ad_type = $1
             ORDER BY budget_from ASC`,
            [ad_type]
        );

        return res.status(200).json(rows);
    } catch (err) {
        console.error('[reachTiers] getReachTiersPublic error:', err);
        return res.status(500).json({ success: false, message: 'Failed to fetch reach tiers' });
    }
};

// Admin — list all tiers (optionally filtered)
exports.getAllReachTiers = async (req, res) => {
    try {
        await ensureReachTiersTable();

        const { ad_type } = req.query;
        const params = [];
        let where = '';

        if (ad_type && AD_TYPES.includes(ad_type)) {
            where = 'WHERE ad_type = $1';
            params.push(ad_type);
        }

        const { rows } = await pool.query(
            `SELECT * FROM reach_tiers ${where} ORDER BY ad_type, budget_from ASC`,
            params
        );

        return res.status(200).json({ success: true, tiers: rows });
    } catch (err) {
        console.error('[reachTiers] getAllReachTiers error:', err);
        return res.status(500).json({ success: false, message: 'Failed to fetch reach tiers' });
    }
};

// Admin — create tier
exports.createReachTier = async (req, res) => {
    try {
        await ensureReachTiersTable();

        const { ad_type, budget_from, budget_to, min_days, max_days, min_multiplier, max_multiplier, max_reach_multiplier } = req.body;

        if (!AD_TYPES.includes(ad_type)) {
            return res.status(400).json({ success: false, message: 'Invalid ad_type' });
        }
        if (budget_from == null || budget_to == null || budget_from < 0 || budget_to < budget_from) {
            return res.status(400).json({ success: false, message: 'budget_from must be <= budget_to and both >= 0' });
        }
        if (!min_days || !max_days || min_days < 1 || max_days < min_days) {
            return res.status(400).json({ success: false, message: 'min_days must be >= 1 and max_days >= min_days' });
        }

        const { rows } = await pool.query(
            `INSERT INTO reach_tiers (ad_type, budget_from, budget_to, min_days, max_days, min_multiplier, max_multiplier, max_reach_multiplier)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [ad_type, budget_from, budget_to, min_days, max_days,
             min_multiplier ?? 0, max_multiplier ?? 0, max_reach_multiplier ?? null]
        );

        return res.status(201).json({ success: true, tier: rows[0] });
    } catch (err) {
        console.error('[reachTiers] createReachTier error:', err);
        return res.status(500).json({ success: false, message: 'Failed to create reach tier' });
    }
};

// Admin — update tier
exports.updateReachTier = async (req, res) => {
    try {
        await ensureReachTiersTable();

        const { id } = req.params;
        const { ad_type, budget_from, budget_to, min_days, max_days, min_multiplier, max_multiplier, max_reach_multiplier } = req.body;

        if (ad_type && !AD_TYPES.includes(ad_type)) {
            return res.status(400).json({ success: false, message: 'Invalid ad_type' });
        }

        const { rows } = await pool.query(
            `UPDATE reach_tiers
             SET ad_type              = COALESCE($1, ad_type),
                 budget_from          = COALESCE($2, budget_from),
                 budget_to            = COALESCE($3, budget_to),
                 min_days             = COALESCE($4, min_days),
                 max_days             = COALESCE($5, max_days),
                 min_multiplier       = COALESCE($6, min_multiplier),
                 max_multiplier       = COALESCE($7, max_multiplier),
                 max_reach_multiplier = $8,
                 updated_at           = NOW()
             WHERE id = $9
             RETURNING *`,
            [ad_type ?? null, budget_from ?? null, budget_to ?? null, min_days ?? null, max_days ?? null,
             min_multiplier ?? null, max_multiplier ?? null,
             max_reach_multiplier !== undefined ? (max_reach_multiplier ?? null) : undefined,
             id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Tier not found' });
        }

        return res.status(200).json({ success: true, tier: rows[0] });
    } catch (err) {
        console.error('[reachTiers] updateReachTier error:', err);
        return res.status(500).json({ success: false, message: 'Failed to update reach tier' });
    }
};

// Admin — delete tier
exports.deleteReachTier = async (req, res) => {
    try {
        await ensureReachTiersTable();
        const { id } = req.params;
        const { rowCount } = await pool.query('DELETE FROM reach_tiers WHERE id = $1', [id]);
        if (rowCount === 0) return res.status(404).json({ success: false, message: 'Tier not found' });
        return res.status(200).json({ success: true });
    } catch (err) {
        console.error('[reachTiers] deleteReachTier error:', err);
        return res.status(500).json({ success: false, message: 'Failed to delete reach tier' });
    }
};
