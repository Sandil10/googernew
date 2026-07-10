"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import IonIcon from "@/app/components/IonIcon";
import ShareModal from "@/app/components/ShareModal";
import InteractionBottomSheet from "@/app/components/InteractionBottomSheet";
import UploadContentFeedCard from "@/app/components/upload-content/UploadContentFeedCard";
import { getShareUrlForItem, getUploadContentShareCode } from "@/app/lib/shareLinks";
import { getPublicProfileHref } from "@/app/lib/profileRoute";
import { authService } from "@/services/authService";
import { uploadContentService, type UploadContentRecord } from "@/services/uploadContentService";
import { openLoginRequired } from "@/app/lib/loginRequired";

export default function ReelSharePage() {
    const params = useParams();
    const router = useRouter();
    const shareCode = String(params?.shareCode || "").trim();
    const resellerRef = typeof params?.resellerRef === "string" ? decodeURIComponent(params.resellerRef) : "";
    const activeShareUrl = typeof window !== "undefined" ? window.location.href : "";
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [item, setItem] = useState<UploadContentRecord | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [showShareModal, setShowShareModal] = useState(false);
    const [shareInitialView, setShareInitialView] = useState<"share" | "resell">("share");
    const [shareFlowMode, setShareFlowMode] = useState<"resell" | "repost">("resell");
    const [forceResellOnly, setForceResellOnly] = useState(false);
    const [isUploadSheetOpen, setIsUploadSheetOpen] = useState(false);
    const [uploadSheetType, setUploadSheetType] = useState<"likes" | "comments" | "shares" | "views">("comments");
    const [uploadSheetData, setUploadSheetData] = useState<any[]>([]);
    const [isUploadSheetLoading, setIsUploadSheetLoading] = useState(false);
    const uploadLikeLocksRef = useRef(new Set<string>());
    const showBackButton = true;

    useEffect(() => {
        let cancelled = false;
        if (!authService.isAuthenticated()) {
            setCurrentUser(null);
            return;
        }
        authService.getProfile()
            .then((profile) => {
                if (!cancelled) setCurrentUser(profile);
            })
            .catch(() => {
                if (!cancelled) setCurrentUser(null);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        let mounted = true;
        const loadReel = async () => {
            setLoading(true);
            setNotFound(false);
            try {
                const match = await uploadContentService.getPublicApprovedByShareCode(shareCode);
                if (!mounted) return;
                if (!match) {
                    setNotFound(true);
                    setItem(null);
                    return;
                }
                const nextItem = resellerRef ? {
                    ...match,
                    reseller_ref: resellerRef,
                    resell_ref: resellerRef,
                } as UploadContentRecord : match;
                setItem(nextItem);
                uploadContentService.logView(match.id)
                    .then((viewResult) => {
                        if (!mounted) return;
                        setItem((current) => current ? {
                            ...current,
                            views_count: Number(viewResult.views_count || current.views_count || current.viewCount || 0),
                            viewCount: Number(viewResult.views_count || current.views_count || current.viewCount || 0),
                        } : current);
                    })
                    .catch(() => {});
            } catch {
                if (mounted) {
                    setNotFound(true);
                    setItem(null);
                }
            } finally {
                if (mounted) setLoading(false);
            }
        };

        void loadReel();
        return () => {
            mounted = false;
        };
    }, [resellerRef, shareCode]);

    const updateItem = (updater: (current: UploadContentRecord) => UploadContentRecord) => {
        setItem((current) => current ? updater(current) : current);
    };

    const handleOpenProfile = () => {
        if (!item) return;
        const username = String(item.username || "").trim();
        const userId = String(item.user_id || "").trim();
        if (username || userId) router.push(getPublicProfileHref(username, userId));
    };

    const handleToggleLike = async (target: UploadContentRecord) => {
        if (!authService.isAuthenticated() || !currentUser?.id) {
            openLoginRequired({ message: "Please log in to like upload content." });
            return;
        }
        const likeKey = String(target.id);
        if (uploadLikeLocksRef.current.has(likeKey)) return;
        uploadLikeLocksRef.current.add(likeKey);
        const wasLiked = !!target.user_liked;
        const nextLiked = !wasLiked;
        updateItem((current) => ({
            ...current,
            user_liked: nextLiked,
            likes_count: Math.max(0, Number(current.likes_count ?? current.likeCount ?? 0) + (nextLiked ? 1 : -1)),
            likeCount: Math.max(0, Number(current.likes_count ?? current.likeCount ?? 0) + (nextLiked ? 1 : -1)),
        }));
        try {
            const result = await uploadContentService.toggleLike(target.id);
            updateItem((current) => ({
                ...current,
                user_liked: !!result.liked,
                likes_count: Number(result.likes_count || 0),
                likeCount: Number(result.likes_count || 0),
            }));
        } catch (error) {
            updateItem((current) => ({
                ...current,
                user_liked: wasLiked,
                likes_count: Math.max(0, Number(target.likes_count ?? target.likeCount ?? 0)),
                likeCount: Math.max(0, Number(target.likes_count ?? target.likeCount ?? 0)),
            }));
            if ((error as { status?: number } | null)?.status === 429) return;
        } finally {
            uploadLikeLocksRef.current.delete(likeKey);
        }
    };

    const handleShare = async (target: UploadContentRecord) => {
        setShareInitialView("share");
        setShareFlowMode("resell");
        setForceResellOnly(false);
        setShowShareModal(true);
        try {
            const result = await uploadContentService.logShare(target.id);
            updateItem((current) => ({
                ...current,
                shares_count: Number(result.shares_count || current.shares_count || current.shareCount || 0),
                shareCount: Number(result.shares_count || current.shares_count || current.shareCount || 0),
            }));
        } catch {}
    };

    const handleRepost = async (target: UploadContentRecord) => {
        if (!authService.isAuthenticated() || !currentUser?.id) {
            openLoginRequired({ message: "Please log in to repost content." });
            throw new Error("Please log in to repost content.");
        }
        const result = await uploadContentService.repostContent(target.id);
        updateItem((current) => ({
            ...current,
            reposts_count: Number(result.reposts_count || current.reposts_count || current.repostCount || 0),
            repostCount: Number(result.reposts_count || current.reposts_count || current.repostCount || 0),
        }));
        if (result.alreadyReposted) {
            throw new Error("Already reposted");
        }
    };

    const handleRepostFlow = (target: UploadContentRecord) => {
        if (!authService.isAuthenticated() || !currentUser?.id) {
            openLoginRequired({ message: "Please log in to repost content." });
            return;
        }
        if (String(target.user_id || "") === String(currentUser.id || "")) {
            return;
        }
        setShareInitialView("resell");
        setShareFlowMode("repost");
        setForceResellOnly(true);
        setShowShareModal(true);
    };

    const handleLogView = async (target: UploadContentRecord) => {
        try {
            const result = await uploadContentService.logView(target.id);
            updateItem((current) => ({
                ...current,
                views_count: Number(result.views_count || current.views_count || current.viewCount || 0),
                viewCount: Number(result.views_count || current.views_count || current.viewCount || 0),
            }));
        } catch {}
    };

    const openUploadSheet = async (type: "likes" | "comments" | "shares" | "views", target: UploadContentRecord) => {
        setUploadSheetType(type);
        setIsUploadSheetOpen(true);
        setUploadSheetData([]);
        setIsUploadSheetLoading(true);
        try {
            let data: any[] = [];
            if (type === "comments") {
                data = await uploadContentService.getComments(target.id);
            } else if (type === "likes") {
                data = await uploadContentService.getLikes(target.id);
            } else if (type === "shares") {
                data = await uploadContentService.getShares(target.id);
            } else if (type === "views") {
                data = await uploadContentService.getViews(target.id);
            }
            setUploadSheetData(data || []);
        } catch {
            setUploadSheetData([]);
        } finally {
            setIsUploadSheetLoading(false);
        }
    };

    if (loading) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-black px-4 text-white">
                <div className="flex items-center gap-3 text-sm font-black uppercase tracking-[0.18em] text-white/55">
                    <IonIcon name="reload-outline" className="animate-spin text-xl" />
                    Loading reel
                </div>
            </main>
        );
    }

    if (notFound || !item) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-black px-4 text-white">
                <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-center">
                    <IonIcon name="alert-circle-outline" className="mx-auto text-4xl text-white/45" />
                    <h1 className="mt-4 text-lg font-black">Reel not found</h1>
                    <p className="mt-2 text-sm font-semibold text-white/50">This reel link may be expired or unavailable.</p>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-black px-2 py-4 text-white sm:px-6">
            {showBackButton && (
                <button
                    type="button"
                    onClick={() => {
                        if (currentUser?.id && window.history.length > 1) {
                            router.back();
                            return;
                        }
                        router.push("/home");
                    }}
                    className="fixed left-4 top-4 z-[160] flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/70 text-white shadow-[0_18px_48px_rgba(0,0,0,0.45)] backdrop-blur-md transition hover:bg-black/85"
                    aria-label="Go back"
                >
                    <IonIcon name="arrow-back-outline" className="text-xl" />
                </button>
            )}
            <div className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-[760px] items-center justify-center">
                <UploadContentFeedCard
                    item={item}
                    currentUser={currentUser}
                    onOpenProfile={handleOpenProfile}
                    onToggleLike={handleToggleLike}
                    onOpenSheet={(type, target) => {
                        void openUploadSheet(type, target);
                    }}
                    onShare={handleShare}
                    onRepost={handleRepost}
                    onOpenRepostFlow={handleRepostFlow}
                    onLogView={handleLogView}
                    onPin={() => {}}
                    onReport={() => {}}
                    onNotInterested={() => {}}
                    onInsights={() => {}}
                    onAccessChanged={(updated) => {
                        updateItem((current) => ({
                            ...current,
                            user_has_access: true,
                            user_purchased: true,
                            ...updated,
                        }));
                    }}
                    flashContentAutoPlay={false}
                    maxWidthClassName="max-w-[360px]"
                    articleClassName="w-full"
                />
            </div>
            <ShareModal
                isOpen={showShareModal}
                onClose={() => {
                    setShowShareModal(false);
                    setShareFlowMode("resell");
                    setForceResellOnly(false);
                }}
                title={item.topic || "Upload content"}
                url={activeShareUrl || getShareUrlForItem(item, "upload")}
                description={item.description || "Upload content"}
                product={{
                    ...item,
                    id: `upload-${item.id}`,
                    title: item.topic || "Upload content",
                    image_url: item.media_preview || item.thumbnail_url || item.media_gallery?.[0] || "",
                }}
                initialView={shareInitialView}
                resellMode={shareFlowMode}
                forceResellOnly={forceResellOnly}
                shareOnly={String(item.content_type || "").toLowerCase() === "flash" && !forceResellOnly && shareFlowMode !== "repost"}
                shareType="upload"
            />
            <InteractionBottomSheet
                isOpen={isUploadSheetOpen}
                onClose={() => {
                    setIsUploadSheetOpen(false);
                    setUploadSheetData([]);
                }}
                type={uploadSheetType}
                product={{
                    ...item,
                    id: `upload-${item.id}`,
                    title: item.topic || "Upload content",
                    image_url: item.media_preview || item.thumbnail_url || item.media_gallery?.[0] || "",
                }}
                data={uploadSheetData}
                onTabChange={(type) => {
                    void openUploadSheet(type, item);
                }}
                onAddComment={async (comment, parentId) => {
                    if (!comment.trim()) return;
                    if (!authService.isAuthenticated() || !currentUser?.id) {
                        openLoginRequired({ message: "Please log in to comment on upload content." });
                        return;
                    }
                    try {
                        const commentData = await uploadContentService.addComment(item.id, comment.trim(), parentId);
                        setUploadSheetData((current) => [...current, {
                            ...commentData,
                            username: currentUser?.username || commentData?.username || "You",
                            profile_picture: currentUser?.profile_picture ?? commentData?.profile_picture,
                        }]);
                        updateItem((current) => ({
                            ...current,
                            comments_count: Number(current.comments_count ?? current.commentCount ?? 0) + 1,
                            commentCount: Number(current.comments_count ?? current.commentCount ?? 0) + 1,
                        }));
                    } catch {}
                }}
                onDeleteComment={async (commentId) => {
                    try {
                        const result = await uploadContentService.deleteComment(commentId);
                        const deletedCount = Math.max(1, Number(result?.deletedCount || 1));
                        setUploadSheetData((current) => current.filter((comment) => comment.id !== commentId && comment.parent_id !== commentId));
                        updateItem((current) => ({
                            ...current,
                            comments_count: Math.max(0, Number(current.comments_count ?? current.commentCount ?? 0) - deletedCount),
                            commentCount: Math.max(0, Number(current.comments_count ?? current.commentCount ?? 0) - deletedCount),
                        }));
                    } catch {}
                }}
                onLikeComment={async (commentId) => {
                    try {
                        await uploadContentService.likeComment(Number(commentId));
                        setUploadSheetData(await uploadContentService.getComments(item.id));
                    } catch {}
                }}
                onDislikeComment={async (commentId) => {
                    try {
                        await uploadContentService.dislikeComment(Number(commentId));
                        setUploadSheetData(await uploadContentService.getComments(item.id));
                    } catch {}
                }}
                onReportComment={async (commentId) => {
                    try {
                        await uploadContentService.reportComment(Number(commentId));
                    } catch {}
                }}
                onRefresh={async () => {
                    if (uploadSheetType === "comments") {
                        setUploadSheetData(await uploadContentService.getComments(item.id));
                    } else if (uploadSheetType === "likes") {
                        setUploadSheetData(await uploadContentService.getLikes(item.id));
                    } else if (uploadSheetType === "shares") {
                        setUploadSheetData(await uploadContentService.getShares(item.id));
                    } else if (uploadSheetType === "views") {
                        setUploadSheetData(await uploadContentService.getViews(item.id));
                    }
                }}
                onAction={(action) => {
                    if (action === "star") void handleToggleLike(item);
                    if (action === "share" || action === "forward" || action === "upload") void handleShare(item);
                }}
                currentUser={currentUser}
                isLoading={isUploadSheetLoading}
            />
        </main>
    );
}
