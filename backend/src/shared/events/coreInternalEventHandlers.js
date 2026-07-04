const { DOMAIN_EVENTS } = require('../contracts/serviceContracts');
const { subscribeInternalEvent } = require('./internalEventBus');
const { enqueueNotificationFanout, enqueueReportGeneration } = require('../../jobs/queues');
const pool = require('../../config/database');

let handlersRegistered = false;

const ensureCoreInternalEventHandlersRegistered = () => {
    if (handlersRegistered) return;

    subscribeInternalEvent(DOMAIN_EVENTS.SUBSCRIPTION_PURCHASED, async (event) => {
        await enqueueNotificationFanout(pool, {
            event: event.eventName,
            planId: event.payload.planId,
            subscriptionId: event.payload.subscriptionId,
            userId: event.payload.userId,
        }, {
            jobKey: `notify:subscription-purchased:${event.payload.subscriptionId || event.payload.userId}`,
        }).catch((error) => {
            console.error('[events] subscription purchased enqueue failed:', error.message);
        });
    });

    subscribeInternalEvent(DOMAIN_EVENTS.WITHDRAWAL_REQUESTED, async (event) => {
        await enqueueReportGeneration(pool, {
            amount: event.payload.amount,
            event: event.eventName,
            requestId: event.payload.requestId,
            userId: event.payload.userId,
        }, {
            jobKey: `report:withdrawal-requested:${event.payload.requestId || event.payload.userId}`,
        }).catch((error) => {
            console.error('[events] withdrawal requested enqueue failed:', error.message);
        });
    });

    handlersRegistered = true;
};

module.exports = {
    ensureCoreInternalEventHandlersRegistered,
};
