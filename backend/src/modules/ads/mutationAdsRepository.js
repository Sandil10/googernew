const fs = require('fs');
const path = require('path');
const pool = require('../../config/database');
const readAdsRepository = require('./readAdsRepository');
const savedAdsRepository = require('./savedAdsRepository');
const { isManagedMediaUrl } = require('../media');

const _logError = (label, err) => {
    try {
        const line = `[${new Date().toISOString()}] ${label}: ${err?.message} | code=${err?.code} | detail=${err?.detail} | stack=${(err?.stack || '').split('\n')[1]?.trim()}\n`;
        fs.appendFileSync(path.resolve(__dirname, '../../../../ad_errors.log'), line);
    } catch {}
};

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
const VALID_STATUSES = new Set(['Under Review', 'Pending Approval', 'Approved', 'Active', 'Paused', 'Completed', 'Expired', 'Cancelled', 'Removed']);
const canonicalAdStatus = (status) => {
    if (status === 'Approved') return 'Active';
    return status;
};

const isRawUploadedPhotoVideoAd = (row) => {
    const campaignType = String(row?.campaign_type || row?.campaignType || '').trim().toLowerCase();
    const isPhotoVideo = campaignType === 'photo and video' || campaignType === 'photo & video';
    if (!isPhotoVideo) return false;

    const draft = row?.edit_draft || row?.editDraft || {};
    const activeLink = String(row?.active_link || row?.activeLink || draft.activeLink || draft.active_link || '').trim();
    if (activeLink) return false;

    const mediaPreview = String(row?.media_preview || row?.mediaPreview || '').trim();
    const mediaType = String(row?.media_type || row?.mediaType || '').trim();
    if (!mediaPreview && !mediaType) return false;

    return !/^https?:\/\//i.test(mediaPreview) || isManagedMediaUrl(mediaPreview);
};

const supportsRemainingBudgetRefund = (campaignType) => {
    const normalized = String(campaignType || '').trim().toLowerCase();
    return normalized === 'product promote'
        || normalized === 'photo promote'
        || normalized === 'video promote'
        || normalized === 'photo and video'
        || normalized === 'photo & video';
};

const parseMaybeJson = (value) => {
    if (!value || typeof value !== 'string') return value;
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
};

const isFreePromoDiscount = (value) => {
    const discount = parseMaybeJson(value);
    if (discount == null || discount === '') return false;
    if (typeof discount === 'number') return discount >= 100;
    if (typeof discount === 'string') {
        const parsed = Number(discount);
        return Number.isFinite(parsed) && parsed >= 100;
    }
    const type = String(discount.discount_type || discount.type || '').trim().toLowerCase();
    const amount = Number(discount.discount_value ?? discount.value ?? discount.amount ?? 0);
    return Number.isFinite(amount) && amount >= 100 && (type === 'reach' || type === 'percent' || type === 'percentage' || type === 'free');
};

const isFreeBudgetLockedAd = (row) => {
    if (!supportsRemainingBudgetRefund(row?.campaign_type || row?.campaignType)) return false;
    const draft = row?.edit_draft || row?.editDraft || {};
    const hasFreeMarker = Boolean(
        row?.is_free_promo
        || row?.isFreePromo
        || draft?.isFreePromo
        || draft?.freeAd
        || draft?.free_ad
        || isFreePromoDiscount(row?.promo_discount)
        || isFreePromoDiscount(row?.promoDiscount)
        || isFreePromoDiscount(draft?.promoDiscount)
        || isFreePromoDiscount(draft?.promo_discount)
    );
    return Number(row?.budget || 0) <= 0 || (!Number(row?.wallet_transfer_id || row?.walletTransferId || 0) && hasFreeMarker);
};

const toDateOrNull = (value) => {
    if (!value) return null;
    if (value instanceof Date) return value;
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
};

const buildTimingUpdateState = (existingRow, nextStatus) => {
    const now = new Date();
    const currentStatus = String(existingRow?.status || '').trim();
    const activeStartTime = toDateOrNull(existingRow?.active_start_time || existingRow?.started_at);
    const lastResumedAt = toDateOrNull(existingRow?.last_resumed_at);
    const accumulatedActiveMs = Math.max(0, Number(existingRow?.accumulated_active_ms ?? 0) || 0);

    let nextActiveStartTime = activeStartTime;
    let nextStartedAt = toDateOrNull(existingRow?.started_at) || activeStartTime || null;
    let nextLastResumedAt = toDateOrNull(existingRow?.last_resumed_at);
    let nextPausedAt = toDateOrNull(existingRow?.paused_at);
    let nextAccumulatedActiveMs = accumulatedActiveMs;
    let nextCompletedAt = toDateOrNull(existingRow?.completed_at);

    const consumeCurrentSegment = () => {
        if (!lastResumedAt) return;
        const lastResumeMs = new Date(lastResumedAt).getTime();
        if (!Number.isFinite(lastResumeMs)) return;
        nextAccumulatedActiveMs += Math.max(0, now.getTime() - lastResumeMs);
    };

    if (nextStatus === 'Active') {
        if (!nextActiveStartTime) nextActiveStartTime = now;
        if (!nextStartedAt) nextStartedAt = nextActiveStartTime;
        if (currentStatus !== 'Active') {
            nextLastResumedAt = now;
        } else if (!nextLastResumedAt) {
            nextLastResumedAt = now;
        }
        nextPausedAt = null;
        nextCompletedAt = null;
    } else if (currentStatus === 'Active' && nextStatus === 'Paused') {
        consumeCurrentSegment();
        nextLastResumedAt = null;
        nextPausedAt = now;
    } else if (currentStatus === 'Active' && (nextStatus === 'Completed' || nextStatus === 'Cancelled' || nextStatus === 'Removed')) {
        consumeCurrentSegment();
        nextLastResumedAt = null;
        nextPausedAt = null;
        if (nextStatus === 'Completed') nextCompletedAt = now;
    } else if (currentStatus === 'Paused' && nextStatus === 'Completed') {
        nextPausedAt = null;
        nextCompletedAt = now;
    } else if (currentStatus === 'Paused' && (nextStatus === 'Cancelled' || nextStatus === 'Removed')) {
        nextPausedAt = null;
    }

    return {
        activeStartTime: nextActiveStartTime,
        startedAt: nextStartedAt,
        lastResumedAt: nextLastResumedAt,
        pausedAt: nextPausedAt,
        accumulatedActiveMs: Math.max(0, Math.round(nextAccumulatedActiveMs)),
        completedAt: nextCompletedAt,
    };
};

const isPhotoVideoCampaign = (ad) => {
    const normalized = String(ad?.campaign_type || ad?.campaignType || '').trim().toLowerCase();
    return normalized.includes('photo') && normalized.includes('video');
};

const normalizePromoteId = (value) => {
    const raw = String(value ?? '').trim().replace(/^ad-/i, '');
    if (!raw || !/^\d+$/.test(raw)) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
};

const normalizePromoteCode = (value) => {
    const raw = String(value ?? '').trim();
    return raw ? raw : null;
};

const resolveProductPromoteIdentity = async (payload = {}, fallback = {}) => {
    const campaignType = String(payload.campaignType || fallback.campaignType || '').trim().toLowerCase();
    if (campaignType !== 'product promote') {
        return { linkedProductId: null, linkedProductShareCode: null, originalProductId: null, originalProductCode: null };
    }

    let linkedProductId = normalizePromoteId(
        payload.linkedProductId
        ?? payload.linked_product_id
        ?? payload.productId
        ?? payload.product_id
        ?? payload.originalProductId
        ?? payload.original_product_id
        ?? payload.editDraft?.linkedProductId
        ?? payload.editDraft?.linked_product_id
        ?? payload.editDraft?.originalProductId
        ?? payload.editDraft?.original_product_id
        ?? fallback.linked_product_id
        ?? fallback.original_product_id
    );

    let linkedProductShareCode = normalizePromoteCode(
        payload.linkedProductShareCode
        ?? payload.linked_product_share_code
        ?? payload.linkedProductCode
        ?? payload.linked_product_code
        ?? payload.productCode
        ?? payload.product_code
        ?? payload.originalProductCode
        ?? payload.original_product_code
        ?? payload.editDraft?.linkedProductShareCode
        ?? payload.editDraft?.linked_product_share_code
        ?? payload.editDraft?.originalProductCode
        ?? payload.editDraft?.original_product_code
        ?? fallback.linked_product_share_code
        ?? fallback.original_product_code
    );

    if (linkedProductId && !linkedProductShareCode) {
        const productResult = await pool.query(
            'SELECT product_code FROM market WHERE id = $1 LIMIT 1',
            [linkedProductId]
        );
        linkedProductShareCode = normalizePromoteCode(productResult.rows[0]?.product_code);
    }

    if (!linkedProductId && linkedProductShareCode) {
        const productResult = await pool.query(
            'SELECT id, product_code FROM market WHERE LOWER(product_code) = LOWER($1) LIMIT 1',
            [linkedProductShareCode]
        );
        linkedProductId = normalizePromoteId(productResult.rows[0]?.id);
        linkedProductShareCode = normalizePromoteCode(productResult.rows[0]?.product_code || linkedProductShareCode);
    }

    return {
        linkedProductId,
        linkedProductShareCode,
        originalProductId: linkedProductId,
        originalProductCode: linkedProductShareCode,
    };
};

const normalizePayload = (body = {}, fallback = {}) => {
    const normalizeMediaGallery = (value, fallbackValue = []) => {
        const source = Array.isArray(value) ? value : fallbackValue;
        return source
            .filter((entry) => typeof entry === 'string')
            .map((entry) => entry.trim())
            .filter(Boolean);
    };
    const baseMediaGallery = normalizeMediaGallery(
        body.mediaGallery,
        normalizeMediaGallery(
            body.editDraft?.mediaGallery,
            normalizeMediaGallery(fallback.mediaGallery, fallback.mediaPreview ? [fallback.mediaPreview] : [])
        )
    );
    const primaryMediaPreview =
        (typeof body.mediaPreview === 'string' && body.mediaPreview) ||
        (baseMediaGallery.length ? baseMediaGallery[0] : '') ||
        (typeof fallback.mediaPreview === 'string' ? fallback.mediaPreview : '');

    return {
        adId: typeof body.adId === 'string' ? body.adId.trim() : (fallback.adId || ''),
        campaignType: typeof body.campaignType === 'string' ? body.campaignType.trim() : (fallback.campaignType || 'Ad Campaign'),
        title: typeof body.title === 'string' ? body.title : (fallback.title || ''),
        description: typeof body.description === 'string' ? body.description : (fallback.description || ''),
        mediaPreview: primaryMediaPreview,
        mediaGallery: baseMediaGallery.length ? baseMediaGallery : (primaryMediaPreview ? [primaryMediaPreview] : []),
        mediaType: typeof body.mediaType === 'string' ? body.mediaType : (fallback.mediaType || ''),
        genderTarget: typeof body.genderTarget === 'string' ? body.genderTarget : (fallback.genderTarget || 'All'),
        ageMin: hasOwn(body, 'ageMin') ? (Number.isFinite(Number(body.ageMin)) ? Number(body.ageMin) : null) : (fallback.ageMin ?? null),
        ageMax: hasOwn(body, 'ageMax') ? (Number.isFinite(Number(body.ageMax)) ? Number(body.ageMax) : null) : (fallback.ageMax ?? null),
        reach: hasOwn(body, 'reach') ? (Number.isFinite(Number(body.reach)) ? Number(body.reach) : 0) : Number(fallback.reach || 0),
        impressions: hasOwn(body, 'impressions') ? (Number.isFinite(Number(body.impressions)) ? Number(body.impressions) : 0) : Number(fallback.impressions || 0),
        clicks: hasOwn(body, 'clicks') ? (Number.isFinite(Number(body.clicks)) ? Number(body.clicks) : 0) : Number(fallback.clicks || 0),
        budget: hasOwn(body, 'budget') ? (Number.isFinite(Number(body.budget)) ? Number(body.budget) : 0) : Number(fallback.budget || 0),
        durationDays: hasOwn(body, 'durationDays') ? (Number.isFinite(Number(body.durationDays)) ? Number(body.durationDays) : 0) : Number(fallback.durationDays || 0),
        spend: hasOwn(body, 'spend') ? (Number.isFinite(Number(body.spend)) ? Number(body.spend) : 0) : Number(fallback.spend || 0),
        remainingBudget: hasOwn(body, 'remainingBudget') ? (Number.isFinite(Number(body.remainingBudget)) ? Number(body.remainingBudget) : 0) : Number(fallback.remainingBudget || 0),
        status: typeof body.status === 'string' && VALID_STATUSES.has(body.status) ? canonicalAdStatus(body.status) : (fallback.status || 'Under Review'),
        campaignPath: typeof body.campaignPath === 'string' ? body.campaignPath : (fallback.campaignPath || ''),
        walletTransferId: hasOwn(body, 'walletTransferId') ? (body.walletTransferId ?? null) : (fallback.walletTransferId ?? null),
        ownerId: typeof body.ownerId === 'string' || typeof body.ownerId === 'number' ? String(body.ownerId).trim() : (fallback.ownerId ?? ''),
        ownerUsername: typeof body.ownerUsername === 'string' ? body.ownerUsername.trim() : (fallback.ownerUsername || ''),
        productId: hasOwn(body, 'productId') ? body.productId : (body.product_id ?? fallback.productId ?? fallback.product_id ?? null),
        product_id: hasOwn(body, 'product_id') ? body.product_id : (body.productId ?? fallback.product_id ?? fallback.productId ?? null),
        productCode: hasOwn(body, 'productCode') ? body.productCode : (body.product_code ?? fallback.productCode ?? fallback.product_code ?? null),
        product_code: hasOwn(body, 'product_code') ? body.product_code : (body.productCode ?? fallback.product_code ?? fallback.productCode ?? null),
        linkedProductId: hasOwn(body, 'linkedProductId') ? body.linkedProductId : (body.linked_product_id ?? fallback.linkedProductId ?? fallback.linked_product_id ?? null),
        linked_product_id: hasOwn(body, 'linked_product_id') ? body.linked_product_id : (body.linkedProductId ?? fallback.linked_product_id ?? fallback.linkedProductId ?? null),
        linkedProductCode: hasOwn(body, 'linkedProductCode') ? body.linkedProductCode : (body.linked_product_code ?? fallback.linkedProductCode ?? fallback.linked_product_code ?? null),
        linked_product_code: hasOwn(body, 'linked_product_code') ? body.linked_product_code : (body.linkedProductCode ?? fallback.linked_product_code ?? fallback.linkedProductCode ?? null),
        tierId: hasOwn(body, 'tierId') || hasOwn(body, 'tier_id') ? (Number.isFinite(Number(body.tierId ?? body.tier_id)) ? Number(body.tierId ?? body.tier_id) : null) : (fallback.tierId ?? fallback.tier_id ?? null),
        estimatedReachMin: hasOwn(body, 'estimatedReachMin') || hasOwn(body, 'estimated_reach_min') ? (Number.isFinite(Number(body.estimatedReachMin ?? body.estimated_reach_min)) ? Number(body.estimatedReachMin ?? body.estimated_reach_min) : null) : (fallback.estimatedReachMin ?? fallback.estimated_reach_min ?? null),
        estimatedReachMax: hasOwn(body, 'estimatedReachMax') || hasOwn(body, 'estimated_reach_max') ? (Number.isFinite(Number(body.estimatedReachMax ?? body.estimated_reach_max)) ? Number(body.estimatedReachMax ?? body.estimated_reach_max) : null) : (fallback.estimatedReachMax ?? fallback.estimated_reach_max ?? null),
        maxReachCap: hasOwn(body, 'maxReachCap') || hasOwn(body, 'max_reach_cap')
            ? (Number.isFinite(Number(body.maxReachCap ?? body.max_reach_cap)) ? Number(body.maxReachCap ?? body.max_reach_cap) : null)
            : ((hasOwn(body, 'estimatedReachMax') || hasOwn(body, 'estimated_reach_max')) && Number.isFinite(Number(body.estimatedReachMax ?? body.estimated_reach_max))
                ? Number(body.estimatedReachMax ?? body.estimated_reach_max)
                : (fallback.maxReachCap ?? fallback.max_reach_cap ?? fallback.estimatedReachMax ?? fallback.estimated_reach_max ?? null)),
        promoCode: typeof body.promoCode === 'string' ? body.promoCode.trim() || null : (fallback.promoCode ?? null),
        promoDiscount: hasOwn(body, 'promoDiscount') || hasOwn(body, 'promo_discount') ? (Number.isFinite(Number(body.promoDiscount ?? body.promo_discount)) ? Number(body.promoDiscount ?? body.promo_discount) : null) : (fallback.promoDiscount ?? fallback.promo_discount ?? null),
        promoteAgain: body.promoteAgain === true || body.editDraft?.promoteAgain === true,
        editDraft: body.editDraft && typeof body.editDraft === 'object' ? body.editDraft : (fallback.editDraft || {}),
        createdAt: body.createdAt ? new Date(body.createdAt) : (fallback.createdAt ? new Date(fallback.createdAt) : null),
    };
};

const resolveGoogerMainWalletUserId = async (client) => {
    const configuredId = Number.parseInt(String(process.env.GOOGER_MAIN_USER_ID || '').trim(), 10);
    if (Number.isFinite(configuredId) && configuredId > 0) {
        const configuredResult = await client.query(
            'SELECT id FROM users WHERE id = $1 LIMIT 1',
            [configuredId]
        );
        if (configuredResult.rows.length > 0) {
            return configuredResult.rows[0].id;
        }
    }

    const googerResult = await client.query(
        `SELECT id FROM users
         WHERE LOWER(username) = 'googer'
         ORDER BY id ASC
         LIMIT 1`
    );
    if (googerResult.rows.length > 0) return googerResult.rows[0].id;

    const adminResult = await client.query(
        `SELECT id FROM users
         WHERE LOWER(COALESCE(user_type, '')) = 'admin'
         ORDER BY id ASC
         LIMIT 1`
    );
    if (adminResult.rows.length > 0) return adminResult.rows[0].id;

    const fallbackResult = await client.query(
        `SELECT id FROM users
         WHERE LOWER(COALESCE(user_type, '')) = 'admin'
            OR id = 1
         ORDER BY
            CASE
                WHEN LOWER(COALESCE(user_type, '')) = 'admin' THEN 0
                WHEN id = 1 THEN 1
                ELSE 2
            END,
            id ASC
         LIMIT 1`
    );

    return fallbackResult.rows[0]?.id || null;
};

const findSponsor = async (userId) => {
    const result = await pool.query(
        'SELECT user_id, username FROM users WHERE id = $1 LIMIT 1',
        [userId]
    );
    return result.rows[0] || null;
};

const findAdRowByAdId = async (adId) => {
    const result = await pool.query(
        'SELECT * FROM ads WHERE ad_id = $1 LIMIT 1',
        [adId]
    );
    return result.rows[0] || null;
};

const createAdRow = async (params) => {
    const result = await pool.query(
        `INSERT INTO ads (
            ad_id, user_id, owner_user_id, owner_username, campaign_type, title, description,
            media_preview, media_gallery, media_type, gender_target, age_min, age_max, reach, impressions,
            clicks, budget, duration_days, spend, remaining_budget, status, campaign_path,
            linked_product_id, linked_product_share_code, original_product_id, original_product_code,
            wallet_transfer_id, edit_draft,
            tier_id, estimated_reach_min, estimated_reach_max, max_reach_cap,
            promo_code, promo_discount,
            active_start_time, started_at, last_resumed_at, paused_at, accumulated_active_ms, completed_at,
            created_at, updated_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8, $9, $10, $11, $12, $13, $14, $15,
            $16, $17, $18, $19, $20, $21, $22,
            $23, $24, $25, $26, $27, $28,
            $29, $30, $31, $32,
            $33, $34,
            $35, $36, $37, $38, $39, $40,
            COALESCE($41, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP
        )
        RETURNING *`,
        params
    );
    return result.rows[0] || null;
};

const connect = async () => pool.connect();

module.exports = {
    _logError,
    buildTimingUpdateState,
    connect,
    createAdRow,
    ensureAdsTable: readAdsRepository.ensureAdsTable,
    findAdRowByAdId,
    findSponsor,
    hasOwn,
    isPhotoVideoCampaign,
    isFreeBudgetLockedAd,
    isRawUploadedPhotoVideoAd,
    mapRow: savedAdsRepository.mapRow,
    normalizePayload,
    readAdsRepository,
    resolveGoogerMainWalletUserId,
    resolveProductPromoteIdentity,
    supportsRemainingBudgetRefund,
};
