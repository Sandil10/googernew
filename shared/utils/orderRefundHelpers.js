const { cancelTransferIfUnused } = require('./orderTransferHelpers');

async function refundCancelledOrder(client, order, options = {}) {
    const {
        allowResellCommissionRefund = false,
        allowedTransferColumns = [
            'wallet_transfer_id',
            'seller_commission_transfer_id',
            'seller_discount_transfer_id',
        ],
        lockTransferRows = false,
        skipWalletTransferStatuses = [],
        skipSellerCommissionStatuses = [],
        skipSellerDiscountStatuses = [],
        skipResellCommissionStatuses = [],
    } = options;

    const walletTransferQuery = lockTransferRows
        ? 'SELECT status FROM wallet_transfers WHERE id = $1 FOR UPDATE'
        : 'SELECT status FROM wallet_transfers WHERE id = $1';
    const sellerCommissionQuery = lockTransferRows
        ? 'SELECT amount, status FROM wallet_transfers WHERE id = $1 FOR UPDATE'
        : 'SELECT amount, status FROM wallet_transfers WHERE id = $1';
    const sellerDiscountQuery = lockTransferRows
        ? 'SELECT amount, status FROM wallet_transfers WHERE id = $1 FOR UPDATE'
        : 'SELECT amount, status FROM wallet_transfers WHERE id = $1';
    const resellCommissionQuery = lockTransferRows
        ? 'SELECT amount, status FROM wallet_transfers WHERE id = $1 FOR UPDATE'
        : 'SELECT amount, status FROM wallet_transfers WHERE id = $1';

    if (order.wallet_transfer_id) {
        let shouldRefundWalletTransfer = true;

        if (skipWalletTransferStatuses.length > 0) {
            const holdTxRes = await client.query(walletTransferQuery, [order.wallet_transfer_id]);
            const holdStatus = String(holdTxRes.rows[0]?.status || '').toLowerCase();
            shouldRefundWalletTransfer = !skipWalletTransferStatuses.includes(holdStatus);
        }

        if (shouldRefundWalletTransfer) {
            const buyerRefundAmount = parseFloat(order.total_price || 0) + parseFloat(order.shipping_fee || 0);
            await client.query(
                'UPDATE users SET hold_balance = hold_balance - $1, wallet_balance = wallet_balance + $1 WHERE id = $2',
                [buyerRefundAmount, order.buyer_id]
            );
            await cancelTransferIfUnused(client, 'wallet_transfer_id', order.wallet_transfer_id, order.id, {
                allowedColumns: allowedTransferColumns,
            });
        }
    }

    if (order.seller_commission_transfer_id) {
        const commRes = await client.query(sellerCommissionQuery, [order.seller_commission_transfer_id]);
        if (commRes.rows.length > 0) {
            const commAmount = parseFloat(commRes.rows[0].amount || 0);
            const commStatus = String(commRes.rows[0].status || '').toLowerCase();
            if (!skipSellerCommissionStatuses.includes(commStatus)) {
                await client.query(
                    'UPDATE users SET hold_balance = hold_balance - $1, wallet_balance = wallet_balance + $1 WHERE id = $2',
                    [commAmount, order.seller_id]
                );
                await cancelTransferIfUnused(client, 'seller_commission_transfer_id', order.seller_commission_transfer_id, order.id, {
                    allowedColumns: allowedTransferColumns,
                });
            }
        }
    }

    if (order.seller_discount_transfer_id) {
        const discRes = await client.query(sellerDiscountQuery, [order.seller_discount_transfer_id]);
        if (discRes.rows.length > 0) {
            const discAmount = parseFloat(discRes.rows[0].amount || 0);
            const discountStatus = String(discRes.rows[0].status || '').toLowerCase();
            if (skipSellerDiscountStatuses.includes(discountStatus)) return;

            if (order.payment_method === 'wallet_manual') {
                await client.query(
                    'UPDATE users SET hold_balance = hold_balance - $1, wallet_balance = wallet_balance + $1 WHERE id = $2',
                    [discAmount, order.seller_id]
                );
            } else if (discountStatus === 'pending') {
                await client.query(
                    'UPDATE users SET hold_balance = hold_balance - $1, wallet_balance = wallet_balance + $1 WHERE id = $2',
                    [discAmount, order.seller_id]
                );
            } else if (order.payment_method !== 'wallet_manual') {
                await client.query('UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2', [discAmount, order.seller_id]);
            }

            await cancelTransferIfUnused(client, 'seller_discount_transfer_id', order.seller_discount_transfer_id, order.id, {
                allowedColumns: allowedTransferColumns,
            });
        }
    }

    if (allowResellCommissionRefund && order.resell_commission_transfer_id) {
        const resellRes = await client.query(resellCommissionQuery, [order.resell_commission_transfer_id]);
        if (resellRes.rows.length > 0) {
            const resellAmount = parseFloat(resellRes.rows[0].amount || 0);
            const resellStatus = String(resellRes.rows[0].status || '').toLowerCase();
            if (!skipResellCommissionStatuses.includes(resellStatus)) {
                await client.query(
                    'UPDATE users SET hold_balance = GREATEST(0, COALESCE(hold_balance, 0) - $1), wallet_balance = COALESCE(wallet_balance, 0) + $1 WHERE id = $2',
                    [resellAmount, order.seller_id]
                );
                await cancelTransferIfUnused(client, 'resell_commission_transfer_id', order.resell_commission_transfer_id, order.id, {
                    allowedColumns: allowedTransferColumns,
                });
            }
        }
    }
}

module.exports = {
    refundCancelledOrder,
};
