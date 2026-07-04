const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { withdrawalController } = require('../modules/withdrawals');
const { withIdempotency } = require('../shared/idempotency/idempotencyMiddleware');

router.get('/exchange-rates', withdrawalController.getExchangeRates);
router.get('/settings', withdrawalController.getSettings);
router.put('/settings', authMiddleware, withdrawalController.updateSettings);
router.get('/requests', authMiddleware, withdrawalController.getAdminRequests);
router.put('/requests/:id/review', authMiddleware, withIdempotency('withdrawals.admin-review'), withdrawalController.reviewRequest);

module.exports = router;
