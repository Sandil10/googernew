const express = require('express');
const router = express.Router();
const { orderController } = require('../modules/orders');
const authenticateToken = require('../middleware/auth');

router.post('/create', authenticateToken, orderController.createOrder);
router.post('/create-bulk', authenticateToken, orderController.createBulkOrder);
router.get('/badge-counts', authenticateToken, orderController.getOrderBadgeCounts);
router.get('/buyer', authenticateToken, orderController.getBuyerOrders);
router.get('/seller', authenticateToken, orderController.getSellerOrders);
router.put('/:id/status', authenticateToken, orderController.updateOrderStatus);
router.put('/group/:orderNumber/status', authenticateToken, orderController.updateOrderGroupStatus);
router.post('/group/:orderNumber/cancel', authenticateToken, orderController.cancelOrderGroup);
router.post('/:id/report', authenticateToken, orderController.submitOrderReport);

module.exports = router;
