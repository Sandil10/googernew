const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const authMiddleware = require('../middleware/auth');

// All wallet routes require authentication
router.use(authMiddleware);

router.get('/search-users', walletController.searchUsers);
router.post('/request', walletController.initiateTransferRequest);
router.get('/pending-requests', walletController.getPendingRequests);
router.post('/respond', walletController.respondToRequest);
router.post('/cancel', walletController.cancelTransaction);
router.post('/transfer', walletController.directTransfer);
router.post('/pay-order', walletController.payOrder);
router.get('/history', walletController.getTransactionHistory);

module.exports = router;
