const { syncExpiredAds } = require('../../utils/adDelivery');
const {
    ensureAdsTable,
    syncAdsReachCaps,
} = require('../../controllers/adsController');

const ensureAdsProcessorDependencies = async () => {
    await ensureAdsTable();
};

const processAdsMaintenanceSweep = async ({ pool }) => {
    await syncExpiredAds(pool);
    await syncAdsReachCaps();
};

module.exports = {
    ensureAdsProcessorDependencies,
    processAdsMaintenanceSweep,
};
