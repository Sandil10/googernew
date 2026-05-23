"use client";

import { useEffect, useState } from "react";
import { subscriptionService, type SubscriptionFeatures } from "@/services/subscriptionService";

// Default basic-plan shape used while loading or when offline.
// Real values always come from DB via /subscriptions/features.
export const FEATURES_DEFAULT: SubscriptionFeatures = {
    plan_slug: "basic",
    is_basic: true,
    verified_tick: false,
    badge_color: null,
    write_goog_limit: null,
    write_goog_color_limit: null,
    goog_letter_limit: null,
    product_upload_limit: null,
    video_ads_save_limit: null,
    photo_ads_save_limit: null,
    save_goog_limit: null,
    ads_expiry_days: null,
    free_profile_ad_promo: false,
    chat_text_colors: false,
    chat_stickers: false,
    text_messaging: true,
    voice_calls: true,
    video_calls: false,
    voice_to_text: false,
    text_to_voice: false,
    video_call_quality: "sd",
    chat_auto_delete_days: null,
    extra: {},
};

let cache: SubscriptionFeatures | null = null;
let inflight: Promise<SubscriptionFeatures | null> | null = null;
const listeners = new Set<(f: SubscriptionFeatures) => void>();

// Invalidate cache whenever subscription changes — even if no component is mounted
if (typeof window !== "undefined") {
    window.addEventListener("subscription:changed", () => { cache = null; });
}

const broadcast = (f: SubscriptionFeatures) => {
    cache = f;
    listeners.forEach((cb) => cb(f));
};

export const refreshSubscriptionFeatures = async (): Promise<SubscriptionFeatures> => {
    if (inflight) {
        const r = await inflight;
        return r || FEATURES_DEFAULT;
    }
    inflight = subscriptionService.getMyFeatures();
    try {
        const f = await inflight;
        const next = f || FEATURES_DEFAULT;
        broadcast(next);
        return next;
    } finally {
        inflight = null;
    }
};

/**
 * Returns the logged-in user's normalized subscription features.
 * Lazily fetches once per page load and caches in module memory.
 * Listens for `subscription:changed` window events to refetch after subscribe/cancel.
 */
export function useSubscriptionFeatures(): SubscriptionFeatures {
    const [features, setFeatures] = useState<SubscriptionFeatures>(cache || FEATURES_DEFAULT);

    useEffect(() => {
        listeners.add(setFeatures);
        // Always fetch fresh on mount — cache gives instant initial value but may be stale
        // (e.g. user just subscribed on another page before navigating here)
        void refreshSubscriptionFeatures();

        const onChange = () => { void refreshSubscriptionFeatures(); };
        window.addEventListener("subscription:changed", onChange);

        return () => {
            listeners.delete(setFeatures);
            window.removeEventListener("subscription:changed", onChange);
        };
    }, []);

    return features;
}

/** Helpers for non-React contexts */
export const getCachedFeatures = (): SubscriptionFeatures => cache || FEATURES_DEFAULT;
export const clearFeaturesCache = (): void => { cache = null; };
