
"use client";

import Image from "next/image";
import RupieerCoinButton from "./RupieerCoinButton";
import React from "react";
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
    getSponsoredSocialEmbedUrl,
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
    onDeleteAd?: (ad: any) => void | Promise<void>;
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

const isRunningAdStatus = (value: unknown) => {
    const status = String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ");
    return status === "active" || status === "running" || status === "approved";
};

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
    onDeleteAd,
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
    // Subscribe directly to store so button state reacts immediately on first like
    const interactionId = getAdInteractionId(ad.raw || ad);
    const liveState = useAdStore((state) => state.adStates[interactionId] || EMPTY_OBJECT_PHOTO);
    const likePending = !!liveState.like_pending;
    const displayLiked = liveState.user_liked ?? !!ad.liked;
    const displayCoinCollected = liveState.ad_coin_collected ?? !!ad.ad_coin_collected;

    const raw = ad.raw || {};
    const showRunningAdTag = isRunningAdStatus(ad.status || raw.status || raw.delivery_status || raw.deliveryStatus);
    const activeLink = normalizeExternalUrl(ad.active_link || raw.active_link || "");
    const previewType = getSponsoredLinkPreviewType(activeLink);
    const ctaTopic = ad.cta_topic || raw.cta_topic;
    const ctaValue = ad.cta_value || raw.cta_value;
    const mediaTypeText = String(ad.media_type || raw.media_type || "").toLowerCase();
    const uploadedVideoCandidate = String(
        ad.video ||
        (ad as any).video_url ||
        (ad as any).media_url ||
        raw.video_url ||
        raw.media_url ||
        raw.video ||
        raw.media_preview ||
        "",
    ).trim();
    const hasUploadedVideoMedia =
        /video/i.test(mediaTypeText) ||
        /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(uploadedVideoCandidate);
    // A link ad (no uploaded file) is playable too when the link is an
    // embeddable one — it just was not being detected here at all before,
    // so it silently fell through to "image" and never got a play affordance.
    const secondViewKind =
        hasUploadedVideoMedia
            ? "video"
            : previewType === "embed"
                ? "embed"
                : previewType === "video"
                    ? "video"
                    : "image";
    // The card shows the real, live embed player here too (not just once
    // opened) — YouTube/Instagram/etc. already draw their own play button,
    // share icon and branding once loaded, so no icon of ours is layered on
    // top. `pointer-events-none` keeps it a look-only preview: taps still
    // open the second view instead of interacting with the player directly.
    const embedUrl = secondViewKind === "embed" ? (getSponsoredSocialEmbedUrl(activeLink) || activeLink) : "";
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
        ((secondViewKind === "video" && raw.media_preview) ? raw.media_preview : "") ||
        // A link ad with no uploaded file at all — a bare .mp4/.webm link post —
        // had no source wired here, so the card fell through to an <Image> whose
        // "preview" was an unreliable third-party screenshot of the file URL,
        // which routinely failed to load. Playing the link itself is both more
        // reliable and is literally the ad's own video.
        (secondViewKind === "video" ? activeLink : "") ||
        "",
    ).trim();
    const videoPreviewSrc = rawVideoSource ? normalizeMediaSrc(rawVideoSource) : "";
    const canRenderVideoPreview = secondViewKind === "video" && !!videoPreviewSrc;
    // The "preview image" for a video ad is usually the video file itself
    // (there is no separate server-generated thumbnail) — passing that as
    // `poster` is an invalid image URL the browser just silently ignores, so
    // it did nothing. Only a genuinely different image is worth passing.
    const videoPosterImage = previewImage && previewImage !== videoPreviewSrc
        && !/\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(previewImage)
        ? previewImage
        : undefined;
    const callButtonClassName = getSponsoredCtaClassName("Call Now", !!callHref);
    const messageButtonClassName = getSponsoredCtaClassName("Message", !!advertiserId);
    const genericCtaButtonClassName = getSponsoredCtaClassName(ctaTopic, !!(ctaHref || activeLink));
    const trackAdClick = (actionType: "message" | "visit" | "call" = "visit") => {
        logSponsoredAdClick(ad.raw || ad, actionType);
    };

    // An embeddable link ad gets a red play badge so it reads as "opens a
    // video elsewhere" — an uploaded video keeps the white one since the
    // clip is already playing right here, nothing new to open.
    // An uploaded video file has no player of its own to show off yet (it is
    // just a poster frame here), so it still gets a plain play glyph. A link
    // ad renders its actual embed player below instead (see `embedUrl`),
    // which already draws its own play button — no icon of ours needed.
    // The Googer mark rather than a plain triangle, matching the button the
    // second view uses so the same control reads the same in both places. The
    // circle keeps its size: it is what makes the mark legible on any frame.
    const playOverlay = secondViewKind === "video" ? (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span
                className="flex h-14 w-14 items-center justify-center drop-shadow-[0_12px_24px_rgba(0,0,0,0.65)]"
                aria-label="Play sponsored media"
            >
                <Image
                    src="/assets/images/googer.png"
                    alt="Play"
                    width={36}
                    height={36}
                    className="h-9 w-9 object-contain"
                />
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
            window.location.assign(getPublicChatHref(advertiserUsername, participantId));
        }
    };

    const handleLikeClick = () => {
        if (likePending) return;
        // Read synchronously at click time — avoids stale reactive value between
        // Zustand set() and React's next render (the window where toast appeared on home feed)
        onToggleLike(ad);
    };

    return (
        <div className="relative group flex flex-col transition-all duration-500 hover:z-10 w-full">
        <div className="group relative flex min-w-0 cursor-pointer flex-col rounded-[1.5rem] border border-white/5 bg-[#1a1a1a] pb-2 transition-all hover:border-white/20 hover:shadow-2xl md:rounded-[2.5rem] md:pb-4">
            {showAdCoinButton && (
                <RupieerCoinButton
                    onClick={(event) => {
                        event.stopPropagation();
                        onCollectCoin(event, ad);
                    }}
                    className="absolute right-3 top-[57px] z-[25]"
                />
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
                            {showRunningAdTag ? (
                                <span className="text-[5px] md:text-[7px] text-slate-500 font-bold tracking-widest">Ad</span>
                            ) : (
                                <span className="text-[5px] md:text-[7px] text-slate-500 font-bold tracking-widest">
                                    <RelativeTime timestamp={ad.activeStartTime || ad.active_start_time || ad.startedAt || ad.started_at || raw.active_start_time || raw.activeStartTime || raw.started_at || raw.startedAt || ad.createdAt || ad.created_at || raw.created_at || raw.createdAt || raw.approved_at || raw.approvedAt || raw.updated_at || raw.updatedAt} />
                                </span>
                            )}
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
                                <IonIcon name="arrow-redo-outline" className="text-lg text-blue-400" />
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
                            {onDeleteAd && (
                                <button
                                    type="button"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        void onDeleteAd(ad);
                                        onCloseMenu();
                                    }}
                                    className="flex w-full items-center gap-3 border-t border-white/5 px-4 py-3 text-left text-[11px] font-bold text-red-300 transition-colors hover:bg-red-500/10"
                                >
                                    <IonIcon name="trash-outline" className="text-lg text-red-400" />
                                    Delete Ad
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
                {secondViewKind === "embed" && embedUrl ? (
                    <iframe
                        src={embedUrl}
                        title={ad.title || "Sponsored media"}
                        allow="autoplay; encrypted-media; picture-in-picture; accelerometer; gyroscope"
                        className="pointer-events-none absolute inset-0 h-full w-full border-0"
                    />
                ) : canRenderVideoPreview ? (
                    // Most of these ads have no separate server-generated
                    // thumbnail — the "preview image" IS the video file, which
                    // `videoPosterImage` already filtered out as an invalid
                    // poster. Left alone, `preload="metadata"` fetches only
                    // enough to know the video's length, not a paintable frame,
                    // so every video tile in the feed loaded solid black until
                    // played. `preload="auto"` fetches enough of the file to
                    // decode one, and the explicit seek on `loadedmetadata`
                    // (belt-and-suspenders with the `#t=` fragment, which some
                    // mobile browsers ignore) forces that frame to actually
                    // render rather than staying on frame zero.
                    <video
                        src={videoPreviewSrc.includes("#t=") ? videoPreviewSrc : `${videoPreviewSrc}#t=0.1`}
                        poster={videoPosterImage}
                        muted
                        playsInline
                        preload="auto"
                        onLoadedMetadata={(event) => {
                            const video = event.currentTarget;
                            try { video.currentTime = 0.1; } catch { /* not seekable yet */ }
                        }}
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
                    {/* An ad published with no description has nothing to say here.
                        Falling back to the word "Sponsored" put a label the
                        advertiser never wrote where their own text belongs; the
                        empty spacer keeps the CTA on the right either way. */}
                    {displayTitle ? (
                        <h2 className="overflow-hidden text-[9px] md:text-[12px] font-black leading-tight text-white [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] break-words uppercase tracking-tight group-hover:text-amber-400 transition-colors flex-1">
                            {displayTitle}
                        </h2>
                    ) : (
                        <div className="flex-1" />
                    )}
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
                                locked={!!liveState.like_locked_hint}
                                onSingleClick={handleLikeClick}
                                onLongPress={() => onOpenSheet("likes", ad.raw || ad)}
                            />
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
                            icon="arrow-redo-outline"
                            activeIcon="arrow-redo"
                            count={shareCount}
                            color="text-white"
                            activeColor="text-white"
                            onSingleClick={() => {
                                trackAdClick("visit");
                                onShare(ad.raw || ad);
                            }}
                            onLongPress={() => onOpenSheet("shares", ad.raw || ad)}
                        />
                        {showSaveButton && (
                            <div className="flex flex-col items-center gap-1">
                                <button
                                    type="button"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        // Swallowing the click at the limit meant nothing
                                        // happened at all — no request, so no limit notice
                                        // either, and the button just looked broken. The
                                        // handler is always called and it raises the notice.
                                        onToggleSave?.(ad.raw || ad);
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
                                {/* Basic allows no saved ads at all, so the icon is
                                    there but can never do anything. Say why under
                                    it rather than leaving a button that looks
                                    broken until it is tapped. */}
                                {saveAtLimit && !isSaved && (
                                    <p className="max-w-[60px] text-center text-[9px] font-semibold leading-tight text-white/45">
                                        Upgrade to save
                                    </p>
                                )}
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
