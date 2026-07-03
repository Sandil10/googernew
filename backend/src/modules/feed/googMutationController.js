const googMutationService = require('./googMutationService');

const adminTogglePost = (req, res) => googMutationService.adminTogglePost(req, res);
const createPost = (req, res) => googMutationService.createPost(req, res);
const deletePost = (req, res) => googMutationService.deletePost(req, res);
const updatePost = (req, res) => googMutationService.updatePost(req, res);

module.exports = {
    adminTogglePost,
    createPost,
    deletePost,
    updatePost,
};
