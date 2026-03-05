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
    const [googerId, setGoogerId] = useState("");
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);
    const [idVerificationName, setIdVerificationName] = useState("");
    const [subscriptionType, setSubscriptionType] = useState("Monthly Subscription");
    const [center, setCenter] = useState("");

    const referralLink = typeof window !== 'undefined' ? `${window.location.origin}/register?ref=${googerId}` : '';

    const handleCopy = async () => {
        if (referralLink) {
            try {
                await navigator.clipboard.writeText(referralLink);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            } catch (err) {
                console.error('Failed to copy', err);
            }
        }
    };

    const handleShare = async () => {
        if (navigator.share && referralLink) {
            try {
                await navigator.share({
                    title: 'Join Googer',
                    text: 'Join me on Googer and start earning!',
                    url: referralLink,
                });
            } catch (err) {
                console.log('Error sharing:', err);
            }
        } else {
            handleCopy();
        }
    };

    useEffect(() => {
        const fetchData = async () => {
            try {
                const profile = await authService.getProfile();
                setBalance(parseFloat(profile.wallet_balance) || 0);

                // Use the numeric user_id if available, fallback to username
                const displayId = profile.user_id || profile.googer_id || profile.username || "";
                setGoogerId(displayId);

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
            {/* New Header */}
            <div className="bg-white rounded-xl p-4 mb-6 shadow-sm flex flex-col items-center justify-center gap-3">
                <h1 className="text-black font-bold text-lg text-center tracking-wide">( My Googer ID - {googerId} )</h1>

                {/* Referral Link Section */}
                <div className="w-full max-w-sm bg-gray-100 rounded-lg p-2 pl-3 flex items-center justify-between gap-2 border border-gray-200">
                    <div className="text-gray-500 text-xs truncate flex-1 font-mono">
                        {referralLink}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            onClick={handleCopy}
                            className={`p-2 rounded-lg shadow-sm transition-all flex items-center justify-center ${copied ? 'bg-green-100 text-green-600' : 'bg-white text-blue-500 hover:bg-blue-50'}`}
                            title="Copy Link"
                        >
                            <IonIcon name={copied ? "checkmark-outline" : "copy-outline"} className="text-lg" />
                        </button>
                        <button
                            onClick={handleShare}
                            className="p-2 bg-white rounded-lg shadow-sm hover:bg-purple-50 transition-all text-purple-500 flex items-center justify-center"
                            title="Share Link"
                        >
                            <IonIcon name="share-social-outline" className="text-lg" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Total Balance Card */}
            <div className="bg-[#162033] border border-gray-800 rounded-2xl p-6 md:p-8 mb-8 shadow-lg relative overflow-hidden transition-all hover:border-gray-700 flex flex-col items-center justify-center text-center">
                {/* Subtle Decorative Elements */}
                <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500/5 rounded-full blur-3xl"></div>
                <div className="absolute bottom-0 left-0 w-32 h-32 bg-purple-500/5 rounded-full blur-2xl"></div>

                <div className="relative z-10 flex flex-col items-center w-full">
                    <h2 className="text-lg md:text-xl font-bold text-white mb-4 tracking-wide">My total Ruppier Coins balance</h2>

                    <div className="flex flex-row items-center gap-3 justify-center mb-2">
                        <div className="relative w-12 h-6 md:w-16 md:h-10 shrink-0">
                            <Image src="/assets/images/rupee.png" alt="Rupee" fill className="object-contain" priority />
                        </div>
                        <h2 className="text-3xl md:text-5xl font-bold text-white tracking-tight leading-none whitespace-nowrap">
                            {balance.toFixed(2)}
                        </h2>
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

                    {/* ID Verification Name - Custom Container Box */}
                    <div className="bg-[#162033] border border-gray-800 rounded-2xl p-5 md:p-6 transition-all hover:shadow-lg relative overflow-hidden h-full min-h-[180px]">
                        <div className="flex flex-col h-full relative z-10">
                            <div className="flex items-start justify-between mb-2">
                                <div className="w-12 h-12 md:w-14 md:h-14 bg-pink-500/10 rounded-xl flex items-center justify-center text-2xl shrink-0">
                                    <IonIcon name="person-circle-outline" className="text-pink-400" />
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] md:text-xs text-gray-500 mb-1 font-medium tracking-wide uppercase">Identity</p>
                                    <p className="text-sm font-bold text-white">Verification</p>
                                </div>
                            </div>
                            <div className="flex-1">
                                <h4 className="text-base font-bold text-white mb-3">ID Verification Name</h4>
                                <input
                                    type="text"
                                    value={idVerificationName}
                                    onChange={(e) => setIdVerificationName(e.target.value)}
                                    className="w-full bg-[#0d1421] border border-gray-700/50 rounded-xl px-4 py-3 text-white text-center text-sm font-bold focus:outline-none focus:ring-1 focus:ring-blue-500/50 shadow-inner"
                                    placeholder="Enter Name"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Subscription Type - Custom Container Box */}
                    <div className="bg-[#162033] border border-gray-800 rounded-2xl p-5 md:p-6 transition-all hover:shadow-lg relative overflow-hidden h-full min-h-[180px]">
                        <div className="flex flex-col h-full relative z-10">
                            <div className="flex items-start justify-between mb-2">
                                <div className="w-12 h-12 md:w-14 md:h-14 bg-blue-500/10 rounded-xl flex items-center justify-center text-2xl shrink-0">
                                    <IonIcon name="card-outline" className="text-blue-400" />
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] md:text-xs text-gray-500 mb-1 font-medium tracking-wide uppercase">Subscription</p>
                                    <p className="text-sm font-bold text-white">Plan</p>
                                </div>
                            </div>
                            <div className="flex-1">
                                <h4 className="text-base font-bold text-white mb-3">Select Subscription</h4>
                                <div className="relative">
                                    <select
                                        value={subscriptionType}
                                        onChange={(e) => setSubscriptionType(e.target.value)}
                                        className="w-full bg-[#0d1421] border border-gray-700/50 rounded-xl px-4 py-3 text-white text-center text-xs font-bold focus:outline-none focus:ring-1 focus:ring-blue-500/50 shadow-inner appearance-none transition-all hover:bg-[#111a2b] cursor-pointer"
                                    >
                                        <option value="Monthly Subscription">Monthly Subscription</option>
                                        <option value="Yearly Subscription">Yearly Subscription</option>
                                        <option value="Quarterly Subscription">Quarterly Subscription</option>
                                    </select>
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                                        <IonIcon name="chevron-down-outline" className="text-xs" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Center Box - Custom Container Box */}
                    <div className="bg-[#162033] border border-gray-800 rounded-2xl p-5 md:p-6 transition-all hover:shadow-lg relative overflow-hidden h-full min-h-[180px]">
                        <div className="flex flex-col h-full relative z-10">
                            <div className="flex items-start justify-between mb-2">
                                <div className="w-12 h-12 md:w-14 md:h-14 bg-purple-500/10 rounded-xl flex items-center justify-center text-2xl shrink-0">
                                    <IonIcon name="business-outline" className="text-purple-400" />
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] md:text-xs text-gray-500 mb-1 font-medium tracking-wide uppercase">Location</p>
                                    <p className="text-sm font-bold text-white">Center</p>
                                </div>
                            </div>
                            <div className="flex-1">
                                <h4 className="text-base font-bold text-white mb-3">Center Box</h4>
                                <input
                                    type="text"
                                    value={center}
                                    onChange={(e) => setCenter(e.target.value)}
                                    className="w-full bg-[#0d1421] border border-gray-700/50 rounded-xl px-4 py-3 text-white text-center text-sm font-bold focus:outline-none focus:ring-1 focus:ring-blue-500/50 shadow-inner transition-all hover:bg-[#111a2b]"
                                    placeholder="Enter Center Details"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Spacer for mobile bottom bar */}
            <div className="h-20 md:hidden"></div>
        </div>
    );
}
