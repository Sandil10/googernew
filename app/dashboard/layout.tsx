"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useMemo, useCallback } from "react";
import Topbar from "@/app/components/Topbar";
import IonIcon from "@/app/components/IonIcon";
import AddProductModal from "@/app/components/AddProductModal";
import ProductPlansModal from "@/app/components/ProductPlansModal";
import CartSidebar from "@/app/components/CartSidebar";
import LoginModal from "@/app/components/auth/LoginModal";
import { SubscriptionExpiryWarning } from "@/app/components/subscriptions/SubscriptionExpiryWarning";
import { useCart } from "@/app/context/CartContext";
import { googService } from "@/services/googService";
import { authService, getStoredUserSync } from "@/services/authService";
import { subscriptionService } from "@/services/subscriptionService";
import { useSubscriptionFeatures } from "@/app/lib/subscriptionFeatures";
import { LOGIN_REQUIRED_EVENT, OPEN_LOGIN_MODAL_EVENT } from "@/app/lib/loginRequired";
import { addTopbarNotification } from "@/app/lib/topbarNotifications";

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
    const [showProductPlansModal, setShowProductPlansModal] = useState(false);
    const [showGoogPlansModal, setShowGoogPlansModal] = useState(false);
    const features = useSubscriptionFeatures();
    const [colorPage, setColorPage] = useState(0);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [editingProduct, setEditingProduct] = useState<any>(null);
    const [loginRequiredPrompt, setLoginRequiredPrompt] = useState<{ title: string; message: string; redirectTo: string } | null>(null);
    const [showLoginModal, setShowLoginModal] = useState(false);
    const { setIsCartOpen, isCartOpen, cartCount, isGoogerPaymentCartLocked } = useCart();
    const isCartLocked = isGoogerPaymentCartLocked;
    const isSuspendedWalletPath = (path: string | null) => path === "/dashboard/wallet/my-wallet";
    const prefetchAdCampaignRoutes = useCallback(() => {
        router.prefetch("/dashboard/ad-campaign/photo-video");
        router.prefetch("/dashboard/ad-campaign/product-promote");
        router.prefetch("/dashboard/ad-campaign/profile-promote");
        router.prefetch("/dashboard/ad-campaign/upload-content");
        router.prefetch("/dashboard/ad-campaign/flash-content");
    }, [router]);
    const shouldRedirectSuspendedUser = useCallback((user: any) => {
        if (!user?.is_deactivated) return false;
        // Self-deactivated users are logged out, not redirected to /suspended
        if (user?.suspension_reason_category === "Self Deactivated" || user?.deactivation_reason === "Self Deactivated") {
            authService.logout();
            return false;
        }
        return !(user?.suspended_wallet_access && isSuspendedWalletPath(pathname));
    }, [pathname]);
    const googLetterLimit = features.goog_letter_limit ?? 75;
    const googTextColors = useMemo(() => {
        const count = Math.max(1, features.write_goog_color_limit ?? 10);
        return Array.from({ length: count }, (_, i) => {
            const hue = Math.round((360 * i) / count);
            return `hsl(${hue}, 85%, 65%)`;
        });
    }, [features.write_goog_color_limit]);
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
        const timer = window.setTimeout(prefetchAdCampaignRoutes, 1000);
        return () => window.clearTimeout(timer);
    }, [prefetchAdCampaignRoutes]);

    useEffect(() => {
        const handleOpenCreateMenu = () => {
            if (!authService.isAuthenticated()) {
                setLoginRequiredPrompt({
                    title: "Login Required",
                    message: "Please log in to create Googs, ads, or products.",
                    redirectTo: "/",
                });
                return;
            }
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
                setGoogText(String(detail.text || "").slice(0, googLetterLimit));
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
            const storedUser = JSON.parse((sessionStorage.getItem("user") || localStorage.getItem("user")) || "{}");
            setCurrentUser(storedUser?.id ? storedUser : null);
            if (shouldRedirectSuspendedUser(storedUser)) router.replace("/suspended");
        } catch {
            setCurrentUser(null);
        }
        if (authService.isAuthenticated()) {
            authService.getProfile()
                .then((profile) => {
                    setCurrentUser(profile);
                    if (shouldRedirectSuspendedUser(profile)) router.replace("/suspended");
                })
                .catch(() => {});
        }
    }, [router, shouldRedirectSuspendedUser]);

    useEffect(() => {
        if (typeof window === "undefined") return;

        const handleAuthChanged = (event: Event) => {
            const user = (event as CustomEvent)?.detail?.user ?? null;
            if (user) {
                setCurrentUser(user);
                return;
            }
            if (authService.isAuthenticated()) {
                setCurrentUser(getStoredUserSync());
                return;
            }
            setCurrentUser(null);
            router.replace("/");
        };

        window.addEventListener("googer-auth-changed", handleAuthChanged as EventListener);
        return () => window.removeEventListener("googer-auth-changed", handleAuthChanged as EventListener);
    }, [router]);

    useEffect(() => {
        if (shouldRedirectSuspendedUser(currentUser)) router.replace("/suspended");
    }, [currentUser, router, shouldRedirectSuspendedUser]);


    useEffect(() => {
        const handleLoginRequired = (event: Event) => {
            const detail = (event as CustomEvent)?.detail || {};
            setLoginRequiredPrompt({
                title: detail.title || "Login Required",
                message: detail.message || "Please log in to continue.",
                redirectTo: detail.redirectTo || "/",
            });
        };

        window.addEventListener(LOGIN_REQUIRED_EVENT, handleLoginRequired as EventListener);
        return () => window.removeEventListener(LOGIN_REQUIRED_EVENT, handleLoginRequired as EventListener);
    }, []);

    useEffect(() => {
        const handleOpenLoginModal = () => {
            setLoginRequiredPrompt(null);
            setShowLoginModal(true);
        };

        window.addEventListener(OPEN_LOGIN_MODAL_EVENT, handleOpenLoginModal);
        return () => window.removeEventListener(OPEN_LOGIN_MODAL_EVENT, handleOpenLoginModal);
    }, []);

    const requireAuth = (message: string) => {
        if (authService.isAuthenticated()) return true;
        setLoginRequiredPrompt({
            title: "Login Required",
            message,
            redirectTo: "/",
        });
        return false;
    };

    const handleSuccess = (updatedProduct?: any) => {
        // Dispatch event for ShopPage to refresh with the actual product data
        window.dispatchEvent(new CustomEvent('product-added', { detail: updatedProduct }));
        // setIsAddProductModalOpen(false); 
    };

    const toggleCreateActionMenu = () => {
        if (!requireAuth("Please log in to create Googs, ads, or products.")) return;
        window.dispatchEvent(new CustomEvent('open-create-action-menu'));
    };

    const handleCreateAction = async (action: "googer" | "ad" | "product" | "upload-content") => {
        if (!requireAuth("Please log in to create Googs, ads, or products.")) {
            setIsCreateActionMenuOpen(false);
            return;
        }
        setIsCreateActionMenuOpen(false);

        if (action === "ad" || action === "upload-content") {
            // Clear all ad campaign drafts so the new ad form starts empty
            ["photo-and-video", "product-promote", "profile-promote", "upload-content", "vault-content", "flash-content"].forEach((type) => {
                window.localStorage.removeItem(`googer-ad-draft-${type}`);
            });
            router.push(action === "upload-content" ? "/dashboard/ad-campaign/upload-content" : "/dashboard/ad-campaign/photo-video");
            return;
        }

        if (action === "googer" || action === "product") {
            const usage = await subscriptionService.getMyUsage();
            if (action === "googer") {
                if (usage?.googAtLimit) {
                    setShowGoogPlansModal(true);
                } else {
                    setIsWriteGoogsModalOpen(true);
                }
            } else {
                if (usage?.productAtLimit) {
                    setShowProductPlansModal(true);
                } else {
                    window.dispatchEvent(new CustomEvent('open-add-product-modal'));
                }
            }
        }
    };

    const closeWriteGoogModal = () => {
        setIsWriteGoogsModalOpen(false);
        setGoogText("");
        setGoogTextColor("#FFFFFF");
        setEditingGoogPost(null);
        setColorPage(0);
    };

    const postGoogNow = async () => {
        const text = googText.trim().slice(0, googLetterLimit);
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
            addTopbarNotification({
                id: `${editingGoogPost?.id ? "goog-updated" : "goog-created"}-${normalizedPost?.id || Date.now()}`,
                type: "success",
                title: editingGoogPost?.id ? "Goog Updated" : "Goog Posted",
                message: editingGoogPost?.id ? "Your Goog post was updated." : "Your Goog post was created.",
            });
            router.push("/dashboard");
        } catch (error: any) {
            const msg = error?.message || "Failed to save Goog post.";
            addTopbarNotification({
                type: "error",
                title: "Goog Failed",
                message: msg,
            });
        }
    };

    return (
        <div className={`flex flex-col bg-[#1c1917] text-white font-sans ${isAdCampaignRoute ? "min-h-screen overflow-visible" : "h-screen overflow-hidden"}`}>
            {/* Topbar (Unified) */}
            <Topbar />

            {/* Mobile Cart Floating Button — above bottom nav */}
            <button
                className="md:hidden fixed bottom-[4.5rem] right-4 z-[60] w-11 h-11 rounded-full bg-white/10 border border-white/15 backdrop-blur-md flex items-center justify-center text-white shadow-xl active:scale-95 transition-all"
                onClick={() => { if (!isCartLocked) setIsCartOpen(!isCartOpen); }}
                suppressHydrationWarning={true}
            >
                <IonIcon name={isCartOpen ? "cart" : "cart-outline"} className="text-lg" />
                {cartCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 text-white text-[8px] font-black rounded-full flex items-center justify-center border border-zinc-900">
                        {cartCount}
                    </span>
                )}
            </button>

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
                        onTouchStart={prefetchAdCampaignRoutes}
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
                    const isProtectedItem = item.name === "Wallet" || item.name === "Chats";
                    return (
                        <div key={item.name} className="relative flex flex-col items-center">
                            <button
                                type="button"
                                onClick={() => {
                                    if (isProtectedItem && !requireAuth(`Please log in to open ${item.name.toLowerCase()}.`)) return;
                                    router.push(item.href);
                                }}
                                className={`flex flex-col items-center justify-center p-2 rounded-lg transition-colors ${isActive ? "text-white" : "text-gray-500 hover:text-gray-300"
                                    }`}
                            >
                                <div className="text-2xl flex items-center justify-center">
                                    <IonIcon name={isActive ? item.icon : item.icon + "-outline"} />
                                </div>
                                <span className="text-[10px] mt-1 font-medium">{item.name}</span>
                            </button>
                        </div>
                    );
                })}

            </div>

            {isCreateActionMenuOpen && !isAdCampaignRoute && (
                <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[90] flex justify-center px-3 md:bottom-auto md:top-24 md:px-4">
                    <div className="pointer-events-auto grid w-full max-w-[620px] grid-cols-2 items-stretch gap-1.5 rounded-[1.4rem] border border-white/10 bg-[linear-gradient(180deg,rgba(29,29,31,0.98),rgba(16,16,18,0.94))] p-1.5 shadow-[0_30px_90px_rgba(0,0,0,0.45)] backdrop-blur-2xl origin-bottom animate-[googerActionBarSheet_240ms_ease-out] md:grid-cols-4 md:rounded-[1.7rem] md:origin-top md:animate-[googerActionBarDrop_220ms_ease-out]">
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
                            <span className="text-[9px] font-black uppercase tracking-[0.14em] text-white/90 sm:text-[10px] sm:tracking-[0.16em]">New Goog</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => handleCreateAction("ad")}
                            onMouseEnter={prefetchAdCampaignRoutes}
                            onFocus={prefetchAdCampaignRoutes}
                            onTouchStart={prefetchAdCampaignRoutes}
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
                        <button
                            type="button"
                            onClick={() => handleCreateAction("upload-content")}
                            onMouseEnter={prefetchAdCampaignRoutes}
                            onFocus={prefetchAdCampaignRoutes}
                            onTouchStart={prefetchAdCampaignRoutes}
                            className="group flex min-h-[78px] flex-col items-center justify-center gap-1 rounded-[1rem] border border-transparent bg-white/[0.03] px-2 py-2 text-center text-white transition-all duration-300 hover:border-cyan-300/30 hover:bg-cyan-400/12 md:min-h-[74px] md:rounded-[1.15rem] md:px-2.5"
                        >
                            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/8 text-white shadow-inner transition-colors duration-300 group-hover:bg-cyan-400/18 group-hover:text-cyan-100">
                                <IonIcon name="cloud-upload-outline" className="text-[18px]" />
                            </span>
                            <span className="text-[9px] font-black uppercase tracking-[0.14em] text-white/90 sm:text-[10px] sm:tracking-[0.16em]">Upload Content</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Main Content Area */}
            <main
                className={`flex-1 bg-[#1c1917] transition-all duration-300 ${isAdCampaignRoute ? "overflow-visible pb-10 pt-[3.8rem]" : "overflow-y-auto pb-20 pt-20 md:pb-8 md:pt-24"}`}
            >
                <div className={`mx-auto w-full max-w-[1400px] px-2 sm:px-4 md:px-6 lg:px-8 xl:px-10 ${isAdCampaignRoute ? "py-2 sm:py-3" : "py-4 sm:py-5 md:py-6"}`}>
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
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        if (val.length > googLetterLimit) {
                                            setGoogText(val.slice(0, googLetterLimit));
                                            setShowGoogPlansModal(true);
                                            return;
                                        }
                                        setGoogText(val);
                                    }}
                                    placeholder="Write a Goog"
                                    autoFocus
                                    rows={3}
                                    className="flex-1 resize-none bg-transparent text-base font-medium leading-relaxed outline-none placeholder:text-white/30 whitespace-pre-wrap break-words"
                                    style={{
                                        color: googTextColor,
                                        caretColor: googTextColor,
                                        WebkitTextFillColor: googTextColor,
                                    }}
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
                            <div className="flex items-center gap-1.5 border-t border-white/[0.06] pt-3">
                                <p className="text-[10px] font-bold text-white/50 shrink-0">Color</p>
                                <button
                                    type="button"
                                    onClick={() => setColorPage(p => Math.max(0, p - 1))}
                                    disabled={colorPage === 0}
                                    className="h-4 w-4 flex items-center justify-center rounded text-white/40 hover:text-white/80 disabled:opacity-20 shrink-0 text-[10px]"
                                >‹</button>
                                <div className="flex items-center gap-1">
                                    {googTextColors.slice(colorPage * 10, colorPage * 10 + 10).map((color) => (
                                        <button
                                            key={color}
                                            type="button"
                                            onClick={() => setGoogTextColor(color)}
                                            className={`h-4 w-4 rounded border transition-all duration-150 active:scale-90 shrink-0 ${
                                                googTextColor.toLowerCase() === color.toLowerCase()
                                                    ? "border-white shadow shadow-white/20"
                                                    : "border-white/20 hover:border-white/50"
                                            }`}
                                            style={{ backgroundColor: color }}
                                            aria-label={`Color ${color}`}
                                        />
                                    ))}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setColorPage(p => Math.min(Math.ceil(googTextColors.length / 10) - 1, p + 1))}
                                    disabled={colorPage >= Math.ceil(googTextColors.length / 10) - 1}
                                    className="h-4 w-4 flex items-center justify-center rounded text-white/40 hover:text-white/80 disabled:opacity-20 shrink-0 text-[10px]"
                                >›</button>
                                <span className={`ml-auto text-[10px] font-medium shrink-0 ${googText.length >= googLetterLimit ? "text-red-400" : googText.length >= googLetterLimit * 0.85 ? "text-amber-400" : "text-white/40"}`}>
                                    {googText.length}/{googLetterLimit}
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
            <SubscriptionExpiryWarning userId={currentUser?.id || currentUser?.user_id} />

            {showProductPlansModal && (
                <ProductPlansModal
                    onClose={() => setShowProductPlansModal(false)}
                    subtitle="Subscribe to list more products"
                    limitMessage="If you have reached your product upload limit, please subscribe to a higher plan below."
                />
            )}

            {showGoogPlansModal && (
                <ProductPlansModal
                    onClose={() => setShowGoogPlansModal(false)}
                    subtitle="Subscribe to post more Googs"
                    limitMessage="If you have reached your Goog posting limit, please subscribe to a higher plan below."
                />
            )}

            {loginRequiredPrompt && (
                <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
                    <div className="absolute inset-0" onClick={() => setLoginRequiredPrompt(null)} />
                    <div className="relative w-full max-w-[360px] rounded-[2rem] border border-white/10 bg-[#151416] p-7 text-center shadow-[0_30px_100px_rgba(0,0,0,0.62)]">
                        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-red-400/25 bg-red-500/10 text-red-300">
                            <IonIcon name="lock-closed-outline" className="text-3xl" />
                        </div>
                        <h2 className="mt-5 text-lg font-black tracking-[0.04em] text-white">{loginRequiredPrompt.title}</h2>
                        <p className="mt-2 text-sm font-medium leading-relaxed text-white/65">{loginRequiredPrompt.message}</p>
                        <div className="mt-6 flex flex-col gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setLoginRequiredPrompt(null);
                                    setShowLoginModal(true);
                                }}
                                className="w-full rounded-2xl bg-red-500 px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-white transition hover:bg-red-400"
                            >
                                Log In
                            </button>
                            <button
                                type="button"
                                onClick={() => setLoginRequiredPrompt(null)}
                                className="w-full rounded-2xl bg-white/5 px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-white/55 transition hover:bg-white/10 hover:text-white"
                            >
                                Not Now
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showLoginModal && (
                <LoginModal
                    onClose={() => setShowLoginModal(false)}
                    onSuccess={() => {
                        setShowLoginModal(false);
                        try {
                            const storedUser = JSON.parse((sessionStorage.getItem("user") || localStorage.getItem("user")) || "{}");
                            setCurrentUser(storedUser?.id ? storedUser : null);
                        } catch {
                            setCurrentUser(null);
                        }
                        window.location.reload();
                    }}
                />
            )}
        </div>
    );
}
