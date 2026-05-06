const pool = require('../config/database');

let adsTableReady = false;
const VALID_STATUSES = new Set(['Under Review', 'Active', 'Paused', 'Completed', 'Cancelled']);
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

const normalizeMediaGallery = (value, fallback = []) => {
    const source = Array.isArray(value) ? value : fallback;
    return source
        .filter((entry) => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean);
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
        CREATE INDEX IF NOT EXISTS idx_ads_user_id ON ads(user_id);
        CREATE INDEX IF NOT EXISTS idx_ads_status ON ads(status);
        CREATE INDEX IF NOT EXISTS idx_ads_created_at ON ads(created_at DESC);
    `);

    adsTableReady = true;
};

const mapRow = (row) => ({
    id: row.id,
    adId: row.ad_id,
    userId: row.user_id,
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
    reach: Number(row.reach || 0),
    impressions: Number(row.impressions || 0),
    clicks: Number(row.clicks || 0),
    budget: Number(row.budget || 0),
    durationDays: Number(row.duration_days || 0),
    spend: Number(row.spend || 0),
    remainingBudget: Number(row.remaining_budget || 0),
    status: row.status || 'Under Review',
    campaignPath: row.campaign_path,
    walletTransferId: row.wallet_transfer_id,
    editDraft: row.edit_draft || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

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
        editDraft: body.editDraft && typeof body.editDraft === 'object' ? body.editDraft : (fallback.editDraft || {}),
        createdAt: body.createdAt ? new Date(body.createdAt) : (fallback.createdAt ? new Date(fallback.createdAt) : null),
    };
};

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

        // Handle File Uploads
        if (req.files && req.files.length > 0) {
            const uploadedUrls = req.files.map(file => {
                const base64 = file.buffer.toString('base64');
                return `data:${file.mimetype};base64,${base64}`;
            });
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
                wallet_transfer_id, edit_draft, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7,
                $8, $9, $10, $11, $12, $13, $14, $15,
                $16, $17, $18, $19, $20, $21, $22,
                $23, $24, COALESCE($25, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP
            )
            RETURNING *`,
            [
                payload.adId, userId, owner.user_id, owner.username, payload.campaignType, payload.title, payload.description,
                payload.mediaPreview, JSON.stringify(payload.mediaGallery), payload.mediaType, payload.genderTarget, payload.ageMin, payload.ageMax, payload.reach, payload.impressions,
                payload.clicks, payload.budget, payload.durationDays, payload.spend, payload.remainingBudget, isAdmin ? payload.status : 'Under Review', payload.campaignPath,
                payload.walletTransferId, JSON.stringify(payload.editDraft), payload.createdAt && !Number.isNaN(payload.createdAt.getTime()) ? payload.createdAt : null,
            ]
        );

        return res.status(201).json({ success: true, ad: mapRow(result.rows[0]) });
    } catch (error) {
        console.error('Create ad error:', error);
        return res.status(500).json({ success: false, message: 'Failed to create ad' });
    }
};

exports.updateAd = async (req, res) => {
    try {
        await ensureAdsTable();
        const { adId } = req.params;
        const userId = req.user.id;
        const isAdmin = await assertAdmin(userId);
        const existingResult = await pool.query(
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

        // Handle File Uploads
        if (req.files && req.files.length > 0) {
            const uploadedUrls = req.files.map(file => {
                const base64 = file.buffer.toString('base64');
                return `data:${file.mimetype};base64,${base64}`;
            });
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

        const result = await pool.query(
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
                 status = $17,
                 campaign_path = $18,
                 wallet_transfer_id = COALESCE($19, wallet_transfer_id),
                 edit_draft = $20,
                 updated_at = CURRENT_TIMESTAMP
             WHERE ad_id = $21
             RETURNING *`,
            [
                payload.campaignType, payload.title, payload.description, payload.mediaPreview, JSON.stringify(payload.mediaGallery), payload.mediaType,
                payload.genderTarget, payload.ageMin, payload.ageMax, payload.reach, payload.impressions, payload.clicks,
                payload.budget, payload.durationDays, payload.spend, payload.remainingBudget, payload.status,
                payload.campaignPath, payload.walletTransferId, JSON.stringify(payload.editDraft), adId,
            ]
        );

        if (!result.rows.length) {
            return res.status(404).json({ success: false, message: 'Ad not found' });
        }

        return res.status(200).json({ success: true, ad: mapRow(result.rows[0]) });
    } catch (error) {
        console.error('Update ad error:', error);
        return res.status(500).json({ success: false, message: 'Failed to update ad' });
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
        const result = await pool.query(
            `SELECT a.*, u.username AS owner_username_joined, u.profile_picture
             FROM ads a
             LEFT JOIN users u ON a.user_id = u.id
             WHERE a.status = 'Active'
             ORDER BY a.created_at DESC`
        );

        return res.status(200).json({ success: true, ads: result.rows.map(mapRow) });
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
