"use client";

import Image from "next/image";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import IonIcon from "@/app/components/IonIcon";
// import AddProductModal from "@/app/components/AddProductModal"; // Global now
import { marketService } from "@/services/marketService";
import { authService } from "@/services/authService";
import { orderService } from "@/services/orderService";
import ShareModal from "@/app/components/ShareModal";
import InteractionBottomSheet from "@/app/components/InteractionBottomSheet";

export default function ShopPage() {
    const router = useRouter();
    const [showFilters, setShowFilters] = useState(false);
    const [activeTab, setActiveTab] = useState("market"); // market, my-products, orders
    const [myListingsTab, setMyListingsTab] = useState("active");
    const [myListingsSubTab, setMyListingsSubTab] = useState("all"); // for Your Products sub-filter
    const [myOrdersTab, setMyOrdersTab] = useState("all"); // all, processing, shipped, delivered, returns
    const [isCategoriesDrawerOpen, setIsCategoriesDrawerOpen] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState(""); // Filter state
    const [products, setProducts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [selectedProduct, setSelectedProduct] = useState<any>(null);
    const [editingProduct, setEditingProduct] = useState<any>(null);
    const [mounted, setMounted] = useState(false);
    const [showShareModal, setShowShareModal] = useState(false);
    const [shareProduct, setShareProduct] = useState<any>(null);
    const [activePreviewIndex, setActivePreviewIndex] = useState(0);
    const [productComments, setProductComments] = useState<any[]>([]);
    const [newComment, setNewComment] = useState("");
    const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);
    const [interactionProduct, setInteractionProduct] = useState<any>(null);
    const [bottomSheetType, setBottomSheetType] = useState<"likes" | "comments" | "shares" | "views">("comments");
    const [bottomSheetData, setBottomSheetData] = useState<any[]>([]);
    const [openMenuProductId, setOpenMenuProductId] = useState<number | null>(null);
    const [hiddenProductIds, setHiddenProductIds] = useState<number[]>([]);
    const [reportingProduct, setReportingProduct] = useState<any>(null);

    useEffect(() => {
        if (selectedProduct?.id) {
            loadComments(selectedProduct.id);
        }
    }, [selectedProduct?.id]);

    const loadComments = async (id: number) => {
        try {
            const data = await marketService.getComments(id);
            setProductComments(data || []);
        } catch (e) { console.error(e); }
    };

    const handleAddComment = async () => {
        if (!selectedProduct || !newComment.trim()) return;
        if (!currentUser) return alert("Please login to comment");
        try {
            const comment = await marketService.addComment(selectedProduct.id, newComment);
            // Append real username/profile if available from currentUser
            const commentData = {
                ...comment,
                username: currentUser.username,
                profile_picture: currentUser.profile_picture
            };
            setProductComments(prev => [commentData, ...prev]);
            setNewComment("");
            setProducts(prev => prev.map(p =>
                p.id === selectedProduct.id ? { ...p, comments_count: (p.comments_count || 0) + (1) } : p
            ));

            // If bottom sheet is open, refresh comments
            if (isBottomSheetOpen && bottomSheetType === 'comments') {
                const comments = await marketService.getComments(selectedProduct.id);
                setBottomSheetData(comments);
            }
        } catch (e) { console.error(e); }
    };

    const handleSendComment = async (text: string) => {
        if (!selectedProduct) return;
        setNewComment(text);
        // We'll let the user click the button in BottomSheet, or if it calls handleSendComment, we handle it here.
        // Actually, handleAddComment uses newComment. Let's make it more robust:
        try {
            const comment = await marketService.addComment(selectedProduct.id, text);
            const commentData = {
                ...comment,
                username: currentUser?.username || 'You',
                profile_picture: currentUser?.profile_picture
            };
            setBottomSheetData(prev => [commentData, ...prev]);
            setProducts(prev => prev.map(p =>
                p.id === selectedProduct.id ? { ...p, comments_count: (p.comments_count || 0) + 1 } : p
            ));
        } catch (e) { console.error(e); }
    };

    const handleToggleLike = async (id: number) => {
        try {
            const liked = await marketService.toggleLike(id);
            setProducts(prev => prev.map(p =>
                p.id === id ? { ...p, likes_count: (p.likes_count || 0) + (liked ? 1 : -1) } : p
            ));

            // If bottom sheet is open for likes, refresh it in Real Time
            if (isBottomSheetOpen && bottomSheetType === 'likes' && interactionProduct?.id === id) {
                const likes = await marketService.getLikes?.(id) || [];
                setBottomSheetData(likes);
            }
        } catch (e) { console.error(e); }
    };

    const openBottomSheet = async (type: "likes" | "comments" | "shares" | "views", product: any) => {
        setBottomSheetType(type);
        setInteractionProduct(product);
        setIsBottomSheetOpen(true);
        setBottomSheetData([]); // Loading state

        try {
            let data = [];
            if (type === 'comments') {
                data = await marketService.getComments(product.id);
            } else if (type === 'likes') {
                // Assuming marketService.getLikes exists or we can use toggle history
                data = await marketService.getLikes?.(product.id) || [];
            } else if (type === 'shares') {
                data = await marketService.getShares?.(product.id) || [];
            } else if (type === 'views') {
                data = await marketService.getViews?.(product.id) || [];
            }
            setBottomSheetData(data || []);
        } catch (e) { console.error(e); }
    };

    const [draggingType, setDraggingType] = useState<string | null>(null);
    const [dragActive, setDragActive] = useState(false);

    const handleLogShare = async (id: number) => {
        try {
            await marketService.logShare(id);
            setProducts(prev => prev.map(p => p.id === id ? { ...p, shares_count: (p.shares_count || 0) + 1 } : p));
        } catch (e) { console.error(e); }
    };

    const handleLogView = async (id: number) => {
        try {
            await marketService.logView(id);
            // Optionally update state if we want real-time view counts, 
            // but views are limited to 24h so immediate feedback is less critical than likes.
        } catch (e) { console.error(e); }
    };


    const InteractionButton = ({ icon, count, color, onSingleClick, onLongReach, product, type }: any) => {
        const [pressTimer, setPressTimer] = useState<any>(null);
        const [pressActive, setPressActive] = useState(false);

        const handleStart = (e: any) => {
            const target = e.currentTarget;
            const pointerId = e.pointerId;
            setPressActive(false);
            const timer = setTimeout(() => {
                try {
                    target.setPointerCapture(pointerId);
                    setPressActive(true);
                    setDragActive(true);
                    setDraggingType(type);
                    onLongReach();
                } catch (err) { }
            }, 600);
            setPressTimer(timer);
        };

        const handleEnd = (e: any) => {
            if (pressTimer) clearTimeout(pressTimer);
            try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (err) { }

            if (!pressActive) {
                onSingleClick();
            }
            setPressTimer(null);
            setPressActive(false);
            setDragActive(false);
            setDraggingType(null);
        };

        const handlePointerMove = (e: any) => {
            if (!dragActive) return;
            const target = document.elementFromPoint(e.clientX, e.clientY);
            const button = target?.closest('[data-interaction-type]');
            if (button) {
                const newType: any = button.getAttribute('data-interaction-type');
                if (newType !== draggingType) {
                    setDraggingType(newType);
                    openBottomSheet(newType, product);
                }
            }
        };

        return (
            <button
                type="button"
                data-interaction-type={type}
                onPointerDown={handleStart}
                onPointerUp={handleEnd}
                onPointerMove={handlePointerMove}
                onMouseLeave={() => { if (pressTimer) clearTimeout(pressTimer); }}
                className={`text-white/40 hover:${color} transition-all active:scale-75 flex items-center gap-0.5 focus:outline-none focus:ring-0 ${draggingType === type || pressActive ? 'scale-125 !text-white z-10' : ''}`}
                style={{
                    transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                    transform: draggingType === type ? 'scale(1.4) translateY(-4px)' : (pressActive ? 'scale(1.2)' : 'scale(1)')
                }}
            >
                <IonIcon name={icon} className="text-base md:text-xl" />
                {count > 0 && <span className="text-[9px] font-bold">{count}</span>}
            </button>
        );
    };


    const categories = [
        "Gamings", "Headphones", "Parfums", "Fruits", "Mobiles", "Laptops", "Accessories", "Shoes", "Clothing", "Electronics", "Fashion", "Other"
    ];

    useEffect(() => {
        setMounted(true);
        loadUser();
    }, []);

    useEffect(() => {
        loadProducts();
    }, [activeTab, myListingsTab, myListingsSubTab, myOrdersTab, currentUser, selectedCategory]);

    useEffect(() => {
        const handleRefresh = () => refresh();
        window.addEventListener('product-added', handleRefresh);
        return () => window.removeEventListener('product-added', handleRefresh);
    }, []);

    useEffect(() => {
        const handleClickOutside = () => setOpenMenuProductId(null);
        if (openMenuProductId) {
            window.addEventListener('click', handleClickOutside);
        }
        return () => window.removeEventListener('click', handleClickOutside);
    }, [openMenuProductId]);

    const loadUser = async () => {
        try {
            const user = await authService.getProfile();
            setCurrentUser(user);
        } catch (e) {
            console.error("Not logged in");
        }
    };

    const loadProducts = async () => {
        setLoading(true);
        try {
            let data = [];
            const filters: any = {};
            if (activeTab === "market") {
                filters.status = 'approved';
                data = await marketService.getItems(filters);
            } else if (activeTab === "my-products") {
                if (currentUser?.id) {
                    if (myListingsTab === "all") {
                        // "Your Orders" (Seller Side)
                        // If sub-tab is 'all', we might want to show everything or just pending?
                        // User says 'All Orders' shows admin-approved products. 
                        // For demo, I'll fetch orders. If 'all', I'll show all including pending.
                        let statusFilter = myListingsSubTab === 'all' ? '' : myListingsSubTab;
                        if (myListingsSubTab === 'delivered') statusFilter = 'delivered,received';
                        data = await orderService.getSellerOrders({ status: statusFilter });
                    } else if (myListingsTab === "active") {
                        data = await marketService.getItems({ user_id: currentUser.id, status: 'approved' });
                    } else if (myListingsTab === "reviewing") {
                        data = await marketService.getItems({ user_id: currentUser.id, status: 'reviewing,rejected' });
                    } else if (myListingsTab === "deleted") {
                        data = await marketService.getItems({ user_id: currentUser.id, status: 'deleted' });
                    }
                }
            } else if (activeTab === "orders") {
                if (currentUser?.id) {
                    let statusFilter = myOrdersTab === 'all' ? '' : myOrdersTab;
                    if (myOrdersTab === 'delivered') statusFilter = 'delivered,received';
                    data = await orderService.getBuyerOrders({ status: statusFilter });
                }
            }

            if (selectedCategory && activeTab === 'market') {
                // Already handled by filters if passed to marketService.getItems
                // But for orders, maybe category doesn't apply the same way? 
                // Mostly user wants categories for the public marketplace.
            }
            // data = await marketService.getItems(filters); // original logic was slightly different branching
            // Let's stick to original structure but add category
            /*
            if (activeTab === "market") {
                data = await marketService.getItems({ status: 'approved', category: selectedCategory || undefined });
            } else if (activeTab === "my-products") {
                if (currentUser?.id) {
                    data = await marketService.getItems({ user_id: currentUser.id, status: 'approved', category: selectedCategory || undefined });
                }
            } else if (activeTab === "reviewing") {
                if (currentUser?.id) {
                    data = await marketService.getItems({ user_id: currentUser.id, status: 'reviewing', category: selectedCategory || undefined });
                }
            }
            */
            setProducts(data || []);
        } catch (e) {
            console.error("Failed to load products", e);
        } finally {
            setLoading(false);
        }
    };

    const refresh = () => {
        loadProducts();
        if (activeTab !== 'market') {
            setActiveTab("my-products");
            setMyListingsTab("reviewing");
        }
        setEditingProduct(null);
        setIsCategoriesDrawerOpen(false);
    };

    const handleDeleteProduct = async (id: number) => {
        if (!confirm("Are you sure you want to delete this listing?")) return;
        try {
            await marketService.deleteItem(id);
            setSelectedProduct(null);
            loadProducts();
        } catch (e) {
            console.error("Failed to delete product", e);
            alert("Failed to delete product. Please try again.");
        }
    };

    const handleEditProduct = (product: any) => {
        setEditingProduct(product);
        setSelectedProduct(null);
        // setIsModalOpen(true);
        window.dispatchEvent(new CustomEvent('open-add-product-modal', { detail: product }));
    };

    const handleBuyItem = async (itemId: number) => {
        if (!currentUser) return alert("Please login to buy items");
        setLoading(true);
        try {
            // Log a view when buying (as it's a detail interaction)
            handleLogView(itemId);

            await orderService.createOrder(itemId);
            alert("Order placed successfully! Check 'Your Orders' for status.");
            setSelectedProduct(null);
            setActivePreviewIndex(0);
            setActiveTab("orders");
        } catch (e: any) {
            console.error(e);
            alert(e.message || "Failed to place order");
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateOrderStatus = async (orderId: number, status: string) => {
        try {
            await orderService.updateStatus(orderId, status);
            loadProducts(); // Fresh results
        } catch (e: any) {
            alert(e.message || "Failed to update status");
        }
    };

    const handleNotInterested = (productId: number) => {
        setHiddenProductIds(prev => [...prev, productId]);
        setOpenMenuProductId(null);
    };

    const handleReportSubmit = (productId: number) => {
        alert(`Product ${productId} has been reported to admin for review.`);
        setReportingProduct(null);
        setOpenMenuProductId(null);
    };

    const MarketItemWrapper = ({ product, children, isCompact = false }: { product: any, children: React.ReactNode, isCompact?: boolean }) => {
        useEffect(() => {
            // "When a user sees a product for the first time... it should automatically count as 1 view."
            // Simple view log on mount. 24h limit is handled by backend.
            if (product?.id && activeTab === 'market') {
                handleLogView(product.id);
            }
        }, [product?.id]);

        return <>{children}</>;
    };


    return (
        <div className="pb-10 relative min-h-screen">
            {/* Search Portal for Mobile Topbar */}
            {mounted && document.getElementById('shop-search-portal') && createPortal(
                <div className="w-full relative">
                    <input
                        type="text"
                        placeholder="Product Search"
                        className="w-full bg-[#1a1a1a] text-white text-xs rounded-full pl-8 pr-3 py-1.5 outline-none focus:ring-1 focus:ring-white/30 border border-white/10 placeholder:text-white"
                    />
                    <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm flex items-center">
                        <IonIcon name="search-outline" />
                    </div>
                </div>,
                document.getElementById('shop-search-portal')!
            )}

            <h1 className="text-3xl font-bold mb-6 text-white hidden md:block">Marketplace</h1>

            {/* Header: Tabs + Search (Desktop) */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-6">
                {/* Tabs */}
                <div className="flex items-center gap-2 w-full md:w-auto relative">
                    <div
                        id="tabs-scroll"
                        className="flex gap-8 border-b border-gray-800 w-full md:w-auto overflow-x-auto scroll-smooth scrollbar-none px-1"
                        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                    >
                        <button
                            onClick={() => setActiveTab("market")}
                            className={`pb-3 text-sm font-medium transition-colors relative whitespace-nowrap ${activeTab === "market" ? "text-white" : "text-gray-400 hover:text-gray-300"}`}
                        >
                            <div className="flex items-center gap-2">
                                <IonIcon name="storefront-outline" />
                                Market
                            </div>
                            {activeTab === "market" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white shadow-[0_0_10px_rgba(255,255,255,0.3)]"></div>}
                        </button>

                        <button
                            onClick={() => setActiveTab("my-products")}
                            className={`pb-3 text-sm font-medium transition-colors relative whitespace-nowrap ${activeTab === "my-products" ? "text-white" : "text-gray-400 hover:text-gray-300"}`}
                        >
                            <div className="flex items-center gap-2">
                                <IonIcon name="pricetags-outline" />
                                My Listings
                            </div>
                            {activeTab === "my-products" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white shadow-[0_0_10px_rgba(255,255,255,0.3)]"></div>}
                        </button>

                        <button
                            onClick={() => setActiveTab("orders")}
                            className={`pb-3 text-sm font-medium transition-colors relative whitespace-nowrap ${activeTab === "orders" ? "text-white" : "text-gray-400 hover:text-gray-300"}`}
                        >
                            <div className="flex items-center gap-2">
                                <IonIcon name="cart-outline" />
                                Your Orders
                            </div>
                            {activeTab === "orders" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white shadow-[0_0_10px_rgba(255,255,255,0.3)]"></div>}
                        </button>
                    </div>
                </div>

                {/* Search & Filter (Desktop only - mobile uses portal) */}
                <div className="hidden md:flex items-center gap-4 flex-1 md:max-w-md">
                    <div className="flex-1 relative">
                        <input
                            type="text"
                            placeholder="Product Search"
                            className="w-full bg-[#1a1a1a] text-white text-sm rounded-lg pl-10 pr-4 py-2.5 outline-none focus:ring-1 focus:ring-white/30 border border-white/10 placeholder:text-white"
                        />
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg flex items-center">
                            <IonIcon name="search-outline" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Sub-tabs for My Listings */}
            {activeTab === 'my-products' && (
                <div className="flex flex-col gap-4 mb-8">
                    <div className="flex items-center gap-2 select-none">
                        <button className="md:hidden flex-shrink-0 w-8 h-8 flex items-center justify-center text-white bg-gray-800/40 hover:bg-gray-700/60 rounded-full border border-gray-700/50 transition-all active:scale-95 shadow-lg" onClick={() => document.getElementById('mylisting-scroll')?.scrollBy({ left: -150, behavior: 'smooth' })}>
                            <IonIcon name="chevron-back" className="text-lg" />
                        </button>
                        <div id="mylisting-scroll" className="flex-1 md:flex-none flex items-center gap-1.5 p-1 bg-white/5 rounded-2xl overflow-x-auto no-scrollbar border border-white/5 scroll-smooth">
                            {[
                                { id: 'active', label: 'Active Products', icon: 'checkmark-circle' },
                                { id: 'all', label: 'Your Orders', icon: 'receipt' },
                                {
                                    id: 'reviewing',
                                    label: products.some(p => p.status === 'rejected') ? 'Rejected Products' : 'Review Products',
                                    icon: products.some(p => p.status === 'rejected') ? 'close-circle' : 'time'
                                },
                                { id: 'deleted', label: 'Inactive Products', icon: 'trash' }
                            ].map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setMyListingsTab(tab.id)}
                                    className={`flex items-center justify-center gap-2 px-4 py-2 w-44 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap
                                        ${myListingsTab === tab.id
                                            ? 'bg-white text-black shadow-lg shadow-white/5 scale-[1.02]'
                                            : 'text-slate-500 hover:text-white hover:bg-white/5'
                                        }`}
                                >
                                    <IonIcon name={tab.icon + (myListingsTab === tab.id ? "" : "-outline")} className="text-sm" />
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                        <button className="md:hidden flex-shrink-0 w-8 h-8 flex items-center justify-center text-white bg-gray-800/40 hover:bg-gray-700/60 rounded-full border border-gray-700/50 transition-all active:scale-95 shadow-lg" onClick={() => document.getElementById('mylisting-scroll')?.scrollBy({ left: 150, behavior: 'smooth' })}>
                            <IonIcon name="chevron-forward" className="text-lg" />
                        </button>
                    </div>

                    {/* Category Sub-tabs for "Your Products" */}
                    {myListingsTab === 'all' && (
                        <div className="flex items-center gap-1.5 p-1 bg-white/[0.02] rounded-2xl w-full md:w-fit overflow-x-auto no-scrollbar border border-white/5">
                            {[
                                { id: 'all', label: 'All Orders', icon: 'list' },
                                { id: 'processing', label: 'Processing', icon: 'sync' },
                                { id: 'shipped', label: 'Shipped', icon: 'airplane' },
                                { id: 'delivered', label: 'Delivered', icon: 'cube' },
                                { id: 'returns', label: 'Returns', icon: 'refresh-circle' }
                            ].map((sub) => (
                                <button
                                    key={sub.id}
                                    onClick={() => setMyListingsSubTab(sub.id)}
                                    className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap
                                        ${myListingsSubTab === sub.id
                                            ? 'bg-white/10 text-white'
                                            : 'text-slate-600 hover:text-slate-400'
                                        }`}
                                >
                                    {sub.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Sub-tabs for My Orders */}
            {activeTab === 'orders' && (
                <div className="flex items-center gap-2 mb-8 select-none animate-in slide-in-from-left-4 duration-500">
                    <button className="md:hidden flex-shrink-0 w-8 h-8 flex items-center justify-center text-white bg-gray-800/40 hover:bg-gray-700/60 rounded-full border border-gray-700/50 transition-all active:scale-95 shadow-lg" onClick={() => document.getElementById('myorders-scroll')?.scrollBy({ left: -150, behavior: 'smooth' })}>
                        <IonIcon name="chevron-back" className="text-lg" />
                    </button>
                    <div id="myorders-scroll" className="flex-1 md:flex-none flex items-center gap-1.5 p-1 bg-white/5 rounded-2xl overflow-x-auto no-scrollbar border border-white/5 scroll-smooth">
                        {[
                            { id: 'all', label: 'All Orders', icon: 'receipt' },
                            { id: 'processing', label: 'Processing', icon: 'sync' },
                            { id: 'shipped', label: 'Shipped', icon: 'airplane' },
                            { id: 'delivered', label: 'Delivered', icon: 'cube' },
                            { id: 'returns', label: 'Returns', icon: 'refresh-circle' }
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setMyOrdersTab(tab.id)}
                                className={`flex items-center justify-center gap-2 px-4 py-2 w-44 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap
                                    ${myOrdersTab === tab.id
                                        ? 'bg-white text-black shadow-lg shadow-white/5 scale-[1.02]'
                                        : 'text-slate-500 hover:text-white hover:bg-white/5'
                                    }`}
                            >
                                <IonIcon name={tab.icon + (myOrdersTab === tab.id ? "" : "-outline")} className="text-sm" />
                                {tab.label}
                            </button>
                        ))}
                    </div>
                    <button className="md:hidden flex-shrink-0 w-8 h-8 flex items-center justify-center text-white bg-gray-800/40 hover:bg-gray-700/60 rounded-full border border-gray-700/50 transition-all active:scale-95 shadow-lg" onClick={() => document.getElementById('myorders-scroll')?.scrollBy({ left: 150, behavior: 'smooth' })}>
                        <IonIcon name="chevron-forward" className="text-lg" />
                    </button>
                </div>
            )}

            {/* Categories - Only visible in Market */}
            {activeTab === 'market' && (
                <div className="flex items-center gap-2 mb-8 select-none">
                    <button className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-white bg-gray-800/40 hover:bg-gray-700/60 rounded-full border border-gray-700/50 transition-all active:scale-95 shadow-lg" onClick={() => document.getElementById('category-scroll')?.scrollBy({ left: -150, behavior: 'smooth' })}>
                        <IonIcon name="chevron-back" className="text-lg" />
                    </button>
                    <div id="category-scroll" className="flex-1 flex gap-2 overflow-x-auto scroll-smooth py-1 no-scrollbar overflow-y-hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                        <button
                            onClick={() => setSelectedCategory("")}
                            className={`px-4 py-2 text-xs font-bold rounded-xl whitespace-nowrap transition-all border active:scale-95 shadow-sm shrink-0 ${selectedCategory === "" ? "bg-white text-black border-white" : "bg-[#1a1a1a] border-white/5 hover:border-white/20 text-gray-400 hover:text-white"}`}
                        >
                            All
                        </button>
                        {categories.map((cat, i) => (
                            <button
                                key={i}
                                onClick={() => setSelectedCategory(cat)}
                                className={`px-4 py-2 text-xs font-bold rounded-xl whitespace-nowrap transition-all border active:scale-95 shadow-sm shrink-0 ${selectedCategory === cat ? "bg-white text-black border-white" : "bg-[#1a1a1a] border-white/5 hover:border-white/20 text-gray-400 hover:text-white"}`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                    <button className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-white bg-gray-800/40 hover:bg-gray-700/60 rounded-full border border-gray-700/50 transition-all active:scale-95 shadow-lg" onClick={() => document.getElementById('category-scroll')?.scrollBy({ left: 150, behavior: 'smooth' })}>
                        <IonIcon name="chevron-forward" className="text-lg" />
                    </button>
                </div>
            )}

            {/* Product Rendering */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-white"></div>
                </div>
            ) : products.length === 0 ? (
                <div className="text-center py-20 text-gray-500 bg-white/[0.02] rounded-[3rem] border border-white/5 border-dashed">
                    <IonIcon name={(activeTab === 'my-products' && myListingsTab === 'reviewing') ? 'time-outline' : 'basket-outline'} className="text-4xl mb-3 opacity-20" />
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40">No items found here</p>
                </div>
            ) : (activeTab === 'orders' || (activeTab === 'my-products' && myListingsTab === 'all')) ? (
                /* Compact Horizontal Layout for Orders (Admin-style) */
                <div className="flex flex-col gap-4 mb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    {products.filter(p => !hiddenProductIds.includes(p.id)).map((item) => (
                        <MarketItemWrapper key={item.id} product={item} isCompact={true}>
                            <div
                                className="bg-[#1a1a1a] rounded-[2rem] border border-white/5 hover:border-white/10 transition-all p-4 md:p-6 flex flex-col md:flex-row gap-6 group relative overflow-hidden"
                                onClick={() => { setSelectedProduct(item); handleLogView(item.id); }}
                            >

                                {/* Product Image (Left) */}
                                <div className="relative w-full md:w-40 aspect-square md:aspect-auto md:h-40 rounded-2xl overflow-hidden shrink-0 bg-black border border-white/5">
                                    <Image
                                        src={(item.image_url && (item.image_url.includes('uploads') || item.image_url.includes('\\')))
                                            ? `/uploads/${item.image_url.split(/[\\/]/).pop()}`
                                            : (item.image_url || "https://picsum.photos/400/400")}
                                        alt={item.title}
                                        fill
                                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                                    />
                                    <div className="absolute top-3 left-3 px-2 py-1 bg-black/60 backdrop-blur-md rounded-lg border border-white/10">
                                        <span className="text-[8px] font-black uppercase text-white tracking-widest">{item.status}</span>
                                    </div>
                                </div>

                                {/* Info Section (Middle) */}
                                <div className="flex-1 flex flex-col justify-between py-1 min-w-0">
                                    <div>
                                        <div className="flex items-start justify-between gap-4 mb-2">
                                            <div className="min-w-0">
                                                <h3 className="text-white text-lg font-black truncate uppercase tracking-tight group-hover:text-blue-400 transition-colors uppercase">
                                                    {item.title}
                                                </h3>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <div className="w-5 h-5 rounded-full overflow-hidden border border-white/10 relative">
                                                        {item.profile_picture ? (
                                                            <Image src={item.profile_picture} alt="Avatar" fill className="object-cover" />
                                                        ) : (
                                                            <div className="w-full h-full bg-blue-600/20 flex items-center justify-center text-[8px] text-blue-400">
                                                                <IonIcon name="person" />
                                                            </div>
                                                        )}
                                                    </div>
                                                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                                                        {activeTab === 'orders' ? `Seller: @${item.owner_username || 'Anonymous'}` : `Buyer: @${item.buyer_username || 'Customer'}`}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <div className="flex items-baseline gap-1 justify-end">
                                                    <span className="text-[10px] font-black text-white/40">R</span>
                                                    <span className="text-xl font-black text-white tracking-tighter">{item.promo_price || item.price}</span>
                                                </div>
                                                <p className="text-[8px] text-slate-600 font-black uppercase tracking-[0.2em] mt-1">Order #{item.id}</p>
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap gap-2 mb-4">
                                            <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-[8px] font-black rounded border border-blue-500/10 uppercase tracking-widest">
                                                {item.category}
                                            </span>
                                            <span className="px-2 py-0.5 bg-white/5 text-slate-400 text-[8px] font-black rounded border border-white/5 uppercase tracking-widest">
                                                Qty: 1
                                            </span>
                                            <span className="px-2 py-0.5 bg-white/5 text-slate-500 text-[8px] font-black rounded border border-white/5 uppercase tracking-widest">
                                                {new Date(item.created_at || Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                                            </span>
                                        </div>

                                        {item.description && (
                                            <p className="text-[10px] text-slate-500 leading-relaxed line-clamp-2 opacity-60">
                                                {item.description}
                                            </p>
                                        )}
                                    </div>

                                    {/* Actions (Bottom) */}
                                    <div className="flex items-center justify-between gap-4 mt-6 pt-4 border-t border-white/5">
                                        <div className="flex items-center gap-4">
                                            <button onClick={(e) => { e.stopPropagation(); setSelectedProduct(item); handleLogView(item.id); }} className="text-slate-500 hover:text-white transition-colors flex items-center gap-1">
                                                <IonIcon name="chatbubble-outline" className="text-lg" />
                                                {item.comments_count > 0 && <span className="text-[9px] font-bold">{item.comments_count}</span>}
                                            </button>
                                            <button onClick={(e) => { e.stopPropagation(); setShareProduct(item); setShowShareModal(true); handleLogShare(item.id); }} className="text-slate-500 hover:text-white transition-colors flex items-center gap-1">
                                                <IonIcon name="share-social-outline" className="text-lg" />
                                                {item.shares_count > 0 && <span className="text-[9px] font-bold">{item.shares_count}</span>}
                                            </button>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            {activeTab === 'orders' ? (
                                                /* Buyer Actions */
                                                <>
                                                    {item.status === 'delivered' ? (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleUpdateOrderStatus(item.id, 'received'); }}
                                                            className="px-6 py-2 bg-green-500 text-black text-[10px] font-black uppercase rounded-xl hover:bg-green-400 transition-all shadow-lg shadow-green-500/20 active:scale-95"
                                                        >
                                                            Confirm Receipt
                                                        </button>
                                                    ) : item.status === 'received' ? (
                                                        <span className="flex items-center gap-2 px-4 py-2 bg-green-500/10 text-green-500 text-[10px] font-black uppercase rounded-xl border border-green-500/20">
                                                            <IonIcon name="checkmark-done" /> Completed
                                                        </span>
                                                    ) : (
                                                        <span className="px-4 py-2 bg-white/5 text-slate-400 text-[10px] font-black uppercase rounded-xl border border-white/5">
                                                            {item.status === 'processing' ? 'Being Packed' : item.status === 'shipped' ? 'In Transit' : 'Pending'}
                                                        </span>
                                                    )}
                                                </>
                                            ) : (
                                                /* Seller Actions (Sales) */
                                                <>
                                                    {(item.status === 'pending' || item.status === 'approved' || item.status === 'all') ? (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleUpdateOrderStatus(item.id, 'processing'); }}
                                                            className="px-6 py-2 bg-white text-black text-[10px] font-black uppercase rounded-xl hover:bg-blue-50 transition-all shadow-lg active:scale-95"
                                                        >
                                                            Process Order
                                                        </button>
                                                    ) : item.status === 'processing' ? (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleUpdateOrderStatus(item.id, 'shipped'); }}
                                                            className="px-6 py-2 bg-blue-600 text-white text-[10px] font-black uppercase rounded-xl hover:bg-blue-500 transition-all shadow-lg shadow-blue-500/20 active:scale-95"
                                                        >
                                                            Ship Now
                                                        </button>
                                                    ) : item.status === 'shipped' ? (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleUpdateOrderStatus(item.id, 'delivered'); }}
                                                            className="px-6 py-2 bg-green-600 text-white text-[10px] font-black uppercase rounded-xl hover:bg-green-500 transition-all shadow-lg shadow-green-500/20 active:scale-95"
                                                        >
                                                            Mark Delivered
                                                        </button>
                                                    ) : item.status === 'delivered' ? (
                                                        <span className="px-4 py-2 bg-blue-500/10 text-blue-400 text-[10px] font-black uppercase rounded-xl border border-blue-500/20">
                                                            Awaiting Receipt
                                                        </span>
                                                    ) : item.status === 'received' ? (
                                                        <span className="px-4 py-2 bg-green-500/10 text-green-500 text-[10px] font-black uppercase rounded-xl border border-green-500/20">
                                                            Completed
                                                        </span>
                                                    ) : null}
                                                </>
                                            )}
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setSelectedProduct(item); }}
                                                className="w-10 h-10 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl flex items-center justify-center text-slate-400 hover:text-white transition-all shadow-inner"
                                            >
                                                <IonIcon name="eye-outline" className="text-lg" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </MarketItemWrapper>
                    ))}
                </div>
            ) : (
                /* Grid Layout for Marketplace and My Listings */
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mb-10">
                    {products.filter(p => !hiddenProductIds.includes(p.id)).map((product) => (
                        <MarketItemWrapper key={product.id} product={product}>
                            <div
                                className="group cursor-pointer bg-[#1a1a1a] rounded-[1.5rem] md:rounded-[2.5rem] pb-4 md:pb-8 border border-white/5 hover:border-white/20 transition-all hover:shadow-2xl relative flex flex-col min-w-0"
                                onClick={() => { setSelectedProduct(product); handleLogView(product.id); }}
                            >

                                {/* Profile Header with Subscribe */}
                                <div className="flex items-center justify-between gap-1.5 p-3 md:p-4 md:px-5">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-gradient-to-tr from-blue-600 to-purple-600 flex items-center justify-center text-[8px] md:text-[10px] text-white overflow-hidden border border-white/10 shadow-lg relative flex-shrink-0">
                                            {product.profile_picture ? (
                                                <Image src={product.profile_picture} alt="Profile" fill className="object-cover" />
                                            ) : (
                                                <IonIcon name="person" className="text-white" />
                                            )}
                                        </div>
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-[8px] md:text-[10px] text-white font-black uppercase tracking-tight truncate leading-none">
                                                {product.username || product.owner_username || 'Anonymous'}
                                            </span>
                                            <span className="text-[6px] md:text-[7px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Seller</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); alert('Subscribed!'); }}
                                            className="px-2 md:px-4 py-1 md:py-1.5 bg-white text-black text-[7px] md:text-[9px] font-black uppercase rounded-full shadow-lg active:scale-95 transition-all hover:bg-slate-200 flex-shrink-0"
                                        >
                                            <span className="md:hidden">Sub</span>
                                            <span className="hidden md:inline">Subscribe</span>
                                        </button>

                                        <div className="relative">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setOpenMenuProductId(openMenuProductId === product.id ? null : product.id);
                                                }}
                                                className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-white/5 hover:bg-white/10 text-white flex items-center justify-center transition-all active:scale-75"
                                            >
                                                <div className="flex flex-col gap-0.5">
                                                    <div className="w-1 h-1 bg-white rounded-full"></div>
                                                    <div className="w-1 h-1 bg-white rounded-full"></div>
                                                </div>
                                            </button>

                                            {/* Dropdown Menu */}
                                            {openMenuProductId === product.id && (
                                                <div
                                                    className="absolute right-0 top-full mt-2 w-32 md:w-40 bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl py-2 z-[60] animate-in slide-in-from-top-2 duration-200 overflow-hidden"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    {currentUser?.id === product.user_id ? (
                                                        <>
                                                            <button
                                                                onClick={() => handleEditProduct(product)}
                                                                className="w-full px-4 py-2.5 text-left text-[10px] md:text-xs font-bold text-white hover:bg-white/5 flex items-center gap-2 transition-colors"
                                                            >
                                                                <IonIcon name="create-outline" className="text-blue-400" />
                                                                Edit
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteProduct(product.id)}
                                                                className="w-full px-4 py-2.5 text-left text-[10px] md:text-xs font-bold text-red-500 hover:bg-white/5 flex items-center gap-2 transition-colors border-t border-white/5"
                                                            >
                                                                <IonIcon name="trash-outline" />
                                                                Delete
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <button
                                                                onClick={() => { setReportingProduct(product); setOpenMenuProductId(null); }}
                                                                className="w-full px-4 py-2.5 text-left text-[10px] md:text-xs font-bold text-white hover:bg-white/5 flex items-center gap-2 transition-colors"
                                                            >
                                                                <IonIcon name="alert-circle-outline" className="text-yellow-500" />
                                                                Report
                                                            </button>
                                                            <button
                                                                onClick={() => handleNotInterested(product.id)}
                                                                className="w-full px-4 py-2.5 text-left text-[10px] md:text-xs font-bold text-white hover:bg-white/5 flex items-center gap-2 transition-colors border-t border-white/5"
                                                            >
                                                                <IonIcon name="eye-off-outline" className="text-slate-500" />
                                                                Not Interested
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Image Section */}
                                <div className="relative aspect-square mx-3 rounded-[2rem] overflow-hidden mb-5 bg-black border border-white/5 shadow-inner">
                                    <Image
                                        src={(product.image_url && (product.image_url.includes('uploads') || product.image_url.includes('\\')))
                                            ? `/uploads/${product.image_url.split(/[\\/]/).pop()}`
                                            : (product.image_url || "https://picsum.photos/400/400")}
                                        alt={product.title}
                                        fill
                                        sizes="(max-width: 768px) 50vw, 25vw"
                                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                                    />
                                    {product.status === 'reviewing' && activeTab !== 'orders' && (
                                        <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center">
                                            <div className="flex flex-col items-center gap-2 text-white">
                                                <div className="w-10 h-10 md:w-12 md:h-12 rounded-full border-2 border-white flex items-center justify-center bg-black/50">
                                                    <IonIcon name="time" className="text-xl md:text-2xl" />
                                                </div>
                                                <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider bg-black/60 px-2 py-1 rounded-full border border-white/30">Reviewing</span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Product Discount Badge on Image Box */}
                                    {(() => {
                                        try {
                                            const comm = typeof product.commission_info === 'string' ? JSON.parse(product.commission_info) : product.commission_info;
                                            const gComm = comm?.googer_commission;
                                            if (gComm && parseFloat(gComm) > 0) {
                                                return (
                                                    <div className="absolute bottom-3 right-3 z-10 px-2.5 py-1 bg-green-500/10 backdrop-blur-md border border-green-500/20 rounded-lg shadow-[0_0_10px_rgba(34,197,94,0.1)]">
                                                        <span className="text-[10px] md:text-xs font-black text-green-500">+{gComm}%</span>
                                                    </div>
                                                );
                                            }
                                        } catch (e) {
                                            console.warn("Failed to parse commission_info for product", product.id);
                                        }
                                        return null;
                                    })()}
                                    {product.status === 'rejected' && (
                                        <div className="absolute inset-0 bg-red-900/40 backdrop-blur-[2px] flex items-center justify-center">
                                            <div className="flex flex-col items-center gap-2 text-white">
                                                <div className="w-10 h-10 md:w-12 md:h-12 rounded-full border-2 border-red-500 flex items-center justify-center bg-red-600/30">
                                                    <IonIcon name="close" className="text-xl md:text-2xl text-red-100" />
                                                </div>
                                                <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider bg-red-600/80 px-2 py-1 rounded-full border border-red-400">Rejected</span>
                                            </div>
                                        </div>
                                    )}
                                    {(activeTab === 'orders' || (activeTab === 'my-products' && myListingsTab === 'all')) && product.status && (
                                        <div className="absolute top-4 right-4 px-2 py-1 bg-black/60 backdrop-blur-md rounded-lg border border-white/10">
                                            <span className="text-[8px] font-black uppercase text-white tracking-widest">{product.status}</span>
                                        </div>
                                    )}
                                </div>

                                {/* Content Section */}
                                <div className="px-3 md:px-6 pb-2">
                                    <h3 className="text-white text-[12px] font-black truncate mb-3 uppercase tracking-tight group-hover:text-blue-400 transition-colors uppercase">{product.title}</h3>

                                    <div className="flex flex-col mb-6">
                                        {product.promo_price && (
                                            <span className="text-[10px] text-slate-500 line-through font-bold opacity-60">R {product.price}</span>
                                        )}
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-xs font-black text-white/40">R</span>
                                            <span className="text-2xl font-black text-white tracking-tighter">{product.promo_price || product.price}</span>
                                        </div>
                                    </div>

                                    {/* Bottom action bar: 2-row on mobile, 1-row on desktop */}
                                    <div className="border-t border-white/5 pt-2 md:pt-4 flex flex-col gap-2">

                                        <div className="flex items-center gap-2 md:gap-3 w-full" onPointerLeave={() => { if (dragActive) setDragActive(false); setDraggingType(null); }}>
                                            <InteractionButton
                                                type="likes"
                                                icon="heart-outline"
                                                count={product.likes_count}
                                                color="text-red-500"
                                                onSingleClick={() => handleToggleLike(product.id)}
                                                onLongReach={() => openBottomSheet('likes', product)}
                                                product={product}
                                            />
                                            <InteractionButton
                                                type="comments"
                                                icon="chatbubble-outline"
                                                count={product.comments_count}
                                                color="text-white"
                                                onSingleClick={() => { setSelectedProduct(product); handleLogView(product.id); }}
                                                onLongReach={() => openBottomSheet('comments', product)}
                                                product={product}
                                            />
                                            <InteractionButton
                                                type="shares"
                                                icon="share-social-outline"
                                                count={product.shares_count}
                                                color="text-green-500"
                                                onSingleClick={() => { setShareProduct(product); setShowShareModal(true); }}
                                                onLongReach={() => openBottomSheet('shares', product)}
                                                product={product}
                                            />
                                            <InteractionButton
                                                type="views"
                                                icon="eye-outline"
                                                count={product.views_count}
                                                color="text-blue-500"
                                                onSingleClick={() => { setSelectedProduct(product); handleLogView(product.id); }}
                                                onLongReach={() => openBottomSheet('views', product)}
                                                product={product}
                                            />

                                            {/* Cart Icon — pinned right, always visible */}
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setSelectedProduct(product); handleLogView(product.id); }}
                                                className="ml-auto flex-shrink-0 flex items-center justify-center w-6 h-6 text-white/40 hover:text-blue-400 transition-all active:scale-75 focus:outline-none focus:ring-0"
                                            >
                                                <IonIcon name="cart-outline" className="text-base md:text-xl" />
                                            </button>
                                        </div>

                                        {/* Row 2 (mobile: below icons | desktop: hidden since it's in row 1 via ml-auto) */}
                                        {/* Context action buttons — shown only when needed */}
                                        {(() => {
                                            const actionBtn = product.status === 'rejected' ? (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleEditProduct(product); }}
                                                    className="px-3 py-1 bg-white/10 hover:bg-white hover:text-black text-white text-[9px] font-black uppercase rounded-lg transition-all whitespace-nowrap"
                                                >
                                                    Edit
                                                </button>
                                            ) : (activeTab === 'my-products' && myListingsTab === 'all') ? (
                                                (product.status === 'pending' || product.status === 'approved' || product.status === 'all') ? (
                                                    <button onClick={(e) => { e.stopPropagation(); handleUpdateOrderStatus(product.id, 'processing'); }} className="px-2 py-1 bg-white text-black text-[8px] font-black uppercase rounded-lg border border-white whitespace-nowrap">Process</button>
                                                ) : product.status === 'processing' ? (
                                                    <button onClick={(e) => { e.stopPropagation(); handleUpdateOrderStatus(product.id, 'shipped'); }} className="px-2 py-1 bg-blue-600 text-white text-[8px] font-black uppercase rounded-lg whitespace-nowrap">Ship</button>
                                                ) : product.status === 'shipped' ? (
                                                    <button onClick={(e) => { e.stopPropagation(); handleUpdateOrderStatus(product.id, 'delivered'); }} className="px-2 py-1 bg-green-600 text-white text-[8px] font-black uppercase rounded-lg whitespace-nowrap">Deliver</button>
                                                ) : product.status === 'delivered' ? (
                                                    <span className="text-[8px] text-blue-400 font-black uppercase whitespace-nowrap">Wait Buyer</span>
                                                ) : product.status === 'received' ? (
                                                    <span className="text-[8px] text-green-500 font-black uppercase whitespace-nowrap">Done ✓</span>
                                                ) : null
                                            ) : activeTab === 'orders' ? (
                                                product.status === 'delivered' ? (
                                                    <button onClick={(e) => { e.stopPropagation(); handleUpdateOrderStatus(product.id, 'received'); }} className="px-2 py-1 bg-green-600 text-white text-[8px] font-black uppercase rounded-lg whitespace-nowrap">Received?</button>
                                                ) : product.status === 'received' ? (
                                                    <span className="text-[8px] text-green-500 font-black uppercase whitespace-nowrap">Done ✓</span>
                                                ) : null
                                            ) : null;

                                            return actionBtn ? (
                                                <div className="flex items-center">
                                                    {actionBtn}
                                                </div>
                                            ) : null;
                                        })()}
                                    </div>
                                </div>
                            </div>
                        </MarketItemWrapper>
                    ))}
                </div>
            )}

            {/* Pagination */}
            {
                products.length > 0 && (
                    <div className="flex justify-center items-center gap-2 mb-20 fade-in">
                        <button className="w-8 h-8 flex items-center justify-center rounded-lg border border-white/10 text-gray-400 hover:bg-white/5 hover:text-white transition-colors"> <IonIcon name="chevron-back-outline" /> </button>
                        <button className="w-8 h-8 flex items-center justify-center rounded-lg bg-white text-black font-black text-xs">1</button>
                        <button className="w-8 h-8 flex items-center justify-center rounded-lg border border-white/10 text-gray-400 hover:bg-white/5 hover:text-white transition-colors"> <IonIcon name="chevron-forward-outline" /> </button>
                    </div>
                )
            }





            {/* Product Details Modal (Assuming existing code is mostly fine used selectedProduct state) */}
            {selectedProduct && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-2 md:p-4 bg-black/95 backdrop-blur-xl animate-in fade-in duration-300" onClick={() => { setSelectedProduct(null); setActivePreviewIndex(0); }}>
                    <div
                        className="bg-[#121212] border border-white/10 rounded-[1.5rem] md:rounded-[2.5rem] w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col md:flex-row h-full md:h-auto max-h-[95vh] md:max-h-[90vh] animate-in zoom-in-95 duration-300"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Left Side: Image Gallery */}
                        <div className="w-full md:w-[45%] bg-[#0a0a0a] relative flex flex-col shrink-0 border-b md:border-b-0 md:border-r border-white/5">
                            {/* Top Navigation Bar */}
                            <div className="h-16 md:h-20 bg-black flex items-center justify-between px-4 md:px-6 border-b border-white/5 shrink-0">
                                <div 
                                    className="flex items-center gap-2 md:gap-3 cursor-pointer group"
                                    onClick={() => { setSelectedProduct(null); router.push(`/dashboard/profile?id=${selectedProduct.user_id}`); }}
                                >
                                    <div className="w-8 h-8 md:w-10 md:h-10 rounded-full overflow-hidden border border-white/10 bg-white/5 flex items-center justify-center">
                                        {selectedProduct.profile_picture ? (
                                            <Image src={selectedProduct.profile_picture} alt="Seller" width={40} height={40} className="object-cover" />
                                        ) : (
                                            <IonIcon name="person" className="text-white/40" />
                                        )}
                                    </div>
                                    <div className="flex flex-col">
                                        <h4 className="text-[7px] md:text-[9px] font-black uppercase tracking-widest text-blue-400 leading-tight">Seller Profile</h4>
                                        <p className="text-[11px] md:text-sm font-bold text-white group-hover:text-blue-400 transition-colors leading-tight">
                                            {selectedProduct.owner_username || selectedProduct.username || 'Anonymous Seller'}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => { setSelectedProduct(null); setActivePreviewIndex(0); }}
                                        className="w-10 h-10 rounded-full hover:bg-white/5 text-gray-400 hover:text-white flex items-center justify-center transition-all bg-white/[0.03] border border-white/5 shadow-inner"
                                    >
                                        <IonIcon name="close" className="text-2xl" />
                                    </button>
                                </div>
                            </div>

                            {/* Main Preview */}
                            <div className="relative flex-1 min-h-[140px] md:min-h-[450px]">
                                {(() => {
                                    const allImages = [
                                        selectedProduct.image_url,
                                        ...(Array.isArray(selectedProduct.variants)
                                            ? selectedProduct.variants
                                            : (typeof selectedProduct.variants === 'string' ? JSON.parse(selectedProduct.variants) : [])
                                        ).map((v: any) => v.url || v.image_url)
                                    ].filter(Boolean);

                                    // Remove duplicates
                                    const uniqueImages = Array.from(new Set(allImages));
                                    const currentImg = uniqueImages[activePreviewIndex] || uniqueImages[0];

                                    return (
                                        <>
                                            <Image
                                                src={(currentImg && (currentImg.includes('uploads') || currentImg.includes('\\')))
                                                    ? `/uploads/${currentImg.split(/[\\/]/).pop()}`
                                                    : (currentImg || "https://picsum.photos/400/400")}
                                                alt={selectedProduct.title}
                                                fill
                                                className="object-cover transition-all duration-500"
                                            />

                                            {/* Lateral Overlays */}
                                            <div className="absolute inset-0 flex items-center justify-end px-4 pointer-events-none z-[35]">
                                                {/* Right Side: Engagement Icons Column */}
                                                <div className="flex flex-col items-center gap-6 pointer-events-auto">


                                                    {/* Vertical Engagement Controls */}
                                                    <div className="flex flex-col items-center gap-6 mt-4">
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); handleToggleLike(selectedProduct.id); openBottomSheet('likes', selectedProduct); }} 
                                                            className="text-white hover:text-red-500 transition-all active:scale-75 flex flex-col items-center gap-0.5 focus:outline-none"
                                                        >
                                                            <IonIcon name="heart" className="text-2xl drop-shadow-lg" />
                                                            <span className="text-[10px] font-black drop-shadow-md">{selectedProduct.likes_count || 0}</span>
                                                        </button>
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); openBottomSheet('comments', selectedProduct); }} 
                                                            className="text-white hover:text-blue-400 transition-all active:scale-75 flex flex-col items-center gap-0.5 focus:outline-none"
                                                        >
                                                            <IonIcon name="chatbubble" className="text-2xl drop-shadow-lg" />
                                                            <span className="text-[10px] font-black drop-shadow-md">{selectedProduct.comments_count || 0}</span>
                                                        </button>
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); openBottomSheet('shares', selectedProduct); }} 
                                                            className="text-white hover:text-green-500 transition-all active:scale-75 flex flex-col items-center gap-0.5 focus:outline-none"
                                                        >
                                                            <IonIcon name="share-social" className="text-2xl drop-shadow-lg" />
                                                            <span className="text-[10px] font-black drop-shadow-md">{selectedProduct.shares_count || 0}</span>
                                                        </button>
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); openBottomSheet('views', selectedProduct); }} 
                                                            className="text-white hover:text-blue-500 transition-all active:scale-75 flex flex-col items-center gap-0.5 focus:outline-none"
                                                        >
                                                            <IonIcon name="eye" className="text-2xl drop-shadow-lg" />
                                                            <span className="text-[10px] font-black drop-shadow-md">{selectedProduct.views_count || 0}</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Product Discount Badge */}
                                            {(() => {
                                                const comm = typeof selectedProduct.commission_info === 'string' ? JSON.parse(selectedProduct.commission_info) : selectedProduct.commission_info;
                                                const gComm = comm?.googer_commission;
                                                if (gComm && parseFloat(gComm) > 0) {
                                                    return (
                                                        <div className="absolute bottom-4 right-4 z-20">
                                                            <div className="px-3 py-1 bg-green-500/10 backdrop-blur-md border border-green-500/20 rounded-lg shadow-xl shadow-green-500/10">
                                                                <span className="text-[10px] md:text-sm font-black text-green-500 tracking-tighter">+{gComm}%</span>
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            })()}
                                        </>
                                    );
                                })()}

                            </div>

                            {/* Thumbnails */}
                            <div className="p-3 md:p-4 bg-black/40 backdrop-blur-md border-t border-white/5 overflow-x-auto no-scrollbar flex gap-2">
                                {(() => {
                                    const allImages = [
                                        selectedProduct.image_url,
                                        ...(Array.isArray(selectedProduct.variants) ? selectedProduct.variants.map((v: any) => v.url || v.image_url) : [])
                                    ].filter(Boolean);
                                    const uniqueImages = Array.from(new Set(allImages));

                                    return uniqueImages.map((img: any, idx) => (
                                        <div
                                            key={idx}
                                            onClick={() => setActivePreviewIndex(idx)}
                                            className={`relative w-12 h-12 md:w-16 md:h-16 rounded-lg md:rounded-xl overflow-hidden cursor-pointer border-2 transition-all shrink-0 ${activePreviewIndex === idx ? 'border-blue-500 scale-105 shadow-lg' : 'border-transparent opacity-50 hover:opacity-100'}`}
                                        >
                                            <Image
                                                src={(img && (img.includes('uploads') || img.includes('\\')))
                                                    ? `/uploads/${img.split(/[\\/]/).pop()}`
                                                    : (img || "https://picsum.photos/400/400")}
                                                alt="Thumb"
                                                fill
                                                className="object-cover"
                                            />
                                        </div>
                                    ));
                                })()}
                            </div>
                        </div>

                        {/* Right Side: Details */}
                        <div className="flex-1 flex flex-col overflow-hidden">

                            {/* Scrollable Content */}
                            <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar space-y-8">
                                <div>
                                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-4">
                                        <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight leading-tight">{selectedProduct.title}</h2>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); alert('Subscribed!'); }}
                                            className="px-6 py-2.5 bg-white text-black text-[10px] md:text-[11px] font-black uppercase rounded-xl shadow-xl hover:bg-slate-200 transition-all active:scale-95 shrink-0"
                                        >
                                            Subscribe
                                        </button>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-[9px] font-black rounded border border-blue-500/20 uppercase tracking-widest">
                                            {selectedProduct.category}
                                        </span>
                                        {selectedProduct.sub_category && (
                                            <span className="px-2 py-0.5 bg-purple-500/10 text-purple-400 text-[9px] font-black rounded border border-purple-500/20 uppercase tracking-widest">
                                                {selectedProduct.sub_category}
                                            </span>
                                        )}
                                    </div>

                                </div>

                                {/* Price Section */}
                                <div className="p-6 bg-white/[0.03] rounded-[2rem] border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1">Pricing Details</p>
                                        <div className="flex items-baseline gap-3">
                                            {selectedProduct.promo_price ? (
                                                <>
                                                    <span className="text-3xl font-black text-white tracking-tighter">R {selectedProduct.promo_price}</span>
                                                    <span className="text-sm font-bold text-slate-500 line-through opacity-60">R {selectedProduct.price}</span>
                                                    <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-[8px] font-black rounded-full border border-green-500/20">
                                                        {Math.round((1 - selectedProduct.promo_price / selectedProduct.price) * 100)}% OFF
                                                    </span>
                                                </>
                                            ) : (
                                                <span className="text-3xl font-black text-white tracking-tighter">R {selectedProduct.price}</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1">Stock Availability</p>
                                        <span className={`text-xl font-black ${parseInt(selectedProduct.stock) > 0 ? 'text-blue-400' : 'text-red-500'}`}>
                                            {selectedProduct.stock || 0} Units
                                        </span>
                                    </div>
                                </div>

                                {/* Description */}
                                <div>
                                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400 mb-3">Product Description</h4>
                                    <p className="text-sm text-slate-300 leading-relaxed bg-white/[0.02] p-6 rounded-[2rem] border border-white/5">
                                        {selectedProduct.description || "No description provided for this listing."}
                                    </p>
                                </div>

                                {/* Detailed Specs Grid */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="p-5 bg-white/[0.03] rounded-[1.5rem] border border-white/5">
                                        <div className="flex items-center gap-2 mb-3">
                                            <IonIcon name="refresh-circle-outline" className="text-blue-400 text-lg" />
                                            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Return & Warranty</h4>
                                        </div>
                                        <div className="space-y-2">
                                            <div className="flex flex-col gap-0.5">
                                                <p className="text-[8px] font-black uppercase text-slate-500 tracking-wider">Return Policy</p>
                                                <p className="text-xs font-bold text-white">{selectedProduct.return_policy?.text || 'Standard'}</p>
                                                {selectedProduct.return_policy?.date && <p className="text-[10px] text-slate-500">Duration: {selectedProduct.return_policy.date}</p>}
                                            </div>
                                            <div className="flex flex-col gap-0.5 pt-2 border-t border-white/5">
                                                <p className="text-[8px] font-black uppercase text-slate-500 tracking-wider">Warranty Info</p>
                                                <p className="text-xs font-bold text-blue-400 uppercase tracking-tight">
                                                    {(() => {
                                                        const w = typeof selectedProduct.warranty_info === 'string' ? JSON.parse(selectedProduct.warranty_info) : selectedProduct.warranty_info;
                                                        return (w?.warranty === 'Custom' ? w?.custom : w?.warranty) || 'No Warranty';
                                                    })()}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-5 bg-white/[0.03] rounded-[1.5rem] border border-white/5">
                                        <div className="flex items-center gap-2 mb-3">
                                            <IonIcon name="earth-outline" className="text-blue-400 text-lg" />
                                            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Available Countries</h4>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {(() => {
                                                const shippingInfo = typeof selectedProduct.shipping_info === 'string' ? JSON.parse(selectedProduct.shipping_info) : selectedProduct.shipping_info;
                                                const rates = shippingInfo?.rates || [];

                                                if (rates.length > 0) {
                                                    return rates.map((r: any, idx: number) => (
                                                        <div key={idx} className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-xl border border-white/10 group hover:border-blue-500/30 transition-all">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                                                            <span className="text-[10px] font-black uppercase text-white tracking-widest">{r.country}</span>
                                                            <span className="text-[9px] font-bold text-slate-500">R{r.charge}</span>
                                                        </div>
                                                    ));
                                                }
                                                return <span className="text-[10px] text-slate-500 italic">No countries specified</span>;
                                            })()}
                                        </div>
                                    </div>
                                </div>

                                {/* Comments Section */}
                                <div className="mt-8 border-t border-white/5 pt-8 pb-10">
                                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400 mb-6 flex items-center gap-2">
                                        <IonIcon name="chatbubbles-outline" className="text-lg" />
                                        Discussions ({productComments.length})
                                    </h4>

                                    {/* Add Comment */}
                                    <div className="flex gap-4 mb-8">
                                        <div className="w-10 h-10 rounded-full bg-white/5 shrink-0 overflow-hidden border border-white/10">
                                            {currentUser?.profile_picture ? (
                                                <Image src={currentUser.profile_picture} alt="User" width={40} height={40} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-white/20">
                                                    <IonIcon name="person" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 flex flex-col gap-2">
                                            <textarea
                                                value={newComment}
                                                onChange={(e) => setNewComment(e.target.value)}
                                                placeholder="Ask a question or leave a comment..."
                                                className="w-full bg-white/[0.03] text-white text-sm rounded-2xl p-4 outline-none border border-white/5 focus:border-blue-500/50 transition-all resize-none min-h-[80px]"
                                            />
                                            <div className="flex justify-end">
                                                <button
                                                    onClick={handleAddComment}
                                                    disabled={!newComment.trim()}
                                                    className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all"
                                                >
                                                    Post Comment
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Comments List */}
                                    <div className="space-y-6">
                                        {productComments.length > 0 ? productComments.map((comment, idx) => (
                                            <div key={idx} className="flex gap-4 group animate-in fade-in slide-in-from-top-2 duration-300">
                                                <div className="w-10 h-10 rounded-full bg-white/5 shrink-0 overflow-hidden border border-white/10">
                                                    {comment.profile_picture ? (
                                                        <Image src={comment.profile_picture} alt={comment.username} width={40} height={40} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-white/20 uppercase font-black text-xs">
                                                            {comment.username?.charAt(0)}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-[11px] font-black text-white">{comment.username}</span>
                                                        <span className="text-[9px] text-slate-500 font-bold uppercase">{new Date(comment.created_at).toLocaleDateString()}</span>
                                                    </div>
                                                    <p className="text-sm text-slate-300 leading-relaxed">{comment.text}</p>
                                                </div>
                                            </div>
                                        )) : (
                                            <div className="text-center py-10 text-slate-500 italic text-[11px] uppercase tracking-widest bg-white/[0.02] rounded-3xl border border-dashed border-white/5">
                                                No comments yet. Be the first to start the discussion!
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>


                            {/* Footer Actions */}
                            <div className="p-4 md:p-8 border-t border-white/5 bg-white/[0.02] flex items-center gap-3">
                                {activeTab === 'market' ? (
                                    <button
                                        onClick={() => handleBuyItem(selectedProduct.id)}
                                        className="flex-1 py-3 md:py-4 bg-white text-black rounded-xl md:rounded-2xl font-black text-[10px] md:text-[12px] uppercase tracking-[0.1em] md:tracking-[0.2em] transition-all flex items-center justify-center gap-2 shadow-xl hover:scale-[1.02] active:scale-95"
                                    >
                                        <IonIcon name="bag-handle" className="text-lg md:text-xl" />
                                        Buy Now
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => {
                                            setShareProduct(selectedProduct);
                                            setShowShareModal(true);
                                        }}
                                        className="flex-1 py-3 md:py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl md:rounded-2xl font-black text-[10px] md:text-[12px] uppercase tracking-[0.1em] md:tracking-[0.2em] transition-all flex items-center justify-center gap-2"
                                    >
                                        <IonIcon name="share-social" className="text-lg md:text-xl" />
                                        Share
                                    </button>
                                )}

                                {activeTab !== 'market' && currentUser?.id === selectedProduct.user_id && (
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => { handleEditProduct(selectedProduct); setSelectedProduct(null); }}
                                            className="w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl bg-white/5 hover:bg-white/10 text-white border border-white/10 flex items-center justify-center transition-all"
                                        >
                                            <IonIcon name="create-outline" className="text-lg md:text-xl" />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteProduct(selectedProduct.id)}
                                            className="w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl bg-red-600/10 hover:bg-red-600/20 text-red-500 border border-red-500/20 flex items-center justify-center transition-all"
                                        >
                                            <IonIcon name="trash-outline" className="text-lg md:text-xl" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* Share Modal */}
            <ShareModal
                isOpen={showShareModal}
                onClose={() => setShowShareModal(false)}
                title={shareProduct?.title || "Check out this product"}
                url={shareProduct ? `${typeof window !== 'undefined' ? window.location.origin : ''}/dashboard/shop?id=${shareProduct.id}` : ""}
                description={shareProduct?.description}
                product={shareProduct}
            />

            {/* Interaction Bottom Sheet */}
            <InteractionBottomSheet
                isOpen={isBottomSheetOpen}
                onClose={() => { setIsBottomSheetOpen(false); setInteractionProduct(null); }}
                type={bottomSheetType}
                product={interactionProduct}
                data={bottomSheetData}
                onAddComment={handleSendComment}
                onAction={(action) => {
                    const targetProd = interactionProduct || selectedProduct;
                    if (!targetProd) return;

                    if (action === 'star') handleToggleLike(targetProd.id);
                    if (action === 'upload' || action === 'forward') {
                        setShareProduct(targetProd);
                        setShowShareModal(true);
                    }
                    if (action === 'trash' && confirm("Delete this listing?")) {
                        handleDeleteProduct(targetProd.id);
                        setIsBottomSheetOpen(false);
                        setInteractionProduct(null);
                    }
                }}
            />

            {/* Report Modal */}
            {reportingProduct && (
                <div
                    className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300"
                    onClick={() => setReportingProduct(null)}
                >
                    <div
                        className="bg-[#111111] border border-white/10 rounded-[2rem] w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-6 border-b border-white/5 flex items-center justify-between">
                            <div>
                                <h3 className="text-white font-black text-lg">Report Listing</h3>
                                <p className="text-[10px] text-yellow-500/60 font-black uppercase tracking-[0.2em] mt-0.5">Community Safety</p>
                            </div>
                            <button onClick={() => setReportingProduct(null)} className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white transition-all">
                                <IonIcon name="close" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
                                <p className="text-[10px] text-white/30 font-bold uppercase mb-2">Reporting Product</p>
                                <p className="text-sm text-white font-bold truncate">{reportingProduct.title}</p>
                            </div>

                            <div className="space-y-3">
                                <p className="text-[11px] text-white/40 font-bold px-1">Why are you reporting this?</p>
                                {["Prohibited Item", "Suspicious Activity", "Wrong Category", "Other"].map((reason) => (
                                    <button
                                        key={reason}
                                        onClick={() => handleReportSubmit(reportingProduct.id)}
                                        className="w-full px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-left text-xs font-bold text-white transition-all active:scale-[0.98]"
                                    >
                                        {reason}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="p-4 bg-black/40 text-center border-t border-white/5">
                            <p className="text-[9px] text-white/20 font-bold uppercase tracking-widest">Googer Marketplace Safety Team</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
