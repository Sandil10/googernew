const { lockGoogerMainWalletUser, getLockedGoogerPooledState, normalizeMoney } = require('../../../../../shared/utils/financeBoundary');
const {
    reserveWalletFunds,
    refundHeldWalletFunds,
    insertWalletTransfer,
    consumeHeldWalletFunds,
    creditWalletAndRecordTransfer,
} = require('../../../../../shared/utils/financeCommands');
const withdrawalRepository = require('./withdrawalRepository');

const getPaymentMethods = async () => {
    const result = await withdrawalRepository.listActivePaymentMethods();
    return { success: true, methods: result.rows };
};

const getMyRequests = async (userId) => {
    const result = await withdrawalRepository.getMyRequests(userId);
    return { success: true, requests: result.rows };
};

const cancelRequest = async ({ client, id, userId }) => {
    const reqRow = await withdrawalRepository.getLockedUserRequestById(client, { id, userId });
    if (!reqRow.rows.length) {
        const error = new Error('Withdrawal request not found.');
        error.statusCode = 404;
        throw error;
    }

    const wr = reqRow.rows[0];
    if (wr.status !== 'Pending') {
        const error = new Error('Only pending withdrawals can be cancelled.');
        error.statusCode = 400;
        throw error;
    }

    const amount = Number(wr.amount);
    await refundHeldWalletFunds(client, { userId, amount });

    if (wr.wallet_transfer_id) {
        await withdrawalRepository.markWalletTransferStatus(client, {
            transferId: wr.wallet_transfer_id,
            status: 'cancelled',
        });
    }

    await withdrawalRepository.markUserRequestCancelled(client, id);

    return {
        amount,
        requestId: Number(id),
        success: true,
        userId,
        walletTransferId: wr.wallet_transfer_id || null,
    };
};

const createRequest = async ({ client, paymentMethodId, amount, paymentDetails, userId }) => {
    const paymentDetailsJson = JSON.stringify(paymentDetails || {});
    const numAmount = normalizeMoney(amount);

    if (!paymentMethodId || !amount || !paymentDetails) {
        const error = new Error('payment_method_id, amount, and payment_details are required.');
        error.statusCode = 400;
        throw error;
    }
    if (!numAmount || numAmount <= 0) {
        const error = new Error('Enter a valid amount greater than 0.');
        error.statusCode = 400;
        throw error;
    }

    const userRow = await withdrawalRepository.getLockedUserForWithdrawal(client, userId);
    if (!userRow.rows.length) {
        const error = new Error('User not found.');
        error.statusCode = 404;
        throw error;
    }

    const { verification_status, wallet_balance } = userRow.rows[0];
    if (verification_status !== 'Verified') {
        const error = new Error('You must be verified to withdraw.');
        error.statusCode = 403;
        throw error;
    }

    const settingsRow = await withdrawalRepository.getSettings();
    if (settingsRow.rows.length) {
        const { min_amount, max_amount } = settingsRow.rows[0];
        if (numAmount < Number(min_amount)) {
            const error = new Error(`Minimum withdrawal is ${min_amount} coins.`);
            error.statusCode = 400;
            throw error;
        }
        if (numAmount > Number(max_amount)) {
            const error = new Error(`Maximum withdrawal is ${max_amount} coins.`);
            error.statusCode = 400;
            throw error;
        }
    }

    if (numAmount > Number(wallet_balance)) {
        const error = new Error('Insufficient balance.');
        error.statusCode = 400;
        throw error;
    }

    const methodRow = await withdrawalRepository.getActiveMethodById(client, paymentMethodId);
    if (!methodRow.rows.length) {
        const error = new Error('Payment method not found or inactive.');
        error.statusCode = 404;
        throw error;
    }
    const methodName = methodRow.rows[0].name;

    const existingPending = await withdrawalRepository.getExistingPendingRequest(client, {
        amount: numAmount,
        paymentDetailsJson,
        paymentMethodId,
        userId,
    });
    if (existingPending.rows.length > 0) {
        return {
            duplicateSuppressed: true,
            message: 'A matching pending withdrawal request already exists.',
            request: existingPending.rows[0],
            success: true,
        };
    }

    const googerWallet = await lockGoogerMainWalletUser(client);
    const googerUserId = googerWallet?.id || null;
    if (!googerUserId) {
        const error = new Error('System wallet not configured.');
        error.statusCode = 500;
        throw error;
    }

    await reserveWalletFunds(client, { userId, amount: numAmount });

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

    const insertResult = await withdrawalRepository.insertWithdrawalRequest(client, {
        amount: numAmount,
        methodName,
        paymentDetailsJson,
        paymentMethodId,
        userId,
        walletTransferId,
    });

    return {
        amount: numAmount,
        methodName,
        requestId: insertResult.rows?.[0]?.id || null,
        success: true,
        userId,
        walletTransferId,
    };
};

const getExchangeRates = async () => {
    const fastforexKey = process.env.FASTFOREX_API_KEY;
    if (!fastforexKey) {
        const error = new Error('Exchange rate service not configured.');
        error.statusCode = 500;
        throw error;
    }

    const upstream = await fetch(
        'https://api.fastforex.io/fetch-multi?from=USD&to=LKR,EUR,GBP',
        { headers: { 'X-API-Key': fastforexKey } }
    );
    if (!upstream.ok) {
        throw new Error(`Upstream ${upstream.status}`);
    }

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

    return { success: true, rates, date };
};

const getSettings = async () => {
    const result = await withdrawalRepository.getSettings();
    return { success: true, settings: result.rows[0] };
};

const updateSettings = async ({ adminUserId, coinRate, maxAmount, minAmount }) => {
    if (!await withdrawalRepository.isAdmin(adminUserId)) {
        const error = new Error('Admin access required.');
        error.statusCode = 403;
        throw error;
    }
    if (!minAmount || !maxAmount) {
        const error = new Error('min_amount and max_amount are required.');
        error.statusCode = 400;
        throw error;
    }

    await withdrawalRepository.updateSettings({ coinRate, maxAmount, minAmount });
    return { success: true, message: 'Withdrawal settings updated.' };
};

const getAdminRequests = async ({ adminUserId, status }) => {
    if (!await withdrawalRepository.isAdmin(adminUserId)) {
        const error = new Error('Admin access required.');
        error.statusCode = 403;
        throw error;
    }

    const result = await withdrawalRepository.getAdminRequests(status);
    return { success: true, requests: result.rows };
};

const reviewRequest = async ({ action, adminUserId, client, rejectionReason, requestId }) => {
    if (!await withdrawalRepository.isAdmin(adminUserId)) {
        const error = new Error('Admin access required.');
        error.statusCode = 403;
        throw error;
    }
    if (!['approve', 'reject'].includes(action)) {
        const error = new Error('action must be "approve" or "reject".');
        error.statusCode = 400;
        throw error;
    }

    const reqRow = await withdrawalRepository.getLockedRequestById(client, requestId);
    if (!reqRow.rows.length) {
        const error = new Error('Withdrawal request not found.');
        error.statusCode = 404;
        throw error;
    }

    const wr = reqRow.rows[0];
    if (wr.status !== 'Pending') {
        const error = new Error(`Request is already ${wr.status}.`);
        error.statusCode = 409;
        throw error;
    }

    const numAmount = normalizeMoney(wr.amount);
    const userId = wr.user_id;
    const transferId = wr.wallet_transfer_id;
    const googerState = await getLockedGoogerPooledState(client);
    const googerUserId = googerState?.userId || null;
    if (!googerUserId) {
        const error = new Error('System wallet not configured.');
        error.statusCode = 500;
        throw error;
    }

    if (action === 'approve') {
        await withdrawalRepository.markRequestApproved(client, requestId);
        await consumeHeldWalletFunds(client, { userId, amount: numAmount });
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
        if (!rejectionReason?.trim()) {
            const error = new Error('rejection_reason is required when rejecting.');
            error.statusCode = 400;
            throw error;
        }

        await withdrawalRepository.markRequestRejected(client, {
            rejectionReason: rejectionReason.trim(),
            requestId,
        });
        await refundHeldWalletFunds(client, { userId, amount: numAmount });

        if (transferId) {
            await withdrawalRepository.markWalletTransferStatus(client, {
                transferId,
                status: 'refunded',
            });
        }
    }

    return {
        action,
        success: true,
    };
};

module.exports = {
    cancelRequest,
    createRequest,
    getAdminRequests,
    getExchangeRates,
    getMyRequests,
    getPaymentMethods,
    getSettings,
    reviewRequest,
    updateSettings,
};
