const { startRoutedService } = require('../../shared/runtime/createRoutedService');
const { bootstrapRuntimeSchemas } = require('../../../backend/src/startup');

const authRoutes = require('../../../backend/src/routes/auth');
const subscriptionsRoutes = require('../../../backend/src/routes/subscriptions');
const subscriptionPlansRoutes = require('../../../backend/src/routes/subscriptionPlans');
const verificationRoutes = require('../../../backend/src/routes/verification');

const port = Number(process.env.ACCOUNT_SERVICE_PORT || 5009);

startRoutedService({
    serviceName: 'account-service',
    port,
    preflight: bootstrapRuntimeSchemas,
    mounts: [
        { path: '/api/auth', router: authRoutes },
        { path: '/auth', router: authRoutes },
        { path: '/api/subscriptions', router: subscriptionsRoutes },
        { path: '/subscriptions', router: subscriptionsRoutes },
        { path: '/api/subscription-plans', router: subscriptionPlansRoutes },
        { path: '/subscription-plans', router: subscriptionPlansRoutes },
        { path: '/api/verification', router: verificationRoutes },
        { path: '/verification', router: verificationRoutes },
    ],
}).catch((error) => {
    console.error('[account-service] startup failed:', error);
    process.exit(1);
});
