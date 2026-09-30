const crypto = require('node:crypto');
const pool = require('../config/database');

// Admin-editable chat settings, shared by every package and every client
// (web, mobile, backend). Stored in admin_customization_settings.
const LIMITS_KEY = 'chat_media_limits';
const STICKERS_KEY = 'custom_stickers';

const DEFAULT_LIMITS = Object.freeze({
    voice_max_seconds: 120,   // voice note length
    media_per_day: 10,        // photos + videos per 24h
    photo_max_mb: 3,          // photo size
    video_max_seconds: 60,    // video length
    video_max_mb: 20,         // video size
});

const LIMIT_BOUNDS = {
    voice_max_seconds: [1, 3600],
    media_per_day: [0, 1000],
    photo_max_mb: [0.1, 25],
    video_max_seconds: [1, 3600],
    video_max_mb: [0.5, 100],
};

let tableReady = false;
let limitsCache = null;
let limitsCacheAt = 0;
const CACHE_MS = 10 * 1000;

const ensureTable = async () => {
    if (tableReady) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS admin_customization_settings (
            setting_key TEXT PRIMARY KEY,
            setting_value JSONB NOT NULL DEFAULT '{}'::jsonb,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    tableReady = true;
};

const readSetting = async (key) => {
    await ensureTable();
    const r = await pool.query('SELECT setting_value FROM admin_customization_settings WHERE setting_key = $1', [key]);
    return r.rows[0]?.setting_value ?? null;
};

const writeSetting = async (key, value) => {
    await ensureTable();
    await pool.query(
        `INSERT INTO admin_customization_settings (setting_key, setting_value, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()`,
        [key, JSON.stringify(value)]
    );
};

const normalizeLimits = (raw = {}) => {
    const out = {};
    for (const [key, fallback] of Object.entries(DEFAULT_LIMITS)) {
        const n = Number(raw?.[key]);
        const [min, max] = LIMIT_BOUNDS[key];
        out[key] = Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
    }
    out.media_per_day = Math.floor(out.media_per_day);
    out.voice_max_seconds = Math.floor(out.voice_max_seconds);
    out.video_max_seconds = Math.floor(out.video_max_seconds);
    return out;
};

const getChatMediaLimits = async () => {
    if (limitsCache && Date.now() - limitsCacheAt < CACHE_MS) return limitsCache;
    try {
        limitsCache = normalizeLimits(await readSetting(LIMITS_KEY) || {});
    } catch (err) {
        console.error('[chat-features] limits read failed:', err.message);
        limitsCache = { ...DEFAULT_LIMITS };
    }
    limitsCacheAt = Date.now();
    return limitsCache;
};

const setChatMediaLimits = async (raw) => {
    const current = await getChatMediaLimits();
    const next = normalizeLimits({ ...current, ...raw });
    await writeSetting(LIMITS_KEY, next);
    limitsCache = next;
    limitsCacheAt = Date.now();
    return next;
};

const getCustomStickers = async () => {
    try {
        const value = await readSetting(STICKERS_KEY);
        const items = Array.isArray(value?.items) ? value.items : [];
        return items.filter((i) => i && i.id && i.url);
    } catch (err) {
        console.error('[chat-features] stickers read failed:', err.message);
        return [];
    }
};

const addCustomSticker = async ({ url, kind, name }) => {
    const items = await getCustomStickers();
    const item = {
        id: crypto.randomUUID(),
        url,
        kind: kind === 'emoji' ? 'emoji' : 'sticker',
        name: String(name || '').trim().slice(0, 40),
        created_at: new Date().toISOString(),
    };
    await writeSetting(STICKERS_KEY, { items: [...items, item] });
    return item;
};

const removeCustomSticker = async (id) => {
    const items = await getCustomStickers();
    const next = items.filter((i) => i.id !== id);
    await writeSetting(STICKERS_KEY, { items: next });
    return next.length !== items.length;
};

// A sticker message whose payload is one of the admin's custom stickers or
// emojis — free for every package.
const isCustomStickerUrl = async (url) => {
    const target = String(url || '').trim();
    if (!target) return false;
    const items = await getCustomStickers();
    return items.some((i) => i.url === target || target.endsWith(i.url));
};

module.exports = {
    DEFAULT_LIMITS,
    getChatMediaLimits,
    setChatMediaLimits,
    getCustomStickers,
    addCustomSticker,
    removeCustomSticker,
    isCustomStickerUrl,
};
