function extractAuthToken(authHeader) {
    return authHeader?.startsWith('Bearer ')
        ? authHeader.replace('Bearer ', '')
        : authHeader;
}

function getJwtSecret(env = process.env) {
    return env.JWT_SECRET || env.SUPABASE_JWT_SECRET;
}

module.exports = {
    extractAuthToken,
    getJwtSecret,
};
