const { Readable } = require('node:stream');

const HOP_BY_HOP_HEADERS = new Set([
    'connection',
    'content-length',
    'host',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
]);

const matchesPrefix = (requestPath, prefix) => (
    requestPath === prefix
    || requestPath.startsWith(`${prefix}/`)
    || requestPath.startsWith(`${prefix}?`)
);

const shouldExclude = (requestPath, excludedPrefixes = []) => (
    excludedPrefixes.some((prefix) => matchesPrefix(requestPath, prefix))
);

const copyHeaders = (headers) => {
    const forwarded = {};
    Object.entries(headers || {}).forEach(([key, value]) => {
        if (value == null) return;
        if (HOP_BY_HOP_HEADERS.has(String(key).toLowerCase())) return;
        forwarded[key] = value;
    });
    return forwarded;
};

const createRouteServiceProxy = ({
    envVar,
    serviceName,
    excludedPrefixes = [],
} = {}) => async (req, res, next) => {
    const baseUrl = String(process.env[envVar] || '').trim().replace(/\/+$/, '');
    if (!baseUrl) return next();
    if (shouldExclude(req.originalUrl || req.url, excludedPrefixes)) return next();

    try {
        const headers = copyHeaders(req.headers);
        headers['x-forwarded-host'] = req.headers.host || '';
        headers['x-forwarded-proto'] = req.protocol || 'http';
        headers['x-forwarded-for'] = req.ip || '';
        headers['x-googer-proxy-service'] = serviceName;

        const hasBody = !['GET', 'HEAD'].includes(req.method);
        const upstream = await fetch(`${baseUrl}${req.originalUrl}`, {
            method: req.method,
            headers,
            body: hasBody ? req : undefined,
            duplex: hasBody ? 'half' : undefined,
            redirect: 'manual',
        });

        res.status(upstream.status);
        upstream.headers.forEach((value, key) => {
            if (HOP_BY_HOP_HEADERS.has(String(key).toLowerCase())) return;
            res.setHeader(key, value);
        });

        if (!upstream.body) {
            return res.end();
        }

        Readable.fromWeb(upstream.body).pipe(res);
    } catch (error) {
        console.error(`[proxy:${serviceName}]`, error.message);
        next(error);
    }
};

module.exports = {
    createRouteServiceProxy,
};
