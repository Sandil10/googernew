"use client";

import { useEffect, useRef } from "react";

type AdImpressionTriggerProps = {
    adId: string | number;
    onImpression: () => void;
    minIntervalMs?: number;
    children: React.ReactNode;
};

/**
 * Wraps any ad card and fires `onImpression` for each distinct viewport
 * exposure. Scrolling away and back counts again, but small observer flickers
 * are ignored by a short cooldown.
 */
export function AdImpressionTrigger({ adId, onImpression, minIntervalMs = 1500, children }: AdImpressionTriggerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const visibleRef = useRef(false);
    const lastFiredAtRef = useRef(0);
    // Always hold the latest callback without rebuilding the observer
    const callbackRef = useRef(onImpression);

    useEffect(() => {
        callbackRef.current = onImpression;
    }, [onImpression]);

    // Reset when the ad changes (e.g. feed refresh with same DOM node)
    useEffect(() => {
        visibleRef.current = false;
        lastFiredAtRef.current = 0;
    }, [adId]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el || typeof IntersectionObserver === "undefined") return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                const isVisible = entry.isIntersecting && entry.intersectionRatio >= 0.5;
                if (!isVisible) {
                    visibleRef.current = false;
                    return;
                }

                const now = Date.now();
                if (!visibleRef.current && now - lastFiredAtRef.current >= minIntervalMs) {
                    visibleRef.current = true;
                    lastFiredAtRef.current = now;
                    callbackRef.current();
                }
            },
            { threshold: 0.5 }
        );

        observer.observe(el);
        return () => observer.disconnect();
    }, []); // intentionally empty - callback changes handled via callbackRef

    return <div ref={containerRef}>{children}</div>;
}
