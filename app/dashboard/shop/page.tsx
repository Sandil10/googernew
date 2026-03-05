"use client";

import Image from "next/image";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import IonIcon from "@/app/components/IonIcon";
// import AddProductModal from "@/app/components/AddProductModal"; // Global now
import { marketService } from "@/services/marketService";
import { authService } from "@/services/authService";

export default function ShopPage() {
    const router = useRouter();
    const [showFilters, setShowFilters] = useState(false);
    const [activeTab, setActiveTab] = useState("market"); // market, my-products
    const [myListingsTab, setMyListingsTab] = useState("active"); // active, all, reviewing, deleted
    const [isCategoriesDrawerOpen, setIsCategoriesDrawerOpen] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState(""); // Filter state
    const [products, setProducts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [selectedProduct, setSelectedProduct] = useState<any>(null);
    const [editingProduct, setEditingProduct] = useState<any>(null);
    const [mounted, setMounted] = useState(false);

    const categories = [
        "Gamings", "Headphones", "Parfums", "Fruits", "Mobiles", "Laptops", "Accessories", "Shoes", "Clothing", "Electronics", "Fashion", "Other"
    ];

    useEffect(() => {
        setMounted(true);
        loadUser();
    }, []);

    useEffect(() => {
        loadProducts();
    }, [activeTab, myListingsTab, currentUser, selectedCategory]);

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

    const loadProducts = async () => {
        setLoading(true);
        try {
            let data = [];
            const filters: any = {};
            if (activeTab === "market") {
                filters.status = 'approved';
            } else if (activeTab === "my-products") {
                if (currentUser?.id) {
                    filters.user_id = currentUser.id;
                    if (myListingsTab === "active") filters.status = 'approved';
                    else if (myListingsTab === "reviewing") filters.status = 'reviewing';
                    else if (myListingsTab === "deleted") filters.status = 'deleted';
                    // 'all' doesn't set a status filter
                }
            }

            if (selectedCategory) {
                filters.category = selectedCategory;
            }

            if (currentUser || activeTab === 'market') {
                data = await marketService.getItems(filters);
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
                <div className="flex items-center gap-2 mb-8 select-none animate-in slide-in-from-left-4 duration-500">
                    <button className="md:hidden flex-shrink-0 w-8 h-8 flex items-center justify-center text-white bg-gray-800/40 hover:bg-gray-700/60 rounded-full border border-gray-700/50 transition-all active:scale-95 shadow-lg" onClick={() => document.getElementById('mylisting-scroll')?.scrollBy({ left: -150, behavior: 'smooth' })}>
                        <IonIcon name="chevron-back" className="text-lg" />
                    </button>
                    <div id="mylisting-scroll" className="flex-1 md:flex-none flex items-center gap-1.5 p-1 bg-white/5 rounded-2xl overflow-x-auto no-scrollbar border border-white/5 scroll-smooth">
                        {[
                            { id: 'active', label: 'Active Products', icon: 'checkmark-circle' },
                            { id: 'all', label: 'My Products', icon: 'grid' },
                            { id: 'reviewing', label: 'Review Products', icon: 'time' },
                            { id: 'deleted', label: 'Deleted Products', icon: 'trash' }
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setMyListingsTab(tab.id)}
                                className={`flex items-center justify-center gap-2 px-4 py-2 md:w-44 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap
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

            {/* Product Grid */}
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
                            className="group cursor-pointer bg-[#1a1a1a] rounded-[2.5rem] p-3 pb-6 border border-white/5 hover:border-white/20 transition-all hover:shadow-2xl relative flex flex-col"
                            onClick={() => setSelectedProduct(product)}
                        >
                            {/* Profile Header */}
                            <div className="flex items-center gap-2 mb-3 px-2">
                                <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px] text-white overflow-hidden border border-white/5">
                                    <IonIcon name="person" className="text-gray-400" />
                                </div>
                                <span className="text-[10px] text-white font-black uppercase tracking-tight truncate">
                                    {product.username || product.owner_username || 'Anonymous'}
                                </span>
                            </div>

                            <div className="relative aspect-square rounded-[2rem] overflow-hidden mb-4 bg-black border border-white/5 shadow-inner">
                                <Image
                                    src={(product.image_url && (product.image_url.includes('uploads') || product.image_url.includes('\\')))
                                        ? `/uploads/${product.image_url.split(/[\\/]/).pop()}`
                                        : (product.image_url || "https://picsum.photos/400/400")}
                                    alt={product.title}
                                    fill
                                    sizes="(max-width: 768px) 50vw, 25vw"
                                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                                />
                                {product.status === 'reviewing' && (
                                    <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center">
                                        <div className="flex flex-col items-center gap-2 text-white">
                                            <div className="w-10 h-10 md:w-12 md:h-12 rounded-full border-2 border-white flex items-center justify-center bg-black/50">
                                                <IonIcon name="time" className="text-xl md:text-2xl" />
                                            </div>
                                            <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider bg-black/60 px-2 py-1 rounded-full border border-white/30">Reviewing</span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="px-2">
                                <h3 className="text-white text-[11px] md:text-xs font-black truncate mb-2 uppercase tracking-tight group-hover:text-white/80 transition-colors">{product.title}</h3>

                                {/* Info Row: Price, Country Price, Date */}
                                <div className="flex items-center gap-2 text-[9px] font-bold mb-4 bg-white/[0.03] p-2 rounded-xl border border-white/5">
                                    <div className="flex items-center gap-1 text-white">
                                        <span className="text-gray-500 font-normal">R</span>
                                        {product.price}
                                    </div>
                                    <div className="h-2 w-px bg-white/10"></div>
                                    <div className="flex items-center gap-1 text-white">
                                        <span className="text-gray-500 font-normal">Sri Lanka:</span>
                                        {product.shipping_info?.rates?.[0]?.charge || '0'}
                                    </div>
                                    <div className="h-2 w-px bg-white/10"></div>
                                    <div className="text-white">
                                        {product.delivery_info?.time || '7 Days'}
                                    </div>
                                </div>

                                <div className="flex items-center justify-between border-t border-white/5 pt-3">
                                    <div className="flex items-center gap-3">
                                        <button className="text-white/60 hover:text-red-500 transition-colors active:scale-90">
                                            <IonIcon name="heart-outline" className="text-lg" />
                                        </button>
                                        <button className="text-white/60 hover:text-white transition-colors active:scale-90">
                                            <IonIcon name="chatbubble-outline" className="text-lg" />
                                        </button>
                                        <button className="text-white/60 hover:text-white transition-colors active:scale-90">
                                            <IonIcon name="share-social-outline" className="text-lg" />
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-1 text-[9px] text-gray-500 font-bold">
                                        <IonIcon name="eye-outline" className="text-xs" />
                                        <span>782</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Pagination */}
            {products.length > 0 && (
                <div className="flex justify-center items-center gap-2 mb-20 fade-in">
                    <button className="w-8 h-8 flex items-center justify-center rounded-lg border border-white/10 text-gray-400 hover:bg-white/5 hover:text-white transition-colors"> <IonIcon name="chevron-back-outline" /> </button>
                    <button className="w-8 h-8 flex items-center justify-center rounded-lg bg-white text-black font-black text-xs">1</button>
                    <button className="w-8 h-8 flex items-center justify-center rounded-lg border border-white/10 text-gray-400 hover:bg-white/5 hover:text-white transition-colors"> <IonIcon name="chevron-forward-outline" /> </button>
                </div>
            )}





            {/* Product Details Modal (Assuming existing code is mostly fine used selectedProduct state) */}
            {selectedProduct && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/95 backdrop-blur-xl animate-in fade-in duration-300" onClick={() => setSelectedProduct(null)}>
                    <div
                        className="bg-[#121212] border border-white/10 rounded-[2.5rem] w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col md:flex-row max-h-[85vh] md:max-h-[90vh] animate-in zoom-in-95 duration-300"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Image Section */}
                        <div className="w-full md:w-1/2 bg-black relative h-64 md:h-auto shrink-0">
                            <Image
                                src={(selectedProduct.image_url && (selectedProduct.image_url.includes('uploads') || selectedProduct.image_url.includes('\\')))
                                    ? `/uploads/${selectedProduct.image_url.split(/[\\/]/).pop()}`
                                    : (selectedProduct.image_url || "https://picsum.photos/400/400")}
                                alt={selectedProduct.title}
                                fill
                                className="object-cover"
                            />
                            <button
                                onClick={() => setSelectedProduct(null)}
                                className="absolute top-4 left-4 md:hidden w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/70 transition-colors"
                            >
                                <IonIcon name="arrow-back" className="text-lg" />
                            </button>
                        </div>
                        {/* Details */}
                        <div className="w-full md:w-1/2 p-5 md:p-10 flex flex-col overflow-y-auto custom-scrollbar bg-black">
                            <h2 className="text-2xl font-bold text-white mb-2">{selectedProduct.title}</h2>
                            <div className="flex flex-wrap gap-2 mb-6">
                                <span className="px-3 py-1 bg-white/5 text-gray-300 text-[10px] font-black rounded-full border border-white/10 uppercase tracking-widest">{selectedProduct.category}</span>
                                <span className="px-3 py-1 bg-white/10 text-white text-[10px] font-black rounded-full border border-white/20 uppercase tracking-widest">{selectedProduct.status}</span>
                            </div>

                            <p className="text-gray-400 text-xs mb-8 leading-relaxed">{selectedProduct.description}</p>

                            {/* Logistics & Payment Details */}
                            <div className="space-y-6 mb-8">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                                        <label className="text-[10px] font-black text-slate-500 uppercase block mb-1">Delivery Time</label>
                                        <p className="text-xs font-bold text-white">{selectedProduct.delivery_info?.time || 'Not specified'}</p>
                                    </div>
                                    <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                                        <label className="text-[10px] font-black text-slate-500 uppercase block mb-1">Return Policy</label>
                                        <p className="text-xs font-bold text-white">{selectedProduct.return_policy?.text || 'Standard Policy'}</p>
                                    </div>
                                </div>

                                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                                    <label className="text-[10px] font-black text-slate-500 uppercase block mb-2">Available in Countries</label>
                                    <div className="flex flex-wrap gap-2">
                                        {selectedProduct.shipping_info?.rates?.length > 0 ? (
                                            selectedProduct.shipping_info.rates.map((r: any, i: number) => (
                                                <span key={i} className="px-2 py-1 bg-slate-800 rounded text-[10px] text-slate-300 font-bold border border-white/5">
                                                    {r.country} (R{r.charge})
                                                </span>
                                            ))
                                        ) : (
                                            <span className="text-xs text-slate-500 font-bold italic">No specific shipping rates set</span>
                                        )}
                                    </div>
                                </div>

                                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                                    <label className="text-[10px] font-black text-slate-500 uppercase block mb-2">Accepted Payments</label>
                                    <div className="flex flex-wrap gap-2">
                                        {selectedProduct.payment_methods?.length > 0 ? (
                                            selectedProduct.payment_methods.map((p: string, i: number) => (
                                                <span key={i} className="px-3 py-1 bg-white/5 text-white text-[10px] font-black rounded-lg border border-white/10 uppercase">
                                                    {p.toUpperCase()}
                                                </span>
                                            ))
                                        ) : (
                                            <span className="text-xs text-slate-500 font-bold italic">Contact seller for payment</span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-auto">
                                {(selectedProduct.status === 'reviewing' || selectedProduct.status === 'rejected' || activeTab === 'my-products') && currentUser?.id === selectedProduct.user_id && (
                                    <div className="grid grid-cols-2 gap-4 mt-4">
                                        <button onClick={() => { handleEditProduct(selectedProduct); setSelectedProduct(null); }} className="py-3 bg-white/5 hover:bg-white/10 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest border border-white/10 transition-all">Edit</button>
                                        <button onClick={() => handleDeleteProduct(selectedProduct.id)} className="py-3 bg-red-600/10 hover:bg-red-600/20 text-red-500 rounded-2xl font-black text-[10px] uppercase tracking-widest border border-red-500/20 transition-all">Delete</button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
