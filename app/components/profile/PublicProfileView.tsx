"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { authService } from "@/services/authService";
import { marketService } from "@/services/marketService";
import { googService } from "@/services/googService";
import { adsService } from "@/services/adsService";
import IonIcon from "@/app/components/IonIcon";
import ShareModal from "@/app/components/ShareModal";
import InteractionBottomSheet from "@/app/components/InteractionBottomSheet";
import { getProfileShareUrl, getShareUrlForItem } from "@/app/lib/shareLinks";
import { GoogCard, type WritePost } from "@/app/components/googs/GoogCard";
import { SharedProductCard } from "@/app/components/market/SharedProductCard";
import { PromotedAdCard } from "@/app/components/ads/PromotedAdCard";
import { normalizeAdData } from "@/app/lib/ads/adNormalizer";
import { useAdStore } from "@/app/lib/ads/adStore";
import { subscriptionService } from "@/services/subscriptionService";
import { addTopbarNotification } from "@/app/lib/topbarNotifications";

type UserRecord = {
    id?: number;
    user_id?: string | number;
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
    profile_views_count?: number;
    following_count?: number;
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
};

const getAdViewTarget = (target: any) => {
    if (!target || typeof target === "string" || typeof target === "number") return target;
    const raw = target.raw || {};
    const adId = target.adId || target.ad_id || raw.adId || raw.ad_id;
    return adId ? `ad-${String(adId).replace(/^ad-/, "")}` : target.id;
};

function formatSubscriberCount(value: number) {
    if (value >= 1000000000) return `${(value / 1000000000).toFixed(1).replace(/\.0$/, "")}B`;
    if (value >= 1000000) return `${(value / 1000000).toFixed(1).replace(/\.0$/, "")}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}K`;
    return `${value}`;
}

function getInitials(name?: string) {
    if (!name) return "G";
    return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || "G";
}

function normalizeUrl(url: string) {
    return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function formatDisplayUrl(url: string) {
    try {
        const parsed = new URL(normalizeUrl(url));
        return `${parsed.hostname}${parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "")}`;
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
            return <a key={index} href={canonicalLink} target="_blank" rel="noreferrer" className="text-sky-400 transition hover:text-sky-300">{formatDisplayUrl(canonicalLink)}</a>;
        }
        if (part.startsWith("@") || part.startsWith("#")) return <span key={index} className="text-sky-400">{part}</span>;
        return <span key={index}>{part}</span>;
    });
}

const BADGE_COLOR_HEX: Record<string, string> = {
    blue:   "#3897F0",
    gold:   "#facc15",
    green:  "#22c55e",
    purple: "#a855f7",
    red:    "#ef4444",
    orange: "#f97316",
    cyan:   "#06b6d4",
    silver: "#94a3b8",
    bronze: "#cd7f32",
    black:  "#3d3d3d",
};
function resolveBadgeColor(color: string): string {
    if (!color) return "#facc15";
    if (BADGE_COLOR_HEX[color]) return BADGE_COLOR_HEX[color];
    if (color.startsWith("#") || color.startsWith("rgb")) return color;
    return "#facc15";
}
const SEAL_PATH = "M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.438 1.69-.882.445-.47.749-1.055.878-1.688.13-.633.08-1.29-.144-1.896.587-.274 1.087-.705 1.443-1.245.356-.54.555-1.17.574-1.817z";

function VerifiedBadgeSvg({ color, tickColor, size = 20 }: { color: string; tickColor?: string | null; size?: number }) {
    const hex = resolveBadgeColor(color);
    const isRed   = hex === '#ef4444';
    const isBlack = hex === '#3d3d3d';
    const shine   = isRed || isBlack;
    const resolvedTickColor = tickColor || (isBlack ? '#ef4444' : isRed ? '#000000' : '#ffffff');
    const id = `spv-${hex.replace('#','')}`;
    return (
        <svg width={size} height={size} viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
            {shine && (
                <defs>
                    <radialGradient id={id} cx="35%" cy="30%" r="60%">
                        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.45" />
                        <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                    </radialGradient>
                </defs>
            )}
            <path d={SEAL_PATH} fill={hex} />
            {shine && <path d={SEAL_PATH} fill={`url(#${id})`} />}
            <path d="M7.5 11l2.5 2.5L15 8.5" stroke={resolvedTickColor} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function PublicProfileView({ user: initialUser, isPublic = true, currentUserId }: { user: UserRecord; isPublic?: boolean; currentUserId?: number | null }) {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<"products" | "googs" | "saved">("products");
    const syncAds = useAdStore((state) => state.syncAds);
    const updateAdState = useAdStore((state) => state.updateAdState);
    const [user, setUser] = useState(initialUser);
    const [posts, setPosts] = useState<PostRecord[]>([]);
    const [googs, setGoogs] = useState<WritePost[]>([]);
    const [savedGoogs, setSavedGoogs] = useState<WritePost[]>([]);
    const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
    const [profileAds, setProfileAds] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [isSubscribed, setIsSubscribed] = useState(!!initialUser.is_subscribed);
    const [subscriberCount, setSubscriberCount] = useState(Number(initialUser.subscriber_count || 0));
    const [showShareModal, setShowShareModal] = useState(false);
    const [shareUrl, setShareUrl] = useState("");
    const [shareTitle, setShareTitle] = useState("Share Profile");
    const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);
    const [isBottomSheetGoog, setIsBottomSheetGoog] = useState(false);
    const [bottomSheetType, setBottomSheetType] = useState<any>("comments");
    const [bottomSheetData, setBottomSheetData] = useState<any[]>([]);
    const [isBottomSheetLoading, setIsBottomSheetLoading] = useState(false);
    const [interactionItem, setInteractionItem] = useState<any>(null);
    const [badge, setBadge] = useState<{ color: string; tickColor?: string | null } | null>(null);
    const [saveToast, setSaveToast] = useState<string | null>(null);
    const [googSavedCount, setGoogSavedCount] = useState(0);
    const [googSaveLimit, setGoogSaveLimit] = useState<number | null>(null);
    const [openGoogMenu, setOpenGoogMenu] = useState<{ post: WritePost; top: number; left: number } | null>(null);

    const profileUserId = Number(user.id || user.user_id || 0) || null;
    const isOwnProfile = !!(currentUserId && profileUserId && currentUserId === profileUserId);

    const getProfileAdId = useCallback((ad: any) => String(ad?.raw?.adId || ad?.raw?.ad_id || ad?.adId || ad?.ad_id || "").replace(/^ad-/, ""), []);

    const mergeActiveAdsWithSavedAds = useCallback((activeAds: any[], savedAds: any[]) => {
        const merged = new Map<string, any>();

        (activeAds || []).forEach((ad) => {
            const adId = getProfileAdId(ad);
            if (adId) merged.set(adId, ad);
        });

        (savedAds || []).forEach((ad) => {
            const adId = getProfileAdId(ad);
            if (!adId) return;
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

    const loadData = useCallback(async () => {
        if (!profileUserId) return;
        try {
            const [userProducts, userGoogs, activeOwnerAds, savedAds, userBadge] = await Promise.all([
                marketService.getItems({ user_id: profileUserId, status: "active,approved" }),
                googService.getUserPosts(profileUserId),
                adsService.getActiveAdsByUser(profileUserId),
                adsService.getPublicSavedAdsByUser(profileUserId),
                subscriptionService.getBadgeForUser(profileUserId),
            ]);

            const ownerAds = isOwnProfile
                ? mergeActiveAdsWithSavedAds(activeOwnerAds || [], savedAds || [])
                : mergeActiveAdsWithSavedAds(activeOwnerAds || [], getPublicCompletedSavedAds(savedAds || []));

            setPosts((userProducts || []).filter((p: any) => !p.is_sponsored && !p.campaign_type));
            const normalizedAds = (ownerAds || []).map(normalizeAdData).filter((ad: any) => ad.type !== 'product');
            setProfileAds(normalizedAds);
            syncAds(normalizedAds);
            setGoogs(userGoogs || []);
            setBadge(userBadge);
        } catch (error) {
            console.error("Error loading profile data:", error);
        }
    }, [getPublicCompletedSavedAds, isOwnProfile, mergeActiveAdsWithSavedAds, profileUserId, syncAds]);

    const loadSavedGoogs = useCallback(async () => {
        if (!isOwnProfile) return;
        try {
            const [saved, ids] = await Promise.all([
                googService.getSavedGoogs(),
                googService.getSavedStatus(),
            ]);
            setSavedGoogs(saved || []);
            setSavedIds(new Set(ids));
        } catch { }
    }, [isOwnProfile]);

    useEffect(() => { if (isOwnProfile) loadSavedGoogs(); }, [loadSavedGoogs, isOwnProfile]);

    useEffect(() => { loadData(); }, [loadData]);

    // Track profile view — only for visitors, not own profile
    useEffect(() => {
        if (!profileUserId || isOwnProfile) return;
        authService.logProfileView(profileUserId).catch(() => {});
    }, [profileUserId, isOwnProfile]);

    // Load viewer's googs save limit and current count
    useEffect(() => {
        if (!currentUserId) return;
        const load = async () => {
            try {
                const [plan, ids] = await Promise.all([
                    subscriptionService.getMyPlan(),
                    googService.getSavedStatus(),
                ]);
                setGoogSaveLimit(plan?.googs_limit !== undefined ? Number(plan.googs_limit) : null);
                setGoogSavedCount(Array.isArray(ids) ? ids.length : 0);
            } catch { }
        };
        void load();
        window.addEventListener('subscription:changed', load);
        return () => window.removeEventListener('subscription:changed', load);
    }, [currentUserId]);

    const handleToggleLike = async (id: number) => {
        try {
            const serverLiked = await marketService.toggleLike(id);
            setPosts(prev => prev.map(p => p.id === id ? { ...p, user_liked: serverLiked, likes_count: (p.likes_count || 0) + (serverLiked ? 1 : -1) } : p));
        } catch { }
    };

    const handleLogView = async (target: any) => {
        try {
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
                setPosts((prev) => prev.map((post) => (
                    post.id === viewId
                        ? { ...post, views_count: (Number(post.views_count || 0) + 1) }
                        : post
                )));
            }
        } catch { }
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

    const handleToggleSave = useCallback(async (googId: number) => {
        const result = await googService.toggleSave(googId);
        if (!result.saved && result.message) {
            setSaveToast(result.message);
            return;
        }
        setSavedIds(prev => {
            const next = new Set(prev);
            if (result.saved) next.add(googId);
            else next.delete(googId);
            return next;
        });
        setGoogSavedCount(prev => result.saved ? prev + 1 : Math.max(0, prev - 1));
        if (!result.saved) {
            setSavedGoogs(prev => prev.filter(g => g.id !== googId));
        }
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
        setGoogs(prev => prev.filter(g => g.id !== post.id));
        try { await googService.deletePost(post.id); } catch {
            setGoogs(prev => [post, ...prev]);
        }
    };

    useEffect(() => {
        if (!saveToast) return;
        addTopbarNotification({
            type: "info",
            title: "Saved Googs",
            message: saveToast,
        });
        setSaveToast(null);
    }, [saveToast]);

    const openBottomSheet = async (type: any, item: any, isGoog = false) => {
        setBottomSheetType(type);
        setInteractionItem(item);
        setIsBottomSheetOpen(true);
        setBottomSheetData([]);
        setIsBottomSheetLoading(true);
        setIsBottomSheetGoog(isGoog);
        try {
            let data = [];
            if (isGoog) {
                if (type === "comments") data = await googService.getComments(item.id);
                else if (type === "likes") data = await googService.getLikes(item.id);
                else if (type === "shares") data = await googService.getShares(item.id);
                else if (type === "views") data = await googService.getViews(item.id);
            } else {
                if (type === "comments") data = await marketService.getComments(item.id);
                else if (type === "likes") data = await marketService.getLikes(item.id);
                else if (type === "shares") data = await marketService.getShares(item.id);
                else if (type === "views") data = await marketService.getViews(item.id);
            }
            setBottomSheetData(data || []);
        } finally { setIsBottomSheetLoading(false); }
    };

    // Interleave profile owner's googs with their own ads (same 1-per-4 ratio as Home feed)
    // If no googs but has ads, show all ads directly
    const googsFeed = useMemo(() => {
        type FeedItem = { type: 'goog'; data: WritePost } | { type: 'ad'; data: any };
        const visibleProfileAds = profileAds;
        if (!isOwnProfile) {
            return [
                ...googs.map((g): FeedItem => ({ type: 'goog', data: g })),
                ...visibleProfileAds.map((a): FeedItem => ({ type: 'ad', data: a })),
            ];
        }
        if (!googs.length) return visibleProfileAds.map((a): FeedItem => ({ type: 'ad', data: a }));
        if (!visibleProfileAds.length) return googs.map((g): FeedItem => ({ type: 'goog', data: g }));
        const result: FeedItem[] = [];
        let adIndex = 0;
        googs.forEach((g, i) => {
            result.push({ type: 'goog', data: g });
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
    }, [googs, isOwnProfile, profileAds]);

    const profileImage = user.profile_picture ? (user.profile_picture.startsWith("http") ? user.profile_picture : `/uploads/${user.profile_picture.split(/[\\/]/).pop()}`) : `https://ui-avatars.com/api/?name=${encodeURIComponent(user.full_name || user.username || "G")}&background=111&color=fff`;
    const bioLines = (user.bio || "").split(/\n+/).filter(Boolean);
    const bioLinks = (user.bio || "").match(/(https?:\/\/[^\s]+|www\.[^\s]+)/gi) || [];
    const normalizedBioLinks = bioLinks.map((link) => getCanonicalProfileLink(link, user.username));

    return (
        <div className="mx-auto max-w-[1280px] pb-24 text-white">
            <div className="px-4 pt-8 md:px-8">
                <div className="flex items-center gap-6">
                    <div className="relative shrink-0">
                        <div className="relative h-20 w-20 overflow-hidden rounded-full border-2 border-white/10 bg-zinc-900 shadow-xl md:h-24 md:w-24">
                            <Image src={profileImage} alt={user.username || ""} fill className="object-cover" unoptimized />
                        </div>
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-1.5">
                            <h1 className="truncate text-2xl font-black tracking-tight md:text-3xl">{user.full_name || user.username}</h1>
                            {badge && (
                                <span className="shrink-0">
                                    <VerifiedBadgeSvg color={badge.color} tickColor={badge.tickColor} size={14} />
                                </span>
                            )}
                        </div>
                        <p className="mt-1 text-zinc-400 font-bold">@{user.username}</p>
                        <div className="mt-2 flex items-center gap-4 text-sm font-bold">
                            <span><span className="text-white">{formatSubscriberCount(subscriberCount)}</span> <span className="text-zinc-500">Googers</span></span>
                            <span><span className="text-white">{formatSubscriberCount(user.following_count || 0)}</span> <span className="text-zinc-500">Following</span></span>
                        </div>
                    </div>
                </div>

                <div className="mt-6 max-w-2xl">
                    <div className="space-y-1 text-sm font-medium leading-relaxed text-zinc-200">
                        {bioLines.length > 0 ? bioLines.map((line, i) => <p key={i}>{renderBioText(line, user.username)}</p>) : <p className="text-zinc-500 italic">No bio provided</p>}
                    </div>
                    <div className="mt-3 flex flex-col gap-1.5">
                        {normalizedBioLinks.slice(0, 2).map((link, i) => (
                            <a key={i} href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-bold text-sky-400 hover:text-sky-300 transition-colors">
                                <IonIcon name="link-outline" />
                                <span className="truncate">{formatDisplayUrl(link)}</span>
                            </a>
                        ))}
                    </div>
                </div>

                <div className="mt-8 flex items-center gap-3">
                    {!isOwnProfile && (
                        <button type="button" className="light-theme-action-border flex-shrink-0 rounded-full border border-white/10 bg-white px-3 py-1 text-[8px] font-black uppercase text-black shadow-lg">
                            Subscribe
                        </button>
                    )}
                    <button onClick={() => { setShareTitle("Share Profile"); setShareUrl(getProfileShareUrl(user)); setShowShareModal(true); }} className="light-theme-action-border flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white transition hover:bg-white/10 active:scale-95">
                        <IonIcon name="share-social-outline" className="text-xl" />
                    </button>
                </div>

                <div className="mt-12 border-b border-white/10">
                    <div className="flex gap-8">
                        <button onClick={() => setActiveTab("products")} className={`pb-4 text-sm font-black uppercase tracking-widest transition-colors ${activeTab === "products" ? "text-white border-b-2 border-white" : "text-zinc-500 hover:text-zinc-300"}`}>Products</button>
                        <button onClick={() => setActiveTab("googs")} className={`pb-4 text-sm font-black uppercase tracking-widest transition-colors ${activeTab === "googs" ? "text-white border-b-2 border-white" : "text-zinc-500 hover:text-zinc-300"}`}>Googs</button>
                        {isOwnProfile && (
                            <button onClick={() => { setActiveTab("saved"); loadSavedGoogs(); }} className={`pb-4 text-sm font-black uppercase tracking-widest transition-colors flex items-center gap-1.5 ${activeTab === "saved" ? "text-amber-400 border-b-2 border-amber-400" : "text-zinc-500 hover:text-zinc-300"}`}>
                                <IonIcon name="bookmark-outline" className="text-base" />
                                Saved
                            </button>
                        )}
                    </div>
                </div>

                <div className="mt-8">
                    {activeTab === "products" && (
                        posts.length > 0 ? (
                            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                                {posts.map((post) => (
                                    <SharedProductCard
                                        key={post.id}
                                        product={post}
                                        currentUser={user}
                                        onProductClick={(product) => router.push(`/shop?id=${product.id}`)}
                                        onAddToBagClick={(product) => router.push(`/shop?id=${product.id}`)}
                                        onToggleLike={(product) => handleToggleLike(product.id)}
                                        onOpenSheet={(type, product) => openBottomSheet(type, product)}
                                        onShare={(product) => {
                                            setShareTitle(product?.title ? `Share ${product.title}` : "Share Product");
                                            setShareUrl(getShareUrlForItem(product, "product"));
                                            setShowShareModal(true);
                                        }}
                                        onLogView={handleLogView}
                                        onNavigateToProfile={() => {
                                            const username = String((post as any)?.user?.username || (post as any)?.username || user.username || "").trim();
                                            if (username) router.push(`/profile/${encodeURIComponent(username)}`);
                                        }}
                                    />
                                ))}
                            </div>
                        ) : <div className="py-20 text-center text-zinc-500 font-bold">No products listed yet.</div>
                    )}

                    {activeTab === "googs" && (
                        googsFeed.length > 0 ? (
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
                                                        onProductClick={() => { }}
                                                        onAddToBagClick={() => { }}
                                                        onOpenSecondView={() => { }}
                                                        onToggleLike={() => { }}
                                                        onOpenSheet={() => { }}
                                                        onShare={() => { }}
                                                        onLogView={handleLogView}
                                                        onReport={() => { }}
                                                        onNotInterested={() => { }}
                                                        onCollectCoin={() => { }}
                                                        canShowCollectCoin={() => false}
                                                        onNavigateToProfile={(_, userId) => {
                                                            if (userId) router.push(`/profile/${userId}`);
                                                        }}
                                                    />
                                                </div>
                                            </article>
                                        );
                                    }
                                    return (
                                        <GoogCard
                                            key={item.data.id}
                                            post={item.data}
                                            showSubscribe={false}
                                            isSaved={savedIds.has(item.data.id)}
                                            saveAtLimit={!savedIds.has(item.data.id) && googSaveLimit !== null && googSavedCount >= googSaveLimit}
                                            onToggleSave={isOwnProfile ? handleToggleSave : undefined}
                                            onNavigateToProfile={() => { }}
                                            onToggleLike={() => handleGoogToggleLike(item.data)}
                                            onOpenSheet={(type, g) => openBottomSheet(type, g, true)}
                                            onToggleMenu={handleToggleGoogMenu}
                                            onViewPost={handleViewGoog}
                                            onSharePost={() => {
                                                setShareTitle("Share Goog");
                                                setShareUrl(getShareUrlForItem(item.data, "goog"));
                                                setShowShareModal(true);
                                                googService.logShare(item.data.id).catch(() => { });
                                            }}
                                        />
                                    );
                                })}
                            </div>
                        ) : (googsFeed.length === 0 ? <div className="py-20 text-center text-zinc-500 font-bold">No Googs posted yet.</div> : null)
                    )}

                    {activeTab === "saved" && isOwnProfile && (
                        savedGoogs.length > 0 ? (
                            <div className="flex flex-col">
                                {savedGoogs.map((g) => (
                                    <GoogCard
                                        key={g.id}
                                        post={g}
                                        showSubscribe={false}
                                        isSaved={true}
                                        onToggleSave={handleToggleSave}
                                        onNavigateToProfile={() => {
                                            const username = String((g as any).user?.username || "").trim();
                                            if (username) router.push(`/profile/${encodeURIComponent(username)}`);
                                        }}
                                        onToggleLike={() => handleGoogToggleLike(g)}
                                        onOpenSheet={(type, goog) => openBottomSheet(type, goog, true)}
                                        onSharePost={() => {
                                            setShareTitle("Share Goog");
                                            setShareUrl(getShareUrlForItem(g, "goog"));
                                            setShowShareModal(true);
                                            googService.logShare(g.id).catch(() => { });
                                        }}
                                    />
                                ))}
                            </div>
                        ) : (
                            <div className="py-20 text-center text-zinc-500">
                                <IonIcon name="bookmark-outline" className="text-4xl mb-3 block mx-auto opacity-30" />
                                <p className="font-bold text-sm">No saved Googs yet.</p>
                                <p className="text-xs mt-1 opacity-60">Tap the bookmark on any Goog to save it.</p>
                            </div>
                        )
                    )}
                </div>
            </div>

            {showShareModal && (
                <ShareModal isOpen={showShareModal} onClose={() => setShowShareModal(false)} shareUrl={shareUrl} title={shareTitle} />
            )}

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
                                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-semibold text-white hover:bg-white/5 transition-colors"
                                >
                                    <IonIcon name="create-outline" className="text-base text-blue-400" />
                                    Edit Goog
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleDeleteGoog(openGoogMenu.post)}
                                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-semibold text-red-400 hover:bg-white/5 transition-colors"
                                >
                                    <IonIcon name="trash-outline" className="text-base" />
                                    Delete Goog
                                </button>
                            </>
                        )}
                        <button
                            type="button"
                            onClick={() => { setShareTitle("Share Goog"); setShareUrl(getShareUrlForItem(openGoogMenu.post, "goog")); setShowShareModal(true); setOpenGoogMenu(null); googService.logShare(openGoogMenu.post.id).catch(() => {}); }}
                            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-semibold text-white hover:bg-white/5 transition-colors"
                        >
                            <IonIcon name="share-social-outline" className="text-base text-green-400" />
                            Share
                        </button>
                    </div>
                </div>
            )}

            <InteractionBottomSheet isOpen={isBottomSheetOpen} onClose={() => setIsBottomSheetOpen(false)} type={bottomSheetType} product={interactionItem} data={bottomSheetData} isLoading={isBottomSheetLoading} onTabChange={(type) => interactionItem && openBottomSheet(type, interactionItem, isBottomSheetGoog)} />
        </div>
    );
}
