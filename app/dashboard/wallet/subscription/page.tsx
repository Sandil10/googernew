"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import IonIcon from "@/app/components/IonIcon";
import { BadgeSvg } from "@/app/components/VerifiedBadge";
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
    black:  "text-zinc-300",
};

const BADGE_THEME: Record<string, { hex: string; rgb: string; text: string }> = {
    silver: { hex: "#d4d4d8", rgb: "212,212,216", text: "text-zinc-300" },
    blue:   { hex: "#60a5fa", rgb: "96,165,250", text: "text-blue-400" },
    gold:   { hex: "#fbbf24", rgb: "251,191,36", text: "text-amber-400" },
    green:  { hex: "#34d399", rgb: "52,211,153", text: "text-emerald-400" },
    purple: { hex: "#c084fc", rgb: "192,132,252", text: "text-purple-400" },
    red:    { hex: "#f87171", rgb: "248,113,113", text: "text-red-400" },
    black:  { hex: "#3d3d3d", rgb: "61,61,61", text: "text-zinc-300" },
};

const hexToRgb = (hex: string, fallback: string) => {
    const match = String(hex || "").trim().match(/^#?([0-9a-f]{6})$/i);
    if (!match) return fallback;
    const value = match[1];
    return `${parseInt(value.slice(0, 2), 16)},${parseInt(value.slice(2, 4), 16)},${parseInt(value.slice(4, 6), 16)}`;
};

const getPlanBadgeTheme = (plan?: SubscriptionPlan | null) => {
    const raw = String(plan?.extra?.badge_custom_color || plan?.badge_color || "silver").trim();
    const named = BADGE_THEME[raw];
    if (named) return named;
    const base = BADGE_THEME[plan?.badge_color || "silver"] || BADGE_THEME.silver;
    if (!raw) return base;
    return { ...base, hex: raw, rgb: hexToRgb(raw, base.rgb) };
};

function isChatFeatureLabel(label: string): boolean {
    const normalized = label.toLowerCase();
    return normalized.includes("chat")
        || normalized.includes("message")
        || normalized.includes("text messaging")
        || normalized.includes("colored text")
        || normalized.includes("text color")
        || normalized.includes("voice note")
        || normalized.includes("voice to text")
        || normalized.includes("text to voice")
        || normalized.includes("voice call")
        || normalized.includes("video call")
        || normalized.includes("sticker")
        || normalized.includes("auto delete")
        || normalized.includes("history kept")
        || normalized.includes("lifetime history");
}

function normalizeChatFeatureLabel(label: string): string | null {
    const cleaned = label
        .replace(/^chat\s*features?\s*:?\s*/i, "")
        .replace(/^chat\s*:?\s*/i, "")
        .trim();
    const normalized = cleaned.toLowerCase();
    if (!cleaned || normalized === "features" || normalized.includes("auto delete") || normalized.includes("history kept") || normalized.includes("lifetime history")) {
        return null;
    }

    if (normalized.includes("voice note") && normalized.includes("text")) return "Voice notes to text";
    if (normalized.includes("voice to text")) return "Voice to text";
    if (normalized.includes("text to voice")) return "Text to voice";
    if (normalized.includes("text messaging") && normalized.includes("color")) return "Text messaging colors";
    if (normalized.includes("colored text") || normalized.includes("text color")) return "Colored text";
    if (normalized.includes("text messaging") || normalized.includes("message")) return "Text messages";
    if (normalized.includes("voice call")) return "Voice calls";
    if (normalized.includes("video call")) return cleaned;
    if (normalized.includes("sticker")) return "Stickers";
    return cleaned;
}

function getContentExpiryLabel(extra: Record<string, any>): string {
    const labels = extra.labels || {};
    const unit = String(extra.content_expiry_unit || "unlimited");
    if (unit === "unlimited") return `${labels.content_expiry || "Upload Content Expiry"}: Lifetime`;
    const value = Math.max(1, Number(extra.content_expiry_value || 1));
    return `${labels.content_expiry || "Upload Content Expiry"}: ${value} ${unit}`;
}

function getPlanFeatureGroups(plan: SubscriptionPlan): { regular: string[]; chat: string[]; content: string[] } {
    const extra = plan.extra || {};
    const manualChat = (plan.features || [])
        .filter((label) => isChatFeatureLabel(String(label)))
        .map((label) => normalizeChatFeatureLabel(String(label)))
        .filter((label): label is string => !!label);
    const regular = (plan.features || []).filter((label) => !isChatFeatureLabel(String(label)));
    const chat: string[] = [];
    const content: string[] = [];
    const contentLabels = extra.labels || {};
    const isBasicPlan = plan.slug === "basic" || Number(plan.price) === 0;
    const dailyUploadLimit = Number(extra.content_daily_upload_limit ?? (isBasicPlan ? 1 : 3));
    const videoLimitMinutes = Number(extra.content_video_limit_minutes ?? (isBasicPlan ? 1 : 5));
    const textMessaging = extra.text_messaging;
    const textMessagingText = String(textMessaging ?? "");
    const hasTextMessaging = textMessaging !== false && textMessaging != null && textMessaging !== 0;
    const hasChatColors = extra.chat_text_colors === true || textMessagingText.includes("colors");
    const hasStickers = extra.chat_stickers === true || textMessagingText.includes("stickers");
    const hasVoiceCalls = extra.voice_calls === true || (extra.voice_calls !== false && extra.voice_calls != null);
    const hasVideoCalls = extra.video_calls === true;
    const hasVoiceToText = extra.voice_notes_to_text || extra.voice_to_text || extra.speech_to_text || extra.microphone;
    const hasTextToVoice = extra.text_to_voice_note || extra.text_to_voice || extra.tts || extra.speech;

    if (hasTextMessaging) chat.push("Text messages");
    if (hasChatColors) chat.push("Text messaging colors");
    if (hasStickers) chat.push("Stickers");
    if (hasVoiceCalls) chat.push("Voice calls");
    if (hasVideoCalls) {
        const quality = String(extra.video_call_quality || "").trim();
        chat.push(quality ? `Video calls (${quality})` : "Video calls");
    }
    if (hasVoiceToText) chat.push("Voice to text");
    if (hasTextToVoice) chat.push("Text to voice");
    if (Number.isFinite(dailyUploadLimit) && dailyUploadLimit > 0) content.push(`${contentLabels.content_daily_upload_limit || "Daily Uploads"}: ${dailyUploadLimit}`);
    if (Number.isFinite(videoLimitMinutes) && videoLimitMinutes > 0) content.push(`${contentLabels.content_video_limit_minutes || "Video Limit"}: ${videoLimitMinutes} minute${videoLimitMinutes === 1 ? "" : "s"}`);
    content.push(getContentExpiryLabel(extra));

    return {
        regular: regular.filter((label, index, list) => list.indexOf(label) === index),
        chat: [...manualChat, ...chat].filter((label, index, list) => list.indexOf(label) === index),
        content: content.filter((label, index, list) => list.indexOf(label) === index),
    };
}


export default function SubscriptionPage() {
    const router = useRouter();
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
    const [nowMs, setNowMs] = useState(() => Date.now());
    const [openChatFeatures, setOpenChatFeatures] = useState<Record<number, boolean>>({});
    const [openContentFeatures, setOpenContentFeatures] = useState<Record<number, boolean>>({});
    const lastSubRef = useRef<UserSubscription | null>(null);
    const hasLoadedSubRef = useRef(false);

    const loadActiveSub = async () => {
        try {
            const sub = await subscriptionService.getMySubscription();
            const previous = lastSubRef.current;
            const renewed = !!(
                hasLoadedSubRef.current &&
                previous &&
                sub &&
                previous.id === sub.id &&
                previous.started_at &&
                sub.started_at &&
                new Date(sub.started_at).getTime() > new Date(previous.started_at).getTime()
            );

            if (renewed) {
                setSuccess(`Payment successful! ${sub.plan_name} auto-renewed.`);
                clearFeaturesCache();
                window.dispatchEvent(new Event('subscription:changed'));
                window.dispatchEvent(new Event('googer-wallet-updated'));
                refreshSubscriptionFeatures().catch(() => {});
            }

            lastSubRef.current = sub;
            hasLoadedSubRef.current = true;
            setActiveSub(sub);
            return sub;
        } catch {
            lastSubRef.current = null;
            hasLoadedSubRef.current = true;
            setActiveSub(null);
            return null;
        }
    };

    useEffect(() => {
        const load = async () => {
            try {
                const [data, sub] = await Promise.all([
                    subscriptionService.getPublicPlans(),
                    loadActiveSub(),
                ]);
                const paid = data.filter((p: any) => p.slug !== 'basic' && Number(p.price) > 0);
                setPlans(paid);
                const activePaid = sub && paid.some((p) => p.id === sub.plan_id) ? sub.plan_id : null;
                setSelectedId(activePaid ?? paid[0]?.id ?? null);
            } catch {
                setPlans([]);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    useEffect(() => {
        if (loading) return;

        const intervalId = window.setInterval(async () => {
            await Promise.all([
                loadActiveSub(),
                refreshBalance(),
            ]);
        }, 5000);

        return () => window.clearInterval(intervalId);
    }, [loading]);

    useEffect(() => {
        const intervalId = window.setInterval(() => setNowMs(Date.now()), 1000);
        return () => window.clearInterval(intervalId);
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
            const isSwitchingPlan = !!(activeSub && activeSub.status === 'active' && activeSub.plan_id !== selectedPlan.id);
            const result = await subscriptionService.subscribe(selectedPlan.id, { switchPlan: isSwitchingPlan });
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
            lastSubRef.current = result.subscription;
            hasLoadedSubRef.current = true;
            setActiveSub(result.subscription);
            setSuccess(`Payment successful! You're subscribed to ${selectedPlan.name}.`);
            await refreshBalance();
            // Force features to reload so plan perks apply immediately everywhere
            clearFeaturesCache();
            window.dispatchEvent(new Event('subscription:changed'));
            window.dispatchEvent(new Event('googer-wallet-updated'));
            await refreshSubscriptionFeatures();
            window.dispatchEvent(new Event('badge:changed'));
            // Send promo code notification if this plan has one
            const promoCode = selectedPlan.extra?.promo_code_value;
            if (promoCode && typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('add-notification', {
                    detail: {
                        id: `promo-${selectedPlan.id}-${Date.now()}`,
                        type: 'promo_code',
                        title: `🎉 Your Promo Code for ${selectedPlan.name}`,
                        message: `Your exclusive ad promo code: ${promoCode}`,
                        promoCode,
                        planName: selectedPlan.name,
                        timestamp: new Date().toISOString(),
                        read: false,
                    }
                }));
            }
        } finally {
            setPaying(false);
        }
    };

    const handleCancel = async () => {
        if (!activeSub) return;
        setCancelling(true);
        try {
            const updated = await subscriptionService.setAutoRenew(false);
            if (updated) {
                setSelectedId(updated.plan_id);
                setActiveSub({ ...updated, auto_renew: false });
                lastSubRef.current = { ...updated, auto_renew: false };
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

    const isSelectedActive = !!(activeSub && selectedPlan && activeSub.plan_id === selectedPlan.id && activeSub.status === 'active' && !activeSub.in_grace_period);
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
        return d.toLocaleDateString("en-GB", {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            timeZone: "Asia/Colombo",
        });
    };

    const formatGraceDays = (targetIso?: string | null) => {
        if (!targetIso) return null;
        const targetMs = new Date(targetIso).getTime();
        if (!Number.isFinite(targetMs)) return null;

        const remainingDays = Math.max(0, Math.ceil((targetMs - nowMs) / 86400000));
        return `${remainingDays} ${remainingDays === 1 ? "day" : "days"}`;
    };

    const getSubscriptionCountdown = (sub: UserSubscription) => {
        if (!sub.in_grace_period) return null;

        const countdown = formatGraceDays(sub.grace_ends_at);
        return countdown ? `Expires in ${countdown}` : null;
    };

    const selectedPrice = selectedPlan ? Number(selectedPlan.price) || 0 : 0;
    const shortfall = Math.max(0, selectedPrice - balance);
    const activePlan = activeSub ? plans.find((plan) => plan.id === activeSub.plan_id) : null;
    const selectedTheme = getPlanBadgeTheme(selectedPlan);
    const getPlanInterval = (plan?: SubscriptionPlan | null) => plan?.billing_interval_label || `${plan?.duration_days ?? 0}d`;
    const switchActionLabel = (() => {
        if (!selectedPlan || isBasicActiveSub) return "Subscribe & Pay Now";
        if (activeSub?.in_grace_period && activeSub.plan_id === selectedPlan.id) return `Pay & Renew ${selectedPlan.name}`;

        const activePrice = Number(activePlan?.price ?? activeSub?.price_paid ?? 0) || 0;
        const nextPrice = Number(selectedPlan.price) || 0;

        if (nextPrice > activePrice) return `Upgrade to ${selectedPlan.name}`;
        if (nextPrice < activePrice) return `Downgrade to ${selectedPlan.name}`;
        return `Switch to ${selectedPlan.name}`;
    })();

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
                <div
                    className="mx-auto mt-3 h-1 w-20 rounded-full transition-colors"
                    style={{ backgroundColor: selectedTheme.hex, boxShadow: `0 0 18px rgba(${selectedTheme.rgb}, 0.45)` }}
                />
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
                        const badgeTheme = getPlanBadgeTheme(plan);
                        const badgeTickColor = String(plan.extra?.badge_tick_color || "").trim() || undefined;
                        const badgeTextCls = BADGE_TEXT[plan.badge_color] || badgeTheme.text;
                        const isActiveOnThisPlan = !!(activeSub && activeSub.plan_id === plan.id && activeSub.status === 'active');
                        const featureGroups = getPlanFeatureGroups(plan);
                        const isChatOpen = openChatFeatures[plan.id] ?? false;
                        const isContentOpen = openContentFeatures[plan.id] ?? false;
                        const cardBorderColor = isActiveOnThisPlan || isSelected ? badgeTheme.hex : `rgba(${badgeTheme.rgb}, 0.28)`;
                        return (
                            <div
                                key={plan.id}
                                onClick={() => setSelectedId(plan.id)}
                                className="w-full text-left rounded-2xl overflow-hidden transition-all bg-[#070707] hover:bg-[#0d0d0d] flex flex-col cursor-pointer border"
                                style={{
                                    borderColor: cardBorderColor,
                                    borderWidth: isActiveOnThisPlan || isSelected ? 2 : 1,
                                    boxShadow: isActiveOnThisPlan || isSelected ? `0 0 22px -8px rgba(${badgeTheme.rgb}, 0.65)` : "none",
                                }}
                            >
                                <div className="h-1 w-full" style={{ backgroundColor: badgeTheme.hex }}></div>
                                <div className="px-5 py-4 flex items-start justify-between gap-4">
                                    {/* Left: plan info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-3 flex-wrap">
                                            <div className="flex items-center gap-1.5">
                                                <h3 className="text-base font-bold" style={{ color: badgeTheme.hex }}>{plan.name}</h3>
                                                {plan.verified_tick && (
                                                    <BadgeSvg color={badgeTheme.hex} tickColor={badgeTickColor} size={14} />
                                                )}
                                            </div>
                                            <span className="text-xs text-white/70">
                                                <span className="font-bold text-white">R {Number(plan.price).toLocaleString()}</span>
                                                <span className="text-white/50"> / {getPlanInterval(plan)}</span>
                                            </span>
                                            {isActiveOnThisPlan && (
                                                <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 border ${activeSub?.in_grace_period ? "text-red-300 bg-red-500/10 border-red-500/25" : "text-green-400 bg-green-500/10 border-green-500/25"}`}>
                                                    {activeSub?.in_grace_period ? "Expired" : "Active"}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                                            {featureGroups.regular.map((f, i) => (
                                                <span key={i} className="inline-flex items-center gap-1 text-[11px] text-white/65">
                                                    <IonIcon name="checkmark-outline" className={`${badgeTextCls} shrink-0 text-xs`} />
                                                    <span>{f}</span>
                                                </span>
                                            ))}
                                        </div>
                                        {(featureGroups.chat.length > 0 || featureGroups.content.length > 0) && (
                                            <div className="mt-2 flex flex-wrap gap-2">
                                                {featureGroups.content.length > 0 && (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setOpenContentFeatures((prev) => ({ ...prev, [plan.id]: !isContentOpen }));
                                                        }}
                                                        className="inline-flex h-7 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 text-[10px] font-bold text-white/70 transition hover:bg-white/[0.06]"
                                                    >
                                                        <IonIcon name="cloud-upload-outline" className={`${badgeTextCls} text-xs`} />
                                                        Content Upload
                                                        <IonIcon name={isContentOpen ? "chevron-up-outline" : "chevron-down-outline"} className="text-[11px] text-white/45" />
                                                    </button>
                                                )}
                                                {featureGroups.chat.length > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setOpenChatFeatures((prev) => ({ ...prev, [plan.id]: !isChatOpen }));
                                                    }}
                                                    className="inline-flex h-7 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 text-[10px] font-bold text-white/70 transition hover:bg-white/[0.06]"
                                                >
                                                    <IonIcon name="chatbubbles-outline" className={`${badgeTextCls} text-xs`} />
                                                    Chat features
                                                    <IonIcon name={isChatOpen ? "chevron-up-outline" : "chevron-down-outline"} className="text-[11px] text-white/45" />
                                                </button>
                                                )}
                                                {isContentOpen && (
                                                    <div className="basis-full mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-1">
                                                        {featureGroups.content.map((f, i) => (
                                                            <span key={i} className="inline-flex items-center gap-1 text-[11px] text-white/60">
                                                                <IonIcon name="checkmark-outline" className={`${badgeTextCls} shrink-0 text-xs`} />
                                                                <span>{f}</span>
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                                {isChatOpen && (
                                                    <div className="basis-full mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-1">
                                                        {featureGroups.chat.map((f, i) => (
                                                            <span key={i} className="inline-flex items-center gap-1 text-[11px] text-white/60">
                                                                <IonIcon name="checkmark-outline" className={`${badgeTextCls} shrink-0 text-xs`} />
                                                                <span>{f}</span>
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Right: indicator + toggle + dates */}
                                    <div className="shrink-0 flex flex-col items-end gap-2 pt-0.5">
                                        {/* Tick / radio */}
                                        {isActiveOnThisPlan && !isSelected ? (
                                            <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: badgeTheme.hex }}>
                                                <IonIcon name="checkmark-outline" className="text-white text-xs" />
                                            </div>
                                        ) : isSelected ? (
                                            <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: badgeTheme.hex }}>
                                                <IonIcon name="checkmark-outline" className="text-white text-xs" />
                                            </div>
                                        ) : (
                                            <div className="w-5 h-5 rounded-full border-2" style={{ borderColor: `rgba(${badgeTheme.rgb}, 0.55)` }}></div>
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
                                                {getSubscriptionCountdown(activeSub) && (
                                                    <p className="text-[8px] font-black uppercase tracking-[0.08em] text-white/50">
                                                        {getSubscriptionCountdown(activeSub)}
                                                    </p>
                                                )}
                                                <div className="text-right text-[9px] text-white/40 leading-tight">
                                                    <p>Start: {formatDate(activeSub.started_at)}</p>
                                                    <p>{activeSub.in_grace_period ? "Expired" : "Ends"}: {formatDate(activeSub.expires_at)}</p>
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
                                {cancelling ? "Updating..." : "Cancel Subscription"}
                            </button>
                        ) : isBasicPlan ? (
                            <p className="text-[11px] text-white/50 text-center">This is the free default plan — no payment needed.</p>
                        ) : (
                            <button
                                onClick={openPaymentSheet}
                                disabled={!selectedPlan}
                                className="bg-red-500 hover:bg-red-400 text-white font-bold text-sm px-10 py-2.5 rounded-full transition disabled:opacity-50"
                            >
                                {switchActionLabel}
                            </button>
                        )}
                        {!isBasicPlan && !isBasicActiveSub && activeSub && !isSelectedActive && (
                            <p className="text-[10px] text-amber-300/80 text-center">
                                This will switch from your current {activeSub.plan_name} plan to the selected plan now.
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
                                    <p className="text-[10px] text-white/55">{getPlanInterval(selectedPlan)}</p>
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
                            <button
                                type="button"
                                onClick={() => {
                                    setInsufficient(false);
                                    router.push("/dashboard/wallet/my-wallet");
                                }}
                                className="bg-red-500 hover:bg-red-400 text-white font-bold text-[11px] px-4 py-1.5 rounded-full transition"
                            >
                                Top Up
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Cancel success toast */}
            {cancelToast && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-2.5 bg-[#111] border border-white/10 rounded-2xl px-4 py-3 shadow-xl animate-[slideUp_0.25s_ease-out]">
                    <IonIcon name="checkmark-circle" className="text-emerald-400 text-base shrink-0" />
                    <p className="text-xs font-semibold text-white/90">Auto-renew is off. Your plan stays active until expiry.</p>
                </div>
            )}
        </div>
    );
}
