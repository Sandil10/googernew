const express = require('express');
const router = express.Router();
const googController = require('../controllers/googController');
const authenticateToken = require('../middleware/auth');

router.get('/', googController.getPosts);
router.get('/public/:id', googController.getPostPublic);
router.get('/:id', googController.getPostById);
router.post('/', authenticateToken, googController.createPost);
router.put('/:id', authenticateToken, googController.updatePost);
router.delete('/:id', authenticateToken, googController.deletePost);

router.post('/:id/like', authenticateToken, googController.toggleLike);
router.post('/:id/subscribe', authenticateToken, googController.toggleSubscribe);
router.get('/:id/subscribe', authenticateToken, googController.checkSubscribe);
router.post('/:id/share', googController.logShare);
router.post('/:id/report', authenticateToken, googController.createReport);
router.post('/:id/comments', authenticateToken, googController.addComment);
router.get('/:id/comments', googController.getComments);
router.delete('/comments/:commentId', authenticateToken, googController.deleteComment);

router.get('/:id/likes', googController.getLikes);
router.get('/:id/shares', googController.getShares);
router.get('/:id/views', googController.getViews);

router.get('/user/:userId', googController.getUserPosts);
module.exports = router;
