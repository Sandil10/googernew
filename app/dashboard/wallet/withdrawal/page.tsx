"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import IonIcon from '@/app/components/IonIcon';
import { authService } from '@/services/authService';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';
const getToken = () => (typeof window !== 'undefined' ? localStorage.getItem('token') : null);
const authFetch = (url: string, opts: RequestInit = {}) =>
    fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${getToken()}` } });

const SAVED_DETAILS_KEY = 'googer_payment_details';

type VerificationStatus = 'None' | 'Under Review' | 'Verified' | 'Rejected';

type FieldConfig = {
    key: string;
    label: string;
    type: 'text' | 'email' | 'number' | 'select';
    required?: boolean;
    placeholder?: string;
    options?: string[];
};

type PaymentMethod = {
    id: number;
    name: string;
    icon: string;
    fields: FieldConfig[];
};

type WithdrawalRequest = {
    id: number;
    payment_method_name: string;
    amount: string;
    status: string;
    rejection_reason: string | null;
    created_at: string;
};

type WithdrawalSettings = { min_amount: number; max_amount: number; coin_rate: number };
type ExchangeRate = { currency: string; rate: number | null; date: string | null };

const LOGO_BASE = 'https://raw.githubusercontent.com/payrexx/payment-logos/main/assets/card-icons';

function PaymentLogo({ icon, className = '' }: { icon: string; className?: string }) {
    const [failed, setFailed] = useState(false);
    if (!icon || failed) {
        return <IonIcon name="card-outline" className={`text-2xl text-gray-400 ${className}`} />;
    }
    return (
        <img
            src={`${LOGO_BASE}/card_${icon}.svg`}
            alt={icon}
            width={40}
            height={40}
            onError={() => setFailed(true)}
            className={`object-contain ${className}`}
        />
    );
}

const inputCls = "w-full bg-[#030303] border border-gray-700/50 rounded-xl px-4 py-3 text-white text-sm font-bold focus:outline-none focus:ring-1 focus:ring-white/30 shadow-inner transition-all hover:bg-[#0b0b0b] placeholder-gray-600";
const labelCls = "block text-gray-400 text-xs font-semibold mb-2 tracking-wider uppercase";

export default function WithdrawalPage() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<'withdrawal' | 'recent' | 'methods' | 'analytics'>('withdrawal');

    // Data
    const [balance, setBalance]       = useState(0);
    const [verStatus, setVerStatus]   = useState<VerificationStatus>('None');
    const [settings, setSettings]     = useState<WithdrawalSettings | null>(null);
    const [methods, setMethods]       = useState<PaymentMethod[]>([]);
    const [recentRequests, setRecentRequests] = useState<WithdrawalRequest[]>([]);
    const [loading, setLoading]       = useState(true);

    // Selection + form
    const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
    const [fieldValues, setFieldValues]       = useState<Record<string, string>>({});
    const [amount, setAmount]                 = useState('');

    // Saved payment details (persisted in localStorage)
    const [savedDetails, setSavedDetails] = useState<Record<number, Record<string, string>>>({});

    // Add Details inline form state
    const [addDetailsMethodId, setAddDetailsMethodId] = useState<number | null>(null);
    const [addDetailsValues, setAddDetailsValues]     = useState<Record<string, string>>({});

    // Exchange rates
    const [rates, setRates]         = useState<ExchangeRate[]>([]);
    const [ratesLoading, setRatesLoading] = useState(false);
    const [ratesError, setRatesError]     = useState(false);
    const [ratesUpdated, setRatesUpdated] = useState<string | null>(null);

    // UI state
    const [mounted, setMounted]       = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError]           = useState<string | null>(null);
    const [success, setSuccess]       = useState<string | null>(null);

    // Fetch live exchange rates via backend proxy (avoids CORS)
    const fetchRates = async () => {
        setRatesLoading(true);
        setRatesError(false);
        try {
            const res = await fetch(`${API_URL}/withdrawal-admin/exchange-rates`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            if (!json.success) throw new Error(json.message);
            setRates(json.rates as ExchangeRate[]);
            setRatesUpdated(json.date ?? new Date().toLocaleDateString());
        } catch {
            setRatesError(true);
        } finally {
            setRatesLoading(false);
        }
    };

    useEffect(() => {
        fetchRates();
        const interval = setInterval(fetchRates, 5 * 60 * 1000); // refresh every 5 min
        return () => clearInterval(interval);
    }, []);

    useEffect(() => { setMounted(true); }, []);

    // Load saved payment details from localStorage
    useEffect(() => {
        try {
            const stored = localStorage.getItem(SAVED_DETAILS_KEY);
            if (stored) setSavedDetails(JSON.parse(stored));
        } catch {}
    }, []);

    useEffect(() => {
        const load = async () => {
            try {
                const profile = await authService.getProfile();
                setBalance(parseFloat(profile.wallet_balance) || 0);
            } catch (err) {
                console.error('Failed to load profile:', err);
            }

            try {
                const v = await authFetch(`${API_URL}/verification/status`).then(r => r.json());
                if (v.success) {
                    const status = v.verification?.status as VerificationStatus | undefined;
                    setVerStatus(status || 'None');
                }
            } catch (err) {
                console.error('Failed to load verification status:', err);
            }

            try {
                const s = await fetch(`${API_URL}/withdrawal-admin/settings`).then(r => r.json());
                if (s.success && s.settings) {
                    setSettings({
                        min_amount: Number(s.settings.min_amount),
                        max_amount: Number(s.settings.max_amount),
                        coin_rate:  Number(s.settings.coin_rate) || 0.0056,
                    });
                }
            } catch (err) {
                console.error('Failed to load withdrawal settings:', err);
            }

            try {
                const m = await fetch(`${API_URL}/withdrawals/payment-methods`).then(r => r.json());
                if (m.success) setMethods(m.methods || []);
            } catch (err) {
                console.error('Failed to load payment methods:', err);
            }

            try {
                const r = await authFetch(`${API_URL}/withdrawals/my-requests`).then(r => r.json());
                if (r.success) setRecentRequests(r.requests || []);
            } catch (err) {
                console.error('Failed to load withdrawal requests:', err);
            }

            setLoading(false);
        };
        load();
    }, []);

    const isVerified    = verStatus === 'Verified';
    const coinRate      = settings?.coin_rate ?? 0.0056;
    const numAmount     = parseFloat(amount) || 0;
    const withdrawLimit = settings?.max_amount ?? 10000;
    const balancePct    = Math.min(100, Math.floor((balance / withdrawLimit) * 100));
    const limitReached  = balancePct >= 100;

    const persistSavedDetails = (methodId: number, details: Record<string, string>) => {
        const updated = { ...savedDetails, [methodId]: details };
        setSavedDetails(updated);
        try { localStorage.setItem(SAVED_DETAILS_KEY, JSON.stringify(updated)); } catch {}
    };

    const selectMethod = (method: PaymentMethod) => {
        setSelectedMethod(method);
        // Auto-fill with any previously saved details for this method
        setFieldValues(savedDetails[method.id] ? { ...savedDetails[method.id] } : {});
        setAmount('');
        setError(null);
        setSuccess(null);
    };

    const openAddDetails = (method: PaymentMethod) => {
        if (addDetailsMethodId === method.id) {
            setAddDetailsMethodId(null);
            setAddDetailsValues({});
        } else {
            setAddDetailsMethodId(method.id);
            setAddDetailsValues(savedDetails[method.id] ? { ...savedDetails[method.id] } : {});
        }
    };

    const saveAddDetails = (method: PaymentMethod) => {
        persistSavedDetails(method.id, addDetailsValues);
        setAddDetailsMethodId(null);
        setAddDetailsValues({});
    };

    const handleSubmit = async () => {
        if (!selectedMethod || !isVerified) return;
        setError(null);
        setSuccess(null);

        for (const f of selectedMethod.fields) {
            if (f.required && !fieldValues[f.key]?.trim()) {
                setError(`"${f.label}" is required.`);
                return;
            }
        }

        const n = parseFloat(amount);
        if (!n || n <= 0) { setError('Enter a valid withdrawal amount.'); return; }
        if (settings && n < settings.min_amount) { setError(`Minimum withdrawal is ${settings.min_amount.toLocaleString()} coins.`); return; }
        if (settings && n > settings.max_amount) { setError(`Maximum withdrawal is ${settings.max_amount.toLocaleString()} coins.`); return; }
        if (n > balance) { setError('Insufficient balance.'); return; }

        setSubmitting(true);
        try {
            const res = await authFetch(`${API_URL}/withdrawals/request`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    payment_method_id: selectedMethod.id,
                    amount: n,
                    payment_details: fieldValues,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.message || 'Withdrawal failed.');

            setSuccess('Withdrawal request submitted successfully.');
            setBalance(b => b - n);
            setAmount('');
            setFieldValues({});
            setSelectedMethod(null);

            const r = await authFetch(`${API_URL}/withdrawals/my-requests`).then(r => r.json());
            if (r.success) setRecentRequests(r.requests || []);
        } catch (err: any) {
            setError(err?.message || 'Withdrawal failed. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    if (!mounted || loading) {
        return (
            <div className="flex flex-col gap-3 justify-center items-center min-h-[60vh]">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white/30" />
                <p className="text-gray-500 text-xs font-bold uppercase tracking-widest">Loading…</p>
            </div>
        );
    }

    return (
        <div className="pb-10 relative min-h-screen">
            {/* Back */}
            <div className="mb-4">
                <button onClick={() => router.back()} className="flex items-center gap-2 text-white/60 hover:text-white transition-colors">
                    <IonIcon name="chevron-back-outline" className="text-xl" />
                    <span className="text-[11px] font-bold uppercase tracking-widest">Back</span>
                </button>
            </div>

            <h1 className="text-2xl font-bold mb-6 text-white tracking-tight">Withdrawal</h1>

            <div className="bg-[#070707] border border-gray-800 rounded-2xl overflow-hidden mb-20 shadow-lg">

                {/* Tabs */}
                <div className="border-b border-gray-800 px-6">
                    <div className="flex gap-8 overflow-x-auto scrollbar-hide">
                        {[
                            { key: 'withdrawal', label: 'My Withdrawal' },
                            { key: 'recent',     label: 'Recent Withdrawals' },
                            { key: 'methods',    label: 'Payment Methods' },
                            { key: 'analytics',  label: 'Analytics' },
                        ].map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key as any)}
                                className={`pb-3 pt-4 text-sm font-semibold transition-all border-b-2 whitespace-nowrap ${
                                    activeTab === tab.key ? 'text-white border-white' : 'text-gray-500 border-transparent hover:text-gray-300'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── My Withdrawal tab ── */}
                {activeTab === 'withdrawal' && (
                    <div className="p-6 md:p-8">
                        <div className="max-w-md mx-auto">
                            <h4 className="text-lg font-bold text-white mb-6 text-center">Withdrawal Money</h4>

                            {/* Balance card */}
                            <div className="bg-[#070707] border border-gray-700 rounded-xl p-5 mb-6 flex items-center justify-between">
                                <div>
                                    <p className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-2">My Total Rupier Coins</p>
                                    <h2 className="text-3xl font-bold text-white tracking-wide">{balance.toFixed(2)}</h2>
                                </div>
                                <div className="relative w-12 h-12 shrink-0">
                                    <Image src="/assets/images/rupee.png" alt="R" fill className="object-contain" />
                                </div>
                            </div>

                            {/* ── Withdrawal Progress Bar ── */}
                            <div className="mb-7">
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Withdrawal Progress</p>
                                    <p className="text-xs font-bold text-white font-mono">{Math.floor(balance).toLocaleString()} / {withdrawLimit.toLocaleString()} coins</p>
                                </div>
                                <div className="w-full h-3 bg-gray-800 rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full bg-green-500 transition-all duration-700"
                                        style={{ width: `${balancePct}%` }}
                                    />
                                </div>
                                <div className="flex items-center justify-between mt-2">
                                    <p className="text-[10px] text-gray-500 font-mono tracking-wider">
                                        Completed {balancePct}%
                                    </p>
                                    {limitReached && (
                                        <p className="text-[10px] text-green-400 font-bold uppercase tracking-wider">Ready</p>
                                    )}
                                </div>
                                {!limitReached && (
                                    <p className="text-[10px] text-gray-600 mt-1 text-center">
                                        Earn {(withdrawLimit - balance).toFixed(0)} more coins to unlock ID Verification
                                    </p>
                                )}
                            </div>

                            {/* ── ID Verification Button ── */}
                            <div className="flex justify-center mb-7">
                                {isVerified ? (
                                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-emerald-500/30 bg-emerald-500/10">
                                        <IonIcon name="checkmark-circle" className="text-emerald-400 text-base" />
                                        <span className="text-xs font-bold text-emerald-400">Identity Verified</span>
                                    </div>
                                ) : limitReached ? (
                                    <Link
                                        href="/dashboard/wallet/verification"
                                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white text-black text-xs font-bold uppercase tracking-widest hover:bg-gray-200 transition-all active:scale-95 shadow-lg"
                                    >
                                        <IonIcon name="shield-checkmark-outline" className="text-base" />
                                        ID Verification
                                    </Link>
                                ) : (
                                    <button
                                        disabled
                                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gray-800 text-gray-600 text-xs font-bold uppercase tracking-widest cursor-not-allowed select-none"
                                    >
                                        <IonIcon name="shield-checkmark-outline" className="text-base" />
                                        ID Verification
                                    </button>
                                )}
                            </div>

                            {/* ── PAYMENT METHOD SELECTION ── */}
                            {!selectedMethod && (
                                <>
                                    {isVerified ? (
                                        <>
                                            <p className={labelCls + " text-center mb-4"}>Select Payment Method</p>
                                            {methods.length === 0 ? (
                                                <div className="flex flex-col items-center justify-center py-10 opacity-40">
                                                    <IonIcon name="card-outline" className="text-4xl mb-2" />
                                                    <p className="text-xs font-bold uppercase tracking-widest">No payment methods available</p>
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-2 gap-3">
                                                    {methods.map(method => (
                                                        <button
                                                            key={method.id}
                                                            type="button"
                                                            onClick={() => selectMethod(method)}
                                                            className="flex flex-col items-center gap-2.5 bg-[#030303] border border-gray-700/50 rounded-xl px-4 py-5 hover:bg-[#0b0b0b] hover:border-gray-600 transition-all shadow-inner group"
                                                        >
                                                            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-gray-700/50 bg-white p-1.5 group-hover:border-gray-600 transition-all">
                                                                <PaymentLogo icon={method.icon} className="w-full h-full" />
                                                            </div>
                                                            <p className="text-xs font-bold text-white text-center leading-tight">{method.name}</p>
                                                            {savedDetails[method.id] && (
                                                                <span className="text-[9px] text-green-400 font-semibold uppercase tracking-wider">Details saved</span>
                                                            )}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <div className="bg-[#030303] border border-amber-500/15 rounded-xl px-4 py-4 flex items-start gap-3 shadow-inner">
                                            <IonIcon name="lock-closed-outline" className="text-amber-400 text-base shrink-0 mt-0.5" />
                                            <div>
                                                <p className="text-xs text-amber-300 font-semibold">Withdrawal locked</p>
                                                <p className="text-[10px] text-gray-500 mt-0.5">
                                                    {limitReached
                                                        ? <>Complete ID Verification to access payment methods. <Link href="/dashboard/wallet/verification" className="text-white underline underline-offset-2">Apply now →</Link></>
                                                        : 'Accumulate enough coins and complete ID Verification to unlock withdrawals.'
                                                    }
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}

                            {/* ── DYNAMIC FORM after method selected ── */}
                            {selectedMethod && (
                                <div>
                                    {/* Method header */}
                                    <div className="flex items-center gap-3 mb-6 p-3 bg-[#030303] border border-gray-700/50 rounded-xl shadow-inner">
                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-700/50 bg-white p-1">
                                            <PaymentLogo icon={selectedMethod.icon} className="w-full h-full" />
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-xs font-bold text-white">{selectedMethod.name}</p>
                                            <p className="text-[10px] text-gray-500">Fill in your payment details below</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => { setSelectedMethod(null); setFieldValues({}); setAmount(''); setError(null); }}
                                            className="text-[10px] text-gray-500 hover:text-white font-bold uppercase tracking-widest transition-colors"
                                        >
                                            Change
                                        </button>
                                    </div>

                                    {/* Dynamic fields */}
                                    <div className="space-y-4 mb-5">
                                        {selectedMethod.fields.map((field) => (
                                            <div key={field.key}>
                                                <label className={labelCls}>
                                                    {field.label}
                                                    {field.required && <span className="text-red-400 ml-1">*</span>}
                                                </label>
                                                {field.type === 'select' && field.options ? (
                                                    <div className="relative">
                                                        <select
                                                            className={inputCls + " appearance-none"}
                                                            value={fieldValues[field.key] || ''}
                                                            onChange={e => setFieldValues(v => ({ ...v, [field.key]: e.target.value }))}
                                                        >
                                                            <option value="">Select…</option>
                                                            {field.options.map(opt => (
                                                                <option key={opt} value={opt}>{opt}</option>
                                                            ))}
                                                        </select>
                                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                                                            <IonIcon name="chevron-down-outline" />
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <input
                                                        type={field.type || 'text'}
                                                        className={inputCls}
                                                        placeholder={field.placeholder || ''}
                                                        value={fieldValues[field.key] || ''}
                                                        onChange={e => setFieldValues(v => ({ ...v, [field.key]: e.target.value }))}
                                                    />
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    {/* Amount */}
                                    <div className="mb-2">
                                        <label className={labelCls + " text-center"}>Enter Withdrawal Amount <span className="text-red-400">*</span></label>
                                        <input
                                            type="number"
                                            value={amount}
                                            onChange={e => { setAmount(e.target.value); setError(null); }}
                                            placeholder={settings ? `Min ${settings.min_amount}` : '0'}
                                            className="w-full bg-[#030303] border border-gray-700/50 rounded-xl px-4 py-4 text-white text-center text-2xl font-bold focus:outline-none focus:ring-1 focus:ring-white/30 shadow-inner transition-all placeholder-gray-700"
                                        />
                                    </div>

                                    {/* Conversion */}
                                    <p className="text-center text-xs font-mono mb-5 mt-1">
                                        {numAmount > 0 ? (
                                            <span className="text-gray-400">
                                                {numAmount.toLocaleString()} Coins = <span className="text-white font-bold">${(numAmount * coinRate).toFixed(2)}</span>
                                            </span>
                                        ) : (
                                            <span className="text-gray-600">1000 Coins = ${(1000 * coinRate).toFixed(2)}</span>
                                        )}
                                    </p>

                                    {/* Error / success */}
                                    {error && (
                                        <div className="mb-4 bg-[#030303] border border-red-500/20 rounded-xl px-4 py-3 flex items-start gap-3 shadow-inner">
                                            <IonIcon name="alert-circle-outline" className="text-red-400 text-base shrink-0 mt-0.5" />
                                            <p className="text-xs text-red-300">{error}</p>
                                        </div>
                                    )}
                                    {success && (
                                        <div className="mb-4 bg-[#030303] border border-emerald-500/20 rounded-xl px-4 py-3 flex items-start gap-3 shadow-inner">
                                            <IonIcon name="checkmark-circle-outline" className="text-emerald-400 text-base shrink-0 mt-0.5" />
                                            <p className="text-xs text-emerald-300">{success}</p>
                                        </div>
                                    )}

                                    {/* Buttons */}
                                    <div className="flex gap-3">
                                        <button
                                            type="button"
                                            onClick={() => { setSelectedMethod(null); setFieldValues({}); setAmount(''); setError(null); }}
                                            className="flex-1 py-3.5 bg-zinc-800/80 hover:bg-zinc-800 text-white font-bold rounded-full transition-all active:scale-95 text-xs uppercase tracking-widest"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleSubmit}
                                            disabled={submitting || !isVerified || (numAmount > 0 && !!settings && numAmount < settings.min_amount)}
                                            className="flex-1 py-3.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-full transition-all active:scale-95 shadow-lg text-xs uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {submitting ? (
                                                <><IonIcon name="reload-outline" className="animate-spin text-sm" /> Processing…</>
                                            ) : 'Withdrawal'}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Global success (after submit resets form) */}
                            {!selectedMethod && success && (
                                <div className="mt-5 bg-[#030303] border border-emerald-500/20 rounded-xl px-4 py-3 flex items-start gap-3 shadow-inner">
                                    <IonIcon name="checkmark-circle-outline" className="text-emerald-400 text-base shrink-0 mt-0.5" />
                                    <p className="text-xs text-emerald-300">{success}</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ── Payment Methods tab ── */}
                {activeTab === 'methods' && (
                    <div className="p-6 md:p-8">
                        <div className="font-bold text-white mb-6 text-sm flex items-center gap-2">
                            <IonIcon name="card-outline" className="text-lg opacity-50" />
                            Available Payment Methods
                        </div>
                        {methods.length > 0 ? (
                            <div className="space-y-3">
                                {methods.map(method => (
                                    <div key={method.id}>
                                        <div className="bg-[#030303] border border-gray-700/50 rounded-xl p-4 flex items-center gap-4 shadow-inner">
                                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-gray-700/50 bg-white p-1.5">
                                                <PaymentLogo icon={method.icon} className="w-full h-full" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-bold text-white">{method.name}</p>
                                                <p className="text-[10px] text-gray-500 mt-0.5">
                                                    {method.fields.length > 0
                                                        ? method.fields.map(f => f.label).join(' · ')
                                                        : 'No fields configured'}
                                                </p>
                                                {savedDetails[method.id] && (
                                                    <p className="text-[10px] text-green-400 mt-0.5 font-semibold">
                                                        <IonIcon name="checkmark-circle" className="text-xs mr-0.5" />
                                                        Details saved
                                                    </p>
                                                )}
                                            </div>
                                            <div className="flex flex-col gap-2 shrink-0">
                                                <button
                                                    type="button"
                                                    onClick={() => { selectMethod(method); setActiveTab('withdrawal'); }}
                                                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.06] border border-gray-700/50 text-[10px] font-bold text-white uppercase tracking-widest hover:bg-white/10 transition-all"
                                                >
                                                    Select
                                                    <IonIcon name="chevron-forward-outline" className="text-xs" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => openAddDetails(method)}
                                                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all ${
                                                        addDetailsMethodId === method.id
                                                            ? 'bg-white/10 border-white/20 text-white'
                                                            : 'bg-transparent border-gray-700/50 text-gray-400 hover:text-white hover:border-gray-600'
                                                    }`}
                                                >
                                                    <IonIcon name="create-outline" className="text-xs" />
                                                    Add Details
                                                </button>
                                            </div>
                                        </div>

                                        {/* Inline Add Details form */}
                                        {addDetailsMethodId === method.id && (
                                            <div className="mt-1 bg-[#030303] border border-gray-700/50 border-t-0 rounded-b-xl px-5 py-5 space-y-4">
                                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                                                    Save Payment Details — {method.name}
                                                </p>
                                                {method.fields.length === 0 ? (
                                                    <p className="text-xs text-gray-600">No fields configured for this method.</p>
                                                ) : (
                                                    method.fields.map(field => (
                                                        <div key={field.key}>
                                                            <label className={labelCls}>
                                                                {field.label}
                                                                {field.required && <span className="text-red-400 ml-1">*</span>}
                                                            </label>
                                                            {field.type === 'select' && field.options ? (
                                                                <div className="relative">
                                                                    <select
                                                                        className={inputCls + " appearance-none"}
                                                                        value={addDetailsValues[field.key] || ''}
                                                                        onChange={e => setAddDetailsValues(v => ({ ...v, [field.key]: e.target.value }))}
                                                                    >
                                                                        <option value="">Select…</option>
                                                                        {field.options.map(opt => (
                                                                            <option key={opt} value={opt}>{opt}</option>
                                                                        ))}
                                                                    </select>
                                                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                                                                        <IonIcon name="chevron-down-outline" />
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <input
                                                                    type={field.type || 'text'}
                                                                    className={inputCls}
                                                                    placeholder={field.placeholder || ''}
                                                                    value={addDetailsValues[field.key] || ''}
                                                                    onChange={e => setAddDetailsValues(v => ({ ...v, [field.key]: e.target.value }))}
                                                                />
                                                            )}
                                                        </div>
                                                    ))
                                                )}
                                                <div className="flex gap-3 pt-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => { setAddDetailsMethodId(null); setAddDetailsValues({}); }}
                                                        className="flex-1 py-2.5 bg-zinc-800/80 hover:bg-zinc-800 text-white font-bold rounded-full transition-all text-xs uppercase tracking-widest"
                                                    >
                                                        Cancel
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => saveAddDetails(method)}
                                                        className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-full transition-all text-xs uppercase tracking-widest flex items-center justify-center gap-1.5"
                                                    >
                                                        <IonIcon name="checkmark-outline" className="text-sm" />
                                                        Save Details
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-16 opacity-30">
                                <IonIcon name="card-outline" className="text-4xl mb-3" />
                                <p className="text-xs font-black uppercase tracking-widest">No payment methods available</p>
                                <p className="text-[10px] text-gray-600 mt-1">Admin has not added any methods yet</p>
                            </div>
                        )}
                    </div>
                )}

                {/* ── Analytics tab ── */}
                {activeTab === 'analytics' && (
                    <div className="p-6 md:p-8">

                        {/* Live Exchange Rates */}
                        <div className="mb-8">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <IonIcon name="trending-up-outline" className="text-lg text-white opacity-50" />
                                    <span className="font-bold text-white text-sm">Live Exchange Rates</span>
                                    <span className="text-[9px] font-semibold text-gray-600 uppercase tracking-widest bg-gray-800 px-1.5 py-0.5 rounded">R</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={fetchRates}
                                    disabled={ratesLoading}
                                    className="flex items-center gap-1.5 text-[10px] text-gray-500 hover:text-white transition-colors disabled:opacity-40"
                                >
                                    <IonIcon name="reload-outline" className={`text-xs ${ratesLoading ? 'animate-spin' : ''}`} />
                                    {ratesUpdated ? `Updated ${ratesUpdated}` : 'Refresh'}
                                </button>
                            </div>

                            {ratesLoading && rates.length === 0 ? (
                                <div className="flex items-center justify-center py-8 opacity-40">
                                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white/30 mr-3" />
                                    <span className="text-xs text-gray-500">Fetching rates…</span>
                                </div>
                            ) : ratesError && rates.length === 0 ? (
                                <div className="bg-[#030303] border border-red-500/15 rounded-xl px-4 py-4 flex items-center gap-3">
                                    <IonIcon name="alert-circle-outline" className="text-red-400 text-base shrink-0" />
                                    <div>
                                        <p className="text-xs text-red-300 font-semibold">Unable to load exchange rates</p>
                                        <button onClick={fetchRates} className="text-[10px] text-gray-500 underline mt-0.5">Retry</button>
                                    </div>
                                </div>
                            ) : rates.length > 0 ? (
                                <div className="bg-[#030303] border border-gray-700/50 rounded-xl overflow-hidden shadow-inner">
                                    {rates.map((rate, i) => (
                                        <div
                                            key={rate.currency}
                                            className={`flex items-center justify-between px-5 py-4 ${i < rates.length - 1 ? 'border-b border-gray-800/60' : ''}`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <span className="text-xs font-black text-white bg-gray-800 px-2 py-0.5 rounded tracking-widest">{rate.currency}</span>
                                                <span className="text-xs text-gray-500">1 {rate.currency} =</span>
                                            </div>
                                            <p className="text-sm font-bold text-green-400">
                                                {rate.rate != null ? `R ${Math.round(rate.rate)}` : '—'}
                                            </p>
                                        </div>
                                    ))}
                                    {ratesUpdated && (
                                        <div className="px-5 py-2.5 border-t border-gray-800/60 flex items-center gap-1.5">
                                            <IonIcon name="information-circle-outline" className="text-xs text-gray-600" />
                                            <p className="text-[9px] text-gray-600">Mid-market rate · {ratesUpdated}</p>
                                        </div>
                                    )}
                                </div>
                            ) : null}
                        </div>

                        {/* Withdrawal stats summary */}
                        <div>
                            <div className="flex items-center gap-2 mb-4">
                                <IonIcon name="bar-chart-outline" className="text-lg text-white opacity-50" />
                                <span className="font-bold text-white text-sm">My Withdrawal Summary</span>
                            </div>
                            {recentRequests.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-10 opacity-30">
                                    <IonIcon name="analytics-outline" className="text-4xl mb-2" />
                                    <p className="text-xs font-bold uppercase tracking-widest">No withdrawal data yet</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-3">
                                    {[
                                        { label: 'Total Requests',  value: recentRequests.length,                                                        color: 'text-white' },
                                        { label: 'Approved',        value: recentRequests.filter(r => r.status === 'Approved').length,                   color: 'text-green-400' },
                                        { label: 'Pending',         value: recentRequests.filter(r => r.status === 'Pending').length,                    color: 'text-amber-400' },
                                        { label: 'Rejected',        value: recentRequests.filter(r => r.status === 'Rejected').length,                   color: 'text-red-400' },
                                        { label: 'Total Withdrawn', value: recentRequests.reduce((s, r) => s + parseFloat(r.amount), 0).toLocaleString() + ' coins', color: 'text-white' },
                                        { label: 'Approved Amount', value: recentRequests.filter(r => r.status === 'Approved').reduce((s, r) => s + parseFloat(r.amount), 0).toLocaleString() + ' coins', color: 'text-green-400' },
                                    ].map(stat => (
                                        <div key={stat.label} className="bg-[#030303] border border-gray-700/50 rounded-xl px-4 py-3 shadow-inner">
                                            <p className="text-[9px] text-gray-600 uppercase tracking-wider font-semibold mb-1">{stat.label}</p>
                                            <p className={`text-sm font-bold ${stat.color}`}>{stat.value}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ── Recent Withdrawals tab ── */}
                {activeTab === 'recent' && (
                    <div className="p-6 md:p-8">
                        <div className="font-bold text-white mb-6 text-sm flex items-center gap-2">
                            <IonIcon name="time-outline" className="text-lg opacity-50" />
                            Recent Withdrawals
                        </div>
                        {recentRequests.length > 0 ? (
                            <div className="space-y-3">
                                {recentRequests.map(req => (
                                    <div key={req.id} className="bg-gray-800/20 border border-gray-800 rounded-xl p-4 hover:bg-gray-800/40 transition-all">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 bg-red-500/10 rounded-xl flex items-center justify-center text-red-400 text-xl shrink-0">
                                                <IonIcon name="arrow-up-outline" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-center mb-0.5">
                                                    <h5 className="font-bold text-white text-sm truncate max-w-[120px]">{req.payment_method_name}</h5>
                                                    <span className="text-sm font-bold text-white">- R {parseFloat(req.amount).toFixed(2)}</span>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <p className="text-[10px] text-gray-500 font-medium">
                                                        {new Date(req.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Colombo' })}
                                                        {' · '}#{req.id}
                                                    </p>
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md bg-gray-900/50 ${
                                                        req.status === 'Approved'  ? 'text-green-400' :
                                                        req.status === 'Pending'   ? 'text-amber-400' :
                                                        req.status === 'Rejected'  ? 'text-red-400'   : 'text-gray-400'
                                                    }`}>{req.status}</span>
                                                </div>
                                                {req.status === 'Rejected' && req.rejection_reason && (
                                                    <p className="text-[10px] text-red-400/70 mt-1 truncate">{req.rejection_reason}</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-16 opacity-30">
                                <IonIcon name="cash-outline" className="text-4xl mb-3" />
                                <p className="text-xs font-black uppercase tracking-widest">No withdrawals yet</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="h-20 md:hidden" />
        </div>
    );
}
