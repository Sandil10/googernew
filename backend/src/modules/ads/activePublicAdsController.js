const activePublicAdsService = require('./activePublicAdsService');

const getActiveAdsPublic = async (req, res) => {
    try {
        return res.status(200).json(await activePublicAdsService.getActiveAdsPublic(req, res));
    } catch (error) {
        console.error('Get active public ads error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch active ads' });
    }
};

module.exports = {
    getActiveAdsPublic,
};
