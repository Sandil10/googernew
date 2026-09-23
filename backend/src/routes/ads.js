const express = require('express');
const router = express.Router();
const { activePublicAdsController, mutationAdsController, readAdsController, reportAdsController, savedAdsController } = require('../modules/ads');
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
    activePublicAdsController.getActiveAdsPublic
);
router.get(
    '/public/:adId',
    createPublicResponseCache({
        ttlMs: Number(process.env.PUBLIC_SINGLE_AD_CACHE_TTL_MS || 5000),
        keyPrefix: 'ads-single-public',
        anonymousOnly: true,
    }),
    readAdsController.getAdPublic
);
router.get('/saved-public/:userId', savedAdsController.getPublicSavedAdsByUser);

router.use(authMiddleware);
router.get('/publish-operations/:operationKey', async (req, res, next) => {
    try {
        const result = await require('../config/database').query(
            'SELECT response FROM ad_publish_operations WHERE user_id=$1 AND operation_key=$2',
            [req.user.id, req.params.operationKey]);
        if (!result.rows.length) return res.status(404).json({ success: false, message: 'Publish operation not completed.' });
        return res.json(result.rows[0].response);
    } catch (error) { next(error); }
});
router.post('/publish', upload.array('images', 5), async (req, res) => {
    try {
        const result = await require('../modules/ads/publishAdService').publishAd(req);
        res.status(result.statusCode || 200).json(result);
    } catch (error) {
        const status = error.statusCode || 500;
        // An unexpected failure here used to be discarded entirely, so every
        // cause looked like the same generic 500 to the client and left no
        // trace at all server-side — a broken media upload was indistinguishable
        // from a database fault.
        if (status >= 500) {
            console.error('Ad publish failed:', error?.name, error?.message, error?.stack);
        }
        res.status(status).json({ success: false, message: status < 500 ? error.message : 'Could not publish ad. Please retry with the same operation.' });
    }
});

router.get('/resolve-link', require('../modules/ads/shareLinkController').resolveShareLink);
router.get('/my', readAdsController.getMyAds);
router.get('/all', readAdsController.getAllAds);
router.get('/saves', savedAdsController.getMySavedAds);
router.get('/saves/ids', savedAdsController.getMySavedAdIds);
router.get('/saves/counts', savedAdsController.getMySavedAdCounts);
router.post('/:adId/save', savedAdsController.toggleAdSave);
router.get('/:adId/analytics', savedAdsController.getAdAnalytics);
router.post('/:adId/report', reportAdsController.submitAdReport);

router.get('/:adId', readAdsController.getMyAdById);
router.post('/', upload.array('images', 5), mutationAdsController.createAd);
router.put('/:adId', upload.array('images', 5), mutationAdsController.updateAd);
router.post('/:adId/reach', readAdsController.updateAdReach);

module.exports = router;
