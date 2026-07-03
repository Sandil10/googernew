"use client";

import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import IonIcon from "@/app/components/IonIcon";
import { chatService } from "@/services/chatService";
import { authService } from "@/services/authService";
import { UserVerifiedBadge } from "@/app/components/VerifiedBadge";

const getProfileImageSrc = (profilePicture?: string | null, name?: string) => {
    if (profilePicture) {
        if (profilePicture.startsWith("http") || profilePicture.startsWith("data:")) return profilePicture;
        return `/uploads/${profilePicture.split(/[\\/]/).pop()}`;
    }
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || "User")}&background=1c1917&color=f5c76b`;
};

export default function GlobalIncomingCallOverlay() {
    const router = useRouter();
    const pathname = usePathname();
    const [incomingCall, setIncomingCall] = useState<any>(null);
    const dismissedCallIdsRef = useRef<Set<string>>(new Set());
    const mountedRef = useRef(true);
    const intervalRef = useRef<number | null>(null);

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    useEffect(() => {
        if (!authService.isAuthenticated()) return;

        const poll = async () => {
            if (!mountedRef.current) return;
            try {
                const calls = await chatService.getIncomingCalls();
                if (!mountedRef.current) return;
                const latest = Array.isArray(calls) ? calls[0] : null;
                const latestId = latest?.id ? String(latest.id) : null;
                if (latestId && !dismissedCallIdsRef.current.has(latestId)) {
                    setIncomingCall(latest);
                } else {
                    setIncomingCall(null);
                }
            } catch {
                if (mountedRef.current) setIncomingCall(null);
            }
        };

        void poll();
        // Fast polling: 1200ms on all pages so calls appear quickly everywhere
        intervalRef.current = window.setInterval(poll, 1200);
        return () => {
            if (intervalRef.current) window.clearInterval(intervalRef.current);
        };
        // Re-run when pathname changes so we always have a fresh interval on route change
    }, [pathname]);

    if (!incomingCall) return null;

    const caller = incomingCall.participant || {};
    const callerId = incomingCall.caller_id || caller.id;
    const callerName = caller.name || caller.username || "Incoming call";
    const callerImage = getProfileImageSrc(caller.profile_picture, callerName);
    const isVideo = incomingCall.call_type === "video";

    const dismiss = (callId: string) => {
        dismissedCallIdsRef.current.add(callId);
        setIncomingCall(null);
    };

    const rejectCall = async () => {
        const callId = String(incomingCall.id);
        dismiss(callId);
        try { await chatService.rejectCall(Number(incomingCall.id)); } catch { /* non-critical */ }
    };

    const acceptCall = () => {
        dismiss(String(incomingCall.id));
        router.push(`/dashboard/chats?user=${encodeURIComponent(String(callerId || ""))}`);
    };

    return (
        <div className="fixed inset-0 z-[300] flex flex-col items-center justify-between overflow-hidden text-white"
            style={{ background: "linear-gradient(180deg, #0a1a0a 0%, #0d0d0d 60%, #1a0a0a 100%)" }}
        >
            {/* Animated top glow */}
            <div className="pointer-events-none absolute inset-0">
                <div className="absolute left-1/2 top-0 h-[340px] w-[340px] -translate-x-1/2 rounded-full opacity-25"
                    style={{ background: "radial-gradient(circle, #22c55e 0%, transparent 70%)", filter: "blur(40px)" }}
                />
                <div className="absolute bottom-0 left-1/2 h-[260px] w-[260px] -translate-x-1/2 rounded-full opacity-20"
                    style={{ background: "radial-gradient(circle, #ef4444 0%, transparent 70%)", filter: "blur(40px)" }}
                />
            </div>

            {/* Top section — caller info */}
            <div className="relative z-10 flex flex-col items-center pt-20 pb-8 text-center px-6">
                {/* Pulsing ring behind avatar */}
                <div className="relative mb-5">
                    <span className="absolute inset-0 rounded-full border-2 border-green-400/30 animate-ping" style={{ borderRadius: "9999px" }} />
                    <span className="absolute -inset-3 rounded-full border border-green-400/15 animate-ping" style={{ animationDelay: "0.3s", borderRadius: "9999px" }} />
                    <div className="relative h-28 w-28 overflow-hidden rounded-full border-4 border-green-400/40 shadow-[0_0_40px_rgba(34,197,94,0.35)]">
                        <Image
                            src={callerImage}
                            alt={callerName}
                            fill
                            className="object-cover"
                            unoptimized
                        />
                    </div>
                </div>

                <p className="text-[11px] font-black uppercase tracking-[0.28em] text-green-400/80 mb-2">
                    Incoming {isVideo ? "Video" : "Voice"} Call
                </p>
                <div className="mb-1 flex max-w-[260px] items-center justify-center gap-1.5">
                    <h2 className="truncate text-2xl font-black tracking-tight text-white">
                        {callerName}
                    </h2>
                    {callerId && <UserVerifiedBadge userId={callerId} size={14} />}
                </div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">
                    End-to-end encrypted
                </p>

                {/* Animated wave bars — indicates ringing */}
                <div className="mt-5 flex items-end gap-1 h-6">
                    {[0.5, 0.8, 1, 0.7, 0.9, 0.6, 1, 0.75].map((h, i) => (
                        <span
                            key={i}
                            className="w-1 rounded-full bg-green-400/60"
                            style={{
                                height: `${h * 100}%`,
                                animation: `wave 1.1s ease-in-out infinite`,
                                animationDelay: `${i * 0.12}s`,
                            }}
                        />
                    ))}
                </div>
            </div>

            {/* Bottom section — action buttons */}
            <div className="relative z-10 w-full px-8 pb-16">
                <div className="flex items-center justify-around">
                    {/* Decline — red */}
                    <div className="flex flex-col items-center gap-3">
                        <button
                            type="button"
                            onClick={rejectCall}
                            aria-label="Decline call"
                            className="flex h-[72px] w-[72px] items-center justify-center rounded-full shadow-[0_8px_32px_rgba(239,68,68,0.45)] transition active:scale-90"
                            style={{ background: "linear-gradient(135deg, #dc2626 0%, #ef4444 100%)" }}
                        >
                            <IonIcon name="call" className="text-[28px] text-white rotate-[135deg]" />
                        </button>
                        <span className="text-[11px] font-bold uppercase tracking-widest text-red-400/80">Decline</span>
                    </div>

                    {/* Accept — green */}
                    <div className="flex flex-col items-center gap-3">
                        <button
                            type="button"
                            onClick={acceptCall}
                            aria-label="Accept call"
                            className="flex h-[72px] w-[72px] items-center justify-center rounded-full shadow-[0_8px_32px_rgba(34,197,94,0.45)] transition active:scale-90"
                            style={{ background: "linear-gradient(135deg, #16a34a 0%, #22c55e 100%)" }}
                        >
                            <IonIcon name={isVideo ? "videocam" : "call"} className="text-[28px] text-white" />
                        </button>
                        <span className="text-[11px] font-bold uppercase tracking-widest text-green-400/80">Accept</span>
                    </div>
                </div>
            </div>

            <style>{`
                @keyframes wave {
                    0%, 100% { transform: scaleY(0.4); opacity: 0.5; }
                    50% { transform: scaleY(1); opacity: 1; }
                }
            `}</style>
        </div>
    );
}
