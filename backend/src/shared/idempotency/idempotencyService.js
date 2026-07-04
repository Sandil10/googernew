const crypto = require('crypto');
const repository = require('./idempotencyRepository');

const getIdempotencyKey = (req) => {
    const headerKey = req.header('Idempotency-Key') || req.header('X-Idempotency-Key');
    const bodyKey = req.body?.idempotency_key || req.body?.idempotencyKey || null;
    const key = String(headerKey || bodyKey || '').trim();
    return key || null;
};

const buildRequestHash = (req) => {
    const payload = {
        body: req.body || {},
        method: req.method,
        params: req.params || {},
        query: req.query || {},
    };
    return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
};

const begin = async ({ userId, scope, key, requestHash }) => {
    await repository.ensureTable();

    const inserted = await repository.insertPendingKey({ key, requestHash, scope, userId });
    if (inserted) {
        return { record: inserted, state: 'started' };
    }

    const existing = await repository.findKey({ key, scope, userId });
    if (!existing) {
        throw new Error('Idempotency lookup failed');
    }
    if (existing.request_hash !== requestHash) {
        return { record: existing, state: 'conflict' };
    }
    if (existing.status === 'completed') {
        return { record: existing, state: 'replay' };
    }
    return { record: existing, state: 'pending' };
};

const finish = async ({ userId, scope, key, requestHash, statusCode, contentType, responseBody }) => (
    repository.completeKey({
        contentType,
        key,
        requestHash,
        responseBody,
        scope,
        statusCode,
        userId,
    })
);

module.exports = {
    begin,
    buildRequestHash,
    finish,
    getIdempotencyKey,
};
