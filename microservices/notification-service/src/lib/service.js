const repository = require('./repository');

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

const processFanoutJob = async (payload = {}) => {
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

    await repository.ensureTable();

    const notifications = await repository.insertNotifications({
        targetIds,
        title,
        message,
        type: normalizeNotificationType(payload.type),
        themeColor: normalizeThemeColor(payload),
        themeFontColor: normalizeFontColor(payload),
        themeFontSize: normalizeFontSize(payload),
    });

    return {
        delivered: true,
        notifications,
    };
};

module.exports = {
    processFanoutJob,
};
