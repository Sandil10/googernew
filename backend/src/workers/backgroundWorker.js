require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
require('dotenv').config();

const pool = require('../config/database');
const { assertFinanceSchemaReady } = require('../../../../shared/utils/financeSchemaGuard');
const { runBackgroundWorker } = require('../../../../shared/utils/backgroundWorkerRunner');
const { ensureAdminWalletGuard } = require('../utils/adminWalletGuard');
const { createBackgroundJobHandlers, ensureBackgroundJobDependencies } = require('../jobs/handlers');
const { getRecurringJobs } = require('../jobs/recurringJobs');
const { QUEUES } = require('../jobs/jobTypes');

async function main() {
    await assertFinanceSchemaReady(pool);
    await ensureAdminWalletGuard(pool);
    await ensureBackgroundJobDependencies();

    const worker = await runBackgroundWorker({
        pool,
        workerId: process.env.WORKER_ID || `googer-main-${process.pid}`,
        queueName: QUEUES.MAIN,
        serviceName: 'googer-main',
        pollIntervalMs: Number(process.env.BACKGROUND_WORKER_POLL_MS || 1000),
        defaultRetryDelayMs: Number(process.env.BACKGROUND_WORKER_RETRY_MS || 30000),
        handlers: createBackgroundJobHandlers({ pool }),
        recurringJobs: getRecurringJobs(),
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
