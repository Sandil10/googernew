const notificationService = require('./notificationService');

const listUnreadNotifications = async (req, res) => {
    try {
        const notifications = await notificationService.getUnreadNotifications(req.user.id);
        res.json({ success: true, notifications });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const markAllNotificationsRead = async (req, res) => {
    try {
        await notificationService.markAllRead(req.user.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const createNotifications = async (req, res) => {
    try {
        const notifications = await notificationService.createNotifications({
            actorUserId: req.user.id,
            body: req.body,
        });

        res.status(201).json({
            success: true,
            count: notifications.length,
            notifications,
        });
    } catch (error) {
        console.error('[notifications] create notification error:', error);
        res.status(error.statusCode || 500).json({ success: false, message: error.message });
    }
};

const markNotificationRead = async (req, res) => {
    try {
        await notificationService.markOneRead(req.params.id, req.user.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    createNotifications,
    ensureTable: notificationService.ensureTable,
    listUnreadNotifications,
    markAllNotificationsRead,
    markNotificationRead,
};
