let redisLib = null;
let socketAdapterLib = null;
try {
    redisLib = require('redis');
} catch {
    redisLib = null;
}
try {
    socketAdapterLib = require('@socket.io/redis-adapter');
} catch {
    socketAdapterLib = null;
}

let sharedClientPromise = null;

const getRedisUrl = () => (
    process.env.BACKGROUND_REDIS_URL
    || process.env.SOCKET_REDIS_URL
    || process.env.REDIS_URL
    || ''
).trim();

const redisAvailable = () => Boolean(redisLib?.createClient && getRedisUrl());

const getSharedRedisClient = async () => {
    if (!redisAvailable()) return null;
    if (!sharedClientPromise) {
        sharedClientPromise = (async () => {
            const client = redisLib.createClient({ url: getRedisUrl() });
            client.on('error', (error) => console.error('[redis] client error:', error.message));
            await client.connect();
            return client;
        })().catch((error) => {
            sharedClientPromise = null;
            throw error;
        });
    }
    return sharedClientPromise;
};

const publishRedisSignal = async (channel, payload = {}) => {
    const client = await getSharedRedisClient();
    if (!client) return false;
    await client.publish(channel, JSON.stringify(payload));
    return true;
};

const createRedisSubscriber = async (onMessage) => {
    if (!redisAvailable()) return null;
    const client = await getSharedRedisClient();
    if (!client) return null;
    const subscriber = client.duplicate();
    subscriber.on('error', (error) => console.error('[redis] subscriber error:', error.message));
    await subscriber.connect();
    if (typeof onMessage === 'function') {
        subscriber.on('message', onMessage);
    }
    return subscriber;
};

const subscribeRedisChannel = async (channel, onMessage) => {
    const subscriber = await createRedisSubscriber();
    if (!subscriber) return null;
    await subscriber.subscribe(channel, (message) => {
        if (typeof onMessage === 'function') onMessage(message);
    });
    return subscriber;
};

const attachSocketRedisAdapter = async (io) => {
    const createAdapter = socketAdapterLib?.createAdapter;
    if (!io || !createAdapter || !redisAvailable()) return false;

    try {
        const pubClient = await getSharedRedisClient();
        if (!pubClient) return false;
        const subClient = pubClient.duplicate();
        subClient.on('error', (error) => console.error('[redis] socket subscriber error:', error.message));
        await subClient.connect();
        io.adapter(createAdapter(pubClient, subClient));
        console.log('[socket] Redis adapter enabled');
        return true;
    } catch (error) {
        console.error('[socket] Redis adapter disabled:', error.message);
        return false;
    }
};

module.exports = {
    attachSocketRedisAdapter,
    createRedisSubscriber,
    getRedisUrl,
    getSharedRedisClient,
    publishRedisSignal,
    redisAvailable,
    subscribeRedisChannel,
};
