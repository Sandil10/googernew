export interface NormalizedProductAd {
  id: string | number;
  productId?: string | number;
  name: string;
  price: number;
  images: string[];
  seller: string;
  profileImage?: string;
  isAd: boolean;
  // Additional fields that might be needed
  variants?: any[];
  likes_count?: number;
  views_count?: number;
  comments_count?: number;
  shares_count?: number;
  user_liked?: boolean;
  user_id?: string | number;
  user?: any;
  username?: string;
  profile_picture?: string;
  campaign_type?: string;
  is_sponsored?: boolean;
  stock?: number;
  shipping_info?: any;
  payment_methods?: any;
  commission_info?: any;
  created_at?: string;
  product_code?: string;
  linked_product_code?: string;
  product_id?: string | number;
  linked_product_id?: string | number;
  shareCode?: string;
  share_code?: string;
}

const normalizeUploadPath = (src: any) => {
  const value = String(src || "").trim();
  if (!value) return "";
  return value.includes("uploads") || value.includes("\\")
    ? `/uploads/${value.split(/[\\/]/).pop()}`
    : value;
};

/**
 * Normalizes product/ad data from different sources (shop products, home feed ads)
 * into a consistent format for the shared components.
 */
export function normalizeProductAd(rawItem: any): NormalizedProductAd {
  // Handle shop products
  if (rawItem.title && rawItem.price !== undefined) {
    return {
      id: rawItem.id,
      productId: rawItem.id,
      name: rawItem.title,
      price: Number(rawItem.promo_price || rawItem.price || 0),
      images: [
        rawItem.image_url,
        ...(Array.isArray(rawItem.variants)
          ? rawItem.variants.map((v: any) => v.url || v.image_url).filter(Boolean)
          : typeof rawItem.variants === "string"
          ? JSON.parse(rawItem.variants || "[]").map((v: any) => v.url || v.image_url).filter(Boolean)
          : []
        )
      ].map(normalizeUploadPath).filter(Boolean),
      seller: rawItem.user?.username || rawItem.username || rawItem.owner_username || "Seller",
      profileImage: normalizeUploadPath(rawItem.user?.profile_picture || rawItem.profile_picture),
      isAd: rawItem.is_sponsored || rawItem.campaign_type === "Product Promote",
      variants: Array.isArray(rawItem.variants)
        ? rawItem.variants
        : typeof rawItem.variants === "string"
        ? JSON.parse(rawItem.variants || "[]")
        : [],
      likes_count: rawItem.likes_count || 0,
      views_count: rawItem.views_count || 0,
      comments_count: rawItem.comments_count || 0,
      shares_count: rawItem.shares_count || 0,
      user_liked: rawItem.user_liked,
      user_id: rawItem.user_id ?? rawItem.owner_user_id,
      user: rawItem.user,
      username: rawItem.user?.username || rawItem.username,
      profile_picture: rawItem.user?.profile_picture || rawItem.profile_picture,
      campaign_type: rawItem.campaign_type,
      is_sponsored: rawItem.is_sponsored,
      stock: rawItem.stock,
      shipping_info: rawItem.shipping_info,
      payment_methods: rawItem.payment_methods,
      commission_info: rawItem.commission_info,
      created_at: rawItem.created_at,
      product_code: rawItem.product_code,
      linked_product_code: rawItem.linked_product_code,
      product_id: rawItem.product_id,
      linked_product_id: rawItem.linked_product_id,
      shareCode: rawItem.shareCode,
      share_code: rawItem.share_code,
    };
  }

  // Handle home feed ads (similar structure but might have different field names)
  return {
    id: rawItem.id || rawItem.adId,
    productId: rawItem.productId || rawItem.linked_product_id || rawItem.id,
    name: rawItem.title || rawItem.name,
    price: Number(rawItem.promo_price || rawItem.price || 0),
    images: [
      rawItem.image_url || rawItem.media_preview,
      ...(Array.isArray(rawItem.media_gallery)
        ? rawItem.media_gallery
        : typeof rawItem.media_gallery === "string"
        ? JSON.parse(rawItem.media_gallery || "[]")
        : []
      ).map((img: any) => typeof img === "string" ? img : img.url || img.image_url).filter(Boolean)
    ].map(normalizeUploadPath).filter(Boolean),
    seller: rawItem.user?.username || rawItem.username || rawItem.owner_username || "Advertiser",
    profileImage: normalizeUploadPath(rawItem.user?.profile_picture || rawItem.profile_picture || rawItem.profileImage),
    isAd: true,
    variants: Array.isArray(rawItem.variants)
      ? rawItem.variants
      : typeof rawItem.variants === "string"
      ? JSON.parse(rawItem.variants || "[]")
      : [],
    likes_count: rawItem.likes_count || 0,
    views_count: rawItem.views_count || 0,
    comments_count: rawItem.comments_count || 0,
    shares_count: rawItem.shares_count || 0,
    user_liked: rawItem.user_liked,
    user_id: rawItem.user_id ?? rawItem.owner_user_id,
    user: rawItem.user,
    username: rawItem.user?.username || rawItem.username,
    profile_picture: rawItem.user?.profile_picture || rawItem.profile_picture,
    campaign_type: rawItem.campaign_type,
    is_sponsored: rawItem.is_sponsored,
    stock: rawItem.stock,
    shipping_info: rawItem.shipping_info,
    payment_methods: rawItem.payment_methods,
    commission_info: rawItem.commission_info,
    created_at: rawItem.created_at,
    product_code: rawItem.product_code,
    linked_product_code: rawItem.linked_product_code,
    product_id: rawItem.product_id,
    linked_product_id: rawItem.linked_product_id,
    shareCode: rawItem.shareCode,
    share_code: rawItem.share_code,
  };
}
