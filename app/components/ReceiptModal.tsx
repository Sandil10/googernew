"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import IonIcon from "./IonIcon";
import { generateTransactionReceipt } from "@/utils/pdfGenerator";
import { formatDisplayTransactionId, getRawTransactionId } from "@/utils/transactionReceipt";

interface ReceiptModalProps {
    isOpen: boolean;
    onClose: () => void;
    transaction: any;
    currentUser: any;
}

const formatDateTime = (value: string) => {
    const date = new Date(value);
    return `${date.toLocaleDateString("en-GB")} ${date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
    })}`;
};

const formatAccount = (id: string | number | undefined, username: string | undefined) => {
    return `ID ${id ?? "N/A"} (${username || "Unknown"})`;
};

const formatTransactionStatus = (transaction: any) => {
    const type = String(transaction?.type || "").toLowerCase();
    const status = String(transaction?.status || "pending").toLowerCase();
    const note = String(transaction?.note || "").toLowerCase();
    const isRequestBased = type === "request" || type === "sell";
    const isManualOrderHold = type === "order_hold" && /manual payment/.test(note);

    if (isRequestBased) {
        if (status === "accepted" || status === "completed") return "Accepted";
        return "Pending";
    }

    if (isManualOrderHold) {
        if (status === "completed") return "Paid";
        if (status === "pending") return "Pending";
    }

    if (status === "accepted") return "Accepted";
    if (status === "completed") return "Completed";
    if (status === "rejected") return "Rejected";
    if (status === "cancelled") return "Cancelled";
    return status.charAt(0).toUpperCase() + status.slice(1);
};

const getReceiptDetails = (transaction: any) => {
    const formattedTid = formatDisplayTransactionId(getRawTransactionId(transaction), transaction);
    const commission = Number(transaction.commission_percentage || 0);
    const type = String(transaction.type || "").toLowerCase();
    const statusLabel = formatTransactionStatus(transaction);

    let title = "Wallet Transaction";
    let amountLabel = "Amount";
    let typeLabel = type || "Wallet";

    if (type === "sell") {
        title = commission > 0 ? "Send Coins & Discount Request" : "Send Coins";
        amountLabel = "Send Coins";
        typeLabel = "Sell";
    } else if (type === "request") {
        title = commission > 0 ? "Buy Coins & Discount Request" : "Buy Coins";
        amountLabel = "Buy Coins";
        typeLabel = "Buy";
    } else if (type === "transfer") {
        title = commission > 0 ? "Send Coins & Discount Request" : "Send Coins";
        amountLabel = "Send Coins";
        typeLabel = "Send";
    } else if (type === "order_hold") {
        title = "Order Payment Hold";
        amountLabel = "Amount";
        typeLabel = "Order Hold";
    }

    const details = [
        { label: amountLabel, value: Number(transaction.amount || 0).toFixed(2) },
    ];

    if (commission > 0) {
        details.push({ label: "Discount Requested", value: `${commission}%` });
    }

    if (type === "order_hold" && /manual payment/i.test(String(transaction.note || ""))) {
        details.push(
            {
                label: "Buyer ID",
                value: formatAccount(transaction.sender_readable_id || transaction.sender_id, transaction.sender_username),
            },
            {
                label: "Seller ID",
                value: formatAccount(transaction.receiver_readable_id || transaction.receiver_id, transaction.receiver_username),
            }
        );
    } else {
        details.push(
            {
                label: "From Account",
                value: formatAccount(transaction.sender_readable_id || transaction.sender_id, transaction.sender_username),
            },
            {
                label: type === "request" ? "Requested From" : "Send To",
                value: formatAccount(transaction.receiver_readable_id || transaction.receiver_id, transaction.receiver_username),
            }
        );
    }

    details.push(
        { label: "Transaction ID", value: formattedTid },
        { label: "Date & Time", value: formatDateTime(transaction.created_at) },
        { label: "Type", value: typeLabel },
        { label: "Status", value: statusLabel }
    );

    return {
        title,
        details,
    };
};

export default function ReceiptModal({ isOpen, onClose, transaction, currentUser }: ReceiptModalProps) {
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            setCopied(false);
        }
    }, [isOpen, transaction]);

    if (!isOpen || !transaction) return null;

    const receipt = getReceiptDetails(transaction);
    const transactionId = receipt.details.find((detail) => detail.label === "Transaction ID")?.value || "";

    const handleCopyTransactionId = async () => {
        if (!transactionId || !navigator?.clipboard) return;

        try {
            await navigator.clipboard.writeText(String(transactionId));
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1800);
        } catch (error) {
            console.error("Failed to copy transaction ID", error);
        }
    };

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
            <div className="absolute inset-0" onClick={onClose} />

            <div className="relative w-full max-w-[350px] overflow-hidden rounded-[1.1rem] border border-white/10 bg-black shadow-2xl animate-in zoom-in-95 duration-300 md:max-w-[390px]">
                <div className="border-b border-white/10 bg-white/[0.03] px-3.5 py-3 md:px-4 md:py-3">
                    <div className="relative mx-auto h-10 w-32 md:h-11 md:w-36">
                        <Image src="/assets/images/googer.png" alt="Googer" fill className="object-contain" />
                    </div>
                </div>

                <div className="px-3.5 py-3 md:px-4 md:py-3">
                    <div className="mb-3 text-center md:mb-3.5">
                        <h3 className="text-[11px] md:text-[12px] font-black tracking-[0.06em] text-white">
                            GOOGER WALLET Transaction Receipt
                        </h3>
                        <p className="mt-2 text-[10px] md:text-[11px] font-black text-white leading-4">
                            <span className="text-red-400">▲</span> {receipt.title} - Successfully!
                        </p>
                    </div>

                    <div className="rounded-[1rem] border border-dashed border-white/10 bg-white/[0.02] p-2.5 md:p-3">
                        <div className="space-y-1.5">
                            {receipt.details.map((detail) => (
                                <div
                                    key={detail.label}
                                    className="flex items-start justify-between gap-2 border-b border-white/5 pb-1.5 last:border-b-0 last:pb-0"
                                >
                                    <div className="flex min-w-0 flex-1 items-start gap-1.5">
                                        <p className="w-[104px] shrink-0 text-[9px] font-black text-gray-400 leading-4">
                                            {detail.label}
                                        </p>
                                        <span className="shrink-0 text-[10px] font-black text-gray-500 leading-4">-</span>
                                        <div className="min-w-0 flex-1 text-right">
                                            <p className="break-words text-[10px] md:text-[11px] font-bold leading-4 text-white">
                                                {detail.value}
                                            </p>
                                            {detail.label === "Transaction ID" && (
                                                <button
                                                    onClick={handleCopyTransactionId}
                                                    className="mt-0.5 inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-[0.14em] text-blue-400 hover:text-blue-300 transition-colors"
                                                >
                                                    <IonIcon name={copied ? "checkmark-outline" : "copy-outline"} className="text-[9px]" />
                                                    <span>{copied ? "Copied" : "Copy"}</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="border-t border-white/10 bg-black px-3.5 py-2.5 md:px-4 md:py-2.5">
                    <button
                        onClick={() => generateTransactionReceipt(transaction, currentUser)}
                        className="w-full h-9 rounded-lg bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center gap-2 transition-all active:scale-95 shadow-xl shadow-blue-600/20"
                    >
                        <IonIcon name="download-outline" className="text-sm" />
                        <span className="text-[8px] font-black uppercase tracking-[0.16em]">Download Receipt</span>
                    </button>
                    <button
                        onClick={onClose}
                        className="w-full mt-1 py-0.5 text-[8px] text-slate-500 font-bold uppercase tracking-[0.14em] hover:text-white transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
