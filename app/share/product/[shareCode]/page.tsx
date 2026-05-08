"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import IonIcon from "@/app/components/IonIcon";
import { marketService } from "@/services/marketService";
import { authService } from "@/services/authService";
import { PromotedAdCard } from "@/app/components/ads/PromotedAdCard";
import { SharedProductCard } from "@/app/components/market/SharedProductCard";
import { ShopProductSecondViewModal } from "@/app/components/market/ShopProductSecondViewModal";
import { normalizeProductAd } from "@/app/lib/market/adProductAdapter";
import { normalizeAdData } from "@/app/lib/ads/adNormalizer";
import { useAdActions } from "@/app/lib/ads/useAdActions";
import { useAdStore } from "@/app/lib/ads/adStore";
import ShareModal from "@/app/components/ShareModal";
import { getShareUrlForItem } from "@/app/lib/shareLinks";
import InteractionBottomSheet from "@/app/components/InteractionBottomSheet";

export default function ShareProductPage() {
    const params = useParams();
    const router = useRouter();
    const shareCode = params?.shareCode as string;
    const [product, setProduct] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [previewModal, setPreviewModal] = useState<any>(null);
    const [showShareModal, setShowShareModal] = useState(false);
    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const [sheetType, setSheetType] = useState<any>("comments");
    const [sheetData, setSheetData] = useState<any[]>([]);
    const [isSheetLoading, setIsSheetLoading] = useState(false);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [isViewerReady, setIsViewerReady] = useState(false);
    const [notification, setNotification] = useState<{ type: "success" | "error"; title?: string; message: string } | null>(null);
    const syncAds = useAdStore((state) => state.syncAds);
    const updateAdState = useAdStore((state) => state.updateAdState);
    const setViewerContext = useAdStore((state) => state.setViewerContext);

    const adActions = useAdActions(product, {
        currentUser,
        viewerReady: isViewerReady,
        onShare: () => setShowShareModal(true),
        onOpenSheet: (kind, ad) => openProductSheet(kind, ad.raw || ad),
        onNeedCoinConfirmation: (target) => {
            adActions.collectAdCoin(target);
        },
        onCoinCollected: (ad, collectionId) => {
            updateAdState(collectionId, { ad_coin_collected: true, ad_like_locked: true });
            setNotification({ type: "success", title: "Collected", message: "Ruppier collected." });
        },
        onNotify: (n) => setNotification({ type: n.type, title: n.title, message: n.message }),
    });

    useEffect(() => {
        if (!notification) return;
        const t = setTimeout(() => setNotification(null), 3000);
        return () => clearTimeout(t);
    }, [notification]);

    useEffect(() => {
        let cancelled = false;
        const syncCurrentUser = async () => {
            try {
                const user = await authService.resolveActiveUser();
                if (!cancelled) {
                    setCurrentUser(user);
                    setViewerContext(user);
                }
            } catch {
                if (!cancelled) {
                    setCurrentUser(null);
                    setViewerContext(null);
                }
            } finally {
                if (!cancelled) setIsViewerReady(true);
            }
        };
        void syncCurrentUser();
        const handleAuthChanged = (event: Event) => {
            const nextUser = (event as CustomEvent)?.detail?.user || null;
            setCurrentUser(nextUser);
            setViewerContext(nextUser);
            setIsViewerReady(true);
        };
        window.addEventListener("googer-auth-changed", handleAuthChanged as EventListener);
        return () => {
            cancelled = true;
            window.removeEventListener("googer-auth-changed", handleAuthChanged as EventListener);
        };
    }, [setViewerContext]);

    useEffect(() => {
        const loadProduct = async () => {
            try {
                if (!shareCode) {
                    setNotFound(true);
                    return;
                }
                const data = await marketService.getProductByCodePublic(shareCode);
                if (data) {
                    setProduct(data);
                    syncAds([data]);
                    const canonicalPathFromServer = String(data?.canonical_share_path || "").trim();
                    const canonicalUrl = getShareUrlForItem(data, "product");
                    if (typeof window !== "undefined") {
                        let canonicalPath = canonicalPathFromServer;
                        if (!canonicalPath && canonicalUrl) {
                            try {
                                const parsed = new URL(canonicalUrl);
                                canonicalPath = parsed.pathname;
                            } catch {
                                canonicalPath = "";
                            }
                        }
                        const currentPath = window.location.pathname;
                        if (canonicalPath && canonicalPath !== currentPath) {
                            window.history.replaceState(null, "", canonicalPath);
                        }
                    }
                } else {
                    setNotFound(true);
                }
            } catch (error) {
                console.error("Failed to load product:", error);
                setNotFound(true);
            } finally {
                setLoading(false);
            }
        };

        loadProduct();
    }, [shareCode, syncAds]);

    const openProductSheet = async (type: any, targetProduct: any) => {
        setSheetType(type);
        setIsSheetOpen(true);
        setSheetData([]);
        setIsSheetLoading(true);
        try {
            let data: any[] = [];
            const id = targetProduct.productId || targetProduct.id;
            if (type === "comments") data = await marketService.getComments(id);
            else if (type === "likes") data = (await marketService.getLikes(id)) || [];
            else if (type === "shares") data = (await marketService.getShares(id)) || [];
            else if (type === "views") data = (await marketService.getViews(id)) || [];
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

    if (notFound || !product) {
        return (
            <main className="min-h-screen bg-[#1c1917] text-white flex items-center justify-center px-4">
                <div className="text-center max-w-sm">
                    <div className="mb-4 text-6xl opacity-50">🔍</div>
                    <h1 className="text-2xl font-black mb-2">Product Not Found</h1>
                    <p className="text-white/60 mb-6">This product doesn't exist or has been removed.</p>
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

    const normalizedProduct = normalizeProductAd(product);
    const isSharedAdProduct = !!product.is_sponsored || !!product.campaign_type || !!product.adId || !!product.ad_id;

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

                <div className="relative">
                    {isSharedAdProduct ? (
                        <PromotedAdCard
                            ad={normalizeAdData(product)}
                            source="home"
                            onProductClick={(item: any) => setPreviewModal(item)}
                            onToggleLike={() => adActions.like()}
                            onOpenSheet={(type, item) => openProductSheet(type, item)}
                            onShare={() => adActions.share()}
                            onCollectCoin={(e) => adActions.handleAdCoinClick(e)}
                            canShowCollectCoin={(target) => adActions.canShowCollectCoin(target)}
                            onNavigateToProfile={() => router.push(`/profile/${product.user?.username || product.owner_user_id}`)}
                        />
                    ) : (
                        <SharedProductCard
                            product={({
                                ...normalizedProduct,
                                user_liked: product.user_liked,
                                ad_coin_collected: product.ad_coin_collected
                            } as any)}
                            onProductClick={(item: any) => setPreviewModal(item)}
                            onToggleLike={(item) => adActions.like(item)}
                            onOpenSheet={(type, item) => openProductSheet(type, item)}
                            onShare={(item) => adActions.share(item)}
                            onCollectCoin={(e, item) => adActions.handleAdCoinClick(e, item)}
                            canShowCollectCoin={(target) => adActions.canShowCollectCoin(target)}
                            onNavigateToProfile={() => router.push(`/profile/${product.user?.username || product.owner_user_id}`)}
                        />
                    )}
                </div>
            </div>

            {previewModal && (
                <ShopProductSecondViewModal
                    onClose={() => setPreviewModal(null)}
                    product={previewModal}
                    onToggleLike={() => adActions.like()}
                    onOpenSheet={(type, item) => openProductSheet(type, item)}
                    onShare={() => adActions.share()}
                    onCollectCoin={(e) => adActions.handleAdCoinClick(e)}
                    canShowCollectCoin={(target) => adActions.canShowCollectCoin(target)}
                />
            )}

            {showShareModal && product && (
                <ShareModal
                    isOpen={showShareModal}
                    onClose={() => setShowShareModal(false)}
                    shareUrl={getShareUrlForItem(product, "product")}
                    title={product.title}
                    product={normalizedProduct}
                />
            )}

            <InteractionBottomSheet
                isOpen={isSheetOpen}
                onClose={() => setIsSheetOpen(false)}
                type={sheetType}
                product={normalizedProduct}
                data={sheetData}
                isLoading={isSheetLoading}
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
