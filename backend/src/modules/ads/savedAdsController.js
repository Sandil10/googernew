const savedAdsService = require('./savedAdsService');

const handleError = (res, error, context, defaultMessage) => {
    const statusCode = error.statusCode || 500;
    if (error.payload) {
        return res.status(statusCode).json(error.payload);
    }
    if ([400, 401, 403, 404].includes(statusCode)) {
        return res.status(statusCode).json({ success: false, message: error.message });
    }

    console.error(`[adsSaved] ${context} error:`, error);
    return res.status(500).json({ success: false, message: defaultMessage });
};

const getAdAnalytics = async (req, res) => {
    try {
        return res.status(200).json(await savedAdsService.getAdAnalytics(req.params.adId, req.user.id));
    } catch (error) {
        return handleError(res, error, 'getAdAnalytics', 'Failed to fetch analytics');
    }
};

const toggleAdSave = async (req, res) => {
    try {
        return res.json(await savedAdsService.toggleAdSave(req.params.adId, req.user?.id || req.user?.userId));
    } catch (error) {
        return handleError(res, error, 'toggleAdSave', 'Failed to save ad');
    }
};

const getMySavedAdIds = async (req, res) => {
    try {
        return res.json(await savedAdsService.getMySavedAdIds(req.user?.id || req.user?.userId));
    } catch (error) {
        console.error('[ads] getMySavedAdIds error:', error);
        return res.json({ success: true, savedAdIds: [] });
    }
};

const getMySavedAds = async (req, res) => {
    try {
        return res.json(await savedAdsService.getMySavedAds(req.user?.id || req.user?.userId));
    } catch (error) {
        return handleError(res, error, 'getMySavedAds', 'Failed to fetch saved ads');
    }
};

const getPublicSavedAdsByUser = async (req, res) => {
    try {
        return res.json(await savedAdsService.getPublicSavedAdsByUser(req.params.userId));
    } catch (error) {
        return handleError(res, error, 'getPublicSavedAdsByUser', 'Failed to fetch public saved ads');
    }
};

const getMySavedAdCounts = async (req, res) => {
    try {
        return res.json(await savedAdsService.getMySavedAdCounts(req.user?.id || req.user?.userId));
    } catch (error) {
        return handleError(res, error, 'getMySavedAdCounts', 'Failed to fetch counts');
    }
};

module.exports = {
    getAdAnalytics,
    getMySavedAdCounts,
    getMySavedAdIds,
    getMySavedAds,
    getPublicSavedAdsByUser,
    toggleAdSave,
};
