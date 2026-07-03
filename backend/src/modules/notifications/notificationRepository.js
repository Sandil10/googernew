const pool = require('../../config/database');

const ensureTable = async () => {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS user_notifications (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            title VARCHAR(200) NOT NULL,
            message TEXT NOT NULL,
            type VARCHAR(30) DEFAULT 'info',
            theme_color VARCHAR(200) DEFAULT NULL,
            theme_font_color VARCHAR(40) DEFAULT NULL,
            theme_font_size VARCHAR(20) DEFAULT NULL,
            is_read BOOLEAN DEFAULT false,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_notifications_user_id ON user_notifications(user_id)`).catch(() => {});
    await pool.query(`ALTER TABLE user_notifications ADD COLUMN IF NOT EXISTS theme_color VARCHAR(200) DEFAULT NULL`).catch(() => {});
    await pool.query(`ALTER TABLE user_notifications ADD COLUMN IF NOT EXISTS theme_font_color VARCHAR(40) DEFAULT NULL`).catch(() => {});
    await pool.query(`ALTER TABLE user_notifications ADD COLUMN IF NOT EXISTS theme_font_size VARCHAR(20) DEFAULT NULL`).catch(() => {});
};

const getUserType = async (userId) => {
    const result = await pool.query('SELECT user_type FROM users WHERE id = $1 LIMIT 1', [userId]);
    return result.rows[0]?.user_type || null;
};

const getAllUserIds = async () => {
    const { rows } = await pool.query('SELECT id FROM users');
    return rows.map((row) => row.id);
};

const getUnreadNotifications = async (userId) => {
    const result = await pool.query(
        'SELECT * FROM user_notifications WHERE user_id = $1 AND is_read = false ORDER BY created_at DESC LIMIT 50',
        [userId]
    );
    return result.rows;
};

const markAllRead = async (userId) => {
    await pool.query('UPDATE user_notifications SET is_read = true WHERE user_id = $1', [userId]);
};

const markOneRead = async (notificationId, userId) => {
    await pool.query('UPDATE user_notifications SET is_read = true WHERE id = $1 AND user_id = $2', [notificationId, userId]);
};

const insertNotifications = async ({ targetIds, title, message, type, themeColor, themeFontColor, themeFontSize }) => {
    const values = [];
    const placeholders = targetIds.map((userId, index) => {
        const offset = index * 7;
        values.push(userId, title.slice(0, 200), message, type, themeColor, themeFontColor, themeFontSize);
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`;
    }).join(',');

    const { rows } = await pool.query(`
        INSERT INTO user_notifications (user_id, title, message, type, theme_color, theme_font_color, theme_font_size)
        VALUES ${placeholders}
        RETURNING *
    `, values);

    return rows;
};

module.exports = {
    ensureTable,
    getAllUserIds,
    getUnreadNotifications,
    getUserType,
    insertNotifications,
    markAllRead,
    markOneRead,
};
