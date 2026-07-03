const adminHistoryService = require('./adminHistoryService');

const handleError = (res, error, context) => {
    console.error(`[adminHistoryModule] ${context} error:`, error);
    return res.status(500).json({ success: false, message: error.message });
};

const getAllTransactions = async (req, res) => {
    try {
        return res.json(await adminHistoryService.getAllTransactions());
    } catch (error) {
        return handleError(res, error, 'getAllTransactions');
    }
};

const getCoinCollectDetail = async (req, res) => {
    try {
        return res.json(await adminHistoryService.getCoinCollectDetail());
    } catch (error) {
        return handleError(res, error, 'getCoinCollectDetail');
    }
};

const getProfilePromoteDetail = async (req, res) => {
    try {
        return res.json(await adminHistoryService.getProfilePromoteDetail());
    } catch (error) {
        return handleError(res, error, 'getProfilePromoteDetail');
    }
};

const getAdPromoteCollectionDetail = async (req, res) => {
    try {
        return res.json(await adminHistoryService.getAdPromoteCollectionDetail());
    } catch (error) {
        return handleError(res, error, 'getAdPromoteCollectionDetail');
    }
};

const getProductCommissionHistory = async (req, res) => {
    try {
        return res.json(await adminHistoryService.getProductCommissionHistory());
    } catch (error) {
        return handleError(res, error, 'getProductCommissionHistory');
    }
};

const getCapitalTransferHistory = async (req, res) => {
    try {
        return res.json(await adminHistoryService.getCapitalTransferHistory());
    } catch (error) {
        return handleError(res, error, 'getCapitalTransferHistory');
    }
};

const getWithdrawalTransactions = async (req, res) => {
    try {
        return res.json(await adminHistoryService.getWithdrawalTransactions());
    } catch (error) {
        return handleError(res, error, 'getWithdrawalTransactions');
    }
};

module.exports = {
    getAdPromoteCollectionDetail,
    getAllTransactions,
    getCapitalTransferHistory,
    getCoinCollectDetail,
    getProductCommissionHistory,
    getProfilePromoteDetail,
    getWithdrawalTransactions,
};
