"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import IonIcon from "@/app/components/IonIcon";
import { adsService } from "@/services/adsService";
import { AdAnalyticsModal } from "@/app/components/ads/AdAnalyticsModal";
import { subscriptionService } from "@/services/subscriptionService";

type AdStatus = "Under Review" | "Active" | "Paused" | "Removed" | "Completed" | "Expired" | "Cancelled";
type StatusFilter = "All Ads" | AdStatus;
const ADS_PER_PAGE = 5;
const WARNING_LEAD_MS = 3 * 24 * 60 * 60 * 1000;

type AdHistoryRow = {
    adId: string;
    displayAdId: string;
    campaignType: string;
    createdAt: string;
    publishedAt?: string | null;
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
    currentReach?: number;
    estimatedReachMin?: number | null;
    estimatedReachMax?: number | null;
    maxReachCap?: number | null;
    impressions?: number;
    clicks?: number;
    spend?: number;
    remainingBudget?: number;
    promoCode?: string | null;
    activeLink?: string;
    walletTransferId?: number | null;
    startedAt?: string | null;
    activeStartTime?: string | null;
    pausedAt?: string | null;
    lastResumedAt?: string | null;
    completedAt?: string | null;
    accumulatedActiveMs?: number;
    durationRemainingMs?: number;
    durationElapsedMs?: number;
    durationTotalMs?: number;
    campaignPath?: string;
    editDraft?: Record<string, unknown>;
};

const STATUS_FILTERS: Array<{ label: StatusFilter; slug: string; icon: string }> = [
    { label: "All Ads",      slug: "all",          icon: "receipt-outline" },
    { label: "Under Review", slug: "under-review",  icon: "time-outline" },
    { label: "Active",       slug: "active",        icon: "radio-button-on-outline" },
    { label: "Paused",       slug: "paused",        icon: "pause-circle-outline" },
    { label: "Removed",      slug: "removed",       icon: "eye-off-outline" },
    { label: "Completed",    slug: "completed",     icon: "checkmark-done-outline" },
    { label: "Cancelled",    slug: "cancelled",     icon: "close-circle-outline" },
];

const VALID_STATUSES: AdStatus[] = ["Under Review", "Active", "Paused", "Removed", "Completed", "Expired", "Cancelled"];


function supportsRemainingBudgetRefund(campaignType: string) {
    const normalized = campaignType.trim().toLowerCase();
    return normalized === "product promote"
        || normalized === "photo promote"
        || normalized === "video promote"
        || normalized === "photo and video"
        || normalized === "photo & video";
}

function getCampaignEditorPath(campaignType: string) {
    const normalized = campaignType.trim().toLowerCase();
    if (normalized === "product promote") return "/dashboard/ad-campaign/product-promote";
    if (normalized === "profile promote") return "/dashboard/ad-campaign/profile-promote";
    return "/dashboard/ad-campaign/photo-video";
}

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
            adId: typeof data.adId === "string" ? data.adId : "",
            displayAdId: typeof data.adId === "string" ? data.adId.slice(-10) : "",
            campaignType: typeof data.campaignType === "string" ? data.campaignType : "Ad Campaign",
            createdAt: typeof data.createdAt === "string" ? data.createdAt : new Date().toISOString(),
            publishedAt: typeof data.publishedAt === "string" ? data.publishedAt : (typeof data.published_at === "string" ? data.published_at : null),
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
            currentReach: typeof data.currentReach === "number" ? data.currentReach : Number(data.currentReach ?? data.current_reach ?? data.reach ?? 0),
            estimatedReachMin: Number.isFinite(Number(data.estimatedReachMin ?? data.estimated_reach_min)) ? Number(data.estimatedReachMin ?? data.estimated_reach_min) : null,
            estimatedReachMax: Number.isFinite(Number(data.estimatedReachMax ?? data.estimated_reach_max)) ? Number(data.estimatedReachMax ?? data.estimated_reach_max) : null,
            maxReachCap: Number.isFinite(Number(data.maxReachCap ?? data.max_reach_cap)) ? Number(data.maxReachCap ?? data.max_reach_cap) : null,
            impressions: typeof data.impressions === "number" ? data.impressions : Number(data.impressions || 0),
            clicks: typeof data.clicks === "number" ? data.clicks : Number(data.clicks || 0),
            spend: typeof data.spend === "number" ? data.spend : Number(data.spend || 0),
            remainingBudget: typeof data.remainingBudget === "number" ? data.remainingBudget : Number(data.remainingBudget || 0),
            promoCode: typeof data.promoCode === "string" ? data.promoCode : (typeof data.promo_code === "string" ? data.promo_code : null),
            activeLink: typeof data.active_link === "string" ? data.active_link : "",
            walletTransferId: data.walletTransferId ?? data.wallet_transfer_id ?? null,
            startedAt: typeof data.startedAt === "string" ? data.startedAt : (typeof data.started_at === "string" ? data.started_at : null),
            activeStartTime: typeof data.activeStartTime === "string" ? data.activeStartTime : (typeof data.active_start_time === "string" ? data.active_start_time : null),
            pausedAt: typeof data.pausedAt === "string" ? data.pausedAt : (typeof data.paused_at === "string" ? data.paused_at : null),
            lastResumedAt: typeof data.lastResumedAt === "string" ? data.lastResumedAt : (typeof data.last_resumed_at === "string" ? data.last_resumed_at : null),
            completedAt: typeof data.completedAt === "string" ? data.completedAt : (typeof data.completed_at === "string" ? data.completed_at : null),
            accumulatedActiveMs: typeof data.accumulatedActiveMs === "number" ? data.accumulatedActiveMs : Number(data.accumulatedActiveMs ?? data.accumulated_active_ms ?? 0),
            durationRemainingMs: typeof data.durationRemainingMs === "number" ? data.durationRemainingMs : Number(data.durationRemainingMs ?? data.duration_remaining_ms ?? 0),
            durationElapsedMs: typeof data.durationElapsedMs === "number" ? data.durationElapsedMs : Number(data.durationElapsedMs ?? data.duration_elapsed_ms ?? 0),
            durationTotalMs: typeof data.durationTotalMs === "number" ? data.durationTotalMs : Number(data.durationTotalMs ?? data.duration_total_ms ?? 0),
            campaignPath: typeof data.campaignPath === "string" && data.campaignPath.trim().length > 0
                ? data.campaignPath
                : getCampaignEditorPath(typeof data.campaignType === "string" ? data.campaignType : "Ad Campaign"),
            editDraft: data.editDraft && typeof data.editDraft === "object"
                ? data.editDraft
                : (data.edit_draft && typeof data.edit_draft === "object" ? data.edit_draft : {}),
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

function isRawPhotoVideoAd(ad: AdHistoryRow) {
    const campaignType = ad.campaignType.trim().toLowerCase();
    const isPhotoVideo = campaignType === "photo and video" || campaignType === "photo & video";
    if (!isPhotoVideo) return false;

    const activeLink = String(ad.activeLink || ad.editDraft?.activeLink || ad.editDraft?.active_link || "").trim();
    if (activeLink) return false;

    const primaryMedia = getPrimaryMedia(ad).trim();
    if (!primaryMedia) return false;
    return !/^https?:\/\//i.test(primaryMedia) || /\/uploads?\//i.test(primaryMedia);
}

function getPlanExpiryMs(plan: any) {
    const extra = plan?.extra || {};
    const value = Number(extra.ads_expiry_value ?? extra.ads_expiry_days ?? 0);
    if (!Number.isFinite(value) || value <= 0) return 0;
    const unit = String(extra.ads_expiry_unit || (extra.ads_expiry_days != null ? "days" : "days")).toLowerCase();
    if (unit === "minutes") return value * 60 * 1000;
    if (unit === "hours") return value * 60 * 60 * 1000;
    return value * 24 * 60 * 60 * 1000;
}

function getFinalRawAdExpiryMs(ad: AdHistoryRow, plan: any) {
    const candidates = [
        getPlanExpiryMs(plan),
        Number(ad.durationDays || 0) * 24 * 60 * 60 * 1000,
    ].filter((value) => Number.isFinite(value) && value > 0);
    return candidates.length ? Math.min(...candidates) : 0;
}

function formatDateTimeLabel(value: string) {
    const parsedDate = new Date(value);
    if (Number.isNaN(parsedDate.getTime())) return "Unknown time";
    const dateLabel = parsedDate.toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
    const timeLabel = parsedDate.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
    });
    return `${dateLabel}, ${timeLabel}`;
}

function formatRelativeDuration(ms: number) {
    const safeMs = Math.max(0, Math.floor(ms));
    const totalSeconds = Math.floor(safeMs / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
}

function getLiveDurationRemainingMs(ad: AdHistoryRow, nowMs: number) {
    const totalMs = Number(ad.durationTotalMs ?? (Number(ad.durationDays || 0) * 24 * 60 * 60 * 1000));
    if (totalMs <= 0) return 0;

    const baseElapsed = Math.max(0, Number(ad.accumulatedActiveMs || 0));
    const lastResumedMs = ad.lastResumedAt ? new Date(ad.lastResumedAt).getTime() : NaN;
    const liveElapsed = ad.status === "Active" && Number.isFinite(lastResumedMs)
        ? Math.max(0, nowMs - lastResumedMs)
        : 0;

    return Math.max(0, totalMs - Math.min(totalMs, baseElapsed + liveElapsed));
}

function getDurationStatusLabel(ad: AdHistoryRow, nowMs: number) {
    const totalDays = Number(ad.durationDays || 0);
    const totalMs = Number(ad.durationTotalMs ?? (totalDays * 24 * 60 * 60 * 1000));
    const remainingMs = getLiveDurationRemainingMs(ad, nowMs);

    if (totalMs <= 0 || totalDays <= 0) return `${totalDays} ${totalDays === 1 ? "day" : "days"}`;
    if (ad.status === "Under Review") return `${totalDays} ${totalDays === 1 ? "day" : "days"}`;
    if (ad.status === "Completed") return `0 of ${totalDays} ${totalDays === 1 ? "day" : "days"} left`;
    if (ad.status === "Expired") return `0 of ${totalDays} ${totalDays === 1 ? "day" : "days"} left`;
    return `${formatRelativeDuration(remainingMs)} left`;
}

function getAdStartTime(ad: AdHistoryRow) {
    return ad.activeStartTime || ad.startedAt || ad.publishedAt || ad.createdAt || null;
}

function getAdEndTime(ad: AdHistoryRow) {
    const start = getAdStartTime(ad);
    const durationMs = Number(ad.durationTotalMs ?? (Number(ad.durationDays || 0) * 24 * 60 * 60 * 1000));
    if (!start || durationMs <= 0) return null;

    const startMs = new Date(start).getTime();
    if (!Number.isFinite(startMs)) return null;
    return new Date(startMs + durationMs).toISOString();
}

function getAdRemainingTimeLabel(ad: AdHistoryRow, nowMs: number) {
    const remainingMs = getLiveDurationRemainingMs(ad, nowMs);
    if (ad.status === "Completed") return "Completed";
    if (ad.status === "Expired") return "Expired";
    if (ad.status === "Cancelled") return "Cancelled";
    if (ad.status === "Removed") return `${formatRelativeDuration(remainingMs)} left`;
    if (ad.status === "Under Review") return "Under Review";
    if (ad.status === "Paused") return `${formatRelativeDuration(remainingMs)} left`;
    return `${formatRelativeDuration(remainingMs)} left`;
}

function getPublishedTimeLabel(ad: AdHistoryRow, nowMs: number) {
    const label = ad.activeStartTime ? "Published" : "Created";
    const source = ad.activeStartTime || ad.publishedAt || ad.createdAt;
    if (!source) return `${label}: Unknown time`;

    const sourceMs = new Date(source).getTime();
    const elapsedMs = Number.isFinite(sourceMs) ? Math.max(0, nowMs - sourceMs) : 0;
    return `${label}: ${formatDateTimeLabel(source)} (${formatRelativeDuration(elapsedMs)} ago)`;
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

function isPromoFreeAd(ad: AdHistoryRow) {
    return !ad.walletTransferId;
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
    const minReach = Number(ad.estimatedReachMin || 0);
    const maxReach = Number(ad.estimatedReachMax || ad.maxReachCap || 0);
    if (minReach > 0 && maxReach > 0) return `${formatReachCount(minReach)} - ${formatReachCount(maxReach)}`;
    if (maxReach > 0) return formatReachCount(maxReach);

    const budget = Number(ad.budget || 0);
    const fallbackMinReach = Math.round((budget / 100) * 300);
    const fallbackMaxReach = Math.round((budget / 100) * 500);
    return `${formatReachCount(fallbackMinReach)} - ${formatReachCount(fallbackMaxReach)}`;
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
    if (status === "Removed") return "border-orange-400/25 bg-orange-400/10 text-orange-200";
    if (status === "Completed" || status === "Expired") return "border-violet-400/25 bg-violet-400/10 text-violet-200";
    return "border-rose-400/25 bg-rose-400/10 text-rose-200";
}

export default function AdCenterPage() {
    const router = useRouter();
    const [ads, setAds] = useState<AdHistoryRow[]>([]);
    const [activeFilter, setActiveFilter] = useState<StatusFilter>("All Ads");
    const [selectedAd, setSelectedAd] = useState<AdHistoryRow | null>(null);
    const [analyticsAd, setAnalyticsAd] = useState<AdHistoryRow | null>(null);
    const [cancelTarget, setCancelTarget] = useState<AdHistoryRow | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [actionError, setActionError] = useState<string | null>(null);
    const [actionErrorAdId, setActionErrorAdId] = useState<string | null>(null);
    const [nowMs, setNowMs] = useState(() => Date.now());
    const [showExpiryPopup, setShowExpiryPopup] = useState(false);
    const [expiryPopupDismissed, setExpiryPopupDismissed] = useState(false);
    const [expiryPopupMediaType, setExpiryPopupMediaType] = useState<"photo" | "video">("photo");
    const [expiryPopupRemainingLabel, setExpiryPopupRemainingLabel] = useState("soon");
    const shownAdIdsRef = useRef<Set<string>>(new Set());
    const adsRef = useRef<AdHistoryRow[]>([]);
    const planRef = useRef<any>(null);

    useEffect(() => {
        const timerId = window.setInterval(() => setNowMs(Date.now()), 1000);
        return () => window.clearInterval(timerId);
    }, []);

    useEffect(() => {
        const refreshAds = async () => {
            try {
                const nextAds = normalizeApiAds(await adsService.getMyAds());
                setAds(nextAds);
            } catch (error) {
                console.error("Failed to fetch ads:", error);
                setAds([]);
            }
        };
        const syncFilter = () => setActiveFilter(getInitialFilter());

        refreshAds();
        syncFilter();
        const intervalId = window.setInterval(() => {
            if (document.visibilityState !== "hidden") void refreshAds();
        }, 10000);
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
            window.clearInterval(intervalId);
        };
    }, []);

    // Keep adsRef current so the interval closure always reads latest ads
    useEffect(() => { adsRef.current = ads; }, [ads]);

    useEffect(() => {
        const loadPlan = async () => {
            try {
                planRef.current = await subscriptionService.getMyPlan();
            } catch {
                planRef.current = null;
            }
        };
        void loadPlan();
        window.addEventListener("subscription:changed", loadPlan);
        return () => window.removeEventListener("subscription:changed", loadPlan);
    }, []);

    // Real-time expiry popup — checks every 3 seconds
    useEffect(() => {
        const formatRemaining = (ms: number) => {
            if (ms >= 24 * 60 * 60 * 1000) { const d = Math.ceil(ms / (24*60*60*1000)); return `${d} ${d===1?"day":"days"}`; }
            if (ms >= 60 * 60 * 1000) { const h = Math.ceil(ms / (60*60*1000)); return `${h} ${h===1?"hour":"hours"}`; }
            if (ms >= 60 * 1000) { const m = Math.ceil(ms / (60*1000)); return `${m} ${m===1?"minute":"minutes"}`; }
            const s = Math.ceil(ms / 1000); return `${s} ${s===1?"second":"seconds"}`;
        };

        const check = () => {
            if (expiryPopupDismissed) return;
            const now = Date.now();
            for (const ad of adsRef.current) {
                if (!isRawPhotoVideoAd(ad)) continue;
                if (ad.status !== "Active") continue;
                if (shownAdIdsRef.current.has(ad.adId)) continue;
                const refTime = ad.activeStartTime || ad.startedAt;
                const refMs = new Date(refTime || "").getTime();
                if (!Number.isFinite(refMs)) continue;
                const expiryMs = getFinalRawAdExpiryMs(ad, planRef.current);
                if (expiryMs <= 0) continue;
                const triggerMs = Math.max(0, expiryMs - WARNING_LEAD_MS);
                const elapsed = now - refMs;
                if (elapsed >= triggerMs && elapsed < expiryMs) {
                    shownAdIdsRef.current.add(ad.adId);
                    const remaining = Math.max(0, expiryMs - elapsed);
                    setExpiryPopupMediaType(ad.mediaType === "video" ? "video" : "photo");
                    setExpiryPopupRemainingLabel(remaining > 0 ? formatRemaining(remaining) : "soon");
                    setShowExpiryPopup(true);
                    break;
                }
            }
        };

        check();
        const id = window.setInterval(check, 3000);
        return () => window.clearInterval(id);
    }, [expiryPopupDismissed]);

    const filteredAds = activeFilter === "All Ads" ? ads : ads.filter((ad) => ad.status === activeFilter);
    const totalPages = Math.max(1, Math.ceil(filteredAds.length / ADS_PER_PAGE));
    const paginatedAds = filteredAds.slice((currentPage - 1) * ADS_PER_PAGE, currentPage * ADS_PER_PAGE);

    useEffect(() => {
        setCurrentPage(1);
    }, [activeFilter]);

    useEffect(() => {
        setCurrentPage((page) => Math.min(page, totalPages));
    }, [totalPages]);

    useEffect(() => {
        if (!selectedAd) return;
        const refreshedAd = ads.find((ad) => ad.adId === selectedAd.adId);
        setSelectedAd(refreshedAd || null);
    }, [ads, selectedAd]);

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

    const handleCancel = async (ad: AdHistoryRow) => {
        try {
            const nextStatus: AdStatus = ["Active", "Paused"].includes(ad.status)
                ? "Removed"
                : "Cancelled";
            await adsService.updateAd(ad.adId, { status: nextStatus });
            const nextAds = await adsService.getMyAds();
            setAds(normalizeApiAds(nextAds));
            window.dispatchEvent(new Event("googer-wallet-updated"));
            window.dispatchEvent(new Event("googer-ad-history-updated"));
            setActionError(null);
            return true;
        } catch (error: any) {
            setActionError(error?.message || "Failed to update ad.");
            return false;
        }
    };

    const handlePause = async (adId: string) => {
        setActionError(null);
        setActionErrorAdId(null);
        try {
            await adsService.updateAd(adId, { status: "Paused" });
            const nextAds = await adsService.getMyAds();
            setAds(normalizeApiAds(nextAds));
            window.dispatchEvent(new Event("googer-ad-history-updated"));
        } catch (error: any) {
            setActionError(error?.message || "Failed to pause ad.");
            setActionErrorAdId(adId);
        }
    };

    const handleResume = async (adId: string) => {
        setActionError(null);
        setActionErrorAdId(null);
        try {
            await adsService.updateAd(adId, { status: "Active" });
            const nextAds = await adsService.getMyAds();
            setAds(normalizeApiAds(nextAds));
            window.dispatchEvent(new Event("googer-ad-history-updated"));
        } catch (error: any) {
            setActionError(error?.message || "Failed to resume ad.");
            setActionErrorAdId(adId);
        }
    };

    return (
        <>
        {showExpiryPopup && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                <div className="relative w-full max-w-sm rounded-[2rem] border border-white/10 bg-[#1a1614] p-6 shadow-[0_32px_80px_rgba(0,0,0,0.6)]">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400/10 border border-amber-400/20">
                        <IonIcon name="images-outline" className="text-xl text-amber-300" />
                    </div>
                    <h2 className="text-base font-black tracking-tight text-white">
                        Your {expiryPopupMediaType} will be removed in {expiryPopupRemainingLabel}
                    </h2>
                    <p className="mt-2 text-[12px] leading-relaxed text-white/55">
                        Your {expiryPopupMediaType} ad will be removed from the feed in {expiryPopupRemainingLabel}. Subscribe to a plan to keep it on your profile.
                    </p>
                    <div className="mt-5 flex flex-col gap-2">
                        <button
                            type="button"
                            onClick={() => { setShowExpiryPopup(false); router.push("/dashboard/wallet/subscription"); }}
                            className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-amber-400 text-[11px] font-black uppercase tracking-widest text-black transition hover:bg-amber-300 active:scale-[0.98]"
                        >
                            <IonIcon name="star-outline" className="text-sm" />
                            Get Subscription
                        </button>
                        <button
                            type="button"
                            onClick={() => { setShowExpiryPopup(false); setExpiryPopupDismissed(true); }}
                            className="flex h-10 w-full items-center justify-center rounded-xl text-[11px] font-black uppercase tracking-widest text-white/40 transition hover:text-white/70"
                        >
                            Dismiss
                        </button>
                    </div>
                </div>
            </div>
        )}
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
                                            <h2 className="text-[15px] font-black tracking-[0.04em] text-white">Ad ID: {ad.displayAdId}</h2>
                                            <p className="mt-1 text-[9px] font-black uppercase tracking-[0.08em] text-white/35">
                                                {ad.campaignType} - {getPublishedTimeLabel(ad, nowMs)}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-3">
                                        <div className="text-right">
                                            <p className="text-[8px] font-black uppercase tracking-[0.12em] text-white/28">Total Budget</p>
                                            <p className="mt-1 text-[1.35rem] font-black tracking-tight text-white">{isPromoFreeAd(ad) ? "Free" : formatCurrency(ad.budget)}</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setAnalyticsAd(ad)}
                                            title="Analytics"
                                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-violet-500/20 bg-violet-500/[0.08] text-violet-300/70 transition hover:bg-violet-500/[0.15] hover:text-violet-200"
                                        >
                                            <IonIcon name="stats-chart" className="text-base" />
                                        </button>
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
                                            {ad.status === "Active" ? (
                                                <button
                                                    type="button"
                                                    onClick={() => handlePause(ad.adId)}
                                                    className="inline-flex min-w-[76px] items-center justify-center rounded-xl border border-sky-400/20 bg-sky-400/10 px-3 py-2 text-[8px] font-black uppercase tracking-[0.08em] text-sky-100 transition hover:bg-sky-400/16 hover:text-white"
                                                >
                                                    Pause
                                                </button>
                                            ) : ad.status === "Paused" ? (
                                                <button
                                                    type="button"
                                                    onClick={() => handleResume(ad.adId)}
                                                    className="inline-flex min-w-[76px] items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-[8px] font-black uppercase tracking-[0.08em] text-emerald-100 transition hover:bg-emerald-400/16 hover:text-white"
                                                >
                                                    Resume
                                                </button>
                                            ) : null}
                                            {(["Under Review", "Active", "Paused"] as AdStatus[]).includes(ad.status) && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setActionError(null);
                                                        setActionErrorAdId(null);
                                                        setCancelTarget(ad);
                                                    }}
                                                    className="inline-flex min-w-[76px] items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-[8px] font-black uppercase tracking-[0.08em] text-white/70 transition hover:bg-white/[0.09] hover:text-white"
                                                >
                                                    {["Active", "Paused"].includes(ad.status) ? "Remove" : "Cancel"}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    {actionError && (cancelTarget?.adId === ad.adId || actionErrorAdId === ad.adId) && (
                                        <div className="mt-3 rounded-[0.95rem] border border-rose-400/16 bg-rose-500/8 px-3 py-2 text-[9px] font-bold leading-4 text-rose-100/85">
                                            {actionError}
                                        </div>
                                    )}

                                    <div className="mt-3 grid gap-2 lg:grid-cols-[1.15fr_0.85fr_0.85fr]">
                                        <div className="rounded-[0.95rem] border border-white/8 bg-[#0b0b0b] p-2">
                                            <p className="text-[8px] font-black uppercase tracking-[0.1em] text-white/38">Order Summary</p>
                                            <div className="mt-2 grid gap-1 text-[9px] font-black text-white">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-white/55">Total Budget</span>
                                                    <span>{isPromoFreeAd(ad) ? "Free" : formatCurrency(ad.budget)}</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-white/55">Duration</span>
                                                    <span>{getDurationStatusLabel(ad, nowMs)}</span>
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
                                                    <span className="text-white/55">Start</span>
                                                    <span>{getAdStartTime(ad) ? formatDateTimeLabel(getAdStartTime(ad) || "") : "Not started"}</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-white/55">End</span>
                                                    <span>{getAdEndTime(ad) ? formatDateTimeLabel(getAdEndTime(ad) || "") : "Not set"}</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-white/55">Remaining</span>
                                                    <span>{getAdRemainingTimeLabel(ad, nowMs)}</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-white/55">Reach</span>
                                                    <span>{formatReachCount(ad.currentReach ?? ad.reach ?? 0)}</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-white/55">Impressions</span>
                                                    <span>{formatReachCount(ad.impressions || 0)}</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-white/55">Clicks</span>
                                                    <span>{formatReachCount(ad.clicks || 0)}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="rounded-[0.95rem] border border-white/8 bg-[#0b0b0b] p-2">
                                            <p className="text-[8px] font-black uppercase tracking-[0.1em] text-white/38">Budget</p>
                                            <div className="mt-2 grid gap-1 text-[9px] font-black text-white">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-white/55">Budget</span>
                                                    <span>{isPromoFreeAd(ad) ? "Free" : formatCurrency(ad.budget)}</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-white/55">Spend</span>
                                                    <span>{formatCurrency(ad.spend)}</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-white/55">Remaining</span>
                                                    <span>{isPromoFreeAd(ad) ? "Free" : formatCurrency(ad.remainingBudget)}</span>
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

            {analyticsAd && (
                <AdAnalyticsModal
                    adId={analyticsAd.adId}
                    adTitle={analyticsAd.title}
                    campaignType={analyticsAd.campaignType}
                    onClose={() => setAnalyticsAd(null)}
                />
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
                                <p className="mt-1 text-[9px] font-black uppercase tracking-[0.12em] text-white/30">Ad ID: {selectedAd.displayAdId}</p>
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
                                            <p className="text-sm font-black text-white sm:text-base">{isPromoFreeAd(selectedAd) ? "Free" : formatCurrency(selectedAd.budget)}</p>
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
                                            <span className="text-white">{isPromoFreeAd(selectedAd) ? "Free" : formatCurrency(selectedAd.budget)}</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-4 border-t border-white/6 pt-3 text-white/68">
                                            <span>Spend</span>
                                            <span className="text-white">{formatCurrency(selectedAd.spend)}</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-4 border-t border-white/6 pt-3 text-white/68">
                                            <span>Remaining</span>
                                            <span className="text-white">{isPromoFreeAd(selectedAd) ? "Free" : formatCurrency(selectedAd.remainingBudget)}</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-4 border-t border-white/6 pt-3 text-white/68">
                                            <span>Duration</span>
                                            <span className="text-white">{getDurationStatusLabel(selectedAd, nowMs)}</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-4 border-t border-white/6 pt-3 text-white/68">
                                            <span>Start</span>
                                            <span className="text-white">{getAdStartTime(selectedAd) ? formatDateTimeLabel(getAdStartTime(selectedAd) || "") : "Not started"}</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-4 border-t border-white/6 pt-3 text-white/68">
                                            <span>End</span>
                                            <span className="text-white">{getAdEndTime(selectedAd) ? formatDateTimeLabel(getAdEndTime(selectedAd) || "") : "Not set"}</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-4 border-t border-white/6 pt-3 text-white/68">
                                            <span>Remaining</span>
                                            <span className="text-white">{getAdRemainingTimeLabel(selectedAd, nowMs)}</span>
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
                                            <span className="text-[1.1rem] italic font-black text-white sm:text-[1.2rem]">{isPromoFreeAd(selectedAd) ? "Free" : formatCurrency(selectedAd.budget)}</span>
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
                        <h3 className="text-[1rem] font-black uppercase tracking-[0.06em] text-white">
                            {["Active", "Paused"].includes(cancelTarget.status) ? "Remove From Feeds?" : "Cancel Ad?"}
                        </h3>
                        <p className="mt-2 text-[10px] font-bold leading-5 text-white/50">
                            {["Active", "Paused"].includes(cancelTarget.status)
                                ? "This will remove the ad from Home and Shop feeds only. It will stay visible in your Profile Googer section until its real expiry date."
                                : cancelTarget.status === "Under Review"
                                ? "This will cancel your ad while it is still under review. Your payment will be automatically refunded."
                                : supportsRemainingBudgetRefund(cancelTarget.campaignType)
                                    ? "This will cancel your active ad and refund only the current remaining budget amount."
                                    : "This will cancel your ad immediately. Because this ad is no longer under review, no refund will be given."}
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
                                onClick={async () => {
                                    const didCancel = await handleCancel(cancelTarget);
                                    if (didCancel) {
                                        setCancelTarget(null);
                                    }
                                }}
                                className="inline-flex h-10 items-center justify-center rounded-xl border border-rose-500/25 bg-rose-500/12 text-[9px] font-black uppercase tracking-[0.08em] text-rose-200 transition hover:bg-rose-500/18"
                            >
                                Confirm
                            </button>
                        </div>
                        {actionError && (
                            <p className="mt-3 text-[10px] font-bold leading-5 text-rose-200/90">
                                {actionError}
                            </p>
                        )}
                    </div>
                </div>
            )}
        </div>
        </>
    );
}
