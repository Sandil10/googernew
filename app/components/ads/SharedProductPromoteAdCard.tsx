"use client";

import { NormalizedProductAd } from "@/app/lib/market/adProductAdapter";
import { SharedProductCard } from "@/app/components/market/SharedProductCard";

interface SharedProductPromoteAdCardProps {
  item: NormalizedProductAd;
  onClick?: (item: NormalizedProductAd) => void;
  onAddToBagClick?: (item: NormalizedProductAd) => void;
  onToggleLike?: (item: NormalizedProductAd) => void;
  onOpenSheet?: (type: string, item: NormalizedProductAd) => void;
  onShare?: (item: NormalizedProductAd) => void;
  onLogView?: (id: number) => void;
  onReport?: (item: NormalizedProductAd) => void;
  onNotInterested?: (id: string | number) => void;
  onCollectCoin?: (event: React.MouseEvent, item: NormalizedProductAd) => void;
  canShowCollectCoin?: (item: NormalizedProductAd) => boolean;
  onNavigateToProfile?: (event: React.MouseEvent, userId: any) => void;
  currentUser?: any;
  compact?: boolean;
}

export function SharedProductPromoteAdCard({
  item,
  onClick,
  onAddToBagClick,
  onToggleLike,
  onOpenSheet,
  onShare,
  onLogView,
  onReport,
  onNotInterested,
  onCollectCoin,
  canShowCollectCoin,
  onNavigateToProfile,
  currentUser,
}: SharedProductPromoteAdCardProps) {
  return (
    <SharedProductCard
      product={item}
      isAd={true}
      currentUser={currentUser}
      onProductClick={onClick as any}
      onAddToBagClick={onAddToBagClick as any}
      onToggleLike={onToggleLike}
      onOpenSheet={onOpenSheet as any}
      onShare={onShare as any}
      onLogView={onLogView}
      onReport={onReport as any}
      onNotInterested={onNotInterested}
      onCollectCoin={onCollectCoin as any}
      canShowCollectCoin={canShowCollectCoin as any}
      onNavigateToProfile={onNavigateToProfile}
    />
  );
}
