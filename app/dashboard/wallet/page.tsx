"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";
import IonIcon from "@/app/components/IonIcon";
import { authService } from "@/services/authService";
import { walletService } from "@/services/walletService";

export default function WalletPage() {
    const [balance, setBalance] = useState(0);
    const [txCount, setTxCount] = useState(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const profile = await authService.getProfile();
                setBalance(parseFloat(profile.wallet_balance) || 0);

                const txData = await walletService.getTransactionHistory();
                setTxCount(txData.length || 0);
            } catch (error) {
                console.error("Error fetching wallet summary:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const walletCards = [
        {
            id: 1,
            title: "My Wallet",
            description: "Manage your balance and earnings",
            icon: "wallet-outline",
            href: "/dashboard/wallet/my-wallet",
            bgColor: "bg-blue-500/10",
            iconColor: "text-blue-400",
            stats: { label: "Balance", value: balance.toFixed(2) }
        },
        {
            id: 2,
            title: "Top Up",
            description: "Recharge your wallet with Rupier coins",
            icon: "add-circle-outline",
            href: "/dashboard/wallet/topup",
            bgColor: "bg-green-500/10",
            iconColor: "text-green-400",
            stats: { label: "Wallet", value: "Topup" }
        },
        {
            id: 3,
            title: "Withdrawal",
            description: "Cash out your earnings to your account",
            icon: "cash-outline",
            href: "/dashboard/wallet/withdrawal",
            bgColor: "bg-purple-500/10",
            iconColor: "text-purple-400",
            stats: { label: "Available", value: balance.toFixed(2) }
        },
        {
            id: 4,
            title: "Transactions",
            description: "View your transaction history",
            icon: "receipt-outline",
            href: "/dashboard/wallet/transactions",
            bgColor: "bg-orange-500/10",
            iconColor: "text-orange-400",
            stats: { label: "Total Transactions", value: `${txCount} txns` }
        }
    ];

    const quickActions = [
        { id: 1, label: "Topup", icon: "add-outline", color: "bg-blue-500/10 text-blue-400", href: "/dashboard/wallet/topup" },
        { id: 2, label: "Withdraw", icon: "cash-outline", color: "bg-green-500/10 text-green-400", href: "/dashboard/wallet/withdrawal" },
        { id: 3, label: "My Wallet", icon: "wallet-outline", color: "bg-purple-500/10 text-purple-400", href: "/dashboard/wallet/my-wallet" },
        { id: 4, label: "History", icon: "time-outline", color: "bg-gray-500/10 text-gray-400", href: "/dashboard/wallet/transactions" }
    ];

    if (loading) {
        return (
            <div className="flex flex-col gap-3 justify-center items-center min-h-[60vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-600"></div>
                <div className="text-gray-500 font-medium tracking-wide">Loading...</div>
            </div>
        );
    }

    return (
        <div className="pb-10 relative min-h-screen">
            <h1 className="text-2xl font-bold mb-6 text-white">Wallet</h1>

            {/* Total Balance Card */}
            <div className="bg-[#162033] border border-gray-800 rounded-2xl p-6 md:p-8 mb-8 shadow-lg relative overflow-hidden transition-all hover:border-gray-700">
                {/* Subtle Decorative Elements */}
                <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500/5 rounded-full blur-3xl"></div>
                <div className="absolute bottom-0 left-0 w-32 h-32 bg-purple-500/5 rounded-full blur-2xl"></div>

                <div className="relative z-10">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                        <div>
                            <p className="text-gray-400 text-xs font-semibold mb-2 uppercase tracking-wider">Total Balance</p>
                            <div className="flex flex-row items-center gap-3 flex-nowrap overflow-visible">
                                <div className="relative w-12 h-6 md:w-20 md:h-10 shrink-0">
                                    <Image src="/assets/images/rupee.png" alt="Rupee" fill className="object-contain" priority />
                                </div>
                                <h2 className="text-3xl md:text-5xl font-bold text-white tracking-tight leading-none whitespace-nowrap">
                                    {balance.toFixed(2)}
                                </h2>
                            </div>
                            <p className="text-green-400 text-xs font-medium mt-3 flex items-center gap-1.5">
                                <IonIcon name="trending-up-outline" />
                                <span>+0.0% this month</span>
                            </p>
                        </div>
                        <div className="w-12 h-12 md:w-16 md:h-16 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center">
                            <IonIcon name="wallet-outline" className="text-2xl md:text-3xl text-white" />
                        </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="grid grid-cols-4 gap-2 md:gap-4">
                        {quickActions.map((action) => (
                            <Link
                                key={action.id}
                                href={action.href}
                                className="flex flex-col items-center gap-2 p-3 bg-[#0d1421] hover:bg-gray-800 border border-gray-800/50 hover:border-gray-600 rounded-xl transition-all active:scale-95 group text-center"
                            >
                                <div className={`w-9 h-9 md:w-11 md:h-11 ${action.color} rounded-lg flex items-center justify-center text-xl group-hover:scale-105 transition-transform`}>
                                    <IonIcon name={action.icon} />
                                </div>
                                <span className="text-gray-400 group-hover:text-white text-[10px] md:text-xs font-medium transition-colors text-center">{action.label}</span>
                            </Link>
                        ))}
                    </div>
                </div>
            </div>

            {/* Wallet Services Grid */}
            <div className="mb-20">
                <div className="flex items-center justify-between mb-5">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <IonIcon name="grid-outline" className="text-xl" />
                        Services
                    </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                    {walletCards.map((card) => (
                        <Link
                            key={card.id}
                            href={card.href}
                            className="group"
                        >
                            <div className="bg-[#162033] hover:bg-[#1a2540] border border-gray-800 group-hover:border-gray-700 rounded-2xl p-5 md:p-6 transition-all hover:shadow-lg cursor-pointer h-full relative overflow-hidden">
                                <div className="flex flex-col gap-5 h-full relative z-10">
                                    <div className="flex items-start justify-between">
                                        <div className={`w-12 h-12 md:w-14 md:h-14 ${card.bgColor} rounded-xl flex items-center justify-center text-2xl shrink-0 group-hover:scale-105 transition-transform`}>
                                            <IonIcon name={card.icon} className={card.iconColor} />
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[10px] md:text-xs text-gray-500 mb-1 font-medium tracking-wide">{card.stats.label}</p>
                                            <div className="flex items-center justify-end gap-3">
                                                {/* RUPEE LOGO PLAIN - WIDE AS REQUESTED */}
                                                {(card.id !== 4) && <div className="relative w-16 h-8 md:w-24 md:h-10"><Image src="/assets/images/rupee.png" alt="₹" fill className="object-contain" /></div>}
                                                <p className="text-2xl md:text-5xl font-bold text-white">{card.stats.value}</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <h4 className="text-base md:text-lg font-bold text-white mb-1 group-hover:text-blue-400 transition-colors">
                                            {card.title}
                                        </h4>
                                        <p className="text-xs md:text-sm text-gray-500 leading-relaxed line-clamp-2">{card.description}</p>
                                    </div>
                                    <div className="mt-auto pt-2 flex items-center gap-2 text-blue-400 text-[10px] font-bold uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-all transform translate-x-[-5px] group-hover:translate-x-0">
                                        Open <IonIcon name="arrow-forward" />
                                    </div>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            </div>

            {/* Spacer for mobile bottom bar */}
            <div className="h-20 md:hidden"></div>
        </div>
    );
}
