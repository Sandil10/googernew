const legacyWalletController = require('../../controllers/walletController');
const walletService = require('./walletService');

const handleError = (res, error, context, fallbackMessage) => {
    if (error.statusCode && error.statusCode < 500) {
        return res.status(error.statusCode).json({ success: false, message: error.message });
    }

    console.error(`[walletModule] ${context} error:`, error);
    return res.status(500).json({ success: false, message: fallbackMessage });
};

const searchUsers = async (req, res) => {
    try {
        return res.status(200).json(await walletService.searchUsers({
            includeSelf: String(req.query.includeSelf || '').toLowerCase() === 'true',
            query: req.query.query,
            viewerUserId: req.user.id,
        }));
    } catch (error) {
        return handleError(res, error, 'searchUsers', 'Server error searching users');
    }
};

const getTransactionHistory = async (req, res) => {
    try {
        return res.status(200).json(await walletService.getTransactionHistory(req.user.id));
    } catch (error) {
        return handleError(res, error, 'getTransactionHistory', 'Server error fetching transaction history');
    }
};

const getPendingRequests = async (req, res) => {
    try {
        return res.status(200).json(await walletService.getPendingRequests(req.user.id));
    } catch (error) {
        return handleError(res, error, 'getPendingRequests', 'Server error fetching requests');
    }
};

const getAllTransactionsAdmin = async (req, res) => {
    try {
        return res.status(200).json(await walletService.getAllTransactionsAdmin());
    } catch (error) {
        return handleError(res, error, 'getAllTransactionsAdmin', 'Server error fetching all transactions');
    }
};

module.exports = {
    addAdminCapital: legacyWalletController.addAdminCapital,
    getAllTransactionsAdmin,
    getPendingRequests,
    getTransactionHistory,
    cancelTransaction: legacyWalletController.cancelTransaction,
    directTransfer: legacyWalletController.directTransfer,
    initiateTransferRequest: legacyWalletController.initiateTransferRequest,
    payOrder: legacyWalletController.payOrder,
    payProfilePromote: legacyWalletController.payProfilePromote,
    recordPromoAd: legacyWalletController.recordPromoAd,
    respondToRequest: legacyWalletController.respondToRequest,
    searchUsers,
    verifyManualPaymentHold: legacyWalletController.verifyManualPaymentHold,
};
