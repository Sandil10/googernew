const pool = require('../../config/database');
const coinRequestService = require('./coinRequestService');

const resolveUserId = (req) => req.user.id || req.user.userId;

const handleError = (res, error, context, fallbackMessage) => {
    if (error.statusCode && error.statusCode < 500) {
        return res.status(error.statusCode).json({ success: false, message: error.message });
    }

    console.error(`[coinRequestsModule] ${context} error:`, error);
    return res.status(500).json({ success: false, message: fallbackMessage });
};

const createRequest = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await coinRequestService.createRequest({
            amount: req.body.amount,
            bankName: req.body.bank_name,
            client,
            methodCategory: req.body.method_category,
            methodName: req.body.method_name,
            notes: req.body.notes,
            userId: resolveUserId(req),
        });
        await client.query('COMMIT');
        return res.json(result);
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        return handleError(res, error, 'createRequest', 'Failed to submit request.');
    } finally {
        client.release();
    }
};

const getMyRequests = async (req, res) => {
    try {
        return res.json(await coinRequestService.getMyRequests(resolveUserId(req)));
    } catch (error) {
        return handleError(res, error, 'getMyRequests', 'Failed to fetch requests.');
    }
};

const getAdminRequests = async (req, res) => {
    try {
        return res.json(await coinRequestService.getAdminRequests({
            adminUserId: resolveUserId(req),
            status: req.query.status,
        }));
    } catch (error) {
        return handleError(res, error, 'getAdminRequests', 'Failed to fetch requests.');
    }
};

const reviewRequest = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await coinRequestService.reviewRequest({
            action: req.body.action,
            adminUserId: resolveUserId(req),
            client,
            rejectionReason: req.body.rejection_reason,
            requestId: parseInt(req.params.id, 10),
        });
        await client.query('COMMIT');
        return res.json({
            success: true,
            message: result.action === 'approve' ? 'Request approved.' : 'Request rejected.',
        });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        return handleError(res, error, 'reviewRequest', 'Failed to review request.');
    } finally {
        client.release();
    }
};

const getActiveTopupMethods = async (req, res) => {
    try {
        return res.json(await coinRequestService.getActiveTopupMethods());
    } catch (error) {
        return handleError(res, error, 'getActiveTopupMethods', 'Failed to fetch payment methods.');
    }
};

module.exports = {
    createRequest,
    getActiveTopupMethods,
    getAdminRequests,
    getMyRequests,
    reviewRequest,
};
