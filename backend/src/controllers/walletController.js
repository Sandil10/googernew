const pool = require('../config/database');
const { distributeProductDiscountCommission } = require('../utils/referralCommission');
const { resolveGoogerMainWalletUserId, getLockedGoogerPooledState } = require('../../../../shared/utils/financeBoundary');
const {
    reserveWalletFunds,
    refundHeldWalletFunds,
    consumeHeldWalletFunds,
    creditWalletBalance,
    debitWalletBalance,
    insertWalletTransfer,
    transferWalletFunds,
    recordGoogerRevenuePayment,
} = require('../../../../shared/utils/financeCommands');

const TRANSACTION_ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const UTC_NOW_SQL = "NOW()";

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

function formatGenericDisplayTransactionId(value) {
    const normalized = String(value ?? '').replace(/[^a-zA-Z0-9]/g, '').trim();
    if (!normalized) return 'G35hfSj5g7';

    const body = normalized.replace(/^[gG]/, '');
    if (body && /[A-Za-z]/.test(body) && /\d/.test(body)) {
        return `G${body}`;
    }

    const seed = body || '0';
    const hashedPrefix = encodeBase62(hashString(`googer:${seed}`));
    const hashedSuffix = encodeBase62(hashString(`wallet:${seed}`));
    let mixedBody = `${hashedPrefix}${seed}${hashedSuffix}`.replace(/[^a-zA-Z0-9]/g, '');

    if (!/[A-Za-z]/.test(mixedBody)) mixedBody += 'hfSj';
    if (!/\d/.test(mixedBody)) mixedBody += '357';

    mixedBody = mixedBody.slice(0, 9).padEnd(9, '7');

    return `G${mixedBody}`;
}

async function getTransferDisplayData(client, transferId) {
    const result = await client.query(
        `SELECT t.*,
                s.username AS sender_username,
                s.user_id AS sender_readable_id,
                s.user_type AS sender_user_type,
                r.username AS receiver_username,
                r.user_id AS receiver_readable_id,
                r.user_type AS receiver_user_type
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

    return mapWalletTransferRow(transfer);
}

function toUtcIso(value) {
    if (!value) return null;

    const normalized = String(value).trim();
    return new Date(normalized.includes('T') || normalized.endsWith('Z') ? normalized : `${normalized.replace(' ', 'T')}Z`).toISOString();
}

function mapWalletTransferRow(row) {
    if (!row) return row;

    return {
        ...row,
        created_at: toUtcIso(row.created_at),
        updated_at: toUtcIso(row.updated_at),
        transaction_timestamp: toUtcIso(row.created_at),
    };
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
                    LENGTH($2) >= 1
                    AND (
                        user_id ILIKE $1
                        OR username ILIKE $1
                        OR full_name ILIKE $1
                        OR (email IS NOT NULL AND email ILIKE $1)
                        OR CAST(id AS TEXT) = $2
                    )
                )
             )
             AND ($4::boolean = true OR id != $3)
             AND id NOT IN (
                 SELECT blocked_user_id FROM user_blocks WHERE blocker_id = $3
             )
             AND COALESCE(status, 'Active') <> 'Deleted'
             AND COALESCE(is_deactivated, false) = false
             ORDER BY
                CASE
                    WHEN user_id = $2 THEN 0
                    WHEN LOWER(username) = LOWER($2) THEN 1
                    WHEN LOWER(full_name) = LOWER($2) THEN 2
                    WHEN username ILIKE ($2 || '%') THEN 3
                    WHEN user_id ILIKE ($2 || '%') THEN 4
                    ELSE 5
                END,
                id ASC
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
            try {
                await reserveWalletFunds(client, { userId: senderId, amount: baseAmount });
            } catch (financeErr) {
                await client.query('ROLLBACK');
                if (financeErr.code === 'INSUFFICIENT_WALLET_BALANCE') {
                    return res.status(400).json({ success: false, message: 'Insufficient balance' });
                }
                if (financeErr.code === 'USER_NOT_FOUND') {
                    return res.status(404).json({ success: false, message: 'Receiver not found' });
                }
                throw financeErr;
            }

            const txNote = note || 'Googer Manual Payment Hold';
            const insertedTransfer = await insertWalletTransfer(client, {
                senderId,
                receiverId,
                amount: baseAmount,
                note: txNote,
                type: 'order_hold',
                status: 'pending',
                commission: 0,
                commissionPercentage: 0,
            });
            const result = { rows: [{ id: insertedTransfer.id }] };
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

        if (type === 'sell' && commPercent > 0 && !manualPaymentOrder) {
            const senderResult = await client.query(
                `SELECT wallet_balance, user_type
                 FROM users
                 WHERE id = $1
                 FOR UPDATE`,
                [senderId]
            );
            const senderBalance = parseFloat(senderResult.rows[0]?.wallet_balance || 0);
            const senderType = String(senderResult.rows[0]?.user_type || '').toLowerCase();
            const isSellerSender = senderType === 'seller';

            if (isSellerSender) {
                if (senderBalance < calculatedCommission) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ success: false, message: 'Insufficient balance' });
                }

                await debitWalletBalance(client, { userId: senderId, amount: calculatedCommission });

                const txNote = note || `Send Discount (${commPercent}%)`;
                const insertedTransfer = await insertWalletTransfer(client, {
                    senderId,
                    receiverId,
                    amount: baseAmount,
                    note: txNote,
                    type: 'seller_discount',
                    status: 'accepted',
                    commission: 0,
                    commissionPercentage: commPercent,
                });
                const result = { rows: [{ id: insertedTransfer.id }] };

                try {
                    await distributeProductDiscountCommission(client, {
                        buyerId: receiverId,
                        payerId: senderId,
                        discountAmount: calculatedCommission,
                        sourceId: `seller-discount-${result.rows[0].id}`,
                        description: `Seller Discount Transfer #${result.rows[0].id}`,
                        sourceType: 'wallet_discount',
                        notePrefix: 'Seller Discount',
                        remainderRecipientId: receiverId,
                    });
                } catch (commErr) {
                    console.error('Seller discount distribution failed:', commErr);
                    throw commErr;
                }

                const displayTransaction = await getTransferDisplayData(client, result.rows[0].id);

                await client.query('COMMIT');

                return res.status(201).json({
                    success: true,
                    message: `Discount sent successfully. ${calculatedCommission.toFixed(2)} discount coins distributed.`,
                    transfer: displayTransaction || result.rows[0],
                    transaction: displayTransaction || result.rows[0],
                });
            }
        }

        // ============================================
        // NEW: DIRECT TRANSFER IF NO COMMISSION
        // ============================================
        if (type === 'sell' && commPercent === 0 && !manualPaymentOrder) {
            const txNote = note || 'Direct Money Transfer';
            let result;
            try {
                const transfer = await transferWalletFunds(client, {
                    senderId,
                    receiverId,
                    amount: baseAmount,
                    note: txNote,
                    type,
                    status: 'accepted',
                    commission: 0,
                    commissionPercentage: 0,
                });
                result = { rows: [{ id: transfer.walletTransferId }] };
            } catch (financeErr) {
                await client.query('ROLLBACK');
                if (financeErr.code === 'INSUFFICIENT_WALLET_BALANCE') {
                    return res.status(400).json({ success: false, message: 'Insufficient balance' });
                }
                throw financeErr;
            }

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

            try {
                await reserveWalletFunds(client, { userId: senderId, amount: amountToHold });
            } catch (financeErr) {
                await client.query('ROLLBACK');
                if (financeErr.code === 'INSUFFICIENT_WALLET_BALANCE') {
                    return res.status(400).json({ success: false, message: 'Insufficient balance' });
                }
                throw financeErr;
            }
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
        const insertedTransfer = await insertWalletTransfer(client, {
            senderId,
            receiverId,
            amount: amountToHold,
            note: txNote,
            type,
            status: 'pending',
            commission: calculatedCommission,
            commissionPercentage: commPercent,
        });
        const result = { rows: [{ id: insertedTransfer.id }] };

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

exports.verifyManualPaymentHold = async (req, res) => {
    const client = await pool.connect();
    try {
        const { transactionId, sellerId, amount } = req.body || {};
        const buyerId = req.user.id;
        const normalizedTransactionId = String(transactionId || '').trim();
        const normalizedSellerId = String(sellerId || '').trim();
        const expectedAmount = parseFloat(amount || 0);

        if (!normalizedTransactionId || !normalizedSellerId || !Number.isFinite(expectedAmount) || expectedAmount <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid manual payment verification details' });
        }

        const sellerResult = await client.query(
            `SELECT id, user_id, username
             FROM users
             WHERE user_id = $1 OR id::text = $1
             ORDER BY CASE WHEN user_id = $1 THEN 0 ELSE 1 END
             LIMIT 1`,
            [normalizedSellerId]
        );

        if (sellerResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Seller not found for manual payment' });
        }

        const seller = sellerResult.rows[0];
        const transferResult = await client.query(
            `SELECT wt.*
             FROM wallet_transfers wt
             WHERE wt.sender_id = $1
               AND wt.receiver_id = $2
               AND wt.type = 'order_hold'
               AND wt.status = 'pending'
             ORDER BY wt.id DESC
             LIMIT 50`,
            [buyerId, seller.id]
        );

        const transfer = transferResult.rows.find((candidate) => {
            const manualDisplayId = formatManualPaymentDisplayTransactionId(candidate.id);
            return String(candidate.id) === normalizedTransactionId
                || manualDisplayId === normalizedTransactionId
                || formatManualPaymentDisplayTransactionId(manualDisplayId) === normalizedTransactionId
                || formatGenericDisplayTransactionId(candidate.id).toLowerCase() === normalizedTransactionId.toLowerCase();
        });

        if (!transfer) {
            return res.status(404).json({ success: false, message: 'Manual payment hold transaction not found' });
        }

        const heldAmount = parseFloat(transfer.amount || 0);
        if (heldAmount.toFixed(2) !== expectedAmount.toFixed(2)) {
            return res.status(400).json({
                success: false,
                message: `Manual payment hold amount mismatch. Required: R ${expectedAmount.toFixed(2)}, Found: R ${heldAmount.toFixed(2)}`,
            });
        }

        return res.status(200).json({
            success: true,
            transferId: transfer.id,
            displayTransactionId: formatManualPaymentDisplayTransactionId(transfer.id),
            sellerId: seller.user_id,
            sellerDbId: seller.id,
            amount: heldAmount,
        });
    } catch (error) {
        console.error('Verify manual payment hold error:', error);
        return res.status(500).json({ success: false, message: 'Server error verifying manual payment' });
    } finally {
        client.release();
    }
};

// Get pending requests for the current user (where current user is the receiver/payer)
exports.getPendingRequests = async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await pool.query(
            `SELECT t.*, u.username as sender_username, u.full_name as sender_full_name, u.profile_picture as sender_profile_picture, u.user_type as sender_user_type
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
            'SELECT * FROM wallet_transfers WHERE id = $1 AND receiver_id = $2 AND status = \'pending\' FOR UPDATE',
            [requestId, userId]
        );

        if (requestResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Request not found or already processed' });
        }

        const transfer = requestResult.rows[0];
        const transferAmount = parseFloat(transfer.amount);
        const transferType = transfer.type; // 'sell' or 'request' (buy)
        const rawCommission = parseFloat(transfer.commission || 0);
        const commission = Math.min(
            transferAmount,
            Math.max(0, Number.isFinite(rawCommission) ? rawCommission : 0)
        );
        const senderTypeResult = await client.query(
            'SELECT user_type FROM users WHERE id = $1',
            [transfer.sender_id]
        );
        const senderUserType = String(senderTypeResult.rows[0]?.user_type || '').toLowerCase();
        const isSellerSender = senderUserType === 'seller';

        if (action === 'reject') {
            // If type is 'sell', return the held amount back to sender
            if (transferType === 'sell') {
                await refundHeldWalletFunds(client, { userId: transfer.sender_id, amount: transferAmount });
            }
            // If type is 'request' (buy), nothing to return (no money was held)

            // Update transfer status to rejected
            await client.query(
                `UPDATE wallet_transfers SET status = 'rejected', updated_at = ${UTC_NOW_SQL} WHERE id = $1`,
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
                // Discount/commission is distributed through the referral tree

                const amountToReceiver = Math.max(0, transferAmount - commission); // 90

                await consumeHeldWalletFunds(client, { userId: transfer.sender_id, amount: transferAmount });

                // Give (amount - commission) to receiver
                await creditWalletBalance(client, { userId, amount: amountToReceiver });

                if (commission > 0) {
                    try {
                        await client.query('SAVEPOINT before_commission');
                        await distributeProductDiscountCommission(client, {
                            buyerId: transfer.sender_id,
                            payerId: transfer.sender_id,
                            discountAmount: commission,
                            sourceId: `wallet-${transfer.id}`,
                            description: `Wallet Sell Transfer #${transfer.id}`,
                            sourceType: 'wallet_discount',
                            notePrefix: 'Wallet Discount',
                            remainderRecipientId: transfer.sender_id,
                        });
                        await client.query('RELEASE SAVEPOINT before_commission');
                    } catch (commErr) {
                        await client.query('ROLLBACK TO SAVEPOINT before_commission');
                        console.error('Wallet sell commission distribution failed (transfer will still complete):', commErr);
                    }
                }
            } else {
                if (commission > 0) {
                    try {
                        await client.query('SAVEPOINT before_buy_discount');

                        const receiverResult = await client.query(
                            'SELECT wallet_balance FROM users WHERE id = $1 FOR UPDATE',
                            [userId]
                        );
                        const receiverBalance = parseFloat(receiverResult.rows[0]?.wallet_balance || 0);
                        const sellerBuyDiscountNet = Math.max(0, transferAmount - commission);
                        const amountToDeduct = isSellerSender ? transferAmount : commission;

                        if (receiverBalance < amountToDeduct) {
                            await client.query('ROLLBACK TO SAVEPOINT before_buy_discount');
                            await client.query('ROLLBACK');
                            return res.status(400).json({ success: false, message: 'Insufficient balance' });
                        }

                        await debitWalletBalance(client, { userId, amount: amountToDeduct });

                        if (isSellerSender && sellerBuyDiscountNet > 0) {
                            await creditWalletBalance(client, { userId: transfer.sender_id, amount: sellerBuyDiscountNet });
                        }

                        await distributeProductDiscountCommission(client, {
                            buyerId: isSellerSender ? userId : transfer.sender_id,
                            payerId: userId,
                            discountAmount: commission,
                            sourceId: `wallet-${transfer.id}`,
                            description: `Wallet Buy Request #${transfer.id}`,
                            sourceType: 'wallet_discount',
                            notePrefix: isSellerSender ? 'Seller Buy Discount' : 'Wallet Discount',
                            remainderRecipientId: isSellerSender ? userId : transfer.sender_id,
                        });
                        await client.query('RELEASE SAVEPOINT before_buy_discount');
                    } catch (commErr) {
                        await client.query('ROLLBACK TO SAVEPOINT before_buy_discount');
                        throw commErr;
                    }
                } else {
                    // Legacy no-discount buy request: receiver pays the full requested amount.
                    const receiverResult = await client.query(
                        'SELECT wallet_balance FROM users WHERE id = $1 FOR UPDATE',
                        [userId]
                    );
                    const receiverBalance = parseFloat(receiverResult.rows[0].wallet_balance);

                    if (receiverBalance < transferAmount) {
                        await client.query('ROLLBACK');
                        return res.status(400).json({ success: false, message: 'Insufficient balance' });
                    }

                    await debitWalletBalance(client, { userId, amount: transferAmount });
                    await creditWalletBalance(client, { userId: transfer.sender_id, amount: transferAmount });
                }
            }

            // Update transfer status to accepted. The original request row's commission
            // is only the discount basis; Main Googer Balance is credited by the
            // separate referral_commission payout row, so avoid double-counting here.
            await client.query(
                `UPDATE wallet_transfers 
                 SET status = 'accepted', 
                     commission = 0,
                     updated_at = ${UTC_NOW_SQL} 
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
            await refundHeldWalletFunds(client, { userId: transfer.sender_id, amount: transferAmount });
        } else if (transferType === 'order_hold') {
            await refundHeldWalletFunds(client, { userId: transfer.sender_id, amount: transferAmount });
        }

        await client.query(
            `UPDATE wallet_transfers
             SET status = 'cancelled',
                 updated_at = ${UTC_NOW_SQL}
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

        // Generate descriptive note if none provided
        let txNote = note;
        if (!txNote) {
            txNote = commInput > 0 ? `Commission Transfer (${commInput}%)` : 'Direct Transfer';
        }

        try {
            await transferWalletFunds(client, {
                senderId,
                receiverId,
                amount: finalTransferAmount,
                note: txNote,
                type: 'transfer',
                status: 'accepted',
                commission: calculatedCommission,
                commissionPercentage: commInput,
            });
        } catch (financeErr) {
            await client.query('ROLLBACK');
            if (financeErr.code === 'INSUFFICIENT_WALLET_BALANCE') {
                return res.status(400).json({ success: false, message: 'Insufficient balance' });
            }
            if (financeErr.code === 'USER_NOT_FOUND') {
                return res.status(404).json({ success: false, message: 'Receiver not found' });
            }
            throw financeErr;
        }

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
        const normalizedNote = String(note || '');
        const isAdPromotionCharge = /\bad promote(?: update)?\b/i.test(normalizedNote);

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
        let transferRes;
        if (isAdPromotionCharge) {
            const txNote = note || (orderId ? `Ad Promote - ${orderId}` : 'Ad Promote');
            try {
                const transfer = await recordGoogerRevenuePayment(client, {
                    payerUserId: userId,
                    amount: holdAmount,
                    note: txNote,
                    transferType: 'transfer',
                    commissionPercentage: 100,
                });
                transferRes = { rows: [{ id: transfer.walletTransferId }] };
            } catch (financeErr) {
                await client.query('ROLLBACK');
                if (financeErr.code === 'GOOGER_WALLET_NOT_CONFIGURED') {
                    return res.status(500).json({ success: false, message: 'Googer wallet account not found' });
                }
                if (financeErr.code === 'INSUFFICIENT_WALLET_BALANCE') {
                    return res.status(400).json({
                        success: false,
                        message: `Insufficient balance. Required: R ${holdAmount.toFixed(2)}, Available: R ${wallet_balance.toFixed(2)}`,
                    });
                }
                throw financeErr;
            }
        } else {
            await reserveWalletFunds(client, { userId, amount: holdAmount });

            const txNote = note || (orderId ? `Payment on hold for Order #${orderId}` : 'Payment on hold for Googer Order');
            const transfer = await insertWalletTransfer(client, {
                senderId: userId,
                receiverId: userId,
                amount: holdAmount,
                note: txNote,
                type: 'order_hold',
                status: 'pending',
                commission: 0,
                commissionPercentage: 0,
            });
            transferRes = { rows: [{ id: transfer.id }] };
        }

        await client.query('COMMIT');

        res.status(200).json({
            success: true,
            message: isAdPromotionCharge
                ? 'Ad payment processed successfully.'
                : 'Payment placed on hold. It will be released to the seller once your order is delivered.',
            currentBalance: wallet_balance - holdAmount,
            holdBalance: isAdPromotionCharge ? current_hold : current_hold + holdAmount,
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

// Direct payment for Profile Promote ads — deducts from user wallet and records Googer credit through wallet_transfers.commission.
// The protected Super Admin wallet balance in users.wallet_balance is not adjusted by ad payments.
exports.payProfilePromote = async (req, res) => {
    const client = await pool.connect();
    try {
        const { amount, orderId, note } = req.body;
        const userId = req.user.id;

        if (!amount || parseFloat(amount) <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid amount' });
        }

        const payAmount = parseFloat(amount);

        await client.query('BEGIN');

        // Lock user row and verify balance
        const userResult = await client.query(
            'SELECT wallet_balance FROM users WHERE id = $1 FOR UPDATE',
            [userId]
        );

        if (userResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const walletBalance = parseFloat(userResult.rows[0].wallet_balance || 0);

        if (walletBalance < payAmount) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                message: `Insufficient balance. Required: R ${payAmount.toFixed(2)}, Available: R ${walletBalance.toFixed(2)}`
            });
        }

        const txNote = note || (orderId ? `Profile Promote - ${orderId}` : 'Profile Promote Ad');
        let transferRes;
        try {
            const transfer = await recordGoogerRevenuePayment(client, {
                payerUserId: userId,
                amount: payAmount,
                note: txNote,
                transferType: 'profile_promote',
                commissionPercentage: 0,
            });
            transferRes = { rows: [{ id: transfer.walletTransferId }] };
        } catch (financeErr) {
            await client.query('ROLLBACK');
            if (financeErr.code === 'GOOGER_WALLET_NOT_CONFIGURED') {
                return res.status(500).json({ success: false, message: 'Googer wallet account not found' });
            }
            if (financeErr.code === 'INSUFFICIENT_WALLET_BALANCE') {
                return res.status(400).json({
                    success: false,
                    message: `Insufficient balance. Required: R ${payAmount.toFixed(2)}, Available: R ${walletBalance.toFixed(2)}`,
                });
            }
            throw financeErr;
        }

        await client.query('COMMIT');

        return res.status(200).json({
            success: true,
            message: 'Profile Promote payment processed successfully.',
            currentBalance: walletBalance - payAmount,
            transferId: transferRes.rows[0].id
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Pay profile promote error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error processing payment: ' + (error.message || 'Unknown error')
        });
    } finally {
        client.release();
    }
};

// Record a $0 promo ad transaction for audit/history display (no balance change)
exports.recordPromoAd = async (req, res) => {
    try {
        const { adId, note, campaignType } = req.body;
        const userId = req.user.id;

        if (!adId) {
            return res.status(400).json({ success: false, message: 'adId is required' });
        }

        const promoLabel = campaignType || 'Promo';
        const txNote = note || `Ad Hold Summary - ${promoLabel} - Ad ID: ${adId} - Status: Free - Hold Amount: Free - Deducted Amount: Free`;

        const transferRes = await pool.query(
            `INSERT INTO wallet_transfers (sender_id, receiver_id, amount, note, type, status, created_at, updated_at)
             VALUES ($1, $1, 0, $2, 'promo_ad', 'completed', ${UTC_NOW_SQL}, ${UTC_NOW_SQL}) RETURNING id`,
            [userId, txNote]
        );

        return res.status(200).json({ success: true, transferId: transferRes.rows[0].id });
    } catch (error) {
        console.error('Record promo ad error:', error);
        return res.status(500).json({ success: false, message: 'Failed to record promo ad' });
    }
};

// Reverse part of an ad budget while the ad is still under review.
// This is used when a user edits an under-review Product/Photo&Video ad
// and lowers the budget after previously increasing it.
exports.refundAdBudgetEdit = async (req, res) => {
    const client = await pool.connect();
    try {
        const { adId, amount, note } = req.body || {};
        const userId = req.user.id;
        const refundAmount = Number(amount || 0);
        const normalizedAdId = String(adId || '').trim().replace(/^ad-/i, '');

        if (!normalizedAdId) {
            return res.status(400).json({ success: false, message: 'adId is required' });
        }

        if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
            return res.status(400).json({ success: false, message: 'Valid refund amount is required' });
        }

        await client.query('BEGIN');

        const googerState = await getLockedGoogerPooledState(client);
        const googerUserId = Number(googerState?.userId || 0);
        if (!(googerUserId > 0)) {
            await client.query('ROLLBACK');
            return res.status(500).json({ success: false, message: 'Googer wallet account not found' });
        }

        const pooledBalance = Number(googerState?.pooledBalance || 0);
        if (pooledBalance < refundAmount) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                message: `Googer main balance is too low to refund R ${refundAmount.toFixed(2)} right now.`,
            });
        }

        const updatedUser = await creditWalletBalance(client, { userId, amount: refundAmount });

        const transfer = await insertWalletTransfer(client, {
            senderId: googerUserId,
            receiverId: userId,
            amount: refundAmount,
            note: note || `Ad Budget Refund - ${normalizedAdId} - Budget Reduced During Review`,
            type: 'ad_refund',
            status: 'accepted',
            commission: -refundAmount,
            commissionPercentage: 0,
        });

        await client.query('COMMIT');

        return res.status(200).json({
            success: true,
            message: 'Ad budget refund processed successfully.',
            currentBalance: Number(updatedUser.walletBalance || 0),
            transferId: transfer.id,
        });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Refund ad budget edit error:', error);
        return res.status(500).json({
            success: false,
            message: error?.message || 'Failed to refund ad budget edit',
        });
    } finally {
        client.release();
    }
};

// Admin-only: explicitly add capital to the personal admin wallet balance.
// Normal commission/system flows are blocked from changing admin users.wallet_balance by a DB trigger.
exports.addAdminCapital = async (req, res) => {
    const client = await pool.connect();
    try {
        const adminId = req.user.id;
        const amount = Number(req.body?.amount || 0);

        if (!Number.isFinite(amount) || amount <= 0) {
            return res.status(400).json({ success: false, message: 'Valid amount is required' });
        }

        await client.query('BEGIN');

        const admin = await client.query(
            `SELECT id, username, wallet_balance
             FROM users
             WHERE id = $1
               AND LOWER(COALESCE(user_type, '')) = 'admin'
             FOR UPDATE`,
            [adminId]
        );

        if (admin.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }

        await client.query(`SET LOCAL googer.allow_admin_wallet_capital = 'true'`);

        const updated = await creditWalletBalance(client, { userId: adminId, amount });
        const transfer = await insertWalletTransfer(client, {
            senderId: adminId,
            receiverId: adminId,
            amount,
            note: req.body?.note || 'Add Capital to Wallet',
            type: 'capital_add',
            status: 'accepted',
            commission: 0,
            commissionPercentage: 0,
        });

        await client.query('COMMIT');

        return res.status(200).json({
            success: true,
            message: 'Capital added to admin wallet.',
            walletBalance: Number(updated.walletBalance || 0),
            transferId: transfer.id,
        });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Add admin capital error:', error);
        return res.status(500).json({ success: false, message: 'Failed to add admin capital' });
    } finally {
        client.release();
    }
};

// Admin: get ALL wallet transactions across all users
exports.getAllTransactionsAdmin = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT t.*,
                    s.username AS sender_username, s.full_name AS sender_full_name, s.user_id AS sender_readable_id, s.user_type AS sender_user_type,
                    r.username AS receiver_username, r.full_name AS receiver_full_name, r.user_id AS receiver_readable_id, r.user_type AS receiver_user_type
             FROM wallet_transfers t
             JOIN users s ON t.sender_id = s.id
             LEFT JOIN users r ON t.receiver_id = r.id
             ORDER BY t.created_at DESC`
        );

        res.status(200).json({
            success: true,
            transactions: result.rows.map(mapWalletTransferRow)
        });
    } catch (error) {
        console.error('Admin getAllTransactions error:', error);
        res.status(500).json({ success: false, message: 'Server error fetching all transactions' });
    }
};

// Get transaction history for current user
exports.getTransactionHistory = async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await pool.query(
            `SELECT t.*, 
                    s.username as sender_username, s.full_name as sender_full_name, s.user_id as sender_readable_id, s.user_type as sender_user_type,
                    r.username as receiver_username, r.full_name as receiver_full_name, r.user_id as receiver_readable_id, r.user_type as receiver_user_type,
                    parent_discount.commission_percentage as original_discount_percentage,
                    product_discount.discount_percentage as product_discount_percentage,
                    order_summary.order_number as linked_order_number,
                    COALESCE(order_summary.can_cancel, false) as linked_order_can_cancel,
                    order_summary.primary_status as linked_order_status
             FROM wallet_transfers t
             JOIN users s ON t.sender_id = s.id
             LEFT JOIN users r ON t.receiver_id = r.id
             LEFT JOIN LATERAL (
                 SELECT parent.commission_percentage
                 FROM wallet_transfers parent
                 WHERE parent.id = NULLIF(substring(t.note FROM 'Seller Discount Transfer #([0-9]+)'), '')::integer
                 LIMIT 1
             ) parent_discount ON TRUE
             LEFT JOIN LATERAL (
                 SELECT
                     CASE
                         WHEN COALESCE(m.commission_info->>'discount', '') ~ '^[0-9]+(\\.[0-9]+)?$'
                         THEN ROUND((m.commission_info->>'discount')::numeric, 2)
                         WHEN COALESCE(m.price, 0) > 0
                              AND COALESCE(m.promo_price, 0) > 0
                              AND COALESCE(m.promo_price, 0) < COALESCE(m.price, 0)
                         THEN ROUND(((m.price - m.promo_price) / m.price) * 100, 2)
                         ELSE NULL
                     END AS discount_percentage
                 FROM market m
                 WHERE m.id = NULLIF(substring(t.note FROM '#([0-9]+)'), '')::integer
                 LIMIT 1
             ) product_discount ON TRUE
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
             WHERE (
                   t.sender_id = $1
                   OR t.receiver_id = $1
                   OR (
                       COALESCE(t.type, '') = 'order_hold'
                       AND EXISTS (
                           SELECT 1
                           FROM orders seller_order
                           WHERE seller_order.wallet_transfer_id = t.id
                             AND seller_order.seller_id = $1
                       )
                   )
               )
               AND COALESCE(t.type, '') <> 'referral_commission'
               AND (
                   COALESCE(t.type, '') <> 'seller_discount'
                   OR t.sender_id = $1
               )
               AND (
                   COALESCE(t.type, '') <> 'discount_refund'
                   OR (t.receiver_id = $1 AND t.sender_id <> $1)
               )
             ORDER BY t.created_at DESC
             LIMIT 50`,
            [userId]
        );

        res.status(200).json({
            success: true,
            transactions: result.rows.map(mapWalletTransferRow)
        });
    } catch (error) {
        console.error('Get transaction history error:', error);
        res.status(500).json({ success: false, message: 'Server error fetching transaction history' });
    }
};
