const reportAdsRepository = require('./reportAdsRepository');

const submitAdReport = async (adIdValue, userId, body) => {
    const adId = String(adIdValue || '').replace(/^ad-/i, '').trim();
    if (!adId) {
        const error = new Error('Invalid ad ID');
        error.statusCode = 400;
        throw error;
    }

    const { reason, custom_reason } = body || {};
    if (!reason) {
        const error = new Error('Reason required');
        error.statusCode = 400;
        throw error;
    }

    await reportAdsRepository.ensureAdReportsSchema();

    const existing = await reportAdsRepository.findExistingReport(adId, userId);
    if (existing) {
        const error = new Error('Already reported');
        error.statusCode = 409;
        throw error;
    }

    await reportAdsRepository.insertReport(adId, userId, reason, custom_reason);
    return { success: true, message: 'Report submitted' };
};

module.exports = {
    submitAdReport,
};
