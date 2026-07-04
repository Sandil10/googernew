const { saveUploadedFiles } = require('../media');
const { distributeReferralCommission } = require('../../utils/referralCommission');
const { getUserPlanLimits, getUserSubscriptionFeatures } = require('../../utils/planLimits');
const { syncExpiredAds } = require('../../utils/adDelivery');
const mutationAdsRepository = require('./mutationAdsRepository');

const parseBody = (req) => {
    let body = req.body;
    if (req.body.data && typeof req.body.data === 'string') {
        try {
            body = JSON.parse(req.body.data);
        } catch (e) {
            console.error('Failed to parse data field:', e);
        }
    } else {
        if (typeof body.mediaGallery === 'string') try { body.mediaGallery = JSON.parse(body.mediaGallery); } catch (e) {}
        if (typeof body.editDraft === 'string') try { body.editDraft = JSON.parse(body.editDraft); } catch (e) {}
    }
    return body;
};

const createAd = async (req) => {
    await mutationAdsRepository.ensureAdsTable();
    const userId = req.user.id;
    const isAdmin = await mutationAdsRepository.readAdsRepository.assertAdmin(userId);

    const body = parseBody(req);
    const payload = mutationAdsRepository.normalizePayload(body, { status: 'Under Review' });

    const features = await getUserSubscriptionFeatures(userId);
    const campaignTypeLower = String(payload.campaignType || '').trim().toLowerCase();
    const isProfilePromote = campaignTypeLower === 'profile promote';

    if (isProfilePromote && !features.free_profile_ad_promo) {
        const promo = String(payload.promoCode || '').trim().toUpperCase();
        const isFreeRequest = Number(payload.promoDiscount || 0) >= 100 || promo === 'FREE_PROFILE_PROMO';
        if (isFreeRequest) {
            const error = new Error('Free profile promotion is not included in your current plan. Please upgrade.');
            error.statusCode = 403;
            throw error;
        }
    }

    const productPromoteIdentity = await mutationAdsRepository.resolveProductPromoteIdentity(payload);
    if (String(payload.campaignType || '').trim().toLowerCase() === 'product promote'
        && !productPromoteIdentity.linkedProductId
        && !productPromoteIdentity.linkedProductShareCode) {
        const error = new Error('Product Promote requires a linked product');
        error.statusCode = 400;
        throw error;
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

    if (req.files && req.files.length > 0) {
        const uploadedUrls = await saveUploadedFiles(req.files, 'ads');
        payload.mediaGallery = [...uploadedUrls, ...(payload.mediaGallery || [])].slice(0, 10);
        if (uploadedUrls.length > 0) payload.mediaPreview = uploadedUrls[0];
    }

    if (!payload.adId || !/^\d{10,12}$/.test(payload.adId)) {
        const error = new Error('Valid adId is required');
        error.statusCode = 400;
        throw error;
    }

    const sponsor = await mutationAdsRepository.findSponsor(userId);
    if (!sponsor) {
        const error = new Error('User not found');
        error.statusCode = 404;
        throw error;
    }

    const payloadSourceOwnerPublicId = String(payload?.editDraft?.sourceOwnerPublicId ?? payload?.ownerId ?? '').trim();
    const payloadSourceOwnerUsername = String(payload?.editDraft?.sourceOwnerUsername ?? payload?.ownerUsername ?? '').trim();
    const isPromoteAgainPhotoVideo = payload.promoteAgain === true && (campaignTypeLower === 'photo and video' || campaignTypeLower === 'photo & video');
    const displayOwnerPublicId = isPromoteAgainPhotoVideo && payloadSourceOwnerPublicId ? payloadSourceOwnerPublicId : String(sponsor.user_id || '').trim();
    const displayOwnerUsername = isPromoteAgainPhotoVideo && payloadSourceOwnerUsername ? payloadSourceOwnerUsername : String(sponsor.username || '').trim();

    const initialStatus = isAdmin ? payload.status : 'Under Review';
    const initialTiming = initialStatus === 'Active'
        ? {
            activeStartTime: payload.createdAt && !Number.isNaN(payload.createdAt.getTime()) ? payload.createdAt : new Date(),
            startedAt: payload.createdAt && !Number.isNaN(payload.createdAt.getTime()) ? payload.createdAt : new Date(),
            lastResumedAt: payload.createdAt && !Number.isNaN(payload.createdAt.getTime()) ? payload.createdAt : new Date(),
            pausedAt: null,
            accumulatedActiveMs: 0,
            completedAt: null,
        }
        : {
            activeStartTime: null,
            startedAt: null,
            lastResumedAt: null,
            pausedAt: null,
            accumulatedActiveMs: 0,
            completedAt: initialStatus === 'Completed' ? new Date() : null,
        };

    const row = await mutationAdsRepository.createAdRow([
        payload.adId, userId, displayOwnerPublicId, displayOwnerUsername, payload.campaignType, payload.title, payload.description,
        payload.mediaPreview, JSON.stringify(payload.mediaGallery), payload.mediaType, payload.genderTarget, payload.ageMin, payload.ageMax, payload.reach, payload.impressions,
        payload.clicks, payload.budget, payload.durationDays, payload.spend, payload.remainingBudget, initialStatus, payload.campaignPath,
        productPromoteIdentity.linkedProductId, productPromoteIdentity.linkedProductShareCode,
        productPromoteIdentity.originalProductId, productPromoteIdentity.originalProductCode,
        payload.walletTransferId, JSON.stringify(payload.editDraft),
        payload.tierId ?? null, payload.estimatedReachMin ?? null, payload.estimatedReachMax ?? null, payload.maxReachCap ?? null,
        payload.promoCode ?? null, payload.promoDiscount ?? null,
        initialTiming.activeStartTime, initialTiming.startedAt, initialTiming.lastResumedAt, initialTiming.pausedAt, initialTiming.accumulatedActiveMs, initialTiming.completedAt,
        payload.createdAt && !Number.isNaN(payload.createdAt.getTime()) ? payload.createdAt : null,
    ]);

    return { success: true, ad: mutationAdsRepository.mapRow(row), statusCode: 201 };
};

const updateAd = async (req) => {
    const client = await mutationAdsRepository.connect();
    try {
        await mutationAdsRepository.ensureAdsTable();
        const { adId } = req.params;
        const userId = req.user.id;
        const isAdmin = await mutationAdsRepository.readAdsRepository.assertAdmin(userId);
        await syncExpiredAds(require('../../config/database'), adId);

        const existingResult = await client.query('SELECT * FROM ads WHERE ad_id = $1 LIMIT 1', [adId]);
        if (!existingResult.rows.length) {
            const error = new Error('Ad not found');
            error.statusCode = 404;
            throw error;
        }

        const existingAd = mutationAdsRepository.mapRow(existingResult.rows[0]);
        const existingRow = existingResult.rows[0];
        const isOwner = Number(existingAd.userId) === Number(userId);
        if (!isOwner && !isAdmin) {
            const error = new Error('Ad not found');
            error.statusCode = 404;
            throw error;
        }

        const body = parseBody(req);
        const payload = mutationAdsRepository.normalizePayload(body, existingAd);
        const productPromoteIdentity = await mutationAdsRepository.resolveProductPromoteIdentity(payload, existingAd);
        if (String(payload.campaignType || '').trim().toLowerCase() === 'product promote'
            && !productPromoteIdentity.linkedProductId
            && !productPromoteIdentity.linkedProductShareCode) {
            const error = new Error('Product Promote requires a linked product');
            error.statusCode = 400;
            throw error;
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

        if (req.files && req.files.length > 0) {
            const uploadedUrls = await saveUploadedFiles(req.files, 'ads');
            payload.mediaGallery = [...uploadedUrls, ...(payload.mediaGallery || [])].slice(0, 10);
            if (uploadedUrls.length > 0) payload.mediaPreview = uploadedUrls[0];
        }

        const requestedStatus = payload.status;
        const isPromoteAgainRequest = payload.promoteAgain === true;
        const existingPhotoVideo = mutationAdsRepository.isPhotoVideoCampaign(existingRow);
        const nextPhotoVideo = mutationAdsRepository.isPhotoVideoCampaign({ ...existingRow, campaign_type: payload.campaignType });
        const canPromoteAgainTarget = existingPhotoVideo && nextPhotoVideo;
        const contentChanged = [
            'campaignType', 'title', 'description', 'mediaPreview', 'mediaType', 'genderTarget',
            'ageMin', 'ageMax', 'reach', 'impressions', 'clicks', 'budget', 'durationDays',
            'spend', 'remainingBudget', 'campaignPath', 'walletTransferId',
        ].some((field) => payload[field] !== existingAd[field])
            || JSON.stringify(payload.mediaGallery) !== JSON.stringify(existingAd.mediaGallery || [])
            || JSON.stringify(payload.editDraft || {}) !== JSON.stringify(existingAd.editDraft || {});

        if (!isAdmin) {
            if (isPromoteAgainRequest) {
                if (!isOwner || !canPromoteAgainTarget) {
                    const error = new Error('Only your Photo & Video ads can be promoted.');
                    error.statusCode = 403;
                    throw error;
                }
                payload.status = 'Under Review';
                payload.reach = 0;
                payload.spend = 0;
                payload.remainingBudget = Number(payload.budget || 0);
                payload.impressions = Number(existingAd.impressions || existingAd.views_count || existingAd.viewCount || 0);
                payload.clicks = Number(existingAd.clicks || 0);
                payload.editDraft = { ...(payload.editDraft || {}), promoteAgain: true, editingAdId: existingAd.adId };
            } else if (contentChanged && existingAd.status !== 'Under Review') {
                const error = new Error('Active ads can no longer be edited.');
                error.statusCode = 403;
                throw error;
            }

            if (!isPromoteAgainRequest && mutationAdsRepository.hasOwn(req.body, 'status')) {
                const currentStatus = String(existingAd.status || '');
                const canChangeStatus =
                    requestedStatus === currentStatus
                    || (requestedStatus === 'Cancelled' && ['Under Review', 'Active', 'Paused'].includes(currentStatus))
                    || (requestedStatus === 'Removed' && ['Active', 'Paused'].includes(currentStatus))
                    || (requestedStatus === 'Paused' && currentStatus === 'Active')
                    || (requestedStatus === 'Active' && currentStatus === 'Paused')
                    || (requestedStatus === 'Under Review' && currentStatus === 'Under Review');
                if (!canChangeStatus) {
                    const error = new Error('Only admins can approve or complete ads.');
                    error.statusCode = 403;
                    throw error;
                }
            }
        }

        if (requestedStatus === 'Active' && existingAd.status === 'Paused' && (String(payload.campaignType || '').trim().toLowerCase() === 'photo and video' || String(payload.campaignType || '').trim().toLowerCase() === 'photo & video')) {
            const limits = await getUserPlanLimits(userId);
            if (limits.adsExpiryDays > 0) {
                const ageDays = (Date.now() - new Date(existingAd.createdAt).getTime()) / (1000 * 60 * 60 * 24);
                if (ageDays >= limits.adsExpiryDays) {
                    const error = new Error('This ad has expired and cannot be resumed on your current plan. Please upgrade to a higher plan.');
                    error.statusCode = 403;
                    throw error;
                }
            }
        }

        if (payload.status === 'Cancelled' && ['Active', 'Paused'].includes(String(existingAd.status || ''))) {
            payload.status = 'Removed';
        }

        await client.query('BEGIN');

        if (
            existingAd.status === 'Under Review'
            && payload.status === 'Cancelled'
            && Number(existingAd.walletTransferId) > 0
            && mutationAdsRepository.supportsRemainingBudgetRefund(existingAd.campaignType)
        ) {
            const transferResult = await client.query(
                `SELECT id, sender_id, receiver_id, amount, status, type, note
                 FROM wallet_transfers
                 WHERE id = $1
                 LIMIT 1
                 FOR UPDATE`,
                [existingAd.walletTransferId]
            );

            if (transferResult.rows.length > 0) {
                const transfer = transferResult.rows[0];
                const refundAmount = Math.max(0, Number(existingAd.budget || 0) - Number(existingAd.spend || 0));
                const advertiserUserId = Number(transfer.sender_id || existingAd.userId);
                const canonicalGoogerUserId = await mutationAdsRepository.resolveGoogerMainWalletUserId(client);
                const googerUserId = Number(canonicalGoogerUserId || 0);
                const transferStatus = String(transfer.status || '').toLowerCase();
                const transferType = String(transfer.type || '').toLowerCase();
                const isLegacyAdHold = transferType === 'order_hold' && /ad promote/i.test(String(transfer.note || ''));

                if (refundAmount > 0 && advertiserUserId > 0 && googerUserId > 0 && transferStatus !== 'cancelled' && transferStatus !== 'refunded') {
                    await client.query('UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2', [refundAmount, advertiserUserId]);

                    if (isLegacyAdHold) {
                        await client.query(
                            `UPDATE users
                             SET hold_balance = GREATEST(0, COALESCE(hold_balance, 0) - $1)
                             WHERE id = $2`,
                            [refundAmount, advertiserUserId]
                        );
                    }

                    await client.query(
                        `INSERT INTO wallet_transfers (
                            sender_id, receiver_id, amount, note, type, status, commission, commission_percentage, created_at, updated_at
                         )
                         VALUES ($1, $2, $3, $4, 'ad_refund', 'accepted', $5, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                        [
                            googerUserId,
                            advertiserUserId,
                            refundAmount,
                            `Ad Refund - ${existingAd.adId} (${existingAd.campaignType}) - Cancelled During Review`,
                            -refundAmount,
                        ]
                    );

                    if (isLegacyAdHold) {
                        await client.query(
                            `UPDATE wallet_transfers
                             SET status = 'cancelled',
                                 updated_at = CURRENT_TIMESTAMP
                             WHERE id = $1`,
                            [transfer.id]
                        );
                    }
                }
            }
        }

        if (
            ['Active', 'Paused'].includes(String(existingAd.status || ''))
            && ['Cancelled', 'Removed'].includes(String(payload.status || ''))
            && Number(existingAd.walletTransferId) > 0
            && mutationAdsRepository.supportsRemainingBudgetRefund(existingAd.campaignType)
        ) {
            const transferResult = await client.query(
                `SELECT id, sender_id, receiver_id, amount, status, type, note, commission
                 FROM wallet_transfers
                 WHERE id = $1
                 LIMIT 1
                 FOR UPDATE`,
                [existingAd.walletTransferId]
            );

            if (transferResult.rows.length > 0) {
                const transfer = transferResult.rows[0];
                const advertiserUserId = Number(transfer.sender_id || existingAd.userId);
                const refundAmount = Math.max(0, Number(existingAd.budget || 0) - Number(existingAd.spend || 0));
                const transferStatus = String(transfer.status || '').toLowerCase();
                const canonicalGoogerUserIdActive = await mutationAdsRepository.resolveGoogerMainWalletUserId(client);
                const googerUserIdActive = Number(canonicalGoogerUserIdActive || 0);

                if (refundAmount > 0 && advertiserUserId > 0 && googerUserIdActive > 0 && transferStatus === 'accepted') {
                    await client.query('UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2', [refundAmount, advertiserUserId]);
                    await client.query(
                        `INSERT INTO wallet_transfers (
                            sender_id, receiver_id, amount, note, type, status, commission, commission_percentage, created_at, updated_at
                         )
                         VALUES ($1, $2, $3, $4, 'ad_refund', 'accepted', $5, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                        [
                            Number(transfer.receiver_id || 0) || advertiserUserId,
                            advertiserUserId,
                            refundAmount,
                            `Ad Remaining Budget Refund - ${existingAd.adId} (${existingAd.campaignType}) - Cancelled After Activation`,
                            -refundAmount,
                        ]
                    );

                    payload.remainingBudget = 0;
                }
            }
        }

        if (
            String(payload.status || '') === 'Active'
            && String(existingAd.status || '') !== 'Active'
            && Number(existingAd.walletTransferId) > 0
        ) {
            const transferResult = await client.query(
                `SELECT id, sender_id, amount, status, note
                 FROM wallet_transfers
                 WHERE id = $1
                 LIMIT 1
                 FOR UPDATE`,
                [existingAd.walletTransferId]
            );

            if (transferResult.rows.length > 0) {
                const transfer = transferResult.rows[0];
                const transferStatus = String(transfer.status || '').toLowerCase();
                if (transferStatus === 'accepted' || transferStatus === 'completed') {
                    await distributeReferralCommission(client, {
                        buyerId: transfer.sender_id || existingAd.userId,
                        grossAmount: transfer.amount,
                        sourceType: 'ad',
                        sourceId: `ad-${existingAd.adId || existingAd.id || existingAd.walletTransferId}`,
                        description: transfer.note || `Ad ${existingAd.adId || existingAd.campaignType || ''}`.trim(),
                    });
                }
            }
        }

        const timingState = mutationAdsRepository.buildTimingUpdateState(existingRow, payload.status);
        const previousStatus = String(existingAd.status || '').trim();
        const isActivatingAd = String(payload.status || '') === 'Active' && previousStatus !== 'Active';
        const isApprovalActivation = String(payload.status || '') === 'Active'
            && ['Under Review', 'Pending Approval', 'Approved'].includes(previousStatus);
        const isPausingAd = String(payload.status || '') === 'Paused' && previousStatus === 'Active';
        const isCompletingAd = ['Completed', 'Cancelled', 'Removed'].includes(String(payload.status || '')) && previousStatus === 'Active';

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
                 active_start_time = CASE WHEN $29 THEN NULL WHEN $38 THEN (NOW()) ELSE COALESCE($30::timestamp, active_start_time) END,
                 started_at = CASE WHEN $29 THEN NULL WHEN $38 THEN (NOW()) ELSE COALESCE($31::timestamp, started_at) END,
                 last_resumed_at = CASE WHEN $29 THEN NULL WHEN $39 THEN (NOW()) ELSE $32::timestamp END,
                 paused_at = CASE WHEN $29 THEN NULL WHEN $40 THEN (NOW()) ELSE $33::timestamp END,
                 accumulated_active_ms = CASE WHEN $29 THEN 0 ELSE COALESCE($34, accumulated_active_ms) END,
                 completed_at = CASE WHEN $29 THEN NULL WHEN $41 THEN (NOW()) ELSE $35::timestamp END,
                 current_reach = COALESCE($36, current_reach),
                 updated_at = CURRENT_TIMESTAMP
             WHERE ad_id = $37
             RETURNING *`,
            [
                payload.campaignType, payload.title, payload.description, payload.mediaPreview, JSON.stringify(payload.mediaGallery), payload.mediaType,
                payload.genderTarget, payload.ageMin, payload.ageMax, payload.reach, payload.impressions, payload.clicks,
                payload.budget, payload.durationDays, payload.spend, payload.remainingBudget, payload.status,
                payload.campaignPath, productPromoteIdentity.linkedProductId, productPromoteIdentity.linkedProductShareCode,
                productPromoteIdentity.originalProductId, productPromoteIdentity.originalProductCode,
                payload.walletTransferId, JSON.stringify(payload.editDraft),
                payload.tierId ?? null, payload.estimatedReachMin ?? null, payload.estimatedReachMax ?? null, payload.maxReachCap ?? null,
                isPromoteAgainRequest,
                timingState.activeStartTime,
                timingState.startedAt,
                timingState.lastResumedAt,
                timingState.pausedAt,
                timingState.accumulatedActiveMs,
                timingState.completedAt,
                isPromoteAgainRequest ? 0 : null,
                adId,
                isApprovalActivation,
                isActivatingAd,
                isPausingAd,
                isCompletingAd,
            ]
        );

        if (!result.rows.length) {
            await client.query('ROLLBACK');
            const error = new Error('Ad not found');
            error.statusCode = 404;
            throw error;
        }

        await client.query('COMMIT');
        if (['Removed', 'Cancelled'].includes(String(payload.status || ''))) {
            await syncExpiredAds(require('../../config/database'), adId);
        }

        return { success: true, ad: mutationAdsRepository.mapRow(result.rows[0]), statusCode: 200 };
    } catch (error) {
        try { await client.query('ROLLBACK'); } catch {}
        throw error;
    } finally {
        client.release();
    }
};

module.exports = {
    createAd,
    updateAd,
};
