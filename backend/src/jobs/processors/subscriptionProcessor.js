const { processDueSubscriptions } = require('../../utils/subscriptionRenewal');

const processSubscriptionRenewalSweep = async () => {
    await processDueSubscriptions();
};

module.exports = {
    processSubscriptionRenewalSweep,
};
