const pool = require('../../config/database');

const searchUsers = async ({ query, viewerUserId, includeSelf }) => {
    const normalizedQuery = String(query || '').trim();
    return pool.query(
        `SELECT id, user_id, username, full_name, profile_picture, user_type
         FROM users
         WHERE (
            user_id = $2
            OR (
                LENGTH($2) >= 1
                AND (
                    user_id ILIKE $1
                    OR username ILIKE $1
                    OR full_name ILIKE $1
                    OR (email IS NOT NULL AND email ILIKE $1)
                    OR CAST(id AS TEXT) = $2
                )
            )
         )
         AND ($4::boolean = true OR id != $3)
         AND id NOT IN (
             SELECT blocked_user_id FROM user_blocks WHERE blocker_id = $3
         )
         AND COALESCE(status, 'Active') <> 'Deleted'
         AND COALESCE(is_deactivated, false) = false
         ORDER BY
            CASE
                WHEN user_id = $2 THEN 0
                WHEN LOWER(username) = LOWER($2) THEN 1
                WHEN LOWER(full_name) = LOWER($2) THEN 2
                WHEN username ILIKE ($2 || '%') THEN 3
                WHEN user_id ILIKE ($2 || '%') THEN 4
                ELSE 5
            END,
            id ASC
         LIMIT 10`,
        [`%${normalizedQuery}%`, normalizedQuery, viewerUserId, includeSelf]
    );
};

const getTransactionHistory = async (userId) => pool.query(
    `SELECT t.*,
            s.username as sender_username, s.full_name as sender_full_name, s.user_id as sender_readable_id, s.user_type as sender_user_type,
            r.username as receiver_username, r.full_name as receiver_full_name, r.user_id as receiver_readable_id, r.user_type as receiver_user_type,
            parent_discount.commission_percentage as original_discount_percentage,
            product_discount.discount_percentage as product_discount_percentage,
            order_summary.order_number as linked_order_number,
            COALESCE(order_summary.can_cancel, false) as linked_order_can_cancel,
            order_summary.primary_status as linked_order_status
     FROM wallet_transfers t
     JOIN users s ON t.sender_id = s.id
     LEFT JOIN users r ON t.receiver_id = r.id
     LEFT JOIN LATERAL (
         SELECT parent.commission_percentage
         FROM wallet_transfers parent
         WHERE parent.id = NULLIF(substring(t.note FROM 'Seller Discount Transfer #([0-9]+)'), '')::integer
         LIMIT 1
     ) parent_discount ON TRUE
     LEFT JOIN LATERAL (
         SELECT
             CASE
                 WHEN COALESCE(m.commission_info->>'discount', '') ~ '^[0-9]+(\\.[0-9]+)?$'
                 THEN ROUND((m.commission_info->>'discount')::numeric, 2)
                 WHEN COALESCE(m.price, 0) > 0
                      AND COALESCE(m.promo_price, 0) > 0
                      AND COALESCE(m.promo_price, 0) < COALESCE(m.price, 0)
                 THEN ROUND(((m.price - m.promo_price) / m.price) * 100, 2)
                 ELSE NULL
             END AS discount_percentage
         FROM market m
         WHERE m.id = NULLIF(substring(t.note FROM '#([0-9]+)'), '')::integer
         LIMIT 1
     ) product_discount ON TRUE
     LEFT JOIN LATERAL (
         SELECT
             MIN(o.order_number) AS order_number,
             BOOL_AND(o.status = 'pending') AS can_cancel,
             CASE
                 WHEN BOOL_OR(o.status = 'processing') THEN 'processing'
                 WHEN BOOL_OR(o.status = 'shipped') THEN 'shipped'
                 WHEN BOOL_OR(o.status = 'delivered') THEN 'delivered'
                 WHEN BOOL_OR(o.status = 'received') THEN 'received'
                 WHEN BOOL_OR(o.status = 'cancelled') THEN 'cancelled'
                 WHEN BOOL_AND(o.status = 'pending') THEN 'pending'
                 ELSE MIN(o.status)
             END AS primary_status
         FROM orders o
         WHERE o.wallet_transfer_id = t.id
     ) order_summary ON TRUE
     WHERE (
           t.sender_id = $1
           OR t.receiver_id = $1
           OR (
               COALESCE(t.type, '') = 'order_hold'
               AND EXISTS (
                   SELECT 1
                   FROM orders seller_order
                   WHERE seller_order.wallet_transfer_id = t.id
                     AND seller_order.seller_id = $1
               )
           )
       )
       AND COALESCE(t.type, '') <> 'referral_commission'
       AND (
           COALESCE(t.type, '') <> 'seller_discount'
           OR t.sender_id = $1
       )
       AND (
           COALESCE(t.type, '') <> 'discount_refund'
           OR (t.receiver_id = $1 AND t.sender_id <> $1)
       )
     ORDER BY t.created_at DESC
     LIMIT 50`,
    [userId]
);

const getPendingRequests = async (userId) => pool.query(
    `SELECT t.*, u.username as sender_username, u.full_name as sender_full_name, u.profile_picture as sender_profile_picture, u.user_type as sender_user_type
     FROM wallet_transfers t
     JOIN users u ON t.sender_id = u.id
     WHERE t.receiver_id = $1 AND t.status = 'pending' AND t.type IN ('request', 'sell')
     ORDER BY t.created_at DESC`,
    [userId]
);

const getAllTransactionsAdmin = async () => pool.query(
    `SELECT t.*,
            s.username AS sender_username, s.full_name AS sender_full_name, s.user_id AS sender_readable_id, s.user_type AS sender_user_type,
            r.username AS receiver_username, r.full_name AS receiver_full_name, r.user_id AS receiver_readable_id, r.user_type AS receiver_user_type
     FROM wallet_transfers t
     JOIN users s ON t.sender_id = s.id
     LEFT JOIN users r ON t.receiver_id = r.id
     ORDER BY t.created_at DESC`
);

module.exports = {
    getAllTransactionsAdmin,
    getPendingRequests,
    getTransactionHistory,
    searchUsers,
};
