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
  const createdAt = firstPresent(ad.created_at, ad.createdAt, ad.created, ad.published_at, ad.updated_at);
  const activeLink = firstPresent(ad.active_link, ad.activeLink, ad.cta_link, ad.ctaLink);
  const ctaTopic = firstPresent(ad.cta_topic, ad.ctaTopic);
  const ctaValue = firstPresent(ad.cta_value, ad.ctaValue);

  // Counters
  const likeCount = Number(ad.likes_count || ad.likeCount || ad.likes || 0);
  const commentCount = Number(ad.comments_count || ad.commentCount || ad.comments || 0);
  const shareCount = Number(ad.shares_count || ad.shareCount || ad.shares || 0);
  const viewCount = Number(ad.views_count || ad.viewCount || ad.views || 0);

  // Status
  const liked = !!(ad.user_liked || ad.isLiked || ad.liked);
  const coinCollected = !!(ad.ad_coin_collected || ad.coinCollected || ad.isCollected);

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
    title: ad.title || ad.name || ad.description || "Sponsored",
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
    coinCollected,
    ad_coin_collected: coinCollected,
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
      user: {
        ...(ad.user || {}),
        id: userId || ad.user?.id,
        username: username || ad.user?.username,
        profile_picture: profilePicture || ad.user?.profile_picture,
      },
    } // Preserve legacy compatibility while carrying normalized ad owner fields
  };
}
