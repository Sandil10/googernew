"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import IonIcon from "@/app/components/IonIcon";
import { googService } from "@/services/googService";
import { GoogCard, type WritePost } from "@/app/components/googs/GoogCard";
import ShareModal from "@/app/components/ShareModal";
import { getShareUrlForItem } from "@/app/lib/shareLinks";
import InteractionBottomSheet from "@/app/components/InteractionBottomSheet";

// Type moved to GoogCard.tsx

export default function ShareGoogPage() {
    const params = useParams();
    const router = useRouter();
    const postId = params?.postId as string;
    const [post, setPost] = useState<WritePost | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [showShareModal, setShowShareModal] = useState(false);
    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const [sheetType, setSheetType] = useState<any>("comments");
    const [sheetData, setSheetData] = useState<any[]>([]);
    const [isSheetLoading, setIsSheetLoading] = useState(false);

    useEffect(() => {
        const loadPost = async () => {
            try {
                if (!postId) {
                    setNotFound(true);
                    return;
                }
                const data = await googService.getPostPublic(Number(postId));
                if (data) {
                    // Ensure the structure matches WritePost
                    const normalizedPost: WritePost = {
                        ...data,
                        liked: false, // Default for public view
                        createdAt: data.created_at || data.createdAt,
                        user: {
                            ...data.user,
                            name: data.user?.name || "Anonymous",
                            img: data.user?.img || "/assets/images/default-avatar.png",
                        }
                    };
                    setPost(normalizedPost);
                } else {
                    setNotFound(true);
                }
            } catch (error) {
                console.error("Failed to load Goog post:", error);
                setNotFound(true);
            } finally {
                setLoading(false);
            }
        };

        loadPost();
    }, [postId]);

    const openPostSheet = async (type: any, targetPost: WritePost) => {
        setSheetType(type);
        setIsSheetOpen(true);
        setSheetData([]);
        setIsSheetLoading(true);
        try {
            let data: any[] = [];
            if (type === "comments") data = await googService.getComments(targetPost.id);
            else if (type === "likes") data = (await googService.getLikes(targetPost.id)) || [];
            else if (type === "shares") data = (await googService.getShares(targetPost.id)) || [];
            else if (type === "views") data = (await googService.getViews(targetPost.id)) || [];
            setSheetData(data || []);
        } catch (error) {
            console.error("Failed to load interactions:", error);
        } finally {
            setIsSheetLoading(false);
        }
    };

    if (loading) {
        return (
            <main className="min-h-screen bg-[#1c1917] flex items-center justify-center">
                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-white"></div>
            </main>
        );
    }

    if (notFound) {
        return (
            <main className="min-h-screen bg-[#1c1917] text-white flex items-center justify-center px-4">
                <div className="text-center max-w-sm">
                    <div className="mb-4 text-6xl opacity-50">🔍</div>
                    <h1 className="text-2xl font-black mb-2">Post Not Found</h1>
                    <p className="text-white/60 mb-6">This Goog post doesn't exist or has been removed.</p>
                    <button
                        onClick={() => router.push("/")}
                        className="rounded-xl bg-white/[0.08] hover:bg-white/[0.12] px-6 py-3 text-sm font-black uppercase tracking-[0.14em] text-white transition"
                    >
                        Back to Home
                    </button>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-[#1c1917] text-white">
            <div className="mx-auto max-w-lg p-4 sm:p-6 pb-24">
                <button
                    type="button"
                    onClick={() => router.push("/dashboard")}
                    className="mb-8 inline-flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-[11px] font-black uppercase tracking-[0.14em] text-white/70 transition hover:bg-white/[0.08] hover:text-white"
                >
                    <IonIcon name="grid-outline" className="text-base" />
                    Go to Dashboard
                </button>

                <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#211d1a]">
                    {post && (
                        <GoogCard
                            post={post}
                            onNavigateToProfile={() => router.push(`/profile/${post.user.username || post.user.id}`)}
                            onToggleLike={() => {}}
                            onOpenSheet={openPostSheet}
                            onViewPost={() => {}}
                            onSharePost={() => setShowShareModal(true)}
                            onToggleMenu={() => {}}
                            showSubscribe={false}
                        />
                    )}
                </div>
            </div>

            {showShareModal && post && (
                <ShareModal
                    isOpen={showShareModal}
                    onClose={() => setShowShareModal(false)}
                    shareUrl={getShareUrlForItem(post, "goog")}
                    title={post.text}
                />
            )}

            <InteractionBottomSheet
                isOpen={isSheetOpen}
                onClose={() => setIsSheetOpen(false)}
                type={sheetType}
                product={post}
                data={sheetData}
                isLoading={isSheetLoading}
            />
        </main>
    );
}
