const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');
const upload = require('../config/upload');
const { saveUploadedFile } = require('../modules/media/mediaStorageService');
const settings = require('../utils/chatFeatureSettings');

const STAFF = ['admin', 'superadmin', 'super_admin'];

// The admin panel's backend signs its logins with its own secret, so its
// tokens can't be read here. It checks the admin itself and then calls us
// with the shared server-to-server key instead.
const internalTokens = () => [process.env.INTERNAL_SERVICE_TOKEN, process.env.GOOGER_INTERNAL_SERVICE_TOKEN]
    .flatMap((v) => String(v || '').split(','))
    .map((v) => v.trim())
    .filter(Boolean);
const hasInternalServiceToken = (req) => {
    const provided = String(req.get('x-internal-service-token') || '').trim();
    if (!provided) return false;
    const crypto = require('node:crypto');
    return internalTokens().some((token) => token.length === provided.length
        && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(provided)));
};
const authOrInternal = (req, res, next) => {
    if (hasInternalServiceToken(req)) {
        req.internalService = true;
        return next();
    }
    return authMiddleware(req, res, next);
};

const requireAdmin = async (req, res, next) => {
    if (req.internalService) return next();
    try {
        const r = await pool.query('SELECT user_type FROM users WHERE id = $1', [req.user.id]);
        if (!STAFF.includes(String(r.rows[0]?.user_type || '').toLowerCase())) {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }
        return next();
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Failed to verify admin access' });
    }
};

router.use(authOrInternal);

// Everyone: the limits every chat client enforces, and the admin's custom
// stickers/emojis (free for all packages).
router.get('/limits', async (req, res) => {
    const limits = await settings.getChatMediaLimits();
    // The signed-in member's own sending count, so apps can warn before the
    // picker opens. Receiving is never limited.
    let usage = null;
    if (req.user?.id) {
        try {
            const r = await pool.query(
                `SELECT COUNT(*)::int AS sent, MIN(created_at) AS oldest
                   FROM chat_messages
                  WHERE sender_id = $1
                    AND message_type IN ('image', 'video')
                    AND created_at >= NOW() - INTERVAL '24 hours'
                    AND deleted_for_everyone = FALSE`,
                [req.user.id]
            );
            const sent = Number(r.rows[0]?.sent || 0);
            const oldest = r.rows[0]?.oldest ? new Date(r.rows[0].oldest) : null;
            usage = {
                media_sent_24h: sent,
                media_left: Math.max(0, limits.media_per_day - sent),
                next_slot_at: oldest ? new Date(oldest.getTime() + 24 * 3600 * 1000).toISOString() : null,
            };
        } catch (err) {
            console.error('[chat-features] usage:', err.message);
        }
    }
    res.json({ success: true, limits, usage, data: { limits, usage } });
});

router.get('/custom-stickers', async (req, res) => {
    const items = await settings.getCustomStickers();
    const payload = {
        stickers: items.filter((i) => i.kind !== 'emoji'),
        emojis: items.filter((i) => i.kind === 'emoji'),
    };
    res.json({ success: true, ...payload, data: payload });
});

// Admin only.
router.put('/limits', requireAdmin, async (req, res) => {
    try {
        const limits = await settings.setChatMediaLimits(req.body || {});
        res.json({ success: true, limits });
    } catch (err) {
        console.error('[chat-features] save limits:', err);
        res.status(500).json({ success: false, message: 'Failed to save chat limits' });
    }
});

router.post('/custom-stickers', requireAdmin, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'Choose an image' });
        if (!String(req.file.mimetype || '').startsWith('image/')) {
            return res.status(400).json({ success: false, message: 'Stickers and emojis must be images' });
        }
        if (req.file.size > 1024 * 1024) {
            return res.status(400).json({ success: false, message: 'Keep stickers and emojis under 1 MB' });
        }
        const url = await saveUploadedFile(req.file, 'stickers');
        const item = await settings.addCustomSticker({ url, kind: req.body?.kind, name: req.body?.name });
        res.json({ success: true, item });
    } catch (err) {
        console.error('[chat-features] add sticker:', err);
        res.status(500).json({ success: false, message: 'Failed to add sticker' });
    }
});

router.delete('/custom-stickers/:id', requireAdmin, async (req, res) => {
    const removed = await settings.removeCustomSticker(String(req.params.id || ''));
    res.status(removed ? 200 : 404).json({ success: removed });
});

module.exports = router;
