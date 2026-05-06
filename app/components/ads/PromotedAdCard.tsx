"use client";

import type React from "react";
import { SharedPhotoVideoAdCard } from "@/app/components/ads/SharedPhotoVideoAdCard";
import { SharedProfilePromoteAdCard } from "@/app/components/ads/SharedProfilePromoteAdCard";
import { SharedProductPromoteAdCard } from "@/app/components/ads/SharedProductPromoteAdCard";
import { normalizeProductAd } from "@/app/lib/market/adProductAdapter";
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
    likeCount: liveState.likes_count ?? normalized.likeCount,
    likes_count: liveState.likes_count ?? normalized.likes_count,
    coinCollected: liveState.ad_coin_collected ?? normalized.coinCollected,
    ad_coin_collected: liveState.ad_coin_collected ?? normalized.ad_coin_collected,
    viewCount: liveState.views_count ?? normalized.viewCount,
    views_count: liveState.views_count ?? normalized.views_count,
    commentCount: liveState.comments_count ?? normalized.commentCount,
    comments_count: liveState.comments_count ?? normalized.comments_count,
    shareCount: liveState.shares_count ?? normalized.shareCount,
    shares_count: liveState.shares_count ?? normalized.shares_count,
  };

  if (merged.type === "product") {
    return (
      <SharedProductPromoteAdCard
        item={({
          ...normalizeProductAd(merged.raw),
          id: merged.id,
          shareCode: merged.shareCode,
          user_liked: merged.liked,
          likes_count: merged.likeCount,
          ad_coin_collected: merged.coinCollected,
          views_count: merged.viewCount,
          comments_count: merged.commentCount,
          shares_count: merged.shareCount,
          raw: merged.raw,
        } as any)}
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
