const bcrypt = require('bcryptjs');
const pool = require('../../config/database');

let usersTableHasShippingAddressColumn = null;

const hasUsersTableColumn = async (columnName) => {
    if (columnName === 'shipping_address' && usersTableHasShippingAddressColumn !== null) {
        return usersTableHasShippingAddressColumn;
    }

    const result = await pool.query(
        `SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_name = 'users' AND column_name = $1
        ) AS exists`,
        [columnName]
    );

    const exists = Boolean(result.rows[0]?.exists);

    if (columnName === 'shipping_address') {
        usersTableHasShippingAddressColumn = exists;
    }

    return exists;
};

const ensureSuspensionColumns = async () => {
    await pool.query(`ALTER TABLE users ALTER COLUMN status TYPE VARCHAR(40)`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_deactivated BOOLEAN NOT NULL DEFAULT false`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivation_reason TEXT`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS self_deactivated_at TIMESTAMP`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS self_deleted_at TIMESTAMP`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_reason_category VARCHAR(120)`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_reason_custom TEXT`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_action VARCHAR(120)`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_days INTEGER`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMP`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_ends_at TIMESTAMP`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS appeal_text TEXT`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS appeal_status VARCHAR(40)`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS appeal_submitted_at TIMESTAMP`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS appeal_reviewed_at TIMESTAMP`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS appeal_admin_note TEXT`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS appeal_id VARCHAR(32)`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS appeal_contact_email VARCHAR(255)`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS appeal_phone_number VARCHAR(80)`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS appeal_agreement_confirmed BOOLEAN NOT NULL DEFAULT false`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS marked_for_deletion_at TIMESTAMP`).catch(() => {});
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_wallet_access BOOLEAN NOT NULL DEFAULT false`).catch(() => {});
};

const generateAppealId = () => String(Math.floor(10000000 + Math.random() * 90000000));

const connect = async () => pool.connect();

const getUserPasswordById = async (userId) => {
    const result = await pool.query('SELECT password FROM users WHERE id = $1', [userId]);
    return result.rows[0] || null;
};

const comparePassword = async (plainPassword, hashedPassword) => bcrypt.compare(plainPassword, hashedPassword);

const hashPassword = async (password) => {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
};

const updatePassword = async (userId, hashedPassword) => {
    const result = await pool.query(
        'UPDATE users SET password = $1, token_version = COALESCE(token_version, 0) + 1 WHERE id = $2 RETURNING id',
        [hashedPassword, userId]
    );
    return result.rows[0] || null;
};

const findUsernameConflict = async (username, excludedUserId) => {
    const result = await pool.query(
        'SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND id <> $2 LIMIT 1',
        [username, excludedUserId]
    );
    return result.rows[0] || null;
};

const updateShippingAddress = async (userId, shippingAddress) => {
    const result = await pool.query(
        'UPDATE users SET shipping_address = $1 WHERE id = $2 RETURNING shipping_address',
        [JSON.stringify(shippingAddress), userId]
    );
    return result.rows[0] || null;
};

const getSuspensionByUserId = async (userId) => {
    const result = await pool.query(
        `SELECT id, username, full_name, is_deactivated, deactivation_reason,
                suspension_reason_category, suspension_reason_custom, suspension_action,
                suspension_days, suspended_at, self_deactivated_at, suspension_ends_at,
                appeal_text, appeal_status, appeal_submitted_at, appeal_reviewed_at, appeal_admin_note,
                appeal_id, appeal_contact_email, appeal_phone_number, appeal_agreement_confirmed,
                suspended_wallet_access
         FROM users WHERE id = $1`,
        [userId]
    );
    return result.rows[0] || null;
};

const getAppealStateByUserId = async (userId) => {
    const result = await pool.query(
        `SELECT is_deactivated, appeal_status FROM users WHERE id = $1`,
        [userId]
    );
    return result.rows[0] || null;
};

const updateSuspensionAppeal = async (userId, appealText, contactEmail, phoneNumber, agreementConfirmed) => {
    let result;
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const appealId = generateAppealId();
        try {
            result = await pool.query(
                `UPDATE users
                 SET appeal_text = $1,
                     appeal_status = 'pending',
                     appeal_submitted_at = NOW(),
                     appeal_reviewed_at = NULL,
                     appeal_admin_note = NULL,
                     appeal_id = $2,
                     appeal_contact_email = $3,
                     appeal_phone_number = $4,
                     appeal_agreement_confirmed = $5
                 WHERE id = $6
                   AND NOT EXISTS (
                       SELECT 1 FROM users existing
                       WHERE existing.appeal_id = $2 AND existing.id <> $6
                   )
                 RETURNING id, is_deactivated, deactivation_reason, suspension_reason_category,
                           suspension_action, suspension_days, suspension_ends_at,
                           appeal_text, appeal_status, appeal_submitted_at, appeal_reviewed_at, appeal_admin_note,
                           appeal_id, appeal_contact_email, appeal_phone_number, appeal_agreement_confirmed,
                           suspended_wallet_access`,
                [appealText, appealId, contactEmail, phoneNumber, agreementConfirmed, userId]
            );
            if (result.rows.length) break;
        } catch (error) {
            if (attempt === 4) throw error;
        }
    }
    return result?.rows?.[0] || null;
};

const pauseActiveAdsForUser = async (client, userId) => {
    const result = await client.query(
        `UPDATE ads
         SET status = 'Paused',
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1
           AND status IN ('Active', 'Approved')
         RETURNING id`,
        [userId]
    ).catch((error) => {
        if (error.code === '42P01') return { rowCount: 0 };
        throw error;
    });
    return result.rowCount || 0;
};

const deactivateUserAccount = async (client, userId) => {
    const result = await client.query(
        `UPDATE users
         SET is_deactivated = true,
             status = 'Deactivated',
             marked_for_deletion_at = NULL,
             self_deactivated_at = NOW(),
             deactivation_reason = 'Self Deactivated',
             suspension_reason_category = 'Self Deactivated',
             suspension_reason_custom = NULL,
             suspension_action = 'Self Deactivated',
             suspension_days = NULL,
             suspended_at = NOW(),
             suspension_ends_at = NULL,
             suspended_wallet_access = false,
             appeal_text = NULL,
             appeal_status = NULL,
             appeal_submitted_at = NULL,
             appeal_reviewed_at = NULL,
             appeal_admin_note = NULL,
             appeal_id = NULL,
             appeal_contact_email = NULL,
             appeal_phone_number = NULL,
             appeal_agreement_confirmed = false
         WHERE id = $1
         RETURNING id, username, full_name, is_deactivated, status, self_deactivated_at, deactivation_reason`,
        [userId]
    );
    return result.rows[0] || null;
};

const deleteUserAccount = async (client, userId) => {
    const result = await client.query(
        `UPDATE users
         SET is_deactivated = true,
             status = 'Deleted',
             marked_for_deletion_at = NULL,
             self_deactivated_at = NULL,
             self_deleted_at = NOW(),
             deactivation_reason = 'User Deleted Account',
             suspension_reason_category = 'User Deleted Account',
             suspension_reason_custom = NULL,
             suspension_action = 'User Deleted Account',
             suspension_days = NULL,
             suspended_at = NOW(),
             suspension_ends_at = NULL,
             suspended_wallet_access = false,
             appeal_text = NULL,
             appeal_status = NULL,
             appeal_submitted_at = NULL,
             appeal_reviewed_at = NULL,
             appeal_admin_note = NULL,
             appeal_id = NULL,
             appeal_contact_email = NULL,
             appeal_phone_number = NULL,
             appeal_agreement_confirmed = false
         WHERE id = $1
         RETURNING id, username, full_name, email, phone_number, is_deactivated, status, self_deleted_at`,
        [userId]
    );
    return result.rows[0] || null;
};

module.exports = {
    comparePassword,
    connect,
    deactivateUserAccount,
    deleteUserAccount,
    ensureSuspensionColumns,
    findUsernameConflict,
    getAppealStateByUserId,
    getSuspensionByUserId,
    getUserPasswordById,
    hasUsersTableColumn,
    hashPassword,
    pauseActiveAdsForUser,
    updatePassword,
    updateShippingAddress,
    updateSuspensionAppeal,
};
