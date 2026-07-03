const shareLookupService = require('./shareLookupService');

const getUnifiedShareItem = (req, res) => shareLookupService.getUnifiedShareItem(req, res);

module.exports = {
    getUnifiedShareItem,
};
