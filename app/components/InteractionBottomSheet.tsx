"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import IonIcon from "./IonIcon";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { RelativeTime } from "@/app/components/RelativeTime";

type SheetType = "likes" | "comments" | "shares" | "views";

interface InteractionBottomSheetProps {
    isOpen: boolean;
    onClose: () => void;
    type: SheetType;
    product: any;
    data: any[];
    onTabChange?: (type: SheetType) => void;
    onAddComment?: (comment: string, parentId?: number) => void;
    onDeleteComment?: (commentId: string | number) => void;
    onLikeComment?: (commentId: string | number) => void;
    onDislikeComment?: (commentId: string | number) => void;
    onReportComment?: (commentId: string | number, reason: string) => void;
    onRefresh?: () => void | Promise<void>;
    onAction?: (action: string) => void;
    currentUser?: any;
    isLoading?: boolean;
    refreshIntervalMs?: number;
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
    onDeleteComment,
    onLikeComment,
    onDislikeComment,
    onReportComment,
    onRefresh,
    onAction,
    currentUser,
    isLoading,
    refreshIntervalMs = 1200,
}: InteractionBottomSheetProps) {
    const router = useRouter();
    const [visible, setVisible] = useState(false);
    const [slide, setSlide]     = useState(false);
    const [commentText, setCommentText] = useState("");
    const [sending, setSending]         = useState(false);
    const [replyingTo, setReplyingTo]   = useState<{ id: string | number; username: string } | null>(null);
    const [commentFilter, setCommentFilter] = useState<"all" | "recent" | "top">("all");
    const [expandedReplies, setExpandedReplies] = useState<Record<string, boolean>>({});
    const [localLikes, setLocalLikes] = useState<Record<string, boolean>>({});
    const [localDislikes, setLocalDislikes] = useState<Record<string, boolean>>({});
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | number | null>(null);
    const [reportCommentId, setReportCommentId] = useState<string | number | null>(null);
    const [reportReason, setReportReason] = useState<string>("");
    const inputRef = useRef<HTMLInputElement>(null);
    const longPressTimer = useRef<NodeJS.Timeout | null>(null);

    const normalizeCommentId = (value: string | number | null | undefined) => {
        if (value === null || value === undefined) return "";
        const rawValue = String(value).trim();
        if (!rawValue) return "";
        return rawValue.startsWith("ad-comment-") ? rawValue : `ad-comment-${rawValue}`;
    };

    const sortedData = useMemo(() => {
        if (!data) return [];
        const sorted = [...data];
        if (commentFilter === "recent") {
            sorted.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
        } else if (commentFilter === "top") {
            sorted.sort((a, b) => (b.likes || 0) - (a.likes || 0));
        } else {
            // all
            sorted.sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
        }
        return sorted;
    }, [data, commentFilter]);

    // Grouping logic for nested comments
    const structuredComments = useMemo(() => {
        return sortedData.reduce((acc: any[], item: any) => {
            if (!item.parent_id) {
                const normalizedItemId = String(item.id || "").startsWith("ad-comment-")
                    ? normalizeCommentId(item.id)
                    : String(item.id || "");
                acc.push({
                    ...item,
                    replies: sortedData.filter((c: any) => {
                        if (!c.parent_id) return false;
                        if (String(c.id || "").startsWith("ad-comment-") || normalizedItemId.startsWith("ad-comment-")) {
                            return normalizeCommentId(c.parent_id) === normalizedItemId;
                        }
                        return String(c.parent_id) === normalizedItemId;
                    }),
                });
            }
            return acc;
        }, []);
    }, [sortedData]);

    // Two-phase animation: render first (visible), then slide up
    useEffect(() => {
        if (isOpen) {
            setVisible(true);
            const frame = requestAnimationFrame(() => {
                const nextFrame = requestAnimationFrame(() => {
                    setSlide(true);
                });
                return () => cancelAnimationFrame(nextFrame);
            });
            document.body.style.overflow = "hidden";
            return () => cancelAnimationFrame(frame);
        } else {
            setSlide(false);
            const t = setTimeout(() => {
                setVisible(false);
                setReplyingTo(null); // Reset when closing
            }, 500);
            document.body.style.overflow = "";
            return () => clearTimeout(t);
        }
    }, [isOpen]);

    // Auto-focus comment input when comments tab is active
    useEffect(() => {
        if (isOpen && type === "comments" && inputRef.current) {
            const t = setTimeout(() => inputRef.current?.focus(), 500);
            return () => clearTimeout(t);
        }
    }, [isOpen, type]);

    useEffect(() => {
        if (!isOpen || type !== "comments" || !onRefresh) return;

        const intervalId = window.setInterval(() => {
            void onRefresh();
        }, refreshIntervalMs);

        return () => window.clearInterval(intervalId);
    }, [isOpen, type, onRefresh, refreshIntervalMs]);

    if (!visible) return null;

    const handleUserClick = (userId: any, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!userId || String(userId).startsWith("legacy-views-")) return;
        onClose();
        router.push(`/dashboard/profile?id=${userId}`);
    };

    const handlePointerDown = (id: string | number) => {
        longPressTimer.current = setTimeout(() => {
            setExpandedReplies(prev => ({ ...prev, [id]: !prev[id] }));
        }, 500);
    };

    const handlePointerUp = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    const handleSend = async () => {
        const text = commentText.trim();
        if (!text || sending) return;
        setSending(true);
        try {
            const finalCommentText = text;
            const parentId = replyingTo?.id != null ? Number(replyingTo.id) : undefined;
            await onAddComment?.(finalCommentText, Number.isFinite(parentId) ? parentId : undefined);
            setCommentText("");
            setReplyingTo(null);
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

    const handleLike = (id: string | number) => {
        setLocalLikes(prev => ({ ...prev, [id]: !prev[id] }));
        if (localDislikes[id]) setLocalDislikes(prev => ({ ...prev, [id]: false }));
        onLikeComment?.(id);
    };

    const handleDislike = (id: string | number) => {
        setLocalDislikes(prev => ({ ...prev, [id]: !prev[id] }));
        if (localLikes[id]) setLocalLikes(prev => ({ ...prev, [id]: false }));
        onDislikeComment?.(id);
    };

    const renderComment = (item: any, isReply = false) => {
        const isOwnComment =
            currentUser &&
            String(currentUser.id) === String(item.user_id);
        const isOwnerCommentModerator =
            currentUser &&
            product &&
            String(currentUser.id) === String(product.user_id);
        const canDeleteComment = isOwnComment || isOwnerCommentModerator;
        const isLiked = localLikes[item.id] || item.user_liked;
        const isDisliked = localDislikes[item.id] || item.user_disliked;
        
        let displayLikes = item.likes || 0;
        if (localLikes[item.id] && !item.user_liked) displayLikes += 1;
        if (!localLikes[item.id] && item.user_liked) displayLikes -= 1;

        let displayDislikes = item.dislikes || 0;
        if (localDislikes[item.id] && !item.user_disliked) displayDislikes += 1;
        if (!localDislikes[item.id] && item.user_disliked) displayDislikes -= 1;

        return (
            <div
                key={item.id}
                onPointerDown={() => handlePointerDown(item.id)}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                onContextMenu={(e) => isReply ? {} : e.preventDefault()}
                className={`flex items-start gap-2.5 transition-all group ${isReply ? 'ml-8 mb-2' : 'mb-3'}`}
            >
                {/* Avatar */}
                <div 
                    onClick={(e) => handleUserClick(item.user_id, e)}
                    className={`${isReply ? 'w-6 h-6' : 'w-8 h-8'} rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center overflow-hidden shrink-0 relative cursor-pointer active:scale-90 transition-transform mt-0.5`}
                >
                    {item.profile_picture ? (
                        <Image src={item.profile_picture} alt={item.username || "User"} fill className="object-cover" />
                    ) : (
                        <IonIcon name="person" className={`${isReply ? 'text-[9px]' : 'text-xs'} text-blue-400`} />
                    )}
                </div>

                {/* Comment Bubble Container */}
                <div className="flex flex-col items-start max-w-[85%]">
                    {/* The Bubble */}
                    <div className="bg-white/[0.045] hover:bg-white/[0.07] border border-white/5 px-3 py-2 rounded-[1.25rem] transition-colors relative group/bubble">
                        <div className="flex items-center gap-2 mb-0.5">
                            <span 
                                onClick={(e) => handleUserClick(item.user_id, e)}
                                className={`${isReply ? 'text-[9px]' : 'text-[10px]'} font-black text-white uppercase tracking-tight truncate cursor-pointer hover:underline`}
                            >
                                {item.username || "Anonymous"}
                            </span>
                            <span className="text-[7px] text-slate-600 font-bold uppercase tracking-widest ml-auto shrink-0">
                                <RelativeTime timestamp={item.created_at} />
                            </span>
                        </div>
                        {item.text && (
                            <p className={`text-slate-300 leading-normal font-medium ${isReply ? 'text-[10.5px]' : 'text-[11.5px]'}`}>
                                {item.text.split(/(#\w+)/g).map((part: string, i: number) => 
                                    part.startsWith('#') ? (
                                        <span key={i} className="text-blue-400 font-bold cursor-pointer hover:underline">{part}</span>
                                    ) : (
                                        part
                                    )
                                )}
                            </p>
                        )}
                    </div>
                    
                    {/* Footer Actions (Like / Dislike / Delete / Report / Reply) */}
                    <div className="flex items-center gap-2 mt-1.5 ml-1">
                        <button 
                            onClick={() => handleLike(item.id)}
                            className={`flex items-center gap-1 text-[11px] font-black transition-all p-1 rounded-full hover:bg-white/5 active:scale-95 ${isLiked ? 'text-blue-500' : 'text-slate-400'}`}
                        >
                            <IonIcon name={isLiked ? "thumbs-up" : "thumbs-up-outline"} className="text-[14px]" />
                            {displayLikes > 0 && <span className="mr-0.5">{displayLikes}</span>}
                        </button>

                        <button 
                            onClick={() => handleDislike(item.id)}
                            className={`flex items-center gap-1 text-[11px] font-black transition-all p-1 rounded-full hover:bg-white/5 active:scale-95 ${isDisliked ? 'text-red-500' : 'text-slate-400'}`}
                        >
                            <IonIcon name={isDisliked ? "thumbs-down" : "thumbs-down-outline"} className="text-[14px]" />
                            {displayDislikes > 0 && <span className="mr-0.5">{displayDislikes}</span>}
                        </button>
                        
                        {canDeleteComment && (
                            <button 
                                onClick={() => setDeleteConfirmId(item.id)}
                                className="text-red-500/60 hover:text-red-400 transition-all flex items-center justify-center p-1 rounded-full hover:bg-white/5 active:scale-95"
                                title="Delete"
                            >
                                <IonIcon name="trash" className="text-[14px]" />
                            </button>
                        )}
                        
                         <button 
                             onClick={() => setReportCommentId(item.id)}
                             className="text-slate-500 hover:text-red-400 transition-all p-1 hover:bg-white/5 rounded-full active:scale-95 ml-2"
                             title="Report"
                         >
                             <IonIcon name="flag" className="text-[13px]" />
                         </button>

                        {type === "comments" && !isReply && (
                            <button 
                                onClick={() => {
                                    setReplyingTo({ id: item.id, username: item.username || "User" });
                                    inputRef.current?.focus();
                                }}
                                className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white transition-all ml-2"
                            >
                                Reply
                            </button>
                        )}
                        
                        {!isReply && item.replies?.length > 0 && (
                            <span className="text-[8px] text-white/30 uppercase tracking-widest italic ml-auto pointer-events-none">
                                Hold to Show Replies
                            </span>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div
            className={`fixed inset-0 z-[250] flex items-end justify-center transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${slide ? "bg-black/60 backdrop-blur-md opacity-100" : "bg-black/0 backdrop-blur-none opacity-0"}`}
            onClick={onClose}
        >
            <div
                className={`relative w-full max-w-lg bg-[#0d0d0d] rounded-t-[2.5rem] border-t border-white/10 shadow-[0_-20px_50px_rgba(0,0,0,0.5)] flex flex-col transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${slide ? "translate-y-0" : "translate-y-full"}`}
                style={{ maxHeight: "85dvh" }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Drag Handle */}
                <div className="w-full flex justify-center pt-3 pb-1 shrink-0">
                    <div className="w-10 h-1 rounded-full bg-white/20" />
                </div>

                {/* Tab Bar */}
                <div className="flex items-center justify-between gap-1 px-4 py-3 shrink-0 border-b border-white/[0.05] bg-black/20">
                    {TABS.map((tab) => {
                        const active = tab.type === type;
                        const showsSpinner = active && isLoading;
                        
                        return (
                            <button
                                key={tab.type}
                                onClick={() => onTabChange?.(tab.type)}
                                className={`flex-1 min-w-[70px] flex flex-col items-center gap-1.5 py-2.5 rounded-2xl transition-all duration-300 active:scale-95 group relative ${
                                    active ? "bg-white/10 shadow-lg shadow-white/5" : "hover:bg-white/[0.05]"
                                }`}
                            >
                                <div className="relative flex items-center justify-center w-6 h-6">
                                    <div className={`transition-all duration-300 ${active ? "scale-110 opacity-100" : "scale-100 opacity-70 group-hover:opacity-100"}`}>
                                        <div className={`transition-colors duration-300 ${active ? `${tab.color} group-hover:text-white` : "text-white group-hover:text-white"}`}>
                                            {active ? SVG_ICONS[tab.type].solid : SVG_ICONS[tab.type].outline}
                                        </div>
                                    </div>
                                    {showsSpinner && (
                                        <div className="absolute -top-1 -right-2">
                                            <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                        </div>
                                    )}
                                </div>
                                <span className={`text-[8px] font-black uppercase tracking-[0.1em] transition-all duration-300 ${active ? "text-white" : "text-white/40 group-hover:text-white"}`}>
                                    {tab.label}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* Section Header */}
                <div className="px-5 py-3 flex items-center justify-between shrink-0">
                    <div>
                        <h3 className={`font-black text-base uppercase tracking-tight ${activeTab.color}`}>
                            {TITLES[type]}
                        </h3>
                        {product?.title && (
                            <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest leading-none truncate max-w-[220px]">
                                {product.title}
                            </p>
                        )}
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-all">
                        <IonIcon name="close" />
                    </button>
                </div>

                {/* Content List */}
                <div className="flex-1 overflow-y-auto px-4 pb-2 min-h-[80px]" style={{ overscrollBehavior: "contain" }}>
                    
                    {/* Comments Filter Tabs (Only shown on Comments tab if items exist) */}
                    {type === "comments" && !isLoading && data.length > 0 && (
                        <div className="flex items-center gap-1 mb-4 bg-white/5 p-1 rounded-xl w-fit animate-in fade-in slide-in-from-top-2 duration-300">
                            <button
                                onClick={() => setCommentFilter("all")}
                                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${commentFilter === "all" ? "bg-white text-black shadow-lg" : "text-white/40 hover:text-white"}`}
                            >
                                All
                            </button>
                            <button
                                onClick={() => setCommentFilter("recent")}
                                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${commentFilter === "recent" ? "bg-white text-black shadow-lg" : "text-white/40 hover:text-white"}`}
                            >
                                Recent
                            </button>
                            <button
                                onClick={() => setCommentFilter("top")}
                                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${commentFilter === "top" ? "bg-white text-black shadow-lg" : "text-white/40 hover:text-white"}`}
                            >
                                Top Rated
                            </button>
                        </div>
                    )}

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
                                    <p className="text-[10px] text-slate-600 uppercase tracking-widest font-black">
                                        {type === "comments" ? "No comments yet — be the first!" : type === "likes" ? "No likes yet." : type === "views" ? "No views recorded yet." : "Nothing shared yet."}
                                    </p>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-2 py-1">
                                    {type === "comments" ? (
                                        structuredComments.map((root: any) => (
                                            <div key={root.id} className="flex flex-col gap-2">
                                                {renderComment(root)}
                                                {expandedReplies[root.id] && root.replies?.map((reply: any) => renderComment(reply, true))}
                                            </div>
                                        ))
                                    ) : (
                                        data.map((item, idx) => (
                                            <div
                                                key={item.id || idx}
                                                onClick={(e) => handleUserClick(item.user_id || item.id, e)}
                                                className={`flex items-center gap-3 p-3 bg-white/[0.025] rounded-2xl border border-white/5 transition-all animate-in slide-in-from-bottom-2 duration-300 ${item.is_aggregate ? "cursor-default" : "cursor-pointer hover:bg-white/[0.05] active:scale-[0.98]"}`}
                                                style={{ animationDelay: `${idx * 50}ms` }}
                                            >
                                                <div className="w-9 h-9 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center overflow-hidden shrink-0 relative">
                                                    {item.profile_picture ? (
                                                        <Image src={item.profile_picture} alt={item.full_name || item.username || "User"} fill className="object-cover" />
                                                    ) : (
                                                        <IonIcon name="person" className="text-blue-400 text-sm" />
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[11px] font-black text-white uppercase tracking-tight truncate">
                                                            {item.full_name || item.username || "Anonymous"}
                                                        </span>
                                                        <span className="text-[8px] text-slate-600 font-bold uppercase tracking-widest ml-auto shrink-0">
                                                            <RelativeTime timestamp={item.created_at} />
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Comment Input */}
                {type === "comments" && (
                    <div className="shrink-0 px-4 py-3 border-t border-white/5 bg-[#0a0a0a] pb-[max(1rem,env(safe-area-inset-bottom))]">
                        
                        {/* Quick Reaction Emojis - Facebook Style */}
                        <div className="flex items-center gap-1.5 mb-2.5 px-0.5 overflow-x-auto no-scrollbar">
                            {["❤️", "😂", "😍", "🔥", "🙌", "👏", "💯", "✨", "😢", "😮"].map(emoji => (
                                <button
                                    key={emoji}
                                    onClick={() => {
                                        setCommentText(prev => prev + emoji);
                                        inputRef.current?.focus();
                                    }}
                                    className="w-8 h-8 rounded-full bg-white/[0.03] hover:bg-white/10 flex items-center justify-center text-sm transition-all active:scale-90 shrink-0 border border-white/5"
                                >
                                    {emoji}
                                </button>
                            ))}
                        </div>

                        {/* Replying To Badge */}
                        {replyingTo && (
                            <div className="flex items-center justify-between bg-white/[0.03] border border-white/5 rounded-full px-3 py-1.5 mb-2.5 animate-in slide-in-from-bottom-1 duration-300">
                                <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest">
                                    Replying to <span className="text-blue-400">{replyingTo.username}</span>
                                </p>
                                <button onClick={() => setReplyingTo(null)} className="text-white/20 hover:text-white transition-colors">
                                    <IonIcon name="close-circle" className="text-xs" />
                                </button>
                            </div>
                        )}
                        
                        <div className="bg-[#1a1a1a] rounded-[2rem] border border-white/5 p-4 flex flex-col gap-4 relative overflow-hidden">

                            
                            {/* Text Input Row */}
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center overflow-hidden shrink-0 relative">
                                    {currentUser?.profile_picture ? (
                                        <Image src={currentUser.profile_picture} alt="Me" fill className="object-cover" />
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
                                    placeholder={replyingTo ? "Write a reply…" : "Write a comment…"}
                                    className="flex-1 bg-white/[0.06] border border-white/10 text-white font-medium text-[13px] rounded-full px-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-white/20 placeholder-white/20"
                                />
                                <button
                                    onClick={handleSend}
                                    disabled={!commentText.trim() || sending}
                                    className="w-9 h-9 rounded-full bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all active:scale-95 shrink-0 shadow-lg shadow-blue-600/20"
                                >
                                    {sending ? (
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <IonIcon name="send" className="text-white text-sm" />
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Inline Confirmation Modals */}
                {deleteConfirmId && (
                    <div className="absolute inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setDeleteConfirmId(null)}>
                        <div className="bg-[#151515] border border-white/10 rounded-[1.8rem] w-full max-w-[280px] p-6 shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col items-center text-center" onClick={e => e.stopPropagation()}>
                            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-3">
                                <IonIcon name="trash" className="text-red-500 text-xl" />
                            </div>
                            <h3 className="text-white font-black text-sm mb-1 uppercase tracking-widest">Delete Comment?</h3>
                            <p className="text-white/40 text-[10px] font-medium mb-6 leading-relaxed">This action cannot be undone. Are you sure you want to permanently delete this comment?</p>
                            <div className="flex items-center gap-3 w-full">
                                <button onClick={() => setDeleteConfirmId(null)} className="flex-1 py-3.5 bg-white/[0.03] hover:bg-white/10 border border-white/5 rounded-xl text-white font-bold text-[10px] uppercase tracking-widest transition-colors">Cancel</button>
                                <button 
                                    onClick={() => {
                                        onDeleteComment?.(deleteConfirmId);
                                        setDeleteConfirmId(null);
                                    }}
                                    className="flex-1 py-3.5 bg-red-600 hover:bg-red-500 rounded-xl text-white font-bold text-[10px] uppercase tracking-widest transition-colors shadow-lg shadow-red-600/20"
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {reportCommentId && (
                    <div className="absolute inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setReportCommentId(null)}>
                        <div className="bg-[#151515] border border-white/10 rounded-[1.8rem] w-full max-w-[320px] p-6 shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                            <h3 className="text-white font-black text-sm mb-1 uppercase tracking-widest">Report Comment</h3>
                            <p className="text-white/40 text-[9px] font-black uppercase tracking-widest mb-4">Select a reason to securely report this content</p>
                            
                            <div className="space-y-2 mb-6">
                                {["Spam or misleading", "Harassment or bullying", "Hate speech or graphic", "Inappropriate content"].map(reason => (
                                    <label key={reason} className="flex items-center gap-3 p-3.5 rounded-xl border border-white/5 hover:border-white/10 bg-white/[0.02] cursor-pointer transition-colors group active:scale-[0.98]">
                                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${reportReason === reason ? 'border-amber-500 bg-amber-500/10' : 'border-white/20 group-hover:border-white/40'}`}>
                                            {reportReason === reason && <div className="w-2 h-2 rounded-full bg-amber-500" />}
                                        </div>
                                        <input 
                                            type="radio" 
                                            name="reportReason" 
                                            value={reason} 
                                            className="hidden"
                                            onChange={(e) => setReportReason(e.target.value)}
                                        />
                                        <span className={`text-[11px] font-bold transition-colors ${reportReason === reason ? 'text-white' : 'text-white/60'}`}>{reason}</span>
                                    </label>
                                ))}
                            </div>
                            
                            <div className="flex items-center gap-3">
                                <button onClick={() => setReportCommentId(null)} className="flex-1 py-3.5 bg-white/[0.03] hover:bg-white/10 border border-white/5 rounded-xl text-white font-bold text-[10px] uppercase tracking-widest transition-colors">Cancel</button>
                                <button 
                                    disabled={!reportReason}
                                    onClick={() => {
                                        onReportComment?.(reportCommentId, reportReason);
                                        setReportCommentId(null);
                                        setReportReason("");
                                    }}
                                    className="flex-1 py-3.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl text-black font-black text-[10px] uppercase tracking-widest transition-colors shadow-lg shadow-amber-500/20"
                                >
                                    Submit
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
