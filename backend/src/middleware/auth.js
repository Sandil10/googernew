const jwt = require('jsonwebtoken');
const { error } = require('../utils/responseHandler');
const pool = require('../config/database');
const { processDueSubscriptionsForUser } = require('../utils/subscriptionRenewal');
const { extractAuthToken, getJwtSecret } = require('../../../../shared/api/authToken');

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
        const token = extractAuthToken(req.header('Authorization'));

        if (!token) {
            return error(res, 'Authentication required. No token provided.', 401);
        }

        const secret = getJwtSecret();

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
        const tokenVersion = decoded.tokenVersion ?? 0;
        if (tokenVersion !== dbTokenVersion) {
            return error(res, 'Session has been invalidated. Please log in again.', 401);
        }

        if (decoded.sessionId) {
            try {
                const sessionResult = await pool.query(
                    `SELECT status, logout_at
                     FROM auth_sessions
                     WHERE id = $1 AND user_id = $2
                     LIMIT 1`,
                    [decoded.sessionId, decoded.id]
                );
                const session = sessionResult.rows[0];
                if (!session || session.status !== 'active' || session.logout_at) {
                    return error(res, 'Session has been invalidated. Please log in again.', 401);
                }
            } catch (sessionError) {
                if (sessionError?.code !== '42P01') {
                    throw sessionError;
                }
            }
        }

        console.log('[AUTH] Token Decoded:', { id: decoded.id, userId: decoded.userId });
        req.user = decoded;

        await processDueSubscriptionsForUser(decoded.id).catch(err => {
            console.error('[AUTH] Plan renewal check failed:', err);
        });

        next();

    } catch (err) {
        console.error('Auth Error:', err.message);
        const message = err.name === 'TokenExpiredError' ? 'Session expired. Please log in again.' : 'Invalid authentication token.';
        return error(res, message, 401);
    }
};

module.exports = authMiddleware;
