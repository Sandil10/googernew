CREATE TABLE IF NOT EXISTS background_worker_status (
    worker_id VARCHAR(120) PRIMARY KEY,
    service_name VARCHAR(80) NOT NULL,
    queue_name VARCHAR(80) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'idle',
    current_job_id INTEGER,
    current_job_type VARCHAR(120),
    last_job_started_at TIMESTAMPTZ,
    last_job_completed_at TIMESTAMPTZ,
    last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_error TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_background_worker_status_queue
    ON background_worker_status(service_name, queue_name, status, last_heartbeat_at);
