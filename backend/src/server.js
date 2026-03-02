const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const dns = require('dns');
require('dotenv').config();

// Fix for Supabase IPv6 timeout issues (Use IPv4 if available)
if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
}

const app = express();

// Middleware
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));
app.use(cors({
    origin: true, // Allow any origin
    credentials: true
}));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
const authRoutes = require('./routes/auth');
const walletRoutes = require('./routes/wallet');
const marketRoutes = require('./routes/market');

app.use('/api/auth', authRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/market', marketRoutes);

// Fallback mounting for Vercel/Next.js bridge where /api might be stripped
app.use('/auth', authRoutes);
app.use('/wallet', walletRoutes);
app.use('/market', marketRoutes);

// Health check route
app.get('/api/health', async (req, res) => {
    try {
        const dbStatus = await require('./config/database').query('SELECT NOW()');
        res.status(200).json({
            success: true,
            message: 'Googer API is running',
            database: 'Connected',
            timestamp: new Date().toISOString(),
            dbTime: dbStatus.rows[0].now
        });
    } catch (error) {
        console.error("Health Check DB Error:", error);
        res.status(500).json({
            success: false,
            message: 'Googer API is running but Database connection failed',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Debug route to check environment variables (SAFE: Masks secrets)
app.get('/api/debug-env', (req, res) => {
    const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    let dbStatus = 'MISSING';
    if (dbUrl) {
        if (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://')) {
            dbStatus = 'VALID_FORMAT';
        } else if (dbUrl.startsWith('sb_') || dbUrl.startsWith('supa')) {
            dbStatus = 'INVALID_API_KEY_DETECTED';
        } else {
            dbStatus = 'UNKNOWN_FORMAT';
        }
    }
    res.json({
        node_env: process.env.NODE_ENV,
        database_url_status: dbStatus,
        database_url_prefix: dbUrl ? `${dbUrl.substring(0, 15)}...` : 'N/A',
        is_postgres_url_used: !!process.env.POSTGRES_URL,
        jwt_secret_exists: !!process.env.JWT_SECRET,
        port: process.env.PORT
    });
});

// Temporary route to SETUP DATABASE - EXPANDED for Market
app.get('/api/setup-db', async (req, res) => {
    try {
        const pool = require('./config/database');

        // 1. Create users table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(6) UNIQUE NOT NULL,
                username VARCHAR(50) UNIQUE NOT NULL,
                full_name VARCHAR(100) NOT NULL,
                user_type VARCHAR(20) DEFAULT 'user',
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                profile_picture VARCHAR(255) DEFAULT NULL,
                bio TEXT,
                referral_code VARCHAR(50) UNIQUE,
                wallet_balance DECIMAL(15, 2) DEFAULT 1000.00,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await pool.query(`ALTER TABLE users ALTER COLUMN user_id TYPE VARCHAR(6);`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_id ON users(user_id);`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_email ON users(email);`);

        // 2. Create wallet table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS wallet (
                id SERIAL PRIMARY KEY,
                referrer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                referred_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                referred_username VARCHAR(50) NOT NULL,
                referral_link_used VARCHAR(100),
                amount DECIMAL(10, 2) DEFAULT 10.00,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(referrer_id, referred_user_id)
            );
        `);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_wallet_referrer ON wallet(referrer_id);`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_wallet_referred ON wallet(referred_user_id);`);

        // 3. Create market table (The one likely causing 500 on market routes)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS market (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                owner_user_id VARCHAR(10),
                username VARCHAR(100),
                title VARCHAR(255) NOT NULL,
                description TEXT,
                price DECIMAL(15, 2) NOT NULL,
                category VARCHAR(50),
                image_url TEXT,
                status VARCHAR(20) DEFAULT 'reviewing',
                variants JSONB DEFAULT '[]',
                shipping_info JSONB DEFAULT '{}',
                payment_methods JSONB DEFAULT '[]',
                warranty_info JSONB DEFAULT '{}',
                return_policy JSONB DEFAULT '{}',
                delivery_info JSONB DEFAULT '{}',
                commission_info JSONB DEFAULT '{}',
                links_data JSONB DEFAULT '[]',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_market_user ON market(user_id);`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_market_status ON market(status);`);

        // 4. Create market interactions (likes, comments)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS market_likes (
                id SERIAL PRIMARY KEY,
                market_id INTEGER NOT NULL REFERENCES market(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(market_id, user_id)
            );
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS market_comments (
                id SERIAL PRIMARY KEY,
                market_id INTEGER NOT NULL REFERENCES market(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                text TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        res.status(200).json({ success: true, message: 'Database schema setup successfully!' });
    } catch (error) {
        console.error("Setup DB Error:", error);
        res.status(500).json({ success: false, message: 'Failed to setup database.', error: error.message });
    }
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        message: 'Something went wrong!',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

const PORT = process.env.PORT || 5000;

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`🚀 Server is running on port ${PORT}`);
        console.log(`📍 API URL: http://localhost:${PORT}/api`);
        console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
    });
}

module.exports = app;
