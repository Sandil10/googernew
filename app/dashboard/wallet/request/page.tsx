"use client";

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import IonIcon from '@/app/components/IonIcon';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';
const PAYREXX_BASE = 'https://raw.githubusercontent.com/payrexx/payment-logos/main/assets/card-icons';
const ASSIGN_KEY = 'googer_topup_assignments'; // { [requestId]: methodId }

const getToken = () => (typeof window !== 'undefined' ? localStorage.getItem('token') : null);
const authFetch = (url: string, opts: RequestInit = {}) =>
    fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${getToken()}` } });

// ─── Types ─────────────────────────────────────────────────────────────────────
type FieldDef = {
    key: string;
    label: string;
    type: 'text' | 'email' | 'number';
    required?: boolean;
    placeholder?: string;
    defaultValue?: string;
    locked?: boolean;
};

type TopupMethod = {
    id: number;
    name: string;
    icon: string;
    fields: FieldDef[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const LETTER_COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#ec4899','#06b6d4'];
function letterColor(name: string) {
    let h = 0;
    for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0x7fffffff;
    return LETTER_COLORS[h % LETTER_COLORS.length];
}

function loadAssignments(): Record<string, number> {
    try { return JSON.parse(localStorage.getItem(ASSIGN_KEY) || '{}'); } catch { return {}; }
}
function saveAssignment(requestId: number, methodId: number) {
    const cur = loadAssignments();
    cur[String(requestId)] = methodId;
    try { localStorage.setItem(ASSIGN_KEY, JSON.stringify(cur)); } catch {}
}
function removeAssignment(requestId: number) {
    const cur = loadAssignments();
    delete cur[String(requestId)];
    try { localStorage.setItem(ASSIGN_KEY, JSON.stringify(cur)); } catch {}
}

// ─── PaymentLogo: card_{icon}.svg → letter ────────────────────────────────────
function PaymentLogo({ icon, name }: { icon: string; name: string }) {
    const [failed, setFailed] = useState(false);
    if (!icon || failed) {
        return (
            <div className="w-full h-full rounded-xl flex items-center justify-center text-white font-black text-base"
                style={{ backgroundColor: letterColor(name) }}>
                {name.charAt(0).toUpperCase()}
            </div>
        );
    }
    return (
        <img
            src={`${PAYREXX_BASE}/card_${icon}.svg`}
            alt={name}
            onError={() => setFailed(true)}
            className="object-contain w-full h-full"
        />
    );
}

// ─── Status badge config ──────────────────────────────────────────────────────
const STATUS_CFG: Record<string, { color: string; bg: string; dot: string }> = {
    Pending:  { color: 'text-amber-400',   bg: 'bg-amber-400/10 border-amber-400/20',     dot: 'bg-amber-400' },
    Verified: { color: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/20', dot: 'bg-emerald-400' },
    Rejected: { color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/20',         dot: 'bg-red-400' },
};

// ─── Main page ────────────────────────────────────────────────────────────────
export default function RequestPage() {
    const router = useRouter();

    const [myRequests, setMyRequests]           = useState<any[]>([]);
    const [loadingRequests, setLoadingRequests] = useState(true);
    const [sending, setSending]                 = useState(false);
    const [sent, setSent]                       = useState(false);
    const [sendError, setSendError]             = useState<string | null>(null);

    // Active topup methods from DB (fetched once when a verified request exists)
    const [activeMethods, setActiveMethods]     = useState<TopupMethod[]>([]);
    const [methodsLoaded, setMethodsLoaded]     = useState(false);

    // Popup state
    const [popupMethod, setPopupMethod]         = useState<TopupMethod | null>(null);
    const [fieldValues, setFieldValues]         = useState<Record<string, string>>({});
    const [activeRequestId, setActiveRequestId] = useState<number | null>(null);

    // Assignments (requestId → methodId)
    const [assignments, setAssignments]         = useState<Record<string, number>>({});

    useEffect(() => { setAssignments(loadAssignments()); }, []);

    const loadMyRequests = useCallback(async () => {
        try {
            const res = await authFetch(`${API_URL}/coin-requests/my`);
            const data = await res.json();
            if (data.success) setMyRequests(data.requests || []);
        } catch { /* silent */ } finally {
            setLoadingRequests(false);
        }
    }, []);

    useEffect(() => { loadMyRequests(); }, [loadMyRequests]);

    // Fetch active topup methods once when there's a verified request
    useEffect(() => {
        const hasVerified = myRequests.some(r => r.status === 'Verified');
        if (hasVerified && !methodsLoaded) {
            fetch(`${API_URL}/coin-requests/active-topup-methods`)
                .then(r => r.json())
                .then(data => { if (data.success) setActiveMethods(data.data || []); })
                .catch(() => {})
                .finally(() => setMethodsLoaded(true));
        }
    }, [myRequests, methodsLoaded]);

    const handleSendRequest = async () => {
        setSendError(null);
        setSending(true);
        try {
            const res = await authFetch(`${API_URL}/coin-requests`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ method_category: 'Request', method_name: 'Coin Request', amount: 1 }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.message || 'Failed to send request.');
            setSent(true);
            await loadMyRequests();
            setTimeout(() => setSent(false), 4000);
        } catch (err: any) {
            setSendError(err?.message || 'Something went wrong.');
        } finally {
            setSending(false);
        }
    };

    const openPopup = (method: TopupMethod, requestId: number) => {
        // Pre-fill defaults
        const defaults: Record<string, string> = {};
        method.fields.forEach(f => { defaults[f.key] = f.defaultValue ?? ''; });
        setFieldValues(defaults);
        setPopupMethod(method);
        setActiveRequestId(requestId);
    };

    const closePopup = () => { setPopupMethod(null); setFieldValues({}); setActiveRequestId(null); };

    const handleAssign = () => {
        if (!popupMethod || !activeRequestId) return;
        saveAssignment(activeRequestId, popupMethod.id);
        setAssignments(loadAssignments());
        closePopup();
    };

    const handleRemove = () => {
        if (!activeRequestId) return;
        removeAssignment(activeRequestId);
        setAssignments(loadAssignments());
        closePopup();
    };

    const hasPending = myRequests.some(r => r.status === 'Pending');

    return (
        <div className="pb-10 relative min-h-screen">
            {/* Back */}
            <div className="mb-4">
                <button onClick={() => router.back()} className="flex items-center gap-2 text-white/60 hover:text-white transition-colors">
                    <IonIcon name="chevron-back-outline" className="text-xl" />
                    <span className="text-[11px] font-bold uppercase tracking-widest">Back</span>
                </button>
            </div>

            <h1 className="text-2xl font-bold mb-2 text-white tracking-tight">Request</h1>
            <p className="text-gray-500 text-sm mb-8">Send a coin request to admin for approval.</p>

            {/* Send Request button */}
            <button
                onClick={handleSendRequest}
                disabled={sending || hasPending}
                className="flex items-center gap-3 bg-white text-black font-bold rounded-2xl px-6 py-4 mb-3 hover:bg-gray-100 active:scale-[0.98] transition-all shadow-lg text-sm uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {sending
                    ? <><IonIcon name="reload-outline" className="animate-spin text-lg" /> Sending…</>
                    : <><IonIcon name="paper-plane-outline" className="text-lg" /> Send Request</>
                }
            </button>

            {hasPending && (
                <p className="text-[11px] text-amber-400/80 font-semibold mb-6">
                    You already have a pending request. Please wait for admin approval.
                </p>
            )}
            {sent && (
                <div className="flex items-center gap-2 bg-emerald-400/10 border border-emerald-400/20 rounded-xl px-4 py-3 mb-6">
                    <IonIcon name="checkmark-circle" className="text-emerald-400 text-base" />
                    <p className="text-xs font-bold text-emerald-400">Request sent successfully. We will verify your request.</p>
                </div>
            )}
            {sendError && (
                <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-6">
                    <IonIcon name="alert-circle-outline" className="text-red-400 text-base" />
                    <p className="text-xs font-bold text-red-400">{sendError}</p>
                </div>
            )}

            {/* My Requests list */}
            <div className="bg-[#070707] border border-gray-800 rounded-2xl overflow-hidden shadow-lg">
                <div className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <IonIcon name="time-outline" className="text-white/50" />
                        <span className="text-sm font-bold text-white">My Requests</span>
                    </div>
                    <span className="text-[10px] text-gray-600 font-semibold uppercase tracking-widest">{myRequests.length} total</span>
                </div>

                <div className="min-h-[200px]">
                    {loadingRequests ? (
                        <div className="flex items-center justify-center py-16 opacity-40">
                            <IonIcon name="reload-outline" className="animate-spin text-3xl text-gray-500" />
                        </div>
                    ) : myRequests.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 opacity-30 gap-3">
                            <IonIcon name="document-outline" className="text-4xl" />
                            <p className="text-xs font-black uppercase tracking-widest">No requests yet</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-800/60">
                            {myRequests.map(req => {
                                const cfg = STATUS_CFG[req.status] || STATUS_CFG.Pending;
                                const isVerified = req.status === 'Verified';
                                const assignedMethodId = assignments[String(req.id)];

                                return (
                                    <div key={req.id}>
                                        {/* Request row */}
                                        <div className="px-6 py-4">
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className="w-9 h-9 shrink-0 bg-[#030303] border border-gray-700/50 rounded-xl flex items-center justify-center">
                                                        <IonIcon name="paper-plane-outline" className="text-white/40 text-sm" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-bold text-white">Coin Request</p>
                                                        <p className="text-[10px] text-gray-600">
                                                            {new Date(req.created_at).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className={`flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border shrink-0 ${cfg.bg}`}>
                                                    <div className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                                                    <span className={cfg.color}>{req.status}</span>
                                                </div>
                                            </div>
                                            {req.status === 'Rejected' && req.rejection_reason && (
                                                <p className="text-[10px] text-red-400/80 mt-2 pl-12">{req.rejection_reason}</p>
                                            )}
                                        </div>

                                        {/* Payment methods — only after Verified */}
                                        {isVerified && (
                                            <div className="px-5 pb-5 bg-emerald-400/[0.03] border-t border-emerald-400/10">
                                                <div className="flex items-center gap-2 py-4 mb-3">
                                                    <IonIcon name="checkmark-circle" className="text-emerald-400 text-base shrink-0" />
                                                    <p className="text-xs font-bold text-emerald-400">Approved — select a payment method</p>
                                                </div>

                                                {!methodsLoaded ? (
                                                    <div className="flex items-center justify-center py-6 opacity-40">
                                                        <IonIcon name="reload-outline" className="animate-spin text-2xl text-gray-500" />
                                                    </div>
                                                ) : activeMethods.length === 0 ? (
                                                    <div className="flex flex-col items-center justify-center py-6 opacity-30 gap-2">
                                                        <IonIcon name="card-outline" className="text-3xl" />
                                                        <p className="text-[10px] font-black uppercase tracking-widest">No payment methods available</p>
                                                    </div>
                                                ) : (
                                                    <div className="grid grid-cols-4 gap-2">
                                                        {activeMethods.map(method => {
                                                            const isAssigned = assignedMethodId === method.id;
                                                            return (
                                                                <button
                                                                    key={method.id}
                                                                    type="button"
                                                                    onClick={() => openPopup(method, req.id)}
                                                                    className={`relative flex flex-col items-center gap-1.5 p-2.5 rounded-xl border transition-all active:scale-95 ${
                                                                        isAssigned
                                                                            ? 'border-emerald-400/40 bg-emerald-400/[0.07]'
                                                                            : 'border-gray-700/50 bg-[#030303] hover:border-gray-600 hover:bg-[#0b0b0b]'
                                                                    }`}
                                                                >
                                                                    {isAssigned && (
                                                                        <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-emerald-400 flex items-center justify-center">
                                                                            <IonIcon name="checkmark" className="text-black text-[9px] font-black" />
                                                                        </div>
                                                                    )}
                                                                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center p-1.5 overflow-hidden">
                                                                        <PaymentLogo icon={method.icon} name={method.name} />
                                                                    </div>
                                                                    <span className={`text-[9px] font-bold text-center leading-tight ${isAssigned ? 'text-emerald-400' : 'text-gray-400'}`}>
                                                                        {method.name}
                                                                    </span>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            <div className="h-20 md:hidden" />

            {/* ── Assign Popup ── */}
            {popupMethod && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <div className="absolute inset-0 bg-black/70" onClick={closePopup} />
                    <div className="relative w-full sm:max-w-md bg-[#0c0c0f] border border-gray-800 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[85vh]">
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-800 shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center p-1.5 overflow-hidden shrink-0">
                                    <PaymentLogo icon={popupMethod.icon} name={popupMethod.name} />
                                </div>
                                <div>
                                    <h2 className="text-sm font-bold text-white">{popupMethod.name}</h2>
                                    <p className="text-[10px] text-gray-500">Fill in your details</p>
                                </div>
                            </div>
                            <button onClick={closePopup} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.06] text-gray-400 hover:text-white">
                                <IonIcon name="close-outline" className="text-lg" />
                            </button>
                        </div>

                        {/* Fields */}
                        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
                            {popupMethod.fields.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-8 opacity-30">
                                    <IonIcon name="document-outline" className="text-3xl mb-2" />
                                    <p className="text-[10px] font-black uppercase tracking-widest">No fields configured</p>
                                </div>
                            ) : (
                                popupMethod.fields.map(field => (
                                    <div key={field.key}>
                                        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">
                                            {field.label}
                                            {field.required && <span className="text-red-400 ml-1">*</span>}
                                            {field.locked && (
                                                <span className="ml-2 text-gray-600 normal-case tracking-normal font-semibold">
                                                    <IonIcon name="lock-closed-outline" className="text-[9px] mr-0.5" />locked
                                                </span>
                                            )}
                                        </label>
                                        <input
                                            type={field.type || 'text'}
                                            name={field.key}
                                            value={fieldValues[field.key] ?? field.defaultValue ?? ''}
                                            onChange={e => !field.locked && setFieldValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                                            disabled={!!field.locked}
                                            readOnly={!!field.locked}
                                            placeholder={field.placeholder || field.label}
                                            className={`w-full border rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-white/20 transition-all ${
                                                field.locked
                                                    ? 'bg-[#030303] border-gray-800 text-gray-500 cursor-not-allowed select-none'
                                                    : 'bg-[#030303] border-gray-700/50 text-white hover:bg-[#0b0b0b] shadow-inner'
                                            }`}
                                        />
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Footer */}
                        <div className="px-6 pb-6 pt-4 border-t border-gray-800 shrink-0 flex gap-3">
                            <button onClick={closePopup}
                                className="flex-1 py-3.5 bg-zinc-800/80 hover:bg-zinc-800 text-white font-bold rounded-full text-xs uppercase tracking-widest transition-all active:scale-95">
                                Cancel
                            </button>
                            {activeRequestId && assignments[String(activeRequestId)] === popupMethod?.id ? (
                                <button onClick={handleRemove}
                                    className="flex-1 py-3.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 font-bold rounded-full text-xs uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 border border-red-500/30">
                                    <IonIcon name="trash-outline" className="text-sm" />
                                    Remove
                                </button>
                            ) : (
                                <button onClick={handleAssign}
                                    className="flex-1 py-3.5 bg-white hover:bg-gray-100 text-black font-bold rounded-full text-xs uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg">
                                    <IonIcon name="checkmark-outline" className="text-sm" />
                                    Assign
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
