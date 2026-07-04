const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { coinRequestController } = require('../modules/coinRequests');

router.post('/', authMiddleware, coinRequestController.createRequest);
router.get('/my', authMiddleware, coinRequestController.getMyRequests);
router.get('/admin', authMiddleware, coinRequestController.getAdminRequests);
router.put('/admin/:id/review', authMiddleware, coinRequestController.reviewRequest);
router.get('/active-topup-methods', coinRequestController.getActiveTopupMethods);

module.exports = router;
