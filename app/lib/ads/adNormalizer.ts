import { NormalizedAd, AdType } from "./adTypes";
import { getAdInteractionId } from "./adIdentity";

const firstPresent = (...values: any[]) => {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const stringValue = String(value).trim();
    if (stringValue) return value;
  }
  return undefined;
};

const safeParse = (data: any) => {
  if (!data) return null;
  if (typeof data !== "string") return data;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
};

const GENERIC_AD_TITLES = new Set(["photo and video", "photo & video", "product promote", "profile promote", "ads", "ad"]);

const numberOrUndefined = (value: any) => {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const normalizeAdTimestamp = (value: any): string | undefined => {
  if (value === null || value === undefined) return undefined;
  const raw = String(value).trim();
  if (!raw) return undefined;

  const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(raw)
    ? `${raw.replace(" ", "T")}Z`
    : raw;

  const date = new Date(normalized);
  const time = date.getTime();
  if (!Number.isFinite(time)) return undefined;
  return date.toISOString();
};

export const resolveAdDisplayTitle = (ad: any, draftInput?: any, campaignInput?: any) => {
  const draft = safeParse(draftInput ?? ad?.editDraft ?? ad?.edit_draft) || {};
  const campaignType = String(campaignInput || ad?.campaign_type || ad?.campaignType || "").trim();
  const safeCampaignFallback = GENERIC_AD_TITLES.has(campaignType.toLowerCase()) ? undefined : campaignType;
  const directTitle = String(ad?.title || "").trim();
  const normalizedDirectTitle = directTitle.toLowerCase();
  const isGenericDirectTitle =
    !directTitle ||
    normalizedDirectTitle === campaignType.toLowerCase() ||
    GENERIC_AD_TITLES.has(normalizedDirectTitle);

  return firstPresent(
    draft.title,
    draft.adTitle,
    draft.name,
    draft.caption,
    ad?.caption,
    isGenericDirectTitle ? undefined : directTitle,
    ad?.name,
    draft.description,
    ad?.description,
    safeCampaignFallback,
    "Sponsored",
  );
};

/**
 * Normalizes any advertisement object into a strict NormalizedAd shape.
 * Supports Product Promote, Photo/Video, and Profile Promote ads.
 */
export function normalizeAdData(ad: any): NormalizedAd {
  if (!ad) {
    throw new Error("Cannot normalize null or undefined ad data");
  }

  // Infer Type
  let type: AdType = "photo";
  const campaignType = String(ad.campaign_type || ad.campaignType || "").toLowerCase();
  const normalizedMediaType = firstPresent(ad.media_type, ad.mediaType);
  const mediaType = String(normalizedMediaType || "").toLowerCase();

  if (campaignType.includes("product") || ad.product_id || ad.productId || ad.is_product_ad) {
    type = "product";
  } else if (campaignType.includes("profile") || ad.profile_id || ad.profileId || ad.is_profile_ad) {
    type = "profile";
  } else if (mediaType.includes("video") || ad.video_url || ad.video) {
    type = "video";
  }

  // IDs
  const interactionId = getAdInteractionId(ad);
  const targetId = String(
    ad.product_id || ad.productId || 
    ad.profile_id || ad.profileId || 
    ad.post_id || ad.postId || 
    ad.linked_product_id || 
    ad.id
  ).replace(/^ad-/, "");

  // Media
  const image = firstPresent(ad.image_url, ad.media_preview, ad.image, ad.thumbnail);
  const video = ad.video_url || ad.video || (type === "video" ? ad.media_preview : undefined);

  // Advertiser/user metadata
  const userId = firstPresent(
    ad.user_id,
    ad.userId,
    ad.owner_user_id,
    ad.ownerUserId,
    ad.user?.id,
    ad.owner?.id,
    ad.advertiser_id
  );
  const username = firstPresent(
    ad.username,
    ad.owner_username,
    ad.ownerUsername,
    ad.advertiser_username,
    ad.advertiserUsername,
    ad.user?.username,
    ad.user?.name,
    ad.owner?.username,
    ad.owner?.name
  );
  const profilePicture = firstPresent(
    ad.profile_picture,
    ad.profilePicture,
    ad.profile_image,
    ad.profileImage,
    ad.owner_profile_picture,
    ad.ownerProfilePicture,
    ad.advertiser_profile_picture,
    ad.advertiserProfilePicture,
    ad.user?.profile_picture,
    ad.user?.profilePicture,
    ad.user?.profile_image,
    ad.user?.profileImage,
    ad.owner?.profile_picture,
    ad.owner?.profilePicture
  );
  const activeStartRaw = firstPresent(ad.active_start_time, ad.activeStartTime, ad.started_at, ad.startedAt);
  const createdAtRaw = firstPresent(ad.created_at, ad.createdAt, ad.created, ad.published_at, ad.updated_at);
  const createdAt = normalizeAdTimestamp(activeStartRaw || createdAtRaw) || activeStartRaw || createdAtRaw;
  const activeLink = firstPresent(ad.active_link, ad.activeLink, ad.cta_link, ad.ctaLink);
  const ctaTopic = firstPresent(ad.cta_topic, ad.ctaTopic);
  const ctaValue = firstPresent(ad.cta_value, ad.ctaValue);
  const draft = safeParse(ad.editDraft || ad.edit_draft) || {};
  const title = resolveAdDisplayTitle(ad, draft, ad.campaign_type || ad.campaignType);
  const description = firstPresent(ad.description, draft.description, ad.caption, draft.caption, title);
  const price = numberOrUndefined(ad.price ?? ad.main_price ?? ad.product_price);
  const promoPrice = numberOrUndefined(ad.promo_price);
  const stock = numberOrUndefined(ad.stock);

  // Counters
  const likeCount = Number(ad.likes_count ?? ad.likeCount ?? ad.likes ?? 0);
  const commentCount = Number(ad.comments_count ?? ad.commentCount ?? ad.comments ?? 0);
  const shareCount = Number(ad.shares_count ?? ad.shareCount ?? ad.shares ?? 0);
  const viewCount = Number(ad.views_count ?? ad.viewCount ?? ad.views ?? ad.impressions ?? 0);
  const reachCount = Number(ad.current_reach ?? ad.reach ?? 0);
  const clickCount = Number(ad.clicks ?? ad.link_actions ?? 0);
  const messageClicks = Number(ad.message_clicks ?? 0);
  const visitClicks = Number(ad.visit_clicks ?? 0);
  const callClicks = Number(ad.call_clicks ?? 0);

  // Status
  const coinCollected = !!(ad.ad_coin_collected || ad.coinCollected || ad.isCollected);
  const liked = !!(ad.user_liked || ad.isLiked || ad.liked || coinCollected);

  return {
    id: interactionId,
    type,
    shareCode: String(ad.shareCode || ad.share_code || ad.product_code || targetId),
    targetId,
    productId: type === "product" ? targetId : undefined,
    profileId: type === "profile" ? targetId : undefined,
    postId: (type === "photo" || type === "video") ? targetId : undefined,
    userId: userId ? String(userId) : "",
    user_id: userId,
    owner_user_id: ad.owner_user_id || ad.ownerUserId || userId,
    ad_owner_user_id: ad.ad_owner_user_id ?? ad.adOwnerUserId ?? ad.advertiser_id ?? null,
    advertiser_id: ad.advertiser_id ?? ad.ad_owner_user_id ?? ad.adOwnerUserId ?? null,
    username,
    owner_username: username,
    profile_picture: profilePicture,
    user: {
      ...(ad.user || {}),
      id: userId || ad.user?.id,
      username: username || ad.user?.username,
      profile_picture: profilePicture || ad.user?.profile_picture,
    },
    createdAt,
    created_at: createdAt,
    active_link: activeLink,
    cta_topic: ctaTopic,
    cta_value: ctaValue,
    media_type: normalizedMediaType,
    title,
    description,
    image,
    video,
    liked,
    user_liked: liked,
    likeCount,
    likes_count: likeCount,
    commentCount,
    comments_count: commentCount,
    shareCount,
    shares_count: shareCount,
    viewCount,
    views_count: viewCount,
    current_reach: reachCount,
    reach: reachCount,
    clicks: clickCount,
    link_actions: clickCount,
    message_clicks: messageClicks,
    visit_clicks: visitClicks,
    call_clicks: callClicks,
    coinCollected,
    ad_coin_collected: coinCollected,
    price,
    main_price: price,
    product_price: price,
    promo_price: promoPrice,
    stock,
    raw: {
      ...ad,
      user_id: userId || ad.user_id,
      owner_user_id: ad.owner_user_id || ad.ownerUserId || userId,
      username: username || ad.username,
      owner_username: username || ad.owner_username,
      profile_picture: profilePicture || ad.profile_picture,
      created_at: createdAt || ad.created_at,
      createdAt: createdAt || ad.createdAt,
      active_link: activeLink || ad.active_link,
      cta_topic: ctaTopic || ad.cta_topic,
      cta_value: ctaValue || ad.cta_value,
      media_type: normalizedMediaType || ad.media_type,
      title,
      description,
      likes_count: likeCount,
      likeCount,
      comments_count: commentCount,
      commentCount,
      shares_count: shareCount,
      shareCount,
      views_count: viewCount,
      viewCount,
      current_reach: reachCount,
      reach: reachCount,
      clicks: clickCount,
      link_actions: clickCount,
      message_clicks: messageClicks,
      visit_clicks: visitClicks,
      call_clicks: callClicks,
      price,
      main_price: price,
      product_price: price,
      promo_price: promoPrice,
      stock,
      user: {
        ...(ad.user || {}),
        id: userId || ad.user?.id,
        username: username || ad.user?.username,
        profile_picture: profilePicture || ad.user?.profile_picture,
      },
    } // Preserve legacy compatibility while carrying normalized ad owner fields
  };
}
