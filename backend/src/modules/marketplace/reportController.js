const reportService = require('./reportService');

const submitReport = async (req, res) => {
    try {
        const result = await reportService.submitReport(req.params.id, req.user.id, req.body);
        return res.status(201).json(result);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        if (statusCode === 400 || statusCode === 409) {
            return res.status(statusCode).json({ success: false, message: error.message });
        }

        console.error('[market report]', error.message);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

module.exports = {
    submitReport,
};
