"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import IonIcon from "@/app/components/IonIcon";
import { marketService } from "@/services/marketService";
import { googService } from "@/services/googService";
import { authService } from "@/services/authService";
import { GoogCard } from "@/app/components/googs/GoogCard";
import { PromotedAdCard } from "@/app/components/ads/PromotedAdCard";
import { SharedAdSecondViewModal, AdSecondViewKind } from "@/app/components/ads/SharedAdSecondViewModal";
import { ShopProductSecondViewModal } from "@/app/components/market/ShopProductSecondViewModal";
import { normalizeAd } from "@/app/lib/ads/adSystem";
import { normalizeProductAd } from "@/app/lib/market/adProductAdapter";
import ShareModal from "@/app/components/ShareModal";
import InteractionBottomSheet from "@/app/components/InteractionBottomSheet";
import { buildPublicUrl, getShareUrlForItem } from "@/app/lib/shareLinks";
import { useCart } from "@/app/context/CartContext";
import {
    getSponsoredLinkPreviewType,
    normalizeExternalUrl,
} from "@/app/components/ads/adHelpers";
import { useAdActions } from "@/app/lib/ads/useAdActions";
import { normalizeAdData } from "@/app/lib/ads/adNormalizer";
import { matchesAdIdentity } from "@/app/lib/ads/adIdentity";
import { useAdStore } from "@/app/lib/ads/adStore";

const getAdSecondViewKind = (ad: any): AdSecondViewKind => {
    const link = normalizeExternalUrl(ad?.active_link || "");
    const previewType = getSponsoredLinkPreviewType(link);
    const mediaPreview = String(ad?.media_preview || ad?.video_url || "").trim();
    const hasUploadedVideo =
        /video/i.test(String(ad?.media_type || "")) ||
        /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(mediaPreview);
    if (previewType === "embed") return "embed";
    if (previewType === "video" || hasUploadedVideo) return "video";
    return "image";
};

export default function UnifiedSharePage() {
    const params = useParams();
    const router = useRouter();
    const shareCode = params?.shareCode as string;
    
    const [loading, setLoading] = useState(true);
    const [item, setItem] = useState<any>(null);
    const [type, setType] = useState<"goog" | "ad" | "product" | null>(null);
    const [notFound, setNotFound] = useState(false);
    
    const [previewModal, setPreviewModal] = useState<any>(null);
    const [showShareModal, setShowShareModal] = useState(false);
    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const [sheetType, setSheetType] = useState<any>("comments");
    const [sheetData, setSheetData] = useState<any[]>([]);
    const [isSheetLoading, setIsSheetLoading] = useState(false);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [productSizeError, setProductSizeError] = useState(false);
    const [notification, setNotification] = useState<{ type: "success" | "error"; title?: string; message: string } | null>(null);
    const syncAds = useAdStore((state) => state.syncAds);
    const updateAdState = useAdStore((state) => state.updateAdState);

    const { addToCart } = useCart();

    useEffect(() => {
        let cancelled = false;
        if (authService.isAuthenticated()) {
            authService.getProfile().then((u: any) => { if (!cancelled) setCurrentUser(u); }).catch(() => {});
        }
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        if (!notification) return;
        const t = setTimeout(() => setNotification(null), 2400);
        return () => clearTimeout(t);
    }, [notification]);

    useEffect(() => {
        const loadItem = async () => {
            if (!shareCode) {
                setNotFound(true);
                setLoading(false);
                return;
            }

            try {
                // The backend getUnifiedShareItem will check market, ads, and googs
                const response = await fetch(`/api/market/share-unified/${shareCode}`);
                const data = await response.json();

                if (data.success) {
                    setItem(data.data);
                    setType(data.type);
                    if (data.type === "ad" || data.type === "product") {
                        syncAds([data.data]);
                    }
                    // Log a view automatically (matches feed behavior on render)
                    try {
                        const id = data.data?.id || data.data?.adId || data.data?.productId;
                        if (id != null) {
                            if (data.type === "goog") await googService.logView(Number(id));
                            else {
                                const result = await marketService.logView(id);
                                if (result?.incremented === true) {
                                    updateAdState(data.data, (prev) => ({ views_count: (prev.views_count || 0) + 1 }));
                                }
                            }
                        }
                    } catch {}
                } else {
                    setNotFound(true);
                }
            } catch (error) {
                console.error("Failed to load shared item:", error);
                setNotFound(true);
            } finally {
                setLoading(false);
            }
        };

        loadItem();
    }, [shareCode]);

    // Removed manual updateAdLocalState in favor of useAdStore global reactivity

    const adActions = useAdActions(item, {
        currentUser,
        // Removed local sync callbacks - useAdActions now updates useAdStore globally
        onShare: () => setShowShareModal(true),
        onOpenSheet: (kind, ad) => openSheet(kind, ad.raw || ad),
        onCoinCollected: (ad, collectionId) => {
            updateAdState(collectionId, { ad_coin_collected: true, ad_like_locked: true });
        },
        onNotify: (n) => setNotification({ type: n.type, title: n.title, message: n.message }),
    });

    const openSheet = async (sheetKind: any, targetItem: any) => {
        setSheetType(sheetKind);
        setIsSheetOpen(true);
        setSheetData([]);
        setIsSheetLoading(true);
        try {
            let data: any[] = [];
            const id = targetItem.id || targetItem.adId || targetItem.productId;
            
            if (type === "goog") {
                if (sheetKind === "comments") data = await googService.getComments(id);
                else if (sheetKind === "likes") data = await googService.getLikes(id);
                else if (sheetKind === "shares") data = await googService.getShares(id);
                else if (sheetKind === "views") data = await googService.getViews(id);
            } else {
                if (sheetKind === "comments") data = await marketService.getComments(id);
                else if (sheetKind === "likes") data = await marketService.getLikes(id);
                else if (sheetKind === "shares") data = await marketService.getShares(id);
                else if (sheetKind === "views") data = await marketService.getViews(id);
            }
            setSheetData(data || []);
        } catch (error) {
            console.error("Failed to load interactions:", error);
        } finally {
            setIsSheetLoading(false);
        }
    };

    const handleToggleLike = async (id: any) => {
        if (type === "ad" || type === "product") {
            await adActions.like();
            return;
        }
        try {
            if (type === "goog") {
                const liked = await googService.toggleLike(Number(id));
                setItem((prev: any) => prev ? { ...prev, liked, likes: (prev.likes || 0) + (liked ? 1 : -1) } : prev);
            }
        } catch (err) {
            console.error('Toggle like failed', err);
        }
    };

    const handleLogView = async (target: any) => {
        try {
            const id = target.id || target.adId || target.productId;
            if (type === "goog") await googService.logView(Number(id));
            else {
                await marketService.logView(id);
                updateAdState(id, (prev) => ({ views_count: (prev.views_count || 0) + 1 }));
            }
        } catch (err) {
            console.error('Log view failed', err);
        }
    };

    const handleShare = async (target: any) => {
        if (type === "ad" || type === "product") {
            adActions.share();
            const id = target?.id || target?.adId || target?.productId;
            if (id != null) {
                await marketService.logShare(id);
                updateAdState(id, (prev) => ({ shares_count: (prev.shares_count || 0) + 1 }));
            }
            return;
        }
        try {
            setShowShareModal(true);
            const id = target?.id || target?.adId || target?.productId;
            if (id == null) return;
            if (type === "goog") await googService.logShare(Number(id));
            else await marketService.logShare(id);
        } catch (err) {
            console.error('Log share failed', err);
        }
    };

    const handleCollectCoin = async (event: React.MouseEvent, target: any) => {
        adActions.handleAdCoinClick(event, target);
    };

    const sheetProduct = useMemo(() => {
        if (!item) return null;
        if (type === "goog") return { ...item, id: `goog-${item.id}`, title: "Goog post", image_url: item.user?.img };
        if (type === "product") return normalizeProductAd(item);
        return item;
    }, [item, type]);

    const handleAddComment = async (text: string, parentId?: number) => {
        if (!item || !text.trim()) return;
        try {
            const id = item.id || item.adId || item.productId;
            const newComment = type === "goog"
                ? await googService.addComment(Number(id), text.trim(), parentId)
                : await marketService.addComment(id, text.trim(), parentId);
            setSheetData((prev) => [...prev, {
                ...newComment,
                username: currentUser?.username || newComment?.username || "You",
                profile_picture: currentUser?.profile_picture ?? newComment?.profile_picture,
            }]);
            setItem((prev: any) => prev ? (
                type === "goog"
                    ? { ...prev, comments: (prev.comments || 0) + 1 }
                    : { ...prev, comments_count: (prev.comments_count || 0) + 1 }
            ) : prev);
            if (type === "ad" || type === "product") {
                updateAdState(item, (prev) => ({ comments_count: (prev.comments_count || 0) + 1 }));
            }
        } catch (err) {
            console.error("Failed to add comment:", err);
        }
    };

    const handleDeleteComment = async (commentId: string | number) => {
        if (!item) return;
        try {
            const id = item.id || item.adId || item.productId;
            if (type === "goog") {
                await googService.deleteComment(commentId as any);
                const data = await googService.getComments(Number(id));
                setSheetData(data || []);
                setItem((prev: any) => prev ? { ...prev, comments: Math.max(0, (prev.comments || 0) - 1) } : prev);
            } else {
                await marketService.deleteComment(commentId as any);
                const data = await marketService.getComments(id);
                setSheetData(data || []);
                setItem((prev: any) => prev ? { ...prev, comments_count: Math.max(0, (prev.comments_count || 0) - 1) } : prev);
                updateAdState(item, (prev) => ({ comments_count: Math.max(0, (prev.comments_count || 0) - 1) }));
            }
        } catch (err) {
            console.error("Failed to delete comment:", err);
        }
    };

    const handleRefreshSheet = async () => {
        if (!item || sheetType !== "comments") return;
        try {
            const id = item.id || item.adId || item.productId;
            const data = type === "goog"
                ? await googService.getComments(Number(id))
                : await marketService.getComments(id);
            setSheetData(data || []);
        } catch (err) {
            console.error("Failed to refresh comments:", err);
        }
    };

    const handleAddToBag = async (product: any, quantity: number, variant: any, size: string | null, country: string | null, variantIndex: number | null) => {
        try {
            await addToCart(product, quantity, size || variant?.size || null, variant?.color || null, variantIndex, country);
            setProductSizeError(false);
            setNotification({ type: "success", title: "Added to Bag", message: `${product.title || "Item"} has been added to your shopping bag.` });
        } catch (err) {
            console.error("Add to bag failed", err);
            setNotification({ type: "error", title: "Could not add", message: "Please try again." });
        }
    };

    const openProductAddToBag = () => {
        if (!item) return;
        setProductSizeError(true);
        setNotification({ type: "error", title: "Size is required", message: "Size is required" });
        setPreviewModal({ ad: item, type: "product" });
    };

    if (loading) {
        return (
            <main className="min-h-screen bg-[#1c1917] text-white">
                <div className="mx-auto max-w-lg p-4 sm:p-6 pb-24">
                    <div className="mb-8 h-10 w-44 animate-pulse rounded-2xl bg-white/[0.06]" />
                    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#211d1a]">
                        <div className="flex items-center gap-3 p-4">
                            <div className="h-10 w-10 animate-pulse rounded-full bg-white/[0.08]" />
                            <div className="flex-1 space-y-2">
                                <div className="h-3 w-1/3 animate-pulse rounded bg-white/[0.08]" />
                                <div className="h-2 w-1/4 animate-pulse rounded bg-white/[0.06]" />
                            </div>
                        </div>
                        <div className="aspect-[4/3] w-full animate-pulse bg-white/[0.05]" />
                        <div className="space-y-2 p-4">
                            <div className="h-3 w-3/4 animate-pulse rounded bg-white/[0.08]" />
                            <div className="h-3 w-1/2 animate-pulse rounded bg-white/[0.06]" />
                        </div>
                    </div>
                </div>
            </main>
        );
    }

    if (notFound || !item) {
        return (
            <main className="min-h-screen bg-[#1c1917] text-white flex items-center justify-center px-4">
                <div className="text-center max-w-sm">
                    <div className="mb-4 text-6xl opacity-50">🔍</div>
                    <h1 className="text-2xl font-black mb-2">Item Not Found</h1>
                    <p className="text-white/60 mb-6">The link might be expired or incorrect.</p>
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
                    {type === "goog" && (
                        <GoogCard
                            post={item}
                            onNavigateToProfile={() => router.push(`/profile/${item.user.username || item.user.id}`)}
                            onToggleLike={(id) => handleToggleLike(id)}
                            onOpenSheet={openSheet}
                            onViewPost={(id) => handleLogView({ id })}
                            onSharePost={(id) => handleShare({ id })}
                            onToggleMenu={() => {}}
                            showSubscribe={false}
                        />
                    )}
                    
                    {type === "ad" && (
                        <div className={item.campaign_type === "Profile Promote" ? "flex justify-center p-4" : ""}>
                            <PromotedAdCard
                                ad={normalizeAdData(item)}
                                source="home"
                                onProductClick={(product) => setPreviewModal({ ad: product, type: "product" })}
                                onToggleLike={(id) => handleToggleLike(id)}
                                onOpenSheet={openSheet}
                                onShare={(ad) => handleShare(ad)}
                                onCollectCoin={handleCollectCoin}
                                canShowCollectCoin={(target) => adActions.canShowCollectCoin(target)}
                                onProfileClick={(profileAd) => router.push(`/profile/${profileAd.user?.username || profileAd.owner_username || profileAd.user_id}`)}
                                onOpenSecondView={(targetAd) => setPreviewModal({ ad: targetAd, type: "ad", kind: getAdSecondViewKind(targetAd) })}
                                onReport={() => {}}
                                onNotInterested={() => {}}
                                onNavigateToProfile={() => router.push(`/profile/${item.user?.username || item.owner_user_id}`)}
                            />
                        </div>
                    )}
                    
                    {type === "product" && (
                        <PromotedAdCard
                            ad={normalizeAdData({ ...item, type: "product" })}
                            source="home"
                            onProductClick={(targetItem: any) => setPreviewModal({ ad: targetItem, type: "product" })}
                            onAddToBagClick={openProductAddToBag}
                            onToggleLike={(id) => handleToggleLike(id)}
                            onOpenSheet={openSheet}
                            onShare={(it) => handleShare(it)}
                            onLogView={(id) => handleLogView({ id })}
                            onNavigateToProfile={() => router.push(`/profile/${item.user?.username || item.owner_user_id}`)}
                            currentUser={currentUser}
                            onCollectCoin={handleCollectCoin}
                            canShowCollectCoin={(target) => adActions.canShowCollectCoin(target)}
                        />
                    )}
                </div>
            </div>

            {previewModal && previewModal.type === "ad" && (
                <SharedAdSecondViewModal
                    onClose={() => setPreviewModal(null)}
                    ad={previewModal.ad}
                    kind={previewModal.kind || getAdSecondViewKind(previewModal.ad)}
                    onToggleLike={(id) => handleToggleLike(id)}
                    onOpenSheet={openSheet}
                    onShare={(ad) => handleShare(ad)}
                    onReport={() => {}}
                    onNotInterested={() => {}}
                    onCollectCoin={handleCollectCoin}
                    onNavigateToProfile={() => router.push(`/profile/${item.user?.username || item.owner_user_id}`)}
                    canShowCollectCoin={(target) => adActions.canShowCollectCoin(target)}
                />
            )}
            
            {previewModal && previewModal.type === "product" && (
                <ShopProductSecondViewModal
                    onClose={() => setPreviewModal(null)}
                    product={previewModal.ad}
                    currentUser={currentUser}
                    onToggleLike={(id) => handleToggleLike(id)}
                    onLogView={(id) => handleLogView({ id })}
                    onOpenSheet={(sheetKind, p) => openSheet(sheetKind, p)}
                    onShare={(p) => handleShare(p)}
                    onAddToBag={handleAddToBag}
                    initialSizeError={productSizeError}
                    onSizeRequired={() => setNotification({ type: "error", title: "Size is required", message: "Size is required" })}
                    onNavigateToProfile={() => router.push(`/profile/${item.user?.username || item.owner_user_id}`)}
                    onCollectCoin={handleCollectCoin}
                    canShowCollectCoin={(target) => adActions.canShowCollectCoin(target)}
                />
            )}

            {showShareModal && (
                <ShareModal
                    isOpen={showShareModal}
                    onClose={() => setShowShareModal(false)}
                    shareUrl={shareCode ? buildPublicUrl(`/share/${encodeURIComponent(shareCode)}`) : getShareUrlForItem(item, type || undefined)}
                    title={item.text || item.title || "Googer Shared Item"}
                    product={type === "product" ? normalizeProductAd(item) : item}
                />
            )}

            <InteractionBottomSheet
                isOpen={isSheetOpen}
                onClose={() => setIsSheetOpen(false)}
                type={sheetType}
                product={sheetProduct}
                data={sheetData}
                isLoading={isSheetLoading}
                onTabChange={(t) => { if (item) openSheet(t, item); }}
                onAddComment={handleAddComment}
                onDeleteComment={handleDeleteComment}
                onLikeComment={async (commentId) => {
                    if (type === "goog") return;
                    try { await marketService.likeComment(Number(commentId)); }
                    catch (err) { console.error("Like comment failed", err); }
                }}
                onDislikeComment={async (commentId) => {
                    if (type === "goog") return;
                    try { await marketService.dislikeComment(Number(commentId)); }
                    catch (err) { console.error("Dislike comment failed", err); }
                }}
                onReportComment={async (commentId) => {
                    if (type === "goog") return;
                    try { await marketService.reportComment(Number(commentId)); }
                    catch (err) { console.error("Report comment failed", err); }
                }}
                onRefresh={handleRefreshSheet}
                onAction={(action) => {
                    if (!item) return;
                    if (action === "star") handleToggleLike(item.id || item.adId || item.productId);
                    if (action === "share" || action === "forward" || action === "upload") handleShare(item);
                }}
                currentUser={currentUser}
            />

            {notification && (
                <div className="fixed bottom-6 left-1/2 z-[200] -translate-x-1/2 rounded-2xl border border-white/10 bg-[#211d1a] px-5 py-3 shadow-2xl">
                    <p className={`text-[11px] font-black uppercase tracking-[0.16em] ${notification.type === "error" ? "text-red-400" : "text-emerald-400"}`}>
                        {notification.title || (notification.type === "error" ? "Error" : "Success")}
                    </p>
                    <p className="mt-1 text-xs text-white/70">{notification.message}</p>
                </div>
            )}
        </main>
    );
}
