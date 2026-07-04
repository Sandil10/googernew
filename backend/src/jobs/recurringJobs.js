const { getRenewalSweepMs } = require('../utils/subscriptionRenewal');
const { getAdsMaintenanceSweepMs } = require('../controllers/adsController');
const { JOB_TYPES } = require('./jobTypes');

const getRecurringJobs = () => [
    {
        jobType: JOB_TYPES.SUBSCRIPTION_RENEWAL_SWEEP,
        jobKey: JOB_TYPES.SUBSCRIPTION_RENEWAL_SWEEP,
        everyMs: getRenewalSweepMs(),
        maxAttempts: 10,
    },
    {
        jobType: JOB_TYPES.ADS_MAINTENANCE_SWEEP,
        jobKey: JOB_TYPES.ADS_MAINTENANCE_SWEEP,
        everyMs: getAdsMaintenanceSweepMs(),
        maxAttempts: 10,
    },
];

module.exports = {
    getRecurringJobs,
};
