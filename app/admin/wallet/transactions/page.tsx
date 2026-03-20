"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authService } from '@/services/authService';
import { walletService } from '@/services/walletService';
import IonIcon from '@/app/components/IonIcon';
import Image from 'next/image';
import { generateTransactionReceipt } from '@/utils/pdfGenerator';
import ReceiptModal from '@/app/components/ReceiptModal';

export default function TransactionsPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [user, setUser] = useState<any>(null);
    const [showReceiptModal, setShowReceiptModal] = useState(false);
    const [receiptTransaction, setReceiptTransaction] = useState<any>(null);
    const [hasShownAutoReceipt, setHasShownAutoReceipt] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const profile = await authService.getProfile();
                setUser(profile);
                const txData = await walletService.getTransactionHistory();
                setTransactions(txData);
            } catch (error) {
                console.error("Error fetching transactions:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    // Auto-show receipt
    useEffect(() => {
        if (!loading && transactions.length > 0 && !hasShownAutoReceipt) {
            setReceiptTransaction(transactions[0]);
            setShowReceiptModal(true);
            setHasShownAutoReceipt(true);
        }
    }, [loading, transactions, hasShownAutoReceipt]);

    const handleCancelTransaction = async (txId: number) => {
        if (!confirm("Are you sure you want to cancel this transaction?")) return;
        setLoading(true);
        try {
            await walletService.cancelTransaction(txId);
            alert("Transaction cancelled successfully");
            const txData = await walletService.getTransactionHistory();
            setTransactions(txData);
        } catch (error: any) {
            alert(error.message || "Failed to cancel transaction");
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-[60vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
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

            <div className="bg-[#162033] border border-gray-800 rounded-2xl overflow-hidden shadow-lg">
                <div className="p-6 md:p-8">
                    <div className="space-y-4">
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
                                                <div className="flex justify-between items-center mb-1">
                                                    <h5 className="font-bold text-white text-sm">
                                                        {tx.type === 'request' ? (isSent ? 'Requested From: ' : 'Requested By: ') : (isSent ? 'Sent To: ' : 'Received From: ')}
                                                        <span className="text-blue-400">@{otherUser}</span>
                                                    </h5>
                                                    <span className={`text-sm font-bold tracking-tight ${isSent ? 'text-red-400' : 'text-green-400'}`}>
                                                        {isSent ? (tx.type === 'request' ? '' : '-') : '+'} R {parseFloat(tx.amount).toFixed(2)}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center mb-1">
                                                    <p className="text-[10px] text-gray-400 font-semibold">
                                                        {new Date(tx.created_at).toLocaleDateString('en-GB')} • {new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </p>
                                                    <span className={`text-[9px] uppercase font-black px-2 py-0.5 rounded bg-gray-900/50 ${tx.type === 'transfer' ? 'text-blue-400' : tx.type === 'request' ? 'text-purple-400' : 'text-amber-400'}`}>
                                                        {tx.type === 'transfer' ? 'Transferred' : tx.type === 'request' ? 'Requested' : tx.type}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <p className="text-[10px] text-gray-500 italic pr-2 truncate">
                                                        {tx.note || (isSent ? (tx.type === 'request' ? 'Coin Request Sent' : 'Direct coin transfer') : 'Coins received')}
                                                        {tx.commission_percentage > 0 && ` (${tx.commission_percentage}% discount)`}
                                                    </p>
                                                    <div className="flex items-center gap-3">
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
                                                        <button
                                                            onClick={() => {
                                                                setReceiptTransaction(tx);
                                                                setShowReceiptModal(true);
                                                            }}
                                                            className="p-1.5 bg-white/5 border border-white/10 rounded-lg text-gray-400 hover:text-white hover:bg-blue-600 transition-all active:scale-90"
                                                            title="View Receipt"
                                                        >
                                                            <IonIcon name="receipt-outline" className="text-sm" />
                                                        </button>
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
            {/* Spacer for mobile bottom bar */}
            <div className="h-20 md:hidden"></div>
            <ReceiptModal
                isOpen={showReceiptModal}
                onClose={() => setShowReceiptModal(false)}
                transaction={receiptTransaction}
                currentUser={user}
            />
        </div>
    );
}
