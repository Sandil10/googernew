const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth');
const { notificationController } = require('../modules/notifications');

router.get('/', authenticateToken, notificationController.listUnreadNotifications);

router.post('/read-all', authenticateToken, notificationController.markAllNotificationsRead);

router.post('/', authenticateToken, notificationController.createNotifications);

router.post('/:id/read', authenticateToken, notificationController.markNotificationRead);

module.exports = router;
module.exports.ensureTable = notificationController.ensureTable;
