const adminHistoryRepository = require('./adminHistoryRepository');

const getAllTransactions = async () => {
    const result = await adminHistoryRepository.getAllTransactions();
    return { success: true, transactions: result.rows };
};

const getCoinCollectDetail = async () => {
    const result = await adminHistoryRepository.getCoinCollectDetail();
    return result.rows;
};

const getProfilePromoteDetail = async () => {
    const result = await adminHistoryRepository.getProfilePromoteDetail();
    return result.rows;
};

const getAdPromoteCollectionDetail = async () => {
    const result = await adminHistoryRepository.getAdPromoteCollectionDetail();
    return result.rows;
};

const getProductCommissionHistory = async () => {
    const result = await adminHistoryRepository.getProductCommissionHistory();
    return result.rows;
};

const getCapitalTransferHistory = async () => {
    const result = await adminHistoryRepository.getCapitalTransferHistory();
    return result.rows;
};

const getWithdrawalTransactions = async () => {
    const result = await adminHistoryRepository.getWithdrawalTransactions();
    return result.rows;
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
