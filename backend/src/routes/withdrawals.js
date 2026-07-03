const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { withdrawalController } = require('../modules/withdrawals');
const { withIdempotency } = require('../shared/idempotency/idempotencyMiddleware');

router.get('/payment-methods', withdrawalController.getPaymentMethods);

router.use(authMiddleware);

router.get('/my-requests', withdrawalController.getMyRequests);
router.delete('/cancel/:id', withIdempotency('withdrawals.cancel'), withdrawalController.cancelRequest);
router.post('/request', withIdempotency('withdrawals.request'), withdrawalController.createRequest);

module.exports = router;
