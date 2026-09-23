const { getLockedGoogerPooledState } = require('../../../../shared/utils/financeBoundary');
const { creditWalletBalance, insertWalletTransfer } = require('../../../../shared/utils/financeCommands');
const invalid = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const cents = value => Math.round(Number(value) * 100);

// Caller owns a transaction and holds the ad row lock.
async function refundBudgetReduction(client, existing, next, userId) {
    const oldBudget = cents(existing.budget), newBudget = cents(next.budget);
    if (!Number.isSafeInteger(oldBudget) || !Number.isSafeInteger(newBudget) || newBudget < 0) throw invalid('Invalid budget.');
    if (newBudget >= oldBudget) return null;
    if (Number(existing.user_id) !== Number(userId) || !['Under Review', 'Pending Approval'].includes(existing.status) || next.status !== 'Under Review') {
        throw invalid('Only the owner can reduce a budget while the ad is under review.', 403);
    }
    const { rows } = await client.query('SELECT sender_id, receiver_id, amount, type, status FROM wallet_transfers WHERE id = $1 FOR UPDATE', [existing.wallet_transfer_id]);
    const payment = rows[0];
    if (!payment || Number(payment.sender_id) !== Number(userId) || Number(payment.amount) <= 0 ||
        !['accepted', 'pending', 'completed'].includes(payment.status) || payment.type === 'promo_ad') throw invalid('This ad has no eligible paid budget to refund.');
    const amount = (oldBudget - newBudget) / 100;
    if (oldBudget - newBudget > Math.max(0, oldBudget - cents(existing.spend || 0))) throw invalid('Budget cannot be reduced below the amount already spent.');
    const state = await getLockedGoogerPooledState(client);
    if (Number(payment.receiver_id) !== Number(state?.userId)) throw invalid('Payment does not fund this ad.');
    // Only funding recorded by the server-controlled payment transaction is trusted.
    // Legacy wallet_transfer_id and payment notes may have originated with clients.
    // Import historical funding only after an independent ledger reconciliation.
    const funded = (await client.query(`SELECT
        COALESCE((SELECT SUM(amount) FROM ad_funding WHERE ad_id=$1 AND user_id=$2),0)
        - COALESCE((SELECT SUM(amount) FROM ad_budget_refunds WHERE ad_id=$1 AND user_id=$2),0) AS available`,
        [existing.ad_id, userId])).rows[0];
    if (cents(funded.available) - cents(existing.spend || 0) < cents(amount)) throw invalid('Refund exceeds the verified unspent payment for this ad.');
    if (!state?.userId || Number(state.pooledBalance) < amount) throw invalid('Googer main balance is too low to process this refund.');
    await creditWalletBalance(client, { userId, amount });
    const transfer = await insertWalletTransfer(client, {
        senderId: state.userId, receiverId: userId, amount,
        note: `Ad Budget Refund - ${existing.ad_id} - Budget Reduced During Review`,
        type: 'ad_refund', status: 'accepted', commission: -amount, commissionPercentage: 0,
    });
    await client.query(`INSERT INTO ad_budget_refunds(ad_id,user_id,previous_version,old_budget,new_budget,amount,transfer_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [existing.ad_id, userId, String(existing.updated_at || existing.created_at), oldBudget / 100, newBudget / 100, amount, transfer.id]);
    return { amount, transferId: transfer.id };
}

// Compatibility route: acknowledge a server-generated refund, never mint one.
async function readRefundReceipt(client, { userId, adId, amount }) {
    if (!adId || !Number.isFinite(Number(amount)) || Number(amount) <= 0) throw invalid('Valid adId and amount are required.');
    const { rows } = await client.query(`SELECT r.amount, r.transfer_id, u.wallet_balance
        FROM ad_budget_refunds r JOIN ads a ON a.ad_id = r.ad_id JOIN users u ON u.id = r.user_id
        WHERE r.ad_id = $1 AND r.user_id = $2 AND a.user_id = $2 AND r.amount = $3 AND r.new_budget = a.budget
        ORDER BY r.id DESC LIMIT 1`, [adId, userId, Number(amount)]);
    if (!rows.length) throw invalid('No matching completed budget reduction was found.', 409);
    return { success: true, message: 'Ad budget refund processed successfully.', transferId: rows[0].transfer_id, currentBalance: Number(rows[0].wallet_balance) };
}
module.exports = { refundBudgetReduction, readRefundReceipt };
