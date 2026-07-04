const notificationRepository = require('./notificationRepository');
const notificationHttpClient = require('./notificationHttpClient');

const ensureTable = async () => {
    await notificationRepository.ensureTable();
};

const assertAdmin = async (userId) => {
    const userType = await notificationRepository.getUserType(userId);
    return String(userType || '').toLowerCase() === 'admin';
};

const normalizeNotificationType = (value) => {
    const type = String(value || 'info').trim().toLowerCase();
    return type.slice(0, 30) || 'info';
};

const normalizeThemeColor = (body = {}) => {
    const value = body.theme_color || body.themeColor || body.background_color || body.backgroundColor || body.color || null;
    if (value === null || value === undefined) return null;
    const color = String(value).trim();
    return color ? color.slice(0, 200) : null;
};

const normalizeFontColor = (body = {}) => {
    const value = body.theme_font_color || body.themeFontColor || body.font_color || body.fontColor || null;
    if (value === null || value === undefined) return null;
    const color = String(value).trim();
    return color ? color.slice(0, 40) : null;
};

const normalizeFontSize = (body = {}) => {
    const size = String(body.theme_font_size || body.themeFontSize || body.font_size || body.fontSize || '').trim().toLowerCase();
    return ['small', 'normal', 'large'].includes(size) ? size : null;
};

const getUnreadNotifications = async (userId) => {
    await ensureTable();
    return notificationRepository.getUnreadNotifications(userId);
};

const markAllRead = async (userId) => {
    await ensureTable();
    await notificationRepository.markAllRead(userId);
};

const markOneRead = async (notificationId, userId) => {
    await ensureTable();
    await notificationRepository.markOneRead(notificationId, userId);
};

const resolveTargetUserIds = async (body = {}) => {
    const requestedIds = Array.isArray(body.user_ids)
        ? body.user_ids
        : Array.isArray(body.userIds)
            ? body.userIds
            : (body.user_id || body.userId ? [body.user_id || body.userId] : []);

    let targetIds = requestedIds
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0);

    if (targetIds.length === 0) {
        targetIds = await notificationRepository.getAllUserIds();
    }

    return targetIds;
};

const buildCreatePayload = async (body = {}) => {
    const title = String(body.title || '').trim();
    const message = String(body.message || '').trim();
    if (!title || !message) {
        const error = new Error('Title and message are required');
        error.statusCode = 400;
        throw error;
    }

    const targetIds = await resolveTargetUserIds(body);
    if (targetIds.length === 0) {
        const error = new Error('No users found for this notification');
        error.statusCode = 400;
        throw error;
    }

    return {
        message,
        targetIds,
        themeColor: normalizeThemeColor(body),
        themeFontColor: normalizeFontColor(body),
        themeFontSize: normalizeFontSize(body),
        title,
        type: normalizeNotificationType(body.type),
    };
};

const createNotifications = async ({ actorUserId, body = {} } = {}) => {
    await ensureTable();
    if (!await assertAdmin(actorUserId)) {
        const error = new Error('Admin access required');
        error.statusCode = 403;
        throw error;
    }

    const payload = await buildCreatePayload(body);
    if (notificationHttpClient.isRemoteNotificationServiceEnabled()) {
        const response = await notificationHttpClient.createNotifications(payload);
        return Array.isArray(response.notifications) ? response.notifications : [];
    }

    return notificationRepository.insertNotifications(payload);
};

const processFanoutJob = async (payload = {}) => {
    await ensureTable();
    const targetIds = Array.isArray(payload.targetIds)
        ? payload.targetIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
        : [];

    const title = String(payload.title || '').trim();
    const message = String(payload.message || '').trim();
    if (!title || !message || targetIds.length === 0) {
        return {
            delivered: false,
            reason: 'missing-target-or-message',
        };
    }

    const requestPayload = {
        targetIds,
        title,
        message,
        type: normalizeNotificationType(payload.type),
        themeColor: normalizeThemeColor(payload),
        themeFontColor: normalizeFontColor(payload),
        themeFontSize: normalizeFontSize(payload),
    };

    if (notificationHttpClient.isRemoteNotificationServiceEnabled()) {
        return notificationHttpClient.createNotifications(requestPayload);
    }

    const notifications = await notificationRepository.insertNotifications(requestPayload);
    return {
        delivered: true,
        notifications,
    };
};

module.exports = {
    assertAdmin,
    createNotifications,
    ensureTable,
    getUnreadNotifications,
    markAllRead,
    markOneRead,
    processFanoutJob,
};
