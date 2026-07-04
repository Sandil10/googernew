const homeFeedService = require('./homeFeedService');

const getHomeFeed = async (req, res) => {
    try {
        const result = await homeFeedService.getHomeFeedResult(req);
        if (result.cacheHeader) {
            res.setHeader('X-Home-Feed-Cache', result.cacheHeader);
        }
        return res.status(result.statusCode || 200).json(result.payload);
    } catch (error) {
        console.error('Error fetching home feed:', error);
        return res.status(500).json({ success: false, message: 'Server error fetching home feed' });
    }
};

module.exports = {
    getHomeFeed,
};
