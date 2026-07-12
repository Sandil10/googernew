"use client";

const PHOTO_VIDEO_DRAFT_KEY = "googer-ad-draft-photo-and-video";
const PRODUCT_PROMOTE_DRAFT_KEY = "googer-ad-draft-product-promote";

function stringValue(value: unknown) {
    return String(value ?? "").trim();
}

function rawValue(ad: any) {
    return ad?.raw?.raw || ad?.raw || {};
}

function getAdId(ad: any) {
    const raw = rawValue(ad);
    return stringValue(ad?.adId || ad?.ad_id || ad?.id || raw?.adId || raw?.ad_id || raw?.id);
}

function getGallery(ad: any) {
    const raw = rawValue(ad);
    const rawGallery = ad?.mediaGallery || ad?.media_gallery || raw?.mediaGallery || raw?.media_gallery;
    if (Array.isArray(rawGallery)) return rawGallery.filter((item) => typeof item === "string" && item.trim());
    return [];
}

export function isPhotoVideoPromotableAd(ad: any) {
    const raw = rawValue(ad);
    const campaignType = stringValue(ad?.campaign_type || ad?.campaignType || raw.campaign_type || raw.campaignType).toLowerCase();
    if (!campaignType.includes("photo") || !campaignType.includes("video")) return false;

    const activeLink = stringValue(ad?.active_link || ad?.activeLink || raw.active_link || raw.activeLink || raw.editDraft?.activeLink || raw.edit_draft?.activeLink);
    const mediaType = stringValue(ad?.mediaType || ad?.media_type || raw.mediaType || raw.media_type).toLowerCase();
    const mediaPreview = stringValue(ad?.mediaPreview || ad?.media_preview || raw.mediaPreview || raw.media_preview);
    const gallery = getGallery(ad);

    return !!activeLink || mediaType === "image" || mediaType === "video" || !!mediaPreview || gallery.length > 0;
}

function getLinkedProductId(ad: any) {
    const raw = rawValue(ad);
    const draft = raw?.editDraft || raw?.edit_draft || ad?.editDraft || ad?.edit_draft || {};
    return (
        ad?.linkedProductId ??
        ad?.linked_product_id ??
        ad?.productId ??
        ad?.product_id ??
        ad?.original_product_id ??
        raw?.linkedProductId ??
        raw?.linked_product_id ??
        raw?.productId ??
        raw?.product_id ??
        raw?.original_product_id ??
        draft?.linkedProductId ??
        draft?.productId ??
        draft?.product_id ??
        null
    );
}

export function isProductPromotableAd(ad: any) {
    const raw = rawValue(ad);
    const campaignType = stringValue(ad?.campaign_type || ad?.campaignType || raw.campaign_type || raw.campaignType).toLowerCase();
    return campaignType === "product promote" && !!getLinkedProductId(ad);
}

export async function promoteProductAdAgain({
    ad,
    router,
}: {
    ad: any;
    router: { push: (href: string) => void };
}) {
    if (!isProductPromotableAd(ad)) return;

    const raw = rawValue(ad);
    const adId = getAdId(ad);
    const linkedProductId = getLinkedProductId(ad);
    if (!adId || !linkedProductId) return;

    const draft = raw?.editDraft || raw?.edit_draft || ad?.editDraft || ad?.edit_draft || {};

    window.localStorage.setItem(PRODUCT_PROMOTE_DRAFT_KEY, JSON.stringify({
        version: 1,
        editingAdId: adId,
        promoteAgain: true,
        linkedProductId,
        activeLink: "",
        linkInput: "",
        description: stringValue(ad?.description || raw.description || draft.description).slice(0, 50),
        ctaTopic: ad?.cta_topic || ad?.ctaTopic || raw.cta_topic || raw.ctaTopic || draft.ctaTopic || "Visit",
        ctaValue: ad?.cta_value || ad?.ctaValue || raw.cta_value || raw.ctaValue || draft.ctaValue || "",
        selectedCountryCode: draft.selectedCountryCode || "US",
        selectedLocationCodes: draft.selectedLocationCodes || [],
        genderTarget: ad?.genderTarget || ad?.gender_target || raw.genderTarget || raw.gender_target || draft.genderTarget || "All",
        ageMin: Number(ad?.ageMin ?? ad?.age_min ?? raw.ageMin ?? raw.age_min ?? draft.ageMin ?? 18),
        ageMax: Number(ad?.ageMax ?? ad?.age_max ?? raw.ageMax ?? raw.age_max ?? draft.ageMax ?? 65),
        selectedInterestTopics: draft.selectedInterestTopics || [],
        selectedPlacements: draft.selectedPlacements || ["All", "Goog Msg"],
        budget: undefined,
        durationDays: undefined,
        promoCode: "",
        hasPromoCodeAdded: false,
    }));

    router.push(`/ad-campaign/product-promote?productId=${encodeURIComponent(String(linkedProductId))}`);
}

export async function promotePhotoVideoAdAgain({
    ad,
    router,
}: {
    ad: any;
    router: { push: (href: string) => void };
}) {
    if (!isPhotoVideoPromotableAd(ad)) return;

    const raw = rawValue(ad);
    const adId = getAdId(ad);
    if (!adId) return;

    const gallery = getGallery(ad);
    const mediaPreview = stringValue(ad?.mediaPreview || ad?.media_preview || raw.mediaPreview || raw.media_preview || gallery[0]);
    const mediaType = stringValue(ad?.mediaType || ad?.media_type || raw.mediaType || raw.media_type);
    const activeLink = stringValue(ad?.active_link || ad?.activeLink || raw.active_link || raw.activeLink || raw.editDraft?.activeLink || raw.edit_draft?.activeLink);
    const carryOverViews = Number(
        ad?.views_count ??
        ad?.viewCount ??
        ad?.views ??
        raw?.views_count ??
        raw?.viewCount ??
        raw?.views ??
        0,
    );
    const sourceOwnerDbId = ad?.user_id ?? ad?.userId ?? raw?.user_id ?? raw?.userId ?? raw?.user?.id ?? null;
    const sourceOwnerPublicId = stringValue(
        ad?.owner_user_id ||
        ad?.ownerUserId ||
        raw?.owner_user_id ||
        raw?.ownerUserId ||
        raw?.user?.user_id ||
        raw?.user_id
    );
    const sourceOwnerUsername = stringValue(
        ad?.owner_username ||
        ad?.ownerUsername ||
        ad?.username ||
        raw?.owner_username ||
        raw?.ownerUsername ||
        raw?.username ||
        raw?.user?.username
    );
    const sourceOwnerProfilePicture = stringValue(
        ad?.profile_picture ||
        raw?.profile_picture ||
        raw?.profilePicture ||
        raw?.user?.profile_picture ||
        raw?.user?.profilePicture
    );

    window.localStorage.setItem(PHOTO_VIDEO_DRAFT_KEY, JSON.stringify({
        version: 1,
        editingAdId: adId,
        promoteAgain: true,
        carryOverViews: Number.isFinite(carryOverViews) ? Math.max(0, carryOverViews) : 0,
        activeLink,
        linkInput: activeLink,
        description: stringValue(ad?.description || raw.description).slice(0, 50),
        ctaTopic: ad?.cta_topic || ad?.ctaTopic || raw.cta_topic || raw.ctaTopic || "Visit",
        ctaValue: ad?.cta_value || ad?.ctaValue || raw.cta_value || raw.ctaValue || "",
        selectedCountryCode: ad?.editDraft?.selectedCountryCode || raw.editDraft?.selectedCountryCode || "US",
        selectedLocationCodes: ad?.editDraft?.selectedLocationCodes || raw.editDraft?.selectedLocationCodes || [],
        genderTarget: ad?.genderTarget || ad?.gender_target || raw.genderTarget || raw.gender_target || "All",
        ageMin: Number(ad?.ageMin ?? ad?.age_min ?? raw.ageMin ?? raw.age_min ?? 18),
        ageMax: Number(ad?.ageMax ?? ad?.age_max ?? raw.ageMax ?? raw.age_max ?? 65),
        selectedInterestTopics: ad?.editDraft?.selectedInterestTopics || raw.editDraft?.selectedInterestTopics || [],
        selectedPlacements: ad?.editDraft?.selectedPlacements || raw.editDraft?.selectedPlacements || ["All", "Goog Msg"],
        budget: undefined,
        durationDays: undefined,
        promoCode: "",
        hasPromoCodeAdded: false,
        sourceOwnerDbId,
        sourceOwnerPublicId,
        sourceOwnerUsername,
        sourceOwnerProfilePicture,
        mediaPreview,
        mediaGallery: gallery.length ? gallery : (mediaPreview ? [mediaPreview] : []),
        mediaType: mediaType || (/\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(mediaPreview) ? "video" : "image"),
        imageName: mediaType === "video" ? "Uploaded video" : "Uploaded media",
    }));

    router.push("/ad-campaign/photo-video");
}
