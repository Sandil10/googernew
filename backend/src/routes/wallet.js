const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const authMiddleware = require('../middleware/auth');

// All wallet routes require authentication
router.use(authMiddleware);

router.get('/search-users', walletController.searchUsers);
router.post('/request', walletController.initiateTransferRequest);
router.post('/verify-manual-payment-hold', walletController.verifyManualPaymentHold);
router.get('/pending-requests', walletController.getPendingRequests);
router.post('/respond', walletController.respondToRequest);
router.post('/cancel', walletController.cancelTransaction);
router.post('/transfer', walletController.directTransfer);
router.post('/pay-order', walletController.payOrder);
router.post('/pay-profile-promote', walletController.payProfilePromote);
router.post('/record-promo-ad', walletController.recordPromoAd);
router.get('/history', walletController.getTransactionHistory);

module.exports = router;
