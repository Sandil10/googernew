"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import { authService, getStoredUserSync } from "@/services/authService";
import { chatService } from "@/services/chatService";
import IonIcon from "@/app/components/IonIcon";
import { useCart } from "@/app/context/CartContext";
import { openLoginModal, openLoginRequired } from "@/app/lib/loginRequired";
import { BadgeSvg } from "@/app/components/VerifiedBadge";
import { RelativeTime } from "@/app/components/RelativeTime";
import { getUserDisplayName } from "@/app/lib/userDisplay";

const menuItems = [
    { name: "Home", icon: "home", href: "/home" },
    { name: "Shop", icon: "bag", href: "/shop" },
    { name: "Wallet", icon: "wallet", href: "/wallet" },
    { name: "Chats", icon: "chatbubbles", href: "/chats" },
];

export default function Topbar() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const isAdCampaignPage = pathname === "/dashboard/ad-campaign" || (pathname?.startsWith("/dashboard/ad-campaign/") ?? false);
    const isUploadContentPage = pathname === "/dashboard/ad-campaign/upload-content" || pathname === "/dashboard/ad-campaign/flash-content";
    const activeCampaignTab = pathname === "/dashboard/ad-campaign/photo-video"
        ? "photo-video"
        : pathname === "/dashboard/ad-campaign/product-promote"
            ? "product-promote"
            : pathname === "/dashboard/ad-campaign/profile-promote"
                ? "profile-promote"
                : pathname === "/dashboard/ad-campaign/upload-content"
                    ? "upload-content"
                    : pathname === "/dashboard/ad-campaign/flash-content"
                        ? "flash-content"
                : (searchParams?.get("tab") || "photo-video");
    const [user, setUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [profileImageFailed, setProfileImageFailed] = useState(false);
    const { cartCount, setIsCartOpen, isCartOpen, isGoogerPaymentCartLocked } = useCart();
    const isCartLocked = isGoogerPaymentCartLocked;
    const prefetchAdCampaignRoutes = useCallback(() => {
        router.prefetch("/dashboard/ad-campaign/photo-video");
        router.prefetch("/dashboard/ad-campaign/product-promote");
        router.prefetch("/dashboard/ad-campaign/profile-promote");
        router.prefetch("/dashboard/ad-campaign/upload-content");
        router.prefetch("/dashboard/ad-campaign/flash-content");
    }, [router]);
    const openProtectedArea = (href: string, label: string) => {
        if (!authService.isAuthenticated()) {
            openLoginRequired({ message: `Please log in to open ${label.toLowerCase()}.` });
            return;
        }
        router.push(href);
    };

    useEffect(() => {
        const fetchUser = async () => {
            try {
                const cachedUser = getStoredUserSync();
                if (cachedUser) {
                    setUser(cachedUser);
                }
                if (authService.isAuthenticated()) {
                    const profile = await authService.getProfile();
                    setUser(profile);
                } else {
                    setUser(cachedUser);
                }
            } catch {
                setUser(getStoredUserSync());
            } finally {
                setLoading(false);
            }
        };

        fetchUser();
    }, [router]);

    useEffect(() => {
        const timer = window.setTimeout(prefetchAdCampaignRoutes, 800);
        return () => window.clearTimeout(timer);
    }, [prefetchAdCampaignRoutes]);

    useEffect(() => {
        if (!user?.id) return;
        fetch(`/api/subscriptions/badge/${user.id}`)
            .then(async r => {
                const contentType = r.headers.get("content-type") || "";
                return r.ok && contentType.includes("application/json") ? r.json() : null;
            })
            .then(d => setUserBadge(d?.badge || null))
            .catch(() => {});
    }, [user?.id]);

    useEffect(() => {
        const refresh = () => {
            if (!user?.id) return;
            fetch(`/api/subscriptions/badge/${user.id}`)
                .then(async r => {
                    const contentType = r.headers.get("content-type") || "";
                    return r.ok && contentType.includes("application/json") ? r.json() : null;
                })
                .then(d => setUserBadge(d?.badge || null))
                .catch(() => {});
        };
        window.addEventListener('badge:changed', refresh);
        return () => window.removeEventListener('badge:changed', refresh);
    }, [user?.id]);


    const [notifications, setNotifications] = useState<any[]>([]);
    const [showNotifications, setShowNotifications] = useState(false);
    const [notificationsSeenAt, setNotificationsSeenAt] = useState<string | null>(null);
    const [chatNotification, setChatNotification] = useState<any>(null);
    const [seenChatNotificationIds, setSeenChatNotificationIds] = useState<(number | string)[]>([]);
    const [seenChatNotificationsReady, setSeenChatNotificationsReady] = useState(false);
    const [userBadge, setUserBadge] = useState<{ color: string; tickColor?: string | null } | null>(null);
    const profileName = getUserDisplayName(user);
    const profileInitial = profileName.charAt(0).toUpperCase();
    const profileImage = user?.profile_picture
        ? (() => {
            const raw = String(user.profile_picture).trim();
            if (raw.startsWith("http") || raw.startsWith("data:")) return raw;
            const normalized = raw.replace(/\\/g, "/");
            if (normalized.startsWith("/uploads/")) return normalized;
            if (normalized.startsWith("uploads/")) return `/${normalized}`;
            return `/uploads/${normalized.split("/").pop()}`;
        })()
        : user
            ? `https://ui-avatars.com/api/?name=${encodeURIComponent(profileName)}&size=200&background=random`
            : null;

    useEffect(() => {
        setProfileImageFailed(false);
    }, [profileImage]);

    const getMessagePreview = (message: any) => {
        if (!message) return "No messages yet";
        if (message.type === "image") return "Sent an image";
        if (message.type === "call") return message.text || "Call update";
        if (message.type === "call_record") return message.text || "Call update";
        return message.text || "New message";
    };

    const getSeenChatNotificationsKey = (userId?: number | string | null) => {
        if (!userId) return null;
        return `googer-chat-seen-notifications-${userId}`;
    };

    const getTopbarNotificationsKey = (userId?: number | string | null) => {
        if (!userId) return null;
        return `googer-topbar-notifications-${userId}`;
    };

    const getTopbarNotificationsSeenKey = (userId?: number | string | null) => {
        if (!userId) return null;
        return `googer-topbar-notifications-seen-at-${userId}`;
    };

    const unreadNotificationCount = notifications.filter((notif) => {
        if (!notif?.timestamp) return true;
        if (!notificationsSeenAt) return true;
        return new Date(notif.timestamp).getTime() > new Date(notificationsSeenAt).getTime();
    }).length;

    const markTopbarNotificationsSeen = useCallback(() => {
        const seenAt = new Date().toISOString();
        setNotificationsSeenAt(seenAt);
        if (!user?.id || typeof window === "undefined") return;
        const storageKey = getTopbarNotificationsSeenKey(user.id);
        if (storageKey) window.localStorage.setItem(storageKey, seenAt);
    }, [user?.id]);

    const markChatNotificationSeen = (messageId?: number | string | null) => {
        if (!user?.id || !messageId || typeof window === "undefined") return;
        const nextIds = Array.from(new Set([...seenChatNotificationIds.map(String), String(messageId)]));
        setSeenChatNotificationIds(nextIds);

        const storageKey = getSeenChatNotificationsKey(user.id);
        if (!storageKey) return;
        window.localStorage.setItem(storageKey, JSON.stringify(nextIds));
    };

    useEffect(() => {
        if (!user?.id || typeof window === "undefined") return;
        const storageKey = getTopbarNotificationsKey(user.id);
        if (!storageKey) return;
        try {
            const stored = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
            setNotifications(Array.isArray(stored) ? stored : []);
        } catch {
            setNotifications([]);
        }

        const seenKey = getTopbarNotificationsSeenKey(user.id);
        setNotificationsSeenAt(seenKey ? window.localStorage.getItem(seenKey) : null);
    }, [user?.id]);

    const getClearedServerNotifsKey = (userId?: number | string | null) => {
        if (!userId) return null;
        return `googer-cleared-server-notifs-${userId}`;
    };

    // Fetch server-sent notifications and merge with local ones
    useEffect(() => {
        if (!user?.id) return;
        const fetchServerNotifications = async () => {
            try {
                if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
                const token = authService.getToken?.();
                if (!token) return;
                const res = await fetch('/api/notifications', { headers: { Authorization: `Bearer ${token}` } });
                if (!res.ok) return;
                const contentType = res.headers.get("content-type") || "";
                if (!contentType.includes("application/json")) return;
                const data = await res.json().catch(() => null);
                if (!data) return;

                // Load IDs the user already cleared so they don't reappear
                const clearedKey = getClearedServerNotifsKey(user.id);
                let clearedIds: Set<string> = new Set();
                try {
                    const stored = JSON.parse(window.localStorage.getItem(clearedKey || "") || "[]");
                    clearedIds = new Set(Array.isArray(stored) ? stored.map(String) : []);
                } catch { }

                const serverNotifs = (data.notifications || [])
                    .filter((n: any) => !clearedIds.has(String(n.id)))
                    .map((n: any) => ({
                        id: `server-${n.id}`,
                        _serverId: String(n.id),
                        type: n.type || 'info',
                        title: n.title,
                        message: n.message,
                        timestamp: n.created_at,
                        is_read: n.is_read,
                        theme_color: n.theme_color || null,
                        theme_font_color: n.theme_font_color || null,
                        theme_font_size: n.theme_font_size || null,
                    }));
                if (serverNotifs.length > 0) {
                    setNotifications(prev => {
                        const existingIds = new Set(prev.map((p: any) => p.id));
                        const newOnes = serverNotifs.filter((n: any) => !existingIds.has(n.id));
                        if (newOnes.length === 0) return prev;
                        return [...newOnes, ...prev].slice(0, 50);
                    });
                }
            } catch { }
        };
        fetchServerNotifications();
        const interval = setInterval(fetchServerNotifications, 60000);
        return () => clearInterval(interval);
    }, [user?.id]);

    useEffect(() => {
        const handleAddNotification = (e: any) => {
            setNotifications(prev => {
                const detail = { ...e.detail, timestamp: e.detail.timestamp || new Date().toISOString() };
                const next = [detail, ...prev.filter((item) => item?.id !== detail?.id)].slice(0, 30);
                if (user?.id && typeof window !== "undefined") {
                    const storageKey = getTopbarNotificationsKey(user.id);
                    if (storageKey) window.localStorage.setItem(storageKey, JSON.stringify(next));
                }
                return next;
            });
        };
        window.addEventListener('add-notification', handleAddNotification);
        return () => window.removeEventListener('add-notification', handleAddNotification);
    }, [user?.id]);

    useEffect(() => {
        if (showNotifications && notifications.length > 0) markTopbarNotificationsSeen();
    }, [showNotifications, notifications.length, markTopbarNotificationsSeen]);

    useEffect(() => {
        if (!user?.id || typeof window === "undefined") return;

        const storageKey = getSeenChatNotificationsKey(user.id);
        if (!storageKey) return;

        try {
            const storedIds = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
            setSeenChatNotificationIds(Array.isArray(storedIds) ? storedIds : []);
        } catch {
            setSeenChatNotificationIds([]);
        } finally {
            setSeenChatNotificationsReady(true);
        }
    }, [user?.id]);

    useEffect(() => {
        if (!user?.id || !seenChatNotificationsReady) return;

        const refreshChatNotification = async () => {
            try {
                if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
                const conversations = await chatService.getConversations();
                const latest = (Array.isArray(conversations) ? conversations : [])
                    .filter((entry: any) =>
                        entry?.unread_count > 0 &&
                        entry?.lastMessage?.id &&
                        !seenChatNotificationIds.map(String).includes(String(entry.lastMessage.id))
                    )
                    .sort((a: any, b: any) =>
                        new Date(b?.lastMessage?.created_at || 0).getTime() - new Date(a?.lastMessage?.created_at || 0).getTime()
                    )[0] || null;

                if (!latest?.lastMessage?.id) {
                    setChatNotification(null);
                    return;
                }

                setChatNotification({
                    participant: latest.participant ? {
                        ...latest.participant,
                        name: getUserDisplayName(latest.participant, latest.participant.name || "User"),
                    } : latest.participant,
                    message: latest.lastMessage,
                });
            } catch (notificationError) {
                const message = notificationError instanceof Error ? notificationError.message : "";
                if (message && /authentication|token|session/i.test(message)) return;
                console.error("Error loading chat notification:", notificationError);
            }
        };

        refreshChatNotification();
        const intervalId = window.setInterval(refreshChatNotification, 15000);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [user?.id, seenChatNotificationIds, seenChatNotificationsReady]);

    return (
        <header className={`fixed left-0 right-0 top-0 z-50 flex items-start justify-between border-b border-[#27272a] bg-[#18181b]/80 px-4 backdrop-blur-md md:px-6 ${isAdCampaignPage ? "h-14 items-center" : "h-20 pt-1"}`}>
            {/* Brand */}
            <Link href="/dashboard" className="flex h-10 shrink-0 items-center gap-2.5">
                <div className="relative w-8 h-8 rounded-full overflow-hidden border border-white/10">
                    <Image
                        src="/assets/images/googer.png"
                        alt="Googer Logo"
                        fill
                        className="object-contain"
                    />
                </div>
                <h1 className="text-xl font-bold tracking-tight text-white hidden sm:block">
                    {isAdCampaignPage ? (
                        <>
                            <span>Googer </span>
                            <span className="text-sm">{isUploadContentPage ? "Upload" : "Ads"}</span>
                        </>
                    ) : "Googer"}
                </h1>
            </Link>

            {/* Navigation (Desktop) */}
            <nav className="hidden md:flex items-center gap-1 absolute left-1/2 top-2 -translate-x-1/2">
                {isAdCampaignPage ? (
                    isUploadContentPage ? (
                    <div />
                    ) : (
                    <>
                        <Link
                            href="/dashboard/ad-campaign/photo-video"
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-300 group ${activeCampaignTab === "photo-video"
                                ? "bg-white/10 text-white shadow-lg shadow-white/5"
                                : "text-gray-400 hover:bg-white/5 hover:text-white"
                                }`}
                        >
                            <div className="text-xl flex items-center">
                                <IonIcon name={activeCampaignTab === "photo-video" ? "images" : "images-outline"} />
                            </div>
                            <span className="font-bold text-[10px] uppercase tracking-widest">Photo and Video</span>
                        </Link>
                        <Link
                            href="/dashboard/ad-campaign/product-promote"
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-300 group ${activeCampaignTab === "product-promote"
                                ? "bg-white/10 text-white shadow-lg shadow-white/5"
                                : "text-gray-400 hover:bg-white/5 hover:text-white"
                                }`}
                        >
                            <div className="text-xl flex items-center">
                                <IonIcon name={activeCampaignTab === "product-promote" ? "cube" : "cube-outline"} />
                            </div>
                            <span className="font-bold text-[10px] uppercase tracking-widest">Product Promote</span>
                        </Link>
                        <Link
                            href="/dashboard/ad-campaign/profile-promote"
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-300 group ${activeCampaignTab === "profile-promote"
                                ? "bg-white/10 text-white shadow-lg shadow-white/5"
                                : "text-gray-400 hover:bg-white/5 hover:text-white"
                                }`}
                        >
                            <div className="text-xl flex items-center">
                                <IonIcon name={activeCampaignTab === "profile-promote" ? "person" : "person-outline"} />
                            </div>
                            <span className="font-bold text-[10px] uppercase tracking-widest">Profile Promote</span>
                        </Link>
                    </>
                    )
                ) : (
                    <>
                        {menuItems.slice(0, 2).map((item) => {
                            const isActive = pathname === item.href;
                            return (
                                <Link
                                    key={item.name}
                                    href={item.href}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-300 group ${isActive
                                        ? "bg-white/10 text-white shadow-lg shadow-white/5"
                                        : "text-gray-400 hover:bg-white/5 hover:text-white"
                                        }`}
                                >
                                    <div className="text-xl flex items-center">
                                        <IonIcon name={isActive ? item.icon : item.icon + "-outline"} />
                                    </div>
                                    <span className="font-bold text-[10px] uppercase tracking-widest">{item.name}</span>
                                </Link>
                            );
                        })}

                        <button
                            onClick={() => {
                                window.dispatchEvent(new CustomEvent('open-create-action-menu'));
                            }}
                            onMouseEnter={prefetchAdCampaignRoutes}
                            onFocus={prefetchAdCampaignRoutes}
                            onTouchStart={prefetchAdCampaignRoutes}
                            className="flex items-center justify-center w-12 h-10 rounded-xl text-gray-400 hover:bg-white/10 hover:text-white transition-all duration-300 group mx-2 z-10"
                            title="Create"
                            suppressHydrationWarning={true}
                        >
                            <div className="text-3xl flex items-center group-hover:scale-110 transition-transform">
                                <IonIcon name="add-circle" />
                            </div>
                        </button>

                        {menuItems.slice(2).map((item) => {
                            const isActive = pathname === item.href;
                            return (
                                <button
                                    key={item.name}
                                    type="button"
                                    onClick={() => openProtectedArea(item.href, item.name)}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-300 group ${isActive
                                        ? "bg-white/10 text-white shadow-lg shadow-white/5"
                                        : "text-gray-400 hover:bg-white/5 hover:text-white"
                                        }`}
                                >
                                    <div className="text-xl flex items-center">
                                        <IonIcon name={isActive ? item.icon : item.icon + "-outline"} />
                                    </div>
                                    <span className="font-bold text-[10px] uppercase tracking-widest">{item.name}</span>
                                </button>
                            );
                        })}
                    </>
                )}
            </nav>

            {/* Search Portal Container */}
            {isAdCampaignPage ? (
                <div className="mx-2 flex-1 overflow-x-auto md:hidden [scrollbar-width:none] [-ms-overflow-style:none]">
                    <div className="flex min-w-max items-center gap-2 pr-1">
                        {isUploadContentPage ? (
                        <div />
                        ) : (
                        <>
                        <Link
                            href="/dashboard/ad-campaign/photo-video"
                            className={`flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 transition ${activeCampaignTab === "photo-video"
                                ? "bg-white/10 text-white shadow-lg shadow-white/5"
                                : "text-gray-300 hover:bg-white/5 hover:text-white"
                                }`}
                        >
                            <IonIcon name={activeCampaignTab === "photo-video" ? "images" : "images-outline"} className="text-sm" />
                            <span className="whitespace-nowrap text-[9px] font-black uppercase tracking-widest">Photo & Video</span>
                        </Link>
                        <Link
                            href="/dashboard/ad-campaign/product-promote"
                            className={`flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 transition ${activeCampaignTab === "product-promote"
                                ? "bg-white/10 text-white shadow-lg shadow-white/5"
                                : "text-gray-300 hover:bg-white/5 hover:text-white"
                                }`}
                        >
                            <IonIcon name={activeCampaignTab === "product-promote" ? "cube" : "cube-outline"} className="text-sm" />
                            <span className="whitespace-nowrap text-[9px] font-black uppercase tracking-widest">Product Promote</span>
                        </Link>
                        <Link
                            href="/dashboard/ad-campaign/profile-promote"
                            className={`flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 transition ${activeCampaignTab === "profile-promote"
                                ? "bg-white/10 text-white shadow-lg shadow-white/5"
                                : "text-gray-300 hover:bg-white/5 hover:text-white"
                                }`}
                        >
                            <IonIcon name={activeCampaignTab === "profile-promote" ? "person" : "person-outline"} className="text-sm" />
                            <span className="whitespace-nowrap text-[9px] font-black uppercase tracking-widest">Profile Promote</span>
                        </Link>
                        </>
                        )}
                    </div>
                </div>
            ) : (
                <div id="shop-search-portal" className="absolute bottom-[-24px] left-1/2 mx-2 w-[min(540px,40vw)] -translate-x-1/2"></div>
            )}

            {/* Actions & Profile Menu */}
            <div className="flex h-10 items-center gap-1 sm:gap-2">
                {/* Cart Icon - desktop only */}
                <div className="relative hidden md:block">
                    <button
                        onClick={() => {
                            if (isCartLocked) {
                                return;
                            }
                            setIsCartOpen(!isCartOpen);
                        }}
                        className={`w-7 h-7 flex items-center justify-center transition-all duration-300 rounded-full relative group
                        ${isCartLocked ? 'opacity-50 cursor-not-allowed' : ''}
                        ${isCartOpen ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
                        title="Cart"
                        suppressHydrationWarning={true}
                    >
                        <IonIcon name={isCartOpen ? "cart" : "cart-outline"} className="text-base group-hover:scale-110 transition-transform" />
                        {cartCount > 0 && (
                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 text-white text-[9px] font-black rounded-full flex items-center justify-center border-2 border-[#18181b] animate-in zoom-in duration-300">
                                {cartCount}
                            </span>
                        )}
                    </button>

                    {chatNotification && (
                        <div className="absolute top-11 right-0 w-56 bg-[#111114] border border-white/10 rounded-2xl p-3 text-left shadow-2xl">
                            <div className="flex items-start justify-between gap-2">
                                <button
                                    onClick={() => {
                                        markChatNotificationSeen(chatNotification.message.id);
                                        router.push(`/chats?user=${chatNotification.participant.id}`);
                                    }}
                                    className="min-w-0 flex-1 text-left hover:opacity-90 transition-all"
                                >
                                    <div className="text-[8px] font-black uppercase tracking-widest text-blue-400 truncate">
                                        {chatNotification.participant.name}
                                    </div>
                                    <div className="text-[10px] text-white/70 font-bold mt-1 truncate">
                                        {getMessagePreview(chatNotification.message)}
                                    </div>
                                </button>
                                <button
                                    onClick={() => markChatNotificationSeen(chatNotification.message.id)}
                                    className="w-6 h-6 rounded-full hover:bg-white/5 text-white/40 hover:text-white/70 transition-all flex items-center justify-center shrink-0"
                                    aria-label="Dismiss chat notification"
                                >
                                    <IonIcon name="close-outline" className="text-sm" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Notification Button */}
                <div className="relative">
                    <button
                        onClick={() => {
                            const next = !showNotifications;
                            setShowNotifications(next);
                            if (next) markTopbarNotificationsSeen();
                        }}
                        className={`w-9 h-9 flex items-center justify-center transition-all duration-300 rounded-full relative group
                        ${showNotifications ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                        suppressHydrationWarning={true}
                    >
                        <IonIcon name={showNotifications ? "notifications" : "notifications-outline"} className="text-xl" />
                        {unreadNotificationCount > 0 && (
                            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-[#18181b] bg-pink-500 px-1 text-[8px] font-black leading-none text-white">
                                {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
                            </span>
                        )}
                    </button>

                    {/* Notification Dropdown */}
                    {showNotifications && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)}></div>
                            <div className="absolute right-0 mt-4 w-72 md:w-80 bg-[#1e1e24] border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                                    <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Notifications</h3>
                                    {notifications.length > 0 && (
                                        <button
                                            onClick={() => {
                                                if (user?.id && typeof window !== "undefined") {
                                                    // Persist cleared server IDs so they don't reappear after refresh/poll
                                                    const clearedKey = getClearedServerNotifsKey(user.id);
                                                    if (clearedKey) {
                                                        const serverIds = notifications
                                                            .filter((n: any) => n._serverId)
                                                            .map((n: any) => String(n._serverId));
                                                        if (serverIds.length > 0) {
                                                            let existing: string[] = [];
                                                            try { existing = JSON.parse(window.localStorage.getItem(clearedKey) || "[]"); } catch { }
                                                            window.localStorage.setItem(clearedKey, JSON.stringify([...new Set([...existing, ...serverIds])]));
                                                        }
                                                    }
                                                    const storageKey = getTopbarNotificationsKey(user.id);
                                                    if (storageKey) window.localStorage.setItem(storageKey, "[]");
                                                }
                                                setNotifications([]);
                                                markTopbarNotificationsSeen();
                                                // Mark all read on server so they don't come back via poll
                                                const token = authService.getToken?.();
                                                if (token) {
                                                    fetch('/api/notifications/read-all', {
                                                        method: 'POST',
                                                        headers: { Authorization: `Bearer ${token}` },
                                                    }).catch(() => {});
                                                }
                                            }}
                                            className="text-[9px] font-bold text-blue-400 hover:text-blue-300 transition-colors uppercase"
                                        >
                                            Clear All
                                        </button>
                                    )}
                                </div>
                                <div className="max-h-80 overflow-y-auto custom-scrollbar">
                                    {notifications.length > 0 ? (
                                        notifications.map((notif) => {
                                            const notifTimestamp = notif.timestamp || notif.created_at || null;
                                            const themeColor: string | null = notif.theme_color || notif.themeColor || notif.background_color || notif.backgroundColor || notif.color || null;
                                            const fontColor: string | null = notif.theme_font_color || notif.themeFontColor || notif.font_color || notif.fontColor || null;
                                            const fontSizeKey: string = String(notif.theme_font_size || notif.themeFontSize || notif.font_size || notif.fontSize || "normal").toLowerCase();
                                            const titleFontSize = fontSizeKey === "large" ? "13px" : fontSizeKey === "small" ? "10px" : "11px";
                                            const messageFontSize = fontSizeKey === "large" ? "11px" : fontSizeKey === "small" ? "9px" : "10px";
                                            const isGradient = !!themeColor && /gradient\(/i.test(themeColor);
                                            const themedItemStyle = themeColor
                                                ? {
                                                    background: isGradient
                                                        ? themeColor
                                                        : `linear-gradient(135deg, color-mix(in srgb, ${themeColor} 55%, #101014), #1e1e24 78%)`,
                                                    borderColor: "rgba(255,255,255,0.12)",
                                                }
                                                : undefined;
                                            const fallbackIconBg =
                                                notif.type === 'promo_code' ? 'bg-purple-500/20 text-purple-400' :
                                                    notif.type === 'success' ? 'bg-green-500/20 text-green-500' :
                                                        notif.type === 'error' ? 'bg-red-500/20 text-red-400' :
                                                            notif.type === 'warning' ? 'bg-amber-500/20 text-amber-400' :
                                                                notif.type === 'custom' ? 'bg-fuchsia-500/20 text-fuchsia-300' :
                                                                    'bg-blue-500/20 text-blue-500';
                                            const iconName =
                                                notif.type === 'promo_code' ? 'pricetag' :
                                                    notif.type === 'success' ? 'checkmark-circle' :
                                                        notif.type === 'error' ? 'alert-circle' :
                                                            notif.type === 'warning' ? 'warning' :
                                                                notif.type === 'custom' ? 'sparkles' :
                                                                    'information-circle';
                                            return (
                                                <div
                                                    key={notif.id}
                                                    className="relative border-b border-white/5 hover:brightness-110 transition-all animate-in slide-in-from-right-4 overflow-hidden"
                                                    style={themedItemStyle}
                                                >
                                                    {/* Gradient left accent bar */}
                                                    {themeColor && (
                                                        <div
                                                            className="absolute left-0 top-0 bottom-0 w-1 rounded-r"
                                                            style={{ background: themeColor }}
                                                        />
                                                    )}
                                                    <div className="flex gap-3 p-4 pl-5">
                                                        {/* Icon with theme gradient or fallback */}
                                                        <div
                                                            className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center ${themeColor ? "text-white shadow-lg shadow-black/20" : fallbackIconBg}`}
                                                            style={themeColor ? { background: themeColor } : undefined}
                                                        >
                                                            <IonIcon name={iconName} className="text-base text-white" />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            {/* Title with gradient text when theme set */}
                                                            <p
                                                                className="font-bold mb-0.5"
                                                                style={{ color: fontColor || "white", fontSize: titleFontSize }}
                                                            >
                                                                {notif.title}
                                                            </p>
                                                            <p
                                                                className={`leading-relaxed mb-1.5 ${fontColor ? "" : themeColor ? "text-white/85" : "text-slate-400"}`}
                                                                style={{ ...(fontColor ? { color: fontColor } : {}), fontSize: messageFontSize }}
                                                            >
                                                                {notif.message}
                                                            </p>
                                                            {notif.type === 'promo_code' && notif.promoCode && (
                                                                <button
                                                                    onClick={() => { navigator.clipboard?.writeText(notif.promoCode).catch(() => {}); }}
                                                                    className="flex items-center gap-1.5 bg-purple-500/15 border border-purple-500/30 rounded-lg px-2.5 py-1.5 mt-1 w-full hover:bg-purple-500/25 transition-colors group"
                                                                    title="Click to copy"
                                                                >
                                                                    <IonIcon name="copy-outline" className="text-purple-400 text-sm shrink-0 group-hover:scale-110 transition-transform" />
                                                                    <span className="font-mono text-[12px] font-black text-purple-300 tracking-widest flex-1 text-left">{notif.promoCode}</span>
                                                                    <span className="text-[9px] text-purple-500 uppercase font-bold shrink-0">Tap to copy</span>
                                                                </button>
                                                            )}
                                                            {notifTimestamp && (
                                                                <div className="flex items-center gap-1.5 mt-1.5">
                                                                    <IonIcon name="time-outline" className={`text-[10px] shrink-0 ${themeColor ? "text-white/45" : "text-slate-600"}`} />
                                                                    <span className={`text-[9px] font-semibold ${themeColor ? "text-white/45" : "text-slate-600"}`}>
                                                                        <RelativeTime timestamp={notifTimestamp} />
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <div className="py-12 flex flex-col items-center justify-center text-slate-500">
                                            <IonIcon name="notifications-off-outline" className="text-3xl mb-3 opacity-20" />
                                            <p className="text-[10px] font-bold uppercase tracking-widest opacity-40">No notifications yet</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Profile Link */}
                <div className="ml-2">
                    {loading ? (
                        <div className="w-9 h-9 rounded-full border-2 border-white/10 border-t-purple-500 animate-spin"></div>
                    ) : profileImage && !profileImageFailed ? (
                        <div className="relative w-9 h-9">
                            <Link
                                href="/dashboard/profile"
                                className="block w-9 h-9 rounded-full overflow-hidden border-2 border-white/10 hover:border-purple-500/50 transition-all active:scale-95 group"
                            >
                                <Image
                                    src={profileImage}
                                    alt={profileName}
                                    fill
                                    className="rounded-full object-cover group-hover:scale-110 transition-transform duration-300"
                                    onError={() => setProfileImageFailed(true)}
                                />
                            </Link>
                            {userBadge && (
                                <span className="absolute bottom-0 right-0 bg-[#18181b] rounded-full p-px z-10 pointer-events-none">
                                    <BadgeSvg color={userBadge.color} tickColor={userBadge.tickColor} size={11} />
                                </span>
                            )}
                        </div>
                    ) : user ? (
                        <div className="relative w-9 h-9">
                            <Link
                                href="/dashboard/profile"
                                className="flex w-9 h-9 items-center justify-center rounded-full overflow-hidden border-2 border-white/10 bg-zinc-800 text-xs font-black text-white hover:border-purple-500/50 transition-all active:scale-95"
                            >
                                {profileInitial}
                            </Link>
                            {userBadge && (
                                <span className="absolute bottom-0 right-0 bg-[#18181b] rounded-full p-px z-10 pointer-events-none">
                                    <BadgeSvg color={userBadge.color} tickColor={userBadge.tickColor} size={11} />
                                </span>
                            )}
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => openLoginModal()}
                            className="relative block w-9 h-9 rounded-full overflow-hidden border-2 border-white/10 flex items-center justify-center bg-slate-800 hover:border-purple-500/50 transition-all"
                        >
                            <IonIcon name="person-outline" className="text-slate-400" />
                        </button>
                    )}
                </div>
            </div>
        </header>
    );
}
