const socialSubscriptionsService = require('./socialSubscriptionsService');

const getSubscriptionStatus = async (req, res) => {
    try {
        return res.status(200).json(await socialSubscriptionsService.getSubscriptionStatus(req));
    } catch (error) {
        const statusCode = error.statusCode || 500;
        if (statusCode === 400 || statusCode === 404) {
            return res.status(statusCode).json({ success: false, message: error.message });
        }

        console.error('[socialSubscriptions] getSubscriptionStatus error:', error);
        return res.status(500).json({ success: false, message: 'Server error fetching subscription status' });
    }
};

const getFollowingUsers = async (req, res) => {
    try {
        return res.status(200).json(await socialSubscriptionsService.getFollowingUsers(req.params.id));
    } catch (error) {
        const statusCode = error.statusCode || 500;
        if (statusCode === 400) {
            return res.status(statusCode).json({ success: false, message: error.message });
        }

        console.error('[socialSubscriptions] getFollowingUsers error:', error);
        return res.status(500).json({ success: false, message: 'Server error fetching following users' });
    }
};

const getFollowerUsers = async (req, res) => {
    try {
        return res.status(200).json(await socialSubscriptionsService.getFollowerUsers(req.params.id));
    } catch (error) {
        const statusCode = error.statusCode || 500;
        if (statusCode === 400) {
            return res.status(statusCode).json({ success: false, message: error.message });
        }

        console.error('[socialSubscriptions] getFollowerUsers error:', error);
        return res.status(500).json({ success: false, message: 'Server error fetching followers' });
    }
};

const toggleSubscription = async (req, res) => {
    try {
        return res.status(200).json(await socialSubscriptionsService.toggleSubscription(req.user.id, req.params.id));
    } catch (error) {
        const statusCode = error.statusCode || 500;
        if (statusCode === 400 || statusCode === 404) {
            return res.status(statusCode).json({ success: false, message: error.message });
        }

        console.error('[socialSubscriptions] toggleSubscription error:', error);
        return res.status(500).json({ success: false, message: 'Server error updating subscription' });
    }
};

module.exports = {
    getFollowerUsers,
    getFollowingUsers,
    getSubscriptionStatus,
    toggleSubscription,
};
