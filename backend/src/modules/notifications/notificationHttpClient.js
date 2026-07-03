const SERVICE_URL = () => String(process.env.NOTIFICATION_SERVICE_URL || '').trim().replace(/\/+$/, '');

const getInternalHeaders = (extra = {}) => {
    const headers = { ...extra };
    const token = String(process.env.INTERNAL_SERVICE_TOKEN || '').trim();
    if (token) headers['x-internal-service-token'] = token;
    return headers;
};

const isRemoteNotificationServiceEnabled = () => Boolean(SERVICE_URL());

const assertOk = async (response) => {
    if (response.ok) return;
    const text = await response.text().catch(() => '');
    throw new Error(`Notification service request failed (${response.status}): ${text || response.statusText}`);
};

const createNotifications = async (payload = {}) => {
    const response = await fetch(`${SERVICE_URL()}/internal/notifications/fanout`, {
        method: 'POST',
        headers: getInternalHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify(payload),
    });
    await assertOk(response);
    return response.json();
};

module.exports = {
    createNotifications,
    isRemoteNotificationServiceEnabled,
};
