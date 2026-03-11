const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const authenticateToken = require('../middleware/auth');

router.post('/create', authenticateToken, orderController.createOrder);
router.get('/buyer', authenticateToken, orderController.getBuyerOrders);
router.get('/seller', authenticateToken, orderController.getSellerOrders);
router.put('/:id/status', authenticateToken, orderController.updateOrderStatus);

module.exports = router;
