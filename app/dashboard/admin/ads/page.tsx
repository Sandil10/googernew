"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import IonIcon from "@/app/components/IonIcon";
import { adsService } from "@/services/adsService";

type AdStatus = "Under Review" | "Active" | "Paused" | "Removed" | "Completed" | "Expired" | "Cancelled";

const STATUS_TABS: Array<"All" | AdStatus> = ["All", "Under Review", "Active", "Paused", "Removed", "Completed", "Expired", "Cancelled"];

const STATUS_CFG: Record<string, { color: string; bg: string; dot: string }> = {
    "Under Review": { color: "text-amber-400",   bg: "bg-amber-400/10 border-amber-400/20",   dot: "bg-amber-400" },
    Active:         { color: "text-emerald-400", bg: "bg-emerald-400/10 border-emerald-400/20", dot: "bg-emerald-400" },
    Paused:         { color: "text-blue-400",    bg: "bg-blue-400/10 border-blue-400/20",      dot: "bg-blue-400" },
    Removed:        { color: "text-orange-400",  bg: "bg-orange-400/10 border-orange-400/20",  dot: "bg-orange-400" },
    Completed:      { color: "text-gray-400",    bg: "bg-gray-400/10 border-gray-400/20",      dot: "bg-gray-400" },
    Expired:        { color: "text-gray-400",    bg: "bg-gray-400/10 border-gray-400/20",      dot: "bg-gray-400" },
    Cancelled:      { color: "text-red-400",     bg: "bg-red-500/10 border-red-500/20",        dot: "bg-red-400" },
};

function statusCfg(s: string) {
    return STATUS_CFG[s] ?? { color: "text-gray-400", bg: "bg-gray-400/10 border-gray-400/20", dot: "bg-gray-400" };
}

function fmt(ts?: string | null) {
    if (!ts) return "—";
    return new Date(ts).toLocaleString();
}

export default function AdminAdsPage() {
    const router = useRouter();
    const [ads, setAds] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<"All" | AdStatus>("Under Review");
    const [selected, setSelected] = useState<any | null>(null);
    const [actionLoading, setActionLoading] = useState(false);
    const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

    const showToast = (msg: string, ok = true) => {
        setToast({ msg, ok });
        setTimeout(() => setToast(null), 3000);
    };

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await adsService.getAllAds();
            setAds(data);
        } catch {
            showToast("Failed to load ads", false);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const filtered = filter === "All" ? ads : ads.filter((a) => a.status === filter);

    const doAction = async (adId: string, status: string, ad?: any) => {
        setActionLoading(true);
        try {
            const nextStatus = status === "Cancelled" && ad && ["Active", "Paused"].includes(String(ad.status || ""))
                ? "Removed"
                : status;
            await adsService.updateAd(adId, { status: nextStatus });
            showToast(`Ad ${nextStatus === "Active" ? "approved" : nextStatus === "Removed" ? "removed from feeds" : nextStatus === "Cancelled" ? "rejected" : "updated"} successfully`);
            setSelected(null);
            await load();
        } catch (e: any) {
            showToast(e?.message || "Action failed", false);
        } finally {
            setActionLoading(false);
        }
    };

    const mediaUrl = (ad: any) => {
        const gallery = Array.isArray(ad.mediaGallery) ? ad.mediaGallery : [];
        return gallery[0] || ad.mediaPreview || ad.media_preview || null;
    };

    const underReviewCount = ads.filter((a) => a.status === "Under Review").length;

    return (
        <div className="min-h-screen bg-[#080808] text-white px-4 py-8 max-w-5xl mx-auto">
            {/* Header */}
            <div className="flex items-center gap-3 mb-8">
                <button
                    type="button"
                    onClick={() => router.back()}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition"
                >
                    <IonIcon name="arrow-back-outline" className="text-lg text-white/70" />
                </button>
                <div>
                    <h1 className="text-xl font-black tracking-tight">Ad Management</h1>
                    <p className="text-xs text-gray-500 mt-0.5">Review and approve user-submitted ads</p>
                </div>
                {underReviewCount > 0 && (
                    <span className="ml-auto flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/25 rounded-full px-3 py-1 text-xs font-black text-amber-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                        {underReviewCount} pending
                    </span>
                )}
            </div>

            {/* Filter tabs */}
            <div className="flex gap-2 overflow-x-auto no-scrollbar mb-6">
                {STATUS_TABS.map((tab) => {
                    const count = tab === "All" ? ads.length : ads.filter((a) => a.status === tab).length;
                    return (
                        <button
                            key={tab}
                            type="button"
                            onClick={() => setFilter(tab)}
                            className={`shrink-0 flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-black transition border ${
                                filter === tab
                                    ? "bg-white text-black border-white"
                                    : "bg-white/5 text-white/50 border-white/10 hover:bg-white/10 hover:text-white"
                            }`}
                        >
                            {tab}
                            {count > 0 && (
                                <span className={`rounded-full px-1.5 py-px text-[9px] font-black ${filter === tab ? "bg-black/20 text-black" : "bg-white/10 text-white/60"}`}>
                                    {count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* List */}
            {loading ? (
                <div className="flex items-center justify-center py-20 text-white/30 text-sm">Loading…</div>
            ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-white/30 gap-3">
                    <IonIcon name="file-tray-outline" className="text-4xl" />
                    <p className="text-sm font-semibold">No ads found</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {filtered.map((ad) => {
                        const cfg = statusCfg(ad.status);
                        const thumb = mediaUrl(ad);
                        const isVideo = (ad.mediaType || ad.media_type || "").toLowerCase().includes("video");
                        return (
                            <button
                                key={ad.adId || ad.ad_id}
                                type="button"
                                onClick={() => setSelected(ad)}
                                className="w-full flex items-center gap-4 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4 text-left transition hover:bg-white/[0.06] active:scale-[0.99]"
                            >
                                {/* Thumbnail */}
                                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-white/5">
                                    {thumb ? (
                                        isVideo ? (
                                            <video src={thumb} className="h-full w-full object-cover" muted playsInline />
                                        ) : (
                                            <Image src={thumb} alt="ad" fill className="object-cover" unoptimized />
                                        )
                                    ) : (
                                        <div className="flex h-full w-full items-center justify-center">
                                            <IonIcon name="image-outline" className="text-xl text-white/20" />
                                        </div>
                                    )}
                                </div>

                                {/* Info */}
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <p className="truncate text-sm font-black text-white">
                                            {ad.title || ad.description || ad.campaignType || "Untitled Ad"}
                                        </p>
                                        <span className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-2 py-px text-[10px] font-black ${cfg.bg} ${cfg.color}`}>
                                            <span className={`h-1 w-1 rounded-full ${cfg.dot}`} />
                                            {ad.status}
                                        </span>
                                    </div>
                                    <p className="mt-0.5 text-[11px] text-white/40 font-semibold">
                                        @{ad.ownerUsername || ad.owner_username || ad.username || "—"} · {ad.campaignType} · {fmt(ad.createdAt || ad.created_at)}
                                    </p>
                                </div>

                                <IonIcon name="chevron-forward-outline" className="text-white/20 shrink-0" />
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Detail panel */}
            {selected && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#0e0e0e] p-6 max-h-[90vh] overflow-y-auto">
                        {/* Close */}
                        <div className="flex items-center justify-between mb-5">
                            <h2 className="text-base font-black">Ad Details</h2>
                            <button type="button" onClick={() => setSelected(null)} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition">
                                <IonIcon name="close-outline" className="text-lg text-white/60" />
                            </button>
                        </div>

                        {/* Media */}
                        {mediaUrl(selected) && (
                            <div className="relative mb-4 overflow-hidden rounded-2xl bg-black aspect-video">
                                {(selected.mediaType || selected.media_type || "").toLowerCase().includes("video") ? (
                                    <video src={mediaUrl(selected)} controls className="h-full w-full object-contain" />
                                ) : (
                                    <Image src={mediaUrl(selected)} alt="ad" fill className="object-contain" unoptimized />
                                )}
                            </div>
                        )}

                        {/* Fields */}
                        <div className="space-y-0 rounded-2xl border border-white/8 bg-white/[0.02] overflow-hidden mb-5">
                            {[
                                ["Ad ID",         selected.adId || selected.ad_id],
                                ["Owner",         `@${selected.ownerUsername || selected.owner_username || selected.username || "—"}`],
                                ["Type",          selected.campaignType],
                                ["Status",        selected.status],
                                ["Title",         selected.title],
                                ["Description",   selected.description],
                                ["Media Type",    selected.mediaType || selected.media_type],
                                ["Budget",        selected.budget ? `R${Number(selected.budget).toFixed(2)}` : null],
                                ["Duration",      selected.durationDays ? `${selected.durationDays} days` : null],
                                ["Created",       fmt(selected.createdAt || selected.created_at)],
                                ["Started",       fmt(selected.activeStartTime || selected.active_start_time || selected.startedAt || selected.started_at)],
                            ].map(([label, value]) => value ? (
                                <div key={label} className="flex items-start justify-between gap-4 px-4 py-2.5 border-b border-white/5 last:border-0">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-white/30 shrink-0">{label}</span>
                                    <span className="text-xs font-bold text-white text-right break-all">{value}</span>
                                </div>
                            ) : null)}
                        </div>

                        {/* Gallery */}
                        {Array.isArray(selected.mediaGallery) && selected.mediaGallery.length > 1 && (
                            <div className="flex gap-2 overflow-x-auto no-scrollbar mb-5">
                                {selected.mediaGallery.slice(0, 6).map((url: string, i: number) => (
                                    <div key={i} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-black/30">
                                        <Image src={url} alt={`img${i}`} fill className="object-cover" unoptimized />
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-3">
                            {selected.status === "Under Review" && (
                                <>
                                    <button
                                        type="button"
                                        disabled={actionLoading}
                                        onClick={() => doAction(selected.adId || selected.ad_id, "Active")}
                                        className="flex-1 rounded-2xl bg-emerald-500 py-3 text-sm font-black text-white transition hover:bg-emerald-400 disabled:opacity-50"
                                    >
                                        {actionLoading ? "…" : "Approve"}
                                    </button>
                                    <button
                                        type="button"
                                        disabled={actionLoading}
                                        onClick={() => doAction(selected.adId || selected.ad_id, "Cancelled")}
                                        className="flex-1 rounded-2xl bg-red-500/15 border border-red-500/30 py-3 text-sm font-black text-red-400 transition hover:bg-red-500/25 disabled:opacity-50"
                                    >
                                        {actionLoading ? "…" : "Reject"}
                                    </button>
                                </>
                            )}
                            {selected.status === "Active" && (
                                <button
                                    type="button"
                                    disabled={actionLoading}
                                    onClick={() => doAction(selected.adId || selected.ad_id, "Paused")}
                                    className="flex-1 rounded-2xl bg-blue-500/15 border border-blue-500/30 py-3 text-sm font-black text-blue-400 transition hover:bg-blue-500/25 disabled:opacity-50"
                                >
                                    {actionLoading ? "…" : "Pause"}
                                </button>
                            )}
                            {selected.status === "Paused" && (
                                <button
                                    type="button"
                                    disabled={actionLoading}
                                    onClick={() => doAction(selected.adId || selected.ad_id, "Active")}
                                    className="flex-1 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 py-3 text-sm font-black text-emerald-400 transition hover:bg-emerald-400/25 disabled:opacity-50"
                                >
                                    {actionLoading ? "…" : "Resume"}
                                </button>
                            )}
                            {(selected.status === "Active" || selected.status === "Paused") && (
                                <button
                                    type="button"
                                    disabled={actionLoading}
                                    onClick={() => doAction(selected.adId || selected.ad_id, "Cancelled", selected)}
                                    className="flex-1 rounded-2xl bg-red-500/15 border border-red-500/30 py-3 text-sm font-black text-red-400 transition hover:bg-red-500/25 disabled:opacity-50"
                                >
                                    {actionLoading ? "…" : "Remove"}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Toast */}
            {toast && (
                <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] rounded-2xl px-5 py-3 text-sm font-black shadow-xl border ${
                    toast.ok
                        ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                        : "bg-red-500/15 border-red-500/30 text-red-400"
                }`}>
                    {toast.msg}
                </div>
            )}
        </div>
    );
}
