const express = require('express');

const internalOpsAuth = require('../../../../shared/utils/internalOpsAuth');
const { loadEnv } = require('../../shared/runtime/loadEnv');
const notificationRepository = require('./lib/repository');
const notificationService = require('./lib/service');

loadEnv();

const app = express();
app.use(express.json({ limit: '5mb' }));

app.get('/health', async (req, res) => {
    await notificationRepository.ensureTable().catch(() => {});
    res.json({ service: 'notification-service', success: true });
});

app.use('/internal', internalOpsAuth);

app.post('/internal/notifications/fanout', async (req, res) => {
    try {
        await notificationRepository.ensureTable();
        const result = await notificationService.processFanoutJob(req.body || {});
        const notifications = Array.isArray(result?.notifications) ? result.notifications : [];
        res.status(201).json({
            success: true,
            delivered: Boolean(result?.delivered ?? true),
            notifications,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

const port = Number(process.env.NOTIFICATION_SERVICE_PORT || 5004);
app.listen(port, () => {
    console.log(`[notification-service] listening on ${port}`);
});
