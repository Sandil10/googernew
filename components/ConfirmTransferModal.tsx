import React from 'react';
import IonIcon from '../app/components/IonIcon';

interface ConfirmTransferModalProps {
    isOpen: boolean;
    type: 'sell' | 'buy';
    username: string;
    amount: string;
    commission: string;
    onConfirm: () => void;
    onCancel: () => void;
    isProcessing: boolean;
}

export default function ConfirmTransferModal({
    isOpen,
    type,
    username,
    amount,
    commission,
    onConfirm,
    onCancel,
    isProcessing
}: ConfirmTransferModalProps) {
    if (!isOpen) return null;

    const transferAmount = commission
        ? ((parseFloat(amount) * parseFloat(commission)) / 100).toFixed(2)
        : amount;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[#1a2332] border border-gray-700 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-6 text-center">
                    <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
                        <IonIcon
                            name={type === 'sell' ? 'arrow-up-circle' : 'arrow-down-circle'}
                            className="text-4xl text-white"
                        />
                    </div>
                    <h3 className="text-xl font-bold text-white">
                        {type === 'sell' ? 'Confirm Transfer' : 'Confirm Request'}
                    </h3>
                </div>

                {/* Body */}
                <div className="p-6 space-y-4">
                    <div className="bg-[#0f1621] border border-gray-700 rounded-xl p-4">
                        <p className="text-gray-400 text-xs uppercase tracking-wider mb-2">Transaction Details</p>
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <span className="text-gray-400 text-sm">To:</span>
                                <span className="text-white font-semibold">@{username}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-400 text-sm">Amount:</span>
                                <span className="text-white font-bold text-lg">₹ {amount}</span>
                            </div>
                            {commission && (
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-400 text-sm">Commission:</span>
                                    <span className="text-amber-400 font-semibold">{commission}%</span>
                                </div>
                            )}
                            <div className="flex justify-between items-center pt-2 border-t border-gray-700">
                                <span className="text-gray-400 text-sm">Transfer Amount:</span>
                                <span className="text-green-400 font-bold text-lg">
                                    ₹ {transferAmount}
                                </span>
                            </div>
                        </div>
                    </div>

                    <p className="text-gray-300 text-sm text-center">
                        {type === 'sell'
                            ? 'Amount will be held until receiver accepts'
                            : 'Request will be sent to the user'}
                    </p>
                </div>

                {/* Footer */}
                <div className="p-6 pt-0 flex gap-3">
                    <button
                        onClick={onCancel}
                        className="flex-1 px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-semibold transition-all duration-200 border border-gray-600"
                        disabled={isProcessing}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-xl font-semibold transition-all duration-200 shadow-lg shadow-blue-500/30"
                        disabled={isProcessing}
                    >
                        {isProcessing ? 'Processing...' : 'Confirm'}
                    </button>
                </div>
            </div>
        </div>
    );
}
