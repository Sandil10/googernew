const googEngagementService = require('./googEngagementService');

const logShare = async (req, res) => {
    try {
        return res.status(200).json(await googEngagementService.logShare(req));
    } catch (error) {
        console.error('Error logging Goog share:', error);
        return res.status(500).json({ success: false, message: 'Server error logging Goog share' });
    }
};

const logView = async (req, res) => {
    try {
        return res.status(200).json(await googEngagementService.logView(req));
    } catch (error) {
        console.error('Error logging Goog view:', error);
        return res.status(500).json({ success: false, message: 'Server error logging Goog view' });
    }
};

const getLikes = async (req, res) => {
    try {
        return res.status(200).json(await googEngagementService.getLikes(req));
    } catch (error) {
        console.error('Error fetching Goog likes:', error);
        return res.status(500).json({ success: false, message: 'Server error fetching Goog likes' });
    }
};

const getShares = async (req, res) => {
    try {
        return res.status(200).json(await googEngagementService.getShares(req));
    } catch (error) {
        console.error('Error fetching Goog shares:', error);
        return res.status(500).json({ success: false, message: 'Server error fetching Goog shares' });
    }
};

const getViews = async (req, res) => {
    try {
        return res.status(200).json(await googEngagementService.getViews(req));
    } catch (error) {
        console.error('Error fetching Goog views:', error);
        return res.status(500).json({ success: false, message: 'Server error fetching Goog views' });
    }
};

module.exports = {
    getLikes,
    getShares,
    getViews,
    logShare,
    logView,
};
