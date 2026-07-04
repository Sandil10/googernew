const { enqueueBackgroundJob } = require('../../../shared/utils/backgroundJobQueue');
const { JOB_TYPES, QUEUES } = require('./jobTypes');

const enqueueJob = (poolOrClient, options = {}) => enqueueBackgroundJob(poolOrClient, {
    queueName: QUEUES.MAIN,
    maxAttempts: 10,
    ...options,
});

const enqueueMediaCompression = (poolOrClient, payload = {}, options = {}) => enqueueJob(poolOrClient, {
    jobType: JOB_TYPES.MEDIA_COMPRESSION_REQUESTED,
    queueName: QUEUES.MEDIA,
    jobKey: options.jobKey || null,
    payload,
    ...options,
});

const enqueueNotificationFanout = (poolOrClient, payload = {}, options = {}) => enqueueJob(poolOrClient, {
    jobType: JOB_TYPES.NOTIFICATION_FANOUT_REQUESTED,
    queueName: QUEUES.NOTIFICATIONS,
    jobKey: options.jobKey || null,
    payload,
    ...options,
});

const enqueueReportGeneration = (poolOrClient, payload = {}, options = {}) => enqueueJob(poolOrClient, {
    jobType: JOB_TYPES.REPORT_GENERATION_REQUESTED,
    jobKey: options.jobKey || null,
    payload,
    maxAttempts: options.maxAttempts || 3,
    ...options,
});

module.exports = {
    enqueueJob,
    enqueueMediaCompression,
    enqueueNotificationFanout,
    enqueueReportGeneration,
};
