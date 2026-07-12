const activePublicAdsRepository = require('./activePublicAdsRepository');

const getGraceIntervalSql = () => `((${require('../../utils/subscriptionRenewal').getGraceDurationSeconds()}::text || ' seconds')::interval)`;
const getRawPhotoVideoProfileExpiryIntervalSql = () => `COALESCE(
    CASE
        WHEN COALESCE(a.duration_days, 0) > 0 THEN COALESCE(a.duration_days, 0) * INTERVAL '1 day'
        ELSE NULL
    END,
    (
        SELECT
            CASE
                WHEN NULLIF(sp.extra->>'ads_expiry_value', '')::numeric > 0 THEN
                    NULLIF(sp.extra->>'ads_expiry_value', '')::numeric *
                    CASE LOWER(COALESCE(sp.extra->>'ads_expiry_unit', 'days'))
                        WHEN 'minutes' THEN INTERVAL '1 minute'
                        WHEN 'hours' THEN INTERVAL '1 hour'
                        ELSE INTERVAL '1 day'
                    END
                WHEN NULLIF(sp.extra->>'ads_expiry_days', '')::numeric > 0 THEN
                    NULLIF(sp.extra->>'ads_expiry_days', '')::numeric * INTERVAL '1 day'
                ELSE NULL
            END
        FROM user_plan_subscriptions ups
        JOIN subscription_plans sp ON sp.id = ups.plan_id
        WHERE ups.user_id = a.user_id
          AND ups.status = 'active'
          AND (ups.expires_at IS NULL OR ups.expires_at + ${getGraceIntervalSql()} > NOW())
        ORDER BY ups.started_at DESC
        LIMIT 1
    ),
    (
        SELECT
            CASE
                WHEN NULLIF(sp.extra->>'ads_expiry_value', '')::numeric > 0 THEN
                    NULLIF(sp.extra->>'ads_expiry_value', '')::numeric *
                    CASE LOWER(COALESCE(sp.extra->>'ads_expiry_unit', 'days'))
                        WHEN 'minutes' THEN INTERVAL '1 minute'
                        WHEN 'hours' THEN INTERVAL '1 hour'
                        ELSE INTERVAL '1 day'
                    END
                WHEN NULLIF(sp.extra->>'ads_expiry_days', '')::numeric > 0 THEN
                    NULLIF(sp.extra->>'ads_expiry_days', '')::numeric * INTERVAL '1 day'
                ELSE NULL
            END
        FROM subscription_plans sp
        WHERE sp.slug = 'basic' AND sp.is_active = TRUE
        LIMIT 1
    )
)`;
const RAW_PHOTO_VIDEO_PROFILE_NOT_EXPIRED_SQL = `
    a.active_start_time IS NOT NULL
    AND (${getRawPhotoVideoProfileExpiryIntervalSql()}) IS NOT NULL
    AND a.active_start_time > NOW() - (${getRawPhotoVideoProfileExpiryIntervalSql()})
`;

const getActiveAdsPublic = async (req, res) => {
    const requestStartedAt = process.hrtime.bigint();
    const timings = {};
    const mark = (label, startedAt) => {
        timings[label] = Number(activePublicAdsRepository.readDurationMs(startedAt).toFixed(2));
    };

    const viewerId = activePublicAdsRepository.getOptionalViewerId(req);
    const isAnonymousRequest = !viewerId;
    if (!isAnonymousRequest) {
        const ensureEngagementStartedAt = process.hrtime.bigint();
        await activePublicAdsRepository.ensureAdEngagementTables();
        mark('ensureEngagementMs', ensureEngagementStartedAt);
    }

    const limitRaw = Number.parseInt(req.query.limit, 10);
    const offsetRaw = Number.parseInt(req.query.offset, 10);
    const shuffleSeed = String(req.query.shuffle || req.query.feedSession || '').trim();
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : 20;
    const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0;
    const ownerUserId = req.query.user_id ? Number.parseInt(req.query.user_id, 10) : null;
    const cacheKey = isAnonymousRequest ? activePublicAdsRepository.getAnonymousPublicAdsCacheKey(req, limit, offset, ownerUserId) : null;
    const cachedPayload = activePublicAdsRepository.getCachedAnonymousPublicAds(cacheKey);
    if (cachedPayload) {
        res.setHeader('X-Public-Ads-Cache', 'HIT');
        return cachedPayload;
    }

    const fetchLimit = ownerUserId && Number.isFinite(ownerUserId)
        ? Math.min(limit * 4 + 1, 200)
        : Math.min(limit * 2 + 8, 80);
    const queryStartedAt = process.hrtime.bigint();
    const candidateRows = await activePublicAdsRepository.findCandidateAds(fetchLimit, offset, viewerId, ownerUserId, RAW_PHOTO_VIDEO_PROFILE_NOT_EXPIRED_SQL);
    mark('queryMs', queryStartedAt);

    let viewerProfile = null;
    if (!isAnonymousRequest) {
        const viewerProfileStartedAt = process.hrtime.bigint();
        viewerProfile = await activePublicAdsRepository.loadViewerAdProfile(require('../../config/database'), viewerId, req);
        mark('viewerProfileMs', viewerProfileStartedAt);
    }

    const eligibilityStartedAt = process.hrtime.bigint();
    const eligibleRows = (candidateRows || []).filter((row) => {
        if (ownerUserId && Number.isFinite(ownerUserId)) {
            const status = String(row.status || '').trim();
            if (['Active', 'Removed', 'Paused'].includes(status)) return true;
            if (status !== 'Completed') return false;
            const mediaType = String(row.media_type || '').trim().toLowerCase();
            if (!['image', 'photo', 'video'].includes(mediaType)) return false;
            return true;
        }
        return activePublicAdsRepository.adIsWithinDeliveryRules(row);
    });
    mark('eligibilityMs', eligibilityStartedAt);

    let rows;
    if (ownerUserId && Number.isFinite(ownerUserId)) {
        rows = eligibleRows;
    } else if (viewerProfile?.isAnonymous) {
        rows = eligibleRows;
    } else {
        const targetingStartedAt = process.hrtime.bigint();
        const targetedRows = eligibleRows.filter((row) => activePublicAdsRepository.adMatchesViewer(row, viewerProfile || {}));
        const targetedIds = new Set(targetedRows.map((row) => String(row.ad_id || row.id)));
        const fallbackRows = eligibleRows.filter((row) => !targetedIds.has(String(row.ad_id || row.id)));
        rows = [...targetedRows, ...fallbackRows];
        mark('targetingMs', targetingStartedAt);
    }

    if (shuffleSeed) {
        const shuffleStartedAt = process.hrtime.bigint();
        rows = activePublicAdsRepository.shuffleRowsWithSeed(
            rows,
            `${shuffleSeed}:${viewerId || 'guest'}`,
            (row) => String(row?.ad_id || row?.id || Math.random())
        );
        mark('shuffleMs', shuffleStartedAt);
    }

    const mapAdsStartedAt = process.hrtime.bigint();
    const ads = rows.slice(0, limit).map((row) => {
        const ad = {
            ...activePublicAdsRepository.savedAdsRepository.mapRow(row),
            user_liked: !!row.user_liked || !!row.ad_coin_collected,
            ad_coin_collected: !!row.ad_coin_collected,
            ad_like_locked: !!row.ad_coin_collected,
        };
        const mediaGallery = (ad.mediaGallery || []).map(activePublicAdsRepository.getMediaUrl).filter(Boolean);
        const mediaPreview = activePublicAdsRepository.getMediaUrl(ad.mediaPreview) || mediaGallery[0] || activePublicAdsRepository.getRawMediaValue(ad.mediaPreview) || '/assets/images/googer.png';
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
                profile_picture: activePublicAdsRepository.getMediaUrl(ad.user?.profile_picture) || null,
            },
            user_liked: !!ad.user_liked,
            ad_coin_collected: !!ad.ad_coin_collected,
            ad_like_locked: !!ad.ad_coin_collected,
        };
    });
    mark('mapAdsMs', mapAdsStartedAt);

    const hydrateProductsStartedAt = process.hrtime.bigint();
    const productPromoteTargets = ads
        .map((ad) => {
            if (!activePublicAdsRepository.isProductPromoteCampaign(ad)) return null;
            return activePublicAdsRepository.getProductPromoteTarget(ad);
        })
        .filter((target) => target && (target.productId || target.productCode));

    const productIds = Array.from(new Set(productPromoteTargets.map((target) => target.productId).filter((value) => Number.isFinite(value))));
    const productCodes = Array.from(new Set(productPromoteTargets.map((target) => target.productCode).filter(Boolean)));
    const linkedProducts = await activePublicAdsRepository.findLinkedProducts(productIds, productCodes);

    const productById = new Map(linkedProducts.map((row) => [Number(row.id), row]));
    const productByCode = new Map(linkedProducts.map((row) => [String(row.product_code || ''), row]));

    const hydratedAds = ads.map((ad) => {
        if (!activePublicAdsRepository.isProductPromoteCampaign(ad)) return ad;

        const target = activePublicAdsRepository.getProductPromoteTarget(ad);
        const linked =
            (target.productId != null && productById.get(Number(target.productId))) ||
            (target.productCode && productByCode.get(String(target.productCode)));

        if (!linked) {
            console.warn('Failed to hydrate Product Promote public ad', {
                adId: ad.adId || ad.ad_id,
                productId: target.productId,
                productCode: target.productCode,
            });
            return null;
        }

        const price = Number(linked.price || ad.price || 0);
        const promoPrice = linked.promo_price ?? ad.promo_price ?? null;
        const linkedVariants = Array.isArray(linked.variants) ? linked.variants : [];
        const linkedGallery = Array.isArray(linked.media_gallery) ? linked.media_gallery : [];
        const linkedVariantImages = linkedVariants
            .map((variant) => variant?.image_url || variant?.url || variant?.image)
            .filter(Boolean);
        const isPlaceholderImage = (value) => {
            const text = String(value || '').trim().toLowerCase();
            return !text || text.includes('/assets/images/googer.png') || text.includes('/assets/images/rupeer');
        };
        const productImageCandidates = [
            activePublicAdsRepository.getMediaUrl(linked.image_url) || activePublicAdsRepository.getRawMediaValue(linked.image_url),
            ...linkedGallery.map((item) => activePublicAdsRepository.getMediaUrl(item) || activePublicAdsRepository.getRawMediaValue(item)),
            ...linkedVariantImages.map((item) => activePublicAdsRepository.getMediaUrl(item) || activePublicAdsRepository.getRawMediaValue(item)),
            activePublicAdsRepository.getMediaUrl(ad.media_preview) || activePublicAdsRepository.getRawMediaValue(ad.media_preview),
            activePublicAdsRepository.getMediaUrl(ad.image_url) || activePublicAdsRepository.getRawMediaValue(ad.image_url),
        ];
        const productImage = productImageCandidates.find((item) => !isPlaceholderImage(item)) || '/assets/images/googer.png';
        const sizes = Array.isArray(linked.sizes) ? linked.sizes : activePublicAdsRepository.deriveVariantSizes(linkedVariants);
        const colors = Array.isArray(linked.colors) ? linked.colors : activePublicAdsRepository.deriveVariantColors(linkedVariants);
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
            images: activePublicAdsRepository.normalizeMediaGallery([productImage, ...linkedGallery, ...linkedVariantImages, ...(Array.isArray(ad.media_gallery) ? ad.media_gallery : [])]),
            media_gallery: activePublicAdsRepository.normalizeMediaGallery([productImage, ...linkedGallery, ...linkedVariantImages, ...(Array.isArray(ad.media_gallery) ? ad.media_gallery : [])]),
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
            views_count: Number(ad.views_count || 0),
            viewCount: Number(ad.views_count || 0),
            user_liked: !!ad.user_liked,
            ad_coin_collected: !!ad.ad_coin_collected,
            ad_like_locked: !!ad.ad_coin_collected,
        };
    }).filter(Boolean);
    mark('hydrateProductsMs', hydrateProductsStartedAt);

    const payload = {
        success: true,
        ads: hydratedAds,
        pagination: {
            limit,
            offset,
            nextOffset: offset + hydratedAds.length,
            hasMore: rows.length > limit || candidateRows.length > limit,
        },
    };

    if (cacheKey) {
        activePublicAdsRepository.setCachedAnonymousPublicAds(cacheKey, payload);
        res.setHeader('X-Public-Ads-Cache', 'MISS');
    }

    mark('totalMs', requestStartedAt);
    if (activePublicAdsRepository.shouldLogPublicAdsTiming()) {
        console.info('[public-ads-timing]', {
            viewerId: viewerId || null,
            isAnonymousRequest,
            limit,
            offset,
            ownerUserId: ownerUserId || null,
            fetchLimit,
            rowsFetched: candidateRows.length,
            rowsEligible: eligibleRows.length,
            adsReturned: hydratedAds.length,
            timings,
        });
    }

    return payload;
};

module.exports = {
    getActiveAdsPublic,
};
