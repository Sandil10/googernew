const pool = require('../../config/database');

let tableReady = false;

const ensureTable = async () => {
    if (tableReady) return;

    await pool.query(`
        CREATE TABLE IF NOT EXISTS api_idempotency_keys (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            scope VARCHAR(120) NOT NULL,
            idem_key VARCHAR(200) NOT NULL,
            request_hash VARCHAR(128) NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            response_status INTEGER,
            response_content_type VARCHAR(120),
            response_body TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP,
            UNIQUE (user_id, scope, idem_key)
        );
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_api_idempotency_status
        ON api_idempotency_keys(status, created_at DESC);
    `);

    tableReady = true;
};

const findKey = async ({ userId, scope, key }) => {
    const result = await pool.query(
        `SELECT *
         FROM api_idempotency_keys
         WHERE user_id = $1 AND scope = $2 AND idem_key = $3
         LIMIT 1`,
        [userId, scope, key]
    );
    return result.rows[0] || null;
};

const insertPendingKey = async ({ userId, scope, key, requestHash }) => {
    const result = await pool.query(
        `INSERT INTO api_idempotency_keys
            (user_id, scope, idem_key, request_hash, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id, scope, idem_key) DO NOTHING
         RETURNING *`,
        [userId, scope, key, requestHash]
    );
    return result.rows[0] || null;
};

const completeKey = async ({ userId, scope, key, requestHash, statusCode, contentType, responseBody }) => {
    await pool.query(
        `UPDATE api_idempotency_keys
         SET status = 'completed',
             request_hash = $4,
             response_status = $5,
             response_content_type = $6,
             response_body = $7,
             completed_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND scope = $2 AND idem_key = $3`,
        [userId, scope, key, requestHash, statusCode, contentType || 'application/json; charset=utf-8', responseBody]
    );
};

module.exports = {
    completeKey,
    ensureTable,
    findKey,
    insertPendingKey,
};
