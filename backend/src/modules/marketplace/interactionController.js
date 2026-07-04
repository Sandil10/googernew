const interactionService = require('./interactionService');

const addComment = (req, res) => interactionService.addComment(req, res);
const collectAdLikeCoin = (req, res) => interactionService.collectAdLikeCoin(req, res);
const deleteComment = (req, res) => interactionService.deleteComment(req, res);
const getAdCoinRewardSettingsPublic = (req, res) => interactionService.getAdCoinRewardSettingsPublic(req, res);
const getComments = (req, res) => interactionService.getComments(req, res);
const getLikes = (req, res) => interactionService.getLikes(req, res);
const getShares = (req, res) => interactionService.getShares(req, res);
const getViews = (req, res) => interactionService.getViews(req, res);
const logAdClick = (req, res) => interactionService.logAdClick(req, res);
const logAdImpression = (req, res) => interactionService.logAdImpression(req, res);
const logShare = (req, res) => interactionService.logShare(req, res);
const logView = (req, res) => interactionService.logView(req, res);
const markAdVideoWatchEligible = (req, res) => interactionService.markAdVideoWatchEligible(req, res);
const toggleLike = (req, res) => interactionService.toggleLike(req, res);
const upsertAdCoinRewardSettings = (req, res) => interactionService.upsertAdCoinRewardSettings(req, res);

module.exports = {
    addComment,
    collectAdLikeCoin,
    deleteComment,
    getAdCoinRewardSettingsPublic,
    getComments,
    getLikes,
    getShares,
    getViews,
    logAdClick,
    logAdImpression,
    logShare,
    logView,
    markAdVideoWatchEligible,
    toggleLike,
    upsertAdCoinRewardSettings,
};
