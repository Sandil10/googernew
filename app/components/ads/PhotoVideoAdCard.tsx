"use client";

import Image from "next/image";
import React from "react";
import IonIcon from "@/app/components/IonIcon";
import { useRelativeTime } from "@/app/lib/relativeTime";
import SubscribeButton from "@/app/components/SubscribeButton";
import { AdInteractionButton, AdInteractionType } from "./AdInteractionButton";
import {
    getAdPreviewImage,
    getSponsoredCallHref,
    getSponsoredCtaHref,
    getSponsoredLinkPreviewType,
    normalizeExternalUrl,
} from "./adHelpers";
import { getItemProfilePicture, getItemUsername } from "@/app/lib/userDisplay";
import {
    AD_CARD_IMAGE_SIZES,
    AVATAR_IMAGE_SIZES,
    FEED_IMAGE_BLUR_DATA_URL,
    HOME_FEED_IMAGE_SIZES,
    normalizeMediaSrc,
    shouldBypassNextImageOptimization,
} from "@/app/lib/mediaOptimization";
import { NormalizedAd } from "@/app/lib/ads/adTypes";

export type AdCardHandlers = {
    onOpenSecondView?: (ad: any) => void;
    onToggleLike: (adId: string | number) => void | Promise<void>;
    onOpenSheet: (type: AdInteractionType, ad: any) => void;
    onShare: (ad: any) => void;
    onLogView?: (ad: any) => void;
    onReport: (ad: any) => void;
    onNotInterested: (adId: string | number) => void;
    onCollectCoin: (event: React.MouseEvent, ad: any) => void;
    onNavigateToProfile: (event: React.MouseEvent, ad: any) => void;
    canShowCollectCoin: (ad: any) => boolean;
};

export type PhotoVideoAdCardProps = AdCardHandlers & {
    ad: NormalizedAd;
    source?: "home" | "shop";
    isMenuOpen: boolean;
    onToggleMenu: (adId: any) => void;
    onCloseMenu: () => void;
};

export function PhotoVideoAdCard({
    ad,
    source = "shop",
    isMenuOpen,
    onToggleMenu,
    onCloseMenu,
    onOpenSecondView,
    onToggleLike,
    onOpenSheet,
    onShare,
    onReport,
    onNotInterested,
    onCollectCoin,
    onNavigateToProfile,
    canShowCollectCoin,
}: PhotoVideoAdCardProps) {
    const raw = ad.raw || {};
    const activeLink = normalizeExternalUrl(raw.active_link || "");
    const previewType = getSponsoredLinkPreviewType(activeLink);
    const secondViewKind =
        previewType === "embed"
            ? "embed"
            : previewType === "video" || /video/i.test(String(raw.media_type || "")) || /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(String(raw.media_preview || raw.video_url || ""))
                ? "video"
                : "image";
    const previewImage = normalizeMediaSrc(ad.image || getAdPreviewImage(raw, previewType));
    const callHref = getSponsoredCallHref(raw);
    const ctaHref = getSponsoredCtaHref(raw.cta_topic, raw.cta_value);
    const ctaLabel = raw.cta_topic && raw.cta_topic !== "No Button" ? raw.cta_topic : "Visit";
    const secondaryCtaLabel = raw.cta_topic === "Call Now" ? "" : ctaLabel;
    const hasSecondaryCta = !!secondaryCtaLabel && raw.cta_topic !== "No Button";
    const showAdCoinButton = canShowCollectCoin(ad);
    const showSponsoredLinkPreview = !!activeLink;
    const advertiserName = getItemUsername(raw, "Sponsored");
    const advertiserImage = getItemProfilePicture(raw);
    const timeLabel = useRelativeTime(ad.createdAt, "just now");

    const handleSponsoredLinkOpen = (event: React.MouseEvent) => {
        event.stopPropagation();
        const href = ctaHref || activeLink;
        if (!href) return;
        window.open(href, "_blank", "noopener,noreferrer");
    };

    const handleLikeClick = () => {
        onToggleLike(ad.id);
    };

    return (
        <div className="group bg-[#1a1a1a] rounded-[1.5rem] md:rounded-[2.5rem] pb-4 md:pb-8 border border-white/5 hover:border-white/20 transition-all hover:shadow-2xl relative flex flex-col min-w-0">
            {showAdCoinButton && (
                <button
                    type="button"
                    onClick={(event) => {
                        event.stopPropagation();
                        onCollectCoin(event, ad);
                    }}
                    className="absolute right-3 top-[57px] z-[25] flex items-center gap-1.5 rounded-full border border-red-400/30 bg-red-600 px-2 py-1 text-[8px] font-black uppercase tracking-[0.1em] text-white shadow-xl transition hover:bg-red-500 active:scale-95 md:right-4 md:top-[62px]"
                    aria-label="Collect ad coin"
                >
                    <span className="flex h-6.5 w-6.5 items-center justify-center overflow-hidden rounded-full bg-white/12 ring-1 ring-white/10">
                        <Image
                            src="/assets/images/rupee.png"
                            alt="Ruppier coin"
                            width={28}
                            height={28}
                            className="h-[1.35rem] w-[1.35rem] object-contain contrast-110 brightness-110"
                            unoptimized
                        />
                    </span>
                    <span className="leading-none">Ruppier</span>
                </button>
            )}

            <header className="flex items-center justify-between gap-1 p-2 md:p-4 md:px-5">
                <div className="flex min-w-0 items-center gap-1">
                    <button
                        type="button"
                        className="relative shrink-0 overflow-hidden rounded-full border border-white/10 bg-white/10 transition hover:ring-2 hover:ring-white/20 w-5 h-5 md:w-8 md:h-8"
                        onClick={(event) => onNavigateToProfile(event, ad)}
                        aria-label="Open advertiser profile"
                    >
                        {advertiserImage ? (
                            <Image
                                src={normalizeMediaSrc(advertiserImage)}
                                alt="Profile"
                                fill
                                sizes={AVATAR_IMAGE_SIZES}
                                className="object-cover"
                                loading="lazy"
                                placeholder="blur"
                                blurDataURL={FEED_IMAGE_BLUR_DATA_URL}
                                unoptimized={shouldBypassNextImageOptimization(advertiserImage)}
                            />
                        ) : (
                            <span className="flex h-full w-full items-center justify-center bg-gradient-to-tr from-blue-700 to-purple-700">
                                <IonIcon name="person" className="text-white" />
                            </span>
                        )}
                    </button>
                    <div className="flex flex-col min-w-0">
                        <button
                            type="button"
                            onClick={(event) => onNavigateToProfile(event, ad)}
                            className="block truncate text-left font-black uppercase tracking-tight text-white transition hover:text-blue-400 text-[7px] md:text-[10px] leading-none"
                        >
                            {advertiserName}
                        </button>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="block font-bold text-slate-500 text-[5px] md:text-[7px] tracking-widest">
                                Ad
                            </span>
                            <div className="w-0.5 h-0.5 rounded-full bg-slate-700 shrink-0" />
                            <span className="block font-bold text-slate-500 text-[5px] md:text-[7px] tracking-widest">
                                {timeLabel}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="relative flex items-center gap-1">
                    <SubscribeButton userId={ad.user_id ?? ad.owner_user_id} initialIsSubscribed={false} size="small" />
                    <button
                        type="button"
                        onClick={(event) => {
                            event.stopPropagation();
                            onToggleMenu(ad.id);
                        }}
                        className="flex items-center justify-center rounded-full bg-white/5 text-white transition-all hover:bg-white/10 active:scale-75 w-5 h-5 md:w-8 md:h-8"
                        aria-label="Open ad options"
                    >
                        <div className="flex flex-col gap-0.5">
                            <div className="h-1 w-1 rounded-full bg-white" />
                            <div className="h-1 w-1 rounded-full bg-white" />
                        </div>
                    </button>
                    {isMenuOpen && (
                        <div className="absolute right-0 top-full z-30 mt-2 w-56 overflow-hidden rounded-2xl border border-white/10 bg-[#1a1a1a] py-2 shadow-2xl">
                            <button
                                type="button"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onNotInterested(ad.id);
                                    onCloseMenu();
                                }}
                                className="flex w-full items-center gap-3 px-4 py-3 text-left text-[11px] font-bold text-white transition-colors hover:bg-white/5"
                            >
                                <IonIcon name="eye-off-outline" className="text-lg text-slate-500" />
                                Not Interested
                            </button>
                            <button
                                type="button"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onShare(ad);
                                    onCloseMenu();
                                }}
                                className="flex w-full items-center gap-3 border-t border-white/5 px-4 py-3 text-left text-[11px] font-bold text-white transition-colors hover:bg-white/5"
                            >
                                <IonIcon name="share-social-outline" className="text-lg text-blue-400" />
                                Share Link
                            </button>
                            <button
                                type="button"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onReport(ad);
                                    onCloseMenu();
                                }}
                                className="flex w-full items-center gap-3 border-t border-white/5 px-4 py-3 text-left text-[11px] font-bold text-white transition-colors hover:bg-white/5"
                            >
                                <IonIcon name="alert-circle-outline" className="text-lg text-yellow-500" />
                                Report
                            </button>
                        </div>
                    )}
                </div>
            </header>

            <button
                type="button"
                onClick={(event) => {
                    event.stopPropagation();
                    onOpenSecondView(ad);
                }}
                className="block w-full text-left"
            >
                <div className={source === "home" ? "relative w-full aspect-[4/3] overflow-hidden rounded-[28px]" : "relative mx-2 mb-3 overflow-hidden rounded-[1.2rem] border border-white/5 bg-black shadow-inner md:rounded-[2rem] aspect-[2/1.1] lg:aspect-square"}>
                    <div className="relative h-full w-full">
                        {showSponsoredLinkPreview ? (
                            <div className="relative h-full w-full bg-[#0f1115]">
                                <Image
                                    src={previewImage}
                                    alt={ad.title || "Sponsored media"}
                                    fill
                                    sizes={source === "home" ? HOME_FEED_IMAGE_SIZES : AD_CARD_IMAGE_SIZES}
                                    quality={58}
                                    loading="lazy"
                                    placeholder="blur"
                                    blurDataURL={FEED_IMAGE_BLUR_DATA_URL}
                                    className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
                                    unoptimized={shouldBypassNextImageOptimization(previewImage)}
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/5 to-transparent" />
                                {(secondViewKind === "video" || secondViewKind === "embed") && (
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                        <span
                                            className="flex h-14 w-14 items-center justify-center rounded-full bg-white/92 text-black shadow-[0_18px_45px_rgba(0,0,0,0.45)]"
                                            aria-label="Play sponsored media"
                                        >
                                            <IonIcon name="play" className="ml-1 text-2xl" />
                                        </span>
                                    </div>
                                )}
                                {!!activeLink && (
                                    <div className="absolute bottom-0 left-0 right-0 border-t border-white/10 bg-[#dff0d6]/95 px-3 py-2 backdrop-blur-sm">
                                        <p className="overflow-hidden text-[10px] md:text-xs font-black leading-4 text-[#18220f] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] break-words">
                                            {ad.title || "Ad"}
                                        </p>
                                        <span className="mt-1 block w-full truncate text-left text-[9px] font-bold text-[#1d62ad] md:text-[11px]">
                                            {activeLink}
                                        </span>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <Image
                                src={previewImage}
                                alt={ad.title || "Sponsored media"}
                                fill
                                sizes={source === "home" ? HOME_FEED_IMAGE_SIZES : AD_CARD_IMAGE_SIZES}
                                quality={58}
                                loading="lazy"
                                placeholder="blur"
                                blurDataURL={FEED_IMAGE_BLUR_DATA_URL}
                                className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
                                unoptimized={shouldBypassNextImageOptimization(previewImage)}
                            />
                        )}
                    </div>
                </div>
            </button>

            <div className="px-4 pb-2 pt-4 md:px-6">
                <h2 className="overflow-hidden text-[13px] font-black leading-5 text-white [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] break-words md:text-[14px]">
                    {ad.title || "Sponsored post"}
                </h2>

                {ad.cta_topic !== "No Button" && (
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                        {ad.cta_topic === "Call Now" ? (
                            <button
                                type="button"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    if (!callHref) return;
                                    window.location.href = callHref;
                                }}
                                className={`rounded-full px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.14em] transition md:px-4 md:py-2 md:text-[10px] ${callHref ? "bg-white text-black hover:bg-slate-200 active:scale-95" : "cursor-default bg-white/10 text-white/35"}`}
                                disabled={!callHref}
                            >
                                Call Now
                            </button>
                        ) : hasSecondaryCta ? (
                            <button
                                type="button"
                                onClick={handleSponsoredLinkOpen}
                                className={`rounded-full px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.14em] transition md:px-4 md:py-2 md:text-[10px] ${(ctaHref || activeLink || ad.cta_topic === "Message") ? "bg-white text-black hover:bg-slate-200 active:scale-95" : "cursor-default bg-white/10 text-white/35"}`}
                                disabled={!ctaHref && !activeLink && ad.cta_topic !== "Message"}
                            >
                                {secondaryCtaLabel}
                            </button>
                        ) : null}
                    </div>
                )}

                <div className="mt-4 border-t border-white/5 pt-3">
                    <div className="flex items-center text-white/80 gap-5">
                        <AdInteractionButton
                            type="likes"
                            icon="heart-outline"
                            activeIcon="heart"
                            isActive={ad.liked}
                            count={ad.likeCount}
                            color="text-white/80"
                            activeColor="text-white"
                            onSingleClick={handleLikeClick}
                            onLongPress={() => onOpenSheet("likes", ad.raw || ad)}
                            iconSize="text-[21px]"
                        />
                        <AdInteractionButton
                            type="views"
                            icon="eye-outline"
                            activeIcon="eye"
                            count={ad.viewCount}
                            color="text-white/80"
                            activeColor="text-white"
                            onSingleClick={() => onOpenSheet("views", ad.raw || ad)}
                            onLongPress={() => onOpenSheet("views", ad.raw || ad)}
                            iconSize="text-[21px]"
                        />
                        <AdInteractionButton
                            type="comments"
                            icon="chatbubble-outline"
                            activeIcon="chatbubble"
                            count={ad.commentCount}
                            color="text-white/80"
                            activeColor="text-white"
                            onSingleClick={() => onOpenSheet("comments", ad.raw || ad)}
                            onLongPress={() => onOpenSheet("comments", ad.raw || ad)}
                            iconSize="text-[21px]"
                        />
                        <AdInteractionButton
                            type="shares"
                            icon="share-social-outline"
                            activeIcon="share-social"
                            count={ad.shareCount}
                            color="text-white/80"
                            activeColor="text-white"
                            onSingleClick={() => onShare(ad.raw || ad)}
                            onLongPress={() => onOpenSheet("shares", ad.raw || ad)}
                            iconSize="text-[21px]"
                        />
                    </div>
                </div>
            </div>

            {/* Reserved slot for future subscribe placement; currently unused for photo/video ads */}
            {false && ad.user_id && <SubscribeButton googId={ad.id} authorId={ad.user_id} authorName={advertiserName} />}
        </div>
    );
}
