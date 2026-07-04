const pool = require('../../config/database');
const googReadRepository = require('./googReadRepository');

const ensureGoogSchema = () => googReadRepository.ensureGoogSchema();

const countPostsByUser = async (userId) => pool.query(
    'SELECT COUNT(*)::int AS c FROM goog_posts WHERE user_id = $1',
    [userId]
);

const countColoredPostsByUser = async (userId) => pool.query(
    `SELECT COUNT(*)::int AS c
     FROM goog_posts
     WHERE user_id = $1
       AND UPPER(text_color) != '#FFFFFF'
       AND text_color IS NOT NULL
       AND text_color != ''`,
    [userId]
);

const createPost = async ({ userId, text, textColor, shareCode }) => pool.query(
    `INSERT INTO goog_posts (user_id, text, text_color, share_code, created_at, updated_at)
     VALUES ($1, $2, $3, $4, NOW(), NOW())
     RETURNING *`,
    [userId, text, textColor, shareCode]
);

const updatePostShareCode = async ({ postId, shareCode }) => pool.query(
    'UPDATE goog_posts SET share_code = $1 WHERE id = $2',
    [shareCode, postId]
);

const updatePost = async ({ id, userId, text, textColor }) => pool.query(
    `UPDATE goog_posts
     SET text = $1, text_color = $2, updated_at = NOW()
     WHERE id = $3 AND user_id = $4
     RETURNING *`,
    [text, textColor, id, userId]
);

const deletePost = async ({ id, userId }) => pool.query(
    'DELETE FROM goog_posts WHERE id = $1 AND user_id = $2 RETURNING id',
    [id, userId]
);

module.exports = {
    countColoredPostsByUser,
    countPostsByUser,
    createPost,
    deletePost,
    ensureGoogSchema,
    updatePost,
    updatePostShareCode,
};
