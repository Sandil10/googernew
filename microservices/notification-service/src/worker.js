const { loadEnv } = require('../../shared/runtime/loadEnv');
const pool = require('./lib/database');
const notificationService = require('./lib/service');
const { runBackgroundWorker } = require('../../../../shared/utils/backgroundWorkerRunner');

loadEnv();

const JOB_TYPES = Object.freeze({
    NOTIFICATION_FANOUT_REQUESTED: 'notification.fanout.requested',
});

const QUEUES = Object.freeze({
    NOTIFICATIONS: 'googer-notifications',
});

async function main() {
    const worker = await runBackgroundWorker({
        pool,
        workerId: process.env.WORKER_ID || `notification-service-${process.pid}`,
        queueName: QUEUES.NOTIFICATIONS,
        serviceName: 'notification-service',
        pollIntervalMs: Number(process.env.BACKGROUND_WORKER_POLL_MS || 1000),
        defaultRetryDelayMs: Number(process.env.BACKGROUND_WORKER_RETRY_MS || 30000),
        handlers: {
            [JOB_TYPES.NOTIFICATION_FANOUT_REQUESTED]: (job) => notificationService.processFanoutJob(job?.payload || {}),
        },
        recurringJobs: [],
    });

    const shutdown = async (signal) => {
        console.log(`[notification-service-worker] ${signal} received, stopping...`);
        worker.stop();
        await pool.end().catch(() => {});
        process.exit(0);
    };

    process.on('SIGINT', () => { shutdown('SIGINT'); });
    process.on('SIGTERM', () => { shutdown('SIGTERM'); });
    worker.done.catch((error) => {
        console.error('[notification-service-worker] worker loop failed:', error);
        process.exit(1);
    });
    console.log(`[notification-service-worker] running as ${process.env.WORKER_ID || `notification-service-${process.pid}`}`);
}

main().catch((error) => {
    console.error('[notification-service-worker] startup failed:', error);
    process.exit(1);
});
