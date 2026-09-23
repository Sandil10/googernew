// Share links copied from a platform's own app are short redirect links
// (`vt.tiktok.com/XXXX`, `fb.watch/XXXX`), and the canonical `/video/<id>`
// URL an embed player needs is only reachable by following those redirects.
// The browser can do neither itself: cross-origin redirect chains are opaque
// to it, and the platform oEmbed endpoints send no CORS headers. So the
// resolution has to happen here.

const ALLOWED_HOSTS = [
    'tiktok.com',
    'instagram.com',
    'facebook.com',
    'fb.watch',
    'youtube.com',
    'youtu.be',
];

const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 6000;

const isAllowedUrl = (url) => {
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    return ALLOWED_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
};

const fetchWithTimeout = async (url, options = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
};

// A share link followed far enough lands on the platform's login or consent
// wall, because this request carries no session for it. That page is useless
// to an embed player — pointing one at it renders a blocked/sign-in notice —
// so following stops at the last real permalink instead.
const isAuthWall = (url) => /^\/(login|checkpoint|privacy\/consent|consent|recover|r\.php|accounts\/login)/i.test(url.pathname);

// Redirects are followed one hop at a time and each hop is re-validated: this
// endpoint fetches a caller-supplied URL, so letting a redirect land on an
// arbitrary host would turn it into an SSRF hole into the VPC and the
// instance metadata service.
const followRedirects = async (startUrl) => {
    let current = startUrl;
    for (let hop = 0; hop < MAX_REDIRECTS; hop += 1) {
        let response;
        try {
            response = await fetchWithTimeout(current.toString(), {
                method: 'GET',
                redirect: 'manual',
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GoogerLinkResolver/1.0)' },
            });
        } catch {
            return current;
        }
        if (response.status < 300 || response.status >= 400) return current;
        const location = response.headers.get('location');
        if (!location) return current;
        let next;
        try {
            next = new URL(location, current);
        } catch {
            return current;
        }
        if (!isAllowedUrl(next) || isAuthWall(next)) return current;
        current = next;
    }
    return current;
};

const tiktokVideoIdFrom = (url) => {
    const parts = url.pathname.split('/').filter(Boolean);
    const index = parts.indexOf('video');
    if (index >= 0 && parts[index + 1] && /^\d+$/.test(parts[index + 1])) {
        return parts[index + 1];
    }
    return '';
};

const tiktokOembed = async (url) => {
    try {
        const response = await fetchWithTimeout(
            `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
            { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GoogerLinkResolver/1.0)' } }
        );
        if (!response.ok) return {};
        const data = await response.json();
        const html = String(data?.html || '');
        const videoId = String(data?.embed_product_id || '')
            || (html.match(/data-video-id="(\d+)"/)?.[1] ?? '');
        return { videoId, thumbnail: String(data?.thumbnail_url || '') };
    } catch {
        return {};
    }
};

const resolveShareLink = async (req, res) => {
    const raw = String(req.query.url || '').trim();
    let target;
    try {
        target = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    } catch {
        return res.status(400).json({ success: false, message: 'A valid url is required.' });
    }
    if (!isAllowedUrl(target)) {
        return res.status(400).json({ success: false, message: 'Unsupported link.' });
    }

    const canonical = await followRedirects(target);
    const host = canonical.hostname.toLowerCase().replace(/^www\./, '');
    const isTikTok = host === 'tiktok.com' || host.endsWith('.tiktok.com');

    let videoId = isTikTok ? tiktokVideoIdFrom(canonical) : '';
    let thumbnail = '';
    // oEmbed is asked for the thumbnail even when the id is already in the
    // path: a canonical link always carries the id, so gating the lookup on a
    // missing id meant the poster frame was never fetched for exactly the
    // links that resolve cleanly.
    if (isTikTok) {
        const oembed = await tiktokOembed(canonical.toString());
        if (!videoId) videoId = oembed.videoId || '';
        thumbnail = oembed.thumbnail || '';
    }

    return res.json({
        success: true,
        canonicalUrl: canonical.toString(),
        videoId,
        thumbnail,
    });
};

module.exports = { resolveShareLink };
