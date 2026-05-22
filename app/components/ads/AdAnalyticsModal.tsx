"use client";

import { useEffect, useRef, useState } from "react";
import { adsService, AdAnalytics } from "@/services/adsService";
import IonIcon from "@/app/components/IonIcon";

type AudienceTab = "Gender" | "Age" | "Locations" | "Interests";

const BENCH = { viewRate: 60, clickRate: 1.2, likeRate: 2.5 };

function toPercent(part: number, total: number, dp = 1) {
    if (!total) return 0;
    return Math.round((part / total) * 100 * 10 ** dp) / 10 ** dp;
}

function useCountUp(target: number) {
    const [val, setVal] = useState(0);
    useEffect(() => {
        if (!target) { setVal(0); return; }
        const steps = 28;
        let step = 0;
        const id = setInterval(() => {
            step++;
            setVal(Math.min(Math.round((target / steps) * step), target));
            if (step >= steps) clearInterval(id);
        }, 22);
        return () => clearInterval(id);
    }, [target]);
    return val;
}

// ─── Thin bar (Age / Regions / Interests) ───────────────────────────────────
function Bar({ pct, color = "#22d3ee", delay = 0 }: { pct: number; color?: string; delay?: number }) {
    const [w, setW] = useState(0);
    useEffect(() => {
        const id = setTimeout(() => setW(Math.min(pct, 100)), delay + 80);
        return () => clearTimeout(id);
    }, [pct, delay]);
    return (
        <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${w}%`, backgroundColor: color }} />
        </div>
    );
}

function AudienceRow({ label, pct, color, index }: { label: string; pct: number; color?: string; index: number }) {
    return (
        <div className="flex items-center gap-3">
            <span className="w-28 shrink-0 text-[12px] font-medium text-white/80 leading-tight">{label}</span>
            <div className="flex-1 min-w-0"><Bar pct={pct} color={color} delay={index * 55} /></div>
            <span className="w-10 shrink-0 text-right text-[12px] font-black text-white/70">{pct.toFixed(0)}%</span>
        </div>
    );
}

// ─── Donut chart (Gender) ────────────────────────────────────────────────────
const GENDER_COLORS: Record<string, string> = {
    Male: "#22d3ee",
    Female: "#f472b6",
    Other: "#a78bfa",
    Unknown: "#6b7280",
};

function DonutChart({ segments, totalReach }: {
    segments: Array<{ label: string; pct: number }>;
    totalReach: number;
}) {
    const r = 72;
    const circ = 2 * Math.PI * r;
    const [ready, setReady] = useState(false);
    useEffect(() => { const t = setTimeout(() => setReady(true), 120); return () => clearTimeout(t); }, []);

    // build arc parameters — start from 12 o'clock, go clockwise
    let accumulated = 0;
    const arcs = segments.map((seg) => {
        const len = ready ? (seg.pct / 100) * circ : 0;
        const dashOffset = circ / 4 - (accumulated / 100) * circ;
        accumulated += seg.pct;
        return { ...seg, len, dashOffset, color: GENDER_COLORS[seg.label] || GENDER_COLORS.Unknown };
    });

    const displayedReach = useCountUp(totalReach);

    // Find Male / Female / Other for positioning
    const male = segments.find((s) => s.label === "Male");
    const female = segments.find((s) => s.label === "Female");
    const others = segments.filter((s) => s.label !== "Male" && s.label !== "Female");

    return (
        <div className="flex flex-col items-center gap-4 py-2">
            {/* Row: Male | Donut | Female */}
            <div className="flex items-center gap-4 w-full justify-center">
                {/* Male legend (left) */}
                <div className="flex flex-col items-center gap-1 w-20">
                    {male && (
                        <>
                            <span className="text-2xl">👨</span>
                            <span className="text-[11px] font-black text-white/80">Male</span>
                            <span className="text-[22px] font-black" style={{ color: GENDER_COLORS.Male }}>
                                {male.pct}%
                            </span>
                        </>
                    )}
                </div>

                {/* Donut */}
                <div className="relative shrink-0">
                    <svg width="180" height="180" viewBox="0 0 200 200">
                        {/* Track */}
                        <circle cx="100" cy="100" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="22" />
                        {/* Segments */}
                        {arcs.map((arc, i) => (
                            <circle
                                key={arc.label}
                                cx="100" cy="100" r={r}
                                fill="none"
                                stroke={arc.color}
                                strokeWidth="22"
                                strokeDasharray={`${arc.len} ${circ}`}
                                strokeDashoffset={arc.dashOffset}
                                strokeLinecap="butt"
                                style={{ transition: `stroke-dasharray 0.85s cubic-bezier(0.4,0,0.2,1) ${i * 0.12}s` }}
                            />
                        ))}
                        {/* Center */}
                        <text x="100" y="92" textAnchor="middle" fill="white" fontSize="22" fontWeight="900" fontFamily="system-ui, sans-serif">
                            {displayedReach.toLocaleString()}
                        </text>
                        <text x="100" y="114" textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize="10" fontFamily="system-ui, sans-serif">
                            Total Reach
                        </text>
                    </svg>
                </div>

                {/* Female legend (right) */}
                <div className="flex flex-col items-center gap-1 w-20">
                    {female && (
                        <>
                            <span className="text-2xl">👩</span>
                            <span className="text-[11px] font-black text-white/80">Female</span>
                            <span className="text-[22px] font-black" style={{ color: GENDER_COLORS.Female }}>
                                {female.pct}%
                            </span>
                        </>
                    )}
                </div>
            </div>

            {/* Bottom: Other/Unknown */}
            <div className="flex items-center justify-center gap-6">
                {others.map((seg) => (
                    <div key={seg.label} className="flex flex-col items-center gap-0.5">
                        <span className="text-xl">⚪</span>
                        <span className="text-[11px] font-black text-white/70">{seg.label}</span>
                        <span className="text-[18px] font-black" style={{ color: GENDER_COLORS[seg.label] || GENDER_COLORS.Unknown }}>
                            {seg.pct}%
                        </span>
                    </div>
                ))}
            </div>

            {/* Color dot legend strip */}
            <div className="flex items-center gap-4">
                {segments.map((seg) => (
                    <div key={seg.label} className="flex items-center gap-1.5">
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: GENDER_COLORS[seg.label] || GENDER_COLORS.Unknown }} />
                        <span className="text-[10px] text-white/40">{seg.label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function normalizeToPercent(rows: Array<{ label: string; [k: string]: any }>, key: string) {
    const total = rows.reduce((s, r) => s + Number(r[key] || 0), 0);
    return rows
        .map((r) => ({ label: r.label, pct: total ? Math.round((Number(r[key] || 0) / total) * 100) : 0 }))
        .filter((r) => r.pct > 0)
        .sort((a, b) => b.pct - a.pct);
}

function RawCount({ label, val }: { label: string; val: number }) {
    const d = useCountUp(val);
    return (
        <div className="flex flex-col items-center gap-0">
            <span className="text-[11px] font-black text-white">{d.toLocaleString()}</span>
            <span className="text-[7px] font-semibold uppercase tracking-[0.08em] text-white/28">{label}</span>
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────
type Props = { adId: string; adTitle?: string; campaignType?: string; onClose: () => void };

export function AdAnalyticsModal({ adId, adTitle, campaignType, onClose }: Props) {
    const [analytics, setAnalytics] = useState<AdAnalytics | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [tab, setTab] = useState<AudienceTab>("Gender");
    const overlayRef = useRef<HTMLDivElement>(null);

    const load = async () => {
        setLoading(true); setError(null);
        setAnalytics(null); // clear stale data so counts don't flash old numbers
        try { setAnalytics(await adsService.getAdAnalytics(adId)); }
        catch (e: any) { setError(e?.message || "Failed to load analytics"); }
        finally { setLoading(false); }
    };

    // Always fetch fresh on every open (adId change triggers a new load)
    useEffect(() => { void load(); }, [adId]);
    useEffect(() => {
        const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("keydown", fn);
        return () => document.removeEventListener("keydown", fn);
    }, [onClose]);

    const totals = analytics?.totals;
    const base = Math.max(totals?.impressions || 0, 1);
    const viewRate = toPercent(totals?.views || 0, base);
    const clickRate = toPercent(totals?.clicks || 0, base);
    const likeRate = toPercent(totals?.likes || 0, base);
    const reachRate = toPercent(totals?.reach || 0, base);

    // Gender rows normalized
    const rawGender = normalizeToPercent(analytics?.byGender || [], "reach");
    // Ensure Male / Female / Other order and merge small categories into Other
    const male = rawGender.find((r) => r.label === "Male") || null;
    const female = rawGender.find((r) => r.label === "Female") || null;
    const unknownPct = rawGender.filter((r) => r.label !== "Male" && r.label !== "Female").reduce((s, r) => s + r.pct, 0);
    const genderSegments = [
        ...(male ? [male] : []),
        ...(female ? [female] : []),
        ...(unknownPct > 0 ? [{ label: "Other", pct: unknownPct }] : []),
    ];

    const ageRows = normalizeToPercent(analytics?.byAge || [], "impressions")
        .filter((r) => r.label !== "Unknown")
        .sort((a, b) => {
            const ord = ["Under 18", "18–24", "25–34", "35–44", "45–54", "55+"];
            return ord.indexOf(a.label) - ord.indexOf(b.label);
        });

    const locationRows = normalizeToPercent(analytics?.byCountry || [], "reach")
        .filter((r) => r.label !== "Unknown");

    const interestRows = normalizeToPercent(
        (analytics?.byClickType || []).map((r) => ({
            label: r.label === "visit" ? "Link Visit" : r.label === "message" ? "Message" : r.label === "call" ? "Call" : r.label.charAt(0).toUpperCase() + r.label.slice(1),
            clicks: r.clicks,
        })),
        "clicks"
    );

    const BAR_COLORS: Record<AudienceTab, string> = {
        Gender: "#22d3ee",
        Age: "#06b6d4",
        Locations: "#38bdf8",
        Interests: "#a78bfa",
    };

    return (
        <div
            ref={overlayRef}
            className="fixed inset-0 z-[999] flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center"
            onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
        >
            <div
                className="relative flex w-full max-w-md flex-col overflow-hidden rounded-t-[2rem] sm:rounded-[2rem] bg-[#0a0a0a] border border-white/[0.08] shadow-[0_40px_120px_rgba(0,0,0,0.8)]"
                style={{ maxHeight: "92vh" }}
            >
                {/* Drag handle */}
                <div className="flex shrink-0 justify-center pt-3 pb-1 sm:hidden">
                    <div className="h-1 w-10 rounded-full bg-white/20" />
                </div>

                {/* Header */}
                <div className="flex shrink-0 items-center justify-between px-5 py-3 border-b border-white/[0.06]">
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={onClose} className="text-white/50 hover:text-white transition">
                            <IonIcon name="chevron-back" className="text-xl" />
                        </button>
                        <h2 className="text-[15px] font-black text-white">Order details</h2>
                    </div>
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={load} disabled={loading} className="text-white/40 hover:text-white disabled:opacity-30 transition">
                            <IonIcon name="refresh-outline" className={`text-lg ${loading ? "animate-spin" : ""}`} />
                        </button>
                        <div className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-white/40">
                            <IonIcon name="person-outline" className="text-sm" />
                        </div>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto">
                    {loading && !analytics && (
                        <div className="flex flex-col items-center justify-center gap-3 py-20 text-white/25">
                            <IonIcon name="stats-chart-outline" className="text-4xl animate-pulse" />
                            <p className="text-[12px]">Loading real-time analytics…</p>
                        </div>
                    )}

                    {error && !loading && (
                        <div className="flex flex-col items-center gap-3 py-20 text-rose-400/70">
                            <IonIcon name="alert-circle-outline" className="text-3xl" />
                            <p className="text-[12px]">{error}</p>
                            <button type="button" onClick={load} className="rounded-xl border border-white/10 bg-white/[0.05] px-5 py-2.5 text-[11px] font-black text-white/50 hover:text-white transition">
                                Retry
                            </button>
                        </div>
                    )}

                    {analytics && (
                        <>
                            {/* Ad pill */}
                            {(adTitle || campaignType) && (
                                <div className="mx-5 mt-4 flex items-center gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-2.5">
                                    <IonIcon name="megaphone-outline" className="shrink-0 text-sm text-cyan-400/70" />
                                    <div className="min-w-0">
                                        {adTitle && <p className="truncate text-[12px] font-black text-white">{adTitle}</p>}
                                        <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-white/30">{campaignType} · {adId}</p>
                                    </div>
                                </div>
                            )}

                            {/* ── Performance rates 2×2 (compact) ── */}
                            <div className="mx-5 mt-4 overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
                                <div className="grid grid-cols-2 divide-x divide-y divide-white/[0.06]">
                                    {[
                                        { label: "View rate", rate: viewRate, avg: BENCH.viewRate },
                                        { label: "Reach rate", rate: reachRate, avg: BENCH.viewRate },
                                        { label: "Click rate", rate: clickRate, avg: BENCH.clickRate },
                                        { label: "Like rate", rate: likeRate, avg: BENCH.likeRate },
                                    ].map(({ label, rate, avg }) => {
                                        const above = rate >= avg;
                                        return (
                                            <div key={label} className="flex flex-col gap-0.5 px-4 py-3">
                                                <p className="text-[9px] text-white/35">{label}</p>
                                                <p className="text-[1.25rem] font-black tracking-tight text-white leading-tight">{rate.toFixed(1)}%</p>
                                                <div className={`flex items-center gap-0.5 text-[8px] font-semibold ${above ? "text-cyan-400" : "text-white/30"}`}>
                                                    <IonIcon name={above ? "arrow-up-circle" : "arrow-down-circle"} className="text-[10px]" />
                                                    {above ? "above average" : "below average"}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Raw counts — small */}
                                <div className="flex items-center justify-around border-t border-white/[0.06] px-4 py-2.5">
                                    <RawCount label="Views" val={totals?.views || 0} />
                                    <RawCount label="Reach" val={totals?.reach || 0} />
                                    <RawCount label="Impr." val={totals?.impressions || 0} />
                                    <RawCount label="Clicks" val={totals?.clicks || 0} />
                                    <RawCount label="Likes" val={totals?.likes || 0} />
                                </div>
                            </div>

                            {/* ── Audience insights ── */}
                            <div className="mx-5 mt-5 pb-6">
                                <h3 className="mb-3 text-[14px] font-black text-white">Audience insights</h3>

                                {/* Tabs */}
                                <div className="mb-5 flex items-center gap-2 overflow-x-auto no-scrollbar">
                                    {(["Gender", "Age", "Locations", "Interests"] as AudienceTab[]).map((t) => (
                                        <button
                                            key={t}
                                            type="button"
                                            onClick={() => setTab(t)}
                                            className={`shrink-0 rounded-lg px-3.5 py-1.5 text-[11px] font-black transition ${tab === t ? "border border-white text-white" : "border border-white/[0.12] bg-white/[0.04] text-white/50 hover:text-white"}`}
                                        >
                                            {t}
                                        </button>
                                    ))}
                                </div>

                                {/* Gender — Donut chart */}
                                {tab === "Gender" && (
                                    genderSegments.length > 0 ? (
                                        <DonutChart segments={genderSegments} totalReach={totals?.reach || 0} />
                                    ) : (
                                        <EmptyTab label="gender" />
                                    )
                                )}

                                {/* Age / Regions / Interests — bar rows */}
                                {tab !== "Gender" && (() => {
                                    const rows = tab === "Age" ? ageRows : tab === "Locations" ? locationRows : interestRows;
                                    const color = BAR_COLORS[tab];
                                    return rows.length > 0 ? (
                                        <div className="space-y-4">
                                            {rows.map((row, i) => (
                                                <AudienceRow key={row.label} label={row.label} pct={row.pct} color={color} index={i} />
                                            ))}
                                        </div>
                                    ) : <EmptyTab label={tab === "Locations" ? "location" : tab.toLowerCase()} />;
                                })()}
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="shrink-0 border-t border-white/[0.06] px-5 py-4">
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-full rounded-xl border border-white/10 bg-white/[0.06] py-2.5 text-[11px] font-black uppercase tracking-[0.08em] text-white/50 transition hover:bg-white/[0.1] hover:text-white/70 active:scale-[0.98]"
                    >
                        Close Analytics
                    </button>
                </div>
            </div>
        </div>
    );
}

function EmptyTab({ label }: { label: string }) {
    return (
        <div className="flex flex-col items-center gap-2 py-10 text-center text-white/25">
            <IonIcon name="analytics-outline" className="text-3xl" />
            <p className="text-[11px]">No {label} data yet.<br />Data populates as users engage with this ad.</p>
        </div>
    );
}
