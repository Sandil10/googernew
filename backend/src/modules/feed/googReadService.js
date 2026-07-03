const googReadRepository = require('./googReadRepository');
const { getOptionalUserId } = require('../../shared/auth/optionalUser');
const { toUtcIso } = require('../../shared/time/toUtcIso');

const SHARE_CODE_PATTERN = /^[0-9A-Za-z]{8}$/;

const getGoogHomeScore = (likes, comments, shares) => (
    (Number(likes || 0) * 3)
    + (Number(comments || 0) * 8)
    + (Number(shares || 0) * 15)
);

const getGoogExpansionStage = (views, likes, comments, shares) => {
    const viewCount = Number(views || 0);
    const likeCount = Number(likes || 0);
    const score = getGoogHomeScore(likes, comments, shares);

    let stage = '200';
    let cap = 200;
    let minLikes = 0;
    let canExpand = true;

    if (viewCount < 200) {
        stage = '200';
        cap = 200;
    } else if (likeCount < 25) {
        stage = 'followers';
        cap = 200;
        minLikes = 25;
        canExpand = false;
    } else if (viewCount < 500) {
        stage = '500';
        cap = 500;
        minLikes = 25;
    } else if (score < 60) {
        stage = 'followers';
        cap = 500;
        minLikes = 50;
        canExpand = false;
    } else if (score < 100) {
        stage = '2000';
        cap = 2000;
        minLikes = 50;
    } else if (score <= 200) {
        stage = '10000';
        cap = 10000;
        minLikes = 200;
    } else {
        stage = '100000';
        cap = 100000;
        minLikes = 1000;
    }

    if (viewCount >= 500 && likeCount >= 50 && cap < 2000) {
        stage = '2000';
        cap = 2000;
        minLikes = 50;
        canExpand = true;
    }
    if (viewCount >= 2000 && likeCount >= 200 && cap < 10000) {
        stage = '10000';
        cap = 10000;
        minLikes = 200;
        canExpand = true;
    }
    if (viewCount >= 10000 && likeCount >= 1000 && cap < 100000) {
        stage = '100000';
        cap = 100000;
        minLikes = 1000;
        canExpand = true;
    }

    return {
        canExpand,
        cap,
        minLikes,
        score,
        stage,
    };
};

const getCanonicalGoogShareCode = (row) => {
    const storedCode = String(row?.share_code || '').trim();
    if (SHARE_CODE_PATTERN.test(storedCode)) return storedCode;
    return googReadRepository.buildShortShareCode('g', row?.id, 8);
};

const normalizePost = (row) => ({
    ...(() => {
        const stage = getGoogExpansionStage(row.views_count, row.likes_count, row.comments_count, row.shares_count);
        return {
            home_expansion_stage: stage.stage,
            homeExpansionStage: stage.stage,
            home_expansion_cap: stage.cap,
            homeExpansionCap: stage.cap,
            home_expansion_score: stage.score,
            homeExpansionScore: stage.score,
            home_expansion_min_likes: stage.minLikes,
            homeExpansionMinLikes: stage.minLikes,
            home_can_expand: stage.canExpand,
            homeCanExpand: stage.canExpand,
        };
    })(),
    id: Number(row.id),
    share_code: getCanonicalGoogShareCode(row),
    shareCode: getCanonicalGoogShareCode(row),
    canonical_share_code: getCanonicalGoogShareCode(row),
    canonical_share_path: `/share/${getCanonicalGoogShareCode(row)}`,
    text: row.text,
    textColor: row.text_color || '#FFFFFF',
    createdAt: toUtcIso(row.created_at),
    created_at: toUtcIso(row.created_at),
    updatedAt: toUtcIso(row.updated_at),
    updated_at: toUtcIso(row.updated_at),
    likes: Number(row.likes_count || 0),
    comments: Number(row.comments_count || 0),
    views: Number(row.views_count || 0),
    reposts: 0,
    shares: Number(row.shares_count || 0),
    liked: !!row.user_liked,
    user: {
        id: row.user_id,
        username: row.username || '',
        name: String(row.user_type || '').toLowerCase().replace(/[\s-]+/g, '_') === 'superadmin' || String(row.user_type || '').toLowerCase().replace(/[\s-]+/g, '_') === 'super_admin'
            ? 'Googer Support'
            : String(row.user_type || '').toLowerCase() === 'admin'
                ? (row.username || row.full_name || 'User')
                : (row.full_name || row.username || 'User'),
        img: row.profile_picture || '/assets/images/avatars/avatar-default.jpg',
    },
});

const getPosts = async (req) => {
    await googReadRepository.ensureGoogSchema();
    const userId = getOptionalUserId(req);
    const result = await googReadRepository.fetchPosts(userId);
    return { data: result.rows.map(normalizePost), success: true };
};

const getPostById = async (req) => {
    await googReadRepository.ensureGoogSchema();
    const userId = getOptionalUserId(req);
    const id = parseInt(req.params.id, 10);
    const result = await googReadRepository.fetchPostById(userId, id);

    if (!result.rows.length) {
        const error = new Error('Goog post not found');
        error.statusCode = 404;
        throw error;
    }

    return { data: normalizePost(result.rows[0]), success: true };
};

const getPostPublic = async (req) => {
    await googReadRepository.ensureGoogSchema();
    const id = parseInt(req.params.id, 10);
    const result = await googReadRepository.fetchPostById(null, id);

    if (!result.rows.length) {
        const error = new Error('Goog post not found');
        error.statusCode = 404;
        throw error;
    }

    return { data: normalizePost(result.rows[0]), success: true };
};

const getUserPosts = async (req) => {
    await googReadRepository.ensureGoogSchema();
    const userId = getOptionalUserId(req);
    const targetUserId = parseInt(req.params.userId, 10);
    const result = await googReadRepository.fetchUserPosts(userId, targetUserId);
    return { data: result.rows.map(normalizePost), success: true };
};

const getSavedGoogs = async (req) => {
    await googReadRepository.ensureGoogSchema();
    await googReadRepository.ensureSavedGoogsSchema();
    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
        const error = new Error('Unauthorized');
        error.statusCode = 401;
        throw error;
    }
    const result = await googReadRepository.fetchSavedGoogs(userId);
    return { data: result.rows.map(normalizePost), success: true };
};

const getSavedStatus = async (req) => {
    try {
        await googReadRepository.ensureSavedGoogsSchema();
        const userId = req.user?.id || req.user?.userId;
        if (!userId) return { savedIds: [], success: true };
        const result = await googReadRepository.fetchSavedStatus(userId);
        return { savedIds: result.rows.map((row) => row.goog_id), success: true };
    } catch {
        return { savedIds: [], success: true };
    }
};

module.exports = {
    getPostById,
    getPostPublic,
    getPosts,
    getSavedGoogs,
    getSavedStatus,
    getUserPosts,
    normalizePost,
};
