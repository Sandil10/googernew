"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { walletService } from "@/services/walletService";
import { authService } from "@/services/authService";
import IonIcon from "@/app/components/IonIcon";
import { useRouter } from "next/navigation";
import SecurityVerificationModal from "@/app/components/SecurityVerificationModal";

export default function CoinsManagementPage() {
    const router = useRouter();
    const [amount, setAmount] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [selectedUser, setSelectedUser] = useState<any>(null);
    const [note, setNote] = useState("");
    const [loading, setLoading] = useState(false);
    const [pendingRequests, setPendingRequests] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [balance, setBalance] = useState<number>(0);
    const [showSecurityModal, setShowSecurityModal] = useState(false);
    const [securityAction, setSecurityAction] = useState<any>(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const profile = await authService.getProfile();
            setBalance(parseFloat(profile.wallet_balance) || 0);

            const requests = await walletService.getPendingRequests();
            setPendingRequests(requests);
        } catch (error) {
            console.error("Error fetching data:", error);
        }
    };

    useEffect(() => {
        const delayDebounceFn = setTimeout(async () => {
            if (searchQuery.length >= 2) {
                setIsSearching(true);
                try {
                    const users = await walletService.searchUsers(searchQuery);
                    setSearchResults(users);
                } catch (error) {
                    console.error("Search error:", error);
                } finally {
                    setIsSearching(false);
                }
            } else {
                setSearchResults([]);
            }
        }, 500);

        return () => clearTimeout(delayDebounceFn);
    }, [searchQuery]);

    const [transferType, setTransferType] = useState<'transfer' | 'request'>('transfer');

    const handleAction = () => {
        if (!selectedUser || !amount || parseFloat(amount) <= 0) {
            alert("Please select a user and enter a valid amount");
            return;
        }
        setSecurityAction({
            type: 'initiate',
            transferType: transferType,
            transaction: {
                type: transferType === 'transfer' ? 'Send' : 'Request',
                amount: amount,
                discount: 0,
                recipient: `@${selectedUser.username} (${selectedUser.user_id})`
            }
        });
        setShowSecurityModal(true);
    };

    const executeVerifiedAction = async (password: string) => {
        setLoading(true);
        try {
            // 1. Verify Password
            await authService.verifyPassword(password);

            // 2. Execute Action
            if (securityAction.type === 'initiate') {
                if (securityAction.transferType === 'transfer') {
                    if (parseFloat(amount) > balance) {
                        alert("Insufficient balance for direct transfer");
                        setLoading(false);
                        setShowSecurityModal(false);
                        return;
                    }
                    await walletService.directTransfer(selectedUser.id, parseFloat(amount), note);
                    alert("Transfer successful!");
                } else {
                    await walletService.requestMoney(selectedUser.id, parseFloat(amount), note);
                    alert("Money request sent successfully!");
                }

                setAmount("");
                setSearchQuery("");
                setSelectedUser(null);
                setNote("");
                fetchData();
            } else if (securityAction.type === 'respond') {
                await walletService.respondToRequest(securityAction.requestId, securityAction.action);
                alert(`Request ${securityAction.action}ed successfully`);
                fetchData();
            }

            setShowSecurityModal(false);
            setSecurityAction(null);
        } catch (error: any) {
            throw error; // Re-throw for modal
        } finally {
            setLoading(false);
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
        try {
            await walletService.respondToRequest(requestId, action);
            alert(`Request ${action}ed successfully`);
            fetchData();
        } catch (error: any) {
            alert(error.message || "Action failed");
        }
    };

    return (
        <div className="pb-10 relative min-h-screen max-w-2xl mx-auto">
            <div className="flex items-center gap-4 mb-8">
                <button onClick={() => router.back()} className="w-10 h-10 bg-white/5 border border-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/10 transition-all">
                    <IonIcon name="arrow-back-outline" />
                </button>
                <h1 className="text-2xl font-bold text-white">Coins Management</h1>
            </div>

            {/* Wallet Balance Card */}
            <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-white/10 rounded-2xl p-6 mb-8 shadow-lg">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-blue-400 text-xs font-semibold uppercase tracking-wider mb-1">Your Balance</p>
                        <div className="flex items-center gap-2">
                            <div className="relative w-12 h-6"><Image src="/assets/images/rupee.png" alt="₹" fill className="object-contain" /></div>
                            <h2 className="text-3xl font-bold text-white">{balance.toFixed(2)}</h2>
                        </div>
                    </div>
                    <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center">
                        <IonIcon name="wallet-outline" className="text-2xl text-white" />
                    </div>
                </div>
            </div>

            {/* Main Form Section */}
            <div className="bg-[#162033] border border-gray-800 rounded-2xl p-6 mb-8">
                {/* Type Selection Tabs */}
                <div className="flex bg-[#0d1421] p-1 rounded-xl mb-6">
                    <button
                        onClick={() => setTransferType('transfer')}
                        className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${transferType === 'transfer' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}
                    >
                        Send Money
                    </button>
                    <button
                        onClick={() => setTransferType('request')}
                        className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${transferType === 'request' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}
                    >
                        Request Money (Sell)
                    </button>
                </div>

                <div className="space-y-6">
                    {/* Amount Input */}
                    <div>
                        <label className="block text-gray-400 text-sm font-medium mb-2">Amount</label>
                        <div className="relative">
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 w-8 h-4">
                                <Image src="/assets/images/rupee.png" alt="₹" fill className="object-contain opacity-50" />
                            </div>
                            <input
                                type="number"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="0.00"
                                className="w-full bg-[#0d1421] border border-gray-800 rounded-xl py-3 pl-14 pr-4 text-white focus:outline-none focus:border-blue-500 transition-all font-mono"
                            />
                        </div>
                    </div>

                    {/* User Search */}
                    <div className="relative">
                        <label className="block text-gray-400 text-sm font-medium mb-2">Target User (ID or Name)</label>
                        <div className="relative">
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">
                                <IonIcon name="search-outline" />
                            </div>
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => {
                                    setSearchQuery(e.target.value);
                                    if (selectedUser) setSelectedUser(null);
                                }}
                                placeholder="Enter user ID, username or name"
                                className="w-full bg-[#0d1421] border border-gray-800 rounded-xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-blue-500 transition-all"
                            />
                            {isSearching && (
                                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                    <div className="w-5 h-5 border-2 border-white/5 border-t-blue-500 rounded-full animate-spin"></div>
                                </div>
                            )}
                        </div>

                        {/* Search Suggestions Dropdown */}
                        {searchResults.length > 0 && !selectedUser && (
                            <div className="absolute z-50 left-0 right-0 mt-2 bg-[#1c283f] border border-gray-700 rounded-xl shadow-2xl max-h-60 overflow-y-auto overflow-x-hidden p-2">
                                {searchResults.map((user) => (
                                    <button
                                        key={user.id}
                                        onClick={() => {
                                            setSelectedUser(user);
                                            setSearchQuery(`${user.full_name} (${user.user_id})`);
                                            setSearchResults([]);
                                        }}
                                        className="w-full flex items-center gap-3 p-3 hover:bg-white/5 rounded-lg transition-colors text-left border-b border-white/5 last:border-none"
                                    >
                                        <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-800 relative flex-shrink-0">
                                            {user.profile_picture ? (
                                                <Image src={user.profile_picture} alt={user.username} fill className="object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-gray-500 bg-gray-700">
                                                    <IonIcon name="person-outline" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-sm font-bold text-white flex items-center justify-between">
                                                {user.full_name}
                                                <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded text-blue-400 capitalize">{user.user_type}</span>
                                            </p>
                                            <p className="text-xs text-gray-400">@{user.username} • ID: {user.user_id}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Note Input */}
                    <div>
                        <label className="block text-gray-400 text-sm font-medium mb-2">Note (Optional)</label>
                        <textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder={transferType === 'transfer' ? "What is this payment for?" : "What is this request for?"}
                            className="w-full bg-[#0d1421] border border-gray-800 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-blue-500 transition-all resize-none h-24"
                        />
                    </div>

                    <button
                        onClick={handleAction}
                        disabled={loading || !selectedUser || !amount}
                        className={`w-full ${transferType === 'transfer' ? 'bg-green-600 hover:bg-green-500 shadow-green-600/20' : 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/20'} disabled:opacity-50 text-white font-bold py-4 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2`}
                    >
                        {loading ? "Processing..." : (
                            <>
                                <IonIcon name={transferType === 'transfer' ? "send-outline" : "paper-plane-outline"} />
                                <span>{transferType === 'transfer' ? 'Transfer Now' : 'Send Request (Sell)'}</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Pending Requests Section */}
            <div className="bg-[#162033] border border-gray-800 rounded-2xl p-6">
                <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                    <IonIcon name="time-outline" className="text-yellow-500" />
                    Pending Requests from Others
                </h3>

                <div className="space-y-4">
                    {pendingRequests.length === 0 ? (
                        <div className="text-center py-10">
                            <div className="text-4xl text-gray-700 mb-3"><IonIcon name="notifications-off-outline" /></div>
                            <p className="text-gray-500 text-sm">No pending requests</p>
                        </div>
                    ) : (
                        pendingRequests.map((req) => (
                            <div key={req.id} className="bg-[#0d1421] border border-gray-800 rounded-xl p-4 flex flex-col gap-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-800 relative">
                                            {req.sender_profile_picture ? (
                                                <Image src={req.sender_profile_picture} alt={req.sender_username} fill className="object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-gray-500">
                                                    <IonIcon name="person-outline" />
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-white">{req.sender_full_name}</p>
                                            <p className="text-xs text-gray-400">@{req.sender_username} is requesting</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="flex items-center gap-1 justify-end">
                                            <div className="relative w-8 h-4"><Image src="/assets/images/rupee.png" alt="₹" fill className="object-contain" /></div>
                                            <p className="text-lg font-bold text-white">{parseFloat(req.amount).toFixed(2)}</p>
                                        </div>
                                        <p className="text-[10px] text-gray-500">{new Date(req.created_at).toLocaleDateString()}</p>
                                    </div>
                                </div>
                                {req.note && (
                                    <div className="px-3 py-2 bg-white/5 rounded-lg text-xs text-gray-400 border-l-2 border-blue-500">
                                        "{req.note}"
                                    </div>
                                )}
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleRespond(req.id, 'accept')}
                                        className="flex-1 bg-green-600 hover:bg-green-500 text-white text-xs font-bold py-2.5 rounded-lg transition-colors"
                                    >
                                        Accept & Pay
                                    </button>
                                    <button
                                        onClick={() => handleRespond(req.id, 'reject')}
                                        className="flex-1 bg-gray-800 hover:bg-gray-700 text-white text-xs font-bold py-2.5 rounded-lg transition-colors border border-gray-700"
                                    >
                                        Reject
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <SecurityVerificationModal
                isOpen={showSecurityModal}
                onClose={() => {
                    setShowSecurityModal(false);
                    setSecurityAction(null);
                }}
                onVerify={executeVerifiedAction}
                isProcessing={loading}
                transaction={securityAction?.transaction}
            />
        </div>
    );
}
