const express = require('express');
const router = express.Router();
const { googEngagementController, googInteractionController, googMutationController, googReadController } = require('../modules/feed');
const authenticateToken = require('../middleware/auth');
const { createPublicResponseCache } = require('../middleware/publicResponseCache');

// Fixed-path routes MUST come before /:id to avoid wildcard capture
router.get(
    '/',
    createPublicResponseCache({
        ttlMs: Number(process.env.PUBLIC_FEED_CACHE_TTL_MS || 15000),
        keyPrefix: 'googs-public-feed',
        anonymousOnly: true,
    }),
    googReadController.getPosts
);
router.get('/public/:id', googReadController.getPostPublic);
router.get('/saved', authenticateToken, googReadController.getSavedGoogs);
router.get('/saved/status', authenticateToken, googReadController.getSavedStatus);
router.get('/user/:userId', googReadController.getUserPosts);
router.delete('/comments/:commentId', authenticateToken, googInteractionController.deleteComment);
router.post('/comments/:commentId/report', authenticateToken, async (req, res) => {
    const pool = require('../config/database');
    try {
        const commentId = Number(req.params.commentId);
        const userId = req.user.id;
        const existing = await pool.query('SELECT 1 FROM goog_comments WHERE id=$1', [commentId]);
        if (!existing.rows.length) return res.status(404).json({ success: false, message: 'Comment not found' });
        const dup = await pool.query('SELECT 1 FROM goog_comment_reports WHERE comment_id=$1 AND user_id=$2', [commentId, userId]).catch(() => ({ rows: [] }));
        if (dup.rows.length) return res.status(400).json({ success: false, message: 'Already reported' });
        await pool.query(`CREATE TABLE IF NOT EXISTS goog_comment_reports (
            id SERIAL PRIMARY KEY,
            comment_id INTEGER REFERENCES goog_comments(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(comment_id, user_id)
        )`);
        await pool.query('INSERT INTO goog_comment_reports (comment_id, user_id) VALUES ($1,$2)', [commentId, userId]);
        await pool.query('UPDATE goog_comments SET reports = COALESCE(reports,0)+1 WHERE id=$1', [commentId]);
        res.status(201).json({ success: true });
    } catch (err) { console.error(err); res.status(500).json({ success: false, message: 'Server error' }); }
});

// Wildcard param routes
router.get('/:id', googReadController.getPostById);
router.post('/', authenticateToken, googMutationController.createPost);
router.put('/:id', authenticateToken, googMutationController.updatePost);
router.delete('/:id', authenticateToken, googMutationController.deletePost);

router.patch('/:id/admin-toggle', authenticateToken, googMutationController.adminTogglePost);
router.post('/:id/like', authenticateToken, googInteractionController.toggleLike);
router.post('/:id/subscribe', authenticateToken, googInteractionController.toggleSubscribe);
router.get('/:id/subscribe', authenticateToken, googInteractionController.checkSubscribe);
router.post('/:id/share', googEngagementController.logShare);
router.post('/:id/view', googEngagementController.logView);
router.post('/:id/report', authenticateToken, googInteractionController.createReport);
router.post('/:id/comments', authenticateToken, googInteractionController.addComment);
router.get('/:id/comments', googInteractionController.getComments);
router.post('/:id/save', authenticateToken, googInteractionController.toggleSave);

router.get('/:id/likes', googEngagementController.getLikes);
router.get('/:id/shares', googEngagementController.getShares);
router.get('/:id/views', googEngagementController.getViews);

module.exports = router;
