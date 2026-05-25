const pool = require('../config/database');
const {
    ensureReferralCommissionTables,
    getReferralCommissionSettings,
    updateReferralCommissionSettings,
    syncReferralRelationshipCommissionFields,
} = require('../utils/referralCommission');

exports.getSettings = async (req, res) => {
    const client = await pool.connect();
    try {
        const settings = await getReferralCommissionSettings(client);
        const data = {
            product_purchase_pool_percentage: settings.productPurchasePoolPercentage,
            ad_purchase_pool_percentage: settings.adPurchasePoolPercentage,
            ...settings,
        };
        return res.status(200).json({ success: true, settings, data });
    } catch (error) {
        console.error('[referralCommission] getSettings error:', error);
        return res.status(500).json({ success: false, message: 'Failed to load referral commission settings' });
    } finally {
        client.release();
    }
};

exports.updateSettings = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const settings = await updateReferralCommissionSettings(client, req.body || {});
        await client.query('COMMIT');
        const data = {
            product_purchase_pool_percentage: settings.productPurchasePoolPercentage,
            ad_purchase_pool_percentage: settings.adPurchasePoolPercentage,
            ...settings,
        };
        return res.status(200).json({ success: true, settings, data });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[referralCommission] updateSettings error:', error);
        return res.status(500).json({ success: false, message: 'Failed to save referral commission settings' });
    } finally {
        client.release();
    }
};

exports.getLevels = async (req, res) => {
    const client = await pool.connect();
    try {
        await ensureReferralCommissionTables(client);
        const result = await client.query(
            `SELECT id, level, name, commission_percentage, is_active, sort_order, created_at, updated_at
             FROM referral_level_settings
             ORDER BY sort_order ASC, level ASC`
        );
        return res.status(200).json({ success: true, levels: result.rows, data: result.rows });
    } catch (error) {
        console.error('[referralCommission] getLevels error:', error);
        return res.status(500).json({ success: false, message: 'Failed to load referral levels' });
    } finally {
        client.release();
    }
};

exports.upsertLevel = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await ensureReferralCommissionTables(client);

        const level = Number(req.params.level ?? req.body?.level);
        if (!Number.isFinite(level) || level < 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: 'Valid level is required' });
        }

        const name = String(req.body?.name || (level === 0 ? 'Googer' : `Level ${level}`)).trim().slice(0, 80);
        const commissionPercentage = Math.min(100, Math.max(0, Number(req.body?.commission_percentage ?? req.body?.commissionPercentage ?? 0)));
        const isActive = req.body?.is_active ?? req.body?.isActive ?? true;
        const sortOrder = Number(req.body?.sort_order ?? req.body?.sortOrder ?? level);

        const result = await client.query(
            `INSERT INTO referral_level_settings
                (level, name, commission_percentage, is_active, sort_order, updated_at)
             VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
             ON CONFLICT (level) DO UPDATE
             SET name = EXCLUDED.name,
                 commission_percentage = EXCLUDED.commission_percentage,
                 is_active = EXCLUDED.is_active,
                 sort_order = EXCLUDED.sort_order,
                 updated_at = CURRENT_TIMESTAMP
             RETURNING *`,
            [level, name, commissionPercentage, Boolean(isActive), Number.isFinite(sortOrder) ? sortOrder : level]
        );

        await syncReferralRelationshipCommissionFields(client);
        await client.query('COMMIT');
        return res.status(200).json({ success: true, level: result.rows[0], data: result.rows[0] });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[referralCommission] upsertLevel error:', error);
        return res.status(500).json({ success: false, message: 'Failed to save referral level' });
    } finally {
        client.release();
    }
};

exports.bulkUpsertLevels = async (req, res) => {
    const client = await pool.connect();
    try {
        const levels = Array.isArray(req.body?.levels) ? req.body.levels : [];
        if (levels.length === 0) {
            return res.status(400).json({ success: false, message: 'levels array is required' });
        }

        await client.query('BEGIN');
        await ensureReferralCommissionTables(client);

        for (const item of levels) {
            const level = Number(item.level);
            if (!Number.isFinite(level) || level < 0) continue;
            const name = String(item.name || (level === 0 ? 'Googer' : `Level ${level}`)).trim().slice(0, 80);
            const commissionPercentage = Math.min(100, Math.max(0, Number(item.commission_percentage ?? item.commissionPercentage ?? 0)));
            const sortOrder = Number(item.sort_order ?? item.sortOrder ?? level);

            await client.query(
                `INSERT INTO referral_level_settings
                    (level, name, commission_percentage, is_active, sort_order, updated_at)
                 VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
                 ON CONFLICT (level) DO UPDATE
                 SET name = EXCLUDED.name,
                     commission_percentage = EXCLUDED.commission_percentage,
                     is_active = EXCLUDED.is_active,
                     sort_order = EXCLUDED.sort_order,
                     updated_at = CURRENT_TIMESTAMP`,
                [
                    level,
                    name,
                    commissionPercentage,
                    Boolean(item.is_active ?? item.isActive ?? true),
                    Number.isFinite(sortOrder) ? sortOrder : level,
                ]
            );
        }

        await syncReferralRelationshipCommissionFields(client);
        const result = await client.query(
            `SELECT id, level, name, commission_percentage, is_active, sort_order, created_at, updated_at
             FROM referral_level_settings
             ORDER BY sort_order ASC, level ASC`
        );
        await client.query('COMMIT');
        return res.status(200).json({ success: true, levels: result.rows, data: result.rows });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[referralCommission] bulkUpsertLevels error:', error);
        return res.status(500).json({ success: false, message: 'Failed to save referral levels' });
    } finally {
        client.release();
    }
};

exports.deleteLevel = async (req, res) => {
    const client = await pool.connect();
    try {
        const level = Number(req.params.level);
        if (!Number.isFinite(level) || level < 0) {
            return res.status(400).json({ success: false, message: 'Valid level is required' });
        }

        await client.query('BEGIN');
        await ensureReferralCommissionTables(client);
        await client.query('DELETE FROM referral_level_settings WHERE level = $1', [level]);
        await syncReferralRelationshipCommissionFields(client);
        await client.query('COMMIT');
        return res.status(200).json({ success: true });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[referralCommission] deleteLevel error:', error);
        return res.status(500).json({ success: false, message: 'Failed to delete referral level' });
    } finally {
        client.release();
    }
};
