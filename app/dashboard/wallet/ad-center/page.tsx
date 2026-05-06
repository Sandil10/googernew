"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import IonIcon from "@/app/components/IonIcon";
import { adsService } from "@/services/adsService";

type AdStatus = "Under Review" | "Active" | "Paused" | "Completed" | "Cancelled";
type StatusFilter = "All Ads" | AdStatus;
const ADS_PER_PAGE = 5;

type AdHistoryRow = {
    adId: string;
    campaignType: string;
    createdAt: string;
    ownerKey?: string;
    status: AdStatus;
    budget?: number;
    durationDays?: number;
    title?: string;
    description?: string;
    mediaPreview?: string;
    mediaGallery?: string[];
    mediaType?: "image" | "video" | "link" | "";
    genderTarget?: string;
    ageMin?: number;
    ageMax?: number;
    reach?: number;
    impressions?: number;
    clicks?: number;
    spend?: number;
    remainingBudget?: number;
    campaignPath?: string;
    editDraft?: Record<string, unknown>;
};

const STATUS_FILTERS: Array<{ label: StatusFilter; slug: string; icon: string }> = [
    { label: "All Ads", slug: "all", icon: "receipt-outline" },
    { label: "Under Review", slug: "under-review", icon: "time-outline" },
    { label: "Active", slug: "active", icon: "radio-button-on-outline" },
    { label: "Paused", slug: "paused", icon: "pause-circle-outline" },
    { label: "Completed", slug: "completed", icon: "checkmark-done-outline" },
    { label: "Cancelled", slug: "cancelled", icon: "close-circle-outline" },
];

const VALID_STATUSES: AdStatus[] = ["Under Review", "Active", "Paused", "Completed", "Cancelled"];

function normalizeStatus(status: unknown): AdStatus {
    return VALID_STATUSES.includes(status as AdStatus) ? (status as AdStatus) : "Under Review";
}

function getInitialFilter(): StatusFilter {
    if (typeof window === "undefined") return "All Ads";
    const statusSlug = new URLSearchParams(window.location.search).get("status") || "all";
    return STATUS_FILTERS.find((filter) => filter.slug === statusSlug)?.label || "All Ads";
}

function normalizeApiAds(input: any[]) {
    return input
        .map((data): AdHistoryRow => ({
            adId: typeof data.adId === "string" ? data.adId.slice(-10) : "",
            campaignType: typeof data.campaignType === "string" ? data.campaignType : "Ad Campaign",
            createdAt: typeof data.createdAt === "string" ? data.createdAt : new Date().toISOString(),
            ownerKey: typeof data.ownerKey === "string" ? data.ownerKey : undefined,
            status: normalizeStatus(data.status),
            budget: typeof data.budget === "number" ? data.budget : Number(data.budget || 0),
            durationDays: typeof data.durationDays === "number" ? data.durationDays : Number(data.durationDays || 0),
            title: typeof data.title === "string" ? data.title : undefined,
            description: typeof data.description === "string" ? data.description : undefined,
            mediaPreview: typeof data.mediaPreview === "string" ? data.mediaPreview : undefined,
            mediaGallery: Array.isArray(data.mediaGallery)
                ? data.mediaGallery.filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0)
                : Array.isArray(data.editDraft?.mediaGallery)
                    ? data.editDraft.mediaGallery.filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0)
                : [],
            mediaType: ["image", "video", "link", ""].includes(data.mediaType) ? data.mediaType : "",
            genderTarget: typeof data.genderTarget === "string" ? data.genderTarget : undefined,
            ageMin: typeof data.ageMin === "number" ? data.ageMin : Number.isFinite(Number(data.ageMin)) ? Number(data.ageMin) : undefined,
            ageMax: typeof data.ageMax === "number" ? data.ageMax : Number.isFinite(Number(data.ageMax)) ? Number(data.ageMax) : undefined,
            reach: typeof data.reach === "number" ? data.reach : Number(data.reach || 0),
            impressions: typeof data.impressions === "number" ? data.impressions : Number(data.impressions || 0),
            clicks: typeof data.clicks === "number" ? data.clicks : Number(data.clicks || 0),
            spend: typeof data.spend === "number" ? data.spend : Number(data.spend || 0),
            remainingBudget: typeof data.remainingBudget === "number" ? data.remainingBudget : Number(data.remainingBudget || 0),
            campaignPath: typeof data.campaignPath === "string" ? data.campaignPath : "/dashboard/ad-campaign/photo-video",
            editDraft: data.editDraft && typeof data.editDraft === "object" ? data.editDraft : undefined,
        }))
        .sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime());
}

function getAdGallery(ad: AdHistoryRow) {
    const gallery = (ad.mediaGallery || []).filter((value) => typeof value === "string" && value.trim().length > 0);
    if (gallery.length > 0) return gallery;
    if (ad.mediaPreview) return [ad.mediaPreview];
    return [];
}

function getPrimaryMedia(ad: AdHistoryRow) {
    return getAdGallery(ad)[0] || ad.mediaPreview || "";
}

function formatDateTime(value: string) {
    const parsedDate = new Date(value);
    const dateLabel = parsedDate.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
    const timeLabel = parsedDate.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
    });
    return `${dateLabel} • ${timeLabel}`;
}

function formatCurrency(value?: number) {
    return `R ${Number(value || 0).toLocaleString()}`;
}

function formatReachCount(value: number) {
    return Number(value || 0).toLocaleString();
}

function cleanAdText(value?: string) {
    if (!value) return "";
    const normalized = value.trim();
    if (!normalized) return "";
    if (normalized.toLowerCase() === "no link added yet") return "";
    return normalized;
}

function getAgeLabel(ad: AdHistoryRow) {
    if (typeof ad.ageMin === "number" && typeof ad.ageMax === "number") return `${ad.ageMin}-${ad.ageMax}`;
    return "All";
}

function getTitle(ad: AdHistoryRow) {
    return cleanAdText(ad.title) || cleanAdText(ad.description) || ad.campaignType;
}

function getEstimatedReachLabel(ad: AdHistoryRow) {
    const budget = Number(ad.budget || 0);
    const minReach = Math.round((budget / 100) * 300);
    const maxReach = Math.round((budget / 100) * 500);
    return `${formatReachCount(minReach)} - ${formatReachCount(maxReach)}`;
}

function getLocationLabel(ad: AdHistoryRow) {
    const rawLocations = ad.editDraft && typeof ad.editDraft === "object" && Array.isArray((ad.editDraft as { selectedLocationCodes?: unknown[] }).selectedLocationCodes)
        ? ((ad.editDraft as { selectedLocationCodes?: unknown[] }).selectedLocationCodes || []).filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        : [];

    if (rawLocations.length === 0) return "No location";
    if (rawLocations.length <= 2) return rawLocations.join(", ");
    return `${rawLocations.slice(0, 2).join(", ")} +${rawLocations.length - 2}`;
}

function getStatusClasses(status: AdStatus) {
    if (status === "Under Review") return "border-amber-400/25 bg-amber-400/10 text-amber-200";
    if (status === "Active") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
    if (status === "Paused") return "border-sky-400/25 bg-sky-400/10 text-sky-200";
    if (status === "Completed") return "border-violet-400/25 bg-violet-400/10 text-violet-200";
    return "border-rose-400/25 bg-rose-400/10 text-rose-200";
}

export default function AdCenterPage() {
    const router = useRouter();
    const [ads, setAds] = useState<AdHistoryRow[]>([]);
    const [activeFilter, setActiveFilter] = useState<StatusFilter>("All Ads");
    const [selectedAd, setSelectedAd] = useState<AdHistoryRow | null>(null);
    const [cancelTarget, setCancelTarget] = useState<AdHistoryRow | null>(null);
    const [currentPage, setCurrentPage] = useState(1);

    useEffect(() => {
        const refreshAds = async () => {
            try {
                const nextAds = await adsService.getMyAds();
                setAds(normalizeApiAds(nextAds));
            } catch (error) {
                console.error("Failed to fetch ads:", error);
                setAds([]);
            }
        };
        const syncFilter = () => setActiveFilter(getInitialFilter());

        refreshAds();
        syncFilter();
        window.addEventListener("storage", refreshAds);
        window.addEventListener("googer-ad-history-updated", refreshAds);
        window.addEventListener("focus", refreshAds);
        document.addEventListener("visibilitychange", refreshAds);
        window.addEventListener("popstate", syncFilter);

        return () => {
            window.removeEventListener("storage", refreshAds);
            window.removeEventListener("googer-ad-history-updated", refreshAds);
            window.removeEventListener("focus", refreshAds);
            document.removeEventListener("visibilitychange", refreshAds);
            window.removeEventListener("popstate", syncFilter);
        };
    }, []);

    const filteredAds = activeFilter === "All Ads" ? ads : ads.filter((ad) => ad.status === activeFilter);
    const totalPages = Math.max(1, Math.ceil(filteredAds.length / ADS_PER_PAGE));
    const paginatedAds = filteredAds.slice((currentPage - 1) * ADS_PER_PAGE, currentPage * ADS_PER_PAGE);

    useEffect(() => {
        setCurrentPage(1);
    }, [activeFilter]);

    useEffect(() => {
        setCurrentPage((page) => Math.min(page, totalPages));
    }, [totalPages]);

    const counts = useMemo(
        () =>
            STATUS_FILTERS.reduce<Record<StatusFilter, number>>((result, filter) => {
                result[filter.label] = filter.label === "All Ads" ? ads.length : ads.filter((ad) => ad.status === filter.label).length;
                return result;
            }, {} as Record<StatusFilter, number>),
        [ads]
    );

    const openStatusPage = (filter: (typeof STATUS_FILTERS)[number]) => {
        setActiveFilter(filter.label);
        setCurrentPage(1);
        window.history.pushState(null, "", `/dashboard/wallet/ad-center?status=${filter.slug}`);
    };

    const handleCancel = async (adId: string) => {
        try {
            await adsService.updateAd(adId, { status: "Cancelled" });
            const nextAds = await adsService.getMyAds();
            setAds(normalizeApiAds(nextAds));
            window.dispatchEvent(new Event("googer-ad-history-updated"));
        } catch {
            return;
        }
    };

    const handlePause = async (adId: string) => {
        try {
            await adsService.updateAd(adId, { status: "Paused" });
            const nextAds = await adsService.getMyAds();
            setAds(normalizeApiAds(nextAds));
            window.dispatchEvent(new Event("googer-ad-history-updated"));
        } catch {
            return;
        }
    };

    const handleEdit = (ad: AdHistoryRow) => {
        if (ad.status !== "Under Review" || !ad.editDraft || !ad.campaignPath) return;
        const draftKey = `googer-ad-draft-${ad.campaignType.toLowerCase().replace(/\s+/g, "-")}`;
        window.localStorage.setItem(draftKey, JSON.stringify({
            version: 1,
            editingAdId: ad.adId,
            mediaPreview: ad.mediaPreview,
            mediaGallery: ad.mediaGallery || [],
            mediaType: ad.mediaType,
            ...ad.editDraft,
        }));
        router.push(ad.campaignPath);
    };

    return (
        <div className="min-h-screen pb-10">
            <div className="mb-4">
                <button
                    type="button"
                    onClick={() => router.push("/dashboard/wallet")}
                    className="flex items-center gap-2 text-white/60 transition-colors hover:text-white"
                >
                    <IonIcon name="chevron-back-outline" className="text-xl" />
                    <span className="text-[11px] font-bold uppercase tracking-widest">Back</span>
                </button>
            </div>

            <div className="mb-6">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/40">Ad Center</p>
                <h1 className="mt-1 text-2xl font-black text-white">Published Ads</h1>
            </div>

            <div className="mb-8 flex items-center gap-2">
                <button
                    className="md:hidden flex-shrink-0 w-8 h-8 flex items-center justify-center text-white bg-gray-800/40 hover:bg-gray-700/60 rounded-full border border-gray-700/50 transition-all active:scale-95 shadow-lg"
                    onClick={() => document.getElementById("adcenter-scroll")?.scrollBy({ left: -150, behavior: "smooth" })}
                >
                    <IonIcon name="chevron-back" className="text-lg" />
                </button>
                <div
                    id="adcenter-scroll"
                    className="flex-1 md:flex-none flex items-center gap-1.5 p-1 bg-white/5 rounded-2xl overflow-x-auto no-scrollbar border border-white/5 scroll-smooth"
                >
                    {STATUS_FILTERS.map((tab) => (
                        <button
                            key={tab.label}
                            onClick={() => openStatusPage(tab)}
                            className={`flex items-center justify-center gap-2 px-4 py-2 w-44 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                                activeFilter === tab.label ? "bg-white text-black shadow-lg shadow-white/5 scale-[1.02]" : "text-slate-500 hover:text-white hover:bg-white/5"
                            }`}
                        >
                            <IonIcon name={tab.icon} className="text-sm" />
                            {tab.label}
                            <span className={`inline-flex min-w-6 items-center justify-center rounded-full px-1.5 py-0.5 text-[9px] font-black ${activeFilter === tab.label ? "bg-black/10 text-black" : "bg-white/5 text-white/70"}`}>
                                {counts[tab.label] || 0}
                            </span>
                        </button>
                    ))}
                </div>
                <button
                    className="md:hidden flex-shrink-0 w-8 h-8 flex items-center justify-center text-white bg-gray-800/40 hover:bg-gray-700/60 rounded-full border border-gray-700/50 transition-all active:scale-95 shadow-lg"
                    onClick={() => document.getElementById("adcenter-scroll")?.scrollBy({ left: 150, behavior: "smooth" })}
                >
                    <IonIcon name="chevron-forward" className="text-lg" />
                </button>
            </div>

            <div className="space-y-5">
                {paginatedAds.length > 0 ? (
                    paginatedAds.map((ad) => {
                        return (
                            <article key={ad.adId} className="overflow-hidden rounded-[2rem] border border-white/8 bg-[#1a1614] shadow-[0_20px_50px_rgba(0,0,0,0.3)]">
                                <div className="flex items-start justify-between gap-4 border-b border-white/6 px-5 py-4 md:px-6">
                                    <div className="flex items-start gap-3">
                                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-white/50">
                                            <IonIcon name="megaphone-outline" className="text-lg" />
                                        </div>
                                        <div>
                                            <h2 className="text-[15px] font-black tracking-[0.04em] text-white">Ad ID: {ad.adId}</h2>
                                            <p className="mt-1 text-[9px] font-black uppercase tracking-[0.08em] text-white/35">
                                                {ad.campaignType} • {formatDateTime(ad.createdAt)}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-3">
                                        <div className="text-right">
                                            <p className="text-[8px] font-black uppercase tracking-[0.12em] text-white/28">Total Budget</p>
                                            <p className="mt-1 text-[1.35rem] font-black tracking-tight text-white">{formatCurrency(ad.budget)}</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedAd(ad)}
                                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/65 transition hover:bg-white/[0.08] hover:text-white"
                                        >
                                            <IonIcon name="eye-outline" className="text-base" />
                                        </button>
                                    </div>
                                </div>

                                <div className="px-5 py-4 md:px-6">
                                    <div className="grid gap-3 rounded-[1.5rem] border border-white/6 bg-[#121212] p-3 lg:grid-cols-[1.75fr_0.3fr]">
                                        <div className="flex items-center gap-4 min-w-0">
                                            <div className="relative h-16 w-16 overflow-hidden rounded-[1rem] bg-black/25 shrink-0">
                                                {ad.mediaType === "video" && getPrimaryMedia(ad) ? (
                                                    <video src={getPrimaryMedia(ad)} className="h-full w-full object-cover" muted playsInline />
                                                ) : getPrimaryMedia(ad) ? (
                                                    <img src={getPrimaryMedia(ad)} alt={getTitle(ad)} className="h-full w-full object-cover" />
                                                ) : (
                                                    <div className="flex h-full w-full items-center justify-center text-white/30">
                                                        <IonIcon name={ad.mediaType === "video" ? "videocam-outline" : "image-outline"} className="text-3xl" />
                                                    </div>
                                                )}
                                            </div>

                                            <div className="min-w-0">
                                                <h3 className="truncate text-[0.95rem] font-black uppercase leading-none text-white">{getTitle(ad)}</h3>
                                                <p className="mt-2 line-clamp-2 text-[10px] font-semibold leading-4 text-white/58">{cleanAdText(ad.description) || "No description added."}</p>
                                                {ad.mediaType === "image" && getAdGallery(ad).length > 1 && (
                                                    <div className="mt-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                                                        {getAdGallery(ad).slice(1, 5).map((image, index) => (
                                                            <div key={`${ad.adId}-thumb-${index}`} className="relative h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black/25">
                                                                <img src={image} alt={`${getTitle(ad)} thumbnail ${index + 2}`} className="h-full w-full object-cover" />
                                                            </div>
                                                        ))}
                                                        {getAdGallery(ad).length > 5 && (
                                                            <div className="flex h-8 min-w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-1.5 text-[8px] font-black text-white/70">
                                                                +{getAdGallery(ad).length - 5}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                <div className="mt-1.5 flex items-center gap-1.5 text-[8px] font-black uppercase tracking-[0.08em] text-white/34">
                                                    <IonIcon name="location-outline" className="text-[11px]" />
                                                    <span className="truncate">{getLocationLabel(ad)}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-end gap-2 lg:flex-col lg:justify-center">
                                            {ad.status === "Under Review" ? (
                                                <button
                                                    type="button"
                                                    onClick={() => handleEdit(ad)}
                                                    className="inline-flex min-w-[76px] items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-[8px] font-black uppercase tracking-[0.08em] text-white/70 transition hover:bg-white/[0.09] hover:text-white"
                                                >
                                                    Edit
                                                </button>
                                            ) : ad.status === "Active" ? (
                                                <button
                                                    type="button"
                                                    onClick={() => handlePause(ad.adId)}
                                                    className="inline-flex min-w-[76px] items-center justify-center rounded-xl border border-sky-400/20 bg-sky-400/10 px-3 py-2 text-[8px] font-black uppercase tracking-[0.08em] text-sky-100 transition hover:bg-sky-400/16 hover:text-white"
                                                >
                                                    Pause
                                                </button>
                                            ) : null}
                                            <button
                                                type="button"
                                                onClick={() => setCancelTarget(ad)}
                                                className="inline-flex min-w-[76px] items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-[8px] font-black uppercase tracking-[0.08em] text-white/70 transition hover:bg-white/[0.09] hover:text-white"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>

                                    <div className="mt-3 grid gap-2 lg:grid-cols-[1.15fr_0.85fr_0.85fr]">
                                        <div className="rounded-[0.95rem] border border-white/8 bg-[#0b0b0b] p-2">
                                            <p className="text-[8px] font-black uppercase tracking-[0.1em] text-white/38">Order Summary</p>
                                            <div className="mt-2 grid gap-1 text-[9px] font-black text-white">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-white/55">Total Budget</span>
                                                    <span>Rupieer {Number(ad.budget || 0).toLocaleString()}</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-white/55">Duration</span>
                                                    <span>{ad.durationDays || 0} {ad.durationDays === 1 ? "day" : "days"}</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-white/55">Age</span>
                                                    <span>{getAgeLabel(ad)}</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-white/55">Gender</span>
                                                    <span>{ad.genderTarget || "All"}</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-2 border-t border-white/8 pt-1">
                                                    <span className="text-white/55">Estimated Reach</span>
                                                    <span>{getEstimatedReachLabel(ad)}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="rounded-[0.95rem] border border-white/8 bg-[#0b0b0b] p-2">
                                            <p className="text-[8px] font-black uppercase tracking-[0.1em] text-white/38">Ad Performance</p>
                                            <div className="mt-2 grid gap-1 text-[9px] font-black text-white">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-white/55">Reach</span>
                                                    <span>{ad.reach || 0}</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-white/55">Impressions</span>
                                                    <span>{ad.impressions || 0}</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-white/55">Clicks</span>
                                                    <span>{ad.clicks || 0}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="rounded-[0.95rem] border border-white/8 bg-[#0b0b0b] p-2">
                                            <p className="text-[8px] font-black uppercase tracking-[0.1em] text-white/38">Budget</p>
                                            <div className="mt-2 grid gap-1 text-[9px] font-black text-white">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-white/55">Budget</span>
                                                    <span>{formatCurrency(ad.budget)}</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-white/55">Spend</span>
                                                    <span>{formatCurrency(ad.spend)}</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-white/55">Remaining</span>
                                                    <span>{formatCurrency(ad.remainingBudget)}</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-2 border-t border-white/8 pt-1">
                                                    <span className="text-white/55">Status</span>
                                                    <span className={`rounded-full border px-2 py-0.5 text-[8px] uppercase tracking-[0.08em] ${getStatusClasses(ad.status)}`}>{ad.status}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                            </article>
                        );
                    })
                ) : (
                    <div className="rounded-[2rem] border border-dashed border-white/10 bg-[#070707] px-6 py-20 text-center">
                        <IonIcon name="megaphone-outline" className="mx-auto mb-4 text-5xl text-white/15" />
                        <p className="text-[12px] font-black uppercase tracking-[0.18em] text-white/34">No ads in this section</p>
                    </div>
                )}
            </div>

            {filteredAds.length > ADS_PER_PAGE && (
                <div className="mt-6 flex items-center justify-center gap-3">
                    <button
                        type="button"
                        onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                        disabled={currentPage === 1}
                        className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-4 text-[9px] font-black uppercase tracking-[0.08em] text-white/70 transition hover:bg-white/[0.09] hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                    >
                        Previous
                    </button>
                    <div className="text-[10px] font-black uppercase tracking-[0.1em] text-white/45">
                        Page {currentPage} / {totalPages}
                    </div>
                    <button
                        type="button"
                        onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                        disabled={currentPage === totalPages}
                        className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-4 text-[9px] font-black uppercase tracking-[0.08em] text-white/70 transition hover:bg-white/[0.09] hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                    >
                        Next
                    </button>
                </div>
            )}

            {selectedAd && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4">
                    <button
                        type="button"
                        onClick={() => setSelectedAd(null)}
                        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
                        aria-label="Close ad summary"
                    />
                    <div className="relative z-[121] flex max-h-[82vh] w-full max-w-[520px] flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#121212] shadow-[0_30px_90px_rgba(0,0,0,0.55)]">
                        <div className="flex items-start justify-between border-b border-white/6 px-4 py-4 sm:px-5">
                            <div>
                                <h2 className="text-[1.35rem] font-black uppercase tracking-[0.04em] text-white">Ad Summary</h2>
                                <p className="mt-1 text-[9px] font-black uppercase tracking-[0.12em] text-white/30">Ad ID: {selectedAd.adId}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedAd(null)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.06] text-white/45 transition hover:bg-white/[0.1] hover:text-white"
                            >
                                <IonIcon name="close-outline" className="text-lg" />
                            </button>
                        </div>

                        <div className="space-y-5 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-white/28">Purchased Ad</p>
                                <div className="mt-3 rounded-[1.35rem] border border-white/8 bg-white/[0.04] p-3">
                                    <div className="flex items-start gap-3">
                                        <div className="shrink-0">
                                        <div className="relative h-14 w-14 overflow-hidden rounded-[0.9rem] bg-black/25 sm:h-16 sm:w-16">
                                            {selectedAd.mediaType === "video" && getPrimaryMedia(selectedAd) ? (
                                                <video src={getPrimaryMedia(selectedAd)} className="h-full w-full object-cover" muted playsInline />
                                            ) : getPrimaryMedia(selectedAd) ? (
                                                <img src={getPrimaryMedia(selectedAd)} alt={getTitle(selectedAd)} className="h-full w-full object-cover" />
                                            ) : (
                                                <div className="flex h-full w-full items-center justify-center text-white/30">
                                                    <IonIcon name={selectedAd.mediaType === "video" ? "videocam-outline" : "image-outline"} className="text-3xl" />
                                                </div>
                                            )}
                                        </div>
                                        {selectedAd.mediaType === "image" && getAdGallery(selectedAd).length > 1 && (
                                            <div className="mt-2 flex max-w-[220px] items-center gap-1.5 overflow-x-auto no-scrollbar">
                                                {getAdGallery(selectedAd).slice(1).map((image, index) => (
                                                    <div key={`${selectedAd.adId}-modal-thumb-${index}`} className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black/25">
                                                        <img src={image} alt={`${getTitle(selectedAd)} thumbnail ${index + 2}`} className="h-full w-full object-cover" />
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <h3 className="truncate text-[0.9rem] font-black uppercase text-white sm:text-[1rem]">{getTitle(selectedAd)}</h3>
                                            <p className="mt-1 text-[10px] font-bold text-white/45">{cleanAdText(selectedAd.description) || "No description added."}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-black text-white sm:text-base">{formatCurrency(selectedAd.budget)}</p>
                                            <p className="mt-1 text-[9px] font-black text-white/35">+ {formatCurrency(0)} Delivery</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-white/28">Transaction Details</p>
                                <div className="mt-3 rounded-[1.35rem] border border-white/8 bg-white/[0.04] p-4">
                                    <div className="space-y-2 text-[10px] font-black sm:text-[11px]">
                                        <div className="flex items-center justify-between gap-4 text-white/68">
                                            <span>Total</span>
                                            <span className="text-white">{formatCurrency(selectedAd.budget)}</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-4 border-t border-white/6 pt-3 text-white/68">
                                            <span>Spend</span>
                                            <span className="text-white">{formatCurrency(selectedAd.spend)}</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-4 border-t border-white/6 pt-3 text-white/68">
                                            <span>Remaining</span>
                                            <span className="text-white">{formatCurrency(selectedAd.remainingBudget)}</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-4 border-t border-white/6 pt-3 text-white/68">
                                            <span>Duration</span>
                                            <span className="text-white">{selectedAd.durationDays || 0} {selectedAd.durationDays === 1 ? "day" : "days"}</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-4 border-t border-white/6 pt-3 text-white/68">
                                            <span>Age</span>
                                            <span className="text-white">{getAgeLabel(selectedAd)}</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-4 border-t border-white/6 pt-3 text-white/68">
                                            <span>Gender</span>
                                            <span className="text-white">{selectedAd.genderTarget || "All"}</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-4 border-t border-white/6 pt-3 text-white/68">
                                            <span>Reach</span>
                                            <span className="text-white">{selectedAd.reach || 0}</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-4 border-t border-white/6 pt-3 text-white/68">
                                            <span>Impressions</span>
                                            <span className="text-white">{selectedAd.impressions || 0}</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-4 border-t border-white/6 pt-3 text-white/68">
                                            <span>Clicks</span>
                                            <span className="text-white">{selectedAd.clicks || 0}</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-4 border-t border-white/6 pt-4">
                                            <span className="text-[0.82rem] uppercase tracking-[0.1em] text-white/35">Grand Total</span>
                                            <span className="text-[1.1rem] italic font-black text-white sm:text-[1.2rem]">{formatCurrency(selectedAd.budget)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {cancelTarget && (
                <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
                    <button
                        type="button"
                        onClick={() => setCancelTarget(null)}
                        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                        aria-label="Close cancel confirmation"
                    />
                    <div className="relative z-[131] w-full max-w-[360px] rounded-[1.5rem] border border-white/10 bg-[#121212] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.45)]">
                        <h3 className="text-[1rem] font-black uppercase tracking-[0.06em] text-white">Cancel Ad?</h3>
                        <p className="mt-2 text-[10px] font-bold leading-5 text-white/50">
                            This will change the ad status to cancelled.
                        </p>
                        <div className="mt-5 grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setCancelTarget(null)}
                                className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-[9px] font-black uppercase tracking-[0.08em] text-white/70 transition hover:bg-white/[0.09] hover:text-white"
                            >
                                Keep Ad
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    handleCancel(cancelTarget.adId);
                                    setCancelTarget(null);
                                }}
                                className="inline-flex h-10 items-center justify-center rounded-xl border border-rose-500/25 bg-rose-500/12 text-[9px] font-black uppercase tracking-[0.08em] text-rose-200 transition hover:bg-rose-500/18"
                            >
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
