const express = require('express');
const router = express.Router();
const reachSettingsController = require('../controllers/reachSettingsController');
const reachTiersController = require('../controllers/reachTiersController');
const promoCodesController = require('../controllers/promoCodesController');
const authMiddleware = require('../middleware/auth');

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

module.exports = router;
