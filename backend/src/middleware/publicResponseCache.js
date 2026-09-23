const { getSharedRedisClient, redisAvailable } = require('../shared/redis/runtime');

// Shared response cache for public GET routes.
// Uses Redis when available so all cluster workers and containers share hits;
// falls back to a per-process in-memory Map when Redis is unreachable.
function createPublicResponseCache(options = {}) {
    const {
        ttlMs = 5000,
        keyPrefix = 'public-cache',
        anonymousOnly = false,
    } = options;

    const store = new Map();

    const isAnonymousRequest = (req) => {
        const authHeader = req.get('authorization');
        return !req.user && !authHeader;
    };

    const readRedis = async (cacheKey) => {
        if (!redisAvailable()) return null;
        try {
            const client = await getSharedRedisClient();
            if (!client) return null;
            const raw = await client.get(cacheKey);
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    };

    const writeRedis = async (cacheKey, entry) => {
        if (!redisAvailable()) return false;
        try {
            const client = await getSharedRedisClient();
            if (!client) return false;
            await client.set(cacheKey, JSON.stringify(entry), { PX: ttlMs });
            return true;
        } catch {
            return false;
        }
    };

    return async function publicResponseCache(req, res, next) {
        if (req.method !== 'GET') return next();
        if (!(ttlMs > 0)) return next();
        if (anonymousOnly && !isAnonymousRequest(req)) return next();

        const cacheKey = `${keyPrefix}:${req.originalUrl}`;
        const now = Date.now();

        const redisEntry = await readRedis(cacheKey);
        if (redisEntry) {
            res.setHeader('X-Response-Cache', 'HIT-REDIS');
            return res.status(redisEntry.statusCode).json(redisEntry.body);
        }

        const cached = store.get(cacheKey);
        if (cached && cached.expiresAt > now) {
            res.setHeader('X-Response-Cache', 'HIT');
            return res.status(cached.statusCode).json(cached.body);
        }

        const originalJson = res.json.bind(res);
        res.json = (body) => {
            const statusCode = res.statusCode || 200;
            if (statusCode === 200) {
                const entry = { statusCode, body };
                store.set(cacheKey, { ...entry, expiresAt: Date.now() + ttlMs });
                writeRedis(cacheKey, entry); // fire-and-forget; memory copy already covers this worker
                res.setHeader('X-Response-Cache', 'MISS');
            }
            return originalJson(body);
        };

        return next();
    };
}

module.exports = {
    createPublicResponseCache,
};
