"use client";

import { useCallback, useEffect, useState } from "react";
import IonIcon from "@/app/components/IonIcon";
import { authService } from "@/services/authService";

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
    approvalStatus?: string;
    loginAt?: string;
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

export default function GlobalSecurityDeviceAlert() {
    const [device, setDevice] = useState<AuthSessionDevice | null>(null);
    const [working, setWorking] = useState(false);

    const loadDevices = useCallback(async () => {
        if (!authService.isAuthenticated()) {
            setDevice(null);
            return;
        }
        try {
            const result = await authService.getAuthSessions();
            const pending = Array.isArray(result?.pendingApprovals)
                ? result.pendingApprovals[0]
                : (Array.isArray(result?.sessions) ? result.sessions.find((item: AuthSessionDevice) => item.approvalStatus === "pending") : null);
            setDevice(pending || null);
        } catch {
            setDevice(null);
        }
    }, []);

    useEffect(() => {
        void loadDevices();
        const timer = window.setInterval(loadDevices, 60000);
        return () => window.clearInterval(timer);
    }, [loadDevices]);

    const trustDevice = async () => {
        if (!device) return;
        try {
            setWorking(true);
            await authService.updateAuthSession(device.id, { trusted: true });
            setDevice(null);
        } finally {
            setWorking(false);
        }
    };

    const denyDevice = async () => {
        if (!device) return;
        try {
            setWorking(true);
            await authService.updateAuthSession(device.id, { trusted: false });
            setDevice(null);
        } finally {
            setWorking(false);
        }
    };

    if (!device) return null;

    return (
        <div className="fixed inset-0 z-[170] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
            <div className="relative w-full max-w-md overflow-hidden rounded-[2rem] border border-amber-300/25 bg-[#111114] shadow-[0_30px_90px_rgba(0,0,0,0.65)]">
                <div className="border-b border-white/8 px-5 py-4">
                    <div className="flex items-start gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-400/10 text-amber-200">
                            <IonIcon name="shield-checkmark-outline" className="text-xl" />
                        </span>
                        <div>
                            <h3 className="text-base font-black text-white">A new device is trying to access your account.</h3>
                            <p className="mt-1 text-xs leading-5 text-white/50">Approve the request only when you recognize the device and location.</p>
                        </div>
                    </div>
                </div>
                <div className="space-y-3 px-5 py-5">
                    <div className="rounded-3xl border border-white/[0.08] bg-white/[0.03] p-4">
                        <p className="text-sm font-black text-white">{device.deviceName}</p>
                        <p className="mt-1 text-xs text-white/45">{device.browser} on {device.operatingSystem} | {device.deviceType}</p>
                        <p className="mt-1 text-xs text-white/45">{formatLocation(device)} | {device.ipAddress || "Unknown IP"}</p>
                        <p className="mt-1 text-[11px] text-white/35">Login time {formatDateTime(device.loginAt)}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <button type="button" onClick={trustDevice} disabled={working} className="rounded-2xl bg-white px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-black transition hover:bg-zinc-200 disabled:opacity-50">
                            Trust Device
                        </button>
                        <button type="button" onClick={denyDevice} disabled={working} className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-red-200 transition hover:bg-red-500/15 disabled:opacity-50">
                            Don&apos;t Trust
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
