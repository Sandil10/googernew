const jwt = require('jsonwebtoken');
const { error } = require('../utils/responseHandler');
const pool = require('../config/database');

// Ensure token_version column exists for JWT revocation support
let tokenVersionColumnEnsured = false;
const ensureTokenVersionColumn = async () => {
    if (tokenVersionColumnEnsured) return;
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0`);
    tokenVersionColumnEnsured = true;
};
ensureTokenVersionColumn().catch(err => console.error('[AUTH] token_version setup failed:', err));

const authMiddleware = async (req, res, next) => {
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

        // Verify token_version matches DB — invalidates tokens after password change or forced logout
        const userResult = await pool.query(
            'SELECT token_version FROM users WHERE id = $1 LIMIT 1',
            [decoded.id]
        );
        const dbTokenVersion = userResult.rows[0]?.token_version ?? 0;
        if (decoded.tokenVersion !== dbTokenVersion) {
            return error(res, 'Session has been invalidated. Please log in again.', 401);
        }

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
