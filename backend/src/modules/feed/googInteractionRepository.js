const pool = require('../../config/database');
const googReadRepository = require('./googReadRepository');

const ensureGoogSchema = () => googReadRepository.ensureGoogSchema();
const ensureSavedGoogsSchema = () => googReadRepository.ensureSavedGoogsSchema();

const findLike = async ({ postId, userId }) => pool.query(
    'SELECT 1 FROM goog_likes WHERE goog_id = $1 AND user_id = $2',
    [postId, userId]
);

const deleteLike = async ({ postId, userId }) => pool.query(
    'DELETE FROM goog_likes WHERE goog_id = $1 AND user_id = $2',
    [postId, userId]
);

const decrementLikesCount = async (postId) => pool.query(
    'UPDATE goog_posts SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0) WHERE id = $1',
    [postId]
);

const insertLike = async ({ postId, userId }) => pool.query(
    'INSERT INTO goog_likes (goog_id, user_id) VALUES ($1, $2)',
    [postId, userId]
);

const incrementLikesCount = async (postId) => pool.query(
    'UPDATE goog_posts SET likes_count = COALESCE(likes_count, 0) + 1 WHERE id = $1',
    [postId]
);

const findSubscription = async ({ postId, userId }) => pool.query(
    'SELECT 1 FROM goog_subscribes WHERE goog_id = $1 AND user_id = $2',
    [postId, userId]
);

const deleteSubscription = async ({ postId, userId }) => pool.query(
    'DELETE FROM goog_subscribes WHERE goog_id = $1 AND user_id = $2',
    [postId, userId]
);

const insertSubscription = async ({ postId, userId }) => pool.query(
    'INSERT INTO goog_subscribes (goog_id, user_id) VALUES ($1, $2)',
    [postId, userId]
);

const ensureReportsTable = async () => {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS goog_reports (
            id SERIAL PRIMARY KEY,
            goog_id INTEGER NOT NULL REFERENCES goog_posts(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            reason VARCHAR(200) NOT NULL,
            custom_reason TEXT,
            status VARCHAR(20) DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (goog_id, user_id)
        )
    `).catch(() => {});
    await pool.query('ALTER TABLE goog_reports ALTER COLUMN reason TYPE VARCHAR(200)').catch(() => {});
};

const findExistingReport = async ({ postId, userId }) => pool.query(
    'SELECT 1 FROM goog_reports WHERE goog_id = $1 AND user_id = $2',
    [postId, userId]
);

const insertReport = async ({ postId, userId, reason, customReason }) => pool.query(
    'INSERT INTO goog_reports (goog_id, user_id, reason, custom_reason) VALUES ($1, $2, $3, $4)',
    [postId, userId, reason, customReason || null]
);

const incrementReportsCount = async (postId) => pool.query(
    'UPDATE goog_posts SET reports = COALESCE(reports, 0) + 1 WHERE id = $1',
    [postId]
).catch(() => {});

const insertComment = async ({ postId, userId, text, parentId }) => pool.query(
    `INSERT INTO goog_comments (goog_id, user_id, comment, parent_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id, goog_id, user_id, comment as text, parent_id, likes, dislikes, reports, created_at`,
    [postId, userId, text, Number.isFinite(parentId) ? parentId : null]
);

const incrementCommentsCount = async (postId) => pool.query(
    'UPDATE goog_posts SET comments_count = COALESCE(comments_count, 0) + 1 WHERE id = $1',
    [postId]
);

const getCommentAuthor = async (userId) => pool.query(
    'SELECT username, profile_picture FROM users WHERE id = $1',
    [userId]
);

const fetchComments = async (postId) => pool.query(
    `SELECT gc.id, gc.goog_id, gc.goog_id as market_id, gc.user_id, gc.comment as text,
            gc.parent_id, gc.likes, gc.dislikes, gc.reports, gc.created_at,
            u.username, u.profile_picture
     FROM goog_comments gc
     JOIN users u ON u.id = gc.user_id
     WHERE gc.goog_id = $1
     ORDER BY gc.created_at ASC`,
    [postId]
);

const fetchCommentWithOwner = async (commentId) => pool.query(
    `SELECT gc.*, gp.user_id as post_owner_id
     FROM goog_comments gc
     JOIN goog_posts gp ON gp.id = gc.goog_id
     WHERE gc.id = $1`,
    [commentId]
);

const deleteCommentTree = async (commentId) => pool.query(
    `WITH RECURSIVE comment_tree AS (
        SELECT id, goog_id FROM goog_comments WHERE id = $1
        UNION ALL
        SELECT child.id, child.goog_id
        FROM goog_comments child
        INNER JOIN comment_tree parent ON child.parent_id = parent.id
     ),
     deleted AS (
        DELETE FROM goog_comments
        WHERE id IN (SELECT id FROM comment_tree)
        RETURNING id
     )
     SELECT COUNT(*)::int AS deleted_count FROM deleted`,
    [commentId]
);

const decrementCommentsCount = async ({ postId, deletedCount }) => pool.query(
    'UPDATE goog_posts SET comments_count = GREATEST(COALESCE(comments_count, 0) - $2, 0) WHERE id = $1',
    [postId, deletedCount]
);

const findSavedGoog = async ({ userId, googId }) => pool.query(
    'SELECT id FROM saved_googs WHERE user_id = $1 AND goog_id = $2',
    [userId, googId]
);

const deleteSavedGoog = async ({ userId, googId }) => pool.query(
    'DELETE FROM saved_googs WHERE user_id = $1 AND goog_id = $2',
    [userId, googId]
);

const countSavedGoogs = async (userId) => pool.query(
    'SELECT COUNT(*)::int AS c FROM saved_googs WHERE user_id = $1',
    [userId]
);

const insertSavedGoog = async ({ userId, googId }) => pool.query(
    'INSERT INTO saved_googs (user_id, goog_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [userId, googId]
);

module.exports = {
    countSavedGoogs,
    decrementCommentsCount,
    decrementLikesCount,
    deleteCommentTree,
    deleteLike,
    deleteSavedGoog,
    deleteSubscription,
    ensureGoogSchema,
    ensureReportsTable,
    ensureSavedGoogsSchema,
    fetchCommentWithOwner,
    fetchComments,
    findExistingReport,
    findLike,
    findSavedGoog,
    findSubscription,
    getCommentAuthor,
    incrementCommentsCount,
    incrementLikesCount,
    incrementReportsCount,
    insertComment,
    insertLike,
    insertReport,
    insertSavedGoog,
    insertSubscription,
};
