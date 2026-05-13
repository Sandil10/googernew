"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authService } from '@/services/authService';
import { walletService } from '@/services/walletService';
import IonIcon from '@/app/components/IonIcon';
import ReceiptModal from '@/app/components/ReceiptModal';
import CancelTransactionModal from '@/app/components/CancelTransactionModal';
import { getCurrentUserIdentityKey, readAdWalletAdjustments } from '@/utils/adWallet';
import {
    formatWalletTransactionDate,
    formatWalletTransactionTime,
    getAdPaymentMeta,
    getAdTransactionSummary,
    isAdCampaignPayment,
    isPromoAdRecord,
} from '@/app/lib/walletTransactions';

const formatHistoryCounterparty = (tx: any, currentUserId?: number | string) => {
    const isSent = tx.sender_id === currentUserId;
    const fullName = isSent ? tx.receiver_full_name : tx.sender_full_name;
    const username = isSent ? tx.receiver_username : tx.sender_username;
    const readableId = isSent ? tx.receiver_readable_id : tx.sender_readable_id;
    return `${fullName || username || 'Unknown User'}${readableId ? ` (ID ${readableId})` : ''}`;
};

const isManualOrderHold = (tx: any) => {
    return String(tx?.type || '').toLowerCase() === 'order_hold'
        && /manual payment/i.test(String(tx?.note || ''));
};

const isGoogerPaymentOrderHold = (tx: any) => {
    return String(tx?.type || '').toLowerCase() === 'order_hold'
        && !/manual payment/i.test(String(tx?.note || ''));
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

export default function TransactionsPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [user, setUser] = useState<any>(null);
    const [showReceiptModal, setShowReceiptModal] = useState(false);
    const [receiptTransaction, setReceiptTransaction] = useState<any>(null);
    const [cancelTransaction, setCancelTransaction] = useState<any>(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const profile = await authService.getProfile();
                setUser(profile);
                const txData = await walletService.getTransactionHistory();
                setTransactions(buildDisplayTransactions(txData, profile));
            } catch (error) {
                console.error("Error fetching transactions:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();

        const refreshTransactions = async () => {
            try {
                const profile = await authService.getProfile();
                setUser(profile);
                const txData = await walletService.getTransactionHistory();
                setTransactions(buildDisplayTransactions(txData, profile));
            } catch (error) {
                console.error("Error refreshing transactions:", error);
            }
        };

        window.addEventListener("googer-wallet-updated", refreshTransactions);
        window.addEventListener("focus", refreshTransactions);

        return () => {
            window.removeEventListener("googer-wallet-updated", refreshTransactions);
            window.removeEventListener("focus", refreshTransactions);
        };
    }, []);

    const handleCancelTransaction = async () => {
        if (!cancelTransaction?.id) return;
        setLoading(true);
        try {
            await walletService.cancelTransaction(cancelTransaction.id);
            alert("Transaction cancelled successfully");
            const txData = await walletService.getTransactionHistory();
            setTransactions(buildDisplayTransactions(txData, user));
            setCancelTransaction(null);
        } catch (error: any) {
            alert(error.message || "Failed to cancel transaction");
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-[60vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
            </div>
        );
    }

    return (
        <div className="pb-10 min-h-screen">
            <div className="mb-4">
                <button
                    onClick={() => router.back()}
                    className="flex items-center gap-2 text-white/60 hover:text-white transition-colors"
                >
                    <IonIcon name="chevron-back-outline" className="text-xl" />
                    <span className="text-[11px] font-bold uppercase tracking-widest">Back</span>
                </button>
            </div>

            <h1 className="text-2xl font-bold mb-6 text-white">Transaction History</h1>

            <div className="bg-[#070707] border border-gray-800 rounded-2xl overflow-hidden shadow-lg">
                <div className="p-6 md:p-8">
                    <div className="space-y-4">
                        {transactions.length > 0 ? (
                            transactions.map((tx) => {
                                const isSent = tx.sender_id === user?.id;
                                const otherUser = formatHistoryCounterparty(tx, user?.id);
                                const manualOrderHold = isManualOrderHold(tx);
                                const googerPaymentOrderHold = isGoogerPaymentOrderHold(tx);
                                const adCampaignPayment = isAdCampaignPayment(tx);
                                const adPaymentMeta = adCampaignPayment ? getAdPaymentMeta(tx) : null;
                                const adSummary = adCampaignPayment ? getAdTransactionSummary(tx) : null;
                                const isPromoFree = adCampaignPayment && (isPromoAdRecord(tx) || adPaymentMeta?.isPromo);
                                const displayStatus = isPromoFree ? 'free' : adCampaignPayment ? 'hold' : tx.status;
                                const isCancellable = isSent
                                    && tx.status === 'pending'
                                    && !googerPaymentOrderHold
                                    && !adCampaignPayment
                                    && (!manualOrderHold || Boolean(tx.linked_order_can_cancel));

                                const adTitle = adPaymentMeta?.isPromo
                                    ? `${adPaymentMeta.mediaType} Promotion (Free)`
                                    : adPaymentMeta?.mediaType
                                        ? `${adPaymentMeta.mediaType} Promotion`
                                        : 'Ad Promotion';

                                return (
                                    <div key={tx.id} className="bg-gray-800/20 border border-gray-800 rounded-xl p-4 hover:bg-gray-800/40 transition-all group">
                                        <div className="flex items-center gap-4">
                                            <div className={`w-12 h-12 ${adCampaignPayment ? 'bg-rose-500/10 text-rose-300' : isSent ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'} rounded-xl flex items-center justify-center text-xl shrink-0`}>
                                                <IonIcon name={adCampaignPayment ? 'megaphone-outline' : tx.type === 'request' ? 'paper-plane-outline' : (isSent ? 'arrow-up-outline' : 'arrow-down-outline')} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-center mb-1">
                                                    <h5 className="font-bold text-white text-sm">
                                                        {adCampaignPayment ? adTitle : tx.type === 'request' ? (isSent ? 'Requested From: ' : 'Requested By: ') : (isSent ? 'Sent To: ' : 'Received From: ')}
                                                        {!adCampaignPayment && <span className="text-white/65">{otherUser}</span>}
                                                    </h5>
                                                    <div className="text-right">
                                                        {adCampaignPayment && <p className="text-[8px] font-black uppercase tracking-widest text-white/35">{isPromoFree ? 'Promo Status' : 'Hold Amount'}</p>}
                                                        <span className={`text-sm font-bold tracking-tight ${isPromoFree ? 'text-emerald-400' : isSent ? 'text-red-400' : 'text-green-400'}`}>
                                                            {isPromoFree ? 'Free' : `${isSent ? (tx.type === 'request' ? '' : '-') : '+'} R ${parseFloat(tx.amount || 0).toFixed(2)}`}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="flex justify-between items-center mb-1">
                                                    <p className="text-[10px] text-gray-400 font-semibold">
                                                        {formatWalletTransactionDate(tx.created_at)} | {formatWalletTransactionTime(tx.created_at)}
                                                    </p>
                                                    <span className={`text-[9px] uppercase font-black px-2 py-0.5 rounded bg-gray-900/50 ${isPromoFree ? 'text-emerald-400' : adCampaignPayment ? 'text-rose-300' : tx.type === 'transfer' ? 'text-white/65' : tx.type === 'request' ? 'text-white/65' : 'text-amber-400'}`}>
                                                        {isPromoFree ? 'Promo' : adCampaignPayment ? 'Promotion' : tx.type === 'transfer' ? 'Transferred' : tx.type === 'request' ? 'Requested' : tx.type}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <div className="pr-2 min-w-0">
                                                        {adCampaignPayment && adSummary ? (
                                                            <div className="space-y-0.5 text-[10px] text-gray-500 italic">
                                                                <p className="truncate">{adSummary.title}</p>
                                                                <p>Status: {adSummary.statusLabel}</p>
                                                                <p>Hold Amount: {adSummary.holdAmountLabel}</p>
                                                                <p>Deducted Amount: {adSummary.deductedAmountLabel}</p>
                                                            </div>
                                                        ) : (
                                                            <p className="text-[10px] text-gray-500 italic truncate">
                                                                {tx.note || (isSent ? (tx.type === 'request' ? 'Coin Request Sent' : 'Direct coin transfer') : 'Coins received')}
                                                                {tx.commission_percentage > 0 && ` (${tx.commission_percentage}% discount)`}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`text-[9px] uppercase font-bold ${displayStatus === 'completed' || displayStatus === 'accepted' || displayStatus === 'free' ? 'text-green-500' : 'text-amber-500'}`}>
                                                                {displayStatus === 'accepted' ? 'completed' : displayStatus}
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
                                                        {!adCampaignPayment && (
                                                            <button
                                                                onClick={() => {
                                                                    setReceiptTransaction(tx);
                                                                    setShowReceiptModal(true);
                                                                }}
                                                                className="p-1.5 bg-white/5 border border-white/10 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-all active:scale-90"
                                                                title="View Receipt"
                                                            >
                                                                <IonIcon name="receipt-outline" className="text-sm" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="py-20 text-center">
                                <IonIcon name="receipt-outline" className="text-4xl text-gray-700 mb-4" />
                                <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">No transactions yet</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <div className="h-20 md:hidden"></div>
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
                isProcessing={loading}
            />
        </div>
    );
}
