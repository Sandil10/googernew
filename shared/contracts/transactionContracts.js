const WALLET_TRANSFER_STATUSES = Object.freeze([
    'accepted',
    'cancelled',
    'completed',
    'pending',
    'refunded',
    'rejected',
]);

const WALLET_TRANSFER_TYPES = Object.freeze([
    'ad_coin',
    'ad_coin_ad_credit',
    'ad_refund',
    'buyer_commission',
    'capital_add',
    'commission_hold',
    'discount_refund',
    'discount_staking',
    'manual_credit',
    'order_hold',
    'profile_promote',
    'promo_ad',
    'referral_commission',
    'request',
    'resell_commission',
    'resell_googer_fee',
    'sell',
    'seller_discount',
    'sub_auto_renew',
    'subscription_payment',
    'system_payout',
    'system_topup',
    'topup_approved',
    'transfer',
    'withdrawal_hold',
    'withdrawal_refund',
]);

const ORDER_STATUSES = Object.freeze([
    'cancelled',
    'delivered',
    'pending',
    'processing',
    'received',
    'rejected',
    'rejected_report',
    'reshipped',
    'returned',
    'shipped',
]);

const PAYMENT_METHODS = Object.freeze([
    'cod',
    'wallet',
    'wallet_manual',
]);

module.exports = {
    WALLET_TRANSFER_STATUSES,
    WALLET_TRANSFER_TYPES,
    ORDER_STATUSES,
    PAYMENT_METHODS,
};
