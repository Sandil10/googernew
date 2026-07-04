const interactionRepository = require('./interactionRepository');
const productReadRepository = require('./productReadRepository');
const { getOptionalUserId } = require('../../shared/auth/optionalUser');
const { toUtcIso } = require('../../shared/time/toUtcIso');

const isSponsoredFeedItemId = productReadRepository.isSponsoredFeedItemId;

const toggleLike = async (req, res) => {
    try {
        const userId = req.user?.id;
        const marketId = parseInt(req.params.id, 10);
        const checkLike = await interactionRepository.findMarketLike({ marketId, userId });

        if (checkLike.rows.length > 0) {
            if (await interactionRepository.hasCollectedCoinForPromotedProduct({ marketId, userId })) {
                return res.status(403).json({
                    success: false,
                    message: 'This ad like is locked after coin collection.',
                    liked: true,
                    locked: true,
                });
            }

            await interactionRepository.deleteMarketLike({ marketId, userId });
            await interactionRepository.decrementMarketLikesCount(marketId);
            return res.status(200).json({ success: true, liked: false });
        }

        await interactionRepository.insertMarketLike({ marketId, userId });
        await interactionRepository.incrementMarketLikesCount(marketId);
        return res.status(200).json({ success: true, liked: true });
    } catch (error) {
        console.error('Error toggling marketplace like:', error);
        return res.status(500).json({ success: false, message: 'Server error toggling like' });
    }
};

const addComment = async (req, res) => {
    try {
        const userId = req.user?.id;
        const text = String(req.body?.text || '').trim();
        const parentId = req.body?.parent_id ? parseInt(req.body.parent_id, 10) : null;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Authentication required' });
        }
        if (!text) {
            return res.status(400).json({ success: false, message: 'Comment text is required' });
        }

        const marketId = parseInt(req.params.id, 10);
        const result = await interactionRepository.insertMarketComment({ marketId, userId, text, parentId });
        await interactionRepository.incrementMarketCommentsCount(marketId);
        const userResult = await interactionRepository.getMarketCommentAuthor(userId);

        return res.status(201).json({
            success: true,
            data: {
                ...result.rows[0],
                created_at: toUtcIso(result.rows[0]?.created_at),
                username: userResult.rows[0]?.username || 'You',
                profile_picture: userResult.rows[0]?.profile_picture || null,
            },
        });
    } catch (error) {
        console.error('Error adding marketplace comment:', error);
        return res.status(500).json({ success: false, message: 'Server error adding comment' });
    }
};

const deleteComment = async (req, res) => {
    try {
        const { commentId } = req.params;
        const userId = req.user?.id;
        const commentResult = await interactionRepository.getMarketCommentById(commentId);
        if (!commentResult.rows.length) {
            return res.status(404).json({ success: false, message: 'Comment not found' });
        }

        const comment = commentResult.rows[0];
        const ownerResult = await interactionRepository.getMarketOwnerById(comment.market_id);
        const ownerId = Number(ownerResult.rows[0]?.user_id || 0);
        const canDelete = Number(comment.user_id) === Number(userId) || ownerId === Number(userId);
        if (!canDelete) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        const deleteResult = await interactionRepository.deleteMarketCommentTree(commentId);
        const deletedCount = Number(deleteResult.rows[0]?.deleted_count || 0);
        await interactionRepository.decrementMarketCommentsCount({
            marketId: comment.market_id,
            deletedCount,
        });

        return res.status(200).json({ success: true, message: 'Comment deleted', deletedCount });
    } catch (error) {
        console.error('Error deleting marketplace comment:', error);
        return res.status(500).json({ success: false, message: 'Server error deleting comment' });
    }
};

const logShare = async (req, res) => {
    try {
        await interactionRepository.ensureMarketSharesTable();
        const marketId = parseInt(req.params.id, 10);
        const userId = getOptionalUserId(req);
        const ipAddress = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
        let incremented = false;

        if (userId) {
            const existingShare = await interactionRepository.findDailyMarketShareByUser({ marketId, userId });
            if (existingShare.rows.length === 0) {
                await interactionRepository.insertMarketShare({ marketId, userId, ipAddress });
                await interactionRepository.incrementMarketSharesCount(marketId);
                incremented = true;
            }
        } else {
            const existingShare = await interactionRepository.findDailyMarketShareByIp({ marketId, ipAddress });
            if (existingShare.rows.length === 0) {
                await interactionRepository.insertMarketShare({ marketId, userId: null, ipAddress });
                await interactionRepository.incrementMarketSharesCount(marketId);
                incremented = true;
            }
        }

        return res.status(200).json({ success: true, incremented });
    } catch (error) {
        console.error('Error logging marketplace share:', error);
        return res.status(500).json({ success: false, message: 'Server error logging share' });
    }
};

const logView = async (req, res) => {
    try {
        const marketId = await interactionRepository.resolveMarketId(req.params.id);
        if (!marketId) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        const userId = getOptionalUserId(req);
        const ipAddress = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
        const viewCheck = userId
            ? await interactionRepository.findMarketViewByUser({ marketId, userId })
            : await interactionRepository.findMarketViewByIp({ marketId, ipAddress });

        const now = new Date();
        let shouldIncrement = false;

        if (viewCheck.rows.length === 0) {
            if (userId) {
                await interactionRepository.insertMarketViewByUser({ marketId, userId, ipAddress });
            } else {
                await interactionRepository.insertMarketViewByIp({ marketId, ipAddress });
            }
            shouldIncrement = true;
        } else {
            const lastViewed = new Date(viewCheck.rows[0].last_viewed_at);
            const diffInHours = (now - lastViewed) / (1000 * 60 * 60);
            if (diffInHours >= 24) {
                if (userId) {
                    await interactionRepository.updateMarketViewByUser({ marketId, userId, ipAddress });
                } else {
                    await interactionRepository.updateMarketViewByIp({ marketId, ipAddress });
                }
                shouldIncrement = true;
            }
        }

        if (shouldIncrement) {
            await interactionRepository.incrementMarketViewsCount(marketId);
        }

        return res.status(200).json({ success: true, incremented: shouldIncrement });
    } catch (error) {
        console.error('Error logging marketplace view:', error);
        return res.status(500).json({ success: false, message: 'Server error logging view' });
    }
};

const getComments = async (req, res) => {
    try {
        const result = await interactionRepository.fetchMarketComments(parseInt(req.params.id, 10));
        return res.status(200).json({
            success: true,
            data: result.rows.map((row) => ({
                ...row,
                created_at: toUtcIso(row.created_at),
            })),
        });
    } catch (error) {
        console.error('Error fetching marketplace comments:', error);
        return res.status(500).json({ success: false, message: 'Server error fetching comments' });
    }
};

const getLikes = async (req, res) => {
    try {
        const result = await interactionRepository.fetchMarketLikes(req.params.id);
        return res.status(200).json({
            success: true,
            data: result.rows.map((row) => ({
                ...row,
                created_at: toUtcIso(row.created_at),
            })),
        });
    } catch (error) {
        console.error('Error fetching marketplace likes:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

const getShares = async (req, res) => {
    try {
        await interactionRepository.ensureMarketSharesTable();
        const result = await interactionRepository.fetchMarketShares(req.params.id);
        return res.status(200).json({
            success: true,
            data: result.rows.map((row) => ({
                ...row,
                created_at: toUtcIso(row.created_at),
            })),
        });
    } catch (error) {
        console.error('Error fetching marketplace shares:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

const getViews = async (req, res) => {
    try {
        const result = await interactionRepository.fetchMarketViews(req.params.id);
        return res.status(200).json({
            success: true,
            data: result.rows.map((row) => ({
                ...row,
                created_at: toUtcIso(row.last_viewed_at || row.created_at),
            })),
        });
    } catch (error) {
        console.error('Error fetching marketplace views:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

module.exports = {
    addComment,
    deleteComment,
    getComments,
    getLikes,
    getShares,
    getViews,
    logShare,
    logView,
    toggleLike,
};
