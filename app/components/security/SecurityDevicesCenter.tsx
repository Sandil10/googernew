"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import IonIcon from "@/app/components/IonIcon";
import LeafletDeviceMap from "@/app/components/security/LeafletDeviceMap";
import { authService } from "@/services/authService";

type SecurityLink = {
    href: string;
    title: string;
    description: string;
};

type AuthSessionDevice = {
    id: string;
    deviceName: string;
    deviceType: string;
    browser: string;
    operatingSystem: string;
    ipAddress: string;
    country?: string;
    region?: string;
    city?: string;
    timezone?: string;
    latitude?: number | null;
    longitude?: number | null;
    trusted: boolean;
    status: string;
    approvalStatus?: string;
    loginAt?: string;
    lastActiveAt?: string;
    isCurrent?: boolean;
};

type Props = {
    backHref?: string;
    backLabel?: string;
    pageTitle?: string;
    pageDescription?: string;
    securityLinks?: SecurityLink[];
};

const formatDateTime = (value?: string) => {
    if (!value) return "Unknown";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Unknown";
    return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
};

const formatLocation = (device: AuthSessionDevice) => {
    const parts = [device.city, device.region, device.country].filter(Boolean);
    return parts.length ? parts.join(", ") : (device.country || "Unknown");
};

type DeviceLookupDetails = {
    location?: {
        country?: string | null;
        region?: string | null;
        district?: string | null;
        city?: string | null;
        locality?: string | null;
        zipcode?: string | null;
        latitude?: number | string | null;
        longitude?: number | string | null;
    } | null;
    timezone?: string | null;
    isp?: string | null;
    networkType?: string | null;
};

const hasLocationValue = (value: unknown) => {
    if (value === null || value === undefined) return false;
    if (typeof value === "number") return Number.isFinite(value);
    return String(value).trim().length > 0 && String(value).trim().toLowerCase() !== "unknown";
};

export function DeviceDetailsModal({ device, onClose }: { device: AuthSessionDevice; onClose: () => void }) {
    const [deviceLookup, setDeviceLookup] = useState<DeviceLookupDetails | null>(null);
    const [deviceLookupLoading, setDeviceLookupLoading] = useState(false);
    const [deviceLookupError, setDeviceLookupError] = useState("");

    useEffect(() => {
        let cancelled = false;
        setDeviceLookup(null);
        setDeviceLookupError("");

        if (!device.ipAddress || (hasLocationValue(device.latitude) && hasLocationValue(device.longitude))) {
            return;
        }

        const loadDeviceLocation = async () => {
            try {
                setDeviceLookupLoading(true);
                const response = await fetch(`/device-location?ip=${encodeURIComponent(device.ipAddress)}`);
                const result = await response.json().catch(() => null);
                if (!response.ok) {
                    throw new Error(result?.message || "Could not load exact IP location.");
                }
                if (!cancelled) setDeviceLookup(result);
            } catch (err: any) {
                if (!cancelled) setDeviceLookupError(err?.message || "Could not load exact IP location.");
            } finally {
                if (!cancelled) setDeviceLookupLoading(false);
            }
        };

        void loadDeviceLocation();
        return () => {
            cancelled = true;
        };
    }, [device]);

    const location = deviceLookup?.location || null;
    const mapLat = hasLocationValue(device.latitude) ? Number(device.latitude) : hasLocationValue(location?.latitude) ? Number(location?.latitude) : null;
    const mapLng = hasLocationValue(device.longitude) ? Number(device.longitude) : hasLocationValue(location?.longitude) ? Number(location?.longitude) : null;
    const hasMap = mapLat !== null && mapLng !== null;
    const rows = [
        ["Device", device.deviceName],
        ["Type", device.deviceType],
        ["Browser", device.browser],
        ["Operating System", device.operatingSystem],
        ["IP Address", device.ipAddress || "Unknown"],
        ["Region", location?.region || device.region],
        ["District", location?.district],
        ["City", location?.city || device.city],
        ["Locality", location?.locality],
        ["Zip Code", location?.zipcode],
        ["Time Zone", deviceLookup?.timezone || device.timezone],
        ["ISP", deviceLookup?.isp],
        ["Network Type", deviceLookup?.networkType],
        ["Login Time", formatDateTime(device.loginAt)],
        ["Last Active", formatDateTime(device.lastActiveAt)],
    ].filter(([, value]) => hasLocationValue(value));

    return (
        <div className="fixed inset-0 z-[170] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
            <div className="absolute inset-0" onClick={onClose} />
            <div className="relative w-full max-w-3xl overflow-hidden rounded-[2rem] border border-white/10 bg-[#111114] shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
                <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
                    <div>
                        <h2 className="text-base font-black text-white">{device.deviceName || "Device Details"}</h2>
                        <p className="mt-1 text-xs text-white/45">{device.browser || "Browser"} on {device.operatingSystem || "OS"}</p>
                    </div>
                    <button type="button" onClick={onClose} className="text-white/50 transition hover:text-white">
                        <IonIcon name="close-outline" className="text-2xl" />
                    </button>
                </div>

                <div className="grid gap-5 px-5 py-5 min-[980px]:grid-cols-[minmax(0,1fr)_340px]">
                    <div className="overflow-hidden rounded-3xl border border-white/8 bg-black/25">
                        {deviceLookupLoading ? (
                            <div className="flex h-[280px] items-center justify-center text-sm text-white/45">Loading location map...</div>
                        ) : hasMap ? (
                            <LeafletDeviceMap
                                latitude={mapLat}
                                longitude={mapLng}
                                label={rows.find(([label]) => label === "City")?.[1] || device.deviceName || "Device location"}
                            />
                        ) : (
                            <div className="flex h-[280px] items-center justify-center px-6 text-center text-sm text-white/45">
                                {deviceLookupError || "Exact coordinates are not available for this session yet."}
                            </div>
                        )}
                    </div>

                    <div className="space-y-2">
                        {rows.length > 0 ? rows.map(([label, value]) => (
                            <div key={String(label)} className="flex justify-between gap-3 rounded-xl bg-white/[0.03] px-3 py-2 text-xs">
                                <span className="text-white/35">{label}</span>
                                <span className="text-right font-semibold text-white/75">{value}</span>
                            </div>
                        )) : (
                            <div className="rounded-xl bg-white/[0.03] px-3 py-4 text-sm text-white/45">
                                No extra device details available.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function SecurityDevicesCenter({
    backHref = "/dashboard/settings?tab=security",
    backLabel = "Back to Security",
    pageTitle = "Security Alerts",
    pageDescription = "Review login history, new-device attempts, browser and operating-system details, trust status, approximate location, and map previews.",
    securityLinks = [],
}: Props) {
    const [devices, setDevices] = useState<AuthSessionDevice[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [selectedDevice, setSelectedDevice] = useState<AuthSessionDevice | null>(null);

    const loadDevices = useCallback(async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            const result = await authService.getAuthSessions();
            setDevices(Array.isArray(result?.sessions) ? result.sessions : []);
        } catch (err: any) {
            if (!silent) setMessage({ type: "error", text: err?.message || "Could not load security devices." });
        } finally {
            if (!silent) setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadDevices();
        const timer = window.setInterval(() => void loadDevices(true), 3000);
        return () => window.clearInterval(timer);
    }, [loadDevices]);

    const trustDevice = async (device: AuthSessionDevice) => {
        try {
            await authService.updateAuthSession(device.id, { trusted: true });
            setMessage({ type: "success", text: "Device trusted. Login can continue." });
            await loadDevices(true);
        } catch (err: any) {
            setMessage({ type: "error", text: err?.message || "Could not trust device." });
        }
    };

    const denyDevice = async (device: AuthSessionDevice) => {
        try {
            await authService.updateAuthSession(device.id, { trusted: false });
            setMessage({ type: "success", text: "Device request denied." });
            await loadDevices(true);
        } catch (err: any) {
            setMessage({ type: "error", text: err?.message || "Could not deny device." });
        }
    };

    const removeDevice = async (device: AuthSessionDevice) => {
        try {
            await authService.removeAuthSession(device.id);
            setMessage({ type: "success", text: "Device removed." });
            await loadDevices(true);
        } catch (err: any) {
            setMessage({ type: "error", text: err?.message || "Could not remove device." });
        }
    };

    const pendingDevices = devices.filter((device) => device.approvalStatus === "pending");
    const activeDevices = devices.filter((device) => device.isCurrent || (device.status === "active" && device.approvalStatus !== "pending"));

    return (
        <div className="mx-auto max-w-5xl pb-10 text-white">
            <section className="overflow-hidden rounded-[2rem] border border-white/8 bg-[#0c0c0f] shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
                <div className="border-b border-white/8 px-5 py-4 min-[960px]:px-6">
                    <Link href={backHref} className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-white/55 transition hover:text-white">
                        <IonIcon name="arrow-back-outline" className="text-sm" />
                        {backLabel}
                    </Link>
                    <div className="mt-4 flex flex-col gap-3 min-[760px]:flex-row min-[760px]:items-end min-[760px]:justify-between">
                        <div>
                            <h1 className="text-lg font-black tracking-tight text-white">{pageTitle}</h1>
                            <p className="mt-1 max-w-2xl text-xs leading-5 text-white/45">{pageDescription}</p>
                        </div>
                        <button type="button" onClick={() => loadDevices()} className="rounded-2xl bg-white px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-black transition hover:bg-zinc-200">
                            {loading ? "Loading" : "Refresh"}
                        </button>
                    </div>
                </div>

                <div className="space-y-4 px-5 py-5 min-[960px]:px-6">
                    {message && (
                        <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${message.type === "success" ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-100" : "border-red-400/25 bg-red-500/10 text-red-100"}`}>
                            {message.text}
                        </div>
                    )}

                    {securityLinks.length > 0 && (
                        <div className="grid gap-3 min-[820px]:grid-cols-3">
                            {securityLinks.map((link) => (
                                <Link key={link.href} href={link.href} className="rounded-3xl border border-white/8 bg-white/[0.03] p-5 transition hover:border-white/15 hover:bg-white/[0.06]">
                                    <h2 className="text-sm font-black text-white">{link.title}</h2>
                                    <p className="mt-2 text-xs leading-5 text-white/45">{link.description}</p>
                                </Link>
                            ))}
                        </div>
                    )}

                    {pendingDevices.map((device) => (
                        <div key={device.id} className="rounded-3xl border border-amber-400/25 bg-amber-400/10 p-5">
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-200/80">Security Alert</p>
                            <div className="mt-2 flex flex-col gap-4 min-[760px]:flex-row min-[760px]:items-center min-[760px]:justify-between">
                                <div>
                                    <h2 className="text-base font-black text-white">A new device is trying to access your account.</h2>
                                    <p className="mt-2 text-sm leading-6 text-white/65">Approve the request only when you recognize the device and location.</p>
                                    <p className="mt-2 text-xs text-white/45">{device.deviceName} | {formatLocation(device)} | Login time {formatDateTime(device.loginAt)}</p>
                                </div>
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => trustDevice(device)} className="rounded-2xl bg-white px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-black transition hover:bg-zinc-200">Trust Device</button>
                                    <button type="button" onClick={() => denyDevice(device)} className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-red-200 transition hover:bg-red-500/15">Don&apos;t Trust</button>
                                </div>
                            </div>
                        </div>
                    ))}

                    <div className="rounded-3xl border border-white/8 bg-white/[0.03] p-5">
                        <h2 className="text-sm font-black text-white">Logged Devices</h2>
                        <p className="mt-1 text-xs text-white/45">Current device is shown first. Use the eye icon for the attached Device Details box.</p>
                        <div className="mt-4 grid gap-3">
                            {activeDevices.map((device) => (
                                <div key={device.id} className="rounded-3xl border border-white/[0.08] bg-black/20 p-4">
                                    <div className="flex flex-col gap-4 min-[760px]:flex-row min-[760px]:items-center min-[760px]:justify-between">
                                        <div className="flex min-w-0 items-start gap-3">
                                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/[0.06] text-white">
                                                <IonIcon name={device.deviceType === "Mobile" ? "phone-portrait-outline" : "desktop-outline"} className="text-xl" />
                                            </span>
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <h3 className="truncate text-sm font-black text-white">{device.isCurrent ? "Current Device" : device.deviceName}</h3>
                                                    {device.trusted && <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-emerald-200">Trusted</span>}
                                                </div>
                                                <p className="mt-1 text-xs text-white/45">{device.browser} on {device.operatingSystem} | {device.deviceType}</p>
                                                <p className="mt-1 text-[11px] text-white/35">Last active {formatDateTime(device.lastActiveAt)}</p>
                                            </div>
                                        </div>
                                        <div className="flex shrink-0 gap-2">
                                            <button type="button" onClick={() => setSelectedDevice(device)} className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 text-white/60 transition hover:bg-white/5 hover:text-white" aria-label="View device details">
                                                <IonIcon name="eye-outline" className="text-lg" />
                                            </button>
                                            {!device.isCurrent && (
                                                <button type="button" onClick={() => removeDevice(device)} className="rounded-2xl border border-red-400/25 px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-red-200 transition hover:bg-red-500/10">Remove</button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {!loading && activeDevices.length === 0 && (
                                <div className="rounded-3xl border border-dashed border-white/10 p-6 text-center text-xs text-white/45">No logged devices found yet.</div>
                            )}
                        </div>
                    </div>
                </div>
            </section>
            {selectedDevice && <DeviceDetailsModal device={selectedDevice} onClose={() => setSelectedDevice(null)} />}
        </div>
    );
}
