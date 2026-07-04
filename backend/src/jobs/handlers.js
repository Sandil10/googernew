const {
    ensureAdsProcessorDependencies,
    processAdsMaintenanceSweep,
    processMediaCompressionRequested,
    processNotificationFanoutRequested,
    processReportGenerationRequested,
    processSubscriptionRenewalSweep,
} = require('./processors');
const { JOB_TYPES } = require('./jobTypes');

const createBackgroundJobHandlers = ({ pool }) => ({
    [JOB_TYPES.SUBSCRIPTION_RENEWAL_SWEEP]: () => processSubscriptionRenewalSweep(),
    [JOB_TYPES.ADS_MAINTENANCE_SWEEP]: () => processAdsMaintenanceSweep({ pool }),
    [JOB_TYPES.MEDIA_COMPRESSION_REQUESTED]: (job) => processMediaCompressionRequested({ job }),
    [JOB_TYPES.NOTIFICATION_FANOUT_REQUESTED]: (job) => processNotificationFanoutRequested({ job }),
    [JOB_TYPES.REPORT_GENERATION_REQUESTED]: (job) => processReportGenerationRequested({ job }),
});

const ensureBackgroundJobDependencies = async () => {
    await ensureAdsProcessorDependencies();
};

module.exports = {
    createBackgroundJobHandlers,
    ensureBackgroundJobDependencies,
};
