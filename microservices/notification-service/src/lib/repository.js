const pool = require('./database');

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
    insertNotifications,
};
