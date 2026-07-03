const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { extractAuthToken, getJwtSecret } = require('../../../../shared/api/authToken');
const { saveDataUrl, saveUploadedFiles } = require('../modules/media');
const { normalizeMoney, resolveGoogerMainWalletUserId } = require('../../../../shared/utils/financeBoundary');
const {
    creditWalletBalance,
    debitWalletBalance,
    insertWalletTransfer,
    lockWalletUsers,
} = require('../../../../shared/utils/financeCommands');

const TOPIC_FALLBACK = 'Technology';
const VALID_STATUSES = new Set(['Pending Approval', 'Approved', 'Rejected']);
const VALID_ACCESS_MODES = new Set(['blurred', 'unblurred']);
const VALID_VISIBILITIES = new Set(['public', 'subscribers_only', 'private']);
const VALID_PREVIEW_MODES = new Set(['thumbnail', 'auto_preview']);
const MAX_UPLOAD_IMAGES = 5;
const DEFAULT_CONTENT_LIMITS = {
    basic_total_uploads: 5,
    paid_total_uploads: 15,
    basic_daily_uploads: 1,
    paid_daily_uploads: 3,
    basic_video_limit_minutes: 1,
    paid_video_limit_minutes: 5,
    content_expiry_value: 1,
    content_expiry_unit: 'unlimited',
};
const DEFAULT_UPLOAD_CONTROL_SETTINGS = {
    min_upload_price: 100,
    max_upload_price: 10000,
    commission_tiers: [],
    subscription_commission_tiers: [],
};

let schemaReady = false;
let schemaPromise = null;

const loadUploadControlSettings = async () => {
    try {
        const { rows } = await pool.query(`
            SELECT min_upload_price, max_upload_price, commission_tiers, subscription_commission_tiers
            FROM upload_control_settings
            ORDER BY id ASC
            LIMIT 1
        `);
        const row = rows[0] || {};
        return {
            min_upload_price: Number(row.min_upload_price ?? DEFAULT_UPLOAD_CONTROL_SETTINGS.min_upload_price),
            max_upload_price: Number(row.max_upload_price ?? DEFAULT_UPLOAD_CONTROL_SETTINGS.max_upload_price),
            commission_tiers: Array.isArray(row.commission_tiers)
                ? row.commission_tiers
                    .map((tier) => ({
                        min: Number(tier?.min ?? 0),
                        max: Number(tier?.max ?? 0),
                        commission: Number(tier?.commission ?? 0),
                    }))
                    .filter((tier) => Number.isFinite(tier.min) && Number.isFinite(tier.max) && Number.isFinite(tier.commission))
                : DEFAULT_UPLOAD_CONTROL_SETTINGS.commission_tiers,
            subscription_commission_tiers: Array.isArray(row.subscription_commission_tiers)
                ? row.subscription_commission_tiers
                    .map((tier) => ({
                        min: Number(tier?.min ?? 0),
                        max: Number(tier?.max ?? 0),
                        commission: Number(tier?.commission ?? 0),
                    }))
                    .filter((tier) => Number.isFinite(tier.min) && Number.isFinite(tier.max) && Number.isFinite(tier.commission))
                : DEFAULT_UPLOAD_CONTROL_SETTINGS.subscription_commission_tiers,
        };
    } catch (error) {
        if (error && error.code === '42P01') {
            return DEFAULT_UPLOAD_CONTROL_SETTINGS;
        }
        throw error;
    }
};

const ensureSchema = async () => {
    if (schemaReady) return;
    if (schemaPromise) return schemaPromise;
    schemaPromise = (async () => {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS upload_contents (
                id SERIAL PRIMARY KEY,
                content_id VARCHAR(24) NOT NULL UNIQUE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                owner_user_id VARCHAR(80),
                owner_username VARCHAR(120),
                content_type VARCHAR(20) NOT NULL DEFAULT 'vault',
                description TEXT NOT NULL DEFAULT '',
                topic VARCHAR(80) NOT NULL DEFAULT '${TOPIC_FALLBACK}',
                price NUMERIC(12, 2) NOT NULL DEFAULT 0,
                subscription_packages JSONB NOT NULL DEFAULT '[]'::jsonb,
                affiliate_commission NUMERIC(8, 2) NOT NULL DEFAULT 0,
                hashtags JSONB NOT NULL DEFAULT '[]'::jsonb,
                allow_comments BOOLEAN NOT NULL DEFAULT true,
                show_link_on_home BOOLEAN NOT NULL DEFAULT false,
                external_link TEXT,
                media_type VARCHAR(20) NOT NULL DEFAULT '',
                media_preview TEXT,
                media_gallery JSONB NOT NULL DEFAULT '[]'::jsonb,
                thumbnail_url TEXT,
                content_access_mode VARCHAR(20) NOT NULL DEFAULT 'unblurred',
                visibility VARCHAR(24) NOT NULL DEFAULT 'public',
                preview_mode VARCHAR(20) NOT NULL DEFAULT 'thumbnail',
                preview_url TEXT,
                status VARCHAR(30) NOT NULL DEFAULT 'Pending Approval',
                rejection_reason TEXT,
                admin_note TEXT,
                approved_at TIMESTAMP NULL,
                expires_at TIMESTAMP NULL,
                likes_count INTEGER NOT NULL DEFAULT 0,
                comments_count INTEGER NOT NULL DEFAULT 0,
                shares_count INTEGER NOT NULL DEFAULT 0,
                reposts_count INTEGER NOT NULL DEFAULT 0,
                views_count INTEGER NOT NULL DEFAULT 0,
                reports_count INTEGER NOT NULL DEFAULT 0,
                pinned_at TIMESTAMP NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_upload_contents_status_created_at
                ON upload_contents(status, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_upload_contents_topic_status
                ON upload_contents(topic, status);
            CREATE INDEX IF NOT EXISTS idx_upload_contents_user_id
                ON upload_contents(user_id, created_at DESC);
        `);
        await pool.query(`
            ALTER TABLE upload_contents
                ADD COLUMN IF NOT EXISTS owner_user_id VARCHAR(80),
                ADD COLUMN IF NOT EXISTS owner_username VARCHAR(120),
                ADD COLUMN IF NOT EXISTS content_type VARCHAR(20) NOT NULL DEFAULT 'vault',
                ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '',
                ADD COLUMN IF NOT EXISTS topic VARCHAR(80) NOT NULL DEFAULT '${TOPIC_FALLBACK}',
                ADD COLUMN IF NOT EXISTS price NUMERIC(12, 2) NOT NULL DEFAULT 0,
                ADD COLUMN IF NOT EXISTS subscription_packages JSONB NOT NULL DEFAULT '[]'::jsonb,
                ADD COLUMN IF NOT EXISTS affiliate_commission NUMERIC(8, 2) NOT NULL DEFAULT 0,
                ADD COLUMN IF NOT EXISTS hashtags JSONB NOT NULL DEFAULT '[]'::jsonb,
                ADD COLUMN IF NOT EXISTS allow_comments BOOLEAN NOT NULL DEFAULT true,
                ADD COLUMN IF NOT EXISTS show_link_on_home BOOLEAN NOT NULL DEFAULT false,
                ADD COLUMN IF NOT EXISTS external_link TEXT,
                ADD COLUMN IF NOT EXISTS media_type VARCHAR(20) NOT NULL DEFAULT '',
                ADD COLUMN IF NOT EXISTS media_preview TEXT,
                ADD COLUMN IF NOT EXISTS media_gallery JSONB NOT NULL DEFAULT '[]'::jsonb,
                ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
                ADD COLUMN IF NOT EXISTS content_access_mode VARCHAR(20) NOT NULL DEFAULT 'unblurred',
                ADD COLUMN IF NOT EXISTS visibility VARCHAR(24) NOT NULL DEFAULT 'public',
                ADD COLUMN IF NOT EXISTS preview_mode VARCHAR(20) NOT NULL DEFAULT 'thumbnail',
                ADD COLUMN IF NOT EXISTS preview_url TEXT,
                ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'Pending Approval',
                ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
                ADD COLUMN IF NOT EXISTS admin_note TEXT,
                ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP NULL,
                ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP NULL,
                ADD COLUMN IF NOT EXISTS likes_count INTEGER NOT NULL DEFAULT 0,
                ADD COLUMN IF NOT EXISTS comments_count INTEGER NOT NULL DEFAULT 0,
                ADD COLUMN IF NOT EXISTS shares_count INTEGER NOT NULL DEFAULT 0,
                ADD COLUMN IF NOT EXISTS reposts_count INTEGER NOT NULL DEFAULT 0,
                ADD COLUMN IF NOT EXISTS views_count INTEGER NOT NULL DEFAULT 0,
                ADD COLUMN IF NOT EXISTS reports_count INTEGER NOT NULL DEFAULT 0,
                ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMP NULL,
                ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS upload_content_likes (
                id SERIAL PRIMARY KEY,
                content_id INTEGER NOT NULL REFERENCES upload_contents(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(content_id, user_id)
            );
            CREATE INDEX IF NOT EXISTS idx_upload_content_likes_content_id
                ON upload_content_likes(content_id, created_at DESC);
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS upload_content_comments (
                id SERIAL PRIMARY KEY,
                content_id INTEGER NOT NULL REFERENCES upload_contents(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                parent_id INTEGER NULL REFERENCES upload_content_comments(id) ON DELETE CASCADE,
                comment_text TEXT NOT NULL,
                likes INTEGER NOT NULL DEFAULT 0,
                dislikes INTEGER NOT NULL DEFAULT 0,
                reports INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_upload_content_comments_content_id
                ON upload_content_comments(content_id, created_at ASC);
            CREATE INDEX IF NOT EXISTS idx_upload_content_comments_parent_id
                ON upload_content_comments(parent_id);
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS upload_content_comment_likes (
                id SERIAL PRIMARY KEY,
                comment_id INTEGER NOT NULL REFERENCES upload_content_comments(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(comment_id, user_id)
            );
            CREATE TABLE IF NOT EXISTS upload_content_comment_dislikes (
                id SERIAL PRIMARY KEY,
                comment_id INTEGER NOT NULL REFERENCES upload_content_comments(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(comment_id, user_id)
            );
            CREATE TABLE IF NOT EXISTS upload_content_comment_reports (
                id SERIAL PRIMARY KEY,
                comment_id INTEGER NOT NULL REFERENCES upload_content_comments(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(comment_id, user_id)
            );
            CREATE TABLE IF NOT EXISTS upload_content_reports (
                id SERIAL PRIMARY KEY,
                content_id INTEGER NOT NULL REFERENCES upload_contents(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                reason VARCHAR(120) NOT NULL DEFAULT '',
                custom_reason TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(content_id, user_id)
            );
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS upload_content_shares (
                id SERIAL PRIMARY KEY,
                content_id INTEGER NOT NULL REFERENCES upload_contents(id) ON DELETE CASCADE,
                user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_upload_content_shares_content_id
                ON upload_content_shares(content_id, created_at DESC);
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS upload_content_reposts (
                id SERIAL PRIMARY KEY,
                content_id INTEGER NOT NULL REFERENCES upload_contents(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(content_id, user_id)
            );
            CREATE INDEX IF NOT EXISTS idx_upload_content_reposts_content_id
                ON upload_content_reposts(content_id, created_at DESC);
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS upload_content_views (
                id SERIAL PRIMARY KEY,
                content_id INTEGER NOT NULL REFERENCES upload_contents(id) ON DELETE CASCADE,
                user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
                viewer_key VARCHAR(160),
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_upload_content_views_content_id
                ON upload_content_views(content_id, created_at DESC);
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS upload_content_subscriptions (
                id SERIAL PRIMARY KEY,
                buyer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                creator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                content_id INTEGER NOT NULL REFERENCES upload_contents(id) ON DELETE CASCADE,
                package_id VARCHAR(120) NOT NULL,
                package_days INTEGER NOT NULL,
                amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
                commission_percentage NUMERIC(8, 2) NOT NULL DEFAULT 0,
                commission_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
                creator_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
                wallet_transfer_id INTEGER NULL,
                starts_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_upload_content_subscriptions_buyer_creator
                ON upload_content_subscriptions(buyer_id, creator_id, expires_at DESC);
            CREATE INDEX IF NOT EXISTS idx_upload_content_subscriptions_content
                ON upload_content_subscriptions(content_id, created_at DESC);
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS upload_content_purchases (
                id SERIAL PRIMARY KEY,
                buyer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                creator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                content_id INTEGER NOT NULL REFERENCES upload_contents(id) ON DELETE CASCADE,
                amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
                commission_percentage NUMERIC(8, 2) NOT NULL DEFAULT 0,
                commission_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
                creator_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
                wallet_transfer_id INTEGER NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(buyer_id, content_id)
            );
            CREATE INDEX IF NOT EXISTS idx_upload_content_purchases_buyer
                ON upload_content_purchases(buyer_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_upload_content_purchases_content
                ON upload_content_purchases(content_id, created_at DESC);
        `);
        schemaReady = true;
    })();
    try {
        await schemaPromise;
    } finally {
        schemaPromise = null;
    }
};

const toUtcIso = (value) => {
    if (!value) return null;
    const raw = value instanceof Date ? value.toISOString() : String(value).trim().replace(' ', 'T');
    const parsed = new Date(raw.endsWith('Z') ? raw : `${raw}Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const parseJsonField = (value, fallback) => {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
};

const parseHashtags = (value) => {
    const rawValues = Array.isArray(value)
        ? value
        : String(value || '')
            .split(/[\s,]+/)
            .map((item) => item.trim())
            .filter(Boolean);

    return rawValues
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .map((item) => item.startsWith('#') ? item : `#${item}`)
        .map((item) => item.replace(/[^#\w]/g, ''))
        .filter((item) => item.length > 1)
        .slice(0, 20);
};

const parseSubscriptionPackages = (value) => {
    const parsed = parseJsonField(value, []);
    if (!Array.isArray(parsed)) return [];
    return parsed
        .map((item, index) => {
            const price = Number(item?.price ?? 0);
            const days = Number(item?.days ?? 0);
            const affiliateCommission = Number(item?.affiliateCommission ?? item?.affiliate_commission ?? 0);
            if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(days) || days <= 0) {
                return null;
            }
            return {
                id: String(item?.id || `package-${index + 1}`),
                price: Math.round(price),
                days: Math.max(1, Math.round(days)),
                affiliateCommission: Number.isFinite(affiliateCommission)
                    ? Math.min(100, Math.max(0, affiliateCommission))
                    : 0,
            };
        })
        .filter(Boolean)
        .slice(0, 3);
};

const normalizeBoolean = (value, fallback = false) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
        if (['false', '0', 'no', 'n'].includes(normalized)) return false;
    }
    return fallback;
};

const normalizeStatus = (value) => {
    const raw = String(value || '').trim();
    if (VALID_STATUSES.has(raw)) return raw;
    const normalized = raw.toLowerCase().replace(/[_-]+/g, ' ');
    if (normalized === 'approved' || normalized === 'active') return 'Approved';
    if (normalized === 'rejected' || normalized === 'declined') return 'Rejected';
    return 'Pending Approval';
};

const normalizeVisibility = (value) => {
    const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    return VALID_VISIBILITIES.has(normalized) ? normalized : 'public';
};

const normalizeContentType = (value) => {
    const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    return normalized === 'flash' || normalized === 'flash_content' ? 'flash' : 'vault';
};

const buildContentId = () => `${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`;

const mapRow = (row) => {
    const mediaGallery = Array.isArray(row.media_gallery)
        ? row.media_gallery
        : parseJsonField(row.media_gallery, []);
    const subscriptionPackages = Array.isArray(row.subscription_packages)
        ? row.subscription_packages
        : parseJsonField(row.subscription_packages, []);
    return {
        id: row.id,
        contentId: row.content_id,
        content_id: row.content_id,
        user_id: row.user_id,
        owner_user_id: row.owner_user_id || null,
        owner_username: row.owner_username || null,
        content_type: row.content_type === 'flash' ? 'flash' : 'vault',
        description: row.description || '',
        topic: row.topic || TOPIC_FALLBACK,
        price: Number(row.price || 0),
        subscription_packages: parseSubscriptionPackages(subscriptionPackages),
        affiliate_commission: Number(row.affiliate_commission || 0),
        hashtags: parseHashtags(row.hashtags),
        allow_comments: !!row.allow_comments,
        show_link_on_home: !!row.show_link_on_home,
        external_link: row.external_link || '',
        media_type: row.media_type || '',
        media_preview: row.media_preview || '',
        media_gallery: Array.isArray(mediaGallery) ? mediaGallery : [],
        thumbnail_url: row.thumbnail_url || '',
        content_access_mode: VALID_ACCESS_MODES.has(row.content_access_mode) ? row.content_access_mode : 'unblurred',
        visibility: normalizeVisibility(row.visibility),
        preview_mode: VALID_PREVIEW_MODES.has(row.preview_mode) ? row.preview_mode : 'thumbnail',
        preview_url: row.preview_url || '',
        status: normalizeStatus(row.status),
        rejection_reason: row.rejection_reason || null,
        admin_note: row.admin_note || null,
        approved_at: toUtcIso(row.approved_at),
        expires_at: toUtcIso(row.expires_at),
        likes_count: Number(row.likes_count || 0),
        likeCount: Number(row.likes_count || 0),
        comments_count: Number(row.comments_count || 0),
        commentCount: Number(row.comments_count || 0),
        shares_count: Number(row.shares_count || 0),
        shareCount: Number(row.shares_count || 0),
        reposts_count: Number(row.reposts_count || 0),
        repostCount: Number(row.reposts_count || 0),
        views_count: Number(row.views_count || 0),
        viewCount: Number(row.views_count || 0),
        reports_count: Number(row.reports_count || 0),
        user_liked: !!row.user_liked,
        user_purchased: !!row.user_purchased,
        user_has_access: !!row.user_has_access || !!row.user_purchased,
        pinned_at: toUtcIso(row.pinned_at),
        created_at: toUtcIso(row.created_at),
        updated_at: toUtcIso(row.updated_at),
    };
};

const assertAdmin = async (userId) => {
    const result = await pool.query('SELECT user_type FROM users WHERE id = $1 LIMIT 1', [userId]);
    return String(result.rows[0]?.user_type || '').toLowerCase() === 'admin';
};

const parseExtra = (value) => {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch {
        return {};
    }
};

const getUploadContentPlanLimits = async (userId) => {
    let plan = null;
    const activePlan = await pool.query(
        `SELECT sp.id, sp.slug, sp.name, sp.price, sp.sort_order, sp.extra
         FROM user_plan_subscriptions ups
         JOIN subscription_plans sp ON sp.id = ups.plan_id
         WHERE ups.user_id = $1
           AND ups.status = 'active'
           AND (ups.expires_at IS NULL OR ups.expires_at > NOW())
         ORDER BY ups.started_at DESC, ups.id DESC
         LIMIT 1`,
        [userId]
    ).catch(() => ({ rows: [] }));

    if (activePlan.rows.length > 0) {
        plan = activePlan.rows[0];
    } else {
        const basicPlan = await pool.query(
            `SELECT id, slug, name, price, sort_order, extra FROM subscription_plans WHERE slug = 'basic' LIMIT 1`
        ).catch(() => ({ rows: [] }));
        plan = basicPlan.rows[0] || { slug: 'basic', name: 'Basic', extra: {} };
    }

    const extra = parseExtra(plan.extra);
    const isBasic = String(plan.slug || '').toLowerCase() === 'basic';
    const totalUploads = Number(extra.content_upload_limit ?? (isBasic ? DEFAULT_CONTENT_LIMITS.basic_total_uploads : DEFAULT_CONTENT_LIMITS.paid_total_uploads));
    const dailyUploads = Number(extra.content_daily_upload_limit ?? (isBasic ? DEFAULT_CONTENT_LIMITS.basic_daily_uploads : DEFAULT_CONTENT_LIMITS.paid_daily_uploads));
    const videoLimitMinutes = Number(extra.content_video_limit_minutes ?? (isBasic ? DEFAULT_CONTENT_LIMITS.basic_video_limit_minutes : DEFAULT_CONTENT_LIMITS.paid_video_limit_minutes));
    const contentExpiryUnit = String(extra.content_expiry_unit || DEFAULT_CONTENT_LIMITS.content_expiry_unit).toLowerCase();
    const contentExpiryValue = Number(extra.content_expiry_value ?? DEFAULT_CONTENT_LIMITS.content_expiry_value);
    const allowedExpiryUnits = new Set(['minutes', 'days', 'months', 'unlimited']);

    return {
        planId: plan.id || null,
        planSlug: plan.slug || (isBasic ? 'basic' : ''),
        planName: plan.name || (isBasic ? 'Basic' : 'Current plan'),
        planPrice: plan.price ?? null,
        sortOrder: Number(plan.sort_order || 0),
        totalUploads: Number.isFinite(totalUploads) ? Math.max(0, Math.floor(totalUploads)) : (isBasic ? DEFAULT_CONTENT_LIMITS.basic_total_uploads : DEFAULT_CONTENT_LIMITS.paid_total_uploads),
        dailyUploads: Number.isFinite(dailyUploads) ? Math.max(0, Math.floor(dailyUploads)) : (isBasic ? DEFAULT_CONTENT_LIMITS.basic_daily_uploads : DEFAULT_CONTENT_LIMITS.paid_daily_uploads),
        videoLimitSeconds: Number.isFinite(videoLimitMinutes) && videoLimitMinutes > 0
            ? Math.round(videoLimitMinutes * 60)
            : (isBasic ? DEFAULT_CONTENT_LIMITS.basic_video_limit_minutes : DEFAULT_CONTENT_LIMITS.paid_video_limit_minutes) * 60,
        contentExpiryValue: Number.isFinite(contentExpiryValue) ? Math.max(1, Math.floor(contentExpiryValue)) : DEFAULT_CONTENT_LIMITS.content_expiry_value,
        contentExpiryUnit: allowedExpiryUnits.has(contentExpiryUnit) ? contentExpiryUnit : DEFAULT_CONTENT_LIMITS.content_expiry_unit,
    };
};

const getNextUploadContentPlan = async (currentLimits) => {
    const currentTotal = Number(currentLimits?.totalUploads || 0);
    const currentPrice = Number(currentLimits?.planPrice || 0);
    const currentSort = Number(currentLimits?.sortOrder || 0);
    const currentId = Number(currentLimits?.planId || 0);
    const result = await pool.query(
        `SELECT id, slug, name, price, duration_days, sort_order, extra
         FROM subscription_plans
         WHERE is_active = TRUE
           AND is_free = FALSE
           AND ($1::int IS NULL OR id <> $1)
         ORDER BY sort_order ASC, price ASC`,
        [Number.isFinite(currentId) && currentId > 0 ? currentId : null]
    ).catch(() => ({ rows: [] }));

    const candidates = (result.rows || [])
        .map((plan) => {
            const extra = parseExtra(plan.extra);
            const contentLimit = Number(extra.content_upload_limit ?? DEFAULT_CONTENT_LIMITS.paid_total_uploads);
            return {
                id: plan.id,
                slug: plan.slug,
                name: plan.name,
                price: plan.price,
                duration_days: plan.duration_days,
                sort_order: Number(plan.sort_order || 0),
                content_upload_limit: Number.isFinite(contentLimit) ? Math.max(0, Math.floor(contentLimit)) : DEFAULT_CONTENT_LIMITS.paid_total_uploads,
            };
        })
        .filter((plan) => {
            if (currentTotal > 0 && plan.content_upload_limit > currentTotal) return true;
            if (plan.sort_order > currentSort) return true;
            return Number(plan.price || 0) > currentPrice;
        });

    return candidates[0] || null;
};

const buildContentExpirySql = (limits) => {
    if (!limits || limits.contentExpiryUnit === 'unlimited') return null;
    return `CURRENT_TIMESTAMP + INTERVAL '${limits.contentExpiryValue} ${limits.contentExpiryUnit}'`;
};

const parseRequestBody = (req) => {
    let body = req.body || {};
    if (typeof req.body?.data === 'string') {
        try {
            body = JSON.parse(req.body.data);
        } catch (error) {
            console.error('Failed to parse upload content payload:', error);
        }
    }
    return body || {};
};

const parseOptionalUserIdFromRequest = (req) => {
    const token = extractAuthToken(req.header('Authorization'));
    if (!token) return null;
    try {
        const secret = getJwtSecret();
        if (!secret) return null;
        const decoded = jwt.verify(token, secret);
        const userId = Number(decoded?.id || decoded?.userId || 0);
        return Number.isFinite(userId) && userId > 0 ? userId : null;
    } catch {
        return null;
    }
};

const resolveContentLookup = async (identifier, extraColumns = '') => {
    const rawIdentifier = String(identifier || '').trim();
    if (!rawIdentifier) return null;
    const numericId = /^\d+$/.test(rawIdentifier) ? Number(rawIdentifier) : null;
    const result = await pool.query(
        `SELECT uc.*${extraColumns ? `, ${extraColumns}` : ''}
         FROM upload_contents uc
         WHERE uc.content_id = $1
            OR ($2::int IS NOT NULL AND uc.id = $2)
         LIMIT 1`,
        [rawIdentifier, numericId]
    );
    return result.rows[0] || null;
};

const mapActorRow = (row) => ({
    id: row.id,
    user_id: row.user_id,
    username: row.username || row.full_name || 'Anonymous',
    full_name: row.full_name || row.username || 'Anonymous',
    profile_picture: row.profile_picture || null,
    created_at: toUtcIso(row.created_at),
});

const mapCommentRow = (row) => ({
    id: row.id,
    content_id: row.content_id,
    user_id: row.user_id,
    parent_id: row.parent_id,
    comment_text: row.comment_text,
    text: row.comment_text,
    username: row.username || row.full_name || 'Anonymous',
    full_name: row.full_name || row.username || 'Anonymous',
    profile_picture: row.profile_picture || null,
    likes: Number(row.likes || 0),
    dislikes: Number(row.dislikes || 0),
    reports: Number(row.reports || 0),
    user_liked: !!row.user_liked,
    user_disliked: !!row.user_disliked,
    created_at: toUtcIso(row.created_at),
    updated_at: toUtcIso(row.updated_at),
});

const syncContentCounters = async (contentDbId) => {
    if (!contentDbId) return;
    await pool.query(
        `UPDATE upload_contents uc
         SET likes_count = COALESCE(l.like_count, 0),
             comments_count = COALESCE(c.comment_count, 0),
             shares_count = COALESCE(s.share_count, 0),
             reposts_count = COALESCE(r.repost_count, 0),
             views_count = COALESCE(v.view_count, 0),
             updated_at = CURRENT_TIMESTAMP
         FROM (
             SELECT $1::int AS id
         ) src
         LEFT JOIN (
             SELECT content_id, COUNT(*)::int AS like_count
             FROM upload_content_likes
             WHERE content_id = $1
             GROUP BY content_id
         ) l ON l.content_id = src.id
         LEFT JOIN (
             SELECT content_id, COUNT(*)::int AS comment_count
             FROM upload_content_comments
             WHERE content_id = $1
             GROUP BY content_id
         ) c ON c.content_id = src.id
         LEFT JOIN (
             SELECT content_id, COUNT(*)::int AS share_count
             FROM upload_content_shares
             WHERE content_id = $1
             GROUP BY content_id
          ) s ON s.content_id = src.id
          LEFT JOIN (
              SELECT content_id, COUNT(*)::int AS repost_count
              FROM upload_content_reposts
              WHERE content_id = $1
              GROUP BY content_id
          ) r ON r.content_id = src.id
          LEFT JOIN (
             SELECT content_id, COUNT(*)::int AS view_count
             FROM upload_content_views
             WHERE content_id = $1
             GROUP BY content_id
         ) v ON v.content_id = src.id
         WHERE uc.id = src.id`,
        [contentDbId]
    );
};

const getViewerKey = (req) => {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const direct = String(req.ip || req.socket?.remoteAddress || '').trim();
    const agent = String(req.headers['user-agent'] || '').trim();
    return [forwarded || direct, agent].filter(Boolean).join('|').slice(0, 150) || null;
};

const loadCurrentSubscriptionCommissionForPrice = async (price) => {
    const settings = await loadUploadControlSettings();
    const tiers = Array.isArray(settings.subscription_commission_tiers)
        ? settings.subscription_commission_tiers
        : [];
    const matchingTier = tiers.find((tier) => price >= Number(tier.min) && price <= Number(tier.max));
    if (!matchingTier) return 0;
    return Math.min(100, Math.max(0, Number(matchingTier.commission || 0)));
};

const loadCurrentVaultCommissionForPrice = async (price) => {
    const settings = await loadUploadControlSettings();
    const tiers = Array.isArray(settings.commission_tiers)
        ? settings.commission_tiers
        : [];
    const matchingTier = tiers.find((tier) => price >= Number(tier.min) && price <= Number(tier.max));
    if (!matchingTier) return 0;
    return Math.min(100, Math.max(0, Number(matchingTier.commission || 0)));
};

exports.createUploadContent = async (req, res) => {
    try {
        await ensureSchema();
        const body = parseRequestBody(req);
        const userId = req.user.id;
        const uploadControlSettings = await loadUploadControlSettings();
        const sponsorResult = await pool.query(
            'SELECT user_id, username FROM users WHERE id = $1 LIMIT 1',
            [userId]
        );
        const sponsor = sponsorResult.rows[0];
        if (!sponsor) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const contentId = String(body.contentId || body.content_id || buildContentId()).trim();
        const description = String(body.description || '').trim();
        const topic = String(body.topic || '').trim();
        const price = Number(body.price ?? 0);
        const contentType = normalizeContentType(body.contentType ?? body.content_type);
        const subscriptionPackages = parseSubscriptionPackages(body.subscriptionPackages ?? body.subscription_packages);
        const hasSubmittedAffiliateCommission = body.affiliateCommission !== undefined || body.affiliate_commission !== undefined;
        let affiliateCommission = Number(body.affiliateCommission ?? body.affiliate_commission ?? 0);
        const hashtags = parseHashtags(body.hashtags);
        const allowComments = normalizeBoolean(body.allowComments ?? body.allow_comments, true);
        const showLinkOnHome = normalizeBoolean(body.showLinkedContentOnHome ?? body.show_link_on_home, false);
        const visibility = normalizeVisibility(body.visibility);
        const requestedPreviewMode = String(body.previewMode || body.preview_mode || '').trim();
        let previewMode = VALID_PREVIEW_MODES.has(requestedPreviewMode) ? requestedPreviewMode : 'thumbnail';
        const externalLink = String(body.externalLink || body.external_link || body.activeLink || '').trim();
        let accessMode = VALID_ACCESS_MODES.has(String(body.contentAccessMode || body.content_access_mode || '').trim())
            ? String(body.contentAccessMode || body.content_access_mode).trim()
            : 'unblurred';
        const mediaType = String(body.mediaType || body.media_type || '').trim();
        let mediaPreview = String(body.mediaPreview || body.media_preview || '').trim();
        let mediaGallery = parseJsonField(body.mediaGallery || body.media_gallery, []);
        let thumbnailUrl = String(body.thumbnailPreview || body.thumbnail_url || '').trim();
        let previewUrl = String(body.previewUrl || body.preview_url || '').trim();
        const submittedVideoDurationSeconds = Number(body.videoDurationSeconds ?? body.video_duration_seconds ?? 0);
        const contentFiles = Array.isArray(req.files) ? req.files : (req.files?.images || []);
        const previewFiles = Array.isArray(req.files) ? [] : (req.files?.preview || []);

        if (!contentId) {
            return res.status(400).json({ success: false, message: 'Content ID is required.' });
        }
        if (!topic) {
            return res.status(400).json({ success: false, message: 'Category is required.' });
        }
        if (!Number.isFinite(price) || price <= 0) {
            return res.status(400).json({ success: false, message: 'Content price is required.' });
        }
        if (contentType === 'vault') {
            const minUploadPrice = Number(uploadControlSettings.min_upload_price ?? 0);
            const maxUploadPrice = Number(uploadControlSettings.max_upload_price ?? minUploadPrice);
            if (price < minUploadPrice || price > maxUploadPrice) {
                return res.status(400).json({
                    success: false,
                    message: `Content price must stay between R ${Math.round(minUploadPrice)} and R ${Math.round(maxUploadPrice)}.`,
                });
            }
            const commissionTiers = Array.isArray(uploadControlSettings.commission_tiers)
                ? uploadControlSettings.commission_tiers
                : [];
            const matchingCommissionTier = commissionTiers.find((tier) => price >= Number(tier.min) && price <= Number(tier.max));
            if (!hasSubmittedAffiliateCommission) {
                affiliateCommission = matchingCommissionTier
                    ? Math.min(100, Math.max(0, Number(matchingCommissionTier.commission || 0)))
                    : 0;
            }
            const subscriptionTiers = Array.isArray(uploadControlSettings.subscription_commission_tiers)
                ? uploadControlSettings.subscription_commission_tiers
                : [];
            for (const item of subscriptionPackages) {
                if (subscriptionTiers.length > 0) {
                    const matchingTier = subscriptionTiers.find((tier) => item.price >= Number(tier.min) && item.price <= Number(tier.max));
                    if (!matchingTier) {
                        const minimum = Math.min(...subscriptionTiers.map((tier) => Number(tier.min)));
                        const maximum = Math.max(...subscriptionTiers.map((tier) => Number(tier.max)));
                        return res.status(400).json({
                            success: false,
                            message: `Please add a subscription package price within the available price range (R ${minimum.toLocaleString()} - R ${maximum.toLocaleString()}).`,
                        });
                    }
                    item.affiliateCommission = Math.min(100, Math.max(0, Number(matchingTier.commission || 0)));
                } else {
                    item.affiliateCommission = 0;
                }
            }
        }
        if (!Number.isFinite(affiliateCommission) || affiliateCommission < 0 || affiliateCommission > 100) {
            return res.status(400).json({ success: false, message: 'Affiliate commission must be between 0 and 100.' });
        }
        if (contentType === 'flash') {
            if (mediaType !== 'video' && mediaType !== 'link') {
                return res.status(400).json({ success: false, message: 'Flash Content supports videos and video links only.' });
            }
            accessMode = 'unblurred';
        }
        const submittedGalleryCount = Array.isArray(mediaGallery) ? mediaGallery.filter(Boolean).length : 0;
        const uploadedImageCount = contentFiles.filter((file) => String(file?.mimetype || '').startsWith('image/')).length;
        if (uploadedImageCount > MAX_UPLOAD_IMAGES || (!contentFiles.length && submittedGalleryCount > MAX_UPLOAD_IMAGES)) {
            return res.status(400).json({ success: false, message: `You can upload up to ${MAX_UPLOAD_IMAGES} images.` });
        }

        const existing = await pool.query(
            'SELECT id, user_id, status FROM upload_contents WHERE content_id = $1 LIMIT 1',
            [contentId]
        );
        const existingContent = existing.rows[0] || null;
        const isEditingPendingContent = !!existingContent
            && Number(existingContent.user_id) === Number(userId)
            && existingContent.status === 'Pending Approval';

        const planLimits = await getUploadContentPlanLimits(userId);
        const contentExpirySql = buildContentExpirySql(planLimits);
        if (!isEditingPendingContent) {
            const totalCountResult = await pool.query(
                `SELECT COUNT(*)::int AS count
                 FROM upload_contents
                 WHERE user_id = $1`,
                [userId]
            );
            const usedTotal = Number(totalCountResult.rows[0]?.count || 0);
            if (planLimits.totalUploads > 0 && usedTotal >= planLimits.totalUploads) {
                const nextPlan = await getNextUploadContentPlan(planLimits);
                const upgradeText = nextPlan?.name
                    ? ` Upgrade to ${nextPlan.name} to upload more content.`
                    : ' Upgrade your subscription plan to upload more content.';
                return res.status(429).json({
                    success: false,
                    code: 'UPLOAD_CONTENT_TOTAL_LIMIT_REACHED',
                    message: `Upload content limit reached. Your ${planLimits.planName} plan allows ${planLimits.totalUploads} total upload${planLimits.totalUploads === 1 ? '' : 's'}.${upgradeText}`,
                    limit: planLimits.totalUploads,
                    used: usedTotal,
                    plan: {
                        id: planLimits.planId,
                        slug: planLimits.planSlug,
                        name: planLimits.planName,
                    },
                    suggested_plan: nextPlan,
                });
            }
        }
        if (!isEditingPendingContent && planLimits.dailyUploads > 0) {
            const todayCount = await pool.query(
                `SELECT COUNT(*)::int AS count
                 FROM upload_contents
                 WHERE user_id = $1
                   AND created_at >= CURRENT_DATE`,
                [userId]
            );
            const usedToday = Number(todayCount.rows[0]?.count || 0);
            if (usedToday >= planLimits.dailyUploads) {
                const nextPlan = await getNextUploadContentPlan(planLimits);
                const upgradeText = nextPlan?.name
                    ? ` Upgrade to ${nextPlan.name} for a higher upload limit.`
                    : ' Upgrade your subscription plan for a higher upload limit.';
                return res.status(429).json({
                    success: false,
                    code: 'UPLOAD_CONTENT_DAILY_LIMIT_REACHED',
                    message: `Daily upload limit reached. Your ${planLimits.planName} plan allows ${planLimits.dailyUploads} upload${planLimits.dailyUploads === 1 ? '' : 's'} per day.${upgradeText}`,
                    limit: planLimits.dailyUploads,
                    used: usedToday,
                    plan: {
                        id: planLimits.planId,
                        slug: planLimits.planSlug,
                        name: planLimits.planName,
                    },
                    suggested_plan: nextPlan,
                });
            }
        }

        if (mediaType === 'video' && Number.isFinite(submittedVideoDurationSeconds) && submittedVideoDurationSeconds > 0) {
            if (submittedVideoDurationSeconds > planLimits.videoLimitSeconds) {
                return res.status(400).json({
                    success: false,
                    message: `Video duration exceeds the allowed limit of ${planLimits.videoLimitSeconds} seconds.`,
                });
            }
        }

        if (contentFiles.length > 0) {
            const uploadedUrls = await saveUploadedFiles(contentFiles, 'upload-content');
            mediaGallery = uploadedUrls.filter(Boolean);
            if (uploadedUrls[0]) {
                mediaPreview = uploadedUrls[0];
            }
        }

        if (previewFiles.length > 0) {
            const previewUrls = await saveUploadedFiles(previewFiles, 'upload-content-previews');
            previewUrl = previewUrls[0] || '';
        }

        if (mediaType === 'image' && Array.isArray(mediaGallery) && mediaGallery.length === 1) {
            accessMode = 'blurred';
        }

        if (thumbnailUrl.startsWith('data:')) {
            thumbnailUrl = await saveDataUrl(thumbnailUrl, 'upload-content-thumbnails');
        }

        if (accessMode === 'blurred') {
            previewUrl = '';
            previewMode = 'thumbnail';
            if (mediaType !== 'image') {
                thumbnailUrl = '';
            }
        }

        if ((!Array.isArray(mediaGallery) || mediaGallery.length === 0) && !mediaPreview && !externalLink) {
            return res.status(400).json({ success: false, message: 'Please upload a photo or video, or provide a link.' });
        }

        if (existing.rows.length > 0) {
            if (Number(existingContent.user_id) !== Number(userId)) {
                return res.status(409).json({ success: false, message: 'Content ID already exists.' });
            }
            if (existingContent.status !== 'Pending Approval') {
                return res.status(409).json({ success: false, message: 'Approved content cannot be edited.' });
            }
            const updated = await pool.query(
                `UPDATE upload_contents
                 SET content_type = $2,
                     description = $3,
                     topic = $4,
                     price = $5,
                     subscription_packages = $6::jsonb,
                     affiliate_commission = $7,
                     hashtags = $8::jsonb,
                     allow_comments = $9,
                     show_link_on_home = $10,
                     external_link = $11,
                     media_type = $12,
                     media_preview = $13,
                     media_gallery = $14::jsonb,
                     thumbnail_url = $15,
                     content_access_mode = $16,
                     visibility = $17,
                     preview_mode = $18,
                     preview_url = $19,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1
                 RETURNING *`,
                [
                    existingContent.id,
                    contentType,
                    description,
                    topic,
                    price,
                    JSON.stringify(subscriptionPackages),
                    affiliateCommission,
                    JSON.stringify(hashtags),
                    allowComments,
                    showLinkOnHome,
                    externalLink || null,
                    mediaType,
                    mediaPreview || (Array.isArray(mediaGallery) ? mediaGallery[0] : '') || null,
                    JSON.stringify(Array.isArray(mediaGallery) ? mediaGallery : []),
                    thumbnailUrl || null,
                    accessMode,
                    visibility,
                    previewMode,
                    previewUrl || null,
                ]
            );
            return res.status(200).json({ success: true, content: mapRow(updated.rows[0]) });
        }

        const result = await pool.query(
            `INSERT INTO upload_contents (
                content_id, user_id, owner_user_id, owner_username, content_type, description, topic, price,
                subscription_packages, affiliate_commission, hashtags, allow_comments, show_link_on_home, external_link, media_type, media_preview,
                media_gallery, thumbnail_url, content_access_mode, visibility, preview_mode, preview_url, status, expires_at, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8,
                $9::jsonb, $10, $11::jsonb, $12, $13, $14, $15, $16,
                $17::jsonb, $18, $19, $20, $21, $22, 'Pending Approval', ${contentExpirySql || 'NULL'}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
            RETURNING *`,
            [
                contentId,
                userId,
                String(sponsor.user_id || '').trim() || null,
                String(sponsor.username || '').trim() || null,
                contentType,
                description,
                topic,
                price,
                JSON.stringify(subscriptionPackages),
                affiliateCommission,
                JSON.stringify(hashtags),
                allowComments,
                showLinkOnHome,
                externalLink || null,
                mediaType,
                mediaPreview || (Array.isArray(mediaGallery) ? mediaGallery[0] : '') || null,
                JSON.stringify(Array.isArray(mediaGallery) ? mediaGallery : []),
                thumbnailUrl || null,
                accessMode,
                visibility,
                previewMode,
                previewUrl || null,
            ]
        );

        return res.status(201).json({ success: true, content: mapRow(result.rows[0]) });
    } catch (error) {
        console.error('Create upload content error:', error);
        return res.status(500).json({ success: false, message: 'Failed to submit upload content.' });
    }
};

exports.getMyUploadContents = async (req, res) => {
    try {
        await ensureSchema();
        const result = await pool.query(
            `SELECT uc.*, u.full_name, u.username AS user_username, u.profile_picture, u.user_type,
                    EXISTS (
                        SELECT 1 FROM upload_content_likes ucl
                        WHERE ucl.content_id = uc.id AND ucl.user_id = $1
                    ) AS user_liked
             FROM upload_contents uc
             INNER JOIN users u ON u.id = uc.user_id
             WHERE uc.user_id = $1
             ORDER BY uc.created_at DESC`,
            [req.user.id]
        );
        const contents = result.rows.map((row) => ({
            ...mapRow(row),
            full_name: row.full_name || null,
            username: row.user_username || row.owner_username || null,
            profile_picture: row.profile_picture || null,
            user_type: row.user_type || null,
        }));
        return res.status(200).json({ success: true, contents });
    } catch (error) {
        console.error('Get my upload contents error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch your upload content.' });
    }
};

exports.purchaseCreatorSubscription = async (req, res) => {
    const client = await pool.connect();
    try {
        await ensureSchema();
        const buyerId = Number(req.user.id);
        const contentIdentifier = req.params.contentId;
        const packageId = String(req.body?.packageId || req.body?.package_id || '').trim();

        if (!packageId) {
            return res.status(400).json({ success: false, message: 'Subscription plan is required.' });
        }

        await client.query('BEGIN');

        const contentRow = await resolveContentLookup(contentIdentifier);
        if (!contentRow || normalizeStatus(contentRow.status) !== 'Approved') {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Vault content is not available.' });
        }

        const creatorId = Number(contentRow.user_id);
        if (!Number.isFinite(creatorId) || creatorId <= 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Creator wallet is not available.' });
        }
        if (creatorId === buyerId) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: 'You cannot subscribe to your own content.' });
        }

        const packages = parseSubscriptionPackages(contentRow.subscription_packages);
        const selectedPackage = packages.find((item) => String(item.id) === packageId);
        if (!selectedPackage) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Selected subscription plan was not found.' });
        }

        const amount = normalizeMoney(selectedPackage.price);
        const days = Math.max(1, Math.round(Number(selectedPackage.days || 0)));
        const currentCommissionPercentage = await loadCurrentSubscriptionCommissionForPrice(amount);
        const commissionPercentage = currentCommissionPercentage > 0
            ? currentCommissionPercentage
            : Math.min(100, Math.max(0, Number(selectedPackage.affiliateCommission || 0)));
        const commissionAmount = normalizeMoney((amount * commissionPercentage) / 100);
        const creatorAmount = normalizeMoney(amount - commissionAmount);
        const googerUserId = await resolveGoogerMainWalletUserId(client);

        if (!googerUserId) {
            await client.query('ROLLBACK');
            return res.status(500).json({ success: false, message: 'Googer main balance account is not configured.' });
        }

        await lockWalletUsers(client, [buyerId, creatorId, googerUserId]);
        try {
            await debitWalletBalance(client, { userId: buyerId, amount });
            if (creatorAmount > 0) {
                await creditWalletBalance(client, { userId: creatorId, amount: creatorAmount });
            }
        } catch (financeError) {
            await client.query('ROLLBACK');
            if (financeError.code === 'INSUFFICIENT_WALLET_BALANCE') {
                return res.status(400).json({ success: false, message: 'Insufficient wallet balance.' });
            }
            if (financeError.code === 'USER_NOT_FOUND') {
                return res.status(404).json({ success: false, message: 'Wallet user not found.' });
            }
            throw financeError;
        }

        const transfer = await insertWalletTransfer(client, {
            senderId: buyerId,
            receiverId: creatorId,
            amount,
            note: `Vault Creator Subscription - ${days} day${days === 1 ? '' : 's'}`,
            type: 'vault_subscription',
            status: 'accepted',
            commission: commissionAmount,
            commissionPercentage,
        });

        const subscriptionResult = await client.query(
            `INSERT INTO upload_content_subscriptions (
                buyer_id, creator_id, content_id, package_id, package_days, amount,
                commission_percentage, commission_amount, creator_amount, wallet_transfer_id,
                starts_at, expires_at, created_at
             ) VALUES (
                $1, $2, $3, $4, $5, $6,
                $7, $8, $9, $10,
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + ($5::int * INTERVAL '1 day'), CURRENT_TIMESTAMP
             )
             RETURNING id, starts_at, expires_at`,
            [
                buyerId,
                creatorId,
                Number(contentRow.id),
                selectedPackage.id,
                days,
                amount,
                commissionPercentage,
                commissionAmount,
                creatorAmount,
                transfer.id,
            ]
        );

        await client.query('COMMIT');

        return res.status(201).json({
            success: true,
            message: 'Subscription purchased successfully.',
            subscription: {
                id: subscriptionResult.rows[0].id,
                buyer_id: buyerId,
                creator_id: creatorId,
                content_id: Number(contentRow.id),
                package_id: selectedPackage.id,
                package_days: days,
                amount,
                commission_percentage: commissionPercentage,
                commission_amount: commissionAmount,
                creator_amount: creatorAmount,
                wallet_transfer_id: transfer.id,
                starts_at: toUtcIso(subscriptionResult.rows[0].starts_at),
                expires_at: toUtcIso(subscriptionResult.rows[0].expires_at),
            },
        });
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch {}
        console.error('Purchase upload content subscription error:', error);
        return res.status(500).json({ success: false, message: 'Failed to purchase subscription.' });
    } finally {
        client.release();
    }
};

exports.purchaseVaultContent = async (req, res) => {
    const client = await pool.connect();
    try {
        await ensureSchema();
        const buyerId = Number(req.user.id);
        const contentIdentifier = req.params.contentId;

        await client.query('BEGIN');

        const contentRow = await resolveContentLookup(contentIdentifier);
        if (!contentRow || normalizeStatus(contentRow.status) !== 'Approved' || contentRow.content_type === 'flash') {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Vault content is not available.' });
        }

        const creatorId = Number(contentRow.user_id);
        if (!Number.isFinite(creatorId) || creatorId <= 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'Creator wallet is not available.' });
        }
        if (creatorId === buyerId) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: 'You cannot purchase your own content.' });
        }

        const existingPurchase = await client.query(
            `SELECT id, amount, commission_percentage, commission_amount, creator_amount, wallet_transfer_id, created_at
             FROM upload_content_purchases
             WHERE buyer_id = $1 AND content_id = $2
             LIMIT 1`,
            [buyerId, Number(contentRow.id)]
        );
        if (existingPurchase.rows.length > 0) {
            const balanceResult = await client.query(
                'SELECT wallet_balance FROM users WHERE id = $1 LIMIT 1',
                [buyerId]
            );
            await client.query('COMMIT');
            const row = existingPurchase.rows[0];
            return res.status(200).json({
                success: true,
                alreadyPurchased: true,
                message: 'Content already unlocked.',
                walletBalance: normalizeMoney(balanceResult.rows[0]?.wallet_balance || 0),
                purchase: {
                    id: row.id,
                    buyer_id: buyerId,
                    creator_id: creatorId,
                    content_id: Number(contentRow.id),
                    amount: normalizeMoney(row.amount),
                    commission_percentage: Number(row.commission_percentage || 0),
                    commission_amount: normalizeMoney(row.commission_amount),
                    creator_amount: normalizeMoney(row.creator_amount),
                    wallet_transfer_id: row.wallet_transfer_id,
                    created_at: toUtcIso(row.created_at),
                },
            });
        }

        const amount = normalizeMoney(contentRow.price);
        if (!(amount > 0)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, message: 'Content price is invalid.' });
        }

        const currentCommissionPercentage = await loadCurrentVaultCommissionForPrice(amount);
        const commissionPercentage = currentCommissionPercentage > 0
            ? currentCommissionPercentage
            : Math.min(100, Math.max(0, Number(contentRow.affiliate_commission || 0)));
        const commissionAmount = normalizeMoney((amount * commissionPercentage) / 100);
        const creatorAmount = normalizeMoney(amount - commissionAmount);
        const googerUserId = await resolveGoogerMainWalletUserId(client);

        if (!googerUserId) {
            await client.query('ROLLBACK');
            return res.status(500).json({ success: false, message: 'Googer main balance account is not configured.' });
        }

        let buyerWallet;
        await lockWalletUsers(client, [buyerId, creatorId, googerUserId]);
        try {
            buyerWallet = await debitWalletBalance(client, { userId: buyerId, amount });
            if (creatorAmount > 0) {
                await creditWalletBalance(client, { userId: creatorId, amount: creatorAmount });
            }
        } catch (financeError) {
            await client.query('ROLLBACK');
            if (financeError.code === 'INSUFFICIENT_WALLET_BALANCE') {
                return res.status(400).json({ success: false, message: 'Insufficient wallet balance.' });
            }
            if (financeError.code === 'USER_NOT_FOUND') {
                return res.status(404).json({ success: false, message: 'Wallet user not found.' });
            }
            throw financeError;
        }

        const transfer = await insertWalletTransfer(client, {
            senderId: buyerId,
            receiverId: creatorId,
            amount,
            note: `Vault Content Purchase - ${contentRow.content_id}`,
            type: 'vault_purchase',
            status: 'accepted',
            commission: commissionAmount,
            commissionPercentage,
        });

        const purchaseResult = await client.query(
            `INSERT INTO upload_content_purchases (
                buyer_id, creator_id, content_id, amount, commission_percentage,
                commission_amount, creator_amount, wallet_transfer_id, created_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
             RETURNING id, created_at`,
            [
                buyerId,
                creatorId,
                Number(contentRow.id),
                amount,
                commissionPercentage,
                commissionAmount,
                creatorAmount,
                transfer.id,
            ]
        );

        await client.query('COMMIT');

        return res.status(201).json({
            success: true,
            message: 'Content unlocked successfully.',
            walletBalance: normalizeMoney(buyerWallet?.walletBalance || 0),
            purchase: {
                id: purchaseResult.rows[0].id,
                buyer_id: buyerId,
                creator_id: creatorId,
                content_id: Number(contentRow.id),
                amount,
                commission_percentage: commissionPercentage,
                commission_amount: commissionAmount,
                creator_amount: creatorAmount,
                wallet_transfer_id: transfer.id,
                created_at: toUtcIso(purchaseResult.rows[0].created_at),
            },
        });
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch {}
        console.error('Purchase vault content error:', error);
        if (error?.code === 'INSUFFICIENT_WALLET_BALANCE') {
            return res.status(400).json({ success: false, message: 'Insufficient wallet balance.' });
        }
        if (error?.code === 'USER_NOT_FOUND') {
            return res.status(404).json({ success: false, message: 'Wallet user not found.' });
        }
        return res.status(500).json({ success: false, message: 'Unable to unlock this content right now. Please try again.' });
    } finally {
        client.release();
    }
};

exports.getApprovedUploadContentsPublic = async (req, res) => {
    try {
        await ensureSchema();
        const topic = String(req.query.topic || '').trim();
        const viewerId = parseOptionalUserIdFromRequest(req);
        const params = [];
        let where = `WHERE uc.status = 'Approved'
            AND COALESCE(u.is_deactivated, false) = false
            AND COALESCE(u.status, 'Active') <> 'Deactivated'
            AND (uc.expires_at IS NULL OR uc.expires_at > NOW())
            AND (
                COALESCE(uc.visibility, 'public') = 'public'
                ${viewerId ? `OR uc.user_id = ${Number(viewerId)}
                OR (
                    uc.visibility = 'subscribers_only'
                    AND EXISTS (
                        SELECT 1 FROM user_subscriptions us
                        WHERE us.subscriber_id = ${Number(viewerId)}
                          AND us.subscribed_to_id = uc.user_id
                    )
                )` : ''}
            )`;
        if (topic) {
            params.push(topic);
            where += ` AND uc.topic = $${params.length}`;
        }
        const result = await pool.query(
             `SELECT uc.*, u.full_name, u.username AS user_username, u.profile_picture, u.user_type,
                     ${viewerId ? `EXISTS (
                         SELECT 1 FROM upload_content_likes ucl
                         WHERE ucl.content_id = uc.id AND ucl.user_id = ${Number(viewerId)}
                     )` : 'FALSE'} AS user_liked,
                     ${viewerId ? `EXISTS (
                         SELECT 1 FROM upload_content_purchases ucp
                         WHERE ucp.content_id = uc.id AND ucp.buyer_id = ${Number(viewerId)}
                     )` : 'FALSE'} AS user_purchased,
                     ${viewerId ? `(
                         uc.user_id = ${Number(viewerId)}
                         OR EXISTS (
                             SELECT 1 FROM upload_content_purchases ucp2
                             WHERE ucp2.content_id = uc.id AND ucp2.buyer_id = ${Number(viewerId)}
                         )
                         OR EXISTS (
                             SELECT 1 FROM upload_content_subscriptions ucs
                             WHERE ucs.creator_id = uc.user_id
                               AND ucs.buyer_id = ${Number(viewerId)}
                               AND ucs.expires_at > NOW()
                         )
                     )` : 'FALSE'} AS user_has_access
              FROM upload_contents uc
             INNER JOIN users u ON u.id = uc.user_id
             ${where}
             ORDER BY COALESCE(uc.approved_at, uc.created_at) DESC
             LIMIT 80`,
            params
        );

        const contents = result.rows.map((row) => ({
            ...mapRow(row),
            full_name: row.full_name || null,
            username: row.user_username || row.owner_username || null,
            profile_picture: row.profile_picture || null,
            user_type: row.user_type || null,
        }));
        const topics = Array.from(new Set(contents.map((item) => item.topic).filter(Boolean))).sort((a, b) => a.localeCompare(b));
        return res.status(200).json({ success: true, contents, topics });
    } catch (error) {
        console.error('Get public upload contents error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch upload contents.' });
    }
};

exports.getAdminUploadContents = async (req, res) => {
    try {
        await ensureSchema();
        if (!(await assertAdmin(req.user.id))) {
            return res.status(403).json({ success: false, message: 'Admin access required.' });
        }
        const status = String(req.query.status || '').trim();
        const params = [];
        let where = '';
        if (status) {
            params.push(normalizeStatus(status));
            where = `WHERE uc.status = $${params.length}`;
        }
        const result = await pool.query(
            `SELECT uc.*, u.full_name, u.username AS user_username, u.profile_picture, u.user_type
             FROM upload_contents uc
             INNER JOIN users u ON u.id = uc.user_id
             ${where}
             ORDER BY uc.created_at DESC`,
            params
        );
        return res.status(200).json({
            success: true,
            contents: result.rows.map((row) => ({
                ...mapRow(row),
                full_name: row.full_name || null,
                username: row.user_username || row.owner_username || null,
                profile_picture: row.profile_picture || null,
                user_type: row.user_type || null,
            })),
        });
    } catch (error) {
        console.error('Admin upload contents error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch upload contents.' });
    }
};

exports.updateUploadContentStatus = async (req, res) => {
    try {
        await ensureSchema();
        if (!(await assertAdmin(req.user.id))) {
            return res.status(403).json({ success: false, message: 'Admin access required.' });
        }
        const contentId = String(req.params.contentId || '').trim();
        const status = normalizeStatus(req.body?.status);
        const rejectionReason = String(req.body?.rejectionReason || req.body?.rejection_reason || '').trim();
        const adminNote = String(req.body?.adminNote || req.body?.admin_note || '').trim();
        if (!contentId) {
            return res.status(400).json({ success: false, message: 'Content ID is required.' });
        }
        if (status === 'Rejected' && !rejectionReason) {
            return res.status(400).json({ success: false, message: 'Rejection reason is required.' });
        }

        const result = await pool.query(
            `UPDATE upload_contents
             SET status = $2,
                 rejection_reason = $3,
                 admin_note = $4,
                 approved_at = CASE WHEN $2 = 'Approved' THEN CURRENT_TIMESTAMP ELSE NULL END,
                 updated_at = CURRENT_TIMESTAMP
             WHERE content_id = $1
             RETURNING *`,
            [
                contentId,
                status,
                status === 'Rejected' ? rejectionReason : null,
                adminNote || null,
            ]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Upload content not found.' });
        }
        return res.status(200).json({ success: true, content: mapRow(result.rows[0]) });
    } catch (error) {
        console.error('Update upload content status error:', error);
        return res.status(500).json({ success: false, message: 'Failed to update upload content status.' });
    }
};

exports.toggleLike = async (req, res) => {
    try {
        await ensureSchema();
        const content = await resolveContentLookup(req.params.contentId);
        if (!content) {
            return res.status(404).json({ success: false, message: 'Upload content not found.' });
        }

        const existing = await pool.query(
            'SELECT id FROM upload_content_likes WHERE content_id = $1 AND user_id = $2 LIMIT 1',
            [content.id, req.user.id]
        );

        let liked = false;
        if (existing.rows.length > 0) {
            await pool.query('DELETE FROM upload_content_likes WHERE id = $1', [existing.rows[0].id]);
        } else {
            await pool.query(
                'INSERT INTO upload_content_likes (content_id, user_id) VALUES ($1, $2)',
                [content.id, req.user.id]
            );
            liked = true;
        }

        await syncContentCounters(content.id);
        const refreshed = await resolveContentLookup(content.id, 'FALSE AS user_liked');
        return res.status(200).json({
            success: true,
            liked,
            likes_count: Number(refreshed?.likes_count || 0),
        });
    } catch (error) {
        console.error('Toggle upload content like error:', error);
        return res.status(500).json({ success: false, message: 'Failed to update like.' });
    }
};

exports.logShare = async (req, res) => {
    try {
        await ensureSchema();
        const content = await resolveContentLookup(req.params.contentId);
        if (!content) {
            return res.status(404).json({ success: false, message: 'Upload content not found.' });
        }
        const userId = parseOptionalUserIdFromRequest(req);
        await pool.query(
            'INSERT INTO upload_content_shares (content_id, user_id) VALUES ($1, $2)',
            [content.id, userId]
        );
        await syncContentCounters(content.id);
        const refreshed = await resolveContentLookup(content.id);
        return res.status(200).json({
            success: true,
            shares_count: Number(refreshed?.shares_count || 0),
        });
    } catch (error) {
        console.error('Log upload content share error:', error);
        return res.status(500).json({ success: false, message: 'Failed to record share.' });
    }
};

exports.repostContent = async (req, res) => {
    try {
        await ensureSchema();
        const content = await resolveContentLookup(req.params.contentId);
        if (!content) {
            return res.status(404).json({ success: false, message: 'Upload content not found.' });
        }
        if (Number(content.user_id) === Number(req.user.id)) {
            return res.status(400).json({ success: false, message: 'You cannot repost your own content.' });
        }

        const existing = await pool.query(
            'SELECT id FROM upload_content_reposts WHERE content_id = $1 AND user_id = $2 LIMIT 1',
            [content.id, req.user.id]
        );
        if (existing.rows.length === 0) {
            await pool.query(
                'INSERT INTO upload_content_reposts (content_id, user_id) VALUES ($1, $2)',
                [content.id, req.user.id]
            );
            await syncContentCounters(content.id);
        }
        const refreshed = await resolveContentLookup(content.id);
        return res.status(200).json({
            success: true,
            alreadyReposted: existing.rows.length > 0,
            reposts_count: Number(refreshed?.reposts_count || 0),
        });
    } catch (error) {
        console.error('Repost upload content error:', error);
        return res.status(500).json({ success: false, message: 'Failed to repost content.' });
    }
};

exports.togglePin = async (req, res) => {
    try {
        await ensureSchema();
        const content = await resolveContentLookup(req.params.contentId);
        if (!content) {
            return res.status(404).json({ success: false, message: 'Upload content not found.' });
        }
        if (Number(content.user_id) !== Number(req.user.id)) {
            return res.status(403).json({ success: false, message: 'You can only pin your own content.' });
        }
        const shouldPin = !content.pinned_at;
        const result = await pool.query(
            `UPDATE upload_contents
             SET pinned_at = CASE WHEN $2::boolean THEN CURRENT_TIMESTAMP ELSE NULL END,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1
             RETURNING *`,
            [content.id, shouldPin]
        );
        return res.status(200).json({
            success: true,
            pinned: shouldPin,
            content: mapRow(result.rows[0]),
        });
    } catch (error) {
        console.error('Toggle upload content pin error:', error);
        return res.status(500).json({ success: false, message: 'Failed to update pin.' });
    }
};

exports.reportContent = async (req, res) => {
    try {
        await ensureSchema();
        const content = await resolveContentLookup(req.params.contentId);
        if (!content) {
            return res.status(404).json({ success: false, message: 'Upload content not found.' });
        }
        if (Number(content.user_id) === Number(req.user.id)) {
            return res.status(400).json({ success: false, message: 'You cannot report your own content.' });
        }

        const reason = String(req.body?.reason || '').trim();
        const customReason = String(req.body?.custom_reason || req.body?.customReason || '').trim();
        if (!reason) {
            return res.status(400).json({ success: false, message: 'Please choose a report reason.' });
        }

        const existing = await pool.query(
            'SELECT id FROM upload_content_reports WHERE content_id = $1 AND user_id = $2 LIMIT 1',
            [content.id, req.user.id]
        );
        if (existing.rows.length > 0) {
            return res.status(400).json({ success: false, message: 'Already reported.' });
        }

        await pool.query(
            'INSERT INTO upload_content_reports (content_id, user_id, reason, custom_reason) VALUES ($1, $2, $3, $4)',
            [content.id, req.user.id, reason, customReason || null]
        );
        await pool.query(
            `UPDATE upload_contents
             SET reports_count = COALESCE(reports_count, 0) + 1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [content.id]
        );
        return res.status(201).json({ success: true, message: 'Report submitted successfully' });
    } catch (error) {
        console.error('Report upload content error:', error);
        return res.status(500).json({ success: false, message: 'Failed to report content.' });
    }
};

exports.logView = async (req, res) => {
    try {
        await ensureSchema();
        const content = await resolveContentLookup(req.params.contentId);
        if (!content) {
            return res.status(404).json({ success: false, message: 'Upload content not found.' });
        }
        const userId = parseOptionalUserIdFromRequest(req);
        const viewerKey = getViewerKey(req);
        const existing = await pool.query(
            `SELECT id FROM upload_content_views
             WHERE content_id = $1
               AND (
                    ($2::int IS NOT NULL AND user_id = $2)
                 OR ($2::int IS NULL AND viewer_key IS NOT NULL AND viewer_key = $3)
               )
             LIMIT 1`,
            [content.id, userId, viewerKey]
        );
        if (existing.rows.length === 0) {
            await pool.query(
                'INSERT INTO upload_content_views (content_id, user_id, viewer_key) VALUES ($1, $2, $3)',
                [content.id, userId, viewerKey]
            );
            await syncContentCounters(content.id);
        }
        const refreshed = await resolveContentLookup(content.id);
        return res.status(200).json({
            success: true,
            views_count: Number(refreshed?.views_count || 0),
        });
    } catch (error) {
        console.error('Log upload content view error:', error);
        return res.status(500).json({ success: false, message: 'Failed to record view.' });
    }
};

exports.getLikes = async (req, res) => {
    try {
        await ensureSchema();
        const content = await resolveContentLookup(req.params.contentId);
        if (!content) {
            return res.status(404).json({ success: false, message: 'Upload content not found.' });
        }
        const result = await pool.query(
            `SELECT u.id, ucl.user_id, u.username, u.full_name, u.profile_picture, ucl.created_at
             FROM upload_content_likes ucl
             INNER JOIN users u ON u.id = ucl.user_id
             WHERE ucl.content_id = $1
             ORDER BY ucl.created_at DESC`,
            [content.id]
        );
        return res.status(200).json({ success: true, likes: result.rows.map(mapActorRow) });
    } catch (error) {
        console.error('Get upload content likes error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch likes.' });
    }
};

exports.getShares = async (req, res) => {
    try {
        await ensureSchema();
        const content = await resolveContentLookup(req.params.contentId);
        if (!content) {
            return res.status(404).json({ success: false, message: 'Upload content not found.' });
        }
        const result = await pool.query(
            `SELECT COALESCE(u.id, 0) AS id, ucs.user_id, u.username, u.full_name, u.profile_picture, ucs.created_at
             FROM upload_content_shares ucs
             LEFT JOIN users u ON u.id = ucs.user_id
             WHERE ucs.content_id = $1
             ORDER BY ucs.created_at DESC`,
            [content.id]
        );
        return res.status(200).json({ success: true, shares: result.rows.map(mapActorRow) });
    } catch (error) {
        console.error('Get upload content shares error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch shares.' });
    }
};

exports.getViews = async (req, res) => {
    try {
        await ensureSchema();
        const content = await resolveContentLookup(req.params.contentId);
        if (!content) {
            return res.status(404).json({ success: false, message: 'Upload content not found.' });
        }
        const result = await pool.query(
            `SELECT COALESCE(u.id, 0) AS id, ucv.user_id, u.username, u.full_name, u.profile_picture, ucv.created_at
             FROM upload_content_views ucv
             LEFT JOIN users u ON u.id = ucv.user_id
             WHERE ucv.content_id = $1
             ORDER BY ucv.created_at DESC`,
            [content.id]
        );
        return res.status(200).json({ success: true, views: result.rows.map(mapActorRow) });
    } catch (error) {
        console.error('Get upload content views error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch views.' });
    }
};

exports.getComments = async (req, res) => {
    try {
        await ensureSchema();
        const viewerId = parseOptionalUserIdFromRequest(req);
        const content = await resolveContentLookup(req.params.contentId);
        if (!content) {
            return res.status(404).json({ success: false, message: 'Upload content not found.' });
        }
        const result = await pool.query(
            `SELECT c.*,
                    u.username,
                    u.full_name,
                    u.profile_picture,
                    ${viewerId ? `EXISTS (
                        SELECT 1 FROM upload_content_comment_likes cl
                        WHERE cl.comment_id = c.id AND cl.user_id = ${Number(viewerId)}
                    )` : 'FALSE'} AS user_liked,
                    ${viewerId ? `EXISTS (
                        SELECT 1 FROM upload_content_comment_dislikes cd
                        WHERE cd.comment_id = c.id AND cd.user_id = ${Number(viewerId)}
                    )` : 'FALSE'} AS user_disliked
             FROM upload_content_comments c
             INNER JOIN users u ON u.id = c.user_id
             WHERE c.content_id = $1
             ORDER BY c.created_at ASC, c.id ASC`,
            [content.id]
        );
        return res.status(200).json({ success: true, comments: result.rows.map(mapCommentRow) });
    } catch (error) {
        console.error('Get upload content comments error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch comments.' });
    }
};

exports.addComment = async (req, res) => {
    try {
        await ensureSchema();
        const content = await resolveContentLookup(req.params.contentId);
        if (!content) {
            return res.status(404).json({ success: false, message: 'Upload content not found.' });
        }
        if (!content.allow_comments) {
            return res.status(403).json({ success: false, message: 'Comments are disabled for this content.' });
        }
        const commentText = String(req.body?.comment || req.body?.text || '').trim();
        const parentId = req.body?.parentId ? Number(req.body.parentId) : null;
        if (!commentText) {
            return res.status(400).json({ success: false, message: 'Comment is required.' });
        }
        if (parentId) {
            const parent = await pool.query(
                'SELECT id FROM upload_content_comments WHERE id = $1 AND content_id = $2 LIMIT 1',
                [parentId, content.id]
            );
            if (parent.rows.length === 0) {
                return res.status(404).json({ success: false, message: 'Parent comment not found.' });
            }
        }
        const result = await pool.query(
            `INSERT INTO upload_content_comments (content_id, user_id, parent_id, comment_text)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [content.id, req.user.id, parentId, commentText]
        );
        await syncContentCounters(content.id);
        const enriched = await pool.query(
            `SELECT c.*, u.username, u.full_name, u.profile_picture, FALSE AS user_liked, FALSE AS user_disliked
             FROM upload_content_comments c
             INNER JOIN users u ON u.id = c.user_id
             WHERE c.id = $1
             LIMIT 1`,
            [result.rows[0].id]
        );
        return res.status(201).json({ success: true, comment: mapCommentRow(enriched.rows[0]) });
    } catch (error) {
        console.error('Add upload content comment error:', error);
        return res.status(500).json({ success: false, message: 'Failed to add comment.' });
    }
};

exports.deleteComment = async (req, res) => {
    const client = await pool.connect();
    try {
        await ensureSchema();
        const commentId = Number(req.params.commentId || 0);
        if (!Number.isFinite(commentId) || commentId <= 0) {
            client.release();
            return res.status(400).json({ success: false, message: 'Invalid comment id.' });
        }
        const result = await client.query(
            `SELECT c.*, uc.user_id AS owner_user_id
             FROM upload_content_comments c
             INNER JOIN upload_contents uc ON uc.id = c.content_id
             WHERE c.id = $1
             LIMIT 1`,
            [commentId]
        );
        const row = result.rows[0];
        if (!row) {
            client.release();
            return res.status(404).json({ success: false, message: 'Comment not found.' });
        }
        const isAdminUser = await assertAdmin(req.user.id);
        const canDelete = Number(row.user_id) === Number(req.user.id)
            || Number(row.owner_user_id) === Number(req.user.id)
            || isAdminUser;
        if (!canDelete) {
            client.release();
            return res.status(403).json({ success: false, message: 'You cannot delete this comment.' });
        }

        await client.query('BEGIN');
        const descendants = await client.query(
            `WITH RECURSIVE tree AS (
                SELECT id FROM upload_content_comments WHERE id = $1
                UNION ALL
                SELECT c.id
                FROM upload_content_comments c
                INNER JOIN tree t ON c.parent_id = t.id
             )
             SELECT id FROM tree`,
            [commentId]
        );
        const ids = descendants.rows.map((item) => Number(item.id)).filter(Boolean);
        await client.query('DELETE FROM upload_content_comments WHERE id = ANY($1::int[])', [ids]);
        await client.query('COMMIT');
        client.release();

        await syncContentCounters(row.content_id);
        return res.status(200).json({ success: true, deletedCount: ids.length || 1 });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        client.release();
        console.error('Delete upload content comment error:', error);
        return res.status(500).json({ success: false, message: 'Failed to delete comment.' });
    }
};

exports.likeComment = async (req, res) => {
    try {
        await ensureSchema();
        const commentId = Number(req.params.commentId || 0);
        if (!Number.isFinite(commentId) || commentId <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid comment id.' });
        }
        const comment = await pool.query(
            'SELECT id FROM upload_content_comments WHERE id = $1 LIMIT 1',
            [commentId]
        );
        if (comment.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Comment not found.' });
        }
        await pool.query(
            'DELETE FROM upload_content_comment_dislikes WHERE comment_id = $1 AND user_id = $2',
            [commentId, req.user.id]
        );
        const existing = await pool.query(
            'SELECT id FROM upload_content_comment_likes WHERE comment_id = $1 AND user_id = $2 LIMIT 1',
            [commentId, req.user.id]
        );
        if (existing.rows.length > 0) {
            await pool.query('DELETE FROM upload_content_comment_likes WHERE id = $1', [existing.rows[0].id]);
        } else {
            await pool.query(
                'INSERT INTO upload_content_comment_likes (comment_id, user_id) VALUES ($1, $2)',
                [commentId, req.user.id]
            );
        }
        await pool.query(
            `UPDATE upload_content_comments
             SET likes = (SELECT COUNT(*)::int FROM upload_content_comment_likes WHERE comment_id = $1),
                 dislikes = (SELECT COUNT(*)::int FROM upload_content_comment_dislikes WHERE comment_id = $1),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [commentId]
        );
        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('Like upload content comment error:', error);
        return res.status(500).json({ success: false, message: 'Failed to like comment.' });
    }
};

exports.dislikeComment = async (req, res) => {
    try {
        await ensureSchema();
        const commentId = Number(req.params.commentId || 0);
        if (!Number.isFinite(commentId) || commentId <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid comment id.' });
        }
        const comment = await pool.query(
            'SELECT id FROM upload_content_comments WHERE id = $1 LIMIT 1',
            [commentId]
        );
        if (comment.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Comment not found.' });
        }
        await pool.query(
            'DELETE FROM upload_content_comment_likes WHERE comment_id = $1 AND user_id = $2',
            [commentId, req.user.id]
        );
        const existing = await pool.query(
            'SELECT id FROM upload_content_comment_dislikes WHERE comment_id = $1 AND user_id = $2 LIMIT 1',
            [commentId, req.user.id]
        );
        if (existing.rows.length > 0) {
            await pool.query('DELETE FROM upload_content_comment_dislikes WHERE id = $1', [existing.rows[0].id]);
        } else {
            await pool.query(
                'INSERT INTO upload_content_comment_dislikes (comment_id, user_id) VALUES ($1, $2)',
                [commentId, req.user.id]
            );
        }
        await pool.query(
            `UPDATE upload_content_comments
             SET likes = (SELECT COUNT(*)::int FROM upload_content_comment_likes WHERE comment_id = $1),
                 dislikes = (SELECT COUNT(*)::int FROM upload_content_comment_dislikes WHERE comment_id = $1),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [commentId]
        );
        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('Dislike upload content comment error:', error);
        return res.status(500).json({ success: false, message: 'Failed to dislike comment.' });
    }
};

exports.reportComment = async (req, res) => {
    try {
        await ensureSchema();
        const commentId = Number(req.params.commentId || 0);
        if (!Number.isFinite(commentId) || commentId <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid comment id.' });
        }
        const comment = await pool.query(
            'SELECT id FROM upload_content_comments WHERE id = $1 LIMIT 1',
            [commentId]
        );
        if (comment.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Comment not found.' });
        }
        const existing = await pool.query(
            'SELECT id FROM upload_content_comment_reports WHERE comment_id = $1 AND user_id = $2 LIMIT 1',
            [commentId, req.user.id]
        );
        if (existing.rows.length > 0) {
            return res.status(400).json({ success: false, message: 'Already reported.' });
        }
        await pool.query(
            'INSERT INTO upload_content_comment_reports (comment_id, user_id) VALUES ($1, $2)',
            [commentId, req.user.id]
        );
        await pool.query(
            `UPDATE upload_content_comments
             SET reports = COALESCE(reports, 0) + 1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [commentId]
        );
        return res.status(201).json({ success: true });
    } catch (error) {
        console.error('Report upload content comment error:', error);
        return res.status(500).json({ success: false, message: 'Failed to report comment.' });
    }
};
