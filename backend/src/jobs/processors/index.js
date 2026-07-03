const {
    ensureAdsProcessorDependencies,
    processAdsMaintenanceSweep,
} = require('./adsProcessor');
const { processMediaCompressionRequested } = require('./mediaProcessor');
const { processNotificationFanoutRequested } = require('./notificationProcessor');
const { processReportGenerationRequested } = require('./reportProcessor');
const { processSubscriptionRenewalSweep } = require('./subscriptionProcessor');

module.exports = {
    ensureAdsProcessorDependencies,
    processAdsMaintenanceSweep,
    processMediaCompressionRequested,
    processNotificationFanoutRequested,
    processReportGenerationRequested,
    processSubscriptionRenewalSweep,
};
