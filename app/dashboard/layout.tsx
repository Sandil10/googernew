"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import Topbar from "../components/Topbar";
import IonIcon from "../components/IonIcon";

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

    return (
        <div className="flex flex-col h-screen bg-[#1c1917] text-white overflow-hidden font-sans">
            {/* Topbar (Unified) */}
            <Topbar />

            {/* Mobile Bottom Nav */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-zinc-900 border-t border-zinc-800 flex items-center justify-around z-50 px-2 transition-all duration-300">
                {menuItems.map((item) => {
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
            </div>

            {/* Main Content Area */}
            <main
                className="flex-1 overflow-y-auto bg-[#1c1917] pb-20 pt-16 md:pb-8 md:pt-20 transition-all duration-300"
            >
                <div className="max-w-[1200px] mx-auto px-4 py-6 md:px-8">
                    {children}
                </div>
            </main>
        </div>
    );
}
