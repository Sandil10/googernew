const jwt = require('jsonwebtoken');

const getBearerToken = (req) => {
    const authHeader = req.header?.('Authorization');
    if (!authHeader) return null;
    return authHeader.startsWith('Bearer ') ? authHeader.replace('Bearer ', '') : authHeader;
};

const decodeOptionalUser = (req) => {
    if (req.user?.id || req.user?.userId) {
        return req.user;
    }

    const token = getBearerToken(req);
    if (!token) return null;

    try {
        const secret = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET;
        if (!secret) return null;
        return jwt.verify(token, secret);
    } catch {
        return null;
    }
};

const getOptionalUserId = (req) => {
    const decoded = decodeOptionalUser(req);
    return Number(decoded?.id || decoded?.userId || 0) || null;
};

module.exports = {
    decodeOptionalUser,
    getBearerToken,
    getOptionalUserId,
};
