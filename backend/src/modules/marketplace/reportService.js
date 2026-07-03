const reportRepository = require('./reportRepository');

const submitReport = async (itemIdValue, userId, body) => {
    const itemId = Number.parseInt(String(itemIdValue || ''), 10);
    if (!itemId || Number.isNaN(itemId)) {
        const error = new Error('Invalid item ID');
        error.statusCode = 400;
        throw error;
    }

    const { reason, custom_reason } = body || {};
    if (!reason) {
        const error = new Error('Reason required');
        error.statusCode = 400;
        throw error;
    }

    await reportRepository.ensureReportsSchema();
    const existing = await reportRepository.findExistingReport(itemId, userId);
    if (existing) {
        const error = new Error('Already reported');
        error.statusCode = 409;
        throw error;
    }

    await reportRepository.insertReport(itemId, userId, reason, custom_reason);
    return { success: true, message: 'Report submitted' };
};

module.exports = {
    submitReport,
};
