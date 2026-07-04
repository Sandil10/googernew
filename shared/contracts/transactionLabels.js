const WALLET_TRANSACTION_LABELS = Object.freeze({
    buyDiscountRequest: Object.freeze({
        popupTitle: 'Discount Request',
        amountLine: 'Coins',
        discountLine: 'Discount Request',
        receiptTitle: 'Discount Request',
    }),
    sellDiscountRequest: Object.freeze({
        popupTitle: 'Send Coins & Discount Request',
        amountLine: 'Coins',
        discountLine: 'Discount Request',
        receiptTitle: 'Send Coins & Discount Request',
    }),
    sellerSendDiscount: Object.freeze({
        popupTitle: 'Send Discount',
        amountLine: 'Coins',
        discountLine: 'Send Discounts',
        receiptTitle: 'Send Discount',
    }),
    sellerBuyDiscount: Object.freeze({
        popupTitle: 'Coin Request and Send Discount',
        amountLine: 'Coin Request',
        discountLine: 'Send Discount',
        counterpartyLine: 'Request to',
        receiptTitle: 'Coin Request and Send Discount',
    }),
    visibleHistoryTypes: Object.freeze([
        'request',
        'sell',
        'seller_discount',
        'discount_refund',
    ]),
    hiddenHistoryTypes: Object.freeze([
        'referral_commission',
    ]),
});

module.exports = {
    WALLET_TRANSACTION_LABELS,
};
