"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
import Topbar from "@/app/components/Topbar";
import IonIcon from "@/app/components/IonIcon";
import AddProductModal from "@/app/components/AddProductModal";
import CartSidebar from "@/app/components/CartSidebar";
import { useCart } from "@/app/context/CartContext";
import { googService } from "@/services/googService";

// Mobile Bottom Nav Items
const menuItems = [
    { name: "Home", icon: "home", href: "/dashboard" },
    { name: "Shop", icon: "bag", href: "/dashboard/shop" },
    { name: "Wallet", icon: "wallet", href: "/dashboard/wallet" },
    { name: "Chats", icon: "chatbubbles", href: "/dashboard/chats" },
];

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const isAdCampaignRoute = pathname?.startsWith("/dashboard/ad-campaign") ?? false;
    const [isAddProductModalOpen, setIsAddProductModalOpen] = useState(false);
    const [isCreateActionMenuOpen, setIsCreateActionMenuOpen] = useState(false);
    const [isWriteGoogsModalOpen, setIsWriteGoogsModalOpen] = useState(false);
    const [googText, setGoogText] = useState("");
    const [googTextColor, setGoogTextColor] = useState("#FFFFFF");
    const [editingGoogPost, setEditingGoogPost] = useState<any | null>(null);
    const [showPostSuccessToast, setShowPostSuccessToast] = useState(false);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [editingProduct, setEditingProduct] = useState<any>(null);
    const { setIsCartOpen, cartCount, isGoogerPaymentCartLocked } = useCart();
    const isCartLocked = isGoogerPaymentCartLocked;
    const GOOG_TEXT_LIMIT = 75;
    const GOOG_TEXT_COLORS = ["#FFFFFF", "#F87171", "#FB923C", "#FACC15", "#4ADE80", "#2DD4BF", "#60A5FA", "#A78BFA", "#F472B6", "#CBD5E1"];
    const resolvedProfileImage = currentUser?.profile_picture
        ? (currentUser.profile_picture.startsWith("http") || currentUser.profile_picture.startsWith("data:")
            ? currentUser.profile_picture
            : `/uploads/${currentUser.profile_picture.split(/[\\/]/).pop()}`)
        : null;
    const profileFallbackLabel = (currentUser?.full_name || currentUser?.username || "G")
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part: string) => part[0]?.toUpperCase() || "")
        .join("") || "G";

    const googLinkPreview = useMemo(() => {
        if (!googText) return null;
        const match = googText.match(/(https?:\/\/[^\s]+|www\.[^\s]+)/i);
        const raw = match?.[0];
        if (!raw) return null;
        const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
        try {
            const parsed = new URL(normalized);
            const host = parsed.hostname.replace(/^www\./i, "");
            const pathLabel = parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : "";

            // Detect video providers / direct video URLs
            let videoThumbnail: string | null = null;
            let videoLabel: string | null = null;

            // YouTube
            if (host === "youtu.be") {
                const id = parsed.pathname.split("/").filter(Boolean)[0];
                if (id) {
                    videoThumbnail = `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
                    videoLabel = "YouTube";
                }
            } else if (host.endsWith("youtube.com")) {
                const id = parsed.searchParams.get("v")
                    || (parsed.pathname.startsWith("/embed/") ? parsed.pathname.split("/")[2] : null)
                    || (parsed.pathname.startsWith("/shorts/") ? parsed.pathname.split("/")[2] : null);
                if (id) {
                    videoThumbnail = `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
                    videoLabel = "YouTube";
                }
            }
            // Vimeo (no thumbnail without API; mark as video)
            else if (host.endsWith("vimeo.com")) {
                videoLabel = "Vimeo";
            }
            // TikTok
            else if (host.endsWith("tiktok.com")) {
                videoLabel = "TikTok";
            }
            // Direct video files
            else if (/\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i.test(parsed.pathname)) {
                videoLabel = "Video";
            }

            return {
                href: normalized,
                host,
                pathLabel,
                favicon: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`,
                isVideo: !!videoLabel,
                videoThumbnail,
                videoLabel,
            };
        } catch {
            return null;
        }
    }, [googText]);

    useEffect(() => {
        const handleOpen = (e: any) => {
            setIsAddProductModalOpen(true);
            if (e.detail) {
                setEditingProduct(e.detail);
            } else {
                setEditingProduct(null);
            }
        };
        window.addEventListener('open-add-product-modal', handleOpen);
        return () => window.removeEventListener('open-add-product-modal', handleOpen);
    }, []);

    useEffect(() => {
        const handleOpenCreateMenu = () => {
            setIsCreateActionMenuOpen((prev) => !prev);
        };

        window.addEventListener('open-create-action-menu', handleOpenCreateMenu);
        return () => window.removeEventListener('open-create-action-menu', handleOpenCreateMenu);
    }, []);

    useEffect(() => {
        const handleOpenWriteGoogsModal = (event: Event) => {
            const detail = (event as CustomEvent).detail;
            if (detail?.id) {
                setEditingGoogPost(detail);
                setGoogText(String(detail.text || "").slice(0, GOOG_TEXT_LIMIT));
                setGoogTextColor(detail.textColor || "#FFFFFF");
            } else {
                setEditingGoogPost(null);
                setGoogText("");
                setGoogTextColor("#FFFFFF");
            }
            setIsWriteGoogsModalOpen(true);
        };

        window.addEventListener('open-write-googs-modal', handleOpenWriteGoogsModal);
        return () => window.removeEventListener('open-write-googs-modal', handleOpenWriteGoogsModal);
    }, []);

    useEffect(() => {
        setIsCreateActionMenuOpen(false);
    }, [pathname]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        try {
            const storedUser = JSON.parse(localStorage.getItem("user") || "{}");
            setCurrentUser(storedUser?.id ? storedUser : null);
        } catch {
            setCurrentUser(null);
        }
    }, []);

    const handleSuccess = (updatedProduct?: any) => {
        // Dispatch event for ShopPage to refresh with the actual product data
        window.dispatchEvent(new CustomEvent('product-added', { detail: updatedProduct }));
        // setIsAddProductModalOpen(false); 
    };

    const toggleCreateActionMenu = () => {
        window.dispatchEvent(new CustomEvent('open-create-action-menu'));
    };

    const handleCreateAction = (action: "googer" | "ad" | "product") => {
        setIsCreateActionMenuOpen(false);

        if (action === "product") {
            window.dispatchEvent(new CustomEvent('open-add-product-modal'));
            return;
        }

        if (action === "googer") {
            setIsWriteGoogsModalOpen(true);
            return;
        }

        router.push("/dashboard/ad-campaign/photo-video");
    };

    const closeWriteGoogModal = () => {
        setIsWriteGoogsModalOpen(false);
        setGoogText("");
        setGoogTextColor("#FFFFFF");
        setEditingGoogPost(null);
    };

    const postGoogNow = async () => {
        const text = googText.trim().slice(0, GOOG_TEXT_LIMIT);
        if (!text) return;

        try {
            const post = editingGoogPost?.id
                ? await googService.updatePost(editingGoogPost.id, { text, textColor: googTextColor })
                : await googService.createPost({ text, textColor: googTextColor });
            const nowIso = new Date().toISOString();
            const normalizedPost = editingGoogPost?.id
                ? {
                    ...post,
                    updatedAt: post?.updatedAt || post?.updated_at || nowIso,
                    updated_at: post?.updated_at || post?.updatedAt || nowIso,
                  }
                : {
                    ...post,
                    createdAt: nowIso,
                    created_at: nowIso,
                    updatedAt: nowIso,
                    updated_at: nowIso,
                  };

            window.localStorage.setItem("googer-pending-write-post", JSON.stringify(normalizedPost));
            window.dispatchEvent(new CustomEvent(editingGoogPost ? "googer-write-updated" : "googer-write-created", { detail: normalizedPost }));
            closeWriteGoogModal();
            setShowPostSuccessToast(true);
            window.setTimeout(() => setShowPostSuccessToast(false), 2200);
            router.push("/dashboard");
        } catch (error) {
            console.error("Failed to save Goog post:", error);
        }
    };

    return (
        <div className={`flex flex-col bg-[#1c1917] text-white font-sans ${isAdCampaignRoute ? "min-h-screen overflow-visible" : "h-screen overflow-hidden"}`}>
            {/* Topbar (Unified) */}
            <Topbar />

            {/* Mobile Bottom Nav */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-zinc-900 border-t border-zinc-800 flex items-center justify-around z-50 px-2 transition-all duration-300">
                {menuItems.slice(0, 2).map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={`flex flex-col items-center justify-center p-2 rounded-lg transition-colors ${isActive ? "text-white" : "text-gray-500 hover:text-gray-300"
                                }`}
                        >
                            <div className="text-2xl flex items-center justify-center">
                                <IonIcon name={isActive ? item.icon : item.icon + "-outline"} />
                            </div>
                            <span className="text-[10px] mt-1 font-medium">{item.name}</span>
                        </Link>
                    );
                })}

                {!isAdCampaignRoute ? (
                    <button
                        onClick={toggleCreateActionMenu}
                        className="flex flex-col items-center justify-center group"
                        suppressHydrationWarning={true}
                    >
                        <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-gray-400 group-hover:bg-white/10 group-active:scale-90 transition-all">
                            <IonIcon name="add-circle" className="text-2xl" />
                        </div>
                        <span className="text-[10px] mt-1 font-medium text-gray-500 uppercase tracking-widest">Add</span>
                    </button>
                ) : (
                    <div className="w-10" />
                )}

                {menuItems.slice(2).map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <div key={item.name} className="relative flex flex-col items-center">
                            {/* Floating Cart Icon above Chat only on mobile */}
                            {item.name === "Chats" && pathname === "/dashboard/shop" && (
                                <button
                                    onClick={() => {
                                        if (isCartLocked) {
                                            return;
                                        }
                                        setIsCartOpen(true);
                                    }}
                                    className={`absolute -top-14 w-12 h-12 bg-white text-black rounded-full flex items-center justify-center shadow-2xl border border-white/10 active:scale-95 transition-all z-[60] ${isCartLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    suppressHydrationWarning={true}
                                >
                                    <IonIcon name="cart" className="text-xl" />
                                    {cartCount > 0 && (
                                        <div className="absolute -top-1 -right-1 w-5 h-5 bg-blue-600 rounded-full border-2 border-zinc-900 flex items-center justify-center">
                                            <span className="text-[10px] font-black text-white">{cartCount}</span>
                                        </div>
                                    )}
                                </button>
                            )}
                            <Link
                                href={item.href}
                                className={`flex flex-col items-center justify-center p-2 rounded-lg transition-colors ${isActive ? "text-white" : "text-gray-500 hover:text-gray-300"
                                    }`}
                            >
                                <div className="text-2xl flex items-center justify-center">
                                    <IonIcon name={isActive ? item.icon : item.icon + "-outline"} />
                                </div>
                                <span className="text-[10px] mt-1 font-medium">{item.name}</span>
                            </Link>
                        </div>
                    );
                })}
            </div>

            {isCreateActionMenuOpen && !isAdCampaignRoute && (
                <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[90] flex justify-center px-3 md:bottom-auto md:top-24 md:px-4">
                    <div className="pointer-events-auto grid w-full max-w-[470px] grid-cols-3 items-stretch gap-1.5 rounded-[1.4rem] border border-white/10 bg-[linear-gradient(180deg,rgba(29,29,31,0.98),rgba(16,16,18,0.94))] p-1.5 shadow-[0_30px_90px_rgba(0,0,0,0.45)] backdrop-blur-2xl origin-bottom animate-[googerActionBarSheet_240ms_ease-out] md:rounded-[1.7rem] md:origin-top md:animate-[googerActionBarDrop_220ms_ease-out]">
                        <button
                            type="button"
                            onClick={() => handleCreateAction("googer")}
                            className="group flex min-h-[78px] flex-col items-center justify-center gap-1 rounded-[1rem] border border-transparent bg-white/[0.03] px-2 py-2 text-center text-white transition-all duration-300 hover:border-sky-300/30 hover:bg-sky-400/12 md:min-h-[74px] md:rounded-[1.15rem] md:px-2.5"
                        >
                            <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/8 text-white shadow-inner transition-colors duration-300 group-hover:bg-sky-400/18 group-hover:text-sky-100">
                                <span className="absolute bottom-[9px] left-[9px] h-[2px] w-4 rounded-full bg-white/15" />
                                <span className="absolute bottom-[9px] left-[9px] h-[2px] w-4 rounded-full bg-white/30" />
                                <span className="absolute left-[18px] top-[9px] h-4 w-[2px] origin-bottom -rotate-[28deg] rounded-full bg-white/90 shadow-[0_0_10px_rgba(255,255,255,0.18)] animate-[googerWrite_1.15s_ease-in-out_infinite]" />
                                <IonIcon name="create-outline" className="text-[18px] opacity-85" />
                            </span>
                            <span className="text-[9px] font-black uppercase tracking-[0.14em] text-white/90 sm:text-[10px] sm:tracking-[0.16em]">Write a Goog</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => handleCreateAction("ad")}
                            className="group flex min-h-[78px] flex-col items-center justify-center gap-1 rounded-[1rem] border border-transparent bg-white/[0.03] px-2 py-2 text-center text-white transition-all duration-300 hover:border-rose-300/30 hover:bg-rose-400/12 md:min-h-[74px] md:rounded-[1.15rem] md:px-2.5"
                        >
                            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/8 text-white shadow-inner transition-colors duration-300 group-hover:bg-rose-400/18 group-hover:text-rose-100">
                                <IonIcon name="megaphone-outline" className="text-[18px]" />
                            </span>
                            <span className="text-[9px] font-black uppercase tracking-[0.14em] text-white/90 sm:text-[10px] sm:tracking-[0.16em]">Ad Campaign</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => handleCreateAction("product")}
                            className="group flex min-h-[78px] flex-col items-center justify-center gap-1 rounded-[1rem] border border-transparent bg-white/[0.03] px-2 py-2 text-center text-white transition-all duration-300 hover:border-emerald-300/30 hover:bg-emerald-400/12 md:min-h-[74px] md:rounded-[1.15rem] md:px-2.5"
                        >
                            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/8 text-white shadow-inner transition-colors duration-300 group-hover:bg-emerald-400/18 group-hover:text-emerald-100">
                                <IonIcon name="cube-outline" className="text-[18px]" />
                            </span>
                            <span className="text-[9px] font-black uppercase tracking-[0.14em] text-white/90 sm:text-[10px] sm:tracking-[0.16em]">Add Product</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Main Content Area */}
            <main
                className={`flex-1 bg-[#1c1917] transition-all duration-300 ${isAdCampaignRoute ? "overflow-visible pb-10 pt-[3.8rem]" : "overflow-y-auto pb-20 pt-16 md:pb-8 md:pt-20"}`}
            >
                <div className={`mx-auto max-w-[1200px] px-3 sm:px-4 md:px-8 ${isAdCampaignRoute ? "py-2 sm:py-3" : "py-5 sm:py-6"}`}>
                    {children}
                </div>
            </main>

            {/* Global Add Product Modal */}
            {isAddProductModalOpen && (
                <AddProductModal
                    initialData={editingProduct}
                    onClose={() => setIsAddProductModalOpen(false)}
                    onSuccess={handleSuccess}
                />
            )}

            {isWriteGoogsModalOpen && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-3 backdrop-blur-md sm:p-4">
                    <div
                        className="absolute inset-0"
                        onClick={closeWriteGoogModal}
                    />
                    <div className="relative flex w-full max-w-[520px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#151416] shadow-[0_30px_100px_rgba(0,0,0,0.62)] animate-[googerModalRise_240ms_ease-out] max-h-[85vh]">
                        {/* Header (restored Cancel button and original styles) */}
                        <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
                            <button
                                type="button"
                                onClick={closeWriteGoogModal}
                                className="min-w-[72px] rounded-full bg-red-600 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-white shadow-[0_6px_18px_rgba(220,38,38,0.25)] transition-all hover:bg-red-500 active:scale-95"
                            >
                                Cancel
                            </button>
                            <h2 className="min-w-0 flex-1 text-center text-[13px] font-black tracking-[0.04em] text-white">{editingGoogPost ? "Edit Goog" : "Write a Goog"}</h2>
                            <div className="min-w-[72px]" />
                        </div>

                        {/* Content */}
                        <div className="scrollbar-dark flex-1 overflow-y-auto px-5 py-5">
                            {/* Input Section */}
                            <div className="flex items-start gap-3 mb-4">
                                <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/[0.07]">
                                    {resolvedProfileImage ? (
                                        <Image src={resolvedProfileImage} alt="Profile" fill className="object-cover" unoptimized />
                                    ) : (
                                        <span className="text-xs font-black text-white">{profileFallbackLabel}</span>
                                    )}
                                </div>
                                <textarea
                                    value={googText}
                                    onChange={(e) => setGoogText(e.target.value.slice(0, GOOG_TEXT_LIMIT))}
                                    placeholder="What's happening?"
                                    maxLength={GOOG_TEXT_LIMIT}
                                    autoFocus
                                    rows={3}
                                    className="flex-1 resize-none bg-transparent text-base font-medium leading-relaxed outline-none placeholder:text-white/30 whitespace-pre-wrap break-words"
                                    style={{ color: googTextColor }}
                                />
                            </div>

                            {googLinkPreview && (
                                <a
                                    href={googLinkPreview.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mb-4 flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 transition hover:bg-white/[0.07]"
                                >
                                    <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/[0.05]">
                                        {googLinkPreview.isVideo && googLinkPreview.videoThumbnail ? (
                                            <>
                                                <Image
                                                    src={googLinkPreview.videoThumbnail}
                                                    alt={googLinkPreview.host}
                                                    fill
                                                    className="object-cover"
                                                    unoptimized
                                                />
                                                <span className="absolute inset-0 flex items-center justify-center bg-black/35">
                                                    <IonIcon name="play" className="text-[12px] text-white" />
                                                </span>
                                            </>
                                        ) : googLinkPreview.isVideo ? (
                                            <IonIcon name="videocam" className="text-[16px] text-white/70" />
                                        ) : (
                                            <Image
                                                src={googLinkPreview.favicon}
                                                alt={googLinkPreview.host}
                                                width={28}
                                                height={28}
                                                className="h-7 w-7 object-contain"
                                                unoptimized
                                            />
                                        )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-[11px] font-black uppercase tracking-[0.12em] text-white/85">
                                            {googLinkPreview.host}
                                            {googLinkPreview.videoLabel ? (
                                                <span className="ml-1.5 rounded-full bg-white/10 px-1.5 py-[1px] text-[8px] font-black tracking-[0.14em] text-white/70">
                                                    {googLinkPreview.videoLabel}
                                                </span>
                                            ) : null}
                                        </p>
                                        <p className="truncate text-[10px] font-semibold text-white/45">
                                            {googLinkPreview.pathLabel || googLinkPreview.href}
                                        </p>
                                    </div>
                                    <IonIcon name="open-outline" className="text-base text-white/40" />
                                </a>
                            )}

                            {/* Color Selector */}
                            <div className="flex items-center gap-2 border-t border-white/[0.06] pt-4">
                                <p className="text-xs font-bold text-white/50">Text Color</p>
                                <div className="flex flex-wrap items-center gap-2">
                                    {GOOG_TEXT_COLORS.map((color) => (
                                        <button
                                            key={color}
                                            type="button"
                                            onClick={() => setGoogTextColor(color)}
                                            className={`h-6 w-6 rounded-lg border-2 transition-all duration-200 active:scale-90 ${
                                                googTextColor.toLowerCase() === color.toLowerCase()
                                                    ? "border-white shadow-lg shadow-white/20"
                                                    : "border-white/20 hover:border-white/40"
                                            }`}
                                            style={{ backgroundColor: color }}
                                            aria-label={`Use text color ${color}`}
                                        />
                                    ))}
                                    <label className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-lg border-2 border-white/20 bg-white/[0.04] transition-all duration-200 hover:border-white/40 active:scale-90">
                                        <input
                                            type="color"
                                            value={googTextColor}
                                            onChange={(e) => setGoogTextColor(e.target.value)}
                                            className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0"
                                            aria-label="Choose custom text color"
                                        />
                                    </label>
                                </div>
                                <span className="ml-auto text-xs font-medium text-white/40">
                                    {googText.length}/{GOOG_TEXT_LIMIT}
                                </span>
                            </div>
                        </div>

                        {/* Fixed Footer with Post Now Button */}
                        <div className="border-t border-white/[0.06] bg-[#0f0f10] px-5 py-3 flex items-center justify-end gap-3">
                            <button
                                type="button"
                                onClick={postGoogNow}
                                disabled={!googText.trim()}
                                className="rounded-full bg-white px-3 py-1 text-[8px] font-black uppercase tracking-[0.12em] text-black shadow-md transition-all duration-200 hover:bg-gray-100 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white"
                            >
                                Post Now
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <CartSidebar />

            {showPostSuccessToast && (
                <div className="fixed bottom-24 left-1/2 z-[200] -translate-x-1/2 rounded-full border border-[#00D4AA]/30 bg-[#151416] px-5 py-2.5 shadow-[0_8px_32px_rgba(0,0,0,0.45)]">
                    <span className="text-[13px] font-semibold text-[#00D4AA]">Goog posted!</span>
                </div>
            )}
        </div>
    );
}
