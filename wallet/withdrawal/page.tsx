"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { authService } from '../../services/authService';

import Link from 'next/link';
import IonIcon from '../../app/components/IonIcon';

export default function Withdrawal() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<'withdrawal' | 'recent'>('withdrawal');
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
        <div className="main__inner">
            <div className="max-w-2xl mx-auto">
                {/* Back Button */}
                <div className="mb-6">
                    <button
                        onClick={() => router.back()}
                        className="flex items-center gap-2 px-4 py-2 bg-transparent text-gray-700 dark:text-white rounded-lg border border-gray-300 dark:border-white hover:bg-gray-50 dark:hover:bg-white/10 transition-colors font-medium cursor-pointer"
                    >
                        <IonIcon name="chevron-back-outline" size="small" />
                        <span className="text-base">Back</span>
                    </button>
                </div>

                {/* Main Content Card */}
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm dark:border-slate-700 dark:bg-dark2 overflow-hidden">

                    {/* Navigation Tabs */}
                    <div className="px-4 pt-2 border-b border-gray-100 dark:border-slate-800">
                        <div className="flex items-center gap-4 overflow-x-auto">
                            <button
                                onClick={() => setActiveTab('withdrawal')}
                                className={`px-4 pb-3 text-sm font-bold transition-all border-b-2 ${activeTab === 'withdrawal'
                                    ? 'text-blue-500 border-blue-500'
                                    : 'text-gray-500 border-transparent hover:text-gray-700 dark:text-gray-400'
                                    }`}
                            >
                                My Withdrawal
                            </button>
                            <button
                                onClick={() => setActiveTab('recent')}
                                className={`px-4 pb-3 text-sm font-bold transition-all border-b-2 ${activeTab === 'recent'
                                    ? 'text-blue-500 border-blue-500'
                                    : 'text-gray-500 border-transparent hover:text-gray-700 dark:text-gray-400'
                                    }`}
                            >
                                Recent Withdrawals
                            </button>
                        </div>
                    </div>

                    {/* Content Section */}
                    <div className="p-6 md:p-12 min-h-[400px]">
                        {activeTab === 'withdrawal' && (
                            <div className="animate-fade-in max-w-md mx-auto text-center">
                                <h4 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Withdrawal Money</h4>

                                {/* Balance Indicator */}
                                <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/20 rounded-2xl p-6 mb-8 relative overflow-hidden text-center">
                                    <p className="text-blue-600 dark:text-blue-400 text-[10px] font-bold mb-2 uppercase tracking-widest">Available Balance</p>
                                    <div className="flex items-center justify-center gap-4">
                                        <div className="relative w-12 h-6 md:w-16 md:h-8 shrink-0">
                                            <Image src="/assets/images/rupee.png" alt="Rupee" width={64} height={32} className="object-contain" />
                                        </div>
                                        <h2 className="text-3xl md:text-5xl font-black text-black dark:text-white tracking-tight leading-none">
                                            {balance.toFixed(2)}
                                        </h2>
                                    </div>
                                </div>

                                <div className="space-y-8">
                                    <div className="space-y-3">
                                        <label className="block text-sm font-bold text-gray-900 dark:text-white uppercase tracking-widest text-[10px]">Enter Withdrawal Amount</label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                className="w-full bg-gray-50 border border-gray-200 rounded-full px-6 py-3.5 text-center font-bold text-lg focus:outline-none focus:border-blue-500 dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                                                placeholder="0.00"
                                            />
                                        </div>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">1000 Coins = 5.6$</p>
                                    </div>

                                    <div className="flex gap-4 pt-6">
                                        <button
                                            onClick={() => router.back()}
                                            className="flex-1 py-3 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-900 dark:text-white font-bold rounded-full border border-white transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-full transition-colors shadow-sm shadow-red-500/20"
                                        >
                                            Withdrawal
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'recent' && (
                            <div className="animate-fade-in space-y-2">
                                <p className="font-bold text-gray-900 dark:text-white mb-2 ml-1 text-sm">Recent Transactions</p>

                                {/* Transaction Card 1 (Completed) */}
                                <div className="bg-white dark:bg-slate-800/40 border border-white dark:border-white rounded-xl p-3 flex items-center gap-3 transition-all hover:bg-gray-50 dark:hover:bg-white/5 shadow-sm">
                                    <div className="shrink-0 w-10 h-10 rounded-full bg-red-50 dark:bg-red-500/10 text-red-500 flex items-center justify-center">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-5 h-5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h14.25M3 9h9.75M3 13.5h5.25m5.25-.75L17.25 9m0 0L21 12.75M17.25 9v12" />
                                        </svg>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-center mb-0.5">
                                            <h5 className="font-bold text-gray-900 dark:text-white truncate text-xs">ID: 458</h5>
                                            <span className="text-[11px] font-bold text-red-500">- R 5.00</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <p className="text-[10px] text-gray-500 dark:text-gray-400">12 SEP 2012 • Promoting Ad-No 459</p>
                                            <div className="flex items-center gap-1 text-green-500 text-[9px] font-bold uppercase tracking-wider">
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
                                                    <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                                                </svg>
                                                Completed
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Transaction Card 2 (On Hold) */}
                                <div className="bg-white dark:bg-slate-800/40 border border-white dark:border-white rounded-xl p-3 flex items-center gap-3 transition-all hover:bg-gray-50 dark:hover:bg-white/5 shadow-sm">
                                    <div className="shrink-0 w-10 h-10 rounded-full bg-green-50 dark:bg-green-500/10 text-green-500 flex items-center justify-center">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-5 h-5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h14.25M3 9h9.75M3 13.5h9.75m4.5-4.5v12m0 0l-3.75-3.75M17.25 21L21 17.25" />
                                        </svg>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-center mb-0.5">
                                            <h5 className="font-bold text-gray-900 dark:text-white truncate text-xs">ID: 302</h5>
                                            <span className="text-[11px] font-bold text-green-600">+ R 15.00</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <p className="text-[10px] text-gray-500 dark:text-gray-400">12 SEP 2012 • Received Payment</p>
                                            <div className="flex items-center gap-1 text-amber-500 text-[9px] font-bold uppercase tracking-wider">
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
                                                    <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM12.75 6a.75.75 0 00-1.5 0v6c0 .414.336.75.75.75h4.5a.75.75 0 000-1.5h-3.75V6z" clipRule="evenodd" />
                                                </svg>
                                                On Hold
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Mobile Spacer */}
                <div className="h-20 md:hidden"></div>
            </div>
        </div>
    );
}
