const socialSubscriptionsRepository = require('./socialSubscriptionsRepository');

const parseTargetUserId = (value) => {
    const targetUserId = Number(value);
    return Number.isFinite(targetUserId) ? targetUserId : 0;
};

const assertTargetUserExists = async (targetUserId, client) => {
    const user = await socialSubscriptionsRepository.findUserById(targetUserId, client);
    if (!user) {
        const error = new Error('User not found');
        error.statusCode = 404;
        throw error;
    }
};

const getSubscriptionStatus = async (req) => {
    const targetUserId = parseTargetUserId(req.params.id);
    if (!targetUserId) {
        const error = new Error('Invalid user id');
        error.statusCode = 400;
        throw error;
    }

    const authUser = socialSubscriptionsRepository.getOptionalAuthUser(req);
    await assertTargetUserExists(targetUserId);

    const subscriberCount = await socialSubscriptionsRepository.getSubscriberCount(targetUserId);
    const isSubscribed = await socialSubscriptionsRepository.getSubscribedStatus(authUser?.id, targetUserId);

    return {
        isSubscribed,
        subscriberCount,
        success: true,
    };
};

const getFollowingUsers = async (targetUserIdValue) => {
    const targetUserId = parseTargetUserId(targetUserIdValue);
    if (!targetUserId) {
        const error = new Error('Invalid user id');
        error.statusCode = 400;
        throw error;
    }

    const rows = await socialSubscriptionsRepository.listFollowingUsers(targetUserId);
    return {
        count: rows.length,
        data: rows,
        success: true,
    };
};

const getFollowerUsers = async (targetUserIdValue) => {
    const targetUserId = parseTargetUserId(targetUserIdValue);
    if (!targetUserId) {
        const error = new Error('Invalid user id');
        error.statusCode = 400;
        throw error;
    }

    const rows = await socialSubscriptionsRepository.listFollowerUsers(targetUserId);
    return {
        count: rows.length,
        data: rows,
        success: true,
    };
};

const toggleSubscription = async (subscriberId, targetUserIdValue) => {
    const targetUserId = parseTargetUserId(targetUserIdValue);
    if (!targetUserId) {
        const error = new Error('Invalid user id');
        error.statusCode = 400;
        throw error;
    }

    const client = await socialSubscriptionsRepository.connect();
    try {
        await socialSubscriptionsRepository.ensureSubscriptionsTable();
        await client.query('BEGIN');

        await assertTargetUserExists(targetUserId, client);

        const existing = await socialSubscriptionsRepository.findExistingSubscription(client, subscriberId, targetUserId);

        let isSubscribed = false;
        if (existing) {
            await socialSubscriptionsRepository.deleteSubscription(client, subscriberId, targetUserId);
        } else {
            await socialSubscriptionsRepository.insertSubscription(client, subscriberId, targetUserId);
            isSubscribed = true;
        }

        const subscriberCount = await socialSubscriptionsRepository.getSubscriberCount(targetUserId, client);

        await client.query('COMMIT');

        return {
            isSubscribed,
            subscriberCount,
            success: true,
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

module.exports = {
    getFollowerUsers,
    getFollowingUsers,
    getSubscriptionStatus,
    toggleSubscription,
};
