"use client";

import Image from "next/image";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import IonIcon from "@/app/components/IonIcon";
import SubscribeButton from "@/app/components/SubscribeButton";
import { uploadContentService } from "@/services/uploadContentService";
import { API_URL } from "@/services/apiConfig";
import { getItemProfilePicture, getItemUsername } from "@/app/lib/userDisplay";
import { UserVerifiedBadge } from "@/app/components/VerifiedBadge";
import {
  AVATAR_IMAGE_SIZES,
  FEED_IMAGE_BLUR_DATA_URL,
  PRODUCT_CARD_IMAGE_SIZES,
  normalizeMediaSrc,
  shouldBypassNextImageOptimization,
} from "@/app/lib/mediaOptimization";

import { NormalizedAd } from "@/app/lib/ads/adTypes";
import { logSponsoredAdClick } from "@/app/lib/ads/adClickTracking";
import { RelativeTime } from "@/app/components/RelativeTime";

type SharedProfilePromoteAdCardProps = {
  ad: NormalizedAd;
  onProfileClick: (ad: any) => void;
  onProductClick: (product: any) => void;
  onContentClick?: (content: any) => void;
  onCollectCoin?: (event: React.MouseEvent, ad: any) => void;
  canShowCollectCoin?: (ad: any) => boolean;
  compact?: boolean;
};

const isPlaceholderProductImage = (src: any) => {
  const value = String(src || "").trim().toLowerCase();
  return !value || value.includes("/assets/images/googer.png") || value.includes("/assets/images/rupeer");
};

const getImageCandidate = (value: any) => (
  typeof value === "string"
    ? value
    : value?.url || value?.image_url || value?.image || value?.src || ""
);

const pickFeaturedItemImage = (item: any) => {
  const uploadType = isFeaturedUploadContent(item);
  const raw = item?.raw || {};
  const mediaGallery = [
    ...(Array.isArray(item.media_gallery) ? item.media_gallery : []),
    ...(Array.isArray(item.mediaGallery) ? item.mediaGallery : []),
    ...(Array.isArray(raw.media_gallery) ? raw.media_gallery : []),
    ...(Array.isArray(raw.mediaGallery) ? raw.mediaGallery : []),
  ];
  const imageGallery = [
    ...(Array.isArray(item.images) ? item.images : []),
    ...(Array.isArray(raw.images) ? raw.images : []),
  ];
  const candidates = [
    item.thumbnail_url,
    item.thumbnailUrl,
    raw.thumbnail_url,
    raw.thumbnailUrl,
    ...(uploadType ? [] : [item.image, item.image_url, item.main_image]),
    item.preview_url,
    item.previewUrl,
    raw.preview_url,
    raw.previewUrl,
    item.media_preview,
    item.mediaPreview,
    raw.media_preview,
    raw.mediaPreview,
    item.media_url,
    item.mediaUrl,
    raw.media_url,
    raw.mediaUrl,
    ...mediaGallery,
    ...imageGallery,
    ...(uploadType ? [item.image, item.image_url, item.main_image] : []),
    ...(Array.isArray(item.variants)
      ? item.variants.map((variant: any) => variant?.image_url || variant?.url || variant?.image)
      : []),
  ];
  return candidates.map(getImageCandidate).find((candidate) => !isPlaceholderProductImage(candidate)) || "";
};

const isVideoPreview = (src: string) => /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(src);
const PROFILE_PROMOTE_ITEMS_CACHE = new Map<string, any[]>();
const PROFILE_PROMOTE_MARKET_CACHE = new Map<string, { expiresAt: number; data: any[] }>();
const PROFILE_PROMOTE_MARKET_INFLIGHT = new Map<string, Promise<any[]>>();
const PROFILE_PROMOTE_MARKET_CACHE_TTL_MS = 20_000;

const getQuietAuthHeaders = () => {
  if (typeof window === "undefined") return {};
  const token = window.sessionStorage.getItem("token") || window.localStorage.getItem("token") || "";
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const quietFetchMarketItems = async (filters: Record<string, string | number | undefined>) => {
  const queryParams = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim()) {
      queryParams.set(key, String(value));
    }
  });
  const cacheKey = queryParams.toString();
  const cached = PROFILE_PROMOTE_MARKET_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  const inflight = PROFILE_PROMOTE_MARKET_INFLIGHT.get(cacheKey);
  if (inflight) return inflight;

  const request = (async () => {
    try {
      const response = await fetch(`${API_URL}/market?${cacheKey}`, {
        method: "GET",
        cache: "no-store",
        headers: getQuietAuthHeaders(),
      });
      if (!response.ok) return [];
      const data = await response.json().catch(() => null);
      const items = Array.isArray(data?.data) ? data.data : [];
      PROFILE_PROMOTE_MARKET_CACHE.set(cacheKey, {
        expiresAt: Date.now() + PROFILE_PROMOTE_MARKET_CACHE_TTL_MS,
        data: items,
      });
      return items;
    } catch {
      return [];
    }
  })().finally(() => {
    PROFILE_PROMOTE_MARKET_INFLIGHT.delete(cacheKey);
  });

  PROFILE_PROMOTE_MARKET_INFLIGHT.set(cacheKey, request);
  return request;
};

const quietFetchMarketItemById = async (id: string | number) => {
  const rawId = String(id ?? "").trim().replace(/^(ad|item|product|market|promo)-/i, "");
  if (!rawId || !/^\d+$/.test(rawId)) return null;
  const cacheKey = `item:${rawId}`;
  const cached = PROFILE_PROMOTE_MARKET_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data[0] || null;
  }
  const inflight = PROFILE_PROMOTE_MARKET_INFLIGHT.get(cacheKey);
  if (inflight) {
    const items = await inflight;
    return items[0] || null;
  }

  const request = (async () => {
    try {
      const response = await fetch(`${API_URL}/market/${encodeURIComponent(rawId)}`, {
        method: "GET",
        cache: "no-store",
        headers: getQuietAuthHeaders(),
      });
      if (!response.ok) return [];
      const data = await response.json().catch(() => null);
      const item = data?.data || data?.item || null;
      const items = item ? [item] : [];
      PROFILE_PROMOTE_MARKET_CACHE.set(cacheKey, {
        expiresAt: Date.now() + PROFILE_PROMOTE_MARKET_CACHE_TTL_MS,
        data: items,
      });
      return items;
    } catch {
      return [];
    }
  })().finally(() => {
    PROFILE_PROMOTE_MARKET_INFLIGHT.delete(cacheKey);
  });

  PROFILE_PROMOTE_MARKET_INFLIGHT.set(cacheKey, request);
  const items = await request;
  return items[0] || null;
};

const isRunningAdStatus = (value: unknown) => {
  const status = String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ");
  return status === "active" || status === "running" || status === "approved";
};

const isFeaturedUploadContent = (item: any) => {
  const normalize = (value: unknown) => String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ");
  const raw = item?.raw || {};
  const typeValues = [
    item?.__profilePromoteType,
    item?.type,
    item?.item_type,
    item?.itemType,
    item?.content_type,
    item?.contentType,
    raw?.content_type,
    raw?.contentType,
    item?.media_type,
    item?.mediaType,
  ].map(normalize);
  return typeValues.some((type) => [
    "upload",
    "content",
    "upload content",
    "content upload",
    "paid content",
    "vault content",
    "flash content",
    "vault",
    "flash",
  ].includes(type))
    || !!(item?.upload_content_id || item?.uploadContentId || item?.content_id || item?.contentId || raw?.content_id || raw?.contentId)
    || !!(item?.media_preview || item?.mediaPreview || item?.thumbnail_url || item?.thumbnailUrl || raw?.media_preview || raw?.mediaPreview || raw?.thumbnail_url || raw?.thumbnailUrl);
};

const isBlurredUploadContent = (item: any) => {
  const raw = item?.raw || {};
  const mode = String(
    item?.content_access_mode
      || item?.contentAccessMode
      || item?.access_mode
      || item?.accessMode
      || raw?.content_access_mode
      || raw?.contentAccessMode
      || raw?.access_mode
      || raw?.accessMode
      || item?.visibility_mode
      || item?.visibilityMode
      || raw?.visibility_mode
      || raw?.visibilityMode
      || "",
  ).trim().toLowerCase();
  const previewMode = String(
    item?.preview_mode
      || item?.previewMode
      || raw?.preview_mode
      || raw?.previewMode
      || ""
  ).trim().toLowerCase();
  return mode === "blurred"
    || mode === "blur"
    || mode === "locked"
    || mode === "paid"
    || item?.blurred === true
    || item?.is_blurred === true
    || item?.isBlurred === true
    || raw?.blurred === true
    || raw?.is_blurred === true
    || raw?.isBlurred === true
    || item?.locked === true
    || item?.is_locked === true
    || item?.isLocked === true
    || raw?.locked === true
    || raw?.is_locked === true
    || raw?.isLocked === true
    || (mode === "" && previewMode === "blurred");
};

const getFeaturedItemIdentity = (item: any, fallbackIndex: number) => {
  const type = String(
    item?.__profilePromoteType || item?.type || item?.item_type || item?.content_type || "item",
  ).trim().toLowerCase();
  const id = item?.id ?? item?.content_id ?? item?.contentId ?? item?.product_id ?? fallbackIndex;
  return `${type}:${String(id)}`;
};

const dedupeFeaturedItems = (items: any[]) => {
  const seen = new Set<string>();
  return items.filter((item, index) => {
    const identity = getFeaturedItemIdentity(item, index);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
};

const mergeUploadContentDetails = (item: any, source: any) => {
  if (!source) return item;
  return {
    ...source,
    ...item,
    content_id: item.content_id || item.contentId || source.content_id || source.contentId,
    contentId: item.contentId || item.content_id || source.contentId || source.content_id,
    content_type: item.content_type || item.contentType || source.content_type || source.contentType,
    contentType: item.contentType || item.content_type || source.contentType || source.content_type,
    media_type: item.media_type || item.mediaType || source.media_type || source.mediaType,
    mediaType: item.mediaType || item.media_type || source.mediaType || source.media_type,
    thumbnail_url: item.thumbnail_url || item.thumbnailUrl || source.thumbnail_url || source.thumbnailUrl,
    thumbnailUrl: item.thumbnailUrl || item.thumbnail_url || source.thumbnailUrl || source.thumbnail_url,
    preview_url: item.preview_url || item.previewUrl || source.preview_url || source.previewUrl,
    previewUrl: item.previewUrl || item.preview_url || source.previewUrl || source.preview_url,
    media_preview: item.media_preview || item.mediaPreview || source.media_preview || source.mediaPreview,
    mediaPreview: item.mediaPreview || item.media_preview || source.mediaPreview || source.media_preview,
    media_gallery: Array.isArray(item.media_gallery) && item.media_gallery.length ? item.media_gallery : source.media_gallery || source.mediaGallery || [],
    mediaGallery: Array.isArray(item.mediaGallery) && item.mediaGallery.length ? item.mediaGallery : source.mediaGallery || source.media_gallery || [],
    content_access_mode: item.content_access_mode || item.contentAccessMode || source.content_access_mode || source.contentAccessMode,
    contentAccessMode: item.contentAccessMode || item.content_access_mode || source.contentAccessMode || source.content_access_mode,
    preview_mode: item.preview_mode || item.previewMode || source.preview_mode || source.previewMode,
    previewMode: item.previewMode || item.preview_mode || source.previewMode || source.preview_mode,
  };
};

const hydrateFeaturedUploadItems = async (ownerId: string | number | undefined, items: any[]) => {
  if (!items.some(isFeaturedUploadContent)) return items;
  const ownerContents = ownerId
    ? await uploadContentService.getPublicApprovedByUser(ownerId).catch(() => [])
    : [];
  const fallbackContents = ownerContents.length > 0
    ? []
    : (await uploadContentService.getPublicApproved().then((result) => result.contents || []).catch(() => []));
  const allContents = [...ownerContents, ...fallbackContents];
  const byId = new Map<string, any>();
  allContents.forEach((content: any) => {
    [content.id, content.content_id, content.contentId].forEach((value) => {
      const key = String(value || "").trim();
      if (key) byId.set(key, content);
    });
  });
  return items.map((item) => {
    if (!isFeaturedUploadContent(item)) return item;
    const match = byId.get(String(item.id || "").trim())
      || byId.get(String(item.content_id || item.contentId || "").trim());
    return mergeUploadContentDetails(item, match);
  });
};

const hydrateFeaturedMarketItems = async (items: any[]) => {
  return Promise.all(items.map(async (item) => {
    if (isFeaturedUploadContent(item) || pickFeaturedItemImage(item)) return item;
    const itemId = item?.id || item?.product_id || item?.productId;
    if (!itemId) return item;
    const detail = await quietFetchMarketItemById(itemId);
    return detail ? { ...detail, ...item } : item;
  }));
};

const getAdOwnerIdCandidates = (ad: any, raw: any) => (
  [
    ad?.userId,
    ad?.user_id,
    ad?.owner_user_id,
    ad?.ownerUserId,
    ad?.ad_owner_user_id,
    ad?.advertiser_id,
    raw?.userId,
    raw?.user_id,
    raw?.owner_user_id,
    raw?.ownerUserId,
    raw?.ad_owner_user_id,
    raw?.advertiser_id,
    raw?.promotedProfileUserId,
    raw?.promoted_profile_user_id,
    raw?.editDraft?.promotedProfileUserId,
    raw?.edit_draft?.promotedProfileUserId,
    raw?.editDraft?.promoted_profile_user_id,
    raw?.edit_draft?.promoted_profile_user_id,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
);

const getAdOwnerNameCandidates = (ad: any, raw: any) => (
  [
    ad?.username,
    ad?.full_name,
    ad?.fullName,
    ad?.profile_username,
    ad?.promotedProfileUsername,
    ad?.promoted_profile_username,
    raw?.username,
    raw?.full_name,
    raw?.fullName,
    raw?.profile_username,
    raw?.promotedProfileUsername,
    raw?.promoted_profile_username,
    raw?.editDraft?.promotedProfileUsername,
    raw?.edit_draft?.promotedProfileUsername,
    raw?.editDraft?.promoted_profile_username,
    raw?.edit_draft?.promoted_profile_username,
  ]
    .map((value) => String(value || "").trim().replace(/^@/, "").toLowerCase())
    .filter(Boolean)
);

const getProfilePromoteCacheKey = (ad: any, ownerIds: string[], ownerNames: string[], featuredItems: any[]) => {
  const adKey = String(ad?.id || ad?.adId || ad?.ad_id || "").trim();
  const ownerKey = [...ownerIds, ...ownerNames].join(",");
  const featuredKey = featuredItems
    .map((item, index) => getFeaturedItemIdentity(item, index))
    .join(",");
  return `${adKey || ownerKey || "profile-promote"}:${featuredKey || ownerKey || "fallback"}`;
};

const loadOwnerUploadContents = async (ownerIds: string[], ownerNames: string[] = []) => {
  for (const ownerId of ownerIds) {
    const contents = await uploadContentService.getPublicApprovedByUser(ownerId).catch(() => []);
    if (contents.length > 0) return contents;
  }
  if (ownerNames.length > 0) {
    const allContents = await uploadContentService.getPublicApproved().then((result) => result.contents || []).catch(() => []);
    const matched = allContents.filter((content: any) => {
      const names = [
        content?.username,
        content?.full_name,
        content?.fullName,
        content?.owner_username,
        content?.ownerUsername,
      ].map((value) => String(value || "").trim().replace(/^@/, "").toLowerCase());
      return names.some((name) => name && ownerNames.includes(name));
    });
    if (matched.length > 0) return matched;
  }
  return [];
};

const loadOwnerMarketItems = async (ownerIds: string[], ownerNames: string[] = []) => {
  const productLists = await Promise.all(
    ownerIds.map((ownerId) => quietFetchMarketItems({ user_id: ownerId, status: "active,approved" })),
  );
  const directItems = productLists.flat().filter((item: any) => !item?.is_sponsored);
  if (directItems.length > 0 || ownerNames.length === 0) return directItems;
  const publicItems = await quietFetchMarketItems({ status: "active,approved" });
  return publicItems.filter((item: any) => {
    if (item?.is_sponsored) return false;
    const names = [
      item?.username,
      item?.owner_username,
      item?.ownerUsername,
      item?.seller_username,
      item?.sellerUsername,
      item?.user?.username,
      item?.owner?.username,
    ].map((value) => String(value || "").trim().replace(/^@/, "").toLowerCase());
    return names.some((name) => name && ownerNames.includes(name));
  });
};

export function SharedProfilePromoteAdCard({
  ad,
  onProfileClick,
  onProductClick,
  onContentClick,
  onCollectCoin,
  canShowCollectCoin,
  compact = false,
}: SharedProfilePromoteAdCardProps) {
  const [adProducts, setAdProducts] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const raw = ad.raw || {};
  const draft = raw.editDraft || raw.edit_draft || {};
  const ownerIdCandidates = useMemo(
    () => getAdOwnerIdCandidates(ad, raw),
    [ad, raw],
  );
  const ownerNameCandidates = useMemo(
    () => getAdOwnerNameCandidates(ad, raw),
    [ad, raw],
  );
  const featuredItems = useMemo(
    () => Array.isArray(draft.featuredItems)
      ? draft.featuredItems
      : Array.isArray(draft.featured_items)
        ? draft.featured_items
        : [],
    [draft.featuredItems, draft.featured_items],
  );
  const cacheKey = useMemo(
    () => getProfilePromoteCacheKey(ad, ownerIdCandidates, ownerNameCandidates, featuredItems),
    [ad, featuredItems, ownerIdCandidates, ownerNameCandidates],
  );


  useEffect(() => {
    const cachedItems = PROFILE_PROMOTE_ITEMS_CACHE.get(cacheKey);
    if (cachedItems?.length) {
      setAdProducts(cachedItems.slice(0, 3));
      setLoadingProducts(false);
    }

    if (featuredItems.length > 0) {
      const initialItems = dedupeFeaturedItems(featuredItems).slice(0, 3);
      if (!cachedItems?.length) setAdProducts(initialItems);
      setLoadingProducts(false);
      let cancelled = false;
      hydrateFeaturedUploadItems(ownerIdCandidates[0], initialItems)
        .then((hydratedUploadItems) => hydrateFeaturedMarketItems(hydratedUploadItems))
        .then((hydratedItems) => {
          if (cancelled) return;
          const nextItems = dedupeFeaturedItems(hydratedItems).slice(0, 3);
          PROFILE_PROMOTE_ITEMS_CACHE.set(cacheKey, nextItems);
          setAdProducts(nextItems);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }

    if (!ownerIdCandidates.length) {
      setLoadingProducts(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        if (!cachedItems?.length) setLoadingProducts(true);
        const productItems = await loadOwnerMarketItems(ownerIdCandidates, ownerNameCandidates);
        const uploadItems = await loadOwnerUploadContents(ownerIdCandidates, ownerNameCandidates);
        if (cancelled) return;
        const visible = dedupeFeaturedItems(
          [
            ...productItems,
            ...uploadItems.map((item: any) => ({ ...item, __profilePromoteType: "upload" })),
          ],
        ).slice(0, 3);
        PROFILE_PROMOTE_ITEMS_CACHE.set(cacheKey, visible);
        setAdProducts(visible);
      } catch {
        if (!cancelled) setAdProducts([]);
      } finally {
        if (!cancelled) setLoadingProducts(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cacheKey, featuredItems, ownerIdCandidates, ownerNameCandidates]);

  const profilePic = getItemProfilePicture(raw);
  const username = getItemUsername(raw, "Advertiser");
  const showAdCoinButton = !!canShowCollectCoin?.(ad);
  const showRunningAdTag = isRunningAdStatus(ad.status || raw.status || raw.delivery_status || raw.deliveryStatus);

  const trackAdClick = () => {
    logSponsoredAdClick(ad.raw || ad, "visit");
  };
  const displayProducts = loadingProducts && adProducts.length === 0
    ? Array.from({ length: 3 }).map((_, i) => ({ id: `ph-${i}`, _placeholder: true }))
    : adProducts.length > 0
      ? adProducts
      : Array.from({ length: 3 }).map((_, i) => ({ id: `ph-${i}`, _placeholder: true }));

  return (
    <div
      className={`relative flex-shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-[#1a1a1a] shadow-[0_8px_28px_rgba(0,0,0,0.28)] transition hover:border-white/20 ${compact ? "w-full sm:w-[260px]" : "w-[240px] sm:w-[260px]"}`}
      style={{ scrollSnapAlign: "start" }}
    >
      {showAdCoinButton && onCollectCoin && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onCollectCoin(event, ad.raw || ad);
          }}
          className="absolute right-2 top-12 z-20 flex items-center gap-1 rounded-full border border-red-400/30 bg-red-600 px-2 py-1 text-[7px] font-black uppercase tracking-[0.1em] text-white shadow-xl transition hover:bg-red-500 active:scale-95"
          aria-label="Collect ad coin"
        >
          <Image
            src="/assets/images/rupee.png"
            alt="Rupieer coin"
            width={22}
            height={22}
            className="h-5 w-5 object-contain contrast-110 brightness-110"
            unoptimized
          />
          <span>Rupieer</span>
        </button>
      )}

      <div className="flex items-center gap-2 border-b border-white/8 px-3 py-2.5">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            trackAdClick();
            onProfileClick(ad.raw || ad);
          }}
          className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full border border-white/10 bg-white/10"
        >
          {profilePic ? (
            <Image
              src={normalizeMediaSrc(profilePic)}
              alt={username}
              fill
              sizes={AVATAR_IMAGE_SIZES}
              className="object-cover"
              loading="lazy"
              placeholder="blur"
              blurDataURL={FEED_IMAGE_BLUR_DATA_URL}
              unoptimized={shouldBypassNextImageOptimization(profilePic)}
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center bg-gradient-to-tr from-blue-700 to-purple-700">
              <IonIcon name="person" className="text-xs text-white" />
            </span>
          )}
        </button>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              trackAdClick();
              onProfileClick(ad.raw || ad);
            }}
            className="flex items-center gap-1 truncate text-left text-[10px] font-black normal-case tracking-tight text-white hover:text-blue-400 transition-colors"
          >
            <span className="truncate">{username}</span>
            {ad.userId && <UserVerifiedBadge userId={ad.userId} size={10} />}
          </button>
          <div className="flex items-center gap-1.5">
            {showRunningAdTag ? (
              <span className="block text-[8px] font-bold tracking-[0.14em] text-slate-500">Ad</span>
            ) : (
              <span className="block text-[8px] font-bold tracking-[0.14em] text-slate-500">
                <RelativeTime timestamp={ad.activeStartTime || ad.active_start_time || ad.startedAt || ad.started_at || raw.active_start_time || raw.activeStartTime || raw.started_at || raw.startedAt || ad.createdAt || ad.created_at || raw.created_at || raw.createdAt || raw.approved_at || raw.approvedAt || raw.updated_at || raw.updatedAt} />
              </span>
            )}
          </div>
        </div>
        <SubscribeButton userId={ad.userId} initialIsSubscribed={false} size="small" onBeforeSubscribeClick={trackAdClick} />
      </div>

      <div className="grid grid-cols-3 gap-1 p-1.5">
        {displayProducts.map((product: any, productIndex: number) => {
          const isPlaceholder = !!product._placeholder;
          const primaryPreview = pickFeaturedItemImage(product);
          const img = normalizeMediaSrc(primaryPreview);
          const price = product.promo_price || product.price;
          const isUploadContent = isFeaturedUploadContent(product);
          const showBlur = isUploadContent && isBlurredUploadContent(product);
          const imageClassName = showBlur ? "object-cover scale-110 blur-xl" : "object-cover";
          return (
            <button
              key={`${String(ad.id || "profile-ad")}:${getFeaturedItemIdentity(product, productIndex)}:${productIndex}`}
              type="button"
              disabled={isPlaceholder}
              onClick={(event) => {
                event.stopPropagation();
                if (!isPlaceholder) {
                  trackAdClick();
                  if (isFeaturedUploadContent(product) && onContentClick) {
                    onContentClick(product);
                    return;
                  }
                  onProductClick(product);
                }
              }}
              className="overflow-hidden rounded-lg border border-white/8 bg-[#0e1014] text-left transition hover:border-white/20 disabled:cursor-default disabled:opacity-50"
            >
              <div className="relative aspect-square w-full overflow-hidden bg-black">
                {img && isVideoPreview(img) ? (
                  <video
                    src={img}
                    className={`h-full w-full ${imageClassName}`}
                    muted
                    playsInline
                    preload="metadata"
                  />
                ) : img ? (
                  <Image
                    src={img}
                    alt={product.title || "Product"}
                    fill
                    sizes={PRODUCT_CARD_IMAGE_SIZES}
                    quality={55}
                    className={imageClassName}
                    loading="lazy"
                    placeholder="blur"
                    blurDataURL={FEED_IMAGE_BLUR_DATA_URL}
                    unoptimized={shouldBypassNextImageOptimization(img)}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-white/[0.04]">
                    <IonIcon name={loadingProducts ? "hourglass-outline" : "image-outline"} className="text-[10px] text-white/30" />
                  </div>
                )}
                {showBlur && (
                  <div className="pointer-events-none absolute inset-0 bg-black/18 backdrop-blur-md" aria-hidden="true" />
                )}
              </div>
              <div className="px-1 py-1">
                <p className="truncate text-[7px] font-black text-white">
                  {isPlaceholder ? (loadingProducts ? "..." : "-") : product.title}
                </p>
                {!isPlaceholder && (
                  <p className="truncate text-[7px] font-bold text-white/50">
                    {Number(price || 0).toLocaleString()}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="border-t border-white/5 px-3 py-2">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            trackAdClick();
            onProfileClick(ad.raw || ad);
          }}
          className="w-full rounded-xl bg-white/[0.05] py-1.5 text-[8px] font-black uppercase tracking-[0.14em] text-white/60 transition hover:bg-white/[0.09] hover:text-white active:scale-95"
        >
          View Profile
        </button>
      </div>
    </div>
  );
}
