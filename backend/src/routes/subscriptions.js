const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/userSubscriptionsController');
const authMiddleware = require('../middleware/auth');

router.get('/debug-plan', ctrl.debugPlan);
router.get('/me', authMiddleware, ctrl.getMySubscription);
router.get('/my-usage', authMiddleware, ctrl.getMyUsage);
router.get('/features', authMiddleware, ctrl.getMyFeatures);
router.post('/subscribe', authMiddleware, ctrl.subscribe);
router.post('/cancel', authMiddleware, ctrl.cancelSubscription);
router.patch('/auto-renew', authMiddleware, ctrl.setAutoRenew);
router.get('/badge/:userId', ctrl.getBadge);

module.exports = router;
