"use client";

import Image from "next/image";
import IonIcon from "./IonIcon";
import { generateTransactionReceipt } from "@/utils/pdfGenerator";

interface ReceiptModalProps {
    isOpen: boolean;
    onClose: () => void;
    transaction: any;
    currentUser: any;
}

export default function ReceiptModal({ isOpen, onClose, transaction, currentUser }: ReceiptModalProps) {
    if (!isOpen || !transaction) return null;

    const formattedTid = `G${transaction.id.toString().padStart(6, '0')}`;
    const orderId = transaction.order_id || formattedTid;
    const dateStr = new Date(transaction.created_at).toLocaleDateString('en-GB') + ' ' +
        new Date(transaction.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
            <div className="absolute inset-0" onClick={onClose} />

            <div className="relative bg-[#1a2b4b] border border-white/10 rounded-[1.5rem] md:rounded-[3rem] w-full max-w-[340px] md:max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
                {/* Header with Logo */}
                <div className="p-4 flex flex-col items-center border-b border-white/10 bg-white/5">
                    <div className="w-32 h-10 relative">
                        <Image src="/assets/images/logo.png" alt="Googer" fill className="object-contain" />
                    </div>
                </div>

                <div className="p-4 md:p-6 pb-24 md:pb-28">
                    <div className="text-center mb-4 md:mb-6">
                        <div className="w-10 h-10 md:w-12 md:h-12 bg-blue-500/20 border border-blue-500/50 rounded-full flex items-center justify-center mx-auto mb-2 md:mb-3">
                            <IonIcon name="receipt" className="text-xl md:text-2xl text-blue-400" />
                        </div>
                        <h3 className="text-base md:text-lg font-black text-white italic uppercase tracking-[0.2em] mb-1">Transaction Receipt</h3>
                        <p className="text-[8px] md:text-[9px] text-slate-500 font-bold uppercase tracking-widest leading-relaxed">Verified and Confirmed by system</p>
                    </div>

                    <div className="space-y-3">
                        <div className="flex justify-between items-center py-2 border-b border-white/5">
                            <span className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Transaction ID</span>
                            <span className="text-xs font-bold text-white tracking-widest">{formattedTid}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-white/5">
                            <span className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Order ID</span>
                            <span className="text-xs font-bold text-white tracking-widest">{orderId}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-white/5">
                            <span className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Date & Time</span>
                            <span className="text-xs font-bold text-white uppercase">{dateStr}</span>
                        </div>
                        <div className="flex justify-between items-center py-2">
                            <span className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Status</span>
                            <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${transaction.status === 'completed' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'}`}>
                                {transaction.status || 'Completed'}
                            </span>
                        </div>
                    </div>

                    <div className="mt-4 md:mt-6 bg-white/[0.03] border border-white/5 p-3 md:p-4 rounded-xl md:rounded-2xl flex flex-col items-center">
                        <span className="text-[8px] text-slate-500 font-black uppercase tracking-widest mb-1">Total Amount</span>
                        <div className="flex items-center gap-2">
                            <div className="relative w-7 h-3.5 md:w-8 md:h-4"><Image src="/assets/images/rupee.png" alt="₹" fill className="object-contain" /></div>
                            <span className="text-xl md:text-2xl font-black text-white">{parseFloat(transaction.amount).toFixed(2)}</span>
                        </div>
                    </div>
                </div>

                {/* Bottom Bar with Download */}
                <div className="absolute bottom-0 left-0 right-0 p-3 md:p-4 bg-gradient-to-t from-[#1a2b4b] to-transparent">
                    <button
                        onClick={() => generateTransactionReceipt(transaction, currentUser)}
                        className="w-full h-10 md:h-12 bg-blue-600 hover:bg-blue-500 text-white rounded-lg md:rounded-xl flex items-center justify-center gap-3 transition-all active:scale-95 shadow-xl shadow-blue-600/20 group"
                    >
                        <IonIcon name="download-outline" className="text-base md:text-lg group-hover:scale-110 transition-transform" />
                        <span className="text-[8px] md:text-[9px] font-black uppercase tracking-[0.2em]">Download Receipt</span>
                    </button>
                    <button
                        onClick={onClose}
                        className="w-full py-1.5 mt-1 text-[7px] md:text-[8px] text-slate-500 font-bold uppercase tracking-widest hover:text-white transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
