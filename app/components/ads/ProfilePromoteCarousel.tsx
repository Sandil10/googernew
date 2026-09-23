"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PromotedAdCard } from "@/app/components/ads/PromotedAdCard";
import { useAdStore } from "@/app/lib/ads/adStore";
import { getItemUsername } from "@/app/lib/userDisplay";
import { marketService } from "@/services/marketService";

type ProfilePromoteCarouselProps = {
  ads: any[];
  onProductClick: (product: any) => void;
  onContentClick?: (content: any) => void;
  onProfileClick: (ad: any) => void;
  className?: string;
  cardsPerView?: 2 | 3 | 4;
};

export function ProfilePromoteCarousel({
  ads,
  onProductClick,
  onContentClick,
  onProfileClick,
  className = "px-4 py-4 transition-colors sm:px-7",
  cardsPerView = 4,
}: ProfilePromoteCarouselProps) {
  const [profilePromoteIndex, setProfilePromoteIndex] = useState(0);
  const containerRef = useRef<HTMLElement>(null);
  const loggedExposureKeysRef = useRef(new Set<string>());
  const loggedViewIdsRef = useRef(new Set<string>());
  const lastScrollRotateRef = useRef(0);
  const [isInViewport, setIsInViewport] = useState(false);
  const [viewportExposureTick, setViewportExposureTick] = useState(0);
  const visibleCount = Math.max(2, Math.min(4, cardsPerView));
  const canSlide = ads.length > visibleCount;
  const visibleAds = useMemo(() => {
    if (!ads.length) return [];
    if (ads.length <= 1) return ads;
    const rotatedAds = [
      ...ads.slice(profilePromoteIndex % ads.length),
      ...ads.slice(0, profilePromoteIndex % ads.length),
    ];
    return canSlide
      ? rotatedAds.slice(0, visibleCount)
      : rotatedAds.slice(0, visibleCount);
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
      ([entry]) => {
        setIsInViewport(entry.isIntersecting);
        if (entry.isIntersecting) {
          setViewportExposureTick((tick) => tick + 1);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setProfilePromoteIndex((current) => (ads.length ? current % ads.length : 0));
  }, [ads.length]);

  useEffect(() => {
    if (!isInViewport || ads.length <= 1 || viewportExposureTick < 1) return;
    setProfilePromoteIndex((current) => (current + visibleCount + viewportExposureTick) % ads.length);
  }, [ads.length, isInViewport, viewportExposureTick, visibleCount]);

  useEffect(() => {
    if (ads.length <= 1 || typeof window === "undefined") return;
    const rotateOnScroll = () => {
      const now = Date.now();
      if (now - lastScrollRotateRef.current < 900) return;
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      const visible = rect.bottom > 80 && rect.top < viewportHeight - 80;
      if (!visible) return;
      lastScrollRotateRef.current = now;
      setProfilePromoteIndex((current) => (current + 1) % ads.length);
      setViewportExposureTick((tick) => tick + 1);
    };
    window.addEventListener("scroll", rotateOnScroll, { passive: true, capture: true });
    return () => window.removeEventListener("scroll", rotateOnScroll, { capture: true } as AddEventListenerOptions);
  }, [ads.length]);

  useEffect(() => {
    if (!visibleAds.length || !isInViewport) return;
    const updateAdState = useAdStore.getState().updateAdState;
    visibleAds.forEach((profileAd, offset) => {
      // Use the ad-prefixed ID so the backend routes this as a sponsored ad view
      const adId = profileAd?.adId || profileAd?.ad_id;
      const viewId = adId ? `ad-${adId}` : String(profileAd?.id || "");
      if (!viewId) return;
      const exposureKey = `${viewId}:${profilePromoteIndex}:${offset}:${viewportExposureTick}`;
      if (!loggedExposureKeysRef.current.has(exposureKey)) {
        loggedExposureKeysRef.current.add(exposureKey);
        void marketService.logAdImpression(viewId).then((result: any) => {
          if (!result?.success) return;
          updateAdState(profileAd, {
            impressions: Number(result.impressions ?? profileAd?.impressions ?? profileAd?.impressions_count ?? 0),
            impressions_count: Number(result.impressions ?? profileAd?.impressions ?? profileAd?.impressions_count ?? 0),
            current_reach: Number(result.current_reach ?? result.reach ?? profileAd?.current_reach ?? profileAd?.reach ?? 0),
            reach: Number(result.current_reach ?? result.reach ?? profileAd?.current_reach ?? profileAd?.reach ?? 0),
          });
        });
      }
      if (loggedViewIdsRef.current.has(viewId)) return;
      loggedViewIdsRef.current.add(viewId);
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
  }, [isInViewport, profilePromoteIndex, viewportExposureTick, visibleAds, visibleAdsKey]);

  if (!ads.length) return null;

  return (
    <article ref={containerRef} className={className}>
      <div className={`w-full overflow-hidden ${visibleCount === 4 ? "max-w-[1120px]" : "max-w-[620px]"}`}>
        <div className="mb-2 flex min-h-7 items-center justify-end gap-2 sm:mb-3">
          {canSlide && (
            <>
              <button
                type="button"
                onClick={() => setProfilePromoteIndex((current) => (current - 1 + ads.length) % ads.length)}
                className="hidden h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-black/45 text-xs font-black text-white shadow-lg shadow-black/30 transition hover:bg-white/10 active:scale-95 md:flex sm:h-8 sm:w-8 sm:text-sm"
                aria-label="Previous profile promote ads"
              >
                &lt;
              </button>
              <button
                type="button"
                onClick={() => setProfilePromoteIndex((current) => (current + 1) % ads.length)}
                className="hidden h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-black/45 text-xs font-black text-white shadow-lg shadow-black/30 transition hover:bg-white/10 active:scale-95 md:flex sm:h-8 sm:w-8 sm:text-sm"
                aria-label="Next profile promote ads"
              >
                &gt;
              </button>
            </>
          )}
        </div>
        <div className="hidden overflow-hidden md:block">
          <div className={`grid gap-3 lg:gap-4 ${visibleCount === 4 ? "grid-cols-4" : visibleCount === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
            {visibleAds.map((profileAd, profileAdIndex) => (
              <div key={`profile-promote-${profileAd.id}-${profileAdIndex}`} className="min-w-0 overflow-hidden rounded-[1.1rem]">
                <PromotedAdCard
                  ad={profileAd}
                  compact
                  onProductClick={onProductClick}
                  onContentClick={onContentClick}
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
        <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden">
          <div className="flex snap-x snap-mandatory gap-2">
            {visibleAds.map((profileAd, profileAdIndex) => (
              <div
                key={`profile-promote-mobile-${profileAd.id}-${profileAdIndex}`}
                className="min-w-[calc((100%_-_0.5rem)/2)] max-w-[calc((100%_-_0.5rem)/2)] snap-start overflow-hidden rounded-[1.1rem]"
              >
                <PromotedAdCard
                  ad={profileAd}
                  compact
                  onProductClick={onProductClick}
                  onContentClick={onContentClick}
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
