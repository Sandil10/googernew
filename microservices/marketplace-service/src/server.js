const { startRoutedService } = require('../../shared/runtime/createRoutedService');
const { bootstrapRuntimeSchemas } = require('../../../backend/src/startup');

const marketRoutes = require('../../../backend/src/routes/market');
const categoryRoutes = require('../../../backend/src/routes/categories');
const cartRoutes = require('../../../backend/src/routes/cart');

const port = Number(process.env.MARKETPLACE_SERVICE_PORT || 5007);

startRoutedService({
    serviceName: 'marketplace-service',
    port,
    preflight: bootstrapRuntimeSchemas,
    mounts: [
        { path: '/api/market', router: marketRoutes },
        { path: '/market', router: marketRoutes },
        { path: '/api/categories', router: categoryRoutes },
        { path: '/categories', router: categoryRoutes },
        { path: '/api/cart', router: cartRoutes },
        { path: '/cart', router: cartRoutes },
    ],
}).catch((error) => {
    console.error('[marketplace-service] startup failed:', error);
    process.exit(1);
});
