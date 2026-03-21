const express = require('express');
const router = express.Router();
const marketController = require('../controllers/marketController');
const authenticateToken = require('../middleware/auth');
const upload = require('../config/upload');

// ─── Static / Non-ID Routes (must come FIRST) ───────────────────────────────
// GET all market items
router.get('/', marketController.getMarketItems);

// POST create (must be before /:id to avoid "create" being matched as an ID)
router.post('/create', authenticateToken, upload.array('images', 5), marketController.createMarketItem);

// ─── Specific Sub-Path Routes /:id/* (must come BEFORE generic /:id) ────────
// These MUST be registered before `router.get('/:id', ...)` or Express will
// match /:id first and the sub-paths will return 404.
router.post('/:id/like',     authenticateToken, marketController.toggleLike);
router.get('/:id/likes',     marketController.getLikes);
router.post('/:id/comments', authenticateToken, marketController.addComment);
router.get('/:id/comments',  marketController.getComments);
router.post('/:id/share',    marketController.logShare);
router.get('/:id/shares',    marketController.getShares);
router.post('/:id/view',     marketController.logView);
router.get('/:id/views',     marketController.getViews);

// ─── Generic /:id Routes (must come LAST) ────────────────────────────────────
router.get('/:id',    marketController.getMarketItemById);
router.put('/:id/status', authenticateToken, marketController.updateMarketItemStatus);
router.put('/:id',    authenticateToken, upload.array('images', 5), marketController.updateMarketItem);
router.delete('/:id', authenticateToken, marketController.deleteMarketItem);

module.exports = router;
