const mutationAdsRepository = require('./mutationAdsRepository');
const mutationAdsService = require('./mutationAdsService');

const createAd = async (req, res) => {
    try {
        const result = await mutationAdsService.createAd(req);
        return res.status(result.statusCode || 201).json({ success: result.success, ad: result.ad });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        if ([400, 403, 404, 409].includes(statusCode)) {
            return res.status(statusCode).json({ success: false, message: error.message });
        }
        console.error('Create ad error:', error);
        return res.status(500).json({ success: false, message: 'Failed to create ad' });
    }
};

const updateAd = async (req, res) => {
    try {
        const result = await mutationAdsService.updateAd(req);
        return res.status(result.statusCode || 200).json({ success: result.success, ad: result.ad });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        if ([400, 403, 404, 409].includes(statusCode)) {
            return res.status(statusCode).json({ success: false, message: error.message });
        }
        console.error('Update ad error:', error);
        mutationAdsRepository._logError('updateAd', error);
        return res.status(500).json({ success: false, message: 'Failed to update ad' });
    }
};

module.exports = {
    createAd,
    updateAd,
};
