"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { authService } from "@/services/authService";
import { chatService } from "@/services/chatService";
import IonIcon from "@/app/components/IonIcon";
import { useCart } from "@/app/context/CartContext";
import { openLoginModal, openLoginRequired } from "@/app/lib/loginRequired";

const menuItems = [
    { name: "Home", icon: "home", href: "/dashboard" },
    { name: "Shop", icon: "bag", href: "/dashboard/shop" },
    { name: "Wallet", icon: "wallet", href: "/dashboard/wallet" },
    { name: "Chats", icon: "chatbubbles", href: "/dashboard/chats" },
];

export default function Topbar() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const isAdCampaignPage = pathname === "/dashboard/ad-campaign" || (pathname?.startsWith("/dashboard/ad-campaign/") ?? false);
    const activeCampaignTab = pathname === "/dashboard/ad-campaign/photo-video"
        ? "photo-video"
        : pathname === "/dashboard/ad-campaign/product-promote"
            ? "product-promote"
            : pathname === "/dashboard/ad-campaign/profile-promote"
                ? "profile-promote"
                : (searchParams?.get("tab") || "photo-video");
    const [user, setUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const { cartCount, setIsCartOpen, isCartOpen, isGoogerPaymentCartLocked } = useCart();
    const isCartLocked = isGoogerPaymentCartLocked;
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
                if (authService.isAuthenticated()) {
                    const profile = await authService.getProfile();
                    setUser(profile);
                } else {
                    // No token at all — show logged-out state silently
                    setUser(null);
                }
            } catch (error: any) {
                if (!authService.isAuthenticated()) {
                    setUser(null);
                    return;
                }
                console.error("Error fetching user:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchUser();
    }, [router]);

    const profileImage = user?.profile_picture
        ? (user.profile_picture.startsWith('http') || user.profile_picture.startsWith('data:') ? user.profile_picture : `/uploads/${user.profile_picture.split(/[\\/]/).pop()}`)
        : user
            ? `https://ui-avatars.com/api/?name=${encodeURIComponent(user.full_name || user.username || 'User')}&size=200&background=random`
            : null; // null → we won't render the Image at all

    const [notifications, setNotifications] = useState<any[]>([]);
    const [showNotifications, setShowNotifications] = useState(false);
    const [chatNotification, setChatNotification] = useState<any>(null);
    const [seenChatNotificationIds, setSeenChatNotificationIds] = useState<(number | string)[]>([]);
    const [seenChatNotificationsReady, setSeenChatNotificationsReady] = useState(false);

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
    }, [user?.id]);

    useEffect(() => {
        const handleAddNotification = (e: any) => {
            setNotifications(prev => {
                const next = [e.detail, ...prev.filter((item) => item?.id !== e.detail?.id)].slice(0, 30);
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
                    participant: latest.participant,
                    message: latest.lastMessage,
                });
            } catch (notificationError) {
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
        <header className={`fixed left-0 right-0 top-0 z-50 flex items-center justify-between border-b border-[#27272a] bg-[#18181b]/80 px-4 backdrop-blur-md md:px-6 ${isAdCampaignPage ? "h-14" : "h-16"}`}>
            {/* Brand */}
            <Link href="/dashboard" className="flex items-center gap-2.5 shrink-0">
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
                            <span className="text-sm">Ads</span>
                        </>
                    ) : "Googer"}
                </h1>
            </Link>

            {/* Navigation (Desktop) */}
            <nav className="hidden md:flex items-center gap-1 absolute left-1/2 -translate-x-1/2">
                {isAdCampaignPage ? (
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

            {/* Search Portal Container (Mobile) */}
            {isAdCampaignPage ? (
                <div className="mx-2 flex-1 overflow-x-auto md:hidden [scrollbar-width:none] [-ms-overflow-style:none]">
                    <div className="flex min-w-max items-center gap-2 pr-1">
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
                    </div>
                </div>
            ) : (
                <div id="shop-search-portal" className="flex-1 mx-2 md:hidden"></div>
            )}

            {/* Actions & Profile Menu */}
            <div className="flex items-center gap-1 sm:gap-2">
                {/* Cart Icon */}
                <div className="relative">
                    <button
                        onClick={() => {
                            if (isCartLocked) {
                                return;
                            }
                            setIsCartOpen(!isCartOpen);
                        }}
                        className={`w-9 h-9 flex items-center justify-center transition-all duration-300 rounded-full relative group
                        ${isCartLocked ? 'opacity-50 cursor-not-allowed' : ''}
                        ${isCartOpen ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
                        title="Cart"
                        suppressHydrationWarning={true}
                    >
                        <IonIcon name={isCartOpen ? "cart" : "cart-outline"} className="text-xl group-hover:scale-110 transition-transform" />
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
                                        router.push(`/dashboard/chats?user=${chatNotification.participant.id}`);
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
                        onClick={() => setShowNotifications(!showNotifications)}
                        className={`w-9 h-9 flex items-center justify-center transition-all duration-300 rounded-full relative group
                        ${showNotifications ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                        suppressHydrationWarning={true}
                    >
                        <IonIcon name={showNotifications ? "notifications" : "notifications-outline"} className="text-xl" />
                        {notifications.length > 0 && (
                            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-pink-500 rounded-full border-2 border-[#18181b]"></span>
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
                                                setNotifications([]);
                                                if (user?.id && typeof window !== "undefined") {
                                                    const storageKey = getTopbarNotificationsKey(user.id);
                                                    if (storageKey) window.localStorage.setItem(storageKey, "[]");
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
                                        notifications.map((notif) => (
                                            <div key={notif.id} className="p-4 border-b border-white/5 hover:bg-white/[0.03] transition-colors flex gap-4 animate-in slide-in-from-right-4">
                                                <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center ${notif.type === 'success' ? 'bg-green-500/20 text-green-500' : 'bg-blue-500/20 text-blue-500'}`}>
                                                    <IonIcon name={notif.type === 'success' ? 'checkmark-circle' : 'information-circle'} className="text-lg" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[11px] font-bold text-white mb-0.5">{notif.title}</p>
                                                    <p className="text-[10px] text-slate-400 leading-relaxed mb-1.5">{notif.message}</p>
                                                    <span className="text-[9px] font-bold text-slate-600 uppercase tracking-tighter">{notif.time}</span>
                                                </div>
                                            </div>
                                        ))
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
                    ) : profileImage ? (
                        <Link
                            href="/dashboard/profile"
                            className="relative block w-9 h-9 rounded-full overflow-hidden border-2 border-white/10 hover:border-purple-500/50 transition-all active:scale-95 group"
                        >
                            <Image
                                src={profileImage}
                                alt={user?.full_name || "User"}
                                fill
                                className="object-cover group-hover:scale-110 transition-transform duration-300"
                            />
                        </Link>
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
