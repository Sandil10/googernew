"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import IonIcon from "@/app/components/IonIcon";
import { authService } from "@/services/authService";
import { getUserIdentityKey, getWalletBalanceWithAdAdjustments } from "@/utils/adWallet";
import { subscriptionService, SubscriptionPlan, UserSubscription } from "@/services/subscriptionService";
import { clearFeaturesCache, refreshSubscriptionFeatures } from "@/app/lib/subscriptionFeatures";

const BADGE_TEXT: Record<string, string> = {
    silver: "text-zinc-300",
    blue:   "text-blue-400",
    gold:   "text-amber-400",
    green:  "text-emerald-400",
    purple: "text-purple-400",
    red:    "text-red-400",
};

const ACCENT_BAR: Record<string, string> = {
    zinc:    "bg-zinc-400",
    blue:    "bg-blue-500",
    amber:   "bg-amber-400",
    emerald: "bg-emerald-500",
    purple:  "bg-purple-500",
    red:     "bg-red-500",
};


export default function SubscriptionPage() {
    const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [paying, setPaying] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    const [balance, setBalance] = useState<number>(0);
    const [sheetOpen, setSheetOpen] = useState(false);
    const [insufficient, setInsufficient] = useState(false);
    const [success, setSuccess] = useState<string | null>(null);
    const [activeSub, setActiveSub] = useState<UserSubscription | null>(null);
    const [cancelling, setCancelling] = useState(false);
    const [cancelToast, setCancelToast] = useState(false);

    const loadActiveSub = async () => {
        try {
            const sub = await subscriptionService.getMySubscription();
            setActiveSub(sub);
        } catch {
            setActiveSub(null);
        }
    };

    useEffect(() => {
        const load = async () => {
            try {
                const [data] = await Promise.all([
                    subscriptionService.getPublicPlans(),
                    loadActiveSub(),
                ]);
                const paid = data.filter((p: any) => p.slug !== 'basic' && Number(p.price) > 0);
                setPlans(paid);
                setSelectedId(paid[0]?.id ?? null);
            } catch {
                setPlans([]);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const refreshBalance = async () => {
        try {
            const profile = await authService.getProfile();
            const raw = parseFloat(profile.wallet_balance) || 0;
            setBalance(getWalletBalanceWithAdAdjustments(raw, getUserIdentityKey(profile)));
        } catch {
            setBalance(0);
        }
    };

    const selectedPlan = plans.find((p) => p.id === selectedId) || null;

    const openPaymentSheet = async () => {
        if (!selectedPlan) return;
        setMessage(null);
        setInsufficient(false);
        await refreshBalance();
        setSheetOpen(true);
    };

    const closeSheet = () => {
        if (paying) return;
        setSheetOpen(false);
        setInsufficient(false);
    };

    const handlePay = async () => {
        if (!selectedPlan) return;
        const price = Number(selectedPlan.price) || 0;
        if (balance < price) {
            setInsufficient(true);
            return;
        }
        setPaying(true);
        try {
            const result = await subscriptionService.subscribe(selectedPlan.id);
            if ('error' in result) {
                if (result.code === 402) {
                    setInsufficient(true);
                } else {
                    setMessage(result.error);
                    setSheetOpen(false);
                }
                return;
            }
            setSheetOpen(false);
            setActiveSub(result.subscription);
            setSuccess(`Payment successful! You're subscribed to ${selectedPlan.name}.`);
            await refreshBalance();
            // Force features to reload so plan perks apply immediately everywhere
            clearFeaturesCache();
            window.dispatchEvent(new Event('subscription:changed'));
            window.dispatchEvent(new Event('googer-wallet-updated'));
            await refreshSubscriptionFeatures();
        } finally {
            setPaying(false);
        }
    };

    const handleCancel = async () => {
        if (!activeSub) return;
        setCancelling(true);
        try {
            const ok = await subscriptionService.cancelMySubscription();
            if (ok) {
                setActiveSub(null);
                setSelectedId(plans[0]?.id ?? null);
                clearFeaturesCache();
                // Dispatch subscription:changed so ALL feature-dependent components refetch
                window.dispatchEvent(new Event('subscription:changed'));
                window.dispatchEvent(new Event('googer-wallet-updated'));
                // Wait for the refetch to complete so basic features are active before toast
                await refreshSubscriptionFeatures();
                setCancelToast(true);
                setTimeout(() => setCancelToast(false), 3500);
            } else {
                setMessage("Failed to cancel subscription.");
            }
        } finally {
            setCancelling(false);
        }
    };

    const isSelectedActive = !!(activeSub && selectedPlan && activeSub.plan_id === selectedPlan.id && activeSub.status === 'active');
    const isBasicPlan = selectedPlan?.slug === 'basic' || Number(selectedPlan?.price) === 0;
    // Basic is the default plan every user has — treat it as "no paid subscription"
    const isBasicActiveSub = !activeSub || activeSub.plan_slug === 'basic';

    const handleToggleRenew = async () => {
        if (!activeSub) return;
        const next = !activeSub.auto_renew;
        // optimistic
        setActiveSub({ ...activeSub, auto_renew: next });
        const updated = await subscriptionService.setAutoRenew(next);
        if (updated) setActiveSub(updated);
        else setActiveSub({ ...activeSub, auto_renew: !next });
    };

    const formatDate = (iso?: string | null) => {
        if (!iso) return "—";
        const d = new Date(iso);
        return d.toLocaleDateString("en-GB", { year: 'numeric', month: 'short', day: 'numeric', timeZone: "Asia/Colombo" });
    };

    const selectedPrice = selectedPlan ? Number(selectedPlan.price) || 0 : 0;
    const shortfall = Math.max(0, selectedPrice - balance);

    return (
        <div className="relative min-h-screen pb-10">
            <div className="flex justify-end mb-4 max-w-2xl mx-auto">
                <Link
                    href="/dashboard/wallet"
                    className="w-9 h-9 rounded-full border border-white/15 bg-white/5 flex items-center justify-center text-white/80 hover:bg-white/10 transition"
                >
                    <IonIcon name="close-outline" className="text-base" />
                </Link>
            </div>

            <div className="text-center mb-8">
                <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Choose Your Plan</h1>
                <p className="text-xs text-white/55 mt-2">Pick a subscription that fits you.</p>
            </div>

            {loading ? (
                <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-red-600"></div>
                </div>
            ) : (
                <div className="flex flex-col gap-3 max-w-2xl mx-auto">
                    {plans.map((plan) => {
                        const isSelected = selectedId === plan.id;
                        const badgeTextCls = BADGE_TEXT[plan.badge_color] || "text-zinc-300";
                        const accentBarCls = ACCENT_BAR[plan.accent_color] || "bg-zinc-400";
                        const isActiveOnThisPlan = !!(activeSub && activeSub.plan_id === plan.id && activeSub.status === 'active');
                        return (
                            <div
                                key={plan.id}
                                onClick={() => setSelectedId(plan.id)}
                                className={`w-full text-left rounded-2xl overflow-hidden transition-all bg-[#070707] hover:bg-[#0d0d0d] flex flex-col cursor-pointer ${
                                    isActiveOnThisPlan && isSelected
                                        ? "border-2 border-red-500 shadow-[0_0_20px_-8px_rgba(239,68,68,0.5)]"
                                        : isActiveOnThisPlan
                                        ? "border-2 border-green-500 shadow-[0_0_20px_-8px_rgba(34,197,94,0.5)]"
                                        : isSelected
                                        ? "border-2 border-red-500 shadow-[0_0_20px_-8px_rgba(239,68,68,0.6)]"
                                        : "border border-gray-800 hover:border-gray-700"
                                }`}
                            >
                                <div className={`h-1 w-full ${accentBarCls}`}></div>
                                <div className="px-5 py-4 flex items-start justify-between gap-4">
                                    {/* Left: plan info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-3 flex-wrap">
                                            <div className="flex items-center gap-1.5">
                                                <h3 className="text-base font-bold text-white">{plan.name}</h3>
                                                {plan.verified_tick && (
                                                    <IonIcon name="checkmark-circle" className={`text-sm ${badgeTextCls}`} />
                                                )}
                                            </div>
                                            <span className="text-xs text-white/70">
                                                <span className="font-bold text-white">R {Number(plan.price).toLocaleString()}</span>
                                                <span className="text-white/50"> / {plan.duration_days}d</span>
                                            </span>
                                            {isActiveOnThisPlan && (
                                                <span className="text-[10px] font-bold text-green-400 bg-green-500/10 border border-green-500/25 rounded-full px-2 py-0.5">
                                                    Active
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                                            {(plan.features || []).map((f, i) => (
                                                <span key={i} className="inline-flex items-center gap-1 text-[11px] text-white/65">
                                                    <IonIcon name="checkmark-outline" className={`${badgeTextCls} shrink-0 text-xs`} />
                                                    <span>{f}</span>
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Right: indicator + toggle + dates */}
                                    <div className="shrink-0 flex flex-col items-end gap-2 pt-0.5">
                                        {/* Tick / radio */}
                                        {isActiveOnThisPlan && !isSelected ? (
                                            <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                                                <IonIcon name="checkmark-outline" className="text-white text-xs" />
                                            </div>
                                        ) : isSelected ? (
                                            <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                                                <IonIcon name="checkmark-outline" className="text-white text-xs" />
                                            </div>
                                        ) : (
                                            <div className="w-5 h-5 rounded-full border-2 border-white/25"></div>
                                        )}

                                        {/* Auto-renew toggle (only for active plan) */}
                                        {isActiveOnThisPlan && activeSub && (
                                            <>
                                                <div
                                                    onClick={(e) => { e.stopPropagation(); handleToggleRenew(); }}
                                                    role="switch"
                                                    aria-checked={activeSub.auto_renew}
                                                    className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${activeSub.auto_renew ? "bg-green-500" : "bg-gray-700"}`}
                                                    title="Toggle auto-renew"
                                                >
                                                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${activeSub.auto_renew ? "left-[18px]" : "left-0.5"}`}></div>
                                                </div>
                                                <p className={`text-[9px] font-semibold ${activeSub.auto_renew ? "text-green-400" : "text-gray-500"}`}>
                                                    Auto-renew {activeSub.auto_renew ? "ON" : "OFF"}
                                                </p>
                                                <div className="text-right text-[9px] text-white/40 leading-tight">
                                                    <p>Start: {formatDate(activeSub.started_at)}</p>
                                                    <p>Ends: {formatDate(activeSub.expires_at)}</p>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>

                            </div>
                        );
                    })}

                    <div className="mt-4 rounded-2xl border border-gray-800 bg-[#070707] p-4 flex flex-col items-center gap-3">
                        {isSelectedActive ? (
                            <button
                                onClick={handleCancel}
                                disabled={cancelling}
                                className="bg-red-500 hover:bg-red-400 text-white font-bold text-sm px-10 py-2.5 rounded-full transition disabled:opacity-50"
                            >
                                {cancelling ? "Cancelling..." : `Cancel ${selectedPlan?.name}`}
                            </button>
                        ) : isBasicPlan ? (
                            <p className="text-[11px] text-white/50 text-center">This is the free default plan — no payment needed.</p>
                        ) : (
                            <button
                                onClick={openPaymentSheet}
                                disabled={!selectedPlan}
                                className="bg-red-500 hover:bg-red-400 text-white font-bold text-sm px-10 py-2.5 rounded-full transition disabled:opacity-50"
                            >
                                {!isBasicActiveSub ? "Switch Plan & Pay Now" : "Subscribe & Pay Now"}
                            </button>
                        )}
                        {!isBasicPlan && !isBasicActiveSub && activeSub && !isSelectedActive && (
                            <p className="text-[10px] text-amber-300/80 text-center">
                                Subscribing will cancel your current {activeSub.plan_name} plan and switch you to the selected plan.
                            </p>
                        )}
                    </div>

                    {message && (
                        <div className="mt-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300 flex items-start gap-2">
                            <IonIcon name="alert-circle" className="text-red-400 text-sm shrink-0 mt-0.5" />
                            <span>{message}</span>
                        </div>
                    )}
                </div>
            )}

            {/* Bottom payment sheet */}
            {sheetOpen && (
                <div className="fixed inset-0 z-50 flex items-end justify-center">
                    {/* Backdrop */}
                    <div
                        onClick={closeSheet}
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]"
                    ></div>

                    {/* Sheet */}
                    <div className="relative w-full max-w-sm bg-[#070707] border border-gray-800 border-b-0 rounded-t-3xl p-4 pb-6 animate-[slideUp_0.3s_ease-out]">
                        {/* Drag handle */}
                        <div className="flex justify-center mb-2">
                            <div className="w-9 h-1 rounded-full bg-white/15"></div>
                        </div>

                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-bold text-white">Confirm Payment</h3>
                            <button onClick={closeSheet} className="w-7 h-7 rounded-full border border-gray-700 flex items-center justify-center text-white/75 hover:bg-white/5">
                                <IonIcon name="close-outline" className="text-sm" />
                            </button>
                        </div>

                        {/* Wallet balance card */}
                        <div className="rounded-xl border border-gray-800 bg-[#0a0a0a] p-3 mb-2">
                            <p className="text-[9px] uppercase tracking-widest text-gray-500 font-bold mb-0.5">Wallet Balance</p>
                            <div className="flex items-center gap-1.5">
                                <div className="relative w-6 h-4 shrink-0">
                                    <Image src="/assets/images/rupee.png" alt="₹" fill className="object-contain" />
                                </div>
                                <h2 className="text-lg font-bold text-white tracking-tight leading-none">
                                    {balance.toFixed(2)}
                                </h2>
                            </div>
                        </div>

                        {/* Plan summary */}
                        {selectedPlan && (
                            <div className="rounded-xl border border-gray-800 bg-[#0a0a0a] p-3 mb-3 flex items-center justify-between">
                                <div>
                                    <p className="text-[9px] uppercase tracking-widest text-gray-500 font-bold mb-0.5">Selected Plan</p>
                                    <p className="text-xs font-bold text-white">{selectedPlan.name}</p>
                                    <p className="text-[10px] text-white/55">{selectedPlan.duration_days} days</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[9px] uppercase tracking-widest text-gray-500 font-bold mb-0.5">Total</p>
                                    <p className="text-base font-bold text-white">R {selectedPrice.toLocaleString()}</p>
                                </div>
                            </div>
                        )}

                        {/* Pay Now */}
                        <div className="flex justify-center">
                            <button
                                onClick={handlePay}
                                disabled={paying || !selectedPlan}
                                className="bg-red-500 hover:bg-red-400 text-white font-bold text-xs px-8 py-2 rounded-full transition disabled:opacity-50"
                            >
                                {paying ? "Processing..." : "Pay Now"}
                            </button>
                        </div>
                    </div>

                    <style jsx>{`
                        @keyframes slideUp {
                            from { transform: translateY(100%); }
                            to   { transform: translateY(0); }
                        }
                        @keyframes fadeIn {
                            from { opacity: 0; }
                            to   { opacity: 1; }
                        }
                        @keyframes popIn {
                            0%   { transform: scale(0.85); opacity: 0; }
                            100% { transform: scale(1);    opacity: 1; }
                        }
                    `}</style>
                </div>
            )}

            {/* Centered success popup */}
            {success && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
                    <div onClick={() => setSuccess(null)} className="absolute inset-0 bg-black/70 backdrop-blur-sm"></div>
                    <div className="relative w-full max-w-[280px] bg-[#0a0a0a] border border-green-500/40 rounded-2xl p-4 text-center animate-[popIn_0.18s_ease-out]">
                        <div className="w-10 h-10 rounded-full bg-green-500/15 border border-green-500/40 flex items-center justify-center mx-auto mb-2">
                            <IonIcon name="checkmark-circle" className="text-green-400 text-lg" />
                        </div>
                        <p className="text-sm font-bold text-green-300 mb-1">Payment Successful</p>
                        <p className="text-[11px] text-green-300/80 mb-3">{success}</p>
                        <button
                            onClick={() => setSuccess(null)}
                            className="bg-green-500 hover:bg-green-400 text-white font-bold text-[11px] px-5 py-1.5 rounded-full transition"
                        >
                            OK
                        </button>
                    </div>
                    <style jsx>{`
                        @keyframes popIn {
                            0%   { transform: scale(0.85); opacity: 0; }
                            100% { transform: scale(1);    opacity: 1; }
                        }
                    `}</style>
                </div>
            )}

            {/* Centered insufficient-balance error popup */}
            {insufficient && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div onClick={() => setInsufficient(false)} className="absolute inset-0 bg-black/70 backdrop-blur-sm"></div>
                    <div className="relative w-full max-w-[280px] bg-[#0a0a0a] border border-red-500/40 rounded-2xl p-4 text-center animate-[popIn_0.18s_ease-out]">
                        <div className="w-10 h-10 rounded-full bg-red-500/15 border border-red-500/40 flex items-center justify-center mx-auto mb-2">
                            <IonIcon name="alert-circle" className="text-red-400 text-lg" />
                        </div>
                        <p className="text-sm font-bold text-red-300 mb-1">Insufficient Balance</p>
                        <p className="text-[11px] text-red-300/80 mb-3">
                            You need <span className="font-bold">R {shortfall.toFixed(2)}</span> more to subscribe.
                        </p>
                        <div className="flex gap-2 justify-center">
                            <button
                                onClick={() => setInsufficient(false)}
                                className="bg-white/5 border border-gray-700 text-white/80 font-bold text-[11px] px-4 py-1.5 rounded-full hover:bg-white/10 transition"
                            >
                                Close
                            </button>
                            <Link
                                href="/dashboard/wallet/topup"
                                className="bg-red-500 hover:bg-red-400 text-white font-bold text-[11px] px-4 py-1.5 rounded-full transition"
                            >
                                Top Up
                            </Link>
                        </div>
                    </div>
                </div>
            )}

            {/* Cancel success toast */}
            {cancelToast && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-2.5 bg-[#111] border border-white/10 rounded-2xl px-4 py-3 shadow-xl animate-[slideUp_0.25s_ease-out]">
                    <IonIcon name="checkmark-circle" className="text-emerald-400 text-base shrink-0" />
                    <p className="text-xs font-semibold text-white/90">Plan cancelled. You&apos;re now on the Basic plan.</p>
                </div>
            )}
        </div>
    );
}
