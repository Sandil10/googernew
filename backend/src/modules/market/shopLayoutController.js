const activePublicAdsRepository = require('../ads/activePublicAdsRepository');
const { buildShopLayout } = require('./shopLayoutEngine');

// Products page size both apps request for the first screen of the shop.
const FIRST_PAGE_SIZE = 20;

const fetchJson = async (baseUrl, path, authHeader) => {
    const response = await fetch(`${baseUrl}${path}`, {
        headers: authHeader ? { Authorization: authHeader } : {},
    });
    if (!response.ok) throw new Error(`${path} -> ${response.status}`);
    return response.json();
};

/**
 * GET /api/market/shop-layout
 *
 * Pulls the same product page and ad pool the apps fetch themselves (through
 * this server's own public routes, so the visibility/blocking/targeting rules
 * are exactly what a client would get) and returns one arrangement of them.
 */
exports.getShopLayout = async (req, res) => {
    try {
        const authHeader = req.header('Authorization') || '';
        const viewerId = activePublicAdsRepository.getOptionalViewerId(req);
        const baseUrl = `http://127.0.0.1:${req.socket.localPort}/api`;
        const query = typeof req.query.search === 'string' ? req.query.search.trim() : '';

        const productsQs = new URLSearchParams({
            limit: String(FIRST_PAGE_SIZE),
            offset: '0',
            algorithm: 'recommended',
            status: 'approved',
        });
        if (query) productsQs.set('search', query);

        const [productsPayload, adsPayload] = await Promise.all([
            fetchJson(baseUrl, `/market/products?${productsQs.toString()}`, authHeader),
            fetchJson(baseUrl, `/ads/active-public?limit=50&offset=0&shuffle=${encodeURIComponent(`shop-feed-ads-${viewerId || 'guest'}`)}`, authHeader),
        ]);

        const products = Array.isArray(productsPayload?.data) ? productsPayload.data : [];
        const ads = Array.isArray(adsPayload?.ads) ? adsPayload.ads : [];

        const layout = buildShopLayout({ viewerId, products, ads, query });
        return res.status(200).json({ success: true, data: { viewerId: viewerId || null, ...layout } });
    } catch (error) {
        console.error('getShopLayout error:', error);
        return res.status(500).json({ success: false, message: 'Could not build the shop layout' });
    }
};
