const categoryReadRepository = require('./categoryReadRepository');

const assertAdmin = async (userId) => {
    const userType = await categoryReadRepository.getUserType(userId);
    return userType === 'admin';
};

const getCategoryTree = async (req) => {
    const includeInactive = String(req.query.includeInactive || '').toLowerCase() === '1'
        || String(req.query.includeInactive || '').toLowerCase() === 'true';
    const categories = await categoryReadRepository.getManagedCategories(includeInactive);
    return { categories, success: true };
};

const getAdminCategoryTree = async (req) => {
    const isAdmin = await assertAdmin(req.user?.id);
    if (!isAdmin) {
        const error = new Error('Admin access required');
        error.statusCode = 403;
        throw error;
    }

    const categories = await categoryReadRepository.getManagedCategories(true);
    return { categories, success: true };
};

const getGlobalCategoryCommission = async () => {
    const commissionPercentage = await categoryReadRepository.getGlobalCategoryCommissionValue();
    return {
        commissionPercentage,
        settingKey: categoryReadRepository.GLOBAL_CATEGORY_COMMISSION_KEY,
        success: true,
    };
};

const getManualCategoryCommissionEnabled = async () => {
    const enabled = await categoryReadRepository.getManualCategoryCommissionEnabledValue();
    return {
        enabled,
        settingKey: categoryReadRepository.MANUAL_CATEGORY_COMMISSION_ENABLED_KEY,
        success: true,
    };
};

module.exports = {
    getAdminCategoryTree,
    getCategoryTree,
    getGlobalCategoryCommission,
    getManualCategoryCommissionEnabled,
};
