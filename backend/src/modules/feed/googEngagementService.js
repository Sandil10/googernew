const jwt = require('jsonwebtoken');
const googEngagementRepository = require('./googEngagementRepository');

const getOptionalUserId = (req) => {
    if (req.user?.id) return req.user.id;

    const authHeader = req.header('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.replace('Bearer ', '') : authHeader;
    if (!token) return null;

    try {
        const secret = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET;
        const decoded = jwt.verify(token, secret);
        return decoded?.id || null;
    } catch {
        return null;
    }
};

const getViewerKeyFromRequest = (req) => {
    const headerValue = String(req.headers['x-googer-viewer-key'] || '').trim();
    return headerValue.slice(0, 160) || null;
};

const toUtcIso = (value) => {
    if (!value) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(raw)
        ? `${raw.replace(' ', 'T')}Z`
        : raw;
    const date = new Date(normalized);
    const time = date.getTime();
    return Number.isFinite(time) ? date.toISOString() : null;
};

const normalizeRows = (rows) => rows.map((row) => ({
    ...row,
    created_at: toUtcIso(row.created_at),
}));

const logShare = async (req) => {
    await googEngagementRepository.ensureGoogSchema();
    const postId = Number.parseInt(req.params.id, 10);
    const userId = getOptionalUserId(req);
    const ipAddress = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;

    const existingShare = await googEngagementRepository.findExistingShareToday({ postId, userId, ipAddress });
    if (existingShare.rows.length > 0) {
        return { success: true, incremented: false };
    }

    await googEngagementRepository.insertShare({ postId, userId, ipAddress });
    await googEngagementRepository.incrementSharesCount(postId);
    return { success: true, incremented: true };
};

const logView = async (req) => {
    await googEngagementRepository.ensureGoogSchema();
    const postId = Number.parseInt(req.params.id, 10);
    const userId = getOptionalUserId(req);
    const ipAddress = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
    const viewerKey = getViewerKeyFromRequest(req);

    let viewCheck;
    if (userId) {
        viewCheck = await googEngagementRepository.findViewByUserId({ postId, userId });
    } else if (viewerKey) {
        viewCheck = await googEngagementRepository.findViewByViewerKey({ postId, viewerKey });
    } else {
        viewCheck = await googEngagementRepository.findViewByIpAddress({ postId, ipAddress });
    }

    let shouldIncrement = false;
    if (!viewCheck.rows.length) {
        await googEngagementRepository.insertView({ postId, userId, viewerKey, ipAddress });
        shouldIncrement = true;
    } else {
        const diffHours = (Date.now() - new Date(viewCheck.rows[0].last_viewed_at).getTime()) / (1000 * 60 * 60);
        if (diffHours >= 24) {
            await googEngagementRepository.refreshView({ id: viewCheck.rows[0].id, viewerKey, ipAddress });
            shouldIncrement = true;
        }
    }

    let viewsCount = null;
    if (shouldIncrement) {
        const updated = await googEngagementRepository.incrementViewsCount(postId);
        viewsCount = Number(updated.rows[0]?.views_count || 0);
    } else {
        const current = await googEngagementRepository.getPostViewCount(postId);
        viewsCount = Number(current.rows[0]?.views_count || 0);
    }

    return { success: true, incremented: shouldIncrement, views_count: viewsCount, views: viewsCount };
};

const getLikes = async (req) => {
    await googEngagementRepository.ensureGoogSchema();
    const result = await googEngagementRepository.getLikes(Number.parseInt(req.params.id, 10));
    return { success: true, data: normalizeRows(result.rows) };
};

const getShares = async (req) => {
    await googEngagementRepository.ensureGoogSchema();
    const result = await googEngagementRepository.getShares(Number.parseInt(req.params.id, 10));
    return { success: true, data: normalizeRows(result.rows) };
};

const getViews = async (req) => {
    await googEngagementRepository.ensureGoogSchema();
    const postId = Number.parseInt(req.params.id, 10);
    const result = await googEngagementRepository.getViews(postId);
    const normalizedViews = normalizeRows(result.rows);

    const countResult = await googEngagementRepository.getPostViewCount(postId);
    const totalViews = Number(countResult.rows[0]?.views_count || 0);
    const missingViewRows = Math.max(0, totalViews - normalizedViews.length);

    if (missingViewRows > 0) {
        normalizedViews.push({
            id: `legacy-views-${postId}`,
            user_id: null,
            username: `${missingViewRows.toLocaleString()} legacy/anonymous view${missingViewRows === 1 ? '' : 's'}`,
            full_name: `${missingViewRows.toLocaleString()} legacy/anonymous view${missingViewRows === 1 ? '' : 's'}`,
            profile_picture: null,
            created_at: toUtcIso(countResult.rows[0]?.created_at),
            is_aggregate: true,
            count: missingViewRows,
        });
    }

    return { success: true, data: normalizedViews };
};

module.exports = {
    getLikes,
    getShares,
    getViews,
    logShare,
    logView,
};
