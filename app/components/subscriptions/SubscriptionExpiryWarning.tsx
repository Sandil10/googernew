"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import IonIcon from "@/app/components/IonIcon";
import { subscriptionService, type UserSubscription } from "@/services/subscriptionService";

const SESSION_KEY = "googer_subscription_warn_session";
const SHOWN_PREFIX = "googer_subscription_warn_shown";

function getSessionId(): string {
    let sid = sessionStorage.getItem(SESSION_KEY);
    if (!sid) {
        sid = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        sessionStorage.setItem(SESSION_KEY, sid);
    }
    return sid;
}

type WarningReason = "renew_off" | "insufficient_balance" | "grace";

function getWarningKey(sub: UserSubscription, reason: WarningReason): string {
    const phase = sub.in_grace_period ? "grace" : "expiry";
    return `${reason}_${phase}_${sub.id}_${sub.started_at || ""}_${sub.expires_at || ""}_${sub.grace_ends_at || ""}`;
}

function wasShownThisSession(sessionId: string, warningKey: string): boolean {
    return !!sessionStorage.getItem(`${SHOWN_PREFIX}_${sessionId}_${warningKey}`);
}

function markShownThisSession(sessionId: string, warningKey: string): void {
    sessionStorage.setItem(`${SHOWN_PREFIX}_${sessionId}_${warningKey}`, "1");
}

function formatRemainingDays(ms: number) {
    const days = Math.max(0, Math.ceil(ms / 86400000));
    return `${days} ${days === 1 ? "day" : "days"}`;
}

export function SubscriptionExpiryWarning({ userId }: { userId?: string | number | null }) {
    const router = useRouter();
    const [show, setShow] = useState(false);
    const [planName, setPlanName] = useState("subscription");
    const [remainingLabel, setRemainingLabel] = useState("soon");
    const [warningReason, setWarningReason] = useState<WarningReason>("renew_off");

    useEffect(() => {
        if (!userId) return;
        let mounted = true;

        const check = async () => {
            try {
                const sub = await subscriptionService.getMySubscription();
                if (!mounted || !sub) return;
                const planPrice = Number(sub.price_paid || 0);
                if (sub.plan_slug === "basic" || planPrice <= 0) return;
                if (!sub.expires_at) return;

                const expiresMs = new Date(sub.expires_at).getTime();
                if (!Number.isFinite(expiresMs)) return;

                const graceEndsMs = sub.grace_ends_at ? new Date(sub.grace_ends_at).getTime() : NaN;
                const now = Date.now();
                const isInGrace = !!sub.in_grace_period && Number.isFinite(graceEndsMs) && graceEndsMs > now;
                const graceRemainingMs = isInGrace ? graceEndsMs - now : 0;
                const reason: WarningReason = "grace";

                if (!isInGrace) return;

                const sessionId = getSessionId();
                const warningKey = getWarningKey(sub, reason);
                if (wasShownThisSession(sessionId, warningKey)) return;

                setPlanName(sub.plan_name || "subscription");
                setWarningReason(reason);
                setRemainingLabel(formatRemainingDays(graceRemainingMs));
                markShownThisSession(sessionId, warningKey);
                setShow(true);
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
                    <IonIcon name="card-outline" className="text-xl text-amber-300" />
                </div>
                <h2 className="text-base font-black tracking-tight text-white">
                    {warningReason === "grace"
                        ? `Your ${planName} features will end in ${remainingLabel}`
                        : warningReason === "insufficient_balance"
                            ? `Your ${planName} needs payment in ${remainingLabel}`
                        : `Your ${planName} will end in ${remainingLabel}`}
                </h2>
                <p className="mt-2 text-[12px] leading-relaxed text-white/55">
                    {warningReason === "grace"
                        ? "Your subscription period has ended, but your features are still active during the grace period. Pay now to keep them active."
                        : warningReason === "insufficient_balance"
                            ? "Auto-renew is on, but your wallet balance is not enough. Top up or pay now to keep your subscription features active."
                        : "Auto-renew is off. Please pay and subscribe again to keep your subscription features active."}
                </p>
                <div className="mt-5 flex flex-col gap-2">
                    <button
                        type="button"
                        onClick={() => { setShow(false); router.push("/dashboard/wallet/subscription"); }}
                        className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-amber-400 text-[11px] font-black uppercase tracking-widest text-black transition hover:bg-amber-300 active:scale-[0.98]"
                    >
                        <IonIcon name="star-outline" className="text-sm" />
                        Pay Subscription
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
