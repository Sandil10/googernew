"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authService } from '../../services/authService';
import { walletService } from '../../services/walletService';
import Link from 'next/link';
import Image from 'next/image';
import IonIcon from '../../app/components/IonIcon';

export default function MyWallet() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('wallet');
    const [user, setUser] = useState<any>(null);
    const [referralLink, setReferralLink] = useState("");
    const [referrals, setReferrals] = useState<any[]>([]);
    const [currentPage, setCurrentPage] = useState(1);

    useEffect(() => {
        setCurrentPage(1);
    }, [activeTab]);

    // Transfer States
    const [amount, setAmount] = useState("");
    const [commission, setCommission] = useState("");
    const [targetQuery, setTargetQuery] = useState("");
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [selectedUser, setSelectedUser] = useState<any>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [pendingRequests, setPendingRequests] = useState<any[]>([]);

    const fetchAllData = async () => {
        try {
            if (!authService.isAuthenticated()) {
                router.push('/');
                return;
            }
            const profile = await authService.getProfile();
            setUser(profile);

            const origin = window.location.origin;
            const link = `${origin}/?ref=${profile.referral_code || profile.username}`;
            setReferralLink(link);

            try {
                const walletData = await authService.getWallet();
                if (walletData && walletData.success) {
                    setReferrals(walletData.referrals || []);
                }

                const txData = await walletService.getTransactionHistory();
                setTransactions(txData);

                const requests = await walletService.getPendingRequests();
                setPendingRequests(requests);
            } catch (walletErr) {
                console.log("No wallet/tx data found");
            }
        } catch (error) {
            console.error("Error fetching data:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAllData();
    }, [router]);

    const handleRespond = async (requestId: number, action: 'accept' | 'reject') => {
        setIsProcessing(true);
        try {
            const res = await walletService.respondToRequest(requestId, action);
            if (res.success) {
                alert(`Request ${action}ed successfully`);
                await fetchAllData();
            }
        } catch (error: any) {
            alert(error.message || "Failed to process request");
        } finally {
            setIsProcessing(false);
        }
    };

    // Search Logic
    useEffect(() => {
        const searchUsers = async () => {
            if (targetQuery.length < 2) {
                setSuggestions([]);
                setShowSuggestions(false);
                return;
            }
            try {
                const results = await walletService.searchUsers(targetQuery);
                setSuggestions(results);
                setShowSuggestions(true);
            } catch (error) {
                console.error("Search error:", error);
            }
        };
        const timer = setTimeout(searchUsers, 500);
        return () => clearTimeout(timer);
    }, [targetQuery]);

    const handleSelectUser = (user: any) => {
        setSelectedUser(user);
        setTargetQuery(`${user.username} (${user.user_id})`);
        setShowSuggestions(false);
    };

    const handleTransfer = async (type: 'sell' | 'buy') => {
        if (!selectedUser || !amount) {
            alert("Please select a user and enter amount");
            return;
        }

        // Show confirmation popup for both sell and buy
        const actionText = type === 'sell' ? 'send money to' : 'request money from';
        const confirmMessage = `Are you sure you want to ${actionText} ${selectedUser.username}?\n\nAmount: ${amount}\nCommission: ${commission || 0}%`;

        if (!confirm(confirmMessage)) {
            return;
        }

        setIsProcessing(true);
        try {
            // Pass the correct type to the backend
            const requestType = type === 'sell' ? 'sell' : 'request';

            const res = await walletService.requestMoney(
                selectedUser.id,
                parseFloat(amount),
                "",
                commission ? parseFloat(commission) : 0,
                requestType
            );

            if (res.success) {
                const successMsg = type === 'sell'
                    ? `Money transfer sent to ${selectedUser.username}. Amount is on hold until they accept.`
                    : `Money request sent to ${selectedUser.username}. They will pay if they accept.`;
                alert(successMsg);

                // Refresh data
                await fetchAllData();

                setAmount("");
                setCommission("");
                setTargetQuery("");
                setSelectedUser(null);
            }
        } catch (err: any) {
            alert(err.message || "Failed to process");
        } finally {
            setIsProcessing(false);
        }
    };

    const copyToClipboard = () => {
        if (!referralLink) return;
        navigator.clipboard.writeText(referralLink);
        // Correct path to Toast component
        alert("Referral link copied!");
    };

    if (loading) {
        return (
            <div className="main__inner animate-pulse">
                <div className="max-w-2xl mx-auto">
                    <div className="mb-6">
                        <div className="w-24 h-10 bg-gray-200 dark:bg-gray-800 rounded-lg"></div>
                    </div>

                    <div className="h-14 bg-gray-200 dark:bg-gray-800 rounded-xl mb-6 w-full shadow-sm border border-transparent dark:border-slate-700"></div>

                    <div className="bg-white border border-slate-200 rounded-xl shadow-sm dark:border-slate-700 dark:bg-dark2 px-4 sm:px-6 py-8 space-y-8">

                        {/* Referral Link Skeleton */}
                        <div className="flex flex-col sm:flex-row gap-4">
                            <div className="w-32 h-10 bg-gray-200 dark:bg-gray-700 rounded-lg hidden sm:block"></div>
                            <div className="flex-1 h-10 bg-gray-200 dark:bg-gray-700 rounded-lg w-full"></div>
                            <div className="w-24 h-10 bg-gray-200 dark:bg-gray-700 rounded-lg hidden sm:block"></div>
                        </div>

                        <div className="border-t border-gray-100 dark:border-slate-700 my-6"></div>

                        {/* Tabs Skeleton */}
                        <div className="flex gap-6 overflow-x-auto pb-2">
                            <div className="w-20 h-6 bg-gray-200 dark:bg-gray-700 rounded-md shrink-0"></div>
                            <div className="w-24 h-6 bg-gray-200 dark:bg-gray-700 rounded-md shrink-0"></div>
                            <div className="w-28 h-6 bg-gray-200 dark:bg-gray-700 rounded-md shrink-0"></div>
                            <div className="w-20 h-6 bg-gray-200 dark:bg-gray-700 rounded-md shrink-0"></div>
                        </div>

                        {/* Inner Content Skeleton (Wallet View) */}
                        <div className="space-y-6 max-w-lg mx-auto py-4">
                            <div className="h-8 w-48 bg-gray-200 dark:bg-gray-700 rounded mx-auto mb-8"></div>

                            <div className="flex flex-col md:flex-row gap-4 items-center">
                                <div className="w-32 h-6 bg-gray-200 dark:bg-gray-700 rounded md:text-right hidden md:block"></div>
                                <div className="flex-1 w-full h-10 bg-gray-200 dark:bg-gray-700 rounded-full"></div>
                            </div>

                            <div className="flex flex-col md:flex-row gap-4 items-center">
                                <div className="w-32 h-6 bg-gray-200 dark:bg-gray-700 rounded md:text-right hidden md:block"></div>
                                <div className="flex-1 w-full h-10 bg-gray-200 dark:bg-gray-700 rounded-full"></div>
                            </div>

                            <div className="flex gap-4 justify-center pt-4">
                                <div className="w-32 h-10 bg-gray-200 dark:bg-gray-700 rounded-full"></div>
                                <div className="w-32 h-10 bg-gray-200 dark:bg-gray-700 rounded-full"></div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Spacer for mobile bottom bar */}
                <div className="h-20 md:hidden"></div>
            </div>
        );
    }

    return (
        <div className="main__inner">
            <div className="max-w-2xl mx-auto">
                <div className="mb-6">
                    <button
                        onClick={() => router.back()}
                        className="flex items-center gap-2 px-4 py-2 bg-transparent text-gray-700 dark:text-white rounded-lg border border-gray-300 dark:border-white hover:bg-gray-50 dark:hover:bg-white/10 transition-colors font-medium cursor-pointer"
                    >
                        <IonIcon name="chevron-back-outline" size="small" />
                        <span className="text-base">Back</span>
                    </button>
                </div>

                <div className="bg-white border text-center py-4 border-slate-200 rounded-xl shadow-sm dark:border-slate-700 dark:bg-dark2 dark:text-white mb-6">
                    <h3 className="font-bold text-lg">User ID : {user?.user_id || "..."}</h3>
                </div>

                {/* Total Balance Card */}
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm dark:border-slate-700 dark:bg-dark2 p-6 md:p-8 mb-6 transition-all hover:border-blue-500/30">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div>
                            <p className="text-gray-500 dark:text-gray-400 text-[10px] font-bold mb-3 uppercase tracking-widest text-center md:text-left">Available Balance</p>
                            <div className="flex flex-row items-center justify-center md:justify-start gap-3 flex-nowrap overflow-visible">
                                <div className="relative w-12 h-6 md:w-16 md:h-8 shrink-0">
                                    <Image
                                        src="/assets/images/rupee.png"
                                        alt="Rupee"
                                        width={100}
                                        height={50}
                                        className="object-contain"
                                        priority
                                    />
                                </div>
                                <h2 className="text-3xl md:text-5xl font-bold text-black dark:text-white leading-none whitespace-nowrap tracking-tight">
                                    {user?.wallet_balance !== undefined ? Number(user.wallet_balance).toFixed(2) : "0.00"}
                                </h2>
                            </div>
                            {user?.hold_balance > 0 && (
                                <p className="text-amber-500 dark:text-amber-400 text-[9px] font-bold mt-2 uppercase tracking-wider text-center md:text-left">
                                    Hold: R {Number(user.hold_balance).toFixed(2)}
                                </p>
                            )}
                        </div>
                        <div className="hidden md:flex w-16 h-16 bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/20 rounded-2xl items-center justify-center shadow-inner">
                            <div className="text-blue-600 dark:text-blue-400 text-3xl">
                                <IonIcon name="wallet-outline" />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl shadow-sm dark:border-slate-700 dark:bg-dark2 px-4 sm:px-6 py-8">

                    <div className="flex flex-col sm:flex-row items-center gap-3 mb-6">
                        <div className="text-sm font-bold text-gray-600 dark:text-gray-400 min-w-fit whitespace-nowrap">Referral Invite Link:</div>
                        <div className="flex-1 w-full relative">
                            <input
                                type="text"
                                readOnly
                                value={referralLink || "Generating..."}
                                className="w-full bg-gray-50 border border-gray-200 dark:bg-slate-800 dark:border-slate-700 rounded-lg px-4 py-2 text-xs font-mono text-blue-600 dark:text-blue-400 focus:outline-none"
                            />
                        </div>
                        <button
                            onClick={copyToClipboard}
                            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 7.5V6.108c0-1.135.845-2.098 1.976-2.192.373-.03.748-.057 1.123-.08M15.75 18H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08M15.75 18.75v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5A3.375 3.375 0 006.375 7.5H5.25m11.9-3.664A2.251 2.251 0 0015 2.25h-1.5a2.251 2.251 0 00-2.15 1.586m5.8 0c.065.21.1.433.1.664v.75h-6V4.5c0-.231.035-.454.1-.664M6.75 7.5H4.875c-.621 0-1.125.504-1.125 1.125v12c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V16.5a9 9 0 00-9-9z" />
                            </svg>
                            Copy Link
                        </button>
                    </div>

                    <div className="border-t border-gray-100 dark:border-slate-700 my-6"></div>

                    {/* Tabs */}
                    <div className="relative mb-6">
                        <div className="flex items-center gap-4 md:gap-6 overflow-x-auto border-b border-gray-100 dark:border-slate-700 scrollbar-hide no-scrollbar" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                            {['wallet', 'transactions', 'request', 'referrals'].map((tab) => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={`pb-3 text-xs sm:text-sm font-bold capitalize transition-all border-b-2 whitespace-nowrap min-w-fit shrink-0 ${activeTab === tab
                                        ? 'text-blue-600 border-blue-600'
                                        : 'text-gray-500 border-transparent hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                                        }`}
                                >
                                    {tab === 'wallet' ? 'My Wallet' : tab === 'transactions' ? 'Transactions' : tab === 'request' ? 'Request Money' : 'Referrals'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Tab Content */}
                    <div className="min-h-[300px]">
                        {activeTab === 'wallet' && (
                            <div className="animate-fade-in py-4">
                                <div className="text-center mb-8">
                                    <h4 className="text-xl font-bold text-gray-900 dark:text-white">Coins Management</h4>
                                </div>

                                <div className="space-y-6 max-w-lg mx-auto">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="flex flex-col gap-2">
                                            <label className="text-sm font-bold text-gray-500 uppercase tracking-widest text-center">Amount</label>
                                            <input
                                                type="text"
                                                value={amount}
                                                onChange={(e) => setAmount(e.target.value)}
                                                className="w-full bg-gray-50 border border-gray-200 rounded-full px-4 py-2 text-center font-bold focus:outline-none focus:border-blue-500 dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                                                placeholder="0.00"
                                            />
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            <label className="text-sm font-bold text-gray-500 uppercase tracking-widest text-center">Commission %</label>
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    value={commission}
                                                    onChange={(e) => setCommission(e.target.value)}
                                                    className="w-full bg-gray-50 border border-gray-200 rounded-full px-4 py-2 text-center font-bold focus:outline-none focus:border-blue-500 dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                                                    placeholder="0"
                                                />
                                                <span className="absolute right-6 top-1/2 -translate-y-1/2 text-gray-400 font-bold">%</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="relative flex flex-col gap-2">
                                        <label className="text-sm font-bold text-gray-500 uppercase tracking-widest text-center">Target User (ID or Name)</label>
                                        <input
                                            type="text"
                                            value={targetQuery}
                                            onChange={(e) => setTargetQuery(e.target.value)}
                                            onFocus={() => targetQuery.length >= 2 && setShowSuggestions(true)}
                                            className="w-full bg-gray-50 border border-gray-200 rounded-full px-4 py-2 text-center font-bold focus:outline-none focus:border-blue-500 dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                                            placeholder="UD-XXXX or Username"
                                        />

                                        {/* Search Suggestions Dropdown */}
                                        {showSuggestions && suggestions.length > 0 && (
                                            <div className="absolute z-20 w-full mt-2 top-full bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-2xl shadow-xl overflow-hidden max-h-60 overflow-y-auto">
                                                {suggestions.map((s) => (
                                                    <button
                                                        key={s.id}
                                                        onClick={() => handleSelectUser(s)}
                                                        className="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-white/5 border-b border-gray-100 dark:border-slate-700/50 last:border-0 flex items-center justify-between transition-colors"
                                                    >
                                                        <div>
                                                            <p className="text-gray-900 dark:text-white font-bold text-sm uppercase">{s.username}</p>
                                                            <p className="text-[10px] text-gray-500 font-medium tracking-tight">ID: {s.user_id} • {s.full_name}</p>
                                                        </div>
                                                        <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase ${s.user_type === 'seller' ? 'bg-amber-100 text-amber-600 dark:bg-amber-500/10 dark:text-amber-500' : 'bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400'}`}>
                                                            {s.user_type}
                                                        </span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex gap-4 pt-4 justify-center">
                                        <button
                                            onClick={() => handleTransfer('sell')}
                                            disabled={isProcessing}
                                            className={`flex-1 md:flex-none min-w-[140px] px-10 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-full transition-all active:scale-95 shadow-lg uppercase text-xs tracking-widest ${isProcessing ? 'opacity-50' : ''}`}
                                        >
                                            {isProcessing ? 'Wait...' : 'Sell'}
                                        </button>
                                        <button
                                            onClick={() => handleTransfer('buy')}
                                            disabled={isProcessing}
                                            className={`flex-1 md:flex-none min-w-[140px] px-10 py-3 bg-zinc-800 hover:bg-zinc-900 text-white font-bold rounded-full transition-all active:scale-95 shadow-lg uppercase text-xs tracking-widest ${isProcessing ? 'opacity-50' : ''}`}
                                        >
                                            {isProcessing ? 'Wait...' : 'Buy'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'transactions' && (
                            <div className="animate-fade-in space-y-3 py-4">
                                <p className="font-bold text-gray-900 dark:text-white mb-2 ml-1 text-sm uppercase tracking-wider">Recent Transactions</p>

                                {transactions.length > 0 ? (
                                    transactions.map((tx) => {
                                        const isSent = tx.sender_id === user?.id;
                                        const otherUser = isSent ? tx.receiver_username : tx.sender_username;

                                        return (
                                            <div key={tx.id} className="bg-white dark:bg-slate-800/40 border border-gray-100 dark:border-white/5 rounded-xl p-3 flex items-center gap-3 transition-all hover:bg-gray-50 dark:hover:bg-white/5 shadow-sm">
                                                <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${isSent ? 'bg-red-50 dark:bg-red-500/10 text-red-500' : 'bg-green-50 dark:bg-green-500/10 text-green-500'}`}>
                                                    <IonIcon name={isSent ? 'arrow-up-outline' : 'arrow-down-outline'} className="text-xl" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-center mb-0.5">
                                                        <h5 className="font-bold text-gray-900 dark:text-white truncate text-xs">
                                                            {isSent ? 'Sent To: ' : 'Received From: '}
                                                            <span className="text-blue-500">@{otherUser}</span>
                                                        </h5>
                                                        <span className={`text-[11px] font-bold ${isSent ? 'text-red-500' : 'text-green-600'}`}>
                                                            {isSent ? '-' : '+'} R {parseFloat(tx.amount).toFixed(2)}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <p className="text-[10px] text-gray-500 font-semibold mb-1">
                                                            {new Date(tx.created_at).toLocaleDateString('en-GB')} • {new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </p>
                                                        <span className={`text-[9px] uppercase font-black px-2 py-0.5 rounded bg-gray-100 dark:bg-white/5 ${tx.type === 'transfer' ? 'text-blue-500' : 'text-amber-500'}`}>
                                                            {tx.type === 'transfer' ? 'Transferred' : tx.type}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <p className="text-[10px] text-gray-400 dark:text-gray-500 italic truncate pr-4">
                                                            {tx.note || (isSent ? 'Direct coin transfer' : 'Coins received')}
                                                            {tx.commission_percentage > 0 && ` (${tx.commission_percentage}% comm.)`}
                                                        </p>
                                                        <div className={`flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider ${tx.status === 'accepted' ? 'text-green-500' : 'text-amber-500'}`}>
                                                            <IonIcon name={tx.status === 'accepted' ? 'checkmark-circle' : 'time'} />
                                                            {tx.status}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="py-10 text-center text-gray-500">
                                        <IonIcon name="receipt-outline" className="text-3xl mb-2" />
                                        <p className="text-xs font-bold uppercase tracking-widest">No Transactions Found</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'request' && (
                            <div className="animate-fade-in space-y-4">
                                {pendingRequests.length > 0 ? (
                                    pendingRequests.map((req) => (
                                        <div key={req.id} className="bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700/50 rounded-2xl p-5 shadow-sm">
                                            <div className="flex items-center justify-between gap-4 mb-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center text-lg font-black uppercase">
                                                        {req.sender_username?.charAt(0) || 'R'}
                                                    </div>
                                                    <div>
                                                        <h5 className="font-bold text-gray-900 dark:text-white text-[13px] leading-none mb-1">
                                                            @{req.sender_username} <span className="font-medium text-gray-500">requests</span>
                                                        </h5>
                                                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">{new Date(req.created_at).toLocaleDateString()}</p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-sm font-black text-gray-900 dark:text-white leading-none mb-1">
                                                        R {parseFloat(req.amount).toFixed(2)}
                                                    </div>
                                                    {req.commission_percentage > 0 && (
                                                        <div className="text-[9px] text-green-600 dark:text-green-500 font-bold uppercase">
                                                            {req.commission_percentage}% Comm.
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {req.note && (
                                                <div className="mb-4 p-3 bg-gray-50 dark:bg-slate-900/50 rounded-xl border border-gray-100 dark:border-white/5">
                                                    <p className="text-[11px] text-gray-500 dark:text-gray-400 italic">"{req.note}"</p>
                                                </div>
                                            )}

                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => handleRespond(req.id, 'accept')}
                                                    disabled={isProcessing}
                                                    className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl transition-all active:scale-95 text-[11px] uppercase tracking-wider shadow-md disabled:opacity-50"
                                                >
                                                    Accept & Pay
                                                </button>
                                                <button
                                                    onClick={() => handleRespond(req.id, 'reject')}
                                                    disabled={isProcessing}
                                                    className="flex-1 py-2.5 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-300 font-bold rounded-xl transition-all active:scale-95 text-[11px] uppercase tracking-wider disabled:opacity-50"
                                                >
                                                    Reject
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="py-20 text-center text-gray-500 dark:text-gray-400">
                                        <div className="w-16 h-16 bg-gray-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-100 dark:border-white/5">
                                            <IonIcon name="alert-circle-outline" className="text-3xl" />
                                        </div>
                                        <p className="font-bold uppercase tracking-widest text-[10px]">No Money Requests Found</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'referrals' && (
                            <div className="animate-fade-in py-4">
                                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-6 px-1">
                                    <h4 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider text-center sm:text-left">Join Persons List</h4>
                                    <span className="bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-4 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap">
                                        {referrals.length} Total Referred
                                    </span>
                                </div>

                                <div className="space-y-3">
                                    {referrals.length > 0 ? (
                                        <>
                                            {(() => {
                                                const itemsPerPage = 3;
                                                const totalPages = Math.ceil(referrals.length / itemsPerPage);
                                                const startIndex = (currentPage - 1) * itemsPerPage;
                                                const currentItems = referrals.slice(startIndex, startIndex + itemsPerPage);

                                                return (
                                                    <>
                                                        {currentItems.map((ref) => (
                                                            <div key={ref.id} className="p-3 flex flex-row items-center justify-between bg-white dark:bg-slate-800/40 border border-gray-100 dark:border-white/5 rounded-xl hover:bg-gray-50 dark:hover:bg-white/5 transition-all shadow-sm gap-2">
                                                                <div className="flex items-center gap-3 min-w-0">
                                                                    <div className="shrink-0 w-9 h-9 rounded-full bg-blue-100 dark:bg-slate-700/60 flex items-center justify-center text-blue-600 dark:text-blue-200 font-bold text-sm">
                                                                        {ref.fullName?.charAt(0) || 'U'}
                                                                    </div>
                                                                    <div className="min-w-0">
                                                                        <div className="text-sm font-bold text-black dark:text-white truncate">{ref.fullName}</div>
                                                                        <div className="text-[11px] text-blue-600 font-medium truncate">@{ref.username}</div>
                                                                    </div>
                                                                </div>
                                                                <div className="text-right shrink-0">
                                                                    <p className="text-[9px] text-gray-400 uppercase font-black tracking-tighter">Member Joined</p>
                                                                    <p className="text-[11px] text-gray-600 dark:text-gray-300 font-bold">{ref.date}</p>
                                                                </div>
                                                            </div>
                                                        ))}

                                                        {/* Pagination Controls */}
                                                        {totalPages > 1 && (
                                                            <div className="flex items-center justify-center gap-4 mt-8 pt-4 border-t border-gray-100 dark:border-slate-700">
                                                                <button
                                                                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                                                    disabled={currentPage === 1}
                                                                    className="px-4 py-2 text-sm font-bold bg-transparent border border-gray-200 dark:border-slate-700 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-white/5 transition-colors text-gray-700 dark:text-gray-300"
                                                                >
                                                                    Previous
                                                                </button>
                                                                <div className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                                                                    Page {currentPage} of {totalPages}
                                                                </div>
                                                                <button
                                                                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                                                    disabled={currentPage === totalPages}
                                                                    className="px-4 py-2 text-sm font-bold bg-transparent border border-gray-200 dark:border-slate-700 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-white/5 transition-colors text-gray-700 dark:text-gray-300"
                                                                >
                                                                    Next
                                                                </button>
                                                            </div>
                                                        )}
                                                    </>
                                                );
                                            })()}
                                        </>
                                    ) : (
                                        <div className="py-12 text-center text-gray-500 dark:text-gray-400">
                                            <IonIcon name="people-outline" className="text-4xl mb-2" />
                                            <p>No persons joined yet.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            {/* Spacer for mobile bottom bar */}
            <div className="h-20 md:hidden"></div>
        </div>
    );
}
