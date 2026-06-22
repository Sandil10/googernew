async function recordWorkerHeartbeat(poolOrClient, options = {}) {
    const {
        workerId,
        serviceName = 'unknown-service',
        queueName = 'default',
        status = 'idle',
        currentJobId = null,
        currentJobType = null,
        lastJobStartedAt = null,
        lastJobCompletedAt = null,
        lastError = null,
        metadata = {},
    } = options;

    if (!workerId) throw new Error('workerId is required');

    await poolOrClient.query(
        `INSERT INTO background_worker_status (
            worker_id,
            service_name,
            queue_name,
            status,
            current_job_id,
            current_job_type,
            last_job_started_at,
            last_job_completed_at,
            last_heartbeat_at,
            last_error,
            metadata,
            created_at,
            updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, $10::jsonb, NOW(), NOW())
        ON CONFLICT (worker_id)
        DO UPDATE SET
            service_name = EXCLUDED.service_name,
            queue_name = EXCLUDED.queue_name,
            status = EXCLUDED.status,
            current_job_id = EXCLUDED.current_job_id,
            current_job_type = EXCLUDED.current_job_type,
            last_job_started_at = COALESCE(EXCLUDED.last_job_started_at, background_worker_status.last_job_started_at),
            last_job_completed_at = COALESCE(EXCLUDED.last_job_completed_at, background_worker_status.last_job_completed_at),
            last_heartbeat_at = NOW(),
            last_error = EXCLUDED.last_error,
            metadata = EXCLUDED.metadata,
            updated_at = NOW()`,
        [
            workerId,
            serviceName,
            queueName,
            status,
            currentJobId,
            currentJobType,
            lastJobStartedAt,
            lastJobCompletedAt,
            lastError,
            JSON.stringify(metadata && typeof metadata === 'object' ? metadata : {}),
        ]
    );
}

async function getBackgroundQueueMetrics(poolOrClient, options = {}) {
    const { queueName = null } = options;
    const params = [];
    const queueFilter = queueName ? 'WHERE queue_name = $1' : '';
    if (queueName) params.push(queueName);

    const countsPromise = poolOrClient.query(
        `SELECT
            queue_name,
            COUNT(*)::int AS total_jobs,
            COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_jobs,
            COUNT(*) FILTER (WHERE status = 'running')::int AS running_jobs,
            COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_jobs,
            COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_jobs,
            COALESCE(MAX(EXTRACT(EPOCH FROM (NOW() - available_at))) FILTER (WHERE status = 'pending' AND available_at <= NOW()), 0)::int AS oldest_pending_age_seconds
         FROM background_jobs
         ${queueFilter}
         GROUP BY queue_name
         ORDER BY queue_name ASC`,
        params
    );

    const summaryPromise = poolOrClient.query(
        `SELECT
            COUNT(*)::int AS total_jobs,
            COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_jobs,
            COUNT(*) FILTER (WHERE status = 'running')::int AS running_jobs,
            COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_jobs,
            COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_jobs,
            COALESCE(MAX(EXTRACT(EPOCH FROM (NOW() - available_at))) FILTER (WHERE status = 'pending' AND available_at <= NOW()), 0)::int AS oldest_pending_age_seconds
         FROM background_jobs
         ${queueFilter}`,
        params
    );

    const [counts, summary] = await Promise.all([countsPromise, summaryPromise]);
    return {
        queues: counts.rows,
        summary: summary.rows[0] || {
            total_jobs: 0,
            pending_jobs: 0,
            running_jobs: 0,
            failed_jobs: 0,
            completed_jobs: 0,
            oldest_pending_age_seconds: 0,
        },
    };
}

async function getBackgroundWorkerMetrics(poolOrClient, options = {}) {
    const {
        serviceName = null,
        queueName = null,
        staleAfterSeconds = 120,
    } = options;

    const params = [staleAfterSeconds];
    const filters = [];

    if (serviceName) {
        params.push(serviceName);
        filters.push(`service_name = $${params.length}`);
    }

    if (queueName) {
        params.push(queueName);
        filters.push(`queue_name = $${params.length}`);
    }

    const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

    const detail = await poolOrClient.query(
        `SELECT
            worker_id,
            service_name,
            queue_name,
            status,
            current_job_id,
            current_job_type,
            last_job_started_at,
            last_job_completed_at,
            last_heartbeat_at,
            last_error,
            metadata,
            EXTRACT(EPOCH FROM (NOW() - last_heartbeat_at))::int AS heartbeat_age_seconds,
            (NOW() - last_heartbeat_at) > ($1::text || ' seconds')::interval AS is_stale
         FROM background_worker_status
         ${whereClause}
         ORDER BY service_name ASC, queue_name ASC, worker_id ASC`,
        params
    );

    const summary = {
        total_workers: detail.rows.length,
        running_workers: detail.rows.filter((row) => row.status === 'running').length,
        idle_workers: detail.rows.filter((row) => row.status === 'idle').length,
        error_workers: detail.rows.filter((row) => row.status === 'error').length,
        stale_workers: detail.rows.filter((row) => row.is_stale).length,
    };

    return {
        workers: detail.rows,
        summary,
    };
}

module.exports = {
    recordWorkerHeartbeat,
    getBackgroundQueueMetrics,
    getBackgroundWorkerMetrics,
};
