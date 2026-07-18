const jwt = require('jsonwebtoken');
const pool = require('../../config/database');
const { extractAuthToken, getJwtSecret } = require('../../../../shared/api/authToken');
const { socialSubscriptionsRepository } = require('../subscriptions');
const accountRepository = require('./accountRepository');

let profileViewsTableEnsured = false;
let profilePictureColumnEnsured = false;
let extendedUserProfileSchemaEnsured = false;
let userBlocksTableEnsured = false;
let googerIdNormalizationPromise = null;

const GOOGER_ID_MIN = 100000;
const GOOGER_ID_MAX = 999999;

const ensureProfileViewsTable = async () => {
    if (profileViewsTableEnsured) return;

    await pool.query(`
        CREATE TABLE IF NOT EXISTS profile_views (
            id SERIAL PRIMARY KEY,
            profile_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            viewer_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            ip_address VARCHAR(255),
            last_viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_profile_views_profile_user_id
        ON profile_views(profile_user_id);
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_profile_views_viewer_user_id
        ON profile_views(viewer_user_id);
    `);

    profileViewsTableEnsured = true;
};

const ensureProfilePictureColumnSupportsUploads = async () => {
    if (profilePictureColumnEnsured) return;

    await pool.query(`
        ALTER TABLE users
        ALTER COLUMN profile_picture TYPE TEXT
    `);

    profilePictureColumnEnsured = true;
};

const ensureExtendedUserProfileSchema = async () => {
    if (extendedUserProfileSchemaEnsured) return;

    await ensureProfilePictureColumnSupportsUploads();

    await pool.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(100);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(100);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number VARCHAR(50);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS country VARCHAR(120);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS province VARCHAR(120);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth DATE;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(50);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS relationship_status VARCHAR(100);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS who_can_follow_me VARCHAR(30) DEFAULT 'everyone';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS who_can_see_activity VARCHAR(30) DEFAULT 'followers';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS contact_email_visibility VARCHAR(30) DEFAULT 'public';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS contact_phone_visibility VARCHAR(30) DEFAULT 'public';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS username_changed_at TIMESTAMPTZ;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS username_next_change_at TIMESTAMPTZ;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT false;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_phone_country_code VARCHAR(10);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_phone_country_name VARCHAR(120);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_phone_dial_code VARCHAR(12);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_phone_number VARCHAR(50);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_delivery_method VARCHAR(20) NOT NULL DEFAULT 'email';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_settings JSONB DEFAULT '{}'::jsonb;
    `);

    extendedUserProfileSchemaEnsured = true;
};

const ensureUserBlocksTable = async () => {
    if (userBlocksTableEnsured) return;

    await pool.query(`
        CREATE TABLE IF NOT EXISTS user_blocks (
            id SERIAL PRIMARY KEY,
            blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            blocked_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (blocker_id, blocked_user_id)
        );
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker_id
        ON user_blocks(blocker_id);
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked_user_id
        ON user_blocks(blocked_user_id);
    `);

    userBlocksTableEnsured = true;
};

const getOptionalAuthUser = (req) => {
    try {
        const token = extractAuthToken(req.header('Authorization'));
        if (!token) return null;

        const secret = getJwtSecret();
        if (!secret) return null;

        return jwt.verify(token, secret);
    } catch {
        return null;
    }
};

const getProfileViewCount = async (userId) => {
    await ensureProfileViewsTable();
    const result = await pool.query(
        'SELECT COUNT(*)::int AS count FROM profile_views WHERE profile_user_id = $1',
        [userId]
    );
    return result.rows[0]?.count || 0;
};

const getFollowingCount = async (userId) => {
    await socialSubscriptionsRepository.ensureSubscriptionsTable();
    const result = await pool.query(
        'SELECT COUNT(*)::int AS count FROM user_subscriptions WHERE subscriber_id = $1',
        [userId]
    );
    return result.rows[0]?.count || 0;
};

const getBlockedCount = async (userId) => {
    await ensureUserBlocksTable();
    const result = await pool.query(
        'SELECT COUNT(*)::int AS count FROM user_blocks WHERE blocker_id = $1',
        [userId]
    );
    return result.rows[0]?.count || 0;
};

const isValidGoogerId = (value) => /^\d{6}$/.test(String(value || '').trim());

const generateUserId = async (db = pool, excludedIds = new Set()) => {
    for (let attempts = 0; attempts < 40; attempts += 1) {
        const candidate = Math.floor(GOOGER_ID_MIN + Math.random() * (GOOGER_ID_MAX - GOOGER_ID_MIN + 1)).toString();
        if (excludedIds.has(candidate)) continue;

        const result = await db.query(
            'SELECT 1 FROM users WHERE user_id = $1 LIMIT 1',
            [candidate]
        );

        if (result.rows.length === 0) {
            excludedIds.add(candidate);
            return candidate;
        }
    }

    throw new Error('Unable to generate a unique Googer ID');
};

const ensureGoogerIdNormalization = async () => {
    if (googerIdNormalizationPromise) return googerIdNormalizationPromise;

    googerIdNormalizationPromise = (async () => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const result = await client.query('SELECT id, user_id FROM users ORDER BY id ASC');
            const seenIds = new Set();

            for (const row of result.rows) {
                const currentId = String(row.user_id || '').trim();
                const isFresh = isValidGoogerId(currentId) && !seenIds.has(currentId);

                if (isFresh) {
                    seenIds.add(currentId);
                    continue;
                }

                const nextId = await generateUserId(client, seenIds);
                await client.query('UPDATE users SET user_id = $1 WHERE id = $2', [nextId, row.id]);
                seenIds.add(nextId);
            }

            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            throw error;
        } finally {
            client.release();
            googerIdNormalizationPromise = null;
        }
    })();

    return googerIdNormalizationPromise;
};

const getPublicUserById = async (id, includeShippingAddress) => {
    const publicColumns = [
        'id',
        'user_id',
        'username',
        'full_name',
        'first_name',
        'last_name',
        'profile_picture',
        'bio',
        'user_type',
        'created_at',
        'email',
        'contact_email',
        'phone_number',
        'country',
        'province',
        'date_of_birth',
        'gender',
        'relationship_status',
        'who_can_follow_me',
        'who_can_see_activity',
        'contact_email_visibility',
        'contact_phone_visibility',
        'username_changed_at',
        'username_next_change_at'
    ];
    if (includeShippingAddress) {
        publicColumns.push('shipping_address');
    }

    const result = await pool.query(
        `SELECT ${publicColumns.join(', ')}
         FROM users
         WHERE id = $1
           AND COALESCE(is_deactivated, false) = false
           AND COALESCE(status, 'Active') <> 'Deactivated'`,
        [id]
    );

    return result.rows[0] || null;
};

const getPublicUserByUsername = async (username, includeShippingAddress) => {
    const publicColumns = [
        'id',
        'user_id',
        'username',
        'full_name',
        'first_name',
        'last_name',
        'profile_picture',
        'bio',
        'user_type',
        'created_at',
        'email',
        'contact_email',
        'phone_number',
        'country',
        'province',
        'date_of_birth',
        'gender',
        'relationship_status',
        'who_can_follow_me',
        'who_can_see_activity',
        'contact_email_visibility',
        'contact_phone_visibility',
        'username_changed_at',
        'username_next_change_at'
    ];
    if (includeShippingAddress) {
        publicColumns.push('shipping_address');
    }

    const result = await pool.query(
        `SELECT ${publicColumns.join(', ')}
         FROM users
         WHERE LOWER(username) = LOWER($1)
           AND COALESCE(is_deactivated, false) = false
           AND COALESCE(status, 'Active') <> 'Deactivated'
         LIMIT 1`,
        [username]
    );

    return result.rows[0] || null;
};

const getOwnProfileById = async (userId, includeShippingAddress) => {
    const profileColumns = [
        'id',
        'user_id',
        'username',
        'full_name',
        'first_name',
        'last_name',
        'email',
        'contact_email',
        'profile_picture',
        'bio',
        'phone_number',
        'country',
        'province',
        'date_of_birth',
        'gender',
        'relationship_status',
        'who_can_follow_me',
        'who_can_see_activity',
        'contact_email_visibility',
        'contact_phone_visibility',
        'two_factor_enabled',
        'two_factor_phone_country_code',
        'two_factor_phone_country_name',
        'two_factor_phone_dial_code',
        'two_factor_phone_number',
        'otp_delivery_method',
        'notification_settings',
        'referral_code',
        'wallet_balance',
        'user_type',
        'is_deactivated',
        'deactivation_reason',
        'suspension_reason_category',
        'suspension_reason_custom',
        'suspension_action',
        'suspension_days',
        'suspended_at',
        'suspension_ends_at',
        'appeal_text',
        'appeal_status',
        'appeal_submitted_at',
        'appeal_reviewed_at',
        'appeal_admin_note',
        'suspended_wallet_access',
        'created_at'
    ];

    if (includeShippingAddress) {
        profileColumns.push('shipping_address');
    }

    const result = await pool.query(
        `SELECT ${profileColumns.join(', ')} FROM users WHERE id = $1`,
        [userId]
    );

    return result.rows[0] || null;
};

const updateReferralCode = async (userId, referralCode) => {
    await pool.query(
        'UPDATE users SET referral_code = $1 WHERE id = $2',
        [referralCode, userId]
    );
};

const findUserId = async (userId) => {
    const result = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    return result.rows[0] || null;
};

const listBlockedUsers = async (targetUserId) => {
    await ensureUserBlocksTable();
    const result = await pool.query(
        `SELECT
            u.id,
            u.user_id,
            u.username,
            u.full_name,
            u.user_type,
            u.profile_picture,
            u.bio,
            ub.created_at AS blocked_at
         FROM user_blocks ub
         JOIN users u ON u.id = ub.blocked_user_id
         WHERE ub.blocker_id = $1
         ORDER BY ub.created_at DESC`,
        [targetUserId]
    );
    return result.rows;
};

const findBlock = async (blockerId, blockedUserId) => {
    await ensureUserBlocksTable();
    const result = await pool.query(
        'SELECT 1 FROM user_blocks WHERE blocker_id = $1 AND blocked_user_id = $2',
        [blockerId, blockedUserId]
    );
    return result.rows[0] || null;
};

const deleteBlock = async (blockerId, blockedUserId) => {
    await pool.query(
        'DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_user_id = $2',
        [blockerId, blockedUserId]
    );
};

const insertBlock = async (blockerId, blockedUserId) => {
    await pool.query(
        'INSERT INTO user_blocks (blocker_id, blocked_user_id) VALUES ($1, $2)',
        [blockerId, blockedUserId]
    );
};

const findExistingProfileViewByViewer = async (targetUserId, viewerUserId) => {
    const result = await pool.query(
        'SELECT last_viewed_at FROM profile_views WHERE profile_user_id = $1 AND viewer_user_id = $2 LIMIT 1',
        [targetUserId, viewerUserId]
    );
    return result.rows[0] || null;
};

const findExistingProfileViewByIp = async (targetUserId, ipAddress) => {
    const result = await pool.query(
        'SELECT last_viewed_at FROM profile_views WHERE profile_user_id = $1 AND ip_address = $2 AND viewer_user_id IS NULL LIMIT 1',
        [targetUserId, ipAddress]
    );
    return result.rows[0] || null;
};

const insertProfileViewWithViewer = async (targetUserId, viewerUserId, ipAddress) => {
    await pool.query(
        'INSERT INTO profile_views (profile_user_id, viewer_user_id, ip_address, last_viewed_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)',
        [targetUserId, viewerUserId, ipAddress]
    );
};

const insertProfileViewWithIp = async (targetUserId, ipAddress) => {
    await pool.query(
        'INSERT INTO profile_views (profile_user_id, ip_address, last_viewed_at) VALUES ($1, $2, CURRENT_TIMESTAMP)',
        [targetUserId, ipAddress]
    );
};

const updateProfileViewWithViewer = async (ipAddress, targetUserId, viewerUserId) => {
    await pool.query(
        'UPDATE profile_views SET last_viewed_at = CURRENT_TIMESTAMP, ip_address = $1 WHERE profile_user_id = $2 AND viewer_user_id = $3',
        [ipAddress, targetUserId, viewerUserId]
    );
};

const updateProfileViewWithIp = async (targetUserId, ipAddress) => {
    await pool.query(
        'UPDATE profile_views SET last_viewed_at = CURRENT_TIMESTAMP WHERE profile_user_id = $1 AND ip_address = $2 AND viewer_user_id IS NULL',
        [targetUserId, ipAddress]
    );
};

module.exports = {
    accountRepository,
    deleteBlock,
    ensureExtendedUserProfileSchema,
    ensureGoogerIdNormalization,
    ensureProfileViewsTable,
    ensureUserBlocksTable,
    findBlock,
    findExistingProfileViewByIp,
    findExistingProfileViewByViewer,
    findUserId,
    getBlockedCount,
    getFollowingCount,
    getOptionalAuthUser,
    getOwnProfileById,
    getProfileViewCount,
    getPublicUserById,
    getPublicUserByUsername,
    insertBlock,
    insertProfileViewWithIp,
    insertProfileViewWithViewer,
    listBlockedUsers,
    socialSubscriptionsRepository,
    updateProfileViewWithIp,
    updateProfileViewWithViewer,
    updateReferralCode,
};
