const path = require('path');
const { resolveBackendRuntimePath } = require('./backendRuntimePath');
const {
    publishRedisSignal,
    redisAvailable,
} = require(resolveBackendRuntimePath('src/shared/redis/runtime'));

function normalizePayload(payload) {
    return payload && typeof payload === 'object' ? payload : {};
}

const getQueueWakeChannel = (queueName = 'default') => `background-queue:${queueName}:wake`;

async function enqueueBackgroundJob(poolOrClient, options = {}) {
    const {
        jobType,
        queueName = 'default',
        jobKey = null,
        payload = {},
        maxAttempts = 10,
        availableAt = new Date(),
    } = options;

    if (!jobType) {
        throw new Error('jobType is required');
    }

    const client = typeof poolOrClient.connect === 'function'
        ? await poolOrClient.connect()
        : poolOrClient;
    const shouldRelease = typeof poolOrClient.connect === 'function';

    try {
        const result = await client.query(
            `INSERT INTO background_jobs
                (job_type, queue_name, job_key, payload, status, attempts, max_attempts, available_at, created_at, updated_at)
             VALUES ($1, $2, $3, $4::jsonb, 'pending', 0, $5, $6, NOW(), NOW())
             ON CONFLICT (job_key) WHERE job_key IS NOT NULL
             DO UPDATE
             SET job_type = EXCLUDED.job_type,
                 queue_name = EXCLUDED.queue_name,
                 payload = EXCLUDED.payload,
                 max_attempts = EXCLUDED.max_attempts,
                 available_at = CASE
                     WHEN background_jobs.status IN ('completed', 'failed') THEN EXCLUDED.available_at
                     ELSE LEAST(background_jobs.available_at, EXCLUDED.available_at)
                 END,
                 status = CASE
                     WHEN background_jobs.status IN ('completed', 'failed') THEN 'pending'
                     ELSE background_jobs.status
                 END,
                 locked_at = CASE
                     WHEN background_jobs.status IN ('completed', 'failed') THEN NULL
                     ELSE background_jobs.locked_at
                 END,
                 locked_by = CASE
                     WHEN background_jobs.status IN ('completed', 'failed') THEN NULL
                     ELSE background_jobs.locked_by
                 END,
                 completed_at = CASE
                     WHEN background_jobs.status IN ('completed', 'failed') THEN NULL
                     ELSE background_jobs.completed_at
                 END,
                 last_error = CASE
                     WHEN background_jobs.status IN ('completed', 'failed') THEN NULL
                     ELSE background_jobs.last_error
                 END,
                 updated_at = NOW()
             RETURNING *`,
            [
                jobType,
                queueName,
                jobKey,
                JSON.stringify(normalizePayload(payload)),
                maxAttempts,
                availableAt,
            ]
        );

        const job = result.rows[0];
        if (redisAvailable()) {
            await publishRedisSignal(getQueueWakeChannel(queueName), {
                availableAt: job.available_at,
                id: job.id,
                queueName,
            }).catch(() => {});
        }
        return job;
    } finally {
        if (shouldRelease) client.release();
    }
}

async function claimNextBackgroundJob(client, options = {}) {
    const {
        queueName = 'default',
        workerId = 'worker',
        allowedJobTypes = [],
    } = options;

    const params = [queueName, workerId];
    let jobTypeFilter = '';
    if (Array.isArray(allowedJobTypes) && allowedJobTypes.length > 0) {
        params.push(allowedJobTypes);
        jobTypeFilter = `AND job_type = ANY($3::text[])`;
    }

    const result = await client.query(
        `WITH next_job AS (
            SELECT id
            FROM background_jobs
            WHERE queue_name = $1
              AND status = 'pending'
              AND available_at <= NOW()
              ${jobTypeFilter}
            ORDER BY available_at ASC, id ASC
            FOR UPDATE SKIP LOCKED
            LIMIT 1
        )
        UPDATE background_jobs jobs
        SET status = 'running',
            attempts = jobs.attempts + 1,
            locked_at = NOW(),
            locked_by = $2,
            updated_at = NOW()
        FROM next_job
        WHERE jobs.id = next_job.id
        RETURNING jobs.*`,
        params
    );

    return result.rows[0] || null;
}

async function completeBackgroundJob(client, jobId) {
    await client.query(
        `UPDATE background_jobs
         SET status = 'completed',
             locked_at = NULL,
             locked_by = NULL,
             completed_at = NOW(),
             updated_at = NOW(),
             last_error = NULL
         WHERE id = $1`,
        [jobId]
    );
}

async function failBackgroundJob(client, job, error, options = {}) {
    const retryDelayMs = Number(options.retryDelayMs || 30000);
    const shouldRetry = Number(job.attempts || 0) < Number(job.max_attempts || 0);

    if (shouldRetry) {
        await client.query(
            `UPDATE background_jobs
             SET status = 'pending',
                 locked_at = NULL,
                 locked_by = NULL,
                 available_at = NOW() + ($2::text || ' milliseconds')::interval,
                 last_error = $3,
                 updated_at = NOW()
             WHERE id = $1`,
            [job.id, retryDelayMs, String(error?.message || error || 'Unknown worker error')]
        );
        return;
    }

    await client.query(
        `UPDATE background_jobs
         SET status = 'failed',
             locked_at = NULL,
             locked_by = NULL,
             completed_at = NOW(),
             last_error = $2,
             updated_at = NOW()
         WHERE id = $1`,
        [job.id, String(error?.message || error || 'Unknown worker error')]
    );
}

module.exports = {
    enqueueBackgroundJob,
    claimNextBackgroundJob,
    completeBackgroundJob,
    failBackgroundJob,
    getQueueWakeChannel,
};
