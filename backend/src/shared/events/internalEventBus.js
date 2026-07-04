const { EventEmitter } = require('events');

const bus = new EventEmitter();
bus.setMaxListeners(100);

const publishInternalEvent = (eventName, payload = {}) => {
    bus.emit(eventName, {
        eventName,
        occurredAt: new Date().toISOString(),
        payload,
    });
};

const subscribeInternalEvent = (eventName, handler) => {
    bus.on(eventName, handler);
    return () => bus.off(eventName, handler);
};

module.exports = {
    publishInternalEvent,
    subscribeInternalEvent,
};
