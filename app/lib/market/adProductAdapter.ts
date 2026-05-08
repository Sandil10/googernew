export interface NormalizedProductAd {
  id: string | number;
  productId?: string | number;
  title?: string;
  name: string;
  price: number;
  promo_price?: number | null;
  image_url?: string;
  media_preview?: string;
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
  adId?: string | number;
  ad_id?: string | number;
  raw?: any;
}

const normalizeUploadPath = (src: any) => {
  const value = String(src || "").trim();
  if (!value) return "";
  if (value.startsWith("/uploads/") || /^https?:\/\//i.test(value) || value.startsWith("data:")) return value;
  return value.includes("uploads") || value.includes("\\")
    ? `/uploads/${value.split(/[\\/]/).pop()}`
    : value;
};

const safeParseArray = (value: any): any[] => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const numberOrZero = (value: any, fallback?: any) => {
  const candidates = [value, fallback];
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined || candidate === "") continue;
    const parsed = Number(candidate);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const numberOrNull = (...values: any[]) => {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

/**
 * Normalizes product/ad data from different sources (shop products, home feed ads)
 * into a consistent format for the shared components.
 */
export function normalizeProductAd(rawItem: any): NormalizedProductAd {
  const source = rawItem?.raw?.raw || rawItem?.raw || rawItem;
  const sourceVariants = safeParseArray(source.variants);
  const sourceImages = safeParseArray(source.images);
  const sourceMediaGallery = safeParseArray(source.media_gallery);
  const primaryImageCandidate =
    source.image_url ||
    source.main_image ||
    source.media_url ||
    source.thumbnail_url ||
    source.media_preview ||
    sourceImages[0] ||
    sourceMediaGallery[0] ||
    sourceVariants[0]?.image_url ||
    sourceVariants[0]?.url ||
    sourceVariants[0]?.image;

  // Handle shop products
  if (source.title && source.price !== undefined) {
    const variants = sourceVariants;
    const imageUrl = normalizeUploadPath(primaryImageCandidate);
    const price = numberOrZero(source.price, source.main_price ?? source.product_price);
    const promoPrice = numberOrNull(source.promo_price);
    return {
      id: source.id,
      productId: source.product_id || source.productId || source.linked_product_id || source.id,
      title: source.title,
      name: source.title,
      price,
      promo_price: promoPrice,
      image_url: imageUrl,
      media_preview: imageUrl,
      images: [
        source.image_url,
        source.main_image,
        source.media_url,
        source.thumbnail_url,
        source.media_preview,
        ...sourceImages.map((img: any) => (typeof img === "string" ? img : img?.url || img?.image_url || img?.image)),
        ...sourceMediaGallery.map((img: any) => (typeof img === "string" ? img : img?.url || img?.image_url || img?.image)),
        ...variants.map((v: any) => v.url || v.image_url).filter(Boolean),
      ].map(normalizeUploadPath).filter(Boolean),
      seller: source.user?.username || source.username || source.owner_username || "Seller",
      profileImage: normalizeUploadPath(source.user?.profile_picture || source.profile_picture),
      isAd: source.is_sponsored || source.campaign_type === "Product Promote",
      variants,
      likes_count: source.likes_count ?? source.likeCount ?? 0,
      views_count: source.views_count ?? source.viewCount ?? 0,
      comments_count: source.comments_count ?? source.commentCount ?? 0,
      shares_count: source.shares_count ?? source.shareCount ?? 0,
      user_liked: source.user_liked,
      user_id: source.user_id ?? source.owner_user_id,
      user: source.user,
      username: source.user?.username || source.username,
      profile_picture: source.user?.profile_picture || source.profile_picture,
      campaign_type: source.campaign_type,
      is_sponsored: source.is_sponsored,
      stock: source.stock,
      shipping_info: source.shipping_info,
      payment_methods: source.payment_methods,
      commission_info: source.commission_info,
      created_at: source.created_at,
      product_code: source.product_code,
      linked_product_code: source.linked_product_code,
      product_id: source.product_id,
      linked_product_id: source.linked_product_id,
      shareCode: source.shareCode,
      share_code: source.share_code,
      adId: source.adId,
      ad_id: source.ad_id,
      raw: {
        ...source,
        price,
        main_price: price,
        product_price: price,
        promo_price: promoPrice,
      },
    };
  }

  // Handle home feed ads (similar structure but might have different field names)
  const mediaGallery = sourceMediaGallery;
  const variants = sourceVariants;
  const price = numberOrZero(source.price, source.main_price ?? source.product_price);
  const promoPrice = numberOrNull(source.promo_price);
  return {
    ...source,
    id: source.id || source.adId,
    productId: source.productId || source.linked_product_id || source.product_id || source.id,
    title: source.title || source.name,
    name: source.title || source.name,
    price,
    promo_price: promoPrice,
    main_price: price,
    product_price: price,
    image_url: normalizeUploadPath(primaryImageCandidate),
    media_preview: normalizeUploadPath(source.media_preview || primaryImageCandidate),
    images: [
      source.image_url,
      source.main_image,
      source.media_url,
      source.thumbnail_url,
      source.media_preview,
      ...sourceImages.map((img: any) => typeof img === "string" ? img : img?.url || img?.image_url || img?.image).filter(Boolean),
      ...mediaGallery.map((img: any) => typeof img === "string" ? img : img?.url || img?.image_url || img?.image).filter(Boolean),
      ...variants.map((v: any) => v.url || v.image_url).filter(Boolean),
    ].map(normalizeUploadPath).filter(Boolean),
    seller: source.user?.username || source.username || source.owner_username || "Advertiser",
    profileImage: normalizeUploadPath(source.user?.profile_picture || source.profile_picture || source.profileImage),
    isAd: true,
    variants,
    likes_count: source.likes_count ?? source.likeCount ?? 0,
    views_count: source.views_count ?? source.viewCount ?? 0,
    comments_count: source.comments_count ?? source.commentCount ?? 0,
    shares_count: source.shares_count ?? source.shareCount ?? 0,
    user_liked: source.user_liked,
    user_id: source.user_id ?? source.owner_user_id,
    user: source.user,
    username: source.user?.username || source.username,
    profile_picture: source.user?.profile_picture || source.profile_picture,
    campaign_type: source.campaign_type,
    is_sponsored: source.is_sponsored,
    stock: source.stock,
    shipping_info: source.shipping_info,
    payment_methods: source.payment_methods,
    commission_info: source.commission_info,
    created_at: source.created_at,
    product_code: source.product_code,
    linked_product_code: source.linked_product_code,
    product_id: source.product_id,
    linked_product_id: source.linked_product_id,
    shareCode: source.shareCode,
    share_code: source.share_code,
    adId: source.adId,
    ad_id: source.ad_id,
    raw: {
      ...source,
      price,
      main_price: price,
      product_price: price,
      promo_price: promoPrice,
    },
  };
}
