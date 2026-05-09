const express = require('express');
const router = express.Router();
const marketController = require('../controllers/marketController');
const authenticateToken = require('../middleware/auth');
const upload = require('../config/upload');

// ─── Static / Non-ID Routes (must come FIRST) ───────────────────────────────
// GET lightweight paginated market product cards
router.get('/products', marketController.getMarketProducts);

// GET all market items
router.get('/', marketController.getMarketItems);

// POST create (must be before /:id to avoid "create" being matched as an ID)
router.post('/create', authenticateToken, upload.array('images', 5), marketController.createMarketItem);

// GET public ad by ID
router.get('/public/:id', marketController.getAdPublic);

// GET public product by code
router.get('/product/public/:shareCode', marketController.getProductByCodePublic);
router.get('/product/:shareCode', marketController.getProductByCodePublic);

// Unified share lookup
router.get('/share-unified/:shareCode', marketController.getUnifiedShareItem);

// GET item by product_code (for share links with alphanumeric codes)
router.get('/code/:code', marketController.getMarketItemByCode);

// ─── Specific Sub-Path Routes /:id/* (must come BEFORE generic /:id) ────────
// These MUST be registered before `router.get('/:id', ...)` or Express will
// match /:id first and the sub-paths will return 404.
router.post('/:id/like', authenticateToken, marketController.toggleLike);
router.post('/:id/video-watch-eligible', authenticateToken, marketController.markAdVideoWatchEligible);
router.post('/:id/collect-coin', authenticateToken, marketController.collectAdLikeCoin);
router.post('/collect-coin', authenticateToken, marketController.collectAdLikeCoin);
router.get('/:id/likes', marketController.getLikes);
router.post('/:id/comments', authenticateToken, marketController.addComment);
router.get('/:id/comments', marketController.getComments);
router.delete('/comments/:commentId', authenticateToken, marketController.deleteComment); // Add this
router.post('/:id/share', marketController.logShare);
router.get('/:id/shares', marketController.getShares);
router.post('/:id/view', marketController.logView);
router.get('/:id/views', marketController.getViews);

// ─── Generic /:id Routes (must come LAST) ────────────────────────────────────
router.get('/:id', marketController.getMarketItemById);
router.put('/:id/status', authenticateToken, marketController.updateMarketItemStatus);
router.put('/:id', authenticateToken, upload.array('images', 5), marketController.updateMarketItem);
router.delete('/:id', authenticateToken, marketController.deleteMarketItem);

module.exports = router;
