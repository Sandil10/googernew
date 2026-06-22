const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');

// Public routes
router.post('/register', authController.register);
router.get('/username/:username', authController.getUserByUsername);
router.post('/login', authController.login);
router.get('/user/:id', authController.getUserById);
router.get('/user/:id/subscription', authController.getSubscriptionStatus);
router.get('/user/:id/followers', authController.getFollowerUsers);
router.get('/user/:id/following', authController.getFollowingUsers);
router.get('/user/:id/blocked', authController.getBlockedUsers);
router.get('/user/:id/views', authController.getProfileViews);

const upload = require('../config/upload');

// Protected routes
router.get('/profile', authMiddleware, authController.getProfile);
router.get('/suspension', authMiddleware, authController.getMySuspension);
router.post('/suspension/appeal', authMiddleware, authController.submitSuspensionAppeal);
router.post('/self-deactivate', authMiddleware, authController.selfDeactivateAccount);
router.post('/self-delete', authMiddleware, authController.selfDeleteAccount);
router.get('/check-username', authMiddleware, authController.checkUsernameAvailability);
router.get('/wallet', authMiddleware, authController.getWallet);
router.put('/update-profile', authMiddleware, upload.single('profile_picture_file'), authController.updateProfile);
router.put('/update-shipping-address', authMiddleware, authController.updateShippingAddress);
router.post('/change-password', authMiddleware, authController.changePassword);
router.post('/verify-password', authMiddleware, authController.verifyPassword);
router.post('/user/:id/subscribe', authMiddleware, authController.toggleSubscription);
router.post('/user/:id/view', authController.logProfileView);
router.post('/user/:id/report', authMiddleware, authController.reportUser);
router.post('/user/:id/block', authMiddleware, authController.toggleBlockUser);

module.exports = router;
