const jwt = require('jsonwebtoken');
const { error } = require('../utils/responseHandler');

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
        req.user = decoded;
        next();

    } catch (err) {
        console.error('Auth Error:', err.message);
        const message = err.name === 'TokenExpiredError' ? 'Session expired. Please log in again.' : 'Invalid authentication token.';
        return error(res, message, 401);
    }
};

module.exports = authMiddleware;
