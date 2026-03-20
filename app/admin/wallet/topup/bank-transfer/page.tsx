"use client";

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import IonIcon from '@/app/components/IonIcon';

export default function BankTransferPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const amount = searchParams?.get('amount') || '1000';
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    return (
        <div className="pb-10 relative min-h-screen">
            {/* Back Button */}
            <div className="mb-6">
                <button
                    onClick={() => router.back()}
                    className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/50 hover:bg-gray-800 text-white rounded-full border border-gray-700 transition-colors"
                >
                    <IonIcon name="chevron-back-outline" size="small" />
                    <span className="text-xs font-medium">Back</span>
                </button>
            </div>

            <div className="max-w-xl mx-auto">
                <h1 className="text-2xl font-bold mb-8 text-white text-center">Bank Details</h1>

                {/* Main Card */}
                <div className="bg-[#162033] border border-gray-800 rounded-2xl overflow-hidden shadow-xl relative">
                    <div className="p-6 md:p-10">
                        {/* Coin Amount Indicator */}
                        <div className="bg-[#0a0a0a] rounded-xl p-5 mb-8 flex items-center justify-center gap-4 border border-gray-800/30">
                            <div className="w-10 h-10 relative flex-shrink-0">
                                <Image src="/assets/images/coin.png" alt="Coin" fill className="object-contain" />
                            </div>
                            <span className="text-white text-xl font-bold">{amount} Coins</span>
                        </div>

                        {/* Bank Info Fields */}
                        <div className="space-y-4 mb-8">
                            {[
                                { label: 'Account Name', value: 'I.p.p.c fernando' },
                                { label: 'Account Number', value: '0112755676' },
                                { label: 'Bank Branch', value: 'Commercial Bank' },
                                { label: 'Bank Name', value: 'BOC' },
                                { label: 'Branch Code', value: '12345' },
                                { label: 'Shift Code', value: 'CERWLKX' }
                            ].map((field) => (
                                <div key={field.label} className="flex items-center justify-between gap-4 group">
                                    <p className="text-gray-500 font-semibold text-[10px] uppercase tracking-wider whitespace-nowrap">{field.label} :</p>
                                    <div className="flex items-center gap-2 min-w-0">
                                        <p className="text-white font-bold truncate text-sm md:text-base">{field.value}</p>
                                        <button
                                            onClick={() => copyToClipboard(field.value)}
                                            className="text-gray-500 hover:text-white transition-colors p-1"
                                        >
                                            <IonIcon name="copy-outline" className="text-base" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="h-px bg-gray-800/50 my-8"></div>

                        {/* Upload Section */}
                        <div className="text-center mb-8">
                            <p className="text-white font-bold text-xs uppercase tracking-widest mb-4">Upload Receipt</p>
                            <div className="inline-flex flex-col sm:flex-row items-center bg-[#0d1421] rounded-xl p-2 border border-gray-800 shadow-inner w-full sm:w-auto">
                                <label className="cursor-pointer bg-white text-blue-600 px-6 py-2 rounded-lg text-xs font-bold uppercase transition-all active:scale-95 shadow-md w-full sm:w-auto">
                                    Choose File
                                    <input
                                        type="file"
                                        className="hidden"
                                        onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                                    />
                                </label>
                                <span className="px-4 py-2 text-gray-500 text-[10px] font-medium truncate max-w-[150px]">
                                    {selectedFile ? selectedFile.name : 'no file selected'}
                                </span>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col sm:flex-row gap-4 max-w-sm mx-auto">
                            <button
                                onClick={() => router.back()}
                                className="flex-1 py-3 bg-white text-black font-bold rounded-full hover:bg-gray-100 transition-all active:scale-95 text-xs uppercase shadow-lg"
                            >
                                Cancel
                            </button>
                            <button
                                className={`flex-1 py-3 font-bold rounded-full transition-all active:scale-95 text-xs uppercase shadow-lg ${selectedFile
                                    ? 'bg-[#0d1421] text-white border border-gray-700'
                                    : 'bg-gray-900 text-gray-600 cursor-not-allowed border border-gray-800/50'
                                    }`}
                                disabled={!selectedFile}
                            >
                                Buy Coins
                            </button>
                        </div>

                        {/* Terms */}
                        <div className="mt-8">
                            <p className="text-white font-bold text-[10px] uppercase tracking-widest mb-2">Terms</p>
                            <p className="text-gray-500 text-[10px] leading-relaxed font-medium">
                                Leave the googer app selected banking or payment platform that matches your name on googer
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Spacer for mobile bottom bar */}
            <div className="h-20 md:hidden"></div>
        </div>
    );
}
