const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { adminHistoryController } = require('../modules/adminHistory');

router.use(authMiddleware);

router.get('/all-transactions', adminHistoryController.getAllTransactions);
router.get('/coin-collect-detail', adminHistoryController.getCoinCollectDetail);
router.get('/profile-promote-detail', adminHistoryController.getProfilePromoteDetail);
router.get('/ad-promote-collection-detail', adminHistoryController.getAdPromoteCollectionDetail);
router.get('/product-commission-history', adminHistoryController.getProductCommissionHistory);
router.get('/capital-transfer-history', adminHistoryController.getCapitalTransferHistory);
router.get('/withdrawal-transactions', adminHistoryController.getWithdrawalTransactions);

module.exports = router;
