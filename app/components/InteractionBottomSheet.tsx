"use client";

import { useEffect, useState } from "react";
import IonIcon from "./IonIcon";
import Image from "next/image";
import { useRouter } from "next/navigation";

interface InteractionBottomSheetProps {
    isOpen: boolean;
    onClose: () => void;
    type: "likes" | "comments" | "shares" | "views";
    product: any;
    data: any[];
    onAction?: (action: string) => void;
    onAddComment?: (comment: string) => void;
}

export default function InteractionBottomSheet({
    isOpen,
    onClose,
    type,
    product,
    data,
    onAction,
    onAddComment
}: InteractionBottomSheetProps) {
    const router = useRouter();
    const [aniState, setAniState] = useState(false);
    const [newComment, setNewComment] = useState("");

    useEffect(() => {
        if (isOpen) {
            setAniState(true);
            document.body.style.overflow = "hidden";
        } else {
            setAniState(false);
            document.body.style.overflow = "auto";
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleUserClick = (userId: any) => {
        onClose();
        router.push(`/dashboard/profile?id=${userId}`);
    };

    const titles = {
        likes: "Who Liked This",
        comments: "Discussions",
        shares: "Share Options",
        views: "Total Views"
    };

    const handleSendComment = () => {
        if (!newComment.trim()) return;
        onAddComment?.(newComment);
        setNewComment("");
    };

    return (
        <div
            className={`fixed inset-0 z-[250] flex items-end justify-center transition-opacity duration-300 ${aniState ? 'opacity-100' : 'opacity-0'}`}
            style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
            onClick={onClose}
        >
            <div
                className={`relative w-full max-w-lg bg-[#0d0d0d] rounded-t-[2.5rem] border-t border-white/10 shadow-2xl transition-transform duration-300 transform flex flex-col max-h-[70vh] ${aniState ? 'translate-y-0' : 'translate-y-full'}`}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Drag Handle */}
                <div className="w-full flex justify-center py-3">
                    <div className="w-10 h-1 rounded-full bg-white/20" />
                </div>

                {/* Header */}
                <div className="px-6 pb-4 border-b border-white/5 flex items-center justify-between">
                    <div>
                        <h3 className="text-white font-black text-lg uppercase tracking-tight italic">{titles[type]}</h3>
                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest leading-none">
                            {product?.title}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
                    >
                        <IonIcon name="close" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar min-h-[200px] mb-8">
                    <div className="flex flex-col gap-2">
                        {data.length > 0 ? data.map((item, idx) => (
                            <div
                                key={idx}
                                onClick={() => handleUserClick(item.user_id || item.id)}
                                className="flex items-center gap-3 p-3 bg-white/[0.02] rounded-2xl border border-white/5 animate-in slide-in-from-bottom-2 duration-300 cursor-pointer hover:bg-white/[0.05] transition-all active:scale-[0.98]"
                            >
                                <div className="w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center overflow-hidden shrink-0">
                                    {item.profile_picture ? (
                                        <Image src={item.profile_picture} alt="P" width={32} height={32} className="w-full h-full object-cover" />
                                    ) : (
                                        <IonIcon name="person" className="text-blue-400 text-sm" />
                                    )}
                                </div>
                                <div className="flex flex-col min-w-0">
                                    <span className="text-xs font-bold text-white uppercase tracking-tight leading-none truncate">{item.username || "Anonymous"}</span>
                                    {item.text && <p className="text-[10px] text-slate-400 mt-1 line-clamp-1 italic">"{item.text}"</p>}
                                </div>
                                <span className="ml-auto text-[8px] text-slate-500 uppercase font-black shrink-0">
                                    {new Date(item.created_at || Date.now()).toLocaleDateString()}
                                </span>
                            </div>
                        )) : (
                            <div className="text-center py-20 text-slate-500 italic text-[10px] uppercase tracking-widest">
                                Nothing to show here.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
