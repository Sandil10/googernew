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
import { useCart } from "@/app/context/CartContext";
import ShareModal from "@/app/components/ShareModal";

const COLORS = [
    { name: "None", hex: "transparent" },
    { name: "Alice Blue", hex: "#F0F8FF" },
    { name: "Antique White", hex: "#FAEBD7" },
    { name: "Aqua", hex: "#00FFFF" },
    { name: "Aquamarine", hex: "#7FFFD4" },
    { name: "Azure", hex: "#F0FFFF" },
    { name: "Beige", hex: "#F5F5DC" },
    { name: "Bisque", hex: "#FFE4C4" },
    { name: "Black", hex: "#000000" },
    { name: "Blanched Almond", hex: "#FFEBCD" },
    { name: "Blue", hex: "#0000FF" },
    { name: "Blue Violet", hex: "#8A2BE2" },
    { name: "Brown", hex: "#A52A2A" },
    { name: "Burly Wood", hex: "#DEB887" },
    { name: "Cadet Blue", hex: "#5F9EA0" },
    { name: "Chartreuse", hex: "#7FFF00" },
    { name: "Chocolate", hex: "#D2691E" },
    { name: "Coral", hex: "#FF7F50" },
    { name: "Cornflower Blue", hex: "#6495ED" },
    { name: "Cornsilk", hex: "#FFF8DC" },
    { name: "Crimson", hex: "#DC143C" },
    { name: "Cyan", hex: "#00FFFF" },
    { name: "Dark Blue", hex: "#00008B" },
    { name: "Dark Cyan", hex: "#008B8B" },
    { name: "Dark Goldenrod", hex: "#B8860B" },
    { name: "Dark Gray", hex: "#A9A9A9" },
    { name: "Dark Green", hex: "#006400" },
    { name: "Dark Khaki", hex: "#BDB76B" },
    { name: "Dark Magenta", hex: "#8B008B" },
    { name: "Dark Olive Green", hex: "#556B2F" },
    { name: "Dark Orange", hex: "#FF8C00" },
    { name: "Dark Orchid", hex: "#9932CC" },
    { name: "Dark Red", hex: "#8B0000" },
    { name: "Dark Salmon", hex: "#E9967A" },
    { name: "Dark Sea Green", hex: "#8FBC8F" },
    { name: "Dark Slate Blue", hex: "#483D8B" },
    { name: "Dark Slate Gray", hex: "#2F4F4F" },
    { name: "Dark Turquoise", hex: "#00CED1" },
    { name: "Dark Violet", hex: "#9400D3" },
    { name: "Deep Pink", hex: "#FF1493" },
    { name: "Deep Sky Blue", hex: "#00BFFF" },
    { name: "Dim Gray", hex: "#696969" },
    { name: "Dodger Blue", hex: "#1E90FF" },
    { name: "Fire Brick", hex: "#B22222" },
    { name: "Floral White", hex: "#FFFAF0" },
    { name: "Forest Green", hex: "#228B22" },
    { name: "Fuchsia", hex: "#FF00FF" },
    { name: "Gainsboro", hex: "#DCDCDC" },
    { name: "Ghost White", hex: "#F8F8FF" },
    { name: "Gold", hex: "#FFD700" },
    { name: "Goldenrod", hex: "#DAA520" },
    { name: "Gray", hex: "#808080" },
    { name: "Green", hex: "#008000" },
    { name: "Green Yellow", hex: "#ADFF2F" },
    { name: "Honey Dew", hex: "#F0FFF0" },
    { name: "Hot Pink", hex: "#FF69B4" },
    { name: "Indian Red", hex: "#CD5C5C" },
    { name: "Indigo", hex: "#4B0082" },
    { name: "Ivory", hex: "#FFFFF0" },
    { name: "Khaki", hex: "#F0E68C" },
    { name: "Lavender", hex: "#E6E6FA" },
    { name: "Lavender Blush", hex: "#FFF0F5" },
    { name: "Lawn Green", hex: "#7CFC00" },
    { name: "Lemon Chiffon", hex: "#FFFACD" },
    { name: "Light Blue", hex: "#ADD8E6" },
    { name: "Light Coral", hex: "#F08080" },
    { name: "Light Cyan", hex: "#E0FFFF" },
    { name: "Light Goldenrod Yellow", hex: "#FAFAD2" },
    { name: "Light Gray", hex: "#D3D3D3" },
    { name: "Light Green", hex: "#90EE90" },
    { name: "Light Pink", hex: "#FFB6C1" },
    { name: "Light Salmon", hex: "#FFA07A" },
    { name: "Light Sea Green", hex: "#20B2AA" },
    { name: "Light Sky Blue", hex: "#87CEFA" },
    { name: "Light Slate Gray", hex: "#778899" },
    { name: "Light Steel Blue", hex: "#B0C4DE" },
    { name: "Light Yellow", hex: "#FFFFE0" },
    { name: "Lime", hex: "#00FF00" },
    { name: "Lime Green", hex: "#32CD32" },
    { name: "Linen", hex: "#FAF0E6" },
    { name: "Magenta", hex: "#FF00FF" },
    { name: "Maroon", hex: "#800000" },
    { name: "Medium Aquamarine", hex: "#66CDAA" },
    { name: "Medium Blue", hex: "#0000CD" },
    { name: "Medium Orchid", hex: "#BA55D3" },
    { name: "Medium Purple", hex: "#9370DB" },
    { name: "Medium Sea Green", hex: "#3CB371" },
    { name: "Medium Slate Blue", hex: "#7B68EE" },
    { name: "Medium Spring Green", hex: "#00FA9A" },
    { name: "Medium Turquoise", hex: "#48D1CC" },
    { name: "Medium Violet Red", hex: "#C71585" },
    { name: "Midnight Blue", hex: "#191970" },
    { name: "Mint Cream", hex: "#F5FFFA" },
    { name: "Misty Rose", hex: "#FFE4E1" },
    { name: "Moccasin", hex: "#FFE4B5" },
    { name: "Navajo White", hex: "#FFDEAD" },
    { name: "Navy", hex: "#000080" },
    { name: "Old Lace", hex: "#FDF5E6" },
    { name: "Olive", hex: "#808000" },
    { name: "Olive Drab", hex: "#6B8E23" },
    { name: "Orange", hex: "#FFA500" },
    { name: "Orange Red", hex: "#FF4500" },
    { name: "Orchid", hex: "#DA70D6" },
    { name: "Pale Goldenrod", hex: "#EEE8AA" },
    { name: "Pale Green", hex: "#98FB98" },
    { name: "Pale Turquoise", hex: "#AFEEEE" },
    { name: "Pale Violet Red", hex: "#DB7093" },
    { name: "Papaya Whip", hex: "#FFEFD5" },
    { name: "Peach Puff", hex: "#FFDAB9" },
    { name: "Peru", hex: "#CD853F" },
    { name: "Pink", hex: "#FFC0CB" },
    { name: "Plum", hex: "#DDA0DD" },
    { name: "Powder Blue", hex: "#B0E0E6" },
    { name: "Purple", hex: "#800080" },
    { name: "Rebecca Purple", hex: "#663399" },
    { name: "Red", hex: "#FF0000" },
    { name: "Rosy Brown", hex: "#BC8F8F" },
    { name: "Royal Blue", hex: "#4169E1" },
    { name: "Saddle Brown", hex: "#8B4513" },
    { name: "Salmon", hex: "#FA8072" },
    { name: "Sandy Brown", hex: "#F4A460" },
    { name: "Sea Green", hex: "#2E8B57" },
    { name: "Sea Shell", hex: "#FFF5EE" },
    { name: "Sienna", hex: "#A0522D" },
    { name: "Silver", hex: "#C0C0C0" },
    { name: "Sky Blue", hex: "#87CEEB" },
    { name: "Slate Blue", hex: "#6A5ACD" },
    { name: "Slate Gray", hex: "#708090" },
    { name: "Snow", hex: "#FFFAFA" },
    { name: "Spring Green", hex: "#00FF7F" },
    { name: "Steel Blue", hex: "#4682B4" },
    { name: "Tan", hex: "#D2B48C" },
    { name: "Teal", hex: "#008080" },
    { name: "Thistle", hex: "#D8BFD8" },
    { name: "Tomato", hex: "#FF6347" },
];

export default function ShopPage() {
    const router = useRouter();
    const [showFilters, setShowFilters] = useState(false);
    const [activeTab, setActiveTab] = useState("market"); // market, my-products, orders, admin-review
    const [myListingsTab, setMyListingsTab] = useState("active");
    const [myListingsSubTab, setMyListingsSubTab] = useState("all"); // for Your Products sub-filter
    const [myOrdersTab, setMyOrdersTab] = useState("all"); // all, processing, shipped, delivered, returns
    const [isCategoriesDrawerOpen, setIsCategoriesDrawerOpen] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState(""); // Filter state
    const [products, setProducts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [selectedProduct, setSelectedProduct] = useState<any>(null);
    const [quantity, setQuantity] = useState(1);
    const [selectedVariantIndex, setSelectedVariantIndex] = useState<number | null>(null);
    const [selectedSize, setSelectedSize] = useState<string | null>(null);
    const [editingProduct, setEditingProduct] = useState<any>(null);
    const [mounted, setMounted] = useState(false);
    const [showShareModal, setShowShareModal] = useState(false);
    const [shareProduct, setShareProduct] = useState<any>(null);
    const [activePreviewIndex, setActivePreviewIndex] = useState(0);
    const [isSizeDropdownOpen, setIsSizeDropdownOpen] = useState(false);
    const [reviewActionLoading, setReviewActionLoading] = useState<number | null>(null);

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
        const handleRefresh = () => {
            refresh();
        };
        window.addEventListener('product-added', handleRefresh);
        return () => window.removeEventListener('product-added', handleRefresh);
    }, []);

    const loadUser = async () => {
        try {
            const user = await authService.getProfile();
            setCurrentUser(user);
        } catch (e) {
            console.error("Not logged in");
        }
    };

    // Cart logic
    const { addToCart } = useCart();

    const loadProducts = async () => {
        setLoading(true);
        try {
            let data = [];
            const filters: any = {};
            if (activeTab === "market") {
                // 'approved' = newly approved by admin, 'active' = legacy status from old products
                filters.status = 'approved,active';
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
                        // Include both 'approved' (new) and 'active' (legacy) statuses
                        data = await marketService.getItems({ user_id: currentUser.id, status: 'approved,active' });
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
            }

            // ADMIN: load all reviewing products for admin review queue
            if (activeTab === 'admin-review') {
                data = await marketService.getItems({ status: 'reviewing,rejected' });
            }

            setProducts(data || []);
        } catch (e) {
            console.error("Failed to load products", e);
        } finally {
            setLoading(false);
        }
    };

    const refresh = () => {
        loadProducts();
        if (activeTab !== 'market' && activeTab !== 'admin-review') {
            setActiveTab("my-products");
            setMyListingsTab("reviewing");
        }
        setEditingProduct(null);
        setIsCategoriesDrawerOpen(false);
    };

    const handleApproveProduct = async (id: number) => {
        setReviewActionLoading(id);
        try {
            await marketService.updateStatus(id, 'approved');
            loadProducts();
        } catch (e: any) {
            alert(e.message || 'Failed to approve product');
        } finally {
            setReviewActionLoading(null);
        }
    };

    const handleRejectProduct = async (id: number) => {
        setReviewActionLoading(id);
        try {
            await marketService.updateStatus(id, 'rejected');
            loadProducts();
        } catch (e: any) {
            alert(e.message || 'Failed to reject product');
        } finally {
            setReviewActionLoading(null);
        }
    };

    const handleMarkInactive = async (id: number) => {
        setReviewActionLoading(id);
        try {
            await marketService.updateStatus(id, 'inactive');
            loadProducts();
        } catch (e: any) {
            alert(e.message || 'Failed to mark product as inactive');
        } finally {
            setReviewActionLoading(null);
        }
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
        if (!selectedProduct) return;

        // Use currentVariant to get the selected color/image if available
        const currentVariant = selectedVariantIndex !== null
            ? (typeof selectedProduct.variants === 'string' ? JSON.parse(selectedProduct.variants) : (selectedProduct.variants || []))[selectedVariantIndex]
            : null;

        addToCart(
            selectedProduct,
            quantity,
            selectedSize,
            currentVariant?.color || 'None',
            selectedVariantIndex
        );

        setSelectedProduct(null);
        setSelectedVariantIndex(null);
        setSelectedSize(null);
    };

    const handleUpdateOrderStatus = async (orderId: number, status: string) => {
        try {
            await orderService.updateStatus(orderId, status);
            loadProducts(); // Fresh results
        } catch (e: any) {
            alert(e.message || "Failed to update status");
        }
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
                                My Orders
                            </div>
                            {activeTab === "orders" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white shadow-[0_0_10px_rgba(255,255,255,0.3)]"></div>}
                        </button>

                        {/* Admin Review Tab — only visible to admins */}
                        {(currentUser?.role === 'admin' || currentUser?.is_admin || currentUser?.user_type === 'admin') && (
                            <button
                                onClick={() => setActiveTab("admin-review")}
                                className={`pb-3 text-sm font-medium transition-colors relative whitespace-nowrap ${activeTab === "admin-review" ? "text-yellow-400" : "text-gray-400 hover:text-yellow-300"}`}
                            >
                                <div className="flex items-center gap-2">
                                    <IonIcon name="shield-checkmark-outline" />
                                    <span>Review Queue</span>
                                    {products.filter(p => p.status === 'reviewing').length > 0 && activeTab === 'admin-review' && (
                                        <span className="w-4 h-4 bg-yellow-500 text-black rounded-full text-[8px] font-black flex items-center justify-center">
                                            {products.filter(p => p.status === 'reviewing').length}
                                        </span>
                                    )}
                                </div>
                                {activeTab === "admin-review" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.5)]"></div>}
                            </button>
                        )}
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

            {/* ===== ADMIN REVIEW QUEUE ===== */}
            {activeTab === 'admin-review' && (
                <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
                            <IonIcon name="shield-checkmark" className="text-yellow-500 text-lg" />
                        </div>
                        <div>
                            <h2 className="text-sm font-black text-white uppercase tracking-widest">Admin Review Queue</h2>
                            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">
                                {products.filter(p => p.status === 'reviewing').length} pending · {products.filter(p => p.status === 'rejected').length} rejected
                            </p>
                        </div>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-yellow-500"></div>
                        </div>
                    ) : products.length === 0 ? (
                        <div className="text-center py-20 bg-yellow-500/5 rounded-[3rem] border border-yellow-500/10 border-dashed">
                            <IonIcon name="checkmark-done-circle-outline" className="text-4xl mb-3 text-yellow-500/30" />
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">All clear — no products pending review</p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4">
                            {products.map((product) => (
                                <div
                                    key={product.id}
                                    className={`flex flex-col md:flex-row gap-4 bg-[#1a1a1a] rounded-[2rem] border p-4 md:p-6 transition-all ${product.status === 'rejected'
                                        ? 'border-red-500/20 bg-red-500/5'
                                        : 'border-yellow-500/10 hover:border-yellow-500/30'
                                        }`}
                                >
                                    {/* Product Image */}
                                    <div className="relative w-full md:w-32 h-32 rounded-2xl overflow-hidden flex-shrink-0">
                                        <Image
                                            src={(product.image_url && (product.image_url.startsWith('data:') || product.image_url.startsWith('http')))
                                                ? product.image_url
                                                : (product.image_url ? `/uploads/${product.image_url.split(/[\\/]/).pop()}` : 'https://picsum.photos/400/400')}
                                            alt={product.title}
                                            fill
                                            className="object-cover"
                                        />
                                        <div className={`absolute top-2 left-2 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${product.status === 'rejected'
                                            ? 'bg-red-600 text-white'
                                            : 'bg-yellow-500 text-black'
                                            }`}>
                                            {product.status === 'rejected' ? 'Rejected' : 'In Review'}
                                        </div>
                                    </div>

                                    {/* Product Info */}
                                    <div className="flex-1 flex flex-col gap-2 min-w-0">
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <h3 className="text-sm font-black text-white uppercase tracking-tight truncate">{product.title}</h3>
                                                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">
                                                    by @{product.username || product.owner_username || 'Unknown'}
                                                </p>
                                            </div>
                                            <div className="flex flex-col items-end shrink-0">
                                                <span className="text-lg font-black text-white">R {product.promo_price || product.price}</span>
                                                {product.promo_price && (
                                                    <span className="text-[9px] text-slate-500 line-through">R {product.price}</span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap gap-2 text-[9px]">
                                            <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded border border-blue-500/20 font-black uppercase tracking-widest">{product.category}</span>
                                            {product.sub_category && (
                                                <span className="px-2 py-0.5 bg-purple-500/10 text-purple-400 rounded border border-purple-500/20 font-black uppercase tracking-widest">{product.sub_category}</span>
                                            )}
                                            <span className="px-2 py-0.5 bg-white/5 text-slate-400 rounded border border-white/10 font-black uppercase tracking-widest">{product.stock} in stock</span>
                                        </div>

                                        {product.description && (
                                            <p className="text-[10px] text-slate-400 leading-relaxed line-clamp-2">{product.description}</p>
                                        )}

                                        <p className="text-[8px] text-slate-600 font-bold uppercase tracking-widest">
                                            Submitted {new Date(product.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                        </p>

                                        {/* Action Buttons */}
                                        <div className="flex items-center gap-3 mt-2 pt-3 border-t border-white/5">
                                            <button
                                                onClick={() => handleApproveProduct(product.id)}
                                                disabled={reviewActionLoading === product.id}
                                                className="flex-1 py-2.5 bg-green-500 hover:bg-green-400 text-black text-[10px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-green-500/20"
                                            >
                                                {reviewActionLoading === product.id ? (
                                                    <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                                                ) : (
                                                    <IonIcon name="checkmark-circle" className="text-sm" />
                                                )}
                                                Approve
                                            </button>
                                            <button
                                                onClick={() => handleRejectProduct(product.id)}
                                                disabled={reviewActionLoading === product.id}
                                                className="flex-1 py-2.5 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white text-[10px] font-black uppercase tracking-widest rounded-xl border border-red-500/20 hover:border-red-500 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                            >
                                                <IonIcon name="close-circle" className="text-sm" />
                                                Reject
                                            </button>
                                            <button
                                                onClick={() => handleMarkInactive(product.id)}
                                                disabled={reviewActionLoading === product.id}
                                                className="flex-1 py-2.5 bg-amber-500/10 hover:bg-amber-500 text-amber-400 hover:text-black text-[10px] font-black uppercase tracking-widest rounded-xl border border-amber-500/20 hover:border-amber-500 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                            >
                                                <IonIcon name="archive" className="text-sm" />
                                                Inactive
                                            </button>
                                            <button
                                                onClick={() => setSelectedProduct(product)}
                                                className="w-10 h-10 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl flex items-center justify-center text-slate-400 hover:text-white transition-all"
                                                title="View Details"
                                            >
                                                <IonIcon name="eye-outline" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Product Grid — only shown outside admin-review tab */}
            {activeTab !== 'admin-review' && (
                <>
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-white"></div>
                        </div>
                    ) : products.length === 0 ? (
                        <div className="text-center py-20 text-gray-500 bg-white/[0.02] rounded-[3rem] border border-white/5 border-dashed">
                            <IonIcon name={(activeTab === 'my-products' && myListingsTab === 'reviewing') ? 'time-outline' : 'basket-outline'} className="text-4xl mb-3 opacity-20" />
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40">No products found here</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mb-10">
                            {products.map((product) => (
                                <div
                                    key={product.id}
                                    className="group cursor-pointer bg-[#1a1a1a] rounded-[1.5rem] md:rounded-[2.5rem] pb-4 md:pb-8 border border-white/5 hover:border-white/20 transition-all hover:shadow-2xl relative flex flex-col min-w-0"
                                    onClick={() => setSelectedProduct(product)}
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
                                        <button
                                            onClick={(e) => { e.stopPropagation(); alert('Subscribed!'); }}
                                            className="px-2 md:px-4 py-1 md:py-1.5 bg-white text-black text-[7px] md:text-[9px] font-black uppercase rounded-full shadow-lg active:scale-95 transition-all hover:bg-slate-200 flex-shrink-0"
                                        >
                                            <span className="md:hidden">Sub</span>
                                            <span className="hidden md:inline">Subscribe</span>
                                        </button>
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
                                        <h3 className="text-white text-[12px] font-black truncate mb-3 uppercase tracking-tight group-hover:text-blue-400 transition-colors">{product.title}</h3>

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

                                            {/* Row 1: All interaction icons + cart (always visible on all sizes) */}
                                            <div className="flex items-center gap-2 md:gap-3 w-full">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); /* handleLike */ }}
                                                    className="text-white/40 hover:text-red-500 transition-all active:scale-75"
                                                >
                                                    <IonIcon name="heart-outline" className="text-base md:text-xl" />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setSelectedProduct(product); }}
                                                    className="text-white/40 hover:text-white transition-all active:scale-75"
                                                >
                                                    <IonIcon name="chatbubble-outline" className="text-base md:text-xl" />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); /* handleShare */ }}
                                                    className="text-white/40 hover:text-green-500 transition-all active:scale-75"
                                                >
                                                    <IonIcon name="share-social-outline" className="text-base md:text-xl" />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setSelectedProduct(product); }}
                                                    className="text-white/40 hover:text-blue-500 transition-all active:scale-75"
                                                >
                                                    <IonIcon name="eye-outline" className="text-base md:text-xl" />
                                                </button>

                                                {/* Cart Icon — pinned right, always visible */}
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setSelectedProduct(product); }}
                                                    className="ml-auto flex-shrink-0 flex items-center justify-center w-6 h-6 text-white/40 hover:text-blue-400 transition-all active:scale-75"
                                                >
                                                    <IonIcon name="cart-outline" className="text-base md:text-lg" />
                                                </button>

                                                {/* Inactive toggle for admin */}
                                                {(currentUser?.role === 'admin' || currentUser?.is_admin || currentUser?.user_type === 'admin') && product.status === 'approved' && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleMarkInactive(product.id); }}
                                                        className="flex-shrink-0 flex items-center justify-center w-6 h-6 text-white/30 hover:text-amber-400 transition-all active:scale-75"
                                                        title="Mark as Inactive"
                                                    >
                                                        <IonIcon name="archive-outline" className="text-base md:text-lg" />
                                                    </button>
                                                )}
                                                {(currentUser?.role === 'admin' || currentUser?.is_admin || currentUser?.user_type === 'admin') && product.status === 'inactive' && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleApproveProduct(product.id); }}
                                                        className="flex-shrink-0 flex items-center justify-center w-6 h-6 text-amber-400 hover:text-green-400 transition-all active:scale-75"
                                                        title="Re-activate product"
                                                    >
                                                        <IonIcon name="checkmark-circle-outline" className="text-base md:text-lg" />
                                                    </button>
                                                )}
                                            </div>

                                            {/* Row 2: Context action buttons — shown only when needed */}
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

                    {/* End of conditional product grid (hidden in admin-review tab) */}
                </>
            )}

            {/* Product Details Modal (Assuming existing code is mostly fine used selectedProduct state) */}
            {/* Product Details Modal (Assuming existing code is mostly fine used selectedProduct state) */}
            {selectedProduct && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-2 md:p-4 bg-black/95 backdrop-blur-xl animate-in fade-in duration-300" onClick={() => { 
                    setSelectedProduct(null); 
                    setActivePreviewIndex(0); 
                    setSelectedVariantIndex(null);
                    setSelectedSize(null);
                    setIsSizeDropdownOpen(false);
                }}>
                    <div
                        className="bg-[#121212] border border-white/10 rounded-[1.5rem] md:rounded-[2.5rem] w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col md:flex-row h-full md:h-auto max-h-[95vh] md:max-h-[90vh] animate-in zoom-in-95 duration-300"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Left Side: Image Gallery */}
                        <div className="w-full md:w-[45%] bg-[#0a0a0a] relative flex flex-col shrink-0 border-b md:border-b-0 md:border-r border-white/5">
                            {/* Main Preview */}
                            <div className="relative flex-1 min-h-[140px] md:min-h-[450px]">
                                {(() => {
                                    let variantsData = [];
                                    try {
                                        variantsData = typeof selectedProduct.variants === 'string' ? JSON.parse(selectedProduct.variants) : selectedProduct.variants;
                                    } catch (e) {
                                        console.warn("Failed to parse variants for product", selectedProduct.id, e);
                                    }

                                    const allImages = [
                                        selectedProduct.image_url,
                                        ...(Array.isArray(variantsData) ? variantsData : [])
                                            .map((v: any) => v.url || v.image_url)
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

                                            {uniqueImages.length > 1 && (
                                                <>
                                                    <button
                                                        onClick={() => setActivePreviewIndex(prev => (prev === 0 ? uniqueImages.length - 1 : prev - 1))}
                                                        className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 backdrop-blur-md border border-white/10 text-white flex items-center justify-center hover:bg-white hover:text-black transition-all"
                                                    >
                                                        <IonIcon name="chevron-back" />
                                                    </button>
                                                    <button
                                                        onClick={() => setActivePreviewIndex(prev => (prev === uniqueImages.length - 1 ? 0 : prev + 1))}
                                                        className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 backdrop-blur-md border border-white/10 text-white flex items-center justify-center hover:bg-white hover:text-black transition-all"
                                                    >
                                                        <IonIcon name="chevron-forward" />
                                                    </button>
                                                </>
                                            )}

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

                                {/* Close button mobile */}
                                <button
                                    onClick={() => { 
                                        setSelectedProduct(null); 
                                        setActivePreviewIndex(0); 
                                        setQuantity(1); 
                                        setSelectedVariantIndex(null); 
                                        setSelectedSize(null);
                                        setIsSizeDropdownOpen(false);
                                    }}
                                    className="absolute top-4 right-4 md:hidden w-10 h-10 rounded-full bg-black/50 backdrop-blur-md text-white flex items-center justify-center"
                                >
                                    <IonIcon name="close" className="text-xl" />
                                </button>
                            </div>

                            {/* Thumbnails */}
                            <div className="p-3 md:p-4 bg-black/40 backdrop-blur-md border-t border-white/5 overflow-x-auto no-scrollbar flex gap-2">
                                {(() => {
                                    const variantsData = typeof selectedProduct.variants === 'string' ? JSON.parse(selectedProduct.variants) : selectedProduct.variants;
                                    const allImages = [
                                        selectedProduct.image_url,
                                        ...(Array.isArray(variantsData) ? variantsData.map((v: any) => v.url || v.image_url) : [])
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
                            {/* Header */}
                            <div className="p-6 md:p-8 flex items-center justify-between border-b border-white/5 bg-white/[0.02]">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full overflow-hidden border border-blue-500/30 bg-blue-500/10 flex items-center justify-center">
                                        {selectedProduct.profile_picture ? (
                                            <Image src={selectedProduct.profile_picture} alt="Seller" width={40} height={40} className="object-cover" />
                                        ) : (
                                            <IonIcon name="person" className="text-blue-400" />
                                        )}
                                    </div>
                                    <div>
                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-400">Seller Profile</h4>
                                        <p className="text-sm font-bold text-white">{selectedProduct.owner_username || selectedProduct.username || 'Anonymous Seller'}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${selectedProduct.status === 'reviewing' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' :
                                        selectedProduct.status === 'rejected' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                                            'bg-green-500/10 text-green-500 border-green-500/20'
                                        }`}>
                                        {selectedProduct.status}
                                    </span>
                                    <button
                                        onClick={() => {
                                            setSelectedProduct(null);
                                            setActivePreviewIndex(0);
                                            setQuantity(1);
                                            setSelectedVariantIndex(null);
                                            setSelectedSize(null);
                                            setIsSizeDropdownOpen(false);
                                        }}
                                        className="hidden md:flex w-10 h-10 rounded-full hover:bg-white/5 text-gray-400 hover:text-white items-center justify-center transition-all"
                                    >
                                        <IonIcon name="close" className="text-2xl" />
                                    </button>
                                </div>
                            </div>

                            {/* Scrollable Content */}
                            <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar space-y-8">
                                <div>
                                    <h2 className="text-2xl md:text-3xl font-black text-white mb-2 tracking-tight">{selectedProduct.title}</h2>
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
                                <div className="p-6 bg-white/[0.03] rounded-[2rem] border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-6">
                                    <div className="flex-1">
                                        <p className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-500 mb-0.5">Price Details</p>
                                        <div className="flex items-center gap-3">
                                            {selectedProduct.promo_price ? (
                                                <>
                                                    <div className="flex flex-row items-baseline gap-3">
                                                        <span className="text-[10px] font-bold text-slate-500 line-through opacity-60">R {(selectedProduct.price * quantity).toFixed(2)}</span>
                                                        <span className="text-2xl font-black text-white tracking-tighter">R {(selectedProduct.promo_price * quantity).toFixed(2)}</span>
                                                    </div>
                                                    <div className="flex flex-col gap-1">
                                                        <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 text-[8px] font-black rounded-full border border-green-500/20 w-fit">
                                                            {Math.round((1 - selectedProduct.promo_price / selectedProduct.price) * 100)}% OFF
                                                        </span>
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-2xl font-black text-white tracking-tighter">R {(selectedProduct.price * quantity).toFixed(2)}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Quantity Box */}
                                    <div className="flex items-center gap-2 bg-white/[0.05] p-1.5 rounded-2xl border border-white/5 shadow-inner">
                                        <button
                                            onClick={() => setQuantity(Math.max(1, quantity - 1))}
                                            className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-white transition-all active:scale-95"
                                        >
                                            <IonIcon name="remove-outline" />
                                        </button>
                                        <div className="w-10 text-center">
                                            <span className="text-lg font-black text-white">{quantity}</span>
                                        </div>
                                        <button
                                            onClick={() => setQuantity(quantity + 1)}
                                            className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-white transition-all active:scale-95"
                                        >
                                            <IonIcon name="add-outline" />
                                        </button>
                                    </div>
                                </div>

                                {/* Variants & Delivery Details */}
                                <div className="space-y-8">
                                    {(() => {
                                        const productVariants = typeof selectedProduct.variants === 'string' ? JSON.parse(selectedProduct.variants) : (selectedProduct.variants || []);
                                        const allMainImages = [selectedProduct.image_url, ...productVariants.map((v: any) => v.url || v.image_url)].filter(Boolean);
                                        const uniqueDetailImages = Array.from(new Set(allMainImages));

                                        const variantChoices: any[] = [];
                                        const seenVariants = new Set();

                                        productVariants.forEach((v: any, idx: number) => {
                                            const key = `${v.color || 'None'}-${v.image_url || v.url || ''}`;
                                            if (!seenVariants.has(key)) {
                                                seenVariants.add(key);
                                                variantChoices.push({
                                                    ...v,
                                                    color: v.color || 'None',
                                                    originalIndex: idx
                                                });
                                            }
                                        });

                                        // For single posts with no variants, add the main product as a choice
                                        if (variantChoices.length === 0) {
                                            variantChoices.push({
                                                color: 'None',
                                                image_url: selectedProduct.image_url,
                                                originalIndex: null
                                            });
                                        }

                                        const currentVariant = selectedVariantIndex !== null ? productVariants[selectedVariantIndex] : null;
                                        const activeColor = currentVariant?.color || 'None';

                                        return (
                                            <div className="space-y-6">
                                                {variantChoices.length > 0 && (
                                                    <div>
                                                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400 mb-3">Available Variants</h4>
                                                        <div className="flex flex-wrap gap-4 bg-white/[0.01] p-5 rounded-[1.5rem] border border-white/5">
                                                            {variantChoices.map((variant, idx) => {
                                                                const colorInfo = COLORS.find(c => c.name === variant.color) || COLORS[0];

                                                                const img = variant.image_url || variant.url || selectedProduct.image_url;
                                                                const processedImg = (img && (img.includes('uploads') || img.includes('\\')))
                                                                    ? `/uploads/${img.split(/[\\/]/).pop()}`
                                                                    : img;

                                                                const isSelected = variant.originalIndex === null
                                                                    ? selectedVariantIndex === null
                                                                    : selectedVariantIndex === variant.originalIndex;

                                                                return (
                                                                    <div
                                                                        key={idx}
                                                                        onClick={() => {
                                                                            setSelectedVariantIndex(variant.originalIndex);
                                                                            setSelectedSize(null);
                                                                            const imgIndex = uniqueDetailImages.indexOf(img);
                                                                            if (imgIndex !== -1) setActivePreviewIndex(imgIndex);
                                                                        }}
                                                                        className={`group flex flex-col items-center gap-3 cursor-pointer transition-all ${isSelected ? 'scale-105' : 'opacity-60 hover:opacity-100'}`}
                                                                    >
                                                                        <div className={`w-14 h-14 md:w-16 md:h-16 rounded-2xl overflow-hidden border-2 shadow-xl transition-all ${isSelected ? 'border-blue-500 shadow-blue-500/20' : 'border-white/10'}`}>
                                                                            {processedImg && (
                                                                                <Image
                                                                                    src={processedImg}
                                                                                    alt={variant.color}
                                                                                    width={64}
                                                                                    height={64}
                                                                                    className="w-full h-full object-cover"
                                                                                />
                                                                            )}
                                                                        </div>
                                                                        <div className="flex flex-col items-center gap-1.5">
                                                                            {variant.color !== 'None' && (
                                                                                <div
                                                                                    className="w-4 h-4 rounded-full border border-white/20 shadow-lg"
                                                                                    style={{ backgroundColor: colorInfo.hex }}
                                                                                />
                                                                            )}
                                                                            <span className={`text-[7px] font-black uppercase tracking-widest transition-colors ${isSelected ? 'text-blue-400' : 'text-white/30'}`}>
                                                                                {variant.color === 'None' ? 'Standard' : variant.color}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="animate-in fade-in slide-in-from-top-2 duration-300 space-y-8">
                                                    <div className="flex items-center justify-between bg-white/[0.01] p-5 rounded-[1.5rem] border border-white/5 relative">
                                                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400">Select Size</h4>
                                                        <div className="relative">
                                                            <button
                                                                onClick={() => setIsSizeDropdownOpen(!isSizeDropdownOpen)}
                                                                className={`flex items-center gap-3 px-5 py-2.5 rounded-xl border-2 transition-all ${selectedSize ? 'bg-blue-600/10 border-blue-500/30 text-blue-400 shadow-lg shadow-blue-500/5 rotate-in-y-180' : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:text-white'}`}
                                                            >
                                                                <span className="text-[10px] font-black uppercase tracking-widest">{selectedSize || 'Choose Size'}</span>
                                                                <IonIcon name={isSizeDropdownOpen ? "chevron-up" : "chevron-down"} className="text-sm" />
                                                            </button>

                                                            {/* Custom Dropdown Overlay */}
                                                            {isSizeDropdownOpen && (
                                                                <div className="absolute right-0 bottom-full mb-3 w-48 bg-[#111] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-[100] animate-in slide-in-from-bottom-2 fade-in duration-200">
                                                                    <div className="p-2 grid grid-cols-1 gap-1">
                                                                        {(() => {
                                                                            const matchingVariants = (selectedVariantIndex !== null)
                                                                                ? productVariants.filter((pv: any) => (pv.color || 'None').toString().toLowerCase() === (activeColor || 'None').toString().toLowerCase())
                                                                                : productVariants;
                                                                            const allSizes = matchingVariants.flatMap((pv: any) => {
                                                                                if (Array.isArray(pv.selections)) return pv.selections.map((s: any) => s.value);
                                                                                if (pv.selection) return [pv.selection];
                                                                                if (pv.size) return [pv.size];
                                                                                return [];
                                                                            });
                                                                            return Array.from(new Set(allSizes));
                                                                        })().map((size: any, idx: number) => (
                                                                            <button
                                                                                key={idx}
                                                                                onClick={() => {
                                                                                    setSelectedSize(size);
                                                                                    setIsSizeDropdownOpen(false);
                                                                                }}
                                                                                className={`w-full px-4 py-3 flex items-center justify-between rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${selectedSize === size ? 'bg-blue-600 text-white' : 'text-white/40 hover:bg-white/5 hover:text-white'}`}
                                                                            >
                                                                                {size}
                                                                                {selectedSize === size && <IonIcon name="checkmark" />}
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Selection Summary */}
                                                    <div className="mt-10 pt-10 border-t border-white/5 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
                                                        <div className="flex justify-between items-center group">
                                                            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 group-hover:text-blue-400 transition-colors">Select Size</span>
                                                            <span className="text-xs font-black text-white">{selectedSize || '-'}</span>
                                                        </div>
                                                        <div className="flex justify-between items-center group">
                                                            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 group-hover:text-blue-400 transition-colors">Color</span>
                                                            <span className="text-xs font-black text-blue-400 uppercase tracking-widest">{activeColor || 'Default'}</span>
                                                        </div>
                                                        <div className="flex justify-between items-center group">
                                                            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 group-hover:text-blue-400 transition-colors">Delivery</span>
                                                            <span className="text-[10px] font-black text-white uppercase tracking-tight">
                                                                {(() => {
                                                                    const d1 = new Date(); const d2 = new Date();
                                                                    d1.setDate(d1.getDate() + 4); d2.setDate(d2.getDate() + 8);
                                                                    const format = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                                                                    return `${format(d1)} - ${format(d2)}`;
                                                                })()}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="p-5 bg-white/[0.03] rounded-[2rem] border border-white/5">
                                            <div className="flex items-center gap-2 mb-4">
                                                <IonIcon name="earth-outline" className="text-blue-400 text-lg" />
                                                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Delivery Countries</h4>
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

                                        <div className="p-5 bg-white/[0.03] rounded-[2rem] border border-white/5">
                                            <div className="flex items-center gap-2 mb-4">
                                                <IonIcon name="refresh-circle-outline" className="text-blue-400 text-lg" />
                                                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Warranty Details</h4>
                                            </div>
                                            <div className="space-y-2">
                                                <div className="flex flex-col gap-0.5 pt-2">
                                                    <p className="text-[8px] font-black uppercase text-blue-400 tracking-tight">
                                                        {(() => {
                                                            const w = typeof selectedProduct.warranty_info === 'string' ? JSON.parse(selectedProduct.warranty_info) : selectedProduct.warranty_info;
                                                            return (w?.warranty === 'Custom' ? w?.custom : w?.warranty) || 'No Warranty';
                                                        })()}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Footer Actions */}
                            <div className="p-4 md:p-8 border-t border-white/5 bg-white/[0.02] flex items-center gap-3">
                                <button
                                    onClick={() => handleBuyItem(selectedProduct.id)}
                                    className="flex-1 py-3 md:py-4 bg-white text-black rounded-xl md:rounded-2xl font-black text-[10px] md:text-[12px] uppercase tracking-[0.1em] md:tracking-[0.2em] transition-all flex items-center justify-center gap-2 shadow-xl hover:scale-[1.02] active:scale-95"
                                >
                                    <IonIcon name="bag-handle" className="text-xl md:text-2xl" />
                                    Buy Now
                                </button>
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
                url={shareProduct ? `${window.location.origin}/dashboard/shop?id=${shareProduct.id}` : ""}
                description={shareProduct?.description}
            />
        </div >
    );
}
