const crypto = require('crypto');

function stableStringify(value) {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(',')}]`;
    }

    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function buildIdempotencyHash(payload) {
    return crypto
        .createHash('sha256')
        .update(stableStringify(payload))
        .digest('hex');
}

async function claimFinanceIdempotencyKey(client, options = {}) {
    const {
        scope,
        idempotencyKey,
        requestPayload,
        actorUserId = null,
        targetUserId = null,
        amount = null,
    } = options;

    if (!scope || !idempotencyKey) {
        return { enabled: false };
    }

    const requestHash = buildIdempotencyHash(requestPayload);

    const insertResult = await client.query(
        `INSERT INTO finance_idempotency_keys
            (scope, idempotency_key, request_hash, created_by_user_id, target_user_id, amount)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (scope, idempotency_key) DO NOTHING
         RETURNING id`,
        [scope, idempotencyKey, requestHash, actorUserId, targetUserId, amount]
    );

    if (insertResult.rows.length > 0) {
        return {
            enabled: true,
            state: 'started',
            recordId: insertResult.rows[0].id,
            requestHash,
        };
    }

    const existingResult = await client.query(
        `SELECT id, request_hash, status, response_body
         FROM finance_idempotency_keys
         WHERE scope = $1 AND idempotency_key = $2
         LIMIT 1`,
        [scope, idempotencyKey]
    );

    const existing = existingResult.rows[0];
    if (!existing) {
        return { enabled: true, state: 'retry' };
    }

    if (existing.request_hash !== requestHash) {
        return { enabled: true, state: 'mismatch' };
    }

    if (existing.status === 'completed') {
        return {
            enabled: true,
            state: 'replay',
            recordId: existing.id,
            responseBody: existing.response_body,
        };
    }

    return {
        enabled: true,
        state: 'in_progress',
        recordId: existing.id,
    };
}

async function completeFinanceIdempotencyKey(client, recordId, responseBody) {
    if (!recordId) return;

    await client.query(
        `UPDATE finance_idempotency_keys
         SET status = 'completed',
             response_body = $2::jsonb,
             completed_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [recordId, JSON.stringify(responseBody || {})]
    );
}

module.exports = {
    stableStringify,
    buildIdempotencyHash,
    claimFinanceIdempotencyKey,
    completeFinanceIdempotencyKey,
};
