const { ensureAdsTable, ensureAdEngagementTables } = require('../modules/ads/adsRuntimeRepository');
const pool = require('../config/database');
const { ensureCartSchema } = require('../modules/cart/cartRuntimeRepository');
const { ensureGoogSchema } = require('../modules/feed/googReadRepository');
const { ensureFeedAdEngagementSchema } = require('../modules/feed/homeFeedRepository');
const subscriptionPlansRepository = require('../modules/subscriptions/subscriptionPlansRepository');
const userSubscriptionsRepository = require('../modules/subscriptions/userSubscriptionsRepository');
const { ensureReferralCommissionTables } = require('../utils/referralCommission');

let runtimeBootstrapPromise = null;

const bootstrapRuntimeSchemas = async () => {
    if (runtimeBootstrapPromise) return runtimeBootstrapPromise;

    runtimeBootstrapPromise = (async () => {
        await Promise.all([
            ensureAdsTable(),
            ensureAdEngagementTables(),
            ensureCartSchema(),
            ensureGoogSchema(),
            ensureFeedAdEngagementSchema(),
            subscriptionPlansRepository.ensureTable(),
            userSubscriptionsRepository.ensureTable(),
            ensureReferralCommissionTables(pool),
        ]);
    })();

    try {
        await runtimeBootstrapPromise;
    } finally {
        runtimeBootstrapPromise = null;
    }
};

module.exports = {
    bootstrapRuntimeSchemas,
};
