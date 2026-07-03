const mutationService = require('./mutationService');

const createMarketItem = (req, res) => mutationService.createMarketItem(req, res);
const updateMarketItem = (req, res) => mutationService.updateMarketItem(req, res);
const deleteMarketItem = (req, res) => mutationService.deleteMarketItem(req, res);
const updateMarketItemStatus = (req, res) => mutationService.updateMarketItemStatus(req, res);

module.exports = {
    createMarketItem,
    deleteMarketItem,
    updateMarketItem,
    updateMarketItemStatus,
};
