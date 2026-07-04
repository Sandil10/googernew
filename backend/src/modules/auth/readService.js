const { getUserPlanLimits } = require('../../utils/planLimits');
const readRepository = require('./readRepository');

const normalizePublicUserShape = async (user, authUser) => {
    const isOwner = Number(authUser?.id) === Number(user.id);
    user.subscriber_count = await readRepository.socialSubscriptionsRepository.getSubscriberCount(user.id);
    user.is_subscribed = await readRepository.socialSubscriptionsRepository.getSubscribedStatus(authUser?.id, user.id);
    user.profile_views_count = await readRepository.getProfileViewCount(user.id);
    user.following_count = await readRepository.getFollowingCount(user.id);
    user.blocked_count = await readRepository.getBlockedCount(user.id);
    user.contact_email = isOwner || user.contact_email_visibility !== 'only_me' ? (user.contact_email || null) : null;
    user.contact_phone = isOwner || user.contact_phone_visibility !== 'only_me'
        ? (user.phone_number || user.shipping_address?.phone || user.shipping_address?.phone2 || null)
        : null;
    if (!isOwner) {
        user.email = null;
    }

    const limits = await getUserPlanLimits(user.id);
    user.verified_tick = limits.verifiedTick;
    return user;
};

const getUserById = async (req) => {
    const { id } = req.params;
    const authUser = readRepository.getOptionalAuthUser(req);
    await readRepository.ensureGoogerIdNormalization();
    await readRepository.socialSubscriptionsRepository.ensureSubscriptionsTable();
    await readRepository.ensureExtendedUserProfileSchema();
    await readRepository.ensureUserBlocksTable();
    const includeShippingAddress = await readRepository.accountRepository.hasUsersTableColumn('shipping_address');

    const user = await readRepository.getPublicUserById(id, includeShippingAddress);
    if (!user) {
        const error = new Error('User not found');
        error.statusCode = 404;
        throw error;
    }

    return {
        success: true,
        user: await normalizePublicUserShape(user, authUser),
    };
};

const getProfile = async (userId) => {
    await readRepository.ensureGoogerIdNormalization();
    await readRepository.socialSubscriptionsRepository.ensureSubscriptionsTable();
    await readRepository.ensureProfileViewsTable();
    await readRepository.ensureExtendedUserProfileSchema();
    await readRepository.accountRepository.ensureSuspensionColumns();
    await readRepository.ensureUserBlocksTable();

    const includeShippingAddress = await readRepository.accountRepository.hasUsersTableColumn('shipping_address');
    const userData = await readRepository.getOwnProfileById(userId, includeShippingAddress);

    if (!userData) {
        const error = new Error('User not found');
        error.statusCode = 404;
        throw error;
    }

    try {
        if (!userData.referral_code) {
            const cleanName = (userData.username || 'USR').substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X');
            const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
            const newCode = `REF-${cleanName}-${randomStr}`;
            await readRepository.updateReferralCode(userData.id, newCode);
            userData.referral_code = newCode;
        }
    } catch (refError) {
        console.error('[AUTH] Referral generation error:', refError.message);
    }

    const balance = parseFloat(userData.wallet_balance || 0);
    userData.wallet_balance = balance;
    userData.balance = balance;
    userData.subscriber_count = await readRepository.socialSubscriptionsRepository.getSubscriberCount(userData.id);
    userData.is_subscribed = await readRepository.socialSubscriptionsRepository.getSubscribedStatus(userId, userData.id);
    userData.profile_views_count = await readRepository.getProfileViewCount(userData.id);
    userData.following_count = await readRepository.getFollowingCount(userData.id);
    userData.blocked_count = await readRepository.getBlockedCount(userData.id);
    userData.contact_email = userData.contact_email || null;
    userData.contact_phone = userData.phone_number || userData.shipping_address?.phone || userData.shipping_address?.phone2 || null;

    const limits = await getUserPlanLimits(userData.id);
    userData.verified_tick = limits.verifiedTick;

    return {
        success: true,
        user: userData,
    };
};

const getUserByUsername = async (req) => {
    const { username } = req.params;
    const authUser = readRepository.getOptionalAuthUser(req);
    await readRepository.ensureGoogerIdNormalization();
    await readRepository.socialSubscriptionsRepository.ensureSubscriptionsTable();
    await readRepository.ensureExtendedUserProfileSchema();
    await readRepository.ensureUserBlocksTable();
    const includeShippingAddress = await readRepository.accountRepository.hasUsersTableColumn('shipping_address');

    const user = await readRepository.getPublicUserByUsername(username, includeShippingAddress);
    if (!user) {
        const error = new Error('User not found');
        error.statusCode = 404;
        throw error;
    }

    return {
        success: true,
        data: await normalizePublicUserShape(user, authUser),
    };
};

const getBlockedUsers = async (targetUserIdValue) => {
    const targetUserId = Number(targetUserIdValue);
    if (!targetUserId) {
        const error = new Error('Invalid user id');
        error.statusCode = 400;
        throw error;
    }

    const rows = await readRepository.listBlockedUsers(targetUserId);
    return { success: true, count: rows.length, data: rows };
};

const toggleBlockUser = async (blockerId, blockedUserIdValue) => {
    const blockedUserId = Number(blockedUserIdValue);
    if (!blockedUserId || blockedUserId === blockerId) {
        const error = new Error('Invalid target');
        error.statusCode = 400;
        throw error;
    }

    const existing = await readRepository.findBlock(blockerId, blockedUserId);
    if (existing) {
        await readRepository.deleteBlock(blockerId, blockedUserId);
        return { success: true, blocked: false, message: 'User unblocked' };
    }

    await readRepository.insertBlock(blockerId, blockedUserId);
    return { success: true, blocked: true, message: 'User blocked' };
};

const logProfileView = async (req) => {
    const targetUserId = Number(req.params.id);
    if (!targetUserId) {
        const error = new Error('Invalid user id');
        error.statusCode = 400;
        throw error;
    }

    let viewerUserId = req.user?.id || null;
    const ipAddress = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
    await readRepository.ensureProfileViewsTable();

    if (!viewerUserId) {
        const authUser = readRepository.getOptionalAuthUser(req);
        viewerUserId = authUser?.id || null;
    }

    if (viewerUserId && Number(viewerUserId) === targetUserId) {
        const profileViewsCount = await readRepository.getProfileViewCount(targetUserId);
        return { success: true, incremented: false, profileViewsCount };
    }

    const user = await readRepository.findUserId(targetUserId);
    if (!user) {
        const error = new Error('User not found');
        error.statusCode = 404;
        throw error;
    }

    let existingView;
    if (viewerUserId) {
        existingView = await readRepository.findExistingProfileViewByViewer(targetUserId, viewerUserId);
    } else {
        existingView = await readRepository.findExistingProfileViewByIp(targetUserId, ipAddress);
    }

    const now = new Date();
    let shouldIncrement = false;

    if (!existingView) {
        if (viewerUserId) {
            await readRepository.insertProfileViewWithViewer(targetUserId, viewerUserId, ipAddress);
        } else {
            await readRepository.insertProfileViewWithIp(targetUserId, ipAddress);
        }
        shouldIncrement = true;
    } else {
        const lastViewed = new Date(existingView.last_viewed_at);
        const diffInHours = (now - lastViewed) / (1000 * 60 * 60);
        if (diffInHours >= 24) {
            if (viewerUserId) {
                await readRepository.updateProfileViewWithViewer(ipAddress, targetUserId, viewerUserId);
            } else {
                await readRepository.updateProfileViewWithIp(targetUserId, ipAddress);
            }
            shouldIncrement = true;
        }
    }

    const profileViewsCount = await readRepository.getProfileViewCount(targetUserId);
    return { success: true, incremented: shouldIncrement, profileViewsCount };
};

const getProfileViews = async (targetUserIdValue) => {
    const targetUserId = Number(targetUserIdValue);
    if (!targetUserId) {
        const error = new Error('Invalid user id');
        error.statusCode = 400;
        throw error;
    }

    const count = await readRepository.getProfileViewCount(targetUserId);
    return { success: true, profileViewsCount: count };
};

module.exports = {
    getBlockedUsers,
    getProfile,
    getProfileViews,
    getUserById,
    getUserByUsername,
    logProfileView,
    toggleBlockUser,
};
