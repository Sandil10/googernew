"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import IonIcon from '../../../components/IonIcon';
import { authService } from '../../../../services/authService';

export default function Topup() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<'topup' | 'pending' | 'complete'>('topup');
    const [amount, setAmount] = useState('1000');
    const [paymentMethod, setPaymentMethod] = useState('bank');
    const [balance, setBalance] = useState(0);

    useEffect(() => {
        const fetchBalance = async () => {
            try {
                const profile = await authService.getProfile();
                setBalance(parseFloat(profile.wallet_balance) || 0);
            } catch (error) {
                console.error("Error fetching balance:", error);
            }
        };
        fetchBalance();
    }, []);

    const handlePayment = () => {
        if (paymentMethod === 'bank') {
            router.push(`/dashboard/wallet/topup/bank-transfer?amount=${amount}`);
        } else {
            alert("Redirecting to payment gateway...");
        }
    };

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

            <h1 className="text-2xl font-bold mb-6 text-white">Top Up</h1>

            {/* Main Card */}
            <div className="bg-[#162033] border border-gray-800 rounded-2xl overflow-hidden mb-20 shadow-lg">
                {/* Tabs */}
                <div className="border-b border-gray-800 px-6">
                    <div className="flex gap-6 overflow-x-auto scrollbar-hide">
                        {[
                            { key: 'topup', label: 'Topup Coins' },
                            { key: 'pending', label: 'Pending' },
                            { key: 'complete', label: 'Complete' }
                        ].map((tab) => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key as any)}
                                className={`pb-3 pt-4 text-sm font-semibold transition-all border-b-2 whitespace-nowrap ${activeTab === tab.key
                                    ? 'text-white border-white'
                                    : 'text-gray-500 border-transparent hover:text-gray-300'
                                    }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 md:p-8 min-h-[400px]">
                    {activeTab === 'topup' && (
                        <div className="max-w-md mx-auto">
                            <h4 className="text-lg font-bold text-white mb-6 text-center">Topup Coins</h4>

                            {/* Total Coins Card */}
                            <div className="bg-[#162033] border border-gray-700 rounded-xl p-5 mb-6 relative overflow-hidden">
                                <p className="text-gray-400 text-[10px] uppercase tracking-widest font-bold mb-3">Available Balance</p>
                                <div className="flex flex-row items-center gap-2 flex-nowrap">
                                    <div className="relative w-10 h-5 shrink-0">
                                        <Image src="/assets/images/rupee.png" alt="Rupee" fill className="object-contain" priority />
                                    </div>
                                    <h2 className="text-3xl font-bold text-white whitespace-nowrap leading-none">
                                        {balance.toFixed(2)}
                                    </h2>
                                </div>
                            </div>

                            <div className="space-y-6">
                                {/* Amount Input */}
                                <div>
                                    <label className="block text-center text-gray-400 text-xs font-semibold mb-3">Enter Coin Amount</label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={amount}
                                            onChange={(e) => setAmount(e.target.value)}
                                            className="w-full bg-[#0d1421] border border-gray-700 rounded-xl px-4 py-3 text-white text-center text-lg font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-inner"
                                            placeholder="1000"
                                        />
                                        <div className="text-center mt-2">
                                            <p className="text-gray-500 text-xs font-medium">{amount || '0'} Coins = $3.1</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Payment Methods */}
                                <div className="space-y-4">
                                    <p className="text-center text-gray-400 text-xs font-semibold mb-2">Select Payment Method</p>

                                    <div className="space-y-3 max-w-xs mx-auto">
                                        {[
                                            { id: 'bank', label: 'Direct Bank Transfer' },
                                            { id: 'payeer', label: 'Pay with Payeer' },
                                            { id: 'paypal', label: 'Pay with Paypal' }
                                        ].map((method) => (
                                            <label key={method.id} className="flex items-center gap-3 cursor-pointer group bg-white/5 p-3 rounded-xl border border-transparent hover:border-white/10 transition-all">
                                                <div className="relative">
                                                    <input
                                                        type="radio"
                                                        name="payment"
                                                        checked={paymentMethod === method.id}
                                                        onChange={() => setPaymentMethod(method.id)}
                                                        className="sr-only"
                                                    />
                                                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${paymentMethod === method.id ? 'border-white' : 'border-gray-600'}`}>
                                                        {paymentMethod === method.id && <div className="w-2 h-2 rounded-full bg-white"></div>}
                                                    </div>
                                                </div>
                                                <span className={`text-sm font-semibold transition-colors ${paymentMethod === method.id ? 'text-white' : 'text-gray-400 group-hover:text-gray-300'}`}>{method.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex gap-4 pt-4">
                                    <button
                                        onClick={() => router.back()}
                                        className="flex-1 py-3 bg-zinc-800/80 hover:bg-zinc-800 text-white font-bold rounded-full transition-all active:scale-95 text-xs uppercase"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handlePayment}
                                        className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-full transition-all active:scale-95 shadow-lg text-xs uppercase"
                                    >
                                        Make Payment
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'pending' && (
                        <div className="py-16 text-center">
                            <IonIcon name="time-outline" className="text-3xl text-gray-700 mb-4" />
                            <p className="text-gray-500 text-sm font-medium">No Pending Topups Found</p>
                        </div>
                    )}

                    {activeTab === 'complete' && (
                        <div className="py-16 text-center">
                            <IonIcon name="checkmark-circle-outline" className="text-3xl text-gray-700 mb-4" />
                            <p className="text-gray-500 text-sm font-medium">No Completed Transactions</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Spacer for mobile bottom bar */}
            <div className="h-20 md:hidden"></div>
        </div>
    );
}
