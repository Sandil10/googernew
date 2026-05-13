const pool = require('../config/database');
const { saveUploadedFiles } = require('../utils/localUpload');
const jwt = require('jsonwebtoken');
const {
    filterDeliverableAds,
    loadViewerAdProfile,
    recordAdImpression,
} = require('../utils/adDelivery');

let adsTableReady = false;
const VALID_STATUSES = new Set(['Under Review', 'Active', 'Paused', 'Completed', 'Cancelled']);
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
const stripDataUrl = (value) => {
    const text = String(value || '').trim();
    return text.startsWith('data:') ? '' : text;
};
const getMediaUrl = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return stripDataUrl(value);
    if (typeof value === 'object') {
        return stripDataUrl(value.url || value.image_url || value.image || value.src || value.path || '');
    }
    return '';
};
const getRawMediaValue = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'object') {
        return String(value.url || value.image_url || value.image || value.src || value.path || '').trim();
    }
    return '';
};

const normalizeMediaGallery = (value, fallback = []) => {
    const source = Array.isArray(value) ? value : fallback;
    return source
        .filter((entry) => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean);
};

const getDisplayReach = (row) => {
    const currentReach = Number(row.current_reach || 0);
    if (currentReach > 0) return currentReach;

    const legacyReach = Number(row.reach || 0);
    if (legacyReach > 0) return legacyReach;

    return Number(row.impressions || 0);
};

const getOptionalViewerId = (req) => {
    try {
        const authHeader = req.header('Authorization');
        const token = authHeader?.startsWith('Bearer ')
            ? authHeader.replace('Bearer ', '')
            : authHeader;
        if (!token) return null;

        const secret = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET;
        if (!secret) return null;

        const decoded = jwt.verify(token, secret);
        return decoded?.id || decoded?.userId || null;
    } catch {
        return null;
    }
};

const ensureAdEngagementTables = async () => {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS ad_likes (
            id SERIAL PRIMARY KEY,
            ad_id VARCHAR(80) NOT NULL,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(ad_id, user_id)
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS ad_coin_collections (
            id SERIAL PRIMARY KEY,
            ad_id VARCHAR(80) NOT NULL,
            ad_type VARCHAR(80) NOT NULL DEFAULT 'Ads',
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            reward_amount DECIMAL(10, 2) NOT NULL DEFAULT 1.00,
            commission DECIMAL(10, 2) NOT NULL DEFAULT 0.25,
            advertiser_charge DECIMAL(10, 2) NOT NULL DEFAULT 1.25,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(ad_id, ad_type, user_id)
        );
    `);

    await pool.query(`
        ALTER TABLE ad_coin_collections
            ADD COLUMN IF NOT EXISTS ad_type VARCHAR(80) NOT NULL DEFAULT 'Ads',
            ADD COLUMN IF NOT EXISTS reward_amount DECIMAL(10, 2) NOT NULL DEFAULT 1.00,
            ADD COLUMN IF NOT EXISTS commission DECIMAL(10, 2) NOT NULL DEFAULT 0.25,
            ADD COLUMN IF NOT EXISTS advertiser_charge DECIMAL(10, 2) NOT NULL DEFAULT 1.25;
    `);
};

const ensureAdsTable = async () => {
    if (adsTableReady) return;

    await pool.query(`
        CREATE TABLE IF NOT EXISTS ads (
            id SERIAL PRIMARY KEY,
            ad_id VARCHAR(20) UNIQUE NOT NULL,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            owner_user_id VARCHAR(20),
            owner_username VARCHAR(50),
            campaign_type VARCHAR(100) NOT NULL,
            title TEXT,
            description TEXT,
            media_preview TEXT,
            media_gallery JSONB DEFAULT '[]'::jsonb,
            media_type VARCHAR(20) DEFAULT '',
            gender_target VARCHAR(20),
            age_min INTEGER,
            age_max INTEGER,
            reach INTEGER DEFAULT 0,
            impressions INTEGER DEFAULT 0,
            clicks INTEGER DEFAULT 0,
            budget DECIMAL(12, 2) DEFAULT 0,
            duration_days INTEGER DEFAULT 0,
            spend DECIMAL(12, 2) DEFAULT 0,
            remaining_budget DECIMAL(12, 2) DEFAULT 0,
            status VARCHAR(30) DEFAULT 'Under Review',
            campaign_path TEXT,
            wallet_transfer_id INTEGER,
            edit_draft JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await pool.query(`
        ALTER TABLE ads
        ADD COLUMN IF NOT EXISTS media_gallery JSONB DEFAULT '[]'::jsonb;
    `);

    await pool.query(`
        ALTER TABLE ads
        ADD COLUMN IF NOT EXISTS likes_count INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS comments_count INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS shares_count INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS linked_product_id INTEGER,
        ADD COLUMN IF NOT EXISTS linked_product_share_code VARCHAR(32),
        ADD COLUMN IF NOT EXISTS original_product_id INTEGER,
        ADD COLUMN IF NOT EXISTS original_product_code VARCHAR(32);
    `);

    await pool.query(`
        ALTER TABLE ads
            ADD COLUMN IF NOT EXISTS tier_id              INTEGER,
            ADD COLUMN IF NOT EXISTS estimated_reach_min  INTEGER,
            ADD COLUMN IF NOT EXISTS estimated_reach_max  INTEGER,
            ADD COLUMN IF NOT EXISTS max_reach_cap        INTEGER,
            ADD COLUMN IF NOT EXISTS current_reach        INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS promo_code           VARCHAR(20),
            ADD COLUMN IF NOT EXISTS promo_discount       INTEGER;
    `);

    await pool.query(`
        ALTER TABLE ads
            ADD COLUMN IF NOT EXISTS started_at TIMESTAMP;
    `);

    await pool.query(`
        UPDATE ads
        SET current_reach = GREATEST(COALESCE(current_reach, 0), COALESCE(impressions, 0)),
            reach = GREATEST(COALESCE(reach, 0), COALESCE(impressions, 0)),
            updated_at = CURRENT_TIMESTAMP
        WHERE COALESCE(impressions, 0) > 0
          AND (
              COALESCE(current_reach, 0) = 0
              OR COALESCE(reach, 0) = 0
          );
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_ads_user_id ON ads(user_id);
        CREATE INDEX IF NOT EXISTS idx_ads_status ON ads(status);
        CREATE INDEX IF NOT EXISTS idx_ads_created_at ON ads(created_at DESC);
    `);

    adsTableReady = true;
};

const mapRow = (row) => {
    const isProductPromote = String(row.campaign_type || '').trim().toLowerCase() === 'product promote';
    const originalProductId = row.original_product_id ?? row.linked_product_id ?? null;
    const originalProductCode = row.original_product_code ?? row.linked_product_share_code ?? null;
    const linkedProductId = row.linked_product_id ?? originalProductId ?? null;
    const linkedProductShareCode = row.linked_product_share_code ?? originalProductCode ?? null;

    return {
    id: row.id,
    adId: row.ad_id,
    ad_id: row.ad_id,
    userId: row.user_id,
    user_id: row.user_id,
    ad_owner_user_id: row.user_id,
    advertiser_id: row.user_id,
    ownerUserId: row.owner_user_id,
    ownerUsername: row.owner_username_joined || row.owner_username,
    user: {
        id: row.user_id,
        user_id: row.owner_user_id,
        username: row.owner_username_joined || row.owner_username,
        profile_picture: row.profile_picture || null,
    },
    campaignType: row.campaign_type,
    title: row.title,
    description: row.description,
    mediaPreview: row.media_preview,
    mediaGallery: normalizeMediaGallery(row.media_gallery, normalizeMediaGallery(row.edit_draft?.mediaGallery, row.media_preview ? [row.media_preview] : [])),
    mediaType: row.media_type || '',
    genderTarget: row.gender_target,
    ageMin: row.age_min,
    ageMax: row.age_max,
    reach: getDisplayReach(row),
    impressions: Number(row.impressions || 0),
    views_count: Number(row.impressions || row.views_count || 0),
    viewCount: Number(row.impressions || row.views_count || 0),
    likes_count: Number(row.likes_count || 0),
    likeCount: Number(row.likes_count || 0),
    comments_count: Number(row.comments_count || 0),
    commentCount: Number(row.comments_count || 0),
    shares_count: Number(row.shares_count || 0),
    shareCount: Number(row.shares_count || 0),
    clicks: Number(row.clicks || 0),
    budget: Number(row.budget || 0),
    durationDays: Number(row.duration_days || 0),
    spend: Number(row.spend || 0),
    remainingBudget: Number(row.remaining_budget || 0),
    status: row.status || 'Under Review',
    campaignPath: row.campaign_path,
    active_link: row.active_link || row.edit_draft?.activeLink || row.edit_draft?.active_link || '',
    cta_topic: row.cta_topic || row.edit_draft?.ctaTopic || row.edit_draft?.cta_topic || '',
    cta_value: row.cta_value || row.edit_draft?.ctaValue || row.edit_draft?.cta_value || '',
    product_id: row.product_id ?? null,
    productId: row.product_id ?? null,
    original_product_id: originalProductId,
    original_product_code: originalProductCode,
    linked_product_id: linkedProductId,
    linked_product_share_code: linkedProductShareCode,
    linked_product_code: linkedProductShareCode,
    product_code: isProductPromote ? (originalProductCode || linkedProductShareCode || row.product_code || null) : (row.product_code || row.ad_id),
    share_code: isProductPromote ? (originalProductCode || linkedProductShareCode || row.share_code || null) : (row.share_code || row.product_code || row.ad_id),
    shareCode: isProductPromote ? (originalProductCode || linkedProductShareCode || row.share_code || null) : (row.share_code || row.product_code || row.ad_id),
    walletTransferId: row.wallet_transfer_id,
    tierId: row.tier_id ?? null,
    estimatedReachMin: row.estimated_reach_min ?? null,
    estimatedReachMax: row.estimated_reach_max ?? null,
    maxReachCap: row.max_reach_cap ?? null,
    currentReach: getDisplayReach(row),
    promoCode: row.promo_code || null,
    editDraft: row.edit_draft || {},
    createdAt: row.created_at ? new Date(String(row.created_at).trim().replace(' ', 'T') + 'Z').toISOString() : null,
    created_at: row.created_at ? new Date(String(row.created_at).trim().replace(' ', 'T') + 'Z').toISOString() : null,
    startedAt: row.started_at ? new Date(String(row.started_at).trim().replace(' ', 'T') + 'Z').toISOString() : null,
    started_at: row.started_at ? new Date(String(row.started_at).trim().replace(' ', 'T') + 'Z').toISOString() : null,
    updatedAt: row.updated_at ? new Date(String(row.updated_at).trim().replace(' ', 'T') + 'Z').toISOString() : null,
    updated_at: row.updated_at ? new Date(String(row.updated_at).trim().replace(' ', 'T') + 'Z').toISOString() : null,
    };
};

const isProductPromoteCampaign = (ad) => String(ad?.campaign_type || ad?.campaignType || '').trim().toLowerCase() === 'product promote';

const getProductPromoteTarget = (ad) => {
    const productIdValue =
        ad?.original_product_id ??
        ad?.linked_product_id ??
        ad?.editDraft?.linkedProductId ??
        ad?.edit_draft?.linkedProductId ??
        null;
    const productCodeValue =
        ad?.original_product_code ??
        ad?.linked_product_code ??
        ad?.linked_product_share_code ??
        ad?.editDraft?.linkedProductCode ??
        ad?.edit_draft?.linkedProductCode ??
        null;
    const productId = Number.parseInt(String(productIdValue ?? '').trim(), 10);
    const productCode = String(productCodeValue ?? '').trim();

    return {
        productId: Number.isFinite(productId) ? productId : null,
        productCode: productCode || null,
    };
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

const deriveVariantSizes = (variants) => {
    if (!Array.isArray(variants)) return [];
    return Array.from(
        new Set(
            variants
                .map((variant) => String(variant?.size || variant?.value || variant?.label || "").trim())
                .filter(Boolean)
        )
    );
};

const deriveVariantColors = (variants) => {
    if (!Array.isArray(variants)) return [];
    return Array.from(
        new Set(
            variants
                .map((variant) => String(variant?.color || variant?.name || "").trim())
                .filter(Boolean)
        )
    );
};

const normalizePayload = (body = {}, fallback = {}) => {
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
        status: typeof body.status === 'string' && VALID_STATUSES.has(body.status) ? body.status : (fallback.status || 'Under Review'),
        campaignPath: typeof body.campaignPath === 'string' ? body.campaignPath : (fallback.campaignPath || ''),
        walletTransferId: hasOwn(body, 'walletTransferId') ? (body.walletTransferId ?? null) : (fallback.walletTransferId ?? null),
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
        editDraft: body.editDraft && typeof body.editDraft === 'object' ? body.editDraft : (fallback.editDraft || {}),
        createdAt: body.createdAt ? new Date(body.createdAt) : (fallback.createdAt ? new Date(fallback.createdAt) : null),
    };
};

async function resolveGoogerMainWalletUserId(client) {
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

    if (googerResult.rows.length > 0) {
        return googerResult.rows[0].id;
    }

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
}

const assertAdmin = async (userId) => {
    const result = await pool.query('SELECT user_type FROM users WHERE id = $1 LIMIT 1', [userId]);
    return result.rows[0]?.user_type === 'admin';
};

exports.createAd = async (req, res) => {
    try {
        await ensureAdsTable();
        const userId = req.user.id;
        const isAdmin = await assertAdmin(userId);
        
        let body = req.body;
        if (req.body.data && typeof req.body.data === 'string') {
            try {
                body = JSON.parse(req.body.data);
            } catch (e) {
                console.error('Failed to parse data field:', e);
            }
        } else {
            // If sent as top-level FormData fields, parse JSON fields
            if (typeof body.mediaGallery === 'string') try { body.mediaGallery = JSON.parse(body.mediaGallery); } catch(e) {}
            if (typeof body.editDraft === 'string') try { body.editDraft = JSON.parse(body.editDraft); } catch(e) {}
        }

        const payload = normalizePayload(body, { status: 'Under Review' });
        const productPromoteIdentity = await resolveProductPromoteIdentity(payload);
        if (String(payload.campaignType || '').trim().toLowerCase() === 'product promote'
            && !productPromoteIdentity.linkedProductId
            && !productPromoteIdentity.linkedProductShareCode) {
            return res.status(400).json({ success: false, message: 'Product Promote requires a linked product' });
        }
        payload.editDraft = {
            ...(payload.editDraft || {}),
            linkedProductId: productPromoteIdentity.linkedProductId,
            linkedProductShareCode: productPromoteIdentity.linkedProductShareCode,
            originalProductId: productPromoteIdentity.originalProductId,
            originalProductCode: productPromoteIdentity.originalProductCode,
        };
        payload.originalProductId = productPromoteIdentity.originalProductId;
        payload.originalProductCode = productPromoteIdentity.originalProductCode;

        // Handle File Uploads
        if (req.files && req.files.length > 0) {
            const uploadedUrls = await saveUploadedFiles(req.files, 'ads');
            payload.mediaGallery = [...uploadedUrls, ...(payload.mediaGallery || [])].slice(0, 10);
            if (uploadedUrls.length > 0) {
                payload.mediaPreview = uploadedUrls[0];
            }
        }

        if (!payload.adId || !/^\d{10,12}$/.test(payload.adId)) {
            return res.status(400).json({ success: false, message: 'Valid adId is required' });
        }

        const ownerResult = await pool.query(
            'SELECT user_id, username FROM users WHERE id = $1 LIMIT 1',
            [userId]
        );

        const owner = ownerResult.rows[0];
        if (!owner) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const result = await pool.query(
            `INSERT INTO ads (
                ad_id, user_id, owner_user_id, owner_username, campaign_type, title, description,
                media_preview, media_gallery, media_type, gender_target, age_min, age_max, reach, impressions,
                clicks, budget, duration_days, spend, remaining_budget, status, campaign_path,
                linked_product_id, linked_product_share_code, original_product_id, original_product_code,
                wallet_transfer_id, edit_draft,
                tier_id, estimated_reach_min, estimated_reach_max, max_reach_cap,
                promo_code, promo_discount,
                created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7,
                $8, $9, $10, $11, $12, $13, $14, $15,
                $16, $17, $18, $19, $20, $21, $22,
                $23, $24, $25, $26, $27, $28,
                $29, $30, $31, $32,
                $33, $34,
                COALESCE($35, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP
            )
            RETURNING *`,
            [
                payload.adId, userId, owner.user_id, owner.username, payload.campaignType, payload.title, payload.description,
                payload.mediaPreview, JSON.stringify(payload.mediaGallery), payload.mediaType, payload.genderTarget, payload.ageMin, payload.ageMax, payload.reach, payload.impressions,
                payload.clicks, payload.budget, payload.durationDays, payload.spend, payload.remainingBudget, isAdmin ? payload.status : 'Under Review', payload.campaignPath,
                productPromoteIdentity.linkedProductId, productPromoteIdentity.linkedProductShareCode,
                productPromoteIdentity.originalProductId, productPromoteIdentity.originalProductCode,
                payload.walletTransferId, JSON.stringify(payload.editDraft),
                payload.tierId ?? null, payload.estimatedReachMin ?? null, payload.estimatedReachMax ?? null, payload.maxReachCap ?? null,
                payload.promoCode ?? null, payload.promoDiscount ?? null,
                payload.createdAt && !Number.isNaN(payload.createdAt.getTime()) ? payload.createdAt : null,
            ]
        );

        return res.status(201).json({ success: true, ad: mapRow(result.rows[0]) });
    } catch (error) {
        console.error('Create ad error:', error);
        return res.status(500).json({ success: false, message: 'Failed to create ad' });
    }
};

exports.updateAd = async (req, res) => {
    const client = await pool.connect();
    try {
        await ensureAdsTable();
        const { adId } = req.params;
        const userId = req.user.id;
        const isAdmin = await assertAdmin(userId);
        const existingResult = await client.query(
            'SELECT * FROM ads WHERE ad_id = $1 LIMIT 1',
            [adId]
        );

        if (!existingResult.rows.length) {
            return res.status(404).json({ success: false, message: 'Ad not found' });
        }

        const existingAd = mapRow(existingResult.rows[0]);
        const isOwner = Number(existingAd.userId) === Number(userId);

        if (!isOwner && !isAdmin) {
            return res.status(404).json({ success: false, message: 'Ad not found' });
        }

        let body = req.body;
        if (req.body.data && typeof req.body.data === 'string') {
            try {
                body = JSON.parse(req.body.data);
            } catch (e) {
                console.error('Failed to parse data field:', e);
            }
        } else {
            // If sent as top-level FormData fields, parse JSON fields
            if (typeof body.mediaGallery === 'string') try { body.mediaGallery = JSON.parse(body.mediaGallery); } catch(e) {}
            if (typeof body.editDraft === 'string') try { body.editDraft = JSON.parse(body.editDraft); } catch(e) {}
        }

        const payload = normalizePayload(body, existingAd);
        const isProfilePromote = String(existingAd.campaignType || '').trim().toLowerCase() === 'profile promote';
        if (
            existingAd.status === 'Active' &&
            payload.status === 'Cancelled'
        ) {
            return res.status(400).json({
                success: false,
                message: 'Active ads cannot be cancelled.',
            });
        }
        const productPromoteIdentity = await resolveProductPromoteIdentity(payload, existingAd);
        if (String(payload.campaignType || '').trim().toLowerCase() === 'product promote'
            && !productPromoteIdentity.linkedProductId
            && !productPromoteIdentity.linkedProductShareCode) {
            return res.status(400).json({ success: false, message: 'Product Promote requires a linked product' });
        }
        payload.editDraft = {
            ...(payload.editDraft || {}),
            linkedProductId: productPromoteIdentity.linkedProductId,
            linkedProductShareCode: productPromoteIdentity.linkedProductShareCode,
            originalProductId: productPromoteIdentity.originalProductId,
            originalProductCode: productPromoteIdentity.originalProductCode,
        };
        payload.originalProductId = productPromoteIdentity.originalProductId;
        payload.originalProductCode = productPromoteIdentity.originalProductCode;

        // Handle File Uploads
        if (req.files && req.files.length > 0) {
            const uploadedUrls = await saveUploadedFiles(req.files, 'ads');
            // When updating, we might want to replace or prepend. Let's prepend.
            payload.mediaGallery = [...uploadedUrls, ...(payload.mediaGallery || [])].slice(0, 10);
            if (uploadedUrls.length > 0) {
                payload.mediaPreview = uploadedUrls[0];
            }
        }
        const requestedStatus = payload.status;
        const contentChanged = [
            'campaignType',
            'title',
            'description',
            'mediaPreview',
            'mediaType',
            'genderTarget',
            'ageMin',
            'ageMax',
            'reach',
            'impressions',
            'clicks',
            'budget',
            'durationDays',
            'spend',
            'remainingBudget',
            'campaignPath',
            'walletTransferId',
        ].some((field) => payload[field] !== existingAd[field])
            || JSON.stringify(payload.mediaGallery) !== JSON.stringify(existingAd.mediaGallery || [])
            || JSON.stringify(payload.editDraft || {}) !== JSON.stringify(existingAd.editDraft || {});

        if (!isAdmin) {
            if (contentChanged && existingAd.status !== 'Under Review') {
                return res.status(403).json({ success: false, message: 'Active ads can no longer be edited.' });
            }

            if (hasOwn(req.body, 'status')) {
                const canChangeStatus =
                    requestedStatus === existingAd.status
                    || requestedStatus === 'Cancelled'
                    || requestedStatus === 'Under Review'
                    || requestedStatus === 'Paused';
                if (!canChangeStatus) {
                    return res.status(403).json({ success: false, message: 'Only admins can approve or complete ads.' });
                }
            }
        }

        await client.query('BEGIN');

        if (
            existingAd.status === 'Under Review'
            && payload.status === 'Cancelled'
            && Number(existingAd.walletTransferId) > 0
        ) {
            const transferResult = await client.query(
                `SELECT id, sender_id, receiver_id, amount, status
                 FROM wallet_transfers
                 WHERE id = $1
                 LIMIT 1
                 FOR UPDATE`,
                [existingAd.walletTransferId]
            );

            if (transferResult.rows.length > 0) {
                const transfer = transferResult.rows[0];
                const refundAmount = Number(transfer.amount || 0);
                const advertiserUserId = Number(transfer.sender_id || existingAd.userId);
                const creditedGoogerUserId = Number(transfer.receiver_id || 0);
                const canonicalGoogerUserId = await resolveGoogerMainWalletUserId(client);
                const googerUserId = creditedGoogerUserId || canonicalGoogerUserId;

                if (refundAmount > 0 && advertiserUserId > 0 && googerUserId > 0) {
                    const googerBalanceResult = await client.query(
                        'SELECT wallet_balance FROM users WHERE id = $1 FOR UPDATE',
                        [googerUserId]
                    );

                    if (!googerBalanceResult.rows.length) {
                        await client.query('ROLLBACK');
                        return res.status(500).json({ success: false, message: 'Googer wallet account not found for refund.' });
                    }

                    const googerBalance = Number(googerBalanceResult.rows[0].wallet_balance || 0);
                    if (googerBalance < refundAmount) {
                        await client.query('ROLLBACK');
                        return res.status(400).json({ success: false, message: 'Googer main wallet has insufficient balance for refund reversal.' });
                    }

                    await client.query(
                        'UPDATE users SET wallet_balance = wallet_balance - $1 WHERE id = $2',
                        [refundAmount, googerUserId]
                    );
                    await client.query(
                        'UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2',
                        [refundAmount, advertiserUserId]
                    );

                    await client.query(
                        `INSERT INTO wallet_transfers (sender_id, receiver_id, amount, note, type, status, created_at, updated_at)
                         VALUES ($1, $2, $3, $4, 'transfer', 'accepted', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                        [
                            googerUserId,
                            advertiserUserId,
                            refundAmount,
                            `Ad Refund - ${existingAd.adId} (${existingAd.campaignType}) - Cancelled During Review`,
                        ]
                    );
                }
            }
        }

        const result = await client.query(
            `UPDATE ads
             SET campaign_type = $1,
                 title = $2,
                 description = $3,
                 media_preview = $4,
                 media_gallery = $5,
                 media_type = $6,
                 gender_target = $7,
                 age_min = $8,
                 age_max = $9,
                 reach = $10,
                 impressions = $11,
                 clicks = $12,
                 budget = $13,
                 duration_days = $14,
                 spend = $15,
                 remaining_budget = $16,
                 status = $17::varchar,
                 campaign_path = $18,
                 linked_product_id = $19,
                 linked_product_share_code = $20,
                 original_product_id = $21,
                 original_product_code = $22,
                 wallet_transfer_id = COALESCE($23, wallet_transfer_id),
                 edit_draft = $24,
                 tier_id = COALESCE($25, tier_id),
                 estimated_reach_min = COALESCE($26, estimated_reach_min),
                 estimated_reach_max = COALESCE($27, estimated_reach_max),
                 max_reach_cap = $28,
                 started_at = CASE WHEN $17::varchar = 'Active' AND started_at IS NULL THEN CURRENT_TIMESTAMP ELSE started_at END,
                 updated_at = CURRENT_TIMESTAMP
             WHERE ad_id = $29
             RETURNING *`,
            [
                payload.campaignType, payload.title, payload.description, payload.mediaPreview, JSON.stringify(payload.mediaGallery), payload.mediaType,
                payload.genderTarget, payload.ageMin, payload.ageMax, payload.reach, payload.impressions, payload.clicks,
                payload.budget, payload.durationDays, payload.spend, payload.remainingBudget, payload.status,
                payload.campaignPath, productPromoteIdentity.linkedProductId, productPromoteIdentity.linkedProductShareCode,
                productPromoteIdentity.originalProductId, productPromoteIdentity.originalProductCode,
                payload.walletTransferId, JSON.stringify(payload.editDraft),
                payload.tierId ?? null, payload.estimatedReachMin ?? null, payload.estimatedReachMax ?? null, payload.maxReachCap ?? null,
                adId,
            ]
        );

        if (!result.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Ad not found' });
        }

        await client.query('COMMIT');
        return res.status(200).json({ success: true, ad: mapRow(result.rows[0]) });
    } catch (error) {
        try { await client.query('ROLLBACK'); } catch {}
        console.error('Update ad error:', error);
        return res.status(500).json({ success: false, message: 'Failed to update ad' });
    } finally {
        client.release();
    }
};

exports.getMyAds = async (req, res) => {
    try {
        await ensureAdsTable();
        const result = await pool.query(
            `SELECT a.*, u.username AS owner_username_joined, u.profile_picture
             FROM ads a 
             LEFT JOIN users u ON a.user_id = u.id 
             WHERE a.user_id = $1 
             ORDER BY a.created_at DESC`,
            [req.user.id]
        );

        return res.status(200).json({ success: true, ads: result.rows.map(mapRow) });
    } catch (error) {
        console.error('Get my ads error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch ads' });
    }
};

exports.getMyAdById = async (req, res) => {
    try {
        await ensureAdsTable();
        const result = await pool.query(
            `SELECT a.*, u.username AS owner_username_joined, u.profile_picture
             FROM ads a
             LEFT JOIN users u ON a.user_id = u.id
             WHERE a.ad_id = $1 AND a.user_id = $2
             LIMIT 1`,
            [req.params.adId, req.user.id]
        );

        if (!result.rows.length) {
            return res.status(404).json({ success: false, message: 'Ad not found' });
        }

        return res.status(200).json({ success: true, ad: mapRow(result.rows[0]) });
    } catch (error) {
        console.error('Get ad by id error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch ad' });
    }
};

exports.getAllAds = async (req, res) => {
    try {
        await ensureAdsTable();
        const isAdmin = await assertAdmin(req.user.id);
        if (!isAdmin) {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }

        const result = await pool.query(
            `SELECT a.*, u.username AS owner_username_joined, u.profile_picture
             FROM ads a 
             LEFT JOIN users u ON a.user_id = u.id 
             ORDER BY a.created_at DESC`
        );

        return res.status(200).json({ success: true, ads: result.rows.map(mapRow) });
    } catch (error) {
        console.error('Get all ads error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch ads' });
    }
};

exports.getActiveAdsPublic = async (req, res) => {
    try {
        await ensureAdsTable();
        const viewerId = getOptionalViewerId(req);
        if (viewerId) await ensureAdEngagementTables();
        const limitRaw = Number.parseInt(req.query.limit, 10);
        const offsetRaw = Number.parseInt(req.query.offset, 10);
        const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : 20;
        const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0;
        const viewerSelect = viewerId
            ? `,
                EXISTS(SELECT 1 FROM ad_likes al WHERE al.ad_id = a.ad_id AND al.user_id = $3) AS user_liked,
                EXISTS(SELECT 1 FROM ad_coin_collections acc WHERE acc.ad_id = a.ad_id AND acc.user_id = $3) AS ad_coin_collected`
            : `,
                FALSE AS user_liked,
                FALSE AS ad_coin_collected`;
        const fetchLimit = Math.min(limit * 4 + 1, 200);
        const queryParams = viewerId ? [fetchLimit, offset, viewerId] : [fetchLimit, offset];
        const result = await pool.query(
            `SELECT a.*, u.username AS owner_username_joined, u.profile_picture${viewerSelect}
             FROM ads a
             LEFT JOIN users u ON a.user_id = u.id
             WHERE a.status = 'Active'
               AND (a.max_reach_cap IS NULL OR COALESCE(a.current_reach, 0) < a.max_reach_cap)
             ORDER BY a.created_at DESC
             LIMIT $1 OFFSET $2`,
            queryParams
        );

        const viewerProfile = await loadViewerAdProfile(pool, viewerId, req);
        const rows = filterDeliverableAds(result.rows || [], viewerProfile);
        const ads = rows.slice(0, limit).map((row) => {
            const ad = {
                ...mapRow(row),
                user_liked: !!row.user_liked || !!row.ad_coin_collected,
                ad_coin_collected: !!row.ad_coin_collected,
                ad_like_locked: !!row.ad_coin_collected,
            };
            const mediaGallery = (ad.mediaGallery || []).map(getMediaUrl).filter(Boolean);
            const mediaPreview = getMediaUrl(ad.mediaPreview) || mediaGallery[0] || getRawMediaValue(ad.mediaPreview) || '/assets/images/googer.png';
            const safeDraft = {
                ...(ad.editDraft || {}),
                mediaPreview,
                mediaGallery,
            };
            return {
                ...ad,
                mediaPreview,
                mediaGallery,
                editDraft: safeDraft,
                edit_draft: safeDraft,
                image_url: mediaPreview,
                main_image: mediaPreview,
                media_url: mediaPreview,
                thumbnail_url: mediaPreview,
                media_preview: mediaPreview,
                media_gallery: mediaGallery,
                images: mediaGallery,
                user: {
                    ...ad.user,
                    profile_picture: getMediaUrl(ad.user?.profile_picture) || null,
                },
                user_liked: !!ad.user_liked,
                ad_coin_collected: !!ad.ad_coin_collected,
                ad_like_locked: !!ad.ad_coin_collected,
            };
        });

        const productPromoteTargets = ads
            .map((ad) => {
                if (!isProductPromoteCampaign(ad)) return null;
                return getProductPromoteTarget(ad);
            })
            .filter((target) => target && (target.productId || target.productCode));

        const productIds = Array.from(new Set(productPromoteTargets.map((target) => target.productId).filter((value) => Number.isFinite(value))));
        const productCodes = Array.from(new Set(productPromoteTargets.map((target) => target.productCode).filter(Boolean)));
        let linkedProducts = [];

        if (productIds.length || productCodes.length) {
            const linkedResult = await pool.query(
                `SELECT m.id, m.user_id, m.username, m.title, m.description, m.price, m.promo_price,
                        m.category, m.sub_category, m.manual_category, m.stock, m.image_url, m.status,
                        m.likes_count, m.comments_count, m.shares_count, m.views_count,
                        m.variants, m.shipping_info, m.payment_methods, m.commission_info, m.created_at, m.product_code,
                        u.username AS owner_username, u.profile_picture
                 FROM market m
                 INNER JOIN users u ON m.user_id = u.id
                 WHERE (m.id = ANY($1::int[]) OR m.product_code = ANY($2::text[]))
                   AND m.status IN ('approved', 'active')`,
                [productIds.length ? productIds : [0], productCodes.length ? productCodes : ['']]
            );
            linkedProducts = linkedResult.rows || [];
        }

        const productById = new Map(linkedProducts.map((row) => [Number(row.id), row]));
        const productByCode = new Map(linkedProducts.map((row) => [String(row.product_code || ''), row]));

        const hydratedAds = ads.map((ad) => {
            if (!isProductPromoteCampaign(ad)) return ad;

            const target = getProductPromoteTarget(ad);
            const linked =
                (target.productId != null && productById.get(Number(target.productId))) ||
                (target.productCode && productByCode.get(String(target.productCode)));

            if (!linked) {
                console.warn("Failed to hydrate Product Promote public ad", {
                    adId: ad.adId || ad.ad_id,
                    productId: target.productId,
                    productCode: target.productCode,
                });
                return null;
            }

            const productImage = getMediaUrl(linked.image_url) || getMediaUrl(ad.media_preview) || '/assets/images/googer.png';
            const price = Number(linked.price || ad.price || 0);
            const promoPrice = linked.promo_price ?? ad.promo_price ?? null;
            const linkedVariants = Array.isArray(linked.variants) ? linked.variants : [];
            const sizes = Array.isArray(linked.sizes)
                ? linked.sizes
                : deriveVariantSizes(linkedVariants);
            const colors = Array.isArray(linked.colors)
                ? linked.colors
                : deriveVariantColors(linkedVariants);
            return {
                ...ad,
                ...linked,
                id: Number(linked.id),
                adId: ad.adId || ad.ad_id,
                ad_id: ad.ad_id || ad.adId,
                ad_owner_user_id: ad.user_id || ad.userId,
                advertiser_id: ad.user_id || ad.userId,
                title: linked.title || ad.title,
                description: linked.description || ad.description || '',
                category: linked.category || ad.category,
                sub_category: linked.sub_category || ad.sub_category || null,
                manual_category: linked.manual_category || ad.manual_category || null,
                stock: linked.stock,
                price,
                main_price: price,
                product_price: price,
                promo_price: promoPrice,
                sizes,
                colors,
                image_url: productImage,
                main_image: productImage,
                media_url: productImage,
                thumbnail_url: productImage,
                media_preview: productImage,
                images: normalizeMediaGallery([productImage, ...(Array.isArray(linked.media_gallery) ? linked.media_gallery : []), ...(Array.isArray(ad.media_gallery) ? ad.media_gallery : [])]),
                media_gallery: normalizeMediaGallery([productImage, ...(Array.isArray(linked.media_gallery) ? linked.media_gallery : []), ...(Array.isArray(ad.media_gallery) ? ad.media_gallery : [])]),
                variants: linked.variants || [],
                shipping_info: linked.shipping_info || null,
                payment_methods: linked.payment_methods || null,
                commission_info: linked.commission_info || null,
                created_at: linked.created_at || ad.created_at,
                product_code: linked.product_code || ad.product_code,
                linked_product_share_code: linked.product_code || ad.linked_product_share_code,
                linked_product_code: linked.product_code || ad.linked_product_code,
                linked_product_id: linked.id,
                product_id: linked.id,
                productId: linked.id,
                share_code: linked.product_code || ad.share_code || String(linked.id),
                shareCode: linked.product_code || ad.shareCode || String(linked.id),
                profile_picture: linked.profile_picture || ad.profile_picture,
                user: {
                    ...(ad.user || {}),
                    id: linked.user_id,
                    username: linked.owner_username || ad.user?.username || ad.username,
                    profile_picture: linked.profile_picture || ad.user?.profile_picture || ad.profile_picture || null,
                },
                is_sponsored: true,
                isAd: true,
                campaign_type: 'Product Promote',
                likes_count: Number(ad.likes_count || 0),
                likeCount: Number(ad.likes_count || 0),
                comments_count: Number(ad.comments_count || 0),
                commentCount: Number(ad.comments_count || 0),
                shares_count: Number(ad.shares_count || 0),
                shareCount: Number(ad.shares_count || 0),
                views_count: Number(ad.views_count || ad.impressions || 0),
                viewCount: Number(ad.views_count || ad.impressions || 0),
                user_liked: !!ad.user_liked,
                ad_coin_collected: !!ad.ad_coin_collected,
                ad_like_locked: !!ad.ad_coin_collected,
            };
        }).filter(Boolean);

        return res.status(200).json({
            success: true,
            ads: hydratedAds,
            pagination: {
                limit,
                offset,
                nextOffset: offset + hydratedAds.length,
                hasMore: rows.length > limit,
            },
        });
    } catch (error) {
        console.error('Get active public ads error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch active ads' });
    }
};

exports.getAdPublic = async (req, res) => {
    try {
        await ensureAdsTable();
        const { adId } = req.params;
        const result = await pool.query(
            `SELECT a.*, u.username AS owner_username_joined, u.profile_picture
             FROM ads a
             LEFT JOIN users u ON a.user_id = u.id
             WHERE a.ad_id = $1
             LIMIT 1`,
            [adId]
        );

        if (!result.rows.length) {
            return res.status(404).json({ success: false, message: 'Ad not found' });
        }

        return res.status(200).json({ success: true, ad: mapRow(result.rows[0]) });
    } catch (error) {
        console.error('Get ad public error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch ad' });
    }
};

exports.updateAdReach = async (req, res) => {
    try {
        await ensureAdsTable();
        const { adId } = req.params;
        const { reach } = req.body;

        if (typeof reach !== 'number' || reach < 0) {
            return res.status(400).json({ success: false, message: 'reach must be a non-negative number' });
        }

        const ad = await recordAdImpression(pool, adId, reach);

        if (!ad) {
            return res.status(404).json({ success: false, message: 'Ad not found' });
        }

        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('updateAdReach error:', error);
        return res.status(500).json({ success: false, message: 'Failed to update ad reach' });
    }
};
