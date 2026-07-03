const pool = require('../../../backend/src/config/database');
const { startRoutedService } = require('../../shared/runtime/createRoutedService');
const { bootstrapRuntimeSchemas } = require('../../../backend/src/startup');
const { assertFinanceSchemaReady } = require('../../../shared/utils/financeSchemaGuard');
const { ensureAdminWalletGuard } = require('../../../backend/src/utils/adminWalletGuard');

const walletRoutes = require('../../../backend/src/routes/wallet');
const withdrawalsRoutes = require('../../../backend/src/routes/withdrawals');
const withdrawalAdminRoutes = require('../../../backend/src/routes/withdrawalAdmin');
const coinRequestsRoutes = require('../../../backend/src/routes/coinRequests');
const adminHistoryRoutes = require('../../../backend/src/routes/adminHistory');
const p2pAdsRoutes = require('../../../backend/src/routes/p2pAds');
const p2pSellAdsRoutes = require('../../../backend/src/routes/p2pSellAds');

const port = Number(process.env.FINANCE_SERVICE_PORT || 5011);

startRoutedService({
    serviceName: 'finance-service',
    port,
    preflight: async () => {
        await assertFinanceSchemaReady(pool);
        await ensureAdminWalletGuard(pool);
        await bootstrapRuntimeSchemas();
    },
    mounts: [
        { path: '/api/wallet', router: walletRoutes },
        { path: '/wallet', router: walletRoutes },
        { path: '/api/withdrawals', router: withdrawalsRoutes },
        { path: '/withdrawals', router: withdrawalsRoutes },
        { path: '/api/withdrawal-admin', router: withdrawalAdminRoutes },
        { path: '/withdrawal-admin', router: withdrawalAdminRoutes },
        { path: '/api/coin-requests', router: coinRequestsRoutes },
        { path: '/coin-requests', router: coinRequestsRoutes },
        { path: '/api/admin', router: adminHistoryRoutes },
        { path: '/admin', router: adminHistoryRoutes },
        { path: '/api/p2p-ads', router: p2pAdsRoutes },
        { path: '/p2p-ads', router: p2pAdsRoutes },
        { path: '/api/p2p-sell-ads', router: p2pSellAdsRoutes },
        { path: '/p2p-sell-ads', router: p2pSellAdsRoutes },
    ],
}).catch((error) => {
    console.error('[finance-service] startup failed:', error);
    process.exit(1);
});
