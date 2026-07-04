const pool = require('../../config/database');

const countUserActiveMarketItems = async (userId) => pool.query(
    `SELECT COUNT(*)::int AS c FROM market WHERE user_id = $1 AND status != 'deleted'`,
    [userId]
);

const getUserMarketIdentity = async (userId) => pool.query(
    'SELECT username, user_id FROM users WHERE id = $1',
    [userId]
);

const getMarketItemById = async (id) => pool.query(
    'SELECT * FROM market WHERE id = $1',
    [id]
);

const insertMarketItem = async (values) => pool.query(
    `INSERT INTO market (
        user_id, owner_user_id, username, title, description, price, promo_price, category,
        sub_category, level3_category, manual_category, stock, image_url, status,
        variants, shipping_info, payment_methods, warranty_info, return_policy, delivery_info, commission_info, links_data,
        product_code
    )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'reviewing', $14, $15, $16, $17, $18, $19, $20, $21, $22)
     RETURNING *`,
    values
);

const updateMarketItemDetails = async (values) => pool.query(
    `UPDATE market
     SET title = COALESCE($1, title),
         description = COALESCE($2, description),
         price = COALESCE($3, price),
         promo_price = $4,
         category = COALESCE($5, category),
         sub_category = COALESCE($6, sub_category),
         level3_category = COALESCE($7, level3_category),
         manual_category = COALESCE($8, manual_category),
         stock = $9,
         image_url = COALESCE($10, image_url),
         variants = COALESCE($11, variants),
         shipping_info = COALESCE($12, shipping_info),
         payment_methods = COALESCE($13, payment_methods),
         warranty_info = COALESCE($14, warranty_info),
         return_policy = COALESCE($15, return_policy),
         delivery_info = COALESCE($16, delivery_info),
         commission_info = COALESCE($17, commission_info),
         links_data = COALESCE($18, links_data),
         status = $19,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $20
     RETURNING *`,
    values
);

const updateMarketItemStatus = async ({ id, status }) => pool.query(
    'UPDATE market SET status = $1 WHERE id = $2',
    [status, id]
);

const softDeleteMarketItem = async (id) => pool.query(
    "UPDATE market SET status = 'deleted', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
    [id]
);

module.exports = {
    countUserActiveMarketItems,
    getMarketItemById,
    getUserMarketIdentity,
    insertMarketItem,
    softDeleteMarketItem,
    updateMarketItemDetails,
    updateMarketItemStatus,
};
