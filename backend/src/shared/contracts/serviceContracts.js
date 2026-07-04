const SERVICE_NAMES = Object.freeze({
    ADS: 'ads',
    AUTH: 'auth',
    CHAT: 'chat',
    FEED: 'feed',
    MARKETPLACE: 'marketplace',
    NOTIFICATIONS: 'notifications',
    SUBSCRIPTIONS: 'subscriptions',
    USERS: 'users',
    VERIFICATION: 'verification',
});

const SHARE_ITEM_TYPES = Object.freeze({
    AD: 'ad',
    GOOG: 'goog',
    PRODUCT: 'product',
    PROFILE: 'profile',
});

const DOMAIN_EVENTS = Object.freeze({
    CHAT_MESSAGE_CREATED: 'chat.message.created',
    MARKETPLACE_ITEM_CREATED: 'marketplace.item.created',
    MARKETPLACE_ITEM_UPDATED: 'marketplace.item.updated',
    MARKETPLACE_ITEM_REVIEW_REQUIRED: 'marketplace.item.review_required',
    SUBSCRIPTION_AUTO_RENEWED: 'subscription.auto_renewed',
    SUBSCRIPTION_CANCELLED: 'subscription.cancelled',
    SUBSCRIPTION_PURCHASED: 'subscription.purchased',
    USER_PROFILE_UPDATED: 'user.profile.updated',
    WALLET_TRANSFER_INITIATED: 'wallet.transfer.initiated',
    WITHDRAWAL_CANCELLED: 'withdrawal.cancelled',
    WITHDRAWAL_REQUESTED: 'withdrawal.requested',
});

module.exports = {
    DOMAIN_EVENTS,
    SERVICE_NAMES,
    SHARE_ITEM_TYPES,
};
