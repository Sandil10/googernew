const { adIsWithinDeliveryRules } = require('../../utils/adDelivery');
const readAdsRepository = require('./readAdsRepository');

const getMyAds = async (userId) => {
    await readAdsRepository.ensureAdsTable();
    await readAdsRepository.ensureAdSavesSchema();
    await readAdsRepository.ensureAdEngagementTables();
    await readAdsRepository.syncExpiredAds(require('../../config/database'));
    await readAdsRepository.syncAdsReachCaps();

    const rows = await readAdsRepository.listMyAds(userId);
    return { success: true, ads: rows.map(readAdsRepository.savedAdsRepository.mapRow) };
};

const getMyAdById = async (adId, userId) => {
    await readAdsRepository.ensureAdsTable();
    await readAdsRepository.syncExpiredAds(require('../../config/database'), adId);
    await readAdsRepository.syncAdsReachCaps(adId);

    const row = await readAdsRepository.findMyAdById(adId, userId);
    if (!row) {
        const error = new Error('Ad not found');
        error.statusCode = 404;
        throw error;
    }

    return { success: true, ad: readAdsRepository.savedAdsRepository.mapRow(row) };
};

const getAllAds = async (userId, query) => {
    await readAdsRepository.ensureAdsTable();
    await readAdsRepository.syncExpiredAds(require('../../config/database'));
    await readAdsRepository.syncAdsReachCaps();

    const isAdmin = await readAdsRepository.assertAdmin(userId);
    if (!isAdmin) {
        const error = new Error('Admin access required');
        error.statusCode = 403;
        throw error;
    }

    const includeAll = String(query.include_all || query.includeAll || '').toLowerCase() === 'true';
    const rows = await readAdsRepository.listAllAds(includeAll);
    return { success: true, ads: rows.map(readAdsRepository.savedAdsRepository.mapRow) };
};

const getAdPublic = async (adId) => {
    await readAdsRepository.ensureAdsTable();

    const row = await readAdsRepository.findPublicAdById(adId);
    if (!row || !adIsWithinDeliveryRules(row)) {
        const error = new Error('Ad not found');
        error.statusCode = 404;
        throw error;
    }

    return { success: true, ad: readAdsRepository.savedAdsRepository.mapRow(row) };
};

const updateAdReach = async (adId, reach) => {
    await readAdsRepository.ensureAdsTable();
    if (typeof reach !== 'number' || reach < 0) {
        const error = new Error('reach must be a non-negative number');
        error.statusCode = 400;
        throw error;
    }

    const ad = await readAdsRepository.updateAdReach(adId, reach);
    if (!ad) {
        const error = new Error('Ad not found');
        error.statusCode = 404;
        throw error;
    }

    return { success: true };
};

module.exports = {
    getAdPublic,
    getAllAds,
    getMyAdById,
    getMyAds,
    updateAdReach,
};
