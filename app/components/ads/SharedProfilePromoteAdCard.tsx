"use client";

import Image from "next/image";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import IonIcon from "@/app/components/IonIcon";
import SubscribeButton from "@/app/components/SubscribeButton";
import { marketService } from "@/services/marketService";
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
  const candidates = [
    item.image,
    item.image_url,
    item.main_image,
    ...(Array.isArray(item.images) ? item.images : []),
    ...(Array.isArray(item.media_gallery) ? item.media_gallery : []),
    item.thumbnail_url,
    item.preview_url,
    item.media_preview,
    item.media_url,
    ...(Array.isArray(item.variants)
      ? item.variants.map((variant: any) => variant?.image_url || variant?.url || variant?.image)
      : []),
  ];
  return candidates.map(getImageCandidate).find((candidate) => !isPlaceholderProductImage(candidate)) || "";
};

const isVideoPreview = (src: string) => /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(src);

const isFeaturedUploadContent = (item: any) => {
  const type = String(item?.__profilePromoteType || item?.type || item?.item_type || "").trim().toLowerCase();
  const contentType = String(item?.content_type || item?.contentType || "").trim().toLowerCase();
  return type === "upload" || type === "content" || type === "upload_content" || contentType === "flash" || contentType === "vault";
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
  const featuredItems = useMemo(
    () => Array.isArray(draft.featuredItems)
      ? draft.featuredItems
      : Array.isArray(draft.featured_items)
        ? draft.featured_items
        : [],
    [draft.featuredItems, draft.featured_items],
  );


  useEffect(() => {
    if (featuredItems.length > 0) {
      setAdProducts(featuredItems.slice(0, 3));
      setLoadingProducts(false);
      return;
    }

    const ownerId = ad.userId;
    if (!ownerId) {
      setLoadingProducts(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const items = await marketService.getItems({ user_id: ownerId, status: "active,approved" });
        if (cancelled) return;
        const visible = (Array.isArray(items) ? items : [])
          .filter((item: any) => !item?.is_sponsored)
          .slice(0, 3);
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
  }, [ad.userId, featuredItems]);

  const profilePic = getItemProfilePicture(raw);
  const username = getItemUsername(raw, "Advertiser");
  const showAdCoinButton = !!canShowCollectCoin?.(ad);

  const trackAdClick = () => {
    logSponsoredAdClick(ad.raw || ad, "visit");
  };
  const displayProducts = loadingProducts
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
            alt="Ruppier coin"
            width={22}
            height={22}
            className="h-5 w-5 object-contain contrast-110 brightness-110"
            unoptimized
          />
          <span>Ruppier</span>
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
            <span className="block text-[8px] font-bold tracking-[0.14em] text-slate-500">Ad</span>
          </div>
        </div>
        <SubscribeButton userId={ad.userId} initialIsSubscribed={false} size="small" onBeforeSubscribeClick={trackAdClick} />
      </div>

      <div className="grid grid-cols-3 gap-1 p-1.5">
        {displayProducts.map((product: any) => {
          const isPlaceholder = !!product._placeholder;
          const primaryPreview = pickFeaturedItemImage(product);
          const img = normalizeMediaSrc(primaryPreview);
          const price = product.promo_price || product.price;
          return (
            <button
              key={String(product.id)}
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
                    className="h-full w-full object-cover"
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
                    className="object-cover"
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
