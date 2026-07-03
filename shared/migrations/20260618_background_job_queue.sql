CREATE TABLE IF NOT EXISTS background_jobs (
    id SERIAL PRIMARY KEY,
    job_type VARCHAR(120) NOT NULL,
    queue_name VARCHAR(80) NOT NULL DEFAULT 'default',
    job_key VARCHAR(160),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 10,
    available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_at TIMESTAMPTZ,
    locked_by VARCHAR(120),
    last_error TEXT,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_background_jobs_job_key
    ON background_jobs(job_key)
    WHERE job_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_background_jobs_claim
    ON background_jobs(queue_name, status, available_at, id);

CREATE INDEX IF NOT EXISTS idx_background_jobs_type_status
    ON background_jobs(job_type, status, available_at);
