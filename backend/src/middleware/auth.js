const jwt = require('jsonwebtoken');
const { error } = require('../utils/responseHandler');
const pool = require('../config/database');

const authMiddleware = (req, res, next) => {
    try {
        const authHeader = req.header('Authorization');
        const token = authHeader?.startsWith('Bearer ')
            ? authHeader.replace('Bearer ', '')
            : authHeader;

        if (!token) {
            return error(res, 'Authentication required. No token provided.', 401);
        }

        const secret = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET;

        if (!secret) {
            console.error('❌ JWT_SECRET is not defined in environment variables');
            return error(res, 'Server configuration error', 500);
        }

        const decoded = jwt.verify(token, secret);
        console.log('[AUTH] Token Decoded:', { id: decoded.id, userId: decoded.userId });
        req.user = decoded;

        // Fire-and-forget plan expiry cleanup
        pool.query(`
            UPDATE user_plan_subscriptions
            SET status = 'expired'
            WHERE status = 'active' AND expires_at < NOW()
        `).catch(err => console.error('[AUTH] Plan expiry check failed:', err));

        next();

    } catch (err) {
        console.error('Auth Error:', err.message);
        const message = err.name === 'TokenExpiredError' ? 'Session expired. Please log in again.' : 'Invalid authentication token.';
        return error(res, message, 401);
    }
};

module.exports = authMiddleware;
