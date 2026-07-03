const express = require('express');
const router = express.Router();
const { userSubscriptionsController: ctrl } = require('../modules/subscriptions');
const authMiddleware = require('../middleware/auth');
const { withIdempotency } = require('../shared/idempotency/idempotencyMiddleware');

router.get('/debug-plan', ctrl.debugPlan);
router.get('/me', authMiddleware, ctrl.getMySubscription);
router.get('/my-usage', authMiddleware, ctrl.getMyUsage);
router.get('/features', authMiddleware, ctrl.getMyFeatures);
router.post('/subscribe', authMiddleware, withIdempotency('subscriptions.subscribe'), ctrl.subscribe);
router.post('/cancel', authMiddleware, withIdempotency('subscriptions.cancel'), ctrl.cancelSubscription);
router.patch('/auto-renew', authMiddleware, withIdempotency('subscriptions.auto-renew'), ctrl.setAutoRenew);
router.get('/badge/:userId', ctrl.getBadge);

module.exports = router;
