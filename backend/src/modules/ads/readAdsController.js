const readAdsService = require('./readAdsService');

const handleError = (res, error, context, defaultMessage) => {
    const statusCode = error.statusCode || 500;
    if ([400, 403, 404].includes(statusCode)) {
        return res.status(statusCode).json({ success: false, message: error.message });
    }

    console.error(`[adsRead] ${context} error:`, error);
    return res.status(500).json({ success: false, message: defaultMessage });
};

const getMyAds = async (req, res) => {
    try {
        return res.status(200).json(await readAdsService.getMyAds(req.user.id));
    } catch (error) {
        return handleError(res, error, 'getMyAds', 'Failed to fetch ads');
    }
};

const getMyAdById = async (req, res) => {
    try {
        return res.status(200).json(await readAdsService.getMyAdById(req.params.adId, req.user.id));
    } catch (error) {
        return handleError(res, error, 'getMyAdById', 'Failed to fetch ad');
    }
};

const getAllAds = async (req, res) => {
    try {
        return res.status(200).json(await readAdsService.getAllAds(req.user.id, req.query));
    } catch (error) {
        return handleError(res, error, 'getAllAds', 'Failed to fetch ads');
    }
};

const getAdPublic = async (req, res) => {
    try {
        return res.status(200).json(await readAdsService.getAdPublic(req.params.adId));
    } catch (error) {
        return handleError(res, error, 'getAdPublic', 'Failed to fetch ad');
    }
};

const updateAdReach = async (req, res) => {
    try {
        return res.status(200).json(await readAdsService.updateAdReach(req.params.adId, req.body?.reach));
    } catch (error) {
        return handleError(res, error, 'updateAdReach', 'Failed to update ad reach');
    }
};

module.exports = {
    getAdPublic,
    getAllAds,
    getMyAdById,
    getMyAds,
    updateAdReach,
};
