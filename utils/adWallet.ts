"use client";

export type AdWalletAdjustment = {
    id: string;
    adId: string;
    ownerKey: string;
    amount: number;
    kind: "refund";
    createdAt: string;
    note?: string;
};

const AD_WALLET_ADJUSTMENTS_KEY = "googer-ad-wallet-adjustments-v1";

export function getUserIdentityKey(user: any) {
    const rawId = user?.id ?? user?._id ?? user?.user_id;
    if (rawId !== undefined && rawId !== null && String(rawId).trim()) {
        return `id:${String(rawId).trim()}`;
    }

    const username = typeof user?.username === "string" ? user.username.trim().toLowerCase() : "";
    if (username) return `username:${username}`;

    const email = typeof user?.email === "string" ? user.email.trim().toLowerCase() : "";
    if (email) return `email:${email}`;

    return "";
}

export function getStoredUser() {
    if (typeof window === "undefined") return null;

    try {
        const rawUser = window.localStorage.getItem("user");
        return rawUser ? JSON.parse(rawUser) : null;
    } catch {
        return null;
    }
}

export function getCurrentUserIdentityKey() {
    return getUserIdentityKey(getStoredUser());
}

export function readAdWalletAdjustments() {
    if (typeof window === "undefined") return [] as AdWalletAdjustment[];

    try {
        const rawValue = window.localStorage.getItem(AD_WALLET_ADJUSTMENTS_KEY);
        if (!rawValue) return [];

        const parsed = JSON.parse(rawValue);
        if (!Array.isArray(parsed)) return [];

        return parsed.filter((entry): entry is AdWalletAdjustment => {
            return Boolean(
                entry
                && typeof entry.id === "string"
                && typeof entry.adId === "string"
                && typeof entry.ownerKey === "string"
                && typeof entry.amount === "number"
                && entry.kind === "refund"
                && typeof entry.createdAt === "string"
            );
        });
    } catch {
        return [];
    }
}

export function writeAdWalletAdjustments(adjustments: AdWalletAdjustment[]) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(AD_WALLET_ADJUSTMENTS_KEY, JSON.stringify(adjustments));
}

export function addAdWalletRefund(adId: string, ownerKey: string, amount: number, note?: string) {
    if (typeof window === "undefined" || !ownerKey || amount <= 0) return null;

    const nextEntry: AdWalletAdjustment = {
        id: `refund-${adId}-${Date.now()}`,
        adId,
        ownerKey,
        amount,
        kind: "refund",
        createdAt: new Date().toISOString(),
        note,
    };

    const existing = readAdWalletAdjustments();
    existing.push(nextEntry);
    writeAdWalletAdjustments(existing);
    return nextEntry;
}

export function getAdRefundTotal(adId: string, ownerKey?: string) {
    return readAdWalletAdjustments()
        .filter((entry) => entry.adId === adId && (!ownerKey || entry.ownerKey === ownerKey))
        .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
}

export function getWalletBalanceWithAdAdjustments(balance: number, ownerKey?: string) {
    if (!ownerKey) return balance;

    const refundTotal = readAdWalletAdjustments()
        .filter((entry) => entry.ownerKey === ownerKey && entry.kind === "refund")
        .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

    return balance + refundTotal;
}

export function getPublishedAdCountForUser(ownerKey?: string) {
    if (typeof window === "undefined") return 0;

    return Object.keys(window.localStorage).filter((key) => {
        if (!key.startsWith("googer-ad-review-")) return false;

        try {
            const data = JSON.parse(window.localStorage.getItem(key) || "{}");
            if (!(typeof data.adId === "string" && /^\d{10,12}$/.test(data.adId))) return false;
            if (!ownerKey) return true;
            return typeof data.ownerKey === "string" ? data.ownerKey === ownerKey : false;
        } catch {
            return false;
        }
    }).length;
}
