"use client";
export const dynamic = 'force-dynamic';

import Image from "next/image";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { authService } from "@/services/authService";
import IonIcon from "@/app/components/IonIcon";

export default function ProfilePage() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState("posts");
    const [showMenu, setShowMenu] = useState(false);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<any>(null);

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                if (!authService.isAuthenticated()) {
                    router.push('/');
                    return;
                }
                const profile = await authService.getProfile();
                setUser(profile);
            } catch (error) {
                console.error("Error fetching profile:", error);
                router.push('/');
            } finally {
                setLoading(false);
            }
        };

        fetchProfile();
    }, [router]);

    const handleLogout = () => {
        authService.logout();
    };

    const highlights = [
        { id: "add", title: "Add New", isAdd: true },
    ];

    const posts: any[] = [];

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
                <div className="w-12 h-12 border-4 border-white/5 border-t-purple-500 rounded-full animate-spin mb-4"></div>
                <p className="text-gray-500 text-sm font-medium tracking-widest uppercase animate-pulse">Loading Profile...</p>
            </div>
        );
    }

    if (!user) return null;

    // Use profile picture from database or show placeholder
    const profileImage = user.profile_picture || "https://ui-avatars.com/api/?name=" + encodeURIComponent(user.full_name || user.username) + "&size=200&background=random";

    return (
        <div className="max-w-4xl mx-auto pb-10">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row gap-6 md:gap-12 items-center justify-center mb-10">
                {/* Avatar with Gradient Border */}
                <div className="relative shrink-0">
                    <div className="w-24 h-24 sm:w-32 sm:h-32 md:w-40 md:h-40 rounded-full p-[3px] bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600">
                        <div className="w-full h-full rounded-full border-4 border-[#1c1917] overflow-hidden relative bg-gray-800">
                            <Image
                                src={profileImage}
                                alt={user.full_name || user.username}
                                fill
                                className="object-cover"
                            />
                        </div>
                    </div>
                </div>

                {/* Profile Info */}
                <div className="flex-1 max-w-lg text-center md:text-left">
                    <div className="mb-4">
                        <h1 className="text-2xl font-bold text-white mb-1">{user.full_name || user.username}</h1>
                        <p className="text-blue-400 font-medium mb-1">@{user.username}</p>
                        <p className="text-xs text-gray-500 mb-3">User ID: {user.user_id}</p>
                        <p className="text-gray-300 text-sm leading-relaxed mx-auto md:mx-0">
                            {user.bio || "No bio yet"}
                        </p>
                    </div>

                    {/* Stats */}
                    <div className="flex justify-center md:justify-start gap-6 md:gap-8 mb-6">
                        <div className="text-center md:text-left">
                            <span className="block font-bold text-white text-lg">0</span>
                            <span className="text-gray-400 text-sm">Posts</span>
                        </div>
                        <div className="text-center md:text-left">
                            <span className="block font-bold text-white text-lg">0</span>
                            <span className="text-gray-400 text-sm">Following</span>
                        </div>
                        <div className="text-center md:text-left">
                            <span className="block font-bold text-white text-lg">0</span>
                            <span className="text-gray-400 text-sm">Followers</span>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex justify-center md:justify-start gap-3 relative">
                        <button className="px-6 py-2 bg-blue-500 text-white font-semibold rounded-lg hover:bg-blue-600 transition-colors text-sm">
                            Edit Profile
                        </button>
                        <div className="relative">
                            <button
                                onClick={() => setShowMenu(!showMenu)}
                                className="p-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors h-full aspect-square flex items-center justify-center"
                            >
                                <IonIcon name="ellipsis-horizontal" />
                            </button>

                            {/* Popup Menu */}
                            {showMenu && (
                                <>
                                    <div
                                        className="fixed inset-0 z-10"
                                        onClick={() => setShowMenu(false)}
                                    ></div>
                                    <div className="absolute right-0 top-full mt-2 w-56 bg-[#162033] rounded-xl shadow-xl border border-gray-800 z-20 overflow-hidden py-1">
                                        <button className="w-full text-left px-4 py-3 text-sm text-white hover:bg-white/5 flex items-center gap-3 transition-colors">
                                            <span className="text-lg text-white">
                                                <IonIcon name="settings-outline" />
                                            </span>
                                            <span className="font-medium">Settings</span>
                                        </button>
                                        <button className="w-full text-left px-4 py-3 text-sm text-white hover:bg-white/5 flex items-center gap-3 transition-colors">
                                            <span className="text-lg text-white">
                                                <IonIcon name="share-outline" />
                                            </span>
                                            <span className="font-medium">Share Profile</span>
                                        </button>
                                        <div className="h-px bg-gray-800 my-1"></div>
                                        <button
                                            onClick={handleLogout}
                                            className="w-full text-left px-4 py-3 text-sm text-red-500 hover:bg-white/5 flex items-center gap-3 transition-colors"
                                        >
                                            <span className="text-lg text-red-500">
                                                <IonIcon name="log-out-outline" />
                                            </span>
                                            <span className="font-medium">Log Out</span>
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Highlights Section */}
            <div className="mb-10">
                <h3 className="font-bold text-white mb-4 md:text-center">Highlights</h3>
                <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide md:justify-center">
                    {highlights.map((item) => (
                        <div key={item.id} className="flex flex-col items-center gap-2 cursor-pointer min-w-[80px]">
                            <div className="w-16 h-16 rounded-2xl border-2 border-dashed border-gray-600 flex items-center justify-center text-gray-400 hover:border-gray-400 hover:text-white transition-colors bg-[#1c1917]">
                                <span className="text-2xl">+</span>
                            </div>
                            <span className="text-xs text-gray-300 font-medium">{item.title}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Tabs */}
            <div className="border-t border-gray-800 mb-6">
                <div className="flex justify-center gap-12">
                    <button
                        onClick={() => setActiveTab("posts")}
                        className={`flex items-center gap-2 py-4 border-t-2 transition-all ${activeTab === "posts" ? "border-white text-white" : "border-transparent text-gray-500 hover:text-gray-300"
                            }`}
                    >
                        <div className="text-xl">
                            <IonIcon name="camera-outline" />
                        </div>
                        <span className="text-xs font-semibold uppercase tracking-wider">Posts</span>
                    </button>
                    <button
                        onClick={() => setActiveTab("reels")}
                        className={`flex items-center gap-2 py-4 border-t-2 transition-all ${activeTab === "reels" ? "border-white text-white" : "border-transparent text-gray-500 hover:text-gray-300"
                            }`}
                    >
                        <div className="text-xl">
                            <IonIcon name="play-outline" />
                        </div>
                        <span className="text-xs font-semibold uppercase tracking-wider">Reels</span>
                    </button>
                </div>
            </div>

            {/* Grid Content */}
            {posts.length > 0 ? (
                <div className="grid grid-cols-3 gap-1 md:gap-4">
                    {posts.map((post) => (
                        <div key={post.id} className="relative aspect-square group cursor-pointer overflow-hidden rounded-md bg-gray-800">
                            <Image
                                src={post.img}
                                alt="Post"
                                fill
                                className="object-cover group-hover:scale-110 transition-transform duration-500"
                            />
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center py-20">
                    <div className="text-6xl text-gray-600 mb-4 flex justify-center">
                        <IonIcon name="camera-outline" />
                    </div>
                    <p className="text-gray-400">No posts yet</p>
                </div>
            )}
        </div>
    );
}
