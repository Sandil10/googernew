const productReadService = require('./productReadService');

const getMarketItemById = async (req, res) => {
    try {
        return res.status(200).json(await productReadService.getMarketItemById(req.params.id));
    } catch (error) {
        console.error('getMarketItemById error:', error);
        return res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : 'Server error' });
    }
};

const getMarketItemByCode = async (req, res) => {
    try {
        return res.status(200).json(await productReadService.getMarketItemByCode(req.params.code));
    } catch (error) {
        console.error('getMarketItemByCode error:', error);
        return res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : 'Server error' });
    }
};

const getAdPublic = async (req, res) => {
    try {
        return res.status(200).json(await productReadService.getAdPublic(req.params.id));
    } catch (error) {
        console.error('getAdPublic error:', error);
        return res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : 'Server error' });
    }
};

const getProductByCodePublic = async (req, res) => {
    try {
        return res.status(200).json(await productReadService.getProductByCodePublic(req.params.shareCode));
    } catch (error) {
        console.error('getProductByCodePublic error:', error);
        return res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : 'Server error' });
    }
};

module.exports = {
    getAdPublic,
    getMarketItemByCode,
    getMarketItemById,
    getProductByCodePublic,
};
