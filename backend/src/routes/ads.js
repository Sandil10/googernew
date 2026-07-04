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
