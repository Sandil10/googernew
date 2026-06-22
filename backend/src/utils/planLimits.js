const pool = require('../config/database');
const { getGraceDurationSeconds } = require('./subscriptionRenewal');

// Converts admin-panel expiry fields (ads_expiry_value + ads_expiry_unit) to fractional days.
// Falls back to legacy ads_expiry_days if present.
const toExpiryDays = (extra = {}) => {
    if (extra.ads_expiry_days != null) return Number(extra.ads_expiry_days);
    const value = Number(extra.ads_expiry_value ?? 0);
    if (!value) return null; // no expiry set
    const unit = String(extra.ads_expiry_unit || 'days').toLowerCase();
    if (unit === 'minutes') return value / 1440;
    if (unit === 'hours')   return value / 24;
    return value; // days
};

const FALLBACK = {
    writeGoogLimit: 0,
    googLetterLimit: 0,
    productUploadLimit: 0,
    saveGoogLimit: 0,
    adVideos: false,
    adPhotos: false,
    textMessaging: false,
    voiceCalls: true,
    videoCalls: false,
    chatAutoDeleteDays: 30,
    adsExpiryDays: 30,
    verifiedTick: false,
};

const UNLIMITED = 999999;

const isPlan03Slug = (slug = '') => {
    const normalized = String(slug || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
    return normalized === 'plan03' || normalized === 'plan3' || normalized === '03';
};

/**
 * Returns effective plan limits for a user.
 * Paid active subscription takes priority; otherwise falls back to basic plan.
 */
const getUserPlanLimits = async (userId) => {
    try {
        // Active paid subscription?
        const graceSeconds = getGraceDurationSeconds();
        const paidRes = await pool.query(
            `SELECT sp.slug, sp.googs_limit, sp.verified_tick, sp.extra
             FROM user_plan_subscriptions ups
             JOIN subscription_plans sp ON sp.id = ups.plan_id
             WHERE ups.user_id = $1 AND ups.status = 'active'
               AND (ups.expires_at IS NULL OR ups.expires_at + (($2::text || ' seconds')::interval) > NOW())
             ORDER BY ups.started_at DESC LIMIT 1`,
            [userId, graceSeconds]
        );

        if (paidRes.rows.length > 0) {
            const { slug, googs_limit, verified_tick, extra = {} } = paidRes.rows[0];
            // admin stores color limit as write_goog_limit (labeled "Write Goog (color)")
            // ad limits stored as ad_videos / ad_photos
            const tmStr = String(extra.text_messaging ?? '');
            return {
                writeGoogLimit:       UNLIMITED,
                writeGoogColorLimit:  extra.write_goog_limit       != null ? parseInt(extra.write_goog_limit)       : UNLIMITED,
                googLetterLimit:      extra.goog_letter_limit      != null ? parseInt(extra.goog_letter_limit)      : UNLIMITED,
                productUploadLimit:   extra.product_upload_limit   != null ? parseInt(extra.product_upload_limit)   : UNLIMITED,
                videoAdsSaveLimit:    (extra.ad_videos ?? extra.video_ads_save_limit) != null ? parseInt(extra.ad_videos ?? extra.video_ads_save_limit) : UNLIMITED,
                photoAdsSaveLimit:    (extra.ad_photos ?? extra.photo_ads_save_limit) != null ? parseInt(extra.ad_photos ?? extra.photo_ads_save_limit) : UNLIMITED,
                saveGoogLimit:        parseInt(googs_limit ?? 0),
                adVideos:             (extra.ad_videos ?? 0) > 0,
                adPhotos:             (extra.ad_photos ?? 0) > 0,
                textMessaging:        extra.text_messaging !== false && extra.text_messaging != null,
                chatTextColors:       tmStr.includes('colors'),
                chatStickers:         tmStr.includes('stickers'),
                voiceCalls:           extra.voice_calls !== false,
                videoCalls:           extra.video_calls === true || extra.video_calls === 'true' || extra.video_calls === 1,
                voiceToText:          !!(extra.voice_notes_to_text || extra.voice_to_text || extra.speech_to_text),
                textToVoice:          !!(extra.text_to_voice_note || extra.text_to_voice || extra.tts),
                chatAutoDeleteDays:   extra.chat_auto_delete_days != null ? parseInt(extra.chat_auto_delete_days) : UNLIMITED,
                adsExpiryDays:        toExpiryDays(extra) ?? UNLIMITED,
                verifiedTick:         !!verified_tick,
                rawExtra:             extra
            };
        }

        // Fall back to basic plan from DB
        const basicRes = await pool.query(
            `SELECT googs_limit, verified_tick, extra FROM subscription_plans WHERE slug = 'basic' AND is_active = TRUE LIMIT 1`
        );

        if (basicRes.rows.length > 0) {
            const { googs_limit, verified_tick, extra = {} } = basicRes.rows[0];
            return {
                writeGoogLimit:      parseInt(extra.write_goog_limit      ?? FALLBACK.writeGoogLimit),
                writeGoogColorLimit: 0,
                googLetterLimit:     parseInt(extra.goog_letter_limit     ?? FALLBACK.googLetterLimit),
                productUploadLimit:  parseInt(extra.product_upload_limit  ?? FALLBACK.productUploadLimit),
                videoAdsSaveLimit:   parseInt(extra.ad_videos ?? extra.video_ads_save_limit ?? 0),
                photoAdsSaveLimit:   parseInt(extra.ad_photos ?? extra.photo_ads_save_limit ?? 0),
                saveGoogLimit:       parseInt(googs_limit ?? FALLBACK.saveGoogLimit),
                adVideos:            (extra.ad_videos ?? 0) > 0,
                adPhotos:            (extra.ad_photos ?? 0) > 0,
                textMessaging:       extra.text_messaging !== false && extra.text_messaging != null,
                chatTextColors:      false,
                chatStickers:        false,
                voiceCalls:          extra.voice_calls !== false,
                videoCalls:          extra.video_calls === true || extra.video_calls === 'true' || extra.video_calls === 1,
                voiceToText:         !!(extra.voice_notes_to_text || extra.voice_to_text || extra.speech_to_text),
                textToVoice:         !!(extra.text_to_voice_note || extra.text_to_voice || extra.tts),
                chatAutoDeleteDays:  parseInt(extra.chat_auto_delete_days ?? FALLBACK.chatAutoDeleteDays),
                adsExpiryDays:       toExpiryDays(extra) ?? FALLBACK.adsExpiryDays,
                verifiedTick:        !!verified_tick,
                rawExtra:            extra
            };
        }

        return FALLBACK;
    } catch (err) {
        console.error('[planLimits] getUserPlanLimits error:', err.message);
        return FALLBACK;
    }
};

// Boolean coercion that treats missing as `defaultVal` and accepts "true"/"1"/"on"/"yes"
const asBool = (v, defaultVal = false) => {
    if (v === undefined || v === null || v === '') return defaultVal;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number')  return v !== 0;
    const s = String(v).trim().toLowerCase();
    if (['true', '1', 'on', 'yes', 'y'].includes(s))  return true;
    if (['false', '0', 'off', 'no', 'n'].includes(s)) return false;
    return defaultVal;
};

// Number coercion — null means "unlimited / not set"
const asNum = (v) => {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

/**
 * Returns a fully-normalized feature set for a user, sourced from their
 * active paid plan or the default basic plan. Always returns a complete shape
 * so callers never need to null-check individual keys.
 *
 * All limit values: `null` means "not set / unlimited". Booleans default `false`.
 */
const getUserSubscriptionFeatures = async (userId) => {
    let plan = null;
    let isBasic = true;

    try {
        if (userId) {
            const graceSeconds = getGraceDurationSeconds();
            const paidRes = await pool.query(
                `SELECT sp.slug, sp.googs_limit, sp.verified_tick, sp.extra,
                        sp.badge_color
                 FROM user_plan_subscriptions ups
                 JOIN subscription_plans sp ON sp.id = ups.plan_id
                 WHERE ups.user_id = $1 AND ups.status = 'active'
                   AND (ups.expires_at IS NULL OR ups.expires_at + (($2::text || ' seconds')::interval) > NOW())
                 ORDER BY ups.started_at DESC LIMIT 1`,
                [userId, graceSeconds]
            );
            if (paidRes.rows.length > 0) {
                plan = paidRes.rows[0];
                isBasic = false;
            }
        }

        if (!plan) {
            const basicRes = await pool.query(
                `SELECT slug, googs_limit, verified_tick, extra, badge_color
                 FROM subscription_plans
                 WHERE is_default = TRUE AND is_active = TRUE LIMIT 1`
            );
            if (basicRes.rows.length === 0) {
                const fallback = await pool.query(
                    `SELECT slug, googs_limit, verified_tick, extra, badge_color
                     FROM subscription_plans WHERE slug = 'basic' AND is_active = TRUE LIMIT 1`
                );
                plan = fallback.rows[0] || null;
            } else {
                plan = basicRes.rows[0];
            }
        }
    } catch (err) {
        console.error('[planLimits] getUserSubscriptionFeatures error:', err.message);
    }

    const extra = (plan && plan.extra) ? plan.extra : {};
    const googsLimit = plan ? asNum(plan.googs_limit) : null;

    // For paid plans: if a boolean feature key is absent from extra, default to TRUE
    // (same logic as getUserPlanLimits: `extra.key !== false`).
    // For basic plan: default to FALSE so free users get nothing extra.
    const paidDefault = !isBasic;
    const bool = (val, paidDef, basicDef = false) => {
        if (val === undefined || val === null || val === '') return paidDef ? paidDefault : basicDef;
        return asBool(val, paidDef ? paidDefault : basicDef);
    };

    // Admin stores text_messaging as "colors", "colors,stickers", or boolean
    const tmStr = String(extra.text_messaging ?? '');
    const tmHasColors   = tmStr.includes('colors');
    const tmHasStickers = tmStr.includes('stickers');

    return {
        plan_slug:                plan?.slug || 'basic',
        is_basic:                 isBasic,
        verified_tick:            asBool(plan?.verified_tick, false),
        badge_color:              plan?.badge_color || null,

        // Limits (null = unlimited / not set)
        // For paid plans: write_goog_limit is the COLOR limit (admin labels it "Write Goog (color)")
        // For basic: write_goog_limit is the total write limit
        write_goog_limit:         isBasic ? (asNum(extra.write_goog_limit) ?? googsLimit) : null,
        write_goog_color_limit:   isBasic ? 0 : asNum(extra.write_goog_limit),
        goog_letter_limit:        asNum(extra.goog_letter_limit),
        product_upload_limit:     asNum(extra.product_upload_limit),
        // Admin stores ad limits as ad_videos / ad_photos
        video_ads_save_limit:     asNum(extra.ad_videos ?? extra.video_ads_save_limit),
        photo_ads_save_limit:     asNum(extra.ad_photos ?? extra.photo_ads_save_limit),
        save_goog_limit:          googsLimit,
        ads_expiry_days:          toExpiryDays(extra),

        // Booleans
        free_profile_ad_promo:    bool(extra.free_profile_ad_promo ?? extra.free_promo, false),
        // Admin stores colors/stickers in text_messaging string: "colors" or "colors,stickers"
        chat_text_colors:         isBasic ? false : (extra.chat_text_colors != null ? asBool(extra.chat_text_colors) : tmHasColors),
        chat_stickers:            isBasic ? false : (extra.chat_stickers    != null ? asBool(extra.chat_stickers)    : tmHasStickers),
        text_messaging:           extra.text_messaging !== false && extra.text_messaging != null && extra.text_messaging !== 0,
        voice_calls:              asBool(extra.voice_calls, !isBasic),
        video_calls:              asBool(extra.video_calls, false),
        // Admin stores these as voice_notes_to_text / text_to_voice_note
        voice_to_text:            !!(extra.voice_notes_to_text || extra.voice_to_text || extra.speech_to_text || extra.microphone),
        text_to_voice:            !!(extra.text_to_voice_note || extra.text_to_voice || extra.tts || extra.speech),

        // Strings / numbers
        video_call_quality:       String(extra.video_call_quality || 'sd').toLowerCase(),
        chat_auto_delete_days:    asNum(extra.chat_auto_delete_days),
        chat_auto_delete_value:   asNum(extra.chat_auto_delete_value),
        chat_auto_delete_unit:    extra.chat_auto_delete_lifetime ? 'lifetime' : (extra.chat_auto_delete_unit || null),

        // Raw passthrough
        extra,
    };
};

module.exports = {
    getUserPlanLimits,
    getUserSubscriptionFeatures,
    toExpiryDays,
    isPlan03Slug,
    FALLBACK,
    UNLIMITED,
};
