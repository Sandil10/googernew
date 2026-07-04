const { normalizeMoney } = require('../../../../../shared/utils/financeBoundary');
const coinRequestRepository = require('./coinRequestRepository');

const getMyRequests = async (userId) => {
    const result = await coinRequestRepository.getMyRequests(userId);
    return { success: true, requests: result.rows };
};

const createRequest = async ({ client, userId, methodCategory, methodName, bankName, amount, notes }) => {
    const numAmount = normalizeMoney(amount);
    const normalizedNotes = notes?.trim() || null;
    const normalizedBankName = bankName || null;

    if (!methodCategory || !methodName) {
        const error = new Error('method_category and method_name are required.');
        error.statusCode = 400;
        throw error;
    }
    if (!numAmount || numAmount <= 0) {
        const error = new Error('Enter a valid amount greater than 0.');
        error.statusCode = 400;
        throw error;
    }

    await coinRequestRepository.lockUser(client, userId);

    const duplicate = await coinRequestRepository.getDuplicatePendingRequest(client, {
        amount: numAmount,
        bankName: normalizedBankName,
        methodCategory,
        methodName,
        notes: normalizedNotes,
        userId,
    });
    if (duplicate.rows.length > 0) {
        return {
            duplicateSuppressed: true,
            request: duplicate.rows[0],
            success: true,
        };
    }

    const result = await coinRequestRepository.insertCoinRequest(client, {
        amount: numAmount,
        bankName: normalizedBankName,
        methodCategory,
        methodName,
        notes: normalizedNotes,
        userId,
    });

    return { success: true, request: result.rows[0] };
};

const getAdminRequests = async ({ adminUserId, status }) => {
    if (!await coinRequestRepository.isAdmin(adminUserId)) {
        const error = new Error('Admin access required.');
        error.statusCode = 403;
        throw error;
    }

    const result = await coinRequestRepository.getAdminRequests(status);
    return { success: true, requests: result.rows };
};

const reviewRequest = async ({ action, adminUserId, client, rejectionReason, requestId }) => {
    if (!await coinRequestRepository.isAdmin(adminUserId)) {
        const error = new Error('Admin access required.');
        error.statusCode = 403;
        throw error;
    }
    if (!['approve', 'reject'].includes(action)) {
        const error = new Error('action must be "approve" or "reject".');
        error.statusCode = 400;
        throw error;
    }

    const existing = await coinRequestRepository.getLockedRequestById(client, requestId);
    if (!existing.rows.length) {
        const error = new Error('Request not found.');
        error.statusCode = 404;
        throw error;
    }
    if (existing.rows[0].status !== 'Pending') {
        const error = new Error(`Request is already ${existing.rows[0].status}.`);
        error.statusCode = 409;
        throw error;
    }
    if (action === 'reject' && !rejectionReason?.trim()) {
        const error = new Error('rejection_reason is required when rejecting.');
        error.statusCode = 400;
        throw error;
    }

    await coinRequestRepository.reviewRequest(client, {
        newStatus: action === 'approve' ? 'Verified' : 'Rejected',
        rejectionReason: action === 'reject' ? rejectionReason.trim() : null,
        requestId,
    });

    return {
        action,
        success: true,
    };
};

const getActiveTopupMethods = async () => {
    const result = await coinRequestRepository.getActiveTopupMethods();
    return { success: true, data: result.rows };
};

module.exports = {
    createRequest,
    getActiveTopupMethods,
    getAdminRequests,
    getMyRequests,
    reviewRequest,
};
