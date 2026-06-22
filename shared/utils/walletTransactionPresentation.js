function normalizeType(tx) {
    return String(tx?.type || '').toLowerCase();
}

function normalizeStatus(tx) {
    return String(tx?.status || '').toLowerCase();
}

function normalizeNote(tx) {
    return String(tx?.note || '');
}

function roundMoney(value) {
    return Number(Number(value || 0).toFixed(2));
}

function isManualOrderHold(tx) {
    return normalizeType(tx) === 'order_hold'
        && /manual payment/i.test(normalizeNote(tx));
}

function isGoogerPaymentOrderHold(tx) {
    return normalizeType(tx) === 'order_hold'
        && !/manual payment/i.test(normalizeNote(tx));
}

function isSellerBuyDiscountRequest(tx) {
    return normalizeType(tx) === 'request'
        && Number(tx?.commission_percentage || 0) > 0
        && String(tx?.sender_user_type || '').toLowerCase() === 'seller';
}

function isSellerDiscountRefund(tx) {
    return normalizeType(tx) === 'discount_refund'
        && /seller discount/i.test(normalizeNote(tx));
}

function isProductDiscountRefund(tx) {
    return normalizeType(tx) === 'discount_refund'
        && /product discount/i.test(normalizeNote(tx));
}

function isSellerDirectDiscount(tx) {
    return normalizeType(tx) === 'seller_discount'
        && Number(tx?.commission_percentage || 0) > 0;
}

function isSellDiscountRequest(tx) {
    return normalizeType(tx) === 'sell'
        && Number(tx?.commission_percentage || 0) > 0;
}

function isNormalDiscountRequest(tx) {
    return normalizeType(tx) === 'request'
        && Number(tx?.commission_percentage || 0) > 0
        && !isSellerBuyDiscountRequest(tx);
}

function isNoDiscountBuyRequest(tx) {
    return normalizeType(tx) === 'request'
        && Number(tx?.commission_percentage || 0) <= 0;
}

function isNoDiscountSellTransfer(tx) {
    return normalizeType(tx) === 'sell'
        && Number(tx?.commission_percentage || 0) <= 0;
}

function isGoogerCommissionTx(tx) {
    return normalizeType(tx) === 'commission_hold'
        && /googer commission/i.test(normalizeNote(tx));
}

function isProductDiscountTx(tx) {
    return normalizeType(tx) === 'discount_staking';
}

function formatCoinRequestAmount(value) {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount)) return '0';
    return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

function getDisplayNote(tx, fallback) {
    if (isGoogerPaymentOrderHold(tx)) return 'Googer Payments';
    return tx?.note || fallback;
}

function getWalletDisplayAmount(tx, isSent) {
    const amount = Number(tx?.amount || 0);
    const discountPct = Number(tx?.commission_percentage || 0);
    const type = normalizeType(tx);
    const status = normalizeStatus(tx);
    const isAcceptedDiscountTransfer = ['accepted', 'completed'].includes(status)
        && discountPct > 0
        && ['sell', 'request'].includes(type);

    if (!isAcceptedDiscountTransfer) return amount;

    const discountAmount = roundMoney((amount * discountPct) / 100);
    const netAmount = Math.max(0, amount - discountAmount);

    if (type === 'sell' && !isSent) return netAmount;
    if (type === 'request' && isSent) return netAmount;
    return amount;
}

function getSellerDiscountAmount(tx) {
    const amount = Number(tx?.amount || 0);
    const discountPct = Number(tx?.commission_percentage || 0);
    return roundMoney((amount * discountPct) / 100);
}

function getCoinRequestLines(tx) {
    return {
        coinRequest: `Coin Request ${formatCoinRequestAmount(tx?.amount)}`,
        sendDiscount: `Send Discount ${Number(tx?.commission_percentage || 0)}%`,
    };
}

function getSellerDirectDiscountLines(tx) {
    return {
        sendDiscount: `Send Discount ${Number(tx?.commission_percentage || 0)}%`,
    };
}

function getSellDiscountRequestLines(tx) {
    return {
        sendCoin: `Send Coin ${formatCoinRequestAmount(tx?.amount)}`,
        discountRequest: `Discount Request ${Number(tx?.commission_percentage || 0)}%`,
    };
}

function getNormalDiscountRequestLine(tx) {
    return `Discount Request ${Number(tx?.commission_percentage || 0)}%`;
}

function getSellerDiscountRefundLines(tx) {
    const discountPercent = Number(tx?.original_discount_percentage || 0);
    return {
        sendDiscount: `Send Discount ${Number.isFinite(discountPercent) && discountPercent > 0 ? discountPercent : ''}%`.replace(' %', ''),
        deductionNote: 'Referral level amounts are deducted first. This is the remaining discount balance added to your wallet.',
    };
}

function getProductDiscountRefundLines(tx) {
    const discountPercent = Number(tx?.product_discount_percentage || 0);
    return {
        productDiscount: discountPercent > 0 ? `Product Discount ${discountPercent}%` : 'Product Discount',
        deductionNote: 'Referral level amounts are deducted first. This is the remaining discount balance added to your wallet.',
    };
}

function getProductDiscountLine(tx) {
    const percent = Number(tx?.product_discount_percentage || tx?.commission_percentage || 0);
    return percent > 0 ? `Product Discount ${percent}%` : 'Product Discount';
}

function formatWalletTypeLabel(tx) {
    const type = normalizeType(tx);
    if (type === 'sell') return 'Sell';
    if (type === 'request') return 'Requested';
    if (type === 'transfer') return 'Transfer';
    if (type === 'seller_discount') return 'Send Discount';
    if (type === 'discount_refund') return 'Discount Refund';
    if (type === 'discount_staking') return 'Product Discount';
    if (type === 'commission_hold') return 'Googer Commission';
    if (type === 'order_hold') return 'Order Hold';
    return type ? type.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()) : 'Wallet';
}

function formatTransactionStatus(tx) {
    const type = normalizeType(tx);
    const status = normalizeStatus(tx) || 'pending';
    const isRequestBased = type === 'request' || type === 'sell';

    if (isRequestBased) {
        if (status === 'accepted' || status === 'completed') return 'Accepted';
        return 'Pending';
    }

    if (isManualOrderHold(tx)) {
        if (status === 'completed') return 'Paid';
        if (status === 'pending') return 'Pending';
    }

    if (status === 'accepted') return 'Accepted';
    if (status === 'completed') return 'Completed';
    if (status === 'rejected') return 'Rejected';
    if (status === 'cancelled') return 'Cancelled';
    return status.charAt(0).toUpperCase() + status.slice(1);
}

module.exports = {
    formatCoinRequestAmount,
    formatTransactionStatus,
    formatWalletTypeLabel,
    getCoinRequestLines,
    getDisplayNote,
    getNormalDiscountRequestLine,
    getProductDiscountLine,
    getProductDiscountRefundLines,
    getSellerDirectDiscountLines,
    getSellerDiscountAmount,
    getSellerDiscountRefundLines,
    getSellDiscountRequestLines,
    getWalletDisplayAmount,
    isGoogerCommissionTx,
    isGoogerPaymentOrderHold,
    isManualOrderHold,
    isNoDiscountBuyRequest,
    isNoDiscountSellTransfer,
    isNormalDiscountRequest,
    isProductDiscountRefund,
    isProductDiscountTx,
    isSellDiscountRequest,
    isSellerBuyDiscountRequest,
    isSellerDirectDiscount,
    isSellerDiscountRefund,
};
