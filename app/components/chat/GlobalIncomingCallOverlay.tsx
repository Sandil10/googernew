"use client";

import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import IonIcon from "@/app/components/IonIcon";
import { chatService } from "@/services/chatService";
import { authService } from "@/services/authService";

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
    const [dismissedCallId, setDismissedCallId] = useState<string | null>(null);

    const isChatPage = pathname?.startsWith("/dashboard/chats");

    useEffect(() => {
        if (isChatPage || !authService.isAuthenticated()) {
            setIncomingCall(null);
            return;
        }

        let mounted = true;

        const pollIncomingCall = async () => {
            try {
                const calls = await chatService.getIncomingCalls();
                if (!mounted) return;
                const latest = Array.isArray(calls) ? calls[0] : null;
                const latestId = latest?.id ? String(latest.id) : null;
                setIncomingCall(latestId && latestId !== dismissedCallId ? latest : null);
            } catch {
                if (mounted) setIncomingCall(null);
            }
        };

        void pollIncomingCall();
        const intervalId = window.setInterval(pollIncomingCall, 3500);

        return () => {
            mounted = false;
            window.clearInterval(intervalId);
        };
    }, [dismissedCallId, isChatPage]);

    if (!incomingCall) return null;

    const caller = incomingCall.participant || {};
    const callerId = incomingCall.caller_id || caller.id;
    const callerName = caller.name || caller.username || "Incoming call";
    const isVideo = incomingCall.call_type === "video";

    const rejectCall = async () => {
        const callId = String(incomingCall.id);
        setDismissedCallId(callId);
        setIncomingCall(null);
        try {
            await chatService.rejectCall(Number(incomingCall.id));
        } catch {
            // non-critical; the chat page/backend poll will normalize stale calls
        }
    };

    const acceptCall = () => {
        setDismissedCallId(String(incomingCall.id));
        setIncomingCall(null);
        router.push(`/dashboard/chats?user=${encodeURIComponent(String(callerId || ""))}`);
    };

    const openMessage = () => {
        setDismissedCallId(String(incomingCall.id));
        setIncomingCall(null);
        router.push(`/dashboard/chats?user=${encodeURIComponent(String(callerId || ""))}`);
    };

    return (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-[#17110d]/95 px-6 py-8 text-white backdrop-blur-xl">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(245,158,11,0.16),transparent_34%),linear-gradient(180deg,rgba(28,25,23,0.18),rgba(12,10,9,0.96))]" />
            <div className="relative flex h-full w-full max-w-sm flex-col items-center justify-between">
                <div className="mt-10 flex flex-col items-center text-center">
                    <div className="relative h-24 w-24 overflow-hidden rounded-[2rem] border border-amber-300/20 bg-white/5 shadow-[0_24px_70px_rgba(0,0,0,0.45)]">
                        <Image
                            src={getProfileImageSrc(caller.profile_picture, callerName)}
                            alt={callerName}
                            fill
                            className="object-cover"
                            unoptimized
                        />
                    </div>
                    <h2 className="mt-5 max-w-[260px] truncate text-lg font-black tracking-tight text-white">
                        {callerName}
                    </h2>
                    <p className="mt-2 text-[10px] font-black uppercase tracking-[0.22em] text-amber-200/70">
                        Incoming {isVideo ? "video" : "voice"} call
                    </p>
                    <p className="mt-2 text-[9px] font-bold uppercase tracking-[0.18em] text-white/35">
                        End-to-end encrypted
                    </p>
                </div>

                <div className="mb-10 flex w-full flex-col items-center">
                    <div className="mb-5 flex flex-col items-center gap-1 text-amber-100/35">
                        <IonIcon name="chevron-up-outline" className="text-sm animate-bounce" />
                        <IonIcon name="chevron-up-outline" className="-mt-3 text-sm animate-bounce" />
                    </div>

                    <div className="grid w-full grid-cols-3 items-end gap-4">
                        <button
                            type="button"
                            onClick={rejectCall}
                            className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-red-400/20 bg-red-500/15 text-red-300 shadow-[0_16px_40px_rgba(0,0,0,0.35)] transition active:scale-95"
                            aria-label="Reject call"
                        >
                            <IonIcon name="call" className="rotate-[135deg] text-xl" />
                        </button>

                        <button
                            type="button"
                            onClick={acceptCall}
                            className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-amber-200/35 bg-amber-400 text-black shadow-[0_22px_60px_rgba(245,158,11,0.32)] transition active:scale-95"
                            aria-label="Accept call"
                        >
                            <IonIcon name={isVideo ? "videocam" : "call"} className="text-3xl" />
                        </button>

                        <button
                            type="button"
                            onClick={openMessage}
                            className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white/70 shadow-[0_16px_40px_rgba(0,0,0,0.35)] transition active:scale-95"
                            aria-label="Open chat"
                        >
                            <IonIcon name="chatbox-ellipses" className="text-xl" />
                        </button>
                    </div>

                    <p className="mt-5 text-[10px] font-bold text-white/35">
                        Tap the center button to accept
                    </p>
                </div>
            </div>
        </div>
    );
}
