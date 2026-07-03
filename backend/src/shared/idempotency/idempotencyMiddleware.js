const idempotencyService = require('./idempotencyService');

const withIdempotency = (scope) => async (req, res, next) => {
    const userId = req.user?.id || req.user?.userId;
    const key = idempotencyService.getIdempotencyKey(req);
    if (!userId || !key) {
        return next();
    }

    const requestHash = idempotencyService.buildRequestHash(req);
    const outcome = await idempotencyService.begin({ key, requestHash, scope, userId });

    if (outcome.state === 'conflict') {
        return res.status(409).json({
            success: false,
            message: 'This idempotency key was already used with a different request.',
        });
    }

    if (outcome.state === 'pending') {
        return res.status(409).json({
            success: false,
            message: 'An identical request with this idempotency key is already in progress.',
        });
    }

    if (outcome.state === 'replay') {
        const statusCode = Number(outcome.record.response_status || 200);
        const contentType = outcome.record.response_content_type || 'application/json; charset=utf-8';
        res.setHeader('X-Idempotent-Replay', 'true');
        res.type(contentType);
        return res.status(statusCode).send(outcome.record.response_body || '');
    }

    let capturedBody = '';
    let capturedContentType = 'application/json; charset=utf-8';
    const originalSend = res.send.bind(res);

    res.send = function patchedSend(body) {
        if (body !== undefined && body !== null) {
            capturedBody = Buffer.isBuffer(body) ? body.toString('utf8') : String(body);
        } else {
            capturedBody = '';
        }
        capturedContentType = String(res.getHeader('content-type') || capturedContentType);
        return originalSend(body);
    };

    res.on('finish', () => {
        idempotencyService.finish({
            contentType: capturedContentType,
            key,
            requestHash,
            responseBody: capturedBody,
            scope,
            statusCode: res.statusCode,
            userId,
        }).catch((error) => {
            console.error('[idempotency] failed to persist response:', error.message);
        });
    });

    return next();
};

module.exports = {
    withIdempotency,
};
