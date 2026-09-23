const pool = require('../../config/database');
const { getUserPlanLimits } = require('../../utils/planLimits');
const googMutationRepository = require('./googMutationRepository');
const googReadRepository = require('./googReadRepository');
const { normalizePost } = require('./googReadService');

const sanitizeTextColor = (value) => String(value || '#FFFFFF').trim().slice(0, 20);
const sanitizeText = (value, limit) => String(value || '').trim().slice(0, limit);

const createPost = async (req, res) => {
    try {
        await googMutationRepository.ensureGoogSchema();
        const userId = req.user.id;
        const limits = await getUserPlanLimits(userId);

        const [dailyCountRes, totalCountRes] = await Promise.all([
            googMutationRepository.countPostsTodayByUser(userId),
            googMutationRepository.countPostsByUser(userId),
        ]);
        if (Number(limits.writeGoogDailyLimit) > 0 && Number(dailyCountRes.rows[0].c) >= Number(limits.writeGoogDailyLimit)) {
            return res.status(403).json({
                success: false,
                message: 'Daily Goog posting limit reached. Subscribe to a higher plan to create more googs today.',
                code: 'WRITE_GOOG_LIMIT',
                limitType: 'daily',
                limit: limits.writeGoogDailyLimit,
            });
        }
        if (Number(limits.writeGoogTotalLimit) > 0 && Number(totalCountRes.rows[0].c) >= Number(limits.writeGoogTotalLimit)) {
            return res.status(403).json({
                success: false,
                message: 'Total Goog posting limit reached. Subscribe to a higher plan to create more googs.',
                code: 'WRITE_GOOG_LIMIT',
                limitType: 'total',
                limit: limits.writeGoogTotalLimit,
            });
        }

        const text = sanitizeText(req.body?.text, limits.googLetterLimit);
        const textColor = sanitizeTextColor(req.body?.textColor);

        if (!text) {
            return res.status(400).json({ success: false, message: 'Post text is required' });
        }

        const provisionalShareCode = await googReadRepository.pickGoogShareCode(`new:${userId}:${Date.now()}:${Math.random()}`);
        const created = await googMutationRepository.createPost({
            userId,
            text,
            textColor,
            shareCode: provisionalShareCode,
        });

        const finalShareCode = await googReadRepository.pickGoogShareCode(created.rows[0].id);
        await googMutationRepository.updatePostShareCode({
            postId: created.rows[0].id,
            shareCode: finalShareCode,
        });

        const result = await googReadRepository.fetchPostById(userId, created.rows[0].id);
        return res.status(201).json({ success: true, data: normalizePost(result.rows[0]) });
    } catch (error) {
        console.error('Error creating Goog post:', error);
        return res.status(500).json({ success: false, message: 'Server error creating Goog post' });
    }
};

const updatePost = async (req, res) => {
    try {
        await googMutationRepository.ensureGoogSchema();
        const userId = req.user.id;
        const id = parseInt(req.params.id, 10);
        const limits = await getUserPlanLimits(userId);
        const text = sanitizeText(req.body?.text, limits.googLetterLimit);
        const textColor = sanitizeTextColor(req.body?.textColor);

        if (!text) {
            return res.status(400).json({ success: false, message: 'Post text is required' });
        }

        const updated = await googMutationRepository.updatePost({ id, userId, text, textColor });
        if (!updated.rows.length) {
            return res.status(404).json({ success: false, message: 'Goog post not found' });
        }

        const result = await googReadRepository.fetchPostById(userId, id);
        return res.status(200).json({ success: true, data: normalizePost(result.rows[0]) });
    } catch (error) {
        console.error('Error updating Goog post:', error);
        return res.status(500).json({ success: false, message: 'Server error updating Goog post' });
    }
};

const deletePost = async (req, res) => {
    try {
        await googMutationRepository.ensureGoogSchema();
        const userId = req.user.id;
        const id = parseInt(req.params.id, 10);
        const result = await googMutationRepository.deletePost({ id, userId });
        if (!result.rows.length) {
            return res.status(404).json({ success: false, message: 'Goog post not found' });
        }
        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('Error deleting Goog post:', error);
        return res.status(500).json({ success: false, message: 'Server error deleting Goog post' });
    }
};

const adminTogglePost = async (req, res) => {
    try {
        await googMutationRepository.ensureGoogSchema();
        const id = parseInt(req.params.id, 10);
        const result = await pool.query(
            `UPDATE goog_posts SET is_active = NOT is_active, updated_at = NOW()
             WHERE id = $1 RETURNING id, is_active`,
            [id]
        );
        if (!result.rows.length) {
            return res.status(404).json({ success: false, message: 'Post not found' });
        }
        return res.json({ success: true, id: result.rows[0].id, is_active: result.rows[0].is_active });
    } catch (error) {
        console.error('Error toggling Goog post:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

module.exports = {
    adminTogglePost,
    createPost,
    deletePost,
    updatePost,
};
