const pool = require('../../config/database');
const productReadRepository = require('./productReadRepository');
const productReadService = require('./productReadService');
const googReadRepository = require('../feed/googReadRepository');
const googReadService = require('../feed/googReadService');
const { SHARE_ITEM_TYPES } = require('../../shared/contracts/serviceContracts');

const resolveSharedProfile = async (userTarget) => {
    const isNumericId = /^\d+$/.test(userTarget);
    let userResult = null;

    if (isNumericId) {
        userResult = await pool.query(
            `SELECT id, user_id, username, full_name, bio, profile_picture, email, created_at
             FROM users
             WHERE (id = $1 OR user_id = $2)
               AND COALESCE(is_deactivated, false) = false
               AND COALESCE(status, 'Active') <> 'Deactivated'
             LIMIT 1`,
            [Number(userTarget), userTarget]
        );
    }

    if (!userResult?.rows?.length) {
        userResult = await pool.query(
            `SELECT id, user_id, username, full_name, bio, profile_picture, email, created_at
             FROM users
             WHERE LOWER(username) = LOWER($1)
               AND COALESCE(is_deactivated, false) = false
               AND COALESCE(status, 'Active') <> 'Deactivated'
             LIMIT 1`,
            [userTarget]
        );
    }

    return userResult?.rows?.[0] || null;
};

const resolveProfileByShortCode = async (decodedShareCode) => {
    if (!/^[0-9A-Za-z]{4,16}$/.test(decodedShareCode)) return null;

    const profileResult = await pool.query(
        `SELECT id, user_id, username, full_name, bio, profile_picture, email, created_at
         FROM users
         WHERE COALESCE(is_deactivated, false) = false
           AND COALESCE(status, 'Active') <> 'Deactivated'`
    );

    for (const profile of profileResult.rows || []) {
        const usernameCode = productReadRepository.buildShortShareCode('u', profile.username || '');
        const userIdCode = productReadRepository.buildShortShareCode('u', profile.user_id || '');
        const idCode = productReadRepository.buildShortShareCode('u', profile.id);
        if ([usernameCode, userIdCode, idCode].includes(decodedShareCode)) {
            return profile;
        }
    }

    return null;
};

const resolveGoogByShareCode = async (decodedShareCode) => {
    await googReadRepository.ensureGoogSchema();
    await googReadRepository.ensureGoogShareCodes();

    const googByCode = await pool.query('SELECT id, share_code FROM goog_posts');
    const matchedGoog = (googByCode.rows || []).find((row) => {
        const storedCode = String(row.share_code || '').trim();
        return storedCode === decodedShareCode || googReadRepository.buildShortShareCode('g', row.id) === decodedShareCode;
    });

    let matchedGoogId = matchedGoog?.id ?? null;
    if (matchedGoogId == null) {
        const aliasResult = await pool.query(
            `SELECT goog_id
             FROM goog_share_aliases
             WHERE LOWER(alias_code) = LOWER($1)
             LIMIT 1`,
            [decodedShareCode]
        );
        matchedGoogId = aliasResult.rows[0]?.goog_id ?? null;
    }

    if (matchedGoogId == null) return null;
    const result = await googReadRepository.fetchPostById(null, Number(matchedGoogId));
    return result.rows[0] ? googReadService.normalizePost(result.rows[0]) : null;
};

const resolveAdByShortCode = async (decodedShareCode) => {
    const adByCode = await pool.query('SELECT id, ad_id, share_code FROM ads');
    const matchedAd = (adByCode.rows || []).find((row) => (
        String(row.share_code || '').trim().toLowerCase() === String(decodedShareCode || '').trim().toLowerCase() ||
        productReadRepository.buildShortShareCode('a', row.ad_id || '') === decodedShareCode ||
        productReadRepository.buildShortShareCode('a', row.id || '') === decodedShareCode
    ));

    if (!matchedAd?.ad_id) return null;
    const payload = await productReadService.getAdPublic(matchedAd.ad_id);
    return payload.ad || null;
};

const getUnifiedShareItem = async (req, res) => {
    try {
        const { shareCode } = req.params;
        if (!shareCode) {
            return res.status(400).json({ success: false, message: 'Missing share code' });
        }

        const decodedShareCode = decodeURIComponent(String(shareCode)).trim();
        const googMatch = decodedShareCode.match(/^goog-(\d+)$/i);
        const adMatch = decodedShareCode.match(/^ad-(.+)$/i);

        const profileByShortCode = await resolveProfileByShortCode(decodedShareCode);
        if (profileByShortCode) {
            return res.status(200).json({ success: true, type: SHARE_ITEM_TYPES.PROFILE, data: profileByShortCode });
        }

        const googByShortCode = await resolveGoogByShareCode(decodedShareCode);
        if (googByShortCode) {
            return res.status(200).json({ success: true, type: SHARE_ITEM_TYPES.GOOG, data: googByShortCode });
        }

        const adByShortCode = await resolveAdByShortCode(decodedShareCode);
        if (adByShortCode) {
            return res.status(200).json({ success: true, type: SHARE_ITEM_TYPES.AD, data: adByShortCode });
        }

        const profileLegacy = await resolveSharedProfile(decodedShareCode);
        if (profileLegacy) {
            return res.status(200).json({ success: true, type: SHARE_ITEM_TYPES.PROFILE, data: profileLegacy });
        }

        if (googMatch) {
            const result = await googReadRepository.fetchPostById(null, parseInt(googMatch[1], 10));
            if (result.rows.length > 0) {
                return res.status(200).json({
                    success: true,
                    type: SHARE_ITEM_TYPES.GOOG,
                    data: googReadService.normalizePost(result.rows[0]),
                });
            }
        }

        if (!googMatch) {
            const adId = adMatch ? adMatch[1] : decodedShareCode;
            try {
                const payload = await productReadService.getAdPublic(adId);
                if (payload?.ad) {
                    return res.status(200).json({ success: true, type: SHARE_ITEM_TYPES.AD, data: payload.ad });
                }
            } catch {}
        }

        if (!adMatch && !googMatch) {
            try {
                const payload = await productReadService.getProductByCodePublic(decodedShareCode);
                if (payload?.product) {
                    return res.status(200).json({ success: true, type: SHARE_ITEM_TYPES.PRODUCT, data: payload.product });
                }
            } catch {}
        }

        if (!adMatch && !googMatch && /^\d+$/.test(decodedShareCode)) {
            const result = await googReadRepository.fetchPostById(null, parseInt(decodedShareCode, 10));
            if (result.rows.length > 0) {
                return res.status(200).json({
                    success: true,
                    type: SHARE_ITEM_TYPES.GOOG,
                    data: googReadService.normalizePost(result.rows[0]),
                });
            }
        }

        return res.status(404).json({ success: false, message: 'Item not found' });
    } catch (error) {
        console.error('[marketplace] getUnifiedShareItem error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error',
            error: String(error?.message || error),
        });
    }
};

module.exports = {
    getUnifiedShareItem,
};
