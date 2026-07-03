"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import IonIcon from "@/app/components/IonIcon";
import { marketService } from "@/services/marketService";
import { authService } from "@/services/authService";
import { PromotedAdCard } from "@/app/components/ads/PromotedAdCard";
import { SharedAdSecondViewModal } from "@/app/components/ads/SharedAdSecondViewModal";
import ShareModal from "@/app/components/ShareModal";
import { getShareUrlForItem } from "@/app/lib/shareLinks";
import InteractionBottomSheet from "@/app/components/InteractionBottomSheet";
import { AdInteractionType } from "@/app/components/ads/AdInteractionButton";
import { useAdActions } from "@/app/lib/ads/useAdActions";
import { normalizeAdData } from "@/app/lib/ads/adNormalizer";
import { useAdStore } from "@/app/lib/ads/adStore";

export default function ShareAdPage() {
    const params = useParams();
    const router = useRouter();
    const adId = params?.adId as string;
    const [ad, setAd] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [adPreviewModal, setAdPreviewModal] = useState<{ ad: any; kind: "image" | "video" | "embed" } | null>(null);
    const [showShareModal, setShowShareModal] = useState(false);
    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const [sheetType, setSheetType] = useState<AdInteractionType>("comments");
    const [sheetData, setSheetData] = useState<any[]>([]);
    const [isSheetLoading, setIsSheetLoading] = useState(false);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [isViewerReady, setIsViewerReady] = useState(false);
    const [notification, setNotification] = useState<{ type: "success" | "error"; title?: string; message: string } | null>(null);
    const syncAds = useAdStore((state) => state.syncAds);
    const updateAdState = useAdStore((state) => state.updateAdState);
    const setViewerContext = useAdStore((state) => state.setViewerContext);

    const adActions = useAdActions(ad, {
        currentUser,
        viewerReady: isViewerReady,
        onShare: () => setShowShareModal(true),
        onOpenSheet: (type, item) => openAdSheet(type, item.raw || item),
        onNeedCoinConfirmation: (target) => {
            adActions.collectAdCoin(target);
        },
        onCoinCollected: (item, collectionId) => {
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
        const loadAd = async () => {
            try {
                if (!adId) {
                    setNotFound(true);
                    return;
                }
                const data = await marketService.getAdPublic(adId);
                if (data) {
                    setAd(data);
                    syncAds([data]);
                } else {
                    setNotFound(true);
                }
            } catch (error) {
                console.error("Failed to load ad:", error);
                setNotFound(true);
            } finally {
                setLoading(false);
            }
        };

        loadAd();
    }, [adId, syncAds]);

    const openAdSheet = async (type: AdInteractionType, targetAd: any) => {
        setSheetType(type);
        setIsSheetOpen(true);
        setSheetData([]);
        setIsSheetLoading(true);
        try {
            let data: any[] = [];
            if (type === "comments") data = await marketService.getComments(targetAd.id);
            else if (type === "likes") data = (await marketService.getLikes(targetAd.id)) || [];
            else if (type === "shares") data = (await marketService.getShares(targetAd.id)) || [];
            else if (type === "views") data = (await marketService.getViews(targetAd.id)) || [];
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

    if (notFound || !ad) {
        return (
            <main className="min-h-screen bg-[#1c1917] text-white flex items-center justify-center px-4">
                <div className="text-center max-w-sm">
                    <div className="mb-4 text-6xl opacity-50">🔍</div>
                    <h1 className="text-2xl font-black mb-2">Ad Not Found</h1>
                    <p className="text-white/60 mb-6">This ad doesn't exist or has been removed.</p>
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

                <div className="relative">
                    <PromotedAdCard
                        ad={normalizeAdData(ad)}
                        source="home"
                        isMenuOpen={isMenuOpen}
                        onToggleMenu={() => setIsMenuOpen(!isMenuOpen)}
                        onCloseMenu={() => setIsMenuOpen(false)}
                        onOpenSecondView={(targetAd) => setAdPreviewModal({ ad: targetAd, kind: "image" })}
                        onToggleLike={() => adActions.like()}
                        onOpenSheet={openAdSheet}
                        onShare={() => adActions.share()}
                        onReport={() => {}}
                        onNotInterested={() => {}}
                        onCollectCoin={(e) => adActions.handleAdCoinClick(e)}
                        onNavigateToProfile={() => router.push(`/profile/${ad.user?.username || ad.owner_user_id}`)}
                        canShowCollectCoin={(target) => adActions.canShowCollectCoin(target)}
                    />
                </div>
            </div>

            {adPreviewModal && (
                <SharedAdSecondViewModal
                    onClose={() => setAdPreviewModal(null)}
                    ad={adPreviewModal.ad}
                    kind={adPreviewModal.kind}
                    onToggleLike={() => adActions.like(adPreviewModal.ad)}
                    onOpenSheet={openAdSheet}
                    onShare={(target) => adActions.share(target)}
                    onReport={() => {}}
                    onNotInterested={() => {}}
                    onCollectCoin={(e, target) => adActions.handleAdCoinClick(e, target)}
                    onNavigateToProfile={() => {}}
                    canShowCollectCoin={(target) => adActions.canShowCollectCoin(target)}
                />
            )}

            {showShareModal && (
                <ShareModal
                    isOpen={showShareModal}
                    onClose={() => setShowShareModal(false)}
                    shareUrl={getShareUrlForItem(ad, "ad")}
                    title={ad.title}
                />
            )}

            <InteractionBottomSheet
                isOpen={isSheetOpen}
                onClose={() => setIsSheetOpen(false)}
                type={sheetType}
                product={ad}
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
