const express = require('express');
const router = express.Router();
const marketController = require('../controllers/marketController');
const authenticateToken = require('../middleware/auth');

// Public Routes (GET)
// Note: Depending on logic, users might need to be logged in to see items? The prompt says "shop sellers and users both cna crerate prooducts and sell"
// Usually viewing is public. But creating needs auth.

router.get('/', marketController.getMarketItems);
router.get('/:id', marketController.getMarketItemById);


const upload = require('../config/upload');

// Protected Routes (POST, PUT, DELETE)
// Use upload.single('image') to handle file uploads
router.post('/create', authenticateToken, upload.array('images', 5), marketController.createMarketItem);
router.put('/:id/status', authenticateToken, marketController.updateMarketItemStatus); // Should be admin only ideally
// User delete and update
router.put('/:id', authenticateToken, upload.array('images', 5), marketController.updateMarketItem);
router.delete('/:id', authenticateToken, marketController.deleteMarketItem);

// Like & Comment
router.post('/:id/like', authenticateToken, marketController.toggleLike);
router.post('/:id/comments', authenticateToken, marketController.addComment);
router.get('/:id/comments', marketController.getComments);

module.exports = router;
