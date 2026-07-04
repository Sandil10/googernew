import IonIcon from '@/app/components/IonIcon';

interface CancelTransactionModalProps {
    isOpen: boolean;
    transaction: any;
    onClose: () => void;
    onConfirm: () => void;
    isProcessing: boolean;
}

const getTransactionTitle = (transaction: any) => {
    const type = String(transaction?.type || '').toLowerCase();

    if (type === 'request') return 'Cancel Request';
    if (type === 'sell') return 'Cancel Transfer';
    if (type === 'order_hold') return 'Cancel Order Hold';
    return 'Cancel Transaction';
};

export default function CancelTransactionModal({
    isOpen,
    transaction,
    onClose,
    onConfirm,
    isProcessing
}: CancelTransactionModalProps) {
    if (!isOpen || !transaction) return null;

    const amount = Number(transaction.amount || 0).toFixed(2);
    const typeLabel = String(transaction?.type || 'transaction').replace(/_/g, ' ');
    const otherUser = transaction.sender_id === transaction?.currentUserId
        ? transaction.receiver_username
        : transaction.sender_username;

    return (
        <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="absolute inset-0" onClick={onClose} />

            <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-red-500/20 bg-[#141c2c] shadow-2xl animate-in fade-in zoom-in duration-200">
                <div className="bg-gradient-to-r from-red-600 to-rose-500 px-5 py-5 text-center">
                    <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white/15">
                        <IonIcon name="close-circle-outline" className="text-3xl text-white" />
                    </div>
                    <h3 className="text-lg font-black text-white">{getTransactionTitle(transaction)}</h3>
                    <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/80">
                        Confirm before removing this pending entry
                    </p>
                </div>

                <div className="p-5">
                    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                        <div className="space-y-2 text-sm">
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-gray-400">Transaction Type</span>
                                <span className="text-right font-bold capitalize text-white">{typeLabel}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-gray-400">Amount</span>
                                <span className="text-right font-bold text-white">R {amount}</span>
                            </div>
                            {otherUser && (
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-gray-400">User</span>
                                    <span className="text-right font-bold text-white">@{otherUser}</span>
                                </div>
                            )}
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-gray-400">Status</span>
                                <span className="text-right font-bold uppercase text-amber-400">{transaction.status}</span>
                            </div>
                        </div>
                    </div>

                    <p className="mt-4 text-center text-sm text-gray-300">
                        Are you sure you want to cancel this pending transaction?
                    </p>
                </div>

                <div className="flex gap-3 px-5 pb-5">
                    <button
                        onClick={onClose}
                        disabled={isProcessing}
                        className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 font-bold text-white transition-all hover:bg-white/10 disabled:opacity-50"
                    >
                        Keep It
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={isProcessing}
                        className="flex-1 rounded-xl bg-red-600 px-4 py-3 font-bold text-white transition-all hover:bg-red-500 disabled:opacity-50"
                    >
                        {isProcessing ? 'Cancelling...' : 'Yes, Cancel'}
                    </button>
                </div>
            </div>
        </div>
    );
}
