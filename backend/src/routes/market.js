const express = require('express');
const router = express.Router();
const marketController = require('../controllers/marketController');
const { interactionController, mutationController, productReadController, reportController, shareLookupController } = require('../modules/marketplace');
const authenticateToken = require('../middleware/auth');
const upload = require('../config/upload');

const isSponsoredFeedItemId = (value) => typeof value === 'string' && value.startsWith('ad-');
const isSponsoredCommentId = (value) => typeof value === 'string' && value.startsWith('ad-comment-');
const withSponsoredFallback = (marketHandler, sponsoredHandler, resolver = (req) => req.params.id) => async (req, res) => {
    const targetId = resolver(req);
    if (isSponsoredFeedItemId(targetId)) {
        return sponsoredHandler(req, res);
    }
    return marketHandler(req, res);
};

// ─── Static / Non-ID Routes (must come FIRST) ───────────────────────────────
// GET lightweight paginated market product cards
router.get('/products', marketController.getMarketProducts);

// GET all market items
router.get('/', marketController.getMarketItems);

// POST create (must be before /:id to avoid "create" being matched as an ID)
router.post('/create', authenticateToken, upload.array('images', 5), mutationController.createMarketItem);

// GET public ad by ID
router.get('/public/:id', productReadController.getAdPublic);

// GET public product by code
router.get('/product/public/:shareCode', productReadController.getProductByCodePublic);
router.get('/product/:shareCode', productReadController.getProductByCodePublic);

// Unified share lookup
router.get('/share-unified/:shareCode', shareLookupController.getUnifiedShareItem);
router.get('/ad-coin-settings', marketController.getAdCoinRewardSettingsPublic);
router.put('/ad-coin-settings', authenticateToken, marketController.upsertAdCoinRewardSettings);

// GET item by product_code (for share links with alphanumeric codes)
router.get('/code/:code', productReadController.getMarketItemByCode);

// ─── Specific Sub-Path Routes /:id/* (must come BEFORE generic /:id) ────────
// These MUST be registered before `router.get('/:id', ...)` or Express will
// match /:id first and the sub-paths will return 404.
// Report a product/ad
router.post('/:id/report', authenticateToken, reportController.submitReport);

router.post('/:id/like', authenticateToken, withSponsoredFallback(interactionController.toggleLike, marketController.toggleLike));
router.post('/:id/video-watch-eligible', authenticateToken, marketController.markAdVideoWatchEligible);
router.post('/:id/collect-coin', authenticateToken, marketController.collectAdLikeCoin);
router.post('/collect-coin', authenticateToken, marketController.collectAdLikeCoin);
router.get('/:id/likes', withSponsoredFallback(interactionController.getLikes, marketController.getLikes));
router.post('/:id/comments', authenticateToken, withSponsoredFallback(interactionController.addComment, marketController.addComment));
router.get('/:id/comments', withSponsoredFallback(interactionController.getComments, marketController.getComments));
router.delete('/comments/:commentId', authenticateToken, async (req, res) => {
    if (isSponsoredCommentId(req.params.commentId)) {
        return marketController.deleteComment(req, res);
    }
    return interactionController.deleteComment(req, res);
});
router.post('/comments/:commentId/report', authenticateToken, async (req, res) => {
    const pool = require('../config/database');
    try {
        const commentId = Number(req.params.commentId);
        const userId = req.user.id;
        await pool.query('ALTER TABLE market_comments ADD COLUMN IF NOT EXISTS reports INTEGER DEFAULT 0').catch(() => {});
        await pool.query(`
            CREATE TABLE IF NOT EXISTS market_comment_reports (
                id SERIAL PRIMARY KEY,
                comment_id INTEGER REFERENCES market_comments(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(comment_id, user_id)
            )
        `).catch(() => {});
        const existing = await pool.query('SELECT 1 FROM market_comment_reports WHERE comment_id=$1 AND user_id=$2', [commentId, userId]);
        if (existing.rows.length) return res.status(400).json({ success: false, message: 'Already reported' });
        await pool.query('INSERT INTO market_comment_reports (comment_id, user_id) VALUES ($1, $2)', [commentId, userId]);
        await pool.query('UPDATE market_comments SET reports = COALESCE(reports,0)+1 WHERE id=$1', [commentId]);
        res.status(201).json({ success: true });
    } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});
router.post('/:id/share', withSponsoredFallback(interactionController.logShare, marketController.logShare));
router.get('/:id/shares', withSponsoredFallback(interactionController.getShares, marketController.getShares));
router.post('/:id/click', marketController.logAdClick);
router.post('/:id/impression', marketController.logAdImpression);
router.post('/:id/view', withSponsoredFallback(interactionController.logView, marketController.logView));
router.get('/:id/views', withSponsoredFallback(interactionController.getViews, marketController.getViews));

// ─── Generic /:id Routes (must come LAST) ────────────────────────────────────
router.get('/:id', productReadController.getMarketItemById);
router.put('/:id/status', authenticateToken, mutationController.updateMarketItemStatus);
router.put('/:id', authenticateToken, upload.array('images', 5), mutationController.updateMarketItem);
router.delete('/:id', authenticateToken, mutationController.deleteMarketItem);

module.exports = router;
