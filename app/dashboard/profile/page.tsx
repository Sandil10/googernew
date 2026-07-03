"use client";

import Image from "next/image";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authService } from "@/services/authService";
import { marketService } from "@/services/marketService";
import { googService } from "@/services/googService";
import { adsService } from "@/services/adsService";
import { chatService } from "@/services/chatService";
import { uploadContentService, type UploadContentRecord } from "@/services/uploadContentService";
import { GoogCard, type WritePost } from "@/app/components/googs/GoogCard";
import IonIcon from "@/app/components/IonIcon";
import ShareModal from "@/app/components/ShareModal";
import InteractionBottomSheet from "@/app/components/InteractionBottomSheet";
import UploadContentMedia from "@/app/components/UploadContentMedia";
import UploadContentWatchModal from "@/app/components/UploadContentWatchModal";

import { getProfileShareUrl, getShareUrlForItem } from "@/app/lib/shareLinks";
import { formatGoogerId, getUserDisplayName } from "@/app/lib/userDisplay";
import { useAdStore } from "@/app/lib/ads/adStore";
import SubscribeButton from "@/app/components/SubscribeButton";
import { openLoginRequired } from "@/app/lib/loginRequired";
import { BadgeSvg } from "@/app/components/VerifiedBadge";
import { SharedProductCard } from "@/app/components/market/SharedProductCard";
import { PromotedAdCard } from "@/app/components/ads/PromotedAdCard";
import { useAdActions } from "@/app/lib/ads/useAdActions";
import { normalizeAdData } from "@/app/lib/ads/adNormalizer";
import { promotePhotoVideoAdAgain, promoteProductAdAgain } from "@/app/lib/ads/promoteAgain";
import { matchesAdIdentity } from "@/app/lib/ads/adIdentity";
import { SharedAdSecondViewModal } from "@/app/components/ads/SharedAdSecondViewModal";
import { ShopProductSecondViewModal } from "@/app/components/market/ShopProductSecondViewModal";
import { getAdPreviewImage, getSponsoredAdImages } from "@/app/components/ads/adHelpers";
import { subscriptionService } from "@/services/subscriptionService";
import { useThemePreference } from "@/app/lib/themeMode";
import { addTopbarNotification } from "@/app/lib/topbarNotifications";
import { formatRelativeTime } from "@/app/lib/relativeTime";

type UserRecord = {
    id?: number;
    user_id?: string | number;
    googer_id?: string | number;
    username?: string;
    full_name?: string;
    bio?: string;
    profile_picture?: string;
    email?: string;
    contact_email?: string | null;
    shipping_address?: any;
    contact_phone?: string | null;
    contact_email_visibility?: string | null;
    contact_phone_visibility?: string | null;
    subscriber_count?: number;
    is_subscribed?: boolean;
    is_blocked_by_me?: boolean;
    profile_views_count?: number;
    following_count?: number;
    blocked_count?: number;
};

type PostRecord = {
    id: number;
    user_id?: number;
    title?: string;
    description?: string;
    image_url?: string;
    status?: string;
    likes_count?: number;
    comments_count?: number;
    shares_count?: number;
    views_count?: number;
    created_at?: string;
    updated_at?: string;
    user_liked?: boolean;
    commission_info?: any;
    is_sponsored?: boolean;
    campaign_type?: string;
};

type SheetType = "likes" | "comments" | "shares" | "views";

const getAdViewTarget = (target: any) => {
    if (!target || typeof target === "string" || typeof target === "number") return target;
    const raw = target.raw || {};
    const adId = target.adId || target.ad_id || raw.adId || raw.ad_id;
    return adId ? `ad-${String(adId).replace(/^ad-/, "")}` : target.id;
};

function isLiveMarketPost(post: PostRecord) {
    return post.status === "active" || post.status === "approved";
}

function formatSubscriberCount(value: number) {
    if (value >= 1000000000) {
        const formatted = (value / 1000000000).toFixed(value >= 10000000000 ? 0 : 1);
        return `${formatted.replace(/\.0$/, "")}B`;
    }
    if (value >= 1000000) {
        const formatted = (value / 1000000).toFixed(value >= 10000000 ? 0 : 1);
        return `${formatted.replace(/\.0$/, "")}M`;
    }
    if (value >= 1000) {
        const formatted = (value / 1000).toFixed(value >= 10000 ? 0 : 1);
        return `${formatted.replace(/\.0$/, "")}K`;
    }
    return `${value}`;
}

function getInitials(name?: string) {
    if (!name) return "G";
    const parts = name.trim().split(/\s+/).slice(0, 2);
    return parts.map((part) => part[0]?.toUpperCase() || "").join("") || "G";
}

function extractFirstUrl(text?: string) {
    if (!text) return null;
    const match = text.match(/(https?:\/\/[^\s]+|www\.[^\s]+)/i);
    return match?.[0] || null;
}

function extractUrls(text?: string) {
    if (!text) return [];
    return text.match(/(https?:\/\/[^\s]+|www\.[^\s]+)/gi) || [];
}

function normalizeUrl(url: string) {
    return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function getProfileUploadLinkPreview(url?: string) {
    const normalized = String(url || "").trim();
    if (!normalized) return "";
    const finalUrl = /^https?:\/\//i.test(normalized) ? normalized : `https://${normalized}`;
    if (/\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i.test(finalUrl)) return finalUrl;
    return `https://api.microlink.io?url=${encodeURIComponent(finalUrl)}&screenshot=true&meta=false&embed=screenshot.url`;
}

function formatDisplayUrl(url: string) {
    try {
        const parsed = new URL(normalizeUrl(url));
        const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");
        return `${parsed.hostname}${path}`;
    } catch {
        return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
    }
}

function getCanonicalProfileLink(url: string, username?: string) {
    const canonicalProfileUrl = username ? getProfileShareUrl({ username }) : "";
    if (!canonicalProfileUrl) return normalizeUrl(url);

    try {
        const parsed = new URL(normalizeUrl(url));
        const segments = parsed.pathname.split("/").filter(Boolean);
        const first = (segments[0] || "").toLowerCase();

        if (first === "dashboard" && (segments[1] || "").toLowerCase() === "profile") {
            return canonicalProfileUrl;
        }
        if ((first === "profile" || first === "u") && segments[1]) {
            return getProfileShareUrl({ username: segments[1] });
        }
        if (segments.length === 1 && username && segments[0]?.toLowerCase() === username.toLowerCase()) {
            return canonicalProfileUrl;
        }
    } catch {
        return normalizeUrl(url);
    }

    return normalizeUrl(url);
}

function renderBioText(text: string, username?: string): ReactNode[] {
    if (!text) return [];

    const parts = text.split(/(https?:\/\/[^\s]+|www\.[^\s]+|@[\w.]+|#[\w.]+)/g);
    return parts.filter(Boolean).map((part, index) => {
        if (/^(https?:\/\/|www\.)/i.test(part)) {
            const canonicalLink = getCanonicalProfileLink(part, username);
            return (
                <a
                    key={`${part}-${index}`}
                    href={canonicalLink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sky-400 transition hover:text-sky-300"
                >
                    {formatDisplayUrl(canonicalLink)}
                </a>
            );
        }

        if (part.startsWith("@") || part.startsWith("#")) {
            return <span key={`${part}-${index}`} className="text-sky-400">{part}</span>;
        }

        return <span key={`${part}-${index}`}>{part}</span>;
    });
}

function buildListSignature(items: any[], fields: string[]) {
    return JSON.stringify(
        (Array.isArray(items) ? items : []).map((item: any) => [
            item?.id,
            ...fields.map((field) => item?.[field] ?? ""),
        ]),
    );
}

function formatUploadMetric(value?: number | null) {
    const numeric = Number(value || 0);
    if (numeric >= 1000) {
        return `${(numeric / 1000).toFixed(numeric >= 10000 ? 0 : 1).replace(/\.0$/, "")}K`;
    }
    return `${numeric}`;
}

function isUploadSupportAccount(userType?: string | null) {
    const normalized = String(userType || "").trim().toLowerCase().replace(/-/g, "_");
    return normalized === "super_admin" || normalized === "superadmin";
}

function getUploadContentStatusMeta(status?: UploadContentRecord["status"]) {
    if (status === "Approved") {
        return {
            label: "Approved",
            icon: "checkmark-circle-outline",
            className: "border-emerald-400/25 bg-emerald-500/10 text-emerald-300",
            helper: "Accepted by admin. This can appear on Home while it is active.",
        };
    }
    if (status === "Rejected") {
        return {
            label: "Rejected",
            icon: "close-circle-outline",
            className: "border-red-400/25 bg-red-500/10 text-red-300",
            helper: "Rejected by admin. Only you can see this item here.",
        };
    }
    return {
        label: "Reviewing",
        icon: "time-outline",
        className: "border-amber-400/25 bg-amber-500/10 text-amber-200",
        helper: "Waiting for admin approval. Other users cannot see it yet.",
    };
}

function ProfileUploadContentCard({
    item,
    onToggleLike,
    onOpenSheet,
    onShare,
    onLogView,
    onEdit,
}: {
    item: UploadContentRecord;
    onToggleLike: (item: UploadContentRecord) => void;
    onOpenSheet: (type: SheetType, item: UploadContentRecord) => void;
    onShare: (item: UploadContentRecord) => void;
    onLogView: (item: UploadContentRecord) => void;
    onEdit?: (item: UploadContentRecord) => void;
}) {
    const statusMeta = getUploadContentStatusMeta(item.status);
    const canEditUnderReview = item.status === "Pending Approval";
    const media = item.media_preview || item.media_gallery?.[0] || item.thumbnail_url;
    const showBlur = item.content_access_mode === "blurred";
    const isVideo = String(item.media_type || "").toLowerCase().includes("video");
    const isFlashContent = item.content_type === "flash";
    const isLink = String(item.media_type || "").toLowerCase().includes("link");
    const isPlayableFlash = isFlashContent && (isVideo || isLink);
    const watchSource = item.external_link && (isVideo || isLink) ? item.external_link : media || "";
    const contentId = item.contentId || item.content_id || String(item.id);
    const watchTarget = item.show_link_on_home && item.external_link ? normalizeUrl(item.external_link) : media;
    const createdLabel = item.created_at ? formatRelativeTime(item.created_at) : "Now";
    const isSupportAccount = isUploadSupportAccount(item.user_type);
    const creatorName = isSupportAccount ? "Googer Support" : (item.username || item.full_name || "User");
    const hasLegacySupportAvatar = /ui-avatars\.com\/api\/\?name=G(?:&|$)/i.test(String(item.profile_picture || ""));
    const profileImage = String(!isSupportAccount && hasLegacySupportAvatar ? "" : (item.profile_picture || "")).trim();
    const likesCount = Number(item.likes_count ?? item.likeCount ?? 0);
    const viewsCount = Number(item.views_count ?? item.viewCount ?? 0);
    const commentsCount = Number(item.comments_count ?? item.commentCount ?? 0);
    const sharesCount = Number(item.shares_count ?? item.shareCount ?? 0);
    const [showFullVideo, setShowFullVideo] = useState(false);
    const [mediaAspectRatio, setMediaAspectRatio] = useState<number | null>(null);
    useEffect(() => {
        setMediaAspectRatio(null);
    }, [item.id, media]);
    const mediaFrameStyle = mediaAspectRatio
        ? { aspectRatio: String(Math.min(1.78, Math.max(0.56, mediaAspectRatio))) }
        : undefined;
    const blurredPreviewMedia =
        item.thumbnail_url
        || (isLink ? getProfileUploadLinkPreview(item.external_link) : "")
        || item.media_preview
        || item.media_gallery?.[0]
        || "";

    const handleWatchNow = (event?: React.MouseEvent<HTMLButtonElement>) => {
        event?.preventDefault();
        event?.stopPropagation();
        onLogView(item);
        if ((isVideo || isPlayableFlash) && watchSource) {
            setShowFullVideo(true);
            return;
        }
        if (watchTarget) window.open(watchTarget, "_blank", "noopener,noreferrer");
    };

    return (
        <>
        <article className="mx-auto w-full max-w-[360px] overflow-hidden rounded-[1.7rem] border border-white/10 bg-[#171411] shadow-[0_18px_55px_rgba(0,0,0,0.28)]">
            <div className="flex items-center justify-between gap-2 p-3">
                <div className="flex min-w-0 items-center gap-2">
                    <div className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-blue-600 text-[10px] font-black text-white">
                        {profileImage ? (
                            <Image src={profileImage} alt={creatorName} fill sizes="32px" className="object-cover" unoptimized />
                        ) : (
                            <IonIcon name="person" className="text-sm" />
                        )}
                    </div>
                    <div className="min-w-0">
                        <p className="truncate text-[11px] font-black text-white">{creatorName}</p>
                        <p className="mt-1 text-[9px] font-bold tracking-[0.18em] text-white/42">{createdLabel}</p>
                    </div>
                </div>
                {canEditUnderReview && onEdit ? (
                    <button
                        type="button"
                        onClick={() => onEdit(item)}
                        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-full bg-white/[0.06] px-3 text-[9px] font-black uppercase tracking-[0.12em] text-white/75 transition hover:bg-white/[0.1] hover:text-white"
                    >
                        <IonIcon name="create-outline" className="text-sm" />
                        Edit
                    </button>
                ) : null}
            </div>
            <div className="px-3">
            <div className="relative aspect-square overflow-hidden rounded-[1.6rem] bg-black" style={mediaFrameStyle}>
                <UploadContentMedia
                    mediaType={item.media_type}
                    mediaPreview={media || blurredPreviewMedia}
                    mediaGallery={item.media_gallery}
                    thumbnailUrl={item.thumbnail_url}
                    previewMode={item.preview_mode}
                    previewUrl={item.preview_url}
                    alt={item.description || item.topic || "Upload content"}
                    blurred={showBlur}
                    onAspectRatioChange={setMediaAspectRatio}
                />
                <div className="absolute left-3 top-3 rounded-full border border-white/15 bg-black/50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white">
                    {item.topic || "Content"}
                </div>
                <div className={`absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${statusMeta.className}`}>
                    <IonIcon name={statusMeta.icon} className="text-sm" />
                    {statusMeta.label}
                </div>
                {showBlur && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[linear-gradient(180deg,rgba(0,0,0,0.18),rgba(0,0,0,0.56))] px-6 text-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
                            <IonIcon name="eye-off-outline" className="text-[24px]" />
                        </div>
                        <p className="mt-3 text-[15px] font-black text-white">Blurred Content</p>
                        <p className="mt-2 max-w-[220px] text-[11px] font-semibold leading-5 text-white/78">
                            Preview hidden. Open to watch the full content.
                        </p>
                        {watchTarget && (
                            <button
                                type="button"
                                onClick={handleWatchNow}
                                className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-full border border-white/15 bg-white px-5 text-[10px] font-black uppercase tracking-[0.18em] text-black transition hover:bg-white/90"
                            >
                                <IonIcon name="eye-outline" className="text-[13px]" />
                                Watch Now
                            </button>
                        )}
                    </div>
                )}
                {!showBlur && (isVideo || isPlayableFlash) && watchSource && (
                    <button type="button" onClick={handleWatchNow} className="absolute bottom-4 left-1/2 z-30 inline-flex h-9 -translate-x-1/2 items-center justify-center gap-2 rounded-full border border-white/20 bg-black/65 px-4 text-[9px] font-black uppercase tracking-[0.14em] text-white backdrop-blur-md transition hover:bg-black/80">
                        <IonIcon name="play" className="text-xs" /> Watch Now
                    </button>
                )}
                <div className="absolute bottom-3 right-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[11px] font-black text-emerald-300">
                    +{Number(item.affiliate_commission || 0)}%
                </div>
            </div>
            </div>
            <div className="space-y-3 px-4 pb-4 pt-3">
                <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.16em] text-white/35">Upload Content #{contentId}</p>
                    <p className="mt-2 line-clamp-2 text-[12px] font-semibold leading-5 text-white">{item.description || "Uploaded content"}</p>
                </div>
                <div className="flex items-end justify-between gap-3">
                    <div>
                        <div className="text-[10px] font-black uppercase tracking-[0.14em] text-white/38">R</div>
                        <div className="text-[19px] font-black leading-none text-white">{Number(item.price || 0).toLocaleString()}</div>
                    </div>
                    <div className="text-right">
                        <div className="text-[9px] font-black uppercase tracking-[0.14em] text-white/35">Share Commission</div>
                        <div className="mt-1 text-[12px] font-black text-white">{Number(item.affiliate_commission || 0)}%</div>
                    </div>
                </div>
                <div className="flex items-center justify-between border-t border-white/8 pt-3 text-white/78">
                    <InteractionButton
                        type="likes"
                        icon="heart-outline"
                        activeIcon="heart"
                        count={formatUploadMetric(likesCount)}
                        activeColor="text-white"
                        isActive={!!item.user_liked}
                        onSingleClick={() => onToggleLike(item)}
                        onLongReach={() => onOpenSheet("likes", item)}
                        iconSize="text-[16px]"
                    />
                    <InteractionButton
                        type="views"
                        icon="eye-outline"
                        activeIcon="eye"
                        count={formatUploadMetric(viewsCount)}
                        activeColor="text-white"
                        onSingleClick={() => {
                            onLogView(item);
                            onOpenSheet("views", item);
                        }}
                        onLongReach={() => onOpenSheet("views", item)}
                        iconSize="text-[16px]"
                    />
                    <InteractionButton
                        type="comments"
                        icon="chatbubble-outline"
                        activeIcon="chatbubble"
                        count={formatUploadMetric(commentsCount)}
                        activeColor="text-white"
                        onSingleClick={() => onOpenSheet("comments", item)}
                        onLongReach={() => onOpenSheet("comments", item)}
                        iconSize="text-[16px]"
                    />
                    <InteractionButton
                        type="shares"
                        icon="share-social-outline"
                        activeIcon="share-social"
                        count={formatUploadMetric(sharesCount)}
                        activeColor="text-emerald-300"
                        onSingleClick={() => onShare(item)}
                        onLongReach={() => onOpenSheet("shares", item)}
                        iconSize="text-[15px]"
                    />
                </div>
                <p className="rounded-2xl border border-white/8 bg-white/[0.035] px-3 py-2 text-[10px] font-semibold leading-5 text-white/55">
                    {item.status === "Rejected" && item.rejection_reason ? item.rejection_reason : statusMeta.helper}
                </p>
            </div>
        </article>
        <UploadContentWatchModal
            open={showFullVideo}
            source={watchSource}
            poster={item.thumbnail_url}
            title={item.description || item.topic || "Full Content"}
            lockedPrice={isFlashContent ? Number(item.price || 0) : null}
            onClose={() => setShowFullVideo(false)}
            actionRail={(
                <>
                    <InteractionButton
                        type="likes"
                        icon="heart-outline"
                        activeIcon="heart"
                        count={formatUploadMetric(likesCount)}
                        activeColor="text-white"
                        isActive={!!item.user_liked}
                        onSingleClick={() => onToggleLike(item)}
                        onLongReach={() => onOpenSheet("likes", item)}
                        orientation="vertical"
                        iconWrapperClassName="flex h-8 w-8 items-center justify-center rounded-full border border-white/25 bg-zinc-700/35 shadow-[0_6px_18px_rgba(0,0,0,0.28)] backdrop-blur-md"
                        countClassName="drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]"
                    />
                    <InteractionButton
                        type="views"
                        icon="eye-outline"
                        activeIcon="eye"
                        count={formatUploadMetric(viewsCount)}
                        activeColor="text-white"
                        onSingleClick={() => {
                            onLogView(item);
                            onOpenSheet("views", item);
                        }}
                        onLongReach={() => onOpenSheet("views", item)}
                        orientation="vertical"
                        iconWrapperClassName="flex h-8 w-8 items-center justify-center rounded-full border border-white/25 bg-zinc-700/35 shadow-[0_6px_18px_rgba(0,0,0,0.28)] backdrop-blur-md"
                        countClassName="drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]"
                    />
                    <InteractionButton
                        type="comments"
                        icon="chatbubble-outline"
                        activeIcon="chatbubble"
                        count={formatUploadMetric(commentsCount)}
                        activeColor="text-white"
                        onSingleClick={() => onOpenSheet("comments", item)}
                        onLongReach={() => onOpenSheet("comments", item)}
                        orientation="vertical"
                        iconWrapperClassName="flex h-8 w-8 items-center justify-center rounded-full border border-white/25 bg-zinc-700/35 shadow-[0_6px_18px_rgba(0,0,0,0.28)] backdrop-blur-md"
                        countClassName="drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]"
                    />
                    <InteractionButton
                        type="shares"
                        icon="share-social-outline"
                        activeIcon="share-social"
                        count={formatUploadMetric(sharesCount)}
                        activeColor="text-emerald-300"
                        onSingleClick={() => onShare(item)}
                        onLongReach={() => onOpenSheet("shares", item)}
                        orientation="vertical"
                        iconWrapperClassName="flex h-8 w-8 items-center justify-center rounded-full border border-white/25 bg-zinc-700/35 shadow-[0_6px_18px_rgba(0,0,0,0.28)] backdrop-blur-md"
                        countClassName="drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]"
                    />
                </>
            )}
        />
        </>
    );
}

const InteractionButton = memo(({
    icon,
    activeIcon,
    count,
    activeColor,
    isActive,
    onSingleClick,
    onLongReach,
    type,
    orientation = "horizontal",
    iconWrapperClassName = "",
    countClassName = "",
}: any) => {
    const timerRef = useRef<any>(null);
    const longPressedRef = useRef(false);
    const handleStart = (e: React.PointerEvent) => {
        e.stopPropagation();
        longPressedRef.current = false;
        timerRef.current = setTimeout(() => {
            longPressedRef.current = true;
            onLongReach();
        }, 600);
    };
    const handleEnd = (e: React.PointerEvent) => {
        e.stopPropagation();
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = null;
        if (!longPressedRef.current) onSingleClick();
        longPressedRef.current = false;
    };
    const handleCancel = (e: React.PointerEvent) => {
        e.stopPropagation();
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = null;
        longPressedRef.current = false;
    };
    const isLikeButton = type === "likes";
    const currentIcon = isLikeButton
        ? (isActive ? activeIcon || "heart" : "heart-outline")
        : (isActive && activeIcon ? activeIcon : icon);
    const hasCount = typeof count === "number" ? count > 0 : !!count;
    const colorClass = isLikeButton && isActive ? "text-red-500" : isActive ? activeColor : "text-white";
    const iconRenderKey = isLikeButton ? `likes-${isActive ? "liked" : "unliked"}` : currentIcon;
    const iconColorStyle = isLikeButton ? { color: isActive ? "#ef4444" : "#ffffff" } : undefined;

    return (
        <button
            type="button"
            data-interaction-type={type}
            onPointerDown={handleStart}
            onPointerUp={handleEnd}
            onPointerLeave={handleCancel}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
            className={`${colorClass} inline-flex touch-none select-none items-center justify-center gap-1 transition-all duration-300 active:scale-75 focus:outline-none ${orientation === "vertical" ? "flex-col" : ""}`}
            aria-pressed={isLikeButton ? !!isActive : undefined}
        >
            <span className={iconWrapperClassName}>
                <IonIcon key={iconRenderKey} name={currentIcon} className={`shrink-0 text-[21px] ${colorClass}`} style={iconColorStyle} />
            </span>
            {hasCount && <span className={`shrink-0 text-[7px] font-black tracking-tighter md:text-[9px] ${countClassName}`}>{count}</span>}
        </button>
    );
});

InteractionButton.displayName = "InteractionButton";

export default function ProfilePage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { preference: themePreference, resolvedTheme, setPreference, toggleManualTheme } = useThemePreference();
    const profileId = searchParams ? searchParams.get("id") : null;
    const profileUser = searchParams ? searchParams.get("user") : null;
    const profileShareCode = searchParams ? searchParams.get("share") : null;
    const requestedTab = searchParams ? searchParams.get("tab") : null;

    const [activeTab, setActiveTab] = useState<"threads" | "replies">(requestedTab === "googs" ? "replies" : "threads");
    const [showMenu, setShowMenu] = useState(false);
    const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
    const [isDeletingAccount, setIsDeletingAccount] = useState(false);
    const [showReportModal, setShowReportModal] = useState(false);
    const [reportReason, setReportReason] = useState("");
    const [reportCustom, setReportCustom] = useState("");
    const [reportSubmitting, setReportSubmitting] = useState(false);
    const [isBlocked, setIsBlocked] = useState(false);
    const [blockSubmitting, setBlockSubmitting] = useState(false);
    const [showBlockAccountModal, setShowBlockAccountModal] = useState(false);
    const postsSignatureRef = useRef<string>("");
    const googsSignatureRef = useRef<string>("");
    const profileAdsSignatureRef = useRef<string>("");
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<UserRecord | null>(null);
    const [marketAds, setMarketAds] = useState<any[]>([]);
    const [googs, setGoogs] = useState<WritePost[]>([]);
    const [profileAds, setProfileAds] = useState<any[]>([]);
    const [uploadContents, setUploadContents] = useState<UploadContentRecord[]>([]);
    const syncAds = useAdStore((state) => state.syncAds);
    const updateAdState = useAdStore((state) => state.updateAdState);
    const setViewerContext = useAdStore((state) => state.setViewerContext);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [isOwnProfile, setIsOwnProfile] = useState(false);
    const [subscriberCount, setSubscriberCount] = useState(0);
    const [profileViewsCount, setProfileViewsCount] = useState(0);
    const [followingCount, setFollowingCount] = useState(0);
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [isSubscriptionLoading, setIsSubscriptionLoading] = useState(false);
    const [followerUsers, setFollowerUsers] = useState<UserRecord[]>([]);
    const [followingUsers, setFollowingUsers] = useState<UserRecord[]>([]);
    const [isConnectionsModalOpen, setIsConnectionsModalOpen] = useState(false);
    const [isConnectionsLoading, setIsConnectionsLoading] = useState(false);
    const [connectionsView, setConnectionsView] = useState<"followers" | "following">("followers");
    const [connectionsPage, setConnectionsPage] = useState<{ followers: number; following: number }>({
        followers: 1,
        following: 1,
    });
    const [connectionActionUserId, setConnectionActionUserId] = useState<string | number | null>(null);
    const [blockedUsers, setBlockedUsers] = useState<UserRecord[]>([]);
    const [isBlockedModalOpen, setIsBlockedModalOpen] = useState(false);
    const [isBlockedLoading, setIsBlockedLoading] = useState(false);
    const [isMailModalOpen, setIsMailModalOpen] = useState(false);
    const [isContactModalOpen, setIsContactModalOpen] = useState(false);
    const [isProfileShareModalOpen, setIsProfileShareModalOpen] = useState(false);
    const [posts, setPosts] = useState<PostRecord[]>([]);

    const [openMenuProductId, setOpenMenuProductId] = useState<number | null>(null);
    const [openMenuAdId, setOpenMenuAdId] = useState<string | number | null>(null);
    const [hiddenPostIds, setHiddenPostIds] = useState<string[]>([]);
    const [notification, setNotification] = useState<{ type: "success" | "error"; title?: string; message: string } | null>(null);
    const [showShareModal, setShowShareModal] = useState(false);
    const [shareProduct, setShareProduct] = useState<any>(null);
    const [initialShareView, setInitialShareView] = useState<"share" | "resell">("share");
    const [reportingProduct, setReportingProduct] = useState<PostRecord | null>(null);

    const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);
    const [isBottomSheetLoading, setIsBottomSheetLoading] = useState(false);
    const [isBottomSheetGoog, setIsBottomSheetGoog] = useState(false);
    const [isBottomSheetUpload, setIsBottomSheetUpload] = useState(false);
    const [bottomSheetType, setBottomSheetType] = useState<SheetType>("comments");
    const [interactionProduct, setInteractionProduct] = useState<any>(null);
    const [bottomSheetData, setBottomSheetData] = useState<any[]>([]);
    const [adPreviewModal, setAdPreviewModal] = useState<{ ad: any; type: "ad" | "product"; kind?: any; images?: string[]; suppressCoinRewards?: boolean } | null>(null);
    const [shareUrlOverride, setShareUrlOverride] = useState<string | null>(null);
    const [badge, setBadge] = useState<{ color: string; tickColor?: string | null } | null>(null);
    const [savedAdIds, setSavedAdIds] = useState<Set<string>>(new Set());
    const [adSaveLimitToast, setAdSaveLimitToast] = useState<string | null>(null);
    const [viewerHasPaidPlan, setViewerHasPaidPlan] = useState(false);
    const [adSaveCounts, setAdSaveCounts] = useState<{ photo: number; video: number }>({ photo: 0, video: 0 });
    const [adSaveLimits, setAdSaveLimits] = useState<{ photo: number | null; video: number | null }>({ photo: null, video: null });
    const [openGoogMenu, setOpenGoogMenu] = useState<{ post: WritePost; top: number; left: number } | null>(null);

    useEffect(() => {
        if (requestedTab === "googs") setActiveTab("replies");
        if (requestedTab === "products") setActiveTab("threads");
    }, [requestedTab]);

    const updateAdLocalState = useCallback((id: string | number, updates: any) => {
        setPosts((prev) => prev.map((post) => {
            if (matchesAdIdentity(post, id)) {
                return { ...post, ...updates };
            }
            return post;
        }));
        setAdPreviewModal((prev) => {
            if (!prev || !prev.ad) return prev;
            if (matchesAdIdentity(prev.ad, id)) {
                return { ...prev, ad: { ...prev.ad, ...updates } };
            }
            return prev;
        });
        setInteractionProduct((prev: any) => {
            if (!prev) return prev;
            if (matchesAdIdentity(prev, id)) {
                return { ...prev, ...updates };
            }
            return prev;
        });
    }, []);

    const adActions = useAdActions(null, {
        currentUser,
        onBeforeLike: (item, liked) => updateAdLocalState(item.id, { user_liked: liked }),
        onLikeConfirmed: (item, liked) => updateAdLocalState(item.id, { user_liked: liked }),
        onLikeReverted: (item, liked) => updateAdLocalState(item.id, { user_liked: liked }),
        onShare: (item) => handleShareClick(item.raw || item),
        onOpenSheet: (type, item) => openBottomSheet(type as any, item.raw || item),
        onCoinCollected: (item, collectionId) => {
            updateAdLocalState(collectionId, { ad_coin_collected: true, ad_like_locked: true });
        },
        onNotify: (n) => setNotification({ type: n.type, title: n.title, message: n.message }),
    });

    const handlePromoteAgain = useCallback((ad: any) => {
        const campaignType = String(ad?.campaign_type || ad?.campaignType || ad?.raw?.campaign_type || "").trim().toLowerCase();
        if (campaignType === "product promote") {
            void promoteProductAdAgain({ ad, router });
            return;
        }
        void promotePhotoVideoAdAgain({ ad, router });
    }, [router]);
    const getProfileAdSecondViewImages = useCallback((ad: any) => {
        const raw = ad?.raw || ad || {};
        const previewType = String(raw?.media_type || ad?.media_type || "").toLowerCase().includes("video") ? "video" : "image";
        return getSponsoredAdImages(raw, ad?.image || ad?.mediaPreview || ad?.media_preview || getAdPreviewImage(raw, previewType));
    }, []);

    useEffect(() => {
        if (!notification) return;
        addTopbarNotification({
            type: notification.type,
            title: notification.title || (notification.type === "success" ? "Success" : "Error"),
            message: notification.message,
        });
        setNotification(null);
    }, [notification]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const handleAuthChanged = (event: Event) => {
            const nextUser = (event as CustomEvent)?.detail?.user || null;
            setCurrentUser(nextUser);
            setViewerContext(nextUser);
            if (profileId) setIsOwnProfile(!!nextUser?.id && nextUser.id === Number(profileId));
            if (profileUser || profileShareCode) setIsOwnProfile(false);
            if (profileShareCode) setIsOwnProfile(false);
        };
        window.addEventListener("googer-auth-changed", handleAuthChanged as EventListener);
        return () => window.removeEventListener("googer-auth-changed", handleAuthChanged as EventListener);
    }, [profileId, profileShareCode, profileUser, setViewerContext]);

    const CONNECTIONS_PAGE_SIZE = 5;
    const getProfileAdId = useCallback((ad: any) => String(ad?.raw?.adId || ad?.raw?.ad_id || ad?.adId || ad?.ad_id || "").replace(/^ad-/, ""), []);
    const adBelongsToProfile = useCallback((ad: any, profileOwnerId: string | number | null | undefined) => {
        const normalizedProfileOwnerId = String(profileOwnerId || "").trim();
        if (!normalizedProfileOwnerId) return false;
        const raw = ad?.raw?.raw || ad?.raw || {};
        const ownerCandidates = [
            ad?.ad_owner_user_id,
            ad?.advertiser_id,
            ad?.owner_user_id,
            ad?.ownerUserId,
            ad?.user_id,
            ad?.userId,
            raw?.ad_owner_user_id,
            raw?.advertiser_id,
            raw?.owner_user_id,
            raw?.ownerUserId,
            raw?.user_id,
            raw?.userId,
        ]
            .filter((value) => value !== null && value !== undefined && String(value).trim() !== "")
            .map((value) => String(value).trim());
        return ownerCandidates.includes(normalizedProfileOwnerId);
    }, []);
    const mergeActiveAdsWithSavedCompletedAds = useCallback((activeAds: any[], savedAds: any[]) => {
        const merged = new Map<string, any>();
        (activeAds || []).forEach((ad) => {
            const adId = getProfileAdId(ad);
            if (adId) merged.set(adId, ad);
        });
        (savedAds || []).forEach((ad) => {
            const adId = getProfileAdId(ad);
            const status = String(ad?.status || ad?.raw?.status || "").trim().toLowerCase();
            if (adId && status === "completed") {
                const existing = merged.get(adId);
                if (existing) {
                    merged.set(adId, {
                        ...ad,
                        mediaPreview: existing.mediaPreview ?? ad.mediaPreview,
                        mediaGallery: Array.isArray(existing.mediaGallery) && existing.mediaGallery.length > 0
                            ? existing.mediaGallery
                            : ad.mediaGallery,
                        raw: {
                            ...(ad.raw || {}),
                            media_preview: existing?.raw?.media_preview ?? existing?.mediaPreview ?? ad?.raw?.media_preview,
                            media_gallery: Array.isArray(existing?.raw?.media_gallery) && existing.raw.media_gallery.length > 0
                                ? existing.raw.media_gallery
                                : (Array.isArray(existing?.mediaGallery) && existing.mediaGallery.length > 0
                                    ? existing.mediaGallery
                                    : ad?.raw?.media_gallery),
                        },
                    });
                    return;
                }
                merged.set(adId, ad);
            }
        });
        return Array.from(merged.values());
    }, [getProfileAdId]);
    const getPublicCompletedSavedAds = useCallback((savedAds: any[]) => {
        return (savedAds || []).filter((ad) => {
            const status = String(ad?.status || ad?.raw?.status || "").trim().toLowerCase().replace(/[_-]+/g, " ");
            const savedAt = ad?.saved_at || ad?.savedAt || ad?.raw?.saved_at || ad?.raw?.savedAt;
            return status === "completed" && !!savedAt;
        });
    }, []);
    const mergeActiveAdsWithCompletedAds = useCallback((activeAds: any[], completedAds: any[]) => {
        const merged = new Map<string, any>();
        (activeAds || []).forEach((ad) => {
            const adId = getProfileAdId(ad);
            if (adId) merged.set(adId, ad);
        });
        (completedAds || []).forEach((ad) => {
            const adId = getProfileAdId(ad);
            if (!adId || merged.has(adId)) return;
            merged.set(adId, ad);
        });
        return Array.from(merged.values());
    }, [getProfileAdId]);

    const applyProfileCollections = useCallback((nextPosts: any[], nextGoogs: any[], nextProfileAds: any[]) => {
        const nextPostsSignature = buildListSignature(nextPosts, ["updated_at", "status", "likes_count", "views_count"]);
        if (postsSignatureRef.current !== nextPostsSignature) {
            postsSignatureRef.current = nextPostsSignature;
            setPosts(nextPosts);
        }

        const nextGoogsSignature = buildListSignature(nextGoogs, ["updated_at", "created_at", "likes", "views", "shares"]);
        if (googsSignatureRef.current !== nextGoogsSignature) {
            googsSignatureRef.current = nextGoogsSignature;
            setGoogs(nextGoogs);
        }

        const nextProfileAdsSignature = buildListSignature(nextProfileAds, ["updated_at", "created_at", "status", "impressions", "clicks"]);
        if (profileAdsSignatureRef.current !== nextProfileAdsSignature) {
            profileAdsSignatureRef.current = nextProfileAdsSignature;
            setProfileAds(nextProfileAds);
        }
    }, []);

    const fetchProfile = useCallback(async () => {
        try {
            setLoading(true);
            let profileData: UserRecord;
            let viewingOwnProfileForUploads = false;
            if (profileUser) {
                const isNumericId = /^\d+$/.test(profileUser);
                profileData = isNumericId
                    ? await authService.getUserProfile(profileUser)
                    : await authService.getUserByUsername(profileUser);

                const localUser = JSON.parse((sessionStorage.getItem("user") || localStorage.getItem("user")) || "{}");
                const nextUser = localUser?.id ? localUser : null;
                setCurrentUser(nextUser);
                setViewerContext(nextUser);
                const viewingOwnProfile = !!nextUser?.id && !!profileData?.id && Number(nextUser.id) === Number(profileData.id);
                viewingOwnProfileForUploads = viewingOwnProfile;
                setIsOwnProfile(viewingOwnProfile);

                const [userProducts, userGoogs, activeOwnerAds, savedAds, savedIds] = await Promise.all([
                    marketService.getItems({ user_id: profileData.id, status: "active,approved" }),
                    googService.getUserPosts(profileData.id!),
                    viewingOwnProfile ? adsService.getActiveAdsByUser(profileData.id!) : Promise.resolve([]),
                    viewingOwnProfile ? adsService.getSavedAds() : adsService.getPublicSavedAdsByUser(profileData.id!),
                    viewingOwnProfile ? adsService.getSavedAdIds() : Promise.resolve([]),
                ]);
                const ownerAds = viewingOwnProfile
                    ? mergeActiveAdsWithSavedCompletedAds(activeOwnerAds || [], savedAds || [])
                    : getPublicCompletedSavedAds(savedAds || []);
                const filtered = (userProducts || []).filter(isLiveMarketPost);
                applyProfileCollections(filtered, userGoogs || [], ownerAds || []);
                syncAds(ownerAds || []);
                if (viewingOwnProfile) setSavedAdIds(new Set((savedIds || []).map(String)));
            } else if (profileShareCode) {
                const shared = await marketService.getUnifiedShareItem(profileShareCode);
                if (!shared?.success || shared?.type !== "profile" || !shared?.data) {
                    throw new Error("Profile not found");
                }

                profileData = shared.data;
                const localUser = JSON.parse((sessionStorage.getItem("user") || localStorage.getItem("user")) || "{}");
                const nextUser = localUser?.id ? localUser : null;
                setCurrentUser(nextUser);
                setViewerContext(nextUser);
                const viewingOwnProfile = !!nextUser?.id && !!profileData?.id && Number(nextUser.id) === Number(profileData.id);
                viewingOwnProfileForUploads = viewingOwnProfile;
                setIsOwnProfile(viewingOwnProfile);

                const [userProducts, userGoogs, activeOwnerAds, savedAds, savedIds] = await Promise.all([
                    marketService.getItems({ user_id: profileData.id, status: "active,approved" }),
                    googService.getUserPosts(profileData.id!),
                    viewingOwnProfile ? adsService.getActiveAdsByUser(profileData.id!) : Promise.resolve([]),
                    viewingOwnProfile ? adsService.getSavedAds() : adsService.getPublicSavedAdsByUser(profileData.id!),
                    viewingOwnProfile ? adsService.getSavedAdIds() : Promise.resolve([]),
                ]);
                const ownerAds = viewingOwnProfile
                    ? mergeActiveAdsWithSavedCompletedAds(activeOwnerAds || [], savedAds || [])
                    : getPublicCompletedSavedAds(savedAds || []);
                const filtered = (userProducts || []).filter(isLiveMarketPost);
                applyProfileCollections(filtered, userGoogs || [], ownerAds || []);
                syncAds(ownerAds || []);
                if (viewingOwnProfile) setSavedAdIds(new Set((savedIds || []).map(String)));
            } else if (profileId) {
                profileData = await authService.getUserProfile(profileId);
                const localUser = JSON.parse((sessionStorage.getItem("user") || localStorage.getItem("user")) || "{}");
                const nextUser = localUser?.id ? localUser : null;
                setCurrentUser(nextUser);
                setViewerContext(nextUser);
                const viewingOwnProfile = nextUser?.id === Number(profileId);
                viewingOwnProfileForUploads = viewingOwnProfile;
                setIsOwnProfile(viewingOwnProfile);
                const [userProducts, userGoogs, activeOwnerAds, savedAds, savedIds] = await Promise.all([
                    marketService.getItems({ user_id: profileId, status: "active,approved" }),
                    googService.getUserPosts(profileId),
                    viewingOwnProfile ? adsService.getActiveAdsByUser(profileId) : Promise.resolve([]),
                    viewingOwnProfile ? adsService.getSavedAds() : adsService.getPublicSavedAdsByUser(profileId),
                    viewingOwnProfile ? adsService.getSavedAdIds() : Promise.resolve([]),
                ]);
                const ownerAds = viewingOwnProfile
                    ? mergeActiveAdsWithSavedCompletedAds(activeOwnerAds || [], savedAds || [])
                    : getPublicCompletedSavedAds(savedAds || []);
                const filtered = (userProducts || []).filter(isLiveMarketPost);
                applyProfileCollections(filtered, userGoogs || [], ownerAds || []);
                syncAds(ownerAds || []);
                if (viewingOwnProfile) setSavedAdIds(new Set((savedIds || []).map(String)));
            } else {
                if (!authService.isAuthenticated()) {
                    router.push("/");
                    return;
                }
                profileData = await authService.getProfile();
                setCurrentUser(profileData);
                setViewerContext(profileData);
                viewingOwnProfileForUploads = true;
                setIsOwnProfile(true);
                const [myProducts, myGoogs, activeOwnerAds, savedAds, savedIds] = await Promise.all([
                    marketService.getItems({ user_id: profileData.id, status: "active,approved" }),
                    googService.getUserPosts(profileData.id!),
                    adsService.getActiveAdsByUser(profileData.id!),
                    adsService.getSavedAds(),
                    adsService.getSavedAdIds(),
                ]);
                const ownerAds = mergeActiveAdsWithSavedCompletedAds(activeOwnerAds || [], savedAds || []);
                const filtered = (myProducts || []).filter(isLiveMarketPost);
                applyProfileCollections(filtered, myGoogs || [], ownerAds || []);
                syncAds(ownerAds || []);
                setSavedAdIds(new Set((savedIds || []).map(String)));
            }
            if (viewingOwnProfileForUploads) {
                uploadContentService.getMine().then(setUploadContents).catch(() => setUploadContents([]));
            } else {
                setUploadContents([]);
            }
            setUser(profileData);
            setIsBlocked(!!profileData?.is_blocked_by_me);
            setSubscriberCount(Number(profileData?.subscriber_count || 0));
            setIsSubscribed(!!profileData?.is_subscribed);
            setProfileViewsCount(Number(profileData?.profile_views_count || 0));
            setFollowingCount(Number(profileData?.following_count || 0));
            const uid = profileData?.id || profileData?.user_id;
            if (uid) subscriptionService.getBadgeForUser(uid).then(setBadge).catch(() => {});
            subscriptionService.getMyPlan().then((plan) => {
                setViewerHasPaidPlan(plan != null && !plan.is_basic);
            }).catch(() => setViewerHasPaidPlan(false));
            adsService.getSavedAdCounts().then((data) => {
                if (data) { setAdSaveCounts(data.counts); setAdSaveLimits(data.limits); }
            }).catch(() => {});
        } catch (error) {
            console.error("Error fetching profile:", error);
            setViewerContext(null);
            if (!profileId && !profileUser && !profileShareCode) router.push("/");
        } finally {
            setLoading(false);
        }
    }, [applyProfileCollections, getPublicCompletedSavedAds, mergeActiveAdsWithSavedCompletedAds, profileId, profileShareCode, profileUser, router, setViewerContext, syncAds]);

    useEffect(() => { fetchProfile(); }, [fetchProfile]);

    useEffect(() => {
        const refreshViewerSaveLimits = () => {
            subscriptionService.getMyPlan().then((plan) => {
                setViewerHasPaidPlan(plan != null && !plan.is_basic);
            }).catch(() => setViewerHasPaidPlan(false));
            adsService.getSavedAdCounts().then((data) => {
                if (data) {
                    setAdSaveCounts(data.counts);
                    setAdSaveLimits(data.limits);
                }
            }).catch(() => {});
        };

        window.addEventListener("subscription:changed", refreshViewerSaveLimits);
        return () => window.removeEventListener("subscription:changed", refreshViewerSaveLimits);
    }, []);

    // Re-fetch badge whenever it changes (plan purchase or admin assigns badge)
    useEffect(() => {
        const refreshBadge = () => {
            const uid = user?.id || user?.user_id;
            if (uid) subscriptionService.getBadgeForUser(uid as number).then(setBadge).catch(() => {});
        };
        window.addEventListener("badge:changed", refreshBadge);
        return () => window.removeEventListener("badge:changed", refreshBadge);
    }, [user?.id, user?.user_id]);



    useEffect(() => {
        const handleProfileUpdated = (event: Event) => {
            const customEvent = event as CustomEvent<{ user?: UserRecord }>;
            const updatedUser = customEvent?.detail?.user;
            if (!updatedUser) {
                fetchProfile();
                return;
            }

            // Apply immediately so Bio/link refresh in real-time after save.
            if ((!profileId && !profileUser && !profileShareCode) || Number(profileId) === Number(updatedUser.id)) {
                setUser((prev) => ({ ...prev, ...updatedUser }));
            }
            if (!profileId && !profileUser && !profileShareCode) {
                setCurrentUser((prev: any) => ({ ...prev, ...updatedUser }));
            }

            // Keep backend as source of truth.
            fetchProfile();
        };

        window.addEventListener("userProfileUpdated", handleProfileUpdated as EventListener);
        return () => window.removeEventListener("userProfileUpdated", handleProfileUpdated as EventListener);
    }, [fetchProfile, profileId, profileShareCode, profileUser]);

    useEffect(() => {
        if (!openMenuProductId) return;
        const close = () => setOpenMenuProductId(null);
        window.addEventListener("click", close);
        return () => window.removeEventListener("click", close);
    }, [openMenuProductId]);

    useEffect(() => {
        if (!openMenuAdId) return;
        const close = () => setOpenMenuAdId(null);
        window.addEventListener("click", close);
        return () => window.removeEventListener("click", close);
    }, [openMenuAdId]);

    useEffect(() => {
        if (!showMenu) return;
        const close = () => setShowMenu(false);
        window.addEventListener("click", close);
        return () => window.removeEventListener("click", close);
    }, [showMenu]);

    useEffect(() => {
        if (!user?.id) return;

        let cancelled = false;
        const syncSubscriptionState = async () => {
            try {
                const result = await authService.getSubscriptionStatus(user.id!);
                if (cancelled) return;
                setSubscriberCount(result.subscriberCount);
                setIsSubscribed(result.isSubscribed);
            } catch (error) {
                console.error("Error fetching subscription status:", error);
            }
        };

        syncSubscriptionState();
        return () => {
            cancelled = true;
        };
    }, [user?.id]);

    useEffect(() => {
        if (!user?.id) return;

        let cancelled = false;
        const syncProfileViews = async () => {
            try {
                const count = await authService.getProfileViews(user.id!);
                if (cancelled) return;
                setProfileViewsCount(count);
            } catch (error) {
                console.error("Error fetching profile views:", error);
            }
        };

        syncProfileViews();
        return () => {
            cancelled = true;
        };
    }, [user?.id]);

    useEffect(() => {
        if (!user?.id || !profileId) return;

        let cancelled = false;
        const trackProfileView = async () => {
            try {
                const result = await authService.logProfileView(user.id!);
                if (cancelled) return;
                setProfileViewsCount(result.profileViewsCount);
            } catch (error) {
                console.error("Error logging profile view:", error);
            }
        };

        trackProfileView();
        return () => {
            cancelled = true;
        };
    }, [profileId, user?.id]);

    useEffect(() => {
        if (!notification) return;
        const t = window.setTimeout(() => setNotification(null), 2600);
        return () => window.clearTimeout(t);
    }, [notification]);

    useEffect(() => {
        if (!isConnectionsModalOpen) {
            setConnectionsPage({ followers: 1, following: 1 });
        }
    }, [isConnectionsModalOpen]);

    useEffect(() => {
        setConnectionsPage((prev) => ({
            followers: Math.min(prev.followers, Math.max(1, Math.ceil(followerUsers.length / CONNECTIONS_PAGE_SIZE))),
            following: Math.min(prev.following, Math.max(1, Math.ceil(followingUsers.length / CONNECTIONS_PAGE_SIZE))),
        }));
    }, [followerUsers.length, followingUsers.length]);

    const updateUploadContentLocal = useCallback((contentId: string | number, updater: (item: UploadContentRecord) => UploadContentRecord) => {
        const normalizedId = String(contentId);
        setUploadContents((prev) =>
            prev.map((entry) =>
                String(entry.id) === normalizedId || String(entry.content_id || entry.contentId || "") === normalizedId
                    ? updater(entry)
                    : entry
            )
        );
    }, []);

    const openBottomSheet = async (type: SheetType, product: any, source: "market" | "goog" | "upload" | boolean = false) => {
        const resolvedSource = source === true ? "goog" : (source || "market");
        setBottomSheetType(type);
        setInteractionProduct(product);
        setIsBottomSheetOpen(true);
        setBottomSheetData([]);
        setIsBottomSheetLoading(true);
        setIsBottomSheetGoog(resolvedSource === "goog");
        setIsBottomSheetUpload(resolvedSource === "upload");
        try {
            let data = [];
            if (resolvedSource === "goog") {
                if (type === "comments") data = await googService.getComments(product.id);
                else if (type === "likes") data = await googService.getLikes(product.id);
                else if (type === "shares") data = await googService.getShares(product.id);
                else if (type === "views") data = await googService.getViews(product.id);
            } else if (resolvedSource === "upload") {
                if (type === "comments") data = await uploadContentService.getComments(product.id);
                else if (type === "likes") data = await uploadContentService.getLikes(product.id);
                else if (type === "shares") data = await uploadContentService.getShares(product.id);
                else if (type === "views") data = await uploadContentService.getViews(product.id);
            } else {
                if (type === "comments") data = await marketService.getComments(product.id);
                if (type === "likes") data = (await marketService.getLikes?.(product.id)) || [];
                if (type === "shares") data = (await marketService.getShares?.(product.id)) || [];
                if (type === "views") data = (await marketService.getViews?.(product.id)) || [];
            }
            setBottomSheetData(data || []);
        } finally { setIsBottomSheetLoading(false); }
    };

    const handleUploadContentLike = useCallback(async (item: UploadContentRecord) => {
        if (!authService.isAuthenticated() || !currentUser?.id) {
            openLoginRequired({ message: "Please log in to like upload content." });
            return;
        }
        const previousLiked = !!item.user_liked;
        const optimisticLiked = !previousLiked;
        updateUploadContentLocal(item.id, (entry) => ({
            ...entry,
            user_liked: optimisticLiked,
            likes_count: Math.max(0, Number(entry.likes_count ?? entry.likeCount ?? 0) + (optimisticLiked ? 1 : -1)),
            likeCount: Math.max(0, Number(entry.likes_count ?? entry.likeCount ?? 0) + (optimisticLiked ? 1 : -1)),
        }));
        try {
            const result = await uploadContentService.toggleLike(item.id);
            updateUploadContentLocal(item.id, (entry) => ({
                ...entry,
                user_liked: !!result.liked,
                likes_count: Number(result.likes_count || 0),
                likeCount: Number(result.likes_count || 0),
            }));
            if (isBottomSheetOpen && isBottomSheetUpload && bottomSheetType === "likes" && interactionProduct?.id === item.id) {
                setBottomSheetData(await uploadContentService.getLikes(item.id));
            }
        } catch (error) {
            console.error("Failed to toggle upload content like:", error);
            updateUploadContentLocal(item.id, (entry) => ({
                ...entry,
                user_liked: previousLiked,
                likes_count: Math.max(0, Number(entry.likes_count ?? entry.likeCount ?? 0) + (previousLiked ? 1 : -1)),
                likeCount: Math.max(0, Number(entry.likes_count ?? entry.likeCount ?? 0) + (previousLiked ? 1 : -1)),
            }));
        }
    }, [bottomSheetType, currentUser?.id, interactionProduct, isBottomSheetOpen, isBottomSheetUpload, updateUploadContentLocal]);

    const handleUploadContentShare = useCallback(async (item: UploadContentRecord) => {
        setShareProduct({
            ...item,
            title: item.topic || "Upload content",
            image_url: item.media_preview || item.thumbnail_url || item.media_gallery?.[0] || "",
        });
        setShareUrlOverride(`${typeof window !== "undefined" ? window.location.origin : ""}/dashboard/profile?id=${item.user_id}`);
        setInitialShareView("share");
        setShowShareModal(true);
        try {
            const result = await uploadContentService.logShare(item.id);
            updateUploadContentLocal(item.id, (entry) => ({
                ...entry,
                shares_count: Number(result.shares_count || 0),
                shareCount: Number(result.shares_count || 0),
            }));
        } catch (error) {
            console.error("Failed to share upload content:", error);
        }
    }, [updateUploadContentLocal]);

    const handleEditUploadContent = useCallback((item: UploadContentRecord) => {
        if (item.status !== "Pending Approval") return;
        try {
            const mediaGallery = Array.isArray(item.media_gallery) ? item.media_gallery : [];
            const draftPayload = {
                version: 1,
                editingAdId: String(item.content_id || item.contentId || item.id || ""),
                activeLink: item.external_link || "",
                linkInput: item.external_link || "",
                description: item.description || "",
                uploadTopic: item.topic || "",
                uploadAffiliateCommission: Number(item.affiliate_commission || 0),
                uploadSubscriptionPackages: Array.isArray(item.subscription_packages) ? item.subscription_packages : [],
                uploadShowLinkedContentOnHome: !!item.show_link_on_home,
                uploadHashtags: Array.isArray(item.hashtags) ? item.hashtags.join(" ") : "",
                uploadVisibility: item.visibility || "public",
                uploadAllowComments: item.allow_comments !== false,
                acceptedUploadTerms: true,
                ctaTopic: "No Button",
                ctaValue: "",
                budget: Number(item.price || 0),
                uploadMaxPriceInput: Number(item.price || 0),
                mediaPreview: item.media_preview || mediaGallery[0] || "",
                mediaGallery,
                mediaType: item.media_type || "",
                thumbnailPreview: item.thumbnail_url || "",
                thumbnailName: item.thumbnail_url ? "Current thumbnail" : "",
                contentAccessMode: item.content_access_mode || "unblurred",
                uploadPreviewMode: item.preview_mode || "thumbnail",
            };
            window.localStorage.setItem("googer-ad-draft-vault-content", JSON.stringify(draftPayload));
        } catch {}
        router.push("/dashboard/ad-campaign/upload-content");
    }, [router]);

    const handleUploadContentView = useCallback(async (item: UploadContentRecord) => {
        try {
            const result = await uploadContentService.logView(item.id);
            updateUploadContentLocal(item.id, (entry) => ({
                ...entry,
                views_count: Number(result.views_count || 0),
                viewCount: Number(result.views_count || 0),
            }));
        } catch (error) {
            console.error("Failed to log upload content view:", error);
        }
    }, [updateUploadContentLocal]);

    const isPromotedAdTarget = (item: any) => {
        const raw = item?.raw || item || {};
        return !!(
            raw.is_sponsored ||
            raw.isAd ||
            raw.campaign_type ||
            raw.adId ||
            raw.ad_id ||
            String(raw.id || item?.id || "").startsWith("ad-")
        );
    };

    const handleAdToggleLike = async (item: any) => {
        if (!item) return;
        const target = item.raw || item;
        const liveState = useAdStore.getState().getAdState(target);
        const isLiked = !!(liveState.user_liked ?? item.user_liked ?? item.liked ?? item.raw?.user_liked);
        const isLocked = !!(
            liveState.ad_like_locked ||
            liveState.ad_coin_collected ||
            item.ad_like_locked ||
            item.ad_coin_collected ||
            item.coinCollected ||
            item.raw?.ad_like_locked ||
            item.raw?.ad_coin_collected
        );

        if (isLiked && isLocked) {
            updateAdState(target, { user_liked: true, ad_like_locked: true });
            setNotification({
                type: "error",
                title: "Like Locked",
                message: "You already collected coins for this ad. You cannot unlike.",
            });
            return;
        }

        try {
            await adActions.like(target);
        } catch (error: any) {
            if (error?.locked) return;
            console.error("Ad like toggle failed:", error);
        }
    };

    const handleToggleLike = async (item: any) => {
        if (isPromotedAdTarget(item)) {
            await handleAdToggleLike(item);
            return;
        }

        const id = typeof item === 'object' ? item.id : item;
        const currentPost = typeof item === 'object' ? item : posts.find((p) => p.id === id);
        if (!currentPost) return;

        if (isPromotedAdTarget(currentPost)) {
            await handleAdToggleLike(currentPost);
            return;
        }

        const wasLiked = !!currentPost.user_liked;
        const willBeLiked = !wasLiked;
        setPosts((prev) => prev.map((p) => p.id === id ? { ...p, user_liked: willBeLiked, likes_count: Math.max(0, (p.likes_count || 0) + (willBeLiked ? 1 : -1)) } : p));
        try {
            const serverLiked = await marketService.toggleLike(id);
            if (serverLiked !== willBeLiked) {
                setPosts((prev) => prev.map((p) => p.id === id ? { ...p, user_liked: serverLiked, likes_count: Math.max(0, (p.likes_count || 0) + (serverLiked ? 1 : -1)) } : p));
            }
            if (isBottomSheetOpen && bottomSheetType === "likes" && interactionProduct?.id === id) {
                setBottomSheetData((await marketService.getLikes?.(id)) || []);
            }
        } catch {
            setPosts((prev) => prev.map((p) => p.id === id ? { ...p, user_liked: wasLiked, likes_count: Math.max(0, (p.likes_count || 0) + (wasLiked ? 1 : -1)) } : p));
        }
    };

    const handleGoogToggleLike = useCallback(async (goog: WritePost) => {
        const wasLiked = !!goog.liked;
        const willBeLiked = !wasLiked;
        setGoogs((prev) => prev.map((g) => g.id === goog.id ? { ...g, liked: willBeLiked, likes: Math.max(0, (g.likes || 0) + (willBeLiked ? 1 : -1)) } : g));
        try {
            const serverLiked = await googService.toggleLike(goog.id);
            setGoogs((prev) => prev.map((g) => g.id === goog.id ? { ...g, liked: serverLiked, likes: Math.max(0, (g.likes || 0) + (serverLiked === g.liked ? 0 : serverLiked ? 1 : -1)) } : g));
        } catch {
            setGoogs((prev) => prev.map((g) => g.id === goog.id ? { ...g, liked: wasLiked, likes: Math.max(0, (g.likes || 0) + (wasLiked === g.liked ? 0 : wasLiked ? 1 : -1)) } : g));
        }
    }, []);

    const handleViewGoog = useCallback(async (postId: number) => {
        try {
            const result = await googService.logView(postId);
            const nextViews = Number(result?.views_count ?? result?.views ?? NaN);
            if (Number.isFinite(nextViews) || result?.incremented === true) {
                setGoogs((prev) => prev.map((g) => g.id === postId ? { ...g, views: Number.isFinite(nextViews) ? nextViews : (g.views || 0) + 1 } : g));
            }
        } catch { }
    }, []);

    const handleToggleGoogMenu = (event: React.MouseEvent<HTMLButtonElement>, post: WritePost) => {
        event.stopPropagation();
        if (openGoogMenu?.post.id === post.id) { setOpenGoogMenu(null); return; }
        const rect = event.currentTarget.getBoundingClientRect();
        const menuWidth = 200;
        const left = Math.max(12, Math.min(window.innerWidth - menuWidth - 12, rect.right - menuWidth));
        const top = Math.min(window.innerHeight - 200, rect.bottom + 8);
        setOpenGoogMenu({ post, top: Math.max(12, top), left });
    };

    const handleDeleteGoog = async (post: WritePost) => {
        setOpenGoogMenu(null);
        setGoogs((prev) => prev.filter((g) => g.id !== post.id));
        try { await googService.deletePost(post.id); } catch {
            setGoogs((prev) => [post, ...prev]);
        }
    };

    const handleLogShare = async (id: number) => {
        await marketService.logShare(id);
        setPosts((prev) => prev.map((p) => p.id === id ? { ...p, shares_count: (p.shares_count || 0) + 1 } : p));
        updateAdState(id, (prev) => ({ shares_count: (prev.shares_count || 0) + 1 }));
    };

    const handleShareClick = (product: any, view: "share" | "resell" = "share") => {
        if (!product) return;
        setShareUrlOverride(null);
        if (view === "resell") {
            let enabled = false;
            try {
                const c = typeof product.commission_info === "string" ? JSON.parse(product.commission_info) : product.commission_info;
                enabled = !!(c?.resell_percentage || c?.resell_amount || c?.resell_commission || c?.reseller_commission || c?.googer_commission);
            } catch { enabled = false; }
            if (!enabled) {
                setNotification({ type: "error", title: "Unavailable", message: "This product is not available for reselling" });
                return;
            }
        }
        setInitialShareView(view);
        setShareProduct(product);
        setShowShareModal(true);
        handleLogShare(product.id);
    };

    const getSaveableAdId = (target: any) => {
        const raw = target?.raw || target || {};
        return String(
            raw.adId ||
            raw.ad_id ||
            target?.adId ||
            target?.ad_id ||
            ""
        ).replace(/^ad-/, "");
    };

    const isAdSaved = (target: any) => {
        const adId = getSaveableAdId(target);
        return !!adId && savedAdIds.has(adId);
    };

    const handleToggleAdSave = async (target: any) => {
        const targetAdId = getSaveableAdId(target);
        if (!targetAdId) {
            setAdSaveLimitToast("This ad cannot be saved because its ad ID is missing.");
            setTimeout(() => setAdSaveLimitToast(null), 3500);
            return;
        }

        const wasSaved = savedAdIds.has(targetAdId);
        setSavedAdIds((prev) => {
            const next = new Set(prev);
            if (wasSaved) next.delete(targetAdId);
            else next.add(targetAdId);
            return next;
        });

        const result = await adsService.toggleSave(targetAdId);
        if (!result.ok) {
            setSavedAdIds((prev) => {
                const next = new Set(prev);
                if (wasSaved) next.add(targetAdId);
                else next.delete(targetAdId);
                return next;
            });
            setAdSaveLimitToast(result.message || "You have reached your ad save limit. Please upgrade to a higher plan.");
            setTimeout(() => setAdSaveLimitToast(null), 3500);
            return;
        }

        setSavedAdIds((prev) => {
            const next = new Set(prev);
            if (result.saved) next.add(targetAdId);
            else next.delete(targetAdId);
            return next;
        });
        // Update save counts in real-time
        const mediaType = (result.mediaType || "photo") as "photo" | "video";
        setAdSaveCounts((prev) => ({
            ...prev,
            [mediaType]: Math.max(0, prev[mediaType] + (result.saved ? 1 : -1)),
        }));
    };

    const isAdSaveAtLimit = (target: any): boolean => {
        if (isAdSaved(target)) return false; // already saved — can unsave
        const raw = (target as any);
        const isVideo = raw?.type === "video" || raw?.mediaType === "video" ||
            String(raw?.media_type || "").toLowerCase().includes("video");
        const key = isVideo ? "video" : "photo";
        const limit = adSaveLimits[key];
        if (limit === null || limit < 0) return false;
        return adSaveCounts[key] >= limit;
    };

    const handleLogView = async (target: any) => {
        const viewId = getAdViewTarget(target);
        const result = await marketService.logView(viewId);
        if (!result?.success && result?.incremented !== true) return;

        const isAdTarget = String(viewId).startsWith("ad-");
        if (isAdTarget) {
            const nextViewsCount = Number(
                result.views_count ??
                result.viewCount ??
                result.views ??
                target?.views_count ??
                target?.viewCount ??
                0
            );
            updateAdState(target, {
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
            return;
        }

        if (result?.incremented === true) {
            setPosts((prev) => prev.map((p) => p.id === viewId ? { ...p, views_count: (p.views_count || 0) + 1 } : p));
            updateAdState(viewId, (prev) => ({ views_count: (prev.views_count || 0) + 1 }));
        }
    };

    const handleCopyProfileLink = async () => {
        const username = user?.username || user?.id || "profile";
        const copyValue = getProfileShareUrl({ ...user, username });

        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(copyValue);
            } else {
                const textArea = document.createElement("textarea");
                textArea.value = copyValue;
                textArea.style.position = "fixed";
                textArea.style.opacity = "0";
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                document.execCommand("copy");
                document.body.removeChild(textArea);
            }
            setNotification({ type: "success", title: "Copied", message: "Profile link copied." });
        } catch {
            setNotification({ type: "error", title: "Copy failed", message: "Could not copy profile link." });
        }
    };

    const handleMenuToggle = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        setShowMenu((prev) => !prev);
    };

    const handleOpenBlockedAccounts = async () => {
        if (!currentUser?.id) return;
        try {
            setIsBlockedLoading(true);
            setIsBlockedModalOpen(true);
            const data = await chatService.getBlockedUsers();
            setBlockedUsers(data || []);
        } catch (error: any) {
            setNotification({
                type: "error",
                title: "Load failed",
                message: error?.message || "Could not load blocked accounts."
            });
            setIsBlockedModalOpen(false);
        } finally {
            setIsBlockedLoading(false);
        }
    };

    const handleToggleSubscription = async () => {
        if (!user?.id || isSubscriptionLoading) return;

        try {
            setIsSubscriptionLoading(true);
            const result = await authService.toggleSubscription(user.id);
            setIsSubscribed(result.isSubscribed);
            setSubscriberCount(result.subscriberCount);
        } catch (error: any) {
            setNotification({
                type: "error",
                title: "Subscribe failed",
                message: error?.message || "Could not update subscription."
            });
        } finally {
            setIsSubscriptionLoading(false);
        }
    };

    const handleOpenConnections = async () => {
        if (!user?.id) return;

        try {
            setIsConnectionsLoading(true);
            setIsConnectionsModalOpen(true);
            setConnectionsPage({ followers: 1, following: 1 });
            const [followersData, followingData] = await Promise.all([
                authService.getFollowerUsers(user.id),
                authService.getFollowingUsers(user.id),
            ]);
            setFollowerUsers(followersData || []);
            setFollowingUsers(followingData || []);
            setSubscriberCount((followersData || []).length);
            setFollowingCount((followingData || []).length);
        } catch (error: any) {
            setNotification({
                type: "error",
                title: "Load failed",
                message: error?.message || "Could not load connections."
            });
            setIsConnectionsModalOpen(false);
        } finally {
            setIsConnectionsLoading(false);
        }
    };

    const handleOpenConnectionsView = async (view: "followers" | "following") => {
        setConnectionsView(view);
        await handleOpenConnections();
    };

    const getConnectionUserId = (connectionUser: UserRecord) =>
        connectionUser.id || connectionUser.user_id || null;

    const isConnectionSubscribed = (connectionUser: UserRecord) => {
        const connectionId = getConnectionUserId(connectionUser);
        if (!connectionId || !currentUser?.id) return false;
        if (String(connectionId) === String(currentUser.id)) return false;

        if (typeof connectionUser.is_subscribed === "boolean") {
            return connectionUser.is_subscribed;
        }

        return followingUsers.some((followedUser) => {
            const followedId = getConnectionUserId(followedUser);
            return followedId && String(followedId) === String(connectionId);
        });
    };

    const handleConnectionSubscriptionToggle = async (
        event: React.MouseEvent<HTMLButtonElement>,
        connectionUser: UserRecord,
    ) => {
        event.stopPropagation();

        const connectionId = getConnectionUserId(connectionUser);
        if (!connectionId || !currentUser?.id || String(connectionId) === String(currentUser.id)) return;
        if (connectionActionUserId && String(connectionActionUserId) === String(connectionId)) return;

        const wasSubscribed = isConnectionSubscribed(connectionUser);
        setConnectionActionUserId(connectionId);

        setFollowerUsers((prev) =>
            prev.map((item) =>
                String(getConnectionUserId(item) || "") === String(connectionId)
                    ? { ...item, is_subscribed: !wasSubscribed }
                    : item
            )
        );
        setFollowingUsers((prev) => {
            if (wasSubscribed) {
                return prev.filter((item) => String(getConnectionUserId(item) || "") !== String(connectionId));
            }

            const exists = prev.some((item) => String(getConnectionUserId(item) || "") === String(connectionId));
            if (exists) {
                return prev.map((item) =>
                    String(getConnectionUserId(item) || "") === String(connectionId)
                        ? { ...item, is_subscribed: true }
                        : item
                );
            }

            return [...prev, { ...connectionUser, is_subscribed: true }];
        });
        setFollowingCount((prev) => Math.max(0, prev + (wasSubscribed ? -1 : 1)));

        try {
            const result = await authService.toggleSubscription(connectionId);
            setFollowerUsers((prev) =>
                prev.map((item) =>
                    String(getConnectionUserId(item) || "") === String(connectionId)
                        ? { ...item, is_subscribed: result.isSubscribed }
                        : item
                )
            );
            setFollowingUsers((prev) => {
                if (!result.isSubscribed) {
                    return prev.filter((item) => String(getConnectionUserId(item) || "") !== String(connectionId));
                }

                const exists = prev.some((item) => String(getConnectionUserId(item) || "") === String(connectionId));
                if (exists) {
                    return prev.map((item) =>
                        String(getConnectionUserId(item) || "") === String(connectionId)
                            ? { ...item, ...connectionUser, is_subscribed: true }
                            : item
                    );
                }

                return [...prev, { ...connectionUser, is_subscribed: true }];
            });
            setFollowingCount((prev) => {
                const expected = result.isSubscribed ? Math.max(prev, 1) : Math.max(0, prev);
                return expected;
            });
        } catch (error: any) {
            setFollowerUsers((prev) =>
                prev.map((item) =>
                    String(getConnectionUserId(item) || "") === String(connectionId)
                        ? { ...item, is_subscribed: wasSubscribed }
                        : item
                )
            );
            setFollowingUsers((prev) => {
                if (wasSubscribed) {
                    const exists = prev.some((item) => String(getConnectionUserId(item) || "") === String(connectionId));
                    if (exists) return prev;
                    return [...prev, { ...connectionUser, is_subscribed: true }];
                }

                return prev.filter((item) => String(getConnectionUserId(item) || "") !== String(connectionId));
            });
            setFollowingCount((prev) => Math.max(0, prev + (wasSubscribed ? 1 : -1)));
            setNotification({
                type: "error",
                title: "Subscribe failed",
                message: error?.message || "Could not update subscription.",
            });
        } finally {
            setConnectionActionUserId(null);
        }
    };

    const followersPageCount = Math.max(1, Math.ceil(followerUsers.length / CONNECTIONS_PAGE_SIZE));
    const followingPageCount = Math.max(1, Math.ceil(followingUsers.length / CONNECTIONS_PAGE_SIZE));
    const visibleConnections = (connectionsView === "followers" ? followerUsers : followingUsers).slice(
        ((connectionsPage[connectionsView] || 1) - 1) * CONNECTIONS_PAGE_SIZE,
        ((connectionsPage[connectionsView] || 1) - 1) * CONNECTIONS_PAGE_SIZE + CONNECTIONS_PAGE_SIZE,
    );
    const activeConnectionsPageCount = connectionsView === "followers" ? followersPageCount : followingPageCount;

    const handleCopyGoogerId = async () => {
        const copyValue = String(user?.user_id || user?.id || "");
        if (!copyValue) return;

        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(copyValue);
            } else {
                const textArea = document.createElement("textarea");
                textArea.value = copyValue;
                textArea.style.position = "fixed";
                textArea.style.opacity = "0";
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                document.execCommand("copy");
                document.body.removeChild(textArea);
            }
            setNotification({ type: "success", title: "Copied", message: "Googer ID copied." });
        } catch {
            setNotification({ type: "error", title: "Copy failed", message: "Could not copy Googer ID." });
        }
    };

    const handleMailClick = () => {
        if (!(user?.contact_email || (isOwnProfile && user?.email))) {
            setNotification({ type: "error", title: "Unavailable", message: "No email details available for this user." });
            return;
        }

        setIsMailModalOpen(true);
    };

    const handleContactClick = () => {
        const phone = user?.contact_phone || user?.shipping_address?.phone || user?.shipping_address?.phone2;
        if (!phone) {
            setNotification({ type: "error", title: "Unavailable", message: "No contact number available for this user." });
            return;
        }

        handleCallUser();
    };

    const handleOpenEmailClient = () => {
        const email = user?.contact_email || (isOwnProfile ? user?.email : null);
        if (!email || typeof window === "undefined") return;
        window.location.href = `mailto:${email}`;
    };

    const handleCallUser = () => {
        const phone = user?.contact_phone || user?.shipping_address?.phone || user?.shipping_address?.phone2;
        if (!phone || typeof window === "undefined") return;
        if (typeof window !== "undefined") {
            window.location.href = `tel:${phone}`;
        }
    };

    const handleMessageClick = () => {
        if (!user?.id || isOwnProfile) return;
        router.push(`/dashboard/chats?user=${user.id}`);
    };

    const handleBlockAccountClick = async () => {
        if (isOwnProfile || !user?.id) return;
        setShowMenu(false);
        const confirmed = window.confirm(
            isBlocked
                ? `Unblock ${displayName}?`
                : `Block ${displayName}? This will hide chats, profile details, ads, and products.`,
        );
        if (!confirmed) return;
        await handleConfirmBlockAccount();
    };

    const handleConfirmBlockAccount = async () => {
        if (isOwnProfile || !user?.id) return;
        setBlockSubmitting(true);
        try {
            if (isBlocked) {
                await chatService.unblockUser(Number(user.id));
                setIsBlocked(false);
                setShowBlockAccountModal(false);
                setBlockedUsers((prev) => prev.filter((entry) => String(entry.id) !== String(user.id)));
                addTopbarNotification({ type: "success", title: "Unblocked", message: "This account has been unblocked." });
                if (typeof window !== "undefined") {
                    window.dispatchEvent(new CustomEvent("googer-blocked-users-updated"));
                }
            } else {
                await chatService.blockUser(Number(user.id));
                setIsBlocked(true);
                setShowBlockAccountModal(false);
                setPosts([]);
                setGoogs([]);
                setProfileAds([]);
                setMarketAds([]);
                addTopbarNotification({ type: "success", title: "Blocked", message: "Account successfully blocked." });
                if (typeof window !== "undefined") {
                    window.dispatchEvent(new CustomEvent("googer-blocked-users-updated"));
                }
                router.replace("/dashboard");
            }
        } catch {
            setNotification({ type: "error", title: "Error", message: `Could not ${isBlocked ? "unblock" : "block"} user.` });
        } finally {
            setBlockSubmitting(false);
        }
    };

    const handleReportAccountClick = () => {
        if (isOwnProfile) return;
        setShowMenu(false);
        setReportReason("");
        setReportCustom("");
        setShowReportModal(true);
    };

    const handleSubmitReport = async () => {
        if (!reportReason || !user?.id) return;
        setReportSubmitting(true);
        try {
            const token = authService.getToken?.();
            const res = await fetch(`/api/auth/user/${user.id}/report`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify({ reason: reportReason, custom_reason: reportCustom || undefined }),
            });
            const contentType = res.headers.get("content-type") || "";
            const data = contentType.includes("application/json") ? await res.json().catch(() => null) : null;
            setShowReportModal(false);
            setNotification({ type: res.ok ? "success" : "error", title: res.ok ? "Report submitted" : "Error", message: data.message || "Report submitted." });
        } catch {
            setNotification({ type: "error", title: "Error", message: "Could not submit report." });
        } finally {
            setReportSubmitting(false);
        }
    };

    const handleSelfDeactivateClick = async () => {
        if (!isOwnProfile) return;
        const confirmed = window.confirm("Deactivate your account? Your public profile, Googs, products, and running ads will be hidden.");
        if (!confirmed) return;
        try {
            setShowMenu(false);
            await authService.selfDeactivateAccount();
            authService.logout();
        } catch (error: any) {
            setNotification({
                type: "error",
                title: "Deactivate failed",
                message: error?.message || "Could not deactivate your account.",
            });
        }
    };

    const handleSelfDeleteConfirm = async () => {
        try {
            setIsDeletingAccount(true);
            await authService.selfDeleteAccount();
            router.replace("/login");
        } catch (error: any) {
            setNotification({
                type: "error",
                title: "Delete failed",
                message: error?.message || "Could not delete your account.",
            });
        } finally {
            setIsDeletingAccount(false);
            setShowDeleteAccountModal(false);
        }
    };

    const profileImage = useMemo(() => {
        if (!user) return "";
        const profileDisplayName = getUserDisplayName(user, "Googer");
        return user.profile_picture
            ? (user.profile_picture.startsWith("http") || user.profile_picture.startsWith("data:")
                ? user.profile_picture
                : `/uploads/${user.profile_picture.split(/[\\/]/).pop()}`)
            : `https://ui-avatars.com/api/?name=${encodeURIComponent(profileDisplayName)}&size=240&background=111111&color=ffffff`;
    }, [user]);

    const username = user?.username || "googer";
    const displayName = getUserDisplayName(user, "Googer User");
    const bioLinks = extractUrls(user?.bio)
        .slice(0, 2)
        .map((bioLink) => getCanonicalProfileLink(bioLink, username || user?.username));
    const cleanedBio = (user?.bio || "").replace(/\n{3,}/g, "\n\n").trim();
    const bioLines = cleanedBio
        .split(/\n+/)
        .filter(Boolean)
        .map((line) => line.replace(/(https?:\/\/[^\s]+|www\.[^\s]+)/gi, "").trim())
        .filter(Boolean);
    const canShowMail = Boolean((isOwnProfile && (user?.contact_email || user?.email)) || (!isOwnProfile && user?.contact_email && user?.contact_email_visibility !== "only_me"));
    const canShowContact = Boolean((isOwnProfile && (user?.contact_phone || user?.shipping_address?.phone || user?.shipping_address?.phone2)) || (!isOwnProfile && user?.contact_phone && user?.contact_phone_visibility !== "only_me"));
    const blockedProfileImage = profileImage;
    const visiblePosts = useMemo(
        () => posts.filter((post) => !hiddenPostIds.some((hiddenId) => matchesAdIdentity(post, hiddenId) || String(post.id) === hiddenId)),
        [hiddenPostIds, posts],
    );
    const renderPosts = useMemo(() => {
        const profilePromotePosts = visiblePosts.filter((post) => {
            const campaignType = String(post.campaign_type || (post as any).campaignType || "").trim().toLowerCase();
            return campaignType === "profile promote";
        });

        if (profilePromotePosts.length <= 1) {
            return visiblePosts;
        }

        const shuffledProfilePromotePosts = [...profilePromotePosts]
            .map((post) => ({ post, sort: Math.random() }))
            .sort((a, b) => a.sort - b.sort)
            .map((entry) => entry.post);

        let profilePromoteIndex = 0;
        return visiblePosts.map((post) => {
            const campaignType = String(post.campaign_type || (post as any).campaignType || "").trim().toLowerCase();
            if (campaignType !== "profile promote") {
                return post;
            }
            const nextPost = shuffledProfilePromotePosts[profilePromoteIndex];
            profilePromoteIndex += 1;
            return nextPost || post;
        });
    }, [visiblePosts]);

    // Interleaved feed: googs/upload reviews with profile owner's ads every 4 posts.
    // Upload review cards are owner-only, so pending/rejected content never appears to other users.
    const googsFeed = useMemo(() => {
        type FeedItem =
            | { type: 'goog'; data: WritePost }
            | { type: 'ad'; data: any }
            | { type: 'upload-content'; data: UploadContentRecord };
        const visibleProfileAds = profileAds.filter((ad) => {
            if (hiddenPostIds.some((hiddenId) => matchesAdIdentity(ad, hiddenId) || String(ad?.id) === hiddenId)) return false;
            if (isOwnProfile) return true;
            const status = String(ad?.status || ad?.raw?.status || "").trim().toLowerCase().replace(/[_-]+/g, " ");
            const savedAt = ad?.saved_at || ad?.savedAt || ad?.raw?.saved_at || ad?.raw?.savedAt;
            return status === "completed" && !!savedAt;
        });
        if (!isOwnProfile) {
            return [
                ...googs.map((g): FeedItem => ({ type: 'goog', data: g })),
                ...visibleProfileAds.map((a): FeedItem => ({ type: 'ad', data: a })),
            ];
        }
        const ownerUploadItems = uploadContents.map((item): FeedItem => ({ type: 'upload-content', data: item }));
        const ownerPrimaryItems = [
            ...ownerUploadItems,
            ...googs.map((g): FeedItem => ({ type: 'goog', data: g })),
        ].sort((a, b) => {
            const aPinned = a.type === 'upload-content' ? Date.parse(String(a.data?.pinned_at || "")) : 0;
            const bPinned = b.type === 'upload-content' ? Date.parse(String(b.data?.pinned_at || "")) : 0;
            if ((Number.isFinite(aPinned) ? aPinned : 0) || (Number.isFinite(bPinned) ? bPinned : 0)) {
                return (Number.isFinite(bPinned) ? bPinned : 0) - (Number.isFinite(aPinned) ? aPinned : 0);
            }
            const aDate = Date.parse(String(a.data?.created_at || a.data?.updated_at || ""));
            const bDate = Date.parse(String(b.data?.created_at || b.data?.updated_at || ""));
            return (Number.isFinite(bDate) ? bDate : 0) - (Number.isFinite(aDate) ? aDate : 0);
        });
        if (!ownerPrimaryItems.length) return visibleProfileAds.map((a): FeedItem => ({ type: 'ad', data: a }));
        if (!visibleProfileAds.length) return ownerPrimaryItems;
        const result: FeedItem[] = [];
        let adIndex = 0;
        ownerPrimaryItems.forEach((item, i) => {
            result.push(item);
            if ((i + 1) % 4 === 0) {
                if (adIndex < visibleProfileAds.length) {
                    result.push({ type: 'ad', data: visibleProfileAds[adIndex] });
                }
                adIndex++;
            }
        });
        if (visibleProfileAds.length) {
            visibleProfileAds.slice(adIndex).forEach((ad) => {
                result.push({ type: 'ad', data: ad });
            });
        }
        return result;
    }, [googs, hiddenPostIds, isOwnProfile, profileAds, uploadContents]);

    if (loading) return <div className="flex min-h-[60vh] items-center justify-center text-zinc-400">Loading profile</div>;
    if (!user) return null;
    if (!isOwnProfile && isBlocked) {
        return (
            <div className="mx-auto max-w-[880px] pb-10 text-white">
                <section className="overflow-hidden rounded-[2rem] border border-white/8 bg-[#0c0c0f] shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
                    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-12 text-center">
                        <div className="relative h-24 w-24 overflow-hidden rounded-full border border-white/10 bg-white">
                            <Image src={blockedProfileImage} alt={displayName} fill className="object-cover" unoptimized />
                        </div>
                        <h2 className="mt-5 text-2xl font-black text-white">{displayName}</h2>
                        <p className="mt-1 text-sm text-zinc-400">@{username}</p>
                        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-4 py-2 text-xs font-black uppercase tracking-widest text-red-300">
                            <IonIcon name="ban-outline" className="text-sm" />
                            Blocked Account
                        </div>
                        <p className="mt-5 max-w-md text-sm text-zinc-400">
                            This user is blocked. Their profile, chat, products, ads, and contact details are hidden until you unblock them.
                        </p>
                        <div className="mt-8 flex w-full max-w-sm gap-3">
                            <button
                                type="button"
                                onClick={() => router.push("/dashboard/chats")}
                                className="flex-1 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-white transition hover:bg-white/[0.08]"
                            >
                                Back
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowBlockAccountModal(true)}
                                disabled={blockSubmitting}
                                className="flex-1 rounded-2xl bg-white px-4 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-black transition hover:bg-zinc-200 disabled:opacity-50"
                            >
                                {blockSubmitting ? "..." : "Unblock"}
                            </button>
                        </div>
                    </div>
                </section>
                {showBlockAccountModal && (
                    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-black/80" onClick={() => !blockSubmitting && setShowBlockAccountModal(false)} />
                        <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-[#151515] p-5 shadow-2xl">
                            <div className="flex items-center gap-4">
                                <div className="relative h-14 w-14 overflow-hidden rounded-full border border-white/10 bg-white">
                                    <Image src={blockedProfileImage} alt={displayName} fill className="object-cover" unoptimized />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="truncate text-sm font-black uppercase tracking-widest">{displayName}</h3>
                                    <p className="truncate text-xs text-white/50">@{username}</p>
                                </div>
                            </div>
                            <p className="mt-5 text-sm text-zinc-300">Unblock this account and allow profile, chat, product, and ad connections again?</p>
                            <div className="mt-6 flex gap-3">
                                <button type="button" onClick={() => setShowBlockAccountModal(false)} className="flex-1 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-white transition hover:bg-white/[0.08]">Cancel</button>
                                <button type="button" onClick={handleConfirmBlockAccount} disabled={blockSubmitting} className="flex-1 rounded-2xl bg-white px-4 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-black transition hover:bg-zinc-200 disabled:opacity-50">{blockSubmitting ? "..." : "Unblock"}</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-[1280px] pb-10 text-white">
            <section className="overflow-hidden rounded-[2rem] border border-white/8 bg-[#0c0c0f] shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
                <div className="relative overflow-hidden px-4 pb-6 pt-4 min-[960px]:px-6">
                    <div className="relative flex items-center justify-end gap-3 text-white/90">
                        <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-medium text-zinc-300">
                            <IonIcon name="eye-outline" className="text-sm" />
                            <span>{formatSubscriberCount(profileViewsCount)}</span>
                        </div>
                        <button
                            type="button"
                            onClick={handleMenuToggle}
                            className="light-theme-option-dots relative flex h-7 w-7 -translate-x-[5px] items-center justify-center rounded-full border border-white/50"
                            aria-label="Open profile options"
                        >
                            <div className="flex items-center gap-1">
                                <span data-dot className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--theme-dot)" }} />
                                <span data-dot className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--theme-dot)" }} />
                            </div>
                        </button>
                        {showMenu && (
                            <div
                                className="absolute right-0 top-10 z-20 w-48 overflow-hidden rounded-xl border border-white/10 bg-[#141414] p-1.5 shadow-2xl"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <button
                                    onClick={() => {
                                        toggleManualTheme();
                                        setShowMenu(false);
                                    }}
                                    className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs text-white transition hover:bg-white/6"
                                >
                                    <span className="flex items-center gap-2">
                                        <IonIcon name={resolvedTheme === "dark" ? "moon" : "sunny"} className="text-sm" />
                                        {resolvedTheme === "dark" ? "Dark Mode" : "Light Mode"}
                                    </span>
                                    <span className={`h-2 w-2 rounded-full ${themePreference === "system" ? "bg-white/30" : "bg-emerald-400"}`} />
                                </button>
                                <button
                                    onClick={() => {
                                        setPreference("system");
                                        setShowMenu(false);
                                    }}
                                    className="mb-1 flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs text-white/70 transition hover:bg-white/6"
                                >
                                    <span className="flex items-center gap-2">
                                        <IonIcon name="phone-portrait-outline" className="text-sm" />
                                        Auto Device Theme
                                    </span>
                                    {themePreference === "system" && <IonIcon name="checkmark-circle" className="text-sm text-emerald-400" />}
                                </button>
                                {isOwnProfile ? (
                                    <>
                                        <button
                                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-white/40"
                                            disabled
                                        >
                                            <IonIcon name="help-circle-outline" className="text-sm" />
                                            Help & Support
                                        </button>
                                        <button
                                            onClick={() => {
                                                setShowMenu(false);
                                                setIsProfileShareModalOpen(true);
                                            }}
                                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-white transition hover:bg-white/6"
                                        >
                                            <IonIcon name="share-social-outline" className="text-sm" />
                                            Share profile
                                        </button>
                                        <button
                                            onClick={() => {
                                                setShowMenu(false);
                                                router.push("/dashboard/settings");
                                            }}
                                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-white transition hover:bg-white/6"
                                        >
                                            <IonIcon name="settings-outline" className="text-sm" />
                                            Settings
                                        </button>
                                        <button
                                            onClick={() => {
                                                setShowMenu(false);
                                                handleOpenBlockedAccounts();
                                            }}
                                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-white transition hover:bg-white/6"
                                        >
                                            <IonIcon name="ban-outline" className="text-sm" />
                                            Blocked Accounts
                                        </button>
                                        <button
                                            onClick={() => {
                                                setShowMenu(false);
                                                router.push("/dashboard/terms");
                                            }}
                                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-white transition hover:bg-white/6"
                                        >
                                            <IonIcon name="document-text-outline" className="text-sm" />
                                            Terms and Policies
                                        </button>
                                        <button
                                            onClick={() => authService.logout()}
                                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-red-400 transition hover:bg-red-500/10"
                                        >
                                            <IonIcon name="log-out-outline" className="text-sm" />
                                            Log out
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button
                                            onClick={() => {
                                                setShowMenu(false);
                                                setIsProfileShareModalOpen(true);
                                            }}
                                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-white transition hover:bg-white/6"
                                        >
                                            <IonIcon name="share-social-outline" className="text-sm" />
                                            Share profile
                                        </button>
                                        <button
                                            onClick={handleBlockAccountClick}
                                            disabled={blockSubmitting}
                                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-white transition hover:bg-white/6 disabled:opacity-50"
                                        >
                                            <IonIcon name={isBlocked ? "ban" : "ban-outline"} className="text-sm" />
                                            {blockSubmitting ? "..." : isBlocked ? "Unblock Account" : "Block Account"}
                                        </button>
                                        <button
                                            onClick={handleReportAccountClick}
                                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-white transition hover:bg-white/6"
                                        >
                                            <IonIcon name="alert-circle-outline" className="text-sm" />
                                            Report
                                        </button>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="mt-3">
                        <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-3">
                                    <div className="relative shrink-0">
                                        <div className="relative h-16 w-16 overflow-hidden rounded-full border border-white/10 bg-white shadow-lg min-[960px]:h-[72px] min-[960px]:w-[72px]">
                                            {profileImage ? <Image src={profileImage} alt={displayName} fill className="object-cover" unoptimized /> : <div className="flex h-full w-full items-center justify-center bg-zinc-800 text-xl font-black">{getInitials(displayName)}</div>}
                                        </div>
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex min-w-0 items-center gap-1.5">
                                            <h1 className="truncate text-[22px] font-black tracking-tight text-white min-[960px]:text-[26px]">{displayName}</h1>
                                            {badge && (
                                                <span className="shrink-0">
                                                    <BadgeSvg color={badge.color} tickColor={badge.tickColor} size={14} />
                                                </span>
                                            )}
                                        </div>
                                        <p className="mt-1 truncate text-[13px] font-medium text-zinc-300">
                                            @{username}
                                        </p>
                                        <div className="mt-1 flex items-center gap-2 text-[12px] font-medium text-zinc-500">
                                            <p className="truncate">Googer ID: {formatGoogerId(user.user_id || user.googer_id || user.id)}</p>
                                            <button
                                                type="button"
                                                onClick={handleCopyGoogerId}
                                                className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-zinc-300 transition hover:bg-white/[0.08] hover:text-white"
                                                title="Copy Googer ID"
                                            >
                                                <IonIcon name="copy-outline" className="text-[13px]" />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-4 max-w-xl">
                                    <div className="space-y-1.5 text-[13px] font-semibold tracking-tight leading-5 text-zinc-200 min-[960px]:text-[14px]">
                                        {bioLines.length > 0 ? bioLines.map((line, idx) => (
                                            <p key={`${line}-${idx}`} className="break-words">
                                                {renderBioText(line, username || user?.username)}
                                            </p>
                                        )) : <p className="text-zinc-500">No bio yet</p>}
                                    </div>

                                    <div className="mt-3 flex flex-col items-start gap-2">
                                        {bioLinks.map((bioLink) => (
                                            <a
                                                key={bioLink}
                                                href={normalizeUrl(bioLink)}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex max-w-full items-center gap-2 text-[13px] font-medium text-sky-400 transition hover:text-sky-300"
                                            >
                                                <IonIcon name="link-outline" className="text-sm shrink-0" />
                                                <span className="truncate">{formatDisplayUrl(bioLink)}</span>
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {(canShowMail || canShowContact || !isOwnProfile) && (
                            <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5 min-[900px]:flex-nowrap">
                                {!isOwnProfile && user?.id && (
                                    <button
                                        type="button"
                                        onClick={handleMessageClick}
                                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#2a2c32] text-white transition hover:bg-[#343740]"
                                        title="Message"
                                        aria-label="Message user"
                                    >
                                        <IonIcon name="chatbubble-ellipses-outline" className="text-[18px]" />
                                    </button>
                                )}
                                {canShowMail && (
                                    <button
                                        type="button"
                                        onClick={handleMailClick}
                                        className="rounded-xl bg-[#2a2c32] px-3.5 py-2 text-[13px] font-medium text-white transition hover:bg-[#343740]"
                                    >
                                        Mail
                                    </button>
                                )}
                                {canShowContact && (
                                    <button
                                        type="button"
                                        onClick={handleContactClick}
                                        className="rounded-xl bg-[#2a2c32] px-3.5 py-2 text-[13px] font-medium text-white transition hover:bg-[#343740]"
                                    >
                                        Contact
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="mt-4 flex flex-col items-center text-center">
                        <div
                            role={isOwnProfile ? "button" : undefined}
                            tabIndex={isOwnProfile ? 0 : undefined}
                            onClick={() => { if (isOwnProfile) handleOpenConnectionsView("followers"); }}
                            onKeyDown={(e) => {
                                if (!isOwnProfile) return;
                                if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    handleOpenConnectionsView("followers");
                                }
                            }}
                            className={isOwnProfile ? "cursor-pointer select-none rounded-[1.35rem] px-4 py-2 transition-opacity hover:opacity-85" : "select-none rounded-[1.35rem] px-4 py-2"}
                        >
                            <div className="flex items-end gap-2">
                                <span className="pb-0.5 text-[15px] font-semibold tracking-tight text-zinc-300">
                                    {formatSubscriberCount(subscriberCount)}
                                </span>
                                <span className="pb-0.5 text-[15px] font-semibold tracking-tight text-zinc-300">Googers</span>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={handleToggleSubscription}
                            disabled={isSubscriptionLoading}
                            className={`mt-2 inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-bold leading-none transition ${isSubscribed ? "cursor-pointer bg-zinc-700 text-white hover:bg-zinc-600" : "cursor-pointer bg-white text-black hover:bg-zinc-200"} ${isSubscriptionLoading ? "opacity-70" : ""}`}
                        >
                            {isSubscriptionLoading ? "Updating..." : isSubscribed ? "Subscribed" : "Subscribe"}
                        </button>
                    </div>

                    <div className="mt-4 border-b border-white/10 text-center">
                        <div className="grid grid-cols-2">
                            <button onClick={() => setActiveTab("threads")} className={`pb-2.5 pt-1.5 text-[24px] font-medium ${activeTab === "threads" ? "text-white" : "text-zinc-500"}`}>Products</button>
                            <button onClick={() => setActiveTab("replies")} className={`pb-2.5 pt-1.5 text-[24px] font-medium ${activeTab === "replies" ? "text-zinc-300" : "text-zinc-500"}`}>Googs</button>
                        </div>
                        <div className={`h-[2px] w-1/2 bg-white transition-transform duration-300 ${activeTab === "replies" ? "translate-x-full" : "translate-x-0"}`} />
                    </div>
                </div>

                <div className="border-t border-white/6 bg-[#101010]">
                    {activeTab === "threads" ? (
                        visiblePosts.length > 0 ? (
                            <div className="grid grid-cols-2 gap-2 px-3 py-4 sm:grid-cols-2 sm:px-4 md:gap-6 md:px-6 lg:grid-cols-4">
                                {renderPosts.map((post, index) => {
                                    const isAd = !!(post.is_sponsored || post.campaign_type);
                                    if (isAd) {
                                        const normalizedAd = normalizeAdData(post);
                                        return (
                                            <PromotedAdCard
                                                key={`${post.id}-${index}`}
                                                ad={normalizedAd}
                                                source="profile"
                                                isMenuOpen={String(openMenuAdId) === String(normalizedAd.id)}
                                                onToggleMenu={(adId) => setOpenMenuAdId(openMenuAdId === adId ? null : adId)}
                                                onCloseMenu={() => setOpenMenuAdId(null)}
                                                onProductClick={(p) => setAdPreviewModal({ ad: p, type: "product" })}
                                                onAddToBagClick={(p) => setAdPreviewModal({ ad: p, type: "product" })}
                                                onOpenSecondView={(targetAd) => setAdPreviewModal({
                                                    ad: targetAd,
                                                    type: "ad",
                                                    kind: normalizedAd.type === "video" ? "video" : "image",
                                                    images: getProfileAdSecondViewImages(targetAd),
                                                })}
                                                onToggleLike={(item) => handleAdToggleLike(item)}
                                                onOpenSheet={(type, p) => openBottomSheet(type as any, p)}
                                                onShare={handleShareClick}
                                                onLogView={handleLogView}
                                                onReport={(p) => setReportingProduct(p)}
                                                onNotInterested={(id) => setHiddenPostIds((prev) => [...prev, String(id)])}
                                                onPromoteAgain={handlePromoteAgain}
                                                onCollectCoin={(event, p) => adActions.handleAdCoinClick(event, p)}
                                                canShowCollectCoin={(p) => adActions.canShowCollectCoin(p)}
                                                onNavigateToProfile={(event, userId) => {
                                                    if (userId) router.push(`/dashboard/profile?id=${userId}`);
                                                }}
                                                currentUser={currentUser}
                                                isSaved={isAdSaved(normalizedAd)}
                                                onToggleSave={viewerHasPaidPlan ? handleToggleAdSave : undefined}
                                                showExpiryWarning={viewerHasPaidPlan && (normalizedAd.type === "photo" || normalizedAd.type === "video")}
                                                saveAtLimit={isAdSaveAtLimit(normalizedAd)}
                                            />
                                        );
                                    }
                                    return (
                                        <SharedProductCard
                                            key={`${post.id}-${index}`}
                                            product={post}
                                            isAd={isAd}
                                            currentUser={currentUser}
                                            onProductClick={(p) => router.push(`/dashboard/shop?id=${p.id}`)}
                                            onAddToBagClick={(p) => router.push(`/dashboard/shop?id=${p.id}`)}
                                            onToggleLike={(item) => handleToggleLike(item)}
                                            onOpenSheet={(type, p) => openBottomSheet(type as any, p)}
                                            onShare={handleShareClick}
                                            onLogView={handleLogView}
                                            onReport={(p) => setReportingProduct(p)}
                                            onNotInterested={(id) => setHiddenPostIds((prev) => [...prev, String(id)])}
                                            onCollectCoin={(event, p) => adActions.handleAdCoinClick(event, p)}
                                            canShowCollectCoin={(p) => adActions.canShowCollectCoin(p)}
                                            onNavigateToProfile={(event, userId) => {
                                                if (userId) router.push(`/dashboard/profile?id=${userId}`);
                                            }}
                                            onEditProduct={(p) => router.push(`/dashboard/shop?id=${p.id}`)}
                                            onDeleteProduct={async (p) => {
                                                if (window.confirm("Delete this post?")) {
                                                    await marketService.deleteItem(p.id);
                                                    setPosts((prev) => prev.filter((item) => item.id !== p.id));
                                                }
                                            }}
                                        />
                                    );
                                })}
                            </div>
                        ) : <div className="px-5 py-14 text-center text-zinc-400">No active market posts are available for this profile yet.</div>
                    ) : googsFeed.length > 0 ? (
                        <div className="flex flex-col">
                            {googsFeed.map((item, index) => {
                                if (item.type === 'ad') {
                                    const normalizedAd = normalizeAdData(item.data);
                                    return (
                                        <article key={`ad-${item.data.id}-${index}`} className="px-4 py-4 transition-colors sm:px-7">
                                            <div className="mx-auto w-full max-w-[360px]">
                                                <PromotedAdCard
                                                    ad={normalizedAd}
                                                    source="profile"
                                                    isMenuOpen={String(openMenuAdId) === String(normalizedAd.id)}
                                                    onToggleMenu={(adId) => setOpenMenuAdId(openMenuAdId === adId ? null : adId)}
                                                    onCloseMenu={() => setOpenMenuAdId(null)}
                                                    onProductClick={(p) => setAdPreviewModal({ ad: p, type: "product" })}
                                                    onAddToBagClick={(p) => setAdPreviewModal({ ad: p, type: "product" })}
                                                    onOpenSecondView={(targetAd) => setAdPreviewModal({
                                                        ad: targetAd,
                                                        type: "ad",
                                                        kind: normalizedAd.type === "video" ? "video" : "image",
                                                        images: getProfileAdSecondViewImages(targetAd),
                                                        suppressCoinRewards: !isOwnProfile,
                                                    })}
                                                    onToggleLike={(p) => handleAdToggleLike(p)}
                                                    onOpenSheet={(type, p) => openBottomSheet(type as any, p)}
                                                    onShare={handleShareClick}
                                                    onLogView={handleLogView}
                                                    onReport={(p) => setReportingProduct(p)}
                                                    onNotInterested={(id) => setHiddenPostIds((prev) => [...prev, String(id)])}
                                                    onPromoteAgain={handlePromoteAgain}
                                                    onCollectCoin={(event, p) => {
                                                        if (!isOwnProfile) return;
                                                        adActions.handleAdCoinClick(event, p);
                                                    }}
                                                    canShowCollectCoin={(p) => isOwnProfile && adActions.canShowCollectCoin(p)}
                                                    onNavigateToProfile={(event, userId) => {
                                                        if (userId) router.push(`/dashboard/profile?id=${userId}`);
                                                    }}
                                                    currentUser={currentUser}
                                                    isSaved={isOwnProfile ? isAdSaved(normalizedAd) : false}
                                                    onToggleSave={isOwnProfile && viewerHasPaidPlan ? handleToggleAdSave : undefined}
                                                    showExpiryWarning={isOwnProfile && viewerHasPaidPlan && (normalizedAd.type === "photo" || normalizedAd.type === "video")}
                                                    saveAtLimit={isOwnProfile ? isAdSaveAtLimit(normalizedAd) : false}
                                                    allowPhotoVideoPromoteAgain={isOwnProfile}
                                                />
                                            </div>
                                        </article>
                                    );
                                }
                                if (item.type === 'upload-content') {
                                    return (
                                        <article key={`upload-content-${item.data.contentId || item.data.content_id || item.data.id}`} className="px-4 py-4 transition-colors sm:px-7">
                                            <ProfileUploadContentCard
                                                item={item.data}
                                                onToggleLike={handleUploadContentLike}
                                                onOpenSheet={(type, uploadItem) => openBottomSheet(type, uploadItem, "upload")}
                                                onShare={handleUploadContentShare}
                                                onLogView={handleUploadContentView}
                                                onEdit={handleEditUploadContent}
                                            />
                                        </article>
                                    );
                                }
                                return (
                                    <GoogCard
                                        key={item.data.id}
                                        post={item.data}
                                        showSubscribe={false}
                                        onNavigateToProfile={(event, userId) => {
                                            if (userId) router.push(`/dashboard/profile?id=${userId}`);
                                        }}
                                        onToggleLike={() => handleGoogToggleLike(item.data)}
                                        onOpenSheet={(type, g) => openBottomSheet(type as SheetType, g, true)}
                                        onToggleMenu={handleToggleGoogMenu}
                                        onViewPost={handleViewGoog}
                                        onSharePost={() => {
                                            setShareUrlOverride(getShareUrlForItem(item.data, "goog"));
                                            setShareProduct(item.data);
                                            setInitialShareView("share");
                                            setShowShareModal(true);
                                            googService.logShare(item.data.id).catch(() => {});
                                        }}
                                    />
                                );
                            })}
                        </div>
                    ) : (googsFeed.length === 0 ? <div className="px-5 py-14 text-center text-zinc-400">No Googs posted yet.</div> : null)}
                </div>
            </section>

            {openGoogMenu && (
                <div
                    className="fixed inset-0 z-[135]"
                    onClick={() => setOpenGoogMenu(null)}
                >
                    <div
                        className="absolute w-52 overflow-hidden rounded-2xl border border-white/10 bg-[#1a1a1a] py-2 shadow-[0_22px_70px_rgba(0,0,0,0.45)] animate-in slide-in-from-top-2 duration-200"
                        style={{ top: openGoogMenu.top, left: openGoogMenu.left }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {isOwnProfile && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => { setOpenGoogMenu(null); window.dispatchEvent(new CustomEvent("open-write-googs-modal", { detail: openGoogMenu.post })); }}
                                    className="flex w-full items-center gap-3 border-t border-white/5 px-4 py-3 text-left text-[11px] font-bold text-white transition-colors hover:bg-white/5"
                                >
                                    <IonIcon name="create-outline" className="text-lg text-emerald-400" />
                                    Edit
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleDeleteGoog(openGoogMenu.post)}
                                    className="flex w-full items-center gap-3 border-t border-white/5 px-4 py-3 text-left text-[11px] font-bold text-red-500 transition-colors hover:bg-white/5"
                                >
                                    <IonIcon name="trash-outline" className="text-lg" />
                                    Delete
                                </button>
                            </>
                        )}
                        <button
                            type="button"
                            onClick={() => {
                                setShareUrlOverride(getShareUrlForItem(openGoogMenu.post, "goog"));
                                setShareProduct(openGoogMenu.post);
                                setInitialShareView("share");
                                setShowShareModal(true);
                                googService.logShare(openGoogMenu.post.id).catch(() => {});
                                setOpenGoogMenu(null);
                            }}
                            className="flex w-full items-center gap-3 border-t border-white/5 px-4 py-3 text-left text-[11px] font-bold text-white transition-colors hover:bg-white/5"
                        >
                            <IonIcon name="share-social-outline" className="text-lg text-blue-400" />
                            Share
                        </button>
                    </div>
                </div>
            )}

            {isConnectionsModalOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80" onClick={() => setIsConnectionsModalOpen(false)} />
                    <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-white/10 bg-[#151515] shadow-2xl">
                        <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
                            <div>
                                <h3 className="text-sm font-black uppercase tracking-widest">{connectionsView === "followers" ? "Googers" : "Subscriptions"}</h3>
                                <p className="mt-1 text-xs text-white/50">
                                    {connectionsView === "followers"
                                        ? `${formatSubscriberCount(subscriberCount)} Googers`
                                        : `${formatSubscriberCount(followingCount)} subscriptions`}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsConnectionsModalOpen(false)}
                                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.06] text-white/60 transition hover:bg-white/10 hover:text-white"
                            >
                                <IonIcon name="close-outline" className="text-xl" />
                            </button>
                        </div>

                        <div className="border-b border-white/8 px-5 py-3">
                            <div className="inline-flex rounded-2xl border border-white/10 bg-white/[0.03] p-1">
                                <button
                                    type="button"
                                    onClick={() => setConnectionsView("followers")}
                                    className={`rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] transition ${connectionsView === "followers" ? "bg-white text-black" : "text-white/60 hover:text-white"}`}
                                >
                                    Googers
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setConnectionsView("following")}
                                    className={`rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] transition ${connectionsView === "following" ? "bg-white text-black" : "text-white/60 hover:text-white"}`}
                                >
                                    Subscriptions
                                </button>
                            </div>
                        </div>

                        <div className="max-h-[70vh] overflow-y-auto px-4 py-3">
                            {isConnectionsLoading ? (
                                <div className="px-3 py-10 text-center text-sm text-zinc-400">
                                    {connectionsView === "followers" ? "Loading Googers..." : "Loading subscriptions..."}
                                </div>
                            ) : visibleConnections.length > 0 ? (
                                <>
                                    {visibleConnections.map((connectionUser) => {
                                    const displayName = getUserDisplayName(connectionUser, "Googer");
                                    const connectionImage = connectionUser.profile_picture
                                        ? (connectionUser.profile_picture.startsWith("http") || connectionUser.profile_picture.startsWith("data:")
                                            ? connectionUser.profile_picture
                                            : `/uploads/${connectionUser.profile_picture.split(/[\\/]/).pop()}`)
                                        : `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&size=120&background=111111&color=ffffff`;
                                    const connectionId = getConnectionUserId(connectionUser);
                                    const showSubscribeButton = !!connectionId && String(connectionId) !== String(currentUser?.id || "");
                                    const subscribed = isConnectionSubscribed(connectionUser);
                                    const isPending = !!connectionActionUserId && String(connectionActionUserId) === String(connectionId);

                                    return (
                                        <div
                                            key={`${connectionId}-${connectionUser.username}`}
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => {
                                                if (!connectionId) return;
                                                setIsConnectionsModalOpen(false);
                                                router.push(`/dashboard/profile?id=${connectionId}`);
                                            }}
                                            onKeyDown={(event) => {
                                                if (event.key !== "Enter" && event.key !== " ") return;
                                                event.preventDefault();
                                                if (!connectionId) return;
                                                setIsConnectionsModalOpen(false);
                                                router.push(`/dashboard/profile?id=${connectionId}`);
                                            }}
                                            className="mb-2 flex w-full cursor-pointer items-center gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-white/[0.04]"
                                        >
                                            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border border-white/10 bg-white">
                                                <Image src={connectionImage} alt={displayName} fill className="object-cover" unoptimized />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-semibold text-white">{displayName}</p>
                                                <p className="mt-0.5 truncate text-xs text-zinc-400">@{connectionUser.username}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {showSubscribeButton && (
                                                    <button
                                                        type="button"
                                                        onClick={(event) => handleConnectionSubscriptionToggle(event, connectionUser)}
                                                        disabled={isPending}
                                                        className={`min-w-[108px] rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] transition ${subscribed
                                                            ? "border border-white/15 bg-white/10 text-white"
                                                            : "bg-white text-black hover:bg-zinc-200"
                                                            } ${isPending ? "opacity-60" : ""}`}
                                                    >
                                                        {isPending ? "Updating" : subscribed ? "Subscribed" : "Subscribe"}
                                                    </button>
                                                )}
                                                <IonIcon name="chevron-forward-outline" className="text-lg text-zinc-500" />
                                            </div>
                                        </div>
                                    );
                                })}

                                    {activeConnectionsPageCount > 1 && (
                                        <div className="mt-4 flex items-center justify-center gap-2 px-3 pb-2">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setConnectionsPage((prev) => ({
                                                        ...prev,
                                                        [connectionsView]: Math.max(1, prev[connectionsView] - 1),
                                                    }))
                                                }
                                                disabled={(connectionsPage[connectionsView] || 1) === 1}
                                                className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white transition disabled:opacity-35"
                                            >
                                                Prev
                                            </button>
                                            <div className="min-w-[120px] text-center text-[10px] font-black uppercase tracking-[0.16em] text-white/60">
                                                Page {connectionsPage[connectionsView] || 1} / {activeConnectionsPageCount}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setConnectionsPage((prev) => ({
                                                        ...prev,
                                                        [connectionsView]: Math.min(activeConnectionsPageCount, prev[connectionsView] + 1),
                                                    }))
                                                }
                                                disabled={(connectionsPage[connectionsView] || 1) === activeConnectionsPageCount}
                                                className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white transition disabled:opacity-35"
                                            >
                                                Next
                                            </button>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="px-3 py-10 text-center text-sm text-zinc-400">
                                    {connectionsView === "followers" ? "No Googers to show yet." : "No subscriptions to show yet."}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {isBlockedModalOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80" onClick={() => setIsBlockedModalOpen(false)} />
                    <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-[#151515] shadow-2xl">
                        <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
                            <div>
                                <h3 className="text-sm font-black uppercase tracking-widest">Blocked Accounts</h3>
                                <p className="mt-1 text-xs text-white/50">{blockedUsers.length} blocked profiles</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsBlockedModalOpen(false)}
                                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.06] text-white/60 transition hover:bg-white/10 hover:text-white"
                            >
                                <IonIcon name="close-outline" className="text-xl" />
                            </button>
                        </div>
                        <div className="max-h-[70vh] overflow-y-auto px-4 py-3">
                            {isBlockedLoading ? (
                                <div className="px-3 py-10 text-center text-sm text-zinc-400">Loading blocked accounts...</div>
                            ) : blockedUsers.length > 0 ? (
                                blockedUsers.map((blockedUser) => {
                                    const blockedDisplayName = getUserDisplayName(blockedUser, "Blocked user");
                                    const blockedImage = blockedUser.profile_picture
                                        ? (blockedUser.profile_picture.startsWith("http") || blockedUser.profile_picture.startsWith("data:")
                                            ? blockedUser.profile_picture
                                            : `/uploads/${blockedUser.profile_picture.split(/[\\/]/).pop()}`)
                                        : `https://ui-avatars.com/api/?name=${encodeURIComponent(blockedDisplayName)}&size=120&background=111111&color=ffffff`;

                                    return (
                                        <div
                                            key={`${blockedUser.id}-${blockedUser.username}`}
                                            className="flex items-center gap-3 rounded-2xl px-3 py-3 transition hover:bg-white/[0.04]"
                                        >
                                            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border border-white/10 bg-white">
                                                <Image src={blockedImage} alt={blockedDisplayName} fill className="object-cover" unoptimized />
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setIsBlockedModalOpen(false);
                                                    router.push(`/dashboard/profile?id=${blockedUser.id}`);
                                                }}
                                                className="min-w-0 flex-1 text-left"
                                            >
                                                <p className="truncate text-sm font-semibold text-white">{blockedDisplayName}</p>
                                                <p className="mt-0.5 truncate text-xs text-zinc-400">@{blockedUser.username}</p>
                                                {blockedUser.bio && <p className="mt-1 truncate text-xs text-zinc-500">{blockedUser.bio}</p>}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={async () => {
                                                    try {
                                                        setBlockSubmitting(true);
                                                        await chatService.unblockUser(Number(blockedUser.id));
                                                        setBlockedUsers((prev) => prev.filter((entry) => String(entry.id) !== String(blockedUser.id)));
                                                        if (String(user?.id || "") === String(blockedUser.id)) {
                                                            setIsBlocked(false);
                                                        }
                                                    } catch {
                                                        setNotification({ type: "error", title: "Error", message: "Could not unblock user." });
                                                    } finally {
                                                        setBlockSubmitting(false);
                                                    }
                                                }}
                                                disabled={blockSubmitting}
                                                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-white/[0.08] disabled:opacity-50"
                                            >
                                                Unblock
                                            </button>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="px-3 py-10 text-center text-sm text-zinc-400">No blocked accounts to show.</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {isProfileShareModalOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80" onClick={() => setIsProfileShareModalOpen(false)} />
                    <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-[#151515] p-5 shadow-2xl">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-black uppercase tracking-widest">Share Profile</h3>
                                <p className="mt-1 text-xs text-white/50">Copy your public profile link.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsProfileShareModalOpen(false)}
                                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.06] text-white/60 transition hover:bg-white/10 hover:text-white"
                            >
                                <IonIcon name="close-outline" className="text-xl" />
                            </button>
                        </div>
                        <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-widest text-white/35">Profile Link</p>
                            <p className="mt-2 break-all text-sm text-white">{getProfileShareUrl({ username: username || user?.id || "profile" })}</p>
                        </div>
                        <div className="mt-4 flex gap-3">
                            <button
                                type="button"
                                onClick={() => setIsProfileShareModalOpen(false)}
                                className="flex-1 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-white transition hover:bg-white/[0.08]"
                            >
                                Close
                            </button>
                            <button
                                type="button"
                                onClick={handleCopyProfileLink}
                                className="flex-1 rounded-2xl bg-white px-4 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-black transition hover:bg-zinc-200"
                            >
                                Copy Link
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showBlockAccountModal && user && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80" onClick={() => !blockSubmitting && setShowBlockAccountModal(false)} />
                    <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-[#151515] p-5 shadow-2xl">
                        <div className="flex items-center gap-4">
                            <div className="relative h-14 w-14 overflow-hidden rounded-full border border-white/10 bg-white">
                                <Image src={blockedProfileImage} alt={displayName} fill className="object-cover" unoptimized />
                            </div>
                            <div className="min-w-0">
                                <h3 className="truncate text-sm font-black uppercase tracking-widest">{displayName}</h3>
                                <p className="truncate text-xs text-white/50">@{username}</p>
                            </div>
                        </div>
                        <p className="mt-5 text-sm text-zinc-300">
                            {isBlocked
                                ? "Unblock this account and allow profile, chat, product, and ad connections again?"
                                : "Block this account and hide chats, profile details, ads, and products from this user?"}
                        </p>
                        <div className="mt-6 flex gap-3">
                            <button type="button" onClick={() => setShowBlockAccountModal(false)} className="flex-1 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-white transition hover:bg-white/[0.08]">Cancel</button>
                            <button type="button" onClick={handleConfirmBlockAccount} disabled={blockSubmitting} className={`flex-1 rounded-2xl px-4 py-3 text-[11px] font-bold uppercase tracking-[0.18em] transition disabled:opacity-50 ${isBlocked ? "bg-white text-black hover:bg-zinc-200" : "bg-red-500 text-white hover:bg-red-400"}`}>
                                {blockSubmitting ? "..." : isBlocked ? "Unblock" : "Block"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isMailModalOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80" onClick={() => setIsMailModalOpen(false)} />
                    <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-[#151515] p-5 shadow-2xl">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-black uppercase tracking-widest">Mail</h3>
                                <p className="mt-1 text-xs text-white/50">Email details</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsMailModalOpen(false)}
                                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.06] text-white/60 transition hover:bg-white/10 hover:text-white"
                            >
                                <IonIcon name="close-outline" className="text-xl" />
                            </button>
                        </div>
                        <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-widest text-white/35">Email</p>
                            <p className="mt-1 break-all text-sm text-white">{user.contact_email || (isOwnProfile ? user.email : "")}</p>
                        </div>
                        <div className="mt-4 flex gap-3">
                            <button
                                type="button"
                                onClick={() => setIsMailModalOpen(false)}
                                className="flex-1 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-white transition hover:bg-white/[0.08]"
                            >
                                Close
                            </button>
                            <button
                                type="button"
                                onClick={handleOpenEmailClient}
                                className="flex-1 rounded-2xl bg-white px-4 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-black transition hover:bg-zinc-200"
                            >
                                Send Email
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isContactModalOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80" onClick={() => setIsContactModalOpen(false)} />
                    <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-[#151515] p-5 shadow-2xl">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-black uppercase tracking-widest">Contact</h3>
                                <p className="mt-1 text-xs text-white/50">Direct call action</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsContactModalOpen(false)}
                                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.06] text-white/60 transition hover:bg-white/10 hover:text-white"
                            >
                                <IonIcon name="close-outline" className="text-xl" />
                            </button>
                        </div>
                        <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-widest text-white/35">Phone</p>
                            <p className="mt-1 break-all text-sm text-white">{user.contact_phone || user.shipping_address?.phone || user.shipping_address?.phone2}</p>
                        </div>
                        <div className="mt-4 flex gap-3">
                            <button
                                type="button"
                                onClick={() => setIsContactModalOpen(false)}
                                className="flex-1 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-white transition hover:bg-white/[0.08]"
                            >
                                Close
                            </button>
                            <button
                                type="button"
                                onClick={handleCallUser}
                                className="flex-1 rounded-2xl bg-white px-4 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-black transition hover:bg-zinc-200"
                            >
                                Call Now
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {adSaveLimitToast && (
                <div className="fixed bottom-6 left-1/2 z-[200] -translate-x-1/2 rounded-2xl border border-orange-400/30 bg-[#1a1614] px-4 py-3 text-[12px] font-black text-orange-200 shadow-[0_18px_45px_rgba(0,0,0,0.55)]">
                    {adSaveLimitToast}
                </div>
            )}

            {reportingProduct && <div className="fixed inset-0 z-[110] flex items-center justify-center p-4"><div className="absolute inset-0 bg-black/80" onClick={() => setReportingProduct(null)} /><div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#151515] p-5"><h3 className="text-sm font-black uppercase tracking-widest">Report Post</h3><p className="mt-2 text-xs text-white/60">Product {reportingProduct.id} reported to admin for review.</p><div className="mt-4 flex justify-end"><button onClick={() => setReportingProduct(null)} className="rounded-xl bg-white px-4 py-2 text-xs font-black uppercase tracking-widest text-black">Close</button></div></div></div>}

            <ShareModal
                isOpen={showShareModal}
                onClose={() => { setShowShareModal(false); setShareUrlOverride(null); }}
                title={shareProduct?.title || "Check out this post"}
                url={shareUrlOverride || (shareProduct ? getShareUrlForItem(shareProduct, "product") : "")}
                description={shareProduct?.description}
                product={shareProduct}
                initialView={initialShareView}
            />

            <InteractionBottomSheet
                isOpen={isBottomSheetOpen}
                onClose={() => {
                    setIsBottomSheetOpen(false);
                    setIsBottomSheetUpload(false);
                }}
                type={bottomSheetType}
                product={interactionProduct}
                data={bottomSheetData}
                onTabChange={(type) => interactionProduct && openBottomSheet(type, interactionProduct, isBottomSheetUpload ? "upload" : isBottomSheetGoog ? "goog" : "market")}
                onAddComment={async (text, parentId) => {
                    if (!interactionProduct) return;
                    if (isBottomSheetGoog) {
                        const comment = await googService.addComment(interactionProduct.id, text, parentId);
                        setBottomSheetData((prev) => [...prev, { ...comment, username: currentUser?.username || "You", profile_picture: currentUser?.profile_picture }]);
                        setGoogs((prev) => prev.map((g) => g.id === interactionProduct.id ? { ...g, comments: (g.comments || 0) + 1 } : g));
                    } else if (isBottomSheetUpload) {
                        const comment = await uploadContentService.addComment(interactionProduct.id, text, parentId);
                        setBottomSheetData((prev) => [...prev, { ...comment, username: currentUser?.username || "You", profile_picture: currentUser?.profile_picture }]);
                        updateUploadContentLocal(interactionProduct.id, (entry) => ({
                            ...entry,
                            comments_count: Number(entry.comments_count ?? entry.commentCount ?? 0) + 1,
                            commentCount: Number(entry.comments_count ?? entry.commentCount ?? 0) + 1,
                        }));
                    } else {
                        const comment = await marketService.addComment(interactionProduct.id, text, parentId);
                        setBottomSheetData((prev) => [...prev, { ...comment, username: currentUser?.username || "You", profile_picture: currentUser?.profile_picture }]);
                        setPosts((prev) => prev.map((p) => p.id === interactionProduct.id ? { ...p, comments_count: (p.comments_count || 0) + 1 } : p));
                        updateAdState(interactionProduct, (prev) => ({ comments_count: (prev.comments_count || 0) + 1 }));
                    }
                }}
                onDeleteComment={async (commentId) => {
                    if (isBottomSheetGoog) {
                        await googService.deleteComment(commentId);
                        setBottomSheetData((prev) => prev.filter((c) => c.id !== commentId && c.parent_id !== commentId));
                        if (interactionProduct?.id) {
                            setGoogs((prev) => prev.map((g) => g.id === interactionProduct.id ? { ...g, comments: Math.max((g.comments || 0) - 1, 0) } : g));
                        }
                    } else if (isBottomSheetUpload) {
                        const result = await uploadContentService.deleteComment(commentId);
                        const deletedCount = Math.max(1, Number(result?.deletedCount || 1));
                        setBottomSheetData((prev) => prev.filter((c) => c.id !== commentId && c.parent_id !== commentId));
                        if (interactionProduct?.id) {
                            updateUploadContentLocal(interactionProduct.id, (entry) => ({
                                ...entry,
                                comments_count: Math.max(0, Number(entry.comments_count ?? entry.commentCount ?? 0) - deletedCount),
                                commentCount: Math.max(0, Number(entry.comments_count ?? entry.commentCount ?? 0) - deletedCount),
                            }));
                        }
                    } else {
                        const result = await marketService.deleteComment(commentId);
                        const deletedCount = Math.max(1, Number(result?.deletedCount || 1));
                        setBottomSheetData((prev) => prev.filter((c) => c.id !== commentId && c.parent_id !== commentId));
                        if (interactionProduct?.id) {
                            setPosts((prev) => prev.map((p) => p.id === interactionProduct.id ? { ...p, comments_count: Math.max((p.comments_count || 0) - deletedCount, 0) } : p));
                            updateAdState(interactionProduct, (prev) => ({ comments_count: Math.max((prev.comments_count || 0) - deletedCount, 0) }));
                        }
                    }
                }}
                onLikeComment={async (commentId) => {
                    if (isBottomSheetUpload) {
                        await uploadContentService.likeComment(Number(commentId));
                        if (interactionProduct?.id) setBottomSheetData((await uploadContentService.getComments(interactionProduct.id)) || []);
                    } else if (!isBottomSheetGoog) {
                        await marketService.likeComment(Number(commentId));
                        if (interactionProduct?.id) setBottomSheetData((await marketService.getComments(interactionProduct.id)) || []);
                    }
                }}
                onDislikeComment={async (commentId) => {
                    if (isBottomSheetUpload) {
                        await uploadContentService.dislikeComment(Number(commentId));
                        if (interactionProduct?.id) setBottomSheetData((await uploadContentService.getComments(interactionProduct.id)) || []);
                    } else if (!isBottomSheetGoog) {
                        await marketService.dislikeComment(Number(commentId));
                        if (interactionProduct?.id) setBottomSheetData((await marketService.getComments(interactionProduct.id)) || []);
                    }
                }}
                onReportComment={async (commentId) => {
                    if (isBottomSheetUpload) await uploadContentService.reportComment(Number(commentId));
                    else if (!isBottomSheetGoog) await marketService.reportComment(Number(commentId));
                }}
                onRefresh={async () => {
                    if (interactionProduct?.id) {
                        if (isBottomSheetGoog) {
                            setBottomSheetData((await googService.getComments(interactionProduct.id)) || []);
                        } else if (isBottomSheetUpload) {
                            if (bottomSheetType === "comments") setBottomSheetData((await uploadContentService.getComments(interactionProduct.id)) || []);
                            else if (bottomSheetType === "likes") setBottomSheetData((await uploadContentService.getLikes(interactionProduct.id)) || []);
                            else if (bottomSheetType === "shares") setBottomSheetData((await uploadContentService.getShares(interactionProduct.id)) || []);
                            else if (bottomSheetType === "views") setBottomSheetData((await uploadContentService.getViews(interactionProduct.id)) || []);
                        } else {
                            setBottomSheetData((await marketService.getComments(interactionProduct.id)) || []);
                        }
                    }
                }}
                currentUser={currentUser}
                isLoading={isBottomSheetLoading}
            />

            {adPreviewModal && adPreviewModal.type === "ad" && (
                <SharedAdSecondViewModal
                    onClose={() => setAdPreviewModal(null)}
                    ad={adPreviewModal.ad}
                    kind={adPreviewModal.kind || "image"}
                    images={adPreviewModal.images}
                    onToggleLike={(item) => handleAdToggleLike(item)}
                    onOpenSheet={openBottomSheet}
                    onShare={(ad) => handleShareClick(ad.raw || ad)}
                    onReport={() => {}}
                    onNotInterested={() => {}}
                    onCollectCoin={(e, target) => {
                        if (adPreviewModal.suppressCoinRewards) return;
                        adActions.handleAdCoinClick(e, target);
                    }}
                    onNavigateToProfile={(e, target) => {
                        setAdPreviewModal(null);
                        router.push(`/dashboard/profile?id=${target.user_id}`);
                    }}
                    canShowCollectCoin={(target) => !adPreviewModal.suppressCoinRewards && adActions.canShowCollectCoin(target)}
                />
            )}

            {adPreviewModal && adPreviewModal.type === "product" && (
                <ShopProductSecondViewModal
                    onClose={() => setAdPreviewModal(null)}
                    product={adPreviewModal.ad}
                    currentUser={currentUser}
                    onToggleLike={(item) => handleToggleLike(item)}
                    onLogView={handleLogView}
                    onOpenSheet={(type, p) => openBottomSheet(type as any, p)}
                    onShare={handleShareClick}
                    onCollectCoin={(e, target) => adActions.handleAdCoinClick(e, target)}
                    canShowCollectCoin={(target) => adActions.canShowCollectCoin(target)}
                    onNavigateToProfile={() => setAdPreviewModal(null)}
                />
            )}

            {showReportModal && (
                <div className="fixed inset-0 z-[240] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/85 backdrop-blur-xl" onClick={() => !reportSubmitting && setShowReportModal(false)} />
                    <div className="relative z-[250] w-full max-w-sm rounded-[2rem] border border-white/10 bg-[#0c0c0f] p-6 shadow-2xl">
                        <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white mb-1">Report @{username}</h3>
                        <p className="text-xs text-white/40 mb-5">Select a reason for reporting this account.</p>
                        <div className="flex flex-col gap-2 mb-5">
                            {["Spam", "Fake Account", "Harassment / Bullying", "Hate Speech", "Nudity / Sexual Content", "Violence", "Scam / Fraud"].map(r => (
                                <button
                                    key={r}
                                    type="button"
                                    onClick={() => setReportReason(r)}
                                    className={`w-full text-left px-4 py-2.5 rounded-2xl text-xs font-bold transition-all border ${reportReason === r ? "bg-white text-black border-white" : "bg-white/[0.03] text-white/70 border-white/8 hover:border-white/20 hover:bg-white/[0.06]"}`}
                                >
                                    {r}
                                </button>
                            ))}
                        </div>
                        <textarea
                            value={reportCustom}
                            onChange={e => setReportCustom(e.target.value)}
                            placeholder="Additional details (optional)"
                            rows={2}
                            className="w-full resize-none rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-xs text-white outline-none placeholder:text-white/25 focus:border-white/20 mb-4"
                        />
                        <div className="flex gap-3">
                            <button type="button" onClick={() => setShowReportModal(false)} disabled={reportSubmitting} className="flex-1 rounded-2xl border border-white/10 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-white/50 hover:bg-white/5 transition">Cancel</button>
                            <button type="button" onClick={handleSubmitReport} disabled={!reportReason || reportSubmitting} className="flex-1 rounded-2xl bg-red-500 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-white hover:bg-red-600 transition disabled:opacity-40">
                                {reportSubmitting ? "Submitting..." : "Submit Report"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showDeleteAccountModal && (
                <div className="fixed inset-0 z-[240] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/85 backdrop-blur-xl" onClick={() => !isDeletingAccount && setShowDeleteAccountModal(false)} />
                    <div className="relative z-[250] w-full max-w-lg rounded-[2rem] border border-red-500/25 bg-[#0c0c0f] p-6 shadow-2xl">
                        <div className="mb-5 flex items-center gap-3">
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-red-500/25 bg-red-500/10 text-red-300">
                                <IonIcon name="trash-outline" className="text-2xl" />
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-white">Delete Account</h3>
                                <p className="text-xs font-bold text-red-200/60">Warning: Once your account is deleted, your data cannot be recovered.</p>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                            <p className="text-sm font-bold text-white/85">If you delete your account:</p>
                            <ul className="mt-3 space-y-2 text-xs font-semibold leading-5 text-white/65">
                                <li>Your profile will be permanently removed.</li>
                                <li>All your posts and uploaded content will be deleted.</li>
                                <li>All your products/listings will be removed from the marketplace.</li>
                                <li>Your chats and messages will be deleted.</li>
                                <li>Your followers, following, likes, comments, and activity history will be lost.</li>
                                <li>You may not be able to recover your account after deletion.</li>
                                <li>This action cannot be undone.</li>
                            </ul>
                        </div>

                        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                            <button
                                type="button"
                                onClick={() => setShowDeleteAccountModal(false)}
                                disabled={isDeletingAccount}
                                className="h-12 flex-1 rounded-2xl bg-white/5 text-[10px] font-black uppercase tracking-widest text-white/55 hover:bg-white/10 hover:text-white disabled:opacity-40"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleSelfDeleteConfirm}
                                disabled={isDeletingAccount}
                                className="h-12 flex-1 rounded-2xl border border-red-500/30 bg-red-500/15 text-[10px] font-black uppercase tracking-widest text-red-200 hover:bg-red-500/25 disabled:opacity-40"
                            >
                                {isDeletingAccount ? "Deleting..." : "Delete My Account"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
