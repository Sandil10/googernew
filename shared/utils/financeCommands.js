const { normalizeMoney, resolveGoogerMainWalletUserId } = require('./financeBoundary');

function createFinanceCommandError(code, message, details = {}) {
    const error = new Error(message);
    error.code = code;
    Object.assign(error, details);
    return error;
}

function requirePositiveAmount(amount, label = 'Amount') {
    const safeAmount = normalizeMoney(amount);
    if (!(safeAmount > 0)) {
        throw createFinanceCommandError('INVALID_MONEY_AMOUNT', `${label} must be greater than 0.`, {
            amount: safeAmount,
        });
    }
    return safeAmount;
}

async function lockWalletUsers(client, userIds = []) {
    const ids = [...new Set(
        userIds
            .map((value) => Number.parseInt(String(value), 10))
            .filter((value) => Number.isFinite(value) && value > 0)
    )].sort((a, b) => a - b);

    if (ids.length === 0) {
        return new Map();
    }

    const result = await client.query(
        `SELECT
            id,
            COALESCE(wallet_balance, 0) AS wallet_balance,
            COALESCE(hold_balance, 0) AS hold_balance,
            LOWER(COALESCE(user_type, '')) AS user_type
         FROM users
         WHERE id = ANY($1::int[])
         ORDER BY id
         FOR UPDATE`,
        [ids]
    );

    return new Map(
        result.rows.map((row) => [
            Number(row.id),
            {
                id: Number(row.id),
                walletBalance: normalizeMoney(row.wallet_balance),
                holdBalance: normalizeMoney(row.hold_balance),
                userType: row.user_type || '',
            },
        ])
    );
}

async function creditWalletBalance(client, { userId, amount }) {
    const safeAmount = requirePositiveAmount(amount);
    const targetUserId = Number.parseInt(String(userId), 10);

    const result = await client.query(
        `UPDATE users
         SET wallet_balance = COALESCE(wallet_balance, 0) + $1
         WHERE id = $2
         RETURNING id, wallet_balance`,
        [safeAmount, targetUserId]
    );

    if (result.rows.length === 0) {
        throw createFinanceCommandError('USER_NOT_FOUND', 'Wallet user not found.', {
            userId: targetUserId,
        });
    }

    return {
        userId: Number(result.rows[0].id),
        walletBalance: normalizeMoney(result.rows[0].wallet_balance),
    };
}

async function reserveWalletFunds(client, { userId, amount }) {
    const safeAmount = requirePositiveAmount(amount);
    const targetUserId = Number.parseInt(String(userId), 10);
    const lockedUsers = await lockWalletUsers(client, [targetUserId]);
    const userState = lockedUsers.get(targetUserId);

    if (!userState) {
        throw createFinanceCommandError('USER_NOT_FOUND', 'Wallet user not found.', {
            userId: targetUserId,
        });
    }

    if (userState.walletBalance < safeAmount) {
        throw createFinanceCommandError('INSUFFICIENT_WALLET_BALANCE', 'Insufficient wallet balance.', {
            userId: targetUserId,
            currentBalance: userState.walletBalance,
            requiredAmount: safeAmount,
        });
    }

    const result = await client.query(
        `UPDATE users
         SET wallet_balance = COALESCE(wallet_balance, 0) - $1,
             hold_balance = COALESCE(hold_balance, 0) + $1
         WHERE id = $2
         RETURNING id, wallet_balance, hold_balance`,
        [safeAmount, targetUserId]
    );

    return {
        userId: Number(result.rows[0].id),
        walletBalance: normalizeMoney(result.rows[0].wallet_balance),
        holdBalance: normalizeMoney(result.rows[0].hold_balance),
        amount: safeAmount,
    };
}

async function refundHeldWalletFunds(client, { userId, amount }) {
    const safeAmount = requirePositiveAmount(amount);
    const targetUserId = Number.parseInt(String(userId), 10);
    const lockedUsers = await lockWalletUsers(client, [targetUserId]);
    const userState = lockedUsers.get(targetUserId);

    if (!userState) {
        throw createFinanceCommandError('USER_NOT_FOUND', 'Wallet user not found.', {
            userId: targetUserId,
        });
    }

    const result = await client.query(
        `UPDATE users
         SET hold_balance = GREATEST(0, COALESCE(hold_balance, 0) - $1),
             wallet_balance = COALESCE(wallet_balance, 0) + $1
         WHERE id = $2
         RETURNING id, wallet_balance, hold_balance`,
        [safeAmount, targetUserId]
    );

    return {
        userId: Number(result.rows[0].id),
        walletBalance: normalizeMoney(result.rows[0].wallet_balance),
        holdBalance: normalizeMoney(result.rows[0].hold_balance),
        amount: safeAmount,
    };
}

async function consumeHeldWalletFunds(client, { userId, amount }) {
    const safeAmount = requirePositiveAmount(amount);
    const targetUserId = Number.parseInt(String(userId), 10);
    const lockedUsers = await lockWalletUsers(client, [targetUserId]);
    const userState = lockedUsers.get(targetUserId);

    if (!userState) {
        throw createFinanceCommandError('USER_NOT_FOUND', 'Wallet user not found.', {
            userId: targetUserId,
        });
    }

    const result = await client.query(
        `UPDATE users
         SET hold_balance = GREATEST(0, COALESCE(hold_balance, 0) - $1)
         WHERE id = $2
         RETURNING id, wallet_balance, hold_balance`,
        [safeAmount, targetUserId]
    );

    return {
        userId: Number(result.rows[0].id),
        walletBalance: normalizeMoney(result.rows[0].wallet_balance),
        holdBalance: normalizeMoney(result.rows[0].hold_balance),
        amount: safeAmount,
    };
}

async function debitWalletBalance(client, { userId, amount }) {
    const safeAmount = requirePositiveAmount(amount);
    const targetUserId = Number.parseInt(String(userId), 10);

    const result = await client.query(
        `UPDATE users
         SET wallet_balance = COALESCE(wallet_balance, 0) - $1
         WHERE id = $2
           AND COALESCE(wallet_balance, 0) >= $1
         RETURNING id, wallet_balance`,
        [safeAmount, targetUserId]
    );

    if (result.rows.length > 0) {
        return {
            userId: Number(result.rows[0].id),
            walletBalance: normalizeMoney(result.rows[0].wallet_balance),
        };
    }

    const existing = await client.query(
        'SELECT id, COALESCE(wallet_balance, 0) AS wallet_balance FROM users WHERE id = $1 LIMIT 1',
        [targetUserId]
    );

    if (existing.rows.length === 0) {
        throw createFinanceCommandError('USER_NOT_FOUND', 'Wallet user not found.', {
            userId: targetUserId,
        });
    }

    throw createFinanceCommandError('INSUFFICIENT_WALLET_BALANCE', 'Insufficient wallet balance.', {
        userId: targetUserId,
        currentBalance: normalizeMoney(existing.rows[0].wallet_balance),
        requiredAmount: safeAmount,
    });
}

async function insertWalletTransfer(client, {
    senderId,
    receiverId,
    amount,
    note,
    type,
    status = 'accepted',
    commission = 0,
    commissionPercentage = 0,
}) {
    const safeAmount = requirePositiveAmount(amount);
    const safeCommission = normalizeMoney(commission);
    const safeCommissionPercentage = Number.isFinite(Number(commissionPercentage))
        ? Number(commissionPercentage)
        : 0;

    const result = await client.query(
        `INSERT INTO wallet_transfers
            (sender_id, receiver_id, amount, note, type, status, commission, commission_percentage, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING id`,
        [
            senderId,
            receiverId,
            safeAmount,
            note || null,
            type,
            status,
            safeCommission,
            safeCommissionPercentage,
        ]
    );

    return {
        id: Number(result.rows[0].id),
        amount: safeAmount,
    };
}

async function creditWalletAndRecordTransfer(client, {
    senderId,
    receiverId,
    amount,
    note,
    type,
    status = 'accepted',
    commission = 0,
    commissionPercentage = 0,
    creditWallet = true,
}) {
    const safeAmount = requirePositiveAmount(amount);

    if (creditWallet) {
        await lockWalletUsers(client, [receiverId]);
        await creditWalletBalance(client, { userId: receiverId, amount: safeAmount });
    }

    const transfer = await insertWalletTransfer(client, {
        senderId,
        receiverId,
        amount: safeAmount,
        note,
        type,
        status,
        commission,
        commissionPercentage,
    });

    return {
        walletTransferId: transfer.id,
        amount: safeAmount,
    };
}

async function transferWalletFunds(client, {
    senderId,
    receiverId,
    amount,
    note,
    type = 'transfer',
    status = 'accepted',
    commission = 0,
    commissionPercentage = 0,
}) {
    const safeAmount = requirePositiveAmount(amount);
    const lockedUsers = await lockWalletUsers(client, [senderId, receiverId]);
    const senderState = lockedUsers.get(Number(senderId));
    const receiverState = lockedUsers.get(Number(receiverId));

    if (!senderState) {
        throw createFinanceCommandError('USER_NOT_FOUND', 'Wallet user not found.', {
            userId: Number(senderId),
        });
    }

    if (!receiverState) {
        throw createFinanceCommandError('USER_NOT_FOUND', 'Wallet user not found.', {
            userId: Number(receiverId),
        });
    }

    if (senderState.walletBalance < safeAmount) {
        throw createFinanceCommandError('INSUFFICIENT_WALLET_BALANCE', 'Insufficient wallet balance.', {
            userId: Number(senderId),
            currentBalance: senderState.walletBalance,
            requiredAmount: safeAmount,
        });
    }

    await debitWalletBalance(client, { userId: senderId, amount: safeAmount });
    await creditWalletBalance(client, { userId: receiverId, amount: safeAmount });

    const transfer = await insertWalletTransfer(client, {
        senderId,
        receiverId,
        amount: safeAmount,
        note,
        type,
        status,
        commission,
        commissionPercentage,
    });

    return {
        walletTransferId: transfer.id,
        amount: safeAmount,
    };
}

async function recordSubscriptionPayment(client, {
    subscriberUserId,
    amount,
    planName,
    note = null,
    transferType = 'subscription_payment',
}) {
    const safeAmount = requirePositiveAmount(amount);
    const googerUserId = await resolveGoogerMainWalletUserId(client);

    if (!googerUserId) {
        throw createFinanceCommandError('GOOGER_WALLET_NOT_CONFIGURED', 'Googer wallet account not found.');
    }

    const lockedUsers = await lockWalletUsers(client, [subscriberUserId, googerUserId]);
    if (!lockedUsers.has(Number(subscriberUserId))) {
        throw createFinanceCommandError('USER_NOT_FOUND', 'Wallet user not found.', {
            userId: Number(subscriberUserId),
        });
    }

    const subscriberState = lockedUsers.get(Number(subscriberUserId));
    if (subscriberState.walletBalance < safeAmount) {
        throw createFinanceCommandError('INSUFFICIENT_WALLET_BALANCE', 'Insufficient wallet balance.', {
            userId: Number(subscriberUserId),
            currentBalance: subscriberState.walletBalance,
            requiredAmount: safeAmount,
        });
    }

    await debitWalletBalance(client, { userId: subscriberUserId, amount: safeAmount });
    const transfer = await insertWalletTransfer(client, {
        senderId: subscriberUserId,
        receiverId: googerUserId,
        amount: safeAmount,
        note: note || `Subscription Payment - ${planName}`,
        type: transferType,
        status: 'accepted',
        commission: safeAmount,
        commissionPercentage: 0,
    });

    return {
        googerUserId,
        walletTransferId: transfer.id,
        amount: safeAmount,
    };
}

async function recordReferralCommissionPayout(client, {
    buyerId,
    payerId,
    earnerId,
    amount,
    note,
    commissionPercentage = 0,
    transferType = 'referral_commission',
    transferStatus = 'completed',
    creditWallet = true,
}) {
    const safeAmount = requirePositiveAmount(amount);

    const transfer = await creditWalletAndRecordTransfer(client, {
        senderId: payerId || buyerId,
        receiverId: earnerId,
        amount: safeAmount,
        note,
        type: transferType,
        status: transferStatus,
        commission: safeAmount,
        commissionPercentage,
        creditWallet,
    });

    return {
        walletTransferId: transfer.walletTransferId,
        amount: safeAmount,
    };
}

async function creditAdminWalletFromGoogerPool(client, {
    adminId,
    amount,
    note = 'Googer Balance Payout',
    skipGoogerWalletLock = false,
}) {
    const safeAmount = requirePositiveAmount(amount);
    const googerUserId = await resolveGoogerMainWalletUserId(client);

    if (!googerUserId) {
        throw createFinanceCommandError('GOOGER_WALLET_NOT_CONFIGURED', 'Googer pooled wallet is not configured.');
    }

    const lockedUsers = await lockWalletUsers(
        client,
        skipGoogerWalletLock ? [adminId] : [adminId, googerUserId]
    );
    const adminState = lockedUsers.get(Number(adminId));

    if (!adminState) {
        throw createFinanceCommandError('USER_NOT_FOUND', 'Target admin user not found.', {
            userId: Number(adminId),
        });
    }

    if (!['admin', 'super_admin'].includes(adminState.userType)) {
        throw createFinanceCommandError('TARGET_NOT_ADMIN', 'Target user is not an admin.', {
            userId: Number(adminId),
        });
    }

    await creditWalletBalance(client, { userId: adminId, amount: safeAmount });
    const transfer = await insertWalletTransfer(client, {
        senderId: adminId,
        receiverId: adminId,
        amount: safeAmount,
        note,
        type: 'system_payout',
        status: 'accepted',
        commission: -safeAmount,
        commissionPercentage: 0,
    });

    return {
        googerUserId,
        walletTransferId: transfer.id,
        amount: safeAmount,
    };
}

async function recordGoogerRevenuePayment(client, {
    payerUserId,
    amount,
    note,
    transferType = 'transfer',
    commissionPercentage = 100,
}) {
    const safeAmount = requirePositiveAmount(amount);
    const googerUserId = await resolveGoogerMainWalletUserId(client);

    if (!googerUserId) {
        throw createFinanceCommandError('GOOGER_WALLET_NOT_CONFIGURED', 'Googer wallet account not found.');
    }

    await lockWalletUsers(client, [payerUserId, googerUserId]);
    await debitWalletBalance(client, { userId: payerUserId, amount: safeAmount });

    const transfer = await insertWalletTransfer(client, {
        senderId: payerUserId,
        receiverId: googerUserId,
        amount: safeAmount,
        note,
        type: transferType,
        status: 'accepted',
        commission: safeAmount,
        commissionPercentage,
    });

    return {
        googerUserId,
        walletTransferId: transfer.id,
        amount: safeAmount,
    };
}

module.exports = {
    createFinanceCommandError,
    lockWalletUsers,
    creditWalletBalance,
    reserveWalletFunds,
    refundHeldWalletFunds,
    consumeHeldWalletFunds,
    debitWalletBalance,
    insertWalletTransfer,
    creditWalletAndRecordTransfer,
    transferWalletFunds,
    recordSubscriptionPayment,
    recordReferralCommissionPayout,
    creditAdminWalletFromGoogerPool,
    recordGoogerRevenuePayment,
};
