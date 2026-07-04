const { saveUploadedFile } = require('../media');
const verificationRepository = require('./verificationRepository');

const assertAdmin = async (userId) => {
    const userType = await verificationRepository.getUserType(userId);
    return userType === 'admin';
};

const normalizeOptional = (value) => value || null;

const extractFile = (files, name) => (Array.isArray(files?.[name]) ? files[name][0] : files?.[name]) || null;

const uploadVerificationAsset = async (file) => {
    if (!file) return null;
    return saveUploadedFile(file, 'verification');
};

const buildVerificationPayload = async (body = {}, files = {}) => {
    const {
        fullName,
        email,
        phone,
        address,
        dateOfBirth,
        country,
        documentType,
        officialWebsite,
        socialLinks,
        newsLinks,
        vatNumber,
        businessWebsite,
    } = body;

    return {
        address: normalizeOptional(address),
        brandProofUrl: await uploadVerificationAsset(extractFile(files, 'brandProof')),
        businessRegUrl: await uploadVerificationAsset(extractFile(files, 'businessReg')),
        businessWebsite: normalizeOptional(businessWebsite),
        companyDocsUrl: await uploadVerificationAsset(extractFile(files, 'companyDocs')),
        country: normalizeOptional(country),
        dateOfBirth: normalizeOptional(dateOfBirth),
        docBackUrl: await uploadVerificationAsset(extractFile(files, 'docBack')),
        docFrontUrl: await uploadVerificationAsset(extractFile(files, 'docFront')),
        documentType,
        email,
        fullName,
        newsLinks: normalizeOptional(newsLinks),
        officialWebsite: normalizeOptional(officialWebsite),
        phone: normalizeOptional(phone),
        socialLinks: normalizeOptional(socialLinks),
        vatNumber: normalizeOptional(vatNumber),
    };
};

const submitVerification = async ({ userId, body = {}, files = {} }) => {
    await verificationRepository.ensureVerificationTable();
    const payload = await buildVerificationPayload(body, files);

    if (!payload.fullName || !payload.email || !payload.documentType) {
        const error = new Error('Full name, email, and document type are required.');
        error.statusCode = 400;
        throw error;
    }

    const existing = await verificationRepository.getVerificationStatusByUserId(userId);
    const isResubmit = Boolean(existing && existing.status === 'Rejected');

    if (existing && existing.status === 'Under Review') {
        const error = new Error('Your verification is already under review.');
        error.statusCode = 409;
        throw error;
    }

    if (existing && existing.status === 'Verified') {
        const error = new Error('Your account is already verified.');
        error.statusCode = 409;
        throw error;
    }

    if (isResubmit) {
        await verificationRepository.updateRejectedVerification(userId, payload);
    } else {
        await verificationRepository.insertVerification(userId, payload);
    }

    await verificationRepository.setUserVerificationStatus(userId, 'Under Review');
    return {
        message: 'Verification submitted successfully. We will review your application within 2-5 business days.',
        success: true,
    };
};

const getVerificationStatus = async (userId) => {
    await verificationRepository.ensureVerificationTable();
    return verificationRepository.getVerificationDetailsByUserId(userId);
};

const adminGetAll = async ({ actorUserId, status }) => {
    await verificationRepository.ensureVerificationTable();
    if (!await assertAdmin(actorUserId)) {
        const error = new Error('Admin access required.');
        error.statusCode = 403;
        throw error;
    }

    return verificationRepository.listVerifications(status);
};

const adminReview = async ({ actorUserId, verificationId, action, rejectionReason }) => {
    await verificationRepository.ensureVerificationTable();
    if (!await assertAdmin(actorUserId)) {
        const error = new Error('Admin access required.');
        error.statusCode = 403;
        throw error;
    }

    if (!['approve', 'reject'].includes(action)) {
        const error = new Error('action must be approve or reject');
        error.statusCode = 400;
        throw error;
    }

    const newStatus = action === 'approve' ? 'Verified' : 'Rejected';
    const updated = await verificationRepository.updateReviewStatus(verificationId, newStatus, rejectionReason);
    if (!updated) {
        const error = new Error('Verification not found');
        error.statusCode = 404;
        throw error;
    }

    const isApproved = newStatus === 'Verified';
    await verificationRepository.syncReviewedUserVerification(updated.user_id, isApproved, newStatus);

    return { status: newStatus, success: true };
};

module.exports = {
    adminGetAll,
    adminReview,
    assertAdmin,
    getVerificationStatus,
    submitVerification,
};
