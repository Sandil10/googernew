const activePublicAdsRepository = require('./activePublicAdsRepository');

function normalizeAdToContract(ad, options = {}) {
    // If it's already normalized and we don't want to re-run, return it.
    // Actually we'll always compute it to be safe.
    const campaignType = String(ad.campaign_type || ad.campaignType || '').trim().toLowerCase();
    
    // Core advertiser identity
    const advertiserUserId = ad.user_id || ad.userId || ad.ad_owner_user_id || ad.adOwnerUserId || ad.advertiser_id || ad.advertiserId || null;
    const advertiserPublicUserId = ad.owner_user_id || ad.ownerUserId || ad.user?.user_id || ad.user?.userId || null;
    const advertiserUsername = ad.owner_username || ad.ownerUsername || ad.user?.username || ad.username || ad.ad_display_username || null;
    const advertiserFullName = ad.full_name || ad.fullName || ad.user?.full_name || ad.user?.fullName || ad.ad_display_full_name || advertiserUsername || null;
    let advertiserProfilePicture = ad.profile_picture || ad.user?.profile_picture || ad.ad_display_avatar || null;
    if (advertiserProfilePicture && (advertiserProfilePicture.includes('assets/images/googer.png') || advertiserProfilePicture.includes('assets/images/rupeer'))) {
        advertiserProfilePicture = null;
    }

    const advertiser = {
        id: advertiserUserId,
        googerId: advertiserPublicUserId,
        username: advertiserUsername,
        fullName: advertiserFullName,
        avatar: advertiserProfilePicture,
        verifiedBadgeUserId: advertiserUserId,
    };

    const engagement = {
        liked: !!ad.user_liked,
        likes: Number(ad.likes_count || ad.likeCount || 0),
        comments: Number(ad.comments_count || ad.commentCount || 0),
        shares: Number(ad.shares_count || ad.shareCount || 0),
        views: Number(ad.views_count || ad.viewCount || 0),
        coinCollected: !!ad.ad_coin_collected,
        likeLocked: !!ad.ad_like_locked,
    };

    const baseNormalized = {
        id: String(ad.adId || ad.ad_id || ad.id || ''),
        type: ad.campaign_type || ad.campaignType || 'Ads',
        advertiser,
        engagement,
    };

    if (campaignType === 'product promote' || campaignType === 'product promote ad') {
        const price = Number(ad.price || ad.product_price || 0);
        const promoPrice = ad.promo_price ?? null;
        let discountPercent = String(ad.commission_info?.discount ?? ad.commission_info?.resell_percentage ?? ad.discount ?? ad.resell_percentage ?? ad.resell_percent ?? '').trim();
        let resellPercent = String(ad.commission_info?.resell_percentage ?? ad.commission_info?.resell_percent ?? ad.resell_percentage ?? ad.resell_percent ?? '').trim();

        baseNormalized.product = {
            id: ad.linked_product_id || ad.productId || ad.product_id || ad.original_product_id || ad.id,
            ownerId: ad.product_owner_user_id || ad.productOwnerUserId || ad.seller_id || ad.linked_product_owner_id || null,
            ownerUsername: ad.product_owner_username || ad.productOwnerUsername || ad.seller_username || ad.linked_product_owner_username || null,
            ownerAvatar: ad.linked_product_profile_picture || ad.linkedProductProfilePicture || null,
            title: ad.title || '',
            description: ad.description || '',
            image: ad.image_url || ad.media_preview || ad.mediaPreview || '/assets/images/googer.png',
            gallery: Array.isArray(ad.media_gallery) ? ad.media_gallery : (Array.isArray(ad.mediaGallery) ? ad.mediaGallery : []),
            price,
            promoPrice,
            oldPrice: promoPrice && Number(promoPrice) > 0 && Number(promoPrice) < price ? price : null,
            discountPercent,
            resellPercent,
            shareCode: ad.product_code || ad.shareCode || ad.share_code || ad.linked_product_share_code || String(baseNormalized.id),
        };
    } else if (campaignType === 'profile promote' || campaignType === 'profile promote ad') {
        // Find draft/raw for extra info if present
        const draft = (ad.edit_draft || ad.editDraft || {});
        const raw = (ad.raw || {});
        const rawDraft = (raw.edit_draft || raw.editDraft || {});
        
        const targetUserId = draft.promotedProfileUserId || draft.promoted_profile_user_id || rawDraft.promotedProfileUserId || rawDraft.promoted_profile_user_id || ad.promotedProfileUserId || ad.promoted_profile_user_id || null;
        const targetGoogerId = draft.targetUserGoogerId || draft.target_user_googer_id || ad.targetUserGoogerId || ad.target_user_googer_id || null;
        const targetUsername = draft.promotedProfileUsername || draft.promoted_profile_username || ad.promotedProfileUsername || ad.promoted_profile_username || null;
        const targetFullName = draft.promotedProfileFullName || draft.promoted_profile_full_name || ad.promotedProfileFullName || ad.promoted_profile_full_name || targetUsername || null;
        let targetAvatar = draft.promotedProfilePicture || draft.promoted_profile_picture || ad.promotedProfilePicture || ad.promoted_profile_picture || null;
        if (targetAvatar && (targetAvatar.includes('assets/images/googer.png') || targetAvatar.includes('assets/images/rupeer'))) targetAvatar = null;

        const featuredItems = Array.isArray(ad.featuredItems || ad.featured_items) ? (ad.featuredItems || ad.featured_items) : [];

        baseNormalized.profilePromote = {
            targetUserId,
            targetGoogerId,
            username: targetUsername,
            fullName: targetFullName,
            avatar: targetAvatar,
            featuredItems: featuredItems.map(item => ({
                id: item.id,
                type: item.type,
                title: item.title,
                image: item.image || item.image_url,
                views: Number(item.views || item.views_count || 0)
            })),
        };
    } else {
        // Photo and Video
        let mediaPreview = ad.media_preview || ad.mediaPreview;
        if (!mediaPreview) {
            const gallery = ad.media_gallery || ad.mediaGallery || [];
            if (Array.isArray(gallery) && gallery.length > 0) mediaPreview = gallery[0];
        }
        baseNormalized.media = {
            preview: mediaPreview || '/assets/images/googer.png',
            gallery: Array.isArray(ad.media_gallery) ? ad.media_gallery : (Array.isArray(ad.mediaGallery) ? ad.mediaGallery : []),
            mediaType: ad.media_type || ad.mediaType || 'image',
            videoUrl: (ad.media_type || ad.mediaType || '').toLowerCase().includes('video') ? (ad.video_url || ad.videoUrl || mediaPreview) : '',
            ctaTopic: ad.cta_topic || ad.ctaTopic || (ad.edit_draft || ad.editDraft || {}).ctaTopic || '',
            ctaValue: ad.cta_value || ad.ctaValue || (ad.edit_draft || ad.editDraft || {}).ctaValue || ad.active_link || ad.activeLink || '',
            activeLink: ad.active_link || ad.activeLink || '',
            ctaCountryCode: ad.cta_country_code || ad.ctaCountryCode || (ad.edit_draft || ad.editDraft || {}).ctaCountryCode || 'US',
        };
    }

    return baseNormalized;
}

module.exports = {
    normalizeAdToContract,
};

