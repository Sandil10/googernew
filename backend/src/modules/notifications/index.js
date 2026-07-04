const notificationController = require('./notificationController');
const notificationRepository = require('./notificationRepository');
const notificationService = require('./notificationService');

module.exports = {
    ...notificationController,
    ...notificationService,
    notificationController,
    notificationRepository,
    notificationService,
};
