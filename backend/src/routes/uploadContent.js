const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const upload = require('../config/upload');
const uploadContentController = require('../controllers/uploadContentController');
const { createPublicResponseCache } = require('../middleware/publicResponseCache');

router.get(
    '/public',
    createPublicResponseCache({
        ttlMs: Number(process.env.PUBLIC_UPLOAD_CONTENT_CACHE_TTL_MS || 5000),
        keyPrefix: 'upload-content-public',
        anonymousOnly: true,
    }),
    uploadContentController.getApprovedUploadContentsPublic
);
router.get(
    '/public/reel/:shareCode',
    createPublicResponseCache({
        ttlMs: Number(process.env.PUBLIC_UPLOAD_CONTENT_CACHE_TTL_MS || 5000),
        keyPrefix: 'upload-content-public-reel',
        anonymousOnly: true,
    }),
    uploadContentController.getApprovedUploadContentPublicByShareCode
);
router.get('/:contentId/likes', uploadContentController.getLikes);
router.get('/:contentId/comments', uploadContentController.getComments);
router.get('/:contentId/shares', uploadContentController.getShares);
router.get('/:contentId/views', uploadContentController.getViews);
router.post('/:contentId/share', uploadContentController.logShare);
router.post('/:contentId/view', uploadContentController.logView);

router.use(authMiddleware);

router.get('/my', uploadContentController.getMyUploadContents);
router.get('/:contentId/insights', uploadContentController.getContentInsights);
router.post('/:contentId/like', uploadContentController.toggleLike);
router.post('/:contentId/repost', uploadContentController.repostContent);
router.delete('/:contentId/repost', uploadContentController.removeRepost);
router.post('/:contentId/pin', uploadContentController.togglePin);
router.post('/:contentId/report', uploadContentController.reportContent);
router.post('/:contentId/purchase', uploadContentController.purchaseVaultContent);
router.post('/:contentId/subscriptions/purchase', uploadContentController.purchaseCreatorSubscription);
router.post('/:contentId/comments', uploadContentController.addComment);
router.delete('/:contentId', uploadContentController.deleteContent);
router.delete('/comments/:commentId', uploadContentController.deleteComment);
router.post('/comments/:commentId/like', uploadContentController.likeComment);
router.post('/comments/:commentId/dislike', uploadContentController.dislikeComment);
router.post('/comments/:commentId/report', uploadContentController.reportComment);
router.get('/admin/all', uploadContentController.getAdminUploadContents);
router.patch('/admin/:contentId/status', uploadContentController.updateUploadContentStatus);
router.post('/', upload.fields([
    { name: 'images', maxCount: 5 },
    { name: 'preview', maxCount: 1 },
]), uploadContentController.createUploadContent);

module.exports = router;
