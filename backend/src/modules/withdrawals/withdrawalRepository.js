const pool = require('../../config/database');

const isAdmin = async (userId) => {
    const result = await pool.query('SELECT user_type FROM users WHERE id = $1 LIMIT 1', [userId]);
    return result.rows[0]?.user_type === 'admin';
};

const listActivePaymentMethods = async () => pool.query(
    `SELECT id, name, icon, fields FROM withdrawal_payment_methods WHERE is_active = true ORDER BY id`
);

const getMyRequests = async (userId) => pool.query(
    `SELECT id, payment_method_name, amount, status, rejection_reason, created_at, reviewed_at
     FROM withdrawal_requests
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
);

const getLockedUserForWithdrawal = async (client, userId) => client.query(
    'SELECT verification_status, wallet_balance FROM users WHERE id = $1 FOR UPDATE',
    [userId]
);

const getSettings = async () => pool.query('SELECT * FROM withdrawal_settings ORDER BY id LIMIT 1');

const updateSettings = async ({ minAmount, maxAmount, coinRate }) => pool.query(
    `UPDATE withdrawal_settings
     SET min_amount=$1, max_amount=$2, coin_rate=$3, updated_at=NOW()
     WHERE id = (SELECT id FROM withdrawal_settings ORDER BY id LIMIT 1)`,
    [Number(minAmount), Number(maxAmount), Number(coinRate) || 0.0056]
);

const getActiveMethodById = async (client, methodId) => client.query(
    'SELECT name FROM withdrawal_payment_methods WHERE id = $1 AND is_active = true',
    [methodId]
);

const getExistingPendingRequest = async (client, { userId, paymentMethodId, amount, paymentDetailsJson }) => client.query(
    `SELECT id, payment_method_name, amount, status, rejection_reason, created_at, reviewed_at
     FROM withdrawal_requests
     WHERE user_id = $1
       AND payment_method_id = $2
       AND amount = $3
       AND status = 'Pending'
       AND payment_details = $4::jsonb
       AND created_at >= NOW() - INTERVAL '5 minutes'
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, paymentMethodId, amount, paymentDetailsJson]
);

const insertWithdrawalRequest = async (client, { userId, paymentMethodId, methodName, amount, paymentDetailsJson, walletTransferId }) => client.query(
    `INSERT INTO withdrawal_requests
        (user_id, payment_method_id, payment_method_name, amount, payment_details, status, wallet_transfer_id)
     VALUES ($1, $2, $3, $4, $5, 'Pending', $6)
     RETURNING id`,
    [userId, paymentMethodId, methodName, amount, paymentDetailsJson, walletTransferId]
);

const getLockedUserRequestById = async (client, { id, userId }) => client.query(
    `SELECT id, amount, status, wallet_transfer_id
     FROM withdrawal_requests
     WHERE id = $1 AND user_id = $2 FOR UPDATE`,
    [id, userId]
);

const markWalletTransferStatus = async (client, { transferId, status }) => client.query(
    `UPDATE wallet_transfers SET status = $2, updated_at = NOW() WHERE id = $1`,
    [transferId, status]
);

const markUserRequestCancelled = async (client, id) => client.query(
    `UPDATE withdrawal_requests SET status = 'Cancelled', updated_at = NOW() WHERE id = $1`,
    [id]
);

const getAdminRequests = async (status) => {
    const params = [];
    let where = '';
    if (status && status !== 'All') {
        where = 'WHERE wr.status = $1';
        params.push(status);
    }

    return pool.query(
        `SELECT wr.id, wr.user_id, wr.payment_method_name, wr.amount,
                wr.payment_details, wr.status, wr.rejection_reason,
                wr.wallet_transfer_id, wr.created_at, wr.reviewed_at,
                u.username, u.email, u.profile_picture
         FROM withdrawal_requests wr
         JOIN users u ON u.id = wr.user_id
         ${where}
         ORDER BY wr.created_at DESC`,
        params
    );
};

const getLockedRequestById = async (client, requestId) => client.query(
    `SELECT id, user_id, amount, status, wallet_transfer_id, payment_method_name
     FROM withdrawal_requests WHERE id = $1 FOR UPDATE`,
    [requestId]
);

const markRequestApproved = async (client, requestId) => client.query(
    `UPDATE withdrawal_requests
     SET status = 'Approved', reviewed_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [requestId]
);

const markRequestRejected = async (client, { requestId, rejectionReason }) => client.query(
    `UPDATE withdrawal_requests
     SET status = 'Rejected', rejection_reason = $1, reviewed_at = NOW(), updated_at = NOW()
     WHERE id = $2`,
    [rejectionReason, requestId]
);

module.exports = {
    getActiveMethodById,
    getAdminRequests,
    getExistingPendingRequest,
    getLockedRequestById,
    getLockedUserForWithdrawal,
    getLockedUserRequestById,
    getMyRequests,
    getSettings,
    insertWithdrawalRequest,
    isAdmin,
    listActivePaymentMethods,
    markRequestApproved,
    markRequestRejected,
    markUserRequestCancelled,
    markWalletTransferStatus,
    updateSettings,
};
