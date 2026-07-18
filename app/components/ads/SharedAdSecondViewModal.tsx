"use client";

import Image from "next/image";
import React, { useRef, useState } from "react";
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
    const normalizedAd = React.useMemo(() => (ad?.type ? ad : normalizeAdData(ad)), [ad]);
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
    const liveState = useAdStore((state) => state.adStates[interactionId] || {});
    const videoWatchEligibleSentRef = useRef(false);

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
        const embedUrl = kind === "embed" ? (getSponsoredSocialEmbedUrl(link) || link) : "";

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
                                className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-white/10 bg-white/5 transition hover:border-blue-400/60"
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
                                        <IonIcon name="person" className="text-lg" />
                                    </div>
                                )}
                            </button>
                            <div className="min-w-0">
                                <button
                                    type="button"
                                    onClick={(e) => { trackAdClick(); onNavigateToProfile(e, mergedAd); }}
                                    className="truncate text-sm font-black tracking-[0.16em] text-white/88 transition hover:text-blue-400"
                                >
                                    {advertiserName}
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
                            {link && (
                                <p className="mt-1 block truncate text-xs font-bold text-blue-400">
                                    {link}
                                </p>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            {renderCtaButton()}
                            {canShowCollectCoinButton && (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onCollectCoin(e, mergedAd);
                                    }}
                                    className="flex items-center gap-1.5 rounded-full border border-red-400/30 bg-red-600 px-2 py-1 text-[8px] font-black uppercase tracking-[0.1em] text-white shadow-xl transition hover:bg-red-500 active:scale-95"
                                >
                                    <span className="flex h-6.5 w-6.5 items-center justify-center overflow-hidden rounded-full bg-white/12 ring-1 ring-white/10">
                                        <Image
                                            src="/assets/images/rupee.png"
                                            alt="Rupieer coin"
                                            width={28}
                                            height={28}
                                            className="h-[1.35rem] w-[1.35rem] object-contain contrast-110 brightness-110"
                                            unoptimized
                                        />
                                    </span>
                                    <span className="leading-none">Rupieer</span>
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white"
                            >
                                <IonIcon name="close" className="text-xl" />
                            </button>
                        </div>
                    </div>
                    <div className="relative h-[68vh] min-h-[360px] w-full bg-black">
                        {kind === "embed" && embedUrl ? (
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
                                    src={videoUrl}
                                    muted
                                    autoPlay
                                    playsInline
                                    aria-hidden="true"
                                    className="absolute inset-0 h-full w-full scale-110 object-cover opacity-55 blur-xl"
                                />
                                <div className="absolute inset-0 bg-black/15" />
                                <video
                                    src={videoUrl}
                                    controls
                                    controlsList="nodownload"
                                    disablePictureInPicture
                                    autoPlay
                                    playsInline
                                    onTimeUpdate={(event) => {
                                        if (!isUploadedVideo || videoWatchEligibleSentRef.current) return;
                                        const watchedSeconds = Math.floor(event.currentTarget.currentTime || 0);
                                        if (watchedSeconds < safeRequiredWatchSeconds) return;
                                        videoWatchEligibleSentRef.current = true;
                                        onVideoWatchEligible?.(mergedAd, watchedSeconds);
                                    }}
                                    className="absolute inset-0 h-full w-full object-contain"
                                />
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
                        <div className="absolute right-4 top-1/2 z-30 flex -translate-y-1/2 flex-col gap-3 rounded-[1.4rem] bg-black/35 px-2 py-3 backdrop-blur-md">
                            <AdInteractionButton
                                type="likes"
                                icon="heart-outline"
                                activeIcon="heart"
                                isActive={!!mergedAd.user_liked}
                                count={Number(mergedAd.likes_count || 0)}
                                color="text-white"
                                activeColor="text-white"
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
                                icon="share-social"
                                activeIcon="share-social"
                                count={Number(mergedAd.shares_count || 0)}
                                color="text-white"
                                activeColor="text-white"
                                onSingleClick={() => {
                                    trackAdClick();
                                    onShare(mergedAd);
                                }}
                                onLongPress={() => onOpenSheet("shares", mergedAd)}
                                iconSize="text-sm md:text-lg opacity-90"
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
                            className="relative h-10 w-10 overflow-hidden rounded-full border border-white/10 bg-white/5 transition hover:border-blue-400/60"
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
                                    <IonIcon name="person" className="text-lg" />
                                </div>
                            )}
                        </button>
                        <div className="min-w-0">
                            <button
                                type="button"
                                onClick={(e) => { trackAdClick(); onNavigateToProfile(e, mergedAd); }}
                                className="truncate text-sm font-black tracking-[0.16em] text-white/88 transition hover:text-blue-400"
                            >
                                {advertiserName}
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
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onCollectCoin(e, mergedAd);
                                }}
                                className="flex items-center gap-1.5 rounded-full border border-red-400/30 bg-red-600 px-2 py-1 text-[8px] font-black uppercase tracking-[0.1em] text-white shadow-xl transition hover:bg-red-500 active:scale-95"
                            >
                                <span className="flex h-6.5 w-6.5 items-center justify-center overflow-hidden rounded-full bg-white/12 ring-1 ring-white/10">
                                    <Image
                                        src="/assets/images/rupee.png"
                                        alt="Rupieer coin"
                                        width={28}
                                        height={28}
                                        className="h-[1.35rem] w-[1.35rem] object-contain contrast-110 brightness-110"
                                        unoptimized
                                    />
                                </span>
                                <span className="leading-none">Rupieer</span>
                            </button>
                        )}
                        <div className="relative">
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsMenuOpen((current) => !current);
                                }}
                                className="light-theme-option-dots flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-white transition hover:bg-white/10"
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
                                        <IonIcon name="share-social-outline" className="text-lg text-blue-400" />
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
                            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-white transition hover:bg-white/10"
                        >
                            <IonIcon name="close-outline" className="text-2xl" />
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
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    moveSlide("prev");
                                }}
                                className="absolute left-3 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/45 text-white transition hover:bg-black/65"
                            >
                                <IonIcon name="chevron-back-outline" className="text-xl" />
                            </button>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    moveSlide("next");
                                }}
                                className="absolute left-16 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/45 text-white transition hover:bg-black/65"
                            >
                                <IonIcon name="chevron-forward-outline" className="text-xl" />
                            </button>
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
                            icon="share-social"
                            activeIcon="share-social"
                            count={Number(mergedAd.shares_count || 0)}
                            color="text-white"
                            activeColor="text-white"
                            onSingleClick={() => {
                                trackAdClick();
                                onShare(mergedAd);
                            }}
                            onLongPress={() => onOpenSheet("shares", mergedAd)}
                            iconSize="text-sm md:text-lg opacity-90"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
