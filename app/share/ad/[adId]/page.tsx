"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import IonIcon from "@/app/components/IonIcon";
import { marketService } from "@/services/marketService";
import { PhotoVideoAdCard } from "@/app/components/ads/PhotoVideoAdCard";
import { AdSecondViewModal } from "@/app/components/ads/AdSecondViewModal";
import ShareModal from "@/app/components/ShareModal";
import { getShareUrlForItem } from "@/app/lib/shareLinks";
import InteractionBottomSheet from "@/app/components/InteractionBottomSheet";
import { AdInteractionType } from "@/app/components/ads/AdInteractionButton";

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
    }, [adId]);

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

    if (notFound) {
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
                    <PhotoVideoAdCard
                        ad={ad}
                        source="home"
                        isMenuOpen={isMenuOpen}
                        onToggleMenu={() => setIsMenuOpen(!isMenuOpen)}
                        onCloseMenu={() => setIsMenuOpen(false)}
                        onOpenSecondView={(targetAd) => setAdPreviewModal({ ad: targetAd, kind: "image" })}
                        onToggleLike={() => {}}
                        onOpenSheet={openAdSheet}
                        onShare={() => setShowShareModal(true)}
                        onReport={() => {}}
                        onNotInterested={() => {}}
                        onCollectCoin={() => {}}
                        onNavigateToProfile={() => router.push(`/profile/${ad.user?.username || ad.owner_user_id}`)}
                        canShowCollectCoin={() => false}
                    />
                </div>
            </div>

            {adPreviewModal && (
                <AdSecondViewModal
                    onClose={() => setAdPreviewModal(null)}
                    ad={adPreviewModal.ad}
                    kind={adPreviewModal.kind}
                    onToggleLike={() => {}}
                    onOpenSheet={openAdSheet}
                    onShare={() => setShowShareModal(true)}
                    onReport={() => {}}
                    onNotInterested={() => {}}
                    onCollectCoin={() => {}}
                    onNavigateToProfile={() => {}}
                    canShowCollectCoin={() => false}
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
        </main>
    );
}
