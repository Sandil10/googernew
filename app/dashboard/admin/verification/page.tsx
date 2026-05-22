"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import IonIcon from "@/app/components/IonIcon";
import { verificationService } from "@/services/verificationService";

type StatusFilter = "All" | "Under Review" | "Verified" | "Rejected";

const STATUS_TABS: StatusFilter[] = ["All", "Under Review", "Verified", "Rejected"];

const STATUS_CFG = {
    "Under Review": { color: "text-amber-400", bg: "bg-amber-400/10 border-amber-400/20", dot: "bg-amber-400" },
    Verified:       { color: "text-emerald-400", bg: "bg-emerald-400/10 border-emerald-400/20", dot: "bg-emerald-400" },
    Rejected:       { color: "text-red-400", bg: "bg-red-500/10 border-red-500/20", dot: "bg-red-400" },
};

function DetailRow({ label, value }: { label: string; value?: string | null }) {
    if (!value) return null;
    return (
        <div className="flex items-start justify-between gap-4 py-2.5 border-b border-gray-800 last:border-0">
            <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider shrink-0">{label}</span>
            <span className="text-xs font-bold text-white text-right break-all">{value}</span>
        </div>
    );
}

function DocImage({ url, label }: { url: string | null; label: string }) {
    if (!url) return null;
    const isImg = /\.(jpg|jpeg|png|webp|gif)$/i.test(url);
    return (
        <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-1.5">{label}</p>
            {isImg ? (
                <img src={url.startsWith("/uploads") ? url : `/uploads/${url}`} alt={label} className="w-full rounded-xl object-cover max-h-44 border border-gray-700/50" />
            ) : (
                <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 bg-[#030303] border border-gray-700/50 rounded-xl px-4 py-3 text-white text-xs font-bold hover:bg-[#0b0b0b] transition shadow-inner">
                    <IonIcon name="document-outline" className="text-base text-gray-400" />
                    View Document
                </a>
            )}
        </div>
    );
}

export default function AdminVerificationPage() {
    const router = useRouter();
    const [filter, setFilter] = useState<StatusFilter>("Under Review");
    const [records, setRecords] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<any | null>(null);
    const [rejectionReason, setRejectionReason] = useState("");
    const [showRejectInput, setShowRejectInput] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

    const showToast = (msg: string, type: "success" | "error" = "success") => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    const loadRecords = async (f: StatusFilter = filter) => {
        setLoading(true);
        try {
            const data = await verificationService.adminGetAll(f === "All" ? undefined : f);
            setRecords(data);
        } catch (e: any) {
            showToast(e?.message || "Failed to load", "error");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void loadRecords(filter); }, [filter]);

    const handleApprove = async () => {
        if (!selected) return;
        setActionLoading(true);
        try {
            await verificationService.adminReview(selected.id, "approve");
            showToast(`✓ ${selected.username} verified successfully`);
            setSelected(null);
            void loadRecords(filter);
        } catch (e: any) {
            showToast(e?.message || "Failed to approve", "error");
        } finally {
            setActionLoading(false);
        }
    };

    const handleReject = async () => {
        if (!selected) return;
        if (!rejectionReason.trim()) {
            showToast("Please enter a rejection reason", "error");
            return;
        }
        setActionLoading(true);
        try {
            await verificationService.adminReview(selected.id, "reject", rejectionReason.trim());
            showToast(`Verification rejected for ${selected.username}`);
            setSelected(null);
            setRejectionReason("");
            setShowRejectInput(false);
            void loadRecords(filter);
        } catch (e: any) {
            showToast(e?.message || "Failed to reject", "error");
        } finally {
            setActionLoading(false);
        }
    };

    return (
        <div className="pb-10 relative min-h-screen">
            {/* Toast */}
            {toast && (
                <div className={`fixed top-4 right-4 z-50 rounded-xl border px-4 py-3 text-sm font-bold shadow-lg ${toast.type === "success" ? "bg-emerald-400/10 border-emerald-400/20 text-emerald-400" : "bg-red-500/10 border-red-500/20 text-red-400"}`}>
                    {toast.msg}
                </div>
            )}

            {/* Back */}
            <div className="mb-4">
                <button onClick={() => router.back()} className="flex items-center gap-2 text-white/60 hover:text-white transition-colors">
                    <IonIcon name="chevron-back-outline" className="text-xl" />
                    <span className="text-[11px] font-bold uppercase tracking-widest">Back</span>
                </button>
            </div>

            <div className="flex items-start justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-white tracking-tight">Verification Requests</h1>
                    <p className="text-xs text-gray-500 mt-1">Review and manage user verification applications</p>
                </div>
                <div className="flex items-center gap-2 bg-[#070707] border border-gray-800 rounded-xl px-4 py-2.5">
                    <div className={`h-2 w-2 rounded-full ${records.filter((r) => r.status === "Under Review").length > 0 ? "bg-amber-400 animate-pulse" : "bg-gray-700"}`} />
                    <span className="text-xs font-bold text-gray-400">
                        {records.filter((r) => r.status === "Under Review").length || 0} Pending
                    </span>
                </div>
            </div>

            {/* Main card */}
            <div className="bg-[#070707] border border-gray-800 rounded-2xl overflow-hidden shadow-lg">
                {/* Filter tabs */}
                <div className="border-b border-gray-800 px-6">
                    <div className="flex gap-6 overflow-x-auto scrollbar-hide">
                        {STATUS_TABS.map((tab) => (
                            <button
                                key={tab}
                                onClick={() => { setFilter(tab); setSelected(null); }}
                                className={`pb-3 pt-4 text-sm font-semibold transition-all border-b-2 whitespace-nowrap ${filter === tab ? "text-white border-white" : "text-gray-500 border-transparent hover:text-gray-300"}`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex min-h-[520px]">
                    {/* ── Left: record list ── */}
                    <div className={`flex-shrink-0 overflow-y-auto ${selected ? "w-72 border-r border-gray-800" : "w-full"}`}>
                        {loading ? (
                            <div className="flex items-center justify-center py-20">
                                <IonIcon name="reload-outline" className="animate-spin text-3xl text-gray-600" />
                            </div>
                        ) : records.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-600">
                                <IonIcon name="shield-outline" className="text-4xl" />
                                <p className="text-sm font-semibold">No {filter === "All" ? "" : filter} applications</p>
                            </div>
                        ) : (
                            <div>
                                {records.map((rec) => {
                                    const cfg = STATUS_CFG[rec.status as keyof typeof STATUS_CFG];
                                    const isActive = selected?.id === rec.id;
                                    return (
                                        <button
                                            key={rec.id}
                                            type="button"
                                            onClick={() => { setSelected(rec); setShowRejectInput(false); setRejectionReason(""); }}
                                            className={`w-full text-left px-5 py-4 border-b border-gray-800/60 transition-all hover:bg-white/[0.02] ${isActive ? "bg-white/[0.04]" : ""}`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="h-9 w-9 shrink-0 rounded-full bg-gray-800 flex items-center justify-center overflow-hidden">
                                                    {rec.profile_picture ? (
                                                        <img src={rec.profile_picture} alt={rec.username} className="h-full w-full object-cover" />
                                                    ) : (
                                                        <IonIcon name="person-outline" className="text-gray-500 text-sm" />
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-bold text-white truncate">{rec.full_name || rec.username}</p>
                                                    <p className="text-[10px] text-gray-500 truncate">@{rec.username}</p>
                                                </div>
                                                <div className="flex flex-col items-end gap-1">
                                                    <div className={`flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${cfg?.bg}`}>
                                                        <div className={`h-1.5 w-1.5 rounded-full ${cfg?.dot}`} />
                                                        <span className={cfg?.color}>{rec.status}</span>
                                                    </div>
                                                    <p className="text-[9px] text-gray-600">
                                                        {new Date(rec.submitted_at).toLocaleDateString()}
                                                    </p>
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* ── Right: detail panel ── */}
                    {selected && (
                        <div className="flex-1 overflow-y-auto p-6">
                            {/* Header */}
                            <div className="flex items-start justify-between mb-5">
                                <div className="flex items-center gap-3">
                                    <div className="h-12 w-12 rounded-full bg-gray-800 flex items-center justify-center overflow-hidden border border-gray-700">
                                        {selected.profile_picture ? (
                                            <img src={selected.profile_picture} alt={selected.username} className="h-full w-full object-cover" />
                                        ) : (
                                            <IonIcon name="person-outline" className="text-gray-500 text-xl" />
                                        )}
                                    </div>
                                    <div>
                                        <p className="font-bold text-white">{selected.full_name || selected.username}</p>
                                        <p className="text-xs text-gray-500">@{selected.username}</p>
                                    </div>
                                </div>
                                <button onClick={() => setSelected(null)} className="text-gray-600 hover:text-white transition">
                                    <IonIcon name="close-outline" className="text-xl" />
                                </button>
                            </div>

                            {/* Status badge */}
                            {(() => {
                                const cfg = STATUS_CFG[selected.status as keyof typeof STATUS_CFG];
                                return cfg ? (
                                    <div className={`flex items-center gap-2 rounded-xl border px-4 py-3 mb-5 ${cfg.bg}`}>
                                        <div className={`h-2 w-2 rounded-full ${cfg.dot}`} />
                                        <span className={`text-xs font-bold ${cfg.color}`}>{selected.status}</span>
                                        {selected.reviewed_at && (
                                            <span className="ml-auto text-[10px] text-gray-600">
                                                Reviewed: {new Date(selected.reviewed_at).toLocaleDateString()}
                                            </span>
                                        )}
                                    </div>
                                ) : null;
                            })()}

                            {selected.rejection_reason && (
                                <div className="rounded-xl border border-red-500/20 bg-red-500/[0.07] px-4 py-3 mb-5">
                                    <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-1">Rejection Reason</p>
                                    <p className="text-xs text-red-300">{selected.rejection_reason}</p>
                                </div>
                            )}

                            {/* Personal Info */}
                            <div className="bg-[#030303] border border-gray-700/50 rounded-xl px-4 py-3 shadow-inner mb-4">
                                <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-1">Personal Information</p>
                                <DetailRow label="Full Name" value={selected.full_name} />
                                <DetailRow label="Email" value={selected.email || selected.user_email} />
                                <DetailRow label="Phone" value={selected.phone} />
                                <DetailRow label="Address" value={selected.address} />
                                <DetailRow label="Date of Birth" value={selected.date_of_birth ? new Date(selected.date_of_birth).toLocaleDateString() : null} />
                                <DetailRow label="Country" value={selected.country} />
                            </div>

                            {/* Identity */}
                            <div className="bg-[#030303] border border-gray-700/50 rounded-xl px-4 py-3 shadow-inner mb-4">
                                <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-1">Identity Document</p>
                                <DetailRow label="Document Type" value={selected.document_type} />
                                <DetailRow label="ID Number" value={selected.id_number} />
                            </div>

                            {/* Document images */}
                            {(selected.doc_front_url || selected.doc_back_url) && (
                                <div className="grid grid-cols-2 gap-3 mb-4">
                                    <DocImage url={selected.doc_front_url} label="Front Side" />
                                    <DocImage url={selected.doc_back_url} label="Back Side" />
                                </div>
                            )}

                            {/* Authenticity */}
                            {(selected.official_website || selected.social_links || selected.news_links) && (
                                <div className="bg-[#030303] border border-gray-700/50 rounded-xl px-4 py-3 shadow-inner mb-4">
                                    <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-1">Authenticity Proof</p>
                                    <DetailRow label="Website" value={selected.official_website} />
                                    <DetailRow label="Social Links" value={selected.social_links} />
                                    <DetailRow label="News Links" value={selected.news_links} />
                                </div>
                            )}

                            {(selected.brand_proof_url) && (
                                <div className="mb-4">
                                    <DocImage url={selected.brand_proof_url} label="Brand Proof" />
                                </div>
                            )}

                            {/* Business */}
                            {(selected.vat_number || selected.business_website) && (
                                <div className="bg-[#030303] border border-gray-700/50 rounded-xl px-4 py-3 shadow-inner mb-4">
                                    <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-1">Business Information</p>
                                    <DetailRow label="VAT / Tax No." value={selected.vat_number} />
                                    <DetailRow label="Business Website" value={selected.business_website} />
                                </div>
                            )}

                            {(selected.business_reg_url || selected.company_docs_url) && (
                                <div className="grid grid-cols-2 gap-3 mb-4">
                                    <DocImage url={selected.business_reg_url} label="Business Reg." />
                                    <DocImage url={selected.company_docs_url} label="Company Docs" />
                                </div>
                            )}

                            {/* ── Action buttons (only for Under Review) ── */}
                            {selected.status === "Under Review" && (
                                <div className="mt-6 space-y-3">
                                    {/* Approve */}
                                    <button
                                        type="button"
                                        onClick={handleApprove}
                                        disabled={actionLoading}
                                        className="w-full flex items-center justify-center gap-2 bg-emerald-400/10 border border-emerald-400/20 rounded-xl px-4 py-3 text-emerald-400 text-xs font-bold uppercase tracking-widest transition hover:bg-emerald-400/20 disabled:opacity-50"
                                    >
                                        {actionLoading ? <IonIcon name="reload-outline" className="animate-spin" /> : <IonIcon name="shield-checkmark-outline" className="text-base" />}
                                        Approve & Verify
                                    </button>

                                    {/* Reject */}
                                    {!showRejectInput ? (
                                        <button
                                            type="button"
                                            onClick={() => setShowRejectInput(true)}
                                            className="w-full flex items-center justify-center gap-2 bg-[#030303] border border-gray-700/50 rounded-xl px-4 py-3 text-red-400 text-xs font-bold uppercase tracking-widest transition hover:bg-[#0b0b0b] shadow-inner"
                                        >
                                            <IonIcon name="close-circle-outline" className="text-base" />
                                            Reject Application
                                        </button>
                                    ) : (
                                        <div className="space-y-2">
                                            <textarea
                                                className="w-full bg-[#030303] border border-gray-700/50 rounded-xl px-4 py-3 text-white text-sm font-bold focus:outline-none focus:ring-1 focus:ring-red-400/30 shadow-inner resize-none"
                                                rows={3}
                                                placeholder="Enter rejection reason (required)..."
                                                value={rejectionReason}
                                                onChange={(e) => setRejectionReason(e.target.value)}
                                            />
                                            <div className="grid grid-cols-2 gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => { setShowRejectInput(false); setRejectionReason(""); }}
                                                    className="bg-[#030303] border border-gray-700/50 rounded-xl px-4 py-2.5 text-gray-400 text-xs font-bold uppercase tracking-widest transition hover:bg-[#0b0b0b] shadow-inner"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={handleReject}
                                                    disabled={actionLoading || !rejectionReason.trim()}
                                                    className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5 text-red-400 text-xs font-bold uppercase tracking-widest transition hover:bg-red-500/20 disabled:opacity-50"
                                                >
                                                    {actionLoading ? "Rejecting…" : "Confirm Reject"}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {selected.status === "Verified" && (
                                <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3">
                                    <IonIcon name="shield-checkmark" className="text-emerald-400 text-lg" />
                                    <p className="text-xs font-bold text-emerald-400">This account is verified</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
