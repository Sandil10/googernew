"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import IonIcon from "@/app/components/IonIcon";
import { authService } from "@/services/authService";
import { walletService } from "@/services/walletService";
import ShareModal from "@/app/components/ShareModal";
import { getUserIdentityKey, getWalletBalanceWithAdAdjustments } from "@/utils/adWallet";
import { adsService } from "@/services/adsService";
import { formatGoogerId } from "@/app/lib/userDisplay";

const HeaderCopyIcon = () => (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="9" width="11" height="11" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
);

const HeaderShareIcon = () => (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <path d="m8.6 13.5 6.8 4" />
        <path d="m15.4 6.5-6.8 4" />
    </svg>
);

const HeaderCheckIcon = () => (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6 9 17l-5-5" />
    </svg>
);

const asTransactionList = (value: any) => Array.isArray(value) ? value : [];

const formatTransactionDate = (value: any) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Pending" : date.toLocaleDateString();
};

const formatWalletAmount = (value: any) => {
    const amount = Number.parseFloat(String(value ?? 0));
    return Number.isFinite(amount) ? amount.toFixed(2) : "0.00";
};

export default function WalletPage() {
    const [balance, setBalance] = useState(0);
    const [txCount, setTxCount] = useState(0);
    const [googerId, setGoogerId] = useState("");
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);
    const [recentTransactions, setRecentTransactions] = useState<any[]>([]);
    const [user, setUser] = useState<any>(null);
    // idVerificationName state removed — replaced by /wallet/verification page
    const [showShareModal, setShowShareModal] = useState(false);
    const [showWalletQr, setShowWalletQr] = useState(false);
    const [qrCopied, setQrCopied] = useState(false);
    const [adCount, setAdCount] = useState(0);
    const walletSummarySignatureRef = useRef("");
    const adCountRef = useRef<number | null>(null);

    const referralLink = typeof window !== 'undefined' ? `${window.location.origin}/register?ref=${googerId}` : '';
    const walletQrLink = typeof window !== 'undefined' && googerId
        ? `${window.location.origin}/wallet-pay?to=${encodeURIComponent(String(googerId))}`
        : '';
    const walletQrImage = walletQrLink
        ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=1&data=${encodeURIComponent(walletQrLink)}`
        : '';
    const safeBalance = Number.isFinite(Number(balance)) ? Number(balance) : 0;
    const balanceDisplay = safeBalance.toFixed(2);

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

    const handleCopyWalletQr = async () => {
        if (walletQrLink) {
            try {
                await navigator.clipboard.writeText(walletQrLink);
                setQrCopied(true);
                setTimeout(() => setQrCopied(false), 2000);
            } catch (err) {
                console.error('Failed to copy wallet QR link', err);
            }
        }
    };

    useEffect(() => {
        const applyWalletSummary = (profile: any, txData: any[]) => {
            const safeProfile = profile || {};
            const safeTransactions = asTransactionList(txData);
            const nextBalance = getWalletBalanceWithAdAdjustments(parseFloat(safeProfile.wallet_balance) || 0, getUserIdentityKey(safeProfile));
            const nextGoogerId = safeProfile.user_id || safeProfile.googer_id || safeProfile.id || "";
            const nextRecentTransactions = safeTransactions.slice(0, 3);
            const nextSignature = JSON.stringify([
                safeProfile?.id || "",
                nextBalance,
                nextGoogerId,
                safeTransactions.length || 0,
                nextRecentTransactions.map((entry: any) => entry?.id || entry?.created_at || entry?.reference || ""),
            ]);

            if (walletSummarySignatureRef.current === nextSignature) return;
            walletSummarySignatureRef.current = nextSignature;

            setUser(safeProfile);
            setBalance(nextBalance);
            setGoogerId(nextGoogerId);
            setTxCount(safeTransactions.length || 0);
            setRecentTransactions(nextRecentTransactions);
        };

        const fetchData = async () => {
            try {
                const [profile, txData] = await Promise.all([
                    authService.getProfile(),
                    walletService.getTransactionHistory(),
                ]);
                applyWalletSummary(profile, asTransactionList(txData));
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
                const nextCount = ads.length;
                if (adCountRef.current !== nextCount) {
                    adCountRef.current = nextCount;
                    setAdCount(nextCount);
                }
            } catch {
                if (adCountRef.current !== 0) {
                    adCountRef.current = 0;
                    setAdCount(0);
                }
            }
        };
        const refreshAdCountIfVisible = () => {
            if (document.visibilityState === "hidden") return;
            void refreshAdCount();
        };
        const refreshAdCountOnStorage = (event: StorageEvent) => {
            if (event.storageArea && event.storageArea !== window.localStorage && event.storageArea !== window.sessionStorage) return;
            refreshAdCountIfVisible();
        };

        refreshAdCount();
        window.addEventListener("storage", refreshAdCountOnStorage);
        window.addEventListener("googer-ad-history-updated", refreshAdCountIfVisible);
        window.addEventListener("focus", refreshAdCountIfVisible);
        document.addEventListener("visibilitychange", refreshAdCountIfVisible);
        const intervalId = window.setInterval(refreshAdCountIfVisible, 60000);

        return () => {
            window.removeEventListener("storage", refreshAdCountOnStorage);
            window.removeEventListener("googer-ad-history-updated", refreshAdCountIfVisible);
            window.removeEventListener("focus", refreshAdCountIfVisible);
            document.removeEventListener("visibilitychange", refreshAdCountIfVisible);
            window.clearInterval(intervalId);
        };
    }, []);

    useEffect(() => {
        const applyWalletSummary = (profile: any, txData: any[]) => {
            const safeProfile = profile || {};
            const safeTransactions = asTransactionList(txData);
            const nextBalance = getWalletBalanceWithAdAdjustments(parseFloat(safeProfile.wallet_balance) || 0, getUserIdentityKey(safeProfile));
            const nextRecentTransactions = safeTransactions.slice(0, 3);
            const nextSignature = JSON.stringify([
                safeProfile?.id || "",
                nextBalance,
                safeProfile.user_id || safeProfile.googer_id || safeProfile.id || "",
                safeTransactions.length || 0,
                nextRecentTransactions.map((entry: any) => entry?.id || entry?.created_at || entry?.reference || ""),
            ]);

            if (walletSummarySignatureRef.current === nextSignature) return;
            walletSummarySignatureRef.current = nextSignature;

            setUser(safeProfile);
            setBalance(nextBalance);
            setTxCount(safeTransactions.length || 0);
            setRecentTransactions(nextRecentTransactions);
        };

        const refreshWalletSummary = async () => {
            try {
                const [profile, txData] = await Promise.all([
                    authService.getProfile(),
                    walletService.getTransactionHistory(),
                ]);
                applyWalletSummary(profile, asTransactionList(txData));
            } catch (error) {
                console.error("Error refreshing wallet summary:", error);
            }
        };
        const refreshWalletSummaryIfVisible = () => {
            if (document.visibilityState === "hidden") return;
            void refreshWalletSummary();
        };

        window.addEventListener("googer-wallet-updated", refreshWalletSummaryIfVisible);
        window.addEventListener("focus", refreshWalletSummaryIfVisible);

        return () => {
            window.removeEventListener("googer-wallet-updated", refreshWalletSummaryIfVisible);
            window.removeEventListener("focus", refreshWalletSummaryIfVisible);
        };
    }, []);

    const walletCards = [
        {
            id: 1,
            title: "My Wallet",
            description: "Manage your balance and earnings",
            icon: "wallet-outline",
            href: "/wallet/my-wallet",
            bgColor: "border border-white/10 bg-black/20",
            iconColor: "text-white/75",
            stats: { label: "Balance", value: balanceDisplay }
        },
        {
            id: 2,
            title: "Top Up",
            description: "Recharge your wallet with Rupieer coins",
            icon: "add-circle-outline",
            href: "/wallet/topup",
            bgColor: "border border-white/10 bg-black/20",
            iconColor: "text-white/75",
            stats: { label: "Wallet", value: "Topup" }
        },
        {
            id: 3,
            title: "Withdrawal",
            description: "Cash out your earnings to your account",
            icon: "cash-outline",
            href: "/wallet/withdrawal",
            bgColor: "border border-white/10 bg-black/20",
            iconColor: "text-white/75",
            stats: { label: "Available", value: balanceDisplay }
        },
        {
            id: 4,
            title: "Transactions",
            description: "View your transaction history",
            icon: "receipt-outline",
            href: "/wallet/transactions",
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
                            className={`wallet-qr-action p-2 rounded-lg shadow-sm transition-all flex items-center justify-center border border-gray-200 ${copied ? 'bg-green-100 text-green-600' : 'bg-[#f8fafc] text-[#111827] hover:bg-zinc-200'}`}
                            title="Copy Link"
                        >
                            {copied ? <HeaderCheckIcon /> : <HeaderCopyIcon />}
                        </button>
                        <button
                            onClick={handleShare}
                            className="wallet-qr-action p-2 rounded-lg border border-gray-200 bg-[#f8fafc] shadow-sm hover:bg-zinc-200 transition-all text-[#111827] flex items-center justify-center"
                            title="Share Link"
                        >
                            <HeaderShareIcon />
                        </button>
                        {walletQrImage && (
                            <button
                                onClick={() => setShowWalletQr(true)}
                                className="wallet-qr-action p-1.5 rounded-lg border border-gray-200 bg-[#f8fafc] shadow-sm hover:bg-zinc-200 transition-all text-[#111827] flex items-center justify-center"
                                title="Wallet QR"
                            >
                                <img src={walletQrImage} alt="Wallet QR" className="w-7 h-7 object-contain rounded" />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Total Balance Card */}
            <div className="bg-[#070707] border border-gray-800 rounded-2xl p-6 md:p-8 mb-8 shadow-lg relative overflow-hidden transition-all hover:border-gray-700 flex flex-col items-center justify-center text-center">
                {/* Subtle Decorative Elements */}
                <div className="absolute top-0 right-0 w-48 h-48 bg-black/10 rounded-full blur-3xl"></div>
                <div className="absolute bottom-0 left-0 w-32 h-32 bg-black/10 rounded-full blur-2xl"></div>

                <div className="relative z-10 flex flex-col items-center w-full">
                    <h2 className="text-lg md:text-xl font-bold text-white mb-4 tracking-wide">Total Wallet Balance</h2>

                    <div className="flex flex-row items-center gap-3 justify-center mb-2">
                        <div className="relative w-12 h-6 md:w-16 md:h-10 shrink-0">
                            <Image src="/assets/images/rupee.png" alt="Rupieer" fill className="object-contain" priority />
                        </div>
                        <h2 className="text-3xl md:text-5xl font-bold text-white tracking-tight leading-none whitespace-nowrap">
                            {balanceDisplay}
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

                    {/* ID Verification - Navigate to verification page */}
                    <Link href="/wallet/verification" className="block bg-[#070707] border border-gray-800 rounded-2xl p-5 md:p-6 transition-all hover:shadow-lg hover:border-blue-500/30 relative overflow-hidden h-full min-h-[180px] group">
                        <div className="flex flex-col h-full relative z-10">
                            <div className="flex items-start justify-between mb-2">
                                <div className="w-12 h-12 md:w-14 md:h-14 border border-white/10 bg-black/20 rounded-xl flex items-center justify-center text-2xl shrink-0">
                                    <IonIcon name="shield-checkmark-outline" className="text-blue-400/80" />
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] md:text-xs text-gray-500 mb-1 font-medium tracking-wide uppercase">Identity</p>
                                    <p className="text-sm font-bold text-white">Verification</p>
                                </div>
                            </div>
                            <div className="flex-1">
                                <h4 className="text-base font-bold text-white mb-1">Get Verified</h4>
                                <p className="text-[11px] text-white/40 leading-relaxed mb-3">Apply for a blue verification badge to build trust with your audience.</p>
                                <div className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-blue-300 transition group-hover:bg-blue-500/15">
                                    <IonIcon name="arrow-forward-outline" className="text-xs" />
                                    Apply Now
                                </div>
                            </div>
                        </div>
                    </Link>

                    {/* Subscription Plan - Click to open subscription page */}
                    <Link href="/wallet/subscription" className="block h-full group">
                        <div className="bg-[#070707] border border-gray-800 rounded-2xl p-5 md:p-6 transition-all hover:shadow-lg hover:border-gray-700 relative overflow-hidden h-full min-h-[180px]">
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
                                    <h4 className="text-base font-bold text-white mb-3">View Subscription Plans</h4>
                                    <div className="w-full bg-[#030303] border border-gray-700/50 rounded-xl px-4 py-3 text-white text-center text-sm font-bold shadow-inner transition-all group-hover:bg-[#0b0b0b]">
                                        Choose a Package
                                    </div>
                                    <div className="mt-3 flex items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-widest text-white/55">
                                        Open <IonIcon name="arrow-forward" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Link>

                    {/* Ad Center - Custom Container Box */}
                    <Link href="/wallet/ad-center" className="block h-full group">
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
                                <Link href="/wallet/transactions" className="text-[10px] text-white/55 font-bold uppercase tracking-widest hover:text-white hover:underline">See All</Link>
                            </div>

                            <div className="flex flex-col gap-2">
                                {recentTransactions.length > 0 ? (
                                    recentTransactions.map((tx) => {
                                        const isSent = tx.sender_id === user?.id;
                                        return (
                                            <div key={tx.id || tx.created_at || `${tx.sender_id || "sender"}-${tx.receiver_id || "receiver"}-${tx.amount || "0"}`} className="flex items-center justify-between p-3 bg-[#030303] rounded-xl border border-gray-800/50 hover:border-gray-700 transition-all">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${isSent ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
                                                        <IonIcon name={isSent ? 'arrow-up-outline' : 'arrow-down-outline'} />
                                                    </div>
                                                    <div className="text-left">
                                                        <p className="text-[10px] font-bold text-white truncate max-w-[80px]">@{(isSent ? tx.receiver_username : tx.sender_username) || "user"}</p>
                                                        <p className="text-[8px] text-gray-500 font-medium">{formatTransactionDate(tx.created_at)}</p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className={`text-[10px] font-black tracking-tight ${isSent ? 'text-red-400' : 'text-green-400'}`}>
                                                        {isSent ? '-' : '+'} R {formatWalletAmount(tx.amount)}
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

            {showWalletQr && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
                    <div className="w-full max-w-xs rounded-2xl border border-white/10 bg-[#070707] p-5 text-center shadow-2xl">
                        <div className="mb-4 flex items-center justify-between">
                            <div className="text-left">
                                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-500">Wallet QR</p>
                                <h3 className="text-base font-bold text-white">{formatGoogerId(googerId)}</h3>
                            </div>
                            <button
                                onClick={() => setShowWalletQr(false)}
                                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white hover:bg-white/10"
                                title="Close"
                            >
                                <IonIcon name="close-outline" />
                            </button>
                        </div>

                        <div className="mx-auto mb-4 flex h-48 w-48 items-center justify-center rounded-xl bg-white p-3">
                            <img src={walletQrImage} alt="Scan to pay wallet" className="h-full w-full object-contain" />
                        </div>

                        <p className="mb-4 text-xs leading-relaxed text-gray-400">
                            Scan to open wallet transfer with this Googer ID filled.
                        </p>

                        <button
                            onClick={handleCopyWalletQr}
                            className="w-full rounded-xl bg-white px-4 py-3 text-sm font-bold text-black transition hover:bg-zinc-200"
                        >
                            {qrCopied ? "Copied" : "Copy QR Link"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
