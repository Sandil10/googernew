const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');
const { lockGoogerMainWalletUser, normalizeMoney } = require('../../../../shared/utils/financeBoundary');
const {
    reserveWalletFunds,
    refundHeldWalletFunds,
    insertWalletTransfer,
} = require('../../../../shared/utils/financeCommands');


// ── Public: list active payment methods ──────────────────────────────────────
router.get('/payment-methods', async (req, res) => {
    try {
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

// ── Cancel a pending withdrawal request (user self-cancel) ──────────────────
router.delete('/cancel/:id', async (req, res) => {
    const client = await pool.connect();
    try {
        const userId = req.user.id;
        const { id } = req.params;

        await client.query('BEGIN');

        // Fetch the request — must belong to this user and still be Pending
        const reqRow = await client.query(
            `SELECT id, amount, status, wallet_transfer_id
             FROM withdrawal_requests
             WHERE id = $1 AND user_id = $2 FOR UPDATE`,
            [id, userId]
        );
        if (!reqRow.rows.length) {
            await client.query('ROLLBACK');
            client.release();
            return res.status(404).json({ success: false, message: 'Withdrawal request not found.' });
        }
        const wr = reqRow.rows[0];
        if (wr.status !== 'Pending') {
            await client.query('ROLLBACK');
            client.release();
            return res.status(400).json({ success: false, message: 'Only pending withdrawals can be cancelled.' });
        }

        const amount = Number(wr.amount);

        // Refund wallet_balance and deduct hold_balance
        await refundHeldWalletFunds(client, { userId, amount });

        // Mark the original wallet transfer as cancelled
        if (wr.wallet_transfer_id) {
            await client.query(
                `UPDATE wallet_transfers SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
                [wr.wallet_transfer_id]
            );
        }

        // Mark the withdrawal request as Cancelled
        await client.query(
            `UPDATE withdrawal_requests SET status = 'Cancelled', updated_at = NOW() WHERE id = $1`,
            [id]
        );

        await client.query('COMMIT');
        client.release();
        res.json({ success: true, message: 'Withdrawal cancelled and amount refunded to your wallet.' });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        client.release();
        console.error('DELETE /withdrawals/cancel/:id error:', err);
        res.status(500).json({ success: false, message: 'Failed to cancel withdrawal.' });
    }
});

// ── Submit withdrawal request ────────────────────────────────────────────────
router.post('/request', async (req, res) => {
    const client = await pool.connect();
    try {
        const userId = req.user.id;
        const { payment_method_id, amount, payment_details } = req.body;
        const paymentDetailsJson = JSON.stringify(payment_details || {});
        const numAmount = normalizeMoney(amount);

        if (!payment_method_id || !amount || !payment_details) {
            client.release();
            return res.status(400).json({
                success: false,
                message: 'payment_method_id, amount, and payment_details are required.',
            });
        }

        if (!numAmount || numAmount <= 0) {
            client.release();
            return res.status(400).json({ success: false, message: 'Enter a valid amount greater than 0.' });
        }

        await client.query('BEGIN');

        const userRow = await client.query(
            'SELECT verification_status, wallet_balance FROM users WHERE id = $1 FOR UPDATE',
            [userId]
        );
        if (!userRow.rows.length) {
            await client.query('ROLLBACK');
            client.release();
            return res.status(404).json({ success: false, message: 'User not found.' });
        }
        const { verification_status, wallet_balance } = userRow.rows[0];

        if (verification_status !== 'Verified') {
            await client.query('ROLLBACK');
            client.release();
            return res.status(403).json({ success: false, message: 'You must be verified to withdraw.' });
        }

        // Check withdrawal limits
        const settingsRow = await client.query(
            'SELECT min_amount, max_amount FROM withdrawal_settings ORDER BY id LIMIT 1'
        );
        if (settingsRow.rows.length) {
            const { min_amount, max_amount } = settingsRow.rows[0];
            if (numAmount < Number(min_amount)) {
                await client.query('ROLLBACK');
                client.release();
                return res.status(400).json({ success: false, message: `Minimum withdrawal is ${min_amount} coins.` });
            }
            if (numAmount > Number(max_amount)) {
                await client.query('ROLLBACK');
                client.release();
                return res.status(400).json({ success: false, message: `Maximum withdrawal is ${max_amount} coins.` });
            }
        }

        if (numAmount > Number(wallet_balance)) {
            await client.query('ROLLBACK');
            client.release();
            return res.status(400).json({ success: false, message: 'Insufficient balance.' });
        }

        const methodRow = await client.query(
            'SELECT name FROM withdrawal_payment_methods WHERE id = $1 AND is_active = true',
            [payment_method_id]
        );
        if (!methodRow.rows.length) {
            await client.query('ROLLBACK');
            client.release();
            return res.status(404).json({ success: false, message: 'Payment method not found or inactive.' });
        }
        const methodName = methodRow.rows[0].name;

        const existingPending = await client.query(
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
            [userId, payment_method_id, numAmount, paymentDetailsJson]
        );
        if (existingPending.rows.length > 0) {
            await client.query('COMMIT');
            client.release();
            return res.status(200).json({
                success: true,
                duplicateSuppressed: true,
                request: existingPending.rows[0],
                message: 'A matching pending withdrawal request already exists.',
            });
        }

        const googerWallet = await lockGoogerMainWalletUser(client);
        const googerUserId = googerWallet?.id || null;
        if (!googerUserId) {
            await client.query('ROLLBACK');
            client.release();
            return res.status(500).json({ success: false, message: 'System wallet not configured.' });
        }

        // 1. Deduct from user wallet_balance, park in hold_balance
        await reserveWalletFunds(client, { userId, amount: numAmount });

        // 2. Record in wallet_transfers — immediately accepted so the calculated Googer balance shows credit.
        // The protected Super Admin users.wallet_balance is only changed by manual Super Admin actions.
        const transferResult = await insertWalletTransfer(client, {
            senderId: userId,
            receiverId: googerUserId,
            amount: numAmount,
            note: `Withdrawal Hold - ${methodName}`,
            type: 'withdrawal_hold',
            status: 'accepted',
            commission: numAmount,
            commissionPercentage: 0,
        });
        const walletTransferId = transferResult.id;

        // 3. Insert withdrawal request linked to the transfer
        await client.query(
            `INSERT INTO withdrawal_requests
                (user_id, payment_method_id, payment_method_name, amount, payment_details, status, wallet_transfer_id)
             VALUES ($1, $2, $3, $4, $5, 'Pending', $6)`,
            [userId, payment_method_id, methodName, numAmount, paymentDetailsJson, walletTransferId]
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
