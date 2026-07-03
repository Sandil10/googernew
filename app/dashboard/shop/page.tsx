"use client";

import Image from "next/image";
import { useState, useEffect, useRef, useMemo, memo, Fragment } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import IonIcon from "@/app/components/IonIcon";
// import AddProductModal from "@/app/components/AddProductModal"; // Global now
import { marketService } from "@/services/marketService";
import { authService } from "@/services/authService";
import { chatService } from "@/services/chatService";
import { orderService } from "@/services/orderService";
import { useCart } from "@/app/context/CartContext";
import { openLoginRequired } from "@/app/lib/loginRequired";
import ShareModal from "@/app/components/ShareModal";
import InteractionBottomSheet from "@/app/components/InteractionBottomSheet";
import SubscribeButton from "@/app/components/SubscribeButton";
import { SharedAdSecondViewModal } from "@/app/components/ads/SharedAdSecondViewModal";
import { PromotedAdCard } from "@/app/components/ads/PromotedAdCard";
import { ProfilePromoteCarousel } from "@/app/components/ads/ProfilePromoteCarousel";
import { ShopProductSecondViewModal } from "@/app/components/market/ShopProductSecondViewModal";
import { SharedProductCard } from "@/app/components/market/SharedProductCard";
import { normalizeAdData, resolveAdDisplayTitle } from "@/app/lib/ads/adNormalizer";
import { adsService } from "@/services/adsService";
import { categoryService } from "@/services/categoryService";
import { AdExpiryWarning } from "@/app/components/ads/AdExpiryWarning";
import { getAdInteractionId, matchesAdIdentity } from "@/app/lib/ads/adIdentity";
import { canShowCollectCoinButton as canShowAdCollectCoinButton, useAdActions } from "@/app/lib/ads/useAdActions";
import { resolveProductPromoteProduct } from "@/app/lib/ads/resolveProductPromoteProduct";
import { filterAdsForViewer } from "@/app/lib/ads/adVisibility";
import { promotePhotoVideoAdAgain, promoteProductAdAgain } from "@/app/lib/ads/promoteAgain";
import { useAdStore } from "@/app/lib/ads/adStore";
import { RelativeTime } from "@/app/components/RelativeTime";
import { getProfileShareUrl, getShareUrlForItem } from "@/app/lib/shareLinks";
import { getItemProfilePicture, getItemUsername } from "@/app/lib/userDisplay";
import { addTopbarNotification } from "@/app/lib/topbarNotifications";
import {
  getHiddenFeedItemIds,
  hideFeedItemFor24Hours,
  subscribeToHiddenFeedItems,
} from "@/app/lib/feedHidePreferences";
import {
  AD_CARD_IMAGE_SIZES,
  AVATAR_IMAGE_SIZES,
  FEED_IMAGE_BLUR_DATA_URL,
  PRODUCT_CARD_IMAGE_SIZES,
  normalizeMediaSrc,
  shouldBypassNextImageOptimization,
} from "@/app/lib/mediaOptimization";

const SIZES = ["S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL", "mm", "cm"];
const UOMS = [
  "Piece", "Pair", "Set", "Kg", "Gram", "Litre", "ML", "Pack", "Box", "Dozon",
  "Metre", "Yard", "Foot", "Inch", "mm", "cm", "Sq Ft", "Roll", "Bundle", "Bag", "Bottle", "Can",
  "Carton", "Pallet", "Unit", "Service", "Hour", "Day", "Month"
];
const MARKET_PAGE_SIZE = 20;
const SHOP_SORT_OPTIONS = [
  { id: "top-sales", label: "Top sales" },
  { id: "price-low-high", label: "Price low to high" },
  { id: "price-high-low", label: "Price high to low" },
] as const;

const getSessionClientSeed = (storageKey: string) => {
  if (typeof window === "undefined") return storageKey;
  try {
    const existing = window.sessionStorage.getItem(storageKey);
    if (existing) return existing;
    const next = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    window.sessionStorage.setItem(storageKey, next);
    return next;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
};
type ShopSortOption = typeof SHOP_SORT_OPTIONS[number]["id"];
const MARKET_ALGORITHM_OPTIONS = [
  { id: "trending", label: "Trending Now" },
  { id: "recommended", label: "Recommended For You" },
  { id: "best-sellers", label: "Best Sellers" },
  { id: "new-arrivals", label: "New Arrivals" },
  { id: "most-viewed", label: "Most Viewed" },
  { id: "popular-week", label: "Popular This Week" },
] as const;
type MarketAlgorithmOption = typeof MARKET_ALGORITHM_OPTIONS[number]["id"];

// --- Sub-components to avoid hook violations ---

const safeParse = (data: any) => {
  if (!data) return null;
  if (typeof data !== 'string') return data;
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
};

const parseShippingData = (product: any) => {
  const infoRaw = product?.shipping_info || product?.shipping_data || product?.shipping_rates;
  const info = safeParse(infoRaw);

  let standardized: { country: string, price: number, days: string }[] = [];
  const actualRates = info?.rates || (Array.isArray(info) ? info : null);

  if (info?.unified) {
    const charge = parseFloat(info.charge || 0);
    const days = info.days || info.date || "3-5 Business Days";
    const countryList = actualRates && actualRates.length > 0 ? actualRates : [{ country: 'Worldwide' }];
    standardized = countryList.map((c: any) => ({
      country: c.country || 'Worldwide',
      price: charge,
      days: days
    }));
  } else if (actualRates && Array.isArray(actualRates) && actualRates.length > 0) {
    standardized = actualRates.map((c: any) => ({
      country: c.country || "Unknown",
      price: parseFloat(c.charge || c.price || 0),
      days: c.days || c.date || info.days || "3-5 Business Days"
    }));
  } else {
    const countries = info?.available_countries || info?.countries || info?.region || "Worldwide";
    const charge = parseFloat(info?.shipping_cost || info?.price || info?.charge || 0);
    const days = info?.days || info?.date || "3-5 Business Days";
    if (typeof countries === 'string') {
      standardized = countries.split(',').map((c: string) => ({
        country: c.trim(),
        price: charge,
        days: days
      }));
    } else if (Array.isArray(countries)) {
      standardized = countries.map((c: any) => {
        if (typeof c === 'string') return { country: c, price: charge, days: days };
        return {
          country: c.country || c.name || "Unknown",
          price: parseFloat(c.price || c.cost || c.charge || charge),
          days: c.days || c.date || days
        };
      });
    }
  }

  if (standardized.length === 0) {
    standardized = [{ country: "Worldwide", price: 0, days: "3-5 Business Days" }];
  }
  return standardized;
};

const normalizeExternalUrl = (value: string) => {
  if (!value?.trim()) return "";
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
};

const getNormalizedUrl = (value: string) => {
  const normalized = normalizeExternalUrl(value);
  if (!normalized) return null;

  try {
    return new URL(normalized);
  } catch {
    return null;
  }
};

const parseDbTimestampAsUtc = (value: any) => {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);

  const raw = String(value).trim();
  if (!raw) return new Date();

  const hasTimezone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  return new Date(hasTimezone ? normalized : `${normalized}Z`);
};

const formatOrderGroupDateTime = (value: any) => {
  const date = parseDbTimestampAsUtc(value);
  return `${date.toLocaleDateString("en-GB", {
    timeZone: "Asia/Colombo",
    day: "2-digit",
    month: "short",
    year: "numeric",
  })} ${date.toLocaleTimeString("en-US", {
    timeZone: "Asia/Colombo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })}`;
};

const getDeliveredDateTimeText = (order: any) => {
  const deliveredAt = order?.delivered_at || order?.deliveredAt;
  if (!deliveredAt) return "";
  return `Delivered: ${formatOrderGroupDateTime(deliveredAt)}`;
};

const getShopSearchText = (rawValue: string) => {
  const trimmed = String(rawValue || "").trim();
  if (!trimmed) return "";

  const fromPath = (value: string) =>
    value
      .split(/[\\/]/)
      .pop()
      ?.split(/[?#]/)[0]
      ?.replace(/\.(jpe?g|png|gif|webp|avif|bmp|svg)$/i, "")
      ?.replace(/[-_+.%]+/g, " ")
      ?.replace(/\s+/g, " ")
      .trim() || "";

  try {
    const parsed = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    const googleImage = parsed.searchParams.get("imgurl");
    if (googleImage) return getShopSearchText(decodeURIComponent(googleImage));

    const queryText = parsed.searchParams.get("q") || parsed.searchParams.get("query") || parsed.searchParams.get("search");
    if (queryText) return queryText.trim();

    const pathText = fromPath(parsed.pathname);
    if (pathText && !/^(image|img|photo|product|share|shop)$/i.test(pathText)) return pathText;
  } catch {
    // Plain search text falls through.
  }

  return trimmed
    .replace(/\.(jpe?g|png|gif|webp|avif|bmp|svg)$/i, "")
    .replace(/[-_+.%]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const getPastedShopSearchValue = (event: any) => {
  const html = event.clipboardData?.getData?.("text/html") || "";
  if (html) {
    const altMatch = html.match(/\s(?:alt|title)=["']([^"']+)["']/i);
    if (altMatch?.[1]) return altMatch[1].trim();
    const srcMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (srcMatch?.[1]) return srcMatch[1].trim();
  }

  const text = event.clipboardData?.getData?.("text/plain") || "";
  if (text.trim()) return text.trim();

  const imageFile = Array.from(event.clipboardData?.files || []).find((file: any) => String(file?.type || "").startsWith("image/")) as File | undefined;
  if (imageFile?.name && !/^image\.(png|jpe?g|webp|gif|bmp)$/i.test(imageFile.name)) return imageFile.name;

  const imageItem = Array.from(event.clipboardData?.items || []).find((item: any) => String(item?.type || "").startsWith("image/")) as DataTransferItem | undefined;
  const itemFile = imageItem?.getAsFile?.();
  if (itemFile?.name && !/^image\.(png|jpe?g|webp|gif|bmp)$/i.test(itemFile.name)) return itemFile.name;

  return "";
};

const toFiniteNumber = (value: any, fallback = 0) => {
  const parsed = parseFloat(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getProductPromoPrice = (product: any) => {
  const promo = toFiniteNumber(product?.promo_price ?? product?.promoPrice, NaN);
  if (Number.isFinite(promo)) return promo;
  return toFiniteNumber(product?.price ?? product?.main_price ?? product?.product_price, 0);
};

const getProductSalesScore = (product: any) =>
  toFiniteNumber(product?.purchases_count, 0) * 1000 +
  toFiniteNumber(product?.add_to_cart_count, 0) * 50 +
  toFiniteNumber(product?.likes_count, 0) * 5 +
  toFiniteNumber(product?.views_count, 0);

const getProductRankingKey = (product: any) =>
  String(product?.product_id || product?.linked_product_id || product?.id || product?.product_code || "");

const getProductAgeHours = (product: any) => {
  const createdTime = new Date(product?.created_at || product?.createdAt || 0).getTime();
  return Number.isFinite(createdTime) && createdTime > 0 ? Math.max((Date.now() - createdTime) / 36e5, 0) : 9999;
};

const getProductFreshnessScore = (product: any) => {
  const hoursOld = getProductAgeHours(product);
  if (hoursOld <= 24) return 100;
  if (hoursOld <= 72) return 70;
  if (hoursOld <= 168) return 45;
  if (hoursOld <= 720) return 20;
  return 5;
};

const getProductStockScore = (product: any) => {
  const stock = toFiniteNumber(product?.stock ?? product?.total_stock ?? product?.available_stock, 0);
  if (stock <= 0) return 0;
  if (stock >= 20) return 100;
  return 45 + stock * 2.75;
};

const getProductPriceCompetitivenessScore = (product: any) => {
  const price = getProductPromoPrice(product);
  const original = toFiniteNumber(product?.price ?? product?.main_price ?? product?.product_price, price);
  if (!price) return 0;
  if (original > price) return Math.min(100, 55 + ((original - price) / original) * 150);
  return 45;
};

const getProductSellerPerformanceScore = (product: any) => {
  let score = 50;
  if (product?.seller_verified || product?.verified_seller) score += 20;
  score += Math.min(20, toFiniteNumber(product?.seller_rating ?? product?.rating, 0) * 4);
  if (product?.seller_fast_response) score += 10;
  score -= Math.min(35, toFiniteNumber(product?.seller_cancel_rate, 0));
  if (product?.seller_reported) score -= 45;
  return Math.max(0, Math.min(100, score));
};

const getTextMatchScore = (product: any, query: string) => {
  const keywords = query.toLowerCase().split(/[^a-z0-9]+/i).filter((word) => word.length >= 2);
  if (!keywords.length) return 0;
  const haystack = [
    product?.title,
    product?.description,
    product?.category,
    product?.sub_category,
    product?.manual_category,
    product?.username,
    product?.owner_username,
  ].map((value) => String(value || "").toLowerCase()).join(" ");
  return Math.min(100, keywords.filter((word) => haystack.includes(word)).length * 35);
};

const getProductCtrScore = (product: any) => {
  const views = toFiniteNumber(product?.views_count, 0);
  const clicks = toFiniteNumber(product?.clicks_count ?? product?.click_count ?? product?.likes_count, 0);
  return views > 0 ? Math.min(100, (clicks / views) * 300) : clicks > 0 ? 40 : 0;
};

const getProductConversionScore = (product: any) => {
  const views = toFiniteNumber(product?.views_count, 0);
  const purchases = toFiniteNumber(product?.purchases_count, 0);
  const carts = toFiniteNumber(product?.add_to_cart_count, 0);
  if (views <= 0) return Math.min(100, purchases * 25 + carts * 8);
  return Math.min(100, ((purchases * 4 + carts) / views) * 100);
};

const getProductEngagementScore = (product: any) =>
  toFiniteNumber(product?.views_count, 0) +
  toFiniteNumber(product?.likes_count, 0) * 3 +
  toFiniteNumber(product?.comments_count, 0) * 4 +
  toFiniteNumber(product?.shares_count, 0) * 5 +
  toFiniteNumber(product?.add_to_cart_count, 0) * 8 +
  toFiniteNumber(product?.purchases_count, 0) * 15 +
  Math.min(180, toFiniteNumber(product?._local_time_spent ?? product?.time_spent_seconds, 0)) * 0.2;

const getProductLTRScore = (product: any, searchQuery = "") =>
  getTextMatchScore(product, searchQuery) * 0.22 +
  getProductCtrScore(product) * 0.15 +
  getProductConversionScore(product) * 0.18 +
  Math.min(100, getProductSalesScore(product) / 10) * 0.14 +
  getProductPriceCompetitivenessScore(product) * 0.10 +
  getProductStockScore(product) * 0.10 +
  getProductSellerPerformanceScore(product) * 0.08 +
  Math.min(100, toFiniteNumber(product?._local_time_spent ?? product?.time_spent_seconds, 0)) * 0.03;

const getProductTrendingScore = (product: any) => {
  const hoursOld = Math.max(getProductAgeHours(product), 6);
  const velocity = getProductEngagementScore(product) / Math.sqrt(hoursOld);
  return velocity + getProductFreshnessScore(product) * 0.35 + toFiniteNumber(product?.search_count ?? product?.search_frequency, 0) * 6;
};

const getProductPopularWeekScore = (product: any) => {
  const freshnessBoost = getProductAgeHours(product) <= 168 ? 1.4 : 0.65;
  return getProductEngagementScore(product) * freshnessBoost + getProductSalesScore(product) * 0.12;
};

const rankMarketProducts = (products: any[], algorithm: MarketAlgorithmOption, searchQuery = "") => {
  const scoreProduct = (product: any) => {
    if (algorithm === "trending") return getProductTrendingScore(product);
    if (algorithm === "best-sellers") return getProductSalesScore(product);
    if (algorithm === "new-arrivals") return getProductFreshnessScore(product) * 100 - getProductAgeHours(product);
    if (algorithm === "most-viewed") return toFiniteNumber(product?.views_count, 0);
    if (algorithm === "popular-week") return getProductPopularWeekScore(product);
    return getProductLTRScore(product, searchQuery) + getProductTrendingScore(product) * 0.18;
  };

  return [...products].sort((first, second) => {
    const scoreDiff = scoreProduct(second) - scoreProduct(first);
    if (scoreDiff !== 0) return scoreDiff;
    return new Date(second?.created_at || 0).getTime() - new Date(first?.created_at || 0).getTime();
  });
};

const getProductCountryValues = (product: any) => {
  const shippingCountries = parseShippingData(product)
    .map((entry) => String(entry?.country || "").trim().toLowerCase())
    .filter(Boolean);
  return new Set([
    ...shippingCountries,
    String(product?.seller_country || "").trim().toLowerCase(),
    String(product?.seller_shipping_country || "").trim().toLowerCase(),
  ].filter(Boolean));
};

const formatPercentValue = (value: number) => {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
};

const getOrderCommissionInfo = (item: any) => {
  const parsed = safeParse(item?.commission_info);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
};

const getGoogerFeePercentage = (item: any) => {
  const info = getOrderCommissionInfo(item);
  return toFiniteNumber(info?.googer_commission ?? info?.googerCommission ?? info?.percentage, 0);
};

const getResaleCommissionPercentage = (item: any) => {
  const info = getOrderCommissionInfo(item);
  return toFiniteNumber(
    info?.resell_percentage ?? info?.resell_commission ?? info?.reseller_commission ?? info?.resell_amount,
    0
  );
};

const getProductDiscountPercentage = (item: any) => {
  const info = getOrderCommissionInfo(item);
  return toFiniteNumber(info?.discount ?? info?.product_discount ?? info?.productDiscount, 0);
};

const getOrderMetadata = (item: any) => {
  const parsed = safeParse(item?.shipping_address);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
};

const isResellOrderItem = (item: any) => {
  const metadata = getOrderMetadata(item);
  const resellData = metadata?.resell || metadata?.resale || metadata?.reseller;
  return Boolean(
    item?.reseller_id ||
    item?.reseller_user_id ||
    item?.resell_user_id ||
    item?.resale_user_id ||
    item?.resold_by ||
    item?.resell_id ||
    item?.resell_code ||
    item?.resell_ref ||
    item?.reseller_googer_id ||
    metadata?.reseller_id ||
    metadata?.reseller_user_id ||
    metadata?.resell_user_id ||
    metadata?.resale_user_id ||
    metadata?.resold_by ||
    metadata?.resell_id ||
    metadata?.resell_code ||
    metadata?.resell_ref ||
    metadata?.reseller_googer_id ||
    (resellData && Object.keys(resellData).length > 0)
  );
};

const summarizeSellerOrderFees = (items: any[]) => {
  const productSubtotal = items.reduce((sum, item) => sum + toFiniteNumber(item?.total_price ?? item?.price, 0), 0);
  const deliveryTotal = items.reduce((sum, item) => sum + toFiniteNumber(item?.shipping_fee, 0), 0);
  const googerPercentages = items.map(getGoogerFeePercentage);
  const discountPercentages = items.map(getProductDiscountPercentage);
  const resellItems = items.filter(isResellOrderItem);
  const resalePercentages = resellItems.map(getResaleCommissionPercentage);
  const googerFee = items.reduce((sum, item) => {
    const productAmount = toFiniteNumber(item?.total_price ?? item?.price, 0);
    return sum + (productAmount * getGoogerFeePercentage(item)) / 100;
  }, 0);
  const productDiscount = items.reduce((sum, item) => {
    const productAmount = toFiniteNumber(item?.total_price ?? item?.price, 0);
    return sum + (productAmount * getProductDiscountPercentage(item)) / 100;
  }, 0);
  const resaleCommission = resellItems.reduce((sum, item) => {
    const productAmount = toFiniteNumber(item?.total_price ?? item?.price, 0);
    return sum + (productAmount * getResaleCommissionPercentage(item)) / 100;
  }, 0);
  const percentLabel = (values: number[]) => {
    if (values.length === 0) return "0%";
    const unique = Array.from(new Set(values.map((value) => formatPercentValue(value))));
    return unique.length === 1 ? `${unique[0]}%` : "Mixed";
  };

  return {
    googerPercentLabel: percentLabel(googerPercentages),
    discountPercentLabel: percentLabel(discountPercentages),
    resalePercentLabel: percentLabel(resalePercentages),
    googerFee,
    productDiscount,
    hasProductDiscount: productDiscount > 0,
    resaleCommission,
    hasResaleCommission: resellItems.length > 0 && resaleCommission > 0,
    actualBalance: productSubtotal + deliveryTotal - googerFee - productDiscount - resaleCommission,
  };
};

const getGoogleImageSourceUrl = (value: string) => {
  const url = getNormalizedUrl(value);
  if (!url) return "";

  const host = url.hostname.replace(/^www\./i, "").toLowerCase();
  if (!host.includes("google.") || url.pathname !== "/imgres") return "";

  const imageUrl = url.searchParams.get("imgurl");
  return imageUrl ? decodeURIComponent(imageUrl) : "";
};

const getYouTubeThumbnailUrl = (value: string) => {
  try {
    const url = new URL(normalizeExternalUrl(value));
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();

    let videoId = "";
    if (host === "youtu.be") {
      videoId = url.pathname.split("/").filter(Boolean)[0] || "";
    } else if (host.includes("youtube.com")) {
      if (url.pathname.startsWith("/shorts/") || url.pathname.startsWith("/embed/")) {
        videoId = url.pathname.split("/").filter(Boolean)[1] || "";
      } else {
        videoId = url.searchParams.get("v") || "";
      }
    }

    return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : "";
  } catch {
    return "";
  }
};

const getSponsoredLinkPreviewImage = (value: string) => {
  const normalized = normalizeExternalUrl(value);
  if (!normalized) return "";

  const imagePattern = /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i;
  const googleImageSource = getGoogleImageSourceUrl(normalized);
  if (googleImageSource) return googleImageSource;
  if (imagePattern.test(normalized)) return normalized;

  const youtubeThumbnail = getYouTubeThumbnailUrl(normalized);
  if (youtubeThumbnail) return youtubeThumbnail;

  return `https://api.microlink.io?url=${encodeURIComponent(normalized)}&screenshot=true&meta=false&embed=screenshot.url`;
};

const getYouTubeEmbedUrl = (value: string) => {
  try {
    const url = new URL(normalizeExternalUrl(value));
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();

    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }

    if (host.includes("youtube.com")) {
      const id = url.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}`;
      const parts = url.pathname.split("/").filter(Boolean);
      const embedIndex = parts.findIndex((part) => part === "embed");
      if (embedIndex >= 0 && parts[embedIndex + 1]) {
        return `https://www.youtube.com/embed/${parts[embedIndex + 1]}`;
      }
    }
  } catch {
    return null;
  }

  return null;
};

const getSponsoredSocialEmbedUrl = (value: string) => {
  const normalized = normalizeExternalUrl(value);
  if (!normalized) return null;

  const youtube = getYouTubeEmbedUrl(normalized);
  if (youtube) return youtube;

  try {
    const url = new URL(normalized);
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    const parts = url.pathname.split("/").filter(Boolean);

    if (host.includes("instagram.com")) {
      const type = parts[0];
      const shortcode = parts[1];
      if (["p", "reel", "tv"].includes(type) && shortcode) {
        return `https://www.instagram.com/${type}/${shortcode}/embed`;
      }
    }

    if (host.includes("tiktok.com")) {
      const videoIndex = parts.findIndex((part) => part === "video");
      const videoId = videoIndex >= 0 ? parts[videoIndex + 1] : null;
      return videoId ? `https://www.tiktok.com/embed/v2/${videoId}` : null;
    }

    if (host.includes("facebook.com") || host.includes("fb.watch")) {
      const isVideoUrl = /\/videos\/|\/watch\/|\?v=|fb\.watch/i.test(normalized);
      const plugin = isVideoUrl ? "video.php" : "post.php";
      return `https://www.facebook.com/plugins/${plugin}?href=${encodeURIComponent(normalized)}&show_text=false&width=560`;
    }
  } catch {
    return null;
  }

  return null;
};

const getSponsoredLinkPreviewType = (value: string) => {
  const normalized = normalizeExternalUrl(value);
  if (!normalized) return null;

  const imagePattern = /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i;
  const videoPattern = /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i;

  if (getGoogleImageSourceUrl(normalized)) return "image";
  if (imagePattern.test(normalized)) return "image";
  if (videoPattern.test(normalized)) return "video";
  if (getSponsoredSocialEmbedUrl(normalized)) return "embed";
  return "website";
};

const getSponsoredSecondViewKind = (ad: any, previewType: string | null): "image" | "video" | "embed" => {
  const campaignType = String(ad?.campaign_type || ad?.campaignType || "").trim().toLowerCase();
  const isPhotoVideoPromoteCampaign = campaignType.includes("photo") && campaignType.includes("video");
  const mediaPreview = String(ad?.media_preview || ad?.video_url || "").trim();
  const hasUploadedVideo =
    /video/i.test(String(ad?.media_type || "")) ||
    /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(mediaPreview);

  if (!isPhotoVideoPromoteCampaign) return "image";
  if (previewType === "embed") return "embed";
  if (previewType === "video" || hasUploadedVideo) return "video";
  return "image";
};

const getDeliveryDateText = (daysValue: string) => {
  if (!daysValue) return "3-5 Business Days";
  const range = daysValue.split("-").map((d: any) => parseInt(d.trim())).filter((d: any) => !isNaN(d));
  if (range.length > 0) {
    const maxDays = range[range.length - 1];
    const today = new Date();
    const end = new Date(today);
    end.setDate(today.getDate() + maxDays);
    const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    return `${today.toLocaleDateString('en-US', options)} - ${end.toLocaleDateString('en-US', options)} Delivery`;
  }
  return daysValue;
};

const parseShippingAddressPayload = (raw: any) => {
  if (!raw || raw === "null") return null;
  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return typeof raw === "string" ? { fullAddress: raw, addressMode: "single" } : null;
  }
};

const getShippingFullName = (addr: any, fallbackOrder?: any) => {
  return [
    addr?.firstName,
    addr?.lastName,
  ].filter(Boolean).join(" ")
    || fallbackOrder?.buyer_name
    || fallbackOrder?.buyer_username
    || "N/A";
};

const getShippingPhonesLine = (addr: any) => {
  return [addr?.phone, addr?.phone2].filter(Boolean).join(" / ") || null;
};

const getShippingFullAddress = (addr: any) => {
  if (!addr) return "No address provided";

  if (addr.addressMode === "single") {
    return addr.fullAddress || "No address provided";
  }

  return [
    addr.houseNo,
    addr.buildingNo,
    addr.street,
    addr.city,
    addr.district,
    addr.province,
    addr.country,
  ].filter(Boolean).join(", ") || "No address provided";
};

const getShippingAddressSummary = (raw: any, fallbackFee?: any) => {
  const addr = parseShippingAddressPayload(raw);
  if (!addr) return "Standard Delivery Address";

  const feeVal = parseFloat(fallbackFee ?? addr.delivery_charge ?? 0);
  const deliveryDisplay = Number.isFinite(feeVal) ? ` (Delivery: R${feeVal.toFixed(2)})` : "";

  if (addr.addressMode === "single") {
    return `${addr.fullAddress || "Standard Delivery Address"}${deliveryDisplay}`;
  }

  const base = [addr.houseNo, addr.street, addr.city, addr.country]
    .filter(Boolean)
    .join(", ");

  return `${base || "Standard Delivery Address"}${deliveryDisplay}`;
};

const getShippingBlueBoxLines = (raw: any, fallbackOrder?: any) => {
  const addr = parseShippingAddressPayload(raw);
  if (!addr) return [];

  const fullName = getShippingFullName(addr, fallbackOrder);
  const phones = getShippingPhonesLine(addr);
  const address = getShippingFullAddress(addr);

  return [
    fullName !== "N/A" ? fullName : null,
    phones,
    address,
  ].filter(Boolean);
};

const ORDER_STAGE_FILTERS = {
  all: "pending,processing,shipped,delivered,received,reshipped,cancelled,returned,rejected",
  processing: "processing",
  shipped: "shipped",
  delivered: "delivered,received,reshipped,rejected",
  returns: "returned",
};

const OrderBadge = ({ count, active }: { count?: number; active?: boolean }) => {
  if (!count) return null;

  return (
    <span
      className={`min-w-[18px] h-[18px] px-1.5 rounded-full flex items-center justify-center text-[9px] font-black tracking-tight ${active
        ? "bg-black text-white"
        : "bg-rose-500 text-white shadow-[0_0_12px_rgba(244,63,94,0.35)]"
        }`}
    >
      {count}
    </span>
  );
};

function ShippingInfoModal({
  shippingInfo,
  onClose,
}: {
  shippingInfo: { address: any; orderNumber?: string | number | null } | null;
  onClose: () => void;
}) {
  if (!shippingInfo?.address) return null;

  const address = shippingInfo.address;
  const isSingle = address.addressMode === "single";

  const detailRows = isSingle
    ? []
    : [
      { label: "Phone Number", value: address.phone },
      { label: "Country", value: address.country },
      { label: "Province", value: address.province },
      { label: "District", value: address.district },
      { label: "City", value: address.city },
      { label: "Street Name", value: address.street },
      { label: "Building Number", value: address.houseNo },
      { label: "Required Note", value: address.requiredNote || address.deliveryNote || address.note },
      { label: "Optional Note", value: address.optionalNote || address.noteOptional },
    ].filter((entry) => entry.value);

  return (
    <div className="fixed inset-0 z-[1900] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl animate-in fade-in duration-300">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-[2rem] border border-blue-500/20 bg-[#0b1220] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="px-6 py-5 border-b border-white/10 bg-blue-500/5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-black text-blue-300 uppercase tracking-[0.2em]">
                Shipping Information
              </div>
              {shippingInfo.orderNumber && (
                <div className="mt-2 text-[9px] font-bold text-white/35 uppercase tracking-widest">
                  Order #{shippingInfo.orderNumber}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full border border-white/10 bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center"
            >
              <IonIcon name="close-outline" className="text-lg" />
            </button>
          </div>
        </div>

        <div className="p-6">
          {isSingle ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <div className="text-[8px] font-black text-white/25 uppercase tracking-[0.2em] mb-3">
                Full Address
              </div>
              <div className="text-sm leading-relaxed text-white/80 whitespace-pre-wrap">
                {address.fullAddress || "No address available"}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {detailRows.map((row) => (
                <div key={row.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-[8px] font-black text-white/25 uppercase tracking-[0.2em] mb-2">
                    {row.label}
                  </div>
                  <div className="text-[11px] font-bold text-white/80 leading-relaxed whitespace-pre-wrap">
                    {row.value}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const ShippingSection = ({ product, selectedCountry, onCountryChange }: { product: any, selectedCountry: string | null, onCountryChange: (c: string) => void }) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [restrictionError, setRestrictionError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { savedAddress } = useCart();
  const [countries, setCountries] = useState<{ name: string, code: string }[]>([]);
  const [countrySearch, setCountrySearch] = useState("");

  useEffect(() => {
    fetch("https://flagcdn.com/en/codes.json")
      .then(res => res.json())
      .then(data => {
        const list = Object.entries(data)
          .filter(([code]) => code.length === 2)
          .map(([code, name]) => ({ code, name: name as string }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setCountries(list);
      })
      .catch(e => console.error("Error fetching countries:", e));
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  try {
    const standardized = parseShippingData(product);
    const defaultCountry = standardized[0]?.country || "Worldwide";
    const currentCountry = selectedCountry || savedAddress?.country || defaultCountry;

    // Find if the currently selected country has a proper shipping rate
    const currentCountryRate = standardized.find((c: any) => c.country.toLowerCase() === currentCountry.toLowerCase())
      || standardized.find((c: any) => c.country.toLowerCase().includes('world'));

    const priceText = !currentCountryRate ? "N/A" : (parseFloat((currentCountryRate.price || 0).toString()) === 0 ? "FREE" : `R ${parseFloat((currentCountryRate.price || 0).toString()).toFixed(2)}`);

    return (
      <div className="flex flex-col gap-1">
        <div className="relative" ref={dropdownRef}>
          <div
            onClick={() => {
              setIsDropdownOpen(!isDropdownOpen);
              setRestrictionError(null);
            }}
            className="flex items-center justify-between w-full bg-black/[0.03] hover:bg-black/[0.06] transition-all rounded-lg px-2 py-1.5 cursor-pointer group"
          >
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-black uppercase tracking-tighter leading-none group-hover:translate-x-0.5 transition-transform">{currentCountry}</span>
            </div>
            <IonIcon
              name={isDropdownOpen ? "chevron-up" : "chevron-down"}
              className={`text-[10px] text-black/40 transition-transform duration-300 ${isDropdownOpen ? 'rotate-180' : ''}`}
            />
          </div>

          {isDropdownOpen && (
            <div className="absolute top-full left-0 w-full mt-2 bg-white border border-black/10 rounded-2xl shadow-2xl z-[150] p-2 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="max-h-48 overflow-y-auto custom-scrollbar-thin px-1 py-1">
                {countries.filter(c => {
                  const hasMatch = standardized.some((s: any) =>
                    s.country.toLowerCase() === 'worldwide' ||
                    s.country.toLowerCase() === c.name.toLowerCase() ||
                    s.country.toLowerCase() === c.code.toLowerCase()
                  );
                  return hasMatch;
                }).map((c: any, idx: number) => {
                  const countryPricing = standardized.find((s: any) => s.country.toLowerCase() === c.name.toLowerCase()) || standardized.find((s: any) => s.country.toLowerCase().includes('world'));
                  const isAvailable = !!countryPricing;

                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        onCountryChange(c.name);
                        setIsDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-tighter transition-all mb-1 flex items-center justify-between ${c.name === currentCountry ? 'bg-black text-white' : 'text-black/60 hover:bg-black/5'
                        }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <img src={`https://flagcdn.com/w20/${c.code}.png`} width="16" alt={c.name} className="shrink-0 rounded-sm opacity-80" />
                        <span className="truncate">{c.name}</span>
                      </div>
                      {isAvailable ? (
                        <span className={c.name === currentCountry ? 'text-white/40 shrink-0' : 'text-black/20 text-[8px] shrink-0'}>
                          {parseFloat(countryPricing.price.toString()) === 0 ? "FREE" : `R ${parseFloat(countryPricing.price.toString()).toFixed(2)}`}
                        </span>
                      ) : (
                        <span className="text-red-500/60 text-[8px] shrink-0">N/A</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <div className="mt-0.5 ml-1 flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-black tracking-tighter ${priceText === 'FREE' ? 'text-emerald-500' : (priceText === 'N/A' ? 'text-red-500' : 'text-black')}`}>
              {priceText === 'FREE' ? 'FREE DELIVERY' : priceText}
            </span>
            {priceText !== 'FREE' && priceText !== 'N/A' && (
              <div className="w-1 h-1 rounded-full bg-black/10" />
            )}
            {priceText !== 'FREE' && priceText !== 'N/A' && (
              <span className="text-[8px] font-bold text-black uppercase">Shipping Fee</span>
            )}
            {priceText === 'N/A' && (
              <span className="text-[8px] font-bold text-red-500/60 uppercase">Not Available here</span>
            )}
          </div>
        </div>
      </div>
    );
  } catch (e) {
    console.error("ShippingSection error:", e);
    return <span className="text-[10px] font-black text-black uppercase tracking-tighter">Worldwide</span>;
  }
};

const COLORS = [
  { name: "None", hex: "transparent" },
  { name: "Alice Blue", hex: "#F0F8FF" },
  { name: "Antique White", hex: "#FAEBD7" },
  { name: "Aqua", hex: "#00FFFF" },
  { name: "Aquamarine", hex: "#7FFFD4" },
  { name: "Azure", hex: "#F0FFFF" },
  { name: "Beige", hex: "#F5F5DC" },
  { name: "Bisque", hex: "#FFE4C4" },
  { name: "Black", hex: "#000000" },
  { name: "Blanched Almond", hex: "#FFEBCD" },
  { name: "Blue", hex: "#0000FF" },
  { name: "Blue Violet", hex: "#8A2BE2" },
  { name: "Brown", hex: "#A52A2A" },
  { name: "Burly Wood", hex: "#DEB887" },
  { name: "Cadet Blue", hex: "#5F9EA0" },
  { name: "Chartreuse", hex: "#7FFF00" },
  { name: "Chocolate", hex: "#D2691E" },
  { name: "Coral", hex: "#FF7F50" },
  { name: "Cornflower Blue", hex: "#6495ED" },
  { name: "Cornsilk", hex: "#FFF8DC" },
  { name: "Crimson", hex: "#DC143C" },
  { name: "Cyan", hex: "#00FFFF" },
  { name: "Dark Blue", hex: "#00008B" },
  { name: "Dark Cyan", hex: "#008B8B" },
  { name: "Dark Goldenrod", hex: "#B8860B" },
  { name: "Dark Gray", hex: "#A9A9A9" },
  { name: "Dark Green", hex: "#006400" },
  { name: "Dark Khaki", hex: "#BDB76B" },
  { name: "Dark Magenta", hex: "#8B008B" },
  { name: "Dark Olive Green", hex: "#556B2F" },
  { name: "Dark Orange", hex: "#FF8C00" },
  { name: "Dark Orchid", hex: "#9932CC" },
  { name: "Dark Red", hex: "#8B0000" },
  { name: "Dark Salmon", hex: "#E9967A" },
  { name: "Dark Sea Green", hex: "#8FBC8F" },
  { name: "Dark Slate Blue", hex: "#483D8B" },
  { name: "Dark Slate Gray", hex: "#2F4F4F" },
  { name: "Dark Turquoise", hex: "#00CED1" },
  { name: "Dark Violet", hex: "#9400D3" },
  { name: "Deep Pink", hex: "#FF1493" },
  { name: "Deep Sky Blue", hex: "#00BFFF" },
  { name: "Dim Gray", hex: "#696969" },
  { name: "Dodger Blue", hex: "#1E90FF" },
  { name: "Fire Brick", hex: "#B22222" },
  { name: "Floral White", hex: "#FFFAF0" },
  { name: "Forest Green", hex: "#228B22" },
  { name: "Fuchsia", hex: "#FF00FF" },
  { name: "Gainsboro", hex: "#DCDCDC" },
  { name: "Ghost White", hex: "#F8F8FF" },
  { name: "Gold", hex: "#FFD700" },
  { name: "Goldenrod", hex: "#DAA520" },
  { name: "Gray", hex: "#808080" },
  { name: "Green", hex: "#008000" },
  { name: "Green Yellow", hex: "#ADFF2F" },
  { name: "Honey Dew", hex: "#F0FFF0" },
  { name: "Hot Pink", hex: "#FF69B4" },
  { name: "Indian Red", hex: "#CD5C5C" },
  { name: "Indigo", hex: "#4B0082" },
  { name: "Ivory", hex: "#FFFFF0" },
  { name: "Khaki", hex: "#F0E68C" },
  { name: "Lavender", hex: "#E6E6FA" },
  { name: "Lavender Blush", hex: "#FFF0F5" },
  { name: "Lawn Green", hex: "#7CFC00" },
  { name: "Lemon Chiffon", hex: "#FFFACD" },
  { name: "Light Blue", hex: "#ADD8E6" },
  { name: "Light Coral", hex: "#F08080" },
  { name: "Light Cyan", hex: "#E0FFFF" },
  { name: "Light Goldenrod Yellow", hex: "#FAFAD2" },
  { name: "Light Gray", hex: "#D3D3D3" },
  { name: "Light Green", hex: "#90EE90" },
  { name: "Light Pink", hex: "#FFB6C1" },
  { name: "Light Salmon", hex: "#FFA07A" },
  { name: "Light Sea Green", hex: "#20B2AA" },
  { name: "Light Sky Blue", hex: "#87CEFA" },
  { name: "Light Slate Gray", hex: "#778899" },
  { name: "Light Steel Blue", hex: "#B0C4DE" },
  { name: "Light Yellow", hex: "#FFFFE0" },
  { name: "Lime", hex: "#00FF00" },
  { name: "Lime Green", hex: "#32CD32" },
  { name: "Linen", hex: "#FAF0E6" },
  { name: "Magenta", hex: "#FF00FF" },
  { name: "Maroon", hex: "#800000" },
  { name: "Medium Aquamarine", hex: "#66CDAA" },
  { name: "Medium Blue", hex: "#0000CD" },
  { name: "Medium Orchid", hex: "#BA55D3" },
  { name: "Medium Purple", hex: "#9370DB" },
  { name: "Medium Sea Green", hex: "#3CB371" },
  { name: "Medium Slate Blue", hex: "#7B68EE" },
  { name: "Medium Spring Green", hex: "#00FA9A" },
  { name: "Medium Turquoise", hex: "#48D1CC" },
  { name: "Medium Violet Red", hex: "#C71585" },
  { name: "Midnight Blue", hex: "#191970" },
  { name: "Mint Cream", hex: "#F5FFFA" },
  { name: "Misty Rose", hex: "#FFE4E1" },
  { name: "Moccasin", hex: "#FFE4B5" },
  { name: "Navajo White", hex: "#FFDEAD" },
  { name: "Navy", hex: "#000080" },
  { name: "Old Lace", hex: "#FDF5E6" },
  { name: "Olive", hex: "#808000" },
  { name: "Olive Drab", hex: "#6B8E23" },
  { name: "Orange", hex: "#FFA500" },
  { name: "Orange Red", hex: "#FF4500" },
  { name: "Orchid", hex: "#DA70D6" },
  { name: "Pale Goldenrod", hex: "#EEE8AA" },
  { name: "Pale Green", hex: "#98FB98" },
  { name: "Pale Turquoise", hex: "#AFEEEE" },
  { name: "Pale Violet Red", hex: "#DB7093" },
  { name: "Papaya Whip", hex: "#FFEFD5" },
  { name: "Peach Puff", hex: "#FFDAB9" },
  { name: "Peru", hex: "#CD853F" },
  { name: "Pink", hex: "#FFC0CB" },
  { name: "Plum", hex: "#DDA0DD" },
  { name: "Powder Blue", hex: "#B0E0E6" },
  { name: "Purple", hex: "#800080" },
  { name: "Rebecca Purple", hex: "#663399" },
  { name: "Red", hex: "#FF0000" },
  { name: "Rosy Brown", hex: "#BC8F8F" },
  { name: "Royal Blue", hex: "#4169E1" },
  { name: "Saddle Brown", hex: "#8B4513" },
  { name: "Salmon", hex: "#FA8072" },
  { name: "Sandy Brown", hex: "#F4A460" },
  { name: "Sea Green", hex: "#2E8B57" },
  { name: "Sea Shell", hex: "#FFF5EE" },
  { name: "Sienna", hex: "#A0522D" },
  { name: "Silver", hex: "#C0C0C0" },
  { name: "Sky Blue", hex: "#87CEEB" },
  { name: "Slate Blue", hex: "#6A5ACD" },
  { name: "Slate Gray", hex: "#708090" },
  { name: "Snow", hex: "#FFFAFA" },
  { name: "Spring Green", hex: "#00FF7F" },
  { name: "Steel Blue", hex: "#4682B4" },
  { name: "Tan", hex: "#D2B48C" },
  { name: "Teal", hex: "#008080" },
  { name: "Thistle", hex: "#D8BFD8" },
  { name: "Tomato", hex: "#FF6347" },
  { name: "Turquoise", hex: "#40E0D0" },
  { name: "Violet", hex: "#EE82EE" },
  { name: "Wheat", hex: "#F5DEB3" },
  { name: "White", hex: "#FFFFFF" },
  { name: "White Smoke", hex: "#F5F5F5" },
  { name: "Yellow", hex: "#FFFF00" },
  { name: "Yellow Green", hex: "#9ACD32" },
  { name: "Midnight Black", hex: "#0B0B0B" },
  { name: "Space Gray", hex: "#343D46" },
  { name: "Rose Gold", hex: "#B76E79" },
  { name: "Champagne", hex: "#F7E7CE" },
  { name: "Emerald", hex: "#50C878" },
  { name: "Ruby", hex: "#E0115F" },
  { name: "Sapphire Blue", hex: "#0F52BA" },
  { name: "Amethyst", hex: "#9966CC" },
  { name: "Amber Gold", hex: "#FFBF00" },
  { name: "Coral Pink", hex: "#F88379" },
  { name: "Mint Green", hex: "#98FF98" },
  { name: "Lavender Purple", hex: "#967BB6" },
  { name: "Charcoal Gray", hex: "#36454F" },
  { name: "Ocean Blue", hex: "#0077BE" },
  { name: "Desert Sand", hex: "#EDC9AF" },
  { name: "Burgundy Red", hex: "#800020" },
  { name: "Olive Green", hex: "#808000" },
  { name: "Mustard Yellow", hex: "#FFDB58" },
  { name: "Peach Orange", hex: "#FFCC99" },
  { name: "Tiffany Blue", hex: "#0ABAB5" },
  { name: "Periwinkle Blue", hex: "#CCCCFF" },
  { name: "Cotton Candy", hex: "#FFBCD9" },
  { name: "Slate Gray", hex: "#708090" },
  { name: "Stormy Sky", hex: "#778899" },
  { name: "Forest Green", hex: "#228B22" },
  { name: "Electric Purple", hex: "#BF00FF" },
  { name: "Neon Green", hex: "#39FF14" },
  { name: "Ice White", hex: "#F0F8FF" },
  { name: "Off White", hex: "#FAF9F6" },
  { name: "Creamy Beige", hex: "#F5F5DC" },
  { name: "Mocha", hex: "#A38068" },
  { name: "Caramel Brown", hex: "#AF6F09" },
  { name: "Honey Gold", hex: "#EBA937" },
  { name: "Copper Metallic", hex: "#B87333" },
  { name: "Bronze Dust", hex: "#CD7F32" },
  { name: "Titanium Silver", hex: "#878681" },
  { name: "Jet Black Matte", hex: "#0A0A0A" },
  { name: "Cool Cyan", hex: "#00FFFF" },
  { name: "Deep Indigo", hex: "#310062" },
  { name: "Lavender Blush", hex: "#FFF0F5" },
  { name: "Cherry Red", hex: "#D2042D" },
  { name: "Wine Red", hex: "#722F37" },
  { name: "Berry Purple", hex: "#990F4B" },
  { name: "Plum Deep", hex: "#673147" },
  { name: "Midnight Navy", hex: "#191970" },
  { name: "Teal Deep", hex: "#004B49" },
  { name: "Pine Green", hex: "#01796F" },
  { name: "Apple Green", hex: "#8DB600" },
  { name: "Lemon Fizz", hex: "#FFF700" },
  { name: "Sunset Gold", hex: "#FFD700" },
  { name: "Pumpkin Orange", hex: "#FF7518" },
  { name: "Rust Brown", hex: "#B7410E" },
  { name: "Cinnamon", hex: "#D2691E" },
  { name: "Terracotta", hex: "#E2725B" },
  { name: "Sandstone", hex: "#766352" },
  { name: "Taupe Gray", hex: "#8B8589" },
  { name: "Pebble Gray", hex: "#D1D1D1" },
  { name: "Cloud White", hex: "#F8F8FF" },
  { name: "Pearl White", hex: "#F0EAD6" },
  { name: "Eggshell White", hex: "#FBF5E6" },
  { name: "Lilac Mist", hex: "#C8A2C8" },
  { name: "Thistle Bloom", hex: "#D8BFD8" },
  { name: "Sky Blue Light", hex: "#E0FFFF" },
  { name: "Baby Pink", hex: "#F4C2C2" },
];

// Moved outside ShopPage to prevent remounting issues
const InteractionButton = memo(({
  icon,
  activeIcon,
  count,
  color,
  activeColor,
  isActive,
  onSingleClick,
  onLongReach,
  type,
  orientation = "horizontal",
  iconSize = "text-[13px] md:text-xl",
  activeButtonClassName = "",
  inactiveButtonClassName = "",
}: any) => {
  const timerRef = useRef<any>(null);
  const longPressedRef = useRef(false);

  const handleStart = (e: React.PointerEvent) => {
    e.stopPropagation();
    longPressedRef.current = false;
    timerRef.current = setTimeout(() => {
      longPressedRef.current = true;
      onLongReach();
    }, 600);
  };

  const handleEnd = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (!longPressedRef.current) {
      onSingleClick();
    }
    longPressedRef.current = false;
  };

  const handleCancel = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    longPressedRef.current = false;
  };

  const isLikeButton = type === "likes";
  const currentIcon = isLikeButton
    ? (isActive ? activeIcon || "heart" : "heart-outline")
    : (isActive && activeIcon ? activeIcon : icon);
  const hasCount = typeof count === "number" ? count > 0 : !!count;
  const inactiveColorClass = color || "text-white/40 hover:text-white";
  const resolvedActiveColorClass =
    isLikeButton
      ? "text-red-500"
      : activeColor || color || "text-white";
  const currentColorClass = isLikeButton
    ? (isActive ? "text-red-500" : "text-white")
    : (isActive ? resolvedActiveColorClass : inactiveColorClass);
  const iconColorStyle =
    isLikeButton
      ? { color: isActive ? "#ef4444" : "#ffffff" }
      : undefined;
  const iconRenderKey = isLikeButton ? `likes-${isActive ? "liked" : "unliked"}` : currentIcon;

  if (orientation === "vertical") {
    const buttonStateClass = isActive ? activeButtonClassName : inactiveButtonClassName;
    return (
      <button
        type="button"
        onPointerDown={handleStart}
        onPointerUp={handleEnd}
        onPointerLeave={handleCancel}
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
        className={`flex flex-col items-center gap-1 group transition-all duration-300 active:scale-75 select-none touch-none rounded-full p-2 ${buttonStateClass}`}
        aria-pressed={isLikeButton ? !!isActive : undefined}
      >
        <div className="transition-all duration-300 group-hover:scale-110">
          <IonIcon
            key={iconRenderKey}
            name={currentIcon}
            className={`${iconSize} ${currentColorClass} drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]`}
            style={iconColorStyle}
          />
        </div>
        {hasCount && (
          <span className="text-[7px] md:text-[10px] font-black text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] uppercase tracking-tighter">
            {count}
          </span>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      data-interaction-type={type}
      onPointerDown={handleStart}
      onPointerUp={handleEnd}
      onPointerLeave={handleCancel}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      className={`${currentColorClass} transition-all duration-300 active:scale-75 flex items-center gap-1 focus:outline-none focus:ring-0 select-none cursor-pointer touch-none`}
      aria-pressed={isLikeButton ? !!isActive : undefined}
    >
      <IonIcon key={iconRenderKey} name={currentIcon} className={`${iconSize} ${currentColorClass} shrink-0`} style={iconColorStyle} />
      {hasCount && <span className="text-[7px] md:text-[9px] font-black tracking-tighter shrink-0">{count}</span>}
    </button>
  );
});

InteractionButton.displayName = "InteractionButton";

interface MarketItemWrapperProps {
  product: any;
  children: React.ReactNode;
  isCompact?: boolean;
  onView?: (id: number | string, item?: any) => void;
  onImpression?: (id: number | string, item?: any) => void;
  activeTab?: string;
}

const MarketItemWrapper = memo(
  ({ product, children, onView, onImpression, activeTab }: MarketItemWrapperProps) => {
    const ref = useRef<HTMLDivElement>(null);
    const visibleRef = useRef(false);
    const lastFiredAtRef = useRef(0);
    useEffect(() => {
      if (activeTab !== "market" || !product?.id) return;
      const isSponsored = !!product?.is_sponsored;
      if (isSponsored && !onImpression && !onView) return;
      if (!isSponsored && !onView) return;
      visibleRef.current = false;
      lastFiredAtRef.current = 0;
      const el = ref.current;
      if (!el) return;
      const observer = new IntersectionObserver(
        ([entry]) => {
          const isVisible = entry.isIntersecting && entry.intersectionRatio >= 0.5;
          if (!isVisible) {
            visibleRef.current = false;
            return;
          }

          const now = Date.now();
          if (!visibleRef.current && now - lastFiredAtRef.current >= 1500) {
            visibleRef.current = true;
            lastFiredAtRef.current = now;
            if (isSponsored) {
              onImpression?.(product.id, product);
              onView?.(product.id, product);
            } else {
              onView?.(product.id, product);
            }
          }
        },
        { threshold: 0.5 }
      );
      observer.observe(el);
      return () => observer.disconnect();
    }, [product?.id, product?.is_sponsored, onView, onImpression, activeTab]);
    return <div ref={ref}>{children}</div>;
  },
);

MarketItemWrapper.displayName = "MarketItemWrapper";

// Renders description text with clickable URLs, navigable @mentions, and styled #hashtags
function renderDescription(text: string, router?: any): React.ReactNode[] {
  if (!text) return [];
  // Split on URLs, @mentions, and #hashtags
  const parts = text.split(/(https?:\/\/[^\s]+|@[\w]+|#[\w]+)/g);
  return parts.map((part, i) => {
    if (/^https?:\/\//.test(part)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-blue-400 underline underline-offset-2 break-all hover:text-blue-300 transition-colors cursor-pointer"
        >
          {part}
        </a>
      );
    }
    if (part.startsWith('@')) {
      const username = part.slice(1);
      return (
        <span
          key={i}
          onClick={(e) => {
            e.stopPropagation();
            if (router) router.push(`/dashboard/profile?user=${username}`);
          }}
          className="text-emerald-400 font-bold cursor-pointer hover:underline"
        >
          {part}
        </span>
      );
    }
    if (part.startsWith('#')) {
      return <span key={i} className="text-blue-400 font-bold">{part}</span>;
    }
    return <span key={i}>{part}</span>;
  });
}

function getProfileImageSrc(profilePicture?: string | null, name?: string) {
  if (profilePicture) {
    if (profilePicture.startsWith("/uploads/") || profilePicture.startsWith("http") || profilePicture.startsWith("data:")) {
      return profilePicture;
    }
    return `/uploads/${profilePicture.split(/[\\/]/).pop()}`;
  }
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || "User")}&background=111827&color=ffffff`;
}

function getSeededRandom(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1000000) / 1000000;
}

function shuffleItemsWithSeed<T>(items: T[], seed: string, getKey: (item: T) => string) {
  return [...items].sort((first, second) => {
    const firstScore = getSeededRandom(`${seed}:${getKey(first)}`);
    const secondScore = getSeededRandom(`${seed}:${getKey(second)}`);
    return firstScore - secondScore;
  });
}

function getRecentAdIds(storageKey: string) {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function rememberShownAdIds(storageKey: string, adIds: Array<string | number>) {
  if (typeof window === "undefined" || adIds.length === 0) return;
  const recent = getRecentAdIds(storageKey);
  const next = [...adIds.map(String), ...recent.filter((id) => !adIds.map(String).includes(id))].slice(0, 80);
  window.localStorage.setItem(storageKey, JSON.stringify(next));
}

function getShopAdRotationKey(ad: any) {
  return getAdInteractionId(ad) || String(ad?.id || ad?.adId || ad?.ad_id || "");
}

function getShopAdInsertionType(ad: any) {
  const campaignType = getCampaignType(ad).toLowerCase();
  const mediaType = String(ad?.media_type || ad?.mediaType || "").trim().toLowerCase();
  const activeLink = String(ad?.active_link || ad?.activeLink || ad?.cta_value || ad?.ctaValue || "").trim().toLowerCase();
  const title = String(ad?.title || "").trim().toLowerCase();

  if (campaignType === "product promote") return "product-promote";
  if (campaignType === "profile promote") return "profile-promote";

  if (campaignType.includes("photo") && campaignType.includes("video")) return "photo-video";
  if (campaignType.includes("image") && campaignType.includes("link")) return "image-link";
  if (campaignType.includes("video") && campaignType.includes("link")) return "video-link";
  if (campaignType.includes("photo")) return "photo";
  if (campaignType.includes("video")) return "video";
  if (campaignType.includes("image")) return "image";
  if (campaignType.includes("link")) {
    if (/\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(activeLink) || mediaType.includes("video")) return "video-link";
    if (mediaType.includes("image") || /\.(png|jpe?g|gif|webp|avif)(\?.*)?$/i.test(activeLink)) return "image-link";
    return "image-link";
  }

  if (mediaType.includes("video") || /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(activeLink) || /\bvideo\b/.test(title)) return "video";
  if (mediaType.includes("image") || /\.(png|jpe?g|gif|webp|avif)(\?.*)?$/i.test(activeLink)) return "photo";

  return "standard";
}

function getShuffledShopAdCycle(
  ads: any[],
  storageKey: string,
  shuffleSeed: string,
) {
  const recentAdIds = new Set(getRecentAdIds(storageKey));
  const uniqueAds = Array.from(
    ads.reduce<Map<string, any>>((map, ad) => {
      const key = getShopAdRotationKey(ad);
      if (key && !map.has(key)) map.set(key, ad);
      return map;
    }, new Map<string, any>()).values(),
  );

  const groupedAds = uniqueAds.reduce<Map<string, any[]>>((map, ad) => {
    const key = getShopAdInsertionType(ad);
    const bucket = map.get(key) || [];
    bucket.push(ad);
    map.set(key, bucket);
    return map;
  }, new Map<string, any[]>());

  const orderedGroupKeys = shuffleItemsWithSeed(
    Array.from(groupedAds.keys()),
    `${shuffleSeed}:group-order`,
    (key) => key,
  );

  const roundRobinGroups: Array<{ type: string; items: any[] }> = orderedGroupKeys
    .map((groupKey) => {
      const items = groupedAds.get(groupKey) || [];
      const freshAds = shuffleItemsWithSeed(
        items.filter((ad) => !recentAdIds.has(getShopAdRotationKey(ad))),
        `${shuffleSeed}:${groupKey}:fresh`,
        getShopAdRotationKey,
      );
      const repeatedAds = shuffleItemsWithSeed(
        items.filter((ad) => recentAdIds.has(getShopAdRotationKey(ad))),
        `${shuffleSeed}:${groupKey}:repeat`,
        getShopAdRotationKey,
      );
      return {
        type: groupKey,
        items: [...freshAds, ...repeatedAds],
      };
    })
    .filter((group) => group.items.length > 0);

  const shuffledAds: any[] = [];
  let hasRemaining = true;
  while (hasRemaining) {
    hasRemaining = false;
    for (const group of roundRobinGroups) {
      const nextAd = group.items.shift();
      if (nextAd) {
        shuffledAds.push(nextAd);
        hasRemaining = true;
      }
    }
  }

  if (shuffledAds.length <= 1) return shuffledAds;

  const firstType = getShopAdInsertionType(shuffledAds[0]);
  const lastType = getShopAdInsertionType(shuffledAds[shuffledAds.length - 1]);
  if (firstType !== lastType) return shuffledAds;

  for (let offset = 1; offset < shuffledAds.length; offset += 1) {
    const rotated = [...shuffledAds.slice(offset), ...shuffledAds.slice(0, offset)];
    if (getShopAdInsertionType(rotated[0]) !== getShopAdInsertionType(rotated[rotated.length - 1])) {
      return rotated;
    }
  }

  return shuffledAds;
}

function interleaveShopProductsWithAds(
  products: any[],
  ads: any[],
  storageKey: string,
  shuffleSeed: string,
  productRatio = 6,
  displayRotation = 0,
) {
  if (!ads.length) return products;

  const uniqueAds = Array.from(
    ads
      .filter((ad) => ad?.is_sponsored)
      .reduce((map, ad) => {
        const key = getShopAdRotationKey(ad);
        if (key && !map.has(key)) map.set(key, ad);
        return map;
      }, new Map<string, any>())
      .values(),
  );
  if (!uniqueAds.length) return products;

  const shuffledAds = getShuffledShopAdCycle(uniqueAds, storageKey, shuffleSeed);
  const rotationOffset = shuffledAds.length > 0 ? Math.abs(displayRotation) % shuffledAds.length : 0;
  const rotatedAds = rotationOffset > 0
    ? [...shuffledAds.slice(rotationOffset), ...shuffledAds.slice(0, rotationOffset)]
    : shuffledAds;

  if (!products.length) {
    const firstAd = rotatedAds[0];
    return firstAd ? [firstAd] : products;
  }

  if (products.length < productRatio) {
    const firstAd = rotatedAds[0];
    return firstAd ? [...products, firstAd] : products;
  }

  const shownAdIds: Array<string | number> = [];
  const output: any[] = [];
  let adIndex = 0;

  products.forEach((product, index) => {
    output.push(product);
    if ((index + 1) % productRatio === 0) {
      const ad = rotatedAds[adIndex % rotatedAds.length];
      if (ad) {
        output.push(ad);
        shownAdIds.push(getShopAdRotationKey(ad));
        adIndex += 1;
      }
    }
  });

  rememberShownAdIds(storageKey, shownAdIds);
  return output;
}

function insertProfilePromoteCarouselRows(items: any[], profilePromoteAds: any[]) {
  if (!profilePromoteAds.length) return items;
  if (!items.length) {
    return [{
      type: "profilePromoteCarousel",
      id: "shop-profile-promote-carousel-1",
      ads: profilePromoteAds,
    }];
  }

  // Grid is 4 columns on desktop (1 line = 4 items).
  // Pattern: line 1 is the topic row, line 2 is 4 normal cards, line 3 is profile promote ads only.
  // After that, show another profile promote row after six more normal rows (lines 4-9).
  const intervals = [4, 24];
  let intervalIndex = 0;
  const output: any[] = [];
  let slotsSinceCarousel = 0;
  let carouselCount = 0;

  items.forEach((item) => {
    output.push(item);
    if (item?.type === "profilePromoteCarousel") return;

    slotsSinceCarousel += 1;

    if (slotsSinceCarousel === intervals[intervalIndex]) {
      carouselCount += 1;
      output.push({
        type: "profilePromoteCarousel",
        id: `shop-profile-promote-carousel-${carouselCount}`,
        ads: profilePromoteAds,
      });
      slotsSinceCarousel = 0;
      if (intervalIndex < intervals.length - 1) intervalIndex += 1;
    }
  });

  return output;
}

const mapPublicActiveAdToShopAd = (ad: any) => {
  const draft = safeParse(ad?.editDraft || ad?.edit_draft) || {};
  const adId = ad?.adId || ad?.ad_id || String(ad?.id || "").replace(/^ad-/, "");
  const campaignType = ad?.campaign_type || ad?.campaignType || "Ads";
  const isProductPromote = String(campaignType).trim().toLowerCase() === "product promote";
  const mediaPreview = ad?.media_preview || ad?.mediaPreview || ad?.media_url || ad?.video_url || ad?.video || "";
  const price = isProductPromote
    ? Number(ad?.price ?? ad?.main_price ?? ad?.product_price ?? 0)
    : Number(ad?.budget || 0);
  const productCode = isProductPromote
    ? (ad?.linked_product_share_code || ad?.linked_product_code || ad?.product_code || "")
    : adId;
  const shareCode = isProductPromote
    ? (ad?.linked_product_share_code || ad?.share_code || ad?.shareCode || "")
    : `ad-${adId}`;
  const likesCount = Number(ad?.likes_count ?? ad?.likeCount ?? ad?.likes ?? 0);
  const commentsCount = Number(ad?.comments_count ?? ad?.commentCount ?? ad?.comments ?? 0);
  const sharesCount = Number(ad?.shares_count ?? ad?.shareCount ?? ad?.shares ?? 0);
  const viewsCount = Number(ad?.views_count ?? ad?.viewCount ?? ad?.views ?? 0);
  const activeStartTime = ad?.active_start_time || ad?.activeStartTime || ad?.started_at || ad?.startedAt || null;

  return {
    ...ad,
    id: String(ad?.id || "").startsWith("ad-") ? ad.id : `ad-${adId || ad?.id}`,
    adId,
    ad_owner_user_id: ad?.ad_owner_user_id ?? ad?.advertiser_id ?? ad?.user_id ?? ad?.userId,
    advertiser_id: ad?.advertiser_id ?? ad?.ad_owner_user_id ?? ad?.user_id ?? ad?.userId,
    user_id: ad?.user_id ?? ad?.userId,
    owner_user_id: ad?.owner_user_id ?? ad?.ownerUserId,
    username: ad?.owner_username || ad?.ownerUsername || ad?.user?.username || "Ads",
    owner_username: ad?.owner_username || ad?.ownerUsername || ad?.user?.username || "Ads",
    user: ad?.user,
    title: resolveAdDisplayTitle(ad, draft, campaignType),
    description: draft.description || ad?.description || "",
    category: campaignType,
    price,
    image_url: mediaPreview,
    media_preview: mediaPreview,
    media_url: ad?.media_url || ad?.video_url || mediaPreview,
    video_url: ad?.video_url || ad?.media_url || mediaPreview,
    media_gallery: ad?.media_gallery || ad?.mediaGallery || [],
    media_type: ad?.media_type || ad?.mediaType || "",
    status: "approved",
    likes_count: likesCount,
    likeCount: likesCount,
    comments_count: commentsCount,
    commentCount: commentsCount,
    shares_count: sharesCount,
    shareCount: sharesCount,
    views_count: viewsCount,
    viewCount: viewsCount,
    created_at: activeStartTime || ad?.created_at || ad?.createdAt,
    createdAt: activeStartTime || ad?.createdAt || ad?.created_at,
    active_start_time: activeStartTime,
    activeStartTime,
    started_at: ad?.started_at || ad?.startedAt || activeStartTime,
    startedAt: ad?.startedAt || ad?.started_at || activeStartTime,
    profile_picture: ad?.profile_picture || ad?.user?.profile_picture || null,
    product_code: productCode,
    share_code: shareCode,
    campaign_type: campaignType,
    editDraft: draft,
    edit_draft: draft,
    active_link: draft.activeLink || draft.active_link || ad?.active_link || ad?.activeLink || "",
    cta_topic: draft.ctaTopic || draft.cta_topic || ad?.cta_topic || ad?.ctaTopic || "Visit",
    cta_value: draft.ctaValue || draft.cta_value || ad?.cta_value || ad?.ctaValue || "",
    linked_product_id: ad?.linked_product_id ?? null,
    linked_product_share_code: ad?.linked_product_share_code || ad?.linked_product_code || null,
    linked_product_code: ad?.linked_product_share_code || ad?.linked_product_code || null,
    product_id: ad?.product_id ?? null,
    productId: ad?.productId ?? null,
    is_sponsored: true,
    user_liked: !!ad?.user_liked,
    ad_coin_collected: !!ad?.ad_coin_collected,
    ad_like_locked: !!ad?.ad_like_locked,
  };
};

const getCampaignType = (item: any) => String(item?.campaign_type || item?.campaignType || "").trim();
const isProductPromoteItem = (item: any) => getCampaignType(item).toLowerCase() === "product promote";
const isProfilePromoteItem = (item: any) => getCampaignType(item).toLowerCase() === "profile promote" || item?.media_type === "profile";

export default function ShopPage() {
  const MARKET_FEED_HISTORY_KEY = "googer-market-feed-history-v2";
  const MARKET_FEED_LAST_ORDER_KEY = "googer-market-feed-last-order-v1";
  const SHOP_VIEW_STATE_KEY = "googer-shop-view-state-v1";
  const SHOP_PRODUCT_TIME_SPENT_KEY = "googer-shop-product-time-spent-v1";
  const readStoredShopView = () => {
    if (typeof window === "undefined") return null;
    try {
      const parsed = JSON.parse(window.localStorage.getItem(SHOP_VIEW_STATE_KEY) || "null");
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  };
  const storedShopView = typeof window !== "undefined" ? readStoredShopView() : null;
  const validMainTabs = new Set(["market", "my-products", "orders"]);
  const validListingTabs = new Set(["active", "all", "reviewing", "deleted"]);
  const validOrderTabs = new Set(["all", "processing", "shipped", "delivered", "returns"]);
  const [selectedCategory, setSelectedCategory] = useState(""); // Filter state
  const [selectedSubCategory, setSelectedSubCategory] = useState("");
  const [selectedLevel3, setSelectedLevel3] = useState("");
  const [categoryTree, setCategoryTree] = useState<any[]>([]);
  const [searchDraft, setSearchDraft] = useState("");
  const [marketSearchQuery, setMarketSearchQuery] = useState("");
  const [isShopFilterOpen, setIsShopFilterOpen] = useState(false);
  const [isCountryFilterOpen, setIsCountryFilterOpen] = useState(false);
  const [countryFilterSearch, setCountryFilterSearch] = useState("");
  const [shopFilterCountries, setShopFilterCountries] = useState<{ name: string; code: string }[]>([]);
  const [selectedFilterCountry, setSelectedFilterCountry] = useState("");
  const [marketSortOption, setMarketSortOption] = useState<ShopSortOption | "">("");
  const [activeMarketAlgorithm, setActiveMarketAlgorithm] = useState<MarketAlgorithmOption>("recommended");
  const applyPastedSearch = (event: any) => {
    const pastedValue = getPastedShopSearchValue(event);
    if (!pastedValue) return;
    const nextSearch = getShopSearchText(pastedValue) || pastedValue;
    if (!nextSearch.trim()) return;
    event.preventDefault();
    setSearchDraft(nextSearch);
    setMarketSearchQuery(nextSearch);
  };
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showFilters, setShowFilters] = useState(false);
  const [activeTab, setActiveTab] = useState(() =>
    validMainTabs.has(storedShopView?.activeTab) ? storedShopView.activeTab : "market"
  ); // market, my-products, orders
  const [myListingsTab, setMyListingsTab] = useState(() =>
    validListingTabs.has(storedShopView?.myListingsTab) ? storedShopView.myListingsTab : "active"
  );
  const [myListingsSubTab, setMyListingsSubTab] = useState(() =>
    validOrderTabs.has(storedShopView?.myListingsSubTab) ? storedShopView.myListingsSubTab : "all"
  );
  const [myOrdersTab, setMyOrdersTab] = useState(() =>
    validOrderTabs.has(storedShopView?.myOrdersTab) ? storedShopView.myOrdersTab : "all"
  );
  const [orderBadgeCounts, setOrderBadgeCounts] = useState({
    buyer: { all: 0, processing: 0, shipped: 0, total: 0 },
    seller: { all: 0, processing: 0, shipped: 0, total: 0 },
  });
  const [isCategoriesDrawerOpen, setIsCategoriesDrawerOpen] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [productTimeSpentMap, setProductTimeSpentMap] = useState<Record<string, number>>({});
  const [isBottomSheetLoading, setIsBottomSheetLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isRefreshingProducts, setIsRefreshingProducts] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());
  const [isUserResolved, setIsUserResolved] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [subscribedSellerIds, setSubscribedSellerIds] = useState<Set<string>>(new Set());
  const [pendingSubscribeSellerId, setPendingSubscribeSellerId] = useState<string | null>(null);
  const [justSubscribedSellerId, setJustSubscribedSellerId] = useState<string | null>(null);
  const [viewingOrderGroup, setViewingOrderGroup] = useState<any[] | null>(null);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [mounted, setMounted] = useState(false);
  const [allowedMethodsMap, setAllowedMethodsMap] = useState<Record<number, string[]>>({}); // productId -> allowed methods
  const [reportingOrder, setReportingOrder] = useState<any>(null);
  const [reportSide, setReportSide] = useState<'buyer' | 'seller'>('buyer');
  const [orderReportReason, setOrderReportReason] = useState("");
  const [orderReportText, setOrderReportText] = useState("");
  const [showSimpleReceiveModal, setShowSimpleReceiveModal] = useState(false);
  const [orderToReceive, setOrderToReceive] = useState<any>(null);
  const [viewingReport, setViewingReport] = useState<{ side: 'buyer' | 'seller', data: any } | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareProduct, setShareProduct] = useState<any>(null);
  const [activePreviewIndex, setActivePreviewIndex] = useState(0);
  const [sharedAdPreviewModal, setSharedAdPreviewModal] = useState<{ ad: any; kind: "image" | "video" | "embed" } | null>(null);
  const [productComments, setProductComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [, setRelativeTimeTick] = useState(0);
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);
  const [interactionProduct, setInteractionProduct] = useState<any>(null);
  const [bottomSheetType, setBottomSheetType] = useState<
    "likes" | "comments" | "shares" | "views"
  >("comments");
  const [bottomSheetData, setBottomSheetData] = useState<any[]>([]);
  const [openMenuProductId, setOpenMenuProductId] = useState<string | number | null>(
    null,
  );
  const [hiddenProductIds, setHiddenProductIds] = useState<number[]>([]);
  const [hiddenShopAdIds, setHiddenShopAdIds] = useState<Set<string>>(new Set());
  const [reportingProduct, setReportingProduct] = useState<any>(null);
  const [reportReason, setReportReason] = useState<string>("");
  const [reportDetail, setReportDetail] = useState<string>("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const [reportError, setReportError] = useState("");
  const [pendingAdCoinProduct, setPendingAdCoinProduct] = useState<any>(null);
  const [adVideoCoinEligibility, setAdVideoCoinEligibility] = useState<Record<string, boolean>>({});
  const [requiredAdWatchSeconds, setRequiredAdWatchSeconds] = useState(5);
  const [localLoadingId, setLocalLoadingId] = useState<number | null>(null);
  const [ordersCurrentPage, setOrdersCurrentPage] = useState(() => {
    const page = Number(storedShopView?.ordersCurrentPage || 1);
    return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  });
  const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);
  const [orderToCancel, setOrderToCancel] = useState<any>(null); // 'bulk' or item object
  const [orderToDeliver, setOrderToDeliver] = useState<any>(null); // State for delivery confirmation modal
  const [marketAds, setMarketAds] = useState<any[]>([]);
  const [showAdExpiryPopup, setShowAdExpiryPopup] = useState(false);
  const prevActivePhotoVideoIds = useRef<Set<string>>(new Set());
  const syncAds = useAdStore((state) => state.syncAds);
  const updateAdState = useAdStore((state) => state.updateAdState);
  const setViewerContext = useAdStore((state) => state.setViewerContext);
  const [marketHasMore, setMarketHasMore] = useState(false);
  const [marketNextOffset, setMarketNextOffset] = useState(0);
  const [isLoadingMoreProducts, setIsLoadingMoreProducts] = useState(false);
  const marketLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const [shopAdShuffleSeed] = useState(() => getSessionClientSeed("googer-shop-ad-pool-seed-v2"));
  const [shopAdRotation] = useState(() => {
    if (typeof window === "undefined") return 0;
    try {
      const previousRotation = Number.parseInt(window.localStorage.getItem("googer-shop-ad-row-rotation-v1") || "0", 10) || 0;
      const nextRotation = previousRotation + 1;
      window.localStorage.setItem("googer-shop-ad-row-rotation-v1", String(nextRotation));
      return nextRotation;
    } catch {
      return 0;
    }
  });
  const [productShuffleSeed, setProductShuffleSeed] = useState(() => `${Date.now()}-${Math.random()}`);
  const marketFeedSessionRef = useRef<string>("");
  const marketShuffleTokenRef = useRef<string>("");
  const productDwellRef = useRef<{ key: string; startedAt: number } | null>(null);
  const ordersPageSize = 8;
  const getBlockedOwnerId = (item: any) => String(
    item?.user_id ||
    item?.owner_user_id ||
    item?.owner_id ||
    item?.seller_id ||
    item?.user?.id ||
    item?.raw?.user_id ||
    item?.raw?.owner_user_id ||
    item?.raw?.owner_id ||
    "",
  );
  const isBlockedOwnerItem = (item: any) => {
    const ownerId = getBlockedOwnerId(item);
    return !!ownerId && blockedUserIds.has(ownerId);
  };

  useEffect(() => {
    if (!currentUser?.id) {
      setHiddenShopAdIds(new Set());
      return;
    }
    const syncHiddenFeedItems = () => {
      setHiddenShopAdIds(getHiddenFeedItemIds(currentUser.id, "ad"));
    };
    syncHiddenFeedItems();
    return subscribeToHiddenFeedItems(syncHiddenFeedItems);
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser?.id) {
      setBlockedUserIds(new Set());
      return;
    }
    let cancelled = false;
    const loadBlockedUsers = async () => {
      try {
        const blockedUsers = await chatService.getBlockedUsers();
        if (cancelled) return;
        setBlockedUserIds(new Set((blockedUsers || []).map((entry: any) => String(entry.id))));
      } catch {
        if (!cancelled) setBlockedUserIds(new Set());
      }
    };
    void loadBlockedUsers();
    const handleBlockedUsersUpdated = () => { void loadBlockedUsers(); };
    window.addEventListener("googer-blocked-users-updated", handleBlockedUsersUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener("googer-blocked-users-updated", handleBlockedUsersUpdated);
    };
  }, [currentUser?.id]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SHOP_PRODUCT_TIME_SPENT_KEY);
      const parsed = stored ? JSON.parse(stored) : {};
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        setProductTimeSpentMap(parsed);
      }
    } catch {
      // ignore local ranking history read failures
    }
  }, []);

  useEffect(() => {
    const commitDwellTime = () => {
      const active = productDwellRef.current;
      if (!active?.key) return;
      const seconds = Math.max(0, Math.round((Date.now() - active.startedAt) / 1000));
      if (seconds < 2) return;
      setProductTimeSpentMap((current) => {
        const next = {
          ...current,
          [active.key]: Math.min(3600, toFiniteNumber(current[active.key], 0) + seconds),
        };
        try {
          window.localStorage.setItem(SHOP_PRODUCT_TIME_SPENT_KEY, JSON.stringify(next));
        } catch {
          // ignore local ranking history write failures
        }
        return next;
      });
    };

    commitDwellTime();
    const nextKey = selectedProduct ? getProductRankingKey(selectedProduct) : "";
    productDwellRef.current = nextKey ? { key: nextKey, startedAt: Date.now() } : null;
  }, [selectedProduct]);

  const visibleMarketplaceProducts = useMemo(() => {
    const filteredProducts = products
      .filter((p) => !hiddenProductIds.includes(p.id))
      .filter((p) => !(p?.is_sponsored || p?.campaign_type) || !hiddenShopAdIds.has(getAdInteractionId(p)))
      .filter((p) => !isBlockedOwnerItem(p))
      .filter((p) => {
        if (p?.is_sponsored) return false;
        if (activeTab === "my-products" && myListingsTab === "reviewing") {
          return p.status === "reviewing" || p.status === "rejected";
        }
        return true;
      });
    const countryFilteredProducts = activeTab === "market" && selectedFilterCountry
      ? filteredProducts.filter((product) => {
        const countries = getProductCountryValues(product);
        const selected = selectedFilterCountry.toLowerCase();
        return countries.has(selected) || countries.has("worldwide");
      })
      : filteredProducts;
    const personalizedProducts = activeTab === "market"
      ? countryFilteredProducts.map((product) => ({
        ...product,
        _local_time_spent: toFiniteNumber(productTimeSpentMap[getProductRankingKey(product)], 0),
      }))
      : countryFilteredProducts;
    const algorithmRankedProducts = activeTab === "market"
      ? rankMarketProducts(personalizedProducts, activeMarketAlgorithm, marketSearchQuery || searchDraft)
      : personalizedProducts;
    const sortedProducts = marketSortOption
      ? [...algorithmRankedProducts].sort((a, b) => {
        if (marketSortOption === "price-low-high") return getProductPromoPrice(a) - getProductPromoPrice(b);
        if (marketSortOption === "price-high-low") return getProductPromoPrice(b) - getProductPromoPrice(a);
        if (marketSortOption === "top-sales") return getProductSalesScore(b) - getProductSalesScore(a);
        return 0;
      })
      : algorithmRankedProducts;

    const approvedAds = activeTab === "market"
      ? Array.from(
        [
          ...products.filter((p) => !!p?.is_sponsored && !hiddenProductIds.includes(p.id) && !hiddenShopAdIds.has(getAdInteractionId(p)) && !isBlockedOwnerItem(p)),
          ...marketAds.filter((ad) => !hiddenProductIds.includes(ad.id) && !hiddenShopAdIds.has(getAdInteractionId(ad)) && !isBlockedOwnerItem(ad)),
        ]
          .reduce((map, ad) => {
            const key = getShopAdRotationKey(ad);
            if (key && !map.has(key)) map.set(key, ad);
            return map;
          }, new Map<string, any>())
          .values(),
      )
      : [];

    if (activeTab !== "market") return filteredProducts;

    const profilePromoteAds = approvedAds.filter(isProfilePromoteItem);
    const interleavableAds = approvedAds.filter((ad) => !isProfilePromoteItem(ad));
    const interleavedItems = interleaveShopProductsWithAds(
      sortedProducts,
      interleavableAds,
      "googer-marketplace-ad-rotation-v2",
      shopAdShuffleSeed,
      6,
      shopAdRotation,
    );

    return insertProfilePromoteCarouselRows(interleavedItems, profilePromoteAds);
  }, [activeMarketAlgorithm, activeTab, blockedUserIds, hiddenProductIds, hiddenShopAdIds, marketAds, marketSearchQuery, marketSortOption, myListingsTab, productTimeSpentMap, products, searchDraft, selectedFilterCountry, shopAdRotation, shopAdShuffleSeed]);
  const lastClosedProductId = useRef<string | null>(null);
  const productsCacheRef = useRef<Record<string, any[]>>({});
  const productLoadRequestRef = useRef(0);
  const [notification, setNotification] = useState<{ type: 'error' | 'success', message: string, title?: string } | null>(null);
  const [isMenuOpenModal, setIsMenuOpenModal] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [selectedVariantIndex, setSelectedVariantIndex] = useState<number | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedShippingCountry, setSelectedShippingCountry] = useState<string | null>(null);
  const [isSizeDropdownOpen, setIsSizeDropdownOpen] = useState(false);
  const [isColorDropdownOpen, setIsColorDropdownOpen] = useState(false);


  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [productToDelete, setProductToDelete] = useState<any>(null);
  const [initialShareView, setInitialShareView] = useState<"share" | "resell">("share");
  const [isFullscreenPreviewOpen, setIsFullscreenPreviewOpen] = useState(false);
  const [chatSidebar, setChatSidebar] = useState<{
    isOpen: boolean;
    participant: any | null;
    scopeKey: string | null;
    contextLabel: string | null;
  }>({ isOpen: false, participant: null, scopeKey: null, contextLabel: null });
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatMessageInput, setChatMessageInput] = useState("");
  const [chatCallMode, setChatCallMode] = useState<"voice" | "video" | null>(null);
  const [pendingChatAttachments, setPendingChatAttachments] = useState<any[]>([]);
  const [isUploadingChatAttachments, setIsUploadingChatAttachments] = useState(false);
  const chatImageInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let ignore = false;
    fetch("https://flagcdn.com/en/codes.json")
      .then((res) => res.json())
      .then((data) => {
        if (ignore) return;
        const list = Object.entries(data)
          .filter(([code]) => code.length === 2)
          .map(([code, name]) => ({ code, name: name as string }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setShopFilterCountries(list);
      })
      .catch((error) => console.error("Error fetching countries:", error));
    return () => {
      ignore = true;
    };
  }, []);

  // Cart logic
  const { addToCart, userCountry, savedAddress } = useCart();

  const syncProductOwnerProfile = (product: any, user: any) => {
    if (!product || !user?.id) return product;
    const ownerId = product.user_id || product.owner_id || product.seller_id || product.user?.id;
    if (String(ownerId) !== String(user.id)) return product;

    return {
      ...product,
      user: product.user
        ? {
          ...product.user,
          id: ownerId,
          username: user.username || product.user.username,
          profile_picture: user.profile_picture ?? product.user.profile_picture,
        }
        : { id: ownerId, username: user.username, profile_picture: user.profile_picture },
    };
  };

  const notifyCodAutoReceiveWindow = (items: any[], audience: "buyer" | "seller") => {
    if (typeof window === "undefined" || !Array.isArray(items)) return;

    const deliveredCodOrders = items.filter((item) =>
      String(item?.status || "").toLowerCase() === "delivered" &&
      String(item?.payment_method || "").toLowerCase() === "cod"
    );
    if (deliveredCodOrders.length === 0) return;

    let seenIds: string[] = [];
    const seenKey = `googer-cod-auto-receive-notifications-${audience}`;
    try {
      const stored = JSON.parse(window.localStorage.getItem(seenKey) || "[]");
      seenIds = Array.isArray(stored) ? stored.map(String) : [];
    } catch {
      seenIds = [];
    }

    const nextSeen = new Set(seenIds);
    deliveredCodOrders.slice(0, 5).forEach((item) => {
      const notificationId = `cod-auto-receive-${audience}-${item.id}-${item.updated_at || item.status}`;
      if (nextSeen.has(notificationId)) return;
      nextSeen.add(notificationId);

      window.dispatchEvent(new CustomEvent("add-notification", {
        detail: {
          id: notificationId,
          type: "info",
          title: audience === "buyer" ? "Receive confirmation needed" : "COD delivery waiting",
          message: audience === "buyer"
            ? `Please click Receive for order ${item.order_number || item.id} within 48 hours. If not, it will be completed automatically.`
            : `Order ${item.order_number || item.id} is delivered. Buyer has 48 hours to click Receive before it auto-completes.`,
          time: "Within 48 hours",
        },
      }));
    });

    window.localStorage.setItem(seenKey, JSON.stringify(Array.from(nextSeen).slice(-100)));
  };

  useEffect(() => {
    if (activeTab !== "market") return;
    let cancelled = false;

    const loadActiveShopAds = async () => {
      try {
        const token = typeof window !== "undefined" ? (window.sessionStorage.getItem("token") || window.localStorage.getItem("token")) : null;
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
        const activeAds: any[] = [];
        let offset = 0;
        const limit = 50;
        let hasMore = true;

        while (hasMore && !cancelled) {
          const response = await fetch(`/api/ads/active-public?limit=${limit}&offset=${offset}&shuffle=${encodeURIComponent(shopAdShuffleSeed)}`, {
            cache: "no-store",
            headers,
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data?.message || "Failed to load active ads");

          const rawPageAds = Array.isArray(data?.ads) ? data.ads : [];
          const pageAds = filterAdsForViewer(rawPageAds, currentUser);
          activeAds.push(...pageAds);
          hasMore = !!data?.pagination?.hasMore && rawPageAds.length > 0;
          offset = Number(data?.pagination?.nextOffset ?? offset + rawPageAds.length);
        }

        const mappedAds = activeAds
          .map(mapPublicActiveAdToShopAd)
          .filter((ad) => !!ad?.is_sponsored);

        const hydratedAds = (await Promise.all(
          mappedAds.map((ad) => isProductPromoteItem(ad) ? resolveProductPromoteProduct(ad) : ad),
        ))
          .filter((ad) => !!ad?.is_sponsored);

        const dedupedHydratedAds = Array.from(
          new Map(hydratedAds.map((ad) => [String(ad?.adId || ad?.ad_id || ad?.id || Math.random()), ad])).values(),
        );

        if (cancelled) return;
        setMarketAds(dedupedHydratedAds);
        if (dedupedHydratedAds.length > 0) syncAds(dedupedHydratedAds);
      } catch (error) {
        console.error("Failed to load active ads for shop feed:", error);
      }
    };

    const refreshActiveShopAds = () => {
      void loadActiveShopAds();
    };

    void loadActiveShopAds();
    window.addEventListener("googer-ad-history-updated", refreshActiveShopAds);
    window.addEventListener("focus", refreshActiveShopAds);

    return () => {
      cancelled = true;
      window.removeEventListener("googer-ad-history-updated", refreshActiveShopAds);
      window.removeEventListener("focus", refreshActiveShopAds);
    };
  }, [activeTab, currentUser, shopAdShuffleSeed, syncAds]);

  // Real-time ad expiry watcher — same engine as home feed
  useEffect(() => {
    if (!currentUser?.id) return;
    let mounted = true;

    const checkExpiry = async () => {
      try {
        const myAds: any[] = await adsService.getMyAds();
        if (!mounted) return;

        const prevActive = prevActivePhotoVideoIds.current;
        let justExpired = false;

        myAds.forEach((ad) => {
          const isPhotoVideo =
            String(ad.campaignType || ad.campaign_type || "").trim().toLowerCase() === "photo and video" ||
            String(ad.campaignType || ad.campaign_type || "").trim().toLowerCase() === "photo & video";
          const adId = String(ad.adId || ad.ad_id || "");
          if (!isPhotoVideo || !adId) return;

          if ((ad.status === "Expired" || ad.status === "Completed") && prevActive.has(adId)) {
            const shownKey = `googer_expiry_shown_${adId}`;
            if (!localStorage.getItem(shownKey)) {
              localStorage.setItem(shownKey, "1");
              justExpired = true;
            }
            setMarketAds((prev) => prev.filter((feedAd) => {
              const feedId = String(feedAd.adId || feedAd.ad_id || feedAd.id || "").replace(/^ad-/, "");
              return feedId !== adId.replace(/^ad-/, "");
            }));
          }
        });

        if (justExpired) setShowAdExpiryPopup(true);

        prevActivePhotoVideoIds.current = new Set(
          myAds
            .filter((ad) => {
              const isPhotoVideo =
                String(ad.campaignType || ad.campaign_type || "").trim().toLowerCase() === "photo and video" ||
                String(ad.campaignType || ad.campaign_type || "").trim().toLowerCase() === "photo & video";
              return isPhotoVideo && ad.status === "Active";
            })
            .map((ad) => String(ad.adId || ad.ad_id || ""))
            .filter(Boolean)
        );
      } catch {
        // non-critical
      }
    };

    void checkExpiry();
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "hidden") void checkExpiry();
    }, 10000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [currentUser?.id]);

  const liveSelectedProduct = useMemo(() => {
    if (!selectedProduct) return null;
    const lookupId = selectedProduct.adId || selectedProduct.ad_id || selectedProduct.id;
    const live = products.find(p => matchesAdIdentity(p, lookupId)) ||
      marketAds.find(p => matchesAdIdentity(p, lookupId)) ||
      products.find(p => selectedProduct.product_id && String(p.id) === String(selectedProduct.product_id));
    if (!live) return selectedProduct;
    if (isProductPromoteItem(selectedProduct) && (selectedProduct.adId || selectedProduct.ad_id)) {
      return {
        ...selectedProduct,
        user_liked: live.user_liked ?? selectedProduct.user_liked,
        likes_count: live.likes_count ?? selectedProduct.likes_count,
        comments_count: live.comments_count ?? selectedProduct.comments_count,
        shares_count: live.shares_count ?? selectedProduct.shares_count,
        views_count: live.views_count ?? selectedProduct.views_count,
        ad_coin_collected: live.ad_coin_collected ?? selectedProduct.ad_coin_collected,
        ad_like_locked: live.ad_like_locked ?? selectedProduct.ad_like_locked,
      };
    }
    // Merge live data but preserve the "ad-ness" from the selectedProduct snapshot
    return {
      ...live,
      is_sponsored: selectedProduct.is_sponsored || live.is_sponsored,
      adId: selectedProduct.adId || live.adId,
      ad_id: selectedProduct.ad_id || live.ad_id || selectedProduct.adId,
      campaign_type: selectedProduct.campaign_type || live.campaign_type,
      product_id: selectedProduct.product_id || selectedProduct.linked_product_id || live.product_id || live.linked_product_id,
      linked_product_id: selectedProduct.linked_product_id || selectedProduct.product_id || live.linked_product_id,
      linked_product_code: selectedProduct.linked_product_code || live.linked_product_code,
      share_code: selectedProduct.share_code || live.share_code,
      user_liked: live.user_liked ?? selectedProduct.user_liked,
      likes_count: live.likes_count ?? selectedProduct.likes_count,
      comments_count: live.comments_count ?? selectedProduct.comments_count,
      shares_count: live.shares_count ?? selectedProduct.shares_count,
      views_count: live.views_count ?? selectedProduct.views_count,
      ad_coin_collected: live.ad_coin_collected ?? selectedProduct.ad_coin_collected,
      ad_like_locked: live.ad_like_locked ?? selectedProduct.ad_like_locked,
    };
  }, [selectedProduct, products, marketAds]);

  const liveSharedAdPreviewModal = useMemo(() => {
    if (!sharedAdPreviewModal) return null;
    const live = marketAds.find(p => matchesAdIdentity(p, sharedAdPreviewModal.ad.id)) ||
      products.find(p => matchesAdIdentity(p, sharedAdPreviewModal.ad.id));
    const ad = live ? {
      ...live,
      is_sponsored: sharedAdPreviewModal.ad.is_sponsored || live.is_sponsored,
      adId: sharedAdPreviewModal.ad.adId || live.adId,
      ad_id: sharedAdPreviewModal.ad.ad_id || live.ad_id,
      user_liked: live.user_liked ?? sharedAdPreviewModal.ad.user_liked,
      ad_coin_collected: live.ad_coin_collected ?? sharedAdPreviewModal.ad.ad_coin_collected
    } : sharedAdPreviewModal.ad;
    return { ...sharedAdPreviewModal, ad };
  }, [sharedAdPreviewModal, marketAds, products]);

  const navigateToProfile = (
    event: React.MouseEvent,
    profileId?: string | number | null,
  ) => {
    event.stopPropagation();
    if (!profileId) return;
    router.push(`/dashboard/profile?id=${profileId}`);
  };

  const getAdCoinEligibilityKey = (product: any) => String(product?.id || "");

  const isWatchTimedSponsoredAdProduct = (product: any) => {
    if (!product?.is_sponsored) return false;
    if (isProductPromoteItem(product)) return false;
    const campaignType = String(product?.campaign_type || product?.campaignType || "").trim().toLowerCase();
    if (!(campaignType.includes("photo") || campaignType.includes("video"))) return false;
    // Watch-time applies only to actual uploaded video files, not images or link-based ads.
    const mediaType = String(product?.media_type || product?.mediaType || "").trim().toLowerCase();
    return mediaType === "video";
  };

  const getSponsoredCollectionId = (product: any) => {
    if (!product?.is_sponsored) return product?.id;
    return String(product?.id || "").startsWith("ad-") ? product.id : (product?.adId ? `ad-${product.adId}` : product?.id);
  };

  const getUserIdentity = (user: any) => (
    user?.id ??
    user?.user_id ??
    user?.googer_id ??
    user?.userId ??
    user?.owner_id ??
    user?.ownerId ??
    null
  );

  const getAdOwnerIdentity = (product: any) => (
    product?.ad_owner_user_id ??
    product?.adOwnerUserId ??
    product?.advertiser_id ??
    product?.raw?.ad_owner_user_id ??
    product?.raw?.advertiser_id ??
    product?.user_id ??
    product?.owner_user_id ??
    product?.owner_id ??
    product?.seller_id ??
    product?.user?.id ??
    product?.owner?.id ??
    product?.advertiser_id ??
    null
  );

  const canShowCollectCoinButton = (product: any) => {
    // Collect all possible owner IDs from the ad (ads table may store users.user_id, not users.id)
    const ownerCandidates = [
      getAdOwnerIdentity(product),
      product?.raw?.user_id,
      product?.user_id,
    ].filter(Boolean).map(String);
    // Collect all possible IDs for the current user
    const viewerCandidates = [
      currentUser?.id,
      currentUser?.user_id,
      currentUser?.googer_id,
      currentUser?.userId,
    ].filter(Boolean).map(String);
    if (ownerCandidates.length > 0 && viewerCandidates.length > 0 &&
        ownerCandidates.some((oid) => viewerCandidates.includes(oid))) return false;
    return canShowAdCollectCoinButton(product, currentUser);
  };

  const openProductPromoteSecondView = async (product: any) => {
    const originalProduct = await resolveProductPromoteProduct(product);
    if (!originalProduct) {
      setNotification({ type: "error", title: "Product unavailable", message: "The promoted product could not be loaded." });
      return;
    }
    setSelectedProduct(originalProduct);
    setSelectedVariantIndex(null);
    setActivePreviewIndex(0);
    handleLogView(originalProduct.adId ? `ad-${originalProduct.adId}` : originalProduct.id, product);
  };

  const subscribeButtonClass =
    "rounded-full px-3 py-1.5 text-[9px] font-black uppercase tracking-widest shadow-xl transition-all active:scale-95";
  const collectCoinButtonClass =
    "rounded-full px-1.5 py-[0.22rem] text-[7px] font-black uppercase tracking-[0.1em] text-white shadow-xl transition-all active:scale-95 bg-red-600 hover:bg-red-500 border border-red-400/30 backdrop-blur-sm";

  const getChatConversationKey = (
    participantId?: number | string | null,
    scopeKey?: string | null,
  ) => {
    if (!currentUser?.id || !participantId) return null;
    const members = [String(currentUser.id), String(participantId)].sort();
    const scopeSuffix = scopeKey ? `-${scopeKey}` : "";
    return `googer-chat-${members.join("-")}${scopeSuffix}`;
  };

  const getChatParticipantKey = (participantId?: number | string | null) => {
    if (!participantId) return null;
    return `googer-chat-contact-${participantId}`;
  };

  const getChatRecentKey = (participantId?: number | string | null) => {
    if (!currentUser?.id || !participantId) return null;
    return `googer-chat-recent-${currentUser.id}-${participantId}`;
  };

  const loadChatMessages = (
    participantId?: number | string | null,
    scopeKey?: string | null,
  ) => {
    const storageKey = getChatConversationKey(participantId, scopeKey);
    if (!storageKey || typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  };

  const persistChatMessages = (
    participantId: number | string | null | undefined,
    messages: any[],
    scopeKey?: string | null,
  ) => {
    const storageKey = getChatConversationKey(participantId, scopeKey);
    if (!storageKey || typeof window === "undefined") return;
    window.localStorage.setItem(storageKey, JSON.stringify(messages));

    const recentKey = getChatRecentKey(participantId);
    if (!recentKey) return;
    window.localStorage.setItem(recentKey, JSON.stringify({
      participantId,
      updatedAt: messages[messages.length - 1]?.created_at || new Date().toISOString(),
    }));
  };

  const persistChatParticipant = (participant: any) => {
    const storageKey = getChatParticipantKey(participant?.id);
    if (!storageKey || typeof window === "undefined" || !participant) return;
    window.localStorage.setItem(storageKey, JSON.stringify(participant));

    const recentKey = getChatRecentKey(participant?.id);
    if (!recentKey) return;
    window.localStorage.setItem(recentKey, JSON.stringify({
      participantId: participant.id,
      updatedAt: new Date().toISOString(),
    }));
  };

  const appendChatMessage = (
    message: any,
    participantId?: number | string | null,
    scopeKey?: string | null,
  ) => {
    const targetParticipantId = participantId ?? chatSidebar.participant?.id;
    if (!targetParticipantId) return;
    const targetScopeKey = scopeKey ?? chatSidebar.scopeKey;
    const existing = loadChatMessages(targetParticipantId, targetScopeKey);
    const next = [...existing, message];
    persistChatMessages(targetParticipantId, next, targetScopeKey);
    if (
      String(chatSidebar.participant?.id || "") === String(targetParticipantId) &&
      String(chatSidebar.scopeKey || "") === String(targetScopeKey || "")
    ) {
      setChatMessages(next);
    }
  };

  const getOrderChatScope = (items: any[], item?: any) => {
    if (item?.id) {
      return `order-item-${item.id}`;
    }
    const orderNumber = items?.[0]?.order_number;
    return orderNumber ? `order-${orderNumber}` : null;
  };

  const getOrderChatContextLabel = (items: any[], item?: any) => {
    if (item?.title) {
      return `Product: ${item.title}`;
    }
    const orderNumber = items?.[0]?.order_number;
    return orderNumber ? `Order ${orderNumber}` : "Order Chat";
  };

  const getChatParticipantFromItems = (items: any[]) => {
    const baseItem = items?.[0];
    if (!baseItem) return null;

    if (activeTab === "my-products") {
      return {
        id: baseItem.buyer_id,
        name: baseItem.buyer_username || "Buyer",
        profile_picture: baseItem.profile_picture || null,
        roleLabel: "Buyer",
        orderNumber: baseItem.order_number,
      };
    }

    return {
      id: baseItem.seller_id,
      name: baseItem.seller_username || "Seller",
      profile_picture: baseItem.profile_picture || null,
      roleLabel: "Seller",
      orderNumber: baseItem.order_number,
    };
  };

  const openOrderChat = (items: any[], options?: { item?: any }) => {
    if (!currentUser) {
      openLoginRequired({ message: "Please log in to open chat." });
      return;
    }

    const participant = getChatParticipantFromItems(items);
    if (!participant?.id) {
      setNotification({ type: "error", title: "Chat Unavailable", message: "Unable to find this chat user right now." });
      return;
    }

    persistChatParticipant(participant);
    const scopeKey = getOrderChatScope(items, options?.item);
    const contextLabel = getOrderChatContextLabel(items, options?.item);
    setChatSidebar({ isOpen: true, participant, scopeKey, contextLabel });
    setChatMessages(loadChatMessages(participant.id, scopeKey));
    setChatMessageInput("");
    setPendingChatAttachments([]);
    setChatCallMode(null);
  };

  const closeOrderChat = () => {
    setChatSidebar({ isOpen: false, participant: null, scopeKey: null, contextLabel: null });
    setChatMessages([]);
    setChatMessageInput("");
    setPendingChatAttachments([]);
    setChatCallMode(null);
  };

  const handleSendChatMessage = () => {
    const trimmed = chatMessageInput.trim();
    if ((!trimmed && pendingChatAttachments.length === 0) || !chatSidebar.participant?.id || !currentUser) return;

    const participant = chatSidebar.participant;

    if (trimmed) {
      appendChatMessage({
        id: Date.now(),
        type: "text",
        sender_id: currentUser.id,
        sender_name: currentUser.username || "You",
        text: trimmed,
        status: "delivered",
        created_at: new Date().toISOString(),
      }, participant.id, chatSidebar.scopeKey);
    }

    for (const attachment of pendingChatAttachments) {
      appendChatMessage({
        id: Date.now() + Math.random(),
        type: "image",
        sender_id: currentUser.id,
        sender_name: currentUser.username || "You",
        image_url: attachment.image_url,
        file_name: attachment.file_name,
        status: "sending",
        created_at: new Date().toISOString(),
      }, participant.id, chatSidebar.scopeKey);
    }
    setChatMessageInput("");
    setPendingChatAttachments([]);
  };

  const handleStartChatCall = (mode: "voice" | "video") => {
    if (!chatSidebar.participant?.id || !currentUser) return;
    setChatCallMode(mode);
    appendChatMessage({
      id: Date.now(),
      type: "call",
      call_mode: mode,
      sender_id: currentUser.id,
      sender_name: currentUser.username || "You",
      text: `${mode === "voice" ? "Voice" : "Video"} call started`,
      status: "delivered",
      created_at: new Date().toISOString(),
    }, chatSidebar.participant.id, chatSidebar.scopeKey);
    setNotification({
      type: "success",
      title: `${mode === "voice" ? "Voice" : "Video"} Call`,
      message: `${mode === "voice" ? "Voice" : "Video"} call opened with ${chatSidebar.participant.name}.`,
    });
  };

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleSelectChatImages = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";

    if (!files.length || !chatSidebar.participant?.id || !currentUser) return;

    setIsUploadingChatAttachments(true);
    const nextAttachments = [...pendingChatAttachments];

    try {
      for (const file of files) {
        if (file.size > 3 * 1024 * 1024) {
          setNotification({
            type: "error",
            title: "Image Too Large",
            message: "Image must be less than 3MB",
          });
          continue;
        }

        try {
          const imageUrl = await readFileAsDataUrl(file);
          nextAttachments.push({
            id: Date.now() + Math.random(),
            image_url: imageUrl,
            file_name: file.name,
          });
        } catch {
          setNotification({
            type: "error",
            title: "Upload Failed",
            message: `Failed to attach ${file.name}.`,
          });
        }
      }
    } finally {
      setIsUploadingChatAttachments(false);
    }

    setPendingChatAttachments(nextAttachments);
  };

  useEffect(() => {
    if (selectedProduct) {
      setQuantity(1);
      setSelectedVariantIndex(null);
      setSelectedSize(null);

      // Default the shipping country to match the user's saved address if available
      const standardized = parseShippingData(selectedProduct);
      const isSavedCountryAvailable = standardized.find(c => c.country === savedAddress?.country);
      if (savedAddress?.country && isSavedCountryAvailable) {
        setSelectedShippingCountry(savedAddress.country);
      } else {
        setSelectedShippingCountry(standardized[0]?.country || 'Worldwide');
      }
    }
  }, [selectedProduct?.id, selectedProduct?.adId, selectedProduct?.ad_id, savedAddress?.country]);

  useEffect(() => {
    if (!searchParams) return;
    const tab = searchParams.get('tab');
    if (tab === 'orders') {
      setActiveTab('orders');
    } else if (tab === 'listings') {
      setActiveTab('my-products');
    } else if (tab === 'seller-orders') {
      setActiveTab('my-products');
      setMyListingsTab('all');
    }
  }, [searchParams]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SHOP_VIEW_STATE_KEY, JSON.stringify({
      activeTab,
      myListingsTab,
      myListingsSubTab,
      myOrdersTab,
      ordersCurrentPage,
    }));
  }, [activeTab, myListingsTab, myListingsSubTab, myOrdersTab, ordersCurrentPage]);

  useEffect(() => {
    if (selectedProduct?.id) {
      loadComments(selectedProduct.id);
    }
  }, [selectedProduct?.id]);

  useEffect(() => {
    if (selectedProduct?.id && !isProductPromoteItem(selectedProduct)) {
      const latestSelectedProduct = products.find((item) => String(item.id) === String(selectedProduct.id));
      if (latestSelectedProduct && latestSelectedProduct !== selectedProduct) {
        setSelectedProduct((prev: any) => (prev ? { ...prev, ...latestSelectedProduct } : prev));
      }
    }

  }, [products, selectedProduct?.id, selectedProduct?.campaign_type]);

  const loadComments = async (id: string | number) => {
    try {
      const data = await marketService.getComments(id);
      setProductComments(data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddComment = async (parentId?: number) => {
    if (!selectedProduct || !newComment.trim()) return;
    if (!currentUser) {
      openLoginRequired({ message: "Please log in to comment on products or ads." });
      return;
    }
    try {
      const comment = await marketService.addComment(
        selectedProduct.id,
        newComment,
        parentId
      );
      // Append real username/profile if available from currentUser
      const commentData = {
        ...comment,
        username: currentUser.username,
        profile_picture: currentUser.profile_picture,
      };
      setProductComments((prev) => [commentData, ...prev]);
      setNewComment("");
      setProducts((prev) =>
        prev.map((p) =>
          p.id === selectedProduct.id
            ? { ...p, comments_count: (p.comments_count || 0) + 1 }
            : p,
        ),
      );
      updateAdState(selectedProduct, (prev) => ({ comments_count: (prev.comments_count || 0) + 1 }));

      // If bottom sheet is open, refresh comments
      if (isBottomSheetOpen && bottomSheetType === "comments") {
        setBottomSheetData((prev) => [...prev, commentData]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSendComment = async (text: string, parentId?: number) => {
    const targetProduct = interactionProduct || selectedProduct;
    if (!targetProduct) return;

    try {
      const comment = await marketService.addComment(targetProduct.id, text, parentId);
      const commentData = {
        ...comment,
        username: currentUser?.username || "You",
        profile_picture: currentUser?.profile_picture,
      };
      setBottomSheetData((prev) => [...prev, commentData]);
      setProducts((prev) =>
        prev.map((p) =>
          p.id === targetProduct.id
            ? { ...p, comments_count: (p.comments_count || 0) + 1 }
            : p,
        ),
      );
      updateAdState(targetProduct, (prev) => ({ comments_count: (prev.comments_count || 0) + 1 }));
      if (selectedProduct?.id === targetProduct.id) {
        setSelectedProduct((prev: any) =>
          prev ? { ...prev, comments_count: (prev.comments_count || 0) + 1 } : prev,
        );
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteComment = async (commentId: string | number) => {
    try {
      const result = await marketService.deleteComment(commentId);
      const deletedCount = Math.max(1, Number(result?.deletedCount || 1));
      // Remove from bottom sheet state immediately
      setBottomSheetData((prev) =>
        prev.filter(
          (c) =>
            c.id !== commentId &&
            c.parent_id !== commentId,
        ),
      );

      // Update comments_count on products in the grid and selected product
      const targetProduct = interactionProduct || selectedProduct;
      if (targetProduct) {
        updateAdState(targetProduct, (prev) => ({ comments_count: Math.max((prev.comments_count || 0) - deletedCount, 0) }));
        setProducts((prev) =>
          prev.map((p) =>
            p.id === targetProduct.id
              ? { ...p, comments_count: Math.max((p.comments_count || 0) - deletedCount, 0) }
              : p,
          ),
        );

        if (selectedProduct?.id === targetProduct.id) {
          setSelectedProduct((prev: any) => ({
            ...prev,
            comments_count: Math.max((prev.comments_count || 0) - deletedCount, 0)
          }));
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const markAdCoinCollectedLocally = (productId: string | number) => {
    const matchesSponsoredId = (p: any) => (
      p && (
        String(p.id) === String(productId) ||
        String(p.adId || p.ad_id || "") === String(productId).replace(/^ad-/, "") ||
        String(p.product_id || p.productId || p.linked_product_id || "") === String(productId).replace(/^ad-/, "") ||
        [p.product_code, p.share_code, p.shareCode].some(code => code && String(code) === String(productId).replace(/^ad-/, ""))
      )
    );

    setProducts((prev) =>
      prev.map((p) =>
        matchesSponsoredId(p)
          ? { ...p, ad_coin_collected: true, ad_like_locked: true }
          : p,
      ),
    );

    setMarketAds((prev) =>
      prev.map((p) =>
        matchesSponsoredId(p)
          ? { ...p, ad_coin_collected: true, ad_like_locked: true }
          : p,
      ),
    );

    if (matchesSponsoredId(selectedProduct)) {
      updateAdState(selectedProduct, { ad_coin_collected: true, ad_like_locked: true });
    }
  };

  const markAdVideoCoinEligibleLocally = (productId: string | number) => {
    setAdVideoCoinEligibility((prev) => ({
      ...prev,
      [String(productId)]: true,
    }));
  };

  // Removed manual updateAdLocalState in favor of useAdStore global reactivity

  const adActions = useAdActions(null, {
    currentUser,
    viewerReady: isUserResolved,
    canShowCollectCoin: canShowCollectCoinButton,
    // Removed local sync callbacks - useAdActions now updates useAdStore globally
    onShare: (ad) => {
      if (!authService.isAuthenticated() || !currentUser?.id) {
        openLoginRequired({ message: "Please log in to share products or ads." });
        return;
      }
      setShareProduct(ad.raw || ad);
      setShowShareModal(true);
    },
    onOpenSheet: (type, ad) => openBottomSheet(type, ad.raw || ad),
    onCoinCollected: (ad, collectionId) => {
      markAdCoinCollectedLocally(collectionId);
    },
    onCoinError: (_ad, error: any) => {
      setNotification({
        type: "error",
        title: "Collection Failed",
        message: error?.message || "Could not collect the ad coin.",
      });
    },
    onNeedCoinConfirmation: (ad) => {
      const warningKey = `googer-ad-coin-warning-${currentUser?.id}`;
      const alreadySeen = typeof window !== "undefined" && localStorage.getItem(warningKey) === "1";
      if (alreadySeen) {
        collectAdCoin(ad.raw || ad);
      } else {
        setPendingAdCoinProduct(ad.raw || ad);
      }
    },
    onNotify: (notification) => {
      if (notification.title === "Login Required" || notification.title === "Session Expired") {
        openLoginRequired({ message: notification.message });
        return;
      }
      setNotification(notification);
    },
  });

  useEffect(() => {
    let cancelled = false;
    const loadAdCoinSettings = async () => {
      try {
        const settings = await marketService.getAdCoinSettingsPublic();
        if (cancelled) return;
        setRequiredAdWatchSeconds(Math.max(1, Math.floor(Number(settings?.required_watch_seconds || 5))));
      } catch {
        if (!cancelled) setRequiredAdWatchSeconds(5);
      }
    };

    void loadAdCoinSettings();
    const intervalId = window.setInterval(() => {
      void loadAdCoinSettings();
    }, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const confirmAdVideoWatchEligible = async (product: any, watchedSeconds = 5) => {
    if (!product?.is_sponsored || !isWatchTimedSponsoredAdProduct(product)) return;
    const productKey = getAdCoinEligibilityKey(product);
    if (adVideoCoinEligibility[productKey]) return;

    try {
      await marketService.markAdVideoWatchEligible(product.id, watchedSeconds);
      markAdVideoCoinEligibleLocally(product.id);
    } catch (error) {
      console.error("Ad video watch confirmation failed:", error);
    }
  };

  const collectAdCoin = async (product: any) => {
    try {
      const resolvedProduct = isProductPromoteItem(product)
        ? (await resolveProductPromoteProduct(product)) || product
        : product;
      const ownerCandidates = [
        getAdOwnerIdentity(resolvedProduct),
      ].filter(Boolean).map(String);
      const viewerCandidates = [
        currentUser?.id, currentUser?.user_id, currentUser?.googer_id,
      ].filter(Boolean).map(String);
      if (ownerCandidates.some((oid) => viewerCandidates.includes(oid))) {
        setPendingAdCoinProduct(null);
        return;
      }
      const result = await adActions.collectAdCoin(resolvedProduct);
      setNotification({
        type: "success",
        title: "Coin Collected",
        message: `Rupieer ${Number(result?.amount || resolvedProduct?.ad_coin_value || 1).toFixed(2)} added to the ad owner's wallet.`,
      });
    } catch (error: any) {
      // Notification is already handled by adActions.onCoinError
    } finally {
      setPendingAdCoinProduct(null);
    }
  };

  const handleAdCoinClick = (event: React.MouseEvent, product: any) => {
    if (isWatchTimedSponsoredAdProduct(product) && !adVideoCoinEligibility[getAdCoinEligibilityKey(product)]) {
      event.stopPropagation();
      setNotification({
        type: "error",
        title: "Watch Required",
        message: `Please watch this ad for ${requiredAdWatchSeconds} seconds before collecting the coin.`,
      });
      return;
    }
    adActions.handleAdCoinClick(event, product);
  };

  const resolveLikeTarget = (item: any) => {
    if (item && typeof item === "object") return item;
    const candidates = [
      selectedProduct,
      interactionProduct,
      pendingAdCoinProduct,
      sharedAdPreviewModal?.ad,
      ...products,
      ...marketAds,
    ].filter(Boolean);
    return candidates.find((candidate) => matchesAdIdentity(candidate, item)) || item;
  };

  const isLikeLockedAfterCollection = (item: any) => {
    if (!item || typeof item !== "object") return false;
    const liveState = useAdStore.getState().getAdState(item);
    return !!(
      liveState.ad_like_locked ||
      liveState.ad_coin_collected ||
      item.ad_like_locked ||
      item.ad_coin_collected ||
      item.coinCollected ||
      item.raw?.ad_like_locked ||
      item.raw?.ad_coin_collected
    );
  };

  const handleToggleLike = async (item: any) => {
    if (!authService.isAuthenticated() || !currentUser?.id) {
      openLoginRequired({ message: "Please log in to like products or ads." });
      return;
    }
    try {
      const likeTarget = resolveLikeTarget(item);
      const id = typeof likeTarget === 'object' ? likeTarget.id : likeTarget;
      const liveState = typeof likeTarget === "object" ? useAdStore.getState().getAdState(likeTarget) : {};
      const isLiked = !!(
        liveState.user_liked ??
        likeTarget?.user_liked ??
        likeTarget?.liked ??
        likeTarget?.raw?.user_liked
      );

      if (isLiked && isLikeLockedAfterCollection(likeTarget)) {
        if (typeof likeTarget === "object") {
          updateAdState(likeTarget, { user_liked: true, ad_like_locked: true });
        }
        setNotification({
          type: "error",
          title: "Like Locked",
          message: "You already collected coins for this ad. You cannot unlike.",
        });
        return;
      }

      await adActions.like(likeTarget);

      // If bottom sheet is open for likes, refresh it
      if (isBottomSheetOpen && bottomSheetType === "likes" && String(interactionProduct?.id) === String(id)) {
        const likes = (await marketService.getLikes?.(id)) || [];
        setBottomSheetData(likes);
      }
    } catch (error) {
      console.error("Like toggle failed:", error);
    }
  };

  const openBottomSheet = async (
    type: "likes" | "comments" | "shares" | "views",
    product: any,
  ) => {
    setBottomSheetType(type);
    setInteractionProduct(product);
    setIsBottomSheetOpen(true);
    setBottomSheetData([]); // Loading state
    setIsBottomSheetLoading(true);

    try {
      let data = [];
      if (type === "comments") {
        data = await marketService.getComments(product.id);
      } else if (type === "likes") {
        // Assuming marketService.getLikes exists or we can use toggle history
        data = (await marketService.getLikes?.(product.id)) || [];
      } else if (type === "shares") {
        data = (await marketService.getShares?.(product.id)) || [];
      } else if (type === "views") {
        data = (await marketService.getViews?.(product.id)) || [];
      }
      const nextCount = Array.isArray(data) ? data.length : 0;
      if (product?.is_sponsored || product?.campaign_type || String(product?.id || "").startsWith("ad-")) {
        if (type === "comments") updateAdState(product, { comments_count: nextCount });
        if (type === "likes") updateAdState(product, { likes_count: nextCount });
        if (type === "shares") updateAdState(product, { shares_count: nextCount });
        if (type === "views") updateAdState(product, { views_count: nextCount });
      }
      setBottomSheetData(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setIsBottomSheetLoading(false);
    }
  };

  const refreshInteractionComments = async () => {
    const targetProduct = interactionProduct || selectedProduct;
    if (!targetProduct?.id || bottomSheetType !== "comments") return;

    try {
      const data = await marketService.getComments(targetProduct.id);
      setBottomSheetData(data || []);
      if (targetProduct?.is_sponsored || targetProduct?.campaign_type || String(targetProduct?.id || "").startsWith("ad-")) {
        updateAdState(targetProduct, { comments_count: Array.isArray(data) ? data.length : 0 });
      }
    } catch (error) {
      console.error(error);
    }
  };

  // dragging states removed — no icon popup on long press

  const handleLogShare = async (id: number) => {
    try {
      const result = await marketService.logShare(id);
      if (result?.incremented !== true) return;
      setProducts((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, shares_count: (p.shares_count || 0) + 1 } : p,
        ),
      );
      updateAdState(id, (prev) => ({ shares_count: (prev.shares_count || 0) + 1 }));
      if (selectedProduct?.id === id) {
        setSelectedProduct((prev: any) =>
          prev ? { ...prev, shares_count: (prev.shares_count || 0) + 1 } : prev,
        );
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleShareClick = (product: any, view: "share" | "resell" = "share") => {
    if (!product) return;
    if (!authService.isAuthenticated() || !currentUser?.id) {
      openLoginRequired({ message: "Please log in to share products or ads." });
      return;
    }

    if (view === "resell") {
      let isResellingEnabled = false;
      try {
        const commInfo = typeof product.commission_info === "string"
          ? JSON.parse(product.commission_info)
          : product.commission_info;

        if (
          commInfo?.resell_percentage ||
          commInfo?.resell_amount ||
          commInfo?.resell_commission ||
          commInfo?.reseller_commission ||
          commInfo?.googer_commission
        ) {
          isResellingEnabled = true;
        }
      } catch (e) {
        isResellingEnabled = false;
      }

      if (!isResellingEnabled) {
        setNotification({ type: 'error', title: 'Unavailable', message: 'This product is not available for reselling' });
        return;
      }
    }

    setInitialShareView(view);
    if (product?.is_sponsored || String(product?.id || "").startsWith("ad-")) {
      adActions.share(product);
      return;
    }
    setShareProduct(product);
    setShowShareModal(true);
  };

  const handlePromoteProduct = (product: any) => {
    if (!product?.id) return;
    const productShareLink = getShareUrlForItem(product, "product");
    router.push(
      `/dashboard/ad-campaign/product-promote?productId=${encodeURIComponent(String(product.id))}&link=${encodeURIComponent(productShareLink)}`,
    );
  };

  const handlePromoteAgain = (ad: any) => {
    const campaignType = String(ad?.campaign_type || ad?.campaignType || ad?.raw?.campaign_type || "").trim().toLowerCase();
    if (campaignType === "product promote") {
      void promoteProductAdAgain({ ad, router });
      return;
    }
    void promotePhotoVideoAdAgain({ ad, router });
  };

  const handleLogView = async (id: number | string, item?: any) => {
    try {
      const viewId = item?.adId || item?.ad_id
        ? `ad-${String(item.adId || item.ad_id).replace(/^ad-/, "")}`
        : id;
      const result = await marketService.logView(viewId);
      const isSponsoredTarget =
        !!item?.is_sponsored ||
        String(item?.id || "").startsWith("ad-") ||
        String(viewId).startsWith("ad-");
      if (result?.success) {
        if (isSponsoredTarget) {
          const nextViewsCount = Number(
            result.views_count ??
            result.viewCount ??
            result.views ??
            item?.views_count ??
            item?.viewCount ??
            0
          );
          const nextReach = Number(result.current_reach ?? result.reach ?? 0);
          updateAdState(item || id, {
            views_count: nextViewsCount,
            viewCount: nextViewsCount,
            current_reach: nextReach,
            reach: nextReach,
            clicks: Number(result.clicks || result.link_actions || 0),
            link_actions: Number(result.link_actions || result.clicks || 0),
            message_clicks: Number(result.message_clicks || 0),
            visit_clicks: Number(result.visit_clicks || 0),
            call_clicks: Number(result.call_clicks || 0),
          });
          return;
        }
      }
      // Only increment local market product view count when the backend explicitly confirmed a new unique view
      if (result?.incremented === true) {
        setProducts((prev) =>
          prev.map((p) =>
            p.id === id ? { ...p, views_count: (p.views_count || 0) + 1 } : p,
          ),
        );
        updateAdState(id, (prev) => ({ views_count: (prev.views_count || 0) + 1 }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleLogImpression = async (id: number | string, item?: any) => {
    try {
      const impressionId = item?.adId || item?.ad_id
        ? `ad-${String(item.adId || item.ad_id).replace(/^ad-/, "")}`
        : id;
      const result = await marketService.logAdImpression(impressionId);
      if (!result?.success) return;

      updateAdState(item || id, {
        impressions: Number(result.impressions ?? item?.impressions ?? item?.impressions_count ?? 0),
        impressions_count: Number(result.impressions ?? item?.impressions ?? item?.impressions_count ?? 0),
        current_reach: Number(result.current_reach ?? result.reach ?? item?.current_reach ?? item?.reach ?? 0),
        reach: Number(result.current_reach ?? result.reach ?? item?.current_reach ?? item?.reach ?? 0),
      });

      if (result.capped || String(result.status || "").toLowerCase() === "completed") {
        const rawAdId = String(impressionId).replace(/^ad-/, "");
        setMarketAds((prev) => prev.filter((ad) => {
          const feedId = String(ad.adId || ad.ad_id || ad.id || "").replace(/^ad-/, "");
          return feedId !== rawAdId;
        }));
        setProducts((prev) => prev.filter((product) => {
          const feedId = String(product.adId || product.ad_id || product.id || "").replace(/^ad-/, "");
          return feedId !== rawAdId;
        }));
      }
    } catch (error) {
      console.error("Failed to log ad impression:", error);
    }
  };

  const openSponsoredPreviewModal = (product: any, previewType: string | null) => {
    const externalUrl = normalizeExternalUrl(product?.active_link || "");
    if (!externalUrl) return;

    if (previewType === "video") {
      setSharedAdPreviewModal({ ad: product, kind: "video" });
      return;
    }

    const embedUrl = getSponsoredSocialEmbedUrl(externalUrl);
    if (embedUrl) {
      setSharedAdPreviewModal({ ad: product, kind: "embed" });
      return;
    }

    window.open(externalUrl, "_blank", "noopener,noreferrer");
  };

  const handleSponsoredImageOpen = (product: any) => {
    setSharedAdPreviewModal({
      ad: product,
      kind: "image",
    });
    handleLogView(product.id, product);
  };

  // InteractionButton is now outside ShopPage

  useEffect(() => {
    categoryService.getTree(false).then((tree) => setCategoryTree(tree || [])).catch(() => {});
    const onUpdate = () => categoryService.getTree(false).then((tree) => setCategoryTree(tree || [])).catch(() => {});
    window.addEventListener("googer-categories-updated", onUpdate);
    return () => window.removeEventListener("googer-categories-updated", onUpdate);
  }, []);

  useEffect(() => {
    setMounted(true);
    loadUser();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleAuthChanged = (event: Event) => {
      const nextUser = (event as CustomEvent)?.detail?.user || null;
      setCurrentUser(nextUser);
      setViewerContext(nextUser);
      setIsUserResolved(true);
    };
    window.addEventListener("googer-auth-changed", handleAuthChanged as EventListener);
    return () => window.removeEventListener("googer-auth-changed", handleAuthChanged as EventListener);
  }, [setViewerContext]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setRelativeTimeTick((tick) => tick + 1), 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!isUserResolved) return;
    loadProducts();
  }, [
    isUserResolved,
    activeTab,
    myListingsTab,
    myListingsSubTab,
    myOrdersTab,
    currentUser?.id,
    selectedCategory,
    selectedSubCategory,
    selectedLevel3,
    marketSearchQuery,
    userCountry,
  ]);

  useEffect(() => {
    loadOrderBadgeCounts();
  }, [currentUser?.id]);

  // Keep draft in sync when marketSearchQuery is cleared externally
  useEffect(() => {
    if (marketSearchQuery === "") {
      setSearchDraft("");
      setMarketSortOption("top-sales");
    }
  }, [marketSearchQuery]);

  useEffect(() => {
    const handleRefresh = (e: any) => {
      const updatedProduct = e.detail;
      refresh(updatedProduct);
    };
    window.addEventListener("product-added", handleRefresh);
    return () => window.removeEventListener("product-added", handleRefresh);
  }, []);

  useEffect(() => {
    const handleOpenProduct = (productId: number) => {
      const product = products.find(p => p.id === productId);
      if (product) {
        setSelectedProduct(product);
        handleLogView(productId);
      }
    };

    const handleEvent = (e: any) => handleOpenProduct(e.detail.productId);
    window.addEventListener("open-shop-product-modal", handleEvent);

    // Initial load local storage deep-linking
    const pendingId = localStorage.getItem("open-shop-product-id");
    if (pendingId && products.length > 0) {
      handleOpenProduct(parseInt(pendingId));
      localStorage.removeItem("open-shop-product-id");
    }

    return () => window.removeEventListener("open-shop-product-modal", handleEvent);
  }, [products]);

  // Handle deep-linked product from URL (/shop/id or /product/code or /share/code or ?id=...)
  useEffect(() => {
    const handleInboundLink = async () => {
      if (!searchParams) return;

      // Try search params first
      let idParam = searchParams.get("id");

      // As a fallback, try to extract from pathname (/shop/ID or /product/CODE or /share/CODE)
      if (!idParam && typeof window !== "undefined") {
        const path = window.location.pathname;
        const match = path.match(/\/(shop|product|share)\/([^\/]+)/);
        if (match) idParam = match[2];
      }

      if (!idParam) return;

      // Avoid re-triggering if this product was just closed manually
      if (idParam === lastClosedProductId.current) return;

      // Avoid re-triggering if this product is already selected
      const currentId = selectedProduct?.id?.toString() || selectedProduct?.product_code;
      if (idParam === currentId) return;

      let product: any = null;
      const numericId = parseInt(idParam, 10);

      if (!isNaN(numericId)) {
        // Numeric ID — check local list first, then fetch
        product = products.find((p) => p.id === numericId);
        if (!product) {
          try {
            product = await marketService.getItemById(numericId);
          } catch (e) {
            console.error("Failed to fetch deep-linked product by id:", e);
          }
        }
      } else {
        // Alphanumeric product_code (from share links)
        product = products.find((p) => p.product_code === idParam);
        if (!product) {
          try {
            product = await marketService.getItemByCode(idParam);
          } catch (e) {
            console.error("Failed to fetch deep-linked product by code:", e);
          }
        }
      }

      if (product) {
        const adView = searchParams.get("adView");
        const isSponsoredMediaAd =
          (!!product?.is_sponsored || String(product?.id || "").startsWith("ad-")) &&
          !isProductPromoteItem(product) &&
          !isProfilePromoteItem(product);

        if (isSponsoredMediaAd && adView === "image") {
          handleSponsoredImageOpen(product);
          router.replace("/dashboard/shop", { scroll: false });
          return;
        }

        if (isSponsoredMediaAd && adView === "preview") {
          const previewType = getSponsoredLinkPreviewType(normalizeExternalUrl(product?.active_link || ""));
          openSponsoredPreviewModal(product, previewType);
          router.replace("/dashboard/shop", { scroll: false });
          return;
        }

        // If opened via share link, store the product's category so the user
        // can navigate back to the same category after closing the modal.
        if (searchParams.get("id") || idParam) {
          const productCategory = product.category || "";
          if (productCategory && !selectedCategory) {
            // Don't override if user already filtered — only set context for share links
            // (i.e. when we arrived from outside the app)
            const isExternalEntry = document.referrer === "" || !document.referrer.includes(window.location.hostname);
            if (isExternalEntry) {
              // Store for back-navigation — will be applied when modal closes
              sessionStorage.setItem("share-link-category", productCategory);
            }
          }
        }

        setSelectedProduct(product);
        handleLogView(product.id, product);
      }
    };

    handleInboundLink();
  }, [searchParams, products, router]); // Removed selectedProduct?.id to avoid re-triggering on close


  useEffect(() => {
    const handleClickOutside = () => setOpenMenuProductId(null);
    if (openMenuProductId) {
      window.addEventListener("click", handleClickOutside);
    }
    return () => window.removeEventListener("click", handleClickOutside);
  }, [openMenuProductId]);

  useEffect(() => {
    const syncFollowingState = () => {
      loadUser();
    };

    window.addEventListener("focus", syncFollowingState);
    document.addEventListener("visibilitychange", syncFollowingState);

    return () => {
      window.removeEventListener("focus", syncFollowingState);
      document.removeEventListener("visibilitychange", syncFollowingState);
    };
  }, []);

  useEffect(() => {
    const handleProfileUpdated = (event: Event) => {
      const updatedUser = (event as CustomEvent)?.detail?.user;
      if (!updatedUser?.id) return;

      setCurrentUser((prev: any) => (
        prev && String(prev.id) === String(updatedUser.id) ? { ...prev, ...updatedUser } : prev
      ));
      setProducts((prev) => prev.map((item) => syncProductOwnerProfile(item, updatedUser)));
      setSelectedProduct((prev: any) => syncProductOwnerProfile(prev, updatedUser));
      setSharedAdPreviewModal((prev: any) => (
        prev ? { ...prev, ad: syncProductOwnerProfile(prev.ad, updatedUser) } : prev
      ));
      setPendingAdCoinProduct((prev: any) => syncProductOwnerProfile(prev, updatedUser));
      setShareProduct((prev: any) => syncProductOwnerProfile(prev, updatedUser));
      setInteractionProduct((prev: any) => syncProductOwnerProfile(prev, updatedUser));
    };

    window.addEventListener("userProfileUpdated", handleProfileUpdated as EventListener);
    return () => window.removeEventListener("userProfileUpdated", handleProfileUpdated as EventListener);
  }, []);

  const loadUser = async () => {
    try {
      const user = await authService.getProfile();
      setCurrentUser(user);
      setViewerContext(user);
      if (user?.id) {
        const following = await authService.getFollowingUsers(user.id);
        const followingIds = new Set(
          (Array.isArray(following) ? following : [])
            .map((entry: any) => String(entry?.id || entry?.user_id || entry?.following_id || ""))
            .filter(Boolean),
        );
        setSubscribedSellerIds(followingIds);
      }
    } catch {
      setCurrentUser(null);
      setViewerContext(null);
    } finally {
      setIsUserResolved(true);
    }
  };

  const getSellerId = (product: any) => {
    if (!product) return null;
    const rawSellerId = product.user_id || product.owner_id || product.seller_id || product.user?.id;
    return rawSellerId ? String(rawSellerId) : null;
  };

  const showSubscribeForProduct = (product: any) => {
    const sellerId = getSellerId(product);
    if (!currentUser?.id || !sellerId) return false;
    if (String(currentUser.id) === sellerId) return false;
    return !subscribedSellerIds.has(sellerId);
  };

  const handleSubscribeSeller = async (event: any, product: any) => {
    event.stopPropagation();

    if (!currentUser) return;

    const sellerId = getSellerId(product);
    if (!sellerId || String(currentUser.id) === sellerId || pendingSubscribeSellerId === sellerId) return;

    try {
      setPendingSubscribeSellerId(sellerId);
      setSubscribedSellerIds((prev) => {
        const next = new Set(prev);
        next.add(sellerId);
        return next;
      });

      const currentStatus = await authService.getSubscriptionStatus(sellerId);
      if (currentStatus.isSubscribed) {
        setSubscribedSellerIds((prev) => {
          const next = new Set(prev);
          next.add(sellerId);
          return next;
        });
        window.dispatchEvent(new CustomEvent("googer-subscription-updated", { detail: { sellerId } }));
        return;
      }

      const result = await authService.toggleSubscription(sellerId);

      if (result.isSubscribed) {
        setJustSubscribedSellerId(sellerId);
        setSubscribedSellerIds((prev) => {
          const next = new Set(prev);
          next.add(sellerId);
          return next;
        });
        window.dispatchEvent(new CustomEvent("googer-subscription-updated", { detail: { sellerId } }));
      }
    } catch (_error: any) {
      setSubscribedSellerIds((prev) => {
        const next = new Set(prev);
        next.delete(sellerId);
        return next;
      });
    } finally {
      setPendingSubscribeSellerId((current) => (current === sellerId ? null : current));
    }
  };

  // InteractionButton is now outside ShopPage

  const loadProducts = async () => {
    const isMarketFeed = activeTab === "market";
    const cacheKey = JSON.stringify({
      activeTab,
      myListingsTab,
      myListingsSubTab,
      myOrdersTab,
      currentUserId: currentUser?.id || null,
      selectedCategory,
      selectedSubCategory,
      selectedLevel3,
      marketSearchQuery,
      userCountry,
    });
    const cachedProducts = isMarketFeed ? null : productsCacheRef.current[cacheKey];
    const requestId = ++productLoadRequestRef.current;
    const shouldBlockRender = isMarketFeed || (!cachedProducts && products.length === 0);

    if (cachedProducts) {
      setProducts(cachedProducts);
      setLoading(false);
      setIsRefreshingProducts(true);
    } else if (shouldBlockRender) {
      if (isMarketFeed) {
        setProducts([]);
      }
      setLoading(true);
      setIsRefreshingProducts(false);
    } else {
      setIsRefreshingProducts(true);
    }

    try {
      let data = [];
      const filters: any = {};
      if (!isMarketFeed) {
        setMarketHasMore(false);
        setMarketNextOffset(0);
      }
      if (activeTab === "market") {
        if (selectedLevel3) {
          filters.category = selectedLevel3;
        } else if (selectedSubCategory) {
          filters.category = selectedSubCategory;
        } else if (selectedCategory) {
          filters.category = selectedCategory;
        }
        let seenProductIds: number[] = [];
        try {
          const storedSeenIds = sessionStorage.getItem(MARKET_FEED_HISTORY_KEY);
          const parsedSeenIds = storedSeenIds ? JSON.parse(storedSeenIds) : [];
          seenProductIds = Array.isArray(parsedSeenIds)
            ? parsedSeenIds.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0).slice(-60)
            : [];
        } catch {
          seenProductIds = [];
        }

        let lastShownOrderIds: string[] = [];
        try {
          const storedLastOrder = sessionStorage.getItem(MARKET_FEED_LAST_ORDER_KEY);
          const parsedLastOrder = storedLastOrder ? JSON.parse(storedLastOrder) : [];
          lastShownOrderIds = Array.isArray(parsedLastOrder)
            ? parsedLastOrder.map((value) => String(value).trim()).filter(Boolean).slice(-80)
            : [];
        } catch {
          lastShownOrderIds = [];
        }

        filters.status = "approved";
        if (marketSearchQuery.trim()) {
          filters.search = marketSearchQuery.trim();
        }
        filters._shuffle = Date.now().toString();
        filters._feedSession = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        marketFeedSessionRef.current = filters._feedSession;
        marketShuffleTokenRef.current = filters._shuffle;
        setProductShuffleSeed(`${Date.now()}-${Math.random()}`);
        filters.limit = String(MARKET_PAGE_SIZE);
        filters.offset = "0";
        if (seenProductIds.length > 0) {
          filters._seen = seenProductIds.join(",");
        }
        if (lastShownOrderIds.length > 0) {
          filters._lastOrder = lastShownOrderIds.join(",");
        }
        const result = await marketService.getProducts(filters);
        data = Array.isArray(result.data) ? result.data : [];
        setMarketHasMore(!!result.pagination?.hasMore);
        setMarketNextOffset(Number(result.pagination?.nextOffset || data.length || 0));
      } else if (activeTab === "my-products") {
        if (currentUser?.id) {
          if (myListingsTab === "all") {
            // "Your Orders" (Seller Side)
            // If sub-tab is 'all', we might want to show everything or just pending?
            // User says 'All Orders' shows admin-approved products.
            // For demo, I'll fetch orders. If 'all', I'll show all including pending.
            const statusFilter = ORDER_STAGE_FILTERS[myListingsSubTab as keyof typeof ORDER_STAGE_FILTERS] || myListingsSubTab;
            data = await orderService.getSellerOrders({ status: statusFilter });
          } else if (myListingsTab === "active") {
            data = await marketService.getItems({
              user_id: currentUser.id,
              status: "approved",
            });
          } else if (myListingsTab === "reviewing") {
            data = await marketService.getItems({
              user_id: currentUser.id,
              status: "reviewing,rejected",
            });
          } else if (myListingsTab === "deleted") {
            data = await marketService.getItems({
              user_id: currentUser.id,
              status: "deleted,inactive",
            });
          }
        }
      } else if (activeTab === "orders") {
        if (currentUser?.id) {
          const statusFilter = ORDER_STAGE_FILTERS[myOrdersTab as keyof typeof ORDER_STAGE_FILTERS] || myOrdersTab;
          data = await orderService.getBuyerOrders({ status: statusFilter });
        }
      }

      const finalData = data || [];
      if (isMarketFeed) {
        const sponsoredRows = finalData.filter((item: any) => item?.is_sponsored);
        if (sponsoredRows.length > 0) syncAds(sponsoredRows);
      }
      if (isMarketFeed) {
        try {
          const nextSeenIds = finalData
            .map((item: any) => Number(item?.id))
            .filter((value: number) => Number.isFinite(value) && value > 0);
          const nextOrderIds = finalData
            .map((item: any) => String(item?.id || "").trim())
            .filter((value: string) => Boolean(value));
          const existingSeenIdsRaw = sessionStorage.getItem(MARKET_FEED_HISTORY_KEY);
          const existingSeenIds = existingSeenIdsRaw ? JSON.parse(existingSeenIdsRaw) : [];
          const mergedSeenIds = [...(Array.isArray(existingSeenIds) ? existingSeenIds : []), ...nextSeenIds].slice(-120);
          sessionStorage.setItem(MARKET_FEED_HISTORY_KEY, JSON.stringify(mergedSeenIds));
          sessionStorage.setItem(MARKET_FEED_LAST_ORDER_KEY, JSON.stringify(nextOrderIds));
        } catch {
          // ignore session storage issues
        }
      }

      if (!isMarketFeed) {
        productsCacheRef.current[cacheKey] = finalData;
      }

      if (requestId === productLoadRequestRef.current) {
        setProducts(finalData);
        if (activeTab === "orders") {
          notifyCodAutoReceiveWindow(finalData, "buyer");
        } else if (activeTab === "my-products" && myListingsTab === "all") {
          notifyCodAutoReceiveWindow(finalData, "seller");
        }
      }
    } catch (e) {
      console.error("Failed to load products", e);
    } finally {
      if (requestId === productLoadRequestRef.current) {
        setLoading(false);
        setIsRefreshingProducts(false);
        setLocalLoadingId(null);
      }
    }
  };

  const loadMoreMarketProducts = async () => {
    if (activeTab !== "market" || isLoadingMoreProducts || !marketHasMore) return;

    try {
      setIsLoadingMoreProducts(true);
      const filters: any = {
        status: "approved",
        limit: String(MARKET_PAGE_SIZE),
        offset: String(marketNextOffset),
      };

      if (selectedLevel3) filters.category = selectedLevel3;
      else if (selectedSubCategory) filters.category = selectedSubCategory;
      else if (selectedCategory) filters.category = selectedCategory;
      if (marketSearchQuery.trim()) filters.search = marketSearchQuery.trim();
      if (marketFeedSessionRef.current) filters._feedSession = marketFeedSessionRef.current;
      if (marketShuffleTokenRef.current) filters._shuffle = marketShuffleTokenRef.current;

      try {
        const storedSeenIds = sessionStorage.getItem(MARKET_FEED_HISTORY_KEY);
        const parsedSeenIds = storedSeenIds ? JSON.parse(storedSeenIds) : [];
        const seenProductIds = Array.isArray(parsedSeenIds)
          ? parsedSeenIds.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0).slice(-60)
          : [];
        if (seenProductIds.length > 0) filters._seen = seenProductIds.join(",");
      } catch {
        // ignore session storage issues
      }

      try {
        const storedLastOrder = sessionStorage.getItem(MARKET_FEED_LAST_ORDER_KEY);
        const parsedLastOrder = storedLastOrder ? JSON.parse(storedLastOrder) : [];
        const lastShownOrderIds = Array.isArray(parsedLastOrder)
          ? parsedLastOrder.map((value) => String(value).trim()).filter(Boolean).slice(-80)
          : [];
        if (lastShownOrderIds.length > 0) filters._lastOrder = lastShownOrderIds.join(",");
      } catch {
        // ignore session storage issues
      }

      const result = await marketService.getProducts(filters);
      const nextProducts = Array.isArray(result.data) ? result.data : [];
      const sponsoredRows = nextProducts.filter((item: any) => item?.is_sponsored);
      if (sponsoredRows.length > 0) syncAds(sponsoredRows);

      setProducts((current) => {
        const existingIds = new Set(current.map((item: any) => String(item?.id)));
        return [...current, ...nextProducts.filter((item: any) => !existingIds.has(String(item?.id)))];
      });
      setMarketHasMore(!!result.pagination?.hasMore);
      setMarketNextOffset(Number(result.pagination?.nextOffset || marketNextOffset + nextProducts.length));

      try {
        const nextSeenIds = nextProducts
          .map((item: any) => Number(item?.id))
          .filter((value: number) => Number.isFinite(value) && value > 0);
        const nextOrderIds = nextProducts
          .map((item: any) => String(item?.id || "").trim())
          .filter((value: string) => Boolean(value));
        const existingSeenIdsRaw = sessionStorage.getItem(MARKET_FEED_HISTORY_KEY);
        const existingSeenIds = existingSeenIdsRaw ? JSON.parse(existingSeenIdsRaw) : [];
        const mergedSeenIds = [...(Array.isArray(existingSeenIds) ? existingSeenIds : []), ...nextSeenIds].slice(-120);
        sessionStorage.setItem(MARKET_FEED_HISTORY_KEY, JSON.stringify(mergedSeenIds));
        sessionStorage.setItem(MARKET_FEED_LAST_ORDER_KEY, JSON.stringify(nextOrderIds));
      } catch {
        // ignore session storage issues
      }
    } catch (error) {
      console.error("Failed to load more market products", error);
    } finally {
      setIsLoadingMoreProducts(false);
    }
  };

  useEffect(() => {
    const sentinel = marketLoadMoreRef.current;
    if (!sentinel || activeTab !== "market" || !marketHasMore || isLoadingMoreProducts) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        void loadMoreMarketProducts();
      },
      { rootMargin: "1200px 0px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [activeTab, isLoadingMoreProducts, marketHasMore, marketNextOffset]);

  const loadOrderBadgeCounts = async () => {
    if (!currentUser?.id) {
      setOrderBadgeCounts({
        buyer: { all: 0, processing: 0, shipped: 0, total: 0 },
        seller: { all: 0, processing: 0, shipped: 0, total: 0 },
      });
      return;
    }

    try {
      const counts = await orderService.getBadgeCounts();
      setOrderBadgeCounts(counts);
    } catch (e) {
      console.error("Failed to load order badge counts", e);
    }
  };

  const refresh = (updatedProduct?: any) => {
    // If we have an updated product, manually sync it into our state immediately
    // so the UI doesn't flicker    // Sync state immediately to avoid disappearing cards
    if (updatedProduct && updatedProduct.id) {
      setLocalLoadingId(updatedProduct.id);
      setProducts((prev) => {
        const index = prev.findIndex((p) => p.id === updatedProduct.id);
        if (index !== -1) {
          const newProducts = [...prev];
          newProducts[index] = { ...newProducts[index], ...updatedProduct };
          return newProducts;
        } else {
          // If it's a new product or not in current list, add it
          return [updatedProduct, ...prev];
        }
      });
      // Optionally re-select it if it was open
      if (selectedProduct?.id === updatedProduct.id || editingProduct?.id === updatedProduct.id) {
        setSelectedProduct(updatedProduct);
      }
    }

    // Only switch tabs if the product's status actually changed to reviewing.
    // If it stayed active, we keep the user on their current tab to preserve context.
    if (updatedProduct && updatedProduct.status === 'reviewing') {
      setActiveTab("my-products");
      setMyListingsTab("reviewing");
    }

    // Clear editing state
    setEditingProduct(null);
    setIsCategoriesDrawerOpen(false);
  };

  const handleDeleteProduct = (product: any) => {
    setProductToDelete(product);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!productToDelete) return;
    try {
      await marketService.deleteItem(productToDelete.id);
      setSelectedProduct(null);
      setShowDeleteConfirm(false);
      setProductToDelete(null);
      loadProducts();
    } catch (e) {
      console.error("Failed to delete product", e);
      setNotification({ type: 'error', title: 'Error', message: 'Failed to delete product. Please try again.' });
    }
  };

  const handleEditProduct = (product: any) => {
    setEditingProduct(product);
    setSelectedProduct(null);
    // setIsModalOpen(true);
    window.dispatchEvent(
      new CustomEvent("open-add-product-modal", { detail: product }),
    );
  };

  const handleBuyItem = async (
    itemId: number,
    productOverride: any = selectedProduct,
    quantityOverride: number = quantity,
    variantOverride?: any,
    sizeOverride: string | null = selectedSize,
    countryOverride: string | null = selectedShippingCountry,
    variantIndexOverride: number | null = selectedVariantIndex
  ) => {
    try {
      if (!currentUser) {
        openLoginRequired({ message: "Please log in to buy items." });
        return;
      }
      const productToAdd = productOverride;
      if (!productToAdd) return;
      void itemId;

      const productVariants = typeof productToAdd.variants === "string"
        ? (productToAdd.variants.trim() ? JSON.parse(productToAdd.variants) : [])
        : (Array.isArray(productToAdd.variants) ? productToAdd.variants : []);

      const sizeOptions = typeof productToAdd.sizes === "string"
        ? (productToAdd.sizes.trim() ? JSON.parse(productToAdd.sizes) : [])
        : (Array.isArray(productToAdd.sizes) ? productToAdd.sizes : []);

      // 1. Collect ALL possible size options from all sources
      const allPossibleSizes = new Set<string>();

      // Add sizes from direct sizeOptions
      sizeOptions.forEach((s: any) => {
        const val = typeof s === 'string' ? s : s.value;
        if (val && val !== 'None' && val !== 'Default') allPossibleSizes.add(val);
      });

      // Add sizes from variants and their selections
      productVariants.forEach((v: any) => {
        if (v.size && v.size !== 'None' && v.size !== 'Default') allPossibleSizes.add(v.size);
        if (v.selections && Array.isArray(v.selections)) {
          v.selections.forEach((s: any) => {
            if (s.value && s.value !== 'None' && s.value !== 'Default') allPossibleSizes.add(s.value);
          });
        }
      });

      const sizeList = Array.from(allPossibleSizes);

      // 2. SIZE VALIDATION: If the product has sizes, one MUST be selected
      if (sizeList.length > 0 && (!sizeOverride || sizeOverride === 'Select Size' || sizeOverride === 'None')) {
        setNotification({
          type: 'error',
          title: 'Size is required',
          message: 'Size is required'
        });
        return;
      }

      const currentVariant = variantOverride || (variantIndexOverride !== null ? productVariants[variantIndexOverride] : (productVariants.length > 0 ? productVariants[0] : null));

      await addToCart(
        productToAdd,
        quantityOverride,
        sizeOverride,
        currentVariant?.color || 'None',
        variantIndexOverride !== null ? variantIndexOverride : (productVariants.length > 0 ? 0 : null),
        countryOverride
      );

      setNotification({
        type: 'success',
        title: 'Added to Bag',
        message: `${productToAdd.title} has been added to your shopping bag.`
      });

      // NOTE: Do NOT close the product modal here — the notification popup appears on top
      // and the user clicks "Continue Shopping" to dismiss it while staying on the product.
      // Only reset size/variant selections so they can choose differently next time.
      setSelectedVariantIndex(null);
      setSelectedSize(null);
      setQuantity(1);

    } catch (error) {
      console.error("Buy item error:", error);
      setNotification({
        type: 'error',
        title: 'System Error',
        message: 'An unexpected error occurred. Please try again.'
      });
    }
  };

  const handleUpdateOrderStatus = async (orderId: number, status: string) => {
    try {
      await orderService.updateStatus(orderId, status);
      loadProducts(); // Fresh results
      delete productsCacheRef.current[JSON.stringify({
        activeTab,
        myListingsTab,
        myListingsSubTab,
        myOrdersTab,
        currentUserId: currentUser?.id || null,
        selectedCategory,
        userCountry,
      })];
      loadOrderBadgeCounts();
    } catch (e: any) {
      setNotification({ type: 'error', title: 'Error', message: e.message || "Failed to update status" });
    }
  };

  const handleBulkCancel = async () => {
    if (selectedOrderIds.length === 0) return;
    try {
      setLoading(true);
      for (const id of selectedOrderIds) {
        await orderService.updateStatus(id, 'cancelled');
      }
      productsCacheRef.current = {};
      setSelectedOrderIds([]);
      setOrderToCancel(null);
      loadProducts();
      loadOrderBadgeCounts();
      setNotification({
        type: 'success',
        title: 'Items Cancelled',
        message: `${selectedOrderIds.length} items have been cancelled and refunded to your wallet.`
      });
    } catch (e: any) {
      setNotification({ type: 'error', title: 'Error', message: e.message || "Failed to cancel selected items" });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateOrderGroupStatus = async (orderNumber: string, status: string) => {
    try {
      await orderService.updateOrderGroupStatus(orderNumber, status);
      productsCacheRef.current = {};
      loadProducts();
      loadOrderBadgeCounts();
      const statusMsg = status === 'processing' ? 'accepted' : status;
      setNotification({ type: 'success', title: 'Order Updated', message: `Order ${orderNumber} has been ${statusMsg}.` });
    } catch (e: any) {
      setNotification({ type: 'error', title: 'Error', message: e.message || "Failed to update order group status" });
    }
  };

  const handleNotInterested = (productId: number) => {
    const targetItem = [
      ...products.filter((product) => matchesAdIdentity(product, productId)),
      ...marketAds.filter((ad) => matchesAdIdentity(ad, productId)),
    ][0];

    if (targetItem && (!!targetItem?.is_sponsored || !!targetItem?.campaign_type)) {
      const interactionId = getAdInteractionId(targetItem);
      hideFeedItemFor24Hours(currentUser?.id, "ad", interactionId);
      setHiddenShopAdIds((prev) => {
        const next = new Set(prev);
        next.add(interactionId);
        return next;
      });
    } else {
      setHiddenProductIds((prev) => [...prev, productId]);
    }
    setOpenMenuProductId(null);
  };

  const handleReportSubmit = async (productId: number) => {
    if (!reportReason) return;
    setReportSubmitting(true);
    setReportError("");
    try {
      const finalReason = reportReason === "Other" ? `Other: ${reportDetail}` : reportReason;
      const cleanId = String(productId).replace(/^ad-/i, "");
      const _tok = authService.getToken() || "";
      const resp = await fetch(`/api/market/${cleanId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${_tok}` },
        body: JSON.stringify({ reason: finalReason, custom_reason: reportReason === "Other" ? reportDetail : undefined }),
      });
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}));
        throw new Error(d.message || "Failed to submit report.");
      }
      setReportSubmitted(true);
      setTimeout(() => {
        setReportingProduct(null);
        setReportReason("");
        setReportDetail("");
        setReportSubmitting(false);
        setReportSubmitted(false);
        setReportError("");
      }, 2000);
    } catch (error: any) {
      const msg = String(error?.message || "").toLowerCase();
      if (msg.includes("already reported") || msg.includes("already report")) {
        setReportError("You have already reported this.");
      } else {
        setReportError("Failed to submit. Please try again.");
      }
      setReportSubmitting(false);
    }
    setOpenMenuProductId(null);
  };

  const handleSubmitOrderReport = async () => {
    if (!reportingOrder) return;
    if (!orderReportReason) {
      alert("Please select a reason");
      return;
    }
    try {
      await orderService.submitReport(reportingOrder.id, {
        reason: orderReportReason,
        custom_text: orderReportText,
        side: reportSide
      });
      setReportingOrder(null);
      setOrderReportReason("");
      setOrderReportText("");
      loadProducts();
      loadOrderBadgeCounts();
      setNotification({ type: 'success', title: 'Report Submitted', message: 'Your report has been submitted successfully.' });
    } catch (e: any) {
      setNotification({ type: 'error', title: 'Error', message: e.message || "Failed to submit report" });
    }
  };

  const openExistingOrderReport = (item: any, side: 'buyer' | 'seller') => {
    const rData = side === 'buyer' ? item.buyer_report : item.seller_report;
    const parsed = typeof rData === 'string' ? JSON.parse(rData) : rData;
    setViewingReport({ side, data: parsed });
  };

  const parseOrderReport = (raw: any) => {
    if (!raw) return null;
    try {
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      return null;
    }
  };

  const getOrderReportStatusTag = (item: any, side?: 'buyer' | 'seller') => {
    if (!item?.buyer_report && !item?.seller_report) return null;

    if (side) {
      const hasMatchingReport = side === 'buyer' ? item?.buyer_report : item?.seller_report;
      if (!hasMatchingReport) return null;
    }

    if (item.report_status === 'accepted') {
      return { label: 'Accepted', icon: 'checkmark-circle-outline', className: 'text-emerald-400' };
    }
    if (item.report_status === 'rejected') {
      return { label: 'Rejected', icon: 'close-circle-outline', className: 'text-red-400' };
    }
    if (item.report_status === 'reshipped') {
      return { label: 'Reshipped', icon: 'refresh-circle-outline', className: 'text-emerald-400' };
    }
    return { label: 'Reviewing', icon: 'time-outline', className: 'text-amber-300' };
  };

  const getGroupedReportDisplays = (items: any[]) => {
    const buyerEntries = items
      .map((item) => {
        const data = parseOrderReport(item.buyer_report);
        if (!data) return null;
        return {
          item,
          kind: 'report' as const,
          side: 'buyer' as const,
          label: 'Reported by Buyer',
          message: data.reason || 'General Issue',
          timestamp: new Date(data?.timestamp || 0).getTime(),
        };
      })
      .filter(Boolean) as Array<{
        item: any;
        kind: 'report';
        side: 'buyer';
        label: string;
        message: string;
        timestamp: number;
      }>;

    const sellerEntries = items
      .map((item) => {
        const data = parseOrderReport(item.seller_report);
        if (!data) return null;
        return {
          item,
          kind: 'report' as const,
          side: 'seller' as const,
          label: 'Reported by Seller',
          message: data.reason || 'General Issue',
          timestamp: new Date(data?.timestamp || 0).getTime(),
        };
      })
      .filter(Boolean) as Array<{
        item: any;
        kind: 'report';
        side: 'seller';
        label: string;
        message: string;
        timestamp: number;
      }>;

    const statusEntries = items.flatMap((item) => {
      const reportSides = [
        item.buyer_report ? 'buyer' : null,
        item.seller_report ? 'seller' : null,
      ].filter(Boolean) as Array<'buyer' | 'seller'>;

      return reportSides.flatMap((reportSide) => {
        const reportStatusTag = getOrderReportStatusTag(item, reportSide);
        if (!reportStatusTag || reportStatusTag.label === 'Reviewing') return [];

        return [{
          item,
          kind: 'status' as const,
          side: reportSide,
          label: reportSide === 'buyer'
            ? reportStatusTag.label === 'Reshipped'
              ? 'Reshipped for Buyer Report'
              : `${reportStatusTag.label} for Buyer Report`
            : reportStatusTag.label === 'Reshipped'
              ? 'Reshipped for Seller Report'
              : `${reportStatusTag.label} for Seller Report`,
          message: '',
          timestamp: new Date(item.updated_at || item.created_at || 0).getTime(),
        }];
      });
    }) as Array<{
      item: any;
      kind: 'status';
      side: 'buyer' | 'seller';
      label: string;
      message: string;
      timestamp: number;
    }>;

    const reports = [
      ...buyerEntries.sort((a, b) => a.timestamp - b.timestamp),
      ...sellerEntries.sort((a, b) => a.timestamp - b.timestamp),
      ...statusEntries.sort((a, b) => a.timestamp - b.timestamp),
    ];

    return reports;
  };




  // Unified modal close handler — restores category context if the user arrived via a share link
  const closeProductModal = () => {
    // 0. Update the last closed ref to prevent re-triggering handleInboundLink
    if (selectedProduct) {
      lastClosedProductId.current = selectedProduct.id?.toString() || selectedProduct.product_code || null;
    }

    // 1. Reset all modal-related states immediately
    setSelectedProduct(null);
    setActivePreviewIndex(0);
    setQuantity(1);
    setSelectedVariantIndex(null);
    setSelectedSize(null);
    setIsFullscreenPreviewOpen(false);
    setIsSizeDropdownOpen(false);

    // 2. Restore category context if the user arrived via a share link
    const shareLinkCategory = sessionStorage.getItem("share-link-category");
    if (shareLinkCategory) {
      sessionStorage.removeItem("share-link-category");
      setSelectedCategory(shareLinkCategory);
      setActiveTab("market");
    }

    // 3. Clean the URL to reflect that we've left the specific product
    if (typeof window !== "undefined") {
      const isDeepLink = window.location.pathname.match(/\/(shop|product|share)\//) || searchParams?.get("id");
      if (isDeepLink) {
        // We use replace here for cleaning up after a modal to avoid bloating history
        router.replace("/dashboard/shop", { scroll: false });

        // After a short delay, clear the closed ref so the user can re-open it if they click again
        setTimeout(() => {
          lastClosedProductId.current = null;
        }, 100);
      }
    }
  };

  const buyerOrderBadgeTotal = orderBadgeCounts.buyer.total;
  const sellerOrderBadgeTotal = orderBadgeCounts.seller.total;
  const selectedFilterCountryData = shopFilterCountries.find((country) => country.name === selectedFilterCountry);
  const hasSearchFilterText = !!(marketSearchQuery.trim() || searchDraft.trim());
  const hasActiveShopFilters = !!selectedFilterCountry || !!marketSortOption || activeMarketAlgorithm !== "recommended";
  const visibleFilterCountries = shopFilterCountries.filter((country) =>
    !countryFilterSearch.trim() ||
    country.name.toLowerCase().includes(countryFilterSearch.trim().toLowerCase()) ||
    country.code.toLowerCase().includes(countryFilterSearch.trim().toLowerCase())
  );
  const clearShopFilters = () => {
    setSelectedFilterCountry("");
    setCountryFilterSearch("");
    setMarketSortOption("");
    setActiveMarketAlgorithm("recommended");
    setIsCountryFilterOpen(false);
  };

  const renderMarketProductCard = (product: any, index: number, keyPrefix = "market") => {
    if (product?.type === "profilePromoteCarousel") {
      return (
        <ProfilePromoteCarousel
          key={`${keyPrefix}-${product.id}`}
          ads={product.ads}
          className="col-span-2 sm:col-span-2 lg:col-span-4 px-4 py-4 transition-colors sm:px-7"
          cardsPerView={4}
          onProductClick={(previewProduct) => {
            void openProductPromoteSecondView(previewProduct);
          }}
          onProfileClick={(profileAd) => {
            const profileUrl = getProfileShareUrl(profileAd);
            if (!profileUrl) return;
            window.open(profileUrl, "_blank", "noopener,noreferrer");
          }}
        />
      );
    }

    const isSponsoredCard = !!product.is_sponsored;
    const isProductPromoteCard = isSponsoredCard && isProductPromoteItem(product);
    const isAdStyleCard = isSponsoredCard && !isProductPromoteCard;
    const sponsoredActiveLink = isAdStyleCard ? normalizeExternalUrl(product.active_link || "") : "";
    const sponsoredLinkPreviewType = isAdStyleCard ? getSponsoredLinkPreviewType(sponsoredActiveLink) : null;
    const key = `${keyPrefix}-${product.id || (product.adId ? `ad-${product.adId}` : "item")}-${index}`;

    if (isSponsoredCard) {
      return (
        <Fragment key={key}>
          <MarketItemWrapper product={product} onView={handleLogView} onImpression={handleLogImpression} activeTab={activeTab}>
            <PromotedAdCard
              ad={product}
              source="shop"
              isMenuOpen={openMenuProductId === product.id}
              onToggleMenu={(id) => setOpenMenuProductId(openMenuProductId === id ? null : id)}
              onCloseMenu={() => setOpenMenuProductId(null)}
              onProductClick={(p) => {
                if (isProductPromoteCard) {
                  void openProductPromoteSecondView(p);
                }
              }}
              onAddToBagClick={(p) => {
                if (isProductPromoteCard) {
                  void openProductPromoteSecondView(p);
                }
              }}
              onOpenSecondView={() => {
                if (isProductPromoteCard) return;
                const kind = getSponsoredSecondViewKind(product, sponsoredLinkPreviewType);
                setSharedAdPreviewModal({ ad: product, kind });
                handleLogView(product.id, product);
              }}
              onToggleLike={handleToggleLike}
              onOpenSheet={(type, targetAd) => openBottomSheet(type, targetAd)}
              onShare={() => handleShareClick(product)}
              onReport={() => setReportingProduct(product)}
              onNotInterested={(id) => handleNotInterested(Number(id))}
              onPromoteAgain={handlePromoteAgain}
              onCollectCoin={(event) => handleAdCoinClick(event, product)}
              onNavigateToProfile={(event) => navigateToProfile(event, product.user_id)}
              canShowCollectCoin={canShowCollectCoinButton}
              currentUser={currentUser}
            />
          </MarketItemWrapper>
        </Fragment>
      );
    }

    return (
      <Fragment key={key}>
        <MarketItemWrapper product={product} onView={handleLogView} activeTab={activeTab}>
          <SharedProductCard
            product={product}
            isAd={isProductPromoteCard}
            currentUser={currentUser}
            onProductClick={(p) => {
              if (isProductPromoteCard) {
                void openProductPromoteSecondView(p);
              } else {
                setSelectedProduct(p);
                setSelectedVariantIndex(null);
                setActivePreviewIndex(0);
                handleLogView(p.id);
              }
            }}
            onAddToBagClick={(p) => {
              if (isProductPromoteCard) {
                void openProductPromoteSecondView(p);
              } else {
                setSelectedProduct(p);
                setSelectedVariantIndex(null);
                setActivePreviewIndex(0);
                handleLogView(p.id);
              }
            }}
            onToggleLike={handleToggleLike}
            onOpenSheet={(type, p) => openBottomSheet(type as any, p)}
            onShare={handleShareClick}
            onLogView={handleLogView}
            onReport={(p) => setReportingProduct(p)}
            onNotInterested={(id) => handleNotInterested(Number(id))}
            onCollectCoin={(event, p) => handleAdCoinClick(event, p)}
            canShowCollectCoin={canShowCollectCoinButton}
            onNavigateToProfile={(event, userId) => navigateToProfile(event, userId)}
            onEditProduct={handleEditProduct}
            onDeleteProduct={handleDeleteProduct}
            onPromoteProduct={handlePromoteProduct}
            onUpdateOrderStatus={handleUpdateOrderStatus}
            activeTab={activeTab}
            myListingsTab={myListingsTab}
          />
        </MarketItemWrapper>
      </Fragment>
    );
  };

  const topicSectionAds = activeTab === "market"
    ? Array.from(
        [
          ...products.filter((p) => !!p?.is_sponsored && !hiddenProductIds.includes(p.id) && !hiddenShopAdIds.has(getAdInteractionId(p))),
          ...marketAds.filter((ad) => !hiddenProductIds.includes(ad.id) && !hiddenShopAdIds.has(getAdInteractionId(ad))),
        ]
          .reduce((map, ad) => {
            const key = getShopAdRotationKey(ad);
            if (key && !map.has(key)) map.set(key, ad);
            return map;
          }, new Map<string, any>())
          .values(),
      ).filter((ad) => !isProfilePromoteItem(ad))
    : [];
  const marketAlgorithmSections = activeTab === "market"
    ? MARKET_ALGORITHM_OPTIONS.map((section, index) => {
      const baseProducts = visibleMarketplaceProducts.filter((product) => !product?.is_sponsored && product?.type !== "profilePromoteCarousel");
      const ranked = shuffleItemsWithSeed(
        rankMarketProducts(baseProducts, section.id, marketSearchQuery || searchDraft).slice(0, 10),
        `${productShuffleSeed}:${section.id}`,
        (p) => String(p?.id ?? Math.random()),
      );
      const padded = ranked.length > 0 && ranked.length < 4
        ? Array.from({ length: 4 }, (_, i) => ranked[i % ranked.length])
        : ranked;
      const withAds = interleaveShopProductsWithAds(
        padded,
        topicSectionAds,
        `googer-topic-ad-rotation-${section.id}`,
        shopAdShuffleSeed,
        6,
        shopAdRotation + index,
      );
      return {
        ...section,
        products: withAds,
      };
    }).filter((section) => section.products.length > 0)
    : [];
  const orderedMarketAlgorithmSections = activeTab === "market"
    ? [
      ...marketAlgorithmSections.filter((section) => section.id === "recommended"),
      ...marketAlgorithmSections.filter((section) => section.id !== "recommended"),
    ]
    : [];
  const marketApprovedAds = activeTab === "market"
    ? Array.from(
        [
          ...products.filter((p) => !!p?.is_sponsored && !hiddenProductIds.includes(p.id) && !hiddenShopAdIds.has(getAdInteractionId(p))),
          ...marketAds.filter((ad) => !hiddenProductIds.includes(ad.id) && !hiddenShopAdIds.has(getAdInteractionId(ad))),
        ]
          .reduce((map, ad) => {
            const key = getShopAdRotationKey(ad);
            if (key && !map.has(key)) map.set(key, ad);
            return map;
          }, new Map<string, any>())
          .values(),
      )
    : [];
  const profilePromoteAds = marketApprovedAds.filter(isProfilePromoteItem);
  const remainingMarketplaceProducts = activeTab === "market"
    ? (() => {
      const remainingNormalProducts = visibleMarketplaceProducts.filter((product) => (
        !product?.is_sponsored &&
        product?.type !== "profilePromoteCarousel"
      ));
      const interleavableAds = marketApprovedAds.filter((ad) => !isProfilePromoteItem(ad));
      const interleavedItems = interleaveShopProductsWithAds(
        remainingNormalProducts,
        interleavableAds,
        "googer-marketplace-ad-rotation-v2",
        shopAdShuffleSeed,
        6,
        shopAdRotation,
      );

      return insertProfilePromoteCarouselRows(interleavedItems, profilePromoteAds);
    })()
    : [];

  return (
    <div className="pb-10 relative min-h-screen w-full overflow-x-hidden">
      {/* Search Portal for Mobile Topbar */}
      {mounted &&
        document.getElementById("shop-search-portal") &&
        createPortal(
          <form className="flex w-full items-center gap-2 md:hidden" onSubmit={(e) => { e.preventDefault(); if (activeTab === "market") setMarketSearchQuery(searchDraft); }}>
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Search Googer"
                value={activeTab === "market" ? searchDraft : ""}
                onChange={(e) => { if (activeTab === "market") setSearchDraft(e.target.value); }}
                onPaste={(e) => {
                  if (activeTab !== "market") return;
                  applyPastedSearch(e);
                }}
                disabled={activeTab !== "market"}
                className="w-full bg-[#111] text-white text-xs rounded-full pl-7 pr-7 py-1.5 outline-none focus:ring-1 focus:ring-white/20 border border-white/8 placeholder:text-white/30"
              />
              <button type="submit" disabled={activeTab !== "market"} className="absolute left-0 top-0 bottom-0 pl-2.5 pr-1 flex items-center text-white/30 hover:text-white/60 transition disabled:opacity-30">
                <IonIcon name="search-outline" className="text-xs" />
              </button>
              {searchDraft && activeTab === "market" && (
                <button type="button" onClick={() => { setSearchDraft(""); setMarketSearchQuery(""); }} className="absolute right-2 top-0 bottom-0 flex items-center text-red-400 hover:text-red-300 transition">
                  <IonIcon name="close-circle" className="text-sm" />
                </button>
              )}
            </div>
            <div className="relative">
              <button
                type="button"
              onClick={() => {
                setIsShopFilterOpen((value) => !value);
                setIsCountryFilterOpen(false);
              }}
                disabled={activeTab !== "market"}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/8 bg-[#111] text-white/45 transition hover:text-white disabled:opacity-30"
                aria-label="Open product filters"
              >
                <IonIcon name="options-outline" className="text-sm" />
              </button>
            </div>
          </form>,
          document.getElementById("shop-search-portal")!,
        )}

      {/* Header: Tabs + Search (Desktop) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        {/* Tabs */}
        <div
          className="flex gap-8 border-b border-gray-800 w-full overflow-x-auto scroll-smooth px-1"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          <button
            onClick={() => setActiveTab("market")}
            className={`pb-3 transition-colors relative whitespace-nowrap ${activeTab === "market" ? "text-white text-xl font-black" : "text-gray-400 hover:text-gray-300 text-sm font-medium"}`}
          >
            <div className="flex items-center gap-2">
              <IonIcon name="storefront-outline" />
              Market
            </div>
            {activeTab === "market" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white shadow-[0_0_10px_rgba(255,255,255,0.3)]"></div>
            )}
          </button>

          <button
            onClick={() => setActiveTab("my-products")}
            className={`pb-3 text-sm font-medium transition-colors relative whitespace-nowrap ${activeTab === "my-products" ? "text-white" : "text-gray-400 hover:text-gray-300"}`}
          >
            <div className="flex items-center gap-2">
              <IonIcon name="pricetags-outline" />
              My Listings
              <OrderBadge count={sellerOrderBadgeTotal} active={activeTab === "my-products"} />
            </div>
            {activeTab === "my-products" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white shadow-[0_0_10px_rgba(255,255,255,0.3)]"></div>
            )}
          </button>

          <button
            onClick={() => setActiveTab("orders")}
            className={`pb-3 text-sm font-medium transition-colors relative whitespace-nowrap ${activeTab === "orders" ? "text-white" : "text-gray-400 hover:text-gray-300"}`}
          >
            <div className="flex items-center gap-2">
              <IonIcon name="cart-outline" />
              My Orders
              <OrderBadge count={buyerOrderBadgeTotal} active={activeTab === "orders"} />
            </div>
            {activeTab === "orders" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white shadow-[0_0_10px_rgba(255,255,255,0.3)]"></div>
            )}
          </button>
        </div>

        {/* Search (Desktop only) */}
        {activeTab === "market" && (
          <form
            className="hidden md:flex shrink-0 items-center gap-2"
            onSubmit={(e) => { e.preventDefault(); setMarketSearchQuery(searchDraft); }}
          >
            <div className="relative">
              <input
                type="text"
                placeholder="Search Googer"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                onPaste={applyPastedSearch}
                className="w-52 bg-[#111] text-white text-xs rounded-full pl-8 pr-7 py-2 outline-none focus:ring-1 focus:ring-white/20 border border-white/8 placeholder:text-white/30"
              />
              <button type="submit" className="absolute left-0 top-0 bottom-0 pl-2.5 pr-1 flex items-center text-white/30 hover:text-white/60 transition">
                <IonIcon name="search-outline" className="text-sm" />
              </button>
              {searchDraft && (
                <button type="button" onClick={() => { setSearchDraft(""); setMarketSearchQuery(""); }} className="absolute right-2 top-0 bottom-0 flex items-center text-red-400 hover:text-red-300 transition">
                  <IonIcon name="close-circle" className="text-sm" />
                </button>
              )}
            </div>
            <div className="relative">
              <button
                type="button"
              onClick={() => {
                setIsShopFilterOpen((value) => !value);
                setIsCountryFilterOpen(false);
              }}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/8 bg-[#111] text-white/45 transition hover:text-white"
                aria-label="Open product filters"
              >
                <IonIcon name="options-outline" className="text-base" />
              </button>
            </div>
          </form>
        )}
      </div>

      {isShopFilterOpen && (
        <div className="fixed inset-0 z-[180] pointer-events-none">
          <div
            className="pointer-events-auto absolute right-3 top-[4.25rem] w-[208px] overflow-visible rounded-xl border border-white/10 bg-[#111214] py-1.5 text-white shadow-2xl animate-in zoom-in-95 fade-in duration-150 md:right-6 md:top-[8.45rem]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="absolute -top-1.5 right-5 h-3 w-3 rotate-45 border-l border-t border-white/10 bg-[#111214]" />
            {hasActiveShopFilters && (
              <div className="relative z-10 flex items-center justify-between border-b border-white/5 px-3 pb-1.5 pt-0.5">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">Filters</span>
                <button
                  type="button"
                  onClick={clearShopFilters}
                  className="rounded-full px-2 py-1 text-[10px] font-bold text-white/60 transition hover:bg-white/5 hover:text-white"
                >
                  Clear
                </button>
              </div>
            )}
            <div className="px-2 py-1.5">
              <button
                type="button"
                onClick={() => setIsCountryFilterOpen((value) => !value)}
                className="relative z-10 flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[11px] font-semibold transition hover:bg-white/5"
              >
                <span className="flex min-w-0 items-center gap-2">
                  {selectedFilterCountryData ? (
                    <img
                      src={`https://flagcdn.com/24x18/${selectedFilterCountryData.code}.png`}
                      alt=""
                      className="h-3.5 w-5 rounded-[2px] object-cover"
                    />
                  ) : (
                    <IonIcon name="earth-outline" className="text-base text-white/55" />
                  )}
                  <span className="truncate">{selectedFilterCountry || "Country"}</span>
                </span>
                <IonIcon name={isCountryFilterOpen ? "chevron-up" : "chevron-down"} className="text-xs text-white/50" />
              </button>
              {selectedFilterCountry && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFilterCountry("");
                    setCountryFilterSearch("");
                  }}
                  className="mt-1 w-full rounded-md px-2.5 py-1 text-left text-[10px] font-semibold text-white/45 transition hover:bg-white/5 hover:text-white"
                >
                  Clear country
                </button>
              )}

              {isCountryFilterOpen && (
                <div className="relative z-10 mt-1.5 max-h-52 overflow-hidden rounded-lg border border-white/10 bg-[#0a0a0a] shadow-xl">
                  <div className="border-b border-white/5 p-1.5">
                    <input
                      type="text"
                      value={countryFilterSearch}
                      onChange={(event) => setCountryFilterSearch(event.target.value)}
                      placeholder="Search country"
                      className="h-7 w-full rounded-md bg-white/[0.06] px-2.5 text-[10px] font-semibold text-white outline-none placeholder:text-white/35"
                    />
                  </div>
                  <div className="max-h-40 overflow-y-auto py-1">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFilterCountry("");
                        setCountryFilterSearch("");
                        setIsCountryFilterOpen(false);
                      }}
                      className="flex w-full items-center justify-between px-2.5 py-1.5 text-left text-[11px] font-medium hover:bg-white/5"
                    >
                      <span>All countries</span>
                      {!selectedFilterCountry && <IonIcon name="checkmark" className="text-lg" />}
                    </button>
                    {visibleFilterCountries.map((country) => (
                      <button
                        type="button"
                        key={country.code}
                        onClick={() => {
                          setSelectedFilterCountry(country.name);
                          setCountryFilterSearch("");
                          setIsCountryFilterOpen(false);
                        }}
                        className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[11px] font-medium hover:bg-white/5"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <img
                            src={`https://flagcdn.com/24x18/${country.code}.png`}
                            alt=""
                            className="h-3.5 w-5 shrink-0 rounded-[2px] object-cover"
                          />
                          <span className="truncate">{country.name}</span>
                        </span>
                        {selectedFilterCountry === country.name && <IonIcon name="checkmark" className="text-lg" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {hasSearchFilterText && (
              <div className="relative z-10 border-t border-white/5 py-1">
                {SHOP_SORT_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      setMarketSortOption(option.id);
                      setMarketSearchQuery(searchDraft);
                    }}
                    className="flex w-full items-center justify-between px-4 py-2 text-left text-[12px] font-medium transition hover:bg-white/5"
                  >
                    <span>{option.label}</span>
                    {marketSortOption === option.id && <IonIcon name="checkmark" className="text-xl" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sub-tabs for My Listings */}
      {activeTab === "my-products" && (
        <div className="flex flex-col gap-4 mb-8">
          <div className="flex items-center gap-2 select-none">
            <button
              className="md:hidden flex-shrink-0 w-8 h-8 flex items-center justify-center text-white bg-gray-800/40 hover:bg-gray-700/60 rounded-full border border-gray-700/50 transition-all active:scale-95 shadow-lg"
              onClick={() =>
                document
                  .getElementById("mylisting-scroll")
                  ?.scrollBy({ left: -150, behavior: "smooth" })
              }
            >
              <IonIcon name="chevron-back" className="text-lg" />
            </button>
            <div
              id="mylisting-scroll"
              className="flex-1 md:flex-none flex items-center gap-1.5 p-1 bg-white/5 rounded-2xl overflow-x-auto no-scrollbar border border-white/5 scroll-smooth"
            >
              {[
                {
                  id: "active",
                  label: "Active Products",
                  icon: "checkmark-circle",
                },
                { id: "all", label: "Your Orders", icon: "receipt", count: sellerOrderBadgeTotal },
                {
                  id: "reviewing",
                  label: products.some((p) => p.status === "rejected")
                    ? "Rejected Products"
                    : "Review Products",
                  icon: products.some((p) => p.status === "rejected")
                    ? "close-circle"
                    : "time",
                },
                { id: "deleted", label: "Inactive Products", icon: "trash" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setMyListingsTab(tab.id)}
                  className={`flex items-center justify-center gap-2 px-4 py-2 w-44 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap
                                        ${myListingsTab === tab.id
                      ? "bg-white text-black shadow-lg shadow-white/5 scale-[1.02]"
                      : "text-slate-500 hover:text-white hover:bg-white/5"
                    }`}
                >
                  <IonIcon
                    name={
                      tab.icon + (myListingsTab === tab.id ? "" : "-outline")
                    }
                    className="text-sm"
                  />
                  {tab.label}
                  <OrderBadge count={tab.count} active={myListingsTab === tab.id} />
                </button>
              ))}
            </div>
            <button
              className="md:hidden flex-shrink-0 w-8 h-8 flex items-center justify-center text-white bg-gray-800/40 hover:bg-gray-700/60 rounded-full border border-gray-700/50 transition-all active:scale-95 shadow-lg"
              onClick={() =>
                document
                  .getElementById("mylisting-scroll")
                  ?.scrollBy({ left: 150, behavior: "smooth" })
              }
            >
              <IonIcon name="chevron-forward" className="text-lg" />
            </button>
          </div>

          {/* Category Sub-tabs for "Your Products" */}
          {myListingsTab === "all" && (
            <div className="flex items-center gap-1.5 p-1 bg-white/[0.02] rounded-2xl w-full md:w-fit overflow-x-auto no-scrollbar border border-white/5">
              {[
                { id: "all", label: "All Orders", icon: "receipt" },
                { id: "processing", label: "Processing", icon: "sync" },
                { id: "shipped", label: "Shipped", icon: "airplane" },
                { id: "delivered", label: "Delivered", icon: "cube" },
                { id: "returns", label: "Returns", icon: "refresh-circle" },
              ].map((sub) => (
                <button
                  key={sub.id}
                  onClick={() => setMyListingsSubTab(sub.id)}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap
                                        ${myListingsSubTab === sub.id
                      ? "bg-white/10 text-white"
                      : "text-slate-600 hover:text-slate-400"
                    }`}
                >
                  {sub.label}
                  <OrderBadge count={orderBadgeCounts.seller[sub.id as "all" | "processing" | "shipped"]} active={myListingsSubTab === sub.id} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sub-tabs for My Orders */}
      {activeTab === "orders" && (
        <div className="flex items-center gap-2 mb-8 select-none animate-in slide-in-from-left-4 duration-500">
          <button
            className="md:hidden flex-shrink-0 w-8 h-8 flex items-center justify-center text-white bg-gray-800/40 hover:bg-gray-700/60 rounded-full border border-gray-700/50 transition-all active:scale-95 shadow-lg"
            onClick={() =>
              document
                .getElementById("myorders-scroll")
                ?.scrollBy({ left: -150, behavior: "smooth" })
            }
          >
            <IonIcon name="chevron-back" className="text-lg" />
          </button>
          <div
            id="myorders-scroll"
            className="flex-1 md:flex-none flex items-center gap-1.5 p-1 bg-white/5 rounded-2xl overflow-x-auto no-scrollbar border border-white/5 scroll-smooth"
          >
            {[
              { id: "all", label: "All Orders", icon: "receipt" },
              { id: "processing", label: "Processing", icon: "sync" },
              { id: "shipped", label: "Shipped", icon: "airplane" },
              { id: "delivered", label: "Delivered", icon: "cube" },
              { id: "returns", label: "Returns", icon: "refresh-circle" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setMyOrdersTab(tab.id)}
                className={`flex items-center justify-center gap-2 px-4 py-2 w-44 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap
                                    ${myOrdersTab === tab.id
                    ? "bg-white text-black shadow-lg shadow-white/5 scale-[1.02]"
                    : "text-slate-500 hover:text-white hover:bg-white/5"
                  }`}
              >
                <IonIcon
                  name={tab.icon + (myOrdersTab === tab.id ? "" : "-outline")}
                  className="text-sm"
                />
                {tab.label}
                <OrderBadge count={orderBadgeCounts.buyer[tab.id as "all" | "processing" | "shipped"]} active={myOrdersTab === tab.id} />
              </button>
            ))}
          </div>
          <button
            className="md:hidden flex-shrink-0 w-8 h-8 flex items-center justify-center text-white bg-gray-800/40 hover:bg-gray-700/60 rounded-full border border-gray-700/50 transition-all active:scale-95 shadow-lg"
            onClick={() =>
              document
                .getElementById("myorders-scroll")
                ?.scrollBy({ left: 150, behavior: "smooth" })
            }
          >
            <IonIcon name="chevron-forward" className="text-lg" />
          </button>
        </div>
      )}

      {/* Categories - Only visible in Market */}
      {activeTab === "market" && (
        <div className="mb-8 space-y-2 select-none">
          {/* Level 1 — Main categories */}
          <div className="flex gap-2 overflow-x-auto py-1 no-scrollbar" style={{ scrollbarWidth: "none" }}>
            <button
              onClick={() => { setSelectedCategory(""); setSelectedSubCategory(""); setSelectedLevel3(""); }}
              className={`px-4 py-2 text-xs font-bold rounded-xl whitespace-nowrap transition-all border active:scale-95 shrink-0 ${selectedCategory === "" ? "bg-white text-black border-white" : "bg-[#1a1a1a] border-white/5 hover:border-white/20 text-gray-400 hover:text-white"}`}
            >
              All
            </button>
            {categoryTree.map((cat: any, i: number) => (
              <button
                key={i}
                onClick={() => {
                  if (selectedCategory === cat.name) {
                    setSelectedCategory(""); setSelectedSubCategory(""); setSelectedLevel3("");
                  } else {
                    setSelectedCategory(cat.name); setSelectedSubCategory(""); setSelectedLevel3("");
                  }
                }}
                className={`px-4 py-2 text-xs font-bold rounded-xl whitespace-nowrap transition-all border active:scale-95 shrink-0 ${selectedCategory === cat.name ? "bg-white text-black border-white" : "bg-[#1a1a1a] border-white/5 hover:border-white/20 text-gray-400 hover:text-white"}`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Level 2 — Sub categories */}
          {(() => {
            const activeCat = categoryTree.find((c: any) => c.name === selectedCategory);
            if (!activeCat || !activeCat.children?.length) return null;
            return (
              <div className="flex gap-2 overflow-x-auto py-1 no-scrollbar" style={{ scrollbarWidth: "none" }}>
                <button
                  onClick={() => { setSelectedSubCategory(""); setSelectedLevel3(""); }}
                  className={`px-3 py-1.5 text-[11px] font-bold rounded-lg whitespace-nowrap transition-all border active:scale-95 shrink-0 ${selectedSubCategory === "" ? "bg-white/15 text-white border-white/30" : "bg-[#1a1a1a] border-white/5 hover:border-white/15 text-gray-500 hover:text-white"}`}
                >
                  All {activeCat.name}
                </button>
                {activeCat.children.map((sub: any, i: number) => (
                  <button
                    key={i}
                    onClick={() => {
                      if (selectedSubCategory === sub.name) {
                        setSelectedSubCategory(""); setSelectedLevel3("");
                      } else {
                        setSelectedSubCategory(sub.name); setSelectedLevel3("");
                      }
                    }}
                    className={`px-3 py-1.5 text-[11px] font-bold rounded-lg whitespace-nowrap transition-all border active:scale-95 shrink-0 ${selectedSubCategory === sub.name ? "bg-white/15 text-white border-white/30" : "bg-[#1a1a1a] border-white/5 hover:border-white/15 text-gray-500 hover:text-white"}`}
                  >
                    {sub.name}
                  </button>
                ))}
              </div>
            );
          })()}

          {/* Level 3 — Sub-sub categories */}
          {(() => {
            const activeCat = categoryTree.find((c: any) => c.name === selectedCategory);
            const activeSub = activeCat?.children?.find((s: any) => s.name === selectedSubCategory);
            if (!activeSub || !activeSub.children?.length) return null;
            return (
              <div className="flex gap-2 overflow-x-auto py-1 no-scrollbar" style={{ scrollbarWidth: "none" }}>
                <button
                  onClick={() => setSelectedLevel3("")}
                  className={`px-3 py-1 text-[10px] font-bold rounded-md whitespace-nowrap transition-all border active:scale-95 shrink-0 ${selectedLevel3 === "" ? "bg-white/10 text-white/80 border-white/20" : "bg-[#1a1a1a] border-white/5 hover:border-white/12 text-gray-600 hover:text-white"}`}
                >
                  All {activeSub.name}
                </button>
                {activeSub.children.map((lvl3: any, i: number) => (
                  <button
                    key={i}
                    onClick={() => setSelectedLevel3(selectedLevel3 === lvl3.name ? "" : lvl3.name)}
                    className={`px-3 py-1 text-[10px] font-bold rounded-md whitespace-nowrap transition-all border active:scale-95 shrink-0 ${selectedLevel3 === lvl3.name ? "bg-white/10 text-white/80 border-white/20" : "bg-[#1a1a1a] border-white/5 hover:border-white/12 text-gray-600 hover:text-white"}`}
                  >
                    {lvl3.name}
                  </button>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* Product Rendering */}
      {isRefreshingProducts && products.length > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/65">
          <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          Updating
        </div>
      )}

      {loading && products.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-white"></div>
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-20 text-gray-500 bg-white/[0.02] rounded-[3rem] border border-white/5 border-dashed">
          <IonIcon
            name={
              activeTab === "my-products" && myListingsTab === "reviewing"
                ? "time-outline"
                : "basket-outline"
            }
            className="text-4xl mb-3 opacity-20"
          />
          <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40">
            No items found here
          </p>
        </div>
      ) : activeTab === "market" ? (
        <div className="mb-10 space-y-7">
          {orderedMarketAlgorithmSections.length === 0 && remainingMarketplaceProducts.length === 0 ? (
            <div className="text-center py-20 text-gray-500 bg-white/[0.02] rounded-[3rem] border border-white/5 border-dashed">
              <IonIcon name="basket-outline" className="text-4xl mb-3 opacity-20" />
              <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40">
                No items found here
              </p>
            </div>
          ) : (() => {
              const rawPool = visibleMarketplaceProducts.filter((p) => !p?.is_sponsored && p?.type !== "profilePromoteCarousel");
              const pool = shuffleItemsWithSeed(rawPool, productShuffleSeed, (p) => String(p?.id ?? ""));
              return (
                <>
                  {orderedMarketAlgorithmSections.map((section, index) => {
                    // 12 products cycled from shuffled pool for this section's 3 rows
                    const sectionProducts = pool.length > 0
                      ? Array.from({ length: 12 }, (_, i) => pool[(index * 12 + i) % pool.length])
                      : [];
                    // Interleave ads every 6 products — same ads pool as topic sections
                    const interleavedItems = sectionProducts.length > 0
                      ? interleaveShopProductsWithAds(
                          sectionProducts,
                          topicSectionAds,
                          `googer-normal-row-ad-rotation-${section.id}`,
                          shopAdShuffleSeed,
                          6,
                          shopAdRotation + index,
                        )
                      : [];
                    // Pad to nearest multiple of 4 so every row is always complete
                    const remainder = interleavedItems.length % 4;
                    const sectionItems = remainder === 0 || pool.length === 0
                      ? interleavedItems
                      : [
                          ...interleavedItems,
                          ...Array.from({ length: 4 - remainder }, (_, i) =>
                            pool[(index * 12 + sectionProducts.length + i) % pool.length]
                          ),
                        ];
                    const sectionItemsWithProfileRows = insertProfilePromoteCarouselRows(sectionItems, profilePromoteAds);
                    return (
                    <Fragment key={`market-row-${section.id}`}>
                      {/* Topic section */}
                      <section className="space-y-2.5">
                        <div className="flex items-center justify-between px-1">
                          <h2 className="text-[11px] md:text-sm font-black uppercase tracking-[0.13em] text-white">
                            {section.label}
                          </h2>
                          {section.products.length > 4 && (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => document.getElementById(`market-topic-${section.id}`)?.scrollBy({ left: -520, behavior: "smooth" })}
                                className="flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition-all hover:bg-white hover:text-black active:scale-90"
                                aria-label={`Previous ${section.label}`}
                              >
                                <IonIcon name="chevron-back-outline" className="text-xs" />
                              </button>
                              <button
                                type="button"
                                onClick={() => document.getElementById(`market-topic-${section.id}`)?.scrollBy({ left: 520, behavior: "smooth" })}
                                className="flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition-all hover:bg-white hover:text-black active:scale-90"
                                aria-label={`Next ${section.label}`}
                              >
                                <IonIcon name="chevron-forward-outline" className="text-xs" />
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="relative lg:max-w-[95%]">
                          <div
                            id={`market-topic-${section.id}`}
                            className="flex snap-x snap-mandatory gap-2 overflow-x-auto scroll-smooth pb-1 pr-2 [scrollbar-width:none] [-ms-overflow-style:none]"
                            style={{ scrollbarWidth: "none" }}
                          >
                            {section.products.map((product, productIndex) => (
                              <div
                                key={`${section.id}-${product?.id || productIndex}`}
                                className="min-w-[calc(50%-0.25rem)] snap-start sm:min-w-[calc(50%-0.25rem)] lg:min-w-[calc(25%-0.95rem)]"
                              >
                                {renderMarketProductCard(product, productIndex, section.id)}
                              </div>
                            ))}
                          </div>
                        </div>
                      </section>
                      {/* Product rows with profile promote-only rows inserted in the shop cadence */}
                      {sectionItemsWithProfileRows.length > 0 && (
                        <section className="lg:max-w-[95%]">
                          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4 xl:gap-5">
                            {sectionItemsWithProfileRows.map((product, productIndex) => renderMarketProductCard(product, productIndex, `market-feed-${section.id}`))}
                          </div>
                        </section>
                      )}
                    </Fragment>
                    );
                  })}
                </>
              );
            })()}
        </div>
      ) : (activeTab === "orders" || (activeTab === "my-products" && myListingsTab === "all")) ? (
        /* Unified Grouped Layout for both Buyer and Seller Orders */
        <div className="flex flex-col gap-8 mb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
          {(() => {
            const filteredProducts = products.filter((p) => !hiddenProductIds.includes(p.id) && (!(p?.is_sponsored || p?.campaign_type) || !hiddenShopAdIds.has(getAdInteractionId(p))));

            // Build groups while preserving the order of the products array (which is DESC by created_at)
            const orderGroups: { orderNumber: string, items: any[] }[] = [];
            filteredProducts.forEach((item) => {
              const key = item.order_number || `Order-${item.id}`;
              let group = orderGroups.find(g => g.orderNumber === key);
              if (!group) {
                group = { orderNumber: key, items: [] };
                orderGroups.push(group);
              }
              group.items.push(item);
            });

            orderGroups.sort((a, b) => {
              const aLatest = Math.max(...a.items.map((item) => parseDbTimestampAsUtc(item.created_at || 0).getTime()));
              const bLatest = Math.max(...b.items.map((item) => parseDbTimestampAsUtc(item.created_at || 0).getTime()));
              const aIsBottomGroup = a.items.every((item) => item.status === 'cancelled' || item.status === 'rejected');
              const bIsBottomGroup = b.items.every((item) => item.status === 'cancelled' || item.status === 'rejected');

              if (aIsBottomGroup !== bIsBottomGroup) {
                return aIsBottomGroup ? 1 : -1;
              }

              return bLatest - aLatest;
            });

            const totalPages = Math.ceil(orderGroups.length / ordersPageSize);
            const paginatedGroups = orderGroups.slice(
              (ordersCurrentPage - 1) * ordersPageSize,
              ordersCurrentPage * ordersPageSize
            );

            if (paginatedGroups.length === 0 && products.length > 0) {
              return (
                <div className="text-center py-20 text-white/20 uppercase text-[10px] font-black tracking-widest">
                  No more orders on this page
                </div>
              );
            }

            return (
              <>
                {paginatedGroups.map(({ orderNumber, items }) => {
                  const firstItem = items[0];
                  const isAllCancelled = items.every(item => item.status === 'cancelled');
                  const isAllPending = items.every(item => item.status === 'pending');
                  const isMultiSellerOrder = new Set(items.map((item) => item.seller_id).filter(Boolean)).size > 1;
                  const footerReports = getGroupedReportDisplays(items);
                  const totalGroupPrice = items.reduce((sum, item) => {
                    const itemTotal = parseFloat(item.total_price);
                    if (!isNaN(itemTotal)) return sum + itemTotal;
                    const fallbackPrice = parseFloat(String(item.promo_price || item.price).replace(/[^\d.]/g, '')) || 0;
                    const qty = parseInt(String(item.quantity || 1)) || 1;
                    return sum + (fallbackPrice * qty);
                  }, 0);

                  // Extract delivery charge from individual item fees (summed up for the group)
                  const deliveryCharge = items.reduce((sum, item) => sum + parseFloat(item.shipping_fee || 0), 0);

                  // For older orders without shipping_fee column data, fallback to JSON metadata in the first item
                  const fallbackDeliveryCharge = deliveryCharge > 0 ? 0 : (() => {
                    try {
                      const addr = typeof firstItem.shipping_address === 'string'
                        ? JSON.parse(firstItem.shipping_address)
                        : firstItem.shipping_address;
                      return parseFloat(addr?.delivery_charge || 0);
                    } catch { return 0; }
                  })();

                  const finalTotal = Number(totalGroupPrice) + Number(deliveryCharge) + Number(fallbackDeliveryCharge);

                  return (
                    <div key={orderNumber} className="bg-white/[0.02] border border-white/5 rounded-[2.5rem] p-4 md:p-6 space-y-4">
                      {/* Group Header */}
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-2">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center text-white/40">
                            <IonIcon name="receipt-outline" className="text-xl" />
                          </div>
                          <div>
                            <h3 className="text-[11px] font-black text-white uppercase tracking-[0.2em]">{orderNumber}</h3>
                            <p className="text-[9px] text-white/30 font-bold uppercase mt-0.5">
                              {items.length} Product{items.length > 1 ? 's' : ''} • {formatOrderGroupDateTime(firstItem.created_at || Date.now())}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between md:justify-end gap-6">
                          <div className="text-right">
                            <p className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1 italic">Order Total</p>
                            <div className="flex items-baseline gap-1">
                              <span className="text-[10px] font-black text-white/40 italic">R</span>
                              <span className="text-xl font-black text-white tracking-tighter">{finalTotal.toFixed(2)}</span>
                            </div>
                          </div>
                          {activeTab === 'orders' && selectedOrderIds.some(id => items.map(i => i.id).includes(id)) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOrderToCancel('bulk');
                              }}
                              className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-[9px] font-black uppercase rounded-xl transition-all shadow-lg shadow-red-500/20 active:scale-95 animate-in fade-in zoom-in"
                            >
                              Cancel Selected
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setViewingOrderGroup(items)}
                            className="w-10 h-10 bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl flex items-center justify-center text-white/60 hover:text-blue-400 transition-all active:scale-90"
                          >
                            <IonIcon name="eye-outline" className="text-lg" />
                          </button>
                        </div>
                      </div>

                      {/* Items List */}
                      <div className="space-y-3">
                        {items.map((item) => (
                          <div
                            key={item.id}
                            className={`bg-[#1a1a1a] rounded-[1.2rem] border transition-all p-2.5 flex flex-col sm:flex-row gap-3 group relative overflow-hidden sm:items-center ${(activeTab === "orders" || myListingsTab === "all") ? "cursor-default select-none" : "cursor-pointer"} ${selectedOrderIds.includes(item.id) ? 'border-amber-500/50 bg-amber-500/[0.03]' : 'border-white/5 hover:border-white/10'}`}
                            onClick={(e) => {
                              if (activeTab === "orders" || myListingsTab === "all") return;
                              if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('input')) return;
                              e.stopPropagation();
                              setSelectedProduct(item);
                              handleLogView(item.id);
                            }}
                          >
                            {/* Multi-Select Checkbox (Only for Buyer Orders in Pending state) */}
                            {activeTab === "orders" && item.status === 'pending' && (
                              <div className="absolute top-2.5 right-2.5 sm:relative sm:top-0 sm:right-0 z-10 p-1">
                                <input
                                  type="checkbox"
                                  checked={selectedOrderIds.includes(item.id)}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    if (e.target.checked) {
                                      setSelectedOrderIds(prev => [...prev, item.id]);
                                    } else {
                                      setSelectedOrderIds(prev => prev.filter(id => id !== item.id));
                                    }
                                  }}
                                  className="w-4 h-4 rounded border-white/20 bg-black/40 text-amber-500 focus:ring-amber-500/50 focus:ring-offset-0"
                                />
                              </div>
                            )}
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              {/* Product Image */}
                              <div className="relative w-16 h-16 rounded-[1rem] overflow-hidden shrink-0 bg-black border border-white/5">
                                <Image
                                  src={normalizeMediaSrc(item.image_url || "https://picsum.photos/400/400")}
                                  alt={item.title}
                                  fill
                                  sizes="64px"
                                  quality={50}
                                  loading="lazy"
                                  placeholder="blur"
                                  blurDataURL={FEED_IMAGE_BLUR_DATA_URL}
                                  className={`object-cover transition-transform duration-500 ${activeTab === "orders" ? "" : "group-hover:scale-105"}`}
                                  unoptimized={shouldBypassNextImageOptimization(normalizeMediaSrc(item.image_url || "https://picsum.photos/400/400"))}
                                />

                                {/* Direct Status Change Button (Seller Side - Image Overlay) */}
                                {activeTab === "my-products" && myListingsTab === "all" && (item.status === 'pending' || item.status === 'processing' || item.status === 'shipped') && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const nextStatus = item.status === 'pending' ? 'processing' : item.status === 'processing' ? 'shipped' : 'delivered';
                                      handleUpdateOrderStatus(item.id, nextStatus);
                                    }}
                                    className="absolute inset-x-0 bottom-0 py-1.5 bg-blue-600/90 hover:bg-blue-500 text-white text-[8px] font-black uppercase tracking-widest backdrop-blur-sm transition-all z-20 group-hover:translate-y-0 translate-y-full flex items-center justify-center gap-1.5"
                                  >
                                    <IonIcon name={item.status === 'pending' ? 'checkmark-circle' : item.status === 'processing' ? 'paper-plane' : 'cube'} className="text-[10px]" />
                                    {item.status === 'pending' ? 'Accept Now' : item.status === 'processing' ? 'Ship Now' : 'Deliver Now'}
                                  </button>
                                )}
                              </div>

                              {/* Info Section */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 min-w-0">
                                  <h4 className="text-white text-sm font-black truncate uppercase tracking-tight group-hover:text-blue-400 transition-colors min-w-0">
                                    {item.title}
                                  </h4>
                                  {items.length > 1 && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openOrderChat([item], { item });
                                      }}
                                      className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white border border-white/10 transition-all active:scale-95 flex items-center justify-center shrink-0"
                                      aria-label={
                                        activeTab === "orders"
                                          ? `Chat with ${item.seller_username || "seller"} about ${item.title}`
                                          : `Chat with ${item.buyer_username || "buyer"} about ${item.title}`
                                      }
                                      title="Open product chat"
                                    >
                                      <IonIcon name="chatbubble-ellipses-outline" className="text-sm" />
                                    </button>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-3 mt-1.5 opacity-60">
                                  <span className="text-[8px] font-black text-white uppercase tracking-widest italic flex items-center gap-1">
                                    <IonIcon name="person-circle-outline" className="text-[10px]" />
                                    Seller:{" "}
                                    <span
                                      onClick={(e) =>
                                        navigateToProfile(
                                          e,
                                          activeTab === "orders" ? item.seller_id : item.buyer_id,
                                        )
                                      }
                                      className="cursor-pointer hover:text-blue-400 transition-colors"
                                    >
                                      {activeTab === "orders" ? `@${item.seller_username || "Anonymous"}` : `@${item.buyer_username || "Customer"}`}
                                    </span>
                                  </span>
                                  <span className="text-[8px] font-black text-white uppercase tracking-widest italic flex items-center gap-1">
                                    <IonIcon name="pricetag-outline" className="text-[10px]" />
                                    Price: R {parseFloat(item.total_price).toFixed(2)}
                                  </span>
                                  {item.color && item.color !== 'None' && (
                                    <span className="text-[8px] font-black text-white uppercase tracking-widest italic flex items-center gap-1">
                                      <IonIcon name="color-palette-outline" className="text-[10px]" />
                                      Color: {item.color}
                                    </span>
                                  )}
                                  {item.size && item.size !== 'None' && (
                                    <span className="text-[8px] font-black text-white uppercase tracking-widest italic flex items-center gap-1">
                                      <IonIcon name="resize-outline" className="text-[10px]" />
                                      Size: {item.size}
                                    </span>
                                  )}
                                  <span className="text-[8px] font-black text-white uppercase tracking-widest italic flex items-center gap-1">
                                    <IonIcon name="layers-outline" className="text-[10px]" />
                                    Qty: {item.quantity}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Product-Wise Shipping Address Disclosure */}
                            <button
                              type="button"
                              onClick={() => setViewingOrderGroup(items)}
                              className="mt-3 sm:mt-0 sm:ml-4 px-3 py-2 bg-blue-500/5 rounded-xl border border-blue-500/10 flex flex-col gap-1 min-w-0 max-w-[260px] shadow-inner text-left transition-all hover:bg-blue-500/10 hover:border-blue-400/20 active:scale-[0.99]"
                            >
                              <div className="flex items-center gap-1.5 text-[7px] font-black text-blue-400/50 uppercase tracking-widest leading-none mb-1">
                                <IonIcon name="navigate-outline" className="text-[10px]" />
                                Shipping Address
                              </div>
                              {getShippingBlueBoxLines(item.shipping_address, item).length > 0 ? (
                                <div className="space-y-1">
                                  {getShippingBlueBoxLines(item.shipping_address, item).map((line, index) => (
                                    <div
                                      key={`${item.id}-shipping-line-${index}`}
                                      className={`font-bold text-white/70 leading-tight tracking-tight ${index === 0 ? 'text-[9px] uppercase' : 'text-[8px]'}`}
                                    >
                                      {line}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-[9px] font-bold text-white/70 uppercase leading-tight tracking-tight">
                                  {getShippingAddressSummary(item.shipping_address, item.shipping_fee)}
                                </div>
                              )}
                            </button>


                            {/* Actions & Status */}
                            <div className="shrink-0 flex items-center justify-between sm:justify-end gap-3 px-1 sm:px-0">
                              <div className="flex items-center gap-2">
                                <div className="px-2 py-1 bg-white/5 rounded-lg border border-white/10">
                                  <span className={`text-[7px] font-black uppercase tracking-widest leading-none ${item.status === 'cancelled' ? 'text-red-400' :
                                    (item.status === 'processing' || item.status === 'shipped') ? 'text-emerald-400' :
                                      item.status === 'delivered' ? 'text-blue-400' :
                                        item.status === 'received' ? 'text-amber-400' :
                                          'text-white/60'
                                    }`}>
                                    {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                                  </span>
                                </div>
                                {(item.status === 'delivered' || item.status === 'received') && getDeliveredDateTimeText(item) && (
                                  <span className="text-[7px] font-black uppercase tracking-[0.12em] text-blue-300/80 whitespace-nowrap">
                                    {getDeliveredDateTimeText(item)}
                                  </span>
                                )}
                              </div>
                              {/* Seller Actions (Specific per item) */}
                              {activeTab === "my-products" && (
                                <>
                                  {(() => {
                                    const buyerReportData = parseOrderReport(item.buyer_report);
                                    const sellerReportData = parseOrderReport(item.seller_report);
                                    const buyerReportStatusTag = getOrderReportStatusTag(item, 'buyer');
                                    const sellerReportStatusTag = getOrderReportStatusTag(item, 'seller');
                                    return (
                                      <>
                                        {item.status === 'pending' && (
                                          <div className="flex items-center gap-1.5">
                                            <button
                                              onClick={(e) => { e.stopPropagation(); handleUpdateOrderStatus(item.id, 'processing'); }}
                                              className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-[8px] font-black uppercase rounded-lg transition-all active:scale-95 shadow-lg shadow-emerald-500/20"
                                            >
                                              Accept
                                            </button>
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setOrderToCancel(item);
                                              }}
                                              className="px-3 py-1.5 bg-white/5 hover:bg-red-500 text-white/40 hover:text-white text-[8px] font-black uppercase rounded-lg border border-white/5 transition-all active:scale-95"
                                            >
                                              Cancel
                                            </button>
                                          </div>
                                        )}
                                        {(item.status === 'processing' || item.status === 'shipped' || item.status === 'delivered') && (
                                          <div className="flex flex-col items-start gap-1.5">
                                            <div className="flex items-center gap-1.5">
                                              {item.status === 'processing' && (
                                                <>
                                                  <button
                                                    onClick={(e) => { e.stopPropagation(); handleUpdateOrderStatus(item.id, 'shipped'); }}
                                                    className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-[8px] font-black uppercase rounded-lg transition-all active:scale-95 shadow-lg shadow-blue-500/20"
                                                  >
                                                    Ship
                                                  </button>
                                                  <button
                                                    onClick={(e) => { e.stopPropagation(); setOrderToCancel(item); }}
                                                    className="px-3 py-1.5 bg-white/5 hover:bg-red-500 text-white/40 hover:text-white text-[8px] font-black uppercase rounded-lg border border-white/5 transition-all active:scale-95"
                                                  >
                                                    Cancel
                                                  </button>
                                                </>
                                              )}
                                              {item.status === 'shipped' && (
                                                <>
                                                  <button
                                                    onClick={(e) => { e.stopPropagation(); setOrderToDeliver(item); }}
                                                    className="px-3 py-1.5 bg-purple-500 hover:bg-purple-600 text-white text-[8px] font-black uppercase rounded-lg transition-all active:scale-95 shadow-lg shadow-purple-500/20"
                                                  >
                                                    Deliver
                                                  </button>
                                                  <button
                                                    onClick={(e) => { e.stopPropagation(); setOrderToCancel(item); }}
                                                    className="px-3 py-1.5 bg-white/5 hover:bg-red-500 text-white/40 hover:text-white text-[8px] font-black uppercase rounded-lg border border-white/5 transition-all active:scale-95"
                                                  >
                                                    Cancel
                                                  </button>
                                                </>
                                              )}
                                              {item.status === 'delivered' && (
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (item.seller_report) {
                                                      openExistingOrderReport(item, 'seller');
                                                      return;
                                                    }
                                                    setReportingOrder(item);
                                                    setReportSide('seller');
                                                  }}
                                                  className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white/60 text-[8px] font-black uppercase rounded-lg border border-white/5 transition-all active:scale-95"
                                                >
                                                  Report
                                                </button>
                                              )}
                                            </div>
                                          </div>
                                        )}
                                        {item.report_by === 'buyer' && item.report_status === 'pending' && (
                                          <div className="flex flex-col gap-2 p-2 bg-white/5 rounded-xl border border-white/5">
                                            <div className="flex items-center gap-1.5">
                                              <button
                                                onClick={(e) => { e.stopPropagation(); handleUpdateOrderStatus(item.id, 'rejected_report'); }}
                                                className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-[8px] font-black uppercase rounded-lg transition-all active:scale-95"
                                              >
                                                Reject
                                              </button>
                                              <button
                                                onClick={(e) => { e.stopPropagation(); handleUpdateOrderStatus(item.id, 'reshipped'); }}
                                                className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-[8px] font-black uppercase rounded-lg transition-all active:scale-95"
                                              >
                                                Reshipped
                                              </button>
                                            </div>
                                            <p className="text-[6px] font-bold text-white/30 uppercase tracking-[0.1em] italic">
                                              Please click this button after reshipping
                                            </p>
                                          </div>
                                        )}
                                        {(item.buyer_report || item.seller_report) && (
                                          <div className="flex flex-col items-start gap-2 mt-2">
                                            {item.buyer_report && (
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  openExistingOrderReport(item, 'buyer');
                                                }}
                                                className="text-left transition-all active:scale-[0.99]"
                                              >
                                                {buyerReportStatusTag && (
                                                  <div className={`mb-1 flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest ${buyerReportStatusTag.className}`}>
                                                    <IonIcon name={buyerReportStatusTag.icon} className="text-[10px]" />
                                                    <span>{buyerReportStatusTag.label}</span>
                                                  </div>
                                                )}
                                                <span className="block text-[9px] font-black uppercase tracking-widest text-red-500">
                                                  Reported by Buyer
                                                </span>
                                                <span className="block text-[8px] font-bold uppercase tracking-wide text-white/60">
                                                  {buyerReportData?.reason || 'General Issue'}
                                                </span>
                                              </button>
                                            )}
                                            {item.seller_report && (
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  openExistingOrderReport(item, 'seller');
                                                }}
                                                className="text-left transition-all active:scale-[0.99]"
                                              >
                                                {sellerReportStatusTag && (
                                                  <div className={`mb-1 flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest ${sellerReportStatusTag.className}`}>
                                                    <IonIcon name={sellerReportStatusTag.icon} className="text-[10px]" />
                                                    <span>{sellerReportStatusTag.label}</span>
                                                  </div>
                                                )}
                                                <span className="block text-[9px] font-black uppercase tracking-widest text-red-500">
                                                  Reported by Seller
                                                </span>
                                                <span className="block text-[8px] font-bold uppercase tracking-wide text-white/60">
                                                  {sellerReportData?.reason || 'General Issue'}
                                                </span>
                                              </button>
                                            )}
                                          </div>
                                        )}
                                      </>
                                    );
                                  })()}
                                </>
                              )}

                              {/* Buyer Actions */}
                              {activeTab === "orders" && (
                                <>
                                  {(() => {
                                    const buyerReportData = parseOrderReport(item.buyer_report);
                                    const sellerReportData = parseOrderReport(item.seller_report);
                                    const buyerReportStatusTag = getOrderReportStatusTag(item, 'buyer');
                                    const sellerReportStatusTag = getOrderReportStatusTag(item, 'seller');
                                    return (
                                      <>
                                        {item.status === 'pending' && (
                                          <button
                                            onClick={(e) => { e.stopPropagation(); setOrderToCancel(item); }}
                                            className="px-3 py-1.5 bg-white/5 hover:bg-red-500 text-white/40 hover:text-white text-[8px] font-black uppercase rounded-lg border border-white/5 transition-all active:scale-95"
                                          >
                                            Cancel
                                          </button>
                                        )}
                                        {item.status === 'delivered' && (
                                          <div className="flex items-start gap-1.5">
                                            <button
                                              onClick={(e) => { e.stopPropagation(); setOrderToReceive(item); setShowSimpleReceiveModal(true); }}
                                              className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-[8px] font-black uppercase rounded-lg transition-all active:scale-95 shadow-lg shadow-emerald-500/20"
                                            >
                                              Receive
                                            </button>
                                            <div className="flex flex-col items-start gap-1.5">
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  if (item.buyer_report) {
                                                    openExistingOrderReport(item, 'buyer');
                                                    return;
                                                  }
                                                  setReportingOrder(item);
                                                  setReportSide('buyer');
                                                }}
                                                className="px-3 py-1.5 bg-white/5 hover:bg-red-500 text-white/40 hover:text-white text-[8px] font-black uppercase rounded-lg border border-white/5 transition-all active:scale-95"
                                              >
                                                Report
                                              </button>
                                            </div>
                                          </div>
                                        )}
                                        {item.status === 'reshipped' && (
                                          <button
                                            onClick={(e) => { e.stopPropagation(); setOrderToReceive(item); setShowSimpleReceiveModal(true); }}
                                            className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-[8px] font-black uppercase rounded-lg transition-all active:scale-95 shadow-lg shadow-emerald-500/20"
                                          >
                                            Receive
                                          </button>
                                        )}
                                        {item.report_by === 'seller' && item.report_status === 'pending' && (
                                          <div className="flex flex-col gap-2 p-2 bg-white/5 rounded-xl border border-white/5">
                                            <div className="flex items-center gap-1.5">
                                              <button
                                                onClick={(e) => { e.stopPropagation(); handleUpdateOrderStatus(item.id, 'accepted_report'); }}
                                                className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-[8px] font-black uppercase rounded-lg transition-all active:scale-95"
                                              >
                                                Accept
                                              </button>
                                              <button
                                                onClick={(e) => { e.stopPropagation(); handleUpdateOrderStatus(item.id, 'rejected_report'); }}
                                                className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-[8px] font-black uppercase rounded-lg transition-all active:scale-95"
                                              >
                                                Reject
                                              </button>
                                            </div>
                                          </div>
                                        )}
                                        {(item.buyer_report || item.seller_report) && (
                                          <div className="flex flex-col items-start gap-2 mt-2">
                                            {item.buyer_report && (
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  openExistingOrderReport(item, 'buyer');
                                                }}
                                                className="text-left transition-all active:scale-[0.99]"
                                              >
                                                {buyerReportStatusTag && (
                                                  <div className={`mb-1 flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest ${buyerReportStatusTag.className}`}>
                                                    <IonIcon name={buyerReportStatusTag.icon} className="text-[10px]" />
                                                    <span>{buyerReportStatusTag.label}</span>
                                                  </div>
                                                )}
                                                <span className="block text-[9px] font-black uppercase tracking-widest text-red-500">
                                                  Reported by Buyer
                                                </span>
                                                <span className="block text-[8px] font-bold uppercase tracking-wide text-white/60">
                                                  {buyerReportData?.reason || 'General Issue'}
                                                </span>
                                              </button>
                                            )}
                                            {item.seller_report && (
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  openExistingOrderReport(item, 'seller');
                                                }}
                                                className="text-left transition-all active:scale-[0.99]"
                                              >
                                                {sellerReportStatusTag && (
                                                  <div className={`mb-1 flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest ${sellerReportStatusTag.className}`}>
                                                    <IonIcon name={sellerReportStatusTag.icon} className="text-[10px]" />
                                                    <span>{sellerReportStatusTag.label}</span>
                                                  </div>
                                                )}
                                                <span className="block text-[9px] font-black uppercase tracking-widest text-red-500">
                                                  Reported by Seller
                                                </span>
                                                <span className="block text-[8px] font-bold uppercase tracking-wide text-white/60">
                                                  {sellerReportData?.reason || 'General Issue'}
                                                </span>
                                              </button>
                                            )}
                                          </div>
                                        )}
                                      </>
                                    );
                                  })()}
                                </>
                              )}
                            </div>

                          </div>
                        ))}
                      </div>

                      {/* Group Footer (Actions) */}
                      <div className="flex items-center justify-between pt-4 border-t border-white/5 mt-2">

                        <div className="flex flex-wrap items-center justify-end gap-2 w-full sm:w-auto">
                          {/* Bulk Actions for Buyers (Removed) */}

                          {activeTab === "my-products" && (
                            <div className="flex items-center gap-2">
                              {isAllPending && (
                                <>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleUpdateOrderGroupStatus(orderNumber, 'processing');
                                    }}
                                    className="px-6 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-black uppercase rounded-xl transition-all active:scale-95 shadow-lg shadow-emerald-500/20"
                                  >
                                    Accept Order
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (confirm('Are you sure you want to cancel this ENTIRE order group?')) {
                                        handleUpdateOrderGroupStatus(orderNumber, 'cancelled');
                                      }
                                    }}
                                    className="px-6 py-2 bg-white/5 hover:bg-red-500 text-white/40 hover:text-white text-[10px] font-black uppercase rounded-xl transition-all active:scale-95 border border-white/5"
                                  >
                                    Cancel Order
                                  </button>
                                </>
                              )}
                              {!isAllCancelled && items.length === 1 && (
                                <div className="flex items-center justify-between gap-3 w-full min-w-[320px]">
                                  <span className="text-[10px] font-black text-white/20 uppercase tracking-widest bg-white/5 px-4 py-2 rounded-xl border border-white/5">
                                    Buyer Chat Available
                                  </span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openOrderChat(items);
                                    }}
                                    className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-[10px] font-black uppercase tracking-widest rounded-xl border border-white/5 transition-all active:scale-95 flex items-center gap-2"
                                  >
                                    <IonIcon name="chatbubbles-outline" className="text-sm" />
                                    Chat with Buyer
                                  </button>
                                </div>
                              )}
                              {isAllCancelled && (
                                <span className="text-[10px] font-black text-red-500/40 uppercase tracking-widest bg-red-500/5 px-4 py-2 rounded-xl border border-red-500/10">
                                  Cancelled Group
                                </span>
                              )}
                            </div>
                          )}

                          {activeTab === "orders" && (
                            <div className="flex items-center gap-2">
                              {/* Cancel Button removed from group level for buyers per new requirement - individual cancellation only */}
                              {!isAllCancelled && items.length === 1 && (
                                <div className="flex items-center justify-between gap-3 w-full min-w-[320px]">
                                  <span className="text-[10px] font-black text-white/20 uppercase tracking-widest bg-white/5 px-4 py-2 rounded-xl border border-white/5">
                                    Seller Chat Available
                                  </span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openOrderChat(items);
                                    }}
                                    className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-[10px] font-black uppercase tracking-widest rounded-xl border border-white/5 transition-all active:scale-95 flex items-center gap-2"
                                  >
                                    <IonIcon name="chatbubbles-outline" className="text-sm" />
                                    Chat with Seller
                                  </button>
                                </div>
                              )}
                              {isAllCancelled && (
                                <span className="text-[10px] font-black text-red-500/40 uppercase tracking-widest bg-red-500/5 px-4 py-2 rounded-xl border border-red-500/10">
                                  Cancelled Group
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 py-10 mt-4 border-t border-white/5">
                    <button
                      onClick={() => setOrdersCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={ordersCurrentPage === 1}
                      className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-20 active:scale-95 transition-all"
                    >
                      Prev
                    </button>
                    <div className="flex items-center gap-1">
                      {[...Array(totalPages)].map((_, i) => (
                        <button
                          key={i}
                          onClick={() => setOrdersCurrentPage(i + 1)}
                          className={`w-8 h-8 rounded-xl text-[10px] font-black transition-all active:scale-95 ${ordersCurrentPage === i + 1
                            ? 'bg-white text-black'
                            : 'bg-white/5 text-white/40 hover:bg-white/10'
                            }`}
                        >
                          {i + 1}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => setOrdersCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={ordersCurrentPage === totalPages}
                      className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-20 active:scale-95 transition-all"
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      ) : (
        /* Grid Layout for Marketplace and My Listings (Reviewing) */
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 md:gap-6 mb-10">
          {visibleMarketplaceProducts.map((product, index) => {
            if (product?.type === "profilePromoteCarousel") {
              return (
                <ProfilePromoteCarousel
                  key={product.id}
                  ads={product.ads}
                  className="col-span-2 sm:col-span-2 lg:col-span-4 px-4 py-4 transition-colors sm:px-7"
                  cardsPerView={4}
                  onProductClick={(previewProduct) => {
                    void openProductPromoteSecondView(previewProduct);
                  }}
                  onProfileClick={(profileAd) => {
                    const profileUrl = getProfileShareUrl(profileAd);
                    if (!profileUrl) return;
                    window.open(profileUrl, "_blank", "noopener,noreferrer");
                  }}
                />
              );
            }

            const isSponsoredCard = !!product.is_sponsored;
            // Product Promote ads must render exactly like a normal product card
            // (cart/buy flow, real price, variants), only with an "Ad" label.
            const isProductPromoteCard = isSponsoredCard && isProductPromoteItem(product);
            const isAdStyleCard = isSponsoredCard && !isProductPromoteCard;
            const sponsoredActiveLink = isAdStyleCard ? normalizeExternalUrl(product.active_link || "") : "";
            const sponsoredLinkPreviewType = isAdStyleCard ? getSponsoredLinkPreviewType(sponsoredActiveLink) : null;

            if (isSponsoredCard) {
              return (
                <Fragment key={`${product.id || (product.adId ? `ad-${product.adId}` : `item`)}-${index}`}>
                  <MarketItemWrapper product={product} onView={handleLogView} onImpression={handleLogImpression} activeTab={activeTab}>
                    <PromotedAdCard
                      ad={product}
                      source="shop"
                      isMenuOpen={openMenuProductId === product.id}
                      onToggleMenu={(id) => setOpenMenuProductId(openMenuProductId === id ? null : id)}
                      onCloseMenu={() => setOpenMenuProductId(null)}
                      onProductClick={(p) => {
                        if (isProductPromoteCard) {
                          void openProductPromoteSecondView(p);
                        }
                      }}
                      onAddToBagClick={(p) => {
                        if (isProductPromoteCard) {
                          void openProductPromoteSecondView(p);
                        }
                      }}
                      onOpenSecondView={() => {
                        if (isProductPromoteCard) return;
                        const kind = getSponsoredSecondViewKind(product, sponsoredLinkPreviewType);
                        setSharedAdPreviewModal({ ad: product, kind });
                        handleLogView(product.id, product);
                      }}
                      onToggleLike={handleToggleLike}
                      onOpenSheet={(type, targetAd) => openBottomSheet(type, targetAd)}
                      onShare={() => handleShareClick(product)}
                      onReport={() => setReportingProduct(product)}
                      onNotInterested={(id) => handleNotInterested(Number(id))}
                      onPromoteAgain={handlePromoteAgain}
                      onCollectCoin={(event) => handleAdCoinClick(event, product)}
                      onNavigateToProfile={(event) => navigateToProfile(event, product.user_id)}
                      canShowCollectCoin={canShowCollectCoinButton}
                      currentUser={currentUser}
                    />
                  </MarketItemWrapper>
                </Fragment>
              );
            }

            return (
              <Fragment key={`${product.id || (product.adId ? `ad-${product.adId}` : `item`)}-${index}`}>
                <MarketItemWrapper
                  product={product}
                  onView={handleLogView}
                  activeTab={activeTab}
                >
                  <SharedProductCard
                    product={product}
                    isAd={isProductPromoteCard}
                    currentUser={currentUser}
                    onProductClick={(p) => {
                      if (isProductPromoteCard) {
                        void openProductPromoteSecondView(p);
                      } else {
                        setSelectedProduct(p);
                        setSelectedVariantIndex(null);
                        setActivePreviewIndex(0);
                        handleLogView(p.id);
                      }
                    }}
                    onAddToBagClick={(p) => {
                      if (isProductPromoteCard) {
                        void openProductPromoteSecondView(p);
                      } else {
                        setSelectedProduct(p);
                        setSelectedVariantIndex(null);
                        setActivePreviewIndex(0);
                        handleLogView(p.id);
                      }
                    }}
                    onToggleLike={handleToggleLike}
                    onOpenSheet={(type, p) => openBottomSheet(type as any, p)}
                    onShare={handleShareClick}
                    onLogView={handleLogView}
                    onReport={(p) => setReportingProduct(p)}
                    onNotInterested={(id) => handleNotInterested(Number(id))}
                    onCollectCoin={(event, p) => handleAdCoinClick(event, p)}
                    canShowCollectCoin={canShowCollectCoinButton}
                    onNavigateToProfile={(event, userId) => navigateToProfile(event, userId)}
                    onEditProduct={handleEditProduct}
                    onDeleteProduct={handleDeleteProduct}
                    onPromoteProduct={handlePromoteProduct}
                    onUpdateOrderStatus={handleUpdateOrderStatus}
                    activeTab={activeTab}
                    myListingsTab={myListingsTab}
                  />
                </MarketItemWrapper>
              </Fragment>
            );
          })}
        </div>
      )}

      {activeTab === "market" && marketHasMore && (
        <div className="flex w-full justify-center pb-8 pt-2">
          <div ref={marketLoadMoreRef} className="h-4 w-4 self-center" aria-hidden="true" />
          <button
            type="button"
            onClick={loadMoreMarketProducts}
            disabled={isLoadingMoreProducts}
            className="rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-[10px] font-black uppercase tracking-[0.18em] text-white/70 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
          >
            {isLoadingMoreProducts ? "Loading..." : "See more"}
          </button>
        </div>
      )}

      <AdExpiryWarning userId={currentUser?.id} />

      {/* Ad expiry popup */}
      {showAdExpiryPopup && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="relative w-full max-w-sm rounded-[2rem] border border-white/10 bg-[#1a1614] p-6 shadow-[0_32px_80px_rgba(0,0,0,0.6)]">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-400/10 border border-orange-400/20">
              <IonIcon name="timer-outline" className="text-xl text-orange-300" />
            </div>
            <h2 className="text-base font-black tracking-tight text-white">Your ad has been removed</h2>
            <p className="mt-2 text-[12px] leading-relaxed text-white/55">
              Your Photo &amp; Video ad expired and has been removed from the feed. Get a subscription package to keep your ads running longer.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => { setShowAdExpiryPopup(false); router.push("/dashboard/wallet/subscription"); }}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-orange-400 text-[11px] font-black uppercase tracking-widest text-black transition hover:bg-orange-300 active:scale-[0.98]"
              >
                <IonIcon name="star-outline" className="text-sm" />
                Get Subscription
              </button>
              <button
                type="button"
                onClick={() => setShowAdExpiryPopup(false)}
                className="flex h-10 w-full items-center justify-center rounded-xl text-[11px] font-black uppercase tracking-widest text-white/40 transition hover:text-white/70"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Details Modal */}
      {liveSharedAdPreviewModal && (
        <SharedAdSecondViewModal
          ad={liveSharedAdPreviewModal.ad}
          kind={liveSharedAdPreviewModal.kind}
          onClose={() => setSharedAdPreviewModal(null)}
          onToggleLike={handleToggleLike}
          onOpenSheet={(type, ad) => openBottomSheet(type, ad)}
          onShare={(ad) => handleShareClick(ad)}
          onReport={(ad) => setReportingProduct(ad)}
          onNotInterested={(id) => handleNotInterested(Number(id))}
          onCollectCoin={(event, ad) => handleAdCoinClick(event, ad)}
          onNavigateToProfile={(event, ad) => navigateToProfile(event, ad.user_id)}
          canShowCollectCoin={canShowCollectCoinButton}
          requiredWatchSeconds={requiredAdWatchSeconds}
          onVideoWatchEligible={(ad, watchedSeconds) => {
            void confirmAdVideoWatchEligible(ad, watchedSeconds);
          }}
        />
      )}

      {liveSelectedProduct && (
        <ShopProductSecondViewModal
          product={liveSelectedProduct}
          activeTab={activeTab}
          myListingsTab={myListingsTab}
          currentUser={currentUser}
          justSubscribedSellerId={justSubscribedSellerId}
          onClose={closeProductModal}
          onNavigateToProfile={(event, product) => navigateToProfile(event, product.user_id)}
          showSubscribeForProduct={showSubscribeForProduct}
          getSellerId={getSellerId}
          onSubscribeSeller={handleSubscribeSeller}
          onShare={handleShareClick}
          onPromote={handlePromoteProduct}
          onEdit={handleEditProduct}
          onDelete={handleDeleteProduct}
          onReport={setReportingProduct}
          onNotInterested={(productId) => handleNotInterested(Number(productId))}
          onToggleLike={handleToggleLike}
          onLogView={(id) => handleLogView(Number(id))}
          onOpenSheet={(type, product) => {
            setInteractionProduct(product);
            openBottomSheet(type, product);
          }}
          onCollectCoin={(event, product) => handleAdCoinClick(event, product)}
          canShowCollectCoin={canShowCollectCoinButton}
          onSizeRequired={() => setNotification({ type: 'error', title: 'Size is required', message: 'Size is required' })}
          onAddToBag={(product, quantity, variant, size, country, variantIndex) => handleBuyItem(Number(product.id), product, quantity, variant, size, country, variantIndex)}
          onOrderStatusChange={async (product, status) => {
            if (status === "cancelled" && !confirm("Cancel this order and refund held funds?")) return;
            await orderService.updateStatus(product.id, status);
            setProducts((prev) => prev.map((item) => (item.id === product.id ? { ...item, status } : item)));
            setSelectedProduct(null);
          }}
        />
      )}

      {notification && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-[#1a1a1a] border border-white/10 rounded-[2rem] w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 relative">
            <button
              type="button"
              onClick={() => setNotification(null)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all active:scale-90 z-10"
              aria-label="Close"
            >
              <IonIcon name="close" className="text-base" />
            </button>
            <div className="p-8 text-center space-y-6">
              <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center border-2 ${notification.type === 'success' ? 'bg-green-500/10 border-green-500 text-green-500' : 'bg-red-500/10 border-red-500 text-red-500'}`}>
                <IonIcon name={notification.type === 'success' ? 'bag-check' : 'alert-circle'} className="text-4xl" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-white tracking-tight">{notification.title || (notification.type === 'success' ? 'Success' : 'Error')}</h3>
                <p className="text-sm text-slate-400 font-medium leading-relaxed">{notification.message}</p>
              </div>
              <button
                type="button"
                onClick={() => setNotification(null)}
                className={`w-full py-4 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all active:scale-95 shadow-lg ${notification.type === 'success' ? 'bg-green-500 text-black hover:bg-green-400' : 'bg-red-500 text-white hover:bg-red-400'}`}
              >
                {notification.type === 'success' ? 'Continue Shopping' : 'Got it'}
              </button>
            </div>
          </div>
        </div>
      )}

      {false && selectedProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-2 md:p-4 bg-black/95 backdrop-blur-xl animate-in fade-in duration-300"
          onClick={() => closeProductModal()}
        >
          <div
            className="bg-[#121212] border border-white/10 rounded-[1.2rem] md:rounded-3xl w-full max-w-[900px] shadow-2xl overflow-hidden flex flex-col md:flex-row h-full md:h-auto max-h-[92vh] md:max-h-[90vh] animate-in zoom-in-95 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Left Side: Image Gallery Area */}
            <div className="w-full md:w-[45%] relative flex flex-col shrink-0 p-2 md:p-3">

              {/* Main Preview */}
              <div className="relative flex-1 min-h-[160px] md:min-h-[350px] rounded-[1.2rem] md:rounded-[2rem] overflow-hidden border border-white/10 bg-[#0a0a0a] flex flex-col">
                {(() => {
                  const allImages = [
                    selectedProduct.image_url,
                    ...(Array.isArray(selectedProduct.variants)
                      ? selectedProduct.variants
                      : typeof selectedProduct.variants === "string"
                        ? JSON.parse(selectedProduct.variants)
                        : []
                    ).map((v: any) => v.url || v.image_url),
                  ].filter(Boolean);

                  // Remove duplicates
                  const uniqueImages = Array.from(new Set(allImages));
                  const currentImg =
                    uniqueImages[activePreviewIndex] || uniqueImages[0];

                  return (
                    <>
                      {/* Top Bar Overlay */}
                      <div className="relative w-full h-14 bg-black flex-shrink-0 rounded-t-[1.2rem] md:rounded-t-[2rem] border-b border-white/5 flex items-center justify-between px-5 z-[70] pointer-events-none">
                        <button
                          type="button"
                          className="flex items-center gap-2.5 pointer-events-auto group/profile cursor-pointer"
                          onClick={(e) => navigateToProfile(e, selectedProduct.user_id)}
                        >
                          <div className="w-8 h-8 rounded-full bg-slate-800 border border-white/10 overflow-hidden relative shadow-lg group-hover/profile:border-blue-400/60 transition-all">
                            {getItemProfilePicture(selectedProduct) ? (
                              <Image src={getItemProfilePicture(selectedProduct)} alt="Seller" fill className="object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-white/40 bg-white/5">
                                <IonIcon name="person" className="text-base" />
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col items-start">
                            <span className="mb-0.5 text-[11px] font-black uppercase leading-none tracking-tight text-white transition-colors group-hover/profile:text-blue-400">
                              {getItemUsername(selectedProduct, "Seller")}
                            </span>
                            <span className="text-[7px] font-black text-white/50 tracking-[0.2em]">
                              <RelativeTime timestamp={selectedProduct.created_at} />
                            </span>
                          </div>
                        </button>

                        <div className="flex items-center gap-3 pointer-events-auto">
                          {showSubscribeForProduct(selectedProduct) && (
                            <button
                              onClick={(e) => handleSubscribeSeller(e, selectedProduct)}
                              className="rounded-full bg-white px-4 py-1.5 text-[9px] font-black uppercase tracking-widest text-black shadow-xl transition-all hover:bg-slate-100 active:scale-95"
                            >
                              {justSubscribedSellerId === getSellerId(selectedProduct) ? "Subscribed" : "Subscribe"}
                            </button>
                          )}
                          <div className="relative flex items-center gap-1.5">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                closeProductModal();
                              }}
                              className="w-9 h-9 flex items-center justify-center text-white text-2xl transition-all active:scale-75 hover:bg-white/10 rounded-full"
                            >
                              <IonIcon name="close-outline" className="text-2xl" />
                            </button>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsMenuOpenModal(!isMenuOpenModal);
                              }}
                              className="w-9 h-9 flex items-center justify-center text-white text-2xl transition-all active:scale-75 hover:bg-white/10 rounded-full"
                            >
                              <div className="flex flex-col gap-1 p-1">
                                <div className="w-1 h-1 rounded-full bg-white shadow-lg" />
                                <div className="w-1 h-1 rounded-full bg-white shadow-lg" />
                              </div>
                            </button>

                            {/* Menu Popup */}
                            {isMenuOpenModal && (
                              <div className="absolute top-full right-0 mt-2 w-56 bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] py-2 z-[80] overflow-hidden animate-in zoom-in-95 fade-in duration-200" onClick={(e) => e.stopPropagation()}>
                                {/* Global options */}
                                <button
                                  onClick={() => { handleShareClick(selectedProduct, "resell"); setIsMenuOpenModal(false); }}
                                  className="w-full px-5 py-4 text-left text-[11px] font-bold text-white hover:bg-white/5 flex items-center gap-3 transition-colors"
                                >
                                  <IonIcon name="cash-outline" className="text-amber-500 text-lg" />
                                  Resell Commission Link
                                </button>
                                <button
                                  onClick={() => { handleShareClick(selectedProduct, "share"); setIsMenuOpenModal(false); }}
                                  className="w-full px-5 py-4 text-left text-[11px] font-bold text-white hover:bg-white/5 flex items-center gap-3 transition-colors border-t border-white/5"
                                >
                                  <IonIcon name="share-social-outline" className="text-blue-400 text-lg" />
                                  Share Link
                                </button>
                                <button
                                  onClick={() => { handlePromoteProduct(selectedProduct); setIsMenuOpenModal(false); }}
                                  className="w-full px-5 py-4 text-left text-[11px] font-bold text-white hover:bg-white/5 flex items-center gap-3 transition-colors border-t border-white/5"
                                >
                                  <IonIcon name="megaphone-outline" className="text-emerald-400 text-lg" />
                                  Promote
                                </button>

                                {/* User's own product options */}
                                {String(currentUser?.id || "") === String(selectedProduct.user_id || "") && (
                                  <>
                                    <button
                                      onClick={() => { handleEditProduct(selectedProduct); setIsMenuOpenModal(false); }}
                                      className="w-full px-5 py-4 text-left text-[11px] font-bold text-white hover:bg-white/5 flex items-center gap-3 transition-colors border-t border-white/5"
                                    >
                                      <IonIcon name="create-outline" className="text-emerald-400 text-lg" />
                                      Edit Post
                                    </button>
                                    <button
                                      onClick={() => { handleDeleteProduct(selectedProduct); setIsMenuOpenModal(false); setSelectedProduct(null); }}
                                      className="w-full px-5 py-4 text-left text-[11px] font-bold text-red-500 hover:bg-white/5 flex items-center gap-3 transition-colors border-t border-white/5"
                                    >
                                      <IonIcon name="trash-outline" className="text-lg" />
                                      Delete Post
                                    </button>
                                  </>
                                )}

                                {String(currentUser?.id || "") !== String(selectedProduct.user_id || "") && (
                                  <>
                                    <button
                                      onClick={() => { setReportingProduct(selectedProduct); setIsMenuOpenModal(false); }}
                                      className="w-full px-5 py-4 text-left text-[11px] font-bold text-white hover:bg-white/5 flex items-center gap-3 transition-colors border-t border-white/5"
                                    >
                                      <IonIcon name="alert-circle-outline" className="text-yellow-500 text-lg" />
                                      Report
                                    </button>
                                    <button
                                      onClick={() => { handleNotInterested(selectedProduct.id); setIsMenuOpenModal(false); setSelectedProduct(null); }}
                                      className="w-full px-5 py-4 text-left text-[11px] font-bold text-white hover:bg-white/5 flex items-center gap-3 transition-colors border-t border-white/5"
                                    >
                                      <IonIcon name="eye-off-outline" className="text-slate-500 text-lg" />
                                      Not Interested
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div
                        className="relative flex-1 w-full bg-[#0a0a0a] group cursor-zoom-in flex items-center justify-center"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsFullscreenPreviewOpen(true);
                        }}
                      >
                        <Image
                          src={normalizeMediaSrc(currentImg) || "https://picsum.photos/400/400"}
                          alt={selectedProduct.title}
                          fill
                          className="object-cover transition-all duration-500 group-hover:opacity-80 rounded-b-[1.2rem] md:rounded-[2rem]"
                        />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10 pointer-events-none">
                          <div className="w-14 h-14 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center border border-white/20 shadow-xl">
                            <IonIcon name="search-outline" className="text-white text-2xl" />
                          </div>
                        </div>

                        {activeTab === "market" && (
                          <div className="absolute top-1/2 -translate-y-1/2 right-4 z-[60]">
                            <div className="bg-black/20 backdrop-blur-xl border border-white/10 rounded-full py-4.5 px-2 flex flex-col items-center gap-4.5 shadow-2xl w-11">
                              <InteractionButton
                                type="likes"
                                icon="heart-outline"
                                activeIcon="heart"
                                isActive={!!selectedProduct.user_liked}
                                count={selectedProduct.likes_count}
                                color="text-white"
                                activeColor="text-white"
                                onSingleClick={() => { handleToggleLike(selectedProduct); }}
                                onLongReach={() => openBottomSheet("likes", selectedProduct)}
                                orientation="vertical"
                                iconSize="text-base md:text-xl"
                              />
                              <InteractionButton
                                type="views"
                                icon="eye-outline"
                                activeIcon="eye"
                                count={selectedProduct.views_count}
                                color="text-white"
                                activeColor="text-white"
                                onSingleClick={() => {
                                  handleLogView(selectedProduct.id);
                                  openBottomSheet("views", selectedProduct);
                                }}
                                onLongReach={() => openBottomSheet("views", selectedProduct)}
                                orientation="vertical"
                                iconSize="text-base md:text-xl"
                              />
                              <InteractionButton
                                type="comments"
                                icon="chatbubble"
                                activeIcon="chatbubble"
                                count={selectedProduct.comments_count}
                                color="text-white"
                                activeColor="text-white"
                                onSingleClick={() => {
                                  setInteractionProduct(selectedProduct);
                                  openBottomSheet("comments", selectedProduct);
                                }}
                                onLongReach={() => openBottomSheet("comments", selectedProduct)}
                                orientation="vertical"
                                iconSize="text-base md:text-xl"
                              />
                              <InteractionButton
                                type="shares"
                                icon="share-social"
                                activeIcon="share-social"
                                count={selectedProduct.shares_count || 0}
                                color="text-white"
                                activeColor="text-white"
                                onSingleClick={() => handleShareClick(selectedProduct)}
                                onLongReach={() => openBottomSheet("shares", selectedProduct)}
                                orientation="vertical"
                                iconSize="text-sm md:text-lg opacity-90"
                              />
                            </div>
                          </div>
                        )}

                        {/* Product Discount Badge */}
                        {(() => {
                          const comm = typeof selectedProduct.commission_info === "string" ? JSON.parse(selectedProduct.commission_info) : selectedProduct.commission_info;
                          const discount = comm?.discount;
                          if (discount && parseFloat(discount) > 0) {
                            return (
                              <div className="absolute bottom-4 right-4 z-20">
                                <div className="px-3 py-1 bg-green-500/10 backdrop-blur-md border border-green-500/20 rounded-lg shadow-xl shadow-green-500/10">
                                  <span className="text-[10px] md:text-sm font-black text-green-500 tracking-tighter">
                                    +{discount}%
                                  </span>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Thumbnails */}
              <div className="p-3 md:p-4 bg-transparent rounded-b-[1.2rem] md:rounded-b-[2rem] border-t border-white/5 overflow-x-auto no-scrollbar flex gap-2">
                {(() => {
                  const allImages = [
                    selectedProduct.image_url,
                    ...(Array.isArray(selectedProduct.variants)
                      ? selectedProduct.variants.map(
                        (v: any) => v.url || v.image_url,
                      )
                      : []),
                  ].filter(Boolean);
                  const uniqueImages = Array.from(new Set(allImages));

                  return uniqueImages.map((img: any, idx) => (
                    <div
                      key={idx}
                      onClick={() => {
                        setActivePreviewIndex(idx);
                        const productVariants = typeof selectedProduct.variants === "string" ? JSON.parse(selectedProduct.variants) : selectedProduct.variants || [];
                        const variantIdx = productVariants.findIndex((v: any) => (v.image_url || v.url) === img);
                        if (variantIdx !== -1) {
                          setSelectedVariantIndex(variantIdx);
                        } else {
                          setSelectedVariantIndex(null);
                        }
                      }}
                      className={`relative w-12 h-12 md:w-16 md:h-16 rounded-lg md:rounded-xl overflow-hidden cursor-pointer border-2 transition-all shrink-0 ${activePreviewIndex === idx ? "border-white scale-105 shadow-lg shadow-black/40" : "border-transparent opacity-50 hover:opacity-100"}`}
                    >
                      <Image
                        src={normalizeMediaSrc(img) || "https://picsum.photos/400/400"}
                        alt="Thumb"
                        fill
                        className="object-cover"
                      />
                    </div>
                  ))
                })()}
              </div>
            </div>

            {/* Right Side: Details */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                {(() => {
                  const isReviewMode = activeTab === "my-products" && myListingsTab === "reviewing";
                  const productVariants = typeof selectedProduct.variants === "string" ? JSON.parse(selectedProduct.variants) : selectedProduct.variants || [];
                  const commissionInfo = typeof selectedProduct.commission_info === "string" ? JSON.parse(selectedProduct.commission_info) : selectedProduct.commission_info;

                  return (
                    <div className="space-y-0 px-4 md:px-7 py-2 animate-in fade-in slide-in-from-bottom-4 duration-500">
                      {isReviewMode && (
                        <div className="mb-4 flex items-center justify-between">
                          <h2 className="text-xl font-black text-white uppercase tracking-tight">Product Review</h2>
                          <div className="px-3 py-1 bg-blue-500/10 rounded-full border border-blue-500/20">
                            <span className="text-[8px] font-black text-blue-400 uppercase tracking-widest">Awaiting Approval</span>
                          </div>
                        </div>
                      )}

                      {/* Order Reference Section (IF ORDER) */}
                      {selectedProduct.order_number && (
                        <div className="mb-6 p-4 bg-white/5 rounded-[1.5rem] border border-white/5 flex items-center justify-between shadow-inner">
                          <div className="flex flex-col gap-0.5">
                            <p className="text-[7px] font-black text-white/30 uppercase tracking-[0.2em] italic leading-none">Order Reference</p>
                            <p className="text-sm font-black text-white tracking-widest">#{selectedProduct.order_number}</p>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(selectedProduct.order_number);
                              alert('Order ID Copied: ' + selectedProduct.order_number);
                            }}
                            className="p-3 bg-white/5 rounded-xl text-white/40 hover:text-white hover:bg-white/10 transition-all border border-white/5 active:scale-95"
                            title="Copy Order ID"
                          >
                            <IonIcon name="copy-outline" className="text-sm" />
                          </button>
                        </div>
                      )}

                      {/* Product Title + Size/Subtitle */}
                      <div className="mb-3">
                        <h2 className="overflow-hidden text-[24px] md:text-[28px] font-black text-white tracking-tight leading-tight mb-1.5 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] break-words">
                          {selectedProduct.title}
                        </h2>
                        <div className="flex flex-wrap items-center gap-y-1">
                          <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">
                            {selectedProduct.category || "General"}
                          </span>
                        </div>
                      </div>

                      {/* Commissions Section (ONLY IN REVIEW MODE) */}
                      {isReviewMode && (
                        <div className="mb-6 space-y-3">
                          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50 px-1">COMMISSION & PRICING</p>
                          <div className="grid grid-cols-3 gap-3">
                            <div className="bg-[#151515] rounded-2xl border border-white/5 p-4 flex flex-col items-center justify-center gap-1.5 shadow-inner">
                              <IonIcon name="logo-google" className="text-red-500 text-lg mb-1" />
                              <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest">Googer Fee</span>
                              <span className="text-sm font-black text-white">{commissionInfo?.googer_commission || 0}%</span>
                            </div>
                            <div className="bg-[#151515] rounded-2xl border border-white/5 p-4 flex flex-col items-center justify-center gap-1.5 shadow-inner">
                              <IonIcon name="people-outline" className="text-blue-500 text-lg mb-1" />
                              <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest">Reseller</span>
                              <span className="text-sm font-black text-white">{commissionInfo?.resell_percentage || 0}%</span>
                            </div>
                            <div className="bg-[#151515] rounded-2xl border border-white/5 p-4 flex flex-col items-center justify-center gap-1.5 shadow-inner">
                              <IonIcon name="copy-outline" className="text-emerald-500 text-lg mb-1" />
                              <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest">Discount</span>
                              <span className="text-sm font-black text-white">{commissionInfo?.discount || 0}%</span>
                            </div>
                          </div>
                        </div>
                      )}


                      {/* Description Section */}
                      {selectedProduct.description && (
                        <div className="mb-5 px-1 w-full overflow-hidden">
                          <p className="w-full bg-slate-800/50 border border-white/10 rounded-xl px-3 py-2.5 md:py-3 text-xs text-white whitespace-pre-wrap break-words max-h-[180px] overflow-y-auto overflow-x-hidden custom-scrollbar leading-relaxed">
                            {renderDescription(selectedProduct.description, router)}
                          </p>
                        </div>
                      )}

                      {/* Price & Quantity Section */}
                      <div className="mb-5 px-1">
                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50 mb-2">RUPIEER</p>
                        <div className="flex flex-wrap items-center gap-4 rounded-[1.5rem] border border-white/10 bg-white/[0.03] px-4 py-3 shadow-inner">
                          <div className="flex items-center gap-2.5 shrink-0">
                            <span className="text-[22px] font-black text-white leading-none">•</span>
                            <div className="flex flex-col">
                              {(() => {
                                const activeVariant =
                                  (productVariants && productVariants[selectedVariantIndex ?? 0]) || selectedProduct;

                                const price = parseFloat(activeVariant?.promo_price || activeVariant?.price || selectedProduct.promo_price || selectedProduct.price || 0);
                                const mainPrice = parseFloat(activeVariant?.price || selectedProduct.price || 0);
                                const hasPromo = price < mainPrice;

                                return (
                                  <>
                                    <span className="text-[26px] md:text-[30px] font-black text-white tracking-tighter leading-none">
                                      {price.toFixed(2)}
                                    </span>
                                    {hasPromo && (
                                      <span className="text-[10px] font-black text-red-500 line-through tracking-widest mt-0.5 ml-0.5 opacity-80">
                                        R {mainPrice.toFixed(2)}
                                      </span>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          </div>

                          {(() => {
                            const activeVar = productVariants[selectedVariantIndex ?? 0] || selectedProduct;
                            const selections = activeVar?.selections || [];
                            const activeSelection = selections.find((s: any) => s.value === selectedSize);
                            const currentVariantStock = activeSelection
                              ? (parseInt(activeSelection.stock) || 0)
                              : (activeVar?.stock ? (parseInt(activeVar.stock) || 0) : (parseInt(selectedProduct.stock) || 0));

                            return !isReviewMode ? (
                              <div className="flex items-center gap-3 shrink-0">
                                <div className="flex flex-col items-end mr-1">
                                  <span className="text-[7px] font-black uppercase tracking-[0.2em] text-slate-500">QTY</span>
                                  <span className={`text-[6px] font-black uppercase tracking-widest mt-0.5 ${currentVariantStock <= 0 ? 'text-red-500' : 'text-blue-400'}`}>
                                    {currentVariantStock > 0 ? `${currentVariantStock} IN STOCK` : 'OUT OF STOCK'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-0 border border-white/20 rounded-full overflow-hidden h-8 bg-black/20">
                                  <button
                                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                                    className="w-9 h-full flex items-center justify-center text-white hover:bg-white/10 transition-all text-base font-bold"
                                  >
                                    -
                                  </button>
                                  <span className="w-7 text-center text-[10px] font-black text-white select-none">
                                    {quantity}
                                  </span>
                                  <button
                                    onClick={() => {
                                      if (quantity < currentVariantStock) {
                                        setQuantity(quantity + 1);
                                      }
                                    }}
                                    disabled={quantity >= currentVariantStock || currentVariantStock <= 0}
                                    className={`w-9 h-full flex items-center justify-center text-white transition-all text-base font-bold ${quantity >= currentVariantStock || currentVariantStock <= 0 ? 'opacity-20 cursor-not-allowed' : 'hover:bg-white/10'}`}
                                  >
                                    +
                                  </button>
                                </div>
                              </div>
                            ) : null;
                          })()}
                        </div>
                      </div>

                      {/* Select Color Section */}
                      {productVariants.length > 0 && (
                        <div className="mb-6 space-y-3">
                          <div className="flex items-center justify-between px-1">
                            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">AVAILABLE COLORS</span>
                            <span className="text-[8px] font-black text-white/40 uppercase tracking-widest">
                              {selectedVariantIndex !== null ? productVariants[selectedVariantIndex ?? 0]?.color : "Standard"}
                            </span>
                          </div>
                          <div className="flex gap-2.5 overflow-x-auto no-scrollbar py-1.5">
                            {productVariants.map((variant: any, idx: number) => (
                              <div key={idx} className="flex flex-col items-center gap-1.5 shrink-0">
                                <button
                                  onClick={() => {
                                    setSelectedVariantIndex(idx);
                                    const allImages = [
                                      selectedProduct.image_url,
                                      ...(Array.isArray(selectedProduct.variants) ? selectedProduct.variants : typeof selectedProduct.variants === "string" ? JSON.parse(selectedProduct.variants) : []).map((v: any) => v.url || v.image_url)
                                    ].filter(Boolean);
                                    const uniqueImages = Array.from(new Set(allImages));
                                    const variantImg = variant.url || variant.image_url || variant.image;
                                    const imgIndex = uniqueImages.indexOf(variantImg);
                                    if (imgIndex !== -1) {
                                      setActivePreviewIndex(imgIndex);
                                    } else {
                                      setActivePreviewIndex(0);
                                    }
                                  }}
                                  className={`relative w-10 h-10 md:w-11 md:h-11 rounded-[14px] border-2 transition-all overflow-hidden shadow-lg ${selectedVariantIndex === idx ? "border-white scale-105 bg-white/10" : "border-white/10 bg-transparent hover:border-white/20"}`}
                                >
                                  {variant.image_url || variant.url || variant.image ? (
                                    <Image
                                      src={normalizeMediaSrc(variant.image_url || variant.url || variant.image)}
                                      alt=""
                                      fill
                                      className="object-cover"
                                    />
                                  ) : (
                                    <div
                                      className="w-full h-full"
                                      style={{ backgroundColor: variant.color_hex || "#333" }}
                                    />
                                  )}
                                  {selectedVariantIndex === idx && (
                                    <div className="absolute inset-0 bg-white/5 backdrop-blur-[0.5px] flex items-center justify-center">
                                      <IonIcon name="checkmark-circle" className="text-white text-base" />
                                    </div>
                                  )}
                                </button>
                                <span className={`text-[7px] font-black uppercase tracking-widest transition-colors ${selectedVariantIndex === idx ? "text-white" : "text-slate-600"}`}>
                                  {variant.color || variant.description || "Style"}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}


                      {/* Horizontal Rule removed */}
                      <div className="mb-2" />

                      {/* Summary List Table */}
                      <div className="space-y-1">
                        {/* Quantity Row with UOM Context - Only for non-market categories */}
                        {activeTab !== 'market' && (
                          <div className="flex items-center justify-between py-2 px-1">
                            <span className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-500">QUANTITY</span>
                            <span className="text-[9px] font-black text-white uppercase tracking-tighter">
                              {quantity} {(() => {
                                const activeVar = productVariants[selectedVariantIndex ?? 0] || selectedProduct;
                                const selections = activeVar?.selections || [];
                                const activeSelection = selections.find((s: any) => s.value === selectedSize);
                                return activeSelection?.uom || activeVar?.uom || selectedProduct.uom || selectedProduct.unit || "PCS";
                              })()}
                            </span>
                          </div>
                        )}

                        {(() => {
                          const activeVariant = productVariants[selectedVariantIndex ?? 0] || selectedProduct;
                          const selections = activeVariant?.selections || [];
                          const extractedSizes = selections.map((s: any) => s.value).filter(Boolean);

                          let sizeList: string[] = [];
                          const sizeOptions = typeof selectedProduct.sizes === "string"
                            ? (selectedProduct.sizes.trim() ? JSON.parse(selectedProduct.sizes) : [])
                            : (Array.isArray(selectedProduct.sizes) ? selectedProduct.sizes : []);

                          if (extractedSizes.length > 0) {
                            sizeList = extractedSizes;
                          } else if (sizeOptions.length > 0) {
                            sizeList = sizeOptions.map((s: any) => typeof s === 'string' ? s : s.value).filter(Boolean);
                          } else {
                            const legacySizes = productVariants
                              .map((v: any) => v.size || v.selection)
                              .filter((s: any) => s && s !== 'None' && s !== 'Default' && s !== 'Standard');

                            if (legacySizes.length > 0) {
                              sizeList = Array.from(new Set(legacySizes));
                            }
                          }

                          if (sizeList.length === 0) return null;

                          // Get details for the selected size
                          const activeSelection = selections.find((s: any) => s.value === selectedSize);
                          const selectedSizeDisplay = activeSelection?.detail ? `${selectedSize} (${activeSelection.detail})` : selectedSize;

                          return (
                            <div className="flex items-center justify-between py-3 px-1 border-t border-white/5">
                              <span className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-500">SIZES</span>
                              <div className="relative min-w-[150px] max-w-[260px] w-auto flex-1 md:flex-none">
                                <button
                                  onClick={() => {
                                    setIsSizeDropdownOpen(!isSizeDropdownOpen);
                                    if (!isSizeDropdownOpen) setIsColorDropdownOpen(false);
                                  }}
                                  className="w-full bg-white text-black border border-white/20 rounded-full px-4 py-2 flex items-center justify-between shadow-lg hover:bg-slate-100 active:scale-95 group transition-all"
                                >
                                  <span className="text-[10px] font-medium uppercase tracking-[0.1em] truncate relative top-[0.5px] pl-1">
                                    {selectedSize ? selectedSizeDisplay : "Sizes"}
                                  </span>
                                  <div className={`flex items-center justify-center transition-transform duration-300 ${isSizeDropdownOpen ? "rotate-180" : ""}`}>
                                    <IonIcon
                                      name="chevron-down"
                                      className="text-black text-[9px]"
                                    />
                                  </div>
                                </button>

                                {isSizeDropdownOpen && (
                                  <div className="absolute top-full mt-2.5 right-0 w-full min-w-[140px] bg-[#1A1A1A] border border-white/10 rounded-xl p-1.5 shadow-2xl z-[200] animate-in slide-in-from-top-2 fade-in duration-300 backdrop-blur-xl">
                                    <div className="flex flex-col gap-0.5 max-h-[250px] overflow-y-auto custom-scrollbar">
                                      {sizeList.filter(s => s !== 'None' && s !== 'Default' && s !== 'Standard').map((size: string) => {
                                        const trimmedSize = size.trim();
                                        const normalizedSize = trimmedSize.toLowerCase();
                                        const sel = selections.find((s: any) => s.value.trim().toLowerCase() === normalizedSize);
                                        const activeColor = selectedVariantIndex !== null && productVariants[selectedVariantIndex ?? 0] ? productVariants[selectedVariantIndex ?? 0].color : (productVariants[0]?.color);
                                        const foundLegacyVariant = productVariants.find((v: any) =>
                                          (v.size?.trim().toLowerCase() === normalizedSize || v.selection?.trim().toLowerCase() === normalizedSize) &&
                                          (activeColor && activeColor !== 'None' && activeColor !== 'Default' ? v.color === activeColor : true)
                                        );

                                        let availableCount = 0;
                                        let isOutOfStock = true;

                                        if (sel) {
                                          availableCount = parseInt(sel.stock) || 0;
                                          isOutOfStock = availableCount <= 0;
                                        } else if (foundLegacyVariant) {
                                          availableCount = parseInt(foundLegacyVariant.stock || foundLegacyVariant.quantity) || 0;
                                          isOutOfStock = availableCount <= 0;
                                        } else {
                                          availableCount = parseInt(selectedProduct.stock) || 0;
                                          isOutOfStock = availableCount <= 0;
                                        }

                                        return (
                                          <button
                                            key={size}
                                            disabled={isOutOfStock}
                                            onClick={() => {
                                              if (!isOutOfStock) {
                                                setSelectedSize(trimmedSize);
                                                if (quantity > availableCount) {
                                                  setQuantity(Math.max(1, availableCount));
                                                }
                                                setIsSizeDropdownOpen(false);
                                              }
                                            }}
                                            className={`w-full py-3 px-5 rounded-xl text-[10px] font-medium uppercase tracking-wider text-left transition-all flex items-center justify-between ${isOutOfStock ? "opacity-30 cursor-not-allowed text-white/50" : (selectedSize === trimmedSize ? "bg-white text-black" : "text-white/80 hover:bg-white/10 hover:text-white")}`}
                                          >
                                            <span className="truncate">{sel?.detail ? `${trimmedSize} (${sel.detail})` : `${trimmedSize} (${availableCount})`}</span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })()}

                        {/* Available Colors Dropdown under Sizes - High Fidelity (100% Match with Sizes) */}
                        {productVariants.length > 0 && (
                          <div className="flex items-center justify-between py-3 px-1 border-t border-white/5">
                            <span className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-500">AVAILABLE COLORS</span>
                            <div className="relative min-w-[150px] max-w-[260px] w-auto flex-1 md:flex-none">
                              <button
                                onClick={() => {
                                  setIsColorDropdownOpen(!isColorDropdownOpen);
                                  if (!isColorDropdownOpen) setIsSizeDropdownOpen(false);
                                }}
                                className="w-full bg-white text-black border border-white/20 rounded-full px-4 py-2 flex items-center justify-between shadow-lg hover:bg-slate-100 active:scale-95 group transition-all"
                              >
                                <span className="text-[10px] font-medium uppercase tracking-[0.1em] truncate relative top-[0.5px] pl-1">
                                  {selectedVariantIndex !== null ? (productVariants[selectedVariantIndex ?? 0]?.color || "Standard") : "Colors"}
                                </span>
                                <div className={`flex items-center justify-center transition-transform duration-300 ${isColorDropdownOpen ? "rotate-180" : ""}`}>
                                  <IonIcon name="chevron-down" className="text-black text-[9px]" />
                                </div>
                              </button>

                              {isColorDropdownOpen && (
                                <div className="absolute top-full mt-2.5 right-0 w-full min-w-[140px] bg-[#1A1A1A] border border-white/10 rounded-xl p-1.5 shadow-2xl z-[200] animate-in slide-in-from-top-2 fade-in duration-300 backdrop-blur-xl">
                                  <div className="flex flex-col gap-0.5 max-h-[250px] overflow-y-auto custom-scrollbar">
                                    {productVariants.map((variant: any, idx: number) => {
                                      const isSelected = selectedVariantIndex === idx;
                                      const variantColor = variant.color || variant.description || `Style ${idx + 1}`;
                                      const availableCount = variant.stock || "In Stock";
                                      return (
                                        <button
                                          key={idx}
                                          onClick={() => {
                                            setSelectedVariantIndex(idx);
                                            setIsColorDropdownOpen(false);
                                          }}
                                          className={`w-full py-3 px-5 rounded-xl text-[10px] font-medium uppercase tracking-wider text-left transition-all flex items-center justify-between ${isSelected ? "bg-white text-black" : "text-white/80 hover:bg-white/10 hover:text-white"}`}
                                        >
                                          <div className="flex flex-col">
                                            <span>{variantColor}</span>
                                            <span className="text-[7px] text-blue-400 font-black tracking-widest mt-0.5">{availableCount} AVAILABLE</span>
                                          </div>
                                          {isSelected && <IonIcon name="checkmark" className="text-black text-xs" />}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {(() => {
                          const standardized = parseShippingData(selectedProduct);
                          if (!standardized || standardized.length === 0) return null;

                          return (
                            <div className="flex items-center justify-between py-3 px-1 border-t border-white/5">
                              <span className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-500">DELIVERY TIME</span>
                              <span className="text-[9px] font-black text-white uppercase tracking-tighter text-right">
                                {(() => {
                                  const defaultCountry = standardized[0]?.country || "Worldwide";
                                  const currentCountry = selectedShippingCountry || defaultCountry;
                                  const countryData = standardized.find((c: any) => c.country === currentCountry) || standardized[0];
                                  return getDeliveryDateText(countryData?.days);
                                })()}
                              </span>
                            </div>
                          );
                        })()}

                        {/* Status/Actions Footer Transition */}


                        {/* High-Fidelity Logistics Grid (Fixed Height boxes) */}
                        <div className="py-2.5 px-0.5 grid grid-cols-2 gap-2">
                          {/* Returns Box (Selection style) */}
                          <div className="flex flex-col gap-1 px-4 py-2 bg-white/[0.03] border border-white/10 rounded-xl shadow-lg justify-center">
                            <span className="text-[7px] font-black uppercase text-slate-500 tracking-wider">RETURNS & WARRANTY</span>
                            <div className="text-[10px] font-black text-white uppercase tracking-tighter leading-tight">
                              {(() => {
                                try {
                                  const rInfoRaw = selectedProduct.return_policy || selectedProduct.return_data || selectedProduct.return_info;
                                  const rInfo = typeof rInfoRaw === "string" ? JSON.parse(rInfoRaw) : rInfoRaw;

                                  const wInfoRaw = selectedProduct.warranty_info || selectedProduct.warranty_data;
                                  const wInfo = typeof wInfoRaw === "string" ? JSON.parse(wInfoRaw) : wInfoRaw;

                                  const retText = rInfo?.text || rInfo?.return_days || rInfo?.policy || "14 Days Return";
                                  const ret = retText.toUpperCase().includes('RETURN') ? retText : `${retText} Return`;

                                  const war = wInfo?.warranty === 'Custom' ? wInfo?.custom : (wInfo?.warranty || wInfo?.status || 'No Warranty');

                                  return (
                                    <div className="flex flex-col gap-0.5 mt-0.5">
                                      <span className="mb-0">{ret.toUpperCase()}</span>
                                      <span className="text-[9px] text-white/50 bg-white/5 w-fit px-1.5 py-[1px] rounded uppercase">{war}</span>
                                    </div>
                                  );
                                } catch {
                                  return (
                                    <div className="flex flex-col gap-0.5 mt-0.5">
                                      <span className="mb-0">14 DAYS RETURN</span>
                                      <span className="text-[9px] text-white/50 bg-white/5 w-fit px-1.5 py-[1px] rounded uppercase">NO WARRANTY</span>
                                    </div>
                                  );
                                }
                              })()}
                            </div>
                          </div>

                          {/* Ships To Box (ONLY FOR BUYERS) */}
                          {!isReviewMode && (
                            <div className="flex flex-col gap-0.5">
                              <div className="flex flex-col gap-1 px-4 py-2 bg-white border border-white/20 rounded-xl shadow-2xl relative justify-center">
                                <span className="text-[7px] font-black uppercase text-black/40 tracking-wider mb-0.5">SHIPS TO</span>
                                <ShippingSection
                                  product={selectedProduct}
                                  selectedCountry={selectedShippingCountry}
                                  onCountryChange={setSelectedShippingCountry}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Add to Bag - Centered Minimalist */}
                      {!isReviewMode && (
                        <div className="pt-4 flex justify-center">
                          <button
                            onClick={() => handleBuyItem(selectedProduct.id)}
                            className="text-white text-[11px] md:text-[13px] font-black uppercase tracking-[0.4em] hover:opacity-80 transition-opacity active:scale-95"
                          >
                            ADD TO BAG
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Fixed Footer for Product Detail Modal - Refined to seamless transparent state */}
              <div className="p-3 md:px-7 md:py-4 border-t border-white/5 bg-transparent mt-auto flex items-center justify-between">
                {activeTab === "my-products" && myListingsTab === "all" && selectedProduct.status ? (
                  /* Seller Order Management Buttons in Popup */
                  <div className="flex-1 flex gap-3">
                    {selectedProduct.status === "pending" && (
                      <>
                        <button
                          onClick={async () => {
                            try {
                              await orderService.updateStatus(selectedProduct.id, "processing");
                              setProducts(prev => prev.map(p => p.id === selectedProduct.id ? { ...p, status: 'processing' } : p));
                              setSelectedProduct(null);
                            } catch (err) { alert('Failed to approve'); }
                          }}
                          className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl active:scale-95"
                        >
                          Approve Order
                        </button>
                        <button
                          onClick={async () => {
                            if (!confirm('Cancel this order and refund held funds?')) return;
                            try {
                              await orderService.updateStatus(selectedProduct.id, "cancelled");
                              setProducts(prev => prev.map(p => p.id === selectedProduct.id ? { ...p, status: 'cancelled' } : p));
                              setSelectedProduct(null);
                            } catch (err) { alert('Failed to cancel'); }
                          }}
                          className="flex-1 py-3 bg-red-600/20 text-red-500 border border-red-500/20 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] active:scale-95"
                        >
                          Cancel Order
                        </button>
                      </>
                    )}
                    {selectedProduct.status === "processing" && (
                      <button
                        onClick={async () => {
                          try {
                            await orderService.updateStatus(selectedProduct.id, "shipped");
                            setProducts(prev => prev.map(p => p.id === selectedProduct.id ? { ...p, status: 'shipped' } : p));
                            setSelectedProduct(null);
                          } catch (err) { alert('Failed to ship'); }
                        }}
                        className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl active:scale-95"
                      >
                        Mark as Shipped
                      </button>
                    )}
                    {selectedProduct.status === "shipped" && (
                      <button
                        onClick={async () => {
                          try {
                            await orderService.updateStatus(selectedProduct.id, "delivered");
                            setProducts(prev => prev.map(p => p.id === selectedProduct.id ? { ...p, status: 'delivered' } : p));
                            setSelectedProduct(null);
                          } catch (err) { alert('Failed to deliver'); }
                        }}
                        className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl active:scale-95"
                      >
                        Mark as Delivered
                      </button>
                    )}
                    {selectedProduct.status === "cancelled" && (
                      <div className="flex-1 py-3 bg-white/5 text-slate-500 text-center rounded-xl font-black text-[10px] uppercase tracking-[0.2em]">
                        Order Cancelled & Refunded
                      </div>
                    )}
                    {selectedProduct.status === "received" && (
                      <div className="flex-1 py-3 bg-emerald-500/10 text-emerald-500 text-center rounded-xl font-black text-[10px] uppercase tracking-[0.2em]">
                        Order Completed
                      </div>
                    )}
                  </div>
                ) : activeTab === "my-products" && myListingsTab === "reviewing" ? (
                  <div className="flex-1 flex gap-3">
                    <button
                      onClick={() => {
                        handleEditProduct(selectedProduct);
                        setSelectedProduct(null);
                      }}
                      className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-black text-[10px] uppercase tracking-[0.2em] transition-all shadow-xl hover:bg-blue-500 active:scale-95"
                    >
                      Edit Product
                    </button>
                    <button
                      onClick={() => handleDeleteProduct(selectedProduct)}
                      className="flex-1 py-3 bg-red-600/20 text-red-500 border border-red-500/20 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] transition-all hover:bg-red-600/30 active:scale-95"
                    >
                      Delete
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="text-[10px] font-black text-white uppercase tracking-[0.3em]">RUPIEER</span>
                    <span className="text-[19px] font-black text-white tracking-widest leading-none">
                      {(parseFloat(selectedProduct.promo_price || selectedProduct.price || 0) * quantity).toFixed(2)}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Share Modal */}
      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        title={shareProduct?.title || "Check out this product"}
        url={shareProduct ? getShareUrlForItem(shareProduct) : ""}
        description={shareProduct?.description}
        product={shareProduct}
        initialView={initialShareView}
        onCopyLink={async () => {
          if (!shareProduct?.id) return;
          await handleLogShare(shareProduct.id);
        }}
      />

      {/* Interaction Bottom Sheet */}
      <InteractionBottomSheet
        isOpen={isBottomSheetOpen}
        onClose={() => {
          setIsBottomSheetOpen(false);
          setInteractionProduct(null);
        }}
        type={bottomSheetType}
        product={interactionProduct}
        data={bottomSheetData}
        onAddComment={handleSendComment}
        onDeleteComment={async (commentId) => {
          try {
            await handleDeleteComment(commentId);
            if (interactionProduct) {
              const data = await marketService.getComments(interactionProduct.id);
              setBottomSheetData(data);
            }
          } catch (err) { console.error("Could not delete comment."); }
        }}
        onLikeComment={async (commentId) => {
          try {
            await marketService.likeComment(Number(commentId));
            if (interactionProduct) {
              const data = await marketService.getComments(interactionProduct.id);
              setBottomSheetData(data);
            }
          } catch (err) { console.error("Could not like comment."); }
        }}
        onDislikeComment={async (commentId) => {
          try {
            await marketService.dislikeComment(Number(commentId));
            if (interactionProduct) {
              const data = await marketService.getComments(interactionProduct.id);
              setBottomSheetData(data);
            }
          } catch (err) { console.error("Could not dislike comment."); }
        }}
        onReportComment={async (commentId) => {
          try {
            await marketService.reportComment(Number(commentId));
            addTopbarNotification({ type: "success", title: "Reported", message: "Comment has been reported for review." });
          } catch (e: any) {
            const msg = e?.message || "";
            addTopbarNotification({ type: "info", title: msg.includes("Already") ? "Already Reported" : "Error", message: msg.includes("Already") ? "You have already reported this comment." : "Could not submit report." });
          }
        }}
        onRefresh={refreshInteractionComments}
        currentUser={currentUser}
        isLoading={isBottomSheetLoading}
        onTabChange={(newType) => {
          if (interactionProduct) {
            openBottomSheet(newType, interactionProduct);
          }
        }}
        onAction={(action) => {
          const targetProd = interactionProduct || selectedProduct;
          if (!targetProd) return;

          if (action === "star") handleToggleLike(targetProd);
          if (
            action === "upload" ||
            action === "forward" ||
            action === "share"
          ) {
            setShareProduct(targetProd);
            setShowShareModal(true);
          }
          if (action === "trash") {
            handleDeleteProduct(targetProd);
          }
        }}
      />

      {pendingAdCoinProduct && (
        <div
          className="fixed inset-0 z-[260] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setPendingAdCoinProduct(null)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-[2rem] border border-white/10 bg-[#111214] shadow-[0_30px_90px_rgba(0,0,0,0.45)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-white/8 px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-yellow-500 text-lg font-black text-black shadow-[0_10px_24px_rgba(250,204,21,0.35)]">
                  R
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">
                    Collect Ad Coin
                  </h3>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/40">
                    One-time warning
                  </p>
                </div>
              </div>
            </div>

            <div className="px-6 py-5">
              <p className="text-sm font-semibold leading-6 text-white/78">
                If you collect this coin, you will not be able to unlike this ad later.
              </p>

              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setPendingAdCoinProduct(null)}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-white/70 transition hover:bg-white/10 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      localStorage.setItem(`googer-ad-coin-warning-${currentUser?.id}`, "1");
                    }
                    collectAdCoin(pendingAdCoinProduct);
                  }}
                  className="rounded-full bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-black transition hover:bg-slate-200 active:scale-95"
                >
                  Collect
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Report Modal */}
      {reportingProduct && (
        <div
          className="fixed inset-0 z-[250] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => { if (!reportSubmitting) { setReportingProduct(null); setReportReason(""); setReportDetail(""); setReportSubmitted(false); setReportError(""); } }}
        >
          <div
            className="w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-[#211d1a] shadow-[0_30px_90px_rgba(0,0,0,0.48)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-white/8 px-5 py-4">
              <div className="flex items-center gap-2">
                <IonIcon name="alert-circle-outline" className="text-lg text-yellow-500" />
                <h3 className="text-[13px] font-black uppercase tracking-[0.14em] text-white">Report Post</h3>
              </div>
              <p className="mt-1.5 text-[11px] font-medium text-white/50">
                Help us understand what&apos;s wrong with this post.
              </p>
            </div>

            {reportSubmitted ? (
              <div className="flex flex-col items-center gap-3 px-5 py-8">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                  <IonIcon name="checkmark-circle" className="text-2xl" />
                </div>
                <p className="text-[12px] font-bold text-white/70">Report submitted. Thank you.</p>
              </div>
            ) : (
              <div className="px-5 py-4">
                <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.1em] text-white/40">Select a reason</p>
                <div className="grid gap-2">
                  {["Spam or misleading", "Harassment or bullying", "Hate speech or graphic", "Inappropriate content", "Other"].map((reason) => (
                    <button
                      key={reason}
                      type="button"
                      onClick={() => setReportReason(reason)}
                      className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 text-left text-[11px] font-bold transition-all ${reportReason === reason ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-400" : "border-white/8 bg-white/[0.03] text-white/70 hover:border-white/15 hover:bg-white/[0.06]"}`}
                    >
                      <div className={`h-3.5 w-3.5 shrink-0 rounded-full border-2 transition-all ${reportReason === reason ? "border-yellow-400 bg-yellow-400" : "border-white/30"}`} />
                      {reason}
                    </button>
                  ))}
                </div>

                <textarea
                  value={reportDetail}
                  onChange={(e) => setReportDetail(e.target.value)}
                  placeholder="Additional details (optional)"
                  rows={2}
                  className="mt-3 w-full resize-none rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5 text-[11px] font-medium text-white placeholder:text-white/25 outline-none focus:border-white/20 transition-colors"
                />

                {reportError && (
                  <p className="mt-3 text-[11px] font-bold text-red-400">{reportError}</p>
                )}

                <div className="mt-4 flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => { setReportingProduct(null); setReportReason(""); setReportDetail(""); setReportError(""); }}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-white/70 transition hover:bg-white/10"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReportSubmit(reportingProduct.id)}
                    disabled={!reportReason || reportSubmitting}
                    className="rounded-full bg-yellow-500 px-4 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-black transition hover:bg-yellow-400 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {reportSubmitting ? "Submitting..." : "Submit"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
          <div className="absolute inset-0" onClick={() => setShowDeleteConfirm(false)} />
          <div className="relative bg-[#0a0a0a] border border-white/10 rounded-[2.5rem] p-10 w-full max-w-sm text-center shadow-3xl animate-in zoom-in-95 duration-300">
            <div className="w-20 h-20 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <IonIcon name="trash-outline" className="text-4xl text-red-500" />
            </div>
            <h3 className="text-xl font-black text-white uppercase tracking-wider mb-2 italic">Are you sure?</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-relaxed mb-10 px-4">
              Do you really want to delete this product? This action cannot be undone.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={confirmDelete}
                className="w-full py-4 bg-red-600 hover:bg-red-500 text-white text-[11px] font-black uppercase tracking-[0.2em] rounded-2xl transition-all shadow-lg active:scale-95"
              >
                Delete Product
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="w-full py-4 bg-white/5 hover:bg-white/10 text-white text-[11px] font-black uppercase tracking-[0.2em] rounded-2xl transition-all border border-white/10"
              >
                Go Back
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Image Preview */}
      {isFullscreenPreviewOpen && selectedProduct && (
        <div
          className="fixed inset-0 z-[400] flex items-center justify-center bg-black/95 backdrop-blur-xl animate-in fade-in duration-300"
          onClick={() => setIsFullscreenPreviewOpen(false)}
        >
          <button
            onClick={() => setIsFullscreenPreviewOpen(false)}
            className="absolute top-6 right-6 w-12 h-12 flex items-center justify-center text-white bg-white/10 hover:bg-white/20 rounded-full transition-all z-50 shadow-2xl active:scale-95"
          >
            <IonIcon name="close-outline" className="text-3xl" />
          </button>
          {(() => {
            const allImages = [
              selectedProduct.image_url,
              ...(Array.isArray(selectedProduct.variants)
                ? selectedProduct.variants
                : typeof selectedProduct.variants === "string"
                  ? JSON.parse(selectedProduct.variants)
                  : []
              ).map((v: any) => v.url || v.image_url),
            ].filter(Boolean);
            const uniqueImages = Array.from(new Set(allImages));
            const currentImg = uniqueImages[activePreviewIndex] || uniqueImages[0];

            return (
              <div className="relative w-full h-full p-4 md:p-12 flex items-center justify-center pointer-events-none">
                {uniqueImages.length > 1 && (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActivePreviewIndex((prev) => (prev - 1 + uniqueImages.length) % uniqueImages.length);
                      }}
                      className="absolute left-4 md:left-12 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center text-white bg-white/10 hover:bg-white/20 rounded-full transition-all z-50 pointer-events-auto backdrop-blur-md active:scale-95 shadow-xl"
                    >
                      <IonIcon name="chevron-back-outline" className="text-2xl" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActivePreviewIndex((prev) => (prev + 1) % uniqueImages.length);
                      }}
                      className="absolute right-4 md:right-12 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center text-white bg-white/10 hover:bg-white/20 rounded-full transition-all z-50 pointer-events-auto backdrop-blur-md active:scale-95 shadow-xl"
                    >
                      <IonIcon name="chevron-forward-outline" className="text-2xl" />
                    </button>
                  </>
                )}
                <div className="relative w-72 h-72 md:w-[500px] md:h-[500px] max-w-[90vw] max-h-[70vh] flex items-center justify-center pointer-events-auto shadow-2xl rounded-[3rem] overflow-hidden border border-white/10" onClick={(e) => e.stopPropagation()}>
                  <Image
                    src={normalizeMediaSrc(currentImg) || "https://picsum.photos/400/400"}
                    alt="Preview"
                    fill
                    className="object-cover transition-all duration-300"
                  />
                </div>
              </div>
            );
          })()}
        </div>
      )}
      {/* Order Details Modal (Group View) */}
      {viewingOrderGroup && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl animate-in fade-in duration-300" onClick={() => setViewingOrderGroup(null)}>
          <div className="bg-[#121212] border border-white/10 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[85vh] relative animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <div>
                <h2 className="text-white text-lg font-black uppercase tracking-widest">Order Summary</h2>
                <p className="text-[9px] text-white/40 font-black uppercase tracking-widest mt-1">Order #{viewingOrderGroup[0]?.order_number}</p>
              </div>
              <button onClick={() => setViewingOrderGroup(null)} className="w-8 h-8 flex items-center justify-center bg-white/5 hover:bg-white/10 text-white/40 hover:text-white rounded-full transition-all">
                <IonIcon name="close" className="text-lg" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
              {/* Products List */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-2">Purchased Items ({viewingOrderGroup.length})</h4>
                {viewingOrderGroup.map((orderItem: any) => (
                  <div key={orderItem.id} className="flex items-center gap-4 bg-[#1a1a1a] p-3 rounded-2xl border border-white/5">
                    <div className="w-14 h-14 rounded-xl overflow-hidden bg-black relative shrink-0">
                      <Image src={normalizeMediaSrc(orderItem.image_url) || "https://picsum.photos/400/400"} alt="Item" fill className="object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-[11px] font-black text-white uppercase truncate">{orderItem.title}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">Qty: {orderItem.quantity}</span>
                        {orderItem.size && orderItem.size !== 'None' && (
                          <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest">• {orderItem.size}</span>
                        )}
                        {orderItem.color && orderItem.color !== 'None' && (
                          <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest">• {orderItem.color}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] font-black text-white">R {parseFloat(orderItem.total_price || orderItem.price || 0).toFixed(2)}</div>
                      <div className="text-[8px] font-black text-white/30 italic">+ R {parseFloat(orderItem.shipping_fee || 0).toFixed(2)} Delivery</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Transaction Summary */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-2">Transaction Details</h4>
                <div className="bg-[#1a1a1a] rounded-2xl border border-white/5 p-4 space-y-3">
                  {(() => {
                    try {
                      const metadata = typeof viewingOrderGroup[0].shipping_address === 'string'
                        ? JSON.parse(viewingOrderGroup[0].shipping_address)
                        : viewingOrderGroup[0].shipping_address;

                      const subtotal = Number(metadata?.items_subtotal || viewingOrderGroup.reduce((acc: number, i: any) => acc + parseFloat(i.total_price || 0), 0));
                      const discount = Number(metadata?.total_discount || 0);

                      // Calculate delivery from DB column (summed) with JSON fallback
                      const delivery = Number(viewingOrderGroup.reduce((sum: number, item: any) => sum + parseFloat(item.shipping_fee || 0), 0)
                        || parseFloat(metadata?.delivery_charge || 0));

                      const final = Number(subtotal) + Number(delivery);
                      const showSellerCompletedFees =
                        activeTab === "my-products" &&
                        myListingsTab === "all" &&
                        viewingOrderGroup.every((item: any) => ["delivered", "received", "completed"].includes(String(item.status || "").toLowerCase()));
                      const sellerFees = showSellerCompletedFees ? summarizeSellerOrderFees(viewingOrderGroup) : null;

                      return (
                        <>
                          <div className="flex justify-between items-center text-[10px] uppercase font-black tracking-wider">
                            <span className="text-white/40">Items Subtotal</span>
                            <span className="text-white">R {subtotal.toFixed(2)}</span>
                          </div>
                          {discount > 0 && (
                            <div className="flex justify-between items-center text-[10px] uppercase font-black tracking-wider text-emerald-500">
                              <span>Product Discount</span>
                              <span>- R {discount.toFixed(2)}</span>
                            </div>
                          )}
                          <div className="flex justify-between items-center text-[10px] uppercase font-black tracking-wider border-t border-white/5 pt-2">
                            <span className="text-white/40">Delivery Charge</span>
                            <span className="text-white">R {delivery.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between items-center text-[10px] uppercase font-black tracking-wider border-t border-white/5 pt-2 mb-1">
                            <span className="text-white/40">Payment Method</span>
                            <span className="text-amber-400">
                              {(() => {
                                const method = viewingOrderGroup[0]?.payment_method || 'wallet';
                                if (method === 'wallet') return 'Googer Wallet';
                                if (method === 'wallet_manual') return 'Wallet Manual';
                                if (method === 'cod') return 'Cash on Delivery';
                                return method.replace(/_/g, ' ').split(' ').map((s: string) => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
                              })()}
                            </span>
                          </div>
                          <div className="flex justify-between items-center border-t border-white/5 pt-3">
                            <span className="text-xs font-black text-white/30 uppercase tracking-[0.2em]">Grand Total</span>
                            <span className="text-lg font-black text-white tracking-tighter italic">
                              R {final.toFixed(2)}
                            </span>
                          </div>
                          {sellerFees && (
                            <div className="border-t border-white/5 pt-3 space-y-2">
                              <div className="flex justify-between items-center text-[10px] uppercase font-black tracking-wider">
                                <span className="text-white/40">Googer Fees - {sellerFees.googerPercentLabel}</span>
                                <span className="text-red-400">- R {sellerFees.googerFee.toFixed(2)}</span>
                              </div>
                              {sellerFees.hasProductDiscount && (
                                <div className="flex justify-between items-center text-[10px] uppercase font-black tracking-wider">
                                  <span className="text-white/40">Product Discount - {sellerFees.discountPercentLabel}</span>
                                  <span className="text-emerald-400">- R {sellerFees.productDiscount.toFixed(2)}</span>
                                </div>
                              )}
                              {sellerFees.hasResaleCommission && (
                                <div className="flex justify-between items-center text-[10px] uppercase font-black tracking-wider">
                                  <span className="text-white/40">Resale Commission - {sellerFees.resalePercentLabel}</span>
                                  <span className="text-amber-400">- R {sellerFees.resaleCommission.toFixed(2)}</span>
                                </div>
                              )}
                              <div className="flex justify-between items-center border-t border-white/5 pt-2">
                                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em]">Your Item Balance</span>
                                <span className="text-base font-black text-emerald-400 tracking-tighter italic">
                                  R {sellerFees.actualBalance.toFixed(2)}
                                </span>
                              </div>
                            </div>
                          )}
                        </>
                      );
                    } catch (e) {
                      return (
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-white/50 font-bold">Grand Total</span>
                          <span className="text-lg font-black text-amber-400">
                            R {viewingOrderGroup.reduce((acc: number, item: any) => acc + parseFloat(item.total_price || item.price || 0), 0).toFixed(2)}
                          </span>
                        </div>
                      );
                    }
                  })()}
                </div>
              </div>

              {/* Shipping Address */}
              {viewingOrderGroup[0]?.shipping_address && viewingOrderGroup[0]?.shipping_address !== "null" && (
                <div className="space-y-3 pb-4">
                  <h4 className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-2">Shipping Information</h4>
                  <div className="bg-[#1a1a1a] rounded-2xl border border-white/5 p-3 text-[10px] font-medium text-white/70 leading-relaxed shadow-inner">
                    {(() => {
                      try {
                        const addr = parseShippingAddressPayload(viewingOrderGroup[0].shipping_address);
                        if (!addr) return "No address provided";

                        const combinedRows = [
                          { label: 'First Name', value: addr.firstName || null },
                          { label: 'Last Name', value: addr.lastName || null },
                          { label: 'Phone Numbers', value: getShippingPhonesLine(addr) },
                          { label: 'Address', value: getShippingFullAddress(addr) },
                        ].filter((entry) => entry.value);

                        return (
                          <div className="rounded-[1.15rem] border border-white/8 bg-black/20 p-3 space-y-2">
                            <div className="flex items-center justify-between border-b border-white/5 pb-2">
                              <span className="text-[8px] font-black text-blue-400 uppercase tracking-[0.2em]">Shipping Details</span>
                              <IonIcon name="location-outline" className="text-sm text-blue-400/70" />
                            </div>
                            {combinedRows.length > 0 ? combinedRows.map((entry) => (
                              <div key={entry.label} className="space-y-0.5">
                                <div className="text-[7px] font-black text-white/20 uppercase tracking-[0.18em]">
                                  {entry.label}
                                </div>
                                <div className="text-[10px] font-bold text-white/80 whitespace-pre-wrap break-words leading-snug">
                                  {entry.value}
                                </div>
                              </div>
                            )) : (
                              <div className="text-[10px] font-bold text-white/40">No shipping details available</div>
                            )}
                          </div>
                        );
                      } catch (e) { return viewingOrderGroup[0].shipping_address; }
                    })()}
                  </div>
                </div>
              )}


              {/* Order Confirmation Footer for Buyers (Wait for Receipt) */}
              {activeTab === "orders" && viewingOrderGroup.every((item: any) => item.status === 'delivered') && (
                <div className="flex flex-col gap-3 p-6 border-t border-white/5 bg-black/20">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      // Process all items in this group as received
                      const orderNumber = viewingOrderGroup[0]?.order_number;
                      if (orderNumber) {
                        handleUpdateOrderGroupStatus(orderNumber, 'received');
                        setViewingOrderGroup(null);
                      }
                    }}
                    className="w-full py-4 bg-emerald-600 hover:bg-emerald-600 text-white text-[11px] font-black uppercase rounded-2xl transition-all shadow-xl active:scale-95"
                  >
                    Confirm & Release Pay
                  </button>
                  <button
                    onClick={() => setViewingOrderGroup(null)}
                    className="w-full py-4 bg-white/5 hover:bg-white/10 text-white text-[11px] font-black uppercase rounded-2xl transition-all border border-white/10"
                  >
                    Cancel / Back
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {chatSidebar.isOpen && chatSidebar.participant && (
        <div className="fixed inset-0 z-[1750] pointer-events-none">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[1px] pointer-events-auto"
            onClick={closeOrderChat}
          />
          <div className="absolute right-0 top-0 h-full w-full max-w-[320px] pointer-events-auto bg-[#050505] border-l border-white/10 shadow-2xl flex flex-col">
            <div className="px-4 py-3 border-b border-white/10 bg-black/60">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative w-10 h-10 rounded-xl overflow-hidden bg-white/5 border border-white/10 shrink-0">
                    <Image
                      src={getProfileImageSrc(chatSidebar.participant.profile_picture, chatSidebar.participant.name)}
                      alt={chatSidebar.participant.name}
                      fill
                      className="object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-black text-white uppercase tracking-[0.18em] truncate">
                      {chatSidebar.participant.name}
                    </div>
                    <div className="text-[7px] font-black text-white/30 uppercase tracking-widest mt-0.5">
                      Chat with {chatSidebar.participant.roleLabel}
                    </div>
                    {chatSidebar.contextLabel && (
                      <div className="text-[7px] font-black text-blue-300/70 uppercase tracking-widest mt-1 truncate">
                        {chatSidebar.contextLabel}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleStartChatCall("voice")}
                    className={`w-8 h-8 rounded-xl border transition-all flex items-center justify-center ${chatCallMode === "voice" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-white/5 hover:bg-white/10 text-white/70 border-white/10"}`}
                  >
                    <IonIcon name="call-outline" className="text-sm" />
                  </button>
                  <button
                    onClick={() => handleStartChatCall("video")}
                    className={`w-8 h-8 rounded-xl border transition-all flex items-center justify-center ${chatCallMode === "video" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-white/5 hover:bg-white/10 text-white/70 border-white/10"}`}
                  >
                    <IonIcon name="videocam-outline" className="text-sm" />
                  </button>
                  <button
                    onClick={closeOrderChat}
                    className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 border border-white/10 transition-all flex items-center justify-center"
                  >
                    <IonIcon name="close-outline" className="text-lg" />
                  </button>
                </div>
              </div>

              {chatCallMode && (
                <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[7px] font-black uppercase tracking-widest">
                  <IonIcon name={chatCallMode === "voice" ? "call-outline" : "videocam-outline"} className="text-[10px]" />
                  {chatCallMode === "voice" ? "Voice Call Active" : "Video Call Active"}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.08),_transparent_40%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))]">
              {chatMessages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-center px-6">
                  <div>
                    <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 mx-auto mb-3 flex items-center justify-center text-white/30">
                      <IonIcon name="chatbubbles-outline" className="text-2xl" />
                    </div>
                    <p className="text-[9px] font-black text-white/25 uppercase tracking-widest">
                      {chatSidebar.contextLabel
                        ? `${chatSidebar.contextLabel} with ${chatSidebar.participant.name}`
                        : `Start chatting with ${chatSidebar.participant.name}`}
                    </p>
                  </div>
                </div>
              ) : (
                chatMessages.map((message) => {
                  const isMine = String(message.sender_id) === String(currentUser?.id);
                  return (
                    <div
                      key={message.id}
                      className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                    >
                      <div className={`max-w-[85%] rounded-[1.25rem] px-3 py-2.5 border ${message.type === "call"
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                        : isMine
                          ? "bg-blue-500/15 border-blue-500/20 text-white"
                          : "bg-white/5 border-white/10 text-white/80"
                        }`}>
                        <div className="text-[6px] font-black uppercase tracking-widest opacity-50 mb-1">
                          {isMine ? "You" : chatSidebar.participant.name}
                        </div>
                        {message.type === "text" && (
                          <p className="text-[10px] leading-relaxed break-words">{message.text}</p>
                        )}
                        {message.type === "call" && (
                          <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest">
                            <IonIcon name={message.call_mode === "voice" ? "call-outline" : "videocam-outline"} className="text-sm" />
                            <span>{message.text}</span>
                          </div>
                        )}
                        {message.type === "image" && (
                          <div className="space-y-2">
                            <div className="relative w-36 h-36 rounded-xl overflow-hidden bg-black/40">
                              <Image
                                src={message.image_url}
                                alt={message.file_name || "Chat image"}
                                fill
                                className="object-cover"
                              />
                            </div>
                            <div className="text-[7px] font-black uppercase tracking-widest opacity-50">
                              {message.file_name || "Image"}
                            </div>
                          </div>
                        )}
                        <div className="text-[6px] font-black uppercase tracking-widest opacity-30 mt-1.5">
                          {new Date(message.created_at || Date.now()).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-3 border-t border-white/10 bg-black/70">
              <input
                ref={chatImageInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleSelectChatImages}
              />
              {isUploadingChatAttachments && (
                <div className="mb-2 text-[8px] font-black uppercase tracking-widest text-blue-300">
                  Uploading...
                </div>
              )}
              <div className="flex items-end gap-2">
                <button
                  onClick={() => chatImageInputRef.current?.click()}
                  className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 border border-white/10 transition-all flex items-center justify-center shrink-0"
                >
                  <IonIcon name="add-outline" className="text-lg" />
                </button>
                <div className="flex-1 rounded-[1.25rem] bg-white/5 border border-white/10 px-3 py-2.5">
                  {pendingChatAttachments.length > 0 && (
                    <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-2">
                      {pendingChatAttachments.map((attachment) => (
                        <div
                          key={attachment.id}
                          className="relative w-12 h-12 rounded-xl overflow-hidden border border-white/10 bg-black/30 shrink-0"
                        >
                          <Image
                            src={attachment.image_url}
                            alt={attachment.file_name || "Attachment"}
                            fill
                            className="object-cover"
                          />
                          <button
                            onClick={() =>
                              setPendingChatAttachments((prev) =>
                                prev.filter((item) => String(item.id) !== String(attachment.id))
                              )
                            }
                            className="absolute top-1 right-1 w-4 h-4 rounded-full bg-black/70 text-white/80 flex items-center justify-center"
                          >
                            <IonIcon name="close-outline" className="text-[10px]" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <textarea
                    value={chatMessageInput}
                    onChange={(e) => setChatMessageInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendChatMessage();
                      }
                    }}
                    rows={1}
                    placeholder={
                      chatSidebar.contextLabel
                        ? `Message ${chatSidebar.participant.name} about this item`
                        : `Message ${chatSidebar.participant.name}`
                    }
                    className="w-full bg-transparent resize-none outline-none text-[10px] text-white placeholder:text-white/20"
                  />
                  <div className="mt-1.5 text-[6px] font-black uppercase tracking-widest text-white/20">
                    Images up to 3 MB each
                  </div>
                </div>
                <button
                  onClick={handleSendChatMessage}
                  className="px-3 h-9 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[8px] font-black uppercase tracking-widest transition-all shrink-0"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Cancellation Confirmation Modal */}
      {(() => {
        if (!orderToCancel) return null;

        const targetItems = orderToCancel === 'bulk'
          ? products.filter(p => selectedOrderIds.includes(p.id))
          : [orderToCancel];

        const breakdown = targetItems.reduce((acc, item) => {
          const price = parseFloat(item.total_price || item.price || 0);
          let fee = parseFloat(item.shipping_fee || 0);

          // Legacy Fallback: If this item has no fee, but the whole group metadata has one 
          // and we can determine this is the "primary" item that should hold it.
          // For simplicity: If we are cancelling a single item, and it has 0 fee, 
          // but it's the only active item in the group or first in the group, we check metadata.
          if (fee <= 0 && targetItems.length === 1) {
            try {
              const addr = typeof item.shipping_address === 'string' ? JSON.parse(item.shipping_address) : item.shipping_address;
              const metaFee = parseFloat(addr?.delivery_charge || 0);
              if (metaFee > 0) {
                // Check if other items in this group ALREADY have fees assigned in DB
                const siblings = products.filter(p => p.order_number === item.order_number && p.id !== item.id);
                const sumSiblingFees = siblings.reduce((sum, s) => sum + parseFloat(s.shipping_fee || 0), 0);

                // If no siblings have fees, then this item (or the first one we check) gets the metadata fee
                if (sumSiblingFees <= 0) {
                  const firstItemId = products.filter(p => p.order_number === item.order_number).sort((a, b) => a.id - b.id)[0]?.id;
                  if (item.id === firstItemId) {
                    fee = metaFee;
                  }
                }
              }
            } catch (e) { }
          }

          return {
            subtotal: acc.subtotal + price,
            shipping: acc.shipping + fee
          };
        }, { subtotal: 0, shipping: 0 });

        const totalRefund = breakdown.subtotal + breakdown.shipping;

        return (
          <div className="fixed inset-0 z-[1500] flex items-center justify-center p-6 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
            <div className="absolute inset-0" onClick={() => setOrderToCancel(null)} />
            <div className="relative bg-[#0a0a0a] border border-white/10 rounded-[2.5rem] p-10 w-full max-w-sm text-center shadow-3xl animate-in zoom-in-95 duration-300">
              <div className="w-20 h-20 bg-amber-500/10 border border-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <IonIcon name="alert-circle-outline" className="text-4xl text-amber-500" />
              </div>

              <h3 className="text-xl font-black text-white uppercase tracking-wider mb-2 italic">
                Cancel {orderToCancel === 'bulk' ? `${targetItems.length} Products` : 'Order'}?
              </h3>

              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-relaxed mb-6 px-4">
                You are cancelling {orderToCancel === 'bulk' ? 'selected items' : 'this product'}.
              </p>

              {/* Precise Refund Info Box - ONLY FOR BUYERS */}
              {activeTab === 'orders' && (
                <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-[2rem] p-6 mb-8 shadow-inner space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest text-white/30">
                      <span>Products Subtotal</span>
                      <span className="text-white/60">R {breakdown.subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest text-white/30">
                      <span>Delivery Refund</span>
                      <span className="text-emerald-500/60">R {breakdown.shipping.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-emerald-500/10">
                    <div className="text-[8px] font-black text-emerald-500/60 uppercase tracking-widest mb-1.5 leading-none text-center">
                      Total Refund Amount
                    </div>
                    <div className="flex items-baseline justify-center gap-1">
                      <span className="text-[10px] font-black text-white/40 italic">R</span>
                      <span className="text-3xl font-black text-white tracking-tighter">{totalRefund.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="text-[7px] font-bold text-white/20 uppercase mt-2 text-center tracking-tighter">
                    Full amount will be returned to your wallet
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-3">
                <button
                  onClick={() => {
                    if (orderToCancel === 'bulk') {
                      handleBulkCancel();
                    } else {
                      handleUpdateOrderStatus(orderToCancel.id, 'cancelled');
                      setOrderToCancel(null);
                    }
                  }}
                  className="w-full py-4 bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-black uppercase rounded-2xl transition-all shadow-lg active:scale-95"
                >
                  Confirm Cancel
                </button>
                <button
                  onClick={() => setOrderToCancel(null)}
                  className="w-full py-4 bg-white/5 hover:bg-white/10 text-white text-[11px] font-black uppercase rounded-2xl transition-all border border-white/10"
                >
                  Close / Back
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Delivery Confirmation Modal */}
      {orderToDeliver && (
        <div className="fixed inset-0 z-[1600] flex items-center justify-center p-6 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
          <div className="absolute inset-0" onClick={() => setOrderToDeliver(null)} />
          <div className="relative bg-[#0a0a0a] border border-white/10 rounded-[2.5rem] p-10 w-full max-w-sm text-center shadow-3xl animate-in zoom-in-95 duration-300">
            <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <IonIcon name="cube-outline" className="text-4xl text-emerald-500" />
            </div>

            <h3 className="text-xl font-black text-white uppercase tracking-wider mb-2 italic">
              Item Delivered?
            </h3>

            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-relaxed mb-8 px-4">
              Are you sure you want to mark <span className="text-white">"{orderToDeliver.title}"</span> as delivered? This will notify the buyer.
            </p>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  handleUpdateOrderStatus(orderToDeliver.id, 'delivered');
                  setOrderToDeliver(null);
                }}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black uppercase rounded-2xl transition-all shadow-lg active:scale-95"
              >
                Yes, Delivered
              </button>
              <button
                onClick={() => setOrderToDeliver(null)}
                className="w-full py-4 bg-white/5 hover:bg-white/10 text-white text-[11px] font-black uppercase rounded-2xl transition-all border border-white/10"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Simple Receive Confirmation Modal */}
      {showSimpleReceiveModal && orderToReceive && (
        <div className="fixed inset-0 z-[1700] flex items-center justify-center p-6 bg-black/95 backdrop-blur-md animate-in fade-in duration-300">
          <div className="absolute inset-0" onClick={() => setShowSimpleReceiveModal(false)} />
          <div className="relative bg-[#0a0a0a] border border-white/10 rounded-[2.5rem] p-10 w-full max-w-sm text-center shadow-3xl animate-in zoom-in-95 duration-300">
            <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <IonIcon name="cube-outline" className="text-4xl text-emerald-500" />
            </div>

            <h3 className="text-xl font-black text-white uppercase tracking-wider mb-2 italic">
              Confirm Receipt
            </h3>

            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-relaxed mb-8 px-4">
              I have received my order and am satisfied with the items.
            </p>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  handleUpdateOrderStatus(orderToReceive.id, 'received');
                  setShowSimpleReceiveModal(false);
                  setOrderToReceive(null);
                }}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black uppercase rounded-2xl transition-all shadow-lg active:scale-95"
              >
                Confirm / Receive
              </button>
              <button
                onClick={() => setShowSimpleReceiveModal(false)}
                className="w-full py-4 bg-white/5 hover:bg-white/10 text-white text-[11px] font-black uppercase rounded-2xl transition-all border border-white/10"
              >
                Cancel / Back
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order Report Modal */}
      {reportingOrder && (
        <div className="fixed inset-0 z-[1800] flex items-center justify-center p-6 bg-black/95 backdrop-blur-md animate-in fade-in duration-300">
          <div className="absolute inset-0" onClick={() => setReportingOrder(null)} />
          <div className="relative bg-[#0a0a0a] border border-white/10 rounded-[2.5rem] p-8 w-full max-w-md shadow-3xl animate-in zoom-in-95 duration-300">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center text-red-500">
                <IonIcon name="alert-circle" className="text-2xl" />
              </div>
              <h3 className="text-lg font-black text-white uppercase tracking-widest italic">Report Order</h3>
            </div>

            <div className="space-y-6">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-white/30 uppercase tracking-widest italic ml-1">Select Reason</label>
                <div className="grid grid-cols-1 gap-2">
                  {(reportSide === 'buyer'
                    ? ["Item not received", "Item damaged", "Wrong item received", "Other"]
                    : ["Buyer unavailable for delivery", "Incorrect address/contact", "Delivery attempt failed", "Other"]
                  ).map((option) => (
                    <button
                      key={option}
                      onClick={() => setOrderReportReason(option)}
                      className={`px-6 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all text-left flex items-center justify-between group ${orderReportReason === option
                        ? "bg-white text-black border-transparent shadow-xl scale-[1.02]"
                        : "bg-white/5 text-white/40 border border-white/5 hover:bg-white/10"
                        }`}
                    >
                      {option}
                      <div className={`w-4 h-4 rounded-full border-2 transition-all flex items-center justify-center ${orderReportReason === option ? "border-black bg-black" : "border-white/10"}`}>
                        {orderReportReason === option && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {orderReportReason === "Other" && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-white/30 uppercase tracking-widest italic ml-1">More Details (50 chars limit)</label>
                  <textarea
                    value={orderReportText}
                    onChange={(e) => setOrderReportText(e.target.value.slice(0, 50))} // 50 char limit enforced
                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-xs text-white outline-none focus:ring-1 focus:ring-red-500/50 min-h-[80px]"
                    placeholder="Describe the issue briefly..."
                  />
                  <div className="text-right text-[8px] font-black text-white/10 uppercase italic">
                    {orderReportText.length}/50 Characters
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-3 pt-4">
                <button
                  onClick={handleSubmitOrderReport}
                  className="w-full py-5 bg-red-600 hover:bg-red-500 text-white text-[11px] font-black uppercase rounded-2xl tracking-[0.2em] transition-all shadow-xl shadow-red-500/10 active:scale-95"
                >
                  Submit Report
                </button>
                <button
                  onClick={() => setReportingOrder(null)}
                  className="w-full py-4 text-white/20 hover:text-white/40 text-[10px] font-black uppercase tracking-widest transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Report Details Modal */}
      {viewingReport && (
        <div className="fixed inset-0 z-[1900] flex items-center justify-center p-6 bg-black/95 backdrop-blur-md animate-in fade-in duration-300">
          <div className="absolute inset-0" onClick={() => setViewingReport(null)} />
          <div className="relative bg-[#0a0a0a] border border-white/10 rounded-[2.5rem] p-10 w-full max-w-sm text-center shadow-3xl animate-in zoom-in-95 duration-300">
            <div className="w-20 h-20 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <IonIcon name="document-text-outline" className="text-4xl text-red-500" />
            </div>

            <h3 className="text-xl font-black text-white uppercase tracking-wider mb-2 italic">
              Report Details
            </h3>

            <p className="text-[10px] text-red-500/60 font-black uppercase tracking-[0.2em] mb-6">
              Submitted by {viewingReport.side.toUpperCase()}
            </p>

            <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-6 text-left mb-8 space-y-4">
              <div>
                <label className="text-[8px] font-black text-white/20 uppercase tracking-widest italic leading-none block mb-2 text-center">Reason</label>
                <p className="text-xs font-black text-white uppercase text-center">{viewingReport.data?.reason || "General Issue"}</p>
              </div>

              {viewingReport.data?.custom_text && (
                <div className="pt-4 border-t border-white/5">
                  <label className="text-[8px] font-black text-white/20 uppercase tracking-widest italic leading-none block mb-2 text-center">Custom Message</label>
                  <p className="text-[10px] font-medium text-white/60 leading-relaxed text-center italic">
                    "{viewingReport.data.custom_text}"
                  </p>
                </div>
              )}
            </div>

            <button
              onClick={() => setViewingReport(null)}
              className="w-full py-4 bg-white/5 hover:bg-white/10 text-white text-[11px] font-black uppercase rounded-2xl transition-all border border-white/10"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
