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
    loginResult?: string;
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
    mode?: "all" | "trustedDevices" | "loginHistory";
    pageSize?: number;
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
            <div className="relative max-h-[86vh] w-full max-w-2xl overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#111114] shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
                <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
                    <div>
                        <h2 className="text-sm font-black text-white">{device.deviceName || "Device Details"}</h2>
                        <p className="mt-1 text-xs text-white/45">{device.browser || "Browser"} on {device.operatingSystem || "OS"}</p>
                    </div>
                    <button type="button" onClick={onClose} className="text-white/50 transition hover:text-white">
                        <IonIcon name="close-outline" className="text-2xl" />
                    </button>
                </div>

                <div className="grid max-h-[calc(86vh-70px)] gap-4 overflow-y-auto px-4 py-4 min-[760px]:grid-cols-[minmax(0,1fr)_260px]">
                    <div className="overflow-hidden rounded-3xl border border-white/8 bg-black/25">
                        {deviceLookupLoading ? (
                            <div className="flex h-[360px] items-center justify-center text-sm text-white/45">Loading location map...</div>
                        ) : hasMap ? (
                            <LeafletDeviceMap
                                latitude={mapLat}
                                longitude={mapLng}
                                label={rows.find(([label]) => label === "City")?.[1] || device.deviceName || "Device location"}
                                className="h-[360px]"
                            />
                        ) : (
                            <div className="flex h-[360px] items-center justify-center px-6 text-center text-sm text-white/45">
                                {deviceLookupError || "Exact coordinates are not available for this session yet."}
                            </div>
                        )}
                    </div>

                    <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
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
    mode = "all",
    pageSize = 5,
}: Props) {
    const [devices, setDevices] = useState<AuthSessionDevice[]>([]);
    const [loginHistory, setLoginHistory] = useState<AuthSessionDevice[]>([]);
    const [devicePage, setDevicePage] = useState(1);
    const [historyPage, setHistoryPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [selectedDevice, setSelectedDevice] = useState<AuthSessionDevice | null>(null);

    const loadDevices = useCallback(async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            const [result, historyResult] = await Promise.all([
                authService.getAuthSessions(),
                authService.getAuthSessionHistory(),
            ]);
            setDevices(Array.isArray(result?.sessions) ? result.sessions : []);
            setLoginHistory(Array.isArray(historyResult?.history) ? historyResult.history : []);
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

    useEffect(() => {
        const historyPageCount = Math.max(1, Math.ceil(loginHistory.length / pageSize));
        if (historyPage > historyPageCount) {
            setHistoryPage(historyPageCount);
        }
    }, [historyPage, loginHistory, pageSize]);

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

    const toggleTrustedDevice = async (device: AuthSessionDevice) => {
        try {
            await authService.updateAuthSession(device.id, { trusted: !device.trusted });
            setMessage({ type: "success", text: device.trusted ? "Device untrusted." : "Device trusted." });
            await loadDevices(true);
        } catch (err: any) {
            setMessage({ type: "error", text: err?.message || "Could not update device trust." });
        }
    };

    const logoutOtherDevices = async () => {
        try {
            await authService.logoutOtherAuthSessions();
            setMessage({ type: "success", text: "Other devices logged out." });
            await loadDevices(true);
        } catch (err: any) {
            setMessage({ type: "error", text: err?.message || "Could not log out other devices." });
        }
    };

    const pendingDevices = devices.filter((device) => device.approvalStatus === "pending");
    const activeDevices = Array.from([...devices
        .filter((device) => device.isCurrent || (device.status === "active" && device.approvalStatus !== "pending"))]
        .sort((a, b) => {
            if (a.isCurrent && !b.isCurrent) return -1;
            if (!a.isCurrent && b.isCurrent) return 1;
            return new Date(b.lastActiveAt || b.loginAt || 0).getTime() - new Date(a.lastActiveAt || a.loginAt || 0).getTime();
        })
        .reduce((map, device) => {
            const key = [
                device.isCurrent ? "current" : "device",
                device.browser,
                device.operatingSystem,
                device.deviceType,
                device.ipAddress,
            ].join("|").toLowerCase();
            if (!map.has(key)) map.set(key, device);
            return map;
        }, new Map<string, AuthSessionDevice>())
        .values());
    const devicePageCount = Math.max(1, Math.ceil(activeDevices.length / pageSize));
    const pagedActiveDevices = activeDevices.slice((devicePage - 1) * pageSize, devicePage * pageSize);
    const historyPageCount = Math.max(1, Math.ceil(loginHistory.length / pageSize));
    const pagedHistory = loginHistory.slice((historyPage - 1) * pageSize, historyPage * pageSize);

    useEffect(() => {
        if (devicePage > devicePageCount) setDevicePage(devicePageCount);
    }, [devicePage, devicePageCount]);

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

                    {(mode === "all" || mode === "trustedDevices") && pendingDevices.map((device) => (
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

                    {(mode === "all" || mode === "trustedDevices") && (
                    <div className="rounded-3xl border border-white/8 bg-white/[0.03] p-5">
                        <div className="flex flex-col gap-3 min-[760px]:flex-row min-[760px]:items-center min-[760px]:justify-between">
                            <div>
                                <h2 className="text-sm font-black text-white">Logged Devices</h2>
                                <p className="mt-1 text-xs text-white/45">Current device is shown first. Trust or untrust sessions, remove unfamiliar devices, or inspect the full device details popup.</p>
                            </div>
                            <button type="button" onClick={logoutOtherDevices} className="rounded-2xl bg-white px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-black transition hover:bg-zinc-200">
                                Log Out Others
                            </button>
                        </div>
                        <div className="mt-4 grid gap-3">
                            {pagedActiveDevices.map((device) => (
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
                                                <button type="button" onClick={() => toggleTrustedDevice(device)} className={`rounded-2xl px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em] transition ${device.trusted ? "border border-blue-400/25 bg-blue-500/10 text-blue-200 hover:bg-blue-500/15" : "border border-emerald-400/25 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15"}`}>
                                                    {device.trusted ? "Untrust" : "Trust"}
                                                </button>
                                            )}
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
                        {activeDevices.length > pageSize && (
                            <div className="mt-4 flex items-center justify-between rounded-2xl border border-white/[0.08] bg-black/20 px-4 py-3">
                                <span className="text-xs font-bold text-white/45">Page {devicePage} / {devicePageCount}</span>
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => setDevicePage((page) => Math.max(1, page - 1))} disabled={devicePage <= 1} className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/60 transition hover:bg-white/5 disabled:opacity-40">Previous</button>
                                    <button type="button" onClick={() => setDevicePage((page) => Math.min(devicePageCount, page + 1))} disabled={devicePage >= devicePageCount} className="rounded-xl bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-black transition hover:bg-zinc-200 disabled:opacity-40">Next</button>
                                </div>
                            </div>
                        )}
                    </div>
                    )}

                    {(mode === "all" || mode === "loginHistory") && (
                    <div className="grid gap-4 min-[980px]:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                        <div className="rounded-3xl border border-white/8 bg-white/[0.03] p-5">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <h2 className="text-sm font-black text-white">Login History</h2>
                                    <p className="mt-1 text-xs text-white/45">Recent account sign-ins and session outcomes.</p>
                                </div>
                                <span className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">Page {historyPage} / {historyPageCount}</span>
                            </div>
                            <div className="mt-4 overflow-hidden rounded-2xl border border-white/8">
                                {pagedHistory.map((item) => (
                                    <div key={`history-${item.id}-${item.loginAt || item.lastActiveAt || "row"}`} className="grid gap-2 border-b border-white/8 bg-black/15 px-4 py-3 text-xs text-white/55 last:border-b-0 min-[900px]:grid-cols-[1.2fr_1fr_1fr_0.8fr]">
                                        <span className="font-semibold text-white/75">{formatDateTime(item.loginAt)}</span>
                                        <span>{item.deviceName || "Unknown Device"}</span>
                                        <span>{item.ipAddress || formatLocation(item)}</span>
                                        <span className={item.loginResult === "denied" ? "text-red-300" : item.approvalStatus === "pending" ? "text-amber-300" : "text-emerald-300"}>
                                            {item.loginResult || item.approvalStatus || item.status || "success"}
                                        </span>
                                    </div>
                                ))}
                                {!loading && pagedHistory.length === 0 && (
                                    <div className="bg-black/15 px-4 py-5 text-sm text-white/40">No login history yet.</div>
                                )}
                            </div>
                            {historyPageCount > 1 && (
                                <div className="mt-4 flex items-center justify-end gap-2">
                                    <button type="button" onClick={() => setHistoryPage((page) => Math.max(1, page - 1))} disabled={historyPage <= 1} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40">
                                        Previous
                                    </button>
                                    <button type="button" onClick={() => setHistoryPage((page) => Math.min(historyPageCount, page + 1))} disabled={historyPage >= historyPageCount} className="rounded-xl bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40">
                                        Next
                                    </button>
                                </div>
                            )}
                        </div>

                        {securityLinks.length > 0 && (
                            <div className="rounded-3xl border border-white/8 bg-white/[0.03] p-5">
                                <h2 className="text-sm font-black text-white">Security Pages</h2>
                                <div className="mt-4 space-y-3">
                                    {securityLinks.map((link) => (
                                        <Link key={`secondary-${link.href}`} href={link.href} className="block rounded-2xl border border-white/8 bg-black/20 p-4 transition hover:border-white/20 hover:bg-black/30">
                                            <p className="text-sm font-bold text-white">{link.title}</p>
                                            <p className="mt-1 text-xs text-white/45">{link.description}</p>
                                            <div className="mt-3 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-blue-300">
                                                Open Page
                                                <IonIcon name="arrow-forward-outline" className="text-sm" />
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    )}
                </div>
            </section>
            {selectedDevice && <DeviceDetailsModal device={selectedDevice} onClose={() => setSelectedDevice(null)} />}
        </div>
    );
}
