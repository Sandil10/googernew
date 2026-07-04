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
router.post('/login/device-approval/status', authController.getDeviceApprovalStatus);
router.post('/forgot-password/request-otp', authController.requestPasswordResetOtp);
router.post('/forgot-password/verify-otp', authController.verifyPasswordResetOtp);
router.post('/forgot-password/reset', authController.resetPasswordWithOtp);
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
router.post('/security/request-otp', authMiddleware, authController.requestAccountSecurityOtp);
router.post('/security/verify-otp', authMiddleware, authController.verifyAccountSecurityOtp);
router.post('/security/change-email', authMiddleware, authController.changeLoginEmailWithOtp);
router.post('/security/reset-password', authMiddleware, authController.resetLoggedInPasswordWithOtp);
router.post('/security/passkey', authMiddleware, authController.savePasskeyWithOtp);
router.post('/security/two-factor-phone', authMiddleware, authController.saveTwoFactorPhone);
router.post('/security/otp-delivery', authMiddleware, authController.updateOtpDeliveryMethod);
router.get('/sessions', authMiddleware, authController.getAuthSessions);
router.get('/sessions/history', authMiddleware, authController.getAuthSessionHistory);
router.post('/sessions/logout-others', authMiddleware, authController.logoutOtherAuthSessions);
router.patch('/sessions/:id', authMiddleware, authController.updateAuthSession);
router.delete('/sessions/:id', authMiddleware, authController.removeAuthSession);
router.post('/user/:id/subscribe', authMiddleware, socialSubscriptionsController.toggleSubscription);
router.post('/user/:id/view', readController.logProfileView);
router.post('/user/:id/report', authMiddleware, authController.reportUser);
router.post('/user/:id/block', authMiddleware, readController.toggleBlockUser);

module.exports = router;
