const jwt = require('jsonwebtoken');
const { getUserPlanLimits } = require('../../utils/planLimits');
const googInteractionRepository = require('./googInteractionRepository');
const { extractAuthToken, getJwtSecret } = require('../../../../shared/api/authToken');

const VALID_REPORT_REASONS = ['Spam or misleading', 'Harassment or bullying', 'Hate speech or graphic', 'Inappropriate content', 'Other'];

/// Best-effort viewer id for public routes: returns the signed-in user when a
/// valid token happens to be present, and null otherwise. Never rejects the
/// request — these endpoints must keep working for logged-out visitors.
const resolveOptionalViewerId = (req) => {
    try {
        const token = extractAuthToken(req.header('Authorization'));
        if (!token) return null;
        const secret = getJwtSecret();
        if (!secret) return null;
        const decoded = jwt.verify(token, secret);
        return decoded?.id || decoded?.userId || null;
    } catch {
        return null;
    }
};

const toUtcIso = (value) => {
    if (!value) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(raw)
        ? `${raw.replace(' ', 'T')}Z`
        : raw;
    const date = new Date(normalized);
    const time = date.getTime();
    return Number.isFinite(time) ? date.toISOString() : null;
};

const toggleLike = async (req, res) => {
    try {
        await googInteractionRepository.ensureGoogSchema();
        const userId = req.user.id;
        const postId = parseInt(req.params.id, 10);

        const existing = await googInteractionRepository.findLike({ postId, userId });
        if (existing.rows.length) {
            await googInteractionRepository.deleteLike({ postId, userId });
            await googInteractionRepository.decrementLikesCount(postId);
            return res.status(200).json({ success: true, liked: false });
        }

        await googInteractionRepository.insertLike({ postId, userId });
        await googInteractionRepository.incrementLikesCount(postId);
        return res.status(200).json({ success: true, liked: true });
    } catch (error) {
        console.error('Error toggling Goog like:', error);
        return res.status(500).json({ success: false, message: 'Server error toggling Goog like' });
    }
};

const toggleSubscribe = async (req, res) => {
    try {
        await googInteractionRepository.ensureGoogSchema();
        const userId = req.user.id;
        const postId = parseInt(req.params.id, 10);

        const existing = await googInteractionRepository.findSubscription({ postId, userId });
        if (existing.rows.length) {
            await googInteractionRepository.deleteSubscription({ postId, userId });
            return res.status(200).json({ success: true, subscribed: false });
        }

        await googInteractionRepository.insertSubscription({ postId, userId });
        return res.status(201).json({ success: true, subscribed: true });
    } catch (error) {
        console.error('Error toggling Goog subscription:', error);
        return res.status(500).json({ success: false, message: 'Server error toggling Goog subscription' });
    }
};

const checkSubscribe = async (req, res) => {
    try {
        await googInteractionRepository.ensureGoogSchema();
        const userId = req.user.id;
        const postId = parseInt(req.params.id, 10);
        const result = await googInteractionRepository.findSubscription({ postId, userId });
        return res.status(200).json({ success: true, subscribed: result.rows.length > 0 });
    } catch (error) {
        console.error('Error checking subscription:', error);
        return res.status(500).json({ success: false, message: 'Server error checking subscription' });
    }
};

const createReport = async (req, res) => {
    try {
        await googInteractionRepository.ensureGoogSchema().catch((e) => { console.error('[createReport] ensureGoogSchema failed:', e.message); });
        await googInteractionRepository.ensureReportsTable();
        const userId = req.user.id;
        const postId = parseInt(req.params.id, 10);
        const { reason, custom_reason } = req.body || {};

        if (!postId || Number.isNaN(postId)) {
            return res.status(400).json({ success: false, message: 'Invalid post ID' });
        }
        if (!reason || !VALID_REPORT_REASONS.includes(reason)) {
            return res.status(400).json({ success: false, message: 'Valid reason is required' });
        }

        const existingReport = await googInteractionRepository.findExistingReport({ postId, userId });
        if (existingReport.rows.length) {
            return res.status(409).json({ success: false, message: 'You have already reported this post' });
        }

        await googInteractionRepository.insertReport({
            postId,
            userId,
            reason,
            customReason: custom_reason || null,
        });
        await googInteractionRepository.incrementReportsCount(postId);
        return res.status(201).json({ success: true, message: 'Report submitted successfully' });
    } catch (error) {
        console.error('Error creating Goog report:', error.message, error.stack);
        return res.status(500).json({ success: false, message: error.message || 'Server error creating Goog report' });
    }
};

const addComment = async (req, res) => {
    try {
        await googInteractionRepository.ensureGoogSchema();
        const userId = req.user.id;
        const postId = parseInt(req.params.id, 10);
        const text = String(req.body?.text || '').trim();
        const parentId = req.body?.parent_id ? parseInt(req.body.parent_id, 10) : null;

        if (!text) {
            return res.status(400).json({ success: false, message: 'Comment text is required' });
        }

        const result = await googInteractionRepository.insertComment({ postId, userId, text, parentId });
        const comment = result.rows[0];
        if (comment?.created_at) {
            comment.created_at = toUtcIso(comment.created_at);
        }
        await googInteractionRepository.incrementCommentsCount(postId);

        const user = await googInteractionRepository.getCommentAuthor(userId);
        return res.status(201).json({
            success: true,
            data: {
                ...comment,
                market_id: `goog-${postId}`,
                username: user.rows[0]?.username || 'You',
                profile_picture: user.rows[0]?.profile_picture,
            },
        });
    } catch (error) {
        console.error('Error adding Goog comment:', error);
        return res.status(500).json({ success: false, message: 'Server error adding Goog comment' });
    }
};

const getComments = async (req, res) => {
    try {
        await googInteractionRepository.ensureGoogSchema();
        await googInteractionRepository.ensureCommentReactionsTable();
        const postId = parseInt(req.params.id, 10);
        // This route stays public, but when a token is present we resolve the
        // viewer so each comment reports whether *they* already voted — that is
        // what keeps the like button lit after a reload.
        const viewerId = resolveOptionalViewerId(req);
        const result = await googInteractionRepository.fetchComments(postId, viewerId);
        const normalizedComments = result.rows.map((row) => ({
            ...row,
            created_at: toUtcIso(row.created_at),
        }));
        return res.status(200).json({ success: true, data: normalizedComments });
    } catch (error) {
        console.error('Error fetching Goog comments:', error);
        return res.status(500).json({ success: false, message: 'Server error fetching Goog comments' });
    }
};

const deleteComment = async (req, res) => {
    try {
        await googInteractionRepository.ensureGoogSchema();
        const userId = req.user.id;
        const commentId = parseInt(req.params.commentId, 10);
        const comment = await googInteractionRepository.fetchCommentWithOwner(commentId);

        if (!comment.rows.length) {
            return res.status(404).json({ success: false, message: 'Comment not found' });
        }

        const canDelete = Number(comment.rows[0].user_id) === Number(userId) || Number(comment.rows[0].post_owner_id) === Number(userId);
        if (!canDelete) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        const deleteResult = await googInteractionRepository.deleteCommentTree(commentId);
        const deletedCount = Number(deleteResult.rows[0]?.deleted_count || 0);
        await googInteractionRepository.decrementCommentsCount({
            postId: comment.rows[0].goog_id,
            deletedCount,
        });

        return res.status(200).json({ success: true, deletedCount });
    } catch (error) {
        console.error('Error deleting Goog comment:', error);
        return res.status(500).json({ success: false, message: 'Server error deleting Goog comment' });
    }
};

/// Applies a like/dislike as a per-user toggle:
///  - tapping the same reaction again clears it (un-like / un-dislike)
///  - tapping the opposite one switches the vote
/// Counts are recomputed from the reaction rows, so they always match reality.
const applyCommentReaction = async (req, res, reaction) => {
    try {
        await googInteractionRepository.ensureGoogSchema();
        await googInteractionRepository.ensureCommentReactionsTable();

        const commentId = parseInt(req.params.commentId, 10);
        const userId = req.user?.id || req.user?.userId;
        if (!commentId) {
            return res.status(400).json({ success: false, message: 'Invalid comment id' });
        }
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        const existing = await googInteractionRepository.findCommentReaction({ commentId, userId });
        const current = existing.rows[0]?.reaction || null;

        if (current === reaction) {
            await googInteractionRepository.deleteCommentReaction({ commentId, userId });
        } else {
            await googInteractionRepository.upsertCommentReaction({ commentId, userId, reaction });
        }

        const counts = await googInteractionRepository.syncCommentReactionCounts(commentId);
        if (!counts.rows.length) {
            return res.status(404).json({ success: false, message: 'Comment not found' });
        }

        const userReaction = current === reaction ? null : reaction;
        return res.status(200).json({
            success: true,
            ...counts.rows[0],
            user_reaction: userReaction,
            user_liked: userReaction === 'like',
            user_disliked: userReaction === 'dislike',
        });
    } catch (error) {
        console.error(`Error applying '${reaction}' to Goog comment:`, error);
        return res.status(500).json({ success: false, message: 'Server error updating comment reaction' });
    }
};

const likeComment = (req, res) => applyCommentReaction(req, res, 'like');

const dislikeComment = (req, res) => applyCommentReaction(req, res, 'dislike');

const toggleSave = async (req, res) => {
    try {
        await googInteractionRepository.ensureGoogSchema();
        await googInteractionRepository.ensureSavedGoogsSchema();
        const userId = req.user?.id || req.user?.userId;
        if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

        const googId = parseInt(req.params.id, 10);
        if (!googId) return res.status(400).json({ success: false, message: 'Invalid goog id' });

        const existing = await googInteractionRepository.findSavedGoog({ userId, googId });
        if (existing.rows.length > 0) {
            await googInteractionRepository.deleteSavedGoog({ userId, googId });
            return res.json({ success: true, saved: false });
        }

        const limits = await getUserPlanLimits(userId);
        const limit = limits.saveGoogLimit;
        if (limit === 0) {
            return res.status(403).json({ success: false, message: 'Subscribe to a plan to save Googs.' });
        }

        const countRes = await googInteractionRepository.countSavedGoogs(userId);
        if ((countRes.rows[0]?.c || 0) >= limit) {
            return res.status(403).json({
                success: false,
                message: `Your plan allows saving up to ${limit} Goog${limit === 1 ? '' : 's'}. Upgrade to save more.`,
                limit,
            });
        }

        await googInteractionRepository.insertSavedGoog({ userId, googId });
        return res.json({ success: true, saved: true });
    } catch (err) {
        console.error('[googs] toggleSave error:', err);
        return res.status(500).json({ success: false, message: 'Failed to save goog' });
    }
};

module.exports = {
    addComment,
    checkSubscribe,
    createReport,
    deleteComment,
    dislikeComment,
    getComments,
    likeComment,
    toggleLike,
    toggleSave,
    toggleSubscribe,
};
