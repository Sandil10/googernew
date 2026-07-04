"use client";

import Image from "next/image";
import React, { useState } from "react";
import IonIcon from "@/app/components/IonIcon";
import { AdInteractionButton } from "@/app/components/ads/AdInteractionButton";
import { AdImpressionTrigger } from "@/app/components/ads/AdImpressionTrigger";
import { getAdPreviewImage, getSponsoredCallHref, getSponsoredCtaClassName, getSponsoredCtaHref, getSponsoredLinkPreviewType, normalizeExternalUrl } from "@/app/components/ads/adHelpers";
import { normalizeMediaSrc, FEED_IMAGE_BLUR_DATA_URL, shouldBypassNextImageOptimization } from "@/app/lib/mediaOptimization";
import { normalizeAdData } from "@/app/lib/ads/adNormalizer";
import { useAdStore } from "@/app/lib/ads/adStore";
import { getAdInteractionId } from "@/app/lib/ads/adIdentity";
import { logSponsoredAdClick } from "@/app/lib/ads/adClickTracking";
import { RelativeTime } from "@/app/components/RelativeTime";

type ChatAdBoxProps = {
    ad: any;
    onToggleLike: (ad: any) => void | Promise<void>;
    onOpenSheet: (type: any, ad: any) => void;
    onShare: (ad: any) => void;
    onCollectCoin: (event: React.MouseEvent, ad: any) => void;
    onNavigateToProfile: (event: React.MouseEvent, ad: any) => void;
    canShowCollectCoin: (ad: any) => boolean;
    onReport: (ad: any) => void;
    onNotInterested: (adId: any) => void;
    onLogView?: (ad: any) => void;
    onLogImpression?: (ad: any) => void;
    onOpenProductSecondView?: (ad: any) => void | Promise<void>;
    onPromoteAgain?: (ad: any) => void | Promise<void>;
    promoteAgainLabel?: string;
};

const EMPTY_STATE = {};

export function ChatAdBox({
    ad,
    onToggleLike,
    onOpenSheet,
    onShare,
    onCollectCoin,
    onNavigateToProfile,
    canShowCollectCoin,
    onReport,
    onNotInterested,
    onLogView,
    onLogImpression,
    onOpenProductSecondView,
    onPromoteAgain,
    promoteAgainLabel = "Promote Again",
}: ChatAdBoxProps) {
    const [popupOpen, setPopupOpen] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const viewLoggedRef = React.useRef(false);

    const normalizedAd = React.useMemo(() => normalizeAdData(ad), [ad]);
    const raw = normalizedAd?.raw || {};

    const interactionId = getAdInteractionId(normalizedAd);
    const liveState = useAdStore((state) => state.adStates[interactionId] || EMPTY_STATE);

    const displayLiked = !!(liveState.user_liked ?? normalizedAd.liked ?? normalizedAd.user_liked);
    const likeCount = Number(liveState.likes_count ?? normalizedAd.likeCount ?? normalizedAd.likes_count ?? 0);
    const viewCount = Number(liveState.views_count ?? normalizedAd.viewCount ?? normalizedAd.views_count ?? 0);
    const commentCount = Number(liveState.comments_count ?? normalizedAd.commentCount ?? normalizedAd.comments_count ?? 0);
    const shareCount = Number(liveState.shares_count ?? normalizedAd.shareCount ?? normalizedAd.shares_count ?? 0);
    const coinCollected = !!(liveState.ad_coin_collected ?? normalizedAd.ad_coin_collected ?? normalizedAd.coinCollected);

    const mergedAd = React.useMemo(() => ({
        ...normalizedAd,
        liked: displayLiked,
        user_liked: displayLiked,
        likeCount,
        likes_count: likeCount,
        viewCount,
        views_count: viewCount,
        commentCount,
        comments_count: commentCount,
        shareCount,
        shares_count: shareCount,
        coinCollected,
        ad_coin_collected: coinCollected,
        raw: {
            ...(normalizedAd.raw || {}),
            user_liked: displayLiked,
            likes_count: likeCount,
            views_count: viewCount,
            comments_count: commentCount,
            shares_count: shareCount,
            ad_coin_collected: coinCollected,
        },
    }), [normalizedAd, displayLiked, likeCount, viewCount, commentCount, shareCount, coinCollected]);

    const activeLink = normalizeExternalUrl(normalizedAd?.active_link || raw.active_link || "");
    const ctaTopic = normalizedAd?.cta_topic || raw.cta_topic;
    const ctaValue = normalizedAd?.cta_value || raw.cta_value;
    const previewType = getSponsoredLinkPreviewType(activeLink);
    const isVideo =
        previewType === "video" ||
        /video/i.test(String(normalizedAd?.media_type || raw.media_type || "")) ||
        /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(String(raw.media_preview || raw.video_url || ""));

    const previewImage = normalizeMediaSrc(normalizedAd?.image || getAdPreviewImage(raw, previewType) || "");
    const videoSrc = normalizeMediaSrc(
        String(raw.video_url || raw.video || normalizedAd?.video || raw.media_preview || "").trim()
    );
    const canShowVideo = isVideo && !!videoSrc;

    const advertiserName =
        normalizedAd?.username || normalizedAd?.owner_username ||
        raw.username || raw.owner_username || "Advertiser";
    const advertiserImage =
        normalizedAd?.profile_picture || raw.profile_picture || raw.owner_profile_picture || "";
    const displayTitle = String(normalizedAd?.title || raw.title || raw.caption || "").trim();
    const campaignType = String(normalizedAd?.campaign_type || raw.campaign_type || "").trim();
    const callHref = getSponsoredCallHref(raw);
    const ctaHref = getSponsoredCtaHref(ctaTopic, ctaValue);
    const ctaLabel = ctaTopic && ctaTopic !== "No Button" ? ctaTopic : "Visit";

    const canShowCoinBtn = canShowCollectCoin(mergedAd);
    const impressionAdId = normalizedAd?.adId || normalizedAd?.ad_id || raw.adId || raw.ad_id || normalizedAd?.id;
    const trackAdClick = (actionType: "message" | "visit" | "call" = "visit") => {
        logSponsoredAdClick(mergedAd.raw || mergedAd, actionType);
    };
    const isProductPromote = String(normalizedAd?.campaign_type || raw.campaign_type || "").trim().toLowerCase() === "product promote";

    if (normalizedAd.type === "profile") return null;

    const renderCtaButton = () => {
        if (ctaTopic === "No Button") return null;

        if (ctaTopic === "Call Now") {
            return (
                <button
                    type="button"
                    onClick={(event) => {
                        event.stopPropagation();
                        if (!callHref) return;
                        trackAdClick("call");
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
            const advertiserId = mergedAd?.userId || raw.user_id || raw.userId;
            return (
                <button
                    type="button"
                    onClick={(event) => {
                        event.stopPropagation();
                        if (!advertiserId) return;
                        trackAdClick("message");
                        window.location.href = `/chats?user=${encodeURIComponent(String(advertiserId))}`;
                    }}
                    className={`rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] transition ${getSponsoredCtaClassName("Message", !!advertiserId)}`}
                    disabled={!advertiserId}
                >
                    Message
                </button>
            );
        }

        const href = ctaHref || activeLink;
        return (
            <button
                type="button"
                onClick={(event) => {
                    event.stopPropagation();
                    if (!href) return;
                    trackAdClick("visit");
                    window.open(href, "_blank", "noopener,noreferrer");
                }}
                className={`rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] transition ${getSponsoredCtaClassName(ctaTopic, !!href)}`}
                disabled={!href}
            >
                {ctaLabel}
            </button>
        );
    };

    return (
        <AdImpressionTrigger adId={String(impressionAdId || "chat-ad")} onImpression={() => onLogImpression?.(mergedAd)}>
            {/* Small inline ad box */}
            <div className="flex justify-center my-2">
                <div className="relative max-w-[260px] w-full">
                    <button
                        type="button"
                        onClick={() => {
                            if (!viewLoggedRef.current) {
                                viewLoggedRef.current = true;
                                onLogView?.(mergedAd);
                            }
                            if (isProductPromote) {
                                void onOpenProductSecondView?.(ad);
                                return;
                            }
                            setPopupOpen(true);
                        }}
                        className="group relative flex w-full items-center gap-2.5 rounded-2xl border border-white/10 bg-[#1a1a1a] hover:border-white/25 hover:bg-[#202020] transition-all shadow-lg px-3 py-2.5 pr-9 text-left"
                        aria-label="View sponsored ad"
                    >
                    {/* Sponsored label */}
                    <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full border border-white/10 bg-[#111] px-2 py-0.5">
                        <IonIcon name="megaphone-outline" className="text-[8px] text-white/40" />
                        <span className="text-[7px] font-black uppercase tracking-[0.15em] text-white/35">Sponsored</span>
                    </div>

                    {/* Ad media preview */}
                    <div className="relative w-14 h-14 shrink-0 rounded-xl overflow-hidden border border-white/10 bg-black">
                        {canShowVideo ? (
                            <video
                                src={videoSrc}
                                muted
                                playsInline
                                preload="metadata"
                                className="w-full h-full object-cover"
                            />
                        ) : previewImage ? (
                            <Image
                                src={previewImage}
                                alt={displayTitle || "Ad"}
                                fill
                                className="object-cover"
                                loading="lazy"
                                placeholder="blur"
                                blurDataURL={FEED_IMAGE_BLUR_DATA_URL}
                                unoptimized={shouldBypassNextImageOptimization(previewImage)}
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-900/40 to-purple-900/40">
                                <IonIcon name="megaphone-outline" className="text-xl text-white/30" />
                            </div>
                        )}
                        {isVideo && (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/80 shadow">
                                    <IonIcon name="play" className="text-[10px] text-black ml-0.5" />
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Ad info */}
                    <div className="flex-1 min-w-0">
                        <div className="text-[8px] font-black uppercase tracking-wider text-white/35 mb-0.5">
                            {campaignType || "Ad"}
                        </div>
                        {displayTitle && (
                            <div className="text-[10px] font-bold text-white/80 leading-tight truncate">
                                {displayTitle}
                            </div>
                        )}
                        <div className="flex items-center gap-1 mt-1">
                            {advertiserImage ? (
                                <div className="relative w-3.5 h-3.5 rounded-full overflow-hidden border border-white/10 shrink-0">
                                    <Image
                                        src={normalizeMediaSrc(advertiserImage)}
                                        alt={advertiserName}
                                        fill
                                        className="object-cover"
                                        unoptimized
                                    />
                                </div>
                            ) : (
                                <IonIcon name="person-circle-outline" className="text-[10px] text-white/25 shrink-0" />
                            )}
                            <span className="text-[8px] font-bold text-white/35 truncate">{advertiserName}</span>
                        </div>
                    </div>

                    {/* Tap hint */}
                    <IonIcon name="chevron-forward-outline" className="text-[10px] text-white/20 shrink-0 group-hover:text-white/50 transition-colors" />
                    </button>
                    <button
                        type="button"
                        onClick={(event) => {
                            event.stopPropagation();
                            setMenuOpen((open) => !open);
                        }}
                        className="absolute right-2 top-1/2 z-20 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white/70 transition hover:bg-white/10 hover:text-white"
                        aria-label="Open ad options"
                    >
                        <span className="flex flex-col gap-0.5">
                            <span className="h-1 w-1 rounded-full bg-current" />
                            <span className="h-1 w-1 rounded-full bg-current" />
                        </span>
                    </button>
                    {menuOpen && (
                        <div
                            className="absolute right-0 top-full z-40 mt-2 w-52 overflow-hidden rounded-2xl border border-white/10 bg-[#1a1a1a] py-2 shadow-2xl"
                            onClick={(event) => event.stopPropagation()}
                        >
                            <button
                                type="button"
                                onClick={() => {
                                    onShare(mergedAd);
                                    setMenuOpen(false);
                                }}
                                className="flex w-full items-center gap-3 px-4 py-3 text-left text-[11px] font-bold text-white transition-colors hover:bg-white/5"
                            >
                                <IonIcon name="share-social-outline" className="text-lg text-blue-400" />
                                Share Link
                            </button>
                            {onPromoteAgain && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        void onPromoteAgain(mergedAd.raw || mergedAd);
                                        setMenuOpen(false);
                                    }}
                                    className="flex w-full items-center gap-3 border-t border-white/5 px-4 py-3 text-left text-[11px] font-bold text-white transition-colors hover:bg-white/5"
                                >
                                    <IonIcon name="megaphone-outline" className="text-lg text-emerald-400" />
                                    {promoteAgainLabel}
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => {
                                    const targetAd = mergedAd as any;
                                    onNotInterested(targetAd.id || targetAd.adId || targetAd.ad_id);
                                    setMenuOpen(false);
                                }}
                                className="flex w-full items-center gap-3 border-t border-white/5 px-4 py-3 text-left text-[11px] font-bold text-white transition-colors hover:bg-white/5"
                            >
                                <IonIcon name="eye-off-outline" className="text-lg text-slate-500" />
                                Not Interested
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    onReport(mergedAd);
                                    setMenuOpen(false);
                                }}
                                className="flex w-full items-center gap-3 border-t border-white/5 px-4 py-3 text-left text-[11px] font-bold text-white transition-colors hover:bg-white/5"
                            >
                                <IonIcon name="alert-circle-outline" className="text-lg text-yellow-500" />
                                Report
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Popup ad view — full Home/Shop feed style */}
            {popupOpen && (
                <div
                    className="fixed inset-0 z-[150] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
                    onClick={() => setPopupOpen(false)}
                >
                    <div
                        className="relative z-10 w-full max-w-[760px] overflow-hidden rounded-[1.6rem] border border-white/10 bg-[#0f1013] shadow-[0_30px_90px_rgba(0,0,0,0.5)]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                            <div className="flex min-w-0 items-center gap-3">
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        trackAdClick("visit");
                                        onNavigateToProfile(e, mergedAd);
                                        setPopupOpen(false);
                                    }}
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
                                        onClick={(e) => {
                                            trackAdClick("visit");
                                            onNavigateToProfile(e, mergedAd);
                                            setPopupOpen(false);
                                        }}
                                        className="truncate text-sm font-black tracking-[0.16em] text-white/88 transition hover:text-blue-400"
                                    >
                                        {advertiserName}
                                    </button>
                                    <div className="mt-1 flex items-center gap-1.5">
                                        <span className="text-[9px] font-bold tracking-widest text-white/45">Ad</span>
                                        <div className="h-0.5 w-0.5 rounded-full bg-white/25" />
                                        <span className="text-[9px] font-bold tracking-widest text-white/45">
                                            <RelativeTime timestamp={normalizedAd?.active_start_time || normalizedAd?.activeStartTime || raw.active_start_time || normalizedAd?.created_at} />
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                {canShowCoinBtn && (
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); onCollectCoin(e, mergedAd); }}
                                        className="flex items-center gap-1.5 rounded-full border border-red-400/30 bg-red-600 px-2 py-1 text-[8px] font-black uppercase tracking-[0.1em] text-white shadow-xl transition hover:bg-red-500 active:scale-95"
                                    >
                                        <span className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-white/12 ring-1 ring-white/10">
                                            <Image
                                                src="/assets/images/rupee.png"
                                                alt="Ruppier coin"
                                                width={20}
                                                height={20}
                                                className="h-4 w-4 object-contain"
                                                unoptimized
                                            />
                                        </span>
                                        <span className="leading-none">Ruppier</span>
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setPopupOpen(false)}
                                    className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white"
                                >
                                    <IonIcon name="close-outline" className="text-2xl" />
                                </button>
                            </div>
                        </div>

                        {/* Media + interaction buttons */}
                        <div className="relative bg-black" style={{ minHeight: "320px" }}>
                            <div className="relative h-[60vh] min-h-[280px] w-full">
                                {canShowVideo ? (
                                    <video
                                        src={videoSrc}
                                        controls
                                        autoPlay
                                        playsInline
                                        className="h-full w-full object-contain"
                                    />
                                ) : previewImage ? (
                                    <Image
                                        src={previewImage}
                                        alt={displayTitle || "Ad"}
                                        fill
                                        className="object-contain"
                                        unoptimized
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <IonIcon name="megaphone-outline" className="text-5xl text-white/20" />
                                    </div>
                                )}
                            </div>

                            {/* Like / View / Comment / Share — right side, same as Home/Shop feed */}
                            <div className="absolute right-3 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-4 rounded-[1.4rem] border border-white/10 bg-black/45 px-2 py-3 backdrop-blur-md">
                                <AdInteractionButton
                                    type="likes"
                                    icon="heart-outline"
                                    activeIcon="heart"
                                    isActive={displayLiked}
                                    count={likeCount}
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
                                    count={viewCount}
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
                                    count={commentCount}
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
                                    count={shareCount}
                                    color="text-white"
                                    activeColor="text-white"
                                    onSingleClick={() => { onShare(mergedAd); }}
                                    onLongPress={() => onOpenSheet("shares", mergedAd)}
                                    iconSize="text-sm md:text-lg opacity-90"
                                />
                            </div>
                        </div>

                        {/* Footer — title + CTA */}
                        {(displayTitle || activeLink) && (
                            <div className="px-5 py-4 border-t border-white/10">
                                {displayTitle && (
                                    <p className="text-sm font-black text-white/88 leading-snug mb-2 line-clamp-2">
                                        {displayTitle}
                                    </p>
                                )}
                                <div className="flex items-center justify-between gap-3">
                                    {activeLink && (
                                        <p className="min-w-0 truncate text-xs font-bold text-blue-400">
                                            {activeLink}
                                        </p>
                                    )}
                                    {renderCtaButton()}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </AdImpressionTrigger>
    );
}
