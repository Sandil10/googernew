const { startRoutedService } = require('../../shared/runtime/createRoutedService');
const { bootstrapRuntimeSchemas } = require('../../../backend/src/startup');

const adsRoutes = require('../../../backend/src/routes/ads');

const port = Number(process.env.ADS_SERVICE_PORT || 5008);

startRoutedService({
    serviceName: 'ads-service',
    port,
    preflight: bootstrapRuntimeSchemas,
    mounts: [
        { path: '/api/ads', router: adsRoutes },
        { path: '/ads', router: adsRoutes },
    ],
}).catch((error) => {
    console.error('[ads-service] startup failed:', error);
    process.exit(1);
});
