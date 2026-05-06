"use client";

import { useEffect, useState } from "react";
import { PromotedAdCard } from "@/app/components/ads/PromotedAdCard";
import { getItemUsername } from "@/app/lib/userDisplay";

type ProfilePromoteCarouselProps = {
  ads: any[];
  onProductClick: (product: any) => void;
  onProfileClick: (ad: any) => void;
  className?: string;
};

export function ProfilePromoteCarousel({
  ads,
  onProductClick,
  onProfileClick,
  className = "px-4 py-4 transition-colors sm:px-7",
}: ProfilePromoteCarouselProps) {
  const [profilePromoteIndex, setProfilePromoteIndex] = useState(0);

  useEffect(() => {
    setProfilePromoteIndex((current) => (ads.length ? current % ads.length : 0));
  }, [ads.length]);

  if (!ads.length) return null;

  const canSlide = ads.length > 3;
  const visibleAds = canSlide
    ? Array.from({ length: 3 }, (_, offset) => ads[(profilePromoteIndex + offset) % ads.length])
    : ads.slice(0, 3);

  return (
    <article className={className}>
      <div className="mx-auto w-full max-w-[828px]">
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
          <div className="flex gap-3">
            {visibleAds.map((profileAd) => (
              <PromotedAdCard
                key={`profile-promote-${profileAd.id}`}
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
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}
