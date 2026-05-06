"use client";

import type React from "react";
import { PhotoVideoAdCard } from "@/app/components/ads/PhotoVideoAdCard";
import { ProfilePromoteAdCard } from "@/app/components/ads/ProfilePromoteAdCard";
import { PromotedProductCard } from "@/app/components/market/PromotedProductCard";
import { normalizeProductAd } from "@/app/lib/market/adProductAdapter";
import { normalizeAdData } from "@/app/lib/ads/adNormalizer";

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
  onToggleLike?: (id: string | number) => void | Promise<void>;
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

export function PromotedAdCard({
  ad,
  source = "shop",
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

  if (normalized.type === "product") {
    return (
      <PromotedProductCard
        item={({
          ...normalizeProductAd(normalized.raw),
          id: normalized.id,
          shareCode: normalized.shareCode,
          user_liked: normalized.liked,
          ad_coin_collected: normalized.coinCollected,
        } as any)}
        source={source}
        onClick={() => onProductClick?.(actionAd)}
        onAddToBagClick={() => onAddToBagClick?.(actionAd)}
        onToggleLike={onToggleLike}
        onOpenSheet={onOpenSheet}
        onShare={onShare}
        onLogView={() => onLogView?.(actionAd)}
        onReport={onReport}
        onNotInterested={onNotInterested}
        onCollectCoin={onCollectCoin}
        canShowCollectCoin={canShowCollectCoin}
        onNavigateToProfile={(event) => onNavigateToProfile?.(event, actionAd.user_id)}
        currentUser={currentUser}
        compact={compact}
      />
    );
  }

  if (normalized.type === "profile") {
    return (
      <ProfilePromoteAdCard
        ad={normalized}
        onProductClick={(product) => onProductClick?.(product)}
        onProfileClick={() => onProfileClick?.(actionAd)}
        onToggleLike={onToggleLike}
        onOpenSheet={onOpenSheet}
        onShare={onShare}
        onCollectCoin={onCollectCoin}
        canShowCollectCoin={canShowCollectCoin}
      />
    );
  }

  return (
    <PhotoVideoAdCard
      ad={normalized}
      source={source}
      isMenuOpen={isMenuOpen}
      onToggleMenu={onToggleMenu || (() => {})}
      onCloseMenu={onCloseMenu || (() => {})}
      onOpenSecondView={onOpenSecondView}
      onToggleLike={onToggleLike}
      onOpenSheet={onOpenSheet}
      onShare={onShare}
      onReport={onReport}
      onNotInterested={onNotInterested}
      onCollectCoin={onCollectCoin}
      onNavigateToProfile={onNavigateToProfile}
      canShowCollectCoin={canShowCollectCoin}
    />
  );
}
