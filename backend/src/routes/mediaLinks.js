const express = require('express');
const dns = require('node:dns');
const net = require('node:net');
const http = require('node:http');
const https = require('node:https');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { saveUploadedFile } = require('../modules/media/mediaStorageService');

// "Add Media Link" in Add Listing: the seller pastes any image link — a
// direct picture, a Google/Yahoo/Bing image result, or a Facebook/Instagram/
// any page share link. We find the picture behind it, download it and store
// our own copy, so the listing keeps working after the source link expires.

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 10000;
const MAX_REDIRECTS = 5;
const CRAWLER_UA = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 GoogerLinkImport/1.0 (+https://googer.site)';

// Never let a pasted link reach this server's own network.
const isPrivateAddress = (address) => {
    if (net.isIPv4(address)) {
        const [a, b] = address.split('.').map(Number);
        return a === 0 || a === 10 || a === 127 || a >= 224
            || (a === 100 && b >= 64 && b <= 127)
            || (a === 169 && b === 254)
            || (a === 172 && b >= 16 && b <= 31)
            || (a === 192 && b === 168)
            || (a === 198 && (b === 18 || b === 19));
    }
    const v6 = address.toLowerCase();
    if (v6.startsWith('::ffff:')) return isPrivateAddress(v6.slice(7));
    return v6 === '::' || v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd')
        || v6.startsWith('fe8') || v6.startsWith('fe9') || v6.startsWith('fea') || v6.startsWith('feb');
};

// Checked at connect time, so a DNS answer can't change between check and use.
const safeLookup = (hostname, options, callback) => {
    dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
        if (err) return callback(err);
        const list = Array.isArray(addresses) ? addresses : [{ address: addresses, family: 4 }];
        if (!list.length || list.some((a) => isPrivateAddress(a.address))) {
            return callback(new Error('Link points to a private address'));
        }
        if (options && options.all) return callback(null, list);
        return callback(null, list[0].address, list[0].family);
    });
};

const fetchLimited = (url, { maxBytes, accept, ua = BROWSER_UA }, redirects = 0) => new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(url); } catch { return reject(new Error('Invalid link')); }
    if (!['http:', 'https:'].includes(parsed.protocol)) return reject(new Error('Only http and https links work'));
    if (parsed.port && !['80', '443'].includes(parsed.port)) return reject(new Error('Unsupported link port'));
    // Node skips `lookup` for IP-literal hosts, so check those here.
    const host = parsed.hostname.replace(/^\[|\]$/g, '');
    if (net.isIP(host) && isPrivateAddress(host)) return reject(new Error('Link points to a private address'));
    if (/^localhost$|\.localhost$|\.internal$|\.local$/i.test(host)) return reject(new Error('Link points to a private address'));

    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.get(parsed, {
        lookup: safeLookup,
        timeout: TIMEOUT_MS,
        headers: {
            'User-Agent': ua,
            Accept: accept,
            'Accept-Language': 'en-US,en;q=0.9',
        },
    }, (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location) {
            res.resume();
            if (redirects >= MAX_REDIRECTS) return reject(new Error('Too many redirects'));
            const next = new URL(res.headers.location, parsed).toString();
            return resolve(fetchLimited(next, { maxBytes, accept, ua }, redirects + 1));
        }
        if (status < 200 || status >= 300) {
            res.resume();
            return reject(new Error(`The link answered ${status}`));
        }
        const chunks = [];
        let size = 0;
        res.on('data', (chunk) => {
            size += chunk.length;
            if (size > maxBytes) {
                req.destroy(new Error('File is too large'));
                return;
            }
            chunks.push(chunk);
        });
        res.on('end', () => resolve({
            url: parsed.toString(),
            contentType: String(res.headers['content-type'] || '').toLowerCase(),
            body: Buffer.concat(chunks),
        }));
        res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('The link took too long')));
    req.on('error', reject);
});

const sniffImageType = (buf) => {
    if (!buf || buf.length < 12) return null;
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
    if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
    if (buf.slice(0, 4).toString('ascii') === 'GIF8') return 'image/gif';
    if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
    if (buf.slice(4, 8).toString('ascii') === 'ftyp' && /avif|avis|heic|heix|mif1/.test(buf.slice(8, 12).toString('ascii'))) {
        return buf.slice(8, 12).toString('ascii').startsWith('avi') ? 'image/avif' : 'image/heic';
    }
    return null;
};

// Image-search result pages carry the real picture in a query parameter.
const unwrapSearchLink = (raw) => {
    try {
        const u = new URL(raw);
        for (const key of ['imgurl', 'mediaurl', 'img_url', 'imgrefurl_img', 'image_url']) {
            const v = u.searchParams.get(key);
            if (v && /^https?:\/\//i.test(v)) return v;
        }
    } catch { /* not a URL */ }
    return raw;
};

const decodeEntities = (s) => String(s || '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\\u0026/g, '&').replace(/\\\//g, '/');

const findPageImage = (html, baseUrl) => {
    const metas = html.match(/<meta\b[^>]*>/gi) || [];
    const wanted = ['og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src'];
    for (const key of wanted) {
        for (const tag of metas) {
            const name = (tag.match(/\b(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i) || [])[1];
            if (!name || name.toLowerCase() !== key) continue;
            const content = (tag.match(/\bcontent\s*=\s*["']([^"']+)["']/i) || [])[1];
            if (content) {
                try { return new URL(decodeEntities(content), baseUrl).toString(); } catch { /* keep looking */ }
            }
        }
    }
    const linkTag = html.match(/<link\b[^>]*rel\s*=\s*["']image_src["'][^>]*>/i);
    const href = linkTag && (linkTag[0].match(/\bhref\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (href) {
        try { return new URL(decodeEntities(href), baseUrl).toString(); } catch { /* none */ }
    }
    return null;
};

const IMAGE_ACCEPT = 'image/avif,image/webp,image/png,image/jpeg,image/gif,image/*;q=0.8';

const RAW_VIDEO_ERROR = 'Direct video files can\'t be added by link — paste a YouTube, TikTok, Facebook, Instagram or Vimeo video link';
const RAW_VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogg|ogv|avi|mkv|mpeg|mpg|3gp|flv|wmv)(\?|#|$)/i;

const viaMicrolink = async (link) => {
    const r = await fetchLimited(`https://api.microlink.io/?url=${encodeURIComponent(link)}`, {
        maxBytes: 512 * 1024,
        accept: 'application/json',
    });
    const json = JSON.parse(r.body.toString('utf8'));
    const url = json?.data?.image?.url;
    return typeof url === 'string' && /^https?:\/\//i.test(url) ? url : null;
};

// A normal browser agent first (Wikimedia and most sites want one); social
// sites such as Facebook/Instagram only show the picture to link crawlers.
const fetchPage = async (url) => {
    const opts = { maxBytes: MAX_IMAGE_BYTES, accept: `${IMAGE_ACCEPT},text/html;q=0.7,*/*;q=0.5` };
    let first;
    try {
        first = await fetchLimited(url, opts);
        if (sniffImageType(first.body)) return first;
        if (first.contentType.includes('html')
            && findPageImage(first.body.slice(0, MAX_HTML_BYTES).toString('utf8'), first.url)) return first;
    } catch (err) {
        first = { error: err };
    }
    try {
        return await fetchLimited(url, { ...opts, ua: CRAWLER_UA });
    } catch (err) {
        if (first.error) throw first.error;
        return first;
    }
};

const fetchImage = async (url) => {
    try {
        const img = await fetchLimited(url, { maxBytes: MAX_IMAGE_BYTES, accept: IMAGE_ACCEPT });
        if (sniffImageType(img.body)) return img;
    } catch { /* retry below */ }
    return fetchLimited(url, { maxBytes: MAX_IMAGE_BYTES, accept: IMAGE_ACCEPT, ua: CRAWLER_UA });
};

const fetchJson = async (url) => {
    const r = await fetchLimited(url, { maxBytes: 512 * 1024, accept: 'application/json' });
    return JSON.parse(r.body.toString('utf8'));
};

// Video pages we can play in the product (same set the apps embed):
// YouTube, TikTok, Vimeo, Instagram reels, Facebook videos/reels.
const videoLinkInfo = (raw) => {
    let u;
    try { u = new URL(raw); } catch { return null; }
    const host = u.hostname.toLowerCase().replace(/^www\.|^m\./, '');
    const parts = u.pathname.split('/').filter(Boolean);
    if (host === 'youtu.be' || host.endsWith('youtube.com')) {
        const id = host === 'youtu.be'
            ? parts[0]
            : (u.searchParams.get('v') || (['shorts', 'embed', 'live'].includes(parts[0]) ? parts[1] : ''));
        return id && /^[A-Za-z0-9_-]{6,}$/.test(id) ? { platform: 'youtube', id } : { platform: 'youtube', id: null };
    }
    if (host.endsWith('tiktok.com')) return { platform: 'tiktok' };
    if (host.endsWith('vimeo.com')) return { platform: 'vimeo' };
    if (host.endsWith('instagram.com') && ['reel', 'reels', 'tv'].includes(parts[0])) return { platform: 'instagram' };
    if ((host.endsWith('facebook.com') || host === 'fb.watch')
        && /\/videos\/|\/watch|[?&]v=|fb\.watch|\/reel\//i.test(raw)) return { platform: 'facebook' };
    if (host.endsWith('dailymotion.com') || host === 'dai.ly') return { platform: 'dailymotion' };
    return null;
};

// The picture shown for a video link (its thumbnail).
const videoThumbnailUrl = async (link, info) => {
    if (info.platform === 'youtube') {
        if (!info.id) throw new Error('That YouTube link has no video in it');
        return `https://img.youtube.com/vi/${info.id}/hqdefault.jpg`;
    }
    const oembed = {
        tiktok: `https://www.tiktok.com/oembed?url=${encodeURIComponent(link)}`,
        vimeo: `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(link)}`,
        dailymotion: `https://www.dailymotion.com/services/oembed?url=${encodeURIComponent(link)}`,
    }[info.platform];
    if (oembed) {
        try {
            const j = await fetchJson(oembed);
            if (typeof j?.thumbnail_url === 'string') return j.thumbnail_url;
        } catch { /* fall back to the page picture */ }
    }
    return null;
};

const findLinkedPicture = async (first) => {
    let imageUrl = null;
    let pageError = null;
    try {
        const page = await fetchPage(first);
        const direct = sniffImageType(page.body);
        if (direct) return { direct: { buffer: page.body, mimetype: direct } };
        if (page.contentType.startsWith('video/')) throw new Error(RAW_VIDEO_ERROR);
        if (page.contentType.includes('html')) {
            const html = page.body.slice(0, MAX_HTML_BYTES).toString('utf8');
            imageUrl = findPageImage(html, page.url);
            if (!imageUrl) {
                // A redirect may have landed on an image-search page.
                const unwrapped = unwrapSearchLink(page.url);
                if (unwrapped !== page.url) imageUrl = unwrapped;
            }
        }
    } catch (err) {
        if (err.message === RAW_VIDEO_ERROR || /private address|port/i.test(err.message)) throw err;
        pageError = err;
    }
    // Instagram posts/reels: the public embed page carries the picture.
    if (!imageUrl) {
        try {
            const u = new URL(first);
            const m = u.pathname.match(/^\/(?:[^/]+\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
            if (/(^|\.)instagram\.com$/i.test(u.hostname) && m) {
                const kind = m[1] === 'reels' ? 'reel' : m[1];
                const embed = await fetchLimited(`https://www.instagram.com/${kind}/${m[2]}/embed/captioned/`, {
                    maxBytes: MAX_HTML_BYTES,
                    accept: 'text/html',
                });
                const html = embed.body.toString('utf8');
                const src = (html.match(/class="EmbeddedMediaImage"[^>]*\bsrc="([^"]+)"/i) || [])[1]
                    || (html.match(/\\?"display_url\\?"\s*:\s*\\?"([^"\\]+(?:\\\/[^"\\]+)*)/) || [])[1];
                if (src) imageUrl = decodeEntities(src);
            }
        } catch { /* fall through */ }
    }
    // Pages that hide their picture behind a login wall: ask microlink — the
    // service the web form already uses for link previews.
    if (!imageUrl) {
        try {
            imageUrl = await viaMicrolink(first);
        } catch { /* fall through */ }
    }
    if (!imageUrl) throw pageError && !/answered 404/.test(pageError.message) ? pageError : new Error('No picture was found at that link');
    return { imageUrl };
};

// Facebook sends every logged-out request for a post, photo or share link to
// its login page (checked against public pages too), so the picture behind a
// Facebook post link can't be read by any server. The photo's own image
// address (…fbcdn.net) is a normal picture and works, so say exactly that.
const FACEBOOK_POST_ERROR = 'Facebook only shows this post to logged-in people, so its picture can\'t be taken from the post link. '
    + 'On Facebook, open the photo, long-press it (or right-click) and choose "Copy image address", then paste that link here — '
    + 'or save the photo and use Upload Media.';

const isFacebookPageLink = (raw) => {
    try {
        const host = new URL(raw).hostname.toLowerCase();
        return /(^|\.)(facebook\.com|fb\.com|fb\.me|fb\.watch)$/.test(host);
    } catch {
        return false;
    }
};

// Any link → { buffer, mimetype, video }. Image links give the picture;
// video page links give the video's thumbnail and `video: true`. Raw video
// files are refused — only video page links can be added.
const resolveLink = async (link) => {
    try {
        return await resolveLinkInner(link);
    } catch (err) {
        // Facebook post / photo / share links (not its fbcdn image addresses).
        if (isFacebookPageLink(unwrapSearchLink(link.trim())) && !/private address|port|Direct video/i.test(err.message)) {
            throw new Error(FACEBOOK_POST_ERROR);
        }
        throw err;
    }
};

const resolveLinkInner = async (link) => {
    const first = unwrapSearchLink(link.trim());
    if (RAW_VIDEO_EXT.test(new URL(first).pathname)) throw new Error(RAW_VIDEO_ERROR);

    const video = videoLinkInfo(first);
    let imageUrl = video ? await videoThumbnailUrl(first, video) : null;
    if (!imageUrl) {
        const found = await findLinkedPicture(first);
        if (found.direct) return { ...found.direct, video: false };
        imageUrl = found.imageUrl;
    }

    const img = await fetchImage(imageUrl);
    const type = sniffImageType(img.body);
    if (!type) throw new Error('The picture at that link could not be read');
    return { buffer: img.body, mimetype: type, video: Boolean(video) };
};

const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp', 'image/avif': '.avif', 'image/heic': '.heic' };

router.post('/import-image-link', authMiddleware, async (req, res) => {
    const link = String(req.body?.url || '').trim();
    if (!/^https?:\/\//i.test(link) || link.length > 4000) {
        return res.status(400).json({ success: false, message: 'Paste a full link starting with http' });
    }
    try {
        const { buffer, mimetype, video } = await resolveLink(link);
        const url = await saveUploadedFile({
            buffer,
            mimetype,
            size: buffer.length,
            originalname: `link-${Date.now()}${EXT[mimetype] || '.jpg'}`,
        }, 'products');
        return res.json({ success: true, url, video, data: { url, video } });
    } catch (err) {
        return res.status(422).json({
            success: false,
            message: err?.message || 'Could not get a picture from that link',
        });
    }
});
module.exports = router;
