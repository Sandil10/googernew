"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authService } from '@/services/authService';
import { walletService } from '@/services/walletService';
import Link from 'next/link';
import Image from 'next/image';
import IonIcon from '@/app/components/IonIcon';
import ConfirmTransferModal from '@/app/components/ConfirmTransferModal';
import SecurityVerificationModal from '@/app/components/SecurityVerificationModal';
import ReceiptModal from '@/app/components/ReceiptModal';
import { generateTransactionReceipt } from '@/utils/pdfGenerator';

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
    const [showSecurityModal, setShowSecurityModal] = useState(false);
    const [securityAction, setSecurityAction] = useState<any>(null);
    const [showReceiptModal, setShowReceiptModal] = useState(false);
    const [receiptTransaction, setReceiptTransaction] = useState<any>(null);
    const [hasShownAutoReceipt, setHasShownAutoReceipt] = useState<{ history: boolean, request: boolean }>({ history: false, request: false });

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

    // Handle Auto-show Receipt
    useEffect(() => {
        if (activeTab === 'transactions' && !hasShownAutoReceipt.history && transactions.length > 0) {
            setReceiptTransaction(transactions[0]);
            setShowReceiptModal(true);
            setHasShownAutoReceipt(prev => ({ ...prev, history: true }));
        } else if (activeTab === 'request' && !hasShownAutoReceipt.request && pendingRequests.length > 0) {
            // Check if user has any pending requests sent by them (optional interpretation)
            // For now, just show the most recent completed or pending one? 
            // The requirement says "When a user opens History or Requests, the receipt popup must appear first."
            setReceiptTransaction(transactions[0]);
            setShowReceiptModal(true);
            setHasShownAutoReceipt(prev => ({ ...prev, request: true }));
        }
    }, [activeTab, transactions, pendingRequests]);

    const handleCancelTransaction = async (txId: number) => {
        if (!confirm("Are you sure you want to cancel this transaction?")) return;
        setIsProcessing(true);
        try {
            await walletService.cancelTransaction(txId);
            alert("Transaction cancelled successfully");
            await fetchAllData();
        } catch (error: any) {
            alert(error.message || "Failed to cancel transaction");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleRespond = (requestId: number, action: 'accept' | 'reject') => {
        if (action === 'reject') {
            handleRespondInternal(requestId, action);
            return;
        }
        const request = pendingRequests.find(r => r.id === requestId);
        setSecurityAction({
            type: 'respond',
            requestId,
            action,
            transaction: {
                type: 'Pay',
                amount: parseFloat(request?.amount || 0).toFixed(2),
                discount: request?.commission_percentage || 0,
                recipient: `@${request?.sender_username || 'User'}`
            }
        });
        setShowSecurityModal(true);
    };

    const handleRespondInternal = async (requestId: number, action: 'accept' | 'reject') => {
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

    const handleTransfer = (type: 'sell' | 'buy') => {
        if (!selectedUser || !amount) {
            alert("Please select a user and enter amount");
            return;
        }
        setSecurityAction({
            type: 'transfer',
            transferType: type,
            transaction: {
                type: type === 'sell' ? 'Send' : 'Request',
                amount: amount,
                discount: commission || 0,
                recipient: `@${selectedUser.username} (${selectedUser.user_id})`
            }
        });
        setShowSecurityModal(true);
    };

    const executeVerifiedTransfer = async (password: string) => {
        if (!securityAction) return;

        setIsProcessing(true);
        try {
            // 1. Verify Password First
            await authService.verifyPassword(password);

            // 2. If verified, proceed
            if (securityAction.type === 'transfer') {
                const requestType = securityAction.transferType === 'sell' ? 'sell' : 'request';

                const res = await walletService.requestMoney(
                    selectedUser.id,
                    parseFloat(amount),
                    "",
                    commission ? parseFloat(commission) : 0,
                    requestType
                );

                if (res.success) {
                    const successMsg = res.message || (securityAction.transferType === 'sell'
                        ? `Money transfer sent to ${selectedUser.username}. Amount is on hold until they accept.`
                        : `Money request sent to ${selectedUser.username}. They will pay if they accept.`);

                    alert(successMsg);

                    // Refresh data
                    await fetchAllData();

                    setAmount("");
                    setCommission("");
                    setTargetQuery("");
                    setSelectedUser(null);

                    // Show receipt immediately after transaction
                    if (res.transaction) {
                        setReceiptTransaction(res.transaction);
                        setShowReceiptModal(true);
                    } else {
                        // If backend doesn't return the tx object, try to find it in refreshed data
                        const updatedData = await walletService.getTransactionHistory();
                        if (updatedData && updatedData.length > 0) {
                            setReceiptTransaction(updatedData[0]);
                            setShowReceiptModal(true);
                        }
                    }
                }
            } else if (securityAction.type === 'respond') {
                const res = await walletService.respondToRequest(securityAction.requestId, securityAction.action);
                if (res.success) {
                    alert(`Request ${securityAction.action}ed successfully`);
                    await fetchAllData();
                }
            }

            setShowSecurityModal(false);
            setSecurityAction(null);

        } catch (error: any) {
            // Error handling for password or transfer
            throw error; // Re-throw so modal can show the error
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

            {/* Googer ID Header */}
            <div className="bg-white rounded-xl p-4 mb-6 shadow-sm flex flex-col items-center justify-center gap-1">
                <h1 className="text-black font-bold text-lg text-center tracking-wide">( My Googer ID - {user?.user_id || user?.googer_id || user?.username || "..."} )</h1>
            </div>

            {/* Total Balance Card */}
            <div className="bg-[#162033] border border-gray-800 rounded-2xl p-6 md:p-8 mb-8 shadow-lg relative overflow-hidden transition-all hover:border-gray-700 flex flex-col items-center justify-center text-center">
                <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500/5 rounded-full blur-3xl"></div>
                <div className="relative z-10 flex flex-col items-center w-full">
                    <h2 className="text-lg md:text-xl font-bold text-white mb-4 tracking-wide">My total Ruppier Coins balance</h2>

                    <div className="flex flex-row items-baseline gap-3 justify-center mb-2">
                        <div className="relative w-12 h-6 md:w-16 md:h-10 shrink-0">
                            <Image
                                src="/assets/images/rupee.png"
                                alt="Rupee"
                                width={100}
                                height={50}
                                className="object-contain"
                                priority
                            />
                        </div>
                        <h2 className="text-3xl md:text-5xl font-bold text-white tracking-tight leading-none whitespace-nowrap">
                            {user?.wallet_balance !== undefined ? Number(user.wallet_balance).toFixed(2) : "0.00"}
                        </h2>
                    </div>
                    {user?.hold_balance > 0 && (
                        <p className="text-amber-400 text-[9px] font-bold mt-2 uppercase tracking-wider">
                            Hold: R {Number(user.hold_balance).toFixed(2)}
                        </p>
                    )}
                </div>
            </div>



            {/* Tabs & Main Card */}
            <div className="bg-[#162033] border border-gray-800 rounded-2xl overflow-hidden mb-20 shadow-lg">
                <div className="border-b border-gray-800 px-6">
                    <div className="flex gap-6 overflow-x-auto scrollbar-hide">
                        {['wallet', 'transactions', 'request', 'referrals', 'rewards'].map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`pb-3 pt-4 text-[13px] font-bold transition-all border-b-2 whitespace-nowrap tracking-wide ${activeTab === tab
                                    ? 'text-white border-white'
                                    : 'text-gray-500 border-transparent hover:text-gray-300'
                                    }`}
                            >
                                {tab === 'wallet' ? 'Manage' : tab === 'transactions' ? 'History' : tab === 'request' ? 'Requests' : tab === 'referrals' ? 'Referrals' : 'Rewards'}
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
                                        <label className="block text-center text-gray-400 font-bold text-[10px] uppercase tracking-widest mb-3">Discount %</label>
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
                                        onClick={() => handleTransfer('buy')}
                                        disabled={isProcessing}
                                        className={`flex-1 py-3.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-full transition-all active:scale-95 shadow-md text-xs uppercase tracking-widest ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        {isProcessing ? 'Processing...' : 'Buy'}
                                    </button>
                                    <button
                                        onClick={() => handleTransfer('sell')}
                                        disabled={isProcessing}
                                        className={`flex-1 py-3.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-full transition-all active:scale-95 shadow-md text-xs uppercase tracking-widest ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        {isProcessing ? 'Processing...' : 'Sell'}
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
                                    const isCancellable = isSent && tx.status === 'pending';

                                    return (
                                        <div key={tx.id} className="bg-gray-800/20 border border-gray-800 rounded-xl p-4 hover:bg-gray-800/40 transition-all group">
                                            <div className="flex items-center gap-4">
                                                <div className={`w-12 h-12 ${isSent ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'} rounded-xl flex items-center justify-center text-xl shrink-0`}>
                                                    <IonIcon name={tx.type === 'request' ? 'paper-plane-outline' : (isSent ? 'arrow-up-outline' : 'arrow-down-outline')} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-center mb-0.5">
                                                        <h5 className="font-bold text-white text-sm">
                                                            {tx.type === 'request' ? (isSent ? 'Requested From: ' : 'Requested By: ') : (isSent ? 'Sent To: ' : 'Received From: ')}
                                                            <span className="text-blue-400">@{otherUser}</span>
                                                        </h5>
                                                        <span className={`text-sm font-bold tracking-tight ${isSent ? 'text-red-400' : 'text-green-400'}`}>
                                                            {isSent ? (tx.type === 'request' ? '' : '-') : '+'} R {parseFloat(tx.amount).toFixed(2)}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <p className="text-[10px] text-gray-400 font-semibold mb-1">
                                                            {new Date(tx.created_at).toLocaleDateString('en-GB')} • {new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </p>
                                                        <span className={`text-[9px] uppercase font-black px-2 py-1 rounded-md bg-gray-900/50 ${tx.type === 'transfer' ? 'text-blue-400' : tx.type === 'request' ? 'text-purple-400' : 'text-amber-400'}`}>
                                                            {tx.type === 'transfer' ? 'Transferred' : tx.type === 'request' ? 'Requested' : tx.type}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <p className="text-[10px] text-gray-500 font-medium italic">
                                                            {tx.note || (isSent ? (tx.type === 'request' ? 'Coin Request Sent' : 'Direct coin transfer') : 'Coins received')}
                                                            {tx.commission_percentage > 0 && ` (Incl. ${tx.commission_percentage}% discount)`}
                                                        </p>
                                                        <div className="flex items-center gap-2">
                                                            <span className={`text-[9px] uppercase font-bold ${tx.status === 'completed' ? 'text-green-500' : 'text-amber-500'}`}>
                                                                {tx.status}
                                                            </span>
                                                            {isCancellable && (
                                                                <button
                                                                    onClick={() => handleCancelTransaction(tx.id)}
                                                                    className="text-[9px] font-black text-red-500 uppercase tracking-widest bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20 hover:bg-red-500 hover:text-white transition-all"
                                                                >
                                                                    Cancel
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        setReceiptTransaction(tx);
                                                        setShowReceiptModal(true);
                                                    }}
                                                    className="w-10 h-10 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center text-gray-400 hover:text-white hover:bg-blue-600 transition-all active:scale-90"
                                                    title="View Receipt"
                                                >
                                                    <IonIcon name="receipt-outline" className="text-xl" />
                                                </button>
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
                                                        Incl. {req.commission_percentage}% Discount
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

                    {activeTab === 'rewards' && (
                        <div className="flex flex-col items-center justify-center py-10 text-center">
                            <div className="w-20 h-20 bg-purple-500/10 rounded-full flex items-center justify-center mb-6 animate-pulse">
                                <IonIcon name="gift-outline" className="text-4xl text-purple-400" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-2">Rewards Center</h3>
                            <p className="text-gray-400 text-sm max-w-xs mb-8">
                                Check back soon for exclusive rewards and bonuses!
                            </p>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-sm px-4">
                                <button
                                    onClick={() => router.push('/dashboard/rewards')}
                                    className="px-4 py-4 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl transition-all active:scale-95 shadow-md border border-white/5 text-[10px] uppercase tracking-widest flex items-center justify-center gap-2"
                                >
                                    <IonIcon name="ribbon-outline" className="text-lg text-amber-500" />
                                    Rewards Page
                                </button>
                                <button
                                    onClick={() => router.push('/dashboard/wallet/affiliate')}
                                    className="px-4 py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all active:scale-95 shadow-md shadow-blue-600/20 text-[10px] uppercase tracking-widest flex items-center justify-center gap-2"
                                >
                                    <IonIcon name="people-outline" className="text-lg" />
                                    Affiliate
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Permanent Recent Transactions Section (Visible on all tabs EXCEPT History) */}
                {activeTab !== 'transactions' && (
                    <div className="border-t border-gray-800 p-6 md:p-8 bg-black/10">
                        <div className="flex items-center justify-between mb-4">
                            <h4 className="text-[10px] font-black text-white uppercase tracking-[0.2em] flex items-center gap-2">
                                <IonIcon name="time" className="text-blue-400" />
                                Recent Transactions
                            </h4>
                            <button
                                onClick={() => setActiveTab('transactions')}
                                className="text-[9px] text-blue-400 font-bold uppercase tracking-widest hover:underline"
                            >
                                View All History
                            </button>
                        </div>

                        <div className="space-y-2">
                            {transactions.slice(0, 3).length > 0 ? (
                                transactions.slice(0, 3).map((tx) => {
                                    const isSent = tx.sender_id === user?.id;
                                    return (
                                        <div key={tx.id} className="flex items-center justify-between p-3 bg-[#0d1421] rounded-xl border border-gray-800/50 hover:border-gray-700 transition-all">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${isSent ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
                                                    <IonIcon name={isSent ? 'arrow-up-outline' : 'arrow-down-outline'} />
                                                </div>
                                                <div className="text-left">
                                                    <p className="text-[10px] font-bold text-white truncate max-w-[120px]">
                                                        @{isSent ? tx.receiver_username : tx.sender_username}
                                                    </p>
                                                    <p className="text-[8px] text-gray-500 font-medium">{new Date(tx.created_at).toLocaleDateString()}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <p className={`text-[10px] font-black tracking-tight ${isSent ? 'text-red-400' : 'text-green-400'}`}>
                                                    {isSent ? '-' : '+'} R {parseFloat(tx.amount).toFixed(2)}
                                                </p>
                                                <button
                                                    onClick={() => {
                                                        setReceiptTransaction(tx);
                                                        setShowReceiptModal(true);
                                                    }}
                                                    className="p-1 hover:text-blue-400 transition-colors"
                                                >
                                                    <IonIcon name="receipt-outline" className="text-xs" />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="flex flex-col items-center justify-center py-4 opacity-30">
                                    <p className="text-[8px] font-black uppercase tracking-widest text-gray-500">No Recent Activity</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Spacer for mobile bottom bar */}
            <div className="h-20 md:hidden"></div>

            {/* Security Verification Modal */}
            <SecurityVerificationModal
                isOpen={showSecurityModal}
                onClose={() => {
                    setShowSecurityModal(false);
                    setSecurityAction(null);
                }}
                onVerify={executeVerifiedTransfer}
                isProcessing={isProcessing}
                transaction={securityAction?.transaction}
            />
            {/* Receipt Modal */}
            <ReceiptModal
                isOpen={showReceiptModal}
                onClose={() => setShowReceiptModal(false)}
                transaction={receiptTransaction}
                currentUser={user}
            />
        </div>
    );
}
