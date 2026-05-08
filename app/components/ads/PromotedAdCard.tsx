"use client";

import type React from "react";
import { SharedPhotoVideoAdCard } from "@/app/components/ads/SharedPhotoVideoAdCard";
import { SharedProfilePromoteAdCard } from "@/app/components/ads/SharedProfilePromoteAdCard";
import { SharedProductPromoteAdCard } from "@/app/components/ads/SharedProductPromoteAdCard";
import { normalizeAdData } from "@/app/lib/ads/adNormalizer";
import { useAdStore } from "@/app/lib/ads/adStore";
import { getAdInteractionId } from "@/app/lib/ads/adIdentity";

type PromotedAdCardProps = {
  ad: any;
  source?: "home" | "shop";
  isMenuOpen?: boolean;
  onToggleMenu?: (adId: any) => void;
  onCloseMenu?: () => void;
  onOpenSecondView?: (ad: any) => void;
  onProductClick?: (product: any) => void;
  onAddToBagClick?: (product: any) => void;
  onProfileClick?: (ad: any) => void;
  onToggleLike?: (ad: any) => void | Promise<void>;
  onOpenSheet?: (type: any, ad: any) => void;
  onShare?: (ad: any) => void;
  onLogView?: (ad: any) => void;
  onReport?: (ad: any) => void;
  onNotInterested?: (id: string | number) => void;
  onCollectCoin?: (event: React.MouseEvent, ad: any) => void;
  onNavigateToProfile?: (event: React.MouseEvent, ad: any) => void;
  canShowCollectCoin?: (ad: any) => boolean;
  currentUser?: any;
  compact?: boolean;
};

const EMPTY_OBJECT = {};

export function PromotedAdCard({
  ad,
  isMenuOpen = false,
  onToggleMenu,
  onCloseMenu,
  onOpenSecondView,
  onProductClick,
  onAddToBagClick,
  onProfileClick,
  onToggleLike,
  onOpenSheet,
  onShare,
  onLogView,
  onReport,
  onNotInterested,
  onCollectCoin,
  onNavigateToProfile,
  canShowCollectCoin,
  currentUser,
  compact,
}: PromotedAdCardProps) {
  const normalized = normalizeAdData(ad);
  const actionAd = normalized.raw || ad;
  
  // Connect to global reactive store
  const interactionId = getAdInteractionId(actionAd);
  const liveState = useAdStore((state) => state.adStates[interactionId] || EMPTY_OBJECT);

  // Merge live state into normalized object for UI parity
  const merged = {
    ...normalized,
    liked: liveState.user_liked ?? normalized.liked,
    user_liked: liveState.user_liked ?? normalized.user_liked,
    likeCount: liveState.likes_count ?? liveState.likeCount ?? normalized.likeCount,
    likes_count: liveState.likes_count ?? liveState.likeCount ?? normalized.likes_count,
    coinCollected: liveState.ad_coin_collected ?? normalized.coinCollected,
    ad_coin_collected: liveState.ad_coin_collected ?? normalized.ad_coin_collected,
    viewCount: liveState.views_count ?? liveState.viewCount ?? normalized.viewCount,
    views_count: liveState.views_count ?? liveState.viewCount ?? normalized.views_count,
    commentCount: liveState.comments_count ?? liveState.commentCount ?? normalized.commentCount,
    comments_count: liveState.comments_count ?? liveState.commentCount ?? normalized.comments_count,
    shareCount: liveState.shares_count ?? liveState.shareCount ?? normalized.shareCount,
    shares_count: liveState.shares_count ?? liveState.shareCount ?? normalized.shares_count,
  };
  const campaignType = String(merged.campaign_type || merged.campaignType || actionAd?.campaign_type || actionAd?.campaignType || "").trim();
  const isProductPromote = campaignType.toLowerCase() === "product promote";

  if (merged.type === "product" || isProductPromote) {
    const hydratedProduct = (normalized.raw as any) || actionAd || ad;
    const productItem = {
      ...hydratedProduct,
      ...merged,
      image_url: hydratedProduct?.image_url || hydratedProduct?.main_image || hydratedProduct?.media_preview || merged.image,
      main_image: hydratedProduct?.main_image || hydratedProduct?.image_url || hydratedProduct?.media_preview || merged.image,
      images: Array.isArray(hydratedProduct?.images)
        ? hydratedProduct.images
        : Array.isArray(hydratedProduct?.media_gallery)
          ? hydratedProduct.media_gallery
          : merged.image
            ? [merged.image]
            : [],
      variants: Array.isArray(hydratedProduct?.variants) ? hydratedProduct.variants : [],
      sizes: Array.isArray(hydratedProduct?.sizes) ? hydratedProduct.sizes : [],
      price: hydratedProduct?.price ?? hydratedProduct?.main_price ?? hydratedProduct?.product_price ?? merged.price,
      main_price: hydratedProduct?.main_price ?? hydratedProduct?.price ?? hydratedProduct?.product_price ?? merged.price,
      product_price: hydratedProduct?.product_price ?? hydratedProduct?.price ?? hydratedProduct?.main_price ?? merged.price,
      promo_price: hydratedProduct?.promo_price ?? merged.promo_price ?? null,
      raw: hydratedProduct?.raw || hydratedProduct,
      adId: merged.adId || actionAd?.adId || hydratedProduct?.adId,
      ad_id: merged.ad_id || actionAd?.ad_id || hydratedProduct?.ad_id,
      campaign_type: merged.campaign_type || campaignType,
      is_sponsored: true,
      user_liked: merged.user_liked,
      likes_count: merged.likes_count,
      views_count: merged.views_count,
      comments_count: merged.comments_count,
      shares_count: merged.shares_count,
      ad_coin_collected: merged.ad_coin_collected,
      ad_like_locked: merged.ad_like_locked,
    };

    return (
      <SharedProductPromoteAdCard
        item={productItem as any}
        onClick={(item) => onProductClick?.(item)}
        onAddToBagClick={(item) => onAddToBagClick?.(item)}
        onToggleLike={onToggleLike || (() => {})}
        onOpenSheet={onOpenSheet || (() => {})}
        onShare={onShare || (() => {})}
        onLogView={() => onLogView?.(merged.raw || merged)}
        onReport={onReport || (() => {})}
        onNotInterested={onNotInterested || (() => {})}
        onCollectCoin={onCollectCoin || (() => {})}
        canShowCollectCoin={canShowCollectCoin || (() => false)}
        onNavigateToProfile={(event) => onNavigateToProfile?.(event, actionAd.user_id)}
        currentUser={currentUser}
        compact={compact}
      />
    );
  }

  if (merged.type === "profile") {
    return (
      <SharedProfilePromoteAdCard
        ad={merged}
        onProductClick={(product) => onProductClick?.(product)}
        onProfileClick={() => onProfileClick?.(actionAd)}
        onCollectCoin={onCollectCoin}
        canShowCollectCoin={canShowCollectCoin}
      />
    );
  }

  return (
    <SharedPhotoVideoAdCard
      ad={merged}
      isMenuOpen={isMenuOpen}
      onToggleMenu={onToggleMenu || (() => {})}
      onCloseMenu={onCloseMenu || (() => {})}
      onOpenSecondView={onOpenSecondView}
      onToggleLike={onToggleLike || (() => {})}
      onOpenSheet={onOpenSheet || (() => {})}
      onShare={onShare || (() => {})}
      onReport={onReport || (() => {})}
      onNotInterested={onNotInterested || (() => {})}
      onCollectCoin={onCollectCoin || (() => {})}
      onNavigateToProfile={onNavigateToProfile || (() => {})}
      canShowCollectCoin={canShowCollectCoin || (() => false)}
    />
  );
}
