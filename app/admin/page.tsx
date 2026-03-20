"use client";

import Link from 'next/link';
import IonIcon from '@/app/components/IonIcon';
import Image from "next/image";
import { useState, useEffect } from "react";

// Mock Data
const STORIES = [
    { id: 1, name: "Johnson", img: "https://i.pravatar.cc/150?u=1" },
    { id: 2, name: "James", img: "https://i.pravatar.cc/150?u=2" },
    { id: 3, name: "John", img: "https://i.pravatar.cc/150?u=3" },
    { id: 4, name: "Martin", img: "https://i.pravatar.cc/150?u=4" },
    { id: 5, name: "Clara", img: "https://i.pravatar.cc/150?u=5" },
    { id: 6, name: "Steve", img: "https://i.pravatar.cc/150?u=6" },
    { id: 7, name: "Karen", img: "https://i.pravatar.cc/150?u=7" },
    { id: 8, name: "Bob", img: "https://i.pravatar.cc/150?u=8" },
];

const SUGGESTIONS = [
    { id: 1, name: "Johnson Smith", sub: "Suggested For You", img: "https://i.pravatar.cc/150?u=1" },
    { id: 2, name: "James Lewis", sub: "Followed By Johnson", img: "https://i.pravatar.cc/150?u=2" },
    { id: 3, name: "John Michael", sub: "Followed By Monroe", img: "https://i.pravatar.cc/150?u=3" },
    { id: 4, name: "Monroe Parker", sub: "Suggested For You", img: "https://i.pravatar.cc/150?u=monroe" },
    { id: 5, name: "Martin Gray", sub: "Suggested For You", img: "https://i.pravatar.cc/150?u=4" },
];

const POSTS = [
    {
        id: 1,
        user: { name: "Monroe Parker", img: "https://i.pravatar.cc/150?u=monroe", time: "2 hours ago" },
        text: "Enjoying the weekend vibes! 🌿",
        image: "https://picsum.photos/seed/monroe/800/600",
        likes: 124,
        comments: 18,
    },
    {
        id: 2,
        user: { name: "James Lewis", img: "https://i.pravatar.cc/150?u=2", time: "5 hours ago" },
        text: "New artwork in progress...",
        image: "https://picsum.photos/seed/james/800/600",
        likes: 89,
        comments: 5,
    },
];

export default function DashboardPage() {
    const [activeStory, setActiveStory] = useState<number | null>(null);
    const [postText, setPostText] = useState("");
    const [linkPreview, setLinkPreview] = useState<{ url: string; image: string; title?: string } | null>(null);
    const [isFetchingLink, setIsFetchingLink] = useState(false);

    useEffect(() => {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const match = postText.match(urlRegex);
        if (match && match[0] !== linkPreview?.url) {
            const url = match[0];
            fetchLinkPreview(url);
        } else if (!match) {
            setLinkPreview(null);
        }
    }, [postText]);

    const fetchLinkPreview = async (url: string) => {
        setIsFetchingLink(true);
        try {
            let previewImage = "";
            let title = "";

            if (url.includes("youtube.com") || url.includes("youtu.be")) {
                const vid = url.includes("v=") ? url.split("v=")[1].split("&")[0] : url.split("/").pop();
                previewImage = `https://img.youtube.com/vi/${vid}/maxresdefault.jpg`;
                title = "YouTube Video";
            } else if (url.match(/\.(jpeg|jpg|gif|png)$/) != null) {
                previewImage = url;
                title = "Image Link";
            } else {
                // Fallback to Microlink screenshot
                previewImage = `https://api.microlink.io?url=${encodeURIComponent(url)}&screenshot=true&embed=screenshot.url`;
                title = new URL(url).hostname;
            }

            setLinkPreview({ url, image: previewImage, title });
        } catch (e) {
            console.error("Link preview error:", e);
        } finally {
            setIsFetchingLink(false);
        }
    };

    return (
        <div className="flex gap-8 max-w-7xl mx-auto pt-6">
            {/* Main Feed Column */}
            <div className="flex-1 w-full max-w-2xl mx-auto space-y-6">
                {/* Stories Section */}
                <div className="flex items-center gap-4 overflow-x-auto pb-4 scrollbar-hide">
                    {/* Add Story Button */}
                    <div className="flex flex-col items-center gap-2 min-w-[70px] cursor-pointer">
                        <div className="w-16 h-16 rounded-full bg-gray-800 border-2 border-gray-700 flex items-center justify-center hover:bg-gray-700 transition-colors">
                            <span className="text-2xl text-white">+</span>
                        </div>
                        <span className="text-xs text-gray-400 font-medium">Add Story</span>
                    </div>

                    {/* User Stories */}
                    {STORIES.map((story) => (
                        <div key={story.id} className="flex flex-col items-center gap-2 min-w-[70px] cursor-pointer group">
                            <div className="relative w-16 h-16 rounded-full p-[2px] bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 group-hover:scale-105 transition-transform">
                                <div className="w-full h-full rounded-full border-2 border-[#0b1221] overflow-hidden relative bg-gray-800">
                                    <Image src={story.img} alt={story.name} fill className="object-cover" />
                                </div>
                            </div>
                            <span className="text-xs text-gray-300 font-medium truncate w-16 text-center">{story.name}</span>
                        </div>
                    ))}
                </div>

                {/* Create Post Input and Preview */}
                <div className="flex flex-col gap-4">
                    <div className="bg-[#162033] rounded-2xl p-4 flex items-center gap-4 shadow-lg border border-gray-800">
                        <div className="relative w-10 h-10 rounded-full overflow-hidden shrink-0">
                            <Image src="https://i.pravatar.cc/150?u=monroe" alt="Me" fill className="object-cover" />
                        </div>
                        <input
                            type="text"
                            value={postText}
                            onChange={(e) => setPostText(e.target.value)}
                            placeholder="What do you have in mind?"
                            className="flex-1 bg-gray-800/50 text-white placeholder-gray-500 text-sm rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-gray-600 transition-all"
                        />
                        <div className="flex gap-2">
                            <button className="p-2 bg-blue-500/10 text-blue-400 rounded-lg hover:bg-blue-500/20 transition-colors flex items-center justify-center w-10 h-10">
                                <IonIcon name="image" size="large" />
                            </button>
                            <button className="p-2 bg-pink-500/10 text-pink-400 rounded-lg hover:bg-pink-500/20 transition-colors flex items-center justify-center w-10 h-10">
                                <IonIcon name="videocam" size="large" />
                            </button>
                        </div>
                    </div>

                    {/* Link Preview Card */}
                    {linkPreview && (
                        <div className="bg-[#162033] border border-white/10 rounded-2xl overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300 shadow-2xl">
                            <div className="relative aspect-video w-full bg-black/40">
                                {isFetchingLink ? (
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <div className="w-8 h-8 border-2 border-white/10 border-t-white animate-spin rounded-full" />
                                    </div>
                                ) : (
                                    <Image src={linkPreview.image} alt="Preview" fill className="object-cover" />
                                )}
                                <button
                                    onClick={() => setLinkPreview(null)}
                                    className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black transition-all"
                                >
                                    <IonIcon name="close" />
                                </button>
                            </div>
                            <div className="p-4 flex items-center justify-between">
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">{linkPreview.title || "Link Preview"}</span>
                                    <span className="text-xs text-white/60 truncate max-w-[200px] md:max-w-xs">{linkPreview.url}</span>
                                </div>
                                <button className="px-5 py-2.5 bg-white text-black text-[10px] font-black uppercase tracking-widest rounded-xl hover:scale-105 transition-transform active:scale-95">Post Now</button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Feed Posts */}
                <div className="space-y-6">
                    {POSTS.map((post) => (
                        <div key={post.id} className="bg-[#162033] rounded-2xl overflow-hidden shadow-lg border border-gray-800">
                            {/* Header */}
                            <div className="p-4 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="relative w-10 h-10 rounded-full overflow-hidden border border-gray-700">
                                        <Image src={post.user.img} alt={post.user.name} fill className="object-cover" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-sm text-white">{post.user.name}</h3>
                                        <p className="text-xs text-gray-400">{post.user.time}</p>
                                    </div>
                                </div>
                                <button className="text-gray-400 hover:text-white transition-colors">
                                    <span className="text-xl">•••</span>
                                </button>
                            </div>

                            {/* Text Content */}
                            {post.text && (
                                <div className="px-4 pb-3">
                                    <p className="text-sm text-gray-300 leading-relaxed">{post.text}</p>
                                </div>
                            )}

                            {/* Image Content */}
                            <div className="relative aspect-[4/3] w-full bg-gray-900 border-t border-b border-gray-800">
                                <Image src={post.image} alt="Post content" fill className="object-cover" />
                            </div>

                            {/* Engagement Footer */}
                            <div className="p-4 flex items-center justify-between text-gray-400 text-sm">
                                <div className="flex items-center gap-6">
                                    <button className="flex items-center gap-2 hover:text-pink-500 transition-colors group">
                                        <span className="group-hover:scale-110 transition-transform">❤️</span>
                                        <span>{post.likes}</span>
                                    </button>
                                    <button className="flex items-center gap-2 hover:text-blue-400 transition-colors group">
                                        <span className="group-hover:scale-110 transition-transform">💬</span>
                                        <span>{post.comments}</span>
                                    </button>
                                    <button className="flex items-center gap-2 hover:text-green-400 transition-colors group">
                                        <span className="group-hover:scale-110 transition-transform">🚀</span>
                                    </button>
                                </div>
                                <button className="hover:text-yellow-400 transition-colors">
                                    <span>🔖</span>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Right Sidebar (Suggestions) */}
            <div className="hidden xl:block w-80 shrink-0 space-y-6">
                {/* People You Might Know */}
                <div className="bg-[#162033] rounded-2xl p-5 shadow-lg border border-gray-800 sticky top-6">
                    <div className="flex items-center justify-between mb-5">
                        <h3 className="font-bold text-base text-white">People You might know</h3>
                        <button className="text-gray-400 hover:text-white transition-transform active:rotate-180">↻</button>
                    </div>

                    <div className="space-y-5">
                        {SUGGESTIONS.map((user) => (
                            <div key={user.id} className="flex items-center justify-between group">
                                <div className="flex items-center gap-3">
                                    <div className="relative w-10 h-10 rounded-full overflow-hidden border border-gray-700">
                                        <Image src={user.img} alt={user.name} fill className="object-cover group-hover:scale-105 transition-transform" />
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-semibold text-white group-hover:text-blue-400 transition-colors">{user.name}</h4>
                                        <p className="text-[10px] text-gray-400 uppercase tracking-wide">{user.sub}</p>
                                    </div>
                                </div>
                                <button className="px-3 py-1.5 bg-gray-700 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg transition-all active:scale-95">
                                    Follow
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

            </div>
        </div>
    );
}
