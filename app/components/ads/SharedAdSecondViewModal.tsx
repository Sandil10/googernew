"use client";

import Image from "next/image";
import RupieerCoinButton from "./RupieerCoinButton";
import React, { useEffect, useRef, useState } from "react";
import IonIcon from "@/app/components/IonIcon";
import SubscribeButton from "@/app/components/SubscribeButton";
import { RelativeTime } from "@/app/components/RelativeTime";
import { AdInteractionButton, AdInteractionType } from "./AdInteractionButton";
import {
    getAdPreviewImage,
    getSponsoredUploadedAdImages,
    getSponsoredCallHref,
    getSponsoredCtaClassName,
    getSponsoredCtaHref,
    getSponsoredSocialEmbedUrl,
    normalizeExternalUrl,
} from "./adHelpers";
import { useAdStore } from "@/app/lib/ads/adStore";
import { getAdInteractionId } from "@/app/lib/ads/adIdentity";
import { normalizeAdData } from "@/app/lib/ads/adNormalizer";
import { normalizeMediaSrc } from "@/app/lib/mediaOptimization";
import { logSponsoredAdClick } from "@/app/lib/ads/adClickTracking";
import { getPublicChatHref } from "@/app/lib/profileRoute";
import { UserVerifiedBadge } from "@/app/components/VerifiedBadge";

export type AdSecondViewKind = "image" | "video" | "embed";

export type AdSecondViewHandlers = {
    onClose: () => void;
    onToggleLike: (ad: any) => void | Promise<void>;
    onOpenSheet: (type: AdInteractionType, ad: any) => void;
    onShare: (ad: any) => void;
    onReport: (ad: any) => void;
    onNotInterested: (adId: string | number) => void;
    onDeleteAd?: (ad: any) => void | Promise<void>;
    onCollectCoin: (event: React.MouseEvent, ad: any) => void;
    onNavigateToProfile: (event: React.MouseEvent, ad: any) => void;
    canShowCollectCoin: (ad: any) => boolean;
};

export type SharedAdSecondViewModalProps = AdSecondViewHandlers & {
    ad: any;
    kind: AdSecondViewKind;
    images?: string[];
    onVideoWatchEligible?: (ad: any, watchedSeconds: number) => void;
    requiredWatchSeconds?: number;
};

const normalizeMediaUrl = (value: string) => {
    if (!value) return "";
    if (value.startsWith("/uploads/") || /^https?:\/\//i.test(value) || value.startsWith("data:")) return value;
    return value.includes("uploads") || value.includes("\\")
        ? `/uploads/${value.split(/[\\/]/).pop()}`
        : value;
};

const isRunningAdStatus = (value: unknown) => {
    const status = String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ");
    return status === "active" || status === "running" || status === "approved";
};

const EMPTY_AD_STATE = {};

export function SharedAdSecondViewModal({
    ad,
    kind,
    images: providedImages,
    onClose,
    onToggleLike,
    onOpenSheet,
    onShare,
    onReport,
    onNotInterested,
    onDeleteAd,
    onCollectCoin,
    onNavigateToProfile,
    canShowCollectCoin,
    onVideoWatchEligible,
    requiredWatchSeconds = 5,
}: SharedAdSecondViewModalProps) {
    // normalizeAdData throws on an unusable ad, and throwing during render
    // takes the whole page down with a client-side exception. Everything below
    // reads this optionally, so falling back to null degrades instead.
    const normalizedAd = React.useMemo(() => {
        try {
            return ad?.type ? ad : normalizeAdData(ad);
        } catch {
            return null;
        }
    }, [ad]);
    const raw = normalizedAd?.raw || {};
    const link = normalizeExternalUrl(normalizedAd?.active_link || raw.active_link || "");
    const ctaTopic = normalizedAd?.cta_topic || raw.cta_topic;
    const ctaValue = normalizedAd?.cta_value || raw.cta_value;
    const advertiserUsername = normalizedAd?.username || normalizedAd?.owner_username || raw.username || raw.owner_username || raw.ownerUsername || raw.user?.username || "";
    const advertiserName = advertiserUsername || raw.user?.name || "Advertiser";
    const advertiserImage = normalizedAd?.profile_picture || raw.profile_picture || raw.profilePicture || raw.owner_profile_picture || raw.ownerProfilePicture || raw.user?.profile_picture || raw.user?.profilePicture || "";
    const advertiserId = normalizedAd?.userId || normalizedAd?.user_id || raw.user_id || raw.userId || raw.owner_user_id || raw.ownerUserId || raw.user?.id;

    const images = React.useMemo(() => {
        const uploadedImages = getSponsoredUploadedAdImages(normalizedAd);
        const sourceImages = uploadedImages.length
            ? uploadedImages
            : providedImages && providedImages.length
                ? providedImages
                : [getAdPreviewImage(normalizedAd, "image")];

        const normalizedImages = sourceImages
            .map((item: any) => {
                if (typeof item === "string") return item.trim();
                if (item && typeof item === "object") {
                    return String(item.url || item.image_url || item.image || item.src || "").trim();
                }
                return "";
            })
            .map((item) => item ? normalizeMediaSrc(normalizeMediaUrl(item)) : "")
            .filter(Boolean);

        if (normalizedImages.length > 0) return Array.from(new Set(normalizedImages));

        const fallbackPreview = normalizeMediaSrc(normalizeMediaUrl(getAdPreviewImage(normalizedAd, "image") || ""));
        return fallbackPreview ? [fallbackPreview] : [];
    }, [normalizedAd, providedImages]);
    // Global live state connection
    const interactionId = getAdInteractionId(normalizedAd);
    // The fallback has to be one shared object. A fresh `{}` here is a new
    // reference on every read, which the store treats as a changed snapshot
    // and re-renders for — a loop that only bites once something else makes
    // this component render repeatedly, as playing a video now does.
    const liveState = useAdStore((state) => state.adStates[interactionId] || EMPTY_AD_STATE);
    const videoWatchEligibleSentRef = useRef(false);
    const videoWatchedMsRef = useRef(0);
    const videoWatchStartedAtRef = useRef<number | null>(null);
    // Drives the 5s / play-pause / 5s cluster over an uploaded ad video. The
    // browser's own controls are switched off: on a phone they add a second
    // play button and their own 10-second skips, so the frame ended up with
    // two sets of controls stacked on each other.
    const adVideoRef = useRef<HTMLVideoElement | null>(null);
    const [adVideoPaused, setAdVideoPaused] = useState(false);
    const [adVideoTime, setAdVideoTime] = useState(0);
    const [adVideoDuration, setAdVideoDuration] = useState(0);
    // Only the centre Googer pause/seek cluster is transient while playing.
    // The timeline and action rail stay visible; moving the mouse/touching
    // the video brings the centre cluster back immediately.
    const [showAdVideoControls, setShowAdVideoControls] = useState(true);
    const [showAdVideoCenterControls, setShowAdVideoCenterControls] = useState(true);
    const hideAdControlsTimeoutRef = useRef<number | null>(null);
    // Says why a forward skip did nothing, so a locked control does not just
    // read as broken.
    const [seekLockedHint, setSeekLockedHint] = useState(false);
    const seekHintTimeoutRef = useRef<number | null>(null);
    // Render-time mirror of the lock, so the forward button can show itself
    // as locked and then un-dim the moment the watch time is served. The refs
    // above are the source of truth; this only drives the styling.
    const [forwardSeekLocked, setForwardSeekLocked] = useState(true);

    const scheduleHideAdControls = (isPaused: boolean) => {
        if (hideAdControlsTimeoutRef.current !== null) {
            window.clearTimeout(hideAdControlsTimeoutRef.current);
            hideAdControlsTimeoutRef.current = null;
        }
        setShowAdVideoControls(true);
        setShowAdVideoCenterControls(true);
        if (!isPaused) {
            hideAdControlsTimeoutRef.current = window.setTimeout(() => {
                setShowAdVideoCenterControls(false);
            }, 1400);
        }
    };

    const revealAdControls = () => {
        setShowAdVideoControls(true);
        setShowAdVideoCenterControls(true);
        scheduleHideAdControls(adVideoRef.current?.paused ?? true);
    };

    useEffect(() => () => {
        if (hideAdControlsTimeoutRef.current !== null) {
            window.clearTimeout(hideAdControlsTimeoutRef.current);
        }
        if (seekHintTimeoutRef.current !== null) {
            window.clearTimeout(seekHintTimeoutRef.current);
        }
    }, []);

    const adVideoProgress = adVideoDuration > 0
        ? Math.min(100, (adVideoTime / adVideoDuration) * 100)
        : 0;

    const formatAdVideoTime = (value: number) => {
        const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
        const minutes = Math.floor(safeValue / 60);
        const seconds = Math.floor(safeValue % 60);
        return `${minutes}:${seconds.toString().padStart(2, "0")}`;
    };

    // Skipping ahead is how the coin gets earned without watching, so it is
    // the one direction held back until the required watch time has actually
    // been served. Rewind, pause and play stay free throughout.
    const watchedMsSoFar = () => {
        const runningSince = videoWatchStartedAtRef.current;
        return videoWatchedMsRef.current + (runningSince === null ? 0 : Date.now() - runningSince);
    };
    // A function, not a value: `isUploadedVideo` and the required seconds are
    // derived further down, and this has to read the watch clock at the
    // moment of the tap anyway rather than at render time.
    const isForwardSeekLocked = () => isUploadedVideo
        && !videoWatchEligibleSentRef.current
        && watchedMsSoFar() < safeRequiredWatchSeconds * 1000;

    const showSeekLockedHint = () => {
        setSeekLockedHint(true);
        if (seekHintTimeoutRef.current !== null) window.clearTimeout(seekHintTimeoutRef.current);
        seekHintTimeoutRef.current = window.setTimeout(() => setSeekLockedHint(false), 1600);
    };

    const seekAdVideoBy = (seconds: number) => {
        const video = adVideoRef.current;
        if (!video) return;
        if (seconds > 0 && isForwardSeekLocked()) {
            showSeekLockedHint();
            return;
        }
        const maxTime = Number.isFinite(video.duration) ? video.duration : 0;
        const target = Math.max(0, Math.min(maxTime, video.currentTime + seconds));
        video.currentTime = target;
        setAdVideoTime(target);
    };

    const toggleAdVideoPlay = () => {
        const video = adVideoRef.current;
        if (!video) return;
        if (video.paused) void video.play().catch(() => setAdVideoPaused(true));
        else video.pause();
    };

    // Fully merged live ad object for reactive second-view UI and collect-coin eligibility.
    const mergedAd = React.useMemo(() => {
        const liked = !!(liveState.user_liked ?? normalizedAd.user_liked ?? normalizedAd.liked);
        const likesCount = Number(liveState.likes_count ?? normalizedAd.likes_count ?? normalizedAd.likeCount ?? 0);
        const viewsCount = Number(liveState.views_count ?? normalizedAd.views_count ?? normalizedAd.viewCount ?? 0);
        const commentsCount = Number(liveState.comments_count ?? normalizedAd.comments_count ?? normalizedAd.commentCount ?? 0);
        const sharesCount = Number(liveState.shares_count ?? normalizedAd.shares_count ?? normalizedAd.shareCount ?? 0);
        const coinCollected = !!(liveState.ad_coin_collected ?? normalizedAd.ad_coin_collected ?? normalizedAd.coinCollected);

        return {
            ...normalizedAd,
            liked,
            user_liked: liked,
            likeCount: likesCount,
            likes_count: likesCount,
            views_count: viewsCount,
            viewCount: viewsCount,
            comments_count: commentsCount,
            commentCount: commentsCount,
            shares_count: sharesCount,
            shareCount: sharesCount,
            coinCollected,
            ad_coin_collected: coinCollected,
            raw: {
                ...(normalizedAd.raw || {}),
                user_liked: liked,
                likes_count: likesCount,
                views_count: viewsCount,
                comments_count: commentsCount,
                shares_count: sharesCount,
                ad_coin_collected: coinCollected,
            },
        };
    }, [liveState, normalizedAd]);
    const canShowCollectCoinButton = canShowCollectCoin(mergedAd);
    const showRunningAdTag = isRunningAdStatus(mergedAd.status || raw.status || raw.delivery_status || raw.deliveryStatus);
    const safeRequiredWatchSeconds = Math.max(1, Math.floor(Number(requiredWatchSeconds || 5)));
    const trackAdClick = () => logSponsoredAdClick(mergedAd, "visit");
    const callHref = getSponsoredCallHref(raw);
    const ctaHref = getSponsoredCtaHref(ctaTopic, ctaValue);
    const ctaLabel = ctaTopic && ctaTopic !== "No Button" ? ctaTopic : "Visit";
    const canUseMessage = !!advertiserId;
    const canUseGenericCta = !!(ctaHref || link);

    // Hoisted so the effect and onTimeUpdate handler can both reference it.
    const uploadedVideoCandidate = String(
        (mergedAd as any)?.media_url ||
        (mergedAd as any)?.video_url ||
        (mergedAd as any)?.video ||
        (mergedAd as any)?.media_preview ||
        raw?.media_preview ||
        raw?.media_url ||
        raw?.video_url ||
        raw?.video ||
        "",
    ).trim();
    const isUploadedVideo =
        /video/i.test(String(mergedAd?.media_type || raw?.media_type || "")) ||
        /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(uploadedVideoCandidate);

    // Only an uploaded video file is watch-timed; a link ad or an image is
    // free to scrub from the start.
    useEffect(() => {
        setForwardSeekLocked(isUploadedVideo && !videoWatchEligibleSentRef.current);
    }, [isUploadedVideo]);

    const [currentIndex, setCurrentIndex] = useState(0);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const swipeStartX = useRef<number | null>(null);
    const currentImage = images[currentIndex] || "";

    // Watch-time rule applies only to actual uploaded video files.
    // Image ads, image-link ads, and video-link ads count as viewed immediately on open.
    React.useEffect(() => {
        if (videoWatchEligibleSentRef.current) return;
        if (kind === "video" && isUploadedVideo) return;
        videoWatchEligibleSentRef.current = true;
        onVideoWatchEligible?.(mergedAd, 0);
    }, [isUploadedVideo, kind, mergedAd, onVideoWatchEligible]);

    const moveSlide = (direction: "prev" | "next") => {
        setCurrentIndex((prev) => {
            if (!images.length) return prev;
            const total = images.length;
            return direction === "next" ? (prev + 1) % total : (prev - 1 + total) % total;
        });
    };

    const renderCtaButton = () => {
        if (ctaTopic === "No Button") return null;

        if (ctaTopic === "Call Now") {
            return (
                <button
                    type="button"
                    onClick={(event) => {
                        event.stopPropagation();
                        if (!callHref) return;
                        logSponsoredAdClick(mergedAd, "call");
                        window.location.href = callHref;
                    }}
                    className={`rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] transition ${getSponsoredCtaClassName("Call Now", !!callHref)}`}
                    disabled={!callHref}
                >
                    Call Now
                </button>
            );
        }

        if (ctaTopic === "Message") {
            return (
                <button
                    type="button"
                    onClick={(event) => {
                        event.stopPropagation();
                        if (!advertiserId) return;
                        logSponsoredAdClick(mergedAd, "message");
                        window.location.href = getPublicChatHref(advertiserUsername, advertiserId);
                    }}
                    className={`rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] transition ${getSponsoredCtaClassName("Message", canUseMessage)}`}
                    disabled={!canUseMessage}
                >
                    Message
                </button>
            );
        }

        return (
            <button
                type="button"
                onClick={(event) => {
                    event.stopPropagation();
                    const href = ctaHref || link;
                    if (!href) return;
                    trackAdClick();
                    window.open(href, "_blank", "noopener,noreferrer");
                }}
                className={`rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] transition ${getSponsoredCtaClassName(ctaTopic, canUseGenericCta)}`}
                disabled={!canUseGenericCta}
            >
                {ctaLabel}
            </button>
        );
    };

    if (kind !== "image") {
        const uploadedVideoUrl = (isUploadedVideo && uploadedVideoCandidate)
            ? normalizeMediaUrl(uploadedVideoCandidate)
            : "";
        const videoUrl = uploadedVideoUrl || (kind === "video" ? link : "");
        const embedUrl = kind === "embed" ? (getSponsoredSocialEmbedUrl(link, true) || link) : "";

        return (
            <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/88 p-3 backdrop-blur-sm">
                <button
                    type="button"
                    onClick={onClose}
                    className="absolute inset-0"
                    aria-label="Close sponsored media preview"
                />
                <div className="relative z-10 w-full max-w-[760px] overflow-hidden rounded-[1.6rem] border border-white/10 bg-[#0f1013] shadow-[0_30px_90px_rgba(0,0,0,0.5)]">
                    <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                            <button
                                type="button"
                                onClick={(e) => { trackAdClick(); onNavigateToProfile(e, mergedAd); }}
                                className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full border border-white/10 bg-white/5 transition hover:border-blue-400/60"
                            >
                                {advertiserImage ? (
                                    <Image
                                        src={normalizeMediaSrc(advertiserImage)}
                                        alt={advertiserName}
                                        fill
                                        className="object-cover"
                                        unoptimized
                                    />
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center text-white/45">
                                        <IonIcon name="person" className="text-sm" />
                                    </div>
                                )}
                            </button>
                            <div className="min-w-0">
                                <button
                                    type="button"
                                    onClick={(e) => { trackAdClick(); onNavigateToProfile(e, mergedAd); }}
                                    className="flex min-w-0 items-center gap-1 truncate text-xs font-black tracking-[0.1em] text-white/88 transition hover:text-blue-400"
                                >
                                    <span className="truncate">{advertiserName}</span>
                                    {advertiserId && <UserVerifiedBadge userId={advertiserId} size={12} />}
                                </button>
                                <div className="mt-1 flex items-center gap-1.5">
                                    {showRunningAdTag ? (
                                        <span className="text-[9px] font-bold tracking-widest text-white/45">Ad</span>
                                    ) : (
                                        <span className="text-[9px] font-bold tracking-widest text-white/45">
                                            <RelativeTime timestamp={normalizedAd?.activeStartTime || normalizedAd?.active_start_time || normalizedAd?.startedAt || normalizedAd?.started_at || raw.active_start_time || raw.activeStartTime || raw.started_at || raw.startedAt || normalizedAd?.createdAt || normalizedAd?.created_at || raw.created_at || raw.createdAt || raw.approved_at || raw.approvedAt || raw.updated_at || raw.updatedAt} />
                                        </span>
                                    )}
                                </div>
                            </div>
                            {mergedAd?.title && (
                                <p className="hidden truncate text-xs font-bold text-white/35 md:block">
                                    {mergedAd.title}
                                </p>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            {renderCtaButton()}
                            {canShowCollectCoinButton && (
                                <RupieerCoinButton
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onCollectCoin(e, mergedAd);
                                    }}
                                />
                            )}
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white"
                            >
                                <IonIcon name="close" className="text-base" />
                            </button>
                        </div>
                    </div>
                    <div className="relative h-[68vh] min-h-[360px] w-full bg-black">
                        {kind === "embed" && embedUrl ? (
                            // The real YouTube/Instagram/TikTok/Facebook player already draws
                            // its own play button, share icon and branding once it loads —
                            // no icon of ours belongs on top of it.
                            <iframe
                                src={embedUrl}
                                title={mergedAd?.title || "Ad"}
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                allowFullScreen
                                className="h-full w-full border-0"
                            />
                        ) : videoUrl ? (
                            <>
                                <video
                                    ref={adVideoRef}
                                    src={videoUrl}
                                    controls={false}
                                    controlsList="nodownload"
                                    disablePictureInPicture
                                    autoPlay
                                    playsInline
                                    onClick={(event) => { event.stopPropagation(); revealAdControls(); }}
                                    onPlay={() => {
                                        // Scrubbing is permitted, but it must
                                        // never count as watching the ad.
                                        videoWatchStartedAtRef.current ??= Date.now();
                                        setAdVideoPaused(false);
                                        scheduleHideAdControls(false);
                                    }}
                                    onPause={() => {
                                        const startedAt = videoWatchStartedAtRef.current;
                                        if (startedAt !== null) {
                                            videoWatchedMsRef.current += Date.now() - startedAt;
                                            videoWatchStartedAtRef.current = null;
                                        }
                                        setAdVideoPaused(true);
                                        scheduleHideAdControls(true);
                                    }}
                                    onLoadedMetadata={(event) => {
                                        const nativeDuration = event.currentTarget.duration;
                                        setAdVideoDuration(Number.isFinite(nativeDuration) ? nativeDuration : 0);
                                    }}
                                    onTimeUpdate={(event) => {
                                        setAdVideoTime(event.currentTarget.currentTime || 0);
                                        if (!isUploadedVideo || videoWatchEligibleSentRef.current) return;
                                        const runningSince = videoWatchStartedAtRef.current;
                                        const watchedMs = videoWatchedMsRef.current +
                                            (runningSince === null ? 0 : Date.now() - runningSince);
                                        if (watchedMs < safeRequiredWatchSeconds * 1000) return;
                                        videoWatchEligibleSentRef.current = true;
                                        setForwardSeekLocked(false);
                                        onVideoWatchEligible?.(mergedAd, Math.floor(watchedMs / 1000));
                                    }}
                                    className="absolute inset-0 h-full w-full object-contain"
                                />
                                {/* Same cluster the content-upload player uses: five
                                    seconds either way, and the Googer mark as the
                                    play/pause button. The native bar underneath
                                    keeps the scrubber and volume. */}
                                <div
                                    className={`absolute left-1/2 top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center gap-3 transition-all duration-200 ${showAdVideoCenterControls ? "opacity-100" : "pointer-events-none opacity-0"}`}
                                    onClick={(event) => event.stopPropagation()}
                                >
                                    <button
                                        type="button"
                                        onClick={() => seekAdVideoBy(-5)}
                                        className="flex h-7 w-7 flex-col items-center justify-center gap-0 rounded-full bg-black/38 text-white shadow-xl backdrop-blur-md transition hover:bg-black/50"
                                        aria-label="Skip back 5 seconds"
                                    >
                                        <IonIcon name="chevron-back" className="text-[11px] leading-none" />
                                        <span className="text-[6px] font-black leading-none">5s</span>
                                    </button>
                                    {/* Same 56px circle as the first view uses, with
                                        the mark a little larger than before so the
                                        control does not change size when the ad is
                                        opened. */}
                                    <button
                                        type="button"
                                        onClick={toggleAdVideoPlay}
                                        className="flex h-14 w-14 items-center justify-center drop-shadow-[0_12px_24px_rgba(0,0,0,0.65)] transition hover:scale-105"
                                        aria-label={adVideoPaused ? "Play video" : "Pause video"}
                                    >
                                        <Image
                                            src="/assets/images/googer.png"
                                            alt={adVideoPaused ? "Play video" : "Pause video"}
                                            width={36}
                                            height={36}
                                            className="h-9 w-9 object-contain"
                                        />
                                    </button>
                                    {/* Dimmed rather than removed while locked, so it
                                        is clearly temporary rather than missing. */}
                                    <button
                                        type="button"
                                        onClick={() => seekAdVideoBy(5)}
                                        className={`flex h-7 w-7 flex-col items-center justify-center gap-0 rounded-full bg-black/38 text-white shadow-xl backdrop-blur-md transition hover:bg-black/50 ${forwardSeekLocked ? "opacity-40" : ""}`}
                                        aria-label={forwardSeekLocked
                                            ? `Available after watching ${safeRequiredWatchSeconds} seconds`
                                            : "Skip forward 5 seconds"}
                                    >
                                        <IonIcon name="chevron-forward" className="text-[11px] leading-none" />
                                        <span className="text-[6px] font-black leading-none">5s</span>
                                    </button>
                                </div>
                                {seekLockedHint && (
                                    <div className="pointer-events-none absolute bottom-11 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/75 px-3 py-1.5 text-[10px] font-black text-white backdrop-blur-md">
                                        Watch {safeRequiredWatchSeconds} seconds first
                                    </div>
                                )}
                                {/* Replaces the scrubber the native controls used
                                    to provide, now that they are switched off. */}
                                <div
                                    className={`absolute inset-x-3 bottom-3 z-20 flex items-center gap-2 text-white transition-all duration-200 ${showAdVideoControls ? "opacity-100" : "pointer-events-none opacity-0"}`}
                                    onClick={(event) => event.stopPropagation()}
                                >
                                    <span className="shrink-0 text-[11px] font-black drop-shadow-[0_1px_4px_rgba(0,0,0,0.85)]">
                                        {formatAdVideoTime(adVideoTime)}
                                    </span>
                                    <input
                                        type="range"
                                        min={0}
                                        max={Math.max(1, adVideoDuration)}
                                        step="0.1"
                                        value={Math.min(adVideoTime, adVideoDuration || adVideoTime)}
                                        onChange={(event) => {
                                            const nextTime = Number(event.currentTarget.value);
                                            // Dragging the timeline is the other way past
                                            // the watch requirement, held to the same rule.
                                            if (nextTime > adVideoTime && isForwardSeekLocked()) {
                                                showSeekLockedHint();
                                                return;
                                            }
                                            if (adVideoRef.current) adVideoRef.current.currentTime = nextTime;
                                            setAdVideoTime(nextTime);
                                        }}
                                        className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/25 accent-rose-600"
                                        style={{ background: `linear-gradient(90deg,#e11d48 0%,#e11d48 ${adVideoProgress}%,rgba(255,255,255,0.28) ${adVideoProgress}%,rgba(255,255,255,0.28) 100%)` }}
                                        aria-label="Video progress"
                                    />
                                    <span className="shrink-0 text-[11px] font-black drop-shadow-[0_1px_4px_rgba(0,0,0,0.85)]">
                                        {formatAdVideoTime(adVideoDuration)}
                                    </span>
                                </div>
                            </>
                        ) : null}
                        <button
                            type="button"
                            onClick={onClose}
                            className="hidden"
                            aria-label="Close sponsored media preview"
                        >
                            <IonIcon name="close" className="text-xl" />
                        </button>
                        {mergedAd?.title && (
                            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-4 pb-5 pt-16">
                                <h2 className="max-w-[calc(100%-72px)] text-sm font-black leading-tight text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.75)] md:text-base">
                                    {mergedAd.title}
                                </h2>
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={(e) => { trackAdClick(); onNavigateToProfile(e, mergedAd); }}
                            className="hidden"
                            aria-label="Open advertiser profile"
                        >
                            {advertiserImage ? (
                                <Image
                                    src={normalizeMediaSrc(advertiserImage)}
                                    alt={advertiserName}
                                    fill
                                    className="object-cover"
                                    unoptimized
                                />
                            ) : (
                                <span className="flex h-full w-full items-center justify-center text-white">
                                    <IonIcon name="person" className="text-lg" />
                                </span>
                            )}
                        </button>
                        {/* Fades out with the player controls once an ad video is
                            running, so a playing ad is not watched through a
                            column of buttons. Images and embeds keep it up. */}
                        <div className={`absolute right-4 top-1/2 z-30 flex -translate-y-1/2 flex-col gap-3 rounded-[1.4rem] bg-black/35 px-2 py-3 backdrop-blur-md transition-all duration-200 ${videoUrl && !showAdVideoControls ? "pointer-events-none opacity-0" : "opacity-100"}`}>
                            <AdInteractionButton
                                type="likes"
                                icon="heart-outline"
                                activeIcon="heart"
                                isActive={!!mergedAd.user_liked}
                                count={Number(mergedAd.likes_count || 0)}
                                color="text-white"
                                activeColor="text-white"
                                locked={!!liveState.like_locked_hint}
                                onSingleClick={() => onToggleLike(mergedAd)}
                                onLongPress={() => onOpenSheet("likes", mergedAd)}
                                iconSize="text-base md:text-xl"
                                className="flex-col gap-0.5"
                                countClassName="text-[8px] font-black leading-none md:text-[9px]"
                            />
                            <AdInteractionButton
                                type="views"
                                icon="eye-outline"
                                activeIcon="eye"
                                count={Number(mergedAd.views_count || 0)}
                                color="text-white"
                                activeColor="text-white"
                                onSingleClick={() => onOpenSheet("views", mergedAd)}
                                onLongPress={() => onOpenSheet("views", mergedAd)}
                                iconSize="text-base md:text-xl"
                                className="flex-col gap-0.5"
                                countClassName="text-[8px] font-black leading-none md:text-[9px]"
                            />
                            <AdInteractionButton
                                type="comments"
                                icon="chatbubble"
                                activeIcon="chatbubble"
                                count={Number(mergedAd.comments_count || 0)}
                                color="text-white"
                                activeColor="text-white"
                                onSingleClick={() => onOpenSheet("comments", mergedAd)}
                                onLongPress={() => onOpenSheet("comments", mergedAd)}
                                iconSize="text-base md:text-xl"
                                className="flex-col gap-0.5"
                                countClassName="text-[8px] font-black leading-none md:text-[9px]"
                            />
                            <AdInteractionButton
                                type="shares"
                                icon="arrow-redo"
                                activeIcon="arrow-redo"
                                count={Number(mergedAd.shares_count || 0)}
                                color="text-white"
                                activeColor="text-white"
                                onSingleClick={() => {
                                    trackAdClick();
                                    onShare(mergedAd);
                                }}
                                onLongPress={() => onOpenSheet("shares", mergedAd)}
                                iconSize="text-base md:text-xl"
                                className="flex-col gap-0.5"
                                countClassName="text-[8px] font-black leading-none md:text-[9px]"
                            />
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Image kind
    return (
        <div className="fixed inset-0 z-[142] flex items-center justify-center bg-black/88 p-4 backdrop-blur-sm">
            <button
                type="button"
                onClick={() => {
                    setIsMenuOpen(false);
                    onClose();
                }}
                className="absolute inset-0"
                aria-label="Close sponsored image modal"
            />
            <div
                className="relative z-10 w-full max-w-[760px] overflow-hidden rounded-[1.6rem] border border-white/10 bg-[#0f1013] shadow-[0_30px_90px_rgba(0,0,0,0.5)]"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                        <button
                            type="button"
                            onClick={(e) => { trackAdClick(); onNavigateToProfile(e, mergedAd); }}
                            className="relative h-8 w-8 overflow-hidden rounded-full border border-white/10 bg-white/5 transition hover:border-blue-400/60"
                        >
                            {advertiserImage ? (
                                <Image
                                    src={normalizeMediaSrc(advertiserImage)}
                                    alt={advertiserName}
                                    fill
                                    className="object-cover"
                                    unoptimized
                                />
                            ) : (
                                <div className="flex h-full w-full items-center justify-center text-white/45">
                                    <IonIcon name="person" className="text-sm" />
                                </div>
                            )}
                        </button>
                        <div className="min-w-0">
                            <button
                                type="button"
                                onClick={(e) => { trackAdClick(); onNavigateToProfile(e, mergedAd); }}
                                className="flex min-w-0 items-center gap-1 truncate text-xs font-black tracking-[0.1em] text-white/88 transition hover:text-blue-400"
                            >
                                <span className="truncate">{advertiserName}</span>
                                {advertiserId && <UserVerifiedBadge userId={advertiserId} size={12} />}
                            </button>
                            <div className="mt-1 flex items-center gap-1.5">
                                {showRunningAdTag ? (
                                    <span className="text-[9px] font-bold tracking-widest text-white/45">Ad</span>
                                ) : (
                                    <span className="text-[9px] font-bold tracking-widest text-white/45">
                                        <RelativeTime timestamp={normalizedAd?.activeStartTime || normalizedAd?.active_start_time || normalizedAd?.startedAt || normalizedAd?.started_at || raw.active_start_time || raw.activeStartTime || raw.started_at || raw.startedAt || normalizedAd?.createdAt || normalizedAd?.created_at || raw.created_at || raw.createdAt || raw.approved_at || raw.approvedAt || raw.updated_at || raw.updatedAt} />
                                    </span>
                                )}
                            </div>
                        </div>
                        {advertiserId && (
                            <SubscribeButton googId={mergedAd.id} authorId={advertiserId} authorName={advertiserName} onBeforeSubscribeClick={trackAdClick} />
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        {canShowCollectCoinButton && (
                            <RupieerCoinButton
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onCollectCoin(e, mergedAd);
                                }}
                            />
                        )}
                        <div className="relative">
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsMenuOpen((current) => !current);
                                }}
                                className="light-theme-option-dots flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-white transition hover:bg-white/10"
                                aria-label="Open ad options"
                            >
                                <div className="flex flex-col gap-1 p-1">
                                    <div data-dot className="h-1 w-1 rounded-full" style={{ backgroundColor: "var(--theme-dot)" }} />
                                    <div data-dot className="h-1 w-1 rounded-full" style={{ backgroundColor: "var(--theme-dot)" }} />
                                </div>
                            </button>
                            {isMenuOpen && (
                                <div
                                    className="absolute right-0 top-full z-[120] mt-2 w-56 overflow-hidden rounded-2xl border border-white/10 bg-[#1a1a1a] py-2 shadow-[0_20px_50px_rgba(0,0,0,0.5)] animate-in zoom-in-95 fade-in duration-200"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <button
                                        onClick={() => {
                                            trackAdClick();
                                            onShare(ad);
                                            setIsMenuOpen(false);
                                        }}
                                        className="flex w-full items-center gap-3 px-5 py-4 text-left text-[11px] font-bold text-white transition-colors hover:bg-white/5"
                                    >
                                        <IonIcon name="arrow-redo-outline" className="text-lg text-blue-400" />
                                        Share Link
                                    </button>
                                    <button
                                        onClick={() => {
                                            onReport(ad);
                                            setIsMenuOpen(false);
                                        }}
                                        className="flex w-full items-center gap-3 border-t border-white/5 px-5 py-4 text-left text-[11px] font-bold text-white transition-colors hover:bg-white/5"
                                    >
                                        <IonIcon name="alert-circle-outline" className="text-lg text-yellow-500" />
                                        Report
                                    </button>
                                    <button
                                        onClick={() => {
                                            onNotInterested(ad.id);
                                            setIsMenuOpen(false);
                                            onClose();
                                        }}
                                        className="flex w-full items-center gap-3 border-t border-white/5 px-5 py-4 text-left text-[11px] font-bold text-white transition-colors hover:bg-white/5"
                                    >
                                        <IonIcon name="eye-off-outline" className="text-lg text-slate-500" />
                                        Not Interested
                                    </button>
                                    {onDeleteAd && (
                                        <button
                                            onClick={() => {
                                                void onDeleteAd(ad);
                                                setIsMenuOpen(false);
                                                onClose();
                                            }}
                                            className="flex w-full items-center gap-3 border-t border-white/5 px-5 py-4 text-left text-[11px] font-bold text-red-300 transition-colors hover:bg-red-500/10"
                                        >
                                            <IonIcon name="trash-outline" className="text-lg text-red-400" />
                                            Delete Ad
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                setIsMenuOpen(false);
                                onClose();
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-white transition hover:bg-white/10"
                        >
                            <IonIcon name="close-outline" className="text-base" />
                        </button>
                    </div>
                </div>

                <div
                    className="relative h-[68vh] min-h-[360px] w-full bg-black"
                    onTouchStart={(e) => {
                        swipeStartX.current = e.touches[0]?.clientX ?? null;
                    }}
                    onTouchEnd={(e) => {
                        const startX = swipeStartX.current;
                        const endX = e.changedTouches[0]?.clientX ?? null;
                        swipeStartX.current = null;
                        if (startX === null || endX === null || images.length < 2) return;
                        const deltaX = endX - startX;
                        if (Math.abs(deltaX) < 40) return;
                        moveSlide(deltaX < 0 ? "next" : "prev");
                    }}
                >
                    {currentImage ? (
                        <Image
                            src={currentImage}
                            alt={mergedAd?.title || "Ad image"}
                            fill
                            className="object-contain"
                            unoptimized
                        />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center text-white/35">
                            <IonIcon name="image-outline" className="text-5xl" />
                        </div>
                    )}
                    {images.length > 1 && (
                        <>
                            {/* The dots below already move between images, and
                                the frame swipes, so the pair of arrows that
                                used to sit here was a third way to do the same
                                thing crowding the picture. */}
                            <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 backdrop-blur-sm">
                                {images.map((_, index) => (
                                    <button
                                        key={`ad-secondview-dot-${index}`}
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setCurrentIndex(index);
                                        }}
                                        className={`h-2.5 w-2.5 rounded-full transition ${index === currentIndex ? "bg-white" : "bg-white/35 hover:bg-white/60"}`}
                                        aria-label={`View ad image ${index + 1}`}
                                    />
                                ))}
                            </div>
                        </>
                    )}
                    <div className="absolute right-3 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-4 rounded-[1.4rem] border border-white/10 bg-black/45 px-2 py-3 backdrop-blur-md">
                        <AdInteractionButton
                            type="likes"
                            icon="heart-outline"
                            activeIcon="heart"
                            isActive={!!mergedAd.user_liked}
                            count={Number(mergedAd.likes_count || 0)}
                            color="text-white"
                            activeColor="text-white"
                            locked={!!liveState.like_locked_hint}
                            onSingleClick={() => onToggleLike(mergedAd)}
                            onLongPress={() => onOpenSheet("likes", mergedAd)}
                            iconSize="text-base md:text-xl"
                        />
                        <AdInteractionButton
                            type="views"
                            icon="eye-outline"
                            activeIcon="eye"
                            count={Number(mergedAd.views_count || 0)}
                            color="text-white"
                            activeColor="text-white"
                            onSingleClick={() => onOpenSheet("views", mergedAd)}
                            onLongPress={() => onOpenSheet("views", mergedAd)}
                            iconSize="text-base md:text-xl"
                        />
                        <AdInteractionButton
                            type="comments"
                            icon="chatbubble"
                            activeIcon="chatbubble"
                            count={Number(mergedAd.comments_count || 0)}
                            color="text-white"
                            activeColor="text-white"
                            onSingleClick={() => onOpenSheet("comments", mergedAd)}
                            onLongPress={() => onOpenSheet("comments", mergedAd)}
                            iconSize="text-base md:text-xl"
                        />
                        <AdInteractionButton
                            type="shares"
                            icon="arrow-redo"
                            activeIcon="arrow-redo"
                            count={Number(mergedAd.shares_count || 0)}
                            color="text-white"
                            activeColor="text-white"
                            onSingleClick={() => {
                                trackAdClick();
                                onShare(mergedAd);
                            }}
                            onLongPress={() => onOpenSheet("shares", mergedAd)}
                            iconSize="text-base md:text-xl"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
