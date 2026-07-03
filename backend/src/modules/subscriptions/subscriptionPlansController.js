const subscriptionPlansService = require('./subscriptionPlansService');

const getMyPlan = async (req, res) => {
    try {
        const userId = req.user?.id || req.user?.userId;
        if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
        return res.json(await subscriptionPlansService.getMyPlan(userId));
    } catch (error) {
        console.error('[subscriptionPlans] getMyPlan error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch plan' });
    }
};

const getPublicPlans = async (req, res) => {
    try {
        return res.status(200).json(await subscriptionPlansService.getPublicPlans());
    } catch (error) {
        console.error('[subscriptionPlans] getPublicPlans error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch subscription plans' });
    }
};

const getAllPlans = async (req, res) => {
    try {
        return res.status(200).json(await subscriptionPlansService.getAllPlans());
    } catch (error) {
        console.error('[subscriptionPlans] getAllPlans error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch subscription plans' });
    }
};

const createPlan = async (req, res) => {
    try {
        const result = await subscriptionPlansService.createPlan(req.body);
        return res.status(201).json(result);
    } catch (error) {
        console.error('[subscriptionPlans] createPlan error:', error);
        if (error.code === '23505') {
            return res.status(409).json({ success: false, message: 'A plan with this slug already exists' });
        }
        return res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : 'Failed to create plan' });
    }
};

const updatePlan = async (req, res) => {
    try {
        return res.status(200).json(await subscriptionPlansService.updatePlan(req.params.id, req.body));
    } catch (error) {
        console.error('[subscriptionPlans] updatePlan error:', error);
        return res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : 'Failed to update plan' });
    }
};

const deletePlan = async (req, res) => {
    try {
        return res.status(200).json(await subscriptionPlansService.deletePlan(req.params.id));
    } catch (error) {
        console.error('[subscriptionPlans] deletePlan error:', error);
        return res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : 'Failed to delete plan' });
    }
};

module.exports = {
    createPlan,
    deletePlan,
    getAllPlans,
    getMyPlan,
    getPublicPlans,
    updatePlan,
};
