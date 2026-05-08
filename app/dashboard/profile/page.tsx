"use client";

import Image from "next/image";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authService } from "@/services/authService";
import { marketService } from "@/services/marketService";
import IonIcon from "@/app/components/IonIcon";
import ShareModal from "@/app/components/ShareModal";
import InteractionBottomSheet from "@/app/components/InteractionBottomSheet";

import { getProfileShareUrl, getShareUrlForItem } from "@/app/lib/shareLinks";
import { useAdStore } from "@/app/lib/ads/adStore";
import SubscribeButton from "@/app/components/SubscribeButton";
import { SharedProductCard } from "@/app/components/market/SharedProductCard";
import { PromotedAdCard } from "@/app/components/ads/PromotedAdCard";
import { useAdActions } from "@/app/lib/ads/useAdActions";
import { normalizeAdData } from "@/app/lib/ads/adNormalizer";
import { matchesAdIdentity } from "@/app/lib/ads/adIdentity";
import { SharedAdSecondViewModal } from "@/app/components/ads/SharedAdSecondViewModal";
import { ShopProductSecondViewModal } from "@/app/components/market/ShopProductSecondViewModal";

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

function formatDisplayUrl(url: string) {
    try {
        const parsed = new URL(normalizeUrl(url));
        const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");
        return `${parsed.hostname}${path}`;
    } catch {
        return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
    }
}

function renderBioText(text: string): ReactNode[] {
    if (!text) return [];

    const parts = text.split(/(https?:\/\/[^\s]+|www\.[^\s]+|@[\w.]+|#[\w.]+)/g);
    return parts.filter(Boolean).map((part, index) => {
        if (/^(https?:\/\/|www\.)/i.test(part)) {
            return (
                <a
                    key={`${part}-${index}`}
                    href={normalizeUrl(part)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sky-400 transition hover:text-sky-300"
                >
                    {part}
                </a>
            );
        }

        if (part.startsWith("@") || part.startsWith("#")) {
            return <span key={`${part}-${index}`} className="text-sky-400">{part}</span>;
        }

        return <span key={`${part}-${index}`}>{part}</span>;
    });
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
    iconSize = "text-[13px] md:text-xl",
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
    const currentIcon = isActive && activeIcon ? activeIcon : icon;
    const hasCount = typeof count === "number" ? count > 0 : !!count;
    const colorClass = isActive ? activeColor : "text-white/40 hover:text-white";

    return (
        <button
            type="button"
            data-interaction-type={type}
            onPointerDown={handleStart}
            onPointerUp={handleEnd}
            onPointerLeave={handleCancel}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
            className={`${colorClass} inline-flex min-w-[42px] items-center justify-center gap-1.5 px-1.5 py-1.5 transition-all duration-300 active:scale-75 focus:outline-none select-none cursor-pointer touch-none md:min-w-[54px]`}
        >
            <IonIcon name={currentIcon} className={`${iconSize} shrink-0`} />
            {hasCount && <span className="shrink-0 text-[8px] font-black tracking-tight md:text-[10px]">{count}</span>}
        </button>
    );
});

InteractionButton.displayName = "InteractionButton";

export default function ProfilePage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const profileId = searchParams ? searchParams.get("id") : null;
    const profileUser = searchParams ? searchParams.get("user") : null;
    const profileShareCode = searchParams ? searchParams.get("share") : null;

    const [activeTab, setActiveTab] = useState<"threads" | "replies">("threads");
    const [showMenu, setShowMenu] = useState(false);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<UserRecord | null>(null);
    const [marketAds, setMarketAds] = useState<any[]>([]);
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
    const [hiddenPostIds, setHiddenPostIds] = useState<number[]>([]);
    const [notification, setNotification] = useState<{ type: "success" | "error"; title?: string; message: string } | null>(null);
    const [showShareModal, setShowShareModal] = useState(false);
    const [shareProduct, setShareProduct] = useState<any>(null);
    const [initialShareView, setInitialShareView] = useState<"share" | "resell">("share");
    const [reportingProduct, setReportingProduct] = useState<PostRecord | null>(null);

    const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);
    const [isBottomSheetLoading, setIsBottomSheetLoading] = useState(false);
    const [bottomSheetType, setBottomSheetType] = useState<SheetType>("comments");
    const [interactionProduct, setInteractionProduct] = useState<any>(null);
    const [bottomSheetData, setBottomSheetData] = useState<any[]>([]);
    const [adPreviewModal, setAdPreviewModal] = useState<{ ad: any; type: "ad" | "product"; kind?: any } | null>(null);

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

    useEffect(() => {
        if (!notification) return;
        const timer = setTimeout(() => setNotification(null), 4000);
        return () => clearTimeout(timer);
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

    const fetchProfile = useCallback(async () => {
        try {
            setLoading(true);
            let profileData: UserRecord;
            if (profileUser) {
                const isNumericId = /^\d+$/.test(profileUser);
                profileData = isNumericId
                    ? await authService.getUserProfile(profileUser)
                    : await authService.getUserByUsername(profileUser);

                const localUser = JSON.parse(localStorage.getItem("user") || "{}");
                const nextUser = localUser?.id ? localUser : null;
                setCurrentUser(nextUser);
                setViewerContext(nextUser);
                setIsOwnProfile(false);

                const userProducts = await marketService.getItems({ user_id: profileData.id, status: "active,approved" });
                const filtered = (userProducts || []).filter(isLiveMarketPost);
                setPosts(filtered);
                syncAds(filtered.filter((p: any) => p.is_sponsored || p.campaign_type));
            } else if (profileShareCode) {
                const shared = await marketService.getUnifiedShareItem(profileShareCode);
                if (!shared?.success || shared?.type !== "profile" || !shared?.data) {
                    throw new Error("Profile not found");
                }

                profileData = shared.data;
                const localUser = JSON.parse(localStorage.getItem("user") || "{}");
                const nextUser = localUser?.id ? localUser : null;
                setCurrentUser(nextUser);
                setViewerContext(nextUser);
                setIsOwnProfile(false);

                const userProducts = await marketService.getItems({ user_id: profileData.id, status: "active,approved" });
                const filtered = (userProducts || []).filter(isLiveMarketPost);
                setPosts(filtered);
                syncAds(filtered.filter((p: any) => p.is_sponsored || p.campaign_type));
            } else if (profileId) {
                profileData = await authService.getUserProfile(profileId);
                const localUser = JSON.parse(localStorage.getItem("user") || "{}");
                const nextUser = localUser?.id ? localUser : null;
                setCurrentUser(nextUser);
                setViewerContext(nextUser);
                setIsOwnProfile(nextUser?.id === Number(profileId));
                const userProducts = await marketService.getItems({ user_id: profileId, status: "active,approved" });
                const filtered = (userProducts || []).filter(isLiveMarketPost);
                setPosts(filtered);
                syncAds(filtered.filter((p: any) => p.is_sponsored || p.campaign_type));
            } else {
                if (!authService.isAuthenticated()) {
                    router.push("/");
                    return;
                }
                profileData = await authService.getProfile();
                setCurrentUser(profileData);
                setViewerContext(profileData);
                setIsOwnProfile(true);
                const myProducts = await marketService.getItems({ user_id: profileData.id, status: "active,approved" });
                const filtered = (myProducts || []).filter(isLiveMarketPost);
                setPosts(filtered);
                syncAds(filtered.filter((p: any) => p.is_sponsored || p.campaign_type));
            }
            setUser(profileData);
            setSubscriberCount(Number(profileData?.subscriber_count || 0));
            setIsSubscribed(!!profileData?.is_subscribed);
            setProfileViewsCount(Number(profileData?.profile_views_count || 0));
            setFollowingCount(Number(profileData?.following_count || 0));
        } catch (error) {
            console.error("Error fetching profile:", error);
            setViewerContext(null);
            if (!profileId && !profileUser && !profileShareCode) router.push("/");
        } finally {
            setLoading(false);
        }
    }, [profileId, profileShareCode, profileUser, router, setViewerContext, syncAds]);

    useEffect(() => { fetchProfile(); }, [fetchProfile]);



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

    const openBottomSheet = async (type: SheetType, product: any) => {
        setBottomSheetType(type);
        setInteractionProduct(product);
        setIsBottomSheetOpen(true);
        setBottomSheetData([]);
        setIsBottomSheetLoading(true);
        try {
            let data = [];
            if (type === "comments") data = await marketService.getComments(product.id);
            if (type === "likes") data = (await marketService.getLikes?.(product.id)) || [];
            if (type === "shares") data = (await marketService.getShares?.(product.id)) || [];
            if (type === "views") data = (await marketService.getViews?.(product.id)) || [];
            setBottomSheetData(data || []);
        } finally { setIsBottomSheetLoading(false); }
    };

    const handleToggleLike = async (item: any) => {
        const id = typeof item === 'object' ? item.id : item;
        const currentPost = typeof item === 'object' ? item : posts.find((p) => p.id === id);
        if (!currentPost) return;

        if (currentPost.is_sponsored || currentPost.campaign_type) {
            await adActions.like(currentPost);
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

    const handleLogShare = async (id: number) => {
        await marketService.logShare(id);
        setPosts((prev) => prev.map((p) => p.id === id ? { ...p, shares_count: (p.shares_count || 0) + 1 } : p));
        updateAdState(id, (prev) => ({ shares_count: (prev.shares_count || 0) + 1 }));
    };

    const handleShareClick = (product: any, view: "share" | "resell" = "share") => {
        if (!product) return;
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

    const handleLogView = async (id: number) => {
        const result = await marketService.logView(id);
        if (result?.incremented === true) {
            setPosts((prev) => prev.map((p) => p.id === id ? { ...p, views_count: (p.views_count || 0) + 1 } : p));
            updateAdState(id, (prev) => ({ views_count: (prev.views_count || 0) + 1 }));
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
        if (!user?.id) return;
        try {
            setIsBlockedLoading(true);
            setIsBlockedModalOpen(true);
            const data = await authService.getBlockedUsers(user.id);
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

    const handleBlockAccountClick = () => {
        if (isOwnProfile) return;
        setShowMenu(false);
        setNotification({
            type: "success",
            title: "Block Account",
            message: `Block flow prepared for @${username}.`,
        });
    };

    const handleReportAccountClick = () => {
        if (isOwnProfile) return;
        setShowMenu(false);
        setNotification({
            type: "success",
            title: "Report",
            message: `Report flow prepared for @${username}.`,
        });
    };

    const profileImage = useMemo(() => {
        if (!user) return "";
        return user.profile_picture
            ? (user.profile_picture.startsWith("http") || user.profile_picture.startsWith("data:")
                ? user.profile_picture
                : `/uploads/${user.profile_picture.split(/[\\/]/).pop()}`)
            : `https://ui-avatars.com/api/?name=${encodeURIComponent(user.full_name || user.username || "Googer")}&size=240&background=111111&color=ffffff`;
    }, [user]);

    const username = user?.username || "googer";
    const displayName = user?.full_name || user?.username || "Googer User";
    const bioLinks = extractUrls(user?.bio).slice(0, 2);
    const cleanedBio = (user?.bio || "").replace(/\n{3,}/g, "\n\n").trim();
    const bioLines = cleanedBio
        .split(/\n+/)
        .filter(Boolean)
        .map((line) => line.replace(/(https?:\/\/[^\s]+|www\.[^\s]+)/gi, "").trim())
        .filter(Boolean);
    const canShowMail = Boolean((isOwnProfile && (user?.contact_email || user?.email)) || (!isOwnProfile && user?.contact_email && user?.contact_email_visibility !== "only_me"));
    const canShowContact = Boolean((isOwnProfile && (user?.contact_phone || user?.shipping_address?.phone || user?.shipping_address?.phone2)) || (!isOwnProfile && user?.contact_phone && user?.contact_phone_visibility !== "only_me"));
    const visiblePosts = useMemo(
        () => posts.filter((post) => !hiddenPostIds.includes(post.id)),
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

    if (loading) return <div className="flex min-h-[60vh] items-center justify-center text-zinc-400">Loading profile</div>;
    if (!user) return null;

    return (
        <div className="mx-auto max-w-[1280px] pb-10 text-white">
            {notification && (
                <div className={`fixed right-4 top-4 z-[120] rounded-2xl border px-4 py-2 ${notification.type === "success" ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300" : "bg-red-500/15 border-red-500/30 text-red-300"}`}>
                    <p className="text-[9px] font-black uppercase tracking-widest">{notification.title}</p>
                    <p className="text-[10px] font-semibold">{notification.message}</p>
                </div>
            )}

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
                            className="relative flex h-7 w-7 -translate-x-[5px] items-center justify-center rounded-full border border-white/50"
                        >
                            <div className="flex items-center gap-1">
                                <span className="h-1 w-1 rounded-full bg-white/80" />
                                <span className="h-1 w-1 rounded-full bg-white/80" />
                            </div>
                        </button>
                        {showMenu && (
                            <div
                                className="absolute right-0 top-10 z-20 w-48 overflow-hidden rounded-xl border border-white/10 bg-[#141414] p-1.5 shadow-2xl"
                                onClick={(e) => e.stopPropagation()}
                            >
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
                                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-white transition hover:bg-white/6"
                                        >
                                            <IonIcon name="ban-outline" className="text-sm" />
                                            Block Account
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
                                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-white/10 bg-white shadow-lg min-[960px]:h-[72px] min-[960px]:w-[72px]">
                                        {profileImage ? <Image src={profileImage} alt={displayName} fill className="object-cover" unoptimized /> : <div className="flex h-full w-full items-center justify-center bg-zinc-800 text-xl font-black">{getInitials(displayName)}</div>}
                                    </div>
                                    <div className="min-w-0">
                                        <h1 className="truncate text-[22px] font-black tracking-tight text-white min-[960px]:text-[26px]">
                                            {displayName}
                                        </h1>
                                        <p className="mt-1 truncate text-[13px] font-medium text-zinc-300">
                                            @{username}
                                        </p>
                                        <div className="mt-1 flex items-center gap-2 text-[12px] font-medium text-zinc-500">
                                            <p className="truncate">Googer ID: {user.user_id || user.id || "N/A"}</p>
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
                                                {renderBioText(line)}
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
                            role="button"
                            tabIndex={0}
                            onClick={() => handleOpenConnectionsView("followers")}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    handleOpenConnectionsView("followers");
                                }
                            }}
                            className="cursor-pointer select-none rounded-[1.35rem] px-4 py-2 transition-opacity hover:opacity-85"
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
                                                source="shop"
                                                onProductClick={(p) => setAdPreviewModal({ ad: p, type: "product" })}
                                                onAddToBagClick={(p) => setAdPreviewModal({ ad: p, type: "product" })}
                                                onOpenSecondView={(targetAd) => setAdPreviewModal({
                                                    ad: targetAd,
                                                    type: "ad",
                                                    kind: normalizedAd.type === "video" ? "video" : "image",
                                                })}
                                                onToggleLike={(item) => handleToggleLike(item)}
                                                onOpenSheet={(type, p) => openBottomSheet(type as any, p)}
                                                onShare={handleShareClick}
                                                onLogView={handleLogView}
                                                onReport={(p) => setReportingProduct(p)}
                                                onNotInterested={(id) => setHiddenPostIds((prev) => [...prev, Number(id)])}
                                                onCollectCoin={(event, p) => adActions.handleAdCoinClick(event, p)}
                                                canShowCollectCoin={(p) => adActions.canShowCollectCoin(p)}
                                                onNavigateToProfile={(event, userId) => {
                                                    if (userId) router.push(`/dashboard/profile?id=${userId}`);
                                                }}
                                                currentUser={currentUser}
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
                                            onNotInterested={(id) => setHiddenPostIds((prev) => [...prev, Number(id)])}
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
                    ) : <div className="px-5 py-14 text-center text-zinc-400">Posts will show here.</div>}
                </div>
            </section>

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
                                    const connectionImage = connectionUser.profile_picture
                                        ? (connectionUser.profile_picture.startsWith("http") || connectionUser.profile_picture.startsWith("data:")
                                            ? connectionUser.profile_picture
                                            : `/uploads/${connectionUser.profile_picture.split(/[\\/]/).pop()}`)
                                        : `https://ui-avatars.com/api/?name=${encodeURIComponent(connectionUser.full_name || connectionUser.username || "Googer")}&size=120&background=111111&color=ffffff`;
                                    const connectionId = getConnectionUserId(connectionUser);
                                    const showSubscribeButton = !!connectionId && String(connectionId) !== String(currentUser?.id || "");
                                    const subscribed = isConnectionSubscribed(connectionUser);
                                    const isPending = !!connectionActionUserId && String(connectionActionUserId) === String(connectionId);
                                    const displayName = connectionUser.full_name || connectionUser.username || "Googer";

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
                                    const blockedImage = blockedUser.profile_picture
                                        ? (blockedUser.profile_picture.startsWith("http") || blockedUser.profile_picture.startsWith("data:")
                                            ? blockedUser.profile_picture
                                            : `/uploads/${blockedUser.profile_picture.split(/[\\/]/).pop()}`)
                                        : `https://ui-avatars.com/api/?name=${encodeURIComponent(blockedUser.full_name || blockedUser.username || "Googer")}&size=120&background=111111&color=ffffff`;

                                    return (
                                        <button
                                            key={`${blockedUser.id}-${blockedUser.username}`}
                                            type="button"
                                            onClick={() => {
                                                setIsBlockedModalOpen(false);
                                                router.push(`/dashboard/profile?id=${blockedUser.id}`);
                                            }}
                                            className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-white/[0.04]"
                                        >
                                            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border border-white/10 bg-white">
                                                <Image src={blockedImage} alt={blockedUser.full_name || blockedUser.username || "Blocked user"} fill className="object-cover" unoptimized />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-semibold text-white">{blockedUser.full_name || blockedUser.username}</p>
                                                <p className="mt-0.5 truncate text-xs text-zinc-400">@{blockedUser.username}</p>
                                                {blockedUser.bio && <p className="mt-1 truncate text-xs text-zinc-500">{blockedUser.bio}</p>}
                                            </div>
                                            <IonIcon name="chevron-forward-outline" className="text-lg text-zinc-500" />
                                        </button>
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

            {reportingProduct && <div className="fixed inset-0 z-[110] flex items-center justify-center p-4"><div className="absolute inset-0 bg-black/80" onClick={() => setReportingProduct(null)} /><div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#151515] p-5"><h3 className="text-sm font-black uppercase tracking-widest">Report Post</h3><p className="mt-2 text-xs text-white/60">Product {reportingProduct.id} reported to admin for review.</p><div className="mt-4 flex justify-end"><button onClick={() => setReportingProduct(null)} className="rounded-xl bg-white px-4 py-2 text-xs font-black uppercase tracking-widest text-black">Close</button></div></div></div>}

            <ShareModal
                isOpen={showShareModal}
                onClose={() => setShowShareModal(false)}
                title={shareProduct?.title || "Check out this product"}
                url={shareProduct ? getShareUrlForItem(shareProduct, "product") : ""}
                description={shareProduct?.description}
                product={shareProduct}
                initialView={initialShareView}
            />

            <InteractionBottomSheet
                isOpen={isBottomSheetOpen}
                onClose={() => setIsBottomSheetOpen(false)}
                type={bottomSheetType}
                product={interactionProduct}
                data={bottomSheetData}
                onTabChange={(type) => interactionProduct && openBottomSheet(type, interactionProduct)}
                onAddComment={async (text, parentId) => {
                    if (!interactionProduct) return;
                    const comment = await marketService.addComment(interactionProduct.id, text, parentId);
                    setBottomSheetData((prev) => [...prev, { ...comment, username: currentUser?.username || "You", profile_picture: currentUser?.profile_picture }]);
                    setPosts((prev) => prev.map((p) => p.id === interactionProduct.id ? { ...p, comments_count: (p.comments_count || 0) + 1 } : p));
                    updateAdState(interactionProduct, (prev) => ({ comments_count: (prev.comments_count || 0) + 1 }));
                }}
                onDeleteComment={async (commentId) => {
                    const result = await marketService.deleteComment(commentId);
                    const deletedCount = Math.max(1, Number(result?.deletedCount || 1));
                    setBottomSheetData((prev) => prev.filter((c) => c.id !== commentId && c.parent_id !== commentId));
                    if (interactionProduct?.id) {
                        setPosts((prev) => prev.map((p) => p.id === interactionProduct.id ? { ...p, comments_count: Math.max((p.comments_count || 0) - deletedCount, 0) } : p));
                        updateAdState(interactionProduct, (prev) => ({ comments_count: Math.max((prev.comments_count || 0) - deletedCount, 0) }));
                    }
                }}
                onLikeComment={async (commentId) => {
                    await marketService.likeComment(Number(commentId));
                    if (interactionProduct?.id) setBottomSheetData((await marketService.getComments(interactionProduct.id)) || []);
                }}
                onDislikeComment={async (commentId) => {
                    await marketService.dislikeComment(Number(commentId));
                    if (interactionProduct?.id) setBottomSheetData((await marketService.getComments(interactionProduct.id)) || []);
                }}
                onReportComment={async (commentId) => { await marketService.reportComment(Number(commentId)); }}
                onRefresh={async () => {
                    if (interactionProduct?.id) {
                        setBottomSheetData((await marketService.getComments(interactionProduct.id)) || []);
                    }
                }}
                currentUser={currentUser}
                isLoading={isBottomSheetLoading}
            />

            {notification && (
                <div className="fixed bottom-24 left-1/2 z-[200] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-2xl ${notification.type === "success" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400" : "border-red-500/20 bg-red-500/10 text-red-400"}`}>
                        <IonIcon name={notification.type === "success" ? "checkmark-circle" : "alert-circle"} className="text-xl" />
                        <div className="min-w-0 flex-1">
                            {notification.title && <p className="text-[10px] font-black uppercase tracking-widest opacity-60">{notification.title}</p>}
                            <p className="text-xs font-bold">{notification.message}</p>
                        </div>
                        <button onClick={() => setNotification(null)} className="flex h-7 w-7 items-center justify-center rounded-full bg-white/5 hover:bg-white/10"><IonIcon name="close" /></button>
                    </div>
                </div>
            )}

            {adPreviewModal && adPreviewModal.type === "ad" && (
                <SharedAdSecondViewModal
                    onClose={() => setAdPreviewModal(null)}
                    ad={adPreviewModal.ad}
                    kind={adPreviewModal.kind || "image"}
                    onToggleLike={(item) => handleToggleLike(item)}
                    onOpenSheet={openBottomSheet}
                    onShare={(ad) => handleShareClick(ad.raw || ad)}
                    onReport={() => {}}
                    onNotInterested={() => {}}
                    onCollectCoin={(e, target) => adActions.handleAdCoinClick(e, target)}
                    onNavigateToProfile={(e, target) => {
                        setAdPreviewModal(null);
                        router.push(`/dashboard/profile?id=${target.user_id}`);
                    }}
                    canShowCollectCoin={(target) => adActions.canShowCollectCoin(target)}
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

        </div>
    );
}
