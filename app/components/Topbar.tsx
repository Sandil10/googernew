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
                {menuItems.map((item) => {
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

            {/* Actions & Profile Menu */}
            <div className="flex items-center gap-2">
                {/* Notification Button */}
                <button className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-white transition-colors rounded-full hover:bg-white/5 relative">
                    <IonIcon name="notifications-outline" className="text-xl" />
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-pink-500 rounded-full border-2 border-[#18181b]"></span>
                </button>

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
