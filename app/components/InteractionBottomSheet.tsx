"use client";

import { useEffect, useState, useRef } from "react";
import IonIcon from "./IonIcon";
import Image from "next/image";
import { useRouter } from "next/navigation";

type SheetType = "likes" | "comments" | "shares" | "views";

interface InteractionBottomSheetProps {
    isOpen: boolean;
    onClose: () => void;
    type: SheetType;
    product: any;
    data: any[];
    onTabChange?: (type: SheetType) => void;
    onAddComment?: (comment: string) => void;
    onAction?: (action: string) => void;
    currentUser?: any;
    isLoading?: boolean;
}

const TABS: { type: SheetType; icon: string; activeIcon: string; label: string; color: string }[] = [
    { type: "likes",    icon: "heart-outline",        activeIcon: "heart",         label: "Likes",    color: "text-white" },
    { type: "comments", icon: "chatbubble-outline",   activeIcon: "chatbubble",    label: "Comments", color: "text-white" },
    { type: "shares",   icon: "share-social-outline", activeIcon: "share-social",  label: "Shares",   color: "text-white" },
    { type: "views",    icon: "eye-outline",           activeIcon: "eye",           label: "Views",    color: "text-white" },
];

const TITLES: Record<SheetType, string> = {
    likes:    "Who Liked This",
    comments: "Comments",
    shares:   "Who Shared",
    views:    "Who Viewed",
};

const SVG_ICONS: Record<string, { outline: React.ReactNode; solid: React.ReactNode }> = {
    likes: {
        outline: (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" viewBox="0 0 512 512">
                <path d="M352.92,80C288,80,256,144,256,144s-32-64-96.92-64c-52.76,0-94.54,44.14-95.08,96.81-1.1,106.94,111.09,191.13,174.68,239.38a31,31,0,0,0,34.64,0c63.59-48.25,175.78-132.44,174.68-239.38C447.46,124.14,405.68,80,352.92,80Z" style={{fill:'none',stroke:'currentColor',strokeLinecap:'round',strokeLinejoin:'round',strokeWidth:'32px'}}/>
            </svg>
        ),
        solid: (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" viewBox="0 0 512 512">
                <path d="M256,448a32,32,0,0,1-18-5.57c-78.59-53.35-112.62-89.93-131.39-112.8-40-48.75-59.15-98.8-58.61-153C48.63,114.52,93.46,72,149,72c51.71,0,81,30.33,97.05,52.32,6,8.2,10,14.56,10,14.56s3.92-6.36,10-14.56c16.1-22,45.34-52.32,97.05-52.32,55.54,0,100.37,42.52,101,104.7,0.54,54.17-18.61,104.22-58.61,153-18.77,22.87-52.8,59.45-131.39,112.8A32,32,0,0,1,256,448Z" fill="currentColor"/>
            </svg>
        )
    },
    comments: {
        outline: (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" viewBox="0 0 512 512">
                <path d="M408,64H104a56.16,56.16,0,0,0-56,56V312a56.16,56.16,0,0,0,56,56h40v80l93.33-80H408a56.16,56.16,0,0,0,56-56V120A56.16,56.16,0,0,0,408,64Z" style={{fill:'none',stroke:'currentColor',strokeLinejoin:'round',strokeWidth:'32px'}}/>
            </svg>
        ),
        solid: (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" viewBox="0 0 512 512">
                <path d="M144,464a16,16,0,0,1-16-16V384H104a72.08,72.08,0,0,1-72-72V120a72.08,72.08,0,0,1,72-72H408a72.08,72.08,0,0,1,72,72V312a72.08,72.08,0,0,1-72,72H245.74l-91.49,78.43A16,16,0,0,1,144,464Z" fill="currentColor"/>
            </svg>
        )
    },
    shares: {
        outline: (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-[1rem] h-[1rem]" viewBox="0 0 512 512" style={{overflow:'visible'}}>
                <circle cx="128" cy="256" r="48" style={{fill:'none',stroke:'currentColor',strokeLinecap:'round',strokeLinejoin:'round',strokeWidth:'32px'}}/>
                <circle cx="384" cy="112" r="48" style={{fill:'none',stroke:'currentColor',strokeLinecap:'round',strokeLinejoin:'round',strokeWidth:'32px'}}/>
                <circle cx="384" cy="400" r="48" style={{fill:'none',stroke:'currentColor',strokeLinecap:'round',strokeLinejoin:'round',strokeWidth:'32px'}}/>
                <line x1="169.83" y1="233.59" x2="342.17" y2="134.41" style={{fill:'none',stroke:'currentColor',strokeLinecap:'round',strokeLinejoin:'round',strokeWidth:'32px'}}/>
                <line x1="169.83" y1="278.41" x2="342.17" y2="377.59" style={{fill:'none',stroke:'currentColor',strokeLinecap:'round',strokeLinejoin:'round',strokeWidth:'32px'}}/>
            </svg>
        ),
        solid: (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-[1rem] h-[1rem]" viewBox="0 0 512 512" style={{overflow:'visible'}}>
                <path d="M384 336a63.78 63.78 0 00-45.12 18.82l-148-83.27a63.32 63.32 0 000-31.1l148-83.27A63.81 63.81 0 10384 64a64 64 0 00-64 64 63.8 63.8 0 001.38 13.09l-147.33 82.88a64 64 0 100 64.06l147.33 82.88A63.8 63.8 0 00320 384a64 64 0 1064-64z" fill="currentColor"/>
            </svg>
        )
    },
    views: {
        outline: (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" viewBox="0 0 512 512">
                <path d="M256,128c-81.19,0-152.21,47.9-185.39,112.56-4,7.8-4,17.08,0,24.88C103.79,330.1,174.81,378,256,378s152.21-47.9,185.39-112.56c4-7.8,4-17.08,0-24.88C408.21,175.9,337.19,128,256,128Z" style={{fill:'none',stroke:'currentColor',strokeLinecap:'round',strokeLinejoin:'round',strokeWidth:'32px'}}/>
                <circle cx="256" cy="253" r="80" style={{fill:'none',stroke:'currentColor',strokeLinecap:'round',strokeLinejoin:'round',strokeWidth:'32px'}}/>
            </svg>
        ),
        solid: (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" viewBox="0 0 512 512">
                <path d="M256,336c-44.18,0-80-35.82-80-80s35.82-80,80-80,80,35.82,80,80-35.82,80-80,80Z" fill="currentColor"/>
                <path d="M256,402c-88.66,0-165.71-55.51-197.35-132.83a31.81,31.81,0,0,1,0-26.34C90.29,165.51,167.34,110,256,110s165.71,55.51,197.35,132.83a31.81,31.81,0,0,1,0,26.34C421.71,346.49,344.66,402,256,402Zm0-204a52,52,0,1,0,52,52A52.06,52.06,0,0,0,256,198Z" fill="currentColor"/>
            </svg>
        )
    }
};

export default function InteractionBottomSheet({
    isOpen,
    onClose,
    type,
    product,
    data,
    onTabChange,
    onAddComment,
    onAction,
    currentUser,
    isLoading,
}: InteractionBottomSheetProps) {
    const router = useRouter();
    const [visible, setVisible] = useState(false);
    const [slide, setSlide]     = useState(false);
    const [commentText, setCommentText] = useState("");
    const [sending, setSending]         = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    // Two-phase animation: render first (visible), then slide up
    useEffect(() => {
        if (isOpen) {
            setVisible(true);
            requestAnimationFrame(() => requestAnimationFrame(() => setSlide(true)));
            document.body.style.overflow = "hidden";
        } else {
            setSlide(false);
            const t = setTimeout(() => setVisible(false), 320);
            document.body.style.overflow = "";
            return () => clearTimeout(t);
        }
    }, [isOpen]);

    // Auto-focus comment input when comments tab is active
    useEffect(() => {
        if (isOpen && type === "comments" && inputRef.current) {
            setTimeout(() => inputRef.current?.focus(), 350);
        }
    }, [isOpen, type]);

    if (!visible) return null;

    const handleUserClick = (userId: any) => {
        onClose();
        router.push(`/dashboard/profile?id=${userId}`);
    };

    const handleSend = async () => {
        const text = commentText.trim();
        if (!text || sending) return;
        setSending(true);
        try {
            await onAddComment?.(text);
            setCommentText("");
        } finally {
            setSending(false);
        }
    };

    const handleKey = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const activeTab = TABS.find((t) => t.type === type)!;

    return (
        <div
            className={`fixed inset-0 z-[250] flex items-end justify-center transition-opacity duration-300 ${slide ? "opacity-100" : "opacity-0"}`}
            style={{ backgroundColor: "rgba(0,0,0,0.65)" }}
            onClick={onClose}
        >
            <div
                className={`relative w-full max-w-lg bg-[#0d0d0d] rounded-t-[2.5rem] border-t border-white/10 shadow-2xl flex flex-col transition-transform duration-300 ease-out ${slide ? "translate-y-0" : "translate-y-full"}`}
                style={{ maxHeight: "78dvh" }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Drag Handle */}
                <div className="w-full flex justify-center pt-3 pb-1 shrink-0">
                    <div className="w-10 h-1 rounded-full bg-white/20" />
                </div>

                {/* ── Tab Bar ── Scrollable but usually fits ── */}
                <div className="flex items-center justify-between gap-1 px-4 py-3 shrink-0 border-b border-white/[0.05] bg-black/20">
                    {TABS.map((tab) => {
                        const active = tab.type === type;
                        const showsSpinner = active && isLoading;
                        
                        return (
                            <button
                                key={tab.type}
                                onClick={() => onTabChange?.(tab.type)}
                                className={`flex-1 min-w-[70px] flex flex-col items-center gap-1.5 py-2.5 rounded-2xl transition-all duration-300 active:scale-95 group relative ${
                                    active
                                        ? "bg-white/10 shadow-lg shadow-white/5"
                                        : "hover:bg-white/[0.05]"
                                }`}
                            >
                                <div className="relative flex items-center justify-center w-6 h-6">
                                    <div className={`transition-all duration-300 ${active ? "scale-110 opacity-100" : "scale-100 opacity-70 group-hover:opacity-100"}`}>
                                        <div className={`transition-colors duration-300 ${active ? `${tab.color} group-hover:text-white` : "text-white group-hover:text-white"}`}>
                                            {active ? SVG_ICONS[tab.type].solid : SVG_ICONS[tab.type].outline}
                                        </div>
                                    </div>
                                    
                                    {/* Small spinner overlay if loading - stable position */}
                                    {showsSpinner && (
                                        <div className="absolute -top-1 -right-2">
                                            <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                        </div>
                                    )}
                                </div>
                                <span
                                    className={`text-[8px] font-black uppercase tracking-[0.1em] transition-all duration-300 ${active ? "text-white" : "text-white/40 group-hover:text-white group-hover:opacity-100"}`}
                                >
                                    {tab.label}
                                </span>
                                
                                {active && (
                                    <div className={`absolute bottom-1 w-1 h-1 rounded-full ${tab.color.replace('text-', 'bg-')}`} />
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* ── Section Header ── */}
                <div className="px-5 py-3 flex items-center justify-between shrink-0">
                    <div>
                        <h3 className={`font-black text-base uppercase tracking-tight ${activeTab.color}`}>
                            {TITLES[type]}
                        </h3>
                        {product?.title && (
                            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest leading-none truncate max-w-[220px]">
                                {product.title}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-all"
                    >
                        <IonIcon name="close" />
                    </button>
                </div>

                {/* ── Content List ── */}
                <div className="flex-1 overflow-y-auto px-4 pb-2 min-h-[80px]" style={{ overscrollBehavior: "contain" }}>
                    {isLoading && data.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-3">
                             <div className="w-10 h-10 border-4 border-white/10 border-t-white rounded-full animate-spin" />
                             <p className="text-[10px] text-white/30 font-black uppercase tracking-widest">Loading...</p>
                        </div>
                    ) : (
                        <>
                            {data.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-14 gap-3">
                                    <IonIcon name={activeTab.activeIcon} className={`text-4xl opacity-20 ${activeTab.color}`} />
                                    <p className="text-[10px] text-slate-600 uppercase tracking-widest font-bold">
                                        {type === "comments"
                                            ? "No comments yet — be the first!"
                                            : type === "likes"
                                            ? "No likes yet."
                                            : type === "views"
                                            ? "No views recorded yet."
                                            : "Nothing shared yet."}
                                    </p>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-2 py-1">
                                    {data.map((item, idx) => (
                                        <div
                                            key={item.id || idx}
                                            onClick={() => handleUserClick(item.user_id || item.id)}
                                            className="flex items-start gap-3 p-3 bg-white/[0.025] hover:bg-white/[0.05] rounded-2xl border border-white/5 cursor-pointer transition-all active:scale-[0.98] animate-in slide-in-from-bottom-2 duration-300"
                                            style={{ animationDelay: `${idx * 50}ms` }}
                                        >
                                            {/* Avatar */}
                                            <div className="w-9 h-9 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center overflow-hidden shrink-0 relative">
                                                {item.profile_picture ? (
                                                    <Image
                                                        src={item.profile_picture}
                                                        alt={item.username || "User"}
                                                        fill
                                                        className="object-cover"
                                                    />
                                                ) : (
                                                    <IonIcon name="person" className="text-blue-400 text-sm" />
                                                )}
                                            </div>

                                            {/* Text */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <span className="text-[11px] font-black text-white uppercase tracking-tight truncate">
                                                        {item.username || "Anonymous"}
                                                    </span>
                                                    <span className="text-[8px] text-slate-600 font-bold uppercase tracking-widest ml-auto shrink-0">
                                                        {new Date(item.created_at || Date.now()).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                                    </span>
                                                </div>
                                                {item.text && (
                                                    <p className="text-[12px] text-slate-300 leading-relaxed">
                                                        {item.text}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* ── Comment Input (only when Comments tab is active) ── */}
                {type === "comments" && (
                    <div className="shrink-0 px-4 py-3 border-t border-white/5 bg-[#0a0a0a]">
                        <div className="flex items-center gap-2.5">
                            {/* Current user avatar */}
                            <div className="w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center overflow-hidden shrink-0 relative">
                                {currentUser?.profile_picture ? (
                                    <Image
                                        src={currentUser.profile_picture}
                                        alt="Me"
                                        fill
                                        className="object-cover"
                                    />
                                ) : (
                                    <IonIcon name="person" className="text-blue-400 text-sm" />
                                )}
                            </div>

                            <input
                                ref={inputRef}
                                type="text"
                                value={commentText}
                                onChange={(e) => setCommentText(e.target.value)}
                                onKeyDown={handleKey}
                                placeholder="Write a comment…"
                                className="flex-1 bg-white/[0.06] border border-white/10 text-white text-[13px] rounded-full px-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-white/20 placeholder-white/20"
                            />

                            <button
                                onClick={handleSend}
                                disabled={!commentText.trim() || sending}
                                className="w-9 h-9 rounded-full bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all active:scale-90 shrink-0"
                            >
                                {sending ? (
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <IonIcon name="send" className="text-white text-sm" />
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
