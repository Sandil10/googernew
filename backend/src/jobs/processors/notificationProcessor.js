const { notificationService } = require('../../modules/notifications');

const processNotificationFanoutRequested = async ({ job }) => (
    notificationService.processFanoutJob(job?.payload || {})
);

module.exports = {
    processNotificationFanoutRequested,
};
