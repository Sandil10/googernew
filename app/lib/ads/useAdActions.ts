"use client";

import type React from "react";
import { useMemo } from "react";
import { marketService } from "@/services/marketService";
import { NormalizedAd } from "./adTypes";
import { normalizeAdData } from "./adNormalizer";
import { useAdStore } from "./adStore";

type SheetType = "likes" | "comments" | "shares" | "views";
type Notification = { type: "error" | "success"; title?: string; message: string };

type UseAdActionsOptions = {
  currentUser?: any;
  viewerReady?: boolean;
  onBeforeLike?: (ad: NormalizedAd, liked: boolean) => void;
  onLikeConfirmed?: (ad: NormalizedAd, liked: boolean, expectedLiked: boolean) => void;
  onLikeReverted?: (ad: NormalizedAd, liked: boolean) => void;
  onShare?: (ad: NormalizedAd) => void;
  onOpenSheet?: (type: SheetType, ad: NormalizedAd) => void | Promise<void>;
  onCoinCollected?: (ad: NormalizedAd, collectionId: string | number, result: any) => void;
  onCoinError?: (ad: NormalizedAd, error: any) => void;
  onNeedCoinConfirmation?: (ad: NormalizedAd) => void;
  onAddToBag?: (
    ad: NormalizedAd,
    quantity?: number,
    variant?: any,
    size?: string | null,
    country?: string | null,
    variantIndex?: number | null,
  ) => void | Promise<void>;
  onSubscribe?: (ad: NormalizedAd) => void | Promise<void>;
  onNotify?: (notification: Notification) => void;
  canShowCollectCoin?: (ad: NormalizedAd) => boolean;
};

export const canShowCollectCoinButton = (target: NormalizedAd | any, currentUser?: any) => {
  const targetAd = target?.type ? target as NormalizedAd : (target ? normalizeAdData(target) : null);
  if (!targetAd) return false;

  const raw = targetAd.raw || targetAd;
  const liveAdState = useAdStore.getState().getAdState(raw);
  const isSponsored =
    !!raw.is_sponsored ||
    !!raw.isAd ||
    !!raw.campaign_type ||
    !!raw.adId ||
    !!raw.ad_id ||
    String(raw.id || targetAd.id || "").startsWith("ad-");
  const isLiked = !!(liveAdState.user_liked ?? targetAd.liked ?? raw.user_liked ?? raw.isLiked ?? raw.liked);
  const isCollected = !!(
    liveAdState.ad_coin_collected ??
    targetAd.coinCollected ??
    raw.ad_coin_collected ??
    raw.coin_collected ??
    raw.coinCollected ??
    raw.isCollected
  );
  const ownerId =
    targetAd.userId ||
    targetAd.user_id ||
    raw.user_id ||
    raw.userId ||
    raw.user?.id ||
    raw.owner_user_id ||
    raw.owner_id ||
    raw.seller_id;
  const currentUserId = currentUser?.id;
  const isOwn = !!currentUserId && !!ownerId && String(currentUserId) === String(ownerId);

  return isSponsored && !!currentUserId && isLiked && !isCollected && !isOwn;
};

const normalizeTarget = (fallback: NormalizedAd | null, target?: any): NormalizedAd | null => {
  const normalized = target && target.type
    ? target as NormalizedAd
    : target
      ? normalizeAdData(target)
      : fallback;

  if (!normalized) return null;

  const liveState = useAdStore.getState().getAdState(normalized.raw || normalized);
  const liked = liveState.user_liked ?? normalized.user_liked ?? normalized.liked;
  const likeCount = liveState.likes_count ?? normalized.likes_count ?? normalized.likeCount;
  const commentCount = liveState.comments_count ?? normalized.comments_count ?? normalized.commentCount;
  const shareCount = liveState.shares_count ?? normalized.shares_count ?? normalized.shareCount;
  const viewCount = liveState.views_count ?? normalized.views_count ?? normalized.viewCount;
  const coinCollected = liveState.ad_coin_collected ?? normalized.ad_coin_collected ?? normalized.coinCollected;

  return {
    ...normalized,
    liked: !!liked,
    user_liked: !!liked,
    likeCount: Number(likeCount || 0),
    likes_count: Number(likeCount || 0),
    commentCount: Number(commentCount || 0),
    comments_count: Number(commentCount || 0),
    shareCount: Number(shareCount || 0),
    shares_count: Number(shareCount || 0),
    viewCount: Number(viewCount || 0),
    views_count: Number(viewCount || 0),
    coinCollected: !!coinCollected,
    ad_coin_collected: !!coinCollected,
    raw: {
      ...(normalized.raw || {}),
      user_liked: !!liked,
      likes_count: Number(likeCount || 0),
      comments_count: Number(commentCount || 0),
      shares_count: Number(shareCount || 0),
      views_count: Number(viewCount || 0),
      ad_coin_collected: !!coinCollected,
      ad_like_locked: liveState.ad_like_locked ?? normalized.raw?.ad_like_locked,
    },
  };
};

const getEngagementRequestId = (targetAd: NormalizedAd) => {
  const raw = targetAd.raw || {};
  const isSponsored =
    !!raw.is_sponsored ||
    !!raw.isAd ||
    !!raw.campaign_type ||
    !!raw.adId ||
    !!raw.ad_id ||
    String(raw.id || "").startsWith("ad-");

  if (isSponsored) return targetAd.id;
  return raw.id ?? targetAd.targetId ?? targetAd.id;
};

export function useAdActions(ad?: NormalizedAd | any | null, options: UseAdActionsOptions = {}) {
  const normalizedAd = useMemo(() => (ad ? (ad.type ? ad as NormalizedAd : normalizeAdData(ad)) : null), [ad]);
  const updateAdState = useAdStore((state) => state.updateAdState);

  return useMemo(() => {
    const like = async (target?: any) => {
      const targetAd = normalizeTarget(normalizedAd, target);
      if (!targetAd?.id) return;

      if (options.viewerReady === false) {
        options.onNotify?.({
          type: "error",
          title: "Please Wait",
          message: "Your account session is still loading.",
        });
        return;
      }

      if (!options.currentUser?.id || !marketService.hasAuthToken()) {
        options.onNotify?.({
          type: "error",
          title: "Login Required",
          message: "Please log in again to like ads.",
        });
        return;
      }

      const wasLiked = targetAd.liked;
      const willBeLiked = !wasLiked;
      
      // Safety check for like locking (legacy logic)
      if (targetAd.raw?.ad_like_locked && wasLiked && !willBeLiked) {
        options.onNotify?.({
          type: "error",
          title: "Like Locked",
          message: "This ad cannot be unliked after the coin has been collected.",
        });
        return;
      }

      // Optimistic update in global store
      updateAdState(targetAd, (prev) => ({
        like_pending: true,
        user_liked: willBeLiked,
        likes_count: Math.max(0, (prev.likes_count ?? targetAd.likeCount ?? 0) + (willBeLiked ? 1 : -1))
      }));

      options.onBeforeLike?.(targetAd, willBeLiked);
      try {
        const serverLiked = await marketService.toggleLike(getEngagementRequestId(targetAd));
        const isLiked = !!serverLiked;
        
        // Sync with server result in store, including count correction if the server disagrees.
        updateAdState(targetAd, (prev) => ({
          like_pending: false,
          user_liked: isLiked,
          ad_like_locked: !!targetAd.raw?.ad_like_locked,
          likes_count: Math.max(
            0,
            (prev.likes_count ?? targetAd.likeCount ?? 0) + (isLiked === willBeLiked ? 0 : isLiked ? 1 : -1),
          ),
        }));
        
        options.onLikeConfirmed?.(targetAd, isLiked, willBeLiked);
      } catch (error) {
        // Revert in store
        updateAdState(targetAd, (prev) => ({
          like_pending: false,
          user_liked: wasLiked,
          ad_like_locked: (error as any)?.locked ? true : prev.ad_like_locked,
          likes_count: Math.max(0, (prev.likes_count ?? targetAd.likeCount ?? 0) + (wasLiked ? 1 : -1))
        }));

        if ((error as any)?.status === 401 || (error as any)?.unauthorized) {
          options.onNotify?.({
            type: "error",
            title: "Session Expired",
            message: "Please log in again to continue.",
          });
        }
        
        options.onLikeReverted?.(targetAd, wasLiked);
        throw error;
      }
    };

    const collectAdCoin = async (target?: any) => {
      const targetAd = normalizeTarget(normalizedAd, target);
      if (!targetAd?.id) return;

      const collectionId = targetAd.id; // interaction ID is ad-123
      try {
        const result = await marketService.collectAdCoin(getEngagementRequestId(targetAd));
        
        // Update global store
        updateAdState(targetAd, { ad_coin_collected: true, ad_like_locked: true });

        if (typeof window !== "undefined") {
          localStorage.setItem("googer-ad-coin-warning-seen", "1");
          window.dispatchEvent(new Event("googer-wallet-updated"));
        }
        options.onCoinCollected?.(targetAd, collectionId, result);
        return result;
      } catch (error) {
        options.onCoinError?.(targetAd, error);
        throw error;
      }
    };

    const handleAdCoinClick = (event: React.MouseEvent, target?: any) => {
      event.stopPropagation();
      const targetAd = normalizeTarget(normalizedAd, target);
      if (!targetAd) return;

      if (options.viewerReady === false) {
        options.onNotify?.({
          type: "error",
          title: "Please Wait",
          message: "Your account session is still loading.",
        });
        return;
      }

      if (!options.currentUser?.id) {
        options.onNotify?.({
          type: "error",
          title: "Login Required",
          message: "Please log in to collect ad coin rewards.",
        });
        return;
      }

      if (!marketService.hasAuthToken()) {
        options.onNotify?.({
          type: "error",
          title: "Session Expired",
          message: "Please log in again to collect ad coin rewards.",
        });
        return;
      }

      if (!canShowCollectCoinButton(targetAd, options.currentUser)) return;
      if (options.canShowCollectCoin && !options.canShowCollectCoin(targetAd)) return;

      options.onNeedCoinConfirmation?.(targetAd);
    };

    return {
      ad: normalizedAd,
      like,
      collectAdCoin,
      handleAdCoinClick,
      share: (target?: any) => {
        const targetAd = normalizeTarget(normalizedAd, target);
        if (targetAd) options.onShare?.(targetAd);
      },
      comment: (target?: any) => {
        const targetAd = normalizeTarget(normalizedAd, target);
        if (targetAd) options.onOpenSheet?.("comments", targetAd);
      },
      openSheet: (type: SheetType, target?: any) => {
        const targetAd = normalizeTarget(normalizedAd, target);
        if (targetAd) options.onOpenSheet?.(type, targetAd);
      },
      subscribe: (target?: any) => {
        const targetAd = normalizeTarget(normalizedAd, target);
        if (targetAd) options.onSubscribe?.(targetAd);
      },
      addToBag: (
        target?: any,
        quantity?: number,
        variant?: any,
        size?: string | null,
        country?: string | null,
        variantIndex?: number | null,
      ) => {
        const targetAd = normalizeTarget(normalizedAd, target);
        if (targetAd) options.onAddToBag?.(targetAd, quantity, variant, size, country, variantIndex);
      },
      canShowCollectCoin: (target?: any) => {
        const targetAd = normalizeTarget(normalizedAd, target);
        if (!targetAd || !canShowCollectCoinButton(targetAd, options.currentUser)) return false;
        return options.canShowCollectCoin ? options.canShowCollectCoin(targetAd) : true;
      },
    };
  }, [normalizedAd, options, updateAdState]);
}
