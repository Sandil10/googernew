const { URL } = require('url');

const normalizeList = (value) => String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

const getManagedMediaHosts = () => {
    const configured = normalizeList(process.env.MEDIA_MANAGED_HOSTS);
    const builtIn = ['res.cloudinary.com'];
    return Array.from(new Set([...builtIn, ...configured])).map((host) => host.toLowerCase());
};

const getManagedMediaUrlPrefixes = () => {
    const configured = normalizeList(process.env.MEDIA_MANAGED_URL_PREFIXES);
    const builtIn = ['/uploads/', '/upload/'];
    return Array.from(new Set([...builtIn, ...configured]));
};

const isHttpUrl = (value) => /^https?:\/\//i.test(String(value || '').trim());
const isBlobUrl = (value) => /^blob:/i.test(String(value || '').trim());
const isDataUrl = (value) => /^data:/i.test(String(value || '').trim());

const hostMatches = (hostname, candidate) => hostname === candidate || hostname.endsWith(`.${candidate}`);

const hasManagedPrefix = (text) => getManagedMediaUrlPrefixes().some((prefix) => text.startsWith(prefix));

const isManagedMediaUrl = (value) => {
    const text = String(value || '').trim();
    if (!text || isBlobUrl(text) || isDataUrl(text)) return false;

    if (!isHttpUrl(text)) {
        return hasManagedPrefix(text) || !text.includes('://');
    }

    if (hasManagedPrefix(text)) return true;

    try {
        const parsed = new URL(text);
        const hostname = String(parsed.hostname || '').toLowerCase();
        return getManagedMediaHosts().some((host) => hostMatches(hostname, host));
    } catch {
        return false;
    }
};

const isExternalMediaUrl = (value) => {
    const text = String(value || '').trim();
    return isHttpUrl(text) && !isManagedMediaUrl(text);
};

const classifyAdMediaSource = ({ activeLink, mediaPreview, mediaType }) => {
    const normalizedPreview = String(mediaPreview || '').trim();
    const normalizedLink = String(activeLink || '').trim();
    const normalizedType = String(mediaType || '').toLowerCase();

    const isVideo = normalizedType.includes('video') || /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(normalizedPreview);
    const previewIsExternalUrl = isExternalMediaUrl(normalizedPreview);
    const isLink = (!!normalizedLink && (!normalizedPreview || previewIsExternalUrl)) || previewIsExternalUrl;

    return {
        ad_media_type: isVideo ? 'video' : 'photo',
        ad_source_type: isLink ? 'link' : 'upload',
        previewIsExternalUrl,
    };
};

const escapeSqlRegex = (value) => String(value || '')
    .replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
    .replace(/\//g, '\\/');

const buildManagedMediaSqlPredicate = (columnSql) => {
    const prefixes = getManagedMediaUrlPrefixes()
        .map((prefix) => escapeSqlRegex(prefix))
        .filter(Boolean);
    const hosts = getManagedMediaHosts()
        .map((host) => escapeSqlRegex(host))
        .filter(Boolean);

    const tests = [
        `COALESCE(${columnSql}, '') !~* '^https?://'`,
    ];

    if (prefixes.length > 0) {
        tests.push(`COALESCE(${columnSql}, '') ~* '^(https?://[^/]+)?(${prefixes.join('|')})'`);
    }

    if (hosts.length > 0) {
        tests.push(`COALESCE(${columnSql}, '') ~* '^https?://([^/]+\\.)?(${hosts.join('|')})/'`);
    }

    return `(${tests.join(' OR ')})`;
};

module.exports = {
    buildManagedMediaSqlPredicate,
    classifyAdMediaSource,
    getManagedMediaHosts,
    getManagedMediaUrlPrefixes,
    isBlobUrl,
    isDataUrl,
    isExternalMediaUrl,
    isHttpUrl,
    isManagedMediaUrl,
};
