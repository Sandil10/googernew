const express = require('express');
const router = express.Router();
const { validatePromoCode, redeemPromoCode } = require('../controllers/promoCodesController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.post('/validate', validatePromoCode);
router.post('/redeem', redeemPromoCode);

module.exports = router;
