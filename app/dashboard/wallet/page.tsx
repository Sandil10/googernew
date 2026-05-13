"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";
import IonIcon from "@/app/components/IonIcon";
import { authService } from "@/services/authService";
import { walletService } from "@/services/walletService";
import ShareModal from "@/app/components/ShareModal";
import { getUserIdentityKey, getWalletBalanceWithAdAdjustments } from "@/utils/adWallet";
import { adsService } from "@/services/adsService";
import { formatGoogerId } from "@/app/lib/userDisplay";

export default function WalletPage() {
    const [balance, setBalance] = useState(0);
    const [txCount, setTxCount] = useState(0);
    const [googerId, setGoogerId] = useState("");
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);
    const [recentTransactions, setRecentTransactions] = useState<any[]>([]);
    const [user, setUser] = useState<any>(null);
    const [idVerificationName, setIdVerificationName] = useState("");
    const [subscriptionType, setSubscriptionType] = useState("Monthly Subscription");
    const [showShareModal, setShowShareModal] = useState(false);
    const [adCount, setAdCount] = useState(0);

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
        setShowShareModal(true);
    };

    useEffect(() => {
        const fetchData = async () => {
            try {
                const profile = await authService.getProfile();
                setUser(profile);
                setBalance(getWalletBalanceWithAdAdjustments(parseFloat(profile.wallet_balance) || 0, getUserIdentityKey(profile)));

                // Use the numeric user_id if available, fallback to username
                const displayId = profile.user_id || profile.googer_id || profile.id || "";
                setGoogerId(displayId);

                const txData = await walletService.getTransactionHistory();
                setTxCount(txData.length || 0);
                setRecentTransactions(txData.slice(0, 3));
            } catch (error) {
                console.error("Error fetching wallet summary:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    useEffect(() => {
        const refreshAdCount = async () => {
            try {
                const ads = await adsService.getMyAds();
                setAdCount(ads.length);
            } catch {
                setAdCount(0);
            }
        };

        refreshAdCount();
        window.addEventListener("storage", refreshAdCount);
        window.addEventListener("googer-ad-history-updated", refreshAdCount);
        window.addEventListener("focus", refreshAdCount);
        document.addEventListener("visibilitychange", refreshAdCount);
        const intervalId = window.setInterval(refreshAdCount, 30000);

        return () => {
            window.removeEventListener("storage", refreshAdCount);
            window.removeEventListener("googer-ad-history-updated", refreshAdCount);
            window.removeEventListener("focus", refreshAdCount);
            document.removeEventListener("visibilitychange", refreshAdCount);
            window.clearInterval(intervalId);
        };
    }, []);

    useEffect(() => {
        const refreshWalletSummary = async () => {
            try {
                const profile = await authService.getProfile();
                setUser(profile);
                setBalance(getWalletBalanceWithAdAdjustments(parseFloat(profile.wallet_balance) || 0, getUserIdentityKey(profile)));

                const txData = await walletService.getTransactionHistory();
                setTxCount(txData.length || 0);
                setRecentTransactions(txData.slice(0, 3));
            } catch (error) {
                console.error("Error refreshing wallet summary:", error);
            }
        };

        window.addEventListener("googer-wallet-updated", refreshWalletSummary);
        window.addEventListener("focus", refreshWalletSummary);

        return () => {
            window.removeEventListener("googer-wallet-updated", refreshWalletSummary);
            window.removeEventListener("focus", refreshWalletSummary);
        };
    }, []);

    const walletCards = [
        {
            id: 1,
            title: "My Wallet",
            description: "Manage your balance and earnings",
            icon: "wallet-outline",
            href: "/dashboard/wallet/my-wallet",
            bgColor: "border border-white/10 bg-black/20",
            iconColor: "text-white/75",
            stats: { label: "Balance", value: balance.toFixed(2) }
        },
        {
            id: 2,
            title: "Top Up",
            description: "Recharge your wallet with Rupier coins",
            icon: "add-circle-outline",
            href: "/dashboard/wallet/topup",
            bgColor: "border border-white/10 bg-black/20",
            iconColor: "text-white/75",
            stats: { label: "Wallet", value: "Topup" }
        },
        {
            id: 3,
            title: "Withdrawal",
            description: "Cash out your earnings to your account",
            icon: "cash-outline",
            href: "/dashboard/wallet/withdrawal",
            bgColor: "border border-white/10 bg-black/20",
            iconColor: "text-white/75",
            stats: { label: "Available", value: balance.toFixed(2) }
        },
        {
            id: 4,
            title: "Transactions",
            description: "View your transaction history",
            icon: "receipt-outline",
            href: "/dashboard/wallet/transactions",
            bgColor: "border border-white/10 bg-black/20",
            iconColor: "text-white/75",
            stats: { label: "Total Transactions", value: `${txCount} txns` }
        }
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
                <h1 className="text-black font-bold text-lg text-center tracking-wide">( My Googer ID - {formatGoogerId(googerId)} )</h1>

                {/* Referral Link Section */}
                <div className="w-full max-w-sm bg-gray-100 rounded-lg p-2 pl-3 flex items-center justify-between gap-2 border border-gray-200">
                    <div className="text-gray-500 text-xs truncate flex-1 font-mono">
                        {referralLink}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            onClick={handleCopy}
                            className={`p-2 rounded-lg shadow-sm transition-all flex items-center justify-center ${copied ? 'bg-green-100 text-green-600' : 'bg-white text-black hover:bg-zinc-200'}`}
                            title="Copy Link"
                        >
                            <IonIcon name={copied ? "checkmark-outline" : "copy-outline"} className="text-lg" />
                        </button>
                        <button
                            onClick={handleShare}
                            className="p-2 bg-white rounded-lg shadow-sm hover:bg-zinc-200 transition-all text-black flex items-center justify-center"
                            title="Share Link"
                        >
                            <IonIcon name="share-social-outline" className="text-lg" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Total Balance Card */}
            <div className="bg-[#070707] border border-gray-800 rounded-2xl p-6 md:p-8 mb-8 shadow-lg relative overflow-hidden transition-all hover:border-gray-700 flex flex-col items-center justify-center text-center">
                {/* Subtle Decorative Elements */}
                <div className="absolute top-0 right-0 w-48 h-48 bg-black/10 rounded-full blur-3xl"></div>
                <div className="absolute bottom-0 left-0 w-32 h-32 bg-black/10 rounded-full blur-2xl"></div>

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
                            <div className="bg-[#070707] hover:bg-[#0d0d0d] border border-gray-800 group-hover:border-gray-700 rounded-2xl p-5 md:p-6 transition-all hover:shadow-lg cursor-pointer h-full relative overflow-hidden">
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
                                        <h4 className="text-base md:text-lg font-bold text-white mb-1 transition-colors group-hover:text-white">
                                            {card.title}
                                        </h4>
                                        <p className="text-xs md:text-sm text-gray-500 leading-relaxed line-clamp-2">{card.description}</p>
                                    </div>
                                    <div className="mt-auto pt-2 flex items-center gap-2 text-white/55 text-[10px] font-bold uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-all transform translate-x-[-5px] group-hover:translate-x-0">
                                        Open <IonIcon name="arrow-forward" />
                                    </div>
                                </div>
                            </div>
                        </Link>
                    ))}

                    {/* ID Verification Name - Custom Container Box */}
                    <div className="bg-[#070707] border border-gray-800 rounded-2xl p-5 md:p-6 transition-all hover:shadow-lg relative overflow-hidden h-full min-h-[180px]">
                        <div className="flex flex-col h-full relative z-10">
                            <div className="flex items-start justify-between mb-2">
                                <div className="w-12 h-12 md:w-14 md:h-14 border border-white/10 bg-black/20 rounded-xl flex items-center justify-center text-2xl shrink-0">
                                    <IonIcon name="person-circle-outline" className="text-white/75" />
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
                                    className="w-full bg-[#030303] border border-gray-700/50 rounded-xl px-4 py-3 text-white text-center text-sm font-bold focus:outline-none focus:ring-1 focus:ring-white/30 shadow-inner"
                                    placeholder="Enter Name"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Subscription Type - Custom Container Box */}
                    <div className="bg-[#070707] border border-gray-800 rounded-2xl p-5 md:p-6 transition-all hover:shadow-lg relative overflow-hidden h-full min-h-[180px]">
                        <div className="flex flex-col h-full relative z-10">
                            <div className="flex items-start justify-between mb-2">
                                <div className="w-12 h-12 md:w-14 md:h-14 border border-white/10 bg-black/20 rounded-xl flex items-center justify-center text-2xl shrink-0">
                                    <IonIcon name="card-outline" className="text-white/75" />
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
                                        className="w-full bg-[#030303] border border-gray-700/50 rounded-xl px-4 py-3 text-white text-center text-xs font-bold focus:outline-none focus:ring-1 focus:ring-white/30 shadow-inner appearance-none transition-all hover:bg-[#0b0b0b] cursor-pointer"
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

                    {/* Ad Center - Custom Container Box */}
                    <Link href="/dashboard/wallet/ad-center" className="block h-full group">
                    <div className="bg-[#070707] border border-gray-800 rounded-2xl p-5 md:p-6 transition-all hover:shadow-lg hover:border-gray-700 relative overflow-hidden h-full min-h-[180px]">
                        <div className="flex flex-col h-full relative z-10">
                            <div className="flex items-start justify-between mb-2">
                                <div className="w-12 h-12 md:w-14 md:h-14 border border-white/10 bg-black/20 rounded-xl flex items-center justify-center text-2xl shrink-0">
                                    <IonIcon name="megaphone-outline" className="text-white/75" />
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] md:text-xs text-gray-500 mb-1 font-medium tracking-wide uppercase">Marketing</p>
                                    <p className="text-sm font-bold text-white">{adCount} Ads</p>
                                </div>
                            </div>
                            <div className="flex-1">
                                <h4 className="text-base font-bold text-white mb-3">Ad Center</h4>
                                <div className="w-full bg-[#030303] border border-gray-700/50 rounded-xl px-4 py-3 text-white text-center text-sm font-bold shadow-inner transition-all group-hover:bg-[#0b0b0b]">
                                    {adCount} Ads
                                </div>
                                <div className="mt-3 flex items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-widest text-white/55">
                                    Open <IonIcon name="arrow-forward" />
                                </div>
                            </div>
                        </div>
                    </div>
                    </Link>
                    {/* Recent Transactions Section */}
                    <div className="bg-[#070707] border border-gray-800 rounded-2xl p-5 md:p-6 transition-all hover:shadow-lg relative overflow-hidden h-full min-h-[180px]">
                        <div className="flex flex-col h-full relative z-10 w-full">
                            <div className="flex items-center justify-between mb-4">
                                <h4 className="text-base font-bold text-white flex items-center gap-2">
                                    <IonIcon name="time-outline" className="text-white/65" />
                                    Recent Transactions
                                </h4>
                                <Link href="/dashboard/wallet/transactions" className="text-[10px] text-white/55 font-bold uppercase tracking-widest hover:text-white hover:underline">See All</Link>
                            </div>

                            <div className="flex flex-col gap-2">
                                {recentTransactions.length > 0 ? (
                                    recentTransactions.map((tx, idx) => {
                                        const isSent = tx.sender_id === user?.id;
                                        return (
                                            <div key={tx.id} className="flex items-center justify-between p-3 bg-[#030303] rounded-xl border border-gray-800/50 hover:border-gray-700 transition-all">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${isSent ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
                                                        <IonIcon name={isSent ? 'arrow-up-outline' : 'arrow-down-outline'} />
                                                    </div>
                                                    <div className="text-left">
                                                        <p className="text-[10px] font-bold text-white truncate max-w-[80px]">@{isSent ? tx.receiver_username : tx.sender_username}</p>
                                                        <p className="text-[8px] text-gray-500 font-medium">{new Date(tx.created_at).toLocaleDateString()}</p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className={`text-[10px] font-black tracking-tight ${isSent ? 'text-red-400' : 'text-green-400'}`}>
                                                        {isSent ? '-' : '+'} R {parseFloat(tx.amount).toFixed(2)}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-4 opacity-30">
                                        <IonIcon name="receipt-outline" className="text-2xl mb-1" />
                                        <p className="text-[8px] font-black uppercase tracking-widest">No Recent Activity</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Spacer for mobile bottom bar */}
            <div className="h-20 md:hidden"></div>

            {/* Share Modal */}
            <ShareModal
                isOpen={showShareModal}
                onClose={() => setShowShareModal(false)}
                title="Join Googer"
                url={referralLink}
                description="Join me on Googer and start earning!"
            />
        </div>
    );
}
