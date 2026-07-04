const { startRoutedService } = require('../../shared/runtime/createRoutedService');
const { bootstrapRuntimeSchemas } = require('../../../backend/src/startup');

const orderRoutes = require('../../../backend/src/routes/order');

const port = Number(process.env.ORDERS_SERVICE_PORT || 5010);

startRoutedService({
    serviceName: 'orders-service',
    port,
    preflight: bootstrapRuntimeSchemas,
    mounts: [
        { path: '/api/orders', router: orderRoutes },
        { path: '/orders', router: orderRoutes },
    ],
}).catch((error) => {
    console.error('[orders-service] startup failed:', error);
    process.exit(1);
});
