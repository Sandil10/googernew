"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import IonIcon from '../../../components/IonIcon';
import { authService } from '../../../../services/authService';

export default function Withdrawal() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<'withdrawal' | 'recent'>('withdrawal');
    const [amount, setAmount] = useState('0');
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

            <h1 className="text-2xl font-bold mb-6 text-white tracking-tight">Withdrawal</h1>

            {/* Main Card */}
            <div className="bg-[#162033] border border-gray-800 rounded-2xl overflow-hidden mb-20 shadow-lg">
                {/* Tabs */}
                <div className="border-b border-gray-800 px-6">
                    <div className="flex gap-8 overflow-x-auto scrollbar-hide">
                        {[
                            { key: 'withdrawal', label: 'My Withdrawal' },
                            { key: 'recent', label: 'Recent Withdrawals' }
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
                    {activeTab === 'withdrawal' && (
                        <div className="max-w-md mx-auto">
                            <h4 className="text-lg font-bold text-white mb-6 text-center">Withdrawal Money</h4>

                            {/* Balance Indicator */}
                            <div className="bg-[#162033] border border-gray-700 rounded-xl p-5 mb-8 relative overflow-hidden flex flex-col items-center justify-center">
                                <p className="text-gray-400 text-xs mb-3 font-medium uppercase tracking-wider text-center">My total Ruppier coins</p>
                                <div className="flex items-center justify-center">
                                    <h2 className="text-3xl font-bold text-white tracking-wide">{balance.toFixed(2)}</h2>
                                </div>
                            </div>

                            <div className="space-y-6">
                                <div>
                                    <label className="block text-center text-gray-400 text-xs font-semibold mb-3">Enter Withdrawal Amount</label>
                                    <input
                                        type="text"
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        className="w-full bg-[#0d1421] border border-gray-700 rounded-xl px-4 py-3 text-white text-center text-lg font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-inner"
                                        placeholder="0.00"
                                    />
                                    <div className="text-center mt-2">
                                        {/* Conversion text removed */}
                                    </div>
                                </div>

                                <div className="flex gap-4 pt-4">
                                    <button
                                        onClick={() => router.back()}
                                        className="flex-1 py-3.5 bg-zinc-800/80 hover:bg-zinc-800 text-white font-bold rounded-full transition-all active:scale-95 text-xs uppercase"
                                    >
                                        Cancel
                                    </button>
                                    <button className="flex-1 py-3.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-full transition-all active:scale-95 shadow-lg text-xs uppercase">
                                        Withdrawal
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'recent' && (
                        <div>
                            <p className="font-bold text-white mb-6 text-sm flex items-center gap-2">
                                <IonIcon name="time-outline" className="text-lg opacity-50" />
                                Recent Withdrawals
                            </p>

                            <div className="space-y-3">
                                {[
                                    { id: 1, type: 'withdrawal', title: 'Withdrawal Success', desc: 'Transferred to bank', amount: '- R 500.00', status: 'Completed', statusColor: 'text-green-400', icon: 'arrow-up-outline', iconBg: 'bg-red-500/10', iconColor: 'text-red-400' },
                                    { id: 2, type: 'withdrawal', title: 'Withdrawal Pending', desc: 'Processing request', amount: '- R 250.00', status: 'Pending', statusColor: 'text-amber-400', icon: 'time-outline', iconBg: 'bg-amber-500/10', iconColor: 'text-amber-400' }
                                ].map((tx) => (
                                    <div key={tx.id} className="bg-gray-800/20 border border-gray-800 rounded-xl p-4 hover:bg-gray-800/40 transition-all group">
                                        <div className="flex items-center gap-4">
                                            <div className={`w-12 h-12 ${tx.iconBg} rounded-xl flex items-center justify-center ${tx.iconColor} text-xl shrink-0`}>
                                                <IonIcon name={tx.icon} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-center mb-0.5">
                                                    <h5 className="font-bold text-white text-sm tracking-tight">ID: {tx.id}58</h5>
                                                    <span className="text-sm font-bold text-white tracking-tight">{tx.amount}</span>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <p className="text-[10px] text-gray-500 font-medium">12 SEP 2012 • {tx.desc}</p>
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md bg-gray-900/50 ${tx.statusColor}`}>{tx.status}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Spacer for mobile bottom bar */}
            <div className="h-20 md:hidden"></div>
        </div>
    );
}
