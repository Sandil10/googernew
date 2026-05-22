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
  source?: "home" | "shop" | "profile";
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
  onToggleSave?: (ad: any) => void | Promise<void>;
  isSaved?: boolean;
  showExpiryWarning?: boolean;
};

const EMPTY_OBJECT = {};

export function PromotedAdCard({
  ad,
  source,
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
  onToggleSave,
  isSaved,
  showExpiryWarning,
}: PromotedAdCardProps) {
  const normalized = normalizeAdData(ad);
  const actionAd = normalized.raw || ad;

  // Resolve the ad promoter's identity — collect every possible owner ID from the raw ad.
  // The ads table may store users.user_id (sequential, e.g. 5) while currentUser.id is
  // the PK (e.g. 312495), so we must check against ALL currentUser ID fields.
  const adOwnerCandidates: string[] = [
    normalized.ad_owner_user_id,
    normalized.advertiser_id,
    (actionAd as any)?.ad_owner_user_id,
    (actionAd as any)?.advertiser_id,
    ad?.ad_owner_user_id,
    ad?.advertiser_id,
    // Also check user_id on the raw ad (Product Promote sets this to the promoter's users.user_id)
    (actionAd as any)?.user_id,
    ad?.user_id,
  ]
    .filter((v) => v !== null && v !== undefined && String(v).trim() !== "")
    .map((v) => String(v));

  const currentUserCandidates: string[] = [
    currentUser?.id,
    currentUser?.user_id,
    currentUser?.googer_id,
    currentUser?.userId,
    currentUser?.owner_id,
  ]
    .filter((v) => v !== null && v !== undefined && String(v).trim() !== "")
    .map((v) => String(v));

  const isAdOwner =
    adOwnerCandidates.length > 0 &&
    currentUserCandidates.length > 0 &&
    adOwnerCandidates.some((oid) => currentUserCandidates.includes(oid));

  const guardedCanShowCollectCoin = isAdOwner
    ? () => false
    : canShowCollectCoin;

  // Connect to global reactive store
  const interactionId = getAdInteractionId(actionAd);
  const liveState = useAdStore((state) => state.adStates[interactionId] || EMPTY_OBJECT);

  // Merge live state into normalized object for UI parity
  const merged: any = {
    ...normalized,
    liked: liveState.user_liked ?? normalized.liked,
    user_liked: liveState.user_liked ?? normalized.user_liked,
    likeCount: liveState.likes_count ?? liveState.likeCount ?? normalized.likeCount,
    likes_count: liveState.likes_count ?? liveState.likeCount ?? normalized.likes_count,
    coinCollected: liveState.ad_coin_collected ?? normalized.coinCollected,
    ad_coin_collected: liveState.ad_coin_collected ?? normalized.ad_coin_collected,
    ad_like_locked: liveState.ad_like_locked ?? normalized.ad_like_locked ?? liveState.ad_coin_collected ?? normalized.ad_coin_collected,
    viewCount: liveState.views_count ?? liveState.viewCount ?? normalized.viewCount,
    views_count: liveState.views_count ?? liveState.viewCount ?? normalized.views_count,
    commentCount: liveState.comments_count ?? liveState.commentCount ?? normalized.commentCount,
    comments_count: liveState.comments_count ?? liveState.commentCount ?? normalized.comments_count,
    shareCount: liveState.shares_count ?? liveState.shareCount ?? normalized.shareCount,
    shares_count: liveState.shares_count ?? liveState.shareCount ?? normalized.shares_count,
    current_reach: liveState.current_reach ?? liveState.reach ?? normalized.current_reach,
    reach: liveState.current_reach ?? liveState.reach ?? normalized.reach,
    clicks: liveState.clicks ?? liveState.link_actions ?? normalized.clicks,
    link_actions: liveState.clicks ?? liveState.link_actions ?? normalized.link_actions,
    message_clicks: liveState.message_clicks ?? normalized.message_clicks,
    visit_clicks: liveState.visit_clicks ?? normalized.visit_clicks,
    call_clicks: liveState.call_clicks ?? normalized.call_clicks,
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
      ad_like_locked: !!(merged.ad_like_locked ?? merged.ad_coin_collected),
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
        canShowCollectCoin={guardedCanShowCollectCoin || (() => false)}
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
        canShowCollectCoin={guardedCanShowCollectCoin}
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
      canShowCollectCoin={guardedCanShowCollectCoin || (() => false)}
      showSaveButton={source === "profile" && !!onToggleSave}
      onToggleSave={onToggleSave}
      isSaved={isSaved}
      showExpiryWarning={showExpiryWarning}
    />
  );
}
