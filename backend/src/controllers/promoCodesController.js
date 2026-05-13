const pool = require('../config/database');

let tableReady = false;
let migrationReady = false; // separate flag so migrations run once per process start

const AD_TYPE_VALUES = new Set(['photo_video_ad', 'product_promote_ad', 'profile_promote_ad']);
const VALID_DISCOUNT_TYPES = ['rupee', 'days', 'reach'];

// Runs once per process — updates constraint and adds columns even if table already existed
const runMigrations = async () => {
    if (migrationReady) return;
    migrationReady = true;

    // Ensure table exists first
    await pool.query(`
        CREATE TABLE IF NOT EXISTS promo_codes (
            id SERIAL PRIMARY KEY,
            code VARCHAR(20) UNIQUE NOT NULL,
            ad_type VARCHAR(50) NOT NULL,
            discount_type VARCHAR(20) NOT NULL,
            discount_value NUMERIC(12, 2) NOT NULL DEFAULT 0,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            expires_at TIMESTAMP,
            max_uses INTEGER,
            uses_count INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Always drop and re-add the check constraint so 'reach' is included
    await pool.query(`ALTER TABLE promo_codes DROP CONSTRAINT IF EXISTS promo_codes_discount_type_check;`);
    await pool.query(`ALTER TABLE promo_codes ADD CONSTRAINT promo_codes_discount_type_check CHECK (discount_type IN ('rupee', 'days', 'reach'));`);

    // Add columns if missing
    await pool.query(`ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS reach_cap INTEGER DEFAULT NULL;`);
    await pool.query(`
        ALTER TABLE ads
            ADD COLUMN IF NOT EXISTS promo_code VARCHAR(20),
            ADD COLUMN IF NOT EXISTS promo_discount DECIMAL(10,2),
            ADD COLUMN IF NOT EXISTS reach_cap INTEGER DEFAULT NULL;
    `);
    await pool.query(`ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS min_reach_bonus INTEGER DEFAULT NULL;`);
    await pool.query(`ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS max_reach_bonus INTEGER DEFAULT NULL;`);
    await pool.query(`ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS promo_max_days INTEGER DEFAULT NULL;`);
};

const ensurePromoCodesTable = async () => {
    await runMigrations();
    if (tableReady) return;
    tableReady = true;
};

const getUserId = (req) => req.user?.id || req.user?.userId;

const validatePromoCode = async (req, res) => {
    try {
        await ensurePromoCodesTable();

        const { code, ad_type } = req.body;

        if (!code || typeof code !== 'string') {
            return res.status(400).json({ success: false, message: 'Promo code is required' });
        }
        if (!ad_type || !AD_TYPE_VALUES.has(ad_type)) {
            return res.status(400).json({ success: false, message: 'Invalid ad_type' });
        }

        const normalizedCode = code.trim().toUpperCase();

        const { rows } = await pool.query(
            `SELECT id, code, ad_type, discount_type, discount_value, reach_cap, is_active,
                    expires_at, max_uses, uses_count, min_reach_bonus, max_reach_bonus, promo_max_days
             FROM promo_codes
             WHERE code = $1`,
            [normalizedCode]
        );

        if (rows.length === 0 || !rows[0].is_active) {
            return res.status(404).json({ success: false, message: 'Invalid or inactive promo code' });
        }

        const promo = rows[0];

        if (promo.ad_type !== ad_type) {
            return res.status(400).json({ success: false, message: 'Promo code is not valid for this ad type' });
        }

        if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
            return res.status(400).json({ success: false, message: 'Promo code has expired' });
        }

        if (promo.max_uses !== null && promo.uses_count >= promo.max_uses) {
            return res.status(400).json({ success: false, message: 'Promo code usage limit reached' });
        }

        const userId = getUserId(req);
        if (userId) {
            const { rows: usedRows } = await pool.query(
                `SELECT 1 FROM ads WHERE user_id = $1 AND promo_code = $2 LIMIT 1`,
                [userId, normalizedCode]
            );
            if (usedRows.length > 0) {
                return res.status(400).json({ success: false, message: 'You have already used this promo code' });
            }
        }

        if (promo.discount_type === 'reach' && (promo.min_reach_bonus == null || promo.promo_max_days == null)) {
            const { rows: tiers } = await pool.query('SELECT * FROM reach_tiers WHERE ad_type = $1', [promo.ad_type]);
            const budgetVal = Number(promo.discount_value);
            const tier = tiers.find(t => budgetVal >= Number(t.budget_from) && budgetVal <= Number(t.budget_to));
            if (tier) {
                if (promo.min_reach_bonus == null) {
                    promo.min_reach_bonus = Math.round(budgetVal * Number(tier.min_multiplier));
                    promo.max_reach_bonus = Math.round(budgetVal * Number(tier.max_multiplier));
                }
                if (promo.promo_max_days == null) {
                    promo.promo_max_days = tier.max_days;
                }
            }
        }

        return res.status(200).json({
            valid: true,
            code: promo.code,
            ad_type: promo.ad_type,
            discount_type: promo.discount_type,
            discount_value: Number(promo.discount_value),
            reach_cap: promo.reach_cap != null ? Number(promo.reach_cap) : null,
            min_reach_bonus: promo.min_reach_bonus != null ? Number(promo.min_reach_bonus) : undefined,
            max_reach_bonus: promo.max_reach_bonus != null ? Number(promo.max_reach_bonus) : undefined,
            promo_max_days: promo.promo_max_days != null ? Number(promo.promo_max_days) : undefined,
        });
    } catch (err) {
        console.error('[promoCodesController] validatePromoCode error:', err);
        return res.status(500).json({ success: false, message: 'Server error validating promo code' });
    }
};

const redeemPromoCode = async (req, res) => {
    try {
        await ensurePromoCodesTable();

        const { code, ad_type, ad_id } = req.body;

        if (!code || typeof code !== 'string') {
            return res.status(400).json({ success: false, message: 'Promo code is required' });
        }
        if (!ad_type || !AD_TYPE_VALUES.has(ad_type)) {
            return res.status(400).json({ success: false, message: 'Invalid ad_type' });
        }
        if (!ad_id || typeof ad_id !== 'string') {
            return res.status(400).json({ success: false, message: 'ad_id is required' });
        }

        const normalizedCode = code.trim().toUpperCase();

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Lock the promo code row for atomic update
            const { rows } = await client.query(
                `SELECT id, code, ad_type, discount_type, discount_value, reach_cap, is_active,
                        expires_at, max_uses, uses_count, min_reach_bonus, max_reach_bonus, promo_max_days
                 FROM promo_codes
                 WHERE code = $1
                 FOR UPDATE`,
                [normalizedCode]
            );

            if (rows.length === 0 || !rows[0].is_active) {
                await client.query('ROLLBACK');
                return res.status(404).json({ success: false, message: 'Invalid or inactive promo code' });
            }

            const promo = rows[0];

            if (promo.ad_type !== ad_type) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: 'Promo code is not valid for this ad type' });
            }

            if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: 'Promo code has expired' });
            }

            if (promo.max_uses !== null && promo.uses_count >= promo.max_uses) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: 'Promo code usage limit reached' });
            }

            const userId = getUserId(req);
            if (userId) {
                const { rows: usedRows } = await client.query(
                    `SELECT 1 FROM ads WHERE user_id = $1 AND promo_code = $2 LIMIT 1`,
                    [userId, normalizedCode]
                );
                if (usedRows.length > 0) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ success: false, message: 'You have already used this promo code' });
                }
            }

            // Increment uses_count
            await client.query(
                `UPDATE promo_codes SET uses_count = uses_count + 1 WHERE id = $1`,
                [promo.id]
            );

            if (promo.discount_type === 'reach' && (promo.min_reach_bonus == null || promo.promo_max_days == null)) {
                const { rows: tiers } = await client.query('SELECT * FROM reach_tiers WHERE ad_type = $1', [promo.ad_type]);
                const budgetVal = Number(promo.discount_value);
                const tier = tiers.find(t => budgetVal >= Number(t.budget_from) && budgetVal <= Number(t.budget_to));
                if (tier) {
                    if (promo.min_reach_bonus == null) {
                        promo.min_reach_bonus = Math.round(budgetVal * Number(tier.min_multiplier));
                        promo.max_reach_bonus = Math.round(budgetVal * Number(tier.max_multiplier));
                    }
                    if (promo.promo_max_days == null) {
                        promo.promo_max_days = tier.max_days;
                    }
                }
            }

            // Save promo info to the ad record if it exists
            const promoDiscountJson = JSON.stringify({
                discount_type: promo.discount_type,
                discount_value: Number(promo.discount_value),
            });

            await client.query(
                `UPDATE ads SET promo_code = $1, promo_discount = $2::jsonb, reach_cap = $3 WHERE ad_id = $4`,
                [promo.code, promoDiscountJson, promo.reach_cap ?? null, ad_id]
            );

            await client.query('COMMIT');

            return res.status(200).json({
                redeemed: true,
                code: promo.code,
                discount_type: promo.discount_type,
                discount_value: Number(promo.discount_value),
                min_reach_bonus: promo.min_reach_bonus != null ? Number(promo.min_reach_bonus) : undefined,
                max_reach_bonus: promo.max_reach_bonus != null ? Number(promo.max_reach_bonus) : undefined,
                promo_max_days: promo.promo_max_days != null ? Number(promo.promo_max_days) : undefined,
            });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('[promoCodesController] redeemPromoCode error:', err);
        return res.status(500).json({ success: false, message: 'Server error redeeming promo code' });
    }
};

// ── Admin CRUD ──────────────────────────────────────────────────────────────

exports.getAllPromoCodes = async (req, res) => {
    try {
        await ensurePromoCodesTable();
        const { ad_type } = req.query;
        const params = [];
        let where = '';
        if (ad_type && AD_TYPE_VALUES.has(ad_type)) {
            where = 'WHERE ad_type = $1';
            params.push(ad_type);
        }
        const { rows } = await pool.query(
            `SELECT id, code, ad_type, discount_type, discount_value, reach_cap,
                    is_active, max_uses, uses_count, expires_at, created_at,
                    min_reach_bonus, max_reach_bonus
             FROM promo_codes ${where} ORDER BY created_at DESC`,
            params
        );
        return res.status(200).json({ success: true, promo_codes: rows });
    } catch (err) {
        console.error('[promoCodesController] getAllPromoCodes error:', err);
        return res.status(500).json({ success: false, message: 'Failed to fetch promo codes' });
    }
};

exports.createPromoCode = async (req, res) => {
    try {
        await ensurePromoCodesTable();
        const { code, ad_type, discount_type, discount_value, reach_cap, is_active, max_uses, expires_at } = req.body;

        if (!code || typeof code !== 'string') return res.status(400).json({ success: false, message: 'code is required' });
        if (!AD_TYPE_VALUES.has(ad_type)) return res.status(400).json({ success: false, message: 'Invalid ad_type' });
        if (!VALID_DISCOUNT_TYPES.includes(discount_type)) return res.status(400).json({ success: false, message: `discount_type must be one of: ${VALID_DISCOUNT_TYPES.join(', ')}` });
        if (discount_value == null || isNaN(Number(discount_value))) return res.status(400).json({ success: false, message: 'discount_value is required' });

        let min_reach_bonus = null;
        let max_reach_bonus = null;
        let promo_max_days = null;

        if (discount_type === 'reach') {
            const { rows: tiers } = await pool.query('SELECT * FROM reach_tiers WHERE ad_type = $1', [ad_type]);
            const budgetVal = Number(discount_value);
            const tier = tiers.find(t => budgetVal >= Number(t.budget_from) && budgetVal <= Number(t.budget_to));
            if (tier) {
                min_reach_bonus = Math.round(budgetVal * Number(tier.min_multiplier));
                max_reach_bonus = Math.round(budgetVal * Number(tier.max_multiplier));
                promo_max_days = tier.max_days;
            }
        }

        const normalized = code.trim().toUpperCase();
        const { rows } = await pool.query(
            `INSERT INTO promo_codes (code, ad_type, discount_type, discount_value, reach_cap, is_active, max_uses, expires_at, min_reach_bonus, max_reach_bonus, promo_max_days)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             RETURNING *`,
            [normalized, ad_type, discount_type, Number(discount_value),
             reach_cap ?? null, is_active !== false, max_uses ?? null, expires_at ?? null,
             min_reach_bonus, max_reach_bonus, promo_max_days]
        );
        return res.status(201).json({ success: true, promo_code: rows[0] });
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ success: false, message: 'Promo code already exists' });
        console.error('[promoCodesController] createPromoCode error:', err);
        return res.status(500).json({ success: false, message: 'Failed to create promo code' });
    }
};

exports.updatePromoCode = async (req, res) => {
    try {
        await ensurePromoCodesTable();
        const { id } = req.params;
        const { discount_type, discount_value, reach_cap, is_active, max_uses, expires_at } = req.body;

        if (discount_type !== undefined && !VALID_DISCOUNT_TYPES.includes(discount_type)) {
            return res.status(400).json({ success: false, message: `discount_type must be one of: ${VALID_DISCOUNT_TYPES.join(', ')}` });
        }

        const existingCodeResult = await pool.query(`SELECT * FROM promo_codes WHERE id = $1`, [id]);
        if (existingCodeResult.rows.length === 0) return res.status(404).json({ success: false, message: 'Promo code not found' });
        const existingPromo = existingCodeResult.rows[0];

        const newDiscountType = discount_type !== undefined ? discount_type : existingPromo.discount_type;
        const newDiscountValue = discount_value !== undefined ? Number(discount_value) : Number(existingPromo.discount_value);

        let min_reach_bonus = null;
        let max_reach_bonus = null;
        let promo_max_days = null;

        if (newDiscountType === 'reach') {
            const { rows: tiers } = await pool.query('SELECT * FROM reach_tiers WHERE ad_type = $1', [existingPromo.ad_type]);
            const tier = tiers.find(t => newDiscountValue >= Number(t.budget_from) && newDiscountValue <= Number(t.budget_to));
            if (tier) {
                min_reach_bonus = Math.round(newDiscountValue * Number(tier.min_multiplier));
                max_reach_bonus = Math.round(newDiscountValue * Number(tier.max_multiplier));
                promo_max_days = tier.max_days;
            }
        }

        const { rows } = await pool.query(
            `UPDATE promo_codes
             SET discount_type   = COALESCE($1, discount_type),
                 discount_value  = COALESCE($2, discount_value),
                 reach_cap       = $3,
                 is_active       = COALESCE($4, is_active),
                 max_uses        = $5,
                 expires_at      = $6,
                 min_reach_bonus = $7,
                 max_reach_bonus = $8,
                 promo_max_days  = $9
             WHERE id = $10
             RETURNING *`,
            [
                discount_type ?? null,
                discount_value ?? null,
                reach_cap !== undefined ? (reach_cap ?? null) : undefined,
                is_active ?? null,
                max_uses !== undefined ? (max_uses ?? null) : undefined,
                expires_at !== undefined ? (expires_at ?? null) : undefined,
                min_reach_bonus,
                max_reach_bonus,
                promo_max_days,
                id,
            ]
        );
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Promo code not found' });
        return res.status(200).json({ success: true, promo_code: rows[0] });
    } catch (err) {
        console.error('[promoCodesController] updatePromoCode error:', err);
        return res.status(500).json({ success: false, message: 'Failed to update promo code' });
    }
};

exports.deletePromoCode = async (req, res) => {
    try {
        await ensurePromoCodesTable();
        const { id } = req.params;
        const { rowCount } = await pool.query('DELETE FROM promo_codes WHERE id = $1', [id]);
        if (rowCount === 0) return res.status(404).json({ success: false, message: 'Promo code not found' });
        return res.status(200).json({ success: true });
    } catch (err) {
        console.error('[promoCodesController] deletePromoCode error:', err);
        return res.status(500).json({ success: false, message: 'Failed to delete promo code' });
    }
};

module.exports = { validatePromoCode, redeemPromoCode, ...exports };
