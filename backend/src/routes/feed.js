const express = require('express');
const router = express.Router();
const { feedController } = require('../modules/feed');
const { createPublicResponseCache } = require('../middleware/publicResponseCache');

router.get(
    '/home',
    createPublicResponseCache({
        ttlMs: Number(process.env.PUBLIC_HOME_FEED_CACHE_TTL_MS || 5000),
        keyPrefix: 'feed-home',
        anonymousOnly: true,
    }),
    feedController.getHomeFeed
);

module.exports = router;
