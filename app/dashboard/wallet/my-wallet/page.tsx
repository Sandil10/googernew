"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authService } from '@/services/authService';
import { walletService } from '@/services/walletService';
import { orderService } from '@/services/orderService';
import Link from 'next/link';
import Image from 'next/image';
import IonIcon from '@/app/components/IonIcon';
import ConfirmTransferModal from '@/app/components/ConfirmTransferModal';
import SecurityVerificationModal from '@/app/components/SecurityVerificationModal';
import ReceiptModal from '@/app/components/ReceiptModal';
import CancelTransactionModal from '@/app/components/CancelTransactionModal';
import { generateTransactionReceipt } from '@/utils/pdfGenerator';
import { getCurrentUserIdentityKey, readAdWalletAdjustments } from '@/utils/adWallet';

const MANUAL_PAYMENT_INTENT_STORAGE_KEY = 'googer-manual-payment-intent';
const MANUAL_PAYMENT_LOCK_STORAGE_KEY = 'googer-manual-payment-lock';
const MANUAL_PAYMENT_RESET_EVENT = 'googer-manual-payment-reset';

const formatLockedAmount = (value?: number | string | null) => {
    const numeric = Number(value || 0);
    return Number.isFinite(numeric) ? numeric.toFixed(2) : "0.00";
};

const formatWalletCounterparty = (tx: any, currentUserId?: number | string) => {
    const isSent = tx.sender_id === currentUserId;
    const type = String(tx?.type || '').toLowerCase();
    const label = type === 'request'
        ? (isSent ? 'Requested From' : 'Requested By')
        : (isSent ? 'Send To' : 'Received From');
    const fullName = isSent ? tx.receiver_full_name : tx.sender_full_name;
    const username = isSent ? tx.receiver_username : tx.sender_username;
    const readableId = isSent ? tx.receiver_readable_id : tx.sender_readable_id;
    const displayName = fullName || username || 'Unknown User';
    return `${label} - ${displayName} (ID ${readableId ?? 'N/A'})`;
};

const formatWalletTypeLabel = (tx: any) => {
    const type = String(tx?.type || '').toLowerCase();
    if (type === 'sell') return 'Sell';
    if (type === 'request') return 'Requested';
    if (type === 'transfer') return 'Transfer';
    if (type === 'discount_staking') return 'Discount Request';
    if (type === 'commission_hold') return 'Commission Transfer';
    if (type === 'order_hold') return 'Order Hold';
    return type ? type.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()) : 'Wallet';
};

const isManualOrderHold = (tx: any) => {
    return String(tx?.type || '').toLowerCase() === 'order_hold'
        && /manual payment/i.test(String(tx?.note || ''));
};

const isGoogerPaymentOrderHold = (tx: any) => {
    return String(tx?.type || '').toLowerCase() === 'order_hold'
        && !/manual payment/i.test(String(tx?.note || ''));
};

const isAdCampaignPayment = (tx: any) => {
    return /ad campaign budget|ad promote/i.test(String(tx?.note || ''));
};

const getAdPaymentMeta = (tx: any) => {
    const note = String(tx?.note || '');
    const adId = note.match(/\b\d{10,12}\b/)?.[0]?.slice(-10) || '';
    const mediaType = /video/i.test(note) ? 'Video' : 'Photo';
    return { adId, mediaType };
};

const buildDisplayTransactions = (transactions: any[], currentUser: any) => {
    const currentUserKey = getCurrentUserIdentityKey();
    const adRefundAdjustments = readAdWalletAdjustments().filter((entry) => !currentUserKey || entry.ownerKey === currentUserKey);
    const groupedAdTransactions = new Map<string, any>();
    const regularTransactions: any[] = [];

    transactions.forEach((tx) => {
        if (!isAdCampaignPayment(tx)) {
            regularTransactions.push(tx);
            return;
        }

        const meta = getAdPaymentMeta(tx);
        const groupKey = meta.adId || `ad-tx-${tx.id}`;
        const amount = Number(tx.amount || 0);
        const existing = groupedAdTransactions.get(groupKey);

        if (!existing) {
            groupedAdTransactions.set(groupKey, {
                ...tx,
                id: `ad-${groupKey}`,
                adId: meta.adId,
                adMediaType: meta.mediaType,
                adChargeTotal: amount,
            });
            return;
        }

        existing.adChargeTotal += amount;
        if (new Date(tx.created_at).getTime() > new Date(existing.created_at).getTime()) {
            existing.created_at = tx.created_at;
            existing.adMediaType = meta.mediaType;
        }
    });

    const groupedAdRows = Array.from(groupedAdTransactions.values()).map((tx) => {
        const adId = String(tx.adId || "");
        const adRefunds = adRefundAdjustments.filter((entry) => entry.adId === adId);
        const refundTotal = adRefunds.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
        const latestRefundAt = adRefunds.reduce<string>((latest, entry) => {
            if (!latest) return entry.createdAt;
            return new Date(entry.createdAt).getTime() > new Date(latest).getTime() ? entry.createdAt : latest;
        }, "");
        const currentHoldAmount = Math.max(0, Number(tx.adChargeTotal || 0) - refundTotal);
        const createdAt = latestRefundAt && new Date(latestRefundAt).getTime() > new Date(tx.created_at).getTime() ? latestRefundAt : tx.created_at;

        return {
            ...tx,
            sender_id: currentUser?.id,
            created_at: createdAt,
            amount: currentHoldAmount.toFixed(2),
            note: `Photo & Video Promotion${adId ? ` - Ad ID: ${adId}` : ''} - Deducted R ${Number(tx.adChargeTotal || 0).toFixed(2)}${refundTotal > 0 ? ` - Refunded R ${refundTotal.toFixed(2)}` : ''} - Hold R ${currentHoldAmount.toFixed(2)}`,
            status: 'hold',
            type: 'ad_hold_summary',
        };
    });

    return [...regularTransactions, ...groupedAdRows].sort((first, second) => {
        return new Date(second.created_at).getTime() - new Date(first.created_at).getTime();
    });
};

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
    const [cancelTransaction, setCancelTransaction] = useState<any>(null);
    const [lockedManualPayment, setLockedManualPayment] = useState<{ sellerId: string; sellerName?: string; amount?: string } | null>(null);
    const [lockedSellerUser, setLockedSellerUser] = useState<any>(null);
    const [showAmountValidationModal, setShowAmountValidationModal] = useState(false);
    const [lastInvalidAmount, setLastInvalidAmount] = useState<string | null>(null);

    const resetLockedManualPaymentState = () => {
        setLockedManualPayment(null);
        setLockedSellerUser(null);
        setAmount("");
        setCommission("");
        setTargetQuery("");
        setSelectedUser(null);
        setSuggestions([]);
        setShowSuggestions(false);
        setShowAmountValidationModal(false);
        setLastInvalidAmount(null);
        setCancelTransaction(null);
        setSecurityAction(null);
        setShowSecurityModal(false);
        setActiveTab('wallet');
    };

    const resolveLockedSeller = async (sellerId: string, options?: { hydrateForm?: boolean }) => {
        const hydrateForm = options?.hydrateForm !== false;
        const results = await walletService.searchUsers(sellerId, { includeSelf: true });
        const matchedUser = results.find((candidate: any) => String(candidate.user_id) === String(sellerId)) || results[0] || null;

        if (matchedUser) {
            setLockedSellerUser(matchedUser);
            if (hydrateForm) {
                setSelectedUser(matchedUser);
                setTargetQuery(String(matchedUser.user_id || sellerId));
                setSuggestions([]);
                setShowSuggestions(false);
            }
        }

        return matchedUser;
    };

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
            setTransactions(buildDisplayTransactions(txData, profile));

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

    useEffect(() => {
        const loadLockedManualPayment = async () => {
            if (typeof window === 'undefined') return;
            if (localStorage.getItem(MANUAL_PAYMENT_LOCK_STORAGE_KEY) !== 'true') {
                resetLockedManualPaymentState();
                return;
            }

            try {
                const stored = localStorage.getItem(MANUAL_PAYMENT_INTENT_STORAGE_KEY);
                if (!stored) return;

                const parsed = JSON.parse(stored);
                if (!parsed?.sellerId) return;

                const sellerId = String(parsed.sellerId);
                const lockedAmount = formatLockedAmount(parsed.amount);
                setLockedManualPayment({ sellerId, sellerName: parsed.sellerName, amount: formatLockedAmount(parsed.amount) });
                setAmount("");
                setCommission("");
                setTargetQuery("");
                setSelectedUser(null);

                const matchedUser = await resolveLockedSeller(sellerId, { hydrateForm: false });

                if (matchedUser) {
                    setLockedManualPayment({ sellerId: String(matchedUser.user_id), sellerName: matchedUser.username, amount: lockedAmount });
                } else {
                    setLockedSellerUser(null);
                    setSelectedUser(null);
                }
            } catch (error) {
                console.error("Failed to restore locked manual payment seller", error);
            }
        };

        loadLockedManualPayment();
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const handleManualPaymentReset = () => {
            resetLockedManualPaymentState();
            router.replace('/dashboard/wallet/my-wallet');
            router.refresh();
        };

        window.addEventListener(MANUAL_PAYMENT_RESET_EVENT, handleManualPaymentReset);
        return () => window.removeEventListener(MANUAL_PAYMENT_RESET_EVENT, handleManualPaymentReset);
    }, [router]);

    const handleCancelLockedManualPayment = () => {
        if (typeof window !== 'undefined') {
            localStorage.removeItem(MANUAL_PAYMENT_INTENT_STORAGE_KEY);
            localStorage.removeItem(MANUAL_PAYMENT_LOCK_STORAGE_KEY);
        }

        resetLockedManualPaymentState();
        router.replace('/dashboard/wallet/my-wallet');
        router.refresh();
    };

    const handleCancelTransaction = async () => {
        if (!cancelTransaction?.id) return;
        setIsProcessing(true);
        try {
            if (isManualOrderHold(cancelTransaction) && cancelTransaction.linked_order_number) {
                await orderService.cancelOrderGroup(String(cancelTransaction.linked_order_number));
                alert("Order cancelled and refunded successfully");
            } else {
                await walletService.cancelTransaction(cancelTransaction.id);
                alert("Transaction cancelled successfully");
            }
            await fetchAllData();
            setCancelTransaction(null);
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
            if (lockedManualPayment) {
                setSuggestions([]);
                setShowSuggestions(false);
                return;
            }
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
    }, [targetQuery, lockedManualPayment, lockedSellerUser]);

    const handleSelectUser = (user: any) => {
        setSelectedUser(user);
        setTargetQuery(String(user.user_id || ""));
        setShowSuggestions(false);
    };

    const isLockedAmountValid = () => {
        if (!lockedManualPayment?.amount) return true;
        const expected = Number(lockedManualPayment.amount);
        const entered = Number(amount);

        if (!amount.trim() || Number.isNaN(entered)) {
            return false;
        }

        return entered.toFixed(2) === expected.toFixed(2);
    };

    const isLockedSellerInputValid = () => {
        if (!lockedManualPayment?.sellerId) return true;
        const enteredSellerId = String(targetQuery || "").trim();

        if (!enteredSellerId) {
            return false;
        }

        return enteredSellerId === String(lockedManualPayment.sellerId);
    };

    useEffect(() => {
        if (!lockedManualPayment) {
            setShowAmountValidationModal(false);
            setLastInvalidAmount(null);
            return;
        }

        const trimmedAmount = amount.trim();
        if (!trimmedAmount) {
            setLastInvalidAmount(null);
            return;
        }

        const timeoutId = window.setTimeout(() => {
            if (isLockedAmountValid()) {
                setLastInvalidAmount(null);
                return;
            }

            if (lastInvalidAmount !== trimmedAmount) {
                setLastInvalidAmount(trimmedAmount);
                setShowAmountValidationModal(true);
            }
        }, 500);

        return () => window.clearTimeout(timeoutId);
    }, [amount, lockedManualPayment, lastInvalidAmount]);

    const handleTransfer = async (type: 'sell' | 'buy') => {
        let effectiveSelectedUser = selectedUser;
        const effectiveAmount = amount;

        if (!effectiveAmount || (!effectiveSelectedUser && !lockedManualPayment)) {
            alert("Please select a user and enter amount");
            return;
        }
        if (lockedManualPayment) {
            if (type !== 'sell') {
                alert("Only the locked seller payment can be completed in this manual payment flow");
                return;
            }
            if (parseFloat(commission || "0") > 0) {
                alert("Discount is not allowed in this locked seller payment flow");
                return;
            }
            if (!isLockedAmountValid()) {
                setShowAmountValidationModal(true);
                return;
            }
            if (!isLockedSellerInputValid()) {
                alert("This payment is locked to the selected seller only");
                return;
            }
            effectiveSelectedUser = lockedSellerUser || await resolveLockedSeller(String(lockedManualPayment.sellerId), { hydrateForm: false });
        }
        if (!effectiveSelectedUser || !effectiveAmount) {
            alert("Please select a user and enter amount");
            return;
        }
        setSelectedUser(effectiveSelectedUser);
        setSecurityAction({
            type: 'transfer',
            transferType: type,
            transaction: {
                type: type === 'sell' ? 'Send' : 'Request',
                amount: effectiveAmount,
                discount: commission || 0,
                recipient: `@${effectiveSelectedUser.username} (${effectiveSelectedUser.user_id})`,
                buyerId: lockedManualPayment ? String(user?.user_id || user?.googer_id || user?.id || '') : undefined,
                sellerId: lockedManualPayment ? String(effectiveSelectedUser.user_id || '') : undefined
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
                let effectiveSelectedUser = selectedUser;
                const effectiveAmount = amount;

                if (lockedManualPayment) {
                    if (securityAction.transferType !== 'sell') {
                        throw new Error("Only the locked seller payment can be completed in this manual payment flow");
                    }
                    if (parseFloat(commission || "0") > 0) {
                        throw new Error("Discount is not allowed in this locked seller payment flow");
                    }
                    if (!isLockedAmountValid()) {
                        setShowAmountValidationModal(true);
                        throw new Error("Please enter the correct amount.");
                    }
                    if (!isLockedSellerInputValid()) {
                        throw new Error("This payment is locked to the selected seller only");
                    }
                    effectiveSelectedUser = lockedSellerUser || await resolveLockedSeller(String(lockedManualPayment.sellerId), { hydrateForm: false });
                }

                if (!effectiveSelectedUser || !effectiveAmount) {
                    throw new Error("Please select a user and enter amount");
                }
                const requestType = securityAction.transferType === 'sell' ? 'sell' : 'request';

                const res = await walletService.requestMoney(
                    effectiveSelectedUser.id,
                    parseFloat(effectiveAmount),
                    lockedManualPayment ? 'Googer Manual Payment Hold' : "",
                    commission ? parseFloat(commission) : 0,
                    requestType,
                    lockedManualPayment ? { manualPaymentOrder: true } : undefined
                );

                if (res.success) {
                    const successMsg = res.message || (securityAction.transferType === 'sell'
                        ? `Money transfer sent to ${effectiveSelectedUser.username}. Amount is on hold until they accept.`
                        : `Money request sent to ${effectiveSelectedUser.username}. They will pay if they accept.`);

                    alert(successMsg);

                    // Refresh data
                    await fetchAllData();

                    setAmount("");
                    setCommission("");
                    setTargetQuery("");
                    setSelectedUser(null);

                    // Show receipt immediately after transaction
                    if (res.transaction) {
                        setReceiptTransaction({
                            ...res.transaction,
                            sender_readable_id: res.transaction.sender_readable_id || user?.user_id || user?.googer_id || user?.id,
                            receiver_readable_id: res.transaction.receiver_readable_id || effectiveSelectedUser?.user_id,
                            sender_username: res.transaction.sender_username || user?.username,
                            receiver_username: res.transaction.receiver_username || effectiveSelectedUser?.username
                        });
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
                <div className="h-24 bg-[#070707] border border-gray-800 rounded-xl mb-6"></div>
                <div className="h-48 bg-[#070707] border border-gray-800 rounded-xl"></div>
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
            <div className="bg-[#070707] border border-gray-800 rounded-2xl p-6 md:p-8 mb-8 shadow-lg relative overflow-hidden transition-all hover:border-gray-700 flex flex-col items-center justify-center text-center">
                <div className="absolute top-0 right-0 w-48 h-48 bg-black/10 rounded-full blur-3xl"></div>
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
            <div className="bg-[#070707] border border-gray-800 rounded-2xl overflow-hidden mb-20 shadow-lg">
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
                                            className={`w-full max-w-[220px] mx-auto block bg-[#030303] border rounded-xl px-4 py-3 text-white text-center text-lg font-bold focus:outline-none shadow-inner ${lockedManualPayment && !isLockedAmountValid() && amount.trim() ? 'border-red-500/70' : 'border-gray-800'}`}
                                            placeholder="0.00"
                                        />
                                        {lockedManualPayment && amount.trim() && !isLockedAmountValid() && (
                                            <p className="text-center text-[9px] font-black uppercase tracking-widest mt-2 text-red-400">
                                                Please enter the correct amount.
                                            </p>
                                        )}
                                    </div>
                                    {!lockedManualPayment && (
                                        <div>
                                            <label className="block text-center text-gray-400 font-bold text-[10px] uppercase tracking-widest mb-3">Discount %</label>
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    value={commission}
                                                    onChange={(e) => setCommission(e.target.value)}
                                                    className="w-full bg-[#030303] border border-gray-800 rounded-xl px-4 py-3 text-white text-center text-lg font-bold focus:outline-none shadow-inner"
                                                    placeholder="0"
                                                />
                                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">%</span>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="relative">
                                    <label className="block text-center text-gray-400 font-bold text-[10px] uppercase tracking-widest mb-3">{lockedManualPayment ? 'Target Googer ID' : 'Target User (ID or Name)'}</label>
                                    <input
                                        type="text"
                                        value={targetQuery}
                                        onChange={(e) => {
                                            setTargetQuery(e.target.value);
                                            setSelectedUser(null);
                                        }}
                                        onFocus={() => {
                                            if (lockedManualPayment) return;
                                            targetQuery.length >= 2 && setShowSuggestions(true);
                                        }}
                                        className="w-full bg-[#030303] border border-gray-800 rounded-xl px-4 py-3 text-white text-center text-lg font-bold focus:outline-none shadow-inner"
                                        placeholder={lockedManualPayment ? "Enter Seller ID" : "Type User ID or Name"}
                                    />
                                    {lockedManualPayment && targetQuery.trim() && !isLockedSellerInputValid() && (
                                        <p className="text-center text-[9px] font-black uppercase tracking-widest mt-2 text-red-400">
                                            Please enter the correct seller ID.
                                        </p>
                                    )}

                                    {/* Search Suggestions Dropdown */}
                                    {!lockedManualPayment && showSuggestions && suggestions.length > 0 && (
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
                                                    <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase ${s.user_type === 'seller' ? 'bg-amber-500/10 text-amber-500' : 'bg-white/5 text-white/55'}`}>
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
                                        disabled={isProcessing || !!lockedManualPayment}
                                        className={`flex-1 py-3.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-full transition-all active:scale-95 shadow-md text-xs uppercase tracking-widest ${(isProcessing || lockedManualPayment) ? 'opacity-50 cursor-not-allowed' : ''}`}
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
                                <IonIcon name="time-outline" className="text-base text-white/65" />
                                Recent Activity
                            </p>

                            {transactions.length > 0 ? (
                                transactions.map((tx) => {
                                    const isSent = tx.sender_id === user?.id;
                                    const adCampaignPayment = isAdCampaignPayment(tx);
                                    const otherUserName = isSent
                                        ? (tx.receiver_full_name || tx.receiver_username)
                                        : (tx.sender_full_name || tx.sender_username);
                                    const otherUserReadableId = isSent ? tx.receiver_readable_id : tx.sender_readable_id;
                                    const manualOrderHold = isManualOrderHold(tx);
                                    const googerPaymentOrderHold = isGoogerPaymentOrderHold(tx);
                                    const isCancellable = isSent
                                        && tx.status === 'pending'
                                        && !googerPaymentOrderHold
                                        && !adCampaignPayment
                                        && (!manualOrderHold || Boolean(tx.linked_order_can_cancel));
                                    const displayedStatus = manualOrderHold && tx.linked_order_status
                                        ? String(tx.linked_order_status)
                                        : String(adCampaignPayment ? 'hold' : (tx.status || ''));

                                    return (
                                        <div key={tx.id} className="bg-gray-800/20 border border-gray-800 rounded-xl p-4 hover:bg-gray-800/40 transition-all group">
                                            <div className="flex items-center gap-4">
                                                <div className={`w-12 h-12 ${adCampaignPayment ? 'bg-rose-500/10 text-rose-300' : isSent ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'} rounded-xl flex items-center justify-center text-xl shrink-0`}>
                                                    <IonIcon name={adCampaignPayment ? 'megaphone-outline' : tx.type === 'request' ? 'paper-plane-outline' : (isSent ? 'arrow-up-outline' : 'arrow-down-outline')} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-center mb-0.5">
                                                        <h5 className="font-bold text-white text-sm">
                                                            {adCampaignPayment ? 'Photo & Video Promotion' : tx.type === 'request' ? (isSent ? 'Requested From: ' : 'Requested By: ') : (isSent ? 'Sent To: ' : 'Received From: ')}
                                                            {!adCampaignPayment && <span className="text-white/65">{otherUserName || 'Unknown User'}{otherUserReadableId ? ` (ID ${otherUserReadableId})` : ''}</span>}
                                                        </h5>
                                                        <span className={`text-sm font-bold tracking-tight ${isSent ? 'text-red-400' : 'text-green-400'}`}>
                                                            {isSent ? (tx.type === 'request' ? '' : '-') : '+'} R {parseFloat(tx.amount).toFixed(2)}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <p className="text-[10px] text-gray-400 font-semibold mb-1">
                                                            {new Date(tx.created_at).toLocaleDateString('en-GB')} • {new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </p>
                                                        <span className={`text-[9px] uppercase font-black px-2 py-1 rounded-md bg-gray-900/50 ${adCampaignPayment ? 'text-rose-300' : tx.type === 'transfer' ? 'text-white/65' : tx.type === 'request' ? 'text-white/65' : 'text-amber-400'}`}>
                                                            {adCampaignPayment ? 'Promotion' : tx.type === 'transfer' ? 'Transferred' : tx.type === 'request' ? 'Requested' : tx.type}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <p className="text-[10px] text-gray-500 font-medium italic">
                                                            {tx.note || (isSent ? (tx.type === 'request' ? 'Coin Request Sent' : 'Direct coin transfer') : 'Coins received')}
                                                            {tx.commission_percentage > 0 && ` (Incl. ${tx.commission_percentage}% discount)`}
                                                        </p>
                                                        <div className="flex items-center gap-2">
                                                            <span className={`text-[9px] uppercase font-bold ${displayedStatus === 'completed' || displayedStatus === 'received' ? 'text-green-500' : 'text-amber-500'}`}>
                                                                {displayedStatus}
                                                            </span>
                                                            {isCancellable && (
                                                                <button
                                                                    onClick={() => setCancelTransaction({ ...tx, currentUserId: user?.id })}
                                                                    className="text-[9px] font-black text-red-500 uppercase tracking-widest bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20 hover:bg-red-500 hover:text-white transition-all"
                                                                >
                                                                    Cancel
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                                {!adCampaignPayment && <button
                                                    onClick={() => {
                                                        setReceiptTransaction(tx);
                                                        setShowReceiptModal(true);
                                                    }}
                                                    className="w-10 h-10 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-all active:scale-90"
                                                    title="View Receipt"
                                                >
                                                    <IonIcon name="receipt-outline" className="text-xl" />
                                                </button>}
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
                                                <div className="w-12 h-12 bg-white/5 text-white/65 rounded-xl flex items-center justify-center text-xl shrink-0 border border-white/10 uppercase font-black">
                                                    {req.sender_username?.charAt(0) || 'R'}
                                                </div>
                                                <div className="min-w-0">
                                                    <h5 className="font-bold text-white text-sm tracking-tight mb-0.5">
                                                        Request from <span className="text-white/65">@{req.sender_username}</span>
                                                    </h5>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{new Date(req.created_at).toLocaleDateString()}</span>
                                                        <span className="w-1 h-1 bg-gray-700 rounded-full"></span>
                                                        <span className="text-[10px] text-white/55 font-bold uppercase tracking-widest">Pending Payment</span>
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
                                            <div className="mt-4 p-3 bg-[#030303] rounded-xl border border-gray-800">
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
                                <span className="bg-white/5 text-white/65 px-4 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-widest border border-white/10">
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
                                                        <div className="w-full h-full flex items-center justify-center text-white/65 font-bold text-sm bg-white/5 uppercase">
                                                            {ref.referred_full_name?.charAt(0) || 'U'}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="text-xs font-bold text-white uppercase tracking-wider">{ref.referred_full_name}</div>
                                                        <div className="text-[9px] text-gray-500 font-semibold uppercase tracking-widest">@{ref.referred_username}</div>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[10px] text-white/55 font-bold uppercase tracking-widest">Joined {new Date(ref.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</p>
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
                            <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-6 animate-pulse">
                                <IonIcon name="gift-outline" className="text-4xl text-white/65" />
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
                                    className="px-4 py-4 bg-white text-black hover:bg-zinc-200 font-bold rounded-xl transition-all active:scale-95 shadow-md text-[10px] uppercase tracking-widest flex items-center justify-center gap-2"
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
                                <IonIcon name="time" className="text-white/65" />
                                Recent Transactions
                            </h4>
                            <button
                                onClick={() => setActiveTab('transactions')}
                                className="text-[9px] text-white/55 font-bold uppercase tracking-widest hover:text-white hover:underline"
                            >
                                View All History
                            </button>
                        </div>

                        <div className="space-y-2">
                            {transactions.slice(0, 3).length > 0 ? (
                                transactions.slice(0, 3).map((tx) => {
                                    const isSent = tx.sender_id === user?.id;
                                    const adCampaignPayment = isAdCampaignPayment(tx);
                                    const counterpartyLine = adCampaignPayment ? 'Photo & Video Promotion' : formatWalletCounterparty(tx, user?.id);
                                    const typeLabel = adCampaignPayment ? 'Promotion Hold' : formatWalletTypeLabel(tx);
                                    const compactDescription = tx.note
                                        ? `${typeLabel} - ${tx.note}`
                                        : `${typeLabel}${tx.commission_percentage > 0 ? ` (${tx.commission_percentage}%)` : ''}${tx.commission_percentage > 0 ? ` (Incl. ${tx.commission_percentage}% discount)` : ''}`;
                                    return (
                                        <div key={tx.id} className="p-3 bg-[#030303] rounded-xl border border-gray-800/50 hover:border-gray-700 transition-all">
                                            <div className="flex items-start gap-3">
                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${adCampaignPayment ? 'bg-rose-500/10 text-rose-300' : isSent ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
                                                    <IonIcon name={adCampaignPayment ? 'megaphone-outline' : (isSent ? 'arrow-up-outline' : 'arrow-down-outline')} />
                                                </div>
                                                <div className="flex-1 min-w-0 text-left">
                                                    <p className="text-[10px] font-bold text-white break-words">
                                                        {counterpartyLine}
                                                    </p>
                                                    <p className="text-[8px] text-gray-400 font-medium mt-1">
                                                        {new Date(tx.created_at).toLocaleDateString('en-GB')} • {new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </p>
                                                    <p className="text-[9px] text-gray-500 font-medium italic mt-1 break-words">
                                                        {compactDescription}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-4 shrink-0">
                                                {!adCampaignPayment && <button
                                                    onClick={() => {
                                                        setReceiptTransaction(tx);
                                                        setShowReceiptModal(true);
                                                    }}
                                                    className="p-1 hover:text-white transition-colors"
                                                >
                                                    <IonIcon name="receipt-outline" className="text-xs" />
                                                </button>}
                                                </div>
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
            <CancelTransactionModal
                isOpen={!!cancelTransaction}
                transaction={cancelTransaction}
                onClose={() => setCancelTransaction(null)}
                onConfirm={handleCancelTransaction}
                isProcessing={isProcessing}
            />
            {showAmountValidationModal && (
                <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                        onClick={() => setShowAmountValidationModal(false)}
                    />
                    <div className="relative w-full max-w-[320px] rounded-3xl border border-red-500/20 bg-[#111111] p-5 shadow-2xl text-center">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-400">Amount Error</p>
                        <p className="text-[11px] text-white/70 leading-relaxed mt-3">
                            Please enter the correct amount.
                        </p>
                        {lockedManualPayment?.amount && (
                            <p className="text-[10px] font-bold text-white mt-2">
                                Required: {lockedManualPayment.amount}
                            </p>
                        )}
                        <button
                            type="button"
                            onClick={() => setShowAmountValidationModal(false)}
                            className="mt-5 px-5 py-2 rounded-xl bg-red-600 text-white text-[9px] font-black uppercase tracking-[0.14em] hover:bg-red-500 transition-all"
                        >
                            OK
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
