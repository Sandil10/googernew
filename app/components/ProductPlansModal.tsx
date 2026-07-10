"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import IonIcon from "@/app/components/IonIcon";
import { BadgeSvg } from "@/app/components/VerifiedBadge";
import { authService } from "@/services/authService";
import { getUserIdentityKey, getWalletBalanceWithAdAdjustments } from "@/utils/adWallet";
import { subscriptionService, SubscriptionPlan, UserSubscription } from "@/services/subscriptionService";
import { clearFeaturesCache, refreshSubscriptionFeatures } from "@/app/lib/subscriptionFeatures";

// Derives human-readable feature bullets purely from DB fields — nothing hardcoded.
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

function formatVideoLimitMinutes(value: number): string {
    const totalSeconds = Math.max(0, Math.round(value * 60));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes > 0 && seconds > 0) return `${minutes} min ${seconds} sec`;
    if (minutes > 0) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
    return `${seconds} second${seconds === 1 ? "" : "s"}`;
}

function derivePlanFeatureGroups(plan: SubscriptionPlan): { regular: string[]; chat: string[]; content: string[] } {
    const e = plan.extra || {};
    const regular: string[] = (plan.features || []).filter((label) => !isChatFeatureLabel(String(label)));
    const chat: string[] = (plan.features || [])
        .filter((label) => isChatFeatureLabel(String(label)))
        .map((label) => normalizeChatFeatureLabel(String(label)))
        .filter((label): label is string => !!label);
    const content: string[] = [];
    const contentLabels = e.labels || {};
    const isBasicPlan = plan.slug === "basic" || Number(plan.price) === 0;

    // Googs
    const writeLimit = e.write_goog_limit != null ? Number(e.write_goog_limit) : null;
    if (writeLimit != null && writeLimit > 0)
        regular.push(`Write up to ${writeLimit.toLocaleString()} Googs`);

    const letterLimit = e.goog_letter_limit != null ? Number(e.goog_letter_limit) : null;
    if (letterLimit != null && letterLimit > 0)
        regular.push(`${letterLimit} characters per Goog`);

    const saveLimit = plan.googs_limit != null ? Number(plan.googs_limit) : null;
    if (saveLimit != null && saveLimit > 0 && saveLimit < 999999)
        regular.push(`Save up to ${saveLimit.toLocaleString()} Googs`);

    // Shop / Ads
    const productLimit = e.product_upload_limit != null ? Number(e.product_upload_limit) : null;
    if (productLimit != null && productLimit > 0)
        regular.push(`Upload up to ${productLimit} products`);

    const uploadContentLimit = Number(e.content_upload_limit ?? (isBasicPlan ? 5 : 15));
    if (Number.isFinite(uploadContentLimit) && uploadContentLimit > 0)
        content.push(`${contentLabels.content_upload_limit || "Upload Content Limit"}: ${uploadContentLimit}`);

    const dailyUploadLimit = Number(e.content_daily_upload_limit ?? (isBasicPlan ? 1 : 3));
    if (Number.isFinite(dailyUploadLimit) && dailyUploadLimit > 0)
        content.push(`${contentLabels.content_daily_upload_limit || "Daily Uploads"}: ${dailyUploadLimit}`);

    const videoLimitMinutes = Number(e.content_video_limit_minutes ?? (isBasicPlan ? 1 : 5));
    if (Number.isFinite(videoLimitMinutes) && videoLimitMinutes > 0)
        content.push(`${contentLabels.content_video_limit_minutes || "Video Limit"}: ${formatVideoLimitMinutes(videoLimitMinutes)}`);

    content.push(getContentExpiryLabel(e));

    const videoAds = e.ad_videos != null ? Number(e.ad_videos) : null;
    if (videoAds != null && videoAds > 0)
        regular.push(`${videoAds} video ads`);

    const photoAds = e.ad_photos != null ? Number(e.ad_photos) : null;
    if (photoAds != null && photoAds > 0)
        regular.push(`${photoAds} photo ads`);

    // Ad expiry
    if (e.ads_expiry_value != null && Number(e.ads_expiry_value) > 0) {
        const unit = String(e.ads_expiry_unit || "days");
        regular.push(`Ads live for ${e.ads_expiry_value} ${unit}`);
    } else if (e.ads_expiry_days != null && Number(e.ads_expiry_days) > 0) {
        regular.push(`Ads live for ${e.ads_expiry_days} days`);
    }

    // Messaging
    const tmStr = String(e.text_messaging ?? "");
    const hasTextMsg = e.text_messaging !== false && e.text_messaging != null && e.text_messaging !== 0;
    if (hasTextMsg) chat.push("Text messages");

    const hasColors = e.chat_text_colors === true || tmStr.includes("colors");
    if (hasColors) chat.push("Text messaging colors");

    const hasStickers = e.chat_stickers === true || tmStr.includes("stickers");
    if (hasStickers) chat.push("Stickers");

    // Voice / Video
    const hasVoice = e.voice_calls === true || (e.voice_calls !== false && e.voice_calls != null);
    if (hasVoice) chat.push("Voice calls");

    if (e.video_calls === true) {
        const quality = String(e.video_call_quality || "").trim();
        if (quality) {
            const labels = quality.split(",").map((q: string) => q.trim()).filter(Boolean).join(" & ");
            chat.push(`Video calls (${labels})`);
        } else {
            chat.push("Video calls");
        }
    }

    // Voice notes
    if (e.voice_notes_to_text || e.voice_to_text || e.speech_to_text || e.microphone)
        chat.push("Voice to text");
    if (e.text_to_voice_note || e.text_to_voice || e.tts || e.speech)
        chat.push("Text to voice");

    // Profile promo
    if (e.free_profile_ad_promo || e.free_promo)
        regular.push("Free profile ad promotion");

    // Verified badge
    if (plan.verified_tick) regular.push("Verified badge");

    return {
        regular: regular.filter((label, index, list) => list.indexOf(label) === index),
        chat: chat.filter((label, index, list) => list.indexOf(label) === index),
        content: content.filter((label, index, list) => list.indexOf(label) === index),
    };
}

const BADGE_TEXT: Record<string, string> = {
    silver: "text-zinc-300",
    blue:   "text-blue-400",
    gold:   "text-amber-400",
    green:  "text-emerald-400",
    purple: "text-purple-400",
    red:    "text-red-400",
    black:  "text-zinc-300",
};

const BADGE_THEME: Record<string, string> = {
    silver: "#d4d4d8",
    blue:   "#60a5fa",
    gold:   "#fbbf24",
    green:  "#34d399",
    purple: "#c084fc",
    red:    "#f87171",
    black:  "#3d3d3d",
};

const getPlanBadgeColor = (plan: SubscriptionPlan) => String(plan.extra?.badge_custom_color || plan.badge_color || "silver").trim();
const getPlanBadgeHex = (plan: SubscriptionPlan) => {
    const color = getPlanBadgeColor(plan);
    return BADGE_THEME[color] || color || BADGE_THEME.silver;
};

const ACCENT_BAR: Record<string, string> = {
    zinc:    "bg-zinc-400",
    blue:    "bg-blue-500",
    amber:   "bg-amber-400",
    emerald: "bg-emerald-500",
    purple:  "bg-purple-500",
    red:     "bg-red-500",
};

interface Props {
    onClose: () => void;
    title?: string;
    subtitle?: string;
    limitMessage?: string;
}

export default function ProductPlansModal({
    onClose,
    title = "Upgrade Your Plan",
    subtitle = "Subscribe to a higher plan",
    limitMessage = "If you have reached your product upload limit, please subscribe to a higher plan below.",
}: Props) {
    const [plans, setPlans]           = useState<SubscriptionPlan[]>([]);
    const [loading, setLoading]       = useState(true);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [activeSub, setActiveSub]   = useState<UserSubscription | null>(null);
    const [balance, setBalance]       = useState(0);
    const [sheetOpen, setSheetOpen]   = useState(false);
    const [paying, setPaying]         = useState(false);
    const [insufficient, setInsufficient] = useState(false);
    const [message, setMessage]       = useState<string | null>(null);
    const [success, setSuccess]       = useState<string | null>(null);
    const [cancelling, setCancelling] = useState(false);
    const [openChatFeatures, setOpenChatFeatures] = useState<Record<number, boolean>>({});
    const [openContentFeatures, setOpenContentFeatures] = useState<Record<number, boolean>>({});

    useEffect(() => {
        (async () => {
            try {
                const [data, sub] = await Promise.all([
                    subscriptionService.getPublicPlans(),
                    subscriptionService.getMySubscription(),
                ]);
                const paid = data.filter((p) => p.slug !== "basic" && Number(p.price) > 0);
                setPlans(paid);
                setSelectedId(paid[0]?.id ?? null);
                setActiveSub(sub);
            } catch {
                setPlans([]);
            } finally {
                setLoading(false);
            }
        })();
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
    const isSelectedActive = !!(activeSub && selectedPlan && activeSub.plan_id === selectedPlan.id && activeSub.status === "active");

    const openSheet = async () => {
        if (!selectedPlan) return;
        setMessage(null);
        setInsufficient(false);
        await refreshBalance();
        setSheetOpen(true);
    };

    const handlePay = async () => {
        if (!selectedPlan) return;
        const price = Number(selectedPlan.price) || 0;
        if (balance < price) { setInsufficient(true); return; }
        setPaying(true);
        try {
            const isSwitchingPlan = !!(activeSub && activeSub.status === "active" && activeSub.plan_id !== selectedPlan.id);
            const result = await subscriptionService.subscribe(selectedPlan.id, { switchPlan: isSwitchingPlan });
            if ("error" in result) {
                if (result.code === 402) setInsufficient(true);
                else { setMessage(result.error); setSheetOpen(false); }
                return;
            }
            setSheetOpen(false);
            setActiveSub(result.subscription);
            setSuccess(`Subscribed to ${selectedPlan.name}!`);
            await refreshBalance();
            clearFeaturesCache();
            void refreshSubscriptionFeatures();
            window.dispatchEvent(new Event("subscription:changed"));
            window.dispatchEvent(new Event("googer-wallet-updated"));
        } finally {
            setPaying(false);
        }
    };

    const handleCancel = async () => {
        if (!activeSub) return;
        if (!confirm("Cancel auto-renew for your active subscription?")) return;
        setCancelling(true);
        try {
            const updated = await subscriptionService.setAutoRenew(false);
            if (updated) {
                setActiveSub({ ...updated, auto_renew: false });
                setSuccess("Auto-renew turned off.");
                clearFeaturesCache();
                void refreshSubscriptionFeatures();
                window.dispatchEvent(new Event("subscription:changed"));
            } else {
                setMessage("Failed to cancel subscription.");
            }
        } finally {
            setCancelling(false);
        }
    };

    const formatDate = (iso?: string | null) => {
        if (!iso) return "—";
        return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    };

    const selectedPrice = Number(selectedPlan?.price) || 0;
    const shortfall     = Math.max(0, selectedPrice - balance);

    return (
        <div className="fixed inset-0 z-[160] flex items-end sm:items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />

            <div className="relative w-full max-w-lg mx-auto sm:rounded-3xl rounded-t-3xl border border-white/10 bg-[#0e0e0e] overflow-hidden shadow-[0_32px_100px_rgba(0,0,0,0.7)] flex flex-col max-h-[92vh]">
                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
                    <div>
                        <h2 className="text-base font-bold text-white">{title}</h2>
                        <p className="text-[11px] text-white/50 mt-0.5">{subtitle}</p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-full border border-white/15 bg-white/5 flex items-center justify-center text-white/70 hover:bg-white/10 transition">
                        <IonIcon name="close-outline" className="text-base" />
                    </button>
                </div>

                {/* Limit notice */}
                <div className="mx-5 mb-3 shrink-0 flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/8 px-4 py-3">
                    <IonIcon name="alert-circle-outline" className="text-amber-400 text-base mt-0.5 shrink-0" />
                    <p className="text-[12px] text-amber-300/90 leading-relaxed">
                        {limitMessage}
                    </p>
                </div>

                {/* Success banner */}
                {success && (
                    <div className="mx-5 mb-3 shrink-0 flex items-center gap-2 rounded-xl border border-green-500/25 bg-green-500/10 px-4 py-3">
                        <IonIcon name="checkmark-circle-outline" className="text-green-400 text-base shrink-0" />
                        <p className="text-[12px] text-green-300">{success}</p>
                    </div>
                )}

                {/* Plans list */}
                <div className="overflow-y-auto flex-1 px-5 pb-5 flex flex-col gap-3">
                    {loading ? (
                        <div className="flex justify-center py-10">
                            <div className="w-8 h-8 rounded-full border-2 border-red-500 border-t-transparent animate-spin" />
                        </div>
                    ) : plans.length === 0 ? (
                        <p className="text-center text-sm text-white/40 py-8">No plans available right now.</p>
                    ) : (
                        plans.map((plan) => {
                            const isSelected      = selectedId === plan.id;
                            const isActiveOnThis  = !!(activeSub && activeSub.plan_id === plan.id && activeSub.status === "active");
                            const badgeTextCls    = BADGE_TEXT[plan.badge_color] || "text-zinc-300";
                            const badgeHex        = getPlanBadgeHex(plan);
                            const badgeTickColor  = String(plan.extra?.badge_tick_color || "").trim() || undefined;
                            const accentBarCls    = ACCENT_BAR[plan.accent_color] || "bg-zinc-400";
                            const featureGroups = derivePlanFeatureGroups(plan);
                            const isChatOpen = openChatFeatures[plan.id] ?? false;
                            const isContentOpen = openContentFeatures[plan.id] ?? false;
                            return (
                                <button
                                    key={plan.id}
                                    onClick={() => !isActiveOnThis && setSelectedId(plan.id)}
                                    className={`w-full text-left rounded-2xl overflow-hidden transition-all bg-[#070707] hover:bg-[#0d0d0d] flex flex-col ${
                                        isActiveOnThis
                                            ? "border-2 border-green-500 shadow-[0_0_20px_-8px_rgba(34,197,94,0.5)]"
                                            : isSelected
                                            ? "border-2 border-red-500 shadow-[0_0_20px_-8px_rgba(239,68,68,0.6)]"
                                            : "border border-gray-800 hover:border-gray-700"
                                    }`}
                                >
                                    <div className={`h-1 w-full ${accentBarCls}`} />
                                    <div className="px-4 py-3 flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <div className="flex items-center gap-1.5">
                                                    <h3 className="text-sm font-bold" style={{ color: badgeHex }}>{plan.name}</h3>
                                                    {plan.verified_tick && (
                                                        <BadgeSvg color={badgeHex} tickColor={badgeTickColor} size={12} />
                                                    )}
                                                </div>
                                                <span className="text-xs text-white/60">
                                                    <span className="font-bold text-white">R {Number(plan.price).toLocaleString()}</span>
                                                    <span className="text-white/40"> / {plan.duration_days}d</span>
                                                </span>
                                            </div>
                                            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                                                {featureGroups.regular.map((f, i) => (
                                                    <span key={i} className="inline-flex items-center gap-1 text-[10px] text-white/55">
                                                        <IonIcon name="checkmark-outline" className={`${badgeTextCls} shrink-0 text-[10px]`} />
                                                        {f}
                                                    </span>
                                                ))}
                                            </div>
                                            {(featureGroups.chat.length > 0 || featureGroups.content.length > 0) && (
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    {featureGroups.content.length > 0 && (
                                                        <span
                                                            role="button"
                                                            tabIndex={0}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setOpenContentFeatures((prev) => ({ ...prev, [plan.id]: !isContentOpen }));
                                                            }}
                                                            onKeyDown={(e) => {
                                                                if (e.key === "Enter" || e.key === " ") {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    setOpenContentFeatures((prev) => ({ ...prev, [plan.id]: !isContentOpen }));
                                                                }
                                                            }}
                                                            className="inline-flex h-7 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 text-[10px] font-bold text-white/70 transition hover:bg-white/[0.06]"
                                                        >
                                                            <IonIcon name="cloud-upload-outline" className={`${badgeTextCls} text-xs`} />
                                                            Content Upload
                                                            <IonIcon name={isContentOpen ? "chevron-up-outline" : "chevron-down-outline"} className="text-[11px] text-white/45" />
                                                        </span>
                                                    )}
                                                    {featureGroups.chat.length > 0 && (
                                                    <span
                                                        role="button"
                                                        tabIndex={0}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setOpenChatFeatures((prev) => ({ ...prev, [plan.id]: !isChatOpen }));
                                                        }}
                                                        onKeyDown={(e) => {
                                                            if (e.key === "Enter" || e.key === " ") {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                setOpenChatFeatures((prev) => ({ ...prev, [plan.id]: !isChatOpen }));
                                                            }
                                                        }}
                                                        className="inline-flex h-7 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 text-[10px] font-bold text-white/70 transition hover:bg-white/[0.06]"
                                                    >
                                                        <IonIcon name="chatbubbles-outline" className={`${badgeTextCls} text-xs`} />
                                                        Chat features
                                                        <IonIcon name={isChatOpen ? "chevron-up-outline" : "chevron-down-outline"} className="text-[11px] text-white/45" />
                                                    </span>
                                                    )}
                                                    {isContentOpen && (
                                                        <div className="basis-full mt-1.5 flex flex-wrap gap-x-3 gap-y-1 pl-1">
                                                            {featureGroups.content.map((f, i) => (
                                                                <span key={i} className="inline-flex items-center gap-1 text-[10px] text-white/55">
                                                                    <IonIcon name="checkmark-outline" className={`${badgeTextCls} shrink-0 text-[10px]`} />
                                                                    {f}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {isChatOpen && (
                                                        <div className="basis-full mt-1.5 flex flex-wrap gap-x-3 gap-y-1 pl-1">
                                                            {featureGroups.chat.map((f, i) => (
                                                                <span key={i} className="inline-flex items-center gap-1 text-[10px] text-white/55">
                                                                    <IonIcon name="checkmark-outline" className={`${badgeTextCls} shrink-0 text-[10px]`} />
                                                                    {f}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <div className="shrink-0 flex flex-col items-end gap-1.5 pt-0.5">
                                            {isActiveOnThis ? (
                                                <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                                                    <IonIcon name="checkmark-outline" className="text-white text-xs" />
                                                </div>
                                            ) : isSelected ? (
                                                <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                                                    <IonIcon name="checkmark-outline" className="text-white text-xs" />
                                                </div>
                                            ) : (
                                                <div className="w-5 h-5 rounded-full border-2 border-white/25" />
                                            )}
                                            {isActiveOnThis && activeSub && (
                                                <div className="text-right text-[9px] text-white/35 leading-tight">
                                                    <p>Start: {formatDate(activeSub.started_at)}</p>
                                                    <p>Ends: {formatDate(activeSub.expires_at)}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </button>
                            );
                        })
                    )}

                    {/* Action row */}
                    {!loading && plans.length > 0 && (
                        <div className="mt-1 rounded-2xl border border-gray-800 bg-[#070707] p-4 flex flex-col items-center gap-2">
                            {isSelectedActive ? (
                                <button onClick={handleCancel} disabled={cancelling}
                                    className="bg-red-500 hover:bg-red-400 text-white font-bold text-sm px-10 py-2.5 rounded-full transition disabled:opacity-50">
                                    {cancelling ? "Updating..." : "Cancel Subscription"}
                                </button>
                            ) : (
                                <button onClick={openSheet} disabled={!selectedPlan}
                                    className="bg-red-500 hover:bg-red-400 text-white font-bold text-sm px-10 py-2.5 rounded-full transition disabled:opacity-50">
                                    {activeSub ? "Switch Plan & Pay Now" : "Subscribe & Pay Now"}
                                </button>
                            )}
                            {activeSub && !isSelectedActive && (
                                <p className="text-[10px] text-amber-300/80 text-center">
                                    Switching will replace your current {activeSub.plan_name} plan.
                                </p>
                            )}
                        </div>
                    )}

                    {message && (
                        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300 flex items-start gap-2">
                            <IonIcon name="alert-circle" className="text-red-400 text-sm shrink-0 mt-0.5" />
                            <span>{message}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Payment confirmation sheet */}
            {sheetOpen && (
                <div className="absolute inset-0 z-10 flex items-end justify-center">
                    <div className="absolute inset-0" onClick={() => !paying && setSheetOpen(false)} />
                    <div className="relative w-full max-w-lg rounded-t-3xl border-t border-white/10 bg-[#0e0e0e] p-6 shadow-2xl">
                        <h3 className="text-base font-bold text-white mb-1">Confirm Payment</h3>
                        <p className="text-xs text-white/50 mb-4">
                            Subscribing to <span className="text-white font-semibold">{selectedPlan?.name}</span> for{" "}
                            <span className="text-white font-semibold">R {selectedPrice.toLocaleString()}</span>
                        </p>
                        <div className="flex justify-between text-xs text-white/60 mb-1">
                            <span>Your balance</span>
                            <span className="text-white font-semibold">R {balance.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-xs text-white/60 mb-4">
                            <span>Plan cost</span>
                            <span className="text-white font-semibold">R {selectedPrice.toFixed(2)}</span>
                        </div>
                        {insufficient && (
                            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                                Insufficient balance. You need R {shortfall.toFixed(2)} more.{" "}
                                <Link href="/wallet/my-wallet" className="underline text-red-400">Top up</Link>
                            </div>
                        )}
                        <div className="flex gap-3">
                            <button onClick={() => !paying && setSheetOpen(false)}
                                className="flex-1 py-2.5 rounded-full border border-white/15 text-white/70 text-sm font-semibold hover:bg-white/5 transition disabled:opacity-50"
                                disabled={paying}>
                                Close
                            </button>
                            <button onClick={handlePay} disabled={paying}
                                className="flex-1 py-2.5 rounded-full bg-red-500 hover:bg-red-400 text-white text-sm font-bold transition disabled:opacity-50">
                                {paying ? "Processing…" : "Confirm Pay"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
