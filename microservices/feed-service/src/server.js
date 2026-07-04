const { startRoutedService } = require('../../shared/runtime/createRoutedService');
const { bootstrapRuntimeSchemas } = require('../../../backend/src/startup');

const feedRoutes = require('../../../backend/src/routes/feed');
const googRoutes = require('../../../backend/src/routes/googs');
const uploadContentRoutes = require('../../../backend/src/routes/uploadContent');

const port = Number(process.env.FEED_SERVICE_PORT || 5006);

startRoutedService({
    serviceName: 'feed-service',
    port,
    preflight: bootstrapRuntimeSchemas,
    mounts: [
        { path: '/api/feed', router: feedRoutes },
        { path: '/feed', router: feedRoutes },
        { path: '/api/googs', router: googRoutes },
        { path: '/googs', router: googRoutes },
        { path: '/api/upload-content', router: uploadContentRoutes },
        { path: '/upload-content', router: uploadContentRoutes },
    ],
}).catch((error) => {
    console.error('[feed-service] startup failed:', error);
    process.exit(1);
});
