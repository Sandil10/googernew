const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');

// Public routes
router.post('/register', authController.register);
router.post('/login', authController.login);

const upload = require('../config/upload');

// Protected routes
router.get('/profile', authMiddleware, authController.getProfile);
router.get('/wallet', authMiddleware, authController.getWallet);
router.put('/update-profile', authMiddleware, upload.single('profile_picture_file'), authController.updateProfile);
router.post('/verify-password', authMiddleware, authController.verifyPassword);

module.exports = router;
