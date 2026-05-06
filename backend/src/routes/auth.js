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
router.get('/check-username', authMiddleware, authController.checkUsernameAvailability);
router.get('/wallet', authMiddleware, authController.getWallet);
router.put('/update-profile', authMiddleware, upload.single('profile_picture_file'), authController.updateProfile);
router.put('/update-shipping-address', authMiddleware, authController.updateShippingAddress);
router.post('/change-password', authMiddleware, authController.changePassword);
router.post('/verify-password', authMiddleware, authController.verifyPassword);
router.post('/user/:id/subscribe', authMiddleware, authController.toggleSubscription);
router.post('/user/:id/view', authController.logProfileView);

module.exports = router;
