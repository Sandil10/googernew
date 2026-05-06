const express = require('express');
const router = express.Router();
const adsController = require('../controllers/adsController');
const authMiddleware = require('../middleware/auth');
const upload = require('../config/upload');

router.get('/active-public', adsController.getActiveAdsPublic);
router.get('/public/:adId', adsController.getAdPublic);

router.use(authMiddleware);

router.get('/my', adsController.getMyAds);
router.get('/all', adsController.getAllAds);
router.get('/:adId', adsController.getMyAdById);
router.post('/', upload.array('images', 5), adsController.createAd);
router.put('/:adId', upload.array('images', 5), adsController.updateAd);

module.exports = router;
