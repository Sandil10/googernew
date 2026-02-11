"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authService } from '../../../../services/authService';
import { walletService } from '../../../../services/walletService';
import Link from 'next/link';
import Image from 'next/image';
import IonIcon from '../../../components/IonIcon';
import ConfirmTransferModal from '../../../../components/ConfirmTransferModal';

export default function MyWallet() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('wallet');
    const [user, setUser] = useState<any>(null);
    const [referralLink, setReferralLink] = useState("");
    const [referrals, setReferrals] = useState<any[]>([]);
    const [amount, setAmount] = useState("");
    const [commission, setCommission] = useState("");
    const [targetQuery, setTargetQuery] = useState("");
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [selectedUser, setSelectedUser] = useState<any>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [pendingRequests, setPendingRequests] = useState<any[]>([]);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [confirmAction, setConfirmAction] = useState<{ type: 'sell' | 'buy', user: any } | null>(null);

    const fetchAllData = async () => {
        try {
            // Fetch Profile for Referral Code
            const profile = await authService.getProfile();
            setUser(profile);

            // Fetch Wallet/Referrals Data
            const walletData = await authService.getWallet();
            if (walletData.success) {
                setReferrals(walletData.referrals || []);
            }

            // Fetch Transactions
            const txData = await walletService.getTransactionHistory();
            setTransactions(txData);

            // Fetch Pending Requests
            const requests = await walletService.getPendingRequests();
            setPendingRequests(requests);

            const origin = typeof window !== 'undefined' ? window.location.origin : '';
            const link = `${origin}/register?ref=${profile.referral_code || profile.username}`;
            setReferralLink(link);

        } catch (error) {
            console.error("Error fetching wallet data:", error);
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

        const debounceTimer = setTimeout(searchUsers, 500);
        return () => clearTimeout(debounceTimer);
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
        } catch (error: any) {
            alert(error.message || "Failed to process transfer");
        } finally {
            setIsProcessing(false);
        }
    };

    const copyToClipboard = () => {
        if (!referralLink) return;
        navigator.clipboard.writeText(referralLink);
    };

    if (loading) {
        return (
            <div className="pb-10 relative min-h-screen animate-pulse">
                <div className="mb-6">
                    <div className="w-16 h-8 bg-gray-800 rounded-full"></div>
                </div>
                <div className="h-24 bg-[#162033] border border-gray-800 rounded-xl mb-6"></div>
                <div className="h-48 bg-[#162033] border border-gray-800 rounded-xl"></div>
            </div>
        );
    }

    return (
        <div className="pb-10 relative min-h-screen">
            {/* Top Back Navigation */}
            <div className="mb-4">
                <button
                    onClick={() => router.back()}
                    className="flex items-center gap-2 text-white/60 hover:text-white transition-colors"
                >
                    <IonIcon name="chevron-back-outline" className="text-xl" />
                    <span className="text-[11px] font-bold uppercase tracking-widest">Back</span>
                </button>
            </div>

            <h1 className="text-2xl font-bold mb-6 text-white tracking-tight">My Wallet</h1>

            {/* Total Balance Card */}
            <div className="bg-[#162033] border border-gray-800 rounded-2xl p-6 md:p-8 mb-8 shadow-lg relative overflow-hidden transition-all hover:border-gray-700">
                <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500/5 rounded-full blur-3xl"></div>
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <p className="text-gray-400 text-[10px] font-bold mb-3 uppercase tracking-widest">Available Balance</p>
                        <div className="flex flex-row items-baseline gap-3 flex-nowrap overflow-visible">
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
                            <h2 className="text-3xl md:text-5xl font-bold text-white leading-none whitespace-nowrap tracking-tight">
                                {user?.wallet_balance !== undefined ? Number(user.wallet_balance).toFixed(2) : "0.00"}
                            </h2>
                        </div>
                        {user?.hold_balance > 0 && (
                            <p className="text-amber-400 text-[9px] font-bold mt-2 uppercase tracking-wider">
                                Hold: R {Number(user.hold_balance).toFixed(2)}
                            </p>
                        )}
                    </div>
                    <div className="w-12 h-12 md:w-16 md:h-16 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center">
                        <IonIcon name="wallet-outline" className="text-2xl md:text-3xl text-white" />
                    </div>
                </div>
            </div>

            {/* User ID Card */}
            <div className="bg-[#162033] border border-gray-800 rounded-xl p-4 mb-6 text-center shadow-lg">
                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">User ID Account</p>
                <h3 className="font-bold text-xl text-white tracking-wider">{user?.user_id || "..."}</h3>
            </div>

            {/* Referral Link Card */}
            <div className="bg-[#162033] border border-gray-800 rounded-xl p-6 mb-8 shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl"></div>
                <h3 className="text-xs font-bold text-white mb-4 uppercase tracking-wider flex items-center gap-2">
                    <IonIcon name="share-social-outline" className="text-blue-400" />
                    Referral Invite Link
                </h3>
                <div className="flex flex-col md:flex-row gap-4">
                    <input
                        type="text"
                        readOnly
                        value={referralLink || "Generating..."}
                        className="flex-1 bg-[#0d1421] border border-gray-800 rounded-xl px-4 py-3 text-xs font-mono text-blue-400 focus:outline-none shadow-inner"
                    />
                    <button
                        onClick={copyToClipboard}
                        className="px-6 py-3 bg-zinc-800/80 hover:bg-zinc-800 text-white font-bold rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 shadow-md group"
                    >
                        <IonIcon name="copy-outline" className="text-lg group-hover:scale-105 transition-transform" />
                        <span className="text-xs uppercase tracking-wide">Copy Link</span>
                    </button>
                </div>
            </div>

            {/* Tabs & Main Card */}
            <div className="bg-[#162033] border border-gray-800 rounded-2xl overflow-hidden mb-20 shadow-lg">
                <div className="border-b border-gray-800 px-6">
                    <div className="flex gap-6 overflow-x-auto scrollbar-hide">
                        {['wallet', 'transactions', 'request', 'referrals'].map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`pb-3 pt-4 text-[13px] font-bold transition-all border-b-2 whitespace-nowrap tracking-wide ${activeTab === tab
                                    ? 'text-white border-white'
                                    : 'text-gray-500 border-transparent hover:text-gray-300'
                                    }`}
                            >
                                {tab === 'wallet' ? 'Manage' : tab === 'transactions' ? 'History' : tab === 'request' ? 'Requests' : 'Referrals'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Tab Content */}
                <div className="p-6 md:p-8 min-h-[400px]">
                    {activeTab === 'wallet' && (
                        <div className="max-w-md mx-auto py-2">
                            <h4 className="text-lg font-bold text-white mb-8 text-center uppercase tracking-tight">Coins Management</h4>

                            <div className="space-y-6">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-center text-gray-400 font-bold text-[10px] uppercase tracking-widest mb-3">Enter Amount</label>
                                        <input
                                            type="text"
                                            value={amount}
                                            onChange={(e) => setAmount(e.target.value)}
                                            className="w-full bg-[#0d1421] border border-gray-800 rounded-xl px-4 py-3 text-white text-center text-lg font-bold focus:outline-none shadow-inner"
                                            placeholder="0.00"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-center text-gray-400 font-bold text-[10px] uppercase tracking-widest mb-3">Commission %</label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                value={commission}
                                                onChange={(e) => setCommission(e.target.value)}
                                                className="w-full bg-[#0d1421] border border-gray-800 rounded-xl px-4 py-3 text-white text-center text-lg font-bold focus:outline-none shadow-inner"
                                                placeholder="0"
                                            />
                                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">%</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="relative">
                                    <label className="block text-center text-gray-400 font-bold text-[10px] uppercase tracking-widest mb-3">Target User (ID or Name)</label>
                                    <input
                                        type="text"
                                        value={targetQuery}
                                        onChange={(e) => setTargetQuery(e.target.value)}
                                        onFocus={() => targetQuery.length >= 2 && setShowSuggestions(true)}
                                        className="w-full bg-[#0d1421] border border-gray-800 rounded-xl px-4 py-3 text-white text-center text-lg font-bold focus:outline-none shadow-inner"
                                        placeholder="Type User ID or Name"
                                    />

                                    {/* Search Suggestions Dropdown */}
                                    {showSuggestions && suggestions.length > 0 && (
                                        <div className="absolute z-20 w-full mt-2 bg-[#1c2841] border border-gray-700 rounded-xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto">
                                            {suggestions.map((s) => (
                                                <button
                                                    key={s.id}
                                                    onClick={() => handleSelectUser(s)}
                                                    className="w-full px-4 py-3 text-left hover:bg-white/5 border-b border-gray-800/50 last:border-0 flex items-center justify-between transition-colors"
                                                >
                                                    <div>
                                                        <p className="text-white font-bold text-sm uppercase">{s.username}</p>
                                                        <p className="text-[10px] text-gray-400 font-medium">ID: {s.user_id} • {s.full_name}</p>
                                                    </div>
                                                    <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase ${s.user_type === 'seller' ? 'bg-amber-500/10 text-amber-500' : 'bg-blue-500/10 text-blue-400'}`}>
                                                        {s.user_type}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="flex gap-4 pt-4">
                                    <button
                                        onClick={() => handleTransfer('sell')}
                                        disabled={isProcessing}
                                        className={`flex-1 py-3.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-full transition-all active:scale-95 shadow-md text-xs uppercase tracking-widest ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        {isProcessing ? 'Processing...' : 'Sell Coins'}
                                    </button>
                                    <button
                                        onClick={() => handleTransfer('buy')}
                                        disabled={isProcessing}
                                        className={`flex-1 py-3.5 bg-zinc-800/80 hover:bg-zinc-800 text-white font-bold rounded-full transition-all active:scale-95 shadow-md text-xs uppercase tracking-widest ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        {isProcessing ? 'Processing...' : 'Buy Coins'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'transactions' && (
                        <div className="space-y-3">
                            <p className="font-bold text-white mb-5 text-xs uppercase tracking-widest flex items-center gap-2">
                                <IonIcon name="time-outline" className="text-base text-blue-400" />
                                Recent Activity
                            </p>

                            {transactions.length > 0 ? (
                                transactions.map((tx) => {
                                    const isSent = tx.sender_id === user?.id;
                                    const otherUser = isSent ? tx.receiver_username : tx.sender_username;

                                    return (
                                        <div key={tx.id} className="bg-gray-800/20 border border-gray-800 rounded-xl p-4 hover:bg-gray-800/40 transition-all group">
                                            <div className="flex items-center gap-4">
                                                <div className={`w-12 h-12 ${isSent ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'} rounded-xl flex items-center justify-center text-xl shrink-0`}>
                                                    <IonIcon name={isSent ? 'arrow-up-outline' : 'arrow-down-outline'} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-center mb-0.5">
                                                        <h5 className="font-bold text-white text-sm">
                                                            {isSent ? 'Sent To: ' : 'Received From: '}
                                                            <span className="text-blue-400">@{otherUser}</span>
                                                        </h5>
                                                        <span className={`text-sm font-bold tracking-tight ${isSent ? 'text-red-400' : 'text-green-400'}`}>
                                                            {isSent ? '-' : '+'} R {parseFloat(tx.amount).toFixed(2)}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <p className="text-[10px] text-gray-400 font-semibold mb-1">
                                                            {new Date(tx.created_at).toLocaleDateString('en-GB')} • {new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </p>
                                                        <span className={`text-[9px] uppercase font-black px-2 py-1 rounded-md bg-gray-900/50 ${tx.type === 'transfer' ? 'text-blue-400' : 'text-amber-400'}`}>
                                                            {tx.type === 'transfer' ? 'Transferred' : tx.type}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <p className="text-[10px] text-gray-500 font-medium italic">
                                                            {tx.note || (isSent ? 'Direct coin transfer' : 'Coins received')}
                                                            {tx.commission_percentage > 0 && ` (Incl. ${tx.commission_percentage}% commission)`}
                                                        </p>
                                                        <span className={`text-[9px] uppercase font-bold text-gray-500`}>
                                                            Status: {tx.status}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="py-20 text-center">
                                    <IonIcon name="receipt-outline" className="text-3xl text-gray-700 mb-4" />
                                    <p className="text-gray-500 font-bold uppercase tracking-widest text-[10px]">No recent activity Found</p>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'request' && (
                        <div className="space-y-4">
                            {pendingRequests.length > 0 ? (
                                pendingRequests.map((req) => (
                                    <div key={req.id} className="bg-gray-800/20 border border-gray-800 rounded-2xl p-5 hover:bg-gray-800/40 transition-all shadow-lg">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 bg-blue-500/10 text-blue-400 rounded-xl flex items-center justify-center text-xl shrink-0 border border-blue-500/20 uppercase font-black">
                                                    {req.sender_username?.charAt(0) || 'R'}
                                                </div>
                                                <div className="min-w-0">
                                                    <h5 className="font-bold text-white text-sm tracking-tight mb-0.5">
                                                        Request from <span className="text-blue-400">@{req.sender_username}</span>
                                                    </h5>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{new Date(req.created_at).toLocaleDateString()}</span>
                                                        <span className="w-1 h-1 bg-gray-700 rounded-full"></span>
                                                        <span className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">Pending Payment</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-left sm:text-right px-1">
                                                <div className="text-lg font-black text-white tracking-tighter mb-1">
                                                    R {parseFloat(req.amount).toFixed(2)}
                                                </div>
                                                {req.commission_percentage > 0 && (
                                                    <div className="text-[9px] text-gray-500 font-black uppercase tracking-widest leading-none">
                                                        Incl. {req.commission_percentage}% Commission
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {req.note && (
                                            <div className="mt-4 p-3 bg-[#0d1421] rounded-xl border border-gray-800">
                                                <p className="text-[10px] text-gray-400 font-medium italic">"{req.note}"</p>
                                            </div>
                                        )}

                                        <div className="flex gap-3 mt-5">
                                            <button
                                                onClick={() => handleRespond(req.id, 'accept')}
                                                disabled={isProcessing}
                                                className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl transition-all active:scale-95 shadow-lg text-[10px] uppercase tracking-widest disabled:opacity-50"
                                            >
                                                Accept & Pay
                                            </button>
                                            <button
                                                onClick={() => handleRespond(req.id, 'reject')}
                                                disabled={isProcessing}
                                                className="flex-1 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl transition-all active:scale-95 text-[10px] uppercase tracking-widest disabled:opacity-50 border border-white/5"
                                            >
                                                Reject
                                            </button>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="py-20 text-center">
                                    <div className="w-16 h-16 bg-gray-800/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-800/40">
                                        <IonIcon name="alert-circle-outline" className="text-2xl text-gray-600" />
                                    </div>
                                    <p className="text-gray-500 font-bold uppercase tracking-widest text-[10px]">No Pending Requests Found</p>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'referrals' && (
                        <div>
                            <div className="flex items-center justify-between mb-6">
                                <h4 className="text-[10px] font-bold text-white uppercase tracking-widest">Network Statistics</h4>
                                <span className="bg-blue-500/10 text-blue-400 px-4 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-widest border border-blue-500/20">
                                    {referrals.length} Total Referred
                                </span>
                            </div>

                            {referrals.length > 0 ? (
                                <div className="space-y-3">
                                    {referrals.map((ref, idx) => (
                                        <div key={idx} className="bg-gray-800/20 border border-gray-800 rounded-xl p-4 hover:bg-gray-800/40 transition-all group">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="relative w-10 h-10 rounded-lg overflow-hidden border border-white/5 bg-gray-800 shrink-0">
                                                        <div className="w-full h-full flex items-center justify-center text-blue-400 font-bold text-sm bg-blue-500/5 uppercase">
                                                            {ref.referred_full_name?.charAt(0) || 'U'}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="text-xs font-bold text-white uppercase tracking-wider">{ref.referred_full_name}</div>
                                                        <div className="text-[9px] text-gray-500 font-semibold uppercase tracking-widest">@{ref.referred_username}</div>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">Joined {new Date(ref.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</p>
                                                    <p className="text-[9px] text-gray-500 font-medium">+ R {ref.amount}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="py-20 text-center">
                                    <IonIcon name="people-outline" className="text-3xl text-gray-700 mb-4" />
                                    <p className="text-gray-500 font-bold uppercase tracking-widest text-[10px]">No active referrals found</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Spacer for mobile bottom bar */}
            <div className="h-20 md:hidden"></div>
        </div>
    );
}
