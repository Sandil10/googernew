const authController = require('../../controllers/authController');

const register = (req, res) => authController.register(req, res);
const login = (req, res) => authController.login(req, res);
const getWallet = (req, res) => authController.getWallet(req, res);
const updateProfile = (req, res) => authController.updateProfile(req, res);
const reportUser = (req, res) => authController.reportUser(req, res);

module.exports = {
    getWallet,
    login,
    register,
    reportUser,
    updateProfile,
};
