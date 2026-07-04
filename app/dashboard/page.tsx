"use client";

import Image from "next/image";
import React, { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import IonIcon from "@/app/components/IonIcon";
import { authService } from "@/services/authService";
import { marketService } from "@/services/marketService";
import { googService } from "@/services/googService";
import { chatService } from "@/services/chatService";
import ShareModal from "@/app/components/ShareModal";
import InteractionBottomSheet from "@/app/components/InteractionBottomSheet";
import { InteractionButton } from "@/app/components/InteractionButton";
import UploadContentMedia from "@/app/components/UploadContentMedia";
import UploadContentWatchModal from "@/app/components/UploadContentWatchModal";
import { PromotedAdCard } from "@/app/components/ads/PromotedAdCard";
import { ProfilePromoteCarousel } from "@/app/components/ads/ProfilePromoteCarousel";
import { AdImpressionTrigger } from "@/app/components/ads/AdImpressionTrigger";
import { SharedAdSecondViewModal } from "@/app/components/ads/SharedAdSecondViewModal";
import { ShopProductSecondViewModal } from "@/app/components/market/ShopProductSecondViewModal";
import { canShowCollectCoinButton, useAdActions } from "@/app/lib/ads/useAdActions";
import { resolveProductPromoteProduct } from "@/app/lib/ads/resolveProductPromoteProduct";
import { filterAdsForViewer } from "@/app/lib/ads/adVisibility";
import { promotePhotoVideoAdAgain, promoteProductAdAgain } from "@/app/lib/ads/promoteAgain";
import { useAdStore } from "@/app/lib/ads/adStore";
import { normalizeAdData } from "@/app/lib/ads/adNormalizer";
import { getAdInteractionId } from "@/app/lib/ads/adIdentity";
import { formatRelativeTime } from "@/app/lib/relativeTime";
import { getShareUrlForItem } from "@/app/lib/shareLinks";
import { addTopbarNotification } from "@/app/lib/topbarNotifications";
import { getItemProfilePicture, getItemUsername, getUserDisplayName } from "@/app/lib/userDisplay";
import {
    getHiddenFeedItemIds,
    hideFeedItemFor24Hours,
    subscribeToHiddenFeedItems,
} from "@/app/lib/feedHidePreferences";
import { useCart } from "@/app/context/CartContext";
import { GoogCard, type WritePost } from "@/app/components/googs/GoogCard";
import { openLoginRequired } from "@/app/lib/loginRequired";
import { adsService } from "@/services/adsService";
import { uploadContentService, type UploadContentRecord } from "@/services/uploadContentService";
import { AdExpiryWarning } from "@/app/components/ads/AdExpiryWarning";
import {
    AVATAR_IMAGE_SIZES,
    FEED_IMAGE_BLUR_DATA_URL,
    HOME_FEED_IMAGE_SIZES,
    normalizeMediaSrc,
    shouldBypassNextImageOptimization,
} from "@/app/lib/mediaOptimization";

// Type definition moved to GoogCard.tsx

type SheetType = "likes" | "comments" | "shares" | "views";
const VAULT_QUICK_UNLOCK_KEY = "googer-vault-watch-quick-unlock-v1";

type FixedPostMenu = {
    post: WritePost;
    top: number;
    left: number;
};

type TrendingPost = {
    id: string;
    title: string;
    description: string;
    image: string;
    views: number;
    likes: number;
    source: "write" | "ad";
    payload: any;
};

const TRENDING_IMAGE_FALLBACK = "/assets/images/googer.png";

function TrendingPostThumb({ src, alt }: { src?: string; alt: string }) {
    const [imageSrc, setImageSrc] = useState(() => normalizeMediaSrc(src) || TRENDING_IMAGE_FALLBACK);

    useEffect(() => {
        setImageSrc(normalizeMediaSrc(src) || TRENDING_IMAGE_FALLBACK);
    }, [src]);

    return (
        <Image
            src={imageSrc}
            alt={alt}
            fill
            sizes="74px"
            className="object-cover transition duration-300 group-hover:scale-105"
            unoptimized
            onError={() => {
                if (imageSrc !== TRENDING_IMAGE_FALLBACK) {
                    setImageSrc(TRENDING_IMAGE_FALLBACK);
                }
            }}
        />
    );
}

const safeParse = (data: any) => {
    if (!data) return null;
    if (typeof data !== "string") return data;
    try {
        return JSON.parse(data);
    } catch {
        return data;
    }
};

const normalizeExternalUrl = (value: string) => {
    if (!value?.trim()) return "";
    return /^https?:\/\//i.test(value) ? value : `https://${value}`;
};

const getPersistentClientSeed = (storageKey: string) => {
    if (typeof window === "undefined") return storageKey;
    try {
        const existing = window.localStorage.getItem(storageKey);
        if (existing) return existing;
        const next = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        window.localStorage.setItem(storageKey, next);
        return next;
    } catch {
        return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }
};

const getNormalizedUrl = (value: string) => {
    const normalized = normalizeExternalUrl(value);
    if (!normalized) return null;

    try {
        return new URL(normalized);
    } catch {
        return null;
    }
};

const getGoogleImageSourceUrl = (value: string) => {
    const url = getNormalizedUrl(value);
    if (!url) return "";

    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    if (!host.includes("google.") || url.pathname !== "/imgres") return "";

    const imageUrl = url.searchParams.get("imgurl");
    return imageUrl ? decodeURIComponent(imageUrl) : "";
};

const getYouTubeThumbnailUrl = (value: string) => {
    try {
        const url = new URL(normalizeExternalUrl(value));
        const host = url.hostname.replace(/^www\./i, "").toLowerCase();

        let videoId = "";
        if (host === "youtu.be") {
            videoId = url.pathname.split("/").filter(Boolean)[0] || "";
        } else if (host.includes("youtube.com")) {
            if (url.pathname.startsWith("/shorts/") || url.pathname.startsWith("/embed/")) {
                videoId = url.pathname.split("/").filter(Boolean)[1] || "";
            } else {
                videoId = url.searchParams.get("v") || "";
            }
        }

        return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : "";
    } catch {
        return "";
    }
};

const getSponsoredLinkPreviewImage = (value: string) => {
    const normalized = normalizeExternalUrl(value);
    if (!normalized) return "";

    const imagePattern = /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i;
    const googleImageSource = getGoogleImageSourceUrl(normalized);
    if (googleImageSource) return googleImageSource;
    if (imagePattern.test(normalized)) return normalized;

    const youtubeThumbnail = getYouTubeThumbnailUrl(normalized);
    if (youtubeThumbnail) return youtubeThumbnail;

    return `https://api.microlink.io?url=${encodeURIComponent(normalized)}&screenshot=true&meta=false&embed=screenshot.url`;
};

const getYouTubeEmbedUrl = (value: string) => {
    try {
        const url = new URL(normalizeExternalUrl(value));
        const host = url.hostname.replace(/^www\./i, "").toLowerCase();

        if (host === "youtu.be") {
            const id = url.pathname.split("/").filter(Boolean)[0];
            return id ? `https://www.youtube.com/embed/${id}` : null;
        }

        if (host.includes("youtube.com")) {
            const id = url.searchParams.get("v");
            if (id) return `https://www.youtube.com/embed/${id}`;
            const parts = url.pathname.split("/").filter(Boolean);
            const embedIndex = parts.findIndex((part) => part === "embed");
            if (embedIndex >= 0 && parts[embedIndex + 1]) {
                return `https://www.youtube.com/embed/${parts[embedIndex + 1]}`;
            }
        }
    } catch {
        return null;
    }

    return null;
};

const getSponsoredSocialEmbedUrl = (value: string) => {
    const normalized = normalizeExternalUrl(value);
    if (!normalized) return null;

    const youtube = getYouTubeEmbedUrl(normalized);
    if (youtube) return youtube;

    try {
        const url = new URL(normalized);
        const host = url.hostname.replace(/^www\./i, "").toLowerCase();
        const parts = url.pathname.split("/").filter(Boolean);

        if (host.includes("instagram.com")) {
            const type = parts[0];
            const shortcode = parts[1];
            if (["p", "reel", "tv"].includes(type) && shortcode) {
                return `https://www.instagram.com/${type}/${shortcode}/embed`;
            }
        }

        if (host.includes("tiktok.com")) {
            const videoIndex = parts.findIndex((part) => part === "video");
            const videoId = videoIndex >= 0 ? parts[videoIndex + 1] : null;
            return videoId ? `https://www.tiktok.com/embed/v2/${videoId}` : null;
        }

        if (host.includes("facebook.com") || host.includes("fb.watch")) {
            const isVideoUrl = /\/videos\/|\/watch\/|\?v=|fb\.watch/i.test(normalized);
            const plugin = isVideoUrl ? "video.php" : "post.php";
            return `https://www.facebook.com/plugins/${plugin}?href=${encodeURIComponent(normalized)}&show_text=false&width=560`;
        }
    } catch {
        return null;
    }

    return null;
};

const getSponsoredLinkPreviewType = (value: string) => {
    const normalized = normalizeExternalUrl(value);
    if (!normalized) return null;

    const imagePattern = /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i;
    const videoPattern = /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i;

    if (getGoogleImageSourceUrl(normalized)) return "image";
    if (imagePattern.test(normalized)) return "image";
    if (videoPattern.test(normalized)) return "video";
    if (getSponsoredSocialEmbedUrl(normalized)) return "embed";
    return "website";
};

const getSponsoredSecondViewKind = (ad: any, previewType: string | null): "image" | "video" | "embed" => {
    const mediaPreview = String(ad?.media_preview || ad?.video_url || "").trim();
    const hasUploadedVideo =
        /video/i.test(String(ad?.media_type || "")) ||
        /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(mediaPreview);

    if (previewType === "embed") return "embed";
    if (previewType === "video" || hasUploadedVideo) return "video";
    return "image";
};

const getSponsoredCtaHref = (ctaTopic?: string, ctaValue?: string) => {
    const trimmedValue = String(ctaValue || "").trim();
    if (!trimmedValue || ctaTopic === "No Button" || ctaTopic === "Message") return "";
    if (ctaTopic === "Call Now") return `tel:${trimmedValue.replace(/[^\d+]/g, "")}`;
    if (ctaTopic === "WhatsApp") {
        if (/^https?:\/\//i.test(trimmedValue)) return trimmedValue;
        const digits = trimmedValue.replace(/[^\d]/g, "");
        return digits ? `https://wa.me/${digits}` : "";
    }
    if (trimmedValue.includes("@") && !/^https?:\/\//i.test(trimmedValue) && ctaTopic === "Contact Us") {
        return `mailto:${trimmedValue}`;
    }
    return normalizeExternalUrl(trimmedValue);
};

const getSponsoredCallHref = (ad: any) => {
    const directValues = [
        ad?.cta_topic === "Call Now" ? ad?.cta_value : "",
        ad?.phone_number,
        ad?.contact_phone,
        ad?.phone,
    ]
        .map((value) => String(value || "").trim())
        .filter(Boolean);

    for (const value of directValues) {
        if (/^tel:/i.test(value)) return value;
        const digits = value.replace(/[^\d+]/g, "");
        if (digits.replace(/\D/g, "").length >= 7) {
            return `tel:${digits}`;
        }
    }

    return "";
};

const getAdPreviewImage = (ad: any, previewType: string | null) => {
    const activeLink = normalizeExternalUrl(ad?.active_link || "");
    const linkPreviewImage = getSponsoredLinkPreviewImage(activeLink);
    if (previewType === "image" && linkPreviewImage) return linkPreviewImage;

    const gallery = Array.isArray(ad?.media_gallery)
        ? ad.media_gallery
        : Array.isArray(safeParse(ad?.media_gallery))
            ? safeParse(ad?.media_gallery)
            : [];

    const value = [ad?.image_url, ad?.media_preview, linkPreviewImage, ...gallery].find((item) => String(item || "").trim());
    const image = String(value || "https://picsum.photos/400/400").trim();
    return image.includes("uploads") || image.includes("\\") ? `/uploads/${image.split(/[\\/]/).pop()}` : image;
};

const getTrendingWritePostImage = (post: any) => {
    const explicitImage = [
        post?.image_url,
        post?.media_url,
        post?.thumbnail_url,
        post?.image,
    ].find((value) => String(value || "").trim());

    if (explicitImage) return normalizeMediaSrc(explicitImage) || "";

    const textMatch = String(post?.text || "").match(/(https?:\/\/[^\s]+|www\.[^\s]+)/i);
    const linkedUrl = textMatch?.[0] ? normalizeExternalUrl(textMatch[0]) : "";
    if (linkedUrl && /\.(png|jpe?g|gif|webp|avif)(\?.*)?$/i.test(linkedUrl)) {
        return normalizeMediaSrc(linkedUrl) || "";
    }

    return TRENDING_IMAGE_FALLBACK;
};

class DashboardRenderBoundary extends React.Component<
    { fallback: React.ReactNode; children: React.ReactNode },
    { hasError: boolean }
> {
    constructor(props: { fallback: React.ReactNode; children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error: Error) {
        console.error("Dashboard render boundary caught an error:", error);
    }

    render() {
        if (this.state.hasError) {
            return this.props.fallback;
        }
        return this.props.children;
    }
}

const formatUploadMetric = (value?: number | null) => {
    const numeric = Number(value || 0);
    if (numeric >= 1000) return `${(numeric / 1000).toFixed(numeric >= 10000 ? 0 : 1).replace(/\.0$/, "")}K`;
    return `${numeric}`;
};

const isUploadSupportAccount = (userType?: string | null) => {
    const normalized = String(userType || "").trim().toLowerCase().replace(/-/g, "_");
    return normalized === "super_admin" || normalized === "superadmin";
};

function shuffleItems<T>(items: T[]) {
    return [...items].sort(() => Math.random() - 0.5);
}

function hashStringToSeed(value: string) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function seededRandom(seed: number) {
    let value = seed >>> 0;
    return () => {
        value = Math.imul(1664525, value) + 1013904223;
        return (value >>> 0) / 4294967296;
    };
}

function shuffleItemsWithSeed<T>(items: T[], seed: string, keyFn: (item: T) => string) {
    const random = seededRandom(hashStringToSeed(seed));
    return [...items]
        .map((item) => ({ item, rank: random(), key: keyFn(item) }))
        .sort((a, b) => a.rank - b.rank || a.key.localeCompare(b.key))
        .map(({ item }) => item);
}

function getRecentAdIds(storageKey: string) {
    if (typeof window === "undefined") return [];
    try {
        const parsed = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
        return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
        return [];
    }
}

function rememberShownAdIds(storageKey: string, adIds: Array<string | number>) {
    if (typeof window === "undefined" || adIds.length === 0) return;
    const nextShown = adIds.map(String);
    const recent = getRecentAdIds(storageKey);
    const next = [...nextShown, ...recent.filter((id) => !nextShown.includes(id))].slice(0, 80);
    window.localStorage.setItem(storageKey, JSON.stringify(next));
}

function getStableAdOrder(ads: any[], storageKey: string, stableOrderRef: { current: Record<string, string[]> }) {
    const recentAdIds = new Set(getRecentAdIds(storageKey));
    const currentAdIds = new Set(ads.map((ad) => String(ad.id)));
    let stableOrder = stableOrderRef.current[storageKey]?.filter((id) => currentAdIds.has(id)) || [];
    const missingAds = ads.filter((ad) => !stableOrder.includes(String(ad.id)));

    if (stableOrder.length === 0 || missingAds.length > 0) {
        const freshAds = shuffleItems(missingAds.filter((ad) => !recentAdIds.has(String(ad.id))));
        const repeatedAds = shuffleItems(missingAds.filter((ad) => recentAdIds.has(String(ad.id))));
        stableOrder = [...stableOrder, ...freshAds.map((ad) => String(ad.id)), ...repeatedAds.map((ad) => String(ad.id))];
        stableOrderRef.current[storageKey] = stableOrder;
    }

    const adById = new Map(ads.map((ad) => [String(ad.id), ad]));
    return stableOrder.map((id) => adById.get(id)).filter(Boolean);
}

function interleaveWritePostsWithAds(
    posts: WritePost[],
    ads: any[],
    storageKey: string,
    stableOrderRef: { current: Record<string, string[]> },
    writeRatio = 4,
    preserveIncomingOrder = false,
) {
    if (!ads.length) return posts.map((post) => ({ type: "write" as const, post }));
    const rotatedAds = preserveIncomingOrder ? ads : getStableAdOrder(ads, storageKey, stableOrderRef);
    const shownAdIds: Array<string | number> = [];
    const output: Array<{ type: "write"; post: WritePost } | { type: "ad"; ad: any }> = [];
    let adIndex = 0;

    if (!posts.length) {
        const firstAd = rotatedAds[0];
        if (firstAd) {
            rememberShownAdIds(storageKey, [firstAd.id]);
            return [{ type: "ad" as const, ad: firstAd }];
        }
        return output;
    }

    posts.forEach((post, index) => {
        output.push({ type: "write", post });
        if ((index + 1) % writeRatio === 0) {
            const ad = rotatedAds[adIndex % rotatedAds.length];
            if (ad) {
                output.push({ type: "ad", ad });
                shownAdIds.push(ad.id);
                adIndex += 1;
            }
        }
    });

    if (adIndex === 0) {
        const firstAd = rotatedAds[0];
        if (firstAd) {
            output.push({ type: "ad", ad: firstAd });
            shownAdIds.push(firstAd.id);
        }
    }

    rememberShownAdIds(storageKey, shownAdIds);
    return output;
}

function isHomeProfilePromoteAd(ad: any) {
    return String(ad?.campaign_type || ad?.campaignType || "").trim().toLowerCase() === "profile promote";
}

function insertHomeProfilePromoteRows<T extends { type: string }>(items: T[], profilePromoteAds: any[]) {
    if (!profilePromoteAds.length) return items;
    if (!items.length) {
        return [{
            type: "profilePromoteCarousel" as const,
            id: "home-profile-promote-carousel-1",
            ads: profilePromoteAds,
        }];
    }

    const intervals = [4, 10];
    let intervalIndex = 0;
    let googsSinceProfileRow = 0;
    let carouselCount = 0;
    const output: Array<T | { type: "profilePromoteCarousel"; id: string; ads: any[] }> = [];

    items.forEach((item) => {
        output.push(item);
        if (item.type !== "write") return;

        googsSinceProfileRow += 1;
        if (googsSinceProfileRow === intervals[intervalIndex]) {
            carouselCount += 1;
            output.push({
                type: "profilePromoteCarousel",
                id: `home-profile-promote-carousel-${carouselCount}`,
                ads: profilePromoteAds,
            });
            googsSinceProfileRow = 0;
            if (intervalIndex < intervals.length - 1) intervalIndex += 1;
        }
    });

    return output;
}

function insertHomeUploadContentRows<T extends { type: string }>(items: T[], uploadContents: UploadContentRecord[]) {
    if (!uploadContents.length) return items;
    const uploadItems = uploadContents.map((item, index) => ({
        type: "uploadContent" as const,
        id: `home-upload-content-${item.contentId || item.content_id || item.id || index}`,
        item,
    }));

    if (!items.length) return uploadItems;

    const output: Array<T | (typeof uploadItems)[number]> = [];
    let seenFeedCards = 0;
    let uploadIndex = 0;

    items.forEach((item) => {
        output.push(item);
        if (item.type === "profilePromoteCarousel") return;

        seenFeedCards += 1;
        if (seenFeedCards % 5 === 0 && uploadIndex < uploadItems.length) {
            output.push(uploadItems[uploadIndex]);
            uploadIndex += 1;
        }
    });

    while (uploadIndex < uploadItems.length) {
        output.push(uploadItems[uploadIndex]);
        uploadIndex += 1;
    }

    return output;
}

function extractGoogCategories(posts: WritePost[]) {
    const counts = new Map<string, number>();
    posts.forEach((post) => {
        const matches = String(post.text || "").match(/#[A-Za-z0-9_]+/g) || [];
        matches.forEach((tag) => {
            const normalized = tag.replace(/^#/, "").trim();
            if (!normalized) return;
            counts.set(normalized, (counts.get(normalized) || 0) + 1);
        });
    });

    return [
        "All",
        ...Array.from(counts.entries())
            .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
            .slice(0, 10)
            .map(([name]) => name),
    ];
}

function HomeUploadContentCard({
    item,
    currentUser,
    onOpenProfile,
    onToggleLike,
    onOpenSheet,
    onShare,
    onRepost,
    onLogView,
    onPin,
    onReport,
    onNotInterested,
    onAccessChanged,
    flashContentAutoPlay,
}: {
    item: UploadContentRecord;
    currentUser: any;
    onOpenProfile: () => void;
    onToggleLike: (item: UploadContentRecord) => void;
    onOpenSheet: (type: SheetType, item: UploadContentRecord) => void;
    onShare: (item: UploadContentRecord) => void;
    onRepost: (item: UploadContentRecord) => void;
    onLogView: (item: UploadContentRecord) => void;
    onPin: (item: UploadContentRecord) => void;
    onReport: (item: UploadContentRecord) => void;
    onNotInterested: (item: UploadContentRecord) => void;
    onAccessChanged: (item: UploadContentRecord) => void;
    flashContentAutoPlay: boolean;
}) {
    const router = useRouter();
    const media = item.media_preview || item.media_gallery?.[0] || item.thumbnail_url;
    const showBlur = item.content_access_mode === "blurred";
    const isVideo = String(item.media_type || "").toLowerCase().includes("video");
    const isFlashContent = item.content_type === "flash";
    const isLink = String(item.media_type || "").toLowerCase().includes("link");
    const isPlayableFlash = isFlashContent && (isVideo || isLink);
    const watchSource = item.external_link && (isVideo || isLink) ? item.external_link : media || "";
    const isSupportAccount = isUploadSupportAccount(item.user_type);
    const creatorName = isSupportAccount ? "Googer Support" : (item.username || item.full_name || "User");
    const canOpenLink = item.show_link_on_home && !!item.external_link;
    const hasLegacySupportAvatar = /ui-avatars\.com\/api\/\?name=G(?:&|$)/i.test(String(item.profile_picture || ""));
    const profileImage = normalizeMediaSrc(!isSupportAccount && hasLegacySupportAvatar ? "" : (item.profile_picture || ""));
    const createdLabel = item.created_at ? formatRelativeTime(item.created_at) : "Now";
    const likesCount = Number(item.likes_count ?? item.likeCount ?? 0);
    const viewsCount = Number(item.views_count ?? item.viewCount ?? 0);
    const commentsCount = Number(item.comments_count ?? item.commentCount ?? 0);
    const repostsCount = Number(item.reposts_count ?? item.repostCount ?? 0);
    const subscriptionPackages = Array.isArray(item.subscription_packages) ? item.subscription_packages : [];
    const hasSubscriptionPackages = subscriptionPackages.length > 0;
    const [showFullVideo, setShowFullVideo] = useState(false);
    const [showWatchConfirm, setShowWatchConfirm] = useState(false);
    const [watchConfirmBalance, setWatchConfirmBalance] = useState<number | null>(null);
    const [watchConfirmLoading, setWatchConfirmLoading] = useState(false);
    const [watchPurchaseLoading, setWatchPurchaseLoading] = useState(false);
    const [watchConfirmError, setWatchConfirmError] = useState("");
    const [enableQuickUnlock, setEnableQuickUnlock] = useState(false);
    const [showSubscriptionPlans, setShowSubscriptionPlans] = useState(false);
    const [selectedSubscriptionPlanId, setSelectedSubscriptionPlanId] = useState("");
    const [isPurchasingSubscription, setIsPurchasingSubscription] = useState(false);
    const [subscriptionPurchaseError, setSubscriptionPurchaseError] = useState("");
    const [subscriptionPurchaseMessage, setSubscriptionPurchaseMessage] = useState("");
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [showTopUpPrompt, setShowTopUpPrompt] = useState(false);
    const [topUpRequiredAmount, setTopUpRequiredAmount] = useState(0);
    const [hasUnlockedAccess, setHasUnlockedAccess] = useState(() => !!item.user_has_access || !!item.user_purchased);
    const [mediaAspectRatio, setMediaAspectRatio] = useState<number | null>(null);
    const selectedSubscriptionPlan = subscriptionPackages.find((plan) => String(plan.id) === selectedSubscriptionPlanId) || subscriptionPackages[0] || null;
    const isOwnContent = String(item.user_id || "") === String(currentUser?.id || "");
    useEffect(() => {
        setHasUnlockedAccess(!!item.user_has_access || !!item.user_purchased);
    }, [item.user_has_access, item.user_purchased]);
    useEffect(() => {
        setMediaAspectRatio(null);
    }, [item.id, media]);
    const mediaFrameStyle = mediaAspectRatio
        ? { aspectRatio: String(Math.min(1.78, Math.max(0.56, mediaAspectRatio))) }
        : undefined;
    const blurredPreviewMedia = normalizeMediaSrc(
        item.thumbnail_url
        || (isLink ? getSponsoredLinkPreviewImage(item.external_link || "") : "")
        || item.media_preview
        || item.media_gallery?.[0]
        || "",
    );
    const openWatchContent = () => {
        onLogView(item);
        if ((isVideo || isPlayableFlash) && watchSource) {
            setShowFullVideo(true);
            return;
        }
        if (canOpenLink) {
            window.open(normalizeExternalUrl(item.external_link), "_blank", "noopener,noreferrer");
            return;
        }
        onOpenProfile();
    };
    const loadWatchBalance = async () => {
        const profile = await authService.getProfile();
        const balance = Number(profile?.wallet_balance ?? profile?.walletBalance ?? profile?.balance ?? 0);
        const normalizedBalance = Number.isFinite(balance) ? balance : 0;
        setWatchConfirmBalance(normalizedBalance);
        return normalizedBalance;
    };
    const purchaseVaultAndWatch = async () => {
        setWatchPurchaseLoading(true);
        setWatchConfirmError("");
        try {
            const price = Number(item.price || 0);
            const balance = watchConfirmBalance ?? await loadWatchBalance();
            if (balance < price) {
                setShowWatchConfirm(true);
                setTopUpRequiredAmount(price);
                setShowTopUpPrompt(true);
                return;
            }
            const result = await uploadContentService.purchaseVaultContent(
                item.id,
                item.reseller_ref || item.resell_ref || null,
            );
            setWatchConfirmBalance(result.walletBalance);
            window.dispatchEvent(new Event("wallet:changed"));
            if (enableQuickUnlock && typeof window !== "undefined") {
                window.localStorage.setItem(VAULT_QUICK_UNLOCK_KEY, "true");
            }
            setShowWatchConfirm(false);
            setHasUnlockedAccess(true);
            onAccessChanged(item);
            openWatchContent();
        } catch (error) {
            setShowWatchConfirm(true);
            const message = error instanceof Error ? error.message : "Unable to unlock this content right now.";
            if (message.toLowerCase().includes("insufficient")) {
                setTopUpRequiredAmount(Number(item.price || 0));
                setShowTopUpPrompt(true);
            } else {
                setWatchConfirmError(
                    message.toLowerCase().includes("failed to unlock")
                        ? "Unable to unlock this content right now. Please try again."
                        : message
                );
            }
        } finally {
            setWatchPurchaseLoading(false);
        }
    };
    const openWatchConfirmation = async () => {
        setShowWatchConfirm(true);
        setWatchConfirmError("");
        setWatchConfirmLoading(true);
        try {
            const balance = await loadWatchBalance();
            if (balance < Number(item.price || 0)) {
                setTopUpRequiredAmount(Number(item.price || 0));
                setShowTopUpPrompt(true);
            }
        } catch (error) {
            setWatchConfirmError(error instanceof Error ? error.message : "Failed to load wallet balance");
            setWatchConfirmBalance(null);
        } finally {
            setWatchConfirmLoading(false);
        }
    };
    const handleWatchNow = (event?: MouseEvent<HTMLButtonElement>) => {
        event?.preventDefault();
        event?.stopPropagation();
        if (isOwnContent || hasUnlockedAccess) {
            openWatchContent();
            return;
        }
        if (!isFlashContent) {
            const quickUnlock = typeof window !== "undefined" && window.localStorage.getItem(VAULT_QUICK_UNLOCK_KEY) === "true";
            if (!quickUnlock) {
                void openWatchConfirmation();
                return;
            }
            void purchaseVaultAndWatch();
            return;
        }
        openWatchContent();
    };
    const handleConfirmWatch = async () => {
        await purchaseVaultAndWatch();
    };
    const handleOpenSubscriptionPlans = (event: MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();
        setSubscriptionPurchaseError("");
        setSubscriptionPurchaseMessage("");
        setSelectedSubscriptionPlanId(String(subscriptionPackages[0]?.id || ""));
        setShowSubscriptionPlans(true);
    };
    const handlePurchaseSubscription = async () => {
        if (!selectedSubscriptionPlan) return;
        setIsPurchasingSubscription(true);
        setSubscriptionPurchaseError("");
        setSubscriptionPurchaseMessage("");
        try {
            await uploadContentService.purchaseCreatorSubscription(
                item.id,
                String(selectedSubscriptionPlan.id),
                item.reseller_ref || item.resell_ref || null,
            );
            setSubscriptionPurchaseMessage("Subscription active. You can now watch this creator's content.");
            window.dispatchEvent(new Event("wallet:changed"));
            setHasUnlockedAccess(true);
            onAccessChanged(item);
            setTimeout(() => {
                setShowSubscriptionPlans(false);
                if ((isVideo || isPlayableFlash) && watchSource) {
                    setShowFullVideo(true);
                }
            }, 700);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to purchase subscription";
            if (message.toLowerCase().includes("insufficient")) {
                setTopUpRequiredAmount(Number(selectedSubscriptionPlan?.price || item.price || 0));
                setShowTopUpPrompt(true);
            } else {
                setSubscriptionPurchaseError(message);
            }
        } finally {
            setIsPurchasingSubscription(false);
        }
    };
    const watchRailIconSurface = "h-8 w-8 rounded-full border border-white/25 bg-zinc-700/35 shadow-[0_6px_18px_rgba(0,0,0,0.28)] backdrop-blur-md group-hover:bg-zinc-500/45";
    const watchRailCountText = "drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]";
    const watchActionRail = (
        <>
            <InteractionButton
                type="shares"
                icon="share-social-outline"
                activeIcon="share-social"
                count={`${Number(item.affiliate_commission || 0)}%`}
                activeColor="text-white"
                color="text-white"
                onSingleClick={() => onShare(item)}
                onLongPress={() => onOpenSheet("shares", item)}
                appearance="compact"
                orientation="vertical"
                iconSize="text-[17px]"
                countSize="text-[7px]"
                iconWrapperClassName={watchRailIconSurface}
                countClassName={watchRailCountText}
            />
            <InteractionButton
                type="reposts"
                icon="repeat-outline"
                activeIcon="repeat"
                count={repostsCount}
                activeColor="text-white"
                color="text-white"
                onSingleClick={() => onRepost(item)}
                onLongPress={() => onRepost(item)}
                appearance="compact"
                orientation="vertical"
                iconSize="text-[17px]"
                countSize="text-[7px]"
                iconWrapperClassName={watchRailIconSurface}
                countClassName={watchRailCountText}
            />
            <InteractionButton
                type="views"
                icon="eye-outline"
                activeIcon="eye"
                count={viewsCount}
                activeColor="text-white"
                color="text-white"
                onSingleClick={() => {
                    onLogView(item);
                    onOpenSheet("views", item);
                }}
                onLongPress={() => onOpenSheet("views", item)}
                appearance="compact"
                orientation="vertical"
                iconSize="text-[17px]"
                countSize="text-[7px]"
                iconWrapperClassName={watchRailIconSurface}
                countClassName={watchRailCountText}
            />
            <InteractionButton
                type="comments"
                icon="chatbubble-outline"
                activeIcon="chatbubble"
                count={commentsCount}
                activeColor="text-white"
                color="text-white"
                onSingleClick={() => onOpenSheet("comments", item)}
                onLongPress={() => onOpenSheet("comments", item)}
                appearance="compact"
                orientation="vertical"
                iconSize="text-[17px]"
                countSize="text-[7px]"
                iconWrapperClassName={watchRailIconSurface}
                countClassName={watchRailCountText}
            />
            <InteractionButton
                type="likes"
                icon="heart-outline"
                activeIcon="heart"
                count={likesCount}
                activeColor="text-white"
                color="text-white"
                isActive={!!item.user_liked}
                onSingleClick={() => onToggleLike(item)}
                onLongPress={() => onOpenSheet("likes", item)}
                appearance="compact"
                orientation="vertical"
                iconSize="text-[17px]"
                countSize="text-[7px]"
                iconWrapperClassName={watchRailIconSurface}
                countClassName={watchRailCountText}
            />
        </>
    );

    return (
        <>
        <article className="px-4 py-4 transition-colors sm:px-7" onClick={() => isMenuOpen && setIsMenuOpen(false)}>
            <div className={`relative group mx-auto flex w-full min-w-0 flex-col rounded-[1.7rem] border border-white/5 bg-[#1a1a1a] transition-all duration-500 md:rounded-[2.3rem] ${showFullVideo ? "max-w-[860px] overflow-hidden bg-black pb-0" : "max-w-[440px] pb-3"}`}>
                <header className="flex items-center justify-between gap-2 p-3">
                    <div className="flex min-w-0 items-center gap-2">
                        <button
                            type="button"
                            onClick={onOpenProfile}
                            className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-gradient-to-tr from-blue-600 to-purple-600 text-[10px] text-white shadow-lg"
                        >
                            {profileImage ? (
                                <Image
                                    src={profileImage}
                                    alt={creatorName}
                                    fill
                                    sizes={AVATAR_IMAGE_SIZES}
                                    className="object-cover"
                                    loading="lazy"
                                    placeholder="blur"
                                    blurDataURL={FEED_IMAGE_BLUR_DATA_URL}
                                    unoptimized={shouldBypassNextImageOptimization(profileImage)}
                                />
                            ) : (
                                <IonIcon name="person" className="text-white" />
                            )}
                        </button>
                        <div className="min-w-0">
                            <button
                                type="button"
                                onClick={onOpenProfile}
                                className="truncate text-[11px] font-black leading-none text-white transition-colors hover:text-blue-400"
                            >
                                {creatorName}
                            </button>
                            <div className="mt-1 text-[9px] font-bold tracking-[0.18em] text-slate-500">
                                {createdLabel}
                            </div>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setIsMenuOpen((value) => !value);
                        }}
                        className="flex h-8 w-8 flex-col items-center justify-center gap-1 rounded-full bg-white/[0.06] text-white/60 transition hover:bg-white/[0.1] hover:text-white"
                        aria-label="Open content menu"
                    >
                        <span className="h-1 w-1 rounded-full bg-current" />
                        <span className="h-1 w-1 rounded-full bg-current" />
                    </button>
                </header>
                {isMenuOpen && (
                    <div className="absolute right-3 top-12 z-50 w-48 overflow-hidden rounded-2xl border border-white/10 bg-[#15161a] py-1 shadow-2xl">
                        {isOwnContent && (
                            <>
                                <button type="button" onClick={() => { setIsMenuOpen(false); onPin(item); }} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[11px] font-bold text-white hover:bg-white/5">
                                    <IonIcon name={item.pinned_at ? "remove-circle-outline" : "pin-outline"} className="text-base text-emerald-300" />
                                    {item.pinned_at ? "Unpin" : "Pin"}
                                </button>
                                <button type="button" onClick={() => { setIsMenuOpen(false); window.dispatchEvent(new CustomEvent("open-upload-content-edit", { detail: item })); }} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[11px] font-bold text-white hover:bg-white/5">
                                    <IonIcon name="create-outline" className="text-base text-blue-300" />
                                    Edit
                                </button>
                                <button type="button" onClick={() => { setIsMenuOpen(false); window.dispatchEvent(new CustomEvent("delete-upload-content", { detail: item })); }} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[11px] font-bold text-red-300 hover:bg-white/5">
                                    <IonIcon name="trash-outline" className="text-base" />
                                    Delete
                                </button>
                            </>
                        )}
                        <button type="button" onClick={() => { setIsMenuOpen(false); onShare(item); }} className="flex w-full items-center gap-3 border-t border-white/5 px-4 py-2.5 text-left text-[11px] font-bold text-white hover:bg-white/5">
                            <IonIcon name="share-social-outline" className="text-base text-blue-300" />
                            Share
                        </button>
                        {isOwnContent && (
                            <button type="button" onClick={() => { setIsMenuOpen(false); window.location.href = "/dashboard/ad-campaign/upload-content"; }} className="flex w-full items-center gap-3 border-t border-white/5 px-4 py-2.5 text-left text-[11px] font-bold text-white hover:bg-white/5">
                                <IonIcon name="megaphone-outline" className="text-base text-amber-300" />
                                Promote
                            </button>
                        )}
                        {!isOwnContent && (
                            <>
                                <button type="button" onClick={() => { setIsMenuOpen(false); onNotInterested(item); }} className="flex w-full items-center gap-3 border-t border-white/5 px-4 py-2.5 text-left text-[11px] font-bold text-white hover:bg-white/5">
                                    <IonIcon name="eye-off-outline" className="text-base text-white/60" />
                                    Not Interested
                                </button>
                                <button type="button" onClick={() => { setIsMenuOpen(false); onReport(item); }} className="flex w-full items-center gap-3 border-t border-white/5 px-4 py-2.5 text-left text-[11px] font-bold text-white hover:bg-white/5">
                                    <IonIcon name="flag-outline" className="text-base text-red-300" />
                                    Report
                                </button>
                            </>
                        )}
                    </div>
                )}

                {showFullVideo ? (
                    <div className="bg-black pb-0">
                        <UploadContentWatchModal
                            inline
                            open={showFullVideo}
                            source={watchSource}
                            poster={item.thumbnail_url}
                            title={item.description || item.topic || "Full Content"}
                            lockedPrice={isFlashContent ? Number(item.price || 0) : null}
                            autoPlay={!isFlashContent || flashContentAutoPlay}
                            onClose={() => setShowFullVideo(false)}
                            actionRail={watchActionRail}
                        />
                    </div>
                ) : (
                <>
                <div className="px-3">
                    <div className="relative aspect-square overflow-hidden rounded-[1.6rem] border border-white/5 bg-black shadow-inner" style={mediaFrameStyle}>
                        <div className="absolute left-3 top-3 z-10 rounded-full border border-white/10 bg-black/55 px-3 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-white">
                            {item.topic || "Content"}
                        </div>
                        <UploadContentMedia
                            mediaType={item.media_type}
                            mediaPreview={media || blurredPreviewMedia}
                            mediaGallery={item.media_gallery}
                            thumbnailUrl={item.thumbnail_url}
                            previewMode={item.preview_mode}
                            previewUrl={item.preview_url}
                            alt={item.description || item.topic || "Upload content"}
                            blurred={showBlur}
                            autoPlayVideo={isFlashContent && flashContentAutoPlay}
                            onAspectRatioChange={setMediaAspectRatio}
                        />
                        {showBlur && (
                            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.18),rgba(0,0,0,0.54))]" />
                        )}
                        {(showBlur || hasSubscriptionPackages || ((isVideo || isPlayableFlash) && watchSource)) && (
                            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 px-5 text-center">
                                <button
                                    type="button"
                                    onClick={handleWatchNow}
                                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded-full border border-white/15 bg-black/80 px-3 text-white shadow-xl backdrop-blur-md transition hover:bg-black/90"
                                >
                                    <IonIcon name="play" className="text-[10px]" />
                                    <span className="text-[8px] font-black uppercase tracking-[0.12em]">Watch Now</span>
                                    {!hasUnlockedAccess && !isOwnContent && (
                                        <>
                                            <span className="mx-0.5 h-3 w-px bg-white/20" />
                                            <span className="text-[8px] font-bold text-white/65">{Number(item.price || 0).toLocaleString()} Coins</span>
                                        </>
                                    )}
                                </button>
                                {hasSubscriptionPackages && (
                                    <button
                                        type="button"
                                        onClick={handleOpenSubscriptionPlans}
                                        className="inline-flex min-h-7 items-center justify-center rounded-full border border-emerald-300/30 bg-black/65 px-3 text-[7px] font-black uppercase tracking-[0.1em] text-emerald-200 backdrop-blur-md transition hover:bg-black/80"
                                    >
                                        Watch all content
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="px-4 pb-1.5 pt-3">
                    <div className="flex items-center justify-between border-t border-white/8 pt-3 text-white/78">
                        <InteractionButton
                            type="likes"
                            icon="heart-outline"
                            activeIcon="heart"
                            count={likesCount}
                            activeColor="text-white"
                            color="text-white"
                            isActive={!!item.user_liked}
                            onSingleClick={() => onToggleLike(item)}
                            onLongPress={() => onOpenSheet("likes", item)}
                            appearance="compact"
                        />
                        <InteractionButton
                            type="reposts"
                            icon="repeat-outline"
                            activeIcon="repeat"
                            count={repostsCount}
                            activeColor="text-white"
                            color="text-white"
                            onSingleClick={() => onRepost(item)}
                            onLongPress={() => onRepost(item)}
                            appearance="compact"
                        />
                        <InteractionButton
                            type="views"
                            icon="eye-outline"
                            activeIcon="eye"
                            count={viewsCount}
                            activeColor="text-white"
                            color="text-white"
                            onSingleClick={() => {
                                onLogView(item);
                                onOpenSheet("views", item);
                            }}
                            onLongPress={() => onOpenSheet("views", item)}
                            appearance="compact"
                        />
                        <InteractionButton
                            type="comments"
                            icon="chatbubble-outline"
                            activeIcon="chatbubble"
                            count={commentsCount}
                            activeColor="text-white"
                            color="text-white"
                            onSingleClick={() => onOpenSheet("comments", item)}
                            onLongPress={() => onOpenSheet("comments", item)}
                            appearance="compact"
                        />
                        <InteractionButton
                            type="shares"
                            icon="share-social-outline"
                            activeIcon="share-social"
                            count={`${Number(item.affiliate_commission || 0)}%`}
                            activeColor="text-white"
                            color="text-white"
                            onSingleClick={() => onShare(item)}
                            onLongPress={() => onOpenSheet("shares", item)}
                            appearance="compact"
                        />
                    </div>
                </div>
                </>
                )}
            </div>
        </article>
        {showWatchConfirm && (
            <div
                className="fixed inset-0 z-[230] flex items-center justify-center bg-black/80 px-3 py-4 backdrop-blur-md"
                onClick={() => setShowWatchConfirm(false)}
            >
                <div
                    className="w-full max-w-[320px] overflow-hidden rounded-[1.1rem] border border-white/10 bg-[#111216] shadow-[0_30px_100px_rgba(0,0,0,0.7)]"
                    onClick={(event) => event.stopPropagation()}
                >
                    <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
                        <div>
                            <h3 className="text-[14px] font-black text-white">Watch Content</h3>
                            <p className="mt-1 text-[10px] font-semibold text-white/45">Unlock this vault item before watching.</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowWatchConfirm(false)}
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-white/65 transition hover:bg-white/[0.1] hover:text-white"
                            aria-label="Close watch confirmation"
                        >
                            <IonIcon name="close-outline" className="text-lg" />
                        </button>
                    </div>
                    <div className="space-y-3 px-4 py-4">
                        <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3">
                            <p className="text-[11px] font-black text-white">Cost: {Number(item.price || 0).toLocaleString()} Coins</p>
                            <p className="mt-1.5 text-[10px] font-semibold text-white/55">
                                Your Balance: {watchConfirmLoading ? "Loading..." : `${Number(watchConfirmBalance || 0).toLocaleString()} Coins`}
                            </p>
                        </div>
                        <label className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
                            <input
                                type="checkbox"
                                checked={enableQuickUnlock}
                                onChange={(event) => setEnableQuickUnlock(event.target.checked)}
                                className="mt-0.5 h-4 w-4 accent-emerald-300"
                            />
                            <span>
                                <span className="block text-[9px] font-black uppercase tracking-[0.12em] text-white/70">Skip confirmation next time</span>
                                <span className="mt-1 block text-[10px] font-semibold text-white/45">Enable quick unlock</span>
                            </span>
                        </label>
                        {watchConfirmError && (
                            <p className="rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-[10px] font-bold text-red-200">
                                {watchConfirmError}
                            </p>
                        )}
                    </div>
                    <div className="flex items-center justify-end gap-2 border-t border-white/10 px-4 py-3">
                        <button
                            type="button"
                            onClick={() => setShowWatchConfirm(false)}
                            className="inline-flex h-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-4 text-[9px] font-black uppercase tracking-[0.12em] text-white/70 transition hover:bg-white/[0.08]"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleConfirmWatch}
                            disabled={watchConfirmLoading || watchPurchaseLoading}
                            className="inline-flex h-9 items-center justify-center rounded-full bg-white px-4 text-[9px] font-black uppercase tracking-[0.12em] text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-55"
                        >
                            {watchPurchaseLoading ? "Unlocking..." : "Confirm & Watch"}
                        </button>
                    </div>
                </div>
            </div>
        )}
        {showTopUpPrompt && (
            <div
                className="fixed inset-0 z-[240] flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm"
                onClick={() => setShowTopUpPrompt(false)}
            >
                <div
                    className="w-full max-w-[290px] rounded-2xl border border-red-300/25 bg-[#15161a] p-4 text-center shadow-[0_24px_80px_rgba(0,0,0,0.6)]"
                    onClick={(event) => event.stopPropagation()}
                >
                    <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-red-300/12 text-red-200">
                        <IonIcon name="wallet-outline" className="text-xl" />
                    </div>
                    <h3 className="mt-3 text-[13px] font-black text-white">Insufficient Balance</h3>
                    <p className="mt-1 text-[10px] font-semibold leading-5 text-white/55">
                        You need {Number(topUpRequiredAmount || item.price || 0).toLocaleString()} Coins to continue.
                    </p>
                    <div className="mt-4 flex items-center justify-center gap-2">
                        <button
                            type="button"
                            onClick={() => setShowTopUpPrompt(false)}
                            className="inline-flex h-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-4 text-[9px] font-black uppercase tracking-[0.12em] text-white/65"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={() => router.push("/wallet/topup")}
                            className="inline-flex h-8 items-center justify-center rounded-full bg-emerald-300 px-4 text-[9px] font-black uppercase tracking-[0.12em] text-black"
                        >
                            Top Up
                        </button>
                    </div>
                </div>
            </div>
        )}
        {showSubscriptionPlans && (
            <div
                className="fixed inset-0 z-[230] flex items-center justify-center bg-black/80 px-3 py-4 backdrop-blur-md"
                onClick={() => setShowSubscriptionPlans(false)}
            >
                <div
                    className="w-full max-w-[360px] overflow-hidden rounded-[1.25rem] border border-white/10 bg-[#111216] shadow-[0_30px_100px_rgba(0,0,0,0.7)]"
                    onClick={(event) => event.stopPropagation()}
                >
                    <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
                        <div>
                            <h3 className="text-[14px] font-black text-white">Subscribe for full access</h3>
                            <p className="mt-1 text-[10px] font-semibold text-white/45">Watch all content from this creator</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowSubscriptionPlans(false)}
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-white/65 transition hover:bg-white/[0.1] hover:text-white"
                            aria-label="Close subscription plans"
                        >
                            <IonIcon name="close-outline" className="text-lg" />
                        </button>
                    </div>
                    <div className="max-h-[56vh] space-y-2.5 overflow-y-auto px-4 py-4">
                        {subscriptionPackages.map((plan, index) => (
                            <button
                                key={plan.id || `subscription-plan-${index}`}
                                type="button"
                                onClick={() => {
                                    setSelectedSubscriptionPlanId(String(plan.id));
                                    setSubscriptionPurchaseError("");
                                    setSubscriptionPurchaseMessage("");
                                }}
                                className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left transition ${
                                    String(selectedSubscriptionPlan?.id || "") === String(plan.id)
                                        ? "border-emerald-300/55 bg-emerald-300/10"
                                        : "border-white/10 bg-white/[0.04] hover:bg-white/[0.07]"
                                }`}
                            >
                                <div>
                                    <p className="text-[8px] font-black uppercase tracking-[0.12em] text-white/40">Plan {index + 1}</p>
                                    <p className="mt-1 text-[11px] font-bold text-white">
                                        {Number(plan.days || 0)} Day{Number(plan.days || 0) === 1 ? "" : "s"} Full Access
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[8px] font-black uppercase tracking-[0.1em] text-white/35">Price</p>
                                    <p className="mt-1 text-[12px] font-black text-emerald-300">{Number(plan.price || 0).toLocaleString()} Coins</p>
                                </div>
                            </button>
                        ))}
                    </div>
                    <div className="border-t border-white/10 px-4 py-3">
                        {subscriptionPurchaseError && (
                            <p className="mb-3 rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-[10px] font-bold text-red-200">
                                {subscriptionPurchaseError}
                            </p>
                        )}
                        {subscriptionPurchaseMessage && (
                            <p className="mb-3 rounded-xl border border-emerald-300/25 bg-emerald-300/10 px-3 py-2 text-[10px] font-bold text-emerald-200">
                                {subscriptionPurchaseMessage}
                            </p>
                        )}
                        <button
                            type="button"
                            onClick={handlePurchaseSubscription}
                            disabled={!selectedSubscriptionPlan || isPurchasingSubscription}
                            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-emerald-300 px-4 text-[9px] font-black uppercase tracking-[0.13em] text-black transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-55"
                        >
                            {isPurchasingSubscription ? (
                                <>
                                    <IonIcon name="sync-outline" className="text-sm" />
                                    Processing
                                </>
                            ) : (
                                <>
                                    <IonIcon name="wallet-outline" className="text-sm" />
                                    Confirm Subscribe
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
}

function dedupeAdsByIdentity(ads: any[]) {
    const seen = new Set<string>();
    return ads.filter((ad) => {
        const identity = getAdInteractionId(ad);
        if (!identity || seen.has(identity)) return false;
        seen.add(identity);
        return true;
    });
}

const isHomeSponsoredAd = (item: any) => {
    const campaignType = String(item?.campaign_type || item?.campaignType || "").trim();
    const status = String(item?.status || "").toLowerCase();
    return (
        !!item?.is_sponsored ||
        String(item?.id || "").startsWith("ad-") ||
        !!item?.adId ||
        !!item?.ad_id ||
        ["Product Promote", "Profile Promote", "Photo and Video", "Photo & Video"].includes(campaignType) ||
        (status === "active" && !!campaignType)
    );
};

const isRawPhotoVideoUploadAd = (ad: any) => {
    const campaignType = String(ad?.campaignType || ad?.campaign_type || "").trim().toLowerCase();
    if (campaignType !== "photo and video" && campaignType !== "photo & video") return false;
    const draft = ad?.editDraft || ad?.edit_draft || {};
    const activeLink = String(ad?.active_link || ad?.activeLink || draft.activeLink || draft.active_link || "").trim();
    if (activeLink) return false;
    const gallery = Array.isArray(ad?.mediaGallery) ? ad.mediaGallery : Array.isArray(ad?.media_gallery) ? ad.media_gallery : [];
    const media = String(ad?.mediaPreview || ad?.media_preview || gallery[0] || "").trim();
    if (!media) return false;
    return !/^https?:\/\//i.test(media) || /\/uploads?\//i.test(media);
};

const mapPublicActiveAdToHomeAd = (ad: any) => {
    const draft = ad?.editDraft || ad?.edit_draft || {};
    const adId = ad?.adId || ad?.ad_id || String(ad?.id || "").replace(/^ad-/, "");
    const campaignType = ad?.campaign_type || ad?.campaignType || "Ads";
    const isProductPromote = String(campaignType).trim().toLowerCase() === "product promote";
    const mediaPreview = ad?.media_preview || ad?.mediaPreview || "";
    const price = isProductPromote
        ? Number(ad?.price ?? ad?.main_price ?? ad?.product_price ?? 0)
        : Number(ad?.budget || 0);
    const productCode = isProductPromote
        ? (ad?.linked_product_share_code || ad?.linked_product_code || ad?.product_code || "")
        : adId;
    const shareCode = isProductPromote
        ? (ad?.linked_product_share_code || ad?.share_code || ad?.shareCode || "")
        : `ad-${adId}`;
    return {
        ...ad,
        id: String(ad?.id || "").startsWith("ad-") ? ad.id : `ad-${adId || ad?.id}`,
        adId,
        user_id: ad?.user_id ?? ad?.userId,
        owner_user_id: ad?.owner_user_id ?? ad?.ownerUserId,
        username: ad?.owner_username || ad?.ownerUsername || ad?.user?.username || "Ads",
        owner_username: ad?.owner_username || ad?.ownerUsername || ad?.user?.username || "Ads",
        user: ad?.user,
        title: ad?.title || ad?.description || campaignType,
        description: ad?.description || "",
        category: campaignType,
        price,
        image_url: mediaPreview,
        media_preview: mediaPreview,
        media_gallery: ad?.media_gallery || ad?.mediaGallery || [],
        media_type: ad?.media_type || ad?.mediaType || "",
        status: "approved",
        likes_count: Number(ad?.likes_count || 0),
        comments_count: Number(ad?.comments_count || 0),
        shares_count: Number(ad?.shares_count || 0),
        views_count: Number(ad?.views_count ?? ad?.viewCount ?? 0),
        created_at: ad?.created_at || ad?.createdAt,
        profile_picture: ad?.profile_picture || ad?.user?.profile_picture || null,
        product_code: productCode,
        share_code: shareCode,
        campaign_type: campaignType,
        active_link: draft.activeLink || ad?.active_link || "",
        cta_topic: draft.ctaTopic || ad?.cta_topic || "Visit",
        cta_value: draft.ctaValue || ad?.cta_value || "",
        linked_product_id: ad?.linked_product_id ?? null,
        linked_product_share_code: ad?.linked_product_share_code || ad?.linked_product_code || null,
        linked_product_code: ad?.linked_product_share_code || ad?.linked_product_code || null,
        is_sponsored: true,
        user_liked: !!ad?.user_liked,
        ad_coin_collected: !!ad?.ad_coin_collected,
        ad_like_locked: !!ad?.ad_like_locked,
    };
};

// GoogLinkPreview and renderGoogText moved to GoogCard.tsx

// InteractionButton moved to GoogCard.tsx or shared component

export default function DashboardPage() {
    const HOME_FEED_INITIAL_BATCH = 12;
    const HOME_FEED_BATCH_SIZE = 8;
    const searchParams = useSearchParams();
    const router = useRouter();
    const { addToCart } = useCart();
    const composeMode = searchParams?.get("compose");
    const composeSectionRef = useRef<HTMLDivElement | null>(null);
    const [mounted, setMounted] = useState(false);
    const [homeAdOrder] = useState<Record<string, string[]>>({});
    const [postText, setPostText] = useState("");
    const [posts, setPosts] = useState<WritePost[]>([]);
    const [uploadContents, setUploadContents] = useState<UploadContentRecord[]>([]);
    const [flashContentAutoPlay, setFlashContentAutoPlay] = useState(false);
    const [googSearchDraft, setGoogSearchDraft] = useState("");
    const [googSearchQuery, setGoogSearchQuery] = useState("");
    const [selectedGoogCategory, setSelectedGoogCategory] = useState("All");
    const [ads, setAds] = useState<any[]>([]);
    const [homeAdShuffleSeed] = useState(() => getPersistentClientSeed("googer-home-ad-pool-seed-v1"));
    const [homeGoogShuffleSeed] = useState(() => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
    const syncAds = useAdStore((state) => state.syncAds);
    const updateAdState = useAdStore((state) => state.updateAdState);
    const adStates = useAdStore((state) => state.adStates);
    const setViewerContext = useAdStore((state) => state.setViewerContext);
    const [isLoadingFeed, setIsLoadingFeed] = useState(true);
    const [, setTick] = useState(0);
    const [openMenuAdId, setOpenMenuAdId] = useState<string | number | null>(null);
    const [openPostMenu, setOpenPostMenu] = useState<FixedPostMenu | null>(null);
    const [postToDelete, setPostToDelete] = useState<WritePost | null>(null);
    const [pendingAdCoinAd, setPendingAdCoinAd] = useState<any | null>(null);
    const [homeCoinReadyAdIds, setHomeCoinReadyAdIds] = useState<Set<string>>(() => new Set());
    const [requiredAdWatchSeconds, setRequiredAdWatchSeconds] = useState(5);
    const [showGoogShareModal, setShowGoogShareModal] = useState(false);
    const [shareGoogPost, setShareGoogPost] = useState<WritePost | null>(null);
    const [showAdShareModal, setShowAdShareModal] = useState(false);
    const [shareAdItem, setShareAdItem] = useState<any | null>(null);
    const [showUploadShareModal, setShowUploadShareModal] = useState(false);
    const [shareUploadItem, setShareUploadItem] = useState<UploadContentRecord | null>(null);
    const [uploadShareInitialView, setUploadShareInitialView] = useState<"share" | "resell">("share");
    const [adPreviewModal, setAdPreviewModal] = useState<{ ad: any; kind: "image" | "video" | "embed" } | null>(null);
    const [productAdModal, setProductAdModal] = useState<any | null>(null);
    const [productAdSizeError, setProductAdSizeError] = useState(false);
    const [notification, setNotification] = useState<{ type: "error" | "success"; message: string; title?: string } | null>(null);
    useEffect(() => {
        if (!notification) return;
        addTopbarNotification({
            type: notification.type,
            title: notification.title || (notification.type === "success" ? "Success" : "Error"),
            message: notification.message,
        });
        setNotification(null);
    }, [notification]);
    const [isAdSheetOpen, setIsAdSheetOpen] = useState(false);
    const [adSheetType, setAdSheetType] = useState<SheetType>("comments");
    const [interactionAd, setInteractionAd] = useState<any | null>(null);
    const [adSheetData, setAdSheetData] = useState<any[]>([]);
    const [isAdSheetLoading, setIsAdSheetLoading] = useState(false);
    const [isUploadSheetOpen, setIsUploadSheetOpen] = useState(false);
    const [uploadSheetType, setUploadSheetType] = useState<SheetType>("comments");
    const [interactionUpload, setInteractionUpload] = useState<UploadContentRecord | null>(null);
    const [uploadSheetData, setUploadSheetData] = useState<any[]>([]);
    const [isUploadSheetLoading, setIsUploadSheetLoading] = useState(false);
    const [isPostSheetOpen, setIsPostSheetOpen] = useState(false);
    const [postSheetType, setPostSheetType] = useState<SheetType>("comments");
    const [interactionPost, setInteractionPost] = useState<WritePost | null>(null);
    const [postSheetData, setPostSheetData] = useState<any[]>([]);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());
    const [hiddenHomeAdIds, setHiddenHomeAdIds] = useState<Set<string>>(new Set());
    const [hiddenHomeGoogIds, setHiddenHomeGoogIds] = useState<Set<string>>(new Set());
    const [hiddenHomeUploadIds, setHiddenHomeUploadIds] = useState<Set<string>>(new Set());
    const [reportTargetPost, setReportTargetPost] = useState<WritePost | null>(null);
    const [reportReason, setReportReason] = useState("");
    const [reportCustomReason, setReportCustomReason] = useState("");
    const [reportSubmitting, setReportSubmitting] = useState(false);
    const [reportSubmitted, setReportSubmitted] = useState(false);
    const [reportError, setReportError] = useState("");
    const [reportTargetUpload, setReportTargetUpload] = useState<UploadContentRecord | null>(null);
    const [uploadReportReason, setUploadReportReason] = useState("");
    const [uploadReportCustomReason, setUploadReportCustomReason] = useState("");
    const [uploadReportSubmitting, setUploadReportSubmitting] = useState(false);
    const [uploadReportSubmitted, setUploadReportSubmitted] = useState(false);
    const [uploadReportError, setUploadReportError] = useState("");
    const [showAdExpiryPopup, setShowAdExpiryPopup] = useState(false);
    const [visibleHomeFeedCount, setVisibleHomeFeedCount] = useState(HOME_FEED_INITIAL_BATCH);
    const homeFeedLoadMoreRef = useRef<HTMLDivElement | null>(null);
    const prevActivePhotoVideoIds = useRef<Set<string>>(new Set());
    const postsSignatureRef = useRef<string>("");
    const [homeAdRotation, setHomeAdRotation] = useState(() => {
        if (typeof window === "undefined") return 0;
        try {
            return Number.parseInt(window.localStorage.getItem("googer-home-ad-rotation-v1") || "0", 10) || 0;
        } catch {
            return 0;
        }
    });

    const syncAdOwnerProfile = (ad: any, user: any) => {
        if (!ad || !user?.id) return ad;
        const ownerId = ad.user_id || ad.owner_user_id || ad.owner_id;
        if (String(ownerId) !== String(user.id)) return ad;

        return {
            ...ad,
            user: { ...(ad.user || {}), id: ownerId, username: user.username || ad.user?.username, profile_picture: user.profile_picture ?? ad.user?.profile_picture },
        };
    };

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!currentUser?.id) {
            setBlockedUserIds(new Set());
            return;
        }
        let cancelled = false;
        const loadBlockedUsers = async () => {
            try {
                const blockedUsers = await chatService.getBlockedUsers();
                if (cancelled) return;
                setBlockedUserIds(new Set((blockedUsers || []).map((entry: any) => String(entry.id))));
            } catch {
                if (!cancelled) setBlockedUserIds(new Set());
            }
        };
        void loadBlockedUsers();
        const handleBlockedUsersUpdated = () => { void loadBlockedUsers(); };
        window.addEventListener("googer-blocked-users-updated", handleBlockedUsersUpdated);
        return () => {
            cancelled = true;
            window.removeEventListener("googer-blocked-users-updated", handleBlockedUsersUpdated);
        };
    }, [currentUser?.id]);

    useEffect(() => {
        if (!currentUser?.id) {
            setHiddenHomeAdIds(new Set());
            setHiddenHomeGoogIds(new Set());
            setHiddenHomeUploadIds(new Set());
            return;
        }
        const syncHiddenFeedItems = () => {
            setHiddenHomeAdIds(getHiddenFeedItemIds(currentUser.id, "ad"));
            setHiddenHomeGoogIds(getHiddenFeedItemIds(currentUser.id, "goog"));
            setHiddenHomeUploadIds(getHiddenFeedItemIds(currentUser.id, "uploadContent"));
        };
        syncHiddenFeedItems();
        return subscribeToHiddenFeedItems(syncHiddenFeedItems);
    }, [currentUser?.id]);

    const syncWritePostProfile = (post: WritePost, user: any): WritePost => {
        if (!post || !user?.id) return post;
        if (String(post.user.id) !== String(user.id)) return post;

        return {
            ...post,
            user: {
                ...post.user,
                username: user.username || post.user.username,
                name: getUserDisplayName({ ...post.user, ...user }, post.user.name || "User"),
                img: user.profile_picture || post.user.img,
            },
        };
    };
    const normalizeWritePost = useCallback((post: WritePost): WritePost => ({
        ...post,
        user: {
            ...post.user,
            name: getUserDisplayName(post.user, post.user?.name || "User"),
        },
    }), []);
    const getBlockedOwnerId = useCallback((item: any) => String(
        item?.user_id ||
        item?.owner_user_id ||
        item?.owner_id ||
        item?.seller_id ||
        item?.user?.id ||
        item?.raw?.user_id ||
        item?.raw?.owner_user_id ||
        item?.raw?.owner_id ||
        "",
    ), []);
    const isBlockedOwnerItem = useCallback((item: any) => {
        const ownerId = getBlockedOwnerId(item);
        return !!ownerId && blockedUserIds.has(ownerId);
    }, [blockedUserIds, getBlockedOwnerId]);
    const getHomeLiveAd = useCallback((ad: any) => {
        if (!ad) return ad;
        const liveState = adStates[getAdInteractionId(ad)] || {};
    const raw = {
        ...(ad.raw || ad),
        user_liked: liveState.user_liked ?? ad.user_liked ?? ad.liked,
        likes_count: liveState.likes_count ?? ad.likes_count ?? ad.likeCount,
        ad_coin_collected: liveState.ad_coin_collected ?? ad.ad_coin_collected ?? ad.coinCollected,
        ad_like_locked: liveState.ad_like_locked ?? ad.ad_like_locked,
        views_count: liveState.views_count ?? ad.views_count ?? ad.viewCount,
        impressions: liveState.impressions ?? ad.impressions ?? ad.impressions_count ?? 0,
        comments_count: liveState.comments_count ?? ad.comments_count ?? ad.commentCount,
        shares_count: liveState.shares_count ?? ad.shares_count ?? ad.shareCount,
    };
        const normalized = normalizeAdData(raw);

        return {
            ...raw,
            ...normalized,
            raw,
            user_liked: normalized.liked,
            likes_count: normalized.likeCount,
            ad_coin_collected: normalized.coinCollected,
            ad_like_locked: raw.ad_like_locked,
        };
    }, [adStates]);
    const resolveHomeLiveAd = useCallback((itemOrId: any) => {
        if (itemOrId && typeof itemOrId === "object") return getHomeLiveAd(itemOrId);
        const interactionId = getAdInteractionId(itemOrId);
        const sourceAd = ads.find((ad) => getAdInteractionId(ad) === interactionId);
        return sourceAd ? getHomeLiveAd(sourceAd) : null;
    }, [ads, getHomeLiveAd]);
    const handlePromoteAgain = useCallback((ad: any) => {
        const campaignType = String(ad?.campaign_type || ad?.campaignType || ad?.raw?.campaign_type || "").trim().toLowerCase();
        if (campaignType === "product promote") {
            void promoteProductAdAgain({ ad, router });
            return;
        }
        void promotePhotoVideoAdAgain({ ad, router });
    }, [router]);
    const liveHomeAds = useMemo(
        () => dedupeAdsByIdentity(
            ads
                .filter((ad) => !hiddenHomeAdIds.has(getAdInteractionId(ad)))
                .filter((ad) => !isBlockedOwnerItem(ad))
                .map((ad) => getHomeLiveAd(ad)),
        ),
        [ads, getHomeLiveAd, hiddenHomeAdIds, isBlockedOwnerItem],
    );
    const googCategoryOptions = useMemo(
        () => extractGoogCategories(posts),
        [posts],
    );
    const homeFeedItems = useMemo(() => {
        const sourceAds = liveHomeAds.length > 0 ? liveHomeAds : dedupeAdsByIdentity(ads);
        const normalizedSearch = googSearchQuery.trim().toLowerCase();
        const profilePromoteAds = normalizedSearch ? [] : sourceAds.filter(isHomeProfilePromoteAd);
        const nonProfilePromoteAds = normalizedSearch ? [] : sourceAds.filter((ad) => !isHomeProfilePromoteAd(ad));
        const rotation = nonProfilePromoteAds.length > 0
            ? homeAdRotation % nonProfilePromoteAds.length
            : 0;
        const rotatedAds = nonProfilePromoteAds.length > 1
            ? [
                ...nonProfilePromoteAds.slice(rotation % nonProfilePromoteAds.length),
                ...nonProfilePromoteAds.slice(0, rotation % nonProfilePromoteAds.length),
            ]
            : nonProfilePromoteAds;
        const searchablePosts = normalizedSearch
            ? posts.filter((post) => {
                if (hiddenHomeGoogIds.has(String(post.id))) return false;
                if (isBlockedOwnerItem(post)) return false;
                const text = String(post.text || "").toLowerCase();
                const name = String(post.user?.name || "").toLowerCase();
                const username = String((post.user as any)?.username || "").toLowerCase();
                const matchesSearch = text.includes(normalizedSearch) || name.includes(normalizedSearch) || username.includes(normalizedSearch);
                const matchesCategory = selectedGoogCategory === "All"
                    || text.includes(`#${selectedGoogCategory.toLowerCase()}`);
                return matchesSearch && matchesCategory;
            })
            : posts.filter((post) => {
                if (hiddenHomeGoogIds.has(String(post.id)) || isBlockedOwnerItem(post)) return false;
                if (selectedGoogCategory === "All") return true;
                return String(post.text || "").toLowerCase().includes(`#${selectedGoogCategory.toLowerCase()}`);
            });
        const validPosts = shuffleItemsWithSeed(
            searchablePosts.filter((p) => p.id && !isNaN(Number(p.id))),
            homeGoogShuffleSeed,
            (post) => String(post.id),
        );
        const visibleUploadContents = uploadContents.filter((item) => !hiddenHomeUploadIds.has(String(item.id)) && !isBlockedOwnerItem(item));
        const mixedItems = interleaveWritePostsWithAds(validPosts, rotatedAds, "googer-home-ad-rotation-v1", { current: homeAdOrder }, 4, true);
        const withUploads = normalizedSearch ? mixedItems : insertHomeUploadContentRows(mixedItems, visibleUploadContents);
        return insertHomeProfilePromoteRows(withUploads, profilePromoteAds);
    }, [ads, googSearchQuery, hiddenHomeGoogIds, hiddenHomeUploadIds, homeAdOrder, homeAdRotation, homeGoogShuffleSeed, isBlockedOwnerItem, liveHomeAds, posts, selectedGoogCategory, uploadContents]);
    const visibleHomeFeedItems = useMemo(
        () => homeFeedItems.slice(0, visibleHomeFeedCount),
        [homeFeedItems, visibleHomeFeedCount],
    );
    const trendingPosts = useMemo<TrendingPost[]>(() => {
        const adTrends = liveHomeAds.slice(0, 5).map((ad) => {
            const activeLink = normalizeExternalUrl(ad.active_link || "");
            const previewType = getSponsoredLinkPreviewType(activeLink);
            return {
                id: `ad-${ad.id}`,
                title: String(ad.title || "Sponsored highlight").slice(0, 64),
                description: String(ad.description || ad.category || "Popular sponsored post").slice(0, 110),
                image: getAdPreviewImage(ad, previewType),
                views: Number(ad.views_count ?? ad.viewCount ?? 0),
                likes: Number(ad.likes_count || 0),
                source: "ad" as const,
                payload: ad,
            };
        });

        const writeTrends = posts.slice(0, Math.max(0, 6 - adTrends.length)).map((post) => ({
            id: `write-${post.id}`,
            title: post.text.length > 48 ? `${post.text.slice(0, 48)}...` : post.text,
            description: `By ${getUserDisplayName(post.user, "User")}`,
            image: getTrendingWritePostImage(post),
            views: post.views || 0,
            likes: post.likes,
            source: "write" as const,
            payload: post,
        }));

        return [...adTrends, ...writeTrends].slice(0, 6);
    }, [liveHomeAds, posts]);

    useEffect(() => {
        if (!composeMode || !composeSectionRef.current) return;
        composeSectionRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }, [composeMode]);

    useEffect(() => {
        setVisibleHomeFeedCount((current) => {
            if (googSearchQuery.trim()) return homeFeedItems.length;
            return Math.min(
                homeFeedItems.length,
                current > HOME_FEED_INITIAL_BATCH ? current : HOME_FEED_INITIAL_BATCH,
            );
        });
    }, [googSearchQuery, homeFeedItems.length]);

    useEffect(() => {
        const sentinel = homeFeedLoadMoreRef.current;
        if (!sentinel || visibleHomeFeedCount >= homeFeedItems.length || googSearchQuery.trim()) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry.isIntersecting) return;
                setVisibleHomeFeedCount((current) => Math.min(homeFeedItems.length, current + HOME_FEED_BATCH_SIZE));
            },
            { rootMargin: "900px 0px" },
        );

        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [googSearchQuery, homeFeedItems.length, visibleHomeFeedCount]);

    useEffect(() => {
        let mounted = true;
        if (typeof window !== "undefined") {
            try {
                const nextRotation = homeAdRotation + 1;
                window.localStorage.setItem("googer-home-ad-rotation-v1", String(nextRotation));
                setHomeAdRotation(nextRotation);
            } catch {}
        }
        const getPublicActiveAds = async () => {
        const getApiUrl = () => {
            const isClient = typeof window !== 'undefined';
            if (!isClient) return '/api';
            const hostname = window.location.hostname;
            if (hostname === 'localhost' || hostname === '127.0.0.1') {
                return 'http://localhost:5000';
            }
            return '/api';
        };
            const API_URL = getApiUrl();
            const token = typeof window !== "undefined" ? (window.sessionStorage.getItem("token") || window.localStorage.getItem("token")) : null;
            const activeAds: any[] = [];
            let offset = 0;
            const limit = 50;
            let hasMore = true;

            while (hasMore && mounted) {
                const response = await fetch(`${API_URL}/ads/active-public?limit=${limit}&offset=${offset}&shuffle=${encodeURIComponent(homeAdShuffleSeed)}`, {
                    cache: "no-store",
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                });
                const contentType = response.headers.get("content-type") || "";
                if (!contentType.includes("application/json")) {
                    const text = await response.text();
                    console.error("Non-JSON response from ads endpoint:", {
                        status: response.status,
                        contentType,
                        url: `${API_URL}/ads/active-public`,
                        preview: text.substring(0, 200)
                    });
                    throw new Error(`API returned ${contentType} instead of JSON. Is the backend running at ${API_URL}?`);
                }
                const data = await response.json().catch(() => null);
                if (!data) throw new Error("Failed to parse ads response");
                if (!response.ok) throw new Error(data?.message || "Failed to fetch active ads");

                const rawPageAds = Array.isArray(data?.ads) ? data.ads : [];
                const pageAds = filterAdsForViewer(rawPageAds, currentUser);
                activeAds.push(...pageAds);
                hasMore = !!data?.pagination?.hasMore && rawPageAds.length > 0;
                offset = Number(data?.pagination?.nextOffset ?? offset + rawPageAds.length);
            }

            return activeAds.map(mapPublicActiveAdToHomeAd).filter(isHomeSponsoredAd);
        };
        const loadAds = async () => {
            let publicItems: any[] = [];
            try {
                publicItems = await getPublicActiveAds();
                if (!mounted) return;
                setAds(publicItems);
                syncAds(publicItems);
                setIsLoadingFeed(false);
            } catch (error) {
                console.error("Failed to load ads:", error);
                if (mounted) {
                    setAds(publicItems);
                    setIsLoadingFeed(false);
                }
            }
        };

        const refreshAds = () => {
            void loadAds();
        };

        loadAds();
        window.addEventListener("googer-ad-history-updated", refreshAds);
        window.addEventListener("focus", refreshAds);

        return () => {
            mounted = false;
            window.removeEventListener("googer-ad-history-updated", refreshAds);
            window.removeEventListener("focus", refreshAds);
        };
    }, [currentUser, homeAdShuffleSeed, syncAds]);

    useEffect(() => {
        let mounted = true;
        const loadUploadContents = async () => {
            try {
                const result = await uploadContentService.getPublicApproved();
                if (!mounted) return;
                setUploadContents(result.contents || []);
            } catch (error) {
                console.error("Failed to load upload contents:", error);
                if (mounted) setUploadContents([]);
            }
        };

        void loadUploadContents();
        window.addEventListener("focus", loadUploadContents);

        return () => {
            mounted = false;
            window.removeEventListener("focus", loadUploadContents);
        };
    }, []);

    useEffect(() => {
        let mounted = true;
        const loadUploadControlSettings = async () => {
            try {
                const settings = await adsService.getUploadControlSettingsPublic();
                if (mounted) setFlashContentAutoPlay(Boolean(settings?.flash_auto_play));
            } catch {
                if (mounted) setFlashContentAutoPlay(false);
            }
        };

        void loadUploadControlSettings();
        window.addEventListener("focus", loadUploadControlSettings);

        return () => {
            mounted = false;
            window.removeEventListener("focus", loadUploadControlSettings);
        };
    }, []);

    // Force periodic re-render so time labels (New → 2h → 3h ...) update in real-time
    useEffect(() => {
        const interval = setInterval(() => setTick((t) => t + 1), 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    // Real-time ad expiry watcher: polls the current user's own ads every 10s.
    // When a Photo & Video ad transitions Active → Expired, shows popup and
    // removes it from the visible feed without needing a page refresh.
    useEffect(() => {
        if (!currentUser?.id) return;
        let mounted = true;

        const checkExpiry = async () => {
            try {
                const myAds: any[] = await adsService.getMyAds();
                if (!mounted) return;

                const prevActive = prevActivePhotoVideoIds.current;
                let justExpired = false;

                myAds.forEach((ad) => {
                    const adId = String(ad.adId || ad.ad_id || "");
                    if (!isRawPhotoVideoUploadAd(ad) || !adId) return;

                    if ((ad.status === "Expired" || ad.status === "Completed") && prevActive.has(adId)) {
                        // Only fire popup once per ad — check localStorage
                        const shownKey = `googer_expiry_shown_${adId}`;
                        if (!localStorage.getItem(shownKey)) {
                            localStorage.setItem(shownKey, "1");
                            justExpired = true;
                        }
                        // Always remove from feed
                        setAds((prev) => prev.filter((feedAd) => {
                            const feedId = String(feedAd.adId || feedAd.ad_id || feedAd.id || "").replace(/^ad-/, "");
                            return feedId !== adId.replace(/^ad-/, "");
                        }));
                    }
                });

                if (justExpired) setShowAdExpiryPopup(true);

                // Update tracked set
                prevActivePhotoVideoIds.current = new Set(
                    myAds
                        .filter((ad) => {
                            return isRawPhotoVideoUploadAd(ad) && ad.status === "Active";
                        })
                        .map((ad) => String(ad.adId || ad.ad_id || ""))
                        .filter(Boolean)
                );
            } catch {
                // non-critical
            }
        };

        void checkExpiry();
        const interval = window.setInterval(() => {
            if (document.visibilityState !== "hidden") void checkExpiry();
        }, 10000);

        return () => {
            mounted = false;
            window.clearInterval(interval);
        };
    }, [currentUser?.id]);

    useEffect(() => {
        let mounted = true;

        const loadGoogPosts = async () => {
            try {
                const data = await googService.getPosts();
                if (mounted) {
                    const nextPosts = Array.isArray(data) ? data.map(normalizeWritePost) : [];
                    const nextSignature = JSON.stringify(
                        nextPosts.map((post: any) => [
                            post.id,
                            post.updated_at || post.created_at || "",
                            post.likes,
                            post.comments,
                            post.views,
                            post.shares,
                        ]),
                    );
                    if (postsSignatureRef.current !== nextSignature) {
                        postsSignatureRef.current = nextSignature;
                        setPosts(nextPosts);
                    }
                    setIsLoadingFeed(false);
                }
            } catch (error) {
                console.error("Failed to load Goog posts:", error);
                if (mounted) setIsLoadingFeed(false);
            }
        };

        loadGoogPosts();
        const interval = window.setInterval(loadGoogPosts, 5000);

        return () => {
            mounted = false;
            window.clearInterval(interval);
        };
    }, [normalizeWritePost]);

    useEffect(() => {
        if (!isLoadingFeed) return;
        const timeoutId = window.setTimeout(() => {
            setIsLoadingFeed(false);
            console.warn("Home feed loading timed out. Rendering available content without the loading spinner.");
        }, 8000);

        return () => window.clearTimeout(timeoutId);
    }, [isLoadingFeed]);

    useEffect(() => {
        const handleSubscriptionUpdate = () => {};

        window.addEventListener("googer-subscription-updated", handleSubscriptionUpdate);
        return () => window.removeEventListener("googer-subscription-updated", handleSubscriptionUpdate);
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") return;
        try {
            const storedUser = JSON.parse((window.sessionStorage.getItem("user") || window.localStorage.getItem("user")) || "{}");
            const user = storedUser?.id ? storedUser : null;
            setCurrentUser(user);
            setViewerContext(user);
        } catch {
            setCurrentUser(null);
        }
    }, [setViewerContext]);

    useEffect(() => {
        const handleProfileUpdated = (event: Event) => {
            const updatedUser = (event as CustomEvent)?.detail?.user;
            if (!updatedUser?.id) return;

            setCurrentUser((prev: any) => (
                prev && String(prev.id) === String(updatedUser.id) ? { ...prev, ...updatedUser } : prev
            ));
            setAds((currentAds) => currentAds.map((ad) => syncAdOwnerProfile(ad, updatedUser)));
            setPosts((currentPosts) => currentPosts.map((post) => syncWritePostProfile(post, updatedUser)));
            setInteractionAd((currentAd: any) => syncAdOwnerProfile(currentAd, updatedUser));
            setProductAdModal((currentAd: any) => syncAdOwnerProfile(currentAd, updatedUser));
            setAdPreviewModal((current) => (
                current?.ad ? { ...current, ad: syncAdOwnerProfile(current.ad, updatedUser) } : current
            ));
            setPendingAdCoinAd((currentAd: any) => syncAdOwnerProfile(currentAd, updatedUser));
            setShareAdItem((currentAd: any) => syncAdOwnerProfile(currentAd, updatedUser));
        };

        window.addEventListener("userProfileUpdated", handleProfileUpdated as EventListener);
        return () => window.removeEventListener("userProfileUpdated", handleProfileUpdated as EventListener);
    }, []);

    const toggleWriteLike = async (postId: number) => {
        if (!authService.isAuthenticated() || !currentUser?.id) {
            openLoginRequired({ message: "Please log in to like Googs." });
            return;
        }
        const currentPost = posts.find((post) => post.id === postId);
        if (!currentPost) return;
        const wasLiked = currentPost.liked;
        const willBeLiked = !wasLiked;

        setPosts((currentPosts) =>
            currentPosts.map((post) =>
                post.id === postId
                    ? { ...post, liked: willBeLiked, likes: Math.max(0, post.likes + (willBeLiked ? 1 : -1)) }
                    : post,
            ),
        );

        try {
            const serverLiked = await googService.toggleLike(postId);
            setPosts((currentPosts) =>
                currentPosts.map((post) =>
                    post.id === postId
                        ? {
                            ...post,
                            liked: serverLiked,
                            likes: Math.max(0, post.likes + (serverLiked === post.liked ? 0 : serverLiked ? 1 : -1)),
                        }
                        : post,
                ),
            );
        } catch (error) {
            console.error("Failed to save Goog like:", error);
            setPosts((currentPosts) =>
                currentPosts.map((post) =>
                    post.id === postId
                        ? { ...post, liked: wasLiked, likes: Math.max(0, post.likes + (wasLiked === post.liked ? 0 : wasLiked ? 1 : -1)) }
                        : post,
                ),
            );
        }
    };

    const viewWritePost = async (postId: number) => {
        try {
            const result = await googService.logView(postId);
            const nextViews = Number(result?.views_count ?? result?.views ?? NaN);
            if (Number.isFinite(nextViews) || result?.incremented === true) {
                setPosts((currentPosts) =>
                    currentPosts.map((post) => post.id === postId ? { ...post, views: Number.isFinite(nextViews) ? nextViews : (post.views || 0) + 1 } : post),
                );
            }
        } catch (error) {
            console.error("Failed to save Goog view:", error);
        }
    };

    const shareWritePost = async (postId: number) => {
        if (!authService.isAuthenticated() || !currentUser?.id) {
            openLoginRequired({ message: "Please log in to share Googs." });
            return;
        }
        const targetPost = posts.find((post) => post.id === postId);
        if (targetPost) {
            setShareGoogPost(targetPost);
            setShowGoogShareModal(true);
        }
    };

    const updateUploadFeedItem = useCallback((contentId: string | number, updater: (item: UploadContentRecord) => UploadContentRecord) => {
        const normalizedId = String(contentId);
        setUploadContents((currentItems) =>
            currentItems.map((entry) =>
                String(entry.id) === normalizedId || String(entry.content_id || entry.contentId || "") === normalizedId
                    ? updater(entry)
                    : entry
            )
        );
    }, []);

    const openUploadSheet = useCallback(async (type: SheetType, uploadItem: UploadContentRecord) => {
        setUploadSheetType(type);
        setInteractionUpload(uploadItem);
        setIsUploadSheetOpen(true);
        setUploadSheetData([]);
        setIsUploadSheetLoading(true);

        try {
            let data: any[] = [];
            if (type === "comments") {
                data = await uploadContentService.getComments(uploadItem.id);
            } else if (type === "likes") {
                data = await uploadContentService.getLikes(uploadItem.id);
            } else if (type === "shares") {
                data = await uploadContentService.getShares(uploadItem.id);
            } else if (type === "views") {
                data = await uploadContentService.getViews(uploadItem.id);
            }
            setUploadSheetData(data || []);
        } catch (error) {
            console.error("Failed to open upload content interaction sheet:", error);
        } finally {
            setIsUploadSheetLoading(false);
        }
    }, []);

    const handleUploadLike = useCallback(async (uploadItem: UploadContentRecord) => {
        if (!authService.isAuthenticated() || !currentUser?.id) {
            openLoginRequired({ message: "Please log in to like upload content." });
            return;
        }

        const wasLiked = !!uploadItem.user_liked;
        const optimisticLiked = !wasLiked;
        updateUploadFeedItem(uploadItem.id, (entry) => ({
            ...entry,
            user_liked: optimisticLiked,
            likes_count: Math.max(0, Number(entry.likes_count ?? entry.likeCount ?? 0) + (optimisticLiked ? 1 : -1)),
            likeCount: Math.max(0, Number(entry.likes_count ?? entry.likeCount ?? 0) + (optimisticLiked ? 1 : -1)),
        }));
        if (interactionUpload?.id === uploadItem.id) {
            setInteractionUpload((current) => current ? {
                ...current,
                user_liked: optimisticLiked,
                likes_count: Math.max(0, Number(current.likes_count ?? current.likeCount ?? 0) + (optimisticLiked ? 1 : -1)),
                likeCount: Math.max(0, Number(current.likes_count ?? current.likeCount ?? 0) + (optimisticLiked ? 1 : -1)),
            } : current);
        }

        try {
            const result = await uploadContentService.toggleLike(uploadItem.id);
            updateUploadFeedItem(uploadItem.id, (entry) => ({
                ...entry,
                user_liked: !!result.liked,
                likes_count: Number(result.likes_count || 0),
                likeCount: Number(result.likes_count || 0),
            }));
            if (interactionUpload?.id === uploadItem.id) {
                setInteractionUpload((current) => current ? {
                    ...current,
                    user_liked: !!result.liked,
                    likes_count: Number(result.likes_count || 0),
                    likeCount: Number(result.likes_count || 0),
                } : current);
            }
            if (isUploadSheetOpen && uploadSheetType === "likes" && interactionUpload?.id === uploadItem.id) {
                setUploadSheetData(await uploadContentService.getLikes(uploadItem.id));
            }
        } catch (error) {
            console.error("Failed to toggle upload content like:", error);
            updateUploadFeedItem(uploadItem.id, (entry) => ({
                ...entry,
                user_liked: wasLiked,
                likes_count: Math.max(0, Number(entry.likes_count ?? entry.likeCount ?? 0) + (wasLiked ? 1 : -1)),
                likeCount: Math.max(0, Number(entry.likes_count ?? entry.likeCount ?? 0) + (wasLiked ? 1 : -1)),
            }));
        }
    }, [currentUser?.id, interactionUpload, isUploadSheetOpen, updateUploadFeedItem, uploadSheetType]);

    const handleUploadShare = useCallback(async (uploadItem: UploadContentRecord) => {
        setUploadShareInitialView("share");
        setShareUploadItem(uploadItem);
        setShowUploadShareModal(true);
        try {
            const result = await uploadContentService.logShare(uploadItem.id);
            updateUploadFeedItem(uploadItem.id, (entry) => ({
                ...entry,
                shares_count: Number(result.shares_count || 0),
                shareCount: Number(result.shares_count || 0),
            }));
            if (interactionUpload?.id === uploadItem.id) {
                setInteractionUpload((current) => current ? {
                    ...current,
                    shares_count: Number(result.shares_count || 0),
                    shareCount: Number(result.shares_count || 0),
                } : current);
            }
        } catch (error) {
            console.error("Failed to share upload content:", error);
        }
    }, [interactionUpload, updateUploadFeedItem]);

    const handleUploadPin = useCallback(async (uploadItem: UploadContentRecord) => {
        if (!authService.isAuthenticated() || !currentUser?.id) {
            openLoginRequired({ message: "Please log in to pin content." });
            return;
        }
        try {
            const updated = await uploadContentService.togglePin(uploadItem.id);
            updateUploadFeedItem(uploadItem.id, () => updated);
            addTopbarNotification({
                type: "success",
                title: updated.pinned_at ? "Pinned" : "Unpinned",
                message: updated.pinned_at ? "Content pinned on your profile." : "Content removed from pinned area.",
            });
        } catch (error) {
            addTopbarNotification({
                type: "error",
                title: "Error",
                message: error instanceof Error ? error.message : "Could not update pin.",
            });
        }
    }, [currentUser?.id, updateUploadFeedItem]);

    const handleUploadRepost = useCallback(async (uploadItem: UploadContentRecord) => {
        if (!authService.isAuthenticated() || !currentUser?.id) {
            openLoginRequired({ message: "Please log in to repost content." });
            return;
        }
        if (String(uploadItem.user_id || "") === String(currentUser.id || "")) {
            addTopbarNotification({ type: "info", title: "Own Content", message: "You cannot repost your own content." });
            return;
        }
        try {
            const result = await uploadContentService.repostContent(uploadItem.id);
            updateUploadFeedItem(uploadItem.id, (entry) => ({
                ...entry,
                reposts_count: Number(result.reposts_count || 0),
                repostCount: Number(result.reposts_count || 0),
            }));
            setUploadShareInitialView("resell");
            setShareUploadItem(uploadItem);
            setShowUploadShareModal(true);
            addTopbarNotification({
                type: result.alreadyReposted ? "info" : "success",
                title: result.alreadyReposted ? "Already Reposted" : "Reposted",
                message: result.alreadyReposted ? "You already reposted this content." : "Content reposted. You can now share your earn link.",
            });
        } catch (error) {
            addTopbarNotification({
                type: "error",
                title: "Error",
                message: error instanceof Error ? error.message : "Could not repost content.",
            });
        }
    }, [currentUser?.id, updateUploadFeedItem]);

    const handleUploadNotInterested = useCallback((uploadItem: UploadContentRecord) => {
        hideFeedItemFor24Hours(currentUser?.id, "uploadContent", uploadItem.id);
        setHiddenHomeUploadIds((previous) => new Set(previous).add(String(uploadItem.id)));
        addTopbarNotification({ type: "success", title: "Hidden", message: "This content will be hidden for 24 hours." });
    }, [currentUser?.id]);

    const openUploadReportModal = useCallback((uploadItem: UploadContentRecord) => {
        if (!authService.isAuthenticated() || !currentUser?.id) {
            openLoginRequired({ message: "Please log in to report content." });
            return;
        }
        setReportTargetUpload(uploadItem);
        setUploadReportReason("");
        setUploadReportCustomReason("");
        setUploadReportSubmitted(false);
        setUploadReportError("");
    }, [currentUser?.id]);

    const submitUploadReport = useCallback(async () => {
        if (!reportTargetUpload || !uploadReportReason) return;
        setUploadReportSubmitting(true);
        setUploadReportError("");
        try {
            await uploadContentService.reportContent(reportTargetUpload.id, uploadReportReason, uploadReportCustomReason.trim() || undefined);
            setUploadReportSubmitted(true);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to submit report.";
            setUploadReportError(message.toLowerCase().includes("already reported") ? "You have already reported this." : message);
        } finally {
            setUploadReportSubmitting(false);
        }
    }, [reportTargetUpload, uploadReportCustomReason, uploadReportReason]);

    const handleUploadView = useCallback(async (uploadItem: UploadContentRecord) => {
        try {
            const result = await uploadContentService.logView(uploadItem.id);
            updateUploadFeedItem(uploadItem.id, (entry) => ({
                ...entry,
                views_count: Number(result.views_count || 0),
                viewCount: Number(result.views_count || 0),
            }));
            if (interactionUpload?.id === uploadItem.id) {
                setInteractionUpload((current) => current ? {
                    ...current,
                    views_count: Number(result.views_count || 0),
                    viewCount: Number(result.views_count || 0),
                } : current);
            }
        } catch (error) {
            console.error("Failed to log upload content view:", error);
        }
    }, [interactionUpload, updateUploadFeedItem]);

    const openWritePostSheet = async (type: SheetType, post: WritePost) => {
        setPostSheetType(type);
        setInteractionPost(post);
        setIsPostSheetOpen(true);
        setPostSheetData([]);

        try {
            if (type === "comments") {
                const data = await googService.getComments(post.id);
                setPostSheetData(data);
            } else if (type === "likes") {
                setPostSheetData(await googService.getLikes(post.id));
            } else if (type === "shares") {
                setPostSheetData(await googService.getShares(post.id));
            } else if (type === "views") {
                setPostSheetData(await googService.getViews(post.id));
            }
        } catch (error) {
            console.error("Failed to load Goog interaction data:", error);
        }
    };

    const addWritePostComment = async (comment: string, parentId?: number) => {
        if (!interactionPost || !comment.trim()) return;
        if (!authService.isAuthenticated() || !currentUser?.id) {
            openLoginRequired({ message: "Please log in to comment on Googs." });
            return;
        }
        try {
            const commentData = await googService.addComment(interactionPost.id, comment.trim(), parentId);
            setPostSheetData((current) => [...current, {
                ...commentData,
                username: currentUser?.username || commentData?.username || "You",
                profile_picture: currentUser?.profile_picture ?? commentData?.profile_picture,
            }]);
            setPosts((currentPosts) =>
                currentPosts.map((post) => post.id === interactionPost.id ? { ...post, comments: post.comments + 1 } : post),
            );
        } catch (error) {
            console.error("Failed to save Goog comment:", error);
        }
    };

    const refreshWritePostSheet = async () => {
        if (!interactionPost || postSheetType !== "comments") return;
        try {
            const data = await googService.getComments(interactionPost.id);
            setPostSheetData(data);
        } catch (error) {
            console.error("Failed to refresh Goog comments:", error);
        }
    };

    const navigateToPostProfile = (event: React.MouseEvent, post: WritePost) => {
        event.stopPropagation();
        if (post.user.id) {
            router.push(`/dashboard/profile?id=${post.user.id}`);
            return;
        }
        if (post.user.username) {
            router.push(`/dashboard/profile?user=${encodeURIComponent(post.user.username)}`);
        }
    };

    const navigateToAdProfile = (event: React.MouseEvent, ad: any) => {
        event.stopPropagation();
        if (ad.user_id) {
            router.push(`/dashboard/profile?id=${ad.user_id}`);
            return;
        }
        const username = getItemUsername(ad, "");
        if (username) {
            router.push(`/dashboard/profile?user=${encodeURIComponent(username)}`);
        }
    };

    const isOwnWritePost = (post: WritePost) => {
        return Number(post.user.id) === Number(currentUser?.id) || post.user.name === "You" || !post.user.id;
    };

    const togglePostOptionsMenu = (event: React.MouseEvent<HTMLButtonElement>, post: WritePost) => {
        event.stopPropagation();
        if (openPostMenu?.post.id === post.id) {
            setOpenPostMenu(null);
            return;
        }

        const rect = event.currentTarget.getBoundingClientRect();
        const menuWidth = 224;
        const left = Math.max(12, Math.min(window.innerWidth - menuWidth - 12, rect.right - menuWidth));
        const top = Math.min(window.innerHeight - 260, rect.bottom + 8);
        setOpenPostMenu({ post, top: Math.max(12, top), left });
    };

    const editWritePost = (post: WritePost) => {
        setOpenPostMenu(null);
        window.dispatchEvent(new CustomEvent("open-write-googs-modal", { detail: post }));
    };

    const deleteWritePost = async () => {
        if (!postToDelete) return;
        const deletingPost = postToDelete;
        setPosts((currentPosts) => currentPosts.filter((post) => post.id !== postToDelete.id));
        setPostToDelete(null);
        try {
            await googService.deletePost(deletingPost.id);
        } catch (error) {
            console.error("Failed to delete Goog post:", error);
            setPosts((currentPosts) => [deletingPost, ...currentPosts]);
        }
    };

    const openReportModal = (post: WritePost) => {
        setReportTargetPost(post);
        setReportReason("");
        setReportCustomReason("");
        setReportSubmitted(false);
        setReportError("");
        setOpenPostMenu(null);
    };

    const submitReport = async () => {
        if (!reportTargetPost || !reportReason) return;
        setReportSubmitting(true);
        setReportError("");
        try {
            const _token = authService.getToken() || "";
            const rawIdStr = String(reportTargetPost.id ?? "");
            const cleanIdStr = rawIdStr.replace(/^ad-/i, "");
            const isAd = !!(reportTargetPost as any).is_sponsored || /^ad-/i.test(rawIdStr);
            const campaignType = String((reportTargetPost as any).campaign_type || (reportTargetPost as any).campaignType || "").toLowerCase();
            const isProductPromote = !!(reportTargetPost as any).isProductPromoteSecondView
                || campaignType.includes("product promote")
                || campaignType.includes("product");
            if (isAd || !cleanIdStr || isNaN(Number(cleanIdStr))) {
                // Use adId field first (the real DB id), then fall back to cleanIdStr
                const adIdStr = String((reportTargetPost as any).adId || (reportTargetPost as any).ad_id || cleanIdStr || "").replace(/^ad-/i, "");
                if (!adIdStr) throw new Error("Failed to submit report.");
                // Product promote → market product endpoint; photo/video → ads endpoint
                const reportEndpoint = isProductPromote
                    ? `/api/market/${adIdStr}/report`
                    : `/api/ads/${adIdStr}/report`;
                const resp = await fetch(reportEndpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${_token}` },
                    body: JSON.stringify({ reason: reportReason, custom_reason: reportCustomReason.trim() || undefined }),
                });
                if (!resp.ok) {
                    const d = await resp.json().catch(() => ({}));
                    throw new Error(d.message || "Failed to submit report.");
                }
            } else {
                await googService.createReport(Number(cleanIdStr), reportReason, reportCustomReason.trim() || undefined);
            }
            setReportSubmitted(true);
            setTimeout(() => {
                setReportTargetPost(null);
                setReportSubmitted(false);
                setReportError("");
            }, 2200);
        } catch (error: any) {
            const msg = error?.message || "";
            if (msg.toLowerCase().includes("already reported")) {
                setReportError("You have already reported this.");
            } else {
                setReportError("Failed to submit. Please try again.");
            }
        } finally {
            setReportSubmitting(false);
        }
    };

    const publishWritePost = async () => {
        const text = postText.trim();
        if (!text) return;

        try {
            const post = await googService.createPost({ text, textColor: "#FFFFFF" });
            setPosts((currentPosts) => [post, ...currentPosts]);
            setPostText("");
        } catch (error) {
            console.error("Failed to publish Goog post:", error);
        }
    };

    useEffect(() => {
        const handleCreatedGoog = (event: Event) => {
            const detail = (event as CustomEvent<WritePost>).detail;
            if (!detail?.text || !detail?.id || isNaN(Number(detail.id))) return;
            const newPost = { ...detail, id: Number(detail.id), views: detail.views || 0, createdAt: detail.createdAt || new Date().toISOString() };
            setPosts((currentPosts) => currentPosts.some((post) => post.id === newPost.id) ? currentPosts : [newPost, ...currentPosts]);
        };

        try {
            const pending = JSON.parse(window.localStorage.getItem("googer-pending-write-post") || "null");
            if (pending?.text && pending?.id && !isNaN(Number(pending.id))) {
                const pendingPost = { ...pending, id: Number(pending.id), views: pending.views || 0, createdAt: pending.createdAt || new Date().toISOString() };
                setPosts((currentPosts) => currentPosts.some((post) => post.id === pendingPost.id) ? currentPosts : [pendingPost, ...currentPosts]);
                window.localStorage.removeItem("googer-pending-write-post");
            } else if (pending?.text) {
                window.localStorage.removeItem("googer-pending-write-post");
            }
        } catch { }

        window.addEventListener("googer-write-created", handleCreatedGoog);
        const handleUpdatedGoog = (event: Event) => {
            const detail = (event as CustomEvent<WritePost>).detail;
            if (!detail?.id) return;
            setPosts((currentPosts) => currentPosts.map((post) => post.id === detail.id ? { ...post, ...detail } : post));
        };

        window.addEventListener("googer-write-updated", handleUpdatedGoog);
        return () => {
            window.removeEventListener("googer-write-created", handleCreatedGoog);
            window.removeEventListener("googer-write-updated", handleUpdatedGoog);
        };
    }, []);

    // Removed manual sync helpers syncOpenAdCopies and updateAdLocalState in favor of useAdStore

    const isWatchTimedPhotoVideoAd = (item: any) => {
        const raw = item?.raw || item || {};
        const campaignType = String(raw.campaign_type || raw.campaignType || "").trim().toLowerCase();
        if (campaignType.includes("product") || campaignType.includes("profile")) return false;
        if (!(campaignType.includes("photo") || campaignType.includes("video"))) return false;
        // Watch-time applies only to actual uploaded video files, not images or link-based ads.
        const mediaType = String(raw.media_type || raw.mediaType || "").trim().toLowerCase();
        return mediaType === "video";
    };

    const isAdWatchEligible = (item: any) => {
        const collectionId = String(getSponsoredCollectionId(item?.raw || item));
        return homeCoinReadyAdIds.has(collectionId);
    };

    useEffect(() => {
        let cancelled = false;
        const loadAdCoinSettings = async () => {
            try {
                const settings = await marketService.getAdCoinSettingsPublic();
                if (cancelled) return;
                setRequiredAdWatchSeconds(Math.max(1, Math.floor(Number(settings?.required_watch_seconds || 5))));
            } catch {
                if (!cancelled) setRequiredAdWatchSeconds(5);
            }
        };

        void loadAdCoinSettings();
        const intervalId = window.setInterval(() => {
            void loadAdCoinSettings();
        }, 30000);
        return () => {
            cancelled = true;
            window.clearInterval(intervalId);
        };
    }, []);

    const toggleFeedLike = async (itemOrId: any) => {
        const liveAd = resolveHomeLiveAd(itemOrId);
        if (!liveAd?.id) return;

        // Block unlike if coin was already collected — guards in the card UI may miss
        // this when the Zustand subscriber hasn't re-rendered yet (stale reactive value).
        if (liveAd.ad_like_locked || liveAd.ad_coin_collected) return;

        try {
            await adActions.like(liveAd);
        } catch (error: any) {
            if (error?.locked) return; // backend confirmed lock — silently ignore
            throw error;
        }
    };

    const getProductPromoteShareItem = (item: any) => {
        if (item?.campaign_type !== "Product Promote") return item;

        const promotedProductId = item.linked_product_id ?? item.product_id ?? item.productId;
        const promotedProductCode = item.linked_product_share_code ?? item.linked_product_code ?? item.share_code ?? item.shareCode;
        if (promotedProductId == null && !promotedProductCode) return item;

        return {
            ...item,
            id: promotedProductId,
            productId: promotedProductId,
            product_id: promotedProductId,
            linked_product_id: promotedProductId,
            linked_product_share_code: promotedProductCode,
            product_code: promotedProductCode,
            linked_product_code: promotedProductCode,
            shareCode: promotedProductCode,
            share_code: promotedProductCode,
            is_sponsored: true,
            campaign_type: "Product Promote",
        };
    };

    const getFeedShareType = (item: any): "ad" | "product" => (
        item?.campaign_type === "Product Promote" ? "product" : "ad"
    );

    const shareFeedItem = async (item: any) => {
        if (!item) return;

        adActions.share(item);
    };

    const handleGoogCopyLink = async () => {
        if (!shareGoogPost?.id) return;

        try {
            const result = await googService.logShare(shareGoogPost.id);
            if (result?.incremented === true) {
                setPosts((currentPosts) =>
                    currentPosts.map((post) =>
                        post.id === shareGoogPost.id ? { ...post, shares: (post.shares || 0) + 1 } : post,
                    ),
                );
                setShareGoogPost((currentPost) =>
                    currentPost ? { ...currentPost, shares: (currentPost.shares || 0) + 1 } : currentPost,
                );
            }
        } catch (error) {
            console.error("Failed to save Goog share:", error);
        }
    };

    const handleAdCopyLink = async () => {
        if (!shareAdItem?.id) return;

        try {
            const result = await marketService.logShare(shareAdItem.id);
            if (result?.incremented === true) {
                updateAdState(shareAdItem, (prev) => ({ shares_count: (prev.shares_count || 0) + 1 }));
            }
        } catch (error) {
            console.error("Failed to log ad share:", error);
        }
    };

    const viewFeedItem = async (item: any) => {
        const viewId = item?.adId || item?.ad_id
            ? `ad-${String(item.adId || item.ad_id).replace(/^ad-/, "")}`
            : item.id;
        const result = await marketService.logView(viewId);
        if (!result?.success) return;
        const nextViewsCount = Number(
            result.views_count ??
            result.viewCount ??
            result.views ??
            item?.views_count ??
            item?.viewCount ??
            0,
        );
        const nextReach = Number(result.current_reach ?? result.reach ?? 0);
        updateAdState(item, {
            views_count: nextViewsCount,
            viewCount: nextViewsCount,
            current_reach: nextReach,
            reach: nextReach,
            clicks: Number(result.clicks || result.link_actions || 0),
            link_actions: Number(result.link_actions || result.clicks || 0),
            message_clicks: Number(result.message_clicks || 0),
            visit_clicks: Number(result.visit_clicks || 0),
            call_clicks: Number(result.call_clicks || 0),
        });
    };

    const impressionFeedItem = async (item: any) => {
        const impressionId = item?.adId || item?.ad_id
            ? `ad-${String(item.adId || item.ad_id).replace(/^ad-/, "")}`
            : item.id;
        const result = await marketService.logAdImpression(impressionId);
        if (!result?.success) return;
        updateAdState(item, {
            impressions: Number(result.impressions ?? item?.impressions ?? item?.impressions_count ?? 0),
            impressions_count: Number(result.impressions ?? item?.impressions ?? item?.impressions_count ?? 0),
            current_reach: Number(result.current_reach ?? result.reach ?? item?.current_reach ?? item?.reach ?? 0),
            reach: Number(result.current_reach ?? result.reach ?? item?.current_reach ?? item?.reach ?? 0),
        });
        if (result.capped || String(result.status || "").toLowerCase() === "completed") {
            hideAdFromHome(String(impressionId).replace(/^ad-/, ""));
        }
    };

    const getSponsoredCollectionId = (ad: any) => {
        if (!ad?.is_sponsored) return ad?.id;
        return String(ad?.id || "").startsWith("ad-") ? ad.id : (ad?.adId ? `ad-${ad.adId}` : ad?.id);
    };

    const canShowAdCollectCoin = (ad: any) => canShowCollectCoinButton(ad, currentUser);

    const markAdCoinCollectedLocally = (adId: string | number) => {
        updateAdState(adId, { ad_coin_collected: true, ad_like_locked: true });
    };

    const adActions = useAdActions(null, {
        currentUser,
        canShowCollectCoin: canShowAdCollectCoin,
        // Removed local sync callbacks - useAdActions now updates useAdStore globally
        onShare: (item) => {
            if (!authService.isAuthenticated() || !currentUser?.id) {
                openLoginRequired({ message: "Please log in to share ads." });
                return;
            }
            setShareAdItem(getProductPromoteShareItem(item.raw || item));
            setShowAdShareModal(true);
        },
        onOpenSheet: (type, item) => openMarketAdSheet(type, item.raw || item),
        onCoinCollected: (ad, collectionId) => {
            markAdCoinCollectedLocally(collectionId);
            setHomeCoinReadyAdIds((current) => {
                const next = new Set(current);
                next.delete(String(collectionId));
                return next;
            });
            setNotification({
                type: "success",
                title: "Coin Collected",
                message: `Rupieer ${Number(ad.raw?.ad_coin_value || 1).toFixed(2)} added to your wallet.`,
            });
        },
        onCoinError: (_ad, error: any) => {
            setNotification({
                type: "error",
                title: "Collection Failed",
                message: error?.message || "Could not collect the ad coin.",
            });
        },
        onNeedCoinConfirmation: (item) => {
            const warningKey = `googer-ad-coin-warning-${currentUser?.id}`;
            const alreadySeen = typeof window !== "undefined" && localStorage.getItem(warningKey) === "1";
            if (alreadySeen) {
                collectAdCoin(item.raw || item);
            } else {
                setPendingAdCoinAd(item.raw || item);
            }
        },
        onNotify: (notification) => {
            if (notification.title === "Login Required" || notification.title === "Session Expired") {
                openLoginRequired({ message: notification.message });
                return;
            }
            setNotification(notification);
        },
        onSubscribe: (ad) => {
            if (ad.userId) router.push(`/dashboard/profile?id=${ad.userId}`);
        },
        onAddToBag: (ad) => {
            openProductAdAddToBag(ad.raw || ad);
        }
    });

    const collectAdCoin = async (ad: any) => {
        try {
            await adActions.collectAdCoin(ad);
        } catch (error) {
            console.error("Ad coin collection failed:", error);
        } finally {
            setPendingAdCoinAd(null);
        }
    };

    const handleAdCoinClick = (event: React.MouseEvent, ad: any) => {
        if (isWatchTimedPhotoVideoAd(ad) && !isAdWatchEligible(ad)) {
            event.stopPropagation();
            setNotification({
                type: "error",
                title: "Watch Required",
                message: `Please watch this ad for ${requiredAdWatchSeconds} seconds before collecting the coin.`,
            });
            return;
        }
        adActions.handleAdCoinClick(event, ad);
    };

    const openTrendingPostDetails = (post: TrendingPost) => {
        try {
            window.localStorage.setItem("googer-selected-trending-post", JSON.stringify(post));
        } catch { }
        router.push(`/dashboard/googs/${encodeURIComponent(post.id)}`);
    };

    const openSponsoredLink = (event: React.MouseEvent, ad: any) => {
        event.stopPropagation();
        const href = getSponsoredCtaHref(ad.cta_topic, ad.cta_value) || normalizeExternalUrl(ad.active_link || "");
        if (!href) return;
        window.open(href, "_blank", "noopener,noreferrer");
    };

    const openAdInShop = (ad: any, previewType: string | null) => {
        if (!ad?.id) return;
        if (ad?.campaign_type === "Product Promote" || ad?.campaignType === "Product Promote") {
            void openProductAdInShopSecondView(ad);
            return;
        }
        const kind = getSponsoredSecondViewKind(ad, previewType);
        setAdPreviewModal({ ad, kind });
        void viewFeedItem(ad);
    };

    const hideAdFromHome = (adId: string | number) => {
        const interactionId = getAdInteractionId(adId);
        hideFeedItemFor24Hours(currentUser?.id, "ad", interactionId);
        setAds((currentAds) => currentAds.filter((currentAd) => getAdInteractionId(currentAd) !== interactionId));
        setOpenMenuAdId(null);
        setAdPreviewModal(null);
        setProductAdModal(null);
    };

    const hideGoogFromHome = (post: WritePost) => {
        if (!post?.id) return;
        hideFeedItemFor24Hours(currentUser?.id, "goog", post.id);
        setPosts((currentPosts) => currentPosts.filter((currentPost) => String(currentPost.id) !== String(post.id)));
        setOpenPostMenu(null);
    };

    const openProductAdInShopSecondView = async (product: any) => {
        if (!product?.id) return;
        setProductAdSizeError(false);
        const originalProduct = await resolveProductPromoteProduct(product);
        if (!originalProduct) {
            setNotification({ type: "error", title: "Product unavailable", message: "The promoted product could not be loaded." });
            return;
        }
        setProductAdModal(originalProduct);
        void viewFeedItem(product);
    };

    const openProductAdAddToBag = async (product: any) => {
        if (!product?.id) return;
        if (!authService.isAuthenticated() || !currentUser?.id) {
            openLoginRequired({ message: "Please log in to buy items." });
            return;
        }
        setProductAdSizeError(true);
        setNotification({ type: "error", title: "Size is required", message: "Size is required" });
        const originalProduct = await resolveProductPromoteProduct(product);
        if (!originalProduct) {
            setNotification({ type: "error", title: "Product unavailable", message: "The promoted product could not be loaded." });
            return;
        }
        setProductAdModal(originalProduct);
        void viewFeedItem(product);
    };

    const openMarketAdSheet = async (type: SheetType, ad: any) => {
        setAdSheetType(type);
        setInteractionAd(ad);
        setIsAdSheetOpen(true);
        setAdSheetData([]);
        setIsAdSheetLoading(true);

        try {
            let data: any[] = [];
            if (type === "comments") {
                data = await marketService.getComments(ad.id);
            } else if (type === "likes") {
                data = (await marketService.getLikes(ad.id)) || [];
            } else if (type === "shares") {
                data = (await marketService.getShares(ad.id)) || [];
            } else if (type === "views") {
                data = (await marketService.getViews(ad.id)) || [];
            }
            setAdSheetData(data || []);
        } catch (error) {
            console.error("Failed to open ad interaction sheet:", error);
        } finally {
            setIsAdSheetLoading(false);
        }
    };

    const addAdComment = async (comment: string, parentId?: number) => {
        if (!interactionAd || !comment.trim()) return;
        if (!authService.isAuthenticated() || !currentUser?.id) {
            openLoginRequired({ message: "Please log in to comment on ads." });
            return;
        }
        try {
            const commentData = await marketService.addComment(interactionAd.id, comment.trim(), parentId);
            setAdSheetData((current) => [...current, {
                ...commentData,
                username: currentUser?.username || commentData?.username || "You",
                profile_picture: currentUser?.profile_picture ?? commentData?.profile_picture,
            }]);
            updateAdState(interactionAd, (prev) => ({ comments_count: (prev.comments_count || 0) + 1 }));
        } catch (error) {
            console.error("Failed to save ad comment:", error);
        }
    };

    const refreshAdSheet = async () => {
        if (!interactionAd || adSheetType !== "comments") return;
        try {
            const data = await marketService.getComments(interactionAd.id);
            setAdSheetData(data || []);
        } catch (error) {
            console.error("Failed to refresh ad comments:", error);
        }
    };

    return (
        <>
        {mounted &&
            document.getElementById("shop-search-portal") &&
            createPortal(
                <form
                    className="flex w-full items-center"
                    onSubmit={(event) => {
                        event.preventDefault();
                        setGoogSearchQuery(googSearchDraft.trim());
                    }}
                >
                    <div className="relative w-full">
                        <input
                            type="text"
                            value={googSearchDraft}
                            onChange={(event) => setGoogSearchDraft(event.target.value)}
                            placeholder="Search Googs"
                            className="h-7 w-full rounded-full border border-white/10 bg-[#111] pl-8 pr-8 text-xs font-bold text-white outline-none transition placeholder:text-white/30 focus:border-white/25 focus:bg-[#151515]"
                        />
                        <button
                            type="submit"
                            className="absolute left-0 top-0 flex h-7 items-center pl-3 pr-1 text-white/35 transition hover:text-white/70"
                            aria-label="Search Googs"
                        >
                            <IonIcon name="search-outline" className="text-xs" />
                        </button>
                        {(googSearchDraft || googSearchQuery) && (
                            <button
                                type="button"
                                onClick={() => {
                                    setGoogSearchDraft("");
                                    setGoogSearchQuery("");
                                }}
                                className="absolute right-0 top-0 flex h-7 items-center pl-1 pr-3 text-white/35 transition hover:text-white/70"
                                aria-label="Clear Googs search"
                            >
                                <IonIcon name="close-circle" className="text-sm" />
                            </button>
                        )}
                    </div>
                </form>,
                document.getElementById("shop-search-portal")!,
            )}

        <main className="-mx-2 min-h-[calc(100vh-7rem)] bg-[#1c1917] px-2 py-0 text-white sm:-mx-4 sm:px-4 md:-mx-6 md:px-6 lg:min-h-[calc(100vh-5rem)] overflow-x-hidden">
            <div className="mx-auto grid min-h-0 w-full max-w-[1400px] gap-6 py-3 md:gap-7 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start xl:grid-cols-[minmax(0,700px)_380px] xl:gap-8">
                <section ref={composeSectionRef} className="hidden" aria-hidden="true">
                    <textarea value={postText} onChange={(event) => setPostText(event.target.value)} />
                    <button type="button" onClick={publishWritePost}>Post</button>
                </section>

                <section className="min-h-0 overflow-hidden rounded-[2rem] border border-white/10 bg-[#211d1a] shadow-[0_18px_60px_rgba(0,0,0,0.24)]">
                    <div className="scrollbar-dark min-h-0 overflow-y-auto rounded-[inherit] pb-20 lg:pb-10">
                        <div className="border-b border-white/8 bg-[#211d1a] px-3 pb-2 pt-2 sm:px-4">
                            <div className="overflow-x-auto px-1 pb-1 pt-1">
                                <div className="flex min-w-max items-center gap-2">
                                    {googCategoryOptions.map((category) => {
                                        const isActive = selectedGoogCategory === category;
                                        return (
                                            <button
                                                key={category}
                                                type="button"
                                                onClick={() => setSelectedGoogCategory(category)}
                                                className={`rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] transition ${
                                                    isActive
                                                        ? "border-white bg-white text-black"
                                                        : "border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.08] hover:text-white"
                                                }`}
                                            >
                                                {category}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                        {isLoadingFeed && homeFeedItems.length === 0 ? (
                            <div className="flex items-center justify-center py-20">
                                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-white"></div>
                            </div>
                        ) : null}
                        <DashboardRenderBoundary
                            fallback={
                                <div className="px-4 py-8 text-center sm:px-7">
                                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-6 text-sm font-semibold text-white/55">
                                        The home feed hit a rendering error. Refresh the page and try again.
                                    </div>
                                </div>
                            }
                        >
                            <>
                                {visibleHomeFeedItems.map((item, feedIndex) => {
                                    if (item.type === "write") {
                                        const post = item.post;
                                        return (
                                            <GoogCard
                                                key={`write-${post.id}`}
                                                post={post}
                                                onNavigateToProfile={navigateToPostProfile}
                                                onToggleLike={toggleWriteLike}
                                                onOpenSheet={openWritePostSheet}
                                                onViewPost={viewWritePost}
                                                onSharePost={shareWritePost}
                                                onToggleMenu={togglePostOptionsMenu}
                                            />
                                        );
                                    }

                                    if (item.type === "uploadContent") {
                                        const uploadItem = item.item;
                                        return (
                                            <HomeUploadContentCard
                                                key={item.id}
                                                item={uploadItem}
                                                currentUser={currentUser}
                                                onToggleLike={handleUploadLike}
                                                onOpenSheet={openUploadSheet}
                                                onShare={handleUploadShare}
                                                onRepost={handleUploadRepost}
                                                onLogView={handleUploadView}
                                                onPin={handleUploadPin}
                                                onReport={openUploadReportModal}
                                                onNotInterested={handleUploadNotInterested}
                                                onAccessChanged={(changedItem) => {
                                                    updateUploadFeedItem(changedItem.id, (entry) => ({
                                                        ...entry,
                                                        user_purchased: true,
                                                        user_has_access: true,
                                                    }));
                                                }}
                                                flashContentAutoPlay={flashContentAutoPlay}
                                                onOpenProfile={() => {
                                                    if (uploadItem.user_id) {
                                                        router.push(`/dashboard/profile?id=${uploadItem.user_id}`);
                                                        return;
                                                    }
                                                    if (uploadItem.username) {
                                                        router.push(`/dashboard/profile?user=${encodeURIComponent(uploadItem.username)}`);
                                                    }
                                                }}
                                            />
                                        );
                                    }

                                    if (item.type === "profilePromoteCarousel") {
                                        return (
                                            <ProfilePromoteCarousel
                                                key={item.id}
                                                ads={item.ads}
                                                cardsPerView={2}
                                                onProductClick={openProductAdInShopSecondView}
                                                onProfileClick={(clickedAd) => {
                                                    if (clickedAd.user_id) {
                                                        router.push(`/dashboard/profile?id=${clickedAd.user_id}`);
                                                        return;
                                                    }
                                                    router.push(`/dashboard/profile?user=${encodeURIComponent(getItemUsername(clickedAd, "Advertiser"))}`);
                                                }}
                                            />
                                        );
                                    }

                                    const ad = item.ad;
                                    const activeLink = normalizeExternalUrl(ad.active_link || "");
                                    const previewType = getSponsoredLinkPreviewType(activeLink);

                                    return (
                                        <AdImpressionTrigger
                                            key={`${String(ad.id)}-${feedIndex}`}
                                            adId={String(ad.id)}
                                            onImpression={() => {
                                                void impressionFeedItem(ad);
                                                void viewFeedItem(ad);
                                            }}
                                        >
                                            <article className="px-4 py-4 transition-colors sm:px-7">
                                                <div className="mx-auto w-full max-w-[360px]">
                                                    <PromotedAdCard
                                                        ad={ad}
                                                        isMenuOpen={openMenuAdId === ad.id}
                                                        onToggleMenu={(adId) => setOpenMenuAdId(openMenuAdId === adId ? null : adId)}
                                                        onCloseMenu={() => setOpenMenuAdId(null)}
                                                        onOpenSecondView={() => openAdInShop(ad, previewType)}
                                                        onProductClick={openProductAdInShopSecondView}
                                                        onAddToBagClick={openProductAdAddToBag}
                                                        onToggleLike={toggleFeedLike}
                                                        onOpenSheet={openMarketAdSheet}
                                                        onShare={shareFeedItem}
                                                        onLogView={() => void viewFeedItem(ad)}
                                                        onReport={(targetAd) => {
                                                            setReportTargetPost({
                                                                ...targetAd,
                                                                id: targetAd.id,
                                                                text: targetAd.title || targetAd.description || "",
                                                                user: { id: targetAd.user_id, name: getItemUsername(targetAd, "Sponsored"), img: getItemProfilePicture(targetAd) || "" },
                                                                liked: false,
                                                                likes: targetAd.likes_count || 0,
                                                                comments: targetAd.comments_count || 0,
                                                                views: targetAd.views_count || 0,
                                                                reposts: 0,
                                                                shares: targetAd.shares_count || 0,
                                                            } as WritePost);
                                                            setReportReason("");
                                                            setReportCustomReason("");
                                                            setReportSubmitted(false);
                                                        }}
                                                        onNotInterested={hideAdFromHome}
                                                        onPromoteAgain={handlePromoteAgain}
                                                        onCollectCoin={handleAdCoinClick}
                                                        onNavigateToProfile={navigateToAdProfile}
                                                        canShowCollectCoin={canShowAdCollectCoin}
                                                        currentUser={currentUser}
                                                    />
                                                </div>
                                            </article>
                                        </AdImpressionTrigger>
                                    );
                                })}
                                {visibleHomeFeedCount < homeFeedItems.length && !googSearchQuery.trim() && (
                                    <div ref={homeFeedLoadMoreRef} className="h-16 w-full" aria-hidden="true" />
                                )}
                            </>
                        </DashboardRenderBoundary>
                    </div>
                </section>

                <aside className="hidden lg:block">
                    <div className="sticky top-0 overflow-hidden rounded-[2rem] border border-white/10 bg-[#211d1a] shadow-[0_18px_60px_rgba(0,0,0,0.22)]">
                        <div className="p-4 pb-5">
                            <div className="mb-4 flex items-center justify-between">
                                <div>
                                    <h2 className="text-[15px] font-black text-white">Daily Trending Posts</h2>
                                    <p className="mt-1 text-[11px] font-semibold text-white/35">Most active posts today</p>
                                </div>
                                <span className="rounded-full bg-white/8 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/50">
                                    Live
                                </span>
                            </div>

                            <DashboardRenderBoundary
                                fallback={
                                    <div className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-5 text-sm font-semibold text-white/45">
                                        Trending posts could not be rendered right now.
                                    </div>
                                }
                            >
                                <div className="grid gap-3">
                                    {trendingPosts.map((post) => (
                                        <button
                                            key={post.id}
                                            type="button"
                                            onClick={() => openTrendingPostDetails(post)}
                                            className="group grid grid-cols-[74px_minmax(0,1fr)] gap-3 rounded-xl border border-white/8 bg-white/[0.035] p-2.5 text-left shadow-[0_8px_24px_rgba(0,0,0,0.12)] transition duration-200 hover:-translate-y-0.5 hover:border-white/16 hover:bg-white/[0.055] hover:shadow-[0_16px_34px_rgba(0,0,0,0.22)]"
                                        >
                                            <div className="relative h-[74px] overflow-hidden rounded-lg bg-black/30">
                                                <TrendingPostThumb src={post.image} alt={post.title} />
                                            </div>
                                            <div className="min-w-0 py-0.5">
                                                <h3 className="line-clamp-2 text-[12px] font-black leading-4 text-white">{post.title}</h3>
                                                <p className="mt-1 line-clamp-2 text-[10px] font-medium leading-4 text-white/42">{post.description}</p>
                                                <div className="mt-2 flex items-center gap-3 text-[10px] font-bold text-white/48">
                                                    <span className="inline-flex items-center gap-1">
                                                        <IonIcon name="eye-outline" className="text-[13px]" />
                                                        {post.views}
                                                    </span>
                                                    <span className="inline-flex items-center gap-1">
                                                        <IonIcon name="heart-outline" className="text-[13px]" />
                                                        {post.likes}
                                                    </span>
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </DashboardRenderBoundary>
                        </div>
                    </div>
                </aside>
            </div>

            {openPostMenu && (
                <div
                    className="fixed inset-0 z-[135]"
                    onClick={() => setOpenPostMenu(null)}
                >
                    <div
                        className="absolute w-56 overflow-hidden rounded-2xl border border-white/10 bg-[#1a1a1a] py-2 shadow-[0_22px_70px_rgba(0,0,0,0.45)] animate-in slide-in-from-top-2 duration-200"
                        style={{ top: openPostMenu.top, left: openPostMenu.left }}
                        onClick={(event) => event.stopPropagation()}
                    >
                        {!isOwnWritePost(openPostMenu.post) && (
                            <button
                                type="button"
                                onClick={() => hideGoogFromHome(openPostMenu.post)}
                                className="flex w-full items-center gap-3 px-4 py-3 text-left text-[11px] font-bold text-white transition-colors hover:bg-white/5"
                            >
                                <IonIcon name="eye-off-outline" className="text-lg text-slate-500" />
                                Not Interested
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => {
                                shareWritePost(openPostMenu.post.id);
                                setOpenPostMenu(null);
                            }}
                            className={`flex w-full items-center gap-3 ${!isOwnWritePost(openPostMenu.post) ? "border-t border-white/5" : ""} px-4 py-3 text-left text-[11px] font-bold text-white transition-colors hover:bg-white/5`}
                        >
                            <IonIcon name="share-social-outline" className="text-lg text-blue-400" />
                            Share
                        </button>
                        {!isOwnWritePost(openPostMenu.post) && (
                            <button
                                type="button"
                                onClick={() => openReportModal(openPostMenu.post)}
                                className="flex w-full items-center gap-3 border-t border-white/5 px-4 py-3 text-left text-[11px] font-bold text-white transition-colors hover:bg-white/5"
                            >
                                <IonIcon name="alert-circle-outline" className="text-lg text-yellow-500" />
                                Report
                            </button>
                        )}
                        {isOwnWritePost(openPostMenu.post) && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => editWritePost(openPostMenu.post)}
                                    className="flex w-full items-center gap-3 border-t border-white/5 px-4 py-3 text-left text-[11px] font-bold text-white transition-colors hover:bg-white/5"
                                >
                                    <IonIcon name="create-outline" className="text-lg text-emerald-400" />
                                    Edit
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setPostToDelete(openPostMenu.post);
                                        setOpenPostMenu(null);
                                    }}
                                    className="flex w-full items-center gap-3 border-t border-white/5 px-4 py-3 text-left text-[11px] font-bold text-red-500 transition-colors hover:bg-white/5"
                                >
                                    <IonIcon name="trash-outline" className="text-lg" />
                                    Delete
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}

            {adPreviewModal && (
                <SharedAdSecondViewModal
                    ad={adPreviewModal.ad}
                    kind={adPreviewModal.kind}
                    onClose={() => setAdPreviewModal(null)}
                    onToggleLike={toggleFeedLike}
                    onOpenSheet={(type, target) => adActions.openSheet(type, target)}
                    onShare={(target) => adActions.share(target)}
                    onReport={(ad) => {
                        setReportTargetPost({
                            ...ad,
                            id: ad.id,
                            text: ad.title || ad.description || "",
                            user: { id: ad.user_id, name: getItemUsername(ad, "Sponsored"), img: getItemProfilePicture(ad) || "" },
                            liked: false,
                            likes: ad.likes_count || 0,
                            comments: ad.comments_count || 0,
                            views: ad.views_count || 0,
                            reposts: 0,
                            shares: ad.shares_count || 0,
                        } as WritePost);
                        setReportReason("");
                        setReportCustomReason("");
                        setReportSubmitted(false);
                    }}
                    onNotInterested={hideAdFromHome}
                    onCollectCoin={handleAdCoinClick}
                    onNavigateToProfile={navigateToAdProfile}
                    canShowCollectCoin={canShowAdCollectCoin}
                    requiredWatchSeconds={requiredAdWatchSeconds}
                    onVideoWatchEligible={async (watchedAd, watchedSeconds) => {
                        try {
                            await marketService.markAdVideoWatchEligible(String(getSponsoredCollectionId(watchedAd?.raw || watchedAd)), watchedSeconds);
                        } catch (error) {
                            console.error("Failed to confirm ad watch eligibility:", error);
                        }
                        const adId = String(getSponsoredCollectionId(watchedAd?.raw || watchedAd));
                        if (adId) {
                            setHomeCoinReadyAdIds((prev) => {
                                const next = new Set(prev);
                                next.add(adId);
                                return next;
                            });
                        }
                    }}
                />
            )}

            {productAdModal && (
                <ShopProductSecondViewModal
                    product={productAdModal}
                    activeTab="market"
                    currentUser={currentUser}
                    initialSizeError={productAdSizeError}
                    onClose={() => {
                        setProductAdSizeError(false);
                        setProductAdModal(null);
                    }}
                    onNavigateToProfile={(event, product) => navigateToAdProfile(event, product)}
                    showSubscribeForProduct={(product) => String(currentUser?.id || "") !== String(product.user_id || "")}
                    getSellerId={(product) => String(product.user_id || "")}
                    onSubscribeSeller={(event, product) => navigateToAdProfile(event, product)}
                    onToggleLike={(target) => toggleFeedLike(target)}
                    onLogView={(id) => viewFeedItem({ ...productAdModal, id })}
                    onOpenSheet={(type) => openMarketAdSheet(type as SheetType, productAdModal)}
                    onShare={() => shareFeedItem(productAdModal)}
                    onReport={() => {
                        setReportTargetPost({
                            ...productAdModal,
                            id: productAdModal.id,
                            text: productAdModal.title || productAdModal.description || "",
                            user: { id: productAdModal.user_id, name: getItemUsername(productAdModal, "Sponsored"), img: getItemProfilePicture(productAdModal) || "" },
                            liked: false,
                            likes: productAdModal.likes_count || 0,
                            comments: productAdModal.comments_count || 0,
                            views: productAdModal.views_count || 0,
                            reposts: 0,
                            shares: productAdModal.shares_count || 0,
                        } as WritePost);
                        setReportReason("");
                        setReportCustomReason("");
                        setReportSubmitted(false);
                    }}
                    onNotInterested={hideAdFromHome}
                    onCollectCoin={(event, product) => handleAdCoinClick(event, product)}
                    canShowCollectCoin={canShowAdCollectCoin}
                    onSizeRequired={() => setNotification({ type: "error", title: "Size is required", message: "Size is required" })}
                    onAddToBag={async (product, quantity, variant, size, country, variantIndex) => {
                        if (!authService.isAuthenticated() || !currentUser?.id) {
                            openLoginRequired({ message: "Please log in to buy items." });
                            return;
                        }
                        await addToCart(product, quantity, size || variant?.size || null, variant?.color || null, variantIndex, country);
                        setProductAdSizeError(false);
                        setNotification({ type: "success", title: "Added to Bag", message: `${product.title} has been added to your shopping bag.` });
                    }}
                />
            )}

            <AdExpiryWarning userId={currentUser?.id} />

            {showAdExpiryPopup && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                    <div className="relative w-full max-w-sm rounded-[2rem] border border-white/10 bg-[#1a1614] p-6 shadow-[0_32px_80px_rgba(0,0,0,0.6)]">
                        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-400/10 border border-orange-400/20">
                            <IonIcon name="timer-outline" className="text-xl text-orange-300" />
                        </div>
                        <h2 className="text-base font-black tracking-tight text-white">Your ad has been removed</h2>
                        <p className="mt-2 text-[12px] leading-relaxed text-white/55">
                            Your Photo &amp; Video ad expired and has been removed from the feed. Get a subscription package to keep your ads running longer.
                        </p>
                        <div className="mt-5 flex flex-col gap-2">
                            <button
                                type="button"
                                onClick={() => { setShowAdExpiryPopup(false); router.push("/wallet/subscription"); }}
                                className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-orange-400 text-[11px] font-black uppercase tracking-widest text-black transition hover:bg-orange-300 active:scale-[0.98]"
                            >
                                <IonIcon name="star-outline" className="text-sm" />
                                Get Subscription
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowAdExpiryPopup(false)}
                                className="flex h-10 w-full items-center justify-center rounded-xl text-[11px] font-black uppercase tracking-widest text-white/40 transition hover:text-white/70"
                            >
                                Dismiss
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ShareModal
                isOpen={showGoogShareModal}
                onClose={() => setShowGoogShareModal(false)}
                title={shareGoogPost?.text || "Goog post"}
                url={shareGoogPost ? getShareUrlForItem(shareGoogPost, "goog") : ""}
                description={shareGoogPost?.user ? `Goog by ${getUserDisplayName(shareGoogPost.user, "User")}` : "Goog post"}
                product={shareGoogPost ? { ...shareGoogPost, id: `goog-${shareGoogPost.id}` } : null}
                initialView="share"
                onCopyLink={handleGoogCopyLink}
            />

            <ShareModal
                isOpen={showAdShareModal}
                onClose={() => setShowAdShareModal(false)}
                title={shareAdItem?.title || "Sponsored post"}
                url={shareAdItem ? getShareUrlForItem(shareAdItem, getFeedShareType(shareAdItem)) : ""}
                description={shareAdItem?.description || `Sponsored by ${getItemUsername(shareAdItem, "Ad")}`}
                product={shareAdItem ? { ...shareAdItem, is_sponsored: true } : null}
                initialView="share"
                onCopyLink={handleAdCopyLink}
            />

            <ShareModal
                isOpen={showUploadShareModal}
                onClose={() => setShowUploadShareModal(false)}
                title={shareUploadItem?.topic || "Upload content"}
                url={shareUploadItem ? getShareUrlForItem(shareUploadItem, "upload") : ""}
                description={shareUploadItem?.description || "Upload content"}
                product={shareUploadItem ? {
                    ...shareUploadItem,
                    id: `upload-${shareUploadItem.id}`,
                    title: shareUploadItem.topic || "Upload content",
                    image_url: shareUploadItem.media_preview || shareUploadItem.thumbnail_url || shareUploadItem.media_gallery?.[0] || "",
                } : null}
                initialView={uploadShareInitialView}
            />

            <InteractionBottomSheet
                isOpen={isPostSheetOpen}
                onClose={() => {
                    setIsPostSheetOpen(false);
                    setInteractionPost(null);
                }}
                type={postSheetType}
                product={interactionPost ? { ...interactionPost, id: `goog-${interactionPost.id}`, title: "Goog post", image_url: interactionPost.user.img } : null}
                data={postSheetData}
                onAddComment={addWritePostComment}
                onDeleteComment={async (commentId) => {
                    if (!interactionPost) return;
                    try {
                        await googService.deleteComment(commentId);
                        const data = await googService.getComments(interactionPost.id);
                        setPostSheetData(data);
                        setPosts((currentPosts) =>
                            currentPosts.map((post) => post.id === interactionPost.id ? { ...post, comments: Math.max(0, post.comments - 1) } : post),
                        );
                    } catch (error) {
                        console.error("Failed to delete Goog comment:", error);
                    }
                }}
                onReportComment={async (commentId) => {
                    try {
                        await googService.reportComment(Number(commentId));
                        addTopbarNotification({ type: "success", title: "Reported", message: "Comment has been reported for review." });
                    } catch (e: any) {
                        const msg = e?.message || "";
                        addTopbarNotification({ type: "info", title: msg.includes("Already") ? "Already Reported" : "Error", message: msg.includes("Already") ? "You have already reported this comment." : "Could not submit report." });
                    }
                }}
                onRefresh={refreshWritePostSheet}
                onTabChange={(type) => {
                    if (interactionPost) openWritePostSheet(type, interactionPost);
                }}
                onAction={(action) => {
                    if (!interactionPost) return;
                    if (action === "star") toggleWriteLike(interactionPost.id);
                    if (action === "share" || action === "forward" || action === "upload") shareWritePost(interactionPost.id);
                }}
                currentUser={currentUser}
                isLoading={false}
            />

            <InteractionBottomSheet
                isOpen={isAdSheetOpen}
                onClose={() => {
                    setIsAdSheetOpen(false);
                    setInteractionAd(null);
                }}
                type={adSheetType}
                product={interactionAd}
                data={adSheetData}
                onTabChange={(type) => {
                    if (interactionAd) void openMarketAdSheet(type, interactionAd);
                }}
                onAddComment={addAdComment}
                onDeleteComment={async (commentId) => {
                    if (!interactionAd) return;
                    try {
                        await marketService.deleteComment(commentId);
                        const data = await marketService.getComments(interactionAd.id);
                        setAdSheetData(data || []);
                        updateAdState(interactionAd, (prev) => ({ comments_count: Math.max(0, (prev.comments_count || 0) - 1) }));
                    } catch (error) {
                        console.error("Failed to delete ad comment:", error);
                    }
                }}
                onLikeComment={async (commentId) => {
                    try {
                        await marketService.likeComment(Number(commentId));
                    } catch (error) {
                        console.error("Failed to like ad comment:", error);
                    }
                }}
                onDislikeComment={async (commentId) => {
                    try {
                        await marketService.dislikeComment(Number(commentId));
                    } catch (error) {
                        console.error("Failed to dislike ad comment:", error);
                    }
                }}
                onReportComment={async (commentId) => {
                    try {
                        await marketService.reportComment(Number(commentId));
                        addTopbarNotification({ type: "success", title: "Reported", message: "Comment has been reported for review." });
                    } catch (e: any) {
                        const msg = e?.message || "";
                        addTopbarNotification({ type: "info", title: msg.includes("Already") ? "Already Reported" : "Error", message: msg.includes("Already") ? "You have already reported this comment." : "Could not submit report." });
                    }
                }}
                onRefresh={refreshAdSheet}
                onAction={(action) => {
                    if (!interactionAd) return;
                    if (action === "star") toggleFeedLike(interactionAd.id);
                    if (action === "share" || action === "forward" || action === "upload") shareFeedItem(interactionAd);
                }}
                currentUser={currentUser}
                isLoading={isAdSheetLoading}
            />

            <InteractionBottomSheet
                isOpen={isUploadSheetOpen}
                onClose={() => {
                    setIsUploadSheetOpen(false);
                    setInteractionUpload(null);
                }}
                type={uploadSheetType}
                product={interactionUpload ? {
                    ...interactionUpload,
                    id: `upload-${interactionUpload.id}`,
                    title: interactionUpload.topic || "Upload content",
                    image_url: interactionUpload.media_preview || interactionUpload.thumbnail_url || interactionUpload.media_gallery?.[0] || "",
                } : null}
                data={uploadSheetData}
                onTabChange={(type) => {
                    if (interactionUpload) void openUploadSheet(type, interactionUpload);
                }}
                onAddComment={async (comment, parentId) => {
                    if (!interactionUpload || !comment.trim()) return;
                    if (!authService.isAuthenticated() || !currentUser?.id) {
                        openLoginRequired({ message: "Please log in to comment on upload content." });
                        return;
                    }
                    try {
                        const commentData = await uploadContentService.addComment(interactionUpload.id, comment.trim(), parentId);
                        setUploadSheetData((current) => [...current, {
                            ...commentData,
                            username: currentUser?.username || commentData?.username || "You",
                            profile_picture: currentUser?.profile_picture ?? commentData?.profile_picture,
                        }]);
                        updateUploadFeedItem(interactionUpload.id, (entry) => ({
                            ...entry,
                            comments_count: Number(entry.comments_count ?? entry.commentCount ?? 0) + 1,
                            commentCount: Number(entry.comments_count ?? entry.commentCount ?? 0) + 1,
                        }));
                        setInteractionUpload((current) => current ? {
                            ...current,
                            comments_count: Number(current.comments_count ?? current.commentCount ?? 0) + 1,
                            commentCount: Number(current.comments_count ?? current.commentCount ?? 0) + 1,
                        } : current);
                    } catch (error) {
                        console.error("Failed to add upload content comment:", error);
                    }
                }}
                onDeleteComment={async (commentId) => {
                    if (!interactionUpload) return;
                    try {
                        const result = await uploadContentService.deleteComment(commentId);
                        const deletedCount = Math.max(1, Number(result?.deletedCount || 1));
                        setUploadSheetData((current) => current.filter((comment) => comment.id !== commentId && comment.parent_id !== commentId));
                        updateUploadFeedItem(interactionUpload.id, (entry) => ({
                            ...entry,
                            comments_count: Math.max(0, Number(entry.comments_count ?? entry.commentCount ?? 0) - deletedCount),
                            commentCount: Math.max(0, Number(entry.comments_count ?? entry.commentCount ?? 0) - deletedCount),
                        }));
                        setInteractionUpload((current) => current ? {
                            ...current,
                            comments_count: Math.max(0, Number(current.comments_count ?? current.commentCount ?? 0) - deletedCount),
                            commentCount: Math.max(0, Number(current.comments_count ?? current.commentCount ?? 0) - deletedCount),
                        } : current);
                    } catch (error) {
                        console.error("Failed to delete upload content comment:", error);
                    }
                }}
                onLikeComment={async (commentId) => {
                    try {
                        await uploadContentService.likeComment(Number(commentId));
                        if (interactionUpload) setUploadSheetData(await uploadContentService.getComments(interactionUpload.id));
                    } catch (error) {
                        console.error("Failed to like upload content comment:", error);
                    }
                }}
                onDislikeComment={async (commentId) => {
                    try {
                        await uploadContentService.dislikeComment(Number(commentId));
                        if (interactionUpload) setUploadSheetData(await uploadContentService.getComments(interactionUpload.id));
                    } catch (error) {
                        console.error("Failed to dislike upload content comment:", error);
                    }
                }}
                onReportComment={async (commentId) => {
                    try {
                        await uploadContentService.reportComment(Number(commentId));
                        addTopbarNotification({ type: "success", title: "Reported", message: "Comment has been reported for review." });
                    } catch (e: any) {
                        const msg = e?.message || "";
                        addTopbarNotification({ type: "info", title: msg.includes("Already") ? "Already Reported" : "Error", message: msg.includes("Already") ? "You have already reported this comment." : "Could not submit report." });
                    }
                }}
                onRefresh={async () => {
                    if (!interactionUpload) return;
                    if (uploadSheetType === "comments") {
                        setUploadSheetData(await uploadContentService.getComments(interactionUpload.id));
                    } else if (uploadSheetType === "likes") {
                        setUploadSheetData(await uploadContentService.getLikes(interactionUpload.id));
                    } else if (uploadSheetType === "shares") {
                        setUploadSheetData(await uploadContentService.getShares(interactionUpload.id));
                    } else if (uploadSheetType === "views") {
                        setUploadSheetData(await uploadContentService.getViews(interactionUpload.id));
                    }
                }}
                onAction={(action) => {
                    if (!interactionUpload) return;
                    if (action === "star") void handleUploadLike(interactionUpload);
                    if (action === "share" || action === "forward" || action === "upload") void handleUploadShare(interactionUpload);
                }}
                currentUser={currentUser}
                isLoading={isUploadSheetLoading}
            />

            {pendingAdCoinAd && (
                <div
                    className="fixed inset-0 z-[145] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
                    onClick={() => setPendingAdCoinAd(null)}
                >
                    <div
                        className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#211d1a] shadow-[0_30px_90px_rgba(0,0,0,0.48)]"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="border-b border-white/8 px-6 py-5">
                            <div className="flex items-center gap-3">
                                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-yellow-500 text-lg font-black text-black shadow-[0_10px_24px_rgba(250,204,21,0.35)]">
                                    R
                                </div>
                                <div>
                                    <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">
                                        Collect Ad Coin
                                    </h3>
                                    <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/40">
                                        One-time warning
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="px-6 py-5">
                            <p className="text-sm font-semibold leading-6 text-white/75">
                                If you collect this coin, you will not be able to unlike this ad later.
                            </p>

                            <div className="mt-6 flex items-center justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setPendingAdCoinAd(null)}
                                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-white/70 transition hover:bg-white/10 hover:text-white"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (typeof window !== "undefined") {
                                            localStorage.setItem(`googer-ad-coin-warning-${currentUser?.id}`, "1");
                                        }
                                        collectAdCoin(pendingAdCoinAd);
                                    }}
                                    className="rounded-full bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-black transition hover:bg-slate-200 active:scale-95"
                                >
                                    Collect
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {postToDelete && (
                <div
                    className="fixed inset-0 z-[146] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
                    onClick={() => setPostToDelete(null)}
                >
                    <div
                        className="w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-[#211d1a] shadow-[0_30px_90px_rgba(0,0,0,0.48)]"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="border-b border-white/8 px-6 py-5">
                            <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">Delete Goog</h3>
                            <p className="mt-2 text-sm font-semibold leading-6 text-white/60">
                                Are you sure you want to delete this post?
                            </p>
                        </div>
                        <div className="flex items-center justify-end gap-3 px-6 py-5">
                            <button
                                type="button"
                                onClick={() => setPostToDelete(null)}
                                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-white/70 transition hover:bg-white/10 hover:text-white"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={deleteWritePost}
                                className="rounded-full bg-red-600 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-white transition hover:bg-red-500 active:scale-95"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {reportTargetUpload && (
                <div
                    className="fixed inset-0 z-[147] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm"
                    onClick={() => !uploadReportSubmitting && setReportTargetUpload(null)}
                >
                    <div
                        className="w-full max-w-[340px] overflow-hidden rounded-2xl border border-white/10 bg-[#15161a] shadow-[0_30px_90px_rgba(0,0,0,0.48)]"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="border-b border-white/8 px-4 py-3">
                            <div className="flex items-center gap-2">
                                <IonIcon name="flag-outline" className="text-base text-red-300" />
                                <h3 className="text-[12px] font-black text-white">Why are you reporting this?</h3>
                            </div>
                        </div>

                        {uploadReportSubmitted ? (
                            <div className="flex flex-col items-center gap-3 px-5 py-8 text-center">
                                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
                                    <IonIcon name="checkmark-circle" className="text-2xl" />
                                </div>
                                <div>
                                    <p className="text-[12px] font-black text-white">Report submitted successfully</p>
                                    <p className="mt-1 text-[11px] font-semibold text-white/50">We&apos;ll review this content shortly.</p>
                                </div>
                            </div>
                        ) : (
                            <div className="px-4 py-4">
                                <div className="grid gap-2">
                                    {["Copyright Violation", "Spam / Scam Content", "Inappropriate Content", "Fake or Fraud Content", "Misleading or Not as Described", "Other"].map((reason) => (
                                        <button
                                            key={reason}
                                            type="button"
                                            onClick={() => setUploadReportReason(reason)}
                                            className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-[11px] font-bold transition-all ${
                                                uploadReportReason === reason
                                                    ? "border-red-300/45 bg-red-300/10 text-red-100"
                                                    : "border-white/8 bg-white/[0.03] text-white/70 hover:border-white/15 hover:bg-white/[0.06]"
                                            }`}
                                        >
                                            <span className={`h-3.5 w-3.5 shrink-0 rounded-full border-2 transition-all ${uploadReportReason === reason ? "border-red-300 bg-red-300" : "border-white/30"}`} />
                                            {reason}
                                        </button>
                                    ))}
                                </div>
                                {uploadReportReason === "Other" && (
                                    <textarea
                                        value={uploadReportCustomReason}
                                        onChange={(event) => setUploadReportCustomReason(event.target.value)}
                                        placeholder="Add details"
                                        rows={2}
                                        className="mt-3 w-full resize-none rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5 text-[11px] font-medium text-white placeholder:text-white/25 outline-none transition-colors focus:border-white/20"
                                    />
                                )}
                                {uploadReportError && (
                                    <p className="mt-3 text-[11px] font-bold text-red-300">{uploadReportError}</p>
                                )}
                                <div className="mt-4 flex items-center justify-end gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setReportTargetUpload(null)}
                                        className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-white/70 transition hover:bg-white/10"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={submitUploadReport}
                                        disabled={!uploadReportReason || uploadReportSubmitting}
                                        className="rounded-full bg-red-300 px-4 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-black transition hover:bg-red-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                        {uploadReportSubmitting ? "Submitting..." : "Submit"}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {reportTargetPost && (
                <div
                    className="fixed inset-0 z-[147] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
                    onClick={() => !reportSubmitting && setReportTargetPost(null)}
                >
                    <div
                        className="w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-[#211d1a] shadow-[0_30px_90px_rgba(0,0,0,0.48)]"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="border-b border-white/8 px-5 py-4">
                            <div className="flex items-center gap-2">
                                <IonIcon name="alert-circle-outline" className="text-lg text-yellow-500" />
                                <h3 className="text-[13px] font-black uppercase tracking-[0.14em] text-white">Report Post</h3>
                            </div>
                            <p className="mt-1.5 text-[11px] font-medium text-white/50">
                                Help us understand what&apos;s wrong with this post.
                            </p>
                        </div>

                        {reportSubmitted ? (
                            <div className="flex flex-col items-center gap-3 px-5 py-8">
                                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                                    <IonIcon name="checkmark-circle" className="text-2xl" />
                                </div>
                                <p className="text-[12px] font-bold text-white/70">Report submitted. Thank you.</p>
                            </div>
                        ) : (
                            <div className="px-5 py-4">
                                <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.1em] text-white/40">Select a reason</p>
                                <div className="grid gap-2">
                                    {["Spam or misleading", "Harassment or bullying", "Hate speech or graphic", "Inappropriate content", "Other"].map((reason) => (
                                        <button
                                            key={reason}
                                            type="button"
                                            onClick={() => setReportReason(reason)}
                                            className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 text-left text-[11px] font-bold transition-all ${reportReason === reason
                                                    ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-400"
                                                    : "border-white/8 bg-white/[0.03] text-white/70 hover:border-white/15 hover:bg-white/[0.06]"
                                                }`}
                                        >
                                            <div className={`h-3.5 w-3.5 shrink-0 rounded-full border-2 transition-all ${reportReason === reason ? "border-yellow-400 bg-yellow-400" : "border-white/30"}`} />
                                            {reason}
                                        </button>
                                    ))}
                                </div>

                                <textarea
                                    value={reportCustomReason}
                                    onChange={(e) => setReportCustomReason(e.target.value)}
                                    placeholder="Additional details (optional)"
                                    rows={2}
                                    className="mt-3 w-full resize-none rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5 text-[11px] font-medium text-white placeholder:text-white/25 outline-none focus:border-white/20 transition-colors"
                                />

                                {reportError && (
                                    <p className="mt-3 text-[11px] font-bold text-red-400">{reportError}</p>
                                )}

                                <div className="mt-4 flex items-center justify-end gap-2.5">
                                    <button
                                        type="button"
                                        onClick={() => setReportTargetPost(null)}
                                        className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-white/70 transition hover:bg-white/10"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={submitReport}
                                        disabled={!reportReason || reportSubmitting}
                                        className="rounded-full bg-yellow-500 px-4 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-black transition hover:bg-yellow-400 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                        {reportSubmitting ? "Submitting..." : "Submit"}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

        </main>
        </>
    );
}
