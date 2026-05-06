/**
 * Standardizes ad and product identity matching across the application.
 * Handles numeric IDs, ad-prefixed IDs, and share codes.
 */
export const matchesAdIdentity = (item: any, targetId: string | number): boolean => {
  if (!item) return false;
  
  const targetIdStr = String(targetId);
  const numericId = targetIdStr.replace(/^ad-/, "");
  
  // Check primary ID
  if (String(item.id) === targetIdStr || String(item.id) === numericId) return true;
  
  // Check ad-specific IDs
  if (item.adId && String(item.adId) === numericId) return true;
  if (item.ad_id && String(item.ad_id) === numericId) return true;
  
  // Check linked entity IDs
  const linkedId = item.linked_product_id || item.product_id || item.productId || item.profileId || item.profile_id || item.postId || item.post_id;
  if (linkedId && String(linkedId) === numericId) return true;
  
  // Check share codes
  const shareCode = item.shareCode || item.share_code || item.product_code;
  if (shareCode && String(shareCode) === numericId) return true;
  
  return false;
};

/**
 * Generates a consistent interaction ID (e.g., "ad-123") for an ad item.
 */
export const getAdInteractionId = (item: any): string => {
  if (!item) return "";
  if (typeof item === "string" || typeof item === "number") {
    const idStr = String(item);
    return idStr.startsWith("ad-") ? idStr : `ad-${idStr}`;
  }
  const sponsoredId = item.adId || item.ad_id;
  const isSponsored =
    !!sponsoredId &&
    (!!item.is_sponsored || !!item.isAd || !!item.campaign_type || String(item.id || "").startsWith("ad-"));
  const id = isSponsored ? sponsoredId : (item.id || sponsoredId);
  if (!id) return "";
  const idStr = String(id);
  if (idStr.startsWith("ad-")) return idStr;
  return `ad-${idStr}`;
};
