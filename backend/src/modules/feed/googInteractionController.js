const googInteractionService = require('./googInteractionService');

const addComment = (req, res) => googInteractionService.addComment(req, res);
const checkSubscribe = (req, res) => googInteractionService.checkSubscribe(req, res);
const createReport = (req, res) => googInteractionService.createReport(req, res);
const deleteComment = (req, res) => googInteractionService.deleteComment(req, res);
const getComments = (req, res) => googInteractionService.getComments(req, res);
const toggleLike = (req, res) => googInteractionService.toggleLike(req, res);
const toggleSave = (req, res) => googInteractionService.toggleSave(req, res);
const toggleSubscribe = (req, res) => googInteractionService.toggleSubscribe(req, res);

module.exports = {
    addComment,
    checkSubscribe,
    createReport,
    deleteComment,
    getComments,
    toggleLike,
    toggleSave,
    toggleSubscribe,
};
