const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const dns = require('dns');
const path = require('path');
const http = require('http');
const { ipKeyGenerator, rateLimit } = require('express-rate-limit');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config();
const pool = require('./config/database');
const { createRouteServiceProxy } = require('./shared/http/routeServiceProxy');
const { assertFinanceSchemaReady } = require('../../../shared/utils/financeSchemaGuard');
const { ensureAdminWalletGuard } = require('./utils/adminWalletGuard');
const { attachChatSocket } = require('./modules/chat');
const { mountPublicUploads } = require('./modules/media');
const { bootstrapRuntimeSchemas } = require('./startup');
const internalOpsAuth = require('../../../shared/utils/internalOpsAuth');
const { getBackgroundQueueMetrics, getBackgroundWorkerMetrics } = require('../../../shared/utils/backgroundMonitoring');

// Fix for Supabase IPv6 timeout issues
if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
}

const app = express();
app.set('trust proxy', 1);

const skipOperationalHealth = (req) => (
    req.path === '/health'
    || req.path === '/ops/health'
    || req.path === '/ops/metrics'
);

const getRawClientIp = (req) => {
    const cloudflareIp = req.headers['cf-connecting-ip'];
    if (typeof cloudflareIp === 'string' && cloudflareIp.trim()) {
        return cloudflareIp.trim();
    }
    const forwardedFor = req.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
        return forwardedFor.split(',')[0].trim();
    }
    return req.ip;
};

const skipReadOnlyRequests = (req) => (
    skipOperationalHealth(req)
    || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)
);

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
    max: process.env.NODE_ENV === 'development' ? 10000 : 2000,
    message: { success: false, message: 'Too many requests, please try again later.' },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    keyGenerator: (req) => ipKeyGenerator(getRawClientIp(req)),
    skip: skipReadOnlyRequests,
});
app.use('/api/', limiter);

const strictMutationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'development' ? 1000 : 120,
    message: { success: false, message: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(getRawClientIp(req)),
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'development' ? 500 : 100,
    message: { success: false, message: 'Too many authentication attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(getRawClientIp(req)),
    skipSuccessfulRequests: true,
});

const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'development' ? 300 : 40,
    message: { success: false, message: 'Too many uploads, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(getRawClientIp(req)),
});

const limitMutationsOnly = (limiterMiddleware) => (req, res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        return limiterMiddleware(req, res, next);
    }
    return next();
};

app.use(['/api/auth/login', '/api/auth/register', '/auth/login', '/auth/register'], authLimiter);
app.use(['/api/wallet', '/wallet', '/api/orders', '/orders'], limitMutationsOnly(strictMutationLimiter));
app.use(['/api/market/collect-coin', '/market/collect-coin'], strictMutationLimiter);
app.use(['/api/market/create', '/market/create', '/api/ads', '/ads', '/api/upload-content', '/upload-content'], limitMutationsOnly(uploadLimiter));

// Logging
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.use(['/api/chat', '/chat'], createRouteServiceProxy({
    envVar: 'CHAT_SERVICE_URL',
    serviceName: 'chat-service',
}));
app.use(['/api/feed', '/feed', '/api/googs', '/googs', '/api/upload-content', '/upload-content'], createRouteServiceProxy({
    envVar: 'FEED_SERVICE_URL',
    serviceName: 'feed-service',
}));
app.use(['/api/market', '/market', '/api/categories', '/categories', '/api/cart', '/cart'], createRouteServiceProxy({
    envVar: 'MARKETPLACE_SERVICE_URL',
    serviceName: 'marketplace-service',
}));
app.use(['/api/ads', '/ads'], createRouteServiceProxy({
    envVar: 'ADS_SERVICE_URL',
    serviceName: 'ads-service',
}));
app.use(['/api/auth', '/auth', '/api/subscriptions', '/subscriptions', '/api/subscription-plans', '/subscription-plans', '/api/verification', '/verification'], createRouteServiceProxy({
    envVar: 'ACCOUNT_SERVICE_URL',
    serviceName: 'account-service',
}));
app.use(['/api/orders', '/orders'], createRouteServiceProxy({
    envVar: 'ORDERS_SERVICE_URL',
    serviceName: 'orders-service',
}));
app.use(['/api/wallet', '/wallet', '/api/withdrawals', '/withdrawals', '/api/withdrawal-admin', '/withdrawal-admin', '/api/coin-requests', '/coin-requests', '/api/p2p-ads', '/p2p-ads', '/api/p2p-sell-ads', '/p2p-sell-ads', '/api/admin', '/admin'], createRouteServiceProxy({
    envVar: 'FINANCE_SERVICE_URL',
    serviceName: 'finance-service',
    excludedPrefixes: ['/api/admin/customization', '/admin/customization'],
}));

// Body Parsers
app.use(express.json({ limit: '35mb' }));
app.use(express.urlencoded({ extended: true, limit: '35mb' }));
mountPublicUploads(app);
app.use('/assets', express.static(path.join(__dirname, '../../public/assets')));

// Route Imports
const authRoutes = require('./routes/auth');
const walletRoutes = require('./routes/wallet');
const adsRoutes = require('./routes/ads');
const marketRoutes = require('./routes/market');
const uploadContentRoutes = require('./routes/uploadContent');
const categoryRoutes = require('./routes/categories');
const orderRoutes = require('./routes/order');
const chatRoutes = require('./routes/chat');
const cartRoutes = require('./routes/cart');
const googRoutes = require('./routes/googs');
const feedRoutes = require('./routes/feed');
const promoCodesRoutes = require('./routes/promoCodes');
const adminCustomizationRoutes = require('./routes/adminCustomization');
const verificationRoutes = require('./routes/verification');
const withdrawalAdminRoutes = require('./routes/withdrawalAdmin');
const withdrawalsRoutes = require('./routes/withdrawals');
const coinRequestsRoutes = require('./routes/coinRequests');
const p2pAdsRoutes = require('./routes/p2pAds');
const p2pSellAdsRoutes = require('./routes/p2pSellAds');
const subscriptionsRoutes = require('./routes/subscriptions');
const subscriptionPlansRoutes = require('./routes/subscriptionPlans');
const stickersRoutes = require('./routes/stickers');
const adminHistoryRoutes = require('./routes/adminHistory');
const uploadControlController = require('./controllers/uploadControlController');

// API Versioning & Routing (Compatible with existing web app)
const apiRoutes = express.Router();

apiRoutes.use('/notifications', require('./routes/notifications'));
apiRoutes.get('/upload-control-settings', uploadControlController.getPublic);
apiRoutes.use('/auth', authRoutes);
apiRoutes.use('/wallet', walletRoutes);
apiRoutes.use('/ads', adsRoutes);
apiRoutes.use('/market', marketRoutes);
apiRoutes.use('/upload-content', uploadContentRoutes);
apiRoutes.use('/categories', categoryRoutes);
apiRoutes.use('/googs', googRoutes);
apiRoutes.use('/orders', orderRoutes);
apiRoutes.use('/chat', chatRoutes);
apiRoutes.use('/cart', cartRoutes);
apiRoutes.use('/feed', feedRoutes);
apiRoutes.use('/promo-codes', promoCodesRoutes);
apiRoutes.use('/admin/customization', adminCustomizationRoutes);
apiRoutes.use('/admin', adminHistoryRoutes);
apiRoutes.use('/verification', verificationRoutes);
apiRoutes.use('/withdrawal-admin', withdrawalAdminRoutes);
apiRoutes.use('/withdrawals', withdrawalsRoutes);
apiRoutes.use('/coin-requests', coinRequestsRoutes);
apiRoutes.use('/p2p-ads', p2pAdsRoutes);
apiRoutes.use('/p2p-sell-ads', p2pSellAdsRoutes);
apiRoutes.use('/subscriptions', subscriptionsRoutes);
apiRoutes.use('/subscription-plans', subscriptionPlansRoutes);
apiRoutes.use('/stickers', stickersRoutes);

// Mount API routes
app.use('/api', apiRoutes);

// Fallback mounting for legacy support/Vercel bridge (kept for full compatibility)
app.use('/notifications', require('./routes/notifications'));
app.get('/upload-control-settings', uploadControlController.getPublic);
app.use('/auth', authRoutes);
app.use('/wallet', walletRoutes);
app.use('/ads', adsRoutes);
app.use('/market', marketRoutes);
app.use('/upload-content', uploadContentRoutes);
app.use('/categories', categoryRoutes);
app.use('/googs', googRoutes);
app.use('/orders', orderRoutes);
app.use('/chat', chatRoutes);
app.use('/cart', cartRoutes);
app.use('/feed', feedRoutes);
app.use('/promo-codes', promoCodesRoutes);
app.use('/admin/customization', adminCustomizationRoutes);
app.use('/admin', adminHistoryRoutes);
app.use('/verification', verificationRoutes);
app.use('/withdrawal-admin', withdrawalAdminRoutes);
app.use('/withdrawals', withdrawalsRoutes);
app.use('/coin-requests', coinRequestsRoutes);
app.use('/p2p-ads', p2pAdsRoutes);
app.use('/p2p-sell-ads', p2pSellAdsRoutes);
app.use('/subscriptions', subscriptionsRoutes);
app.use('/subscription-plans', subscriptionPlansRoutes);

app.get('/api/test', (req, res) => {
    res.json({ success: true, message: 'New routes are live' });
});

// Health check route
app.get('/api/health', async (req, res) => {
    try {
        const dbStatus = await pool.query('SELECT NOW()');
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

app.get('/api/ops/health', internalOpsAuth, async (req, res) => {
    try {
        const [dbStatus, queueMetrics, workerMetrics] = await Promise.all([
            pool.query('SELECT NOW() AS now'),
            getBackgroundQueueMetrics(pool, { queueName: 'googer-main' }),
            getBackgroundWorkerMetrics(pool, { serviceName: 'googer-main', queueName: 'googer-main' }),
        ]);

        const hasFailedJobs = Number(queueMetrics.summary.failed_jobs || 0) > 0;
        const hasStaleWorkers = Number(workerMetrics.summary.stale_workers || 0) > 0;
        const statusCode = hasFailedJobs || hasStaleWorkers ? 503 : 200;

        res.status(statusCode).json({
            success: statusCode === 200,
            service: 'googer-main',
            database: 'Connected',
            queue: queueMetrics.summary,
            workers: workerMetrics.summary,
            checks: {
                failedJobs: hasFailedJobs ? 'degraded' : 'ok',
                staleWorkers: hasStaleWorkers ? 'degraded' : 'ok',
            },
            timestamp: dbStatus.rows[0].now,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            service: 'googer-main',
            message: 'Failed to collect ops health',
            error: error.message,
        });
    }
});

app.get('/api/ops/metrics', internalOpsAuth, async (req, res) => {
    try {
        const [queueMetrics, workerMetrics] = await Promise.all([
            getBackgroundQueueMetrics(pool, { queueName: 'googer-main' }),
            getBackgroundWorkerMetrics(pool, {
                serviceName: 'googer-main',
                queueName: 'googer-main',
                staleAfterSeconds: Number(process.env.WORKER_STALE_AFTER_SECONDS || 120),
            }),
        ]);

        res.status(200).json({
            success: true,
            service: 'googer-main',
            queue: queueMetrics,
            workers: workerMetrics,
            generatedAt: new Date().toISOString(),
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            service: 'googer-main',
            message: 'Failed to collect ops metrics',
            error: error.message,
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
    (async () => {
        if (String(process.env.SKIP_STARTUP_PREFLIGHT || '') !== '1') {
            await assertFinanceSchemaReady(pool);
            await ensureAdminWalletGuard(pool);
            await bootstrapRuntimeSchemas();
        }

        const server = http.createServer(app);
        const io = attachChatSocket(server, corsOptions);
        app.set('io', io);

        server.listen(PORT, () => {
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
    })().catch((error) => {
        console.error('Failed startup preflight:', error);
        process.exit(1);
    });
}

module.exports = app;
