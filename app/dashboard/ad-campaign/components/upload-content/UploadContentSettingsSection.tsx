"use client";

import { useEffect, useMemo, useState } from "react";
import IonIcon from "@/app/components/IonIcon";

export type UploadContentSubscriptionPackage = {
    id: string;
    price: number | null;
    days: number | null;
    affiliateCommission?: number;
};

type CommissionTier = {
    min: number;
    max: number;
    commission: number;
};

type Props = {
    priceValue: number | null;
    adminMinPriceValue: number;
    adminMaxPriceValue: number;
    affiliateCommission: number;
    subscriptionCommissionTiers: CommissionTier[];
    subscriptionPackages: UploadContentSubscriptionPackage[];
    onPriceChange: (value: number | null) => void;
    onAffiliateCommissionChange: (value: number) => void;
    onSubscriptionPackagesChange: (packages: UploadContentSubscriptionPackage[]) => void;
};

const PACKAGE_PRESET_STORAGE_KEY = "googer-upload-content-subscription-packages-v1";
const MAX_SUBSCRIPTION_PACKAGES = 3;
const SUBSCRIPTION_DAY_OPTIONS = Array.from({ length: 30 }, (_, index) => index + 1);

const createPackageId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const sanitizePackageNumber = (value: string) => {
    const parsed = Number(value.replace(/[^0-9]/g, ""));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const sanitizePackages = (packages: UploadContentSubscriptionPackage[]) =>
    packages
        .map((item) => ({
            id: item.id || createPackageId(),
            price: Number.isFinite(Number(item.price)) && Number(item.price) > 0 ? Number(item.price) : null,
            days: Number.isFinite(Number(item.days)) && Number(item.days) > 0
                ? Math.min(30, Number(item.days))
                : null,
            affiliateCommission: Number.isFinite(Number(item.affiliateCommission)) && Number(item.affiliateCommission) >= 0
                ? Math.min(100, Math.max(0, Number(item.affiliateCommission)))
                : 0,
        }))
        .filter((item) => item.price !== null && item.days !== null)
        .slice(0, MAX_SUBSCRIPTION_PACKAGES);

const formatPlanDuration = (days: number | null) => {
    if (!days) return "";
    if (days === 30) return "Month";
    return `${days} Day${days === 1 ? "" : "s"}`;
};

export default function UploadContentSettingsSection({
    priceValue,
    adminMinPriceValue,
    adminMaxPriceValue,
    affiliateCommission,
    subscriptionCommissionTiers,
    subscriptionPackages,
    onPriceChange,
    onAffiliateCommissionChange,
    onSubscriptionPackagesChange,
}: Props) {
    const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false);
    const [draftPackages, setDraftPackages] = useState<UploadContentSubscriptionPackage[]>([]);
    const [savedPresetPackages, setSavedPresetPackages] = useState<UploadContentSubscriptionPackage[]>([]);
    const [subscriptionAccessEnabled, setSubscriptionAccessEnabled] = useState(false);

    const parseCurrencyInput = (value: string) => {
        const parsed = Number(value.replace(/[^0-9]/g, ""));
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    };

    const formatCurrencyValue = (value: number | null) => (
        value === null ? "" : Number(value).toLocaleString()
    );

    const getTierCommission = (tiers: CommissionTier[], price: number | null) => {
        const numericPrice = Number(price);
        if (!Number.isFinite(numericPrice) || numericPrice <= 0) return 0;
        const match = tiers.find((tier) => (
            numericPrice >= Number(tier.min) && numericPrice <= Number(tier.max)
        ));
        return match ? Math.min(100, Math.max(0, Number(match.commission || 0))) : 0;
    };

    const commissionBasePrice = Number(priceValue ?? 0);
    const affiliateAmountValue = commissionBasePrice > 0
        ? Number(((commissionBasePrice * Number(affiliateCommission || 0)) / 100).toFixed(2))
        : 0;

    const updateAffiliatePercentage = (value: string) => {
        const parsed = Number(value);
        onAffiliateCommissionChange(Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 0);
    };

    const updateAffiliateAmount = (value: string) => {
        const amount = Number(value);
        if (!Number.isFinite(amount) || commissionBasePrice <= 0) {
            onAffiliateCommissionChange(0);
            return;
        }
        const percentage = (Math.max(0, amount) / commissionBasePrice) * 100;
        onAffiliateCommissionChange(Math.min(100, Number(percentage.toFixed(4))));
    };

    const appliedPackages = useMemo(
        () => sanitizePackages(subscriptionPackages),
        [subscriptionPackages],
    );

    const validatePackages = (packages: UploadContentSubscriptionPackage[]) => {
        const sanitized = sanitizePackages(packages);
        for (const item of sanitized) {
            const price = Number(item.price ?? 0);
            if (subscriptionCommissionTiers.length > 0) {
                const matchesTier = subscriptionCommissionTiers.some((tier) => price >= Number(tier.min) && price <= Number(tier.max));
                if (!matchesTier) {
                    const minimum = Math.min(...subscriptionCommissionTiers.map((tier) => Number(tier.min)));
                    const maximum = Math.max(...subscriptionCommissionTiers.map((tier) => Number(tier.max)));
                    return `Please add a subscription package price within the available price range (R ${minimum.toLocaleString()} - R ${maximum.toLocaleString()}).`;
                }
            }
        }
        return "";
    };

    const packageValidationMessage = useMemo(
        () => validatePackages(draftPackages),
        [draftPackages, subscriptionCommissionTiers],
    );

    const getSubscriptionCommission = (price: number | null) => {
        return getTierCommission(subscriptionCommissionTiers, price);
    };

    useEffect(() => {
        setSubscriptionAccessEnabled(appliedPackages.length > 0);
    }, [appliedPackages.length]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        try {
            const saved = window.localStorage.getItem(PACKAGE_PRESET_STORAGE_KEY);
            if (!saved) return;
            const parsed = JSON.parse(saved);
            if (!Array.isArray(parsed)) return;
            setSavedPresetPackages(sanitizePackages(parsed));
        } catch {
            setSavedPresetPackages([]);
        }
    }, []);

    const openSubscriptionModal = () => {
        const nextPackages = appliedPackages.length > 0
            ? appliedPackages
            : savedPresetPackages.length > 0
                ? savedPresetPackages
                : [{ id: createPackageId(), price: null, days: null }];
        setDraftPackages(
            nextPackages,
        );
        setSubscriptionAccessEnabled(true);
        setIsSubscriptionModalOpen(true);
    };

    const updateDraftPackage = (id: string, field: "price" | "days", value: string) => {
        const normalizedValue = field === "days"
            ? (() => {
                const parsed = Number(value);
                return Number.isFinite(parsed) && parsed >= 1 ? Math.min(30, parsed) : null;
            })()
            : sanitizePackageNumber(value);
        setDraftPackages((current) =>
            current.map((item) => {
                if (item.id !== id) return item;
                const nextItem = { ...item, [field]: normalizedValue };
                return {
                    ...nextItem,
                    affiliateCommission: getSubscriptionCommission(nextItem.price),
                };
            }),
        );
    };

    const addDraftPackage = () => {
        setSubscriptionAccessEnabled(true);
        setDraftPackages((current) => (
            current.length >= MAX_SUBSCRIPTION_PACKAGES
                ? current
                : [...current, { id: createPackageId(), price: null, days: null, affiliateCommission: 0 }]
        ));
    };

    const removeDraftPackage = (id: string) => {
        setDraftPackages((current) => current.filter((item) => item.id !== id));
    };

    const savePresetPackages = () => {
        const sanitized = sanitizePackages(draftPackages);
        const validationMessage = validatePackages(sanitized);
        if (validationMessage) {
            return;
        }
        setSavedPresetPackages(sanitized);
        if (typeof window !== "undefined") {
            window.localStorage.setItem(PACKAGE_PRESET_STORAGE_KEY, JSON.stringify(sanitized));
        }
    };

    const applyDraftPackages = () => {
        const sanitized = sanitizePackages(draftPackages);
        const validationMessage = validatePackages(sanitized);
        if (validationMessage) {
            return;
        }
        onSubscriptionPackagesChange(subscriptionAccessEnabled ? sanitized.map((item) => ({
            ...item,
            affiliateCommission: getSubscriptionCommission(item.price),
        })) : []);
        setIsSubscriptionModalOpen(false);
    };

    return (
        <>
            <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                        <div className="flex items-start justify-between gap-3">
                            <span className="text-[9px] font-black uppercase tracking-[0.14em] text-white/45">Set Price</span>
                            <button
                                type="button"
                                onClick={openSubscriptionModal}
                                className="inline-flex h-7 items-center justify-center gap-1 rounded-lg border border-red-400/20 bg-red-500/10 px-2.5 text-[8px] font-black uppercase tracking-[0.14em] text-red-300 transition hover:bg-red-500/15 hover:text-red-200"
                            >
                                <IonIcon name="add-outline" className="text-xs" />
                                <span>Add Subscription Access</span>
                            </button>
                        </div>
                        <div className="mt-3">
                            <label className="block rounded-lg border border-white/10 bg-black/20 px-3 py-2.5">
                                <p className="mb-1 text-[8px] font-black uppercase leading-none tracking-[0.12em] text-white/35">Price <span className="text-red-400">*</span></p>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    value={formatCurrencyValue(priceValue)}
                                    onChange={(event) => onPriceChange(parseCurrencyInput(event.target.value))}
                                    placeholder="Enter price"
                                    className="h-5 w-full bg-transparent p-0 text-[11px] font-black text-white outline-none placeholder:text-white/18"
                                />
                            </label>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2 text-[9px] font-black text-white/38">
                            <span>Min Rupier {Number(adminMinPriceValue || 0).toLocaleString()}</span>
                            <span>Max Rupier {Number(adminMaxPriceValue || 0).toLocaleString()}</span>
                        </div>

                        {appliedPackages.length > 0 && (
                            <div className="mt-3 space-y-2">
                                <p className="text-[8px] font-black uppercase tracking-[0.14em] text-white/38">
                                    Applied Subscription Packages ({appliedPackages.length}/{MAX_SUBSCRIPTION_PACKAGES})
                                </p>
                                <div className="grid gap-2">
                                    {appliedPackages.map((item, index) => (
                                        <div key={item.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-[10px] font-bold text-white/75">
                                            <span>Package {index + 1}</span>
                                            <span>Rupier {Number(item.price || 0).toLocaleString()} / {formatPlanDuration(item.days)} / {Number(item.affiliateCommission || 0)}%</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <span className="text-[9px] font-black uppercase tracking-[0.14em] text-white/45">Share Commission</span>
                                <p className="mt-1 text-[10px] font-semibold text-white/40">
                                    Reward user who share and help sell your content.
                                </p>
                            </div>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                            <label className="block rounded-lg border border-white/10 bg-black/20 px-3 py-2.5">
                                <p className="mb-1 text-[8px] font-black uppercase leading-none tracking-[0.12em] text-white/35">Share Commission (%)</p>
                                <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    step="0.01"
                                    value={commissionBasePrice > 0 ? affiliateCommission : ""}
                                    onChange={(event) => updateAffiliatePercentage(event.target.value)}
                                    placeholder="Auto"
                                    className="h-5 w-full bg-transparent p-0 text-[11px] font-black text-white outline-none"
                                />
                            </label>
                            <label className="block rounded-lg border border-white/10 bg-black/20 px-3 py-2.5">
                                <p className="mb-1 text-[8px] font-black uppercase leading-none tracking-[0.12em] text-white/35">Com Amount</p>
                                <input
                                    type="number"
                                    inputMode="numeric"
                                    min={0}
                                    step="0.01"
                                    value={commissionBasePrice > 0 ? affiliateAmountValue.toFixed(2) : ""}
                                    onChange={(event) => updateAffiliateAmount(event.target.value)}
                                    placeholder="Auto"
                                    className="h-5 w-full bg-transparent p-0 text-[11px] font-black text-white outline-none placeholder:text-white/18"
                                />
                            </label>
                        </div>
                    </div>
                </div>
            </div>

            {isSubscriptionModalOpen && (
                <div className="fixed inset-0 z-[170] flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm">
                    <div className="flex h-[min(760px,calc(100vh-3rem))] w-full max-w-xl flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#111216] shadow-[0_30px_90px_rgba(0,0,0,0.55)]">
                        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
                            <div>
                                <h3 className="text-[15px] font-black text-white">Subscription Access Packages</h3>
                                <p className="mt-1 text-[11px] font-semibold text-white/45">
                                    Add up to 3 custom packages with price and days. Subscription commission is applied automatically based on the selected price.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsSubscriptionModalOpen(false)}
                                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] text-white/65 transition hover:bg-white/[0.1] hover:text-white"
                                aria-label="Close package form"
                            >
                                <IonIcon name="close-outline" className="text-lg" />
                            </button>
                        </div>

                        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
                            <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-white">
                                <input
                                    type="checkbox"
                                    checked={subscriptionAccessEnabled}
                                    onChange={(event) => setSubscriptionAccessEnabled(event.target.checked)}
                                    className="h-4 w-4 shrink-0 accent-white"
                                />
                                <span className="text-[13px] font-black">Enable Subscription Access</span>
                            </label>

                            <div className="space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <h4 className="text-[13px] font-black text-white">Create Subscription Tiers</h4>
                                    <div className="flex items-center gap-2">
                                        {savedPresetPackages.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setDraftPackages(savedPresetPackages);
                                                    setSubscriptionAccessEnabled(true);
                                                }}
                                                className="inline-flex h-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] px-3 text-[9px] font-black uppercase tracking-[0.14em] text-white/75 transition hover:bg-white/[0.1] hover:text-white"
                                            >
                                                Use Saved Preset
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={addDraftPackage}
                                            disabled={draftPackages.length >= MAX_SUBSCRIPTION_PACKAGES}
                                            className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-red-400/20 bg-red-500/10 px-3 text-[10px] font-black text-red-300 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-35"
                                        >
                                            <IonIcon name="add-outline" className="text-sm" />
                                            <span>Add Plan</span>
                                        </button>
                                    </div>
                                </div>

                                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/38">
                                    Plans {draftPackages.length}/{MAX_SUBSCRIPTION_PACKAGES}
                                </p>
                            </div>

                            <div className={`space-y-3 ${subscriptionAccessEnabled ? "" : "pointer-events-none opacity-45"}`}>
                                {draftPackages.map((item, index) => (
                                    <div key={item.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                                        <div className="mb-3 flex items-center justify-between gap-3">
                                            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/55">Package {index + 1}</p>
                                            <button
                                                type="button"
                                                onClick={() => removeDraftPackage(item.id)}
                                                className="inline-flex h-7 items-center justify-center rounded-lg border border-red-400/20 bg-red-500/10 px-2.5 text-[8px] font-black uppercase tracking-[0.14em] text-red-300 transition hover:bg-red-500/15"
                                            >
                                                Remove
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                            <label className="block rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
                                                <p className="mb-1 text-[8px] font-black uppercase tracking-[0.12em] text-white/35">Price</p>
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    value={item.price === null ? "" : Number(item.price).toLocaleString()}
                                                    onChange={(event) => updateDraftPackage(item.id, "price", event.target.value)}
                                                    placeholder="300"
                                                    className="h-5 w-full bg-transparent p-0 text-[11px] font-black text-white outline-none placeholder:text-white/18"
                                                />
                                            </label>
                                            <label className="block rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
                                                <p className="mb-1 text-[8px] font-black uppercase tracking-[0.12em] text-white/35">Days</p>
                                                <select
                                                    value={item.days === null ? "" : String(item.days)}
                                                    onChange={(event) => updateDraftPackage(item.id, "days", event.target.value)}
                                                    className="h-5 w-full bg-transparent p-0 text-[11px] font-black text-white outline-none"
                                                >
                                                    <option value="" className="bg-[#111216] text-white/35">Select days</option>
                                                    {SUBSCRIPTION_DAY_OPTIONS.map((day) => (
                                                        <option key={day} value={day} className="bg-[#111216] text-white">
                                                            {day}
                                                        </option>
                                                    ))}
                                                </select>
                                            </label>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {packageValidationMessage && (
                                <p className="text-[10px] font-semibold text-red-400">
                                    {packageValidationMessage}
                                </p>
                            )}
                        </div>

                        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-white/10 px-5 py-4">
                            <button
                                type="button"
                                onClick={savePresetPackages}
                                className="inline-flex h-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-4 text-[9px] font-black uppercase tracking-[0.14em] text-white/75 transition hover:bg-white/[0.1] hover:text-white"
                            >
                                Save For Future
                            </button>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setIsSubscriptionModalOpen(false)}
                                    className="inline-flex h-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-4 text-[9px] font-black uppercase tracking-[0.14em] text-white/60 transition hover:bg-white/[0.08] hover:text-white"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={applyDraftPackages}
                                    disabled={!!packageValidationMessage}
                                    className="inline-flex h-9 items-center justify-center rounded-xl bg-white px-4 text-[9px] font-black uppercase tracking-[0.14em] text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-45"
                                >
                                    Apply Packages
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
