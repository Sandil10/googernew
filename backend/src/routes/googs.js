const express = require('express');
const router = express.Router();
const googController = require('../controllers/googController');
const authenticateToken = require('../middleware/auth');

// Fixed-path routes MUST come before /:id to avoid wildcard capture
router.get('/', googController.getPosts);
router.get('/public/:id', googController.getPostPublic);
router.get('/saved', authenticateToken, googController.getSavedGoogs);
router.get('/saved/status', authenticateToken, googController.getSavedStatus);
router.get('/user/:userId', googController.getUserPosts);
router.delete('/comments/:commentId', authenticateToken, googController.deleteComment);
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
router.get('/:id', googController.getPostById);
router.post('/', authenticateToken, googController.createPost);
router.put('/:id', authenticateToken, googController.updatePost);
router.delete('/:id', authenticateToken, googController.deletePost);

router.patch('/:id/admin-toggle', authenticateToken, googController.adminTogglePost);
router.post('/:id/like', authenticateToken, googController.toggleLike);
router.post('/:id/subscribe', authenticateToken, googController.toggleSubscribe);
router.get('/:id/subscribe', authenticateToken, googController.checkSubscribe);
router.post('/:id/share', googController.logShare);
router.post('/:id/view', googController.logView);
router.post('/:id/report', authenticateToken, googController.createReport);
router.post('/:id/comments', authenticateToken, googController.addComment);
router.get('/:id/comments', googController.getComments);
router.post('/:id/save', authenticateToken, googController.toggleSave);

router.get('/:id/likes', googController.getLikes);
router.get('/:id/shares', googController.getShares);
router.get('/:id/views', googController.getViews);

module.exports = router;
