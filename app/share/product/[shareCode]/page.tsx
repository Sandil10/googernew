"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import IonIcon from "@/app/components/IonIcon";
import { marketService } from "@/services/marketService";
import { PromotedProductCard } from "@/app/components/market/PromotedProductCard";
import { ShopProductSecondViewModal } from "@/app/components/market/ShopProductSecondViewModal";
import { normalizeProductAd } from "@/app/lib/market/adProductAdapter";
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
    }, [shareCode]);

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

    if (notFound) {
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
                    <PromotedProductCard
                        item={normalizedProduct}
                        source="home"
                        onClick={(item: any) => setPreviewModal(item)}
                        onToggleLike={() => {}}
                        onOpenSheet={(type, item) => openProductSheet(type, item)}
                        onShare={() => setShowShareModal(true)}
                        onNavigateToProfile={() => router.push(`/profile/${product.user?.username || product.owner_user_id}`)}
                    />
                </div>
            </div>

            {previewModal && (
                <ShopProductSecondViewModal
                    onClose={() => setPreviewModal(null)}
                    product={previewModal}
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
        </main>
    );
}
