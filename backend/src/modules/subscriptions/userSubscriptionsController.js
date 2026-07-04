const userSubscriptionsService = require('./userSubscriptionsService');

const getUserId = (req) => req.user?.id || req.user?.userId;

const debugPlan = async (req, res) => {
    try {
        return res.json(await userSubscriptionsService.debugPlan());
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};

const getMySubscription = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
        return res.status(200).json(await userSubscriptionsService.getMySubscription(userId));
    } catch (error) {
        console.error('[userSubscriptions] getMySubscription error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch subscription' });
    }
};

const subscribe = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
        const result = await userSubscriptionsService.subscribe(userId, req.body);
        return res.status(result.statusCode || 201).json(result);
    } catch (error) {
        console.error('[userSubscriptions] subscribe error:', error);
        if (error.statusCode === 402) {
            return res.status(402).json({
                success: false,
                message: error.message,
                balance: error.balance,
                price: error.price,
            });
        }
        return res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : `Failed to subscribe: ${error.message || error.code || 'unknown error'}` });
    }
};

const setAutoRenew = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
        return res.status(200).json(await userSubscriptionsService.setAutoRenew(userId, req.body?.auto_renew));
    } catch (error) {
        console.error('[userSubscriptions] setAutoRenew error:', error);
        return res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : 'Failed to update auto-renew' });
    }
};

const getBadge = async (req, res) => {
    try {
        return res.json(await userSubscriptionsService.getBadge(req.params.userId));
    } catch (error) {
        console.error('[userSubscriptions] getBadge error:', error);
        return res.json({ success: true, badge: null });
    }
};

const getMyUsage = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
        return res.json(await userSubscriptionsService.getMyUsage(userId));
    } catch (error) {
        console.error('[userSubscriptions] getMyUsage error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch usage' });
    }
};

const getMyFeatures = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
        return res.json(await userSubscriptionsService.getMyFeatures(userId));
    } catch (error) {
        console.error('[userSubscriptions] getMyFeatures error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch features' });
    }
};

const cancelSubscription = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
        return res.status(200).json(await userSubscriptionsService.cancelSubscription(userId));
    } catch (error) {
        console.error('[userSubscriptions] cancelSubscription error:', error);
        return res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : 'Failed to cancel subscription' });
    }
};

module.exports = {
    cancelSubscription,
    debugPlan,
    getBadge,
    getMyFeatures,
    getMySubscription,
    getMyUsage,
    setAutoRenew,
    subscribe,
};
