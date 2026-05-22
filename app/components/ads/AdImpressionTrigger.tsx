"use client";

import { useEffect, useRef } from "react";

type AdImpressionTriggerProps = {
    adId: string | number;
    onImpression: () => void;
    children: React.ReactNode;
};

/**
 * Wraps any ad card and fires `onImpression` exactly once per mount when at
 * least 50% of the element enters the viewport.  Uses a stable callback ref
 * so the observer is not torn down and re-created on every parent render.
 */
export function AdImpressionTrigger({ adId, onImpression, children }: AdImpressionTriggerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    // Track whether we've already fired for this ad instance
    const firedRef = useRef(false);
    // Always hold the latest callback without rebuilding the observer
    const callbackRef = useRef(onImpression);
    callbackRef.current = onImpression;

    // Reset when the ad changes (e.g. feed refresh with same DOM node)
    useEffect(() => {
        firedRef.current = false;
    }, [adId]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el || typeof IntersectionObserver === "undefined") return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting && !firedRef.current) {
                    firedRef.current = true;
                    callbackRef.current();
                }
            },
            { threshold: 0.5 }
        );

        observer.observe(el);
        return () => observer.disconnect();
    }, []); // intentionally empty — callback changes handled via callbackRef

    return <div ref={containerRef}>{children}</div>;
}
