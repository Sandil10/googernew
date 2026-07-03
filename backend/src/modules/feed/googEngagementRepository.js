const pool = require('../../config/database');
const googReadRepository = require('./googReadRepository');

const ensureGoogSchema = () => googReadRepository.ensureGoogSchema();

const findExistingShareToday = async ({ postId, userId, ipAddress }) => pool.query(
    userId
        ? `SELECT id
           FROM goog_shares
           WHERE goog_id = $1 AND user_id = $2 AND created_at::date = CURRENT_DATE
           LIMIT 1`
        : `SELECT id
           FROM goog_shares
           WHERE goog_id = $1 AND ip_address = $2 AND user_id IS NULL AND created_at::date = CURRENT_DATE
           LIMIT 1`,
    userId ? [postId, userId] : [postId, ipAddress]
);

const insertShare = async ({ postId, userId, ipAddress }) => pool.query(
    'INSERT INTO goog_shares (goog_id, user_id, ip_address) VALUES ($1, $2, $3)',
    [postId, userId, ipAddress]
);

const incrementSharesCount = async (postId) => pool.query(
    'UPDATE goog_posts SET shares_count = COALESCE(shares_count, 0) + 1 WHERE id = $1',
    [postId]
);

const findViewByUserId = async ({ postId, userId }) => pool.query(
    'SELECT id, last_viewed_at FROM goog_views WHERE goog_id = $1 AND user_id = $2 LIMIT 1',
    [postId, userId]
);

const findViewByViewerKey = async ({ postId, viewerKey }) => pool.query(
    'SELECT id, last_viewed_at FROM goog_views WHERE goog_id = $1 AND viewer_key = $2 AND user_id IS NULL LIMIT 1',
    [postId, viewerKey]
);

const findViewByIpAddress = async ({ postId, ipAddress }) => pool.query(
    'SELECT id, last_viewed_at FROM goog_views WHERE goog_id = $1 AND ip_address = $2 AND user_id IS NULL LIMIT 1',
    [postId, ipAddress]
);

const insertView = async ({ postId, userId, viewerKey, ipAddress }) => pool.query(
    'INSERT INTO goog_views (goog_id, user_id, viewer_key, ip_address, last_viewed_at) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)',
    [postId, userId, viewerKey, ipAddress]
);

const refreshView = async ({ id, viewerKey, ipAddress }) => pool.query(
    'UPDATE goog_views SET last_viewed_at = CURRENT_TIMESTAMP, viewer_key = COALESCE($1, viewer_key), ip_address = $2 WHERE id = $3',
    [viewerKey, ipAddress, id]
);

const incrementViewsCount = async (postId) => pool.query(
    'UPDATE goog_posts SET views_count = COALESCE(views_count, 0) + 1 WHERE id = $1 RETURNING views_count',
    [postId]
);

const getPostViewCount = async (postId) => pool.query(
    'SELECT COALESCE(views_count, 0)::int AS views_count, created_at FROM goog_posts WHERE id = $1 LIMIT 1',
    [postId]
);

const getLikes = async (postId) => pool.query(
    `SELECT gl.id, gl.created_at, u.id as user_id, u.username, u.full_name, u.profile_picture
     FROM goog_likes gl
     JOIN users u ON u.id = gl.user_id
     WHERE gl.goog_id = $1
     ORDER BY gl.created_at DESC`,
    [postId]
);

const getShares = async (postId) => pool.query(
    `SELECT gs.id, gs.created_at, u.id as user_id, u.username, u.profile_picture
     FROM goog_shares gs
     LEFT JOIN users u ON u.id = gs.user_id
     WHERE gs.goog_id = $1
     ORDER BY gs.created_at DESC`,
    [postId]
);

const getViews = async (postId) => pool.query(
    `SELECT gv.id, gv.last_viewed_at as created_at, u.id as user_id, u.username, u.full_name, u.profile_picture
     FROM goog_views gv
     LEFT JOIN users u ON u.id = gv.user_id
     WHERE gv.goog_id = $1
     ORDER BY gv.last_viewed_at DESC`,
    [postId]
);

module.exports = {
    ensureGoogSchema,
    findExistingShareToday,
    findViewByIpAddress,
    findViewByUserId,
    findViewByViewerKey,
    getLikes,
    getPostViewCount,
    getShares,
    getViews,
    incrementSharesCount,
    incrementViewsCount,
    insertShare,
    insertView,
    refreshView,
};
