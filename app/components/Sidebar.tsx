"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { authService } from "@/services/authService";
import IonIcon from "./IonIcon";

const menuItems = [
    { name: "Home", icon: "home", href: "/dashboard" },
    { name: "Shop", icon: "bag", href: "/dashboard/shop" },
    { name: "Wallet", icon: "wallet", href: "/dashboard/wallet" },
    { name: "Chats", icon: "chatbubbles", href: "/dashboard/chats" },
];

interface SidebarProps {
    isCollapsed: boolean;
    onToggle: () => void;
}

export default function Sidebar({ isCollapsed, onToggle }: SidebarProps) {
    const pathname = usePathname();
    const [showUserMenu, setShowUserMenu] = useState(false);
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

        // Listen for profile updates from other components
        window.addEventListener('userProfileUpdated', fetchUser);
        return () => window.removeEventListener('userProfileUpdated', fetchUser);
    }, []);

    const handleLogout = () => {
        authService.logout();
    };

    // Generate profile image URL
    const profileImage = user?.profile_picture
        ? (user.profile_picture.startsWith('http') || user.profile_picture.startsWith('data:') ? user.profile_picture : `/uploads/${user.profile_picture.split(/[\\/]/).pop()}`)
        : (user ? `https://ui-avatars.com/api/?name=${encodeURIComponent(user.full_name || user.username)}&size=200&background=random` : "");

    return (
        <aside
            className={`fixed left-0 top-0 h-screen bg-[#18181b] text-white flex flex-col border-r border-[#27272a] z-50 transition-all duration-300 ${isCollapsed ? "w-20" : "w-64"
                }`}
        >
            {/* Brand */}
            <div className="p-6 relative flex items-center gap-3">
                <div className="relative w-8 h-8 rounded-full overflow-hidden shrink-0">
                    <Image
                        src="/assets/images/googer.png"
                        alt="Googer Logo"
                        fill
                        className="object-contain"
                    />
                </div>
                {!isCollapsed && (
                    <h1 className="text-xl font-bold tracking-wide transition-opacity duration-300">Googer</h1>
                )}

                {/* Collapse Toggle Button */}
                <button
                    onClick={onToggle}
                    className="absolute -right-3 top-7 w-6 h-6 bg-gray-700 text-white rounded-full flex items-center justify-center border border-gray-600 hover:bg-gray-600 transition-colors z-50"
                >
                    <IonIcon name={isCollapsed ? "chevron-forward-outline" : "chevron-back-outline"} />
                </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto px-4 space-y-1 mt-4">
                {menuItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={`flex items-center gap-4 px-3 py-3 rounded-lg transition-colors group ${isActive ? "bg-white/10 text-white" : "text-gray-400 hover:bg-white/5 hover:text-white"
                                } ${isCollapsed ? "justify-center" : ""}`}
                            title={isCollapsed ? item.name : ""}
                        >
                            <div className="text-xl w-6 flex justify-center shrink-0">
                                <IonIcon name={item.icon + "-outline"} />
                            </div>
                            {!isCollapsed && (
                                <span className="font-medium text-sm transition-opacity duration-200">{item.name}</span>
                            )}
                        </Link>
                    );
                })}
            </nav>

            {/* User Profile Footer */}
            <div className="p-4 border-t border-gray-800 mt-auto relative">
                {/* User Menu Popup */}
                {showUserMenu && (
                    <>
                        {/* Backdrop */}
                        <div
                            className="fixed inset-0 z-40"
                            onClick={() => setShowUserMenu(false)}
                        ></div>

                        {/* Popup Card */}
                        <div className="absolute bottom-full left-4 right-4 mb-2 bg-[#162033] rounded-2xl shadow-2xl border border-gray-800 z-50 overflow-hidden">
                            {/* Gradient Top Bar */}
                            <div className="h-16 bg-gradient-to-r from-purple-600 via-pink-500 to-blue-500"></div>

                            {/* User Info */}
                            <div className="p-4 -mt-8">
                                <div className="flex items-start gap-3 mb-4">
                                    <div className="relative w-16 h-16 rounded-full overflow-hidden border-4 border-[#162033] shrink-0 bg-gray-800">
                                        {user && (
                                            <Image
                                                src={profileImage}
                                                alt={user.full_name || user.username}
                                                fill
                                                className="object-cover"
                                            />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0 mt-2">
                                        <h3 className="font-bold text-white text-sm truncate">
                                            {user?.full_name || user?.username || "User"}
                                        </h3>
                                        <p className="text-xs text-gray-400 truncate">@{user?.username || "user"}</p>
                                    </div>
                                </div>

                                {/* Stats */}
                                <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                                    <div>
                                        <div className="text-white font-bold text-sm">0</div>
                                        <div className="text-gray-500 text-[10px]">Posts</div>
                                    </div>
                                    <div>
                                        <div className="text-white font-bold text-sm">0</div>
                                        <div className="text-gray-500 text-[10px]">Following</div>
                                    </div>
                                    <div>
                                        <div className="text-white font-bold text-sm">0</div>
                                        <div className="text-gray-500 text-[10px]">Followers</div>
                                    </div>
                                </div>

                                {/* Menu Items */}
                                <div className="space-y-1">
                                    <Link
                                        href="/dashboard/profile"
                                        className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors text-sm text-white"
                                        onClick={() => setShowUserMenu(false)}
                                    >
                                        <span className="text-lg">
                                            <IonIcon name="person-outline" />
                                        </span>
                                        <span>Profile</span>
                                    </Link>
                                    <Link
                                        href="/dashboard/wallet"
                                        className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors text-sm text-white"
                                        onClick={() => setShowUserMenu(false)}
                                    >
                                        <span className="text-lg">
                                            <IonIcon name="wallet-outline" />
                                        </span>
                                        <span>Wallet</span>
                                    </Link>
                                    <button
                                        onClick={handleLogout}
                                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors text-sm text-red-400"
                                    >
                                        <span className="text-lg">
                                            <IonIcon name="log-out-outline" />
                                        </span>
                                        <span>Log Out</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                <div
                    className={`flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors ${isCollapsed ? "justify-center" : ""}`}
                    onClick={() => !isCollapsed && setShowUserMenu(!showUserMenu)}
                >
                    <div className="relative w-10 h-10 rounded-full overflow-hidden border border-gray-600 shrink-0 bg-gray-800">
                        {user && (
                            <Image
                                src={profileImage}
                                alt={user.full_name || user.username}
                                fill
                                className="object-cover"
                            />
                        )}
                    </div>
                    {!isCollapsed && (
                        <>
                            <div className="flex-1 min-w-0 transition-opacity duration-200">
                                <p className="text-sm font-semibold truncate">
                                    {user?.full_name || user?.username || "Loading..."}
                                </p>
                                <p className="text-xs text-gray-400 truncate">@{user?.username || "user"}</p>
                            </div>
                            <div className={`text-gray-400 transition-transform duration-200 ${showUserMenu ? "rotate-180" : ""}`}>
                                <IonIcon name="chevron-up-outline" />
                            </div>
                        </>
                    )}
                </div>
            </div>
        </aside>
    );
}
