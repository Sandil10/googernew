"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import IonIcon from "@/app/components/IonIcon";
import { authService } from "@/services/authService";
import { chatService } from "@/services/chatService";

type OrderChatPopupProps = {
    participantId: string;
    participantName: string;
    roleLabel: string;
    orderLabel?: string;
    productStatusId?: string;
    onClose: () => void;
};

const formatMessageTime = (value?: string | null) => {
    if (!value) return "";
    try {
        return new Date(value).toLocaleString("en-US", {
            month: "numeric",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
            second: "2-digit",
        });
    } catch {
        return "";
    }
};

export default function OrderChatPopup({
    participantId,
    participantName,
    roleLabel,
    orderLabel,
    productStatusId,
    onClose,
}: OrderChatPopupProps) {
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [messages, setMessages] = useState<any[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement | null>(null);

    const numericParticipantId = Number(participantId);
    const currentUserName = currentUser?.full_name || currentUser?.username || currentUser?.name || "Admin";
    const displayParticipantName = useMemo(() => {
        for (let index = messages.length - 1; index >= 0; index -= 1) {
            const message = messages[index];
            if (String(message.sender_id || "") === String(numericParticipantId) && message.sender_name) {
                return message.sender_name;
            }

            if (
                String(message.receiver_id || "") === String(numericParticipantId) &&
                message.receiver_name &&
                message.receiver_name !== "Googer Support"
            ) {
                return message.receiver_name;
            }
        }

        return participantName;
    }, [messages, numericParticipantId, participantName]);

    const loadMessages = useCallback(async (markSeen = true) => {
        if (!numericParticipantId) return;
        try {
            const data = await chatService.getMessages(numericParticipantId, markSeen, productStatusId);
            setMessages(Array.isArray(data) ? data : []);
            setError(null);
        } catch {
            setError("Unable to load chat.");
        } finally {
            setLoading(false);
        }
    }, [numericParticipantId, productStatusId]);

    useEffect(() => {
        let mounted = true;
        authService.getProfile()
            .then(profile => { if (mounted) setCurrentUser(profile); })
            .catch(() => {});
        return () => { mounted = false; };
    }, []);

    useEffect(() => {
        if (!numericParticipantId) return;
        let mounted = true;
        const refresh = async () => {
            if (!mounted) return;
            await loadMessages(true);
            chatService.updatePresence(numericParticipantId, productStatusId).catch(() => {});
        };
        refresh();
        const intervalId = window.setInterval(() => { void refresh(); }, 1800);
        return () => {
            mounted = false;
            window.clearInterval(intervalId);
            chatService.updatePresence(null, null).catch(() => {});
        };
    }, [numericParticipantId, loadMessages, productStatusId]);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, [messages.length]);

    const send = async () => {
        const text = input.trim();
        if (!text || !numericParticipantId || sending) return;
        setSending(true);
        setInput("");
        try {
            await chatService.sendMessage({ receiverId: numericParticipantId, type: "text", text, productStatusId });
            await loadMessages(false);
            setError(null);
        } catch {
            setInput(text);
            setError("Message failed. Please try again.");
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-0 sm:p-4">
            <div className="relative w-full h-full sm:h-[650px] sm:max-w-[640px] bg-[#080809] border border-white/10 sm:rounded-[24px] overflow-hidden shadow-2xl flex flex-col">
                <div className="h-[86px] px-6 py-4 border-b border-white/10 flex items-start justify-between shrink-0">
                    <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-violet-400 mb-1">
                            {roleLabel}
                        </p>
                        <h2 className="text-lg font-black uppercase tracking-tight text-white truncate">
                            {displayParticipantName}
                        </h2>
                        {orderLabel && (
                            <p className="text-[11px] font-semibold text-white/30 mt-1 truncate">{orderLabel}</p>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-11 h-11 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-white/45 hover:text-white flex items-center justify-center transition-all"
                        title="Close"
                    >
                        <IonIcon name="close-outline" className="text-xl" />
                    </button>
                </div>

                <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
                    {loading ? (
                        <div className="h-full flex items-center justify-center text-white/25">
                            <IonIcon name="reload-outline" className="text-2xl animate-spin" />
                        </div>
                    ) : messages.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-center">
                            <div>
                                <IonIcon name="chatbubble-ellipses-outline" className="text-5xl text-white/10 mb-3" />
                                <p className="text-[10px] font-black uppercase tracking-widest text-white/25">Start chatting</p>
                            </div>
                        </div>
                    ) : (
                        messages.map((message) => {
                            const isMine = String(message.sender_id) === String(currentUser?.id);
                            const senderName = isMine
                                ? (message.sender_name || currentUserName)
                                : (message.sender_name || displayParticipantName);
                            return (
                                <div key={message.id || `${message.created_at}-${message.text}`} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                                    <div className={`max-w-[78%] rounded-[18px] border px-5 py-4 ${
                                        isMine
                                            ? "bg-emerald-500/20 border-emerald-500/30 text-white"
                                            : "bg-[#171719] border-white/10 text-white"
                                    }`}>
                                        <p className={`text-[10px] font-black uppercase tracking-[0.16em] mb-2 ${isMine ? "text-white/50" : "text-white/40"}`}>
                                            {senderName}
                                        </p>
                                        <p className="text-[13px] font-bold leading-relaxed break-words whitespace-pre-wrap">
                                            {message.text || message.file_name || ""}
                                        </p>
                                        <p className="text-[10px] font-semibold text-white/35 mt-2">
                                            {formatMessageTime(message.created_at)}
                                        </p>
                                    </div>
                                </div>
                            );
                        })
                    )}
                    {error && (
                        <p className="text-center text-[10px] font-bold text-red-400">{error}</p>
                    )}
                </div>

                <div className="h-[105px] border-t border-white/10 px-5 py-4 shrink-0">
                    <div className="flex items-center gap-3 h-full">
                        <input
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    void send();
                                }
                            }}
                            placeholder={`Message ${displayParticipantName}...`}
                            className="flex-1 h-[72px] rounded-[20px] bg-black border border-white/10 px-5 text-[13px] font-bold text-white placeholder:text-white/15 focus:outline-none focus:border-white/25"
                        />
                        <button
                            type="button"
                            onClick={() => void send()}
                            disabled={!input.trim() || sending}
                            className="w-[74px] h-[72px] rounded-[20px] bg-white/45 hover:bg-white/60 disabled:bg-white/20 disabled:text-black/30 text-black flex items-center justify-center transition-all active:scale-95"
                            title="Send"
                        >
                            <IonIcon name="send-outline" className="text-3xl" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
