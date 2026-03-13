"use client";

import { useState } from "react";
import IonIcon from "@/app/components/IonIcon";

interface TransactionDetails {
    type: string; // "Send" | "Request" | "Pay"
    amount: string | number;
    discount?: string | number;
    recipient: string;
}

interface SecurityVerificationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onVerify: (password: string) => Promise<void>;
    isProcessing: boolean;
    transaction?: TransactionDetails;
}

export default function SecurityVerificationModal({
    isOpen,
    onClose,
    onVerify,
    isProcessing,
    transaction
}: SecurityVerificationModalProps) {
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (!password) {
            setError("Password is required");
            return;
        }

        try {
            await onVerify(password);
            setPassword("");
        } catch (err: any) {
            setError(err.message || "Invalid password");
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-[#162033] border border-gray-800 w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                <div className="p-6">
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-400">
                                <IonIcon name="shield-checkmark-outline" className="text-xl" />
                            </div>
                            <h3 className="text-sm font-bold text-white tracking-tight uppercase">
                                {transaction?.type === "Request"
                                    ? (transaction?.discount && Number(transaction.discount) > 0 
                                        ? "Request coins & Discount" 
                                        : "Request Coins")
                                    : (transaction?.discount && Number(transaction.discount) > 0
                                        ? "Send coins & Discount request"
                                        : "Send Coins")}
                            </h3>
                        </div>
                        <button
                            onClick={onClose}
                            className="text-gray-500 hover:text-white transition-colors"
                        >
                            <IonIcon name="close-outline" className="text-2xl" />
                        </button>
                    </div>

                    {/* Multi-line Transaction Details */}
                    <div className="space-y-3 mb-8 bg-[#0d1421] p-5 rounded-2xl border border-gray-800/50">
                        <div className="flex items-center justify-between mb-4 border-b border-gray-800/50 pb-4">
                            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                                {transaction?.type === "Request" ? "Request Coins" : "Send Coins"}
                            </span>
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-gray-400 uppercase">-</span>
                                <span className="text-lg font-black text-white">{transaction?.amount} Coins</span>
                            </div>
                        </div>
                        {transaction?.discount && Number(transaction.discount) > 0 && (
                            <div className="flex items-center justify-between mb-4 border-b border-gray-800/50 pb-4">
                                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Discount</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-gray-400 uppercase">-</span>
                                    <span className="text-lg font-black text-blue-400">{transaction?.discount}%</span>
                                </div>
                            </div>
                        )}
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                                {transaction?.type === "Request" ? "Request from" : "Send to"}
                            </span>
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-gray-400 uppercase">-</span>
                                <div className="flex items-center gap-2 bg-[#162033] px-3 py-1.5 rounded-lg border border-gray-800/50">
                                    <IonIcon name="person" className="text-xs text-blue-400" />
                                    <span className="text-sm font-bold text-white tracking-wide">{transaction?.recipient}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 px-1">
                                Enter Password to Verify
                            </label>
                            <div className="relative">
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className={`w-full bg-[#0d1421] border ${error ? 'border-red-500/50' : 'border-gray-800'} rounded-xl px-4 py-3.5 text-white placeholder:text-gray-700 focus:outline-none focus:border-blue-500 transition-all shadow-inner font-mono`}
                                    autoFocus
                                />
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-600">
                                    <IonIcon name="lock-closed-outline" />
                                </div>
                            </div>
                            {error && (
                                <p className="text-red-500 text-[10px] font-bold mt-2 px-1 animate-pulse italic">
                                    {error}
                                </p>
                            )}
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 py-3.5 bg-gray-800 hover:bg-gray-700 text-white font-bold rounded-xl text-xs uppercase tracking-widest transition-all active:scale-95 border border-white/5"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isProcessing}
                                className="flex-1 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50 disabled:scale-100 shadow-lg shadow-blue-900/40"
                            >
                                {isProcessing ? "Verifying..." : "Verify & Confirm"}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
