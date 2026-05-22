"use client";

import { useEffect, useState } from "react";
import IonIcon from "@/app/components/IonIcon";
import { subscriptionService, SubscriptionPlan } from "@/services/subscriptionService";

const BADGE_COLORS = ["silver", "blue", "gold", "green", "purple", "red"];
const ACCENT_COLORS = ["zinc", "blue", "amber", "emerald", "purple", "red"];

const BADGE_CLASS: Record<string, { text: string; ring: string; dot: string }> = {
    silver: { text: "text-zinc-300",   ring: "border-zinc-500/40 bg-zinc-500/10",   dot: "bg-zinc-300" },
    blue:   { text: "text-blue-400",   ring: "border-blue-500/40 bg-blue-500/10",   dot: "bg-blue-400" },
    gold:   { text: "text-amber-400",  ring: "border-amber-500/40 bg-amber-500/10", dot: "bg-amber-400" },
    green:  { text: "text-emerald-400",ring: "border-emerald-500/40 bg-emerald-500/10", dot: "bg-emerald-400" },
    purple: { text: "text-purple-400", ring: "border-purple-500/40 bg-purple-500/10", dot: "bg-purple-400" },
    red:    { text: "text-red-400",    ring: "border-red-500/40 bg-red-500/10",     dot: "bg-red-400" },
};

const ACCENT_BAR: Record<string, string> = {
    zinc:    "bg-zinc-400",
    blue:    "bg-blue-500",
    amber:   "bg-amber-400",
    emerald: "bg-emerald-500",
    purple:  "bg-purple-500",
    red:     "bg-red-500",
};

type DraftPlan = Partial<SubscriptionPlan> & {
    featuresText?: string;
    extraText?: string;
    photoAdsSaveLimit?: number | "";
    videoAdsSaveLimit?: number | "";
    adExpiryValue?: number | "";
    adExpiryUnit?: "minutes" | "hours" | "days";
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
            extraParsed = {
                ...extraParsed,
                photo_ads_save_limit: photoLimit,
                video_ads_save_limit: videoLimit,
                ad_photos: photoLimit,
                ad_videos: videoLimit,
                ads_expiry_value: expiryValue !== null && Number.isFinite(expiryValue) ? expiryValue : undefined,
                ads_expiry_unit: draft.adExpiryUnit || "days",
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
                        const accentBar = ACCENT_BAR[p.accent_color] || ACCENT_BAR.zinc;
                        return (
                            <div key={p.id} className="bg-[#0a0a0a] border border-gray-800 rounded-2xl overflow-hidden flex flex-col">
                                {/* Accent top bar */}
                                <div className={`h-1.5 w-full ${accentBar}`}></div>

                                <div className="p-5 flex-1 flex flex-col">
                                    {/* Top row: badge + price */}
                                    <div className="flex items-start justify-between mb-3">
                                        <div className={`inline-flex items-center gap-1.5 border rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${badge.ring} ${badge.text}`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`}></span>
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
                                        {p.extra?.ads_expiry_value && (
                                            <span className="inline-flex items-center gap-1.5 bg-orange-500/10 border border-orange-500/30 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-orange-300">
                                                <IonIcon name="timer-outline" className="text-xs" />
                                                Ads expire {p.extra.ads_expiry_value} {p.extra.ads_expiry_unit || "days"}
                                            </span>
                                        )}
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
                                <Field label="Sort Order">
                                    <input type="number" value={draft.sort_order ?? 0} onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) })} className={inputCls} />
                                </Field>
                                <Field label="Verification Tick">
                                    <select value={draft.verified_tick ? "1" : "0"} onChange={(e) => setDraft({ ...draft, verified_tick: e.target.value === "1" })} className={inputCls}>
                                        <option value="1">Yes</option>
                                        <option value="0">No</option>
                                    </select>
                                </Field>
                                <Field label="Active">
                                    <select value={draft.is_active ? "1" : "0"} onChange={(e) => setDraft({ ...draft, is_active: e.target.value === "1" })} className={inputCls}>
                                        <option value="1">Yes</option>
                                        <option value="0">No</option>
                                    </select>
                                </Field>
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
