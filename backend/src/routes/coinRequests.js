const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');

const ensureTable = async () => {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS coin_requests (
            id               SERIAL PRIMARY KEY,
            user_id          INTEGER NOT NULL REFERENCES users(id),
            method_category  TEXT NOT NULL,
            method_name      TEXT NOT NULL,
            bank_name        TEXT,
            amount           NUMERIC(12,2) NOT NULL,
            notes            TEXT,
            status           TEXT NOT NULL DEFAULT 'Pending',
            rejection_reason TEXT,
            reviewed_at      TIMESTAMPTZ,
            created_at       TIMESTAMPTZ DEFAULT NOW(),
            updated_at       TIMESTAMPTZ DEFAULT NOW()
        )
    `);
};

const assertAdmin = async (userId) => {
    const result = await pool.query(
        'SELECT user_type FROM users WHERE id = $1 LIMIT 1',
        [userId]
    );
    return result.rows[0]?.user_type === 'admin';
};

const resolveUserId = (req) => req.user.id || req.user.userId;

// ── User: submit a coin request ───────────────────────────────────────────────
router.post('/', authMiddleware, async (req, res) => {
    try {
        await ensureTable();
        const userId = resolveUserId(req);
        const { method_category, method_name, bank_name, amount, notes } = req.body;

        if (!method_category || !method_name) {
            return res.status(400).json({ success: false, message: 'method_category and method_name are required.' });
        }
        const numAmount = parseFloat(amount);
        if (!numAmount || numAmount <= 0) {
            return res.status(400).json({ success: false, message: 'Enter a valid amount greater than 0.' });
        }

        const result = await pool.query(
            `INSERT INTO coin_requests
                (user_id, method_category, method_name, bank_name, amount, notes, status, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, 'Pending', NOW(), NOW())
             RETURNING id, status, created_at`,
            [userId, method_category, method_name, bank_name || null, numAmount, notes?.trim() || null]
        );

        res.json({ success: true, request: result.rows[0] });
    } catch (err) {
        console.error('POST /coin-requests error:', err);
        res.status(500).json({ success: false, message: 'Failed to submit request.' });
    }
});

// ── User: get own requests ────────────────────────────────────────────────────
router.get('/my', authMiddleware, async (req, res) => {
    try {
        await ensureTable();
        const userId = resolveUserId(req);
        const result = await pool.query(
            `SELECT id, method_category, method_name, bank_name, amount, notes,
                    status, rejection_reason, reviewed_at, created_at
             FROM coin_requests
             WHERE user_id = $1
             ORDER BY created_at DESC`,
            [userId]
        );
        res.json({ success: true, requests: result.rows });
    } catch (err) {
        console.error('GET /coin-requests/my error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch requests.' });
    }
});

// ── Admin: list all requests (optional ?status= filter) ───────────────────────
router.get('/admin', authMiddleware, async (req, res) => {
    try {
        await ensureTable();
        if (!await assertAdmin(resolveUserId(req))) {
            return res.status(403).json({ success: false, message: 'Admin access required.' });
        }

        const { status } = req.query;
        const params = [];
        let where = '';
        if (status && status !== 'All') {
            where = 'WHERE cr.status = $1';
            params.push(status);
        }

        const result = await pool.query(
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
        res.json({ success: true, requests: result.rows });
    } catch (err) {
        console.error('GET /coin-requests/admin error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch requests.' });
    }
});

// ── Admin: approve or reject a request ───────────────────────────────────────
router.put('/admin/:id/review', authMiddleware, async (req, res) => {
    try {
        await ensureTable();
        if (!await assertAdmin(resolveUserId(req))) {
            return res.status(403).json({ success: false, message: 'Admin access required.' });
        }

        const requestId = parseInt(req.params.id, 10);
        const { action, rejection_reason } = req.body;

        if (!['approve', 'reject'].includes(action)) {
            return res.status(400).json({ success: false, message: 'action must be "approve" or "reject".' });
        }

        const existing = await pool.query(
            'SELECT status FROM coin_requests WHERE id = $1 LIMIT 1',
            [requestId]
        );
        if (!existing.rows.length) {
            return res.status(404).json({ success: false, message: 'Request not found.' });
        }
        if (existing.rows[0].status !== 'Pending') {
            return res.status(409).json({
                success: false,
                message: `Request is already ${existing.rows[0].status}.`
            });
        }

        if (action === 'reject' && !rejection_reason?.trim()) {
            return res.status(400).json({
                success: false,
                message: 'rejection_reason is required when rejecting.'
            });
        }

        const newStatus = action === 'approve' ? 'Verified' : 'Rejected';
        await pool.query(
            `UPDATE coin_requests
             SET status = $1,
                 rejection_reason = $2,
                 reviewed_at = NOW(),
                 updated_at = NOW()
             WHERE id = $3`,
            [newStatus, action === 'reject' ? rejection_reason.trim() : null, requestId]
        );

        res.json({
            success: true,
            message: action === 'approve' ? 'Request approved.' : 'Request rejected.'
        });
    } catch (err) {
        console.error('PUT /coin-requests/admin/:id/review error:', err);
        res.status(500).json({ success: false, message: 'Failed to review request.' });
    }
});

// ── User: fetch active topup payment methods ──────────────────────────────────
router.get('/active-topup-methods', async (req, res) => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS topup_payment_methods (
                id         SERIAL PRIMARY KEY,
                name       VARCHAR(100) NOT NULL,
                icon       VARCHAR(60)  NOT NULL,
                fields     JSONB        NOT NULL DEFAULT '[]',
                is_active  BOOLEAN      NOT NULL DEFAULT true,
                created_at TIMESTAMPTZ  DEFAULT NOW(),
                updated_at TIMESTAMPTZ  DEFAULT NOW()
            )
        `);
        const result = await pool.query(
            `SELECT id, name, icon, fields
             FROM topup_payment_methods
             WHERE is_active = true
             ORDER BY id ASC`
        );
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('GET /active-topup-methods error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch payment methods.' });
    }
});

module.exports = router;
