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
import { formatGoogerId } from '@/app/lib/userDisplay';
import { getCurrentUserIdentityKey, readAdWalletAdjustments } from '@/utils/adWallet';
import {
    formatWalletTransactionDate,
    formatWalletTransactionTime,
    getAdPaymentMeta,
    getAdTransactionSummary,
    isAdCampaignPayment,
    isPromoAdRecord,
} from '@/app/lib/walletTransactions';

const MANUAL_PAYMENT_INTENT_STORAGE_KEY = 'googer-manual-payment-intent';
const MANUAL_PAYMENT_LOCK_STORAGE_KEY = 'googer-manual-payment-lock';
const MANUAL_PAYMENT_RESET_EVENT = 'googer-manual-payment-reset';
const WALLET_ACTIVE_TAB_STORAGE_KEY = 'googer-wallet-active-tab';
const WALLET_TABS = ['wallet', 'transactions', 'request', 'referrals', 'rewards', 'affiliate'] as const;
type WalletTab = typeof WALLET_TABS[number];

const isWalletTab = (value: any): value is WalletTab => {
    return WALLET_TABS.includes(value);
};

const getInitialWalletTab = (): WalletTab => {
    if (typeof window === 'undefined') return 'wallet';
    const savedTab = localStorage.getItem(WALLET_ACTIVE_TAB_STORAGE_KEY);
    return isWalletTab(savedTab) ? savedTab : 'wallet';
};

const formatLockedAmount = (value?: number | string | null) => {
    const numeric = Number(value || 0);
    return Number.isFinite(numeric) ? numeric.toFixed(2) : "0.00";
};

const findMatchingWalletUser = (users: any[], targetId: string) => {
    const normalizedTarget = String(targetId).trim().toLowerCase();

    return users.find((candidate: any) => {
        const candidateValues = [
            candidate?.user_id,
            candidate?.googer_id,
            candidate?.id,
            candidate?.username,
            candidate?.full_name,
        ];

        return candidateValues.some((value) => String(value || "").trim().toLowerCase() === normalizedTarget);
    }) || users[0] || null;
};

const formatWalletCounterparty = (tx: any, currentUserId?: number | string) => {
    const isSent = tx.sender_id === currentUserId;
    const type = String(tx?.type || '').toLowerCase();
    if (type === 'commission_hold') {
        return `${isSent ? 'Sent To' : 'Received From'} - Googer Commission`;
    }
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
    if (type === 'seller_discount') return 'Send Discount';
    if (type === 'discount_refund') return 'Discount Refund';
    if (type === 'discount_staking') return 'Product Discount';
    if (type === 'commission_hold') return 'Googer Commission';
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

const getDisplayNote = (tx: any, fallback: string) => {
    if (isGoogerPaymentOrderHold(tx)) return 'Googer Payments';
    return tx?.note || fallback;
};

const AD_COIN_TYPES = new Set(['ad_coin', 'ad_coin_ad_credit', 'ad_coin_commission']);
const isAdCoinRewardTx = (tx: any) => {
    const type = String(tx?.type || '').toLowerCase();
    if (AD_COIN_TYPES.has(type)) return true;
    const note = String(tx?.note || '');
    const hasAdCoinNote = /ad\s*coin\s*reward/i.test(note);
    // When the receiver has referrals, the ad coin reward flows through
    // distributeProductDiscountCommission which creates referral_commission rows
    // whose note carries the "Ad coin reward" / "Ad Coin Reward" description.
    if (type === 'referral_commission' && hasAdCoinNote) return true;
    // Unused referral levels refund the remainder as discount_refund with the
    // same "Ad Coin Reward Balance - Unused Levels - Ad coin reward for ..." note.
    if (type === 'discount_refund' && hasAdCoinNote) return true;
    return false;
};
const isResellRewardTx = (tx: any) => String(tx?.type || '').toLowerCase() === 'resell_commission';
const isAnyRewardTx = (tx: any) => isAdCoinRewardTx(tx) || isResellRewardTx(tx);

const getWalletDisplayAmount = (tx: any, isSent: boolean) => {
    const amount = Number(tx?.amount || 0);
    const discountPct = Number(tx?.commission_percentage || 0);
    const type = String(tx?.type || '').toLowerCase();
    const status = String(tx?.status || '').toLowerCase();
    const isAcceptedDiscountTransfer = ['accepted', 'completed'].includes(status)
        && discountPct > 0
        && ['sell', 'request'].includes(type);

    if (!isAcceptedDiscountTransfer) return amount;

    const discountAmount = Number(((amount * discountPct) / 100).toFixed(2));
    const netAmount = Math.max(0, amount - discountAmount);

    if (type === 'sell' && !isSent) return netAmount;
    if (type === 'request' && isSent) return netAmount;
    return amount;
};

const getSellerDiscountAmount = (tx: any) => {
    const amount = Number(tx?.amount || 0);
    const discountPct = Number(tx?.commission_percentage || 0);
    return Number(((amount * discountPct) / 100).toFixed(2));
};

const isSellerBuyDiscountRequest = (tx: any) => {
    return String(tx?.type || '').toLowerCase() === 'request'
        && Number(tx?.commission_percentage || 0) > 0
        && String(tx?.sender_user_type || '').toLowerCase() === 'seller';
};

const formatCoinRequestAmount = (value: any) => {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount)) return '0';
    return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
};

const getCoinRequestLines = (tx: any) => {
    return {
        coinRequest: `Coin Request ${formatCoinRequestAmount(tx?.amount)}`,
        sendDiscount: `Send Discount ${Number(tx?.commission_percentage || 0)}%`,
    };
};

const isSellerDiscountRefund = (tx: any) => {
    return String(tx?.type || '').toLowerCase() === 'discount_refund'
        && /seller discount/i.test(String(tx?.note || ''));
};

const isProductDiscountRefund = (tx: any) => {
    return String(tx?.type || '').toLowerCase() === 'discount_refund'
        && /product discount/i.test(String(tx?.note || ''));
};

const isSellerDirectDiscount = (tx: any) => {
    return String(tx?.type || '').toLowerCase() === 'seller_discount'
        && Number(tx?.commission_percentage || 0) > 0;
};

const getSellerDirectDiscountLines = (tx: any) => {
    return {
        sendDiscount: `Send Discount ${Number(tx?.commission_percentage || 0)}%`,
    };
};

const isSellDiscountRequest = (tx: any) => {
    return String(tx?.type || '').toLowerCase() === 'sell'
        && Number(tx?.commission_percentage || 0) > 0;
};

const isNormalDiscountRequest = (tx: any) => {
    return String(tx?.type || '').toLowerCase() === 'request'
        && Number(tx?.commission_percentage || 0) > 0
        && !isSellerBuyDiscountRequest(tx);
};

const getNormalDiscountRequestLine = (tx: any) => {
    return `Discount Request ${Number(tx?.commission_percentage || 0)}%`;
};

const isNoDiscountBuyRequest = (tx: any) => {
    return String(tx?.type || '').toLowerCase() === 'request'
        && Number(tx?.commission_percentage || 0) <= 0;
};

const isNoDiscountSellTransfer = (tx: any) => {
    return String(tx?.type || '').toLowerCase() === 'sell'
        && Number(tx?.commission_percentage || 0) <= 0;
};

const getSellDiscountRequestLines = (tx: any) => {
    return {
        sendCoin: `Send Coin ${formatCoinRequestAmount(tx?.amount)}`,
        discountRequest: `Discount Request ${Number(tx?.commission_percentage || 0)}%`,
    };
};

const getSellerDiscountRefundLines = (tx: any) => {
    const discountPercent = Number(tx?.original_discount_percentage || 0);
    return {
        sendDiscount: `Send Discount ${Number.isFinite(discountPercent) && discountPercent > 0 ? discountPercent : ''}%`.replace(' %', ''),
        deductionNote: 'Referral level amounts are deducted first. This is the remaining discount balance added to your wallet.',
    };
};

const getProductDiscountRefundLines = (tx: any) => {
    const discountPercent = Number(tx?.product_discount_percentage || 0);
    return {
        productDiscount: discountPercent > 0 ? `Product Discount ${discountPercent}%` : 'Product Discount',
        deductionNote: 'Referral level amounts are deducted first. This is the remaining discount balance added to your wallet.',
    };
};

const isGoogerCommissionTx = (tx: any) => {
    return String(tx?.type || '').toLowerCase() === 'commission_hold'
        && /googer commission/i.test(String(tx?.note || ''));
};

const isProductDiscountTx = (tx: any) => {
    return String(tx?.type || '').toLowerCase() === 'discount_staking';
};

const getProductDiscountLine = (tx: any) => {
    const percent = Number(tx?.product_discount_percentage || tx?.commission_percentage || 0);
    return percent > 0 ? `Product Discount ${percent}%` : 'Product Discount';
};

const DEFAULT_REFERRAL_LEVELS = [
    { level: 1, name: 'Direct', sort_order: 1 },
    { level: 2, name: 'Network', sort_order: 2 },
    { level: 3, name: 'Extended', sort_order: 3 },
    { level: 4, name: 'Deep', sort_order: 4 },
    { level: 5, name: 'Global', sort_order: 5 },
];

const REFERRAL_BRANCH_COLORS = [
    "#22c55e",
    "#3b82f6",
    "#a855f7",
    "#f59e0b",
    "#ec4899",
    "#14b8a6",
    "#ef4444",
    "#84cc16",
];

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

        // Promo ad records ($0, type=promo_ad) shown standalone, not grouped
        if (isPromoAdRecord(tx)) {
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
            note: `Ad Hold Summary - ${tx.adMediaType || 'Photo'} Promotion${adId ? ` - Ad ID: ${adId}` : ''} - Status: Hold - Hold Amount: R ${currentHoldAmount.toFixed(2)} - Deducted Amount: R ${Number(tx.adChargeTotal || 0).toFixed(2)}${refundTotal > 0 ? ` - Refunded R ${refundTotal.toFixed(2)}` : ''}`,
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
    const [activeTab, setActiveTab] = useState<WalletTab>('wallet');
    // Restore saved tab from localStorage on client mount (avoids SSR hydration mismatch
    // which previously caused the tab to snap back to "Manage" after a refresh).
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const savedTab = localStorage.getItem(WALLET_ACTIVE_TAB_STORAGE_KEY);
        if (savedTab && isWalletTab(savedTab)) {
            setActiveTab(savedTab);
        }
    }, []);
    const [user, setUser] = useState<any>(null);
    const [referralLink, setReferralLink] = useState("");
    const [referrals, setReferrals] = useState<any[]>([]);
    const [referralStats, setReferralStats] = useState<any>({ totalReferrals: 0, totalEarned: "0.00", levelCounts: {}, levelSettings: DEFAULT_REFERRAL_LEVELS });
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
        switchWalletTab('wallet');
    };

    const switchWalletTab = (tab: WalletTab) => {
        setActiveTab(tab);
        if (typeof window !== 'undefined') {
            localStorage.setItem(WALLET_ACTIVE_TAB_STORAGE_KEY, tab);
        }
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
            await refreshReferralData();

            // Fetch Transactions
            const txData = await walletService.getTransactionHistory();
            setTransactions(buildDisplayTransactions(txData, profile));

            // Fetch Pending Requests
            const requests = await walletService.getPendingRequests();
            setPendingRequests(requests);

            const origin = typeof window !== 'undefined' ? window.location.origin : '';
            const referralRef = profile.user_id || profile.googer_id || profile.referral_code || profile.username;
            const link = `${origin}/register?ref=${encodeURIComponent(String(referralRef || ''))}`;
            setReferralLink(link);

        } catch (error) {
            console.error("Error fetching wallet data:", error);
        } finally {
            setLoading(false);
        }
    };

    const refreshReferralData = async () => {
        const walletData = await authService.getWallet();
        if (walletData.success) {
            setReferrals(walletData.referrals || []);
            setReferralStats({
                totalReferrals: walletData.totalReferrals || 0,
                totalEarned: walletData.totalEarned || "0.00",
                levelCounts: walletData.levelCounts || {},
                levelSettings: Array.isArray(walletData.levelSettings) && walletData.levelSettings.length > 0
                    ? walletData.levelSettings
                    : DEFAULT_REFERRAL_LEVELS,
            });
        }
    };

    useEffect(() => {
        fetchAllData();
    }, [router]);

    useEffect(() => {
        if (activeTab !== 'referrals') return;
        const interval = window.setInterval(() => {
            refreshReferralData().catch((error) => console.error("Error refreshing referral data:", error));
        }, 10000);
        return () => window.clearInterval(interval);
    }, [activeTab]);

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
        const loadQrTargetUser = async () => {
            if (typeof window === 'undefined') return;
            if (localStorage.getItem(MANUAL_PAYMENT_LOCK_STORAGE_KEY) === 'true') return;

            const qrTargetId = new URLSearchParams(window.location.search).get('to')?.trim() || '';
            if (!qrTargetId) return;

            switchWalletTab('wallet');
            setTargetQuery(qrTargetId);
            setSelectedUser(null);
            setSuggestions([]);
            setShowSuggestions(false);

            try {
                const results = await walletService.searchUsers(qrTargetId);
                const matchedUser = findMatchingWalletUser(results || [], qrTargetId);

                if (matchedUser) {
                    setSelectedUser(matchedUser);
                    setTargetQuery(String(matchedUser.user_id || matchedUser.googer_id || qrTargetId));
                    setSuggestions([]);
                    setShowSuggestions(false);
                }
            } catch (error) {
                console.error("Failed to load wallet QR target user", error);
            }
        };

        loadQrTargetUser();
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
        const requestType = String(request?.type || '').toLowerCase();
        const requestDiscount = Number(request?.commission_percentage || 0);
        const isBuyDiscountRequest = requestType === 'request' && requestDiscount > 0;
        const isSellerBuyDiscountRequest = isBuyDiscountRequest
            && String(request?.sender_user_type || '').toLowerCase() === 'seller';
        setSecurityAction({
            type: 'respond',
            requestId,
            action,
            transaction: {
                type: isSellerBuyDiscountRequest ? 'SellerBuyDiscount' : (isBuyDiscountRequest ? 'Request' : 'Pay'),
                amount: parseFloat(request?.amount || 0).toFixed(2),
                discount: requestDiscount,
                recipient: `@${request?.sender_username || 'User'}`,
                counterpartyLabel: isSellerBuyDiscountRequest ? 'Request from' : undefined,
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
        const isSellerSendDiscount = String(user?.user_type || '').toLowerCase() === 'seller'
            && type === 'sell'
            && Number(commission || 0) > 0;
        const isSellerBuyDiscount = String(user?.user_type || '').toLowerCase() === 'seller'
            && type === 'buy'
            && Number(commission || 0) > 0;
        setSelectedUser(effectiveSelectedUser);
        setSecurityAction({
            type: 'transfer',
            transferType: type,
            transaction: {
                type: isSellerSendDiscount ? 'SendDiscount' : (isSellerBuyDiscount ? 'SellerBuyDiscount' : (type === 'sell' ? 'Send' : 'Request')),
                amount: effectiveAmount,
                discount: commission || 0,
                recipient: `@${effectiveSelectedUser.username} (${effectiveSelectedUser.user_id})`,
                counterpartyLabel: isSellerBuyDiscount ? 'Request to' : undefined,
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

    const shareReferralLink = async () => {
        if (!referralLink || typeof navigator === 'undefined') return;
        if (navigator.share) {
            await navigator.share({ title: 'Join Googer', url: referralLink });
            return;
        }
        navigator.clipboard.writeText(referralLink);
    };

    const formatJoinedAgo = (dateValue: string) => {
        if (!dateValue) return 'Joined recently';
        const joinedAt = new Date(dateValue).getTime();
        if (Number.isNaN(joinedAt)) return 'Joined recently';
        const diffDays = Math.max(0, Math.floor((Date.now() - joinedAt) / 86400000));
        if (diffDays === 0) return 'Joined today';
        if (diffDays === 1) return 'Joined 1 day ago';
        if (diffDays < 30) return `Joined ${diffDays} days ago`;
        const diffMonths = Math.floor(diffDays / 30);
        if (diffMonths === 1) return 'Joined 1 month ago';
        return `Joined ${diffMonths} months ago`;
    };

    const formatReferralJoinedDate = (dateValue: string) => {
        if (!dateValue) return 'Joined recently';
        const date = new Date(dateValue);
        if (Number.isNaN(date.getTime())) return 'Joined recently';
        return `Joined ${date.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
        })} | ${date.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
        })}`;
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
                <h1 className="text-black font-bold text-lg text-center tracking-wide">( My Googer ID - {formatGoogerId(user?.user_id || user?.googer_id || user?.id)} )</h1>
            </div>

            {/* Total Balance Card */}
            <div className="bg-[#070707] border border-gray-800 rounded-2xl p-6 md:p-8 mb-8 shadow-lg relative overflow-hidden transition-all hover:border-gray-700 flex flex-col items-center justify-center text-center">
                <div className="absolute top-0 right-0 w-48 h-48 bg-black/10 rounded-full blur-3xl"></div>
                <div className="relative z-10 flex flex-col items-center w-full">
                    <h2 className="text-lg md:text-xl font-bold text-white mb-4 tracking-wide">Total Wallet Balance</h2>

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
                        {WALLET_TABS.map((tab) => (
                            <button
                                key={tab}
                                onClick={() => switchWalletTab(tab)}
                                className={`pb-3 pt-4 text-[13px] font-bold transition-all border-b-2 whitespace-nowrap tracking-wide ${activeTab === tab
                                    ? 'text-white border-white'
                                    : 'text-gray-500 border-transparent hover:text-gray-300'
                                    }`}
                            >
                                {tab === 'wallet' ? 'Manage' : tab === 'transactions' ? 'History' : tab === 'request' ? 'Requests' : tab === 'referrals' ? 'Referrals' : tab === 'rewards' ? 'Rewards' : 'Affiliate'}
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
                            <div className="font-bold text-white mb-5 text-xs uppercase tracking-widest flex items-center gap-2">
                                <IonIcon name="time-outline" className="text-base text-white/65" />
                                Recent Activity
                            </div>

                            {transactions.filter((tx) => !isAnyRewardTx(tx)).length > 0 ? (
                                transactions.filter((tx) => !isAnyRewardTx(tx)).map((tx) => {
                                    const isSent = tx.sender_id === user?.id;
                                    const adCampaignPayment = isAdCampaignPayment(tx);
                                    const adMeta = adCampaignPayment ? getAdPaymentMeta(tx) : null;
                                    const adSummary = adCampaignPayment ? getAdTransactionSummary(tx) : null;
                                    const isPromoFree = Boolean(adMeta?.isPromo);
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
                                        : String(isPromoFree ? 'free' : adCampaignPayment ? 'hold' : (tx.status || ''));
                                    const sellerBuyDiscount = isSellerBuyDiscountRequest(tx);
                                    const requestLines = sellerBuyDiscount ? getCoinRequestLines(tx) : null;
                                    const sellerDiscountRefund = isSellerDiscountRefund(tx);
                                    const refundLines = sellerDiscountRefund ? getSellerDiscountRefundLines(tx) : null;
                                    const productDiscountRefund = isProductDiscountRefund(tx);
                                    const productRefundLines = productDiscountRefund ? getProductDiscountRefundLines(tx) : null;
                                    const googerCommissionTx = isGoogerCommissionTx(tx);
                                    const productDiscountTx = isProductDiscountTx(tx);
                                    const sellerDirectDiscount = isSellerDirectDiscount(tx);
                                    const directDiscountLines = sellerDirectDiscount ? getSellerDirectDiscountLines(tx) : null;
                                    const sellDiscountRequest = isSellDiscountRequest(tx);
                                    const sellDiscountLines = sellDiscountRequest ? getSellDiscountRequestLines(tx) : null;
                                    const normalDiscountRequest = isNormalDiscountRequest(tx);
                                    const noDiscountBuyRequest = isNoDiscountBuyRequest(tx);
                                    const noDiscountSellTransfer = isNoDiscountSellTransfer(tx);
                                    const walletTypeLabel = formatWalletTypeLabel(tx);
                                    const displayAmount = sellerDirectDiscount ? getSellerDiscountAmount(tx) : getWalletDisplayAmount(tx, isSent);

                                    return (
                                        <div key={tx.id} className="bg-gray-800/20 border border-gray-800 rounded-xl p-4 hover:bg-gray-800/40 transition-all group">
                                            <div className="flex items-center gap-4">
                                                <div className={`w-12 h-12 ${adCampaignPayment ? 'bg-rose-500/10 text-rose-300' : isSent ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'} rounded-xl flex items-center justify-center text-xl shrink-0`}>
                                                    <IonIcon name={adCampaignPayment ? 'megaphone-outline' : tx.type === 'request' ? 'paper-plane-outline' : (isSent ? 'arrow-up-outline' : 'arrow-down-outline')} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-center mb-0.5">
                                                        <h5 className="font-bold text-white text-sm">
                                                            {adCampaignPayment ? `${adMeta?.mediaType || 'Photo'} Promotion${isPromoFree ? ' (Free)' : ''}` : googerCommissionTx ? 'Sent To: ' : tx.type === 'request' ? (isSent ? 'Requested From: ' : 'Requested By: ') : (isSent ? 'Sent To: ' : 'Received From: ')}
                                                            {!adCampaignPayment && <span className="text-white/65">{googerCommissionTx ? 'Googer Commission' : `${otherUserName || 'Unknown User'}${otherUserReadableId ? ` (ID ${otherUserReadableId})` : ''}`}</span>}
                                                        </h5>
                                                        <span className={`text-sm font-bold tracking-tight ${isPromoFree ? 'text-emerald-400' : isSent ? 'text-red-400' : 'text-green-400'}`}>
                                                            {isPromoFree ? 'Free' : `${isSent ? (tx.type === 'request' ? '' : '-') : '+'} R ${displayAmount.toFixed(2)}`}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <p className="text-[10px] text-gray-400 font-semibold mb-1">
                                                            {formatWalletTransactionDate(tx.created_at)} | {formatWalletTransactionTime(tx.created_at)}
                                                        </p>
                                                        <span className={`text-[9px] uppercase font-black px-2 py-1 rounded-md bg-gray-900/50 ${isPromoFree ? 'text-emerald-400' : adCampaignPayment ? 'text-rose-300' : tx.type === 'transfer' ? 'text-white/65' : tx.type === 'request' ? 'text-white/65' : 'text-amber-400'}`}>
                                                            {isPromoFree ? 'Promo' : adCampaignPayment ? 'Promotion' : tx.type === 'transfer' ? 'Transferred' : tx.type === 'request' ? 'Requested' : walletTypeLabel}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <div className="min-w-0 pr-2">
                                                            {adCampaignPayment && adSummary ? (
                                                                <div className="space-y-0.5 text-[10px] text-gray-500 font-medium italic">
                                                                    <p className="truncate">{adSummary.title}</p>
                                                                    <p>Status: {adSummary.statusLabel}</p>
                                                                    <p>Hold Amount: {adSummary.holdAmountLabel}</p>
                                                                    <p>Deducted Amount: {adSummary.deductedAmountLabel}</p>
                                                                </div>
                                                            ) : productDiscountRefund && productRefundLines ? (
                                                                <div className="space-y-1 text-[10px] text-gray-500 font-medium">
                                                                    <p>{productRefundLines.productDiscount}</p>
                                                                    <p>{productRefundLines.deductionNote}</p>
                                                                </div>
                                                            ) : googerCommissionTx ? (
                                                                <p className="text-[10px] text-gray-500 font-medium">
                                                                    Googer Commission Fee
                                                                </p>
                                                            ) : productDiscountTx ? (
                                                                <p className="text-[10px] text-gray-500 font-medium">
                                                                    {getProductDiscountLine(tx)}
                                                                </p>
                                                            ) : sellDiscountRequest && sellDiscountLines ? (
                                                                <div className="space-y-0.5 text-[10px] text-gray-500 font-medium">
                                                                    <p>{sellDiscountLines.sendCoin}</p>
                                                                    <p>{sellDiscountLines.discountRequest}</p>
                                                                </div>
                                                            ) : normalDiscountRequest ? (
                                                                <p className="text-[10px] text-gray-500 font-medium">
                                                                    {getNormalDiscountRequestLine(tx)}
                                                                </p>
                                                            ) : noDiscountBuyRequest ? (
                                                                <p className="text-[10px] text-gray-500 font-medium">
                                                                    Coin Request
                                                                </p>
                                                            ) : noDiscountSellTransfer ? (
                                                                <p className="text-[10px] text-gray-500 font-medium">
                                                                    Direct Coin Transfer
                                                                </p>
                                                            ) : sellerDirectDiscount && directDiscountLines ? (
                                                                <div className="space-y-1 text-[10px] text-gray-500 font-medium">
                                                                    <p>{directDiscountLines.sendDiscount}</p>
                                                                </div>
                                                            ) : sellerDiscountRefund && refundLines ? (
                                                                <div className="space-y-1 text-[10px] text-gray-500 font-medium">
                                                                    <p>{refundLines.sendDiscount}</p>
                                                                    <p>{refundLines.deductionNote}</p>
                                                                </div>
                                                            ) : (
                                                                sellerBuyDiscount && requestLines ? (
                                                                    <div className="space-y-0.5 text-[10px] text-gray-500 font-medium">
                                                                        <p>{requestLines.coinRequest}</p>
                                                                        <p>{requestLines.sendDiscount}</p>
                                                                    </div>
                                                                ) : (
                                                                    <p className="text-[10px] text-gray-500 font-medium italic">
                                                                        {getDisplayNote(tx, isSent ? (tx.type === 'request' ? 'Coin Request Sent' : 'Direct coin transfer') : 'Coins received')}
                                                                        {tx.commission_percentage > 0 && ` (Incl. ${tx.commission_percentage}% discount)`}
                                                                    </p>
                                                                )
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className={`text-[9px] uppercase font-bold ${displayedStatus === 'completed' || displayedStatus === 'received' || displayedStatus === 'free' ? 'text-green-500' : 'text-amber-500'}`}>
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
                                pendingRequests.map((req) => {
                                    const sellerBuyDiscount = isSellerBuyDiscountRequest(req);
                                    const requestLines = sellerBuyDiscount ? getCoinRequestLines(req) : null;
                                    const sellDiscountRequest = isSellDiscountRequest(req);
                                    const sellDiscountLines = sellDiscountRequest ? getSellDiscountRequestLines(req) : null;
                                    const normalDiscountRequest = isNormalDiscountRequest(req);
                                    const noDiscountBuyRequest = isNoDiscountBuyRequest(req);
                                    return (
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
                                                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                                                            {formatWalletTransactionDate(req.created_at)} | {formatWalletTransactionTime(req.created_at)}
                                                        </span>
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
                                                        {sellerBuyDiscount ? `Send Discount ${req.commission_percentage}%` : `Incl. ${req.commission_percentage}% Discount`}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {(sellerBuyDiscount || sellDiscountRequest || normalDiscountRequest || noDiscountBuyRequest || req.note) && (
                                            <div className="mt-4 p-3 bg-[#030303] rounded-xl border border-gray-800">
                                                {sellerBuyDiscount && requestLines ? (
                                                    <div className="space-y-1 text-[10px] text-gray-400 font-medium">
                                                        <p>{requestLines.coinRequest}</p>
                                                        <p>{requestLines.sendDiscount}</p>
                                                    </div>
                                                ) : sellDiscountRequest && sellDiscountLines ? (
                                                    <div className="space-y-1 text-[10px] text-gray-400 font-medium">
                                                        <p>{sellDiscountLines.sendCoin}</p>
                                                        <p>{sellDiscountLines.discountRequest}</p>
                                                    </div>
                                                ) : normalDiscountRequest ? (
                                                    <p className="text-[10px] text-gray-400 font-medium">
                                                        {getNormalDiscountRequestLine(req)}
                                                    </p>
                                                ) : noDiscountBuyRequest ? (
                                                    <p className="text-[10px] text-gray-400 font-medium">
                                                        Coin Request
                                                    </p>
                                                ) : (
                                                    <p className="text-[10px] text-gray-400 font-medium italic">"{req.note}"</p>
                                                )}
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
                                    );
                                })
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
                        <div className="rounded-2xl border border-gray-800 bg-[#030303] px-4 py-5 shadow-[0_18px_50px_rgba(0,0,0,0.35)] sm:px-6">
                            <h3 className="mb-6 text-2xl font-black tracking-tight text-white sm:text-3xl">My Referral Network</h3>

                            <div className="mb-7 rounded-xl border border-gray-800 bg-black/60 px-4 py-3 text-sm leading-tight text-white/85 sm:text-base">
                                <p>
                                    <span className="font-black">Total Earnings: </span>
                                    <span className="font-black underline underline-offset-4">R {Number(referralStats.totalEarned || 0).toFixed(2)}</span>
                                </p>
                                <p>Total Referrals: {referralStats.totalReferrals || referrals.length}</p>
                            </div>

                            {referrals.length > 0 ? (
                                <div className="space-y-3">
                                    {(() => {
                                        const configuredLevels = Array.isArray(referralStats.levelSettings) && referralStats.levelSettings.length > 0
                                            ? referralStats.levelSettings
                                            : DEFAULT_REFERRAL_LEVELS;
                                        const referralOnlyLevels = referrals
                                            .map((ref) => Number(ref.level || ref.stored_level || 1))
                                            .filter((level) => Number.isFinite(level) && level > 0)
                                            .map((level) => ({ level, name: `Level ${level}`, sort_order: level }));
                                        const levelMap = new Map<number, any>();
                                        [...configuredLevels, ...referralOnlyLevels].forEach((entry) => {
                                            const level = Number(entry.level || 0);
                                            if (!Number.isFinite(level) || level <= 0 || level === 99) return;
                                            if (!levelMap.has(level)) levelMap.set(level, entry);
                                        });
                                        const referralsByUserId = new Map<string, any>();
                                        referrals.forEach((ref) => {
                                            if (ref.referred_user_id) referralsByUserId.set(String(ref.referred_user_id), ref);
                                        });
                                        const directRootIds = referrals
                                            .filter((ref) => Number(ref.level || 1) === 1)
                                            .map((ref) => String(ref.referred_user_id || ""))
                                            .filter(Boolean);
                                        const rootCache = new Map<string, string>();
                                        const getRootId = (ref: any): string => {
                                            const ownId = String(ref.referred_user_id || "");
                                            if (!ownId) return "";
                                            if (rootCache.has(ownId)) return rootCache.get(ownId) || ownId;
                                            const visited = new Set<string>();
                                            let cursor = ref;
                                            while (cursor?.referred_by && !visited.has(String(cursor.referred_user_id || ""))) {
                                                const cursorId = String(cursor.referred_user_id || "");
                                                visited.add(cursorId);
                                                const parent = referralsByUserId.get(String(cursor.referred_by));
                                                if (!parent) break;
                                                cursor = parent;
                                            }
                                            const rootId = String(cursor?.referred_user_id || ownId);
                                            rootCache.set(ownId, rootId);
                                            return rootId;
                                        };
                                        const getBranchColor = (ref: any) => {
                                            const rootId = getRootId(ref);
                                            const rootIndex = Math.max(0, directRootIds.indexOf(rootId));
                                            return REFERRAL_BRANCH_COLORS[rootIndex % REFERRAL_BRANCH_COLORS.length];
                                        };
                                        return Array.from(levelMap.values())
                                            .sort((a, b) => Number(a.sort_order ?? a.level) - Number(b.sort_order ?? b.level))
                                            .map((levelConfig) => {
                                        const level = Number(levelConfig.level || 1);
                                        const levelRefs = referrals.filter((ref) => Number(ref.level || 1) === level);
                                        const levelName = levelConfig.name || `Level ${level}`;
                                        const countLabel = level === 1 ? `${levelRefs.length} referrals` : `${levelRefs.length} ref`;

                                        return (
                                            <details key={level} open={level === 1} className="group rounded-xl border border-transparent px-2 py-2 transition-colors open:border-gray-800 open:bg-black/35">
                                                <summary className="flex cursor-pointer list-none items-center gap-2 text-[13px] font-black text-white/90 transition-colors hover:text-white sm:text-sm">
                                                    <span className="inline-block h-0 w-0 border-y-[5px] border-y-transparent border-l-[9px] border-l-white/90 transition-transform group-open:rotate-90" />
                                                    <span className="truncate">Level {level} [{levelName}] - ({countLabel})</span>
                                                </summary>

                                                {levelRefs.length > 0 && (
                                                    <div className="mt-3 space-y-2 pl-5 sm:pl-6">
                                                        {levelRefs.map((ref, idx) => {
                                                            const earnedAmount = Number(ref.amount || ref.earned_amount || 0);
                                                            return (
                                                                <div key={`${level}-${ref.referred_user_id || idx}`} className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.04] bg-white/[0.02] px-3 py-2 text-sm text-white/85 transition-colors hover:border-white/[0.08] hover:bg-white/[0.04]">
                                                                    <div className="flex min-w-0 items-center gap-3">
                                                                        <span
                                                                            className="h-3.5 w-3.5 shrink-0 rounded-full shadow-[0_0_14px_currentColor]"
                                                                            style={{ backgroundColor: getBranchColor(ref), color: getBranchColor(ref) }}
                                                                        />
                                                                        <div className="min-w-0">
                                                                            <p className="truncate text-[13px] font-bold text-white/90">
                                                                                {ref.referred_full_name || ref.referred_username || 'User'}
                                                                            </p>
                                                                            <p className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-wide text-white/45">
                                                                                {formatReferralJoinedDate(ref.created_at)}
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                    {earnedAmount > 0 && (
                                                                        <span className="shrink-0 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[11px] font-black text-emerald-400">
                                                                            + R {earnedAmount.toFixed(2)}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </details>
                                        );
                                            });
                                    })()}
                                </div>
                            ) : (
                                <div className="rounded-xl border border-gray-800 bg-black/35 py-8 text-center">
                                    <IonIcon name="people-outline" className="mb-3 text-2xl text-gray-600" />
                                    <p className="text-xs font-bold text-gray-500">No registered referrals yet</p>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'rewards' && (() => {
                        const adCoinTxs = transactions.filter((tx) => isAdCoinRewardTx(tx) && tx.receiver_id === user?.id);
                        const adCoinTotal = adCoinTxs.reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0);
                        return (
                            <div className="space-y-4">
                                <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-4 py-3 flex items-center justify-between gap-4">
                                    <div className="min-w-0">
                                        <p className="text-[9px] text-white/40 font-bold uppercase tracking-widest mb-0.5">Total Rewards</p>
                                        <p className="text-lg font-bold text-amber-400 tracking-tight leading-tight">R {adCoinTotal.toFixed(2)}</p>
                                    </div>
                                    <IonIcon name="ribbon-outline" className="text-2xl text-amber-400/60 shrink-0" />
                                </div>

                                <div className="font-bold text-white mb-5 text-xs uppercase tracking-widest flex items-center gap-2">
                                    <IonIcon name="ribbon-outline" className="text-base text-amber-400" />
                                    Ad Coin Rewards
                                </div>
                                {adCoinTxs.length === 0 ? (
                                    <div className="py-16 text-center">
                                        <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <IonIcon name="gift-outline" className="text-3xl text-white/40" />
                                        </div>
                                        <p className="text-gray-500 font-bold uppercase tracking-widest text-[10px]">No ad coin rewards yet</p>
                                        <p className="text-gray-600 text-[10px] mt-2">Like a sponsored ad and collect the Ruppier coin reward</p>
                                    </div>
                                ) : (
                                    adCoinTxs.map((tx) => {
                                        const displayNote = String(tx?.note || '')
                                            .replace(/Ad Coin Reward Balance - Unused Levels/i, 'Referral level amounts are deducted first. This is the remaining discount balance added to your wallet.');
                                        return (
                                            <div key={tx.id} className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 mb-3">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 bg-amber-500/10 text-amber-400 rounded-xl flex items-center justify-center text-xl shrink-0 font-black">
                                                        R
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex justify-between items-center mb-0.5">
                                                            <h5 className="font-bold text-white text-sm">Ad Coin Reward</h5>
                                                            <span className="text-sm font-bold tracking-tight text-amber-400">
                                                                + R {parseFloat(tx.amount || 0).toFixed(2)}
                                                            </span>
                                                        </div>
                                                        <div className="flex justify-between items-center">
                                                            <p className="text-[10px] text-gray-400 font-semibold">
                                                                {formatWalletTransactionDate(tx.created_at)} | {formatWalletTransactionTime(tx.created_at)}
                                                            </p>
                                                            <span className="text-[9px] uppercase font-black px-2 py-1 rounded-md bg-amber-500/10 text-amber-400">
                                                                Collected
                                                            </span>
                                                        </div>
                                                        {displayNote && (
                                                            <p className="text-[10px] text-gray-500 font-medium italic mt-1">{displayNote}</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        );
                    })()}

                    {activeTab === 'affiliate' && (() => {
                        const resellTxs = transactions.filter((tx) => isResellRewardTx(tx) && tx.receiver_id === user?.id);
                        const resellReceivedTotal = resellTxs
                            .filter((tx) => ['completed', 'accepted'].includes(String(tx?.status || '').toLowerCase()))
                            .reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0);
                        const resellPendingTotal = resellTxs
                            .filter((tx) => String(tx?.status || '').toLowerCase() === 'pending')
                            .reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0);
                        return (
                            <div className="space-y-4">
                                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] px-4 py-3 flex items-center justify-between gap-4">
                                    <div className="min-w-0">
                                        <p className="text-[9px] text-white/40 font-bold uppercase tracking-widest mb-0.5">Total Resell Commission</p>
                                        <p className="text-lg font-bold text-emerald-400 tracking-tight leading-tight">R {resellReceivedTotal.toFixed(2)}</p>
                                        {resellPendingTotal > 0 && (
                                            <p className="text-[10px] text-amber-400/80 font-semibold mt-0.5">On Hold: R {resellPendingTotal.toFixed(2)}</p>
                                        )}
                                    </div>
                                    <IonIcon name="cash-outline" className="text-2xl text-emerald-400/60 shrink-0" />
                                </div>

                                <div className="font-bold text-white mb-5 text-xs uppercase tracking-widest flex items-center gap-2">
                                    <IonIcon name="cash-outline" className="text-base text-emerald-400" />
                                    Resell Commission Earnings
                                </div>
                                {resellTxs.length === 0 ? (
                                    <div className="py-16 text-center">
                                        <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <IonIcon name="cash-outline" className="text-3xl text-white/40" />
                                        </div>
                                        <p className="text-gray-500 font-bold uppercase tracking-widest text-[10px]">No resell earnings yet</p>
                                        <p className="text-gray-600 text-[10px] mt-2">Share a product resell link and earn when someone buys</p>
                                    </div>
                                ) : (
                                    resellTxs.map((tx) => {
                                        const status = String(tx?.status || '').toLowerCase();
                                        const isPending = status === 'pending';
                                        const isReleased = status === 'completed' || status === 'accepted';
                                        return (
                                            <div key={tx.id} className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 mb-3">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 bg-emerald-500/10 text-emerald-400 rounded-xl flex items-center justify-center text-xl shrink-0 font-black">
                                                        R
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex justify-between items-center mb-0.5">
                                                            <h5 className="font-bold text-white text-sm">Resell Commission</h5>
                                                            <span className={`text-sm font-bold tracking-tight ${isPending ? 'text-amber-400' : 'text-emerald-400'}`}>
                                                                {isPending ? '' : '+ '}R {parseFloat(tx.amount || 0).toFixed(2)}
                                                            </span>
                                                        </div>
                                                        <div className="flex justify-between items-center">
                                                            <p className="text-[10px] text-gray-400 font-semibold">
                                                                {formatWalletTransactionDate(tx.created_at)} | {formatWalletTransactionTime(tx.created_at)}
                                                            </p>
                                                            <span className={`text-[9px] uppercase font-black px-2 py-1 rounded-md ${isPending ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                                                                {isPending ? 'On Hold' : isReleased ? 'Received' : status}
                                                            </span>
                                                        </div>
                                                        {tx.note && (
                                                            <p className="text-[10px] text-gray-500 font-medium italic mt-1 truncate">{tx.note}</p>
                                                        )}
                                                        <p className="text-[10px] text-gray-500 font-medium italic mt-1">
                                                            Referral level amounts are deducted first. This is the remaining discount balance added to your wallet.
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        );
                    })()}
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
                                onClick={() => switchWalletTab('transactions')}
                                className="text-[9px] text-white/55 font-bold uppercase tracking-widest hover:text-white hover:underline"
                            >
                                View All History
                            </button>
                        </div>

                        <div className="space-y-2">
                            {transactions.filter((tx) => !isAnyRewardTx(tx)).slice(0, 3).length > 0 ? (
                                transactions.filter((tx) => !isAnyRewardTx(tx)).slice(0, 3).map((tx) => {
                                    const isSent = tx.sender_id === user?.id;
                                    const adCampaignPayment = isAdCampaignPayment(tx);
                                    const adMeta = adCampaignPayment ? getAdPaymentMeta(tx) : null;
                                    const adSummary = adCampaignPayment ? getAdTransactionSummary(tx) : null;
                                    const isPromoFree = Boolean(adMeta?.isPromo);
                                    const counterpartyLine = adCampaignPayment ? `${adMeta?.mediaType || 'Photo'} Promotion${isPromoFree ? ' (Free)' : ''}` : formatWalletCounterparty(tx, user?.id);
                                    const typeLabel = adCampaignPayment ? (isPromoFree ? 'Promotion Free' : 'Promotion Hold') : formatWalletTypeLabel(tx);
                                    const sellerBuyDiscount = isSellerBuyDiscountRequest(tx);
                                    const requestLines = sellerBuyDiscount ? getCoinRequestLines(tx) : null;
                                    const sellerDiscountRefund = isSellerDiscountRefund(tx);
                                    const refundLines = sellerDiscountRefund ? getSellerDiscountRefundLines(tx) : null;
                                    const productDiscountRefund = isProductDiscountRefund(tx);
                                    const productRefundLines = productDiscountRefund ? getProductDiscountRefundLines(tx) : null;
                                    const googerCommissionTx = isGoogerCommissionTx(tx);
                                    const productDiscountTx = isProductDiscountTx(tx);
                                    const sellerDirectDiscount = isSellerDirectDiscount(tx);
                                    const directDiscountLines = sellerDirectDiscount ? getSellerDirectDiscountLines(tx) : null;
                                    const sellDiscountRequest = isSellDiscountRequest(tx);
                                    const sellDiscountLines = sellDiscountRequest ? getSellDiscountRequestLines(tx) : null;
                                    const normalDiscountRequest = isNormalDiscountRequest(tx);
                                    const noDiscountBuyRequest = isNoDiscountBuyRequest(tx);
                                    const noDiscountSellTransfer = isNoDiscountSellTransfer(tx);
                                    const compactDescription = adCampaignPayment && adSummary
                                        ? `${adSummary.title} | Status: ${adSummary.statusLabel} | Hold Amount: ${adSummary.holdAmountLabel} | Deducted Amount: ${adSummary.deductedAmountLabel}`
                                        : productDiscountRefund && productRefundLines
                                            ? ''
                                        : googerCommissionTx
                                            ? 'Googer Commission Fee'
                                        : productDiscountTx
                                            ? getProductDiscountLine(tx)
                                        : noDiscountBuyRequest
                                            ? 'Coin Request'
                                        : noDiscountSellTransfer
                                            ? 'Direct Coin Transfer'
                                        : normalDiscountRequest
                                            ? ''
                                        : sellDiscountRequest && sellDiscountLines
                                            ? ''
                                        : sellerDirectDiscount && directDiscountLines
                                            ? ''
                                        : sellerDiscountRefund && refundLines
                                            ? ''
                                        : sellerBuyDiscount && requestLines
                                            ? ''
                                        : tx.note || isGoogerPaymentOrderHold(tx)
                                            ? `${typeLabel} - ${getDisplayNote(tx, '')}`.replace(/ - $/, '')
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
                                                        {formatWalletTransactionDate(tx.created_at)} | {formatWalletTransactionTime(tx.created_at)}
                                                    </p>
                                                    {productDiscountRefund && productRefundLines ? (
                                                        <div className="mt-1 space-y-0.5 text-[9px] text-gray-500 font-medium break-words">
                                                            <p>{productRefundLines.productDiscount}</p>
                                                            <p>{productRefundLines.deductionNote}</p>
                                                        </div>
                                                    ) : googerCommissionTx ? (
                                                        <p className="mt-1 text-[9px] text-gray-500 font-medium break-words">
                                                            Googer Commission Fee
                                                        </p>
                                                    ) : productDiscountTx ? (
                                                        <p className="mt-1 text-[9px] text-gray-500 font-medium break-words">
                                                            {getProductDiscountLine(tx)}
                                                        </p>
                                                    ) : sellDiscountRequest && sellDiscountLines ? (
                                                        <div className="mt-1 space-y-0.5 text-[9px] text-gray-500 font-medium break-words">
                                                            <p>{sellDiscountLines.sendCoin}</p>
                                                            <p>{sellDiscountLines.discountRequest}</p>
                                                        </div>
                                                    ) : normalDiscountRequest ? (
                                                        <p className="mt-1 text-[9px] text-gray-500 font-medium break-words">
                                                            {getNormalDiscountRequestLine(tx)}
                                                        </p>
                                                    ) : noDiscountBuyRequest ? (
                                                        <p className="mt-1 text-[9px] text-gray-500 font-medium break-words">
                                                            Coin Request
                                                        </p>
                                                    ) : noDiscountSellTransfer ? (
                                                        <p className="mt-1 text-[9px] text-gray-500 font-medium break-words">
                                                            Direct Coin Transfer
                                                        </p>
                                                    ) : sellerDirectDiscount && directDiscountLines ? (
                                                        <div className="mt-1 space-y-0.5 text-[9px] text-gray-500 font-medium break-words">
                                                            <p>{directDiscountLines.sendDiscount}</p>
                                                        </div>
                                                    ) : sellerDiscountRefund && refundLines ? (
                                                        <div className="mt-1 space-y-0.5 text-[9px] text-gray-500 font-medium break-words">
                                                            <p>{refundLines.sendDiscount}</p>
                                                            <p>{refundLines.deductionNote}</p>
                                                        </div>
                                                    ) : sellerBuyDiscount && requestLines ? (
                                                        <div className="mt-1 space-y-0.5 text-[9px] text-gray-500 font-medium break-words">
                                                            <p>{requestLines.coinRequest}</p>
                                                            <p>{requestLines.sendDiscount}</p>
                                                        </div>
                                                    ) : (
                                                        <p className="text-[9px] text-gray-500 font-medium italic mt-1 break-words">
                                                            {compactDescription}
                                                        </p>
                                                    )}
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
