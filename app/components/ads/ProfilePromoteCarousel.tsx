"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PromotedAdCard } from "@/app/components/ads/PromotedAdCard";
import { useAdStore } from "@/app/lib/ads/adStore";
import { getItemUsername } from "@/app/lib/userDisplay";
import { marketService } from "@/services/marketService";

type ProfilePromoteCarouselProps = {
  ads: any[];
  onProductClick: (product: any) => void;
  onProfileClick: (ad: any) => void;
  className?: string;
  cardsPerView?: 2 | 3 | 4;
};

export function ProfilePromoteCarousel({
  ads,
  onProductClick,
  onProfileClick,
  className = "px-4 py-4 transition-colors sm:px-7",
  cardsPerView = 3,
}: ProfilePromoteCarouselProps) {
  const [profilePromoteIndex, setProfilePromoteIndex] = useState(0);
  const containerRef = useRef<HTMLElement>(null);
  const [isInViewport, setIsInViewport] = useState(false);
  const visibleCount = Math.max(2, Math.min(4, cardsPerView));
  const canSlide = ads.length > visibleCount;
  const visibleAds = useMemo(() => {
    if (!ads.length) return [];
    return canSlide
      ? Array.from({ length: visibleCount }, (_, offset) => ads[(profilePromoteIndex + offset) % ads.length])
      : ads.slice(0, visibleCount);
  }, [ads, canSlide, profilePromoteIndex, visibleCount]);
  const visibleAdsKey = visibleAds
    .map((profileAd) => String(profileAd?.id || profileAd?.adId || profileAd?.ad_id || ""))
    .join("|");

  // Only log views once the carousel has actually scrolled into the viewport
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setIsInViewport(true); // SSR / old-browser fallback
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsInViewport(true); },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setProfilePromoteIndex((current) => (ads.length ? current % ads.length : 0));
  }, [ads.length]);

  useEffect(() => {
    if (!visibleAds.length || !isInViewport) return;
    const updateAdState = useAdStore.getState().updateAdState;
    visibleAds.forEach((profileAd) => {
      // Use the ad-prefixed ID so the backend routes this as a sponsored ad view
      const adId = profileAd?.adId || profileAd?.ad_id;
      const viewId = adId ? `ad-${adId}` : String(profileAd?.id || "");
      if (!viewId) return;
      void marketService.logAdImpression(viewId).then((result: any) => {
        if (!result?.success) return;
        updateAdState(profileAd, {
          impressions: Number(result.impressions ?? profileAd?.impressions ?? profileAd?.impressions_count ?? 0),
          impressions_count: Number(result.impressions ?? profileAd?.impressions ?? profileAd?.impressions_count ?? 0),
          current_reach: Number(result.current_reach ?? result.reach ?? profileAd?.current_reach ?? profileAd?.reach ?? 0),
          reach: Number(result.current_reach ?? result.reach ?? profileAd?.current_reach ?? profileAd?.reach ?? 0),
        });
      });
      void marketService.logView(viewId).then((result: any) => {
        if (!result?.success) return;
        const nextViewsCount = Number(
          result.views_count ??
          result.viewCount ??
          result.views ??
          profileAd?.views_count ??
          profileAd?.viewCount ??
          0
        );
        updateAdState(profileAd, {
          views_count: nextViewsCount,
          viewCount: nextViewsCount,
          current_reach: Number(result.current_reach ?? result.reach ?? 0),
          reach: Number(result.current_reach ?? result.reach ?? 0),
          clicks: Number(result.clicks || result.link_actions || 0),
          link_actions: Number(result.link_actions || result.clicks || 0),
          message_clicks: Number(result.message_clicks || 0),
          visit_clicks: Number(result.visit_clicks || 0),
          call_clicks: Number(result.call_clicks || 0),
        });
      });
    });
  }, [isInViewport, visibleAds, visibleAdsKey]);

  if (!ads.length) return null;

  return (
    <article ref={containerRef} className={className}>
      <div className="mx-auto w-full max-w-[1120px]">
        <div className="mb-3 flex items-center justify-end gap-2">
          {canSlide && (
            <>
              <button
                type="button"
                onClick={() => setProfilePromoteIndex((current) => (current - 1 + ads.length) % ads.length)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm font-black text-white transition hover:bg-white/10 active:scale-95"
                aria-label="Previous profile promote ads"
              >
                &lt;
              </button>
              <button
                type="button"
                onClick={() => setProfilePromoteIndex((current) => (current + 1) % ads.length)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm font-black text-white transition hover:bg-white/10 active:scale-95"
                aria-label="Next profile promote ads"
              >
                &gt;
              </button>
            </>
          )}
        </div>
        <div className="overflow-hidden">
          <div className={`grid gap-4 ${visibleCount === 2 ? "grid-cols-2" : visibleCount === 4 ? "grid-cols-4" : "grid-cols-3"}`}>
            {visibleAds.map((profileAd) => (
              <div key={`profile-promote-${profileAd.id}`} className="min-w-0">
                <PromotedAdCard
                  ad={profileAd}
                  onProductClick={onProductClick}
                  onProfileClick={(clickedAd) => {
                    if (clickedAd) {
                      onProfileClick(clickedAd);
                      return;
                    }
                    onProfileClick({ ...profileAd, username: getItemUsername(profileAd, "Advertiser") });
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}
