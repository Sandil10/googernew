const verificationService = require('./verificationService');

const submitVerification = async (req, res) => {
    try {
        const result = await verificationService.submitVerification({
            body: req.body,
            files: req.files,
            userId: req.user.id,
        });
        return res.status(200).json(result);
    } catch (error) {
        console.error('submitVerification error:', error);
        return res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : 'Failed to submit verification.' });
    }
};

const getVerificationStatus = async (req, res) => {
    try {
        const verification = await verificationService.getVerificationStatus(req.user.id);
        return res.status(200).json({ success: true, verification });
    } catch (error) {
        console.error('getVerificationStatus error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch verification status.' });
    }
};

const adminGetAll = async (req, res) => {
    try {
        const verifications = await verificationService.adminGetAll({
            actorUserId: req.user.id,
            status: req.query.status,
        });
        return res.status(200).json({ success: true, verifications });
    } catch (error) {
        console.error('adminGetAll verifications error:', error);
        return res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : 'Failed to fetch verifications.' });
    }
};

const adminReview = async (req, res) => {
    try {
        const result = await verificationService.adminReview({
            action: req.body.action,
            actorUserId: req.user.id,
            rejectionReason: req.body.rejectionReason,
            verificationId: req.params.id,
        });
        return res.status(200).json(result);
    } catch (error) {
        console.error('adminReview verification error:', error);
        return res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : 'Failed to update verification.' });
    }
};

module.exports = {
    adminGetAll,
    adminReview,
    getVerificationStatus,
    submitVerification,
};
