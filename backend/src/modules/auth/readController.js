const readService = require('./readService');

const handleError = (res, error, context, defaultMessage) => {
    const statusCode = error.statusCode || 500;
    if (statusCode === 400 || statusCode === 404) {
        return res.status(statusCode).json({ success: false, message: error.message });
    }

    console.error(`[authRead] ${context} error:`, error);
    return res.status(500).json({ success: false, message: defaultMessage });
};

const getUserById = async (req, res) => {
    try {
        return res.status(200).json(await readService.getUserById(req));
    } catch (error) {
        return handleError(res, error, 'getUserById', 'Server error');
    }
};

const getProfile = async (req, res) => {
    try {
        console.log(`[AUTH] Fetching profile for ID: ${req.user.id}`);
        const result = await readService.getProfile(req.user.id);
        console.log(`[DEBUG] Processing profile for ${result.user.username}`);
        return res.status(200).json(result);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        if (statusCode === 404) {
            console.warn(`[AUTH] Profile fetch failed: User with ID ${req.user.id} not found`);
            return res.status(404).json({ success: false, message: error.message });
        }
        console.error('Get profile error:', error);
        return res.status(500).json({
            success: false,
            message: `Server error fetching profile: ${error.message}`,
            error: error.message
        });
    }
};

const getUserByUsername = async (req, res) => {
    try {
        return res.status(200).json(await readService.getUserByUsername(req));
    } catch (error) {
        return handleError(res, error, 'getUserByUsername', 'Server error fetching user');
    }
};

const getBlockedUsers = async (req, res) => {
    try {
        return res.status(200).json(await readService.getBlockedUsers(req.params.id));
    } catch (error) {
        return handleError(res, error, 'getBlockedUsers', 'Server error fetching blocked users');
    }
};

const toggleBlockUser = async (req, res) => {
    try {
        return res.status(200).json(await readService.toggleBlockUser(req.user.id, req.params.id));
    } catch (error) {
        const statusCode = error.statusCode || 500;
        if (statusCode === 400) {
            return res.status(400).json({ success: false, message: error.message });
        }
        console.error('Toggle block error:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

const logProfileView = async (req, res) => {
    try {
        return res.status(200).json(await readService.logProfileView(req));
    } catch (error) {
        return handleError(res, error, 'logProfileView', 'Server error logging profile view');
    }
};

const getProfileViews = async (req, res) => {
    try {
        return res.status(200).json(await readService.getProfileViews(req.params.id));
    } catch (error) {
        return handleError(res, error, 'getProfileViews', 'Server error fetching profile views');
    }
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
