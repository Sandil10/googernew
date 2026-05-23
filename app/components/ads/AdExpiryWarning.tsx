"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import IonIcon from "@/app/components/IonIcon";
import { adsService } from "@/services/adsService";
import { subscriptionService } from "@/services/subscriptionService";

const SESSION_KEY = "googer_expiry_warn_session";
const SHOWN_PREFIX = "googer_expiry_warn_shown";
const WARNING_LEAD_MS = 3 * 24 * 60 * 60 * 1000;

// One random ID per browser session (cleared on tab close / new login tab)
function getSessionId(): string {
    let sid = sessionStorage.getItem(SESSION_KEY);
    if (!sid) {
        sid = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        sessionStorage.setItem(SESSION_KEY, sid);
    }
    return sid;
}

function wasShownToday(sessionId: string, adId: string): boolean {
    const today = new Date().toISOString().slice(0, 10);
    return !!localStorage.getItem(`${SHOWN_PREFIX}_${sessionId}_${today}_${adId}`);
}

function markShownToday(sessionId: string, adId: string): void {
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem(`${SHOWN_PREFIX}_${sessionId}_${today}_${adId}`, "1");
}

function formatRemaining(ms: number) {
    if (ms >= 24 * 60 * 60 * 1000) {
        const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
        return `${days} ${days === 1 ? "day" : "days"}`;
    }
    if (ms >= 60 * 60 * 1000) {
        const hours = Math.ceil(ms / (60 * 60 * 1000));
        return `${hours} ${hours === 1 ? "hour" : "hours"}`;
    }
    const minutes = Math.max(1, Math.ceil(ms / (60 * 1000)));
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
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

function getFinalRawAdExpiryMs(ad: any, plan: any) {
    const candidates = [
        getPlanExpiryMs(plan),
        Number(ad.durationDays || ad.duration_days || 0) * 24 * 60 * 60 * 1000,
    ].filter((value) => Number.isFinite(value) && value > 0);
    return candidates.length ? Math.min(...candidates) : 0;
}

function isRawPhotoVideoAd(ad: any) {
    const campaignType = String(ad.campaignType || ad.campaign_type || "").trim().toLowerCase();
    const isPhotoVideo = campaignType === "photo and video" || campaignType === "photo & video";
    if (!isPhotoVideo || ad.status !== "Active") return false;

    const draft = ad.editDraft || ad.edit_draft || {};
    const activeLink = String(ad.active_link || ad.activeLink || draft.activeLink || draft.active_link || "").trim();
    if (activeLink) return false;

    const gallery = Array.isArray(ad.mediaGallery) ? ad.mediaGallery : Array.isArray(ad.media_gallery) ? ad.media_gallery : [];
    const media = String(ad.mediaPreview || ad.media_preview || gallery[0] || "").trim();
    if (!media) return false;
    return !/^https?:\/\//i.test(media) || /\/uploads?\//i.test(media);
}

export function AdExpiryWarning({ userId }: { userId?: string | number | null }) {
    const router = useRouter();
    const [show, setShow] = useState(false);
    const [mediaType, setMediaType] = useState<"photo" | "video">("photo");
    const [remainingLabel, setRemainingLabel] = useState("soon");

    useEffect(() => {
        if (!userId) return;
        let mounted = true;

        const check = async () => {
            try {
                const sessionId = getSessionId();

                const [plan, myAds] = await Promise.all([
                    subscriptionService.getMyPlan(),
                    adsService.getMyAds(),
                ]);

                if (!mounted) return;

                const warningAd = (myAds as any[]).find((ad) => {
                    if (!isRawPhotoVideoAd(ad)) return false;
                    const adId = String(ad.adId || ad.ad_id || "").replace(/^ad-/, "");
                    if (!adId || wasShownToday(sessionId, adId)) return false;
                    const refTime = ad.activeStartTime || ad.active_start_time || ad.startedAt || ad.started_at;
                    const refMs = new Date(refTime || "").getTime();
                    if (!Number.isFinite(refMs)) return false;

                    const expiryMs = getFinalRawAdExpiryMs(ad, plan);
                    if (expiryMs <= 0) return false;
                    const warningAtMs = Math.max(0, expiryMs - WARNING_LEAD_MS);
                    const elapsedMs = Date.now() - refMs;
                    return elapsedMs >= warningAtMs && elapsedMs < expiryMs;
                });

                if (warningAd) {
                    const adId = String(warningAd.adId || warningAd.ad_id || "").replace(/^ad-/, "");
                    const refTime = warningAd.activeStartTime || warningAd.active_start_time || warningAd.startedAt || warningAd.started_at;
                    const elapsedMs = Date.now() - new Date(refTime || "").getTime();
                    const expiryMs = getFinalRawAdExpiryMs(warningAd, plan);
                    const remainingMs = Math.max(0, expiryMs - elapsedMs);
                    const rawMediaType = String(warningAd.mediaType || warningAd.media_type || "").toLowerCase();
                    setMediaType(rawMediaType.includes("video") ? "video" : "photo");
                    setRemainingLabel(formatRemaining(remainingMs));
                    markShownToday(sessionId, adId);
                    setShow(true);
                }
            } catch {
                // non-critical
            }
        };

        void check();
        const interval = window.setInterval(check, 3000);
        return () => {
            mounted = false;
            window.clearInterval(interval);
        };
    }, [userId]);

    if (!show) return null;

    return (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="relative w-full max-w-sm rounded-[2rem] border border-white/10 bg-[#1a1614] p-6 shadow-[0_32px_80px_rgba(0,0,0,0.6)]">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400/10 border border-amber-400/20">
                    <IonIcon name="images-outline" className="text-xl text-amber-300" />
                </div>
                <h2 className="text-base font-black tracking-tight text-white">
                    Your {mediaType} will be removed in {remainingLabel}
                </h2>
                <p className="mt-2 text-[12px] leading-relaxed text-white/55">
                    Your {mediaType} ad is still active. Subscribe to a plan to keep it running longer.
                </p>
                <div className="mt-5 flex flex-col gap-2">
                    <button
                        type="button"
                        onClick={() => { setShow(false); router.push("/dashboard/wallet/subscription"); }}
                        className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-amber-400 text-[11px] font-black uppercase tracking-widest text-black transition hover:bg-amber-300 active:scale-[0.98]"
                    >
                        <IonIcon name="star-outline" className="text-sm" />
                        Get Subscription
                    </button>
                    <button
                        type="button"
                        onClick={() => setShow(false)}
                        className="flex h-10 w-full items-center justify-center rounded-xl text-[11px] font-black uppercase tracking-widest text-white/40 transition hover:text-white/70"
                    >
                        Dismiss
                    </button>
                </div>
            </div>
        </div>
    );
}
