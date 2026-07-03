const accountService = require('./accountService');

const handleError = (res, error, context, defaultMessage) => {
    const statusCode = error.statusCode || 500;
    if (statusCode === 400 || statusCode === 401 || statusCode === 404 || statusCode === 409) {
        return res.status(statusCode).json({ success: false, message: error.message });
    }

    console.error(`[account] ${context} error:`, error);
    return res.status(500).json({ success: false, message: defaultMessage });
};

const verifyPassword = async (req, res) => {
    try {
        return res.status(200).json(await accountService.verifyPassword(req.user.id, req.body?.password));
    } catch (error) {
        return handleError(res, error, 'verifyPassword', 'Verification failed');
    }
};

const getMySuspension = async (req, res) => {
    try {
        return res.json(await accountService.getMySuspension(req.user.id));
    } catch (error) {
        return handleError(res, error, 'getMySuspension', 'Server error fetching suspension');
    }
};

const submitSuspensionAppeal = async (req, res) => {
    try {
        return res.json(await accountService.submitSuspensionAppeal(req.user.id, req.body));
    } catch (error) {
        return handleError(res, error, 'submitSuspensionAppeal', 'Server error submitting appeal');
    }
};

const selfDeactivateAccount = async (req, res) => {
    try {
        return res.json(await accountService.selfDeactivateAccount(req.user.id));
    } catch (error) {
        return handleError(res, error, 'selfDeactivateAccount', 'Server error deactivating account');
    }
};

const selfDeleteAccount = async (req, res) => {
    try {
        return res.json(await accountService.selfDeleteAccount(req.user.id));
    } catch (error) {
        return handleError(res, error, 'selfDeleteAccount', 'Server error deleting account');
    }
};

const checkUsernameAvailability = async (req, res) => {
    try {
        return res.status(200).json(await accountService.checkUsernameAvailability(req.user.id, req.query.username));
    } catch (error) {
        return handleError(res, error, 'checkUsernameAvailability', 'Server error checking username');
    }
};

const updateShippingAddress = async (req, res) => {
    try {
        return res.status(200).json(await accountService.updateShippingAddress(req.user.id, req.body?.shippingAddress));
    } catch (error) {
        return handleError(res, error, 'updateShippingAddress', 'Server error updating shipping address');
    }
};

const changePassword = async (req, res) => {
    try {
        return res.status(200).json(
            await accountService.changePassword(req.user.id, req.body?.currentPassword, req.body?.newPassword)
        );
    } catch (error) {
        return handleError(res, error, 'changePassword', 'Server error changing password');
    }
};

module.exports = {
    changePassword,
    checkUsernameAvailability,
    getMySuspension,
    selfDeactivateAccount,
    selfDeleteAccount,
    submitSuspensionAppeal,
    updateShippingAddress,
    verifyPassword,
};
