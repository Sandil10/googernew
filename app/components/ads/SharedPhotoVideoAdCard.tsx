
"use client";

import Image from "next/image";
import React, { useState } from "react";
import IonIcon from "@/app/components/IonIcon";
import { RelativeTime } from "@/app/components/RelativeTime";
import SubscribeButton from "@/app/components/SubscribeButton";
import { AdInteractionButton, AdInteractionType } from "./AdInteractionButton";
import {
    getAdPreviewImage,
    getSponsoredAdImages,
    getSponsoredCallHref,
    getSponsoredCtaClassName,
    getSponsoredCtaHref,
    getSponsoredLinkPreviewType,
    normalizeExternalUrl,
} from "./adHelpers";
import { getItemProfilePicture } from "@/app/lib/userDisplay";
import { UserVerifiedBadge } from "@/app/components/VerifiedBadge";
import {
    AD_CARD_IMAGE_SIZES,
    AVATAR_IMAGE_SIZES,
    FEED_IMAGE_BLUR_DATA_URL,
    normalizeMediaSrc,
    shouldBypassNextImageOptimization,
} from "@/app/lib/mediaOptimization";
import { NormalizedAd } from "@/app/lib/ads/adTypes";
import { useAdStore } from "@/app/lib/ads/adStore";
import { getAdInteractionId } from "@/app/lib/ads/adIdentity";
import { logSponsoredAdClick } from "@/app/lib/ads/adClickTracking";
import { getPublicChatHref } from "@/app/lib/profileRoute";

export type AdCardHandlers = {
    onOpenSecondView?: (ad: any) => void;
    onToggleLike: (ad: any) => void | Promise<void>;
    onOpenSheet: (type: AdInteractionType, ad: any) => void;
    onShare: (ad: any) => void;
    onLogView?: (ad: any) => void;
    onReport: (ad: any) => void;
    onNotInterested: (adId: string | number) => void;
    onPromoteAgain?: (ad: any) => void | Promise<void>;
    promoteAgainLabel?: string;
    onCollectCoin: (event: React.MouseEvent, ad: any) => void;
    onNavigateToProfile: (event: React.MouseEvent, ad: any) => void;
    canShowCollectCoin: (ad: any) => boolean;
};

export type SharedPhotoVideoAdCardProps = AdCardHandlers & {
    ad: NormalizedAd;
    isMenuOpen: boolean;
    onToggleMenu: (adId: any) => void;
    onCloseMenu: () => void;
    showSaveButton?: boolean;
    onToggleSave?: (ad: any) => void | Promise<void>;
    isSaved?: boolean;
    saveAtLimit?: boolean;
    showExpiryWarning?: boolean;
};

const EMPTY_OBJECT_PHOTO = {};

export function SharedPhotoVideoAdCard({
    ad,
    isMenuOpen,
    onToggleMenu,
    onCloseMenu,
    onOpenSecondView,
    onToggleLike,
    onOpenSheet,
    onShare,
    onReport,
    onNotInterested,
    onPromoteAgain,
    promoteAgainLabel = "Promote Again",
    onCollectCoin,
    onNavigateToProfile,
    canShowCollectCoin,
    showSaveButton,
    onToggleSave,
    isSaved,
    saveAtLimit,
    showExpiryWarning,
}: SharedPhotoVideoAdCardProps) {
    const [likeLockMessage, setLikeLockMessage] = useState(false);

    // Subscribe directly to store so button state reacts immediately on first like
    const interactionId = getAdInteractionId(ad.raw || ad);
    const liveState = useAdStore((state) => state.adStates[interactionId] || EMPTY_OBJECT_PHOTO);
    const likePending = !!liveState.like_pending;
    const displayLiked = liveState.user_liked ?? !!ad.liked;
    const displayCoinCollected = liveState.ad_coin_collected ?? !!ad.ad_coin_collected;
    const displayLikeLocked = !!(liveState.ad_like_locked ?? ad.ad_like_locked ?? displayCoinCollected);

    const raw = ad.raw || {};
    const activeLink = normalizeExternalUrl(ad.active_link || raw.active_link || "");
    const previewType = getSponsoredLinkPreviewType(activeLink);
    const ctaTopic = ad.cta_topic || raw.cta_topic;
    const ctaValue = ad.cta_value || raw.cta_value;
    const secondViewKind =
        previewType === "embed"
            ? "embed"
            : previewType === "video" || /video/i.test(String(ad.media_type || raw.media_type || "")) || /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(String(raw.media_preview || raw.video_url || ""))
                ? "video"
                : "image";
    const resolvedPreviewImage = getSponsoredAdImages(ad.raw || ad, ad.image || getAdPreviewImage(raw, previewType))[0]
        || ad.image
        || getAdPreviewImage(raw, previewType);
    const previewImage = normalizeMediaSrc(resolvedPreviewImage);
    const callHref = getSponsoredCallHref(raw);
    const ctaHref = getSponsoredCtaHref(ctaTopic, ctaValue);
    const ctaLabel = ctaTopic && ctaTopic !== "No Button" ? ctaTopic : "Visit";
    const secondaryCtaLabel = ctaTopic === "Call Now" ? "" : ctaLabel;
    const hasSecondaryCta = !!secondaryCtaLabel && ctaTopic !== "No Button";
    const showAdCoinButton = displayLiked && !displayCoinCollected && canShowCollectCoin(ad);
    const advertiserUsername = ad.username || ad.owner_username || raw.username || raw.owner_username || raw.ownerUsername || raw.user?.username || "";
    const advertiserName = advertiserUsername || raw.user?.name || "Advertiser";
    const advertiserImage = ad.profile_picture || raw.profile_picture || raw.profilePicture || raw.owner_profile_picture || raw.ownerProfilePicture || raw.user?.profile_picture || raw.user?.profilePicture || getItemProfilePicture(raw);
    const advertiserId = ad.userId || ad.user_id || raw.user_id || raw.userId || raw.owner_user_id || raw.ownerUserId || raw.user?.id;
    const displayTitle = String(ad.title || raw.title || raw.caption || "").trim();
    const isGenericTitle = /^(Sponsored(?: post)?|Ad)$/i.test(displayTitle);

    const likeCount = Number(ad.likeCount ?? ad.likes_count ?? raw.likes_count ?? raw.likeCount ?? 0);
    const viewCount = Number(ad.viewCount ?? ad.views_count ?? raw.views_count ?? raw.viewCount ?? 0);
    const commentCount = Number(ad.commentCount ?? ad.comments_count ?? raw.comments_count ?? raw.commentCount ?? 0);
    const shareCount = Number(ad.shareCount ?? ad.shares_count ?? raw.shares_count ?? raw.shareCount ?? 0);
    const rawVideoSource = String(
        ad.video ||
        (ad as any).video_url ||
        (ad as any).media_url ||
        ad.media_preview ||
        raw.video_url ||
        raw.media_url ||
        raw.video ||
        ((secondViewKind === "video" && previewType === "video") ? activeLink : "") ||
        ((secondViewKind === "video" && raw.media_preview) ? raw.media_preview : "") ||
        "",
    ).trim();
    const videoPreviewSrc = rawVideoSource ? normalizeMediaSrc(rawVideoSource) : "";
    const canRenderVideoPreview = secondViewKind === "video" && !!videoPreviewSrc;
    const callButtonClassName = getSponsoredCtaClassName("Call Now", !!callHref);
    const messageButtonClassName = getSponsoredCtaClassName("Message", !!advertiserId);
    const genericCtaButtonClassName = getSponsoredCtaClassName(ctaTopic, !!(ctaHref || activeLink));
    const trackAdClick = (actionType: "message" | "visit" | "call" = "visit") => {
        logSponsoredAdClick(ad.raw || ad, actionType);
    };

    const playOverlay = (secondViewKind === "video" || secondViewKind === "embed") ? (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span
                className="flex h-14 w-14 items-center justify-center rounded-full bg-white/92 shadow-[0_18px_45px_rgba(0,0,0,0.45)]"
                aria-label="Play sponsored media"
            >
                {/* Inline SVG so CSS `color` property cannot override the fill */}
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" style={{ marginLeft: 3 }}>
                    <path d="M8 5v14l11-7z" fill="#000000" />
                </svg>
            </span>
        </div>
    ) : null;

    const handleSponsoredLinkOpen = (event: React.MouseEvent) => {
        event.stopPropagation();
        const href = ctaHref || activeLink;
        if (!href) return;
        trackAdClick("visit");
        window.open(href, "_blank", "noopener,noreferrer");
    };

    const handleMessageClick = (event: React.MouseEvent) => {
        event.stopPropagation();
        const participantId = String(advertiserId || "").trim();
        if (!participantId) return;
        trackAdClick("message");
        if (typeof window !== "undefined") {
            window.location.href = getPublicChatHref(advertiserUsername, participantId);
        }
    };

    const handleLikeClick = () => {
        if (likePending) return;
        // Read synchronously at click time — avoids stale reactive value between
        // Zustand set() and React's next render (the window where toast appeared on home feed)
        const freshState = useAdStore.getState().getAdState(ad.raw || ad);
        const isLocked = !!(freshState.ad_like_locked ?? freshState.ad_coin_collected ?? displayLikeLocked);
        const isLiked = !!(freshState.user_liked ?? displayLiked);
        if (isLiked && isLocked) {
            setLikeLockMessage(true);
            setTimeout(() => setLikeLockMessage(false), 3000);
            return;
        }
        onToggleLike(ad);
    };

    return (
        <div className="relative group flex flex-col transition-all duration-500 hover:z-10 w-full">
        <div className="group relative flex min-w-0 cursor-pointer flex-col rounded-[1.5rem] border border-white/5 bg-[#1a1a1a] pb-2 transition-all hover:border-white/20 hover:shadow-2xl md:rounded-[2.5rem] md:pb-4">
            {showAdCoinButton && (
                <button
                    type="button"
                    onClick={(event) => {
                        event.stopPropagation();
                        onCollectCoin(event, ad);
                    }}
                    className="absolute right-3 top-[57px] z-[25] flex items-center gap-1.5 rounded-full border border-red-400/30 bg-red-600 px-2 py-1 text-[8px] font-black uppercase tracking-[0.1em] text-white shadow-xl transition hover:bg-red-500 active:scale-95"
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

            <header className="flex items-center justify-between gap-1 p-1.5 md:p-3 md:px-4">
                <div className="group/profile flex min-w-0 items-center gap-1" onClick={(event) => event.stopPropagation()}>
                    <div
                        onClick={(event) => { trackAdClick("visit"); onNavigateToProfile(event, ad); }}
                        className="relative flex h-5 w-5 flex-shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-white/10 bg-gradient-to-tr from-blue-600 to-purple-600 text-[7px] text-white shadow-lg transition-all group-hover/profile:border-white/40 md:h-8 md:w-8 md:text-[10px]"
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
                            <IonIcon name="person" className="text-white" />
                        )}
                    </div>
                    <div className="flex flex-col min-w-0">
                        <span
                            onClick={(event) => { trackAdClick("visit"); onNavigateToProfile(event, ad); }}
                            className="flex items-center gap-1 text-[7px] md:text-[10px] text-white font-black normal-case tracking-tight truncate leading-none group-hover/profile:text-blue-400 transition-colors cursor-pointer"
                        >
                            {advertiserName}
                            {advertiserId && <UserVerifiedBadge userId={advertiserId} size={12} />}
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[5px] md:text-[7px] text-slate-500 font-bold tracking-widest">
                                <RelativeTime timestamp={ad.activeStartTime || ad.active_start_time || raw.active_start_time || raw.activeStartTime || ad.createdAt || ad.created_at} />
                            </span>
                            <span className="text-[5px] md:text-[7px] text-slate-500 font-bold tracking-widest">Ad</span>
                        </div>
                    </div>
                </div>

                <div className="relative flex items-center gap-1">
                    <SubscribeButton userId={advertiserId} initialIsSubscribed={false} size="small" onBeforeSubscribeClick={() => trackAdClick("visit")} />
                    <button
                        type="button"
                        onClick={(event) => {
                            event.stopPropagation();
                            onToggleMenu(ad.id);
                        }}
                        className="light-theme-option-dots flex items-center justify-center rounded-full bg-white/5 text-white transition-all hover:bg-white/10 active:scale-75 w-5 h-5"
                        aria-label="Open ad options"
                    >
                        <div className="flex flex-col gap-0.5">
                            <div data-dot className="h-1 w-1 rounded-full" style={{ backgroundColor: "var(--theme-dot)" }} />
                            <div data-dot className="h-1 w-1 rounded-full" style={{ backgroundColor: "var(--theme-dot)" }} />
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
                            {onPromoteAgain && (
                                <button
                                    type="button"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        void onPromoteAgain(ad);
                                        onCloseMenu();
                                    }}
                                    className="flex w-full items-center gap-3 border-t border-white/5 px-4 py-3 text-left text-[11px] font-bold text-white transition-colors hover:bg-white/5"
                                >
                                    <IonIcon name="megaphone-outline" className="text-lg text-emerald-400" />
                                    {promoteAgainLabel}
                                </button>
                            )}
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

            <div
                onClick={(event) => { event.stopPropagation(); if (onOpenSecondView) onOpenSecondView(ad); }}
                className="relative mx-2 mb-1.5 overflow-hidden rounded-[1.2rem] border border-white/5 bg-black shadow-inner aspect-square cursor-pointer">
                {canRenderVideoPreview ? (
                    <video
                        src={videoPreviewSrc}
                        muted
                        playsInline
                        preload="metadata"
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                ) : (
                    <Image
                        src={previewImage}
                        alt={ad.title || "Sponsored media"}
                        fill
                        sizes={AD_CARD_IMAGE_SIZES}
                        quality={58}
                        loading="lazy"
                        placeholder="blur"
                        blurDataURL={FEED_IMAGE_BLUR_DATA_URL}
                        className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
                        unoptimized={shouldBypassNextImageOptimization(previewImage)}
                    />
                )}
                {playOverlay}
            </div>

            <div className="px-2.5 pb-1.5 pt-1">
                {/* Title row */}
                <div className="mb-1 flex items-start justify-between gap-1">
                    <h2 className="overflow-hidden text-[9px] md:text-[12px] font-black leading-tight text-white [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] break-words uppercase tracking-tight group-hover:text-amber-400 transition-colors flex-1">
                        {isGenericTitle ? advertiserName : displayTitle}
                    </h2>
                    {ctaTopic !== "No Button" && (
                        ctaTopic === "Call Now" ? (
                            <button
                                type="button"
                                onClick={(event) => { event.stopPropagation(); if (!callHref) return; trackAdClick("call"); window.location.href = callHref; }}
                                className={`relative z-10 shrink-0 rounded-xl px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.1em] transition ${callButtonClassName}`}
                                disabled={!callHref}
                            >Call Now</button>
                        ) : ctaTopic === "Message" ? (
                            <button
                                type="button"
                                onClick={handleMessageClick}
                                className={`relative z-10 shrink-0 rounded-xl px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.1em] transition ${messageButtonClassName}`}
                                disabled={!advertiserId}
                            >Message</button>
                        ) : hasSecondaryCta ? (
                            <button
                                type="button"
                                onClick={handleSponsoredLinkOpen}
                                className={`relative z-10 shrink-0 rounded-xl px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.1em] transition ${genericCtaButtonClassName}`}
                                disabled={!ctaHref && !activeLink}
                            >{secondaryCtaLabel}</button>
                        ) : null
                    )}
                </div>

                {/* CTA row — mirrors price+cart row in product card */}
                <div className="mt-1 border-t border-white/5 pt-0.5">
                    <div className="flex items-center justify-between text-white/80 w-full px-0.5">
                        <div className="relative flex flex-col items-center">
                            <AdInteractionButton
                                type="likes"
                                icon="heart-outline"
                                activeIcon="heart"
                                isActive={displayLiked}
                                count={likeCount}
                                color="text-white"
                                activeColor="text-white"
                                onSingleClick={handleLikeClick}
                                onLongPress={() => onOpenSheet("likes", ad.raw || ad)}
                            />
                            {likeLockMessage && (
                                <span className="absolute top-full mt-0.5 whitespace-nowrap rounded px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-red-400">
                                    Like locked
                                </span>
                            )}
                        </div>
                        <AdInteractionButton
                            type="views"
                            icon="eye-outline"
                            activeIcon="eye"
                            count={viewCount}
                            color="text-white"
                            activeColor="text-white"
                            onSingleClick={() => onOpenSheet("views", ad.raw || ad)}
                            onLongPress={() => onOpenSheet("views", ad.raw || ad)}
                        />
                        <AdInteractionButton
                            type="comments"
                            icon="chatbubble-outline"
                            activeIcon="chatbubble"
                            count={commentCount}
                            color="text-white"
                            activeColor="text-white"
                            onSingleClick={() => onOpenSheet("comments", ad.raw || ad)}
                            onLongPress={() => onOpenSheet("comments", ad.raw || ad)}
                        />
                        <AdInteractionButton
                            type="shares"
                            icon="share-social-outline"
                            activeIcon="share-social"
                            count={shareCount}
                            color="text-white"
                            activeColor="text-white"
                            onSingleClick={() => {
                                trackAdClick("visit");
                                onShare(ad.raw || ad);
                            }}
                            onLongPress={() => onOpenSheet("shares", ad.raw || ad)}
                            iconSize="text-sm opacity-90"
                        />
                        {showSaveButton && (
                            <div className="flex flex-col items-center gap-1">
                                <button
                                    type="button"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        if (!saveAtLimit || isSaved) onToggleSave?.(ad.raw || ad);
                                    }}
                                    aria-label={isSaved ? "Unsave ad" : saveAtLimit ? "Save limit reached" : "Save ad"}
                                    title={saveAtLimit && !isSaved ? "Ad save limit reached — upgrade your plan" : undefined}
                                    className={`flex h-8 w-8 items-center justify-center rounded-full border transition active:scale-90 ${
                                        isSaved
                                            ? "border-red-400/40 bg-red-500/15 text-red-400 hover:bg-red-500/25"
                                            : saveAtLimit
                                            ? "border-white/5 bg-white/3 text-white/20 cursor-not-allowed"
                                            : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-red-300"
                                    }`}
                                >
                                    <IonIcon
                                        name={isSaved ? "bookmark" : "bookmark-outline"}
                                        className="text-[21px]"
                                    />
                                </button>
                                {showExpiryWarning && (
                                    <p className="text-[9px] font-semibold text-amber-400/80 text-center leading-tight max-w-[60px]">
                                        {ad.type === "video" ? "Your video will be removed soon" : "Your photos will expire soon and will be deleted"}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
        </div>
    );
}
