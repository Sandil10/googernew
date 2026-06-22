const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const authenticateToken = require('../middleware/auth');

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

const assertAdmin = async (userId) => {
    const result = await pool.query('SELECT user_type FROM users WHERE id = $1 LIMIT 1', [userId]);
    return String(result.rows[0]?.user_type || '').toLowerCase() === 'admin';
};

const normalizeNotificationType = (value) => {
    const type = String(value || 'info').trim().toLowerCase();
    return type.slice(0, 30) || 'info';
};

const normalizeThemeColor = (body = {}) => {
    const value = body.theme_color || body.themeColor || body.background_color || body.backgroundColor || body.color || null;
    if (value === null || value === undefined) return null;
    const color = String(value).trim();
    return color ? color.slice(0, 200) : null;
};

const normalizeFontColor = (body = {}) => {
    const value = body.theme_font_color || body.themeFontColor || body.font_color || body.fontColor || null;
    if (value === null || value === undefined) return null;
    const color = String(value).trim();
    return color ? color.slice(0, 40) : null;
};

const normalizeFontSize = (body = {}) => {
    const size = String(body.theme_font_size || body.themeFontSize || body.font_size || body.fontSize || '').trim().toLowerCase();
    return ['small', 'normal', 'large'].includes(size) ? size : null;
};

// Get my notifications
router.get('/', authenticateToken, async (req, res) => {
    try {
        await ensureTable();
        const result = await pool.query(
            'SELECT * FROM user_notifications WHERE user_id = $1 AND is_read = false ORDER BY created_at DESC LIMIT 50',
            [req.user.id]
        );
        res.json({ success: true, notifications: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Mark all as read
router.post('/read-all', authenticateToken, async (req, res) => {
    try {
        await ensureTable();
        await pool.query('UPDATE user_notifications SET is_read = true WHERE user_id = $1', [req.user.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Admin: send a styled notification to one user, selected users, or all users
router.post('/', authenticateToken, async (req, res) => {
    try {
        await ensureTable();
        if (!await assertAdmin(req.user.id)) {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }

        const title = String(req.body?.title || '').trim();
        const message = String(req.body?.message || '').trim();
        if (!title || !message) {
            return res.status(400).json({ success: false, message: 'Title and message are required' });
        }

        const type = normalizeNotificationType(req.body?.type);
        const themeColor = normalizeThemeColor(req.body);
        const themeFontColor = normalizeFontColor(req.body);
        const themeFontSize = normalizeFontSize(req.body);
        const requestedIds = Array.isArray(req.body?.user_ids)
            ? req.body.user_ids
            : Array.isArray(req.body?.userIds)
                ? req.body.userIds
                : (req.body?.user_id || req.body?.userId ? [req.body.user_id || req.body.userId] : []);

        let targetIds = requestedIds
            .map((id) => Number(id))
            .filter((id) => Number.isInteger(id) && id > 0);

        if (targetIds.length === 0) {
            const { rows } = await pool.query('SELECT id FROM users');
            targetIds = rows.map((row) => row.id);
        }

        if (targetIds.length === 0) {
            return res.status(400).json({ success: false, message: 'No users found for this notification' });
        }

        const values = [];
        const placeholders = targetIds.map((userId, index) => {
            const fontOffset = index * 7;
            values.push(userId, title.slice(0, 200), message, type, themeColor, themeFontColor, themeFontSize);
            return `($${fontOffset + 1}, $${fontOffset + 2}, $${fontOffset + 3}, $${fontOffset + 4}, $${fontOffset + 5}, $${fontOffset + 6}, $${fontOffset + 7})`;
        }).join(',');

        const { rows } = await pool.query(`
            INSERT INTO user_notifications (user_id, title, message, type, theme_color, theme_font_color, theme_font_size)
            VALUES ${placeholders}
            RETURNING *
        `, values);

        return res.status(201).json({
            success: true,
            count: rows.length,
            notifications: rows,
        });
    } catch (err) {
        console.error('[notifications] create notification error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// Mark one as read
router.post('/:id/read', authenticateToken, async (req, res) => {
    try {
        await pool.query('UPDATE user_notifications SET is_read = true WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
module.exports.ensureTable = ensureTable;
