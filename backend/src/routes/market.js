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
// Report a product/ad
router.post('/:id/report', authenticateToken, async (req, res) => {
    const pool = require('../config/database');
    try {
        const itemId = parseInt(req.params.id, 10);
        if (!itemId || isNaN(itemId)) return res.status(400).json({ success: false, message: 'Invalid item ID' });
        const userId = req.user.id;
        const { reason, custom_reason } = req.body;
        if (!reason) return res.status(400).json({ success: false, message: 'Reason required' });

        // Ensure table exists without FK so any market/ad ID works
        await pool.query(`
            CREATE TABLE IF NOT EXISTS market_reports (
                id SERIAL PRIMARY KEY,
                market_id INTEGER,
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                reason VARCHAR(500) NOT NULL,
                custom_reason TEXT,
                status VARCHAR(20) DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(market_id, user_id)
            )
        `).catch(() => {});
        await pool.query(`ALTER TABLE market_reports ALTER COLUMN reason TYPE VARCHAR(500)`).catch(() => {});
        await pool.query(`ALTER TABLE market_reports ALTER COLUMN market_id DROP NOT NULL`).catch(() => {});

        const existing = await pool.query('SELECT 1 FROM market_reports WHERE market_id=$1 AND user_id=$2', [itemId, userId]);
        if (existing.rows.length) return res.status(409).json({ success: false, message: 'Already reported' });

        await pool.query(
            'INSERT INTO market_reports (market_id, user_id, reason, custom_reason) VALUES ($1,$2,$3,$4)',
            [itemId, userId, reason, custom_reason || null]
        );
        res.status(201).json({ success: true, message: 'Report submitted' });
    } catch (err) {
        console.error('[market report]', err.message);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.post('/:id/like', authenticateToken, marketController.toggleLike);
router.post('/:id/video-watch-eligible', authenticateToken, marketController.markAdVideoWatchEligible);
router.post('/:id/collect-coin', authenticateToken, marketController.collectAdLikeCoin);
router.post('/collect-coin', authenticateToken, marketController.collectAdLikeCoin);
router.get('/:id/likes', marketController.getLikes);
router.post('/:id/comments', authenticateToken, marketController.addComment);
router.get('/:id/comments', marketController.getComments);
router.delete('/comments/:commentId', authenticateToken, marketController.deleteComment);
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
router.post('/:id/share', marketController.logShare);
router.get('/:id/shares', marketController.getShares);
router.post('/:id/click', marketController.logAdClick);
router.post('/:id/impression', marketController.logAdImpression);
router.post('/:id/view', marketController.logView);
router.get('/:id/views', marketController.getViews);

// ─── Generic /:id Routes (must come LAST) ────────────────────────────────────
router.get('/:id', marketController.getMarketItemById);
router.put('/:id/status', authenticateToken, marketController.updateMarketItemStatus);
router.put('/:id', authenticateToken, upload.array('images', 5), marketController.updateMarketItem);
router.delete('/:id', authenticateToken, marketController.deleteMarketItem);

module.exports = router;
