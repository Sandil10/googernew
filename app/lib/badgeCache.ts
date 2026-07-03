"use client";

import type { VerifiedBadgeData } from "@/app/components/VerifiedBadge";

// In-memory cache: userId → { color } | null
const cache = new Map<string, VerifiedBadgeData | null>();
const pending = new Map<string, Promise<VerifiedBadgeData | null>>();

const safeJson = async (response: Response) => {
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) return null;
    return response.json().catch(() => null);
};

export async function getBadgeForUser(userId: number | string): Promise<VerifiedBadgeData | null> {
    const key = String(userId);
    if (cache.has(key)) return cache.get(key)!;
    if (pending.has(key)) return pending.get(key)!;

    const p = fetch(`/api/subscriptions/badge/${key}`)
        .then(async r => (r.ok ? await safeJson(r) : null))
        .then(d => {
            const result = d?.badge || null;
            cache.set(key, result);
            pending.delete(key);
            return result;
        })
        .catch(() => {
            cache.set(key, null);
            pending.delete(key);
            return null;
        });

    pending.set(key, p);
    return p;
}

export function invalidateBadgeCache(userId?: number | string) {
    if (userId) cache.delete(String(userId));
    else cache.clear();
}

// Listen for badge:changed to clear cache
if (typeof window !== 'undefined') {
    window.addEventListener('badge:changed', () => cache.clear());
}
