const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');
const { getLockedGoogerPooledState, normalizeMoney } = require('../../../../shared/utils/financeBoundary');
const {
    consumeHeldWalletFunds,
    refundHeldWalletFunds,
    creditWalletAndRecordTransfer,
} = require('../../../../shared/utils/financeCommands');

const assertAdmin = async (userId) => {
    const result = await pool.query('SELECT user_type FROM users WHERE id = $1 LIMIT 1', [userId]);
    return result.rows[0]?.user_type === 'admin';
};

// ── Public: live exchange rates via fastforex.io ─────────────────────────────
router.get('/exchange-rates', async (req, res) => {
    try {
        const fastforexKey = process.env.FASTFOREX_API_KEY;
        if (!fastforexKey) {
            return res.status(500).json({ success: false, message: 'Exchange rate service not configured.' });
        }
        const upstream = await fetch(
            'https://api.fastforex.io/fetch-multi?from=USD&to=LKR,EUR,GBP',
            { headers: { 'X-API-Key': fastforexKey } }
        );
        if (!upstream.ok) throw new Error(`Upstream ${upstream.status}`);
        const data = await upstream.json();

        const r = data.results;
        const lkrPerUsd = r.LKR;

        const rates = [
            { currency: 'USD', rate: lkrPerUsd },
            { currency: 'EUR', rate: r.EUR ? lkrPerUsd / r.EUR : null },
            { currency: 'GBP', rate: r.GBP ? lkrPerUsd / r.GBP : null },
        ];

        const date = data.updated
            ? new Date(data.updated).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
            : null;

        res.json({ success: true, rates, date });
    } catch (err) {
        console.error('GET /withdrawal-admin/exchange-rates error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to fetch exchange rates.' });
    }
});

// ── Public: frontend reads limits and rate ───────────────────────────────────
router.get('/settings', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM withdrawal_settings ORDER BY id LIMIT 1');
        res.json({ success: true, settings: result.rows[0] });
    } catch (err) {
        console.error('withdrawalAdmin GET /settings error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch withdrawal settings.' });
    }
});

// ── Admin: update limits and rate ────────────────────────────────────────────
router.put('/settings', authMiddleware, async (req, res) => {
    try {
        if (!await assertAdmin(req.user.id)) {
            return res.status(403).json({ success: false, message: 'Admin access required.' });
        }
        const { min_amount, max_amount, coin_rate } = req.body;
        if (!min_amount || !max_amount) {
            return res.status(400).json({ success: false, message: 'min_amount and max_amount are required.' });
        }
        await pool.query(
            `UPDATE withdrawal_settings
             SET min_amount=$1, max_amount=$2, coin_rate=$3, updated_at=NOW()
             WHERE id = (SELECT id FROM withdrawal_settings ORDER BY id LIMIT 1)`,
            [Number(min_amount), Number(max_amount), Number(coin_rate) || 0.0056]
        );
        res.json({ success: true, message: 'Withdrawal settings updated.' });
    } catch (err) {
        console.error('withdrawalAdmin PUT /settings error:', err);
        res.status(500).json({ success: false, message: 'Failed to update withdrawal settings.' });
    }
});

// ── Admin: list all withdrawal requests ──────────────────────────────────────
router.get('/requests', authMiddleware, async (req, res) => {
    try {
        if (!await assertAdmin(req.user.id)) {
            return res.status(403).json({ success: false, message: 'Admin access required.' });
        }
        const { status } = req.query;
        const params = [];
        let where = '';
        if (status && status !== 'All') {
            where = 'WHERE wr.status = $1';
            params.push(status);
        }
        const result = await pool.query(
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
        res.json({ success: true, requests: result.rows });
    } catch (err) {
        console.error('GET /withdrawal-admin/requests error:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch withdrawal requests.' });
    }
});

// ── Admin: approve or reject a withdrawal request ────────────────────────────
router.put('/requests/:id/review', authMiddleware, async (req, res) => {
    const client = await pool.connect();
    try {
        if (!await assertAdmin(req.user.id)) {
            client.release();
            return res.status(403).json({ success: false, message: 'Admin access required.' });
        }

        const requestId = parseInt(req.params.id, 10);
        const { action, rejection_reason } = req.body; // action: 'approve' | 'reject'

        if (!['approve', 'reject'].includes(action)) {
            client.release();
            return res.status(400).json({ success: false, message: 'action must be "approve" or "reject".' });
        }

        await client.query('BEGIN');

        // Lock the withdrawal request row
        const reqRow = await client.query(
            `SELECT id, user_id, amount, status, wallet_transfer_id, payment_method_name
             FROM withdrawal_requests WHERE id = $1 FOR UPDATE`,
            [requestId]
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
            return res.status(409).json({ success: false, message: `Request is already ${wr.status}.` });
        }

        const numAmount   = normalizeMoney(wr.amount);
        const userId      = wr.user_id;
        const transferId  = wr.wallet_transfer_id;
        const googerState = await getLockedGoogerPooledState(client);
        const googerUserId = googerState?.userId || null;
        if (!googerUserId) {
            await client.query('ROLLBACK');
            client.release();
            return res.status(500).json({ success: false, message: 'System wallet not configured.' });
        }

        if (action === 'approve') {
            // Mark request approved
            await client.query(
                `UPDATE withdrawal_requests
                 SET status = 'Approved', reviewed_at = NOW(), updated_at = NOW()
                 WHERE id = $1`,
                [requestId]
            );

            // Release from user hold_balance (already deducted from wallet_balance on submit)
            await consumeHeldWalletFunds(client, { userId, amount: numAmount });

            // Record the admin payout without touching Main Googer Balance.
            // The withdrawal_hold row already credited X when the user submitted the request.
            // Main Googer Balance is SUM(wallet_transfers.commission), so this row must stay 0.
            await creditWalletAndRecordTransfer(client, {
                senderId: googerUserId,
                receiverId: userId,
                amount: numAmount,
                note: `Withdrawal Paid - ${wr.payment_method_name}`,
                type: 'withdrawal_paid',
                status: 'accepted',
                commission: 0,
                commissionPercentage: 0,
                creditWallet: false,
            });

        } else {
            // Reject — refund the amount back to user
            if (!rejection_reason?.trim()) {
                await client.query('ROLLBACK');
                client.release();
                return res.status(400).json({ success: false, message: 'rejection_reason is required when rejecting.' });
            }

            // Mark request rejected
            await client.query(
                `UPDATE withdrawal_requests
                 SET status = 'Rejected', rejection_reason = $1, reviewed_at = NOW(), updated_at = NOW()
                 WHERE id = $2`,
                [rejection_reason.trim(), requestId]
            );

            // Refund: return amount to user wallet_balance, clear hold_balance
            await refundHeldWalletFunds(client, { userId, amount: numAmount });

            // Mark withdrawal_hold as refunded — removes it from Googer commission SUM.
            if (transferId) {
                await client.query(
                    `UPDATE wallet_transfers SET status = 'refunded', updated_at = NOW() WHERE id = $1`,
                    [transferId]
                );
            }
        }

        await client.query('COMMIT');
        client.release();

        res.json({
            success: true,
            message: action === 'approve' ? 'Withdrawal approved.' : 'Withdrawal rejected and refunded.',
        });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        client.release();
        console.error(`PUT /withdrawal-admin/requests/:id/review error:`, err);
        res.status(500).json({ success: false, message: 'Failed to review withdrawal request.' });
    }
});

module.exports = router;
