const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cartController');
const authenticateToken = require('../middleware/auth');

router.get('/', authenticateToken, cartController.getCart);
router.post('/items', authenticateToken, cartController.addCartItem);
router.put('/items/:id', authenticateToken, cartController.updateCartItem);
router.delete('/items/:id', authenticateToken, cartController.deleteCartItem);
router.delete('/', authenticateToken, cartController.clearCart);

module.exports = router;
