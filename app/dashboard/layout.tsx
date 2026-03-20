"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import Topbar from "@/app/components/Topbar";
import IonIcon from "@/app/components/IonIcon";
import AddProductModal from "@/app/components/AddProductModal";

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
    const pathname = usePathname();
    const [isAddProductModalOpen, setIsAddProductModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<any>(null);

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

    const handleSuccess = () => {
        // Dispatch event for ShopPage to refresh
        window.dispatchEvent(new Event('product-added'));
        // setIsAddProductModalOpen(false); // Modal closes itself via onClose call in handleSuccess? No, onSuccess is called then onClose.
        // Actually modal closes itself. But we need to sync state? 
        // AddProductModal calls onSuccess() then onClose(). onClose() will call setIsAddProductModalOpen(false).
    };

    return (
        <div className="flex flex-col h-screen bg-[#1c1917] text-white overflow-hidden font-sans">
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

                {/* Plus Button for Adding Product */}
                <button
                    onClick={() => {
                        console.log("Mobile Plus clicked - dispatching open-add-product-modal");
                        window.dispatchEvent(new CustomEvent('open-add-product-modal'));
                    }}
                    className="flex flex-col items-center justify-center group"
                >
                    <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-gray-400 group-hover:bg-white/10 group-active:scale-90 transition-all">
                        <IonIcon name="add-circle" className="text-2xl" />
                    </div>
                    <span className="text-[10px] mt-1 font-medium text-gray-500 uppercase tracking-widest">Add</span>
                </button>

                {menuItems.slice(2).map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <div key={item.name} className="relative flex flex-col items-center">
                            {/* Floating Cart Icon above Chat only on mobile */}
                            {item.name === "Chats" && pathname === "/dashboard/shop" && (
                                <Link
                                    href="/dashboard/cart"
                                    className="absolute -top-14 w-12 h-12 bg-white text-black rounded-full flex items-center justify-center shadow-2xl border border-white/10 active:scale-90 transition-all z-[60]"
                                >
                                    <IonIcon name="cart" className="text-xl" />
                                    {/* Optional: Cart Count Badge */}
                                    <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 rounded-full border-2 border-zinc-900 flex items-center justify-center">
                                        <span className="text-[10px] font-black text-white">0</span>
                                    </div>
                                </Link>
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

            {/* Main Content Area */}
            <main
                className="flex-1 overflow-y-auto bg-[#1c1917] pb-20 pt-16 md:pb-8 md:pt-20 transition-all duration-300"
            >
                <div className="max-w-[1200px] mx-auto px-4 py-6 md:px-8">
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
        </div>
    );
}
