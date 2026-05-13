"use client";

import { useEffect, useState } from "react";
import { PromotedAdCard } from "@/app/components/ads/PromotedAdCard";
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

  useEffect(() => {
    setProfilePromoteIndex((current) => (ads.length ? current % ads.length : 0));
  }, [ads.length]);

  if (!ads.length) return null;

  const visibleCount = Math.max(2, Math.min(4, cardsPerView));
  const canSlide = ads.length > visibleCount;
  const visibleAds = canSlide
    ? Array.from({ length: visibleCount }, (_, offset) => ads[(profilePromoteIndex + offset) % ads.length])
    : ads.slice(0, visibleCount);

  return (
    <article className={className}>
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
                    const clickId = clickedAd?.id || clickedAd?.adId || clickedAd?.ad_id || profileAd?.id || profileAd?.adId || profileAd?.ad_id;
                    if (clickId) void marketService.logAdClick(clickId);
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
