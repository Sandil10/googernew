const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');

const ensureTables = async () => {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS withdrawal_payment_methods (
            id         SERIAL PRIMARY KEY,
            name       VARCHAR(100) NOT NULL,
            icon       VARCHAR(60)  NOT NULL DEFAULT 'card-outline',
            fields     JSONB        NOT NULL DEFAULT '[]',
            is_active  BOOLEAN      NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ  DEFAULT NOW(),
            updated_at TIMESTAMPTZ  DEFAULT NOW()
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS withdrawal_requests (
            id                  SERIAL PRIMARY KEY,
            user_id             INTEGER REFERENCES users(id),
            payment_method_id   INTEGER REFERENCES withdrawal_payment_methods(id),
            payment_method_name VARCHAR(100),
            amount              NUMERIC(12,2),
            payment_details     JSONB NOT NULL DEFAULT '{}',
            status              VARCHAR(20) DEFAULT 'Pending',
            rejection_reason    TEXT,
            wallet_transfer_id  INTEGER,
            created_at          TIMESTAMPTZ DEFAULT NOW(),
            reviewed_at         TIMESTAMPTZ,
            updated_at          TIMESTAMPTZ DEFAULT NOW()
        )
    `);
    // Add wallet_transfer_id if table existed before this column was added
    await pool.query(`
        ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS wallet_transfer_id INTEGER
    `);
    // Ensure users table has hold_balance column
    await pool.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS hold_balance NUMERIC(12,2) NOT NULL DEFAULT 0
    `);
};

// Resolve the Googer/admin system wallet user ID (mirrors adsController logic)
const resolveGoogerUserId = async (client) => {
    const adminResult = await client.query(
        `SELECT id FROM users WHERE LOWER(COALESCE(user_type, '')) = 'admin' ORDER BY id ASC LIMIT 1`
    );
    if (adminResult.rows.length > 0) return adminResult.rows[0].id;

    const googerResult = await client.query(
        `SELECT id FROM users WHERE LOWER(username) = 'googer' ORDER BY id ASC LIMIT 1`
    );
    if (googerResult.rows.length > 0) return googerResult.rows[0].id;

    const fallback = await client.query(`SELECT id FROM users ORDER BY id ASC LIMIT 1`);
    return fallback.rows[0]?.id || null;
};

// ── Public: list active payment methods ──────────────────────────────────────
router.get('/payment-methods', async (req, res) => {
    try {
        await ensureTables();
        const result = await pool.query(
            `SELECT id, name, icon, fields FROM withdrawal_payment_methods WHERE is_active = true ORDER BY id`
        );
        res.json({ success: true, methods: result.rows });
    } catch (err) {
        console.error('GET /withdrawals/payment-methods error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch payment methods.' });
    }
});

// ── All routes below require auth ─────────────────────────────────────────────
router.use(authMiddleware);

// ── User's own withdrawal requests ──────────────────────────────────────────
router.get('/my-requests', async (req, res) => {
    try {
        await ensureTables();
        const result = await pool.query(
            `SELECT id, payment_method_name, amount, status, rejection_reason, created_at, reviewed_at
             FROM withdrawal_requests
             WHERE user_id = $1
             ORDER BY created_at DESC`,
            [req.user.id]
        );
        res.json({ success: true, requests: result.rows });
    } catch (err) {
        console.error('GET /withdrawals/my-requests error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch withdrawal requests.' });
    }
});

// ── Submit withdrawal request ────────────────────────────────────────────────
router.post('/request', async (req, res) => {
    const client = await pool.connect();
    try {
        await ensureTables();
        const userId = req.user.id;

        const userRow = await client.query(
            'SELECT verification_status, wallet_balance FROM users WHERE id = $1 FOR UPDATE',
            [userId]
        );
        if (!userRow.rows.length) {
            client.release();
            return res.status(404).json({ success: false, message: 'User not found.' });
        }
        const { verification_status, wallet_balance } = userRow.rows[0];

        if (verification_status !== 'Verified') {
            client.release();
            return res.status(403).json({ success: false, message: 'You must be verified to withdraw.' });
        }

        const { payment_method_id, amount, payment_details } = req.body;
        if (!payment_method_id || !amount || !payment_details) {
            client.release();
            return res.status(400).json({
                success: false,
                message: 'payment_method_id, amount, and payment_details are required.',
            });
        }

        const numAmount = Number(amount);

        // Check withdrawal limits
        const settingsRow = await client.query(
            'SELECT min_amount, max_amount FROM withdrawal_settings ORDER BY id LIMIT 1'
        );
        if (settingsRow.rows.length) {
            const { min_amount, max_amount } = settingsRow.rows[0];
            if (numAmount < Number(min_amount)) {
                client.release();
                return res.status(400).json({ success: false, message: `Minimum withdrawal is ${min_amount} coins.` });
            }
            if (numAmount > Number(max_amount)) {
                client.release();
                return res.status(400).json({ success: false, message: `Maximum withdrawal is ${max_amount} coins.` });
            }
        }

        if (numAmount > Number(wallet_balance)) {
            client.release();
            return res.status(400).json({ success: false, message: 'Insufficient balance.' });
        }

        const methodRow = await client.query(
            'SELECT name FROM withdrawal_payment_methods WHERE id = $1 AND is_active = true',
            [payment_method_id]
        );
        if (!methodRow.rows.length) {
            client.release();
            return res.status(404).json({ success: false, message: 'Payment method not found or inactive.' });
        }
        const methodName = methodRow.rows[0].name;

        const googerUserId = await resolveGoogerUserId(client);
        if (!googerUserId) {
            client.release();
            return res.status(500).json({ success: false, message: 'System wallet not configured.' });
        }

        await client.query('BEGIN');

        // 1. Deduct from user wallet_balance, park in hold_balance
        await client.query(
            `UPDATE users
             SET wallet_balance = wallet_balance - $1,
                 hold_balance   = COALESCE(hold_balance, 0) + $1
             WHERE id = $2`,
            [numAmount, userId]
        );

        // 2. Record in wallet_transfers — immediately accepted so the calculated Googer balance shows credit.
        // The protected Super Admin users.wallet_balance is only changed by manual Super Admin actions.
        const transferResult = await client.query(
            `INSERT INTO wallet_transfers
                (sender_id, receiver_id, amount, commission, note, type, status, created_at, updated_at)
             VALUES ($1, $2, $3, $3, $4, 'withdrawal_hold', 'accepted', NOW(), NOW())
             RETURNING id`,
            [userId, googerUserId, numAmount, `Withdrawal Hold - ${methodName}`]
        );
        const walletTransferId = transferResult.rows[0].id;

        // 3. Insert withdrawal request linked to the transfer
        await client.query(
            `INSERT INTO withdrawal_requests
                (user_id, payment_method_id, payment_method_name, amount, payment_details, status, wallet_transfer_id)
             VALUES ($1, $2, $3, $4, $5, 'Pending', $6)`,
            [userId, payment_method_id, methodName, numAmount, JSON.stringify(payment_details), walletTransferId]
        );

        await client.query('COMMIT');
        client.release();

        res.json({ success: true, message: 'Withdrawal request submitted successfully.' });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        client.release();
        console.error('POST /withdrawals/request error:', err);
        res.status(500).json({ success: false, message: 'Failed to submit withdrawal request.' });
    }
});

module.exports = router;
