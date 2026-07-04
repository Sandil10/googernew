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
import { useCart } from "@/app/context/CartContext";

const PENDING_RESELL_CART_KEY = "googer:pending-resell-cart-add";
const RESELL_ATTRIBUTION_STORAGE_KEY = "googer:resell-attribution";

const userMatchesRef = (user: any, ref: string) => {
    const normalizedRef = String(ref || "").trim().replace(/^@+/, "").toLowerCase();
    if (!normalizedRef || !user) return false;
    return [
        user.id,
        user.user_id,
        user.userId,
        user.username,
    ].some((value) => String(value || "").trim().replace(/^@+/, "").toLowerCase() === normalizedRef);
};

const rememberResellAttribution = (product: any, ref: string) => {
    if (typeof window === "undefined" || !product || !ref) return;
    const productId = product.id || product.productId || product.product_id || product.linked_product_id;
    if (!productId) return;
    try {
        const raw = localStorage.getItem(RESELL_ATTRIBUTION_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        parsed[String(productId)] = {
            reseller_ref: ref,
            share_code: product.share_code || product.shareCode || product.product_code || null,
            saved_at: Date.now(),
        };
        localStorage.setItem(RESELL_ATTRIBUTION_STORAGE_KEY, JSON.stringify(parsed));
    } catch {}
};

export default function ShareProductPage() {
    const params = useParams();
    const router = useRouter();
    const shareCode = params?.shareCode as string;
    const resellerRef = typeof params?.resellerRef === "string" ? decodeURIComponent(params.resellerRef) : "";
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
    const { addToCart } = useCart();

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
        if (!currentUser || !product || typeof window === "undefined") return;
        const rawPending = sessionStorage.getItem(PENDING_RESELL_CART_KEY);
        if (!rawPending) return;

        try {
            const pending = JSON.parse(rawPending);
            if (pending?.shareCode && String(pending.shareCode) !== String(shareCode)) return;
            if (pending?.resellerRef && String(pending.resellerRef) !== String(resellerRef)) return;
            sessionStorage.removeItem(PENDING_RESELL_CART_KEY);
            const pendingProduct = {
                ...(pending.product || product),
                reseller_ref: pending.resellerRef || resellerRef,
                resell_ref: pending.resellerRef || resellerRef,
            };
            addToCart(
                pendingProduct,
                Number(pending.quantity || 1),
                pending.size || null,
                pending.color || null,
                pending.variantIndex ?? null,
                pending.country || null
            ).then(() => {
                setNotification({ type: "success", title: "Added to Bag", message: `${pendingProduct.title || "Item"} has been added to your shopping bag.` });
            }).catch(() => {
                setNotification({ type: "error", title: "Could not add", message: "Please try again." });
            });
        } catch {
            sessionStorage.removeItem(PENDING_RESELL_CART_KEY);
        }
    }, [addToCart, currentUser, product, resellerRef, shareCode]);

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
                    const productWithReseller = resellerRef
                        ? { ...data, reseller_ref: resellerRef, resell_ref: resellerRef }
                        : data;
                    if (resellerRef) {
                        rememberResellAttribution(productWithReseller, resellerRef);
                    }
                    setProduct(productWithReseller);
                    syncAds([productWithReseller]);
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
                        if (!resellerRef && canonicalPath && canonicalPath !== currentPath) {
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
    }, [shareCode, resellerRef, syncAds]);

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

    const normalizedProduct = {
        ...normalizeProductAd(product),
        reseller_ref: product?.reseller_ref || null,
        resell_ref: product?.resell_ref || null,
    };

    const handleAddToBag = async (targetProduct: any, quantity: number, variant: any, size: string | null, country: string | null, variantIndex: number | null) => {
        try {
            let activeUser = currentUser;
            if (resellerRef && authService.isAuthenticated() && !activeUser) {
                activeUser = await authService.getProfile().catch(() => null);
                if (activeUser) setCurrentUser(activeUser);
            }
            if (resellerRef && userMatchesRef(activeUser, resellerRef)) {
                setNotification({ type: "error", title: "Use another buyer account", message: "You cannot buy from your own resell link." });
                return;
            }
            if (resellerRef && !authService.isAuthenticated()) {
                if (typeof window !== "undefined") {
                    sessionStorage.setItem(PENDING_RESELL_CART_KEY, JSON.stringify({
                        shareCode,
                        resellerRef,
                        product: { ...targetProduct, reseller_ref: resellerRef, resell_ref: resellerRef },
                        quantity,
                        size: size || variant?.size || null,
                        color: variant?.color || null,
                        country,
                        variantIndex,
                    }));
                    router.push(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
                }
                return;
            }

            const productWithReseller = resellerRef
                ? { ...targetProduct, reseller_ref: targetProduct.reseller_ref || resellerRef, resell_ref: targetProduct.resell_ref || resellerRef }
                : targetProduct;
            await addToCart(productWithReseller, quantity, size || variant?.size || null, variant?.color || null, variantIndex, country);
            setNotification({ type: "success", title: "Added to Bag", message: `${targetProduct.title || "Item"} has been added to your shopping bag.` });
        } catch (error) {
            console.error("Add resell product to bag failed:", error);
            setNotification({ type: "error", title: "Could not add", message: "Please try again." });
        }
    };
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
                    onAddToBag={handleAddToBag}
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
