const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { accountController, readController } = require('../modules/auth');
const { socialSubscriptionsController } = require('../modules/subscriptions');
const authMiddleware = require('../middleware/auth');

// Public routes
router.post('/register', authController.register);
router.get('/username/:username', readController.getUserByUsername);
router.post('/login', authController.login);
router.get('/user/:id', readController.getUserById);
router.get('/user/:id/subscription', socialSubscriptionsController.getSubscriptionStatus);
router.get('/user/:id/followers', socialSubscriptionsController.getFollowerUsers);
router.get('/user/:id/following', socialSubscriptionsController.getFollowingUsers);
router.get('/user/:id/blocked', readController.getBlockedUsers);
router.get('/user/:id/views', readController.getProfileViews);

const upload = require('../config/upload');

// Protected routes
router.get('/profile', authMiddleware, readController.getProfile);
router.get('/suspension', authMiddleware, accountController.getMySuspension);
router.post('/suspension/appeal', authMiddleware, accountController.submitSuspensionAppeal);
router.post('/self-deactivate', authMiddleware, accountController.selfDeactivateAccount);
router.post('/self-delete', authMiddleware, accountController.selfDeleteAccount);
router.get('/check-username', authMiddleware, accountController.checkUsernameAvailability);
router.get('/wallet', authMiddleware, authController.getWallet);
router.put('/update-profile', authMiddleware, upload.single('profile_picture_file'), authController.updateProfile);
router.put('/update-shipping-address', authMiddleware, accountController.updateShippingAddress);
router.post('/change-password', authMiddleware, accountController.changePassword);
router.post('/verify-password', authMiddleware, accountController.verifyPassword);
router.post('/user/:id/subscribe', authMiddleware, socialSubscriptionsController.toggleSubscription);
router.post('/user/:id/view', readController.logProfileView);
router.post('/user/:id/report', authMiddleware, authController.reportUser);
router.post('/user/:id/block', authMiddleware, readController.toggleBlockUser);

module.exports = router;
