"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import IonIcon from "@/app/components/IonIcon";

export default function ShopPage() {
    const router = useRouter();
    const [showFilters, setShowFilters] = useState(false);
    const [activeTab, setActiveTab] = useState("my-products");

    const categories = [
        "Gamings", "Headphones", "Parfums", "Fruits", "Gaming", "Mobiles", "Laptops", "Accessories", "Shoes", "Clothing"
    ];

    const products = [
        {
            id: 1,
            title: "The Deep Cleanse",
            author: "by Jesse Steeve",
            price: 12,
            img: "https://picsum.photos/seed/cleanse/400/400",
            description: "Lorem ipsum dolor sit amet consectetur adipisicing elit. Deserunt, mollitia? Eaque consequuntur asperiores eos Fugiat ullam.",
            views: "1,286",
            downloads: "364",
            category: "Health",
            type: "Image",
        },
        {
            id: 2,
            title: "Regency High Gloss",
            author: "by John Michael",
            price: 12,
            img: "https://picsum.photos/seed/gloss/400/400",
            description: "A premium high gloss finish for modern interiors. Durable and stylish.",
            views: "854",
            downloads: "125",
            category: "Design",
            type: "Texture",
        },
        {
            id: 3,
            title: "Gaming Mouse",
            author: "by Martin Gray",
            price: 12,
            img: "https://picsum.photos/seed/mouse/400/400",
            description: "Ergonomic gaming mouse with customizable RGB lighting and high precision sensor.",
            views: "2,450",
            downloads: "890",
            category: "Gaming",
            type: "Hardware",
        },
        {
            id: 4,
            title: "Abstract Minimalism Bright",
            author: "by Alexa stella",
            price: 12,
            img: "https://picsum.photos/seed/abstract/400/400",
            description: "Beautiful abstract digital art piece perfect for wallpapers or prints.",
            views: "560",
            downloads: "45",
            category: "Art",
            type: "Digital",
        },
        {
            id: 5,
            title: "Modern Headphones",
            author: "by Sarah Smith",
            price: 25,
            img: "https://picsum.photos/seed/headphones/400/400",
            description: "Noise-cancelling wireless headphones with 30-hour battery life.",
            views: "3,100",
            downloads: "1,200",
            category: "Audio",
            type: "Hardware",
        },
        {
            id: 6,
            title: "Organic Fruits Bundle",
            author: "by Green Farms",
            price: 8,
            img: "https://picsum.photos/seed/fruit/400/400",
            description: "Fresh organic fruits bundle delivered straight from the farm.",
            views: "450",
            downloads: "200",
            category: "Food",
            type: "Perishable",
        },
        {
            id: 7,
            title: "E-Reader Pro",
            author: "by TechRead",
            price: 89,
            img: "https://picsum.photos/seed/reader/400/400",
            description: "Glare-free display e-reader that reads like real paper.",
            views: "900",
            downloads: "340",
            category: "Electronics",
            type: "Device",
        },
        {
            id: 8,
            title: "Mechanical Keyboard",
            author: "by KeyMaster",
            price: 45,
            img: "https://picsum.photos/seed/keyboard/400/400",
            description: "Compact mechanical keyboard with blue switches for tactile feedback.",
            views: "1,500",
            downloads: "600",
            category: "Gaming",
            type: "Hardware",
        },
        {
            id: 9,
            title: "Wireless Controller",
            author: "by GameOn",
            price: 60,
            img: "https://picsum.photos/seed/controller/400/400",
            description: "Pro-grade wireless controller for console and PC gaming.",
            views: "3,200",
            downloads: "950",
            category: "Gaming",
            type: "Hardware",
        },
        {
            id: 10,
            title: "Studio Microphone",
            author: "by SoundWave",
            price: 150,
            img: "https://picsum.photos/seed/mic/400/400",
            description: "Professional condenser microphone for streaming and recording.",
            views: "1,800",
            downloads: "420",
            category: "Audio",
            type: "Hardware",
        },
        {
            id: 11,
            title: "Smart Watch",
            author: "by TechLife",
            price: 199,
            img: "https://picsum.photos/seed/watch/400/400",
            description: "Fitness tracker and smart watch with heart rate monitor.",
            views: "4,100",
            downloads: "1,500",
            category: "Electronics",
            type: "Device",
        },
        {
            id: 12,
            title: "Vintage Camera",
            author: "by AnalogLove",
            price: 350,
            img: "https://picsum.photos/seed/camera/400/400",
            description: "Fully functional vintage film camera for retro photography.",
            views: "980",
            downloads: "120",
            category: "Photography",
            type: "Hardware",
        }
    ];

    return (
        <div className="pb-10 relative min-h-screen">
            <h1 className="text-3xl font-bold mb-6 text-white">Market</h1>

            {/* Header: Tabs + Search */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                {/* Tabs */}
                <div className="flex gap-8 border-b border-gray-800 w-full md:w-auto">
                    <button
                        onClick={() => setActiveTab("my-products")}
                        className={`pb-3 text-sm font-medium transition-colors relative ${activeTab === "my-products" ? "text-white" : "text-gray-400 hover:text-gray-300"}`}
                    >
                        <div className="flex items-center gap-2">
                            <IonIcon name="cart-outline" />
                            My Products
                        </div>
                        {activeTab === "my-products" && (
                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white"></div>
                        )}
                    </button>
                    {/* Removed Downloads Tab as requested */}
                </div>

                {/* Search & Filter */}
                <div className="flex items-center gap-4 flex-1 md:max-w-md">
                    <div className="flex-1 relative">
                        <input
                            type="text"
                            placeholder="Search..."
                            className="w-full bg-[#162033] text-white text-sm rounded-lg pl-10 pr-4 py-2.5 outline-none focus:ring-1 focus:ring-blue-500 border border-gray-800"
                        />
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg flex items-center">
                            <IonIcon name="search-outline" />
                        </div>
                    </div>
                    <div className="relative">
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className={`p-2.5 rounded-lg border transition-all flex items-center justify-center shrink-0 ${showFilters ? 'bg-blue-600 border-blue-500 text-white' : 'bg-[#162033] hover:bg-[#252f45] text-white border-gray-800'}`}
                        >
                            <IonIcon name="filter-outline" />
                        </button>

                        {showFilters && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setShowFilters(false)}></div>
                                <div className="absolute right-0 mt-3 w-64 bg-[#1a253d] border border-gray-800 rounded-2xl shadow-2xl p-5 z-50 animate-in fade-in zoom-in duration-200 origin-top-right">
                                    <h4 className="text-white font-bold text-sm mb-4 uppercase tracking-wider">Filters</h4>

                                    <div className="space-y-6">
                                        {/* Sort By */}
                                        <div>
                                            <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-3">Sort By</p>
                                            <div className="space-y-2">
                                                {['Newest', 'Price: Low to High', 'Price: High to Low'].map((sort) => (
                                                    <label key={sort} className="flex items-center gap-3 cursor-pointer group">
                                                        <div className="w-4 h-4 rounded-full border border-gray-700 flex items-center justify-center group-hover:border-blue-500 transition-colors">
                                                            <div className="w-2 h-2 rounded-full bg-blue-500 scale-0 group-hover:scale-100 transition-transform"></div>
                                                        </div>
                                                        <span className="text-gray-300 text-xs font-medium group-hover:text-white transition-colors">{sort}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Price Range */}
                                        <div>
                                            <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-3">Price Range</p>
                                            <div className="flex gap-2">
                                                <input type="text" placeholder="Min" className="w-full bg-[#0d1421] border border-gray-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-blue-500" />
                                                <input type="text" placeholder="Max" className="w-full bg-[#0d1421] border border-gray-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-blue-500" />
                                            </div>
                                        </div>

                                        <button className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all active:scale-95 shadow-lg shadow-blue-900/20 uppercase tracking-wider mt-2">
                                            Apply Filter
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Categories with External Scroll Arrows */}
            <div className="flex items-center gap-2 mb-8 select-none">
                {/* Left Arrow */}
                <button
                    onClick={() => {
                        const el = document.getElementById('category-scroll');
                        if (el) el.scrollBy({ left: -150, behavior: 'smooth' });
                    }}
                    className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-white bg-gray-800/40 hover:bg-gray-700/60 rounded-full border border-gray-700/50 transition-all active:scale-95 shadow-lg"
                >
                    <IonIcon name="chevron-back" className="text-lg" />
                </button>

                {/* Categories Container */}
                <div
                    id="category-scroll"
                    className="flex-1 flex gap-2 overflow-x-auto scroll-smooth py-1 scrollbar-none"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                    {categories.map((cat, i) => (
                        <button
                            key={i}
                            className="px-4 py-2 bg-[#162033]/80 hover:bg-[#252f45] text-gray-300 hover:text-white text-[11px] md:text-xs font-bold rounded-xl whitespace-nowrap transition-all border border-gray-800 active:scale-95 shadow-sm"
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                {/* Right Arrow */}
                <button
                    onClick={() => {
                        const el = document.getElementById('category-scroll');
                        if (el) el.scrollBy({ left: 150, behavior: 'smooth' });
                    }}
                    className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-white bg-gray-800/40 hover:bg-gray-700/60 rounded-full border border-gray-700/50 transition-all active:scale-95 shadow-lg"
                >
                    <IonIcon name="chevron-forward" className="text-lg" />
                </button>
            </div>

            {/* Product Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mb-10">
                {products.map((product) => (
                    <div
                        key={product.id}
                        className="group cursor-pointer bg-[#162033] rounded-[48px] p-2.5 pb-6 border border-gray-800/50 hover:border-gray-600 transition-all hover:shadow-2xl"
                        onClick={() => router.push(`/dashboard/shop/${product.id}`)}
                    >
                        {/* Image Card */}
                        <div className="relative aspect-square rounded-[40px] overflow-hidden mb-4 bg-gray-900 border border-gray-800/50 shadow-inner">
                            <Image
                                src={product.img}
                                alt={product.title}
                                fill
                                className="object-cover group-hover:scale-105 transition-transform duration-500"
                            />
                            {/* Price Tag with Large Rupee Icon */}
                            <div className="absolute bottom-4 right-4 px-4 py-2 bg-black/60 backdrop-blur-md rounded-2xl text-white text-xs font-bold flex items-center gap-2 border border-white/10 shadow-lg">
                                <div className="relative w-8 h-4 shrink-0">
                                    <Image src="/assets/images/rupee.png" alt="R" fill className="object-contain invert" />
                                </div>
                                {product.price}
                            </div>
                        </div>

                        {/* Info & Socials */}
                        <div className="px-3">
                            <h3 className="text-white text-sm font-black truncate mb-0.5 tracking-tight group-hover:text-blue-400 transition-colors uppercase">{product.title}</h3>
                            <p className="text-gray-500 text-[10px] font-bold truncate mb-3 uppercase tracking-wider">{product.author}</p>

                            <div className="flex items-center justify-between border-t border-gray-800/50 pt-3">
                                <div className="flex items-center gap-3">
                                    <button className="text-white hover:text-red-500 transition-colors active:scale-90">
                                        <IonIcon name="heart-outline" className="text-lg" />
                                    </button>
                                    <button className="text-white hover:text-blue-400 transition-colors active:scale-90">
                                        <IonIcon name="chatbubble-outline" className="text-lg" />
                                    </button>
                                </div>
                                <button className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center hover:bg-blue-600 transition-all active:scale-95 border border-blue-400/20">
                                    <IonIcon name="cart-outline" className="text-base" />
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Pagination Controls */}
            <div className="flex justify-center items-center gap-2 mb-20">
                <button className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-800 text-gray-400 hover:bg-white/5 hover:text-white transition-colors">
                    <IonIcon name="chevron-back-outline" />
                </button>
                <button className="w-8 h-8 flex items-center justify-center rounded-lg bg-blue-600 text-white font-medium text-sm">
                    1
                </button>
                <button className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-800 text-gray-400 hover:bg-white/5 hover:text-white font-medium text-sm transition-colors">
                    2
                </button>
                <button className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-800 text-gray-400 hover:bg-white/5 hover:text-white font-medium text-sm transition-colors">
                    3
                </button>
                <button className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-800 text-gray-400 hover:bg-white/5 hover:text-white transition-colors">
                    <IonIcon name="chevron-forward-outline" />
                </button>
            </div>

            {/* Floating Action Button */}
            <button className="fixed bottom-24 md:bottom-10 right-6 md:right-10 w-14 h-14 bg-blue-500 hover:bg-blue-600 text-white rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-110 active:scale-95 z-40">
                <IonIcon name="add" size="large" />
            </button>

        </div >
    );
}
