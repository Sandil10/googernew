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

const BADGE_COLOR_CLASS: Record<string, string> = {
    silver: "text-zinc-300",
    blue:   "text-blue-400",
    gold:   "text-amber-400",
    green:  "text-emerald-400",
    purple: "text-purple-400",
    red:    "text-red-400",
};

export function PublicProfileView({ user: initialUser, isPublic = true, currentUserId }: { user: UserRecord; isPublic?: boolean; currentUserId?: number | null }) {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<"products" | "googs" | "saved">("products");
    const syncAds = useAdStore((state) => state.syncAds);
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
    const [badge, setBadge] = useState<{ color: string } | null>(null);
    const [saveToast, setSaveToast] = useState<string | null>(null);
    const [googSavedCount, setGoogSavedCount] = useState(0);
    const [googSaveLimit, setGoogSaveLimit] = useState<number | null>(null);

    const profileUserId = Number(user.id || user.user_id || 0) || null;
    const isOwnProfile = !!(currentUserId && profileUserId && currentUserId === profileUserId);

    const loadData = useCallback(async () => {
        if (!profileUserId) return;
        try {
            const [userProducts, userGoogs, ownerAds, userBadge] = await Promise.all([
                marketService.getItems({ user_id: profileUserId, status: "active,approved" }),
                googService.getUserPosts(profileUserId),
                adsService.getActiveAdsByUser(profileUserId),
                subscriptionService.getBadgeForUser(profileUserId),
            ]);
            setPosts((userProducts || []).filter((p: any) => !p.is_sponsored && !p.campaign_type));
            const normalizedAds = (ownerAds || []).map(normalizeAdData).filter((ad: any) => ad.type !== 'product');
            setProfileAds(normalizedAds);
            syncAds(normalizedAds);
            setGoogs(userGoogs || []);
            setBadge(userBadge);
        } catch (error) {
            console.error("Error loading profile data:", error);
        }
    }, [profileUserId]);

    const loadSavedGoogs = useCallback(async () => {
        if (!isOwnProfile) return;
        try {
            const [saved, ids] = await Promise.all([
                googService.getSavedGoogs(),
                googService.getSavedStatus(),
            ]);
            setSavedGoogs(saved || []);
            setSavedIds(new Set(ids));
        } catch {}
    }, [isOwnProfile]);

    useEffect(() => { if (isOwnProfile) loadSavedGoogs(); }, [loadSavedGoogs, isOwnProfile]);

    useEffect(() => { loadData(); }, [loadData]);

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
            } catch {}
        };
        void load();
        window.addEventListener('subscription:changed', load);
        return () => window.removeEventListener('subscription:changed', load);
    }, [currentUserId]);

    const handleToggleLike = async (id: number) => {
        try {
            const serverLiked = await marketService.toggleLike(id);
            setPosts(prev => prev.map(p => p.id === id ? { ...p, user_liked: serverLiked, likes_count: (p.likes_count || 0) + (serverLiked ? 1 : -1) } : p));
        } catch {}
    };

    const handleLogView = async (id: number) => {
        try {
            await marketService.logView(id);
            setPosts((prev) => prev.map((post) => (
                post.id === id
                    ? { ...post, views_count: (Number(post.views_count || 0) + 1) }
                    : post
            )));
        } catch {}
    };

    const handleGoogToggleLike = useCallback(async (goog: WritePost) => {
        const wasLiked = !!goog.user_liked;
        const willBeLiked = !wasLiked;
        setGoogs((prev) => prev.map((g) => g.id === goog.id ? { ...g, user_liked: willBeLiked, likes_count: Math.max(0, (g.likes_count || 0) + (willBeLiked ? 1 : -1)) } : g));
        try {
            const serverLiked = await googService.toggleLike(goog.id);
            if (serverLiked !== willBeLiked) {
                setGoogs((prev) => prev.map((g) => g.id === goog.id ? { ...g, user_liked: serverLiked, likes_count: Math.max(0, (g.likes_count || 0) + (serverLiked ? 1 : -1)) } : g));
            }
        } catch {
            setGoogs((prev) => prev.map((g) => g.id === goog.id ? { ...g, user_liked: wasLiked, likes_count: Math.max(0, (g.likes_count || 0) + (wasLiked ? 1 : -1)) } : g));
        }
    }, []);

    const handleToggleSave = useCallback(async (googId: number) => {
        const result = await googService.toggleSave(googId);
        if (!result.saved && result.message) {
            setSaveToast(result.message);
            setTimeout(() => setSaveToast(null), 3500);
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
        if (!googs.length) return profileAds.map((a): FeedItem => ({ type: 'ad', data: a }));
        if (!profileAds.length) return googs.map((g): FeedItem => ({ type: 'goog', data: g }));
        const result: FeedItem[] = [];
        let adIndex = 0;
        googs.forEach((g, i) => {
            result.push({ type: 'goog', data: g });
            if ((i + 1) % 4 === 0) {
                result.push({ type: 'ad', data: profileAds[adIndex % profileAds.length] });
                adIndex++;
            }
        });
        if (adIndex === 0) {
            result.push({ type: 'ad', data: profileAds[0] });
        }
        return result;
    }, [googs, profileAds]);

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
                        {badge && (
                            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#0a0a0a] border-2 border-black flex items-center justify-center">
                                <IonIcon name="checkmark-circle" className={`text-base ${BADGE_COLOR_CLASS[badge.color] || "text-zinc-300"}`} />
                            </div>
                        )}
                    </div>
                    <div className="min-w-0 flex-1">
                        <h1 className="truncate text-2xl font-black tracking-tight md:text-3xl">{user.full_name || user.username}</h1>
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
                    <button onClick={async () => {
                        try {
                            const result = await authService.toggleSubscription(user.id!);
                            setIsSubscribed(result.isSubscribed);
                            setSubscriberCount(result.subscriberCount);
                        } catch { router.push("/login"); }
                    }} className={`flex-1 rounded-xl py-3 text-sm font-black uppercase tracking-widest transition active:scale-95 ${isSubscribed ? "bg-zinc-800 text-white hover:bg-zinc-700" : "bg-white text-black hover:bg-zinc-200"}`}>
                        {isSubscribed ? "Subscribed" : "Subscribe"}
                    </button>
                    <button onClick={() => { setShareTitle("Share Profile"); setShareUrl(getProfileShareUrl(user)); setShowShareModal(true); }} className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/5 text-white transition hover:bg-white/10 active:scale-95">
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
                                        onProductClick={(product) => router.push(`/dashboard/shop?id=${product.id}`)}
                                        onAddToBagClick={(product) => router.push(`/dashboard/shop?id=${product.id}`)}
                                        onToggleLike={(product) => handleToggleLike(product.id)}
                                        onOpenSheet={(type, product) => openBottomSheet(type, product)}
                                        onShare={(product) => {
                                            setShareTitle(product?.title ? `Share ${product.title}` : "Share Product");
                                            setShareUrl(getShareUrlForItem(product, "product"));
                                            setShowShareModal(true);
                                        }}
                                        onLogView={(id) => handleLogView(Number(id))}
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
                                                        onProductClick={() => {}}
                                                        onAddToBagClick={() => {}}
                                                        onOpenSecondView={() => {}}
                                                        onToggleLike={() => {}}
                                                        onOpenSheet={() => {}}
                                                        onShare={() => {}}
                                                        onLogView={() => {}}
                                                        onReport={() => {}}
                                                        onNotInterested={() => {}}
                                                        onCollectCoin={() => {}}
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
                                            onNavigateToProfile={() => {}}
                                            onToggleLike={() => handleGoogToggleLike(item.data)}
                                            onOpenSheet={(type, g) => openBottomSheet(type, g, true)}
                                            onSharePost={() => {
                                                setShareTitle("Share Goog");
                                                setShareUrl(getShareUrlForItem(item.data, "goog"));
                                                setShowShareModal(true);
                                                googService.logShare(item.data.id).catch(() => {});
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
                                            googService.logShare(g.id).catch(() => {});
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

            {/* Save toast */}
            {saveToast && (
                <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-[#1a1a1a] border border-amber-500/30 text-amber-300 text-xs font-semibold px-4 py-2.5 rounded-full shadow-xl">
                    {saveToast}
                </div>
            )}

            {showShareModal && (
                <ShareModal isOpen={showShareModal} onClose={() => setShowShareModal(false)} shareUrl={shareUrl} title={shareTitle} />
            )}

            <InteractionBottomSheet isOpen={isBottomSheetOpen} onClose={() => setIsBottomSheetOpen(false)} type={bottomSheetType} product={interactionItem} data={bottomSheetData} isLoading={isBottomSheetLoading} onTabChange={(type) => interactionItem && openBottomSheet(type, interactionItem, isBottomSheetGoog)} />
        </div>
    );
}
