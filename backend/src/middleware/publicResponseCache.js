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

    return function publicResponseCache(req, res, next) {
        if (req.method !== 'GET') return next();
        if (!(ttlMs > 0)) return next();
        if (anonymousOnly && !isAnonymousRequest(req)) return next();

        const cacheKey = `${keyPrefix}:${req.originalUrl}`;
        const now = Date.now();
        const cached = store.get(cacheKey);

        if (cached && cached.expiresAt > now) {
            res.setHeader('X-Response-Cache', 'HIT');
            return res.status(cached.statusCode).json(cached.body);
        }

        const originalJson = res.json.bind(res);
        res.json = (body) => {
            const statusCode = res.statusCode || 200;
            if (statusCode === 200) {
                store.set(cacheKey, {
                    expiresAt: Date.now() + ttlMs,
                    statusCode,
                    body,
                });
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
