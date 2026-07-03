const jwt = require('jsonwebtoken');
const pool = require('../../config/database');
const { extractAuthToken, getJwtSecret } = require('../../../../shared/api/authToken');

let subscriptionsTableEnsured = false;

const ensureSubscriptionsTable = async () => {
    if (subscriptionsTableEnsured) return;

    await pool.query(`
        CREATE TABLE IF NOT EXISTS user_subscriptions (
            id SERIAL PRIMARY KEY,
            subscriber_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            subscribed_to_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (subscriber_id, subscribed_to_id)
        );
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_user_subscriptions_subscriber_id
        ON user_subscriptions(subscriber_id);
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_user_subscriptions_subscribed_to_id
        ON user_subscriptions(subscribed_to_id);
    `);

    subscriptionsTableEnsured = true;
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

const findUserById = async (userId, client = pool) => {
    const result = await client.query('SELECT id FROM users WHERE id = $1', [userId]);
    return result.rows[0] || null;
};

const getSubscriberCount = async (userId, client = pool) => {
    await ensureSubscriptionsTable();
    const result = await client.query(
        'SELECT COUNT(*)::int AS count FROM user_subscriptions WHERE subscribed_to_id = $1',
        [userId]
    );
    return result.rows[0]?.count || 0;
};

const getSubscribedStatus = async (viewerId, profileUserId) => {
    if (!viewerId || !profileUserId) {
        return false;
    }

    await ensureSubscriptionsTable();
    const result = await pool.query(
        `SELECT 1
         FROM user_subscriptions
         WHERE subscriber_id = $1 AND subscribed_to_id = $2
         LIMIT 1`,
        [viewerId, profileUserId]
    );
    return result.rows.length > 0;
};

const listFollowingUsers = async (userId) => {
    await ensureSubscriptionsTable();
    const result = await pool.query(
        `SELECT
            u.id,
            u.user_id,
            u.username,
            u.full_name,
            u.user_type,
            u.profile_picture,
            u.bio,
            us.created_at AS subscribed_at
         FROM user_subscriptions us
         JOIN users u ON u.id = us.subscribed_to_id
         WHERE us.subscriber_id = $1
         ORDER BY us.created_at DESC`,
        [userId]
    );
    return result.rows;
};

const listFollowerUsers = async (userId) => {
    await ensureSubscriptionsTable();
    const result = await pool.query(
        `SELECT
            u.id,
            u.user_id,
            u.username,
            u.full_name,
            u.user_type,
            u.profile_picture,
            u.bio,
            us.created_at AS followed_at
         FROM user_subscriptions us
         JOIN users u ON u.id = us.subscriber_id
         WHERE us.subscribed_to_id = $1
         ORDER BY us.created_at DESC`,
        [userId]
    );
    return result.rows;
};

const connect = async () => pool.connect();

const findExistingSubscription = async (client, subscriberId, targetUserId) => {
    const result = await client.query(
        `SELECT id
         FROM user_subscriptions
         WHERE subscriber_id = $1 AND subscribed_to_id = $2
         LIMIT 1`,
        [subscriberId, targetUserId]
    );
    return result.rows[0] || null;
};

const deleteSubscription = async (client, subscriberId, targetUserId) => {
    await client.query(
        'DELETE FROM user_subscriptions WHERE subscriber_id = $1 AND subscribed_to_id = $2',
        [subscriberId, targetUserId]
    );
};

const insertSubscription = async (client, subscriberId, targetUserId) => {
    await client.query(
        'INSERT INTO user_subscriptions (subscriber_id, subscribed_to_id) VALUES ($1, $2)',
        [subscriberId, targetUserId]
    );
};

module.exports = {
    connect,
    deleteSubscription,
    ensureSubscriptionsTable,
    findExistingSubscription,
    findUserById,
    getOptionalAuthUser,
    getSubscribedStatus,
    getSubscriberCount,
    insertSubscription,
    listFollowerUsers,
    listFollowingUsers,
};
