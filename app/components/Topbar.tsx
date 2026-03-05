"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { authService } from "@/services/authService";
import IonIcon from "@/app/components/IonIcon";

const menuItems = [
    { name: "Home", icon: "home", href: "/dashboard" },
    { name: "Shop", icon: "bag", href: "/dashboard/shop" },
    { name: "Wallet", icon: "wallet", href: "/dashboard/wallet" },
    { name: "Chats", icon: "chatbubbles", href: "/dashboard/chats" },
];

export default function Topbar() {
    const router = useRouter();
    const pathname = usePathname();
    const [user, setUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchUser = async () => {
            try {
                if (authService.isAuthenticated()) {
                    const profile = await authService.getProfile();
                    setUser(profile);
                }
            } catch (error) {
                console.error("Error fetching user:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchUser();
    }, []);

    const profileImage = user?.profile_picture ||
        (user ? `https://ui-avatars.com/api/?name=${encodeURIComponent(user.full_name || user.username)}&size=200&background=random` : "");

    const [notifications, setNotifications] = useState<any[]>([]);
    const [showNotifications, setShowNotifications] = useState(false);

    useEffect(() => {
        const handleAddNotification = (e: any) => {
            setNotifications(prev => [e.detail, ...prev]);
        };
        window.addEventListener('add-notification', handleAddNotification);
        return () => window.removeEventListener('add-notification', handleAddNotification);
    }, []);

    return (
        <header className="fixed top-0 left-0 right-0 h-16 bg-[#18181b]/80 backdrop-blur-md border-b border-[#27272a] z-50 px-4 md:px-6 flex items-center justify-between">
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
                <h1 className="text-xl font-bold tracking-tight text-white hidden sm:block">Googer</h1>
            </Link>

            {/* Navigation (Desktop) */}
            <nav className="hidden md:flex items-center gap-1 absolute left-1/2 -translate-x-1/2">
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

                {/* Plus Button between Shop and Wallet */}
                <button
                    onClick={() => {
                        console.log("Dispatching open-add-product-modal");
                        window.dispatchEvent(new CustomEvent('open-add-product-modal'));
                    }}
                    className="flex items-center justify-center w-12 h-10 rounded-xl text-gray-400 hover:bg-white/10 hover:text-white transition-all duration-300 group mx-2 z-10"
                    title="Add Product"
                >
                    <div className="text-3xl flex items-center group-hover:scale-110 transition-transform">
                        <IonIcon name="add-circle" />
                    </div>
                </button>

                {menuItems.slice(2).map((item) => {
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
            </nav>

            {/* Search Portal Container (Mobile) */}
            <div id="shop-search-portal" className="flex-1 mx-2 md:hidden"></div>

            {/* Actions & Profile Menu */}
            <div className="flex items-center gap-1 sm:gap-2">
                {/* Cart Icon */}
                <Link
                    href="/dashboard/cart"
                    className="hidden md:flex w-9 h-9 items-center justify-center text-gray-400 hover:text-white transition-all duration-300 rounded-full hover:bg-white/10 relative group"
                    title="Cart"
                >
                    <IonIcon name="cart-outline" className="text-xl group-hover:scale-110 transition-transform" />
                </Link>

                {/* Notification Button */}
                <div className="relative">
                    <button
                        onClick={() => setShowNotifications(!showNotifications)}
                        className={`w-9 h-9 flex items-center justify-center transition-all duration-300 rounded-full relative group
                        ${showNotifications ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
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
                                            onClick={() => setNotifications([])}
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
                    ) : (
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
                    )}
                </div>
            </div>
        </header>
    );
}
