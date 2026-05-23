"use client";

const PHOTO_VIDEO_DRAFT_KEY = "googer-ad-draft-photo-and-video";

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

    window.localStorage.setItem(PHOTO_VIDEO_DRAFT_KEY, JSON.stringify({
        version: 1,
        editingAdId: adId,
        promoteAgain: true,
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
        mediaPreview,
        mediaGallery: gallery.length ? gallery : (mediaPreview ? [mediaPreview] : []),
        mediaType: mediaType || (/\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(mediaPreview) ? "video" : "image"),
        imageName: mediaType === "video" ? "Uploaded video" : "Uploaded media",
    }));

    router.push("/dashboard/ad-campaign/photo-video");
}
