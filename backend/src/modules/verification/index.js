const verificationController = require('./verificationController');
const verificationRepository = require('./verificationRepository');
const verificationService = require('./verificationService');

module.exports = {
    ...verificationController,
    ...verificationService,
    verificationController,
    verificationRepository,
    verificationService,
};
