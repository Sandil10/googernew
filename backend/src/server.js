const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const dns = require('dns');
const path = require('path');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Fix for Supabase IPv6 timeout issues
if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
}

const app = express();
app.set('trust proxy', 1);

// Security Middleware
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

// CORS Configuration
const corsOptions = {
    origin: process.env.NODE_ENV === 'production' 
        ? [process.env.WEB_URL, process.env.MOBILE_URL].filter(Boolean) 
        : true,
    credentials: true,
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Rate Limiting - Relaxed for complex interactions and development
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.NODE_ENV === 'development' ? 10000 : 5000, // Higher limit for development
    message: { success: false, message: 'Too many requests, please try again later.' },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});
app.use('/api/', limiter);

// Logging
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Body Parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static(path.resolve(__dirname, '../../public/uploads'), {
    maxAge: '30d',
    immutable: true,
}));

// Route Imports
const authRoutes = require('./routes/auth');
const walletRoutes = require('./routes/wallet');
const adsRoutes = require('./routes/ads');
const marketRoutes = require('./routes/market');
const orderRoutes = require('./routes/order');
const chatRoutes = require('./routes/chat');
const cartRoutes = require('./routes/cart');
const googRoutes = require('./routes/googs');
const feedRoutes = require('./routes/feed');

// API Versioning & Routing (Compatible with existing web app)
const apiRoutes = express.Router();

apiRoutes.use('/auth', authRoutes);
apiRoutes.use('/wallet', walletRoutes);
apiRoutes.use('/ads', adsRoutes);
apiRoutes.use('/market', marketRoutes);
apiRoutes.use('/googs', googRoutes);
apiRoutes.use('/orders', orderRoutes);
apiRoutes.use('/chat', chatRoutes);
apiRoutes.use('/cart', cartRoutes);
apiRoutes.use('/feed', feedRoutes);

// Mount API routes
app.use('/api', apiRoutes);

// Fallback mounting for legacy support/Vercel bridge (kept for full compatibility)
app.use('/auth', authRoutes);
app.use('/wallet', walletRoutes);
app.use('/ads', adsRoutes);
app.use('/market', marketRoutes);
app.use('/googs', googRoutes);
app.use('/orders', orderRoutes);
app.use('/chat', chatRoutes);
app.use('/cart', cartRoutes);
app.use('/feed', feedRoutes);

app.get('/api/test', (req, res) => {
    res.json({ success: true, message: 'New routes are live' });
});

// Health check route
app.get('/api/health', async (req, res) => {
    try {
        const dbStatus = await require('./config/database').query('SELECT NOW()');
        res.status(200).json({
            success: true,
            message: 'Googer API is optimized and running',
            environment: process.env.NODE_ENV,
            database: 'Connected',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Googer API running but Database connection failed',
            error: error.message
        });
    }
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ success: false, message: 'API route not found' });
});

// Enhanced Global Error Handler
app.use((err, req, res, next) => {
    console.error(`Error [${err.name}]: ${err.message}\nStack: ${err.stack}`);

    const statusCode = err.statusCode || 500;
    const message = err.message || 'Something went wrong on the server';

    res.status(statusCode).json({
        success: false,
        message,
        error: process.env.NODE_ENV === 'development' ? err : {},
        timestamp: new Date().toISOString()
    });
});

const PORT = process.env.PORT || 5000;

if (require.main === module) {
    const server = app.listen(PORT, () => {
        console.log(`
        🚀 Googer Backend Enhanced
        -------------------------
        📍 Local Access: http://localhost:${PORT}
        📍 API Access:   http://localhost:${PORT}/api
        📍 Health Check: http://localhost:${PORT}/api/health
        🛡️  Security:     Helmet, Rate Limiter Active
        -------------------------
        `);
    });

    // Handle Graceful Shutdown
    process.on('SIGTERM', () => {
        console.log('SIGTERM signal received: closing HTTP server');
        server.close(() => {
            console.log('HTTP server closed');
        });
    });
}

module.exports = app;
