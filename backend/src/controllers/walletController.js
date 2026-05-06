const pool = require('../config/database');

const TRANSACTION_ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

function hashString(value) {
    let hash = 0;

    for (let index = 0; index < value.length; index += 1) {
        hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
    }

    return Math.abs(hash);
}

function encodeBase62(value) {
    if (!value) return '0';

    let current = value;
    let encoded = '';

    while (current > 0) {
        encoded = TRANSACTION_ID_ALPHABET[current % TRANSACTION_ID_ALPHABET.length] + encoded;
        current = Math.floor(current / TRANSACTION_ID_ALPHABET.length);
    }

    return encoded;
}

function formatManualPaymentDisplayTransactionId(value) {
    const normalized = String(value ?? '').replace(/\D/g, '').trim() || '0';
    const digitsOnly = `${hashString(`manual:${normalized}`)}${normalized}${hashString(`manual:receipt:${normalized}`)}`.replace(/\D/g, '');
    return digitsOnly.slice(0, 10).padEnd(10, '0');
}

async function getTransferDisplayData(client, transferId) {
    const result = await client.query(
        `SELECT t.*,
                s.username AS sender_username,
                s.user_id AS sender_readable_id,
                r.username AS receiver_username,
                r.user_id AS receiver_readable_id
         FROM wallet_transfers t
         JOIN users s ON t.sender_id = s.id
         LEFT JOIN users r ON t.receiver_id = r.id
         WHERE t.id = $1`,
        [transferId]
    );

    if (result.rows.length === 0) {
        return null;
    }

    const transfer = result.rows[0];
    if (String(transfer.type || '').toLowerCase() === 'order_hold' && /manual payment/i.test(String(transfer.note || ''))) {
        transfer.transaction_id = formatManualPaymentDisplayTransactionId(transfer.id);
    }

    return transfer;
}

// Search users by user_id or username
exports.searchUsers = async (req, res) => {
    try {
        const { query } = req.query;
        const normalizedQuery = String(query || '').trim();
        const includeSelf = String(req.query.includeSelf || '').toLowerCase() === 'true';

        if (!normalizedQuery) {
            return res.status(400).json({ success: false, message: 'Query too short' });
        }

        const result = await pool.query(
            `SELECT id, user_id, username, full_name, profile_picture, user_type 
             FROM users 
             WHERE (
                user_id = $2
                OR (
                    LENGTH($2) >= 2
                    AND (user_id ILIKE $1 OR username ILIKE $1 OR full_name ILIKE $1)
                )
             )
             AND ($4::boolean = true OR id != $3)
             LIMIT 10`,
            [`%${normalizedQuery}%`, normalizedQuery, req.user.id, includeSelf]
        );

        res.status(200).json({
            success: true,
            users: result.rows
        });
    } catch (error) {
        console.error('Search users error:', error);
        res.status(500).json({ success: false, message: 'Server error searching users' });
    }
};

exports.initiateTransferRequest = async (req, res) => {
    const client = await pool.connect();
    try {
        const { receiverId, amount, note, commissionPercentage, type = 'request', manualPaymentOrder = false } = req.body;
        const senderId = req.user.id; // User A (the requester/sender)

        if (!receiverId || !amount || parseFloat(amount) <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid receiver or amount' });
        }

        await client.query('BEGIN');

        const baseAmount = parseFloat(amount);
        const commPercent = parseFloat(commissionPercentage || 0);
        let calculatedCommission = 0;

        // Manual Googer payment must always stay on hold until order receipt confirmation.
        if (type === 'sell' && manualPaymentOrder) {
            const senderResult = await client.query(
                'SELECT wallet_balance FROM users WHERE id = $1 FOR UPDATE',
                [senderId]
            );
            const senderBalance = parseFloat(senderResult.rows[0].wallet_balance || 0);

            if (senderBalance < baseAmount) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: 'Insufficient balance' });
            }

            await client.query(
                'UPDATE users SET wallet_balance = wallet_balance - $1, hold_balance = hold_balance + $1 WHERE id = $2',
                [baseAmount, senderId]
            );

            const txNote = note || 'Googer Manual Payment Hold';
            const result = await client.query(
                `INSERT INTO wallet_transfers (sender_id, receiver_id, amount, note, type, status, commission_percentage, commission)
                 VALUES ($1, $2, $3, $4, 'order_hold', 'pending', 0, 0)
                 RETURNING *`,
                [senderId, receiverId, baseAmount, txNote]
            );
            const displayTransaction = await getTransferDisplayData(client, result.rows[0].id);

            await client.query('COMMIT');

            return res.status(201).json({
                success: true,
                message: `Payment held successfully. ${baseAmount.toFixed(2)} coins will be released after buyer marks order as received.`,
                transfer: displayTransaction || result.rows[0],
                transaction: displayTransaction || result.rows[0]
            });
        }

        // Calculate commission if any
        if (commPercent > 0) {
            calculatedCommission = (baseAmount * commPercent) / 100;
        }

        // ============================================
        // NEW: DIRECT TRANSFER IF NO COMMISSION
        // ============================================
        if (type === 'sell' && commPercent === 0 && !manualPaymentOrder) {
            // Check sender's balance
            const senderResult = await client.query(
                'SELECT wallet_balance FROM users WHERE id = $1',
                [senderId]
            );
            const senderBalance = parseFloat(senderResult.rows[0].wallet_balance);

            if (senderBalance < baseAmount) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: 'Insufficient balance' });
            }

            // Deduct from sender
            await client.query(
                'UPDATE users SET wallet_balance = wallet_balance - $1 WHERE id = $2',
                [baseAmount, senderId]
            );

            // Add to receiver DIRECTLY
            await client.query(
                'UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2',
                [baseAmount, receiverId]
            );

            // Record as completed transaction (status = 'accepted', not 'pending')
            const txNote = note || 'Direct Money Transfer';
            const result = await client.query(
                `INSERT INTO wallet_transfers (sender_id, receiver_id, amount, note, type, status, commission_percentage, commission)
                 VALUES ($1, $2, $3, $4, $5, 'accepted', $6, $7)
                 RETURNING *`,
                [senderId, receiverId, baseAmount, txNote, type, 0, 0]
            );

            await client.query('COMMIT');

            return res.status(201).json({
                success: true,
                message: `Transfer successful! ${baseAmount} coins sent directly.`,
                transfer: result.rows[0]
            });
        }

        // ============================================
        // ORIGINAL: PENDING REQUEST IF WITH COMMISSION
        // ============================================
        let amountToHold = 0;

        if (type === 'sell') {
            // Hold the full amount (e.g., 100)
            amountToHold = baseAmount;

            // Calculate commission (e.g., 10% of 100 = 10)
            if (commPercent > 0) {
                calculatedCommission = (baseAmount * commPercent) / 100;
            }

            // Check sender's balance
            const senderResult = await client.query(
                'SELECT wallet_balance FROM users WHERE id = $1',
                [senderId]
            );
            const senderBalance = parseFloat(senderResult.rows[0].wallet_balance);

            if (senderBalance < amountToHold) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, message: 'Insufficient balance' });
            }

            // Deduct full amount from sender's wallet_balance and add to hold_balance
            await client.query(
                'UPDATE users SET wallet_balance = wallet_balance - $1, hold_balance = hold_balance + $1 WHERE id = $2',
                [amountToHold, senderId]
            );
        } else {
            // For 'request' (buy), calculate the amount that will be requested
            if (commPercent > 0) {
                calculatedCommission = (baseAmount * commPercent) / 100;
            }
            amountToHold = baseAmount; // This is what will be requested from receiver
        }

        const txNote = note || (commPercent > 0 ? `Commission ${type === 'sell' ? 'Transfer' : 'Request'} (${commPercent}%)` : type === 'sell' ? 'Money Transfer' : 'Money Request');

        // Insert transfer record with status 'pending'
        // Store the full amount and commission separately
        const result = await client.query(
            `INSERT INTO wallet_transfers (sender_id, receiver_id, amount, note, type, status, commission_percentage, commission)
             VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7)
             RETURNING *`,
            [senderId, receiverId, amountToHold, txNote, type, commPercent, calculatedCommission]
        );

        await client.query('COMMIT');

        const successMessage = type === 'sell'
            ? `Money transfer initiated. ${amountToHold} coins on hold until receiver accepts.`
            : 'Money request sent successfully.';

        res.status(201).json({
            success: true,
            message: successMessage,
            transfer: result.rows[0]
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Initiate transfer error:', error);
        res.status(500).json({ success: false, message: 'Server error initiating transfer' });
    } finally {
        client.release();
    }
};

// Get pending requests for the current user (where current user is the receiver/payer)
exports.getPendingRequests = async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await pool.query(
            `SELECT t.*, u.username as sender_username, u.full_name as sender_full_name, u.profile_picture as sender_profile_picture
             FROM wallet_transfers t
             JOIN users u ON t.sender_id = u.id
             WHERE t.receiver_id = $1 AND t.status = 'pending' AND t.type IN ('request', 'sell')
             ORDER BY t.created_at DESC`,
            [userId]
        );

        res.status(200).json({
            success: true,
            requests: result.rows
        });
    } catch (error) {
        console.error('Get pending requests error:', error);
        res.status(500).json({ success: false, message: 'Server error fetching requests' });
    }
};

// Respond to a request (Accept/Reject)
exports.respondToRequest = async (req, res) => {
    const client = await pool.connect();
    try {
        const { requestId, action } = req.body; // action: 'accept' or 'reject'
        const userId = req.user.id; // User B (the receiver who needs to accept/reject)

        await client.query('BEGIN');

        // 1. Get request details
        const requestResult = await client.query(
            'SELECT * FROM wallet_transfers WHERE id = $1 AND receiver_id = $2 AND status = \'pending\'',
            [requestId, userId]
        );

        if (requestResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Request not found or already processed' });
        }

        const transfer = requestResult.rows[0];
        const transferAmount = parseFloat(transfer.amount);
        const transferType = transfer.type; // 'sell' or 'request' (buy)

        if (action === 'reject') {
            // If type is 'sell', return the held amount back to sender
            if (transferType === 'sell') {
                // Remove from hold_balance and add back to wallet_balance
                await client.query(
                    'UPDATE users SET hold_balance = hold_balance - $1, wallet_balance = wallet_balance + $1 WHERE id = $2',
                    [transferAmount, transfer.sender_id]
                );
            }
            // If type is 'request' (buy), nothing to return (no money was held)

            // Update transfer status to rejected
            await client.query(
                'UPDATE wallet_transfers SET status = \'rejected\', updated_at = CURRENT_TIMESTAMP WHERE id = $1',
                [requestId]
            );

            await client.query('COMMIT');
            const rejectMessage = transferType === 'sell'
                ? 'Request rejected. Amount returned to sender.'
                : 'Request rejected.';
            return res.status(200).json({ success: true, message: rejectMessage });
        }

        if (action === 'accept') {
            if (transferType === 'sell') {
                // For 'sell': Split the held amount
                // Example: transferAmount = 100, commission = 10
                // Receiver gets: 100 - 10 = 90
                // Sender gets back: 10 (commission)

                const commission = parseFloat(transfer.commission || 0);
                const amountToReceiver = transferAmount - commission; // 90
                const amountBackToSender = commission; // 10

                // Remove full amount from sender's hold_balance
                await client.query(
                    'UPDATE users SET hold_balance = hold_balance - $1 WHERE id = $2',
                    [transferAmount, transfer.sender_id]
                );

                // Give (amount - commission) to receiver
                await client.query(
                    'UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2',
                    [amountToReceiver, userId]
                );

                // Return commission to sender's wallet
                if (commission > 0) {
                    await client.query(
                        'UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2',
                        [amountBackToSender, transfer.sender_id]
                    );
                }
            } else {
                // For 'request' (buy): Deduct from receiver and give to sender
                // Check receiver's balance first
                const receiverResult = await client.query(
                    'SELECT wallet_balance FROM users WHERE id = $1',
                    [userId]
                );
                const receiverBalance = parseFloat(receiverResult.rows[0].wallet_balance);

                if (receiverBalance < transferAmount) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ success: false, message: 'Insufficient balance' });
                }

                // Deduct from receiver (User B)
                await client.query(
                    'UPDATE users SET wallet_balance = wallet_balance - $1 WHERE id = $2',
                    [transferAmount, userId]
                );

                // Add to sender (User A who requested)
                await client.query(
                    'UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2',
                    [transferAmount, transfer.sender_id]
                );
            }

            // Update transfer status to accepted
            await client.query(
                `UPDATE wallet_transfers 
                 SET status = 'accepted', 
                     updated_at = CURRENT_TIMESTAMP 
                 WHERE id = $1`,
                [requestId]
            );

            await client.query('COMMIT');
            const acceptMessage = transferType === 'sell'
                ? `Transfer accepted. You received ${(transferAmount - parseFloat(transfer.commission || 0)).toFixed(2)} coins.`
                : 'Request accepted. Payment sent.';
            return res.status(200).json({ success: true, message: acceptMessage });
        }

        await client.query('ROLLBACK');
        res.status(400).json({ success: false, message: 'Invalid action' });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Respond to request error:', error);
        res.status(500).json({ success: false, message: 'Server error processing request' });
    } finally {
        client.release();
    }
};

// Cancel a pending transfer/request created by the current user
exports.cancelTransaction = async (req, res) => {
    const client = await pool.connect();

    try {
        const { transactionId } = req.body;
        const userId = req.user.id;

        if (!transactionId) {
            return res.status(400).json({ success: false, message: 'Transaction ID is required' });
        }

        await client.query('BEGIN');

        const transferResult = await client.query(
            `SELECT *
             FROM wallet_transfers
             WHERE id = $1
               AND sender_id = $2
               AND status = 'pending'
             FOR UPDATE`,
            [transactionId, userId]
        );

        if (transferResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Pending transaction not found' });
        }

        const transfer = transferResult.rows[0];
        const transferAmount = parseFloat(transfer.amount || 0);
        const transferType = String(transfer.type || '').toLowerCase();
        const transferNote = String(transfer.note || '');

        if (transferType === 'order_hold' && !/manual payment/i.test(transferNote)) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                message: 'Googer Payment transactions cannot be cancelled from wallet history'
            });
        }

        if (transferType === 'sell') {
            await client.query(
                'UPDATE users SET hold_balance = hold_balance - $1, wallet_balance = wallet_balance + $1 WHERE id = $2',
                [transferAmount, transfer.sender_id]
            );
        } else if (transferType === 'order_hold') {
            await client.query(
                'UPDATE users SET hold_balance = hold_balance - $1, wallet_balance = wallet_balance + $1 WHERE id = $2',
                [transferAmount, transfer.sender_id]
            );
        }

        await client.query(
            `UPDATE wallet_transfers
             SET status = 'cancelled',
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [transactionId]
        );

        await client.query('COMMIT');

        return res.status(200).json({
            success: true,
            message: 'Transaction cancelled successfully'
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Cancel transaction error:', error);
        return res.status(500).json({ success: false, message: 'Server error cancelling transaction' });
    } finally {
        client.release();
    }
};

// Direct Transfer (User A sends money to User B)
exports.directTransfer = async (req, res) => {
    const client = await pool.connect();
    try {
        const { receiverId, amount, note, commissionPercentage } = req.body;
        const senderId = req.user.id;

        if (!receiverId || !amount || parseFloat(amount) <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid receiver or amount' });
        }

        let baseAmount = parseFloat(amount);
        let commInput = parseFloat(commissionPercentage || 0);
        let finalTransferAmount = 0;
        let calculatedCommission = 0;

        if (commInput > 0) {
            // If commission is entered, transfer ONLY the commission amount
            calculatedCommission = (baseAmount * commInput) / 100;
            finalTransferAmount = calculatedCommission;
        } else {
            // Normal transfer of the base amount
            finalTransferAmount = baseAmount;
        }

        if (finalTransferAmount <= 0) {
            return res.status(400).json({ success: false, message: 'Final transfer amount must be greater than 0' });
        }

        await client.query('BEGIN');

        // Check sender balance
        const sender = await client.query('SELECT wallet_balance FROM users WHERE id = $1', [senderId]);
        const balance = parseFloat(sender.rows[0].wallet_balance);

        if (balance < finalTransferAmount) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: 'Insufficient balance' });
        }

        // Deduct from sender
        await client.query(
            'UPDATE users SET wallet_balance = wallet_balance - $1 WHERE id = $2',
            [finalTransferAmount, senderId]
        );

        // Add to receiver
        await client.query(
            'UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2',
            [finalTransferAmount, receiverId]
        );

        // Generate descriptive note if none provided
        let txNote = note;
        if (!txNote) {
            txNote = commInput > 0 ? `Commission Transfer (${commInput}%)` : 'Direct Transfer';
        }

        // Log transfer with commission details
        await client.query(
            `INSERT INTO wallet_transfers (sender_id, receiver_id, amount, note, type, status, commission, commission_percentage)
             VALUES ($1, $2, $3, $4, 'transfer', 'accepted', $5, $6)`,
            [senderId, receiverId, finalTransferAmount, txNote, calculatedCommission, commInput]
        );

        await client.query('COMMIT');
        res.status(200).json({ success: true, message: 'Transfer successful', transferAmount: finalTransferAmount });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Direct transfer error:', error);
        res.status(500).json({ success: false, message: 'Server error processing transfer' });
    } finally {
        client.release();
    }
};
// Pay for order — moves amount to hold_balance (pending until order is fulfilled/released)
exports.payOrder = async (req, res) => {
    const fs = require('fs');
    const path = require('path');
    const logPath = path.join(process.cwd(), 'payment_debug.log');

    const client = await pool.connect();
    try {
        const { amount, orderId, note } = req.body;
        const userId = req.user.id;

        fs.appendFileSync(logPath, `[${new Date().toISOString()}] PayOrder - User: ${userId}, Body: ${JSON.stringify(req.body)}\n`);

        if (!amount || parseFloat(amount) <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid amount' });
        }

        const holdAmount = parseFloat(amount);

        await client.query('BEGIN');

        // Lock user row and check balance
        const userResult = await client.query(
            'SELECT wallet_balance, hold_balance FROM users WHERE id = $1 FOR UPDATE',
            [userId]
        );

        if (userResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: `User not found (ID: ${userId})` });
        }

        const wallet_balance = userResult.rows[0].wallet_balance !== null ? parseFloat(userResult.rows[0].wallet_balance) : 0;
        const current_hold = userResult.rows[0].hold_balance !== null ? parseFloat(userResult.rows[0].hold_balance) : 0;

        if (wallet_balance < holdAmount) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                message: `Insufficient balance. Required: R ${holdAmount.toFixed(2)}, Available: R ${wallet_balance.toFixed(2)}`
            });
        }

        // Move amount from wallet_balance → hold_balance (on hold for this order)
        await client.query(
            'UPDATE users SET wallet_balance = wallet_balance - $1, hold_balance = COALESCE(hold_balance, 0) + $1 WHERE id = $2',
            [holdAmount, userId]
        );

        // Record as a pending order hold transaction
        const txNote = note || (orderId ? `Payment on hold for Order #${orderId}` : 'Payment on hold for Googer Order');
        const transferRes = await client.query(
            `INSERT INTO wallet_transfers (sender_id, receiver_id, amount, note, type, status)
             VALUES ($1, $2, $3, $4, 'order_hold', 'pending') RETURNING id`,
            [userId, userId, holdAmount, txNote]
        );

        await client.query('COMMIT');

        res.status(200).json({
            success: true,
            message: 'Payment placed on hold. It will be released to the seller once your order is delivered.',
            currentBalance: wallet_balance - holdAmount,
            holdBalance: current_hold + holdAmount,
            transferId: transferRes.rows[0].id
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Pay order error:', error);

        try {
            const fs = require('fs');
            const path = require('path');
            const logPath = path.join(process.cwd(), 'payment_debug.log');
            fs.appendFileSync(logPath, `[${new Date().toISOString()}] PayOrder ERROR: ${error.message}\n${error.stack}\n`);
        } catch (e) { }

        res.status(500).json({
            success: false,
            message: 'Server error processing payment: ' + (error.message || 'Unknown error'),
            debug: error
        });
    } finally {
        client.release();
    }
};

// Get transaction history for current user
exports.getTransactionHistory = async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await pool.query(
            `SELECT t.*, 
                    s.username as sender_username, s.full_name as sender_full_name, s.user_id as sender_readable_id,
                    r.username as receiver_username, r.full_name as receiver_full_name, r.user_id as receiver_readable_id,
                    order_summary.order_number as linked_order_number,
                    COALESCE(order_summary.can_cancel, false) as linked_order_can_cancel,
                    order_summary.primary_status as linked_order_status
             FROM wallet_transfers t
             JOIN users s ON t.sender_id = s.id
             LEFT JOIN users r ON t.receiver_id = r.id
             LEFT JOIN LATERAL (
                 SELECT
                     MIN(o.order_number) AS order_number,
                     BOOL_AND(o.status = 'pending') AS can_cancel,
                     CASE
                         WHEN BOOL_OR(o.status = 'processing') THEN 'processing'
                         WHEN BOOL_OR(o.status = 'shipped') THEN 'shipped'
                         WHEN BOOL_OR(o.status = 'delivered') THEN 'delivered'
                         WHEN BOOL_OR(o.status = 'received') THEN 'received'
                         WHEN BOOL_OR(o.status = 'cancelled') THEN 'cancelled'
                         WHEN BOOL_AND(o.status = 'pending') THEN 'pending'
                         ELSE MIN(o.status)
                     END AS primary_status
                 FROM orders o
                 WHERE o.wallet_transfer_id = t.id
             ) order_summary ON TRUE
             WHERE t.sender_id = $1 OR t.receiver_id = $1
             ORDER BY t.created_at DESC
             LIMIT 50`,
            [userId]
        );

        res.status(200).json({
            success: true,
            transactions: result.rows
        });
    } catch (error) {
        console.error('Get transaction history error:', error);
        res.status(500).json({ success: false, message: 'Server error fetching transaction history' });
    }
};
