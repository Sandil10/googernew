"use client";

import { useEffect, useRef } from "react";
import { API_URL } from "@/services/apiConfig";
import { authService } from "@/services/authService";

const HEARTBEAT_INTERVAL_MS = 10000;
const MIN_ACTIVITY_GAP_MS = 2500;

export default function LivePresenceHeartbeat() {
    const lastSentAt = useRef(0);
    const inFlight = useRef(false);

    useEffect(() => {
        if (typeof window === "undefined") return;

        const sendHeartbeat = async (force = false) => {
            const now = Date.now();
            if (!force && now - lastSentAt.current < MIN_ACTIVITY_GAP_MS) return;
            if (document.visibilityState !== "visible") return;
            const token = authService.getToken();
            if (!token || inFlight.current) return;

            lastSentAt.current = now;
            inFlight.current = true;
            try {
                await fetch(`${API_URL}/chat/presence`, {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ source: "dashboard-activity" }),
                    keepalive: true,
                });
            } catch {
                // Presence is best-effort; it should never interrupt the user flow.
            } finally {
                inFlight.current = false;
            }
        };

        const onActivity = () => void sendHeartbeat(false);
        const onVisible = () => {
            if (document.visibilityState === "visible") void sendHeartbeat(true);
        };

        void sendHeartbeat(true);
        const interval = window.setInterval(() => void sendHeartbeat(true), HEARTBEAT_INTERVAL_MS);
        window.addEventListener("focus", onActivity);
        window.addEventListener("scroll", onActivity, { passive: true });
        window.addEventListener("pointerdown", onActivity, { passive: true });
        document.addEventListener("visibilitychange", onVisible);

        return () => {
            window.clearInterval(interval);
            window.removeEventListener("focus", onActivity);
            window.removeEventListener("scroll", onActivity);
            window.removeEventListener("pointerdown", onActivity);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, []);

    return null;
}
