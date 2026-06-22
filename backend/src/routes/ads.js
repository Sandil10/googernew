const express = require('express');
const router = express.Router();
const adsController = require('../controllers/adsController');
const authMiddleware = require('../middleware/auth');
const upload = require('../config/upload');
const { createPublicResponseCache } = require('../middleware/publicResponseCache');

router.get(
    '/active-public',
    createPublicResponseCache({
        ttlMs: Number(process.env.PUBLIC_ACTIVE_ADS_CACHE_TTL_MS || 5000),
        keyPrefix: 'ads-active-public',
        anonymousOnly: true,
    }),
    adsController.getActiveAdsPublic
);
router.get(
    '/public/:adId',
    createPublicResponseCache({
        ttlMs: Number(process.env.PUBLIC_SINGLE_AD_CACHE_TTL_MS || 5000),
        keyPrefix: 'ads-single-public',
        anonymousOnly: true,
    }),
    adsController.getAdPublic
);
router.get('/saved-public/:userId', adsController.getPublicSavedAdsByUser);

router.use(authMiddleware);

router.get('/my', adsController.getMyAds);
router.get('/all', adsController.getAllAds);
router.get('/saves', adsController.getMySavedAds);
router.get('/saves/ids', adsController.getMySavedAdIds);
router.get('/saves/counts', adsController.getMySavedAdCounts);
router.post('/:adId/save', adsController.toggleAdSave);
router.get('/:adId/analytics', adsController.getAdAnalytics);

router.post('/:adId/report', async (req, res) => {
    const pool = require('../config/database');
    try {
        const adId = String(req.params.adId || '').replace(/^ad-/i, '').trim();
        if (!adId) return res.status(400).json({ success: false, message: 'Invalid ad ID' });
        const userId = req.user.id;
        const { reason, custom_reason } = req.body || {};
        if (!reason) return res.status(400).json({ success: false, message: 'Reason required' });

        await pool.query(`
            CREATE TABLE IF NOT EXISTS ad_reports (
                id SERIAL PRIMARY KEY,
                ad_id BIGINT,
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                reason VARCHAR(500) NOT NULL,
                custom_reason TEXT,
                status VARCHAR(20) DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(ad_id, user_id)
            )
        `).catch(() => {});
        await pool.query(`ALTER TABLE ad_reports ALTER COLUMN ad_id TYPE BIGINT`).catch(() => {});

        const existing = await pool.query('SELECT 1 FROM ad_reports WHERE ad_id=$1 AND user_id=$2', [adId, userId]);
        if (existing.rows.length) return res.status(409).json({ success: false, message: 'Already reported' });

        await pool.query(
            'INSERT INTO ad_reports (ad_id, user_id, reason, custom_reason) VALUES ($1,$2,$3,$4)',
            [adId, userId, reason, custom_reason || null]
        );
        res.status(201).json({ success: true, message: 'Report submitted' });
    } catch (err) {
        console.error('[ad report]', err.message);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.get('/:adId', adsController.getMyAdById);
router.post('/', upload.array('images', 5), adsController.createAd);
router.put('/:adId', upload.array('images', 5), adsController.updateAd);
router.post('/:adId/reach', adsController.updateAdReach);

module.exports = router;
