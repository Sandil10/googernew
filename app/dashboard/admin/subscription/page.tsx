"use client";

import { useEffect, useState } from "react";
import IonIcon from "@/app/components/IonIcon";
import { BadgeSvg } from "@/app/components/VerifiedBadge";
import { subscriptionService, SubscriptionPlan } from "@/services/subscriptionService";

const BADGE_COLORS = ["silver", "blue", "gold", "green", "purple", "red", "black"];
const ACCENT_COLORS = ["zinc", "blue", "amber", "emerald", "purple", "red"];

const BADGE_CLASS: Record<string, { text: string; ring: string; dot: string }> = {
    silver: { text: "text-zinc-300",   ring: "border-zinc-500/40 bg-zinc-500/10",   dot: "bg-zinc-300" },
    blue:   { text: "text-blue-400",   ring: "border-blue-500/40 bg-blue-500/10",   dot: "bg-blue-400" },
    gold:   { text: "text-amber-400",  ring: "border-amber-500/40 bg-amber-500/10", dot: "bg-amber-400" },
    green:  { text: "text-emerald-400",ring: "border-emerald-500/40 bg-emerald-500/10", dot: "bg-emerald-400" },
    purple: { text: "text-purple-400", ring: "border-purple-500/40 bg-purple-500/10", dot: "bg-purple-400" },
    red:    { text: "text-red-400",    ring: "border-red-500/40 bg-red-500/10",     dot: "bg-red-400" },
    black:  { text: "text-zinc-300",   ring: "border-zinc-500/50 bg-black/60",      dot: "bg-zinc-900" },
};

const ACCENT_BAR: Record<string, string> = {
    zinc:    "bg-zinc-400",
    blue:    "bg-blue-500",
    amber:   "bg-amber-400",
    emerald: "bg-emerald-500",
    purple:  "bg-purple-500",
    red:     "bg-red-500",
};

const colorPickerValue = (value: unknown, fallback: string) => {
    const raw = String(value || "").trim();
    return /^#[0-9a-f]{6}$/i.test(raw) ? raw : fallback;
};

type DraftPlan = Partial<SubscriptionPlan> & {
    featuresText?: string;
    extraText?: string;
    photoAdsSaveLimit?: number | "";
    videoAdsSaveLimit?: number | "";
    adExpiryValue?: number | "";
    adExpiryUnit?: "minutes" | "hours" | "days";
    chatAutoDeleteValue?: number | "";
    chatAutoDeleteUnit?: "minutes" | "hours" | "days" | "lifetime";
    voiceCalls?: boolean;
    videoCalls?: boolean;
    videoCallQuality?: "240p" | "240p,360p";
    voiceNotesToText?: boolean;
    textToVoiceNote?: boolean;
    badgeCustomColor?: string;
    badgeTickColor?: string;
};

const blankPlan = (): DraftPlan => ({
    slug: "",
    name: "",
    price: 0,
    duration_days: 30,
    badge_color: "silver",
    accent_color: "zinc",
    googs_limit: 5,
    verified_tick: true,
    is_active: true,
    sort_order: 0,
    featuresText: "",
    extraText: "{}",
    photoAdsSaveLimit: 3,
    videoAdsSaveLimit: 5,
    adExpiryValue: 30,
    adExpiryUnit: "days",
    chatAutoDeleteValue: 1,
    chatAutoDeleteUnit: "days",
    voiceCalls: true,
    videoCalls: false,
    videoCallQuality: "240p,360p",
    voiceNotesToText: false,
    textToVoiceNote: false,
    badgeCustomColor: "",
    badgeTickColor: "",
});

export default function AdminSubscriptionPlansPage() {
    const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [draft, setDraft] = useState<DraftPlan>(blankPlan());
    const [editingId, setEditingId] = useState<number | null>(null);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

    const showToast = (msg: string, type: "success" | "error" = "success") => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    const load = async () => {
        setLoading(true);
        try {
            const data = await subscriptionService.getAllPlans();
            setPlans(data);
        } catch (e: any) {
            showToast(e.message || "Failed to load", "error");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const openCreate = () => {
        setEditingId(null);
        setDraft(blankPlan());
        setModalOpen(true);
    };

    const openEdit = (p: SubscriptionPlan) => {
        setEditingId(p.id);
        setDraft({
            ...p,
            featuresText: (p.features || []).join("\n"),
            extraText: JSON.stringify(p.extra || {}, null, 2),
            photoAdsSaveLimit: p.extra?.photo_ads_save_limit ?? p.extra?.ad_photos ?? "",
            videoAdsSaveLimit: p.extra?.video_ads_save_limit ?? p.extra?.ad_videos ?? "",
            adExpiryValue: p.extra?.ads_expiry_value !== undefined ? Number(p.extra.ads_expiry_value) : 30,
            adExpiryUnit: (p.extra?.ads_expiry_unit as "minutes" | "hours" | "days") || "days",
            chatAutoDeleteValue: p.extra?.chat_auto_delete_value !== undefined
                ? Number(p.extra.chat_auto_delete_value)
                : p.extra?.chat_auto_delete_days !== undefined
                    ? Number(p.extra.chat_auto_delete_days)
                    : "",
            chatAutoDeleteUnit: (p.extra?.chat_auto_delete_unit as "minutes" | "hours" | "days" | "lifetime")
                || (p.extra?.chat_auto_delete_lifetime ? "lifetime" : "days"),
            voiceCalls: p.extra?.voice_calls !== false,
            videoCalls: p.extra?.video_calls === true,
            videoCallQuality: String(p.extra?.video_call_quality || "240p,360p").includes("360p") ? "240p,360p" : "240p",
            voiceNotesToText: !!(p.extra?.voice_notes_to_text || p.extra?.voice_to_text || p.extra?.speech_to_text),
            textToVoiceNote: !!(p.extra?.text_to_voice_note || p.extra?.text_to_voice || p.extra?.tts),
            badgeCustomColor: String(p.extra?.badge_custom_color || ""),
            badgeTickColor: String(p.extra?.badge_tick_color || ""),
        });
        setModalOpen(true);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            let extraParsed: any = {};
            try { extraParsed = JSON.parse(draft.extraText || "{}"); }
            catch { showToast("Extra fields must be valid JSON", "error"); setSaving(false); return; }
            const photoLimit = draft.photoAdsSaveLimit === "" ? null : Number(draft.photoAdsSaveLimit);
            const videoLimit = draft.videoAdsSaveLimit === "" ? null : Number(draft.videoAdsSaveLimit);
            if (photoLimit !== null && (!Number.isFinite(photoLimit) || photoLimit < 0)) {
                showToast("Photo ad save limit must be 0 or higher", "error");
                setSaving(false);
                return;
            }
            if (videoLimit !== null && (!Number.isFinite(videoLimit) || videoLimit < 0)) {
                showToast("Video ad save limit must be 0 or higher", "error");
                setSaving(false);
                return;
            }
            const expiryValue = draft.adExpiryValue === "" ? null : Number(draft.adExpiryValue);
            const chatDeleteValue = draft.chatAutoDeleteValue === "" ? null : Number(draft.chatAutoDeleteValue);
            if (draft.chatAutoDeleteUnit !== "lifetime" && (chatDeleteValue === null || !Number.isFinite(chatDeleteValue) || chatDeleteValue <= 0)) {
                showToast("Chat delete value must be greater than 0, or choose lifetime", "error");
                setSaving(false);
                return;
            }
            extraParsed = {
                ...extraParsed,
                photo_ads_save_limit: photoLimit,
                video_ads_save_limit: videoLimit,
                ad_photos: photoLimit,
                ad_videos: videoLimit,
                ads_expiry_value: expiryValue !== null && Number.isFinite(expiryValue) ? expiryValue : undefined,
                ads_expiry_unit: draft.adExpiryUnit || "days",
                chat_auto_delete_value: draft.chatAutoDeleteUnit === "lifetime" ? undefined : chatDeleteValue,
                chat_auto_delete_unit: draft.chatAutoDeleteUnit || "days",
                chat_auto_delete_days: draft.chatAutoDeleteUnit === "days" ? chatDeleteValue : undefined,
                chat_auto_delete_lifetime: draft.chatAutoDeleteUnit === "lifetime",
                voice_calls: !!draft.voiceCalls,
                video_calls: !!draft.videoCalls,
                video_call_quality: draft.videoCalls ? (draft.videoCallQuality || "240p,360p") : undefined,
                voice_notes_to_text: !!draft.voiceNotesToText,
                text_to_voice_note: !!draft.textToVoiceNote,
                badge_custom_color: String(draft.badgeCustomColor || "").trim() || undefined,
                badge_tick_color: String(draft.badgeTickColor || "").trim() || undefined,
            };

            const payload: Partial<SubscriptionPlan> = {
                slug: draft.slug,
                name: draft.name,
                price: Number(draft.price) || 0,
                duration_days: Number(draft.duration_days) || 30,
                badge_color: draft.badge_color,
                accent_color: draft.accent_color,
                googs_limit: Number(draft.googs_limit) || 0,
                verified_tick: !!draft.verified_tick,
                features: (draft.featuresText || "").split("\n").map(s => s.trim()).filter(Boolean),
                extra: extraParsed,
                is_active: !!draft.is_active,
                sort_order: Number(draft.sort_order) || 0,
            };

            if (editingId) {
                await subscriptionService.updatePlan(editingId, payload);
                showToast("Plan updated");
            } else {
                await subscriptionService.createPlan(payload);
                showToast("Plan created");
            }
            setModalOpen(false);
            await load();
        } catch (e: any) {
            showToast(e.message || "Save failed", "error");
        } finally {
            setSaving(false);
        }
    };

    const handleToggleActive = async (p: SubscriptionPlan) => {
        try {
            await subscriptionService.updatePlan(p.id, { is_active: !p.is_active });
            showToast(p.is_active ? "Plan hidden" : "Plan visible");
            await load();
        } catch (e: any) {
            showToast(e.message || "Update failed", "error");
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm("Delete this plan?")) return;
        try {
            await subscriptionService.deletePlan(id);
            showToast("Plan deleted");
            await load();
        } catch (e: any) {
            showToast(e.message || "Delete failed", "error");
        }
    };

    return (
        <div className="pb-10 min-h-screen">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Subscription Plans</h1>
                    <p className="text-xs text-gray-500 mt-1">{plans.length} {plans.length === 1 ? "plan" : "plans"} configured</p>
                </div>
                <button
                    onClick={openCreate}
                    className="bg-white text-black font-bold text-sm px-4 py-2.5 rounded-xl hover:bg-zinc-200 transition flex items-center gap-2"
                >
                    <IonIcon name="add-outline" className="text-base" />
                    Add Plan
                </button>
            </div>

            {/* Plans grid */}
            {loading ? (
                <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-pink-600"></div>
                </div>
            ) : plans.length === 0 ? (
                <div className="bg-[#070707] border border-gray-800 rounded-2xl p-10 text-center">
                    <IonIcon name="card-outline" className="text-4xl text-gray-600 mb-2" />
                    <p className="text-sm text-gray-500 mb-4">No subscription plans yet.</p>
                    <button onClick={openCreate} className="bg-white text-black font-bold text-sm px-5 py-2.5 rounded-xl hover:bg-zinc-200">Create your first plan</button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {plans.map((p) => {
                        const badge = BADGE_CLASS[p.badge_color] || BADGE_CLASS.silver;
                        const badgeColor = p.extra?.badge_custom_color || p.badge_color;
                        const badgeTickColor = p.extra?.badge_tick_color || undefined;
                        const accentBar = ACCENT_BAR[p.accent_color] || ACCENT_BAR.zinc;
                        return (
                            <div key={p.id} className="bg-[#0a0a0a] border border-gray-800 rounded-2xl overflow-hidden flex flex-col">
                                {/* Accent top bar */}
                                <div className={`h-1.5 w-full ${accentBar}`}></div>

                                <div className="p-5 flex-1 flex flex-col">
                                    {/* Top row: badge + price */}
                                    <div className="flex items-start justify-between mb-3">
                                        <div className={`inline-flex items-center gap-1.5 border rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${badge.ring} ${badge.text}`}>
                                            <BadgeSvg color={badgeColor} tickColor={badgeTickColor} size={12} />
                                            {p.badge_color}
                                        </div>
                                        <div className="text-right">
                                            <p className="text-2xl font-bold text-white leading-none">
                                                {Number(p.price).toLocaleString()}<span className="text-sm font-bold text-gray-400 ml-0.5">G</span>
                                            </p>
                                            <p className="text-[10px] text-gray-500 mt-1">{p.duration_days} days</p>
                                        </div>
                                    </div>

                                    {/* Name + slug */}
                                    <h3 className="text-xl font-bold text-white">{p.name}</h3>
                                    <p className="text-[11px] text-gray-500 mb-3">slug: {p.slug}{!p.is_active && <span className="ml-2 text-red-400 font-bold">[hidden]</span>}</p>

                                    {/* Chips */}
                                    <div className="flex flex-wrap gap-2 mb-3">
                                        <span className="inline-flex items-center gap-1.5 bg-[#141414] border border-gray-700/60 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-white/80">
                                            <IonIcon name="bookmark-outline" className="text-xs text-gray-400" />
                                            {p.googs_limit} Googs
                                        </span>
                                        <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold ${p.verified_tick ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400" : "bg-[#141414] border border-gray-700/60 text-gray-500"}`}>
                                            <IonIcon name={p.verified_tick ? "checkmark-circle" : "close-circle-outline"} className="text-xs" />
                                            Verified tick
                                        </span>
                                        {p.extra?.voice_calls !== false && (
                                            <span className="inline-flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                                                <IonIcon name="call-outline" className="text-xs" />
                                                Voice
                                            </span>
                                        )}
                                        {p.extra?.video_calls === true && (
                                            <span className="inline-flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                                                <IonIcon name="videocam-outline" className="text-xs" />
                                                Video {p.extra?.video_call_quality || "240p"}
                                            </span>
                                        )}
                                        {(p.extra?.voice_notes_to_text || p.extra?.voice_to_text || p.extra?.speech_to_text) && (
                                            <span className="inline-flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                                                <IonIcon name="mic-outline" className="text-xs" />
                                                Voice to text
                                            </span>
                                        )}
                                        {(p.extra?.text_to_voice_note || p.extra?.text_to_voice || p.extra?.tts) && (
                                            <span className="inline-flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                                                <IonIcon name="volume-medium-outline" className="text-xs" />
                                                Text to voice
                                            </span>
                                        )}
                                        {p.extra?.ads_expiry_value && (
                                            <span className="inline-flex items-center gap-1.5 bg-orange-500/10 border border-orange-500/30 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-orange-300">
                                                <IonIcon name="timer-outline" className="text-xs" />
                                                Ads expire {p.extra.ads_expiry_value} {p.extra.ads_expiry_unit || "days"}
                                            </span>
                                        )}
                                        <span className="inline-flex items-center gap-1.5 bg-sky-500/10 border border-sky-500/30 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-sky-300">
                                            <IonIcon name="chatbubbles-outline" className="text-xs" />
                                            Chat {p.extra?.chat_auto_delete_unit === "lifetime" || p.extra?.chat_auto_delete_lifetime
                                                ? "lifetime"
                                                : `${p.extra?.chat_auto_delete_value ?? p.extra?.chat_auto_delete_days ?? 1} ${p.extra?.chat_auto_delete_unit || "days"}`}
                                        </span>
                                        <span className="inline-flex items-center gap-1.5 bg-[#141414] border border-gray-700/60 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-white/60">
                                            <IonIcon name="swap-vertical-outline" className="text-xs text-gray-500" />
                                            Order {p.sort_order ?? 0}
                                        </span>
                                    </div>

                                    {/* Features */}
                                    <ul className="flex-1 flex flex-col gap-1.5 mb-4">
                                        {(p.features || []).map((f, i) => (
                                            <li key={i} className="flex items-start gap-2 text-xs text-white/80">
                                                <IonIcon name="checkmark-outline" className="text-emerald-400 mt-0.5 shrink-0" />
                                                <span>{f}</span>
                                            </li>
                                        ))}
                                    </ul>

                                    {/* Actions */}
                                    <div className="grid grid-cols-3 gap-2 pt-3 border-t border-gray-800">
                                        <button onClick={() => openEdit(p)} className="flex items-center justify-center gap-1.5 bg-[#141414] border border-gray-700 text-white/85 text-xs font-bold px-3 py-2 rounded-lg hover:bg-[#1c1c1c] transition">
                                            <IonIcon name="create-outline" className="text-sm" />
                                            Edit
                                        </button>
                                        <button onClick={() => handleToggleActive(p)} className="flex items-center justify-center gap-1.5 bg-amber-500/5 border border-amber-500/30 text-amber-400 text-xs font-bold px-3 py-2 rounded-lg hover:bg-amber-500/10 transition">
                                            <IonIcon name={p.is_active ? "eye-off-outline" : "eye-outline"} className="text-sm" />
                                            {p.is_active ? "Hide" : "Show"}
                                        </button>
                                        <button onClick={() => handleDelete(p.id)} className="flex items-center justify-center gap-1.5 bg-red-500/5 border border-red-500/30 text-red-400 text-xs font-bold px-3 py-2 rounded-lg hover:bg-red-500/10 transition">
                                            <IonIcon name="trash-outline" className="text-sm" />
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Modal */}
            {modalOpen && (
                <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-[#0a0a0a] border border-gray-800 rounded-2xl w-full max-w-2xl my-8 max-h-[90vh] overflow-y-auto">
                        <div className="sticky top-0 bg-[#0a0a0a] border-b border-gray-800 px-6 py-4 flex items-center justify-between z-10">
                            <h2 className="text-lg font-bold text-white">{editingId ? "Edit Plan" : "Create Plan"}</h2>
                            <button onClick={() => setModalOpen(false)} className="w-9 h-9 rounded-full border border-gray-700 hover:bg-white/5 flex items-center justify-center text-white/80">
                                <IonIcon name="close-outline" />
                            </button>
                        </div>

                        <div className="px-6 py-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <Field label="Slug (unique)">
                                    <input value={draft.slug || ""} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} className={inputCls} placeholder="starter" />
                                </Field>
                                <Field label="Name">
                                    <input value={draft.name || ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputCls} placeholder="Starter" />
                                </Field>
                                <Field label="Price (G)">
                                    <input type="number" value={draft.price ?? 0} onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })} className={inputCls} />
                                </Field>
                                <Field label="Duration (days)">
                                    <input type="number" value={draft.duration_days ?? 30} onChange={(e) => setDraft({ ...draft, duration_days: Number(e.target.value) })} className={inputCls} />
                                </Field>
                                <Field label="Badge / Tick Color">
                                    <select value={draft.badge_color} onChange={(e) => setDraft({ ...draft, badge_color: e.target.value })} className={inputCls}>
                                        {BADGE_COLORS.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </Field>
                                <Field label="Accent / Bar Color">
                                    <select value={draft.accent_color} onChange={(e) => setDraft({ ...draft, accent_color: e.target.value })} className={inputCls}>
                                        {ACCENT_COLORS.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </Field>
                                <Field label="Googs Save Limit">
                                    <input type="number" value={draft.googs_limit ?? 5} onChange={(e) => setDraft({ ...draft, googs_limit: Number(e.target.value) })} className={inputCls} />
                                </Field>
                                <Field label="Photo Ad Saves">
                                    <input
                                        type="number"
                                        min={0}
                                        value={draft.photoAdsSaveLimit ?? ""}
                                        onChange={(e) => setDraft({ ...draft, photoAdsSaveLimit: e.target.value === "" ? "" : Number(e.target.value) })}
                                        className={inputCls}
                                        placeholder="3"
                                    />
                                </Field>
                                <Field label="Video Ad Saves">
                                    <input
                                        type="number"
                                        min={0}
                                        value={draft.videoAdsSaveLimit ?? ""}
                                        onChange={(e) => setDraft({ ...draft, videoAdsSaveLimit: e.target.value === "" ? "" : Number(e.target.value) })}
                                        className={inputCls}
                                        placeholder="5"
                                    />
                                </Field>
                                <Field label="Photo/Video Ad Expiry Value">
                                    <input
                                        type="number"
                                        min={1}
                                        value={draft.adExpiryValue ?? ""}
                                        onChange={(e) => setDraft({ ...draft, adExpiryValue: e.target.value === "" ? "" : Number(e.target.value) })}
                                        className={inputCls}
                                        placeholder="30"
                                    />
                                </Field>
                                <Field label="Photo/Video Ad Expiry Unit">
                                    <select
                                        value={draft.adExpiryUnit || "days"}
                                        onChange={(e) => setDraft({ ...draft, adExpiryUnit: e.target.value as "minutes" | "hours" | "days" })}
                                        className={inputCls}
                                    >
                                        <option value="minutes">Minutes</option>
                                        <option value="hours">Hours</option>
                                        <option value="days">Days</option>
                                    </select>
                                </Field>
                                <Field label="Chat Delete Value">
                                    <input
                                        type="number"
                                        min={1}
                                        disabled={draft.chatAutoDeleteUnit === "lifetime"}
                                        value={draft.chatAutoDeleteUnit === "lifetime" ? "" : (draft.chatAutoDeleteValue ?? "")}
                                        onChange={(e) => setDraft({ ...draft, chatAutoDeleteValue: e.target.value === "" ? "" : Number(e.target.value) })}
                                        className={inputCls}
                                        placeholder="1"
                                    />
                                </Field>
                                <Field label="Chat Delete Unit">
                                    <select
                                        value={draft.chatAutoDeleteUnit || "days"}
                                        onChange={(e) => setDraft({ ...draft, chatAutoDeleteUnit: e.target.value as "minutes" | "hours" | "days" | "lifetime" })}
                                        className={inputCls}
                                    >
                                        <option value="minutes">Minutes</option>
                                        <option value="hours">Hours</option>
                                        <option value="days">Days</option>
                                        <option value="lifetime">Lifetime</option>
                                    </select>
                                </Field>
                                <Field label="Sort Order">
                                    <input type="number" value={draft.sort_order ?? 0} onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) })} className={inputCls} />
                                </Field>
                                <Field label="Verification Tick">
                                    <select value={draft.verified_tick ? "1" : "0"} onChange={(e) => setDraft({ ...draft, verified_tick: e.target.value === "1" })} className={inputCls}>
                                        <option value="1">Yes</option>
                                        <option value="0">No</option>
                                    </select>
                                </Field>
                                <div className="md:col-span-2 rounded-2xl border border-gray-800 bg-[#050505] p-4">
                                    <div className="mb-3 flex items-center gap-2">
                                        <BadgeSvg
                                            color={draft.badgeCustomColor || draft.badge_color || "silver"}
                                            tickColor={draft.badgeTickColor || undefined}
                                            size={18}
                                        />
                                        <div>
                                            <p className="text-xs font-bold text-white">Verification Tick Colors</p>
                                            <p className="text-[10px] text-gray-500">Customize the badge color and the tick color inside it.</p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                        <Field label="badge_custom_color">
                                            <div className="flex gap-2">
                                                <input
                                                    type="color"
                                                    value={colorPickerValue(draft.badgeCustomColor, "#3897F0")}
                                                    onChange={(e) => setDraft({ ...draft, badgeCustomColor: e.target.value })}
                                                    className="h-10 w-12 shrink-0 rounded-xl border border-gray-700/50 bg-[#030303] p-1"
                                                />
                                                <input
                                                    value={draft.badgeCustomColor || ""}
                                                    onChange={(e) => setDraft({ ...draft, badgeCustomColor: e.target.value })}
                                                    className={inputCls}
                                                    placeholder="Optional #3897F0"
                                                />
                                            </div>
                                        </Field>
                                        <Field label="badge_tick_color">
                                            <div className="flex gap-2">
                                                <input
                                                    type="color"
                                                    value={colorPickerValue(draft.badgeTickColor, "#ffffff")}
                                                    onChange={(e) => setDraft({ ...draft, badgeTickColor: e.target.value })}
                                                    className="h-10 w-12 shrink-0 rounded-xl border border-gray-700/50 bg-[#030303] p-1"
                                                />
                                                <input
                                                    value={draft.badgeTickColor || ""}
                                                    onChange={(e) => setDraft({ ...draft, badgeTickColor: e.target.value })}
                                                    className={inputCls}
                                                    placeholder="Optional #ffffff"
                                                />
                                            </div>
                                        </Field>
                                    </div>
                                </div>
                                <Field label="Active">
                                    <select value={draft.is_active ? "1" : "0"} onChange={(e) => setDraft({ ...draft, is_active: e.target.value === "1" })} className={inputCls}>
                                        <option value="1">Yes</option>
                                        <option value="0">No</option>
                                    </select>
                                </Field>
                            </div>

                            <div className="mt-4 rounded-2xl border border-gray-800 bg-[#050505] overflow-hidden">
                                <ToggleRow
                                    icon="call-outline"
                                    label="Voice Calls"
                                    checked={draft.voiceCalls !== false}
                                    onChange={(checked) => setDraft({ ...draft, voiceCalls: checked })}
                                />
                                <ToggleRow
                                    icon="videocam-outline"
                                    label={`Video Calls (${draft.videoCallQuality || "240p,360p"})`}
                                    checked={draft.videoCalls === true}
                                    onChange={(checked) => setDraft({ ...draft, videoCalls: checked })}
                                >
                                    {draft.videoCalls && (
                                        <select
                                            value={draft.videoCallQuality || "240p,360p"}
                                            onChange={(e) => setDraft({ ...draft, videoCallQuality: e.target.value as "240p" | "240p,360p" })}
                                            className="h-8 rounded-lg border border-white/10 bg-black px-2 text-[10px] font-bold text-white outline-none"
                                        >
                                            <option value="240p">240p</option>
                                            <option value="240p,360p">240p / 360p</option>
                                        </select>
                                    )}
                                </ToggleRow>
                                <ToggleRow
                                    icon="mic-outline"
                                    label="Voice Notes to Text"
                                    checked={draft.voiceNotesToText === true}
                                    onChange={(checked) => setDraft({ ...draft, voiceNotesToText: checked })}
                                />
                                <ToggleRow
                                    icon="volume-medium-outline"
                                    label="Text to Voice Note"
                                    checked={draft.textToVoiceNote === true}
                                    onChange={(checked) => setDraft({ ...draft, textToVoiceNote: checked })}
                                />
                            </div>

                            <Field label="Features (one per line)" className="mt-3">
                                <textarea rows={4} value={draft.featuresText || ""} onChange={(e) => setDraft({ ...draft, featuresText: e.target.value })}
                                    className={inputCls + " font-mono text-xs"} placeholder="Verification tick (blue)&#10;Save up to 5 Googs" />
                            </Field>

                            <Field label="Extra Fields (JSON — add any custom field/value)" className="mt-3">
                                <textarea rows={4} value={draft.extraText || "{}"} onChange={(e) => setDraft({ ...draft, extraText: e.target.value })}
                                    className={inputCls + " font-mono text-xs"} placeholder='{ "support_priority": "high", "max_chats": 50 }' />
                            </Field>

                            <div className="flex justify-end gap-2 mt-5 pt-5 border-t border-gray-800">
                                <button onClick={() => setModalOpen(false)} className="bg-[#141414] border border-gray-700 text-white font-bold text-xs uppercase tracking-widest px-5 py-2.5 rounded-xl hover:bg-[#1c1c1c]">
                                    Cancel
                                </button>
                                <button onClick={handleSave} disabled={saving} className="bg-white text-black font-bold text-xs uppercase tracking-widest px-5 py-2.5 rounded-xl hover:bg-zinc-200 disabled:opacity-50">
                                    {saving ? "Saving..." : editingId ? "Update Plan" : "Create Plan"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {toast && (
                <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-xl text-xs font-bold border z-50 ${toast.type === "success" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-red-500/10 border-red-500/30 text-red-300"}`}>
                    {toast.msg}
                </div>
            )}
        </div>
    );
}

const inputCls = "w-full bg-[#030303] border border-gray-700/50 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-white/30";

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
    return (
        <label className={`block ${className}`}>
            <span className="block text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-1">{label}</span>
            {children}
        </label>
    );
}

function ToggleRow({
    icon,
    label,
    checked,
    onChange,
    children,
}: {
    icon: string;
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    children?: React.ReactNode;
}) {
    return (
        <div className="flex items-center gap-3 border-b border-gray-800 px-3 py-3 last:border-b-0">
            <IonIcon name={icon} className="text-base text-white/45" />
            <span className="flex-1 text-sm font-semibold text-white">{label}</span>
            {children}
            <button
                type="button"
                onClick={() => onChange(!checked)}
                className={`relative h-8 w-14 rounded-full transition ${checked ? "bg-emerald-500" : "bg-white/10"}`}
                aria-pressed={checked}
            >
                <span className={`absolute top-1 h-6 w-6 rounded-full bg-white transition ${checked ? "left-7" : "left-1"}`} />
            </button>
        </div>
    );
}
