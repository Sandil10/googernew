const pool = require('../../config/database');

const isAdmin = async (userId) => {
    const result = await pool.query('SELECT user_type FROM users WHERE id = $1 LIMIT 1', [userId]);
    return result.rows[0]?.user_type === 'admin';
};

const getActiveTopupMethods = async () => pool.query(
    `SELECT id, name, icon, fields
     FROM topup_payment_methods
     WHERE is_active = true
     ORDER BY id ASC`
);

const getMyRequests = async (userId) => pool.query(
    `SELECT id, method_category, method_name, bank_name, amount, notes,
            status, rejection_reason, reviewed_at, created_at
     FROM coin_requests
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
);

const getAdminRequests = async (status) => {
    const params = [];
    let where = '';
    if (status && status !== 'All') {
        where = 'WHERE cr.status = $1';
        params.push(status);
    }

    return pool.query(
        `SELECT cr.id, cr.user_id, cr.method_category, cr.method_name, cr.bank_name,
                cr.amount, cr.notes, cr.status, cr.rejection_reason,
                cr.reviewed_at, cr.created_at,
                u.username, u.email, u.profile_picture, u.full_name
         FROM coin_requests cr
         JOIN users u ON u.id = cr.user_id
         ${where}
         ORDER BY cr.created_at DESC`,
        params
    );
};

const lockUser = async (client, userId) => client.query(
    'SELECT id FROM users WHERE id = $1 FOR UPDATE',
    [userId]
);

const getDuplicatePendingRequest = async (client, { userId, methodCategory, methodName, bankName, amount, notes }) => client.query(
    `SELECT id, status, created_at
     FROM coin_requests
     WHERE user_id = $1
       AND method_category = $2
       AND method_name = $3
       AND COALESCE(bank_name, '') = COALESCE($4, '')
       AND amount = $5
       AND COALESCE(notes, '') = COALESCE($6, '')
       AND status = 'Pending'
       AND created_at >= NOW() - INTERVAL '10 minutes'
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, methodCategory, methodName, bankName, amount, notes]
);

const insertCoinRequest = async (client, { userId, methodCategory, methodName, bankName, amount, notes }) => client.query(
    `INSERT INTO coin_requests
        (user_id, method_category, method_name, bank_name, amount, notes, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'Pending', NOW(), NOW())
     RETURNING id, status, created_at`,
    [userId, methodCategory, methodName, bankName, amount, notes]
);

const getLockedRequestById = async (client, requestId) => client.query(
    'SELECT status FROM coin_requests WHERE id = $1 FOR UPDATE',
    [requestId]
);

const reviewRequest = async (client, { requestId, newStatus, rejectionReason }) => client.query(
    `UPDATE coin_requests
     SET status = $1,
         rejection_reason = $2,
         reviewed_at = NOW(),
         updated_at = NOW()
     WHERE id = $3`,
    [newStatus, rejectionReason, requestId]
);

module.exports = {
    getActiveTopupMethods,
    getAdminRequests,
    getDuplicatePendingRequest,
    getLockedRequestById,
    getMyRequests,
    insertCoinRequest,
    isAdmin,
    lockUser,
    reviewRequest,
};
