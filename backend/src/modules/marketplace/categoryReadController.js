const categoryReadService = require('./categoryReadService');

const getCategoryTree = async (req, res) => {
    try {
        return res.status(200).json(await categoryReadService.getCategoryTree(req));
    } catch (error) {
        console.error('getCategoryTree error:', error);
        return res.status(500).json({ success: false, message: 'Failed to load categories' });
    }
};

const getAdminCategoryTree = async (req, res) => {
    try {
        return res.status(200).json(await categoryReadService.getAdminCategoryTree(req));
    } catch (error) {
        console.error('getAdminCategoryTree error:', error);
        return res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : 'Failed to load admin categories' });
    }
};

const getGlobalCategoryCommission = async (req, res) => {
    try {
        return res.status(200).json(await categoryReadService.getGlobalCategoryCommission());
    } catch (error) {
        console.error('getGlobalCategoryCommission error:', error);
        return res.status(500).json({ success: false, message: 'Failed to load global category commission' });
    }
};

const getManualCategoryCommissionEnabled = async (req, res) => {
    try {
        return res.status(200).json(await categoryReadService.getManualCategoryCommissionEnabled());
    } catch (error) {
        console.error('getManualCategoryCommissionEnabled error:', error);
        return res.status(500).json({ success: false, message: 'Failed to load manual category commission setting' });
    }
};

module.exports = {
    getAdminCategoryTree,
    getCategoryTree,
    getGlobalCategoryCommission,
    getManualCategoryCommissionEnabled,
};
