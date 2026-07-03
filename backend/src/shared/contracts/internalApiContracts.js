const INTERNAL_API_OPERATIONS = Object.freeze({
    NOTIFICATIONS_ENQUEUE_FANOUT: 'notifications.enqueueFanout',
    REPORTING_ENQUEUE_GENERATION: 'reporting.enqueueGeneration',
    SUBSCRIPTIONS_ACTIVATE_PLAN: 'subscriptions.activatePlan',
    WALLET_CREATE_TRANSFER: 'wallet.createTransfer',
    WITHDRAWALS_CREATE_REQUEST: 'withdrawals.createRequest',
});

module.exports = {
    INTERNAL_API_OPERATIONS,
};
