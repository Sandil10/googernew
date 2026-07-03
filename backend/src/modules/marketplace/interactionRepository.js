const pool = require('../../config/database');
const productReadRepository = require('./productReadRepository');

const getMarketCommentAuthor = async (userId) => pool.query(
    'SELECT username, profile_picture FROM users WHERE id = $1',
    [userId]
);

const insertMarketComment = async ({ marketId, userId, text, parentId }) => pool.query(
    `INSERT INTO market_comments (market_id, user_id, comment, parent_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id, market_id, user_id, comment AS text, parent_id, created_at`,
    [marketId, userId, text, Number.isFinite(parentId) ? parentId : null]
);

const incrementMarketCommentsCount = async (marketId) => pool.query(
    'UPDATE market SET comments_count = COALESCE(comments_count, 0) + 1 WHERE id = $1',
    [marketId]
);

const getMarketCommentById = async (commentId) => pool.query(
    'SELECT * FROM market_comments WHERE id = $1',
    [commentId]
);

const getMarketOwnerById = async (marketId) => pool.query(
    'SELECT user_id FROM market WHERE id = $1 LIMIT 1',
    [marketId]
);

const deleteMarketCommentTree = async (commentId) => pool.query(
    `WITH RECURSIVE comment_tree AS (
        SELECT id, market_id
        FROM market_comments
        WHERE id = $1
        UNION ALL
        SELECT child.id, child.market_id
        FROM market_comments child
        INNER JOIN comment_tree parent ON child.parent_id = parent.id
     ),
     deleted AS (
        DELETE FROM market_comments
        WHERE id IN (SELECT id FROM comment_tree)
        RETURNING id
     )
     SELECT COUNT(*)::int AS deleted_count FROM deleted`,
    [commentId]
);

const decrementMarketCommentsCount = async ({ marketId, deletedCount }) => pool.query(
    'UPDATE market SET comments_count = GREATEST(COALESCE(comments_count, 0) - $2, 0) WHERE id = $1',
    [marketId, deletedCount]
);

const ensureMarketSharesTable = async () => {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS market_shares (
            id SERIAL PRIMARY KEY,
            market_id INTEGER NOT NULL REFERENCES market(id) ON DELETE CASCADE,
            user_id INTEGER NULL REFERENCES users(id) ON DELETE CASCADE,
            ip_address TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await pool.query('ALTER TABLE market_shares ADD COLUMN IF NOT EXISTS ip_address TEXT;');
};

const findMarketLike = async ({ marketId, userId }) => pool.query(
    'SELECT 1 FROM market_likes WHERE market_id = $1 AND user_id = $2',
    [marketId, userId]
);

const deleteMarketLike = async ({ marketId, userId }) => pool.query(
    'DELETE FROM market_likes WHERE market_id = $1 AND user_id = $2',
    [marketId, userId]
);

const insertMarketLike = async ({ marketId, userId }) => pool.query(
    'INSERT INTO market_likes (market_id, user_id) VALUES ($1, $2)',
    [marketId, userId]
);

const decrementMarketLikesCount = async (marketId) => pool.query(
    'UPDATE market SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0) WHERE id = $1',
    [marketId]
);

const incrementMarketLikesCount = async (marketId) => pool.query(
    'UPDATE market SET likes_count = COALESCE(likes_count, 0) + 1 WHERE id = $1',
    [marketId]
);

const hasCollectedCoinForPromotedProduct = async ({ marketId, userId }) => {
    const result = await pool.query(
        `WITH product_match AS (
            SELECT id, product_code
            FROM market
            WHERE id = $1
            LIMIT 1
        )
        SELECT 1
        FROM ad_coin_collections acc
        JOIN ads a ON a.ad_id = acc.ad_id
        LEFT JOIN product_match p ON TRUE
        WHERE acc.user_id = $2
          AND LOWER(COALESCE(a.campaign_type, '')) = 'product promote'
          AND (
                a.edit_draft::text ILIKE ('%' || $1::text || '%')
                OR (p.product_code IS NOT NULL AND a.edit_draft::text ILIKE ('%' || p.product_code || '%'))
                OR acc.ad_type = 'Product Promote'
          )
        LIMIT 1`,
        [marketId, userId]
    );

    return result.rows.length > 0;
};

const findDailyMarketShareByUser = async ({ marketId, userId }) => pool.query(
    `SELECT id
     FROM market_shares
     WHERE market_id = $1 AND user_id = $2 AND created_at::date = CURRENT_DATE
     LIMIT 1`,
    [marketId, userId]
);

const findDailyMarketShareByIp = async ({ marketId, ipAddress }) => pool.query(
    `SELECT id
     FROM market_shares
     WHERE market_id = $1 AND ip_address = $2 AND user_id IS NULL AND created_at::date = CURRENT_DATE
     LIMIT 1`,
    [marketId, ipAddress]
);

const insertMarketShare = async ({ marketId, userId, ipAddress }) => pool.query(
    'INSERT INTO market_shares (market_id, user_id, ip_address) VALUES ($1, $2, $3)',
    [marketId, userId || null, ipAddress]
);

const incrementMarketSharesCount = async (marketId) => pool.query(
    'UPDATE market SET shares_count = COALESCE(shares_count, 0) + 1 WHERE id = $1',
    [marketId]
);

const resolveMarketId = async (value) => {
    const numericId = parseInt(value, 10);
    if (!Number.isNaN(numericId)) {
        return numericId;
    }

    const productResult = await productReadRepository.getMarketItemByProductCode(String(value || '').trim());
    return productResult.rows[0]?.id || null;
};

const findMarketViewByUser = async ({ marketId, userId }) => pool.query(
    'SELECT last_viewed_at FROM market_views WHERE market_id = $1 AND user_id = $2',
    [marketId, userId]
);

const findMarketViewByIp = async ({ marketId, ipAddress }) => pool.query(
    'SELECT last_viewed_at FROM market_views WHERE market_id = $1 AND ip_address = $2 AND user_id IS NULL',
    [marketId, ipAddress]
);

const insertMarketViewByUser = async ({ marketId, userId, ipAddress }) => pool.query(
    'INSERT INTO market_views (market_id, user_id, ip_address, last_viewed_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)',
    [marketId, userId, ipAddress]
);

const insertMarketViewByIp = async ({ marketId, ipAddress }) => pool.query(
    'INSERT INTO market_views (market_id, ip_address, last_viewed_at) VALUES ($1, $2, CURRENT_TIMESTAMP)',
    [marketId, ipAddress]
);

const updateMarketViewByUser = async ({ marketId, userId, ipAddress }) => pool.query(
    'UPDATE market_views SET last_viewed_at = CURRENT_TIMESTAMP, ip_address = $1 WHERE market_id = $2 AND user_id = $3',
    [ipAddress, marketId, userId]
);

const updateMarketViewByIp = async ({ marketId, ipAddress }) => pool.query(
    'UPDATE market_views SET last_viewed_at = CURRENT_TIMESTAMP WHERE market_id = $1 AND ip_address = $2 AND user_id IS NULL',
    [marketId, ipAddress]
);

const incrementMarketViewsCount = async (marketId) => pool.query(
    'UPDATE market SET views_count = COALESCE(views_count, 0) + 1 WHERE id = $1',
    [marketId]
);

const fetchMarketComments = async (marketId) => pool.query(
    `SELECT c.*, c.comment AS text, u.username, u.profile_picture
     FROM market_comments c
     JOIN users u ON c.user_id = u.id
     WHERE c.market_id = $1
     ORDER BY c.created_at DESC`,
    [marketId]
);

const fetchMarketLikes = async (marketId) => pool.query(
    `SELECT l.*, u.username, u.profile_picture
     FROM market_likes l
     JOIN users u ON l.user_id = u.id
     WHERE l.market_id = $1
     ORDER BY l.created_at DESC`,
    [marketId]
);

const fetchMarketShares = async (marketId) => pool.query(
    `SELECT s.*, u.username, u.profile_picture
     FROM market_shares s
     JOIN users u ON s.user_id = u.id
     WHERE s.market_id = $1
     ORDER BY s.created_at DESC`,
    [marketId]
);

const fetchMarketViews = async (marketId) => pool.query(
    `SELECT v.*, u.username, u.profile_picture
     FROM market_views v
     JOIN users u ON v.user_id = u.id
     WHERE v.market_id = $1
     ORDER BY v.last_viewed_at DESC`,
    [marketId]
);

module.exports = {
    decrementMarketCommentsCount,
    deleteMarketCommentTree,
    ensureMarketSharesTable,
    fetchMarketComments,
    fetchMarketLikes,
    fetchMarketShares,
    fetchMarketViews,
    findDailyMarketShareByIp,
    findDailyMarketShareByUser,
    findMarketLike,
    findMarketViewByIp,
    findMarketViewByUser,
    getMarketCommentAuthor,
    getMarketCommentById,
    getMarketOwnerById,
    hasCollectedCoinForPromotedProduct,
    incrementMarketCommentsCount,
    incrementMarketLikesCount,
    incrementMarketSharesCount,
    incrementMarketViewsCount,
    insertMarketComment,
    insertMarketLike,
    insertMarketShare,
    insertMarketViewByIp,
    insertMarketViewByUser,
    resolveMarketId,
    deleteMarketLike,
    decrementMarketLikesCount,
    updateMarketViewByIp,
    updateMarketViewByUser,
};
