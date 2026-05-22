const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/subscriptionPlansController');
const authMiddleware = require('../middleware/auth');

router.get('/', ctrl.getPublicPlans);
router.get('/my', authMiddleware, ctrl.getMyPlan);
router.get('/all', authMiddleware, ctrl.getAllPlans);
router.post('/', authMiddleware, ctrl.createPlan);
router.put('/:id', authMiddleware, ctrl.updatePlan);
router.delete('/:id', authMiddleware, ctrl.deletePlan);

module.exports = router;
