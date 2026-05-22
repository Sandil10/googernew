const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { getUserSubscriptionFeatures } = require('../utils/planLimits');

const TENOR_KEY = 'LIVDSRZULELA';
const TENOR_BASE = 'https://g.tenor.com/v1';
const TENOR_PARAMS = `key=${TENOR_KEY}&limit=25&media_filter=minimal&contentfilter=high`;

const mapTenorResult = (r) => {
    const media = r.media?.[0] || {};
    const url = media.tinygif?.url || media.gif?.url || '';
    return { id: r.id, url, title: r.title || r.content_description || '' };
};

router.use(authMiddleware);

router.get('/trending', async (req, res) => {
    try {
        const features = await getUserSubscriptionFeatures(req.user.id);
        if (!features.chat_stickers) return res.status(403).json({ error: 'Stickers require Plan 02' });

        const resp = await fetch(`${TENOR_BASE}/trending?${TENOR_PARAMS}`);
        const json = await resp.json();
        res.json({ stickers: (json.results || []).map(mapTenorResult).filter(s => s.url) });
    } catch (err) {
        console.error('[stickers] trending error:', err.message);
        res.status(500).json({ error: 'Failed to load stickers' });
    }
});

router.get('/search', async (req, res) => {
    try {
        const features = await getUserSubscriptionFeatures(req.user.id);
        if (!features.chat_stickers) return res.status(403).json({ error: 'Stickers require Plan 02' });

        const q = String(req.query.q || 'happy').slice(0, 50);
        const resp = await fetch(`${TENOR_BASE}/search?q=${encodeURIComponent(q)}&${TENOR_PARAMS}`);
        const json = await resp.json();
        res.json({ stickers: (json.results || []).map(mapTenorResult).filter(s => s.url) });
    } catch (err) {
        console.error('[stickers] search error:', err.message);
        res.status(500).json({ error: 'Failed to load stickers' });
    }
});

module.exports = router;
