const express = require('express');
const router = express.Router();
const reachSettingsController = require('../controllers/reachSettingsController');
const reachTiersController = require('../controllers/reachTiersController');
const promoCodesController = require('../controllers/promoCodesController');
const marketController = require('../controllers/marketController');
const subscriptionPlansController = require('../controllers/subscriptionPlansController');
const referralCommissionController = require('../controllers/referralCommissionController');
const uploadControlController = require('../controllers/uploadControlController');
const authMiddleware = require('../middleware/auth');
const pool = require('../config/database');

// ── Ad Allowed Countries (proxied from admin panel) ──────────────────────
const ADMIN_PANEL_URL = (process.env.ADMIN_PANEL_URL || 'http://localhost:3001').replace(/\/$/, '');
const ADMIN_PANEL_URLS = Array.from(new Set([
    ADMIN_PANEL_URL,
    'http://localhost:3002',
].map((url) => url.replace(/\/$/, ''))));
const AD_ALLOWED_COUNTRIES_KEY = 'ad_allowed_countries';
const GLOBAL_CHAT_ASSIGNMENT_KEY = 'global_chat_assignment';
const AD_COUNTRY_KEYS = ['photo_video', 'product_promote', 'profile_promote'];
let adminCustomizationTableReady = false;

const ensureAdminCustomizationTable = async () => {
    if (adminCustomizationTableReady) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS admin_customization_settings (
            setting_key VARCHAR(80) PRIMARY KEY,
            setting_value JSONB NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    adminCustomizationTableReady = true;
};

const assertAdmin = async (userId) => {
    const result = await pool.query('SELECT user_type FROM users WHERE id = $1 LIMIT 1', [userId]);
    return String(result.rows[0]?.user_type || '').toLowerCase() === 'admin';
};

const assertAdminOrSuperAdmin = async (userId) => {
    const result = await pool.query('SELECT user_type FROM users WHERE id = $1 LIMIT 1', [userId]);
    const userType = String(result.rows[0]?.user_type || '').toLowerCase();
    return userType === 'admin' || userType === 'superadmin' || userType === 'super_admin';
};

const normalizeCountryList = (value) => {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(
        value
            .map((code) => String(code || '').trim().toUpperCase())
            .filter(Boolean)
    ));
};

const adTypeToCountryKey = (value) => {
    const key = String(value || '').trim().toLowerCase().replace(/-/g, '_');
    if (['photo_video', 'photo_video_ad', 'photo', 'video'].includes(key)) return 'photo_video';
    if (['product_promote', 'product_promote_ad', 'product', 'shop'].includes(key)) return 'product_promote';
    if (['profile_promote', 'profile_promote_ad', 'profile'].includes(key)) return 'profile_promote';
    return null;
};

const normalizeAllowedCountriesPayload = (body = {}, current = null) => {
    const source = body.allowed_countries || body.allowedCountries || body;
    const singleAdTypeKey = adTypeToCountryKey(body.ad_type || body.adType || body.type || body.campaign_type || body.campaignType);
    const singleCountryList = body.countries || body.selected_countries || body.selectedCountries || body.country_codes || body.countryCodes;

    if (singleAdTypeKey && Array.isArray(singleCountryList)) {
        return {
            photo_video: normalizeCountryList(current?.photo_video),
            product_promote: normalizeCountryList(current?.product_promote),
            profile_promote: normalizeCountryList(current?.profile_promote),
            [singleAdTypeKey]: normalizeCountryList(singleCountryList),
        };
    }

    const aliases = {
        photo_video: ['photo_video', 'photoVideo', 'photo_video_ad', 'photo-video'],
        product_promote: ['product_promote', 'productPromote', 'product_promote_ad', 'product-promote'],
        profile_promote: ['profile_promote', 'profilePromote', 'profile_promote_ad', 'profile-promote'],
    };

    return AD_COUNTRY_KEYS.reduce((acc, key) => {
        const match = aliases[key].find((alias) => Object.prototype.hasOwnProperty.call(source, alias));
        acc[key] = normalizeCountryList(match ? source[match] : []);
        return acc;
    }, {});
};

const readLocalAllowedCountries = async () => {
    await ensureAdminCustomizationTable();
    const { rows } = await pool.query(
        'SELECT setting_value FROM admin_customization_settings WHERE setting_key = $1 LIMIT 1',
        [AD_ALLOWED_COUNTRIES_KEY]
    );
    return rows[0]?.setting_value || null;
};

const writeLocalAllowedCountries = async (allowedCountries) => {
    await ensureAdminCustomizationTable();
    const { rows } = await pool.query(`
        INSERT INTO admin_customization_settings (setting_key, setting_value, updated_at)
        VALUES ($1, $2::jsonb, NOW())
        ON CONFLICT (setting_key) DO UPDATE
          SET setting_value = EXCLUDED.setting_value,
              updated_at = NOW()
        RETURNING setting_value, updated_at
    `, [AD_ALLOWED_COUNTRIES_KEY, JSON.stringify(allowedCountries)]);
    return rows[0];
};

const readGlobalChatAssignment = async () => {
    await ensureAdminCustomizationTable();
    const { rows } = await pool.query(
        'SELECT setting_value, updated_at FROM admin_customization_settings WHERE setting_key = $1 LIMIT 1',
        [GLOBAL_CHAT_ASSIGNMENT_KEY]
    );
    return rows[0] || null;
};

const writeGlobalChatAssignment = async (assignedAdminId) => {
    await ensureAdminCustomizationTable();
    const payload = { assigned_admin_id: assignedAdminId == null ? null : Number(assignedAdminId) };
    const { rows } = await pool.query(`
        INSERT INTO admin_customization_settings (setting_key, setting_value, updated_at)
        VALUES ($1, $2::jsonb, NOW())
        ON CONFLICT (setting_key) DO UPDATE
          SET setting_value = EXCLUDED.setting_value,
              updated_at = NOW()
        RETURNING setting_value, updated_at
    `, [GLOBAL_CHAT_ASSIGNMENT_KEY, JSON.stringify(payload)]);
    return rows[0];
};

const fetchRemoteAllowedCountries = async (req) => {
    const headers = {};
    if (req.headers.authorization) headers.Authorization = req.headers.authorization;
    let lastError = null;
    for (const baseUrl of ADMIN_PANEL_URLS) {
        try {
            const r = await fetch(`${baseUrl}/api/admin/customization/ad-allowed-countries`, { headers });
            if (!r.ok) throw new Error(`${baseUrl} returned ${r.status}`);
            return r.json().catch(() => ({}));
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError || new Error('Admin panel unavailable');
};

router.get('/ad-allowed-countries', async (req, res) => {
    try {
        const local = await readLocalAllowedCountries();
        if (local) {
            return res.json({ success: true, allowed_countries: local });
        }

        try {
            const remote = await fetchRemoteAllowedCountries(req);
            if (remote?.allowed_countries && typeof remote.allowed_countries === 'object') {
                const normalized = normalizeAllowedCountriesPayload(remote);
                await writeLocalAllowedCountries(normalized).catch(() => {});
                return res.json({ success: true, allowed_countries: normalized });
            }
        } catch (proxyError) {
            console.warn('[adminCustomization] ad countries proxy unavailable:', proxyError.message);
        }

        return res.json({ success: true, allowed_countries: null });
    } catch (err) {
        console.error('[adminCustomization] get ad countries error:', err);
        return res.status(500).json({ success: false, message: 'Failed to load ad country settings' });
    }
});

const saveAdAllowedCountries = async (req, res) => {
    try {
        if (!await assertAdmin(req.user.id)) {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }

        const current = await readLocalAllowedCountries();
        const allowedCountries = normalizeAllowedCountriesPayload(req.body, current);
        const saved = await writeLocalAllowedCountries(allowedCountries);

        for (const baseUrl of ADMIN_PANEL_URLS) {
            fetch(`${baseUrl}/api/admin/customization/ad-allowed-countries`, {
                method: req.method,
                headers: {
                    'Content-Type': 'application/json',
                    ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}),
                },
                body: JSON.stringify({ allowed_countries: allowedCountries }),
            }).catch(() => {});
        }

        return res.json({
            success: true,
            allowed_countries: saved.setting_value,
            updated_at: saved.updated_at,
        });
    } catch (err) {
        console.error('[adminCustomization] save ad countries error:', err);
        return res.status(500).json({ success: false, message: 'Failed to save ad country settings' });
    }
};

router.post('/ad-allowed-countries', authMiddleware, saveAdAllowedCountries);
router.put('/ad-allowed-countries', authMiddleware, saveAdAllowedCountries);

router.get('/chat-assignment', authMiddleware, async (req, res) => {
    try {
        if (!await assertAdminOrSuperAdmin(req.user.id)) {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }

        const saved = await readGlobalChatAssignment();
        return res.json({
            success: true,
            assignment: saved?.setting_value || { assigned_admin_id: null },
            updated_at: saved?.updated_at || null,
        });
    } catch (err) {
        console.error('[adminCustomization] get chat assignment error:', err);
        return res.status(500).json({ success: false, message: 'Failed to load chat assignment' });
    }
});

router.put('/chat-assignment', authMiddleware, async (req, res) => {
    try {
        if (!await assertAdminOrSuperAdmin(req.user.id)) {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }

        const rawAssignedAdminId = req.body?.assignedAdminId ?? req.body?.assigned_admin_id ?? null;
        const assignedAdminId = rawAssignedAdminId == null || rawAssignedAdminId === ''
            ? null
            : Number(rawAssignedAdminId);

        if (assignedAdminId != null && (!Number.isFinite(assignedAdminId) || assignedAdminId <= 0)) {
            return res.status(400).json({ success: false, message: 'Valid assigned admin is required' });
        }

        const saved = await writeGlobalChatAssignment(assignedAdminId);
        return res.json({
            success: true,
            assignment: saved.setting_value,
            updated_at: saved.updated_at,
        });
    } catch (err) {
        console.error('[adminCustomization] save chat assignment error:', err);
        return res.status(500).json({ success: false, message: 'Failed to save chat assignment' });
    }
});

// ── Reach Settings (legacy flat multipliers) ──────────────────────────────
router.get('/reach-settings/public', reachSettingsController.getReachSettingsPublic);
router.post('/reach-settings', authMiddleware, reachSettingsController.upsertReachSettings);

// ── Reach Tiers (tiered budget→duration→reach rules) ─────────────────────
router.get('/reach-tiers/public', reachTiersController.getReachTiersPublic);
router.get('/reach-tiers', authMiddleware, reachTiersController.getAllReachTiers);
router.post('/reach-tiers', authMiddleware, reachTiersController.createReachTier);
router.put('/reach-tiers/:id', authMiddleware, reachTiersController.updateReachTier);
router.delete('/reach-tiers/:id', authMiddleware, reachTiersController.deleteReachTier);

// ── Promo Codes admin CRUD ────────────────────────────────────────────────
router.get('/promo-codes', authMiddleware, promoCodesController.getAllPromoCodes);
router.post('/promo-codes', authMiddleware, promoCodesController.createPromoCode);
router.put('/promo-codes/:id', authMiddleware, promoCodesController.updatePromoCode);
router.delete('/promo-codes/:id', authMiddleware, promoCodesController.deletePromoCode);

// Ad coin + watch-time settings
router.get('/ad-coin-settings/public', marketController.getAdCoinRewardSettingsPublic);
router.post('/ad-coin-settings', authMiddleware, marketController.upsertAdCoinRewardSettings);

router.get('/referral-commission-settings', authMiddleware, referralCommissionController.getSettings);
router.put('/referral-commission-settings', authMiddleware, referralCommissionController.updateSettings);
router.post('/referral-commission-settings', authMiddleware, referralCommissionController.updateSettings);
router.get('/referral-level-settings', authMiddleware, referralCommissionController.getLevels);
router.post('/referral-level-settings', authMiddleware, referralCommissionController.upsertLevel);
router.put('/referral-level-settings/bulk', authMiddleware, referralCommissionController.bulkUpsertLevels);
router.post('/referral-level-settings/bulk', authMiddleware, referralCommissionController.bulkUpsertLevels);
router.put('/referral-level-settings/:level', authMiddleware, referralCommissionController.upsertLevel);
router.delete('/referral-level-settings/:level', authMiddleware, referralCommissionController.deleteLevel);

// ── Subscription Plans ───────────────────────────────────────────────────
router.get('/subscription-plans/public', subscriptionPlansController.getPublicPlans);
router.get('/upload-control/public', uploadControlController.getPublic);
router.put('/upload-control', authMiddleware, uploadControlController.update);
router.get('/subscription-plans', authMiddleware, subscriptionPlansController.getAllPlans);
router.post('/subscription-plans', authMiddleware, subscriptionPlansController.createPlan);
router.put('/subscription-plans/:id', authMiddleware, subscriptionPlansController.updatePlan);
router.delete('/subscription-plans/:id', authMiddleware, subscriptionPlansController.deletePlan);

module.exports = router;
