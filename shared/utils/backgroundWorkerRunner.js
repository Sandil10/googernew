const {
    enqueueBackgroundJob,
    claimNextBackgroundJob,
    completeBackgroundJob,
    failBackgroundJob,
    getQueueWakeChannel,
} = require('./backgroundJobQueue');
const { recordWorkerHeartbeat } = require('./backgroundMonitoring');
const { resolveBackendRuntimePath } = require('./backendRuntimePath');
const {
    subscribeRedisChannel,
    redisAvailable,
} = require(resolveBackendRuntimePath('src/shared/redis/runtime'));

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runBackgroundWorker(options = {}) {
    const {
        pool,
        workerId,
        queueName = 'default',
        serviceName = 'unknown-service',
        handlers = {},
        recurringJobs = [],
        pollIntervalMs = 1000,
        defaultRetryDelayMs = 30000,
        logger = console,
    } = options;

    if (!pool) throw new Error('pool is required');
    if (!workerId) throw new Error('workerId is required');

    let stopping = false;
    const recurringJobsByKey = new Map();
    let wakeSubscriber = null;
    let wakeSignalCount = 0;

    for (const job of recurringJobs) {
        if (!job?.jobType || !job?.jobKey || !(Number(job.everyMs || 0) > 0)) continue;
        recurringJobsByKey.set(job.jobKey, job);
    }

    const seedRecurringJobs = async () => {
        for (const job of recurringJobsByKey.values()) {
            await enqueueBackgroundJob(pool, {
                jobType: job.jobType,
                queueName,
                jobKey: job.jobKey,
                payload: job.payload || {},
                maxAttempts: job.maxAttempts || 10,
                availableAt: new Date(),
            });
        }
    };

    const processOneJob = async () => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const job = await claimNextBackgroundJob(client, {
                queueName,
                workerId,
                allowedJobTypes: Object.keys(handlers),
            });

            if (!job) {
                await client.query('COMMIT');
                await recordWorkerHeartbeat(pool, {
                    workerId,
                    serviceName,
                    queueName,
                    status: 'idle',
                    metadata: { pollIntervalMs },
                });
                return false;
            }

            await client.query('COMMIT');
            await recordWorkerHeartbeat(pool, {
                workerId,
                serviceName,
                queueName,
                status: 'running',
                currentJobId: job.id,
                currentJobType: job.job_type,
                lastJobStartedAt: new Date(),
                metadata: { pollIntervalMs },
            });

            try {
                const handler = handlers[job.job_type];
                if (typeof handler !== 'function') {
                    throw new Error(`No handler registered for job type "${job.job_type}"`);
                }

                await handler(job);

                await client.query('BEGIN');
                await completeBackgroundJob(client, job.id);
                await client.query('COMMIT');

                const recurringJob = job.job_key ? recurringJobsByKey.get(job.job_key) : null;
                if (recurringJob) {
                    await enqueueBackgroundJob(pool, {
                        jobType: recurringJob.jobType,
                        queueName,
                        jobKey: recurringJob.jobKey,
                        payload: recurringJob.payload || {},
                        maxAttempts: recurringJob.maxAttempts || 10,
                        availableAt: new Date(Date.now() + Number(recurringJob.everyMs)),
                    });
                }

                await recordWorkerHeartbeat(pool, {
                    workerId,
                    serviceName,
                    queueName,
                    status: 'idle',
                    lastJobCompletedAt: new Date(),
                    metadata: { lastCompletedJobId: job.id, lastCompletedJobType: job.job_type },
                });

                return true;
            } catch (error) {
                await client.query('BEGIN');
                await failBackgroundJob(client, job, error, {
                    retryDelayMs: defaultRetryDelayMs,
                });
                await client.query('COMMIT');
                await recordWorkerHeartbeat(pool, {
                    workerId,
                    serviceName,
                    queueName,
                    status: 'error',
                    currentJobId: job.id,
                    currentJobType: job.job_type,
                    lastError: error.message,
                    metadata: { failedJobId: job.id, failedJobType: job.job_type },
                });
                logger.error(`[background-worker:${workerId}] Job failed (${job.job_type}#${job.id}):`, error.message);
                return true;
            }
        } catch (error) {
            try { await client.query('ROLLBACK'); } catch (_) {}
            throw error;
        } finally {
            client.release();
        }
    };

    const stop = () => {
        stopping = true;
        if (wakeSubscriber) {
            wakeSubscriber.unsubscribe().catch(() => {});
            wakeSubscriber.quit?.().catch(() => {});
        }
    };

    await seedRecurringJobs();
    if (redisAvailable()) {
        wakeSubscriber = await subscribeRedisChannel(getQueueWakeChannel(queueName), () => {
            wakeSignalCount += 1;
        }).catch(() => null);
    }
    await recordWorkerHeartbeat(pool, {
        workerId,
        serviceName,
        queueName,
        status: 'idle',
        metadata: { startedAt: new Date().toISOString(), pollIntervalMs, redisWakeups: Boolean(wakeSubscriber) },
    });

    const done = (async () => {
        while (!stopping) {
            const processed = await processOneJob().catch((error) => {
                logger.error(`[background-worker:${workerId}] Worker loop error:`, error.message);
                return false;
            });

            if (!processed) {
                const dynamicSleepMs = wakeSubscriber && wakeSignalCount > 0 ? 50 : pollIntervalMs;
                wakeSignalCount = 0;
                await sleep(dynamicSleepMs);
            }
        }
    })();

    return { stop, done };
}

module.exports = {
    runBackgroundWorker,
};
