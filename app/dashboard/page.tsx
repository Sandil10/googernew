"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import IonIcon from "@/app/components/IonIcon";
import { marketService } from "@/services/marketService";
import { googService } from "@/services/googService";
import ShareModal from "@/app/components/ShareModal";
import InteractionBottomSheet from "@/app/components/InteractionBottomSheet";
import { InteractionButton } from "@/app/components/InteractionButton";
import SubscribeButton from "@/app/components/SubscribeButton";
import { PromotedAdCard } from "@/app/components/ads/PromotedAdCard";
import { ProfilePromoteCarousel } from "@/app/components/ads/ProfilePromoteCarousel";
import { SharedAdSecondViewModal } from "@/app/components/ads/SharedAdSecondViewModal";
import { ShopProductSecondViewModal } from "@/app/components/market/ShopProductSecondViewModal";
import { canShowCollectCoinButton, useAdActions } from "@/app/lib/ads/useAdActions";
import { resolveProductPromoteProduct } from "@/app/lib/ads/resolveProductPromoteProduct";
import { useAdStore } from "@/app/lib/ads/adStore";
import { normalizeAdData } from "@/app/lib/ads/adNormalizer";
import { getAdInteractionId } from "@/app/lib/ads/adIdentity";
import { formatRelativeTime } from "@/app/lib/relativeTime";
import { getShareUrlForItem } from "@/app/lib/shareLinks";
import { getItemProfilePicture, getItemUsername } from "@/app/lib/userDisplay";
import { useCart } from "@/app/context/CartContext";
import { GoogCard, type WritePost } from "@/app/components/googs/GoogCard";
import {
    AVATAR_IMAGE_SIZES,
    FEED_IMAGE_BLUR_DATA_URL,
    HOME_FEED_IMAGE_SIZES,
    normalizeMediaSrc,
    shouldBypassNextImageOptimization,
} from "@/app/lib/mediaOptimization";

// Type definition moved to GoogCard.tsx

type SheetType = "likes" | "comments" | "shares" | "views";

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
    if (previewType === "image") return activeLink;

    const gallery = Array.isArray(ad?.media_gallery)
        ? ad.media_gallery
        : Array.isArray(safeParse(ad?.media_gallery))
            ? safeParse(ad?.media_gallery)
            : [];

    const value = [ad?.image_url, ad?.media_preview, ...gallery].find((item) => String(item || "").trim());
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

function shuffleItems<T>(items: T[]) {
    return [...items].sort(() => Math.random() - 0.5);
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
) {
    if (!ads.length) return posts.map((post) => ({ type: "write" as const, post }));
    const rotatedAds = getStableAdOrder(ads, storageKey, stableOrderRef);
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
            const ad = rotatedAds[adIndex];
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
        views_count: Number(ad?.views_count || ad?.impressions || 0),
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
    const searchParams = useSearchParams();
    const router = useRouter();
    const { addToCart } = useCart();
    const composeMode = searchParams?.get("compose");
    const composeSectionRef = useRef<HTMLDivElement | null>(null);
    const [homeAdOrder] = useState<Record<string, string[]>>({});
    const [postText, setPostText] = useState("");
    const [posts, setPosts] = useState<WritePost[]>([]);
    const [ads, setAds] = useState<any[]>([]);
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
    const [showGoogShareModal, setShowGoogShareModal] = useState(false);
    const [shareGoogPost, setShareGoogPost] = useState<WritePost | null>(null);
    const [showAdShareModal, setShowAdShareModal] = useState(false);
    const [shareAdItem, setShareAdItem] = useState<any | null>(null);
    const [adPreviewModal, setAdPreviewModal] = useState<{ ad: any; kind: "image" | "video" | "embed" } | null>(null);
    const [productAdModal, setProductAdModal] = useState<any | null>(null);
    const [productAdSizeError, setProductAdSizeError] = useState(false);
    const [notification, setNotification] = useState<{ type: "error" | "success"; message: string; title?: string } | null>(null);
    const [isAdSheetOpen, setIsAdSheetOpen] = useState(false);
    const [adSheetType, setAdSheetType] = useState<SheetType>("comments");
    const [interactionAd, setInteractionAd] = useState<any | null>(null);
    const [adSheetData, setAdSheetData] = useState<any[]>([]);
    const [isAdSheetLoading, setIsAdSheetLoading] = useState(false);
    const [isPostSheetOpen, setIsPostSheetOpen] = useState(false);
    const [postSheetType, setPostSheetType] = useState<SheetType>("comments");
    const [interactionPost, setInteractionPost] = useState<WritePost | null>(null);
    const [postSheetData, setPostSheetData] = useState<any[]>([]);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [reportTargetPost, setReportTargetPost] = useState<WritePost | null>(null);
    const [reportReason, setReportReason] = useState("");
    const [reportCustomReason, setReportCustomReason] = useState("");
    const [reportSubmitting, setReportSubmitting] = useState(false);
    const [reportSubmitted, setReportSubmitted] = useState(false);

    const syncAdOwnerProfile = (ad: any, user: any) => {
        if (!ad || !user?.id) return ad;
        const ownerId = ad.user_id || ad.owner_user_id || ad.owner_id;
        if (String(ownerId) !== String(user.id)) return ad;

        return {
            ...ad,
            user: { ...(ad.user || {}), id: ownerId, username: user.username || ad.user?.username, profile_picture: user.profile_picture ?? ad.user?.profile_picture },
        };
    };

    const syncWritePostProfile = (post: WritePost, user: any): WritePost => {
        if (!post || !user?.id) return post;
        if (String(post.user.id) !== String(user.id)) return post;

        return {
            ...post,
            user: {
                ...post.user,
                username: user.username || post.user.username,
                name: user.full_name || user.username || post.user.name,
                img: user.profile_picture || post.user.img,
            },
        };
    };
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
    const liveHomeAds = useMemo(
        () => dedupeAdsByIdentity(ads.map((ad) => getHomeLiveAd(ad))),
        [ads, getHomeLiveAd],
    );
    const homeProfilePromoteAds = useMemo(
        () => liveHomeAds.filter((ad) => ad.campaign_type === "Profile Promote"),
        [liveHomeAds],
    );
    const homeFeedItems = useMemo(() => {
        const nonProfilePromoteAds = liveHomeAds.filter((ad) => ad.campaign_type !== "Profile Promote");
        const mixedItems = interleaveWritePostsWithAds(posts, nonProfilePromoteAds, "googer-home-ad-rotation-v1", { current: homeAdOrder }, 4);
        if (!homeProfilePromoteAds.length) return mixedItems;
        const insertIndex = Math.min(4, mixedItems.length);
        return [
            ...mixedItems.slice(0, insertIndex),
            { type: "profilePromoteCarousel" as const, ads: homeProfilePromoteAds },
            ...mixedItems.slice(insertIndex),
        ];
    }, [homeAdOrder, homeProfilePromoteAds, liveHomeAds, posts]);
    const trendingPosts = useMemo<TrendingPost[]>(() => {
        const adTrends = liveHomeAds.slice(0, 5).map((ad) => {
            const activeLink = normalizeExternalUrl(ad.active_link || "");
            const previewType = getSponsoredLinkPreviewType(activeLink);
            return {
                id: `ad-${ad.id}`,
                title: String(ad.title || "Sponsored highlight").slice(0, 64),
                description: String(ad.description || ad.category || "Popular sponsored post").slice(0, 110),
                image: getAdPreviewImage(ad, previewType),
                views: Number(ad.views_count || ad.impressions || 0),
                likes: Number(ad.likes_count || 0),
                source: "ad" as const,
                payload: ad,
            };
        });

        const writeTrends = posts.slice(0, Math.max(0, 6 - adTrends.length)).map((post) => ({
            id: `write-${post.id}`,
            title: post.text.length > 48 ? `${post.text.slice(0, 48)}...` : post.text,
            description: `By ${post.user.name}`,
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
        let mounted = true;
        const getPublicActiveAds = async () => {
            const token = typeof localStorage !== "undefined" ? localStorage.getItem("token") : null;
            const response = await fetch("/api/ads/active-public", {
                cache: "no-store",
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data?.message || "Failed to fetch active ads");
            return (Array.isArray(data?.ads) ? data.ads : []).map(mapPublicActiveAdToHomeAd).filter(isHomeSponsoredAd);
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
        loadAds();

        return () => {
            mounted = false;
        };
    }, []);

    // Force periodic re-render so time labels (New → 2h → 3h ...) update in real-time
    useEffect(() => {
        const interval = setInterval(() => setTick((t) => t + 1), 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        let mounted = true;

        const loadGoogPosts = async () => {
            try {
                const data = await googService.getPosts();
                if (mounted) {
                    setPosts(data);
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
    }, []);

    useEffect(() => {
        const handleSubscriptionUpdate = () => {
            setAds(currentAds => [...currentAds]);
            setPosts(currentPosts => [...currentPosts]);
        };

        window.addEventListener("googer-subscription-updated", handleSubscriptionUpdate);
        return () => window.removeEventListener("googer-subscription-updated", handleSubscriptionUpdate);
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") return;
        try {
            const storedUser = JSON.parse(window.localStorage.getItem("user") || "{}");
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
                            likes: Math.max(0, post.likes + (serverLiked === willBeLiked ? 0 : serverLiked ? 1 : -1)),
                        }
                        : post,
                ),
            );
        } catch (error) {
            console.error("Failed to save Goog like:", error);
            setPosts((currentPosts) =>
                currentPosts.map((post) =>
                    post.id === postId
                        ? { ...post, liked: wasLiked, likes: Math.max(0, post.likes + (wasLiked ? 1 : -1)) }
                        : post,
                ),
            );
        }
    };

    const viewWritePost = async (postId: number) => {
        try {
            const result = await googService.logView(postId);
            if (result?.incremented === true) {
                setPosts((currentPosts) =>
                    currentPosts.map((post) => post.id === postId ? { ...post, views: (post.views || 0) + 1 } : post),
                );
            }
        } catch (error) {
            console.error("Failed to save Goog view:", error);
        }
    };

    const shareWritePost = async (postId: number) => {
        const targetPost = posts.find((post) => post.id === postId);
        if (targetPost) {
            setShareGoogPost(targetPost);
            setShowGoogShareModal(true);
        }
    };

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
        setOpenPostMenu(null);
    };

    const submitReport = async () => {
        if (!reportTargetPost || !reportReason) return;
        setReportSubmitting(true);
        try {
            await googService.createReport(reportTargetPost.id, reportReason, reportCustomReason.trim() || undefined);
            setReportSubmitted(true);
            setTimeout(() => {
                setReportTargetPost(null);
                setReportSubmitted(false);
            }, 2200);
        } catch (error) {
            console.error("Failed to report post:", error);
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
            if (!detail?.text) return;
            const newPost = { ...detail, views: detail.views || 0, createdAt: detail.createdAt || new Date().toISOString() };
            setPosts((currentPosts) => currentPosts.some((post) => post.id === detail.id) ? currentPosts : [newPost, ...currentPosts]);
        };

        try {
            const pending = JSON.parse(window.localStorage.getItem("googer-pending-write-post") || "null");
            if (pending?.text) {
                const pendingPost = { ...pending, views: pending.views || 0, createdAt: pending.createdAt || new Date().toISOString() };
                setPosts((currentPosts) => currentPosts.some((post) => post.id === pending.id) ? currentPosts : [pendingPost, ...currentPosts]);
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
        const result = await marketService.logView(item.id);
        if (result?.incremented === true) {
            updateAdState(item, (prev) => ({ views_count: (prev.views_count || 0) + 1 }));
        }
    };

    const getSponsoredCollectionId = (ad: any) => {
        if (!ad?.is_sponsored) return ad?.id;
        return String(ad?.id || "").startsWith("ad-") ? ad.id : (ad?.adId ? `ad-${ad.adId}` : ad?.id);
    };

    const canShowAdCollectCoin = (ad: any) => {
        const raw = ad?.raw || ad || {};
        const mediaType = String(raw.media_type || raw.mediaType || "").toLowerCase();
        const mediaSrc = String(raw.media_preview || raw.video_url || raw.media_url || "");
        const isVideoAd = mediaType === "video" || /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(mediaSrc);
        const collectionId = String(getSponsoredCollectionId(raw));
        if (isVideoAd) {
            return canShowCollectCoinButton(ad, currentUser) && homeCoinReadyAdIds.has(collectionId);
        }
        return canShowCollectCoinButton(ad, currentUser);
    };

    const markAdCoinCollectedLocally = (adId: string | number) => {
        updateAdState(adId, { ad_coin_collected: true, ad_like_locked: true });
    };

    const adActions = useAdActions(null, {
        currentUser,
        canShowCollectCoin: canShowAdCollectCoin,
        // Removed local sync callbacks - useAdActions now updates useAdStore globally
        onShare: (item) => {
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
        onNotify: setNotification,
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
        setAds((currentAds) => currentAds.filter((currentAd) => String(currentAd.id) !== String(adId)));
        setOpenMenuAdId(null);
        setAdPreviewModal(null);
        setProductAdModal(null);
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
        <main className="-mx-3 -my-5 min-h-[calc(100vh-7rem)] bg-[#1c1917] px-3 py-0 text-white sm:-mx-4 md:-mx-8 md:-my-6 md:px-6 lg:min-h-[calc(100vh-5rem)]">
            <div className="mx-auto grid min-h-0 w-full max-w-[1120px] gap-5 py-3 lg:grid-cols-[minmax(0,700px)_380px] lg:items-start">
                <section ref={composeSectionRef} className="hidden" aria-hidden="true">
                    <textarea value={postText} onChange={(event) => setPostText(event.target.value)} />
                    <button type="button" onClick={publishWritePost}>Post</button>
                </section>

                <section className="min-h-0 overflow-hidden rounded-[2rem] border border-white/10 bg-[#211d1a] shadow-[0_18px_60px_rgba(0,0,0,0.24)]">
                    <div className="scrollbar-dark min-h-0 overflow-y-auto rounded-[inherit] pb-20 lg:pb-10">
                        {isLoadingFeed && homeFeedItems.length === 0 ? (
                            <div className="flex items-center justify-center py-20">
                                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-white"></div>
                            </div>
                        ) : null}
                        {homeFeedItems.map((item) => {
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

                            if (item.type === "profilePromoteCarousel") {
                                return (
                                    <ProfilePromoteCarousel
                                        key="profile-promote-carousel"
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
                            }                            const ad = item.ad;
                            const activeLink = normalizeExternalUrl(ad.active_link || "");
                            const previewType = getSponsoredLinkPreviewType(activeLink);

                            return (
                                <article key={String(ad.id)} className="px-4 py-4 transition-colors sm:px-7">
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
                                            onCollectCoin={handleAdCoinClick}
                                            onNavigateToProfile={navigateToAdProfile}
                                            canShowCollectCoin={canShowAdCollectCoin}
                                            currentUser={currentUser}
                                        />
                                    </div>
                                </article>
                            );
                        })}
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
                        <button
                            type="button"
                            onClick={() => setOpenPostMenu(null)}
                            className="flex w-full items-center gap-3 px-4 py-3 text-left text-[11px] font-bold text-white transition-colors hover:bg-white/5"
                        >
                            <IonIcon name="eye-off-outline" className="text-lg text-slate-500" />
                            Not Interested
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                shareWritePost(openPostMenu.post.id);
                                setOpenPostMenu(null);
                            }}
                            className="flex w-full items-center gap-3 border-t border-white/5 px-4 py-3 text-left text-[11px] font-bold text-white transition-colors hover:bg-white/5"
                        >
                            <IonIcon name="share-social-outline" className="text-lg text-blue-400" />
                            Share
                        </button>
                        <button
                            type="button"
                            onClick={() => openReportModal(openPostMenu.post)}
                            className="flex w-full items-center gap-3 border-t border-white/5 px-4 py-3 text-left text-[11px] font-bold text-white transition-colors hover:bg-white/5"
                        >
                            <IonIcon name="alert-circle-outline" className="text-lg text-yellow-500" />
                            Report
                        </button>
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
                    onVideoWatchEligible={(watchedAd) => {
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
                        await addToCart(product, quantity, size || variant?.size || null, variant?.color || null, variantIndex, country);
                        setProductAdSizeError(false);
                        setNotification({ type: "success", title: "Added to Bag", message: `${product.title} has been added to your shopping bag.` });
                    }}
                />
            )}

            {notification && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-[#1a1a1a] border border-white/10 rounded-[2rem] w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 relative">
                        <button
                            onClick={() => setNotification(null)}
                            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all active:scale-90 z-10"
                            aria-label="Close"
                        >
                            <IonIcon name="close" className="text-base" />
                        </button>
                        <div className="p-8 text-center space-y-6">
                            <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center border-2 ${notification.type === "success" ? "bg-green-500/10 border-green-500 text-green-500" : "bg-red-500/10 border-red-500 text-red-500"}`}>
                                <IonIcon name={notification.type === "success" ? "bag-check" : "alert-circle"} className="text-4xl" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-xl font-bold text-white tracking-tight">{notification.title || (notification.type === "success" ? "Success" : "Error")}</h3>
                                <p className="text-sm text-slate-400 font-medium leading-relaxed">{notification.message}</p>
                            </div>
                            <button
                                onClick={() => setNotification(null)}
                                className={`w-full py-4 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all active:scale-95 shadow-lg ${notification.type === "success" ? "bg-green-500 text-black hover:bg-green-400" : "bg-red-500 text-white hover:bg-red-400"}`}
                            >
                                {notification.type === "success" ? "Continue Shopping" : "Got it"}
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
                description={shareGoogPost?.user?.name ? `Goog by ${shareGoogPost.user.name}` : "Goog post"}
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
                    } catch (error) {
                        console.error("Failed to report ad comment:", error);
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
    );
}
