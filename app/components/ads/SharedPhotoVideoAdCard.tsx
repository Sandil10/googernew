"use client";

import Image from "next/image";
import React, { useState } from "react";
import IonIcon from "@/app/components/IonIcon";
import { RelativeTime } from "@/app/components/RelativeTime";
import SubscribeButton from "@/app/components/SubscribeButton";
import { AdInteractionButton, AdInteractionType } from "./AdInteractionButton";
import {
    getAdPreviewImage,
    getSponsoredCallHref,
    getSponsoredCtaHref,
    getSponsoredLinkPreviewType,
    normalizeExternalUrl,
} from "./adHelpers";
import { getItemProfilePicture } from "@/app/lib/userDisplay";
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
import { marketService } from "@/services/marketService";

export type AdCardHandlers = {
    onOpenSecondView?: (ad: any) => void;
    onToggleLike: (ad: any) => void | Promise<void>;
    onOpenSheet: (type: AdInteractionType, ad: any) => void;
    onShare: (ad: any) => void;
    onLogView?: (ad: any) => void;
    onReport: (ad: any) => void;
    onNotInterested: (adId: string | number) => void;
    onPromoteAgain?: (ad: any) => void | Promise<void>;
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
    const campaignType = String(ad.campaign_type || raw.campaign_type || "").trim().toLowerCase();
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
    const previewImage = normalizeMediaSrc(ad.image || getAdPreviewImage(raw, previewType));
    const callHref = getSponsoredCallHref(raw);
    const ctaHref = getSponsoredCtaHref(ctaTopic, ctaValue);
    const ctaLabel = ctaTopic && ctaTopic !== "No Button" ? ctaTopic : "Visit";
    const secondaryCtaLabel = ctaTopic === "Call Now" ? "" : ctaLabel;
    const hasSecondaryCta = !!secondaryCtaLabel && ctaTopic !== "No Button";
    const showAdCoinButton = displayLiked && !displayCoinCollected && canShowCollectCoin(ad);
    const showSponsoredLinkPreview = !!activeLink;
    const advertiserName = ad.username || ad.owner_username || raw.username || raw.owner_username || raw.ownerUsername || raw.user?.username || raw.user?.name || "Advertiser";
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
    const trackAdClick = (actionType: "message" | "visit" | "call") => {
        const clickId = ad.id || ad.adId || ad.ad_id || raw.id || raw.adId || raw.ad_id;
        if (!clickId) return;
        void marketService.logAdClick(clickId, actionType).then((result) => {
            if (!result?.success) return;
            useAdStore.getState().updateAdState(ad.raw || ad, {
                clicks: Number(result.clicks || result.link_actions || 0),
                link_actions: Number(result.link_actions || result.clicks || 0),
                message_clicks: Number(result.message_clicks || 0),
                visit_clicks: Number(result.visit_clicks || 0),
                call_clicks: Number(result.call_clicks || 0),
                current_reach: Number(result.current_reach ?? result.reach ?? 0),
                reach: Number(result.current_reach ?? result.reach ?? 0),
                views_count: Number(result.impressions || 0),
            });
        });
    };

    const playOverlay = (secondViewKind === "video" || secondViewKind === "embed") ? (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span
                className="flex h-14 w-14 items-center justify-center rounded-full bg-white/92 text-black shadow-[0_18px_45px_rgba(0,0,0,0.45)]"
                aria-label="Play sponsored media"
            >
                <IonIcon name="play" className="ml-1 text-2xl" />
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
            window.location.href = `/dashboard/chats?user=${encodeURIComponent(participantId)}`;
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
        <div className="group bg-[#1a1a1a] rounded-[1.5rem] md:rounded-[2.5rem] pb-4 md:pb-8 border border-white/5 hover:border-white/20 transition-all hover:shadow-2xl relative flex flex-col min-w-0 w-full">
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
                            className="block truncate text-left font-black normal-case tracking-tight text-white transition hover:text-blue-400 text-[7px] md:text-[10px] leading-none"
                        >
                            {advertiserName}
                        </button>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="block font-bold text-slate-500 text-[5px] md:text-[7px] tracking-widest">
                                Ad
                            </span>
                            <div className="w-0.5 h-0.5 rounded-full bg-slate-700 shrink-0" />
                            <span className="block font-bold text-slate-500 text-[5px] md:text-[7px] tracking-widest">
                                <RelativeTime timestamp={ad.activeStartTime || ad.active_start_time || raw.active_start_time || raw.activeStartTime || ad.createdAt || ad.created_at} />
                            </span>
                        </div>
                    </div>
                </div>

                <div className="relative flex items-center gap-1">
                    <SubscribeButton userId={advertiserId} initialIsSubscribed={false} size="small" />
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
                            {onPromoteAgain && (
                                <button
                                    type="button"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        void onPromoteAgain(ad.raw || ad);
                                        onCloseMenu();
                                    }}
                                    className="flex w-full items-center gap-3 border-t border-white/5 px-4 py-3 text-left text-[11px] font-bold text-white transition-colors hover:bg-white/5"
                                >
                                    <IonIcon name="megaphone-outline" className="text-lg text-emerald-400" />
                                    Promote
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

            <button
                type="button"
                onClick={(event) => {
                    event.stopPropagation();
                    if (onOpenSecondView) onOpenSecondView(ad);
                }}
                className="block w-full text-left"
            >
                <div className="relative mx-2 mb-3 overflow-hidden rounded-[1.2rem] border border-white/5 bg-black shadow-inner md:rounded-[2rem] aspect-[2/1.1] lg:aspect-square">
                    <div className="relative h-full w-full">
                        {showSponsoredLinkPreview ? (
                            <div className="relative h-full w-full bg-[#0f1115]">
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
                                <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/5 to-transparent" />
                                {playOverlay}
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
                            <>
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
                            </>
                        )}
                    </div>
                </div>
            </button>

            <div className="px-4 pb-2 pt-4 md:px-6">
                <h2 className="overflow-hidden text-[13px] font-black leading-5 text-white [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] break-words md:text-[14px]">
                    {isGenericTitle ? "" : displayTitle}
                </h2>

                {ctaTopic !== "No Button" && (
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                        {ctaTopic === "Call Now" ? (
                            <button
                                type="button"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    if (!callHref) return;
                                    trackAdClick("call");
                                    window.location.href = callHref;
                                }}
                                className={`rounded-full px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.14em] transition md:px-4 md:py-2 md:text-[10px] ${callHref ? "cursor-pointer bg-white text-black hover:bg-slate-200 active:scale-95" : "cursor-not-allowed bg-white/10 text-white/35"}`}
                                disabled={!callHref}
                            >
                                Call Now
                            </button>
                        ) : ctaTopic === "Message" ? (
                            <button
                                type="button"
                                onClick={handleMessageClick}
                                className="cursor-pointer rounded-full bg-white px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-black transition hover:bg-slate-200 active:scale-95 md:px-4 md:py-2 md:text-[10px]"
                                disabled={!advertiserId}
                            >
                                Message
                            </button>
                        ) : hasSecondaryCta ? (
                            <button
                                type="button"
                                onClick={handleSponsoredLinkOpen}
                                className={`rounded-full px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.14em] transition md:px-4 md:py-2 md:text-[10px] ${(ctaHref || activeLink || ctaTopic === "Message") ? "cursor-pointer bg-white text-black hover:bg-slate-200 active:scale-95" : "cursor-not-allowed bg-white/10 text-white/35"}`}
                                disabled={!ctaHref && !activeLink && ctaTopic !== "Message"}
                            >
                                {secondaryCtaLabel}
                            </button>
                        ) : null}
                    </div>
                )}

                <div className="mt-4 border-t border-white/5 pt-3">
                    <div className="flex items-center text-white/80 gap-5">
                        <div className="relative flex flex-col items-center">
                            <AdInteractionButton
                                type="likes"
                                icon="heart-outline"
                                activeIcon="heart"
                                isActive={displayLiked}
                                count={likeCount}
                                color="text-white/80"
                                activeColor="text-white"
                                onSingleClick={handleLikeClick}
                                onLongPress={() => onOpenSheet("likes", ad.raw || ad)}
                                iconSize="text-[21px]"
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
                            count={commentCount}
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
                            count={shareCount}
                            color="text-white/80"
                            activeColor="text-white"
                            onSingleClick={() => onShare(ad.raw || ad)}
                            onLongPress={() => onOpenSheet("shares", ad.raw || ad)}
                            iconSize="text-[21px]"
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
    );
}
