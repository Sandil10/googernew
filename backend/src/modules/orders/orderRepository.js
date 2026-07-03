const pool = require('../../config/database');

const findOrderById = async (id) => pool.query(
    'SELECT * FROM orders WHERE id = $1',
    [id]
);

const countDistinctOrdersForUser = async ({ column, statuses, userId }) => pool.query(
    `SELECT COUNT(DISTINCT COALESCE(order_number, 'order-item-' || id::text))::int AS count
     FROM orders
     WHERE ${column} = $1 AND status = ANY($2::text[])`,
    [userId, statuses]
);

const getBuyerOrders = async ({ statusList, userId }) => {
    let query = `
        SELECT o.*, m.title, m.image_url, m.category, m.commission_info, u.username as seller_username,
               u.profile_picture as profile_picture
        FROM orders o
        JOIN market m ON o.item_id = m.id
        JOIN users u ON o.seller_id = u.id
        WHERE o.buyer_id = $1
    `;
    const params = [userId];

    if (statusList?.length) {
        query += ` AND o.status = ANY($${params.length + 1})`;
        params.push(statusList);
    }

    query += ' ORDER BY o.created_at DESC';
    return pool.query(query, params);
};

const getSellerOrders = async ({ statusList, userId }) => {
    let query = `
        SELECT o.*, m.title, m.image_url, m.category, m.commission_info, bu.username as buyer_username,
               bu.profile_picture as profile_picture
        FROM orders o
        JOIN market m ON o.item_id = m.id
        JOIN users bu ON o.buyer_id = bu.id
        WHERE o.seller_id = $1
    `;
    const params = [userId];

    if (statusList?.length) {
        query += ` AND o.status = ANY($${params.length + 1})`;
        params.push(statusList);
    }

    query += ' ORDER BY o.created_at DESC';
    return pool.query(query, params);
};

const submitOrderReport = async ({ id, reportColumn, reportBy, reportData }) => pool.query(
    `UPDATE orders SET ${reportColumn} = $1, report_status = 'pending', report_by = $2 WHERE id = $3`,
    [reportData, reportBy, id]
);

module.exports = {
    countDistinctOrdersForUser,
    findOrderById,
    getBuyerOrders,
    getSellerOrders,
    submitOrderReport,
};
