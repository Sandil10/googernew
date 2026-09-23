const express = require('express');
const router = express.Router();
const { walletController } = require('../modules/wallet');
const authMiddleware = require('../middleware/auth');
const { withIdempotency } = require('../shared/idempotency/idempotencyMiddleware');

// All wallet routes require authentication
router.use(authMiddleware);

router.get('/search-users', walletController.searchUsers);
router.post('/request', withIdempotency('wallet.request-transfer'), walletController.initiateTransferRequest);
router.post('/verify-manual-payment-hold', withIdempotency('wallet.verify-manual-payment-hold'), walletController.verifyManualPaymentHold);
router.get('/pending-requests', walletController.getPendingRequests);
router.post('/respond', withIdempotency('wallet.respond-request'), walletController.respondToRequest);
router.post('/cancel', withIdempotency('wallet.cancel-transaction'), walletController.cancelTransaction);
router.post('/transfer', withIdempotency('wallet.direct-transfer'), walletController.directTransfer);
router.post('/pay-order', withIdempotency('wallet.pay-order'), walletController.payOrder);
router.post('/pay-profile-promote', withIdempotency('wallet.pay-profile-promote'), walletController.payProfilePromote);
router.post('/record-promo-ad', withIdempotency('wallet.record-promo-ad'), walletController.recordPromoAd);
router.post('/refund-ad-budget-edit', withIdempotency('wallet.refund-ad-budget-edit'), walletController.refundAdBudgetEdit);
router.post('/admin/add-capital', withIdempotency('wallet.admin-add-capital'), walletController.addAdminCapital);
router.get('/history', walletController.getTransactionHistory);

module.exports = router;
