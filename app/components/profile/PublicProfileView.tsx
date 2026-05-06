"use client";

import Image from "next/image";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { authService } from "@/services/authService";
import { marketService } from "@/services/marketService";
import { googService } from "@/services/googService";
import IonIcon from "@/app/components/IonIcon";
import ShareModal from "@/app/components/ShareModal";
import InteractionBottomSheet from "@/app/components/InteractionBottomSheet";
import { formatRelativeTime } from "@/app/lib/relativeTime";
import { getProfileShareUrl, getShareUrlForItem } from "@/app/lib/shareLinks";
import { GoogCard, type WritePost } from "@/app/components/googs/GoogCard";

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

function renderBioText(text: string): ReactNode[] {
    if (!text) return [];
    const parts = text.split(/(https?:\/\/[^\s]+|www\.[^\s]+|@[\w.]+|#[\w.]+)/g);
    return parts.filter(Boolean).map((part, index) => {
        if (/^(https?:\/\/|www\.)/i.test(part)) {
            return <a key={index} href={normalizeUrl(part)} target="_blank" rel="noreferrer" className="text-sky-400 transition hover:text-sky-300">{part}</a>;
        }
        if (part.startsWith("@") || part.startsWith("#")) return <span key={index} className="text-sky-400">{part}</span>;
        return <span key={index}>{part}</span>;
    });
}

const InteractionButton = memo(({ icon, activeIcon, count, activeColor, isActive, onSingleClick, onLongReach, type, iconSize = "text-[13px] md:text-xl" }: any) => {
    const timerRef = useRef<any>(null);
    const longPressedRef = useRef(false);
    const handleStart = (e: React.PointerEvent) => {
        e.stopPropagation();
        longPressedRef.current = false;
        timerRef.current = setTimeout(() => { longPressedRef.current = true; onLongReach(); }, 600);
    };
    const handleEnd = (e: React.PointerEvent) => {
        e.stopPropagation();
        if (timerRef.current) clearTimeout(timerRef.current);
        if (!longPressedRef.current) onSingleClick();
    };
    const currentIcon = isActive && activeIcon ? activeIcon : icon;
    const hasCount = typeof count === "number" ? count > 0 : !!count;
    return (
        <button onPointerDown={handleStart} onPointerUp={handleEnd} className={`${isActive ? activeColor : "text-white/40 hover:text-white"} inline-flex min-w-[42px] items-center justify-center gap-1.5 px-1.5 py-1.5 transition-all active:scale-75 select-none cursor-pointer touch-none`}>
            <IonIcon name={currentIcon} className={iconSize} />
            {hasCount && <span className="text-[8px] font-black md:text-[10px]">{count}</span>}
        </button>
    );
});
InteractionButton.displayName = "InteractionButton";

export function PublicProfileView({ user: initialUser, isPublic = true }: { user: UserRecord; isPublic?: boolean }) {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<"products" | "googs">("products");
    const [user, setUser] = useState(initialUser);
    const [posts, setPosts] = useState<PostRecord[]>([]);
    const [googs, setGoogs] = useState<WritePost[]>([]);
    const [loading, setLoading] = useState(false);
    const [isSubscribed, setIsSubscribed] = useState(!!initialUser.is_subscribed);
    const [subscriberCount, setSubscriberCount] = useState(Number(initialUser.subscriber_count || 0));
    const [showShareModal, setShowShareModal] = useState(false);
    const [shareUrl, setShareUrl] = useState("");
    const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);
    const [bottomSheetType, setBottomSheetType] = useState<any>("comments");
    const [bottomSheetData, setBottomSheetData] = useState<any[]>([]);
    const [isBottomSheetLoading, setIsBottomSheetLoading] = useState(false);
    const [interactionItem, setInteractionItem] = useState<any>(null);

    const loadData = useCallback(async () => {
        if (!user.id) return;
        try {
            const [userProducts, userGoogs] = await Promise.all([
                marketService.getItems({ user_id: user.id, status: "active,approved" }),
                googService.getUserPosts(user.id)
            ]);
            setPosts((userProducts || []).filter((p: any) => !p.is_sponsored));
            setGoogs(userGoogs || []);
        } catch (error) {
            console.error("Error loading profile data:", error);
        }
    }, [user.id]);

    useEffect(() => { loadData(); }, [loadData]);

    const handleToggleLike = async (id: number) => {
        try {
            const serverLiked = await marketService.toggleLike(id);
            setPosts(prev => prev.map(p => p.id === id ? { ...p, user_liked: serverLiked, likes_count: (p.likes_count || 0) + (serverLiked ? 1 : -1) } : p));
        } catch {}
    };

    const openBottomSheet = async (type: any, item: any, isGoog = false) => {
        setBottomSheetType(type);
        setInteractionItem(item);
        setIsBottomSheetOpen(true);
        setBottomSheetData([]);
        setIsBottomSheetLoading(true);
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

    const profileImage = user.profile_picture ? (user.profile_picture.startsWith("http") ? user.profile_picture : `/uploads/${user.profile_picture.split(/[\\/]/).pop()}`) : `https://ui-avatars.com/api/?name=${encodeURIComponent(user.full_name || user.username || "G")}&background=111&color=fff`;
    const bioLines = (user.bio || "").split(/\n+/).filter(Boolean);
    const bioLinks = (user.bio || "").match(/(https?:\/\/[^\s]+|www\.[^\s]+)/gi) || [];

    return (
        <div className="mx-auto max-w-[1280px] pb-24 text-white">
            <div className="px-4 pt-8 md:px-8">
                <div className="flex items-center gap-6">
                    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border-2 border-white/10 bg-zinc-900 shadow-xl md:h-24 md:w-24">
                        <Image src={profileImage} alt={user.username || ""} fill className="object-cover" unoptimized />
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
                        {bioLines.length > 0 ? bioLines.map((line, i) => <p key={i}>{renderBioText(line)}</p>) : <p className="text-zinc-500 italic">No bio provided</p>}
                    </div>
                    <div className="mt-3 flex flex-col gap-1.5">
                        {bioLinks.slice(0, 2).map((link, i) => (
                            <a key={i} href={normalizeUrl(link)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-bold text-sky-400 hover:text-sky-300 transition-colors">
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
                    <button onClick={() => { setShareUrl(getProfileShareUrl(user)); setShowShareModal(true); }} className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/5 text-white transition hover:bg-white/10 active:scale-95">
                        <IonIcon name="share-social-outline" className="text-xl" />
                    </button>
                </div>

                <div className="mt-12 border-b border-white/10">
                    <div className="flex gap-8">
                        <button onClick={() => setActiveTab("products")} className={`pb-4 text-sm font-black uppercase tracking-widest transition-colors ${activeTab === "products" ? "text-white border-b-2 border-white" : "text-zinc-500 hover:text-zinc-300"}`}>Products</button>
                        <button onClick={() => setActiveTab("googs")} className={`pb-4 text-sm font-black uppercase tracking-widest transition-colors ${activeTab === "googs" ? "text-white border-b-2 border-white" : "text-zinc-500 hover:text-zinc-300"}`}>Googs</button>
                    </div>
                </div>

                <div className="mt-8">
                    {activeTab === "products" ? (
                        posts.length > 0 ? (
                            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                                {posts.map((post) => (
                                    <div key={post.id} className="group relative overflow-hidden rounded-2xl border border-white/5 bg-zinc-900/50 p-2 transition hover:border-white/20">
                                        <div className="relative aspect-square overflow-hidden rounded-xl bg-black" onClick={() => router.push(`/dashboard/shop?id=${post.id}`)}>
                                            <Image src={post.image_url ? (post.image_url.startsWith("http") ? post.image_url : `/uploads/${post.image_url.split(/[\\/]/).pop()}`) : ""} alt={post.title || ""} fill className="object-cover transition duration-500 group-hover:scale-110" unoptimized />
                                        </div>
                                        <div className="p-2">
                                            <h3 className="truncate text-[11px] font-black uppercase text-white">{post.title}</h3>
                                            <div className="mt-2 flex items-center gap-3">
                                                <InteractionButton type="likes" icon="heart-outline" activeIcon="heart" isActive={post.user_liked} count={post.likes_count} activeColor="text-red-500" onSingleClick={() => handleToggleLike(post.id)} onLongReach={() => openBottomSheet("likes", post)} iconSize="text-base" />
                                                <InteractionButton type="comments" icon="chatbubble-outline" count={post.comments_count} activeColor="text-blue-400" onSingleClick={() => openBottomSheet("comments", post)} onLongReach={() => openBottomSheet("comments", post)} iconSize="text-base" />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : <div className="py-20 text-center text-zinc-500 font-bold">No products listed yet.</div>
                    ) : (
                        googs.length > 0 ? (
                            <div className="flex flex-col gap-4">
                                {googs.map((goog) => (
                                    <GoogCard key={goog.id} post={goog} showSubscribe={false} onNavigateToProfile={() => {}} onToggleLike={() => {}} onOpenSheet={(type, g) => openBottomSheet(type, g, true)} onSharePost={() => { setShareUrl(getShareUrlForItem(goog, "goog")); setShowShareModal(true); }} />
                                ))}
                            </div>
                        ) : <div className="py-20 text-center text-zinc-500 font-bold">No Googs posted yet.</div>
                    )}
                </div>
            </div>

            {showShareModal && (
                <ShareModal isOpen={showShareModal} onClose={() => setShowShareModal(false)} shareUrl={shareUrl} title={activeTab === "products" ? "Share Profile" : "Share Goog"} />
            )}

            <InteractionBottomSheet isOpen={isBottomSheetOpen} onClose={() => setIsBottomSheetOpen(false)} type={bottomSheetType} product={interactionItem} data={bottomSheetData} isLoading={isBottomSheetLoading} />
        </div>
    );
}
