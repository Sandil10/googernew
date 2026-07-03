const JOB_TYPES = Object.freeze({
    ADS_MAINTENANCE_SWEEP: 'ads.maintenance.sweep',
    MEDIA_COMPRESSION_REQUESTED: 'media.compression.requested',
    NOTIFICATION_FANOUT_REQUESTED: 'notification.fanout.requested',
    REPORT_GENERATION_REQUESTED: 'report.generation.requested',
    SUBSCRIPTION_RENEWAL_SWEEP: 'subscription.renewal.sweep',
});

const QUEUES = Object.freeze({
    MAIN: 'googer-main',
    MEDIA: 'googer-media',
    NOTIFICATIONS: 'googer-notifications',
    REPORTS: 'googer-reports',
    SUBSCRIPTIONS: 'googer-subscriptions',
});

module.exports = {
    JOB_TYPES,
    QUEUES,
};
