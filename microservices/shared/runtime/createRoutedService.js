const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const { loadEnv } = require('./loadEnv');

const mountRoutes = (app, mounts = []) => {
    mounts.forEach(({ path, router }) => {
        if (!path || !router) return;
        app.use(path, router);
    });
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryableBootstrapError = (error) => {
    const message = String(error?.message || '').toLowerCase();
    return (
        error?.code === 'XX000'
        || message.includes('tuple concurrently updated')
    );
};

const runPreflight = async (preflight) => {
    if (typeof preflight !== 'function') return;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            await preflight();
            return;
        } catch (error) {
            if (attempt >= 3 || !isRetryableBootstrapError(error)) {
                throw error;
            }
            await delay(250 * attempt);
        }
    }
};

const createRoutedServiceApp = ({
    serviceName,
    mounts = [],
    jsonLimit = '35mb',
    urlencodedLimit = '35mb',
} = {}) => {
    loadEnv();

    const app = express();
    app.set('trust proxy', 1);

    app.use(helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false,
    }));
    app.use(cors({ origin: true, credentials: true, optionsSuccessStatus: 200 }));
    app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
    app.use(express.json({ limit: jsonLimit }));
    app.use(express.urlencoded({ extended: true, limit: urlencodedLimit }));

    app.get('/health', (req, res) => {
        res.json({
            success: true,
            service: serviceName,
            timestamp: new Date().toISOString(),
        });
    });

    mountRoutes(app, mounts);

    app.use((req, res) => {
        res.status(404).json({
            success: false,
            message: 'API route not found',
            service: serviceName,
        });
    });

    app.use((err, req, res, next) => {
        console.error(`[${serviceName}]`, err);
        res.status(err.statusCode || 500).json({
            success: false,
            message: err.message || 'Service error',
            service: serviceName,
        });
    });

    return app;
};

const startRoutedService = async ({
    serviceName,
    port,
    mounts = [],
    preflight,
    jsonLimit,
    urlencodedLimit,
} = {}) => {
    await runPreflight(preflight);

    const app = createRoutedServiceApp({
        serviceName,
        mounts,
        jsonLimit,
        urlencodedLimit,
    });

    app.listen(port, () => {
        console.log(`[${serviceName}] listening on ${port}`);
    });
};

module.exports = {
    createRoutedServiceApp,
    startRoutedService,
};
