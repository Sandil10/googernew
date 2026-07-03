const googReadService = require('./googReadService');

const getPosts = async (req, res) => {
    try {
        return res.status(200).json(await googReadService.getPosts(req));
    } catch (error) {
        console.error('Error fetching Goog posts:', error);
        return res.status(500).json({ success: false, message: 'Server error fetching Goog posts' });
    }
};

const getPostById = async (req, res) => {
    try {
        return res.status(200).json(await googReadService.getPostById(req));
    } catch (error) {
        console.error('Error fetching Goog post by id:', error);
        return res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : 'Server error fetching Goog post' });
    }
};

const getPostPublic = async (req, res) => {
    try {
        return res.status(200).json(await googReadService.getPostPublic(req));
    } catch (error) {
        console.error('Error fetching public Goog post:', error);
        return res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : 'Server error fetching public Goog post' });
    }
};

const getUserPosts = async (req, res) => {
    try {
        return res.status(200).json(await googReadService.getUserPosts(req));
    } catch (error) {
        console.error('Error fetching user Goog posts:', error);
        return res.status(500).json({ success: false, message: 'Server error fetching user posts' });
    }
};

const getSavedGoogs = async (req, res) => {
    try {
        return res.json(await googReadService.getSavedGoogs(req));
    } catch (error) {
        console.error('[googs] getSavedGoogs error:', error);
        return res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : 'Failed to get saved googs' });
    }
};

const getSavedStatus = async (req, res) => {
    return res.json(await googReadService.getSavedStatus(req));
};

module.exports = {
    getPostById,
    getPostPublic,
    getPosts,
    getSavedGoogs,
    getSavedStatus,
    getUserPosts,
};
