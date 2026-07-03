const accountRepository = require('./accountRepository');

const validatePassword = (password) => {
    const minLength = 8;
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /\d/.test(password);

    if (!password || password.length < minLength) {
        return { valid: false, message: 'Password must be at least 8 characters long' };
    }
    if (!hasUppercase || !hasLowercase || !hasNumber) {
        return { valid: false, message: 'Password must contain at least 1 uppercase letter, 1 lowercase letter, and 1 number' };
    }

    return { valid: true };
};

const verifyPassword = async (userId, password) => {
    if (!password) {
        const error = new Error('Password is required');
        error.statusCode = 400;
        throw error;
    }

    const user = await accountRepository.getUserPasswordById(userId);
    if (!user) {
        const error = new Error('User not found');
        error.statusCode = 404;
        throw error;
    }

    const isMatch = await accountRepository.comparePassword(password, user.password);
    if (!isMatch) {
        const error = new Error('Incorrect password');
        error.statusCode = 401;
        throw error;
    }

    return { success: true, message: 'Password verified' };
};

const getMySuspension = async (userId) => {
    await accountRepository.ensureSuspensionColumns();
    const suspension = await accountRepository.getSuspensionByUserId(userId);
    if (!suspension) {
        const error = new Error('User not found');
        error.statusCode = 404;
        throw error;
    }
    return { success: true, suspension };
};

const submitSuspensionAppeal = async (userId, body) => {
    await accountRepository.ensureSuspensionColumns();
    const appealText = String(body?.appeal || '').trim();
    const contactEmail = String(body?.contactEmail || '').trim();
    const phoneNumber = String(body?.phoneNumber || '').trim();
    const agreementConfirmed = Boolean(body?.agreementConfirmed);

    if (!appealText) {
        const error = new Error('Appeal message is required');
        error.statusCode = 400;
        throw error;
    }
    if (appealText.length > 2000) {
        const error = new Error('Appeal must be 2000 characters or less');
        error.statusCode = 400;
        throw error;
    }
    if (!contactEmail) {
        const error = new Error('Contact email is required');
        error.statusCode = 400;
        throw error;
    }
    if (!phoneNumber) {
        const error = new Error('Phone number is required');
        error.statusCode = 400;
        throw error;
    }
    if (!agreementConfirmed) {
        const error = new Error('Please confirm the user agreement');
        error.statusCode = 400;
        throw error;
    }

    const current = await accountRepository.getAppealStateByUserId(userId);
    if (!current) {
        const error = new Error('User not found');
        error.statusCode = 404;
        throw error;
    }
    if (!current.is_deactivated) {
        const error = new Error('Account is not suspended');
        error.statusCode = 400;
        throw error;
    }
    if (current.appeal_status === 'pending') {
        const error = new Error('Appeal already submitted and pending review');
        error.statusCode = 409;
        throw error;
    }

    const suspension = await accountRepository.updateSuspensionAppeal(
        userId,
        appealText,
        contactEmail,
        phoneNumber,
        agreementConfirmed
    );

    if (!suspension) {
        const error = new Error('Failed to generate appeal ID');
        error.statusCode = 500;
        throw error;
    }

    return { success: true, suspension };
};

const selfDeactivateAccount = async (userId) => {
    const client = await accountRepository.connect();
    try {
        await accountRepository.ensureSuspensionColumns();
        await client.query('BEGIN');

        const pausedAdsCount = await accountRepository.pauseActiveAdsForUser(client, userId);
        const user = await accountRepository.deactivateUserAccount(client, userId);

        if (!user) {
            const error = new Error('User not found');
            error.statusCode = 404;
            throw error;
        }

        await client.query('COMMIT');
        return { success: true, paused_ads_count: pausedAdsCount, user };
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};

const selfDeleteAccount = async (userId) => {
    const client = await accountRepository.connect();
    try {
        await accountRepository.ensureSuspensionColumns();
        await client.query('BEGIN');

        const pausedAdsCount = await accountRepository.pauseActiveAdsForUser(client, userId);
        const user = await accountRepository.deleteUserAccount(client, userId);

        if (!user) {
            const error = new Error('User not found');
            error.statusCode = 404;
            throw error;
        }

        await client.query('COMMIT');
        return { success: true, paused_ads_count: pausedAdsCount, user };
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};

const checkUsernameAvailability = async (userId, rawUsername) => {
    const normalizedUsername = typeof rawUsername === 'string' ? rawUsername.trim() : '';
    if (!normalizedUsername) {
        const error = new Error('Username is required');
        error.statusCode = 400;
        throw error;
    }

    const existingUsername = await accountRepository.findUsernameConflict(normalizedUsername, userId);
    return {
        success: true,
        available: !existingUsername,
    };
};

const updateShippingAddress = async (userId, shippingAddress) => {
    if (!shippingAddress) {
        const error = new Error('Shipping address is required');
        error.statusCode = 400;
        throw error;
    }

    const result = await accountRepository.updateShippingAddress(userId, shippingAddress);
    if (!result) {
        const error = new Error('User not found');
        error.statusCode = 404;
        throw error;
    }

    return {
        success: true,
        message: 'Shipping address updated successfully',
        shippingAddress: result.shipping_address,
    };
};

const changePassword = async (userId, currentPassword, newPassword) => {
    if (!currentPassword || !newPassword) {
        const error = new Error('Current and new password are required');
        error.statusCode = 400;
        throw error;
    }

    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
        const error = new Error(passwordValidation.message);
        error.statusCode = 400;
        throw error;
    }

    const user = await accountRepository.getUserPasswordById(userId);
    if (!user) {
        const error = new Error('User not found');
        error.statusCode = 404;
        throw error;
    }

    const isMatch = await accountRepository.comparePassword(currentPassword, user.password);
    if (!isMatch) {
        const error = new Error('Current password is incorrect');
        error.statusCode = 401;
        throw error;
    }

    const hashedPassword = await accountRepository.hashPassword(newPassword);
    await accountRepository.updatePassword(userId, hashedPassword);

    return { success: true, message: 'Password changed successfully' };
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
