"use client";

import React, { useEffect, useMemo, useState } from "react";
import IonIcon from "@/app/components/IonIcon";
import { uploadContentService, type UploadContentInsights, type UploadContentInsightsRange } from "@/services/uploadContentService";

const ranges: Array<{ key: UploadContentInsightsRange; label: string }> = [
    { key: "today", label: "Today" },
    { key: "7d", label: "7 Days" },
    { key: "30d", label: "30 Days" },
    { key: "all", label: "All Time" },
];

const formatNumber = (value: number) => Number(value || 0).toLocaleString();
const formatMoney = (value: number) => `R ${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const formatPercentage = (value: number) => `${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;

function InsightList({ rows, empty }: { rows?: Array<{ label: string; count?: number; percentage?: number }>; empty: string }) {
    const visibleRows = (rows || []).filter((row) => row.label && row.label.toLowerCase() !== "unknown" && Number(row.count || 0) > 0);
    if (!visibleRows.length) {
        return <p className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3 text-[11px] font-semibold text-white/45">{empty}</p>;
    }
    return (
        <div className="space-y-2">
            {visibleRows.slice(0, 5).map((row, index) => (
                <div key={`${row.label}-${index}`} className="grid grid-cols-[1fr_auto] items-center gap-3">
                    <div className="min-w-0">
                        <p className="truncate text-[11px] font-bold text-white/80">{index + 1}. {row.label}</p>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/8">
                            <div
                                className="h-full rounded-full bg-gradient-to-r from-emerald-300 to-cyan-300"
                                style={{ width: `${Math.max(4, Math.min(100, Number(row.percentage || 0)))}%` }}
                            />
                        </div>
                    </div>
                    <span className="text-[11px] font-black text-white">{Math.round(Number(row.percentage || 0))}%</span>
                </div>
            ))}
        </div>
    );
}

export default function UploadContentInsightsModal({
    contentId,
    onClose,
}: {
    contentId: string | number;
    onClose: () => void;
}) {
    const [range, setRange] = useState<UploadContentInsightsRange>("7d");
    const [insights, setInsights] = useState<UploadContentInsights | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError("");
        uploadContentService.getInsights(contentId, range)
            .then((data) => {
                if (!cancelled) setInsights(data);
            })
            .catch((err) => {
                if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load insights.");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [contentId, range]);

    const maxTrendValue = useMemo(() => {
        return Math.max(1, ...(insights?.trend || []).map((row) => Math.max(row.views, row.sales, row.shares)));
    }, [insights?.trend]);
    const hasTrend = (insights?.trend || []).some((row) => row.views > 0 || row.sales > 0 || row.shares > 0 || row.earnings > 0);
    const totalEarnings = Number(insights?.totals.totalEarnings ?? insights?.totals.total_earnings ?? insights?.totals.earnings ?? 0);
    const creatorNetEarnings = Number(insights?.totals.creatorNetEarnings ?? insights?.totals.creator_net_earnings ?? insights?.totals.earnings ?? 0);
    const platformFeePercentage = Number(insights?.totals.platformFeePercentage ?? insights?.totals.platform_fee_percentage ?? 0);
    const subscriptionCommissionPercentage = Number(insights?.totals.subscriptionCommissionPercentage ?? insights?.totals.subscription_commission_percentage ?? 0);
    const shareCommission = Number(insights?.totals.shareCommission ?? insights?.totals.share_commission ?? 0);
    const contentType = String(insights?.totals.contentType ?? insights?.totals.content_type ?? "").toLowerCase();
    const platformFeeSubline = contentType === "flash"
        ? "Flash commission"
        : subscriptionCommissionPercentage > 0 && subscriptionCommissionPercentage !== platformFeePercentage
            ? `Vault ${formatPercentage(platformFeePercentage)} / Sub ${formatPercentage(subscriptionCommissionPercentage)}`
            : "Vault commission";

    return (
        <div className="fixed inset-0 z-[220] flex items-end justify-center bg-black/70 px-3 py-4 backdrop-blur-md sm:items-center">
            <div className="w-full max-w-[390px] overflow-hidden rounded-[1.35rem] border border-white/10 bg-[#101216] shadow-[0_24px_90px_rgba(0,0,0,0.55)]">
                <div className="flex items-center justify-between border-b border-white/8 px-3.5 py-2.5">
                    <button type="button" onClick={onClose} className="inline-flex items-center gap-2 text-[12px] font-black text-white">
                        <IonIcon name="arrow-back-outline" className="text-base" />
                        Insights
                    </button>
                    <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-full bg-white/6 text-white/60 hover:bg-white/10 hover:text-white">
                        <IonIcon name="close" className="text-base" />
                    </button>
                </div>
                <div className="max-h-[82vh] overflow-y-auto px-3.5 py-3.5">
                    <div className="grid grid-cols-4 gap-1">
                        {ranges.map((item) => (
                            <button
                                key={item.key}
                                type="button"
                                onClick={() => setRange(item.key)}
                                className={`rounded-full px-2 py-1.5 text-[9px] font-black transition ${range === item.key ? "bg-emerald-300 text-black" : "bg-white/[0.06] text-white/55 hover:bg-white/[0.1]"}`}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>

                    {loading ? (
                        <div className="mt-3 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-7 text-center text-[11px] font-bold text-white/50">Loading insights...</div>
                    ) : error ? (
                        <div className="mt-3 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-4 text-center text-[11px] font-bold text-red-100">{error}</div>
                    ) : insights ? (
                        <div className="mt-3 space-y-3">
                            {hasTrend ? (
                                <section className="rounded-2xl border border-white/8 bg-white/[0.035] p-3">
                                    <div className="mb-2.5 flex items-center justify-between gap-3">
                                        <div>
                                            <h3 className="text-[11px] font-black text-white">Performance Trend</h3>
                                            <p className="mt-0.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-white/35">Views / sales / shares overview</p>
                                        </div>
                                        <span className="rounded-full border border-white/8 bg-white/[0.04] px-2 py-1 text-[8px] font-black uppercase tracking-[0.12em] text-white/55">
                                            {range === "7d" ? "7 Days" : range === "30d" ? "30 Days" : range === "today" ? "Today" : "All Time"}
                                        </span>
                                    </div>
                                    <div className="flex h-20 items-end justify-between gap-2">
                                        {insights.trend.map((row) => (
                                            <div key={row.date} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1.5">
                                                <div className="mx-auto flex h-full w-full max-w-[42px] items-end justify-center rounded-xl bg-white/[0.03] px-1.5 py-1">
                                                    <div
                                                        className="w-full rounded-lg rounded-b bg-gradient-to-t from-emerald-400 to-cyan-300 shadow-[0_0_18px_rgba(45,212,191,0.2)]"
                                                        style={{ height: `${Math.max(8, (Math.max(row.views, row.sales, row.shares) / maxTrendValue) * 100)}%` }}
                                                        title={`${row.views} views, ${row.sales} sales`}
                                                    />
                                                </div>
                                                <span className="truncate text-center text-[8px] font-bold text-white/40">{row.date.slice(5)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            ) : null}

                            <section className="grid grid-cols-2 gap-2">
                                {[
                                    ["eye-outline", "Total Views", formatNumber(insights.totals.views), "Views in selected range"],
                                    ["cash-outline", "Total Earnings", formatMoney(totalEarnings), "Gross sales"],
                                    ["card-outline", "Platform Fee", formatPercentage(platformFeePercentage), platformFeeSubline],
                                    ["wallet-outline", "Creator Net Earnings", formatMoney(creatorNetEarnings), "After platform fee"],
                                    ["share-social-outline", "Total Shares", formatNumber(insights.totals.shares), `Share commission ${formatMoney(shareCommission)}`],
                                ].map(([icon, label, value, subline]) => (
                                    <div key={label} className="rounded-2xl border border-white/8 bg-white/[0.035] p-2.5">
                                        <div className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-[0.1em] text-white/42">
                                            <IonIcon name={icon} className="text-sm text-emerald-200" />
                                            {label}
                                        </div>
                                        <p className="mt-1.5 text-[15px] font-black text-white">{value}</p>
                                        <p className="mt-0.5 truncate text-[8px] font-bold text-white/38">{subline}</p>
                                    </div>
                                ))}
                            </section>

                            <section className="rounded-2xl border border-white/8 bg-white/[0.035] p-3">
                                <h3 className="mb-2.5 text-[11px] font-black text-white">Top Countries</h3>
                                <InsightList rows={insights.countries} empty="No country data yet." />
                            </section>
                            <section className="rounded-2xl border border-white/8 bg-white/[0.035] p-3">
                                <h3 className="mb-2.5 text-[11px] font-black text-white">Audience Type</h3>
                                <InsightList rows={insights.audienceTypes} empty="No subscriber audience data yet." />
                            </section>
                            <section className="grid gap-2 sm:grid-cols-2">
                                <div className="rounded-2xl border border-white/8 bg-white/[0.035] p-3">
                                    <h3 className="mb-2.5 text-[11px] font-black text-white">Gender</h3>
                                    <InsightList rows={insights.genders} empty="No gender data yet." />
                                </div>
                                <div className="rounded-2xl border border-white/8 bg-white/[0.035] p-3">
                                    <h3 className="mb-2.5 text-[11px] font-black text-white">Age</h3>
                                    <InsightList rows={insights.ages} empty="No age data yet." />
                                </div>
                            </section>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
