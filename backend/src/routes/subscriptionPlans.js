const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/subscriptionPlansController');
const authMiddleware = require('../middleware/auth');
const { createPublicResponseCache } = require('../middleware/publicResponseCache');

router.get(
    '/',
    createPublicResponseCache({
        ttlMs: Number(process.env.PUBLIC_SUBSCRIPTION_PLANS_CACHE_TTL_MS || 10000),
        keyPrefix: 'subscription-plans-public',
    }),
    ctrl.getPublicPlans
);
router.get('/my', authMiddleware, ctrl.getMyPlan);
router.get('/all', authMiddleware, ctrl.getAllPlans);
router.post('/', authMiddleware, ctrl.createPlan);
router.put('/:id', authMiddleware, ctrl.updatePlan);
router.delete('/:id', authMiddleware, ctrl.deletePlan);

module.exports = router;
