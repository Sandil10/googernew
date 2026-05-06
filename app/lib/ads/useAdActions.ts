"use client";

import type React from "react";
import { useMemo } from "react";
import { marketService } from "@/services/marketService";
import { normalizeAd, type NormalizedAd } from "@/app/lib/ads/adSystem";

type SheetType = "likes" | "comments" | "shares" | "views";
type Notification = { type: "error" | "success"; title?: string; message: string };

type UseAdActionsOptions = {
  currentUser?: any;
  canCollectCoin?: (ad: NormalizedAd) => boolean;
  getCollectionId?: (ad: NormalizedAd) => string | number;
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
};

const defaultCollectionId = (ad: NormalizedAd) => {
  if (!ad?.is_sponsored) return ad?.id;
  return String(ad?.id || "").startsWith("ad-") ? ad.id : (ad?.adId ? `ad-${ad.adId}` : ad?.id);
};

const normalizeTarget = (fallback: NormalizedAd | null, target?: any) => normalizeAd(target || fallback || {});

export function useAdActions(ad?: NormalizedAd | any | null, options: UseAdActionsOptions = {}) {
  const normalizedAd = useMemo(() => (ad ? normalizeAd(ad) : null), [ad]);

  return useMemo(() => {
    const getCollectionId = options.getCollectionId || defaultCollectionId;

    const canShowCollectCoin = (target?: any) => {
      const targetAd = normalizeTarget(normalizedAd, target);
      if (options.canCollectCoin) return options.canCollectCoin(targetAd);
      return (
        !!targetAd?.is_sponsored &&
        !!targetAd?.user_liked &&
        !targetAd?.ad_coin_collected &&
        String(options.currentUser?.id || "") !== String(targetAd?.user_id || targetAd?.user?.id || "")
      );
    };

    const like = async (target?: any) => {
      const targetAd = normalizeTarget(normalizedAd, target);
      if (!targetAd?.id) return;

      const wasLiked = !!targetAd.user_liked;
      const willBeLiked = !wasLiked;
      if (targetAd?.ad_like_locked && wasLiked && !willBeLiked) {
        options.onNotify?.({
          type: "error",
          title: "Like Locked",
          message: "This ad cannot be unliked after the coin has been collected.",
        });
        return;
      }

      options.onBeforeLike?.(targetAd, willBeLiked);
      try {
        const serverLiked = await marketService.toggleLike(targetAd.id);
        options.onLikeConfirmed?.(targetAd, serverLiked, willBeLiked);
      } catch (error) {
        options.onLikeReverted?.(targetAd, wasLiked);
        throw error;
      }
    };

    const collectCoin = async (target?: any) => {
      const targetAd = normalizeTarget(normalizedAd, target);
      if (!targetAd?.is_sponsored) return;

      const collectionId = getCollectionId(targetAd);
      try {
        const result = await marketService.collectAdCoin(collectionId);
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

    const collectCoinClick = (event: React.MouseEvent, target?: any) => {
      event.stopPropagation();
      const targetAd = normalizeTarget(normalizedAd, target);
      if (!canShowCollectCoin(targetAd)) return;

      options.onNeedCoinConfirmation?.(targetAd);
    };

    return {
      ad: normalizedAd,
      like,
      collectCoin,
      collectCoinClick,
      canShowCollectCoin,
      share: (target?: any) => options.onShare?.(normalizeTarget(normalizedAd, target)),
      comment: (target?: any) => options.onOpenSheet?.("comments", normalizeTarget(normalizedAd, target)),
      openSheet: (type: SheetType, target?: any) => options.onOpenSheet?.(type, normalizeTarget(normalizedAd, target)),
      subscribe: (target?: any) => options.onSubscribe?.(normalizeTarget(normalizedAd, target)),
      addToBag: (
        target?: any,
        quantity?: number,
        variant?: any,
        size?: string | null,
        country?: string | null,
        variantIndex?: number | null,
      ) => options.onAddToBag?.(normalizeTarget(normalizedAd, target), quantity, variant, size, country, variantIndex),
    };
  }, [normalizedAd, options]);
}
