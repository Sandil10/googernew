import { NormalizedAd, AdType } from "./adTypes";
import { getAdInteractionId } from "./adIdentity";

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
  const mediaType = String(ad.media_type || ad.mediaType || "").toLowerCase();

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
  const image = ad.image_url || ad.media_preview || ad.image || ad.thumbnail;
  const video = ad.video_url || ad.video || (type === "video" ? ad.media_preview : undefined);

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
    userId: String(ad.user_id || ad.owner_user_id || ad.user?.id || ""),
    title: ad.title || ad.name || ad.description || "Sponsored",
    image,
    video,
    liked,
    likeCount,
    commentCount,
    shareCount,
    viewCount,
    coinCollected,
    raw: ad // Preserve for legacy compatibility during transition
  };
}
