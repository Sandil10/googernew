import { marketService } from "@/services/marketService";
import { normalizeProductAd } from "@/app/lib/market/adProductAdapter";

const PRODUCT_ID_KEYS = [
  "original_product_id",
  "linked_product_id",
];

const PRODUCT_CODE_KEYS = [
  "original_product_code",
  "linked_product_share_code",
];

const PRODUCT_SOURCE_KEYS = [
  "product",
  "productData",
  "product_data",
  "linked_product",
  "linkedProduct",
  "original_product",
  "originalProduct",
  "target_product",
  "targetProduct",
  "hydrated_product",
  "hydratedProduct",
  "market_item",
  "marketItem",
];

const normalizeIdentity = (value: any) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return raw.replace(/^ad-/i, "");
};

const isHydratedProductLike = (value: any) => {
  if (!value || typeof value !== "object") return false;

  const hasProductSpecificField =
    Array.isArray(value.variants) ||
    Array.isArray(value.sizes) ||
    value.stock !== undefined ||
    value.shipping_info !== undefined ||
    value.payment_methods !== undefined ||
    value.commission_info !== undefined ||
    value.product_code !== undefined ||
    value.linked_product_code !== undefined ||
    value.product_id !== undefined ||
    value.linked_product_id !== undefined ||
    value.main_image !== undefined ||
    value.media_preview !== undefined ||
    value.media_gallery !== undefined ||
    value.images !== undefined;

  return Boolean(value.title && value.price !== undefined && hasProductSpecificField);
};

const getSource = (ad: any) => ad?.raw?.raw || ad?.raw || ad || {};

const findHydratedProductCandidate = (source: any) => {
  for (const key of PRODUCT_SOURCE_KEYS) {
    const candidate = source?.[key];
    if (isHydratedProductLike(candidate)) return candidate;
  }

  if (isHydratedProductLike(source)) return source;
  return null;
};

const getAdIdentity = (source: any) => {
  return normalizeIdentity(source?.adId || source?.ad_id || source?.id || "");
};

const pickRealProductIdentity = (source: any) => {
  for (const key of PRODUCT_ID_KEYS) {
    const candidate = normalizeIdentity(source?.[key]);
    if (candidate) return { productId: candidate, productCode: "" };
  }

  for (const key of PRODUCT_CODE_KEYS) {
    const candidate = normalizeIdentity(source?.[key]);
    if (candidate) return { productId: "", productCode: candidate };
  }

  return { productId: "", productCode: "" };
};

const mergeProductPromoteOverlay = (source: any, realProduct: any, resolvedId: string) => {
  const adId = String(source?.adId || source?.ad_id || getAdIdentity(source) || "").trim();
  const campaignType = String(source?.campaign_type || source?.campaignType || "Product Promote").trim() || "Product Promote";
  const adShareCode = String(source?.shareCode || source?.share_code || "").trim();
  const productShareCode = String(realProduct?.shareCode || realProduct?.share_code || realProduct?.product_code || "").trim();
  const shareCode = adShareCode || productShareCode;
  const productFirstSource = {
    ...source,
    ...realProduct,
  };

  const resolvedProduct = normalizeProductAd({
    ...productFirstSource,
    id: productFirstSource?.id ?? realProduct?.id ?? resolvedId,
    product_id: productFirstSource?.product_id ?? realProduct?.product_id ?? resolvedId,
    linked_product_id: productFirstSource?.linked_product_id ?? realProduct?.linked_product_id ?? resolvedId,
    linked_product_share_code: productFirstSource?.linked_product_share_code ?? realProduct?.product_code ?? source?.linked_product_share_code,
    linked_product_code: productFirstSource?.linked_product_code ?? realProduct?.product_code ?? source?.linked_product_code,
    shareCode: shareCode || productShareCode || resolvedId,
    share_code: shareCode || productShareCode || resolvedId,
    is_sponsored: true,
    campaign_type: campaignType,
    user_liked: source?.user_liked ?? realProduct?.user_liked,
    likes_count: source?.likes_count ?? source?.likeCount ?? realProduct?.likes_count ?? realProduct?.likeCount,
    views_count: source?.views_count ?? source?.viewCount ?? realProduct?.views_count ?? realProduct?.viewCount,
    comments_count: source?.comments_count ?? source?.commentCount ?? realProduct?.comments_count ?? realProduct?.commentCount,
    shares_count: source?.shares_count ?? source?.shareCount ?? realProduct?.shares_count ?? realProduct?.shareCount,
    ad_coin_collected: source?.ad_coin_collected ?? source?.coinCollected ?? realProduct?.ad_coin_collected,
    ad_like_locked: source?.ad_like_locked ?? realProduct?.ad_like_locked,
    adId: source?.adId || source?.ad_id || adId,
    ad_id: source?.ad_id || source?.adId || adId,
    raw: {
      ...source,
      ...(realProduct?.raw || realProduct || {}),
      id: realProduct?.id ?? resolvedId,
      product_id: realProduct?.id ?? resolvedId,
      linked_product_id: realProduct?.id ?? resolvedId,
      linked_product_share_code: realProduct?.product_code ?? source?.linked_product_share_code,
      linked_product_code: realProduct?.product_code ?? source?.linked_product_code,
      shareCode: shareCode || productShareCode || resolvedId,
      share_code: shareCode || productShareCode || resolvedId,
      is_sponsored: true,
      campaign_type: campaignType,
      adId: source?.adId || source?.ad_id || adId,
      ad_id: source?.ad_id || source?.adId || adId,
      user_liked: source?.user_liked ?? realProduct?.user_liked,
      likes_count: source?.likes_count ?? source?.likeCount ?? realProduct?.likes_count ?? realProduct?.likeCount,
      views_count: source?.views_count ?? source?.viewCount ?? realProduct?.views_count ?? realProduct?.viewCount,
      comments_count: source?.comments_count ?? source?.commentCount ?? realProduct?.comments_count ?? realProduct?.commentCount,
      shares_count: source?.shares_count ?? source?.shareCount ?? realProduct?.shares_count ?? realProduct?.shareCount,
      ad_coin_collected: source?.ad_coin_collected ?? source?.coinCollected ?? realProduct?.ad_coin_collected,
      ad_like_locked: source?.ad_like_locked ?? realProduct?.ad_like_locked,
    },
  });
  const promotedProduct = resolvedProduct as any;

  return {
    ...promotedProduct,
    id: promotedProduct.id ?? resolvedId,
    product_id: promotedProduct.product_id ?? resolvedId,
    productId: promotedProduct.productId ?? resolvedId,
    linked_product_id: promotedProduct.linked_product_id ?? resolvedId,
    linked_product_share_code: promotedProduct.linked_product_share_code ?? source?.linked_product_share_code ?? promotedProduct.product_code,
    linked_product_code: promotedProduct.linked_product_code ?? source?.linked_product_code ?? promotedProduct.product_code,
    adId: source?.adId || source?.ad_id || adId,
    ad_id: source?.ad_id || source?.adId || adId,
    ad_owner_user_id: source?.ad_owner_user_id || source?.advertiser_id || source?.user_id || source?.userId,
    advertiser_id: source?.advertiser_id || source?.ad_owner_user_id || source?.user_id || source?.userId,
    campaign_type: campaignType,
    is_sponsored: true,
    isAd: true,
    isProductPromoteSecondView: true,
    shareCode: shareCode || productShareCode || resolvedId,
    share_code: shareCode || productShareCode || resolvedId,
    user_liked: source?.user_liked ?? promotedProduct.user_liked,
    likes_count: source?.likes_count ?? source?.likeCount ?? promotedProduct.likes_count,
    views_count: source?.views_count ?? source?.viewCount ?? promotedProduct.views_count,
    comments_count: source?.comments_count ?? source?.commentCount ?? promotedProduct.comments_count,
    shares_count: source?.shares_count ?? source?.shareCount ?? promotedProduct.shares_count,
    ad_coin_collected: source?.ad_coin_collected ?? source?.coinCollected ?? promotedProduct.ad_coin_collected,
    ad_like_locked: source?.ad_like_locked ?? promotedProduct.ad_like_locked,
  };
};

export async function resolveProductPromoteProduct(
  ad: any,
) {
  if (!ad || String(ad?.campaign_type || ad?.campaignType || "").trim().toLowerCase() !== "product promote") {
    return ad ?? null;
  }

  const source = getSource(ad);
  const hydratedProduct = findHydratedProductCandidate(source);
  const realProductIdentity = pickRealProductIdentity(source);

  if (hydratedProduct) {
    const hydratedProductId = normalizeIdentity(hydratedProduct?.id || hydratedProduct?.product_id || hydratedProduct?.productId || "");
    return mergeProductPromoteOverlay(source, hydratedProduct, hydratedProductId || realProductIdentity.productId || realProductIdentity.productCode);
  }

  if (!realProductIdentity.productId && !realProductIdentity.productCode) return null;

  try {
    const realProduct = realProductIdentity.productId
      ? await marketService.getItemById(realProductIdentity.productId)
      : await marketService.getItemByCode(realProductIdentity.productCode);
    if (!realProduct) return null;
    return mergeProductPromoteOverlay(source, realProduct, realProductIdentity.productId || realProductIdentity.productCode);
  } catch {
    return null;
  }
}
