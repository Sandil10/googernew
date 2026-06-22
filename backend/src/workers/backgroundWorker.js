require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
require('dotenv').config();

const pool = require('../config/database');
const { assertFinanceSchemaReady } = require('../../../../shared/utils/financeSchemaGuard');
const { runBackgroundWorker } = require('../../../../shared/utils/backgroundWorkerRunner');
const { ensureAdminWalletGuard } = require('../utils/adminWalletGuard');
const { processDueSubscriptions, getRenewalSweepMs } = require('../utils/subscriptionRenewal');
const { syncExpiredAds } = require('../utils/adDelivery');
const {
    ensureAdsTable,
    getAdsMaintenanceSweepMs,
    syncAdsReachCaps,
} = require('../controllers/adsController');

async function main() {
    await assertFinanceSchemaReady(pool);
    await ensureAdminWalletGuard(pool);
    await ensureAdsTable();

    const worker = await runBackgroundWorker({
        pool,
        workerId: process.env.WORKER_ID || `googer-main-${process.pid}`,
        queueName: 'googer-main',
        serviceName: 'googer-main',
        pollIntervalMs: Number(process.env.BACKGROUND_WORKER_POLL_MS || 1000),
        defaultRetryDelayMs: Number(process.env.BACKGROUND_WORKER_RETRY_MS || 30000),
        handlers: {
            'subscription.renewal.sweep': async () => {
                await processDueSubscriptions();
            },
            'ads.maintenance.sweep': async () => {
                await syncExpiredAds(pool);
                await syncAdsReachCaps();
            },
        },
        recurringJobs: [
            {
                jobType: 'subscription.renewal.sweep',
                jobKey: 'subscription.renewal.sweep',
                everyMs: getRenewalSweepMs(),
                maxAttempts: 10,
            },
            {
                jobType: 'ads.maintenance.sweep',
                jobKey: 'ads.maintenance.sweep',
                everyMs: getAdsMaintenanceSweepMs(),
                maxAttempts: 10,
            },
        ],
    });

    const shutdown = async (signal) => {
        console.log(`[background-worker] ${signal} received, stopping...`);
        worker.stop();
        await pool.end().catch(() => {});
        process.exit(0);
    };

    process.on('SIGINT', () => { shutdown('SIGINT'); });
    process.on('SIGTERM', () => { shutdown('SIGTERM'); });
    worker.done.catch((error) => {
        console.error('[background-worker] worker loop failed:', error);
        process.exit(1);
    });
    console.log(`[background-worker] Googer main worker running as ${process.env.WORKER_ID || `googer-main-${process.pid}`}`);
}

main().catch((error) => {
    console.error('[background-worker] startup failed:', error);
    process.exit(1);
});
