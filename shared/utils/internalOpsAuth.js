function getConfiguredTokens() {
    return [
        process.env.INTERNAL_SERVICE_TOKEN,
        process.env.MAIN_APP_INTERNAL_TOKEN,
        process.env.GOOGER_INTERNAL_SERVICE_TOKEN,
        process.env.OPS_MONITOR_TOKEN,
    ]
        .flatMap((value) => String(value || '').split(','))
        .map((value) => value.trim())
        .filter(Boolean);
}

function extractToken(req) {
    const directHeader = req.get('x-internal-service-token')
        || req.get('x-googer-service-token')
        || req.get('x-ops-monitor-token');
    if (directHeader) return directHeader.trim();

    const authHeader = req.get('authorization') || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : null;
}

module.exports = function internalOpsAuth(req, res, next) {
    const configuredTokens = getConfiguredTokens();
    const providedToken = extractToken(req);

    if (providedToken && configuredTokens.includes(providedToken)) {
        return next();
    }

    return res.status(401).json({
        success: false,
        message: 'Unauthorized monitoring request',
    });
};
