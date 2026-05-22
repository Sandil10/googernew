"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { authService } from "@/services/authService";
import IonIcon from "@/app/components/IonIcon";
import { walletService } from "@/services/walletService";
import { chatService } from "@/services/chatService";
import { useSubscriptionFeatures, refreshSubscriptionFeatures } from "@/app/lib/subscriptionFeatures";
import { ChatRichText, CHAT_COLOR_PALETTE, wrapWithColorTag } from "@/app/components/chat/ChatRichText";

const getProfileImageSrc = (profilePicture?: string | null, name?: string) => {
    if (profilePicture) {
        if (profilePicture.startsWith("http") || profilePicture.startsWith("data:")) {
            return profilePicture;
        }
        return `/uploads/${profilePicture.split(/[\\/]/).pop()}`;
    }
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || "User")}&background=111827&color=ffffff`;
};

const getConversationKey = (currentUserId?: number | string | null, participantId?: number | string | null) => {
    if (!currentUserId || !participantId) return null;
    const members = [String(currentUserId), String(participantId)].sort();
    return `googer-chat-${members.join("-")}`;
};

const stripColorTags = (text: string) =>
    String(text || "").replace(/\[c=[^\]]+\]/gi, "").replace(/\[\/c\]/gi, "").trim();

const getMessagePreview = (message: any) => {
    if (!message) return "No messages yet";
    if (message.type === "image") return "Sent an image";
    if (message.type === "sticker") return "Sent a sticker 🎨";
    if (message.type === "call") return message.text || "Call update";
    if (message.type === "call_record") return message.text || "Call update";
    return stripColorTags(message.text) || "New message";
};

const getPresenceKey = (userId?: number | string | null) => {
    if (!userId) return null;
    return `googer-chat-presence-${userId}`;
};

const getActiveChatKey = (userId?: number | string | null) => {
    if (!userId) return null;
    return `googer-chat-active-${userId}`;
};

const getChatRecentKey = (userId?: number | string | null, participantId?: number | string | null) => {
    if (!userId || !participantId) return null;
    return `googer-chat-recent-${userId}-${participantId}`;
};

const MIN_CHAT_SEARCH_QUERY_LENGTH = 2;

export default function ChatsPage() {
    const searchParams = useSearchParams();
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [conversationList, setConversationList] = useState<any[]>([]);
    const [activeConversation, setActiveConversation] = useState<any>(null);
    const [messages, setMessages] = useState<any[]>([]);
    const [messageInput, setMessageInput] = useState("");
    const [callMode, setCallMode] = useState<"voice" | "video" | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [showNewChatPanel, setShowNewChatPanel] = useState(false);
    const [newChatQuery, setNewChatQuery] = useState("");
    const [newChatResults, setNewChatResults] = useState<any[]>([]);
    const [newChatLoading, setNewChatLoading] = useState(false);
    const [participantPresence, setParticipantPresence] = useState<{ status: "online" | "offline"; lastSeen: number | null }>({
        status: "offline",
        lastSeen: null,
    });
    const chatImageInputRef = useRef<HTMLInputElement | null>(null);
    const messageTextareaRef = useRef<HTMLTextAreaElement | null>(null);
    const contentEditableRef = useRef<HTMLDivElement | null>(null);
    const savedRangeRef = useRef<Range | null>(null);
    const speechRecognitionRef = useRef<any>(null);
    const [isListening, setIsListening] = useState(false);
    const [speakingMessageId, setSpeakingMessageId] = useState<number | string | null>(null);
    const features = useSubscriptionFeatures();
    const [showMobileChat, setShowMobileChat] = useState(false);
    const [videoQuality, setVideoQuality] = useState<"240p" | "360p">("240p");
    const [stickerPanelOpen, setStickerPanelOpen] = useState(false);
    const [stickerLockMessage, setStickerLockMessage] = useState<string | null>(null);
    const [colorPickerOpen, setColorPickerOpen] = useState(false);
    const [pickedColor, setPickedColor] = useState("#ef4444");
    const [activeTypingColor, setActiveTypingColor] = useState<string | null>(null);
    const [activeStickerCategory, setActiveStickerCategory] = useState<string>("trending");
    const [giphyStickers, setGiphyStickers] = useState<{ id: string; url: string; title: string }[]>([]);
    const [giphyLoading, setGiphyLoading] = useState(false);
    const [pendingAttachments, setPendingAttachments] = useState<any[]>([]);
    const [isUploadingAttachments, setIsUploadingAttachments] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [pendingDeleteMessageId, setPendingDeleteMessageId] = useState<number | string | null>(null);
    const [callHistory, setCallHistory] = useState<any[]>([]);
    const [incomingCall, setIncomingCall] = useState<any>(null);
    const [activeCall, setActiveCall] = useState<any>(null);
    const [callError, setCallError] = useState<string | null>(null);
    const [callPhase, setCallPhase] = useState<"idle" | "outgoing" | "incoming" | "connecting" | "active" | "ended">("idle");
    const [isRinging, setIsRinging] = useState(false);

    const callPeerRef = useRef<RTCPeerConnection | null>(null);
    const callLocalStreamRef = useRef<MediaStream | null>(null);
    const callRemoteStreamRef = useRef<MediaStream | null>(null);
    const callSignalsSinceRef = useRef<number>(0);
    const callPollIntervalRef = useRef<number | null>(null);
    const ringtoneIntervalRef = useRef<number | null>(null);
    const ringtoneAudioContextRef = useRef<AudioContext | null>(null);
    const localVideoRef = useRef<HTMLVideoElement | null>(null);
    const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
    const activeConversationRef = useRef<any>(null);
    const preferredParticipantIdRef = useRef<string>("");

    const formatMessageTime = (value?: string) =>
        new Date(value || Date.now()).toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
        });

    const formatLastSeen = (value?: number | null) => {
        if (!value) return "Offline";
        return `Last seen ${new Date(value).toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
        })}`;
    };

    const getStatusTicks = (status?: string) => {
        if (status === "sending") {
            return { label: "sending", icon: "", className: "text-white/35" };
        }
        if (status === "read") {
            return { label: "read", icon: "✓✓", className: "text-sky-400" };
        }
        if (status === "delivered") {
            return { label: "delivered", icon: "✓✓", className: "text-white/45" };
        }
        return { label: "sent", icon: "✓", className: "text-white/45" };
    };

    const resolveMessageStatus = (message: any) => {
        return message?.status || "sent";
    };

    const formatCallRecordText = (call: any) => {
        const base = call.call_type === "video" ? "Video Call" : "Voice Call";

        if (call.call_status === "missed") return `Missed ${base}`;
        if (call.call_status === "rejected") return `${base} rejected`;
        if (call.call_status === "completed") return base;
        if (call.call_status === "active") return `${base} (active)`;
        return `${base} (${call.call_status || "ringing"})`;
    };

    const stopRingtone = () => {
        setIsRinging(false);
        if (ringtoneIntervalRef.current) {
            window.clearInterval(ringtoneIntervalRef.current);
            ringtoneIntervalRef.current = null;
        }
        try {
            ringtoneAudioContextRef.current?.close?.();
        } catch { }
        ringtoneAudioContextRef.current = null;
    };

    const startRingtone = () => {
        if (isRinging) return;
        setIsRinging(true);

        try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            ringtoneAudioContextRef.current = ctx;

            const beep = () => {
                try {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = "sine";
                    osc.frequency.value = 880;
                    gain.gain.value = 0.05;
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start();
                    osc.stop(ctx.currentTime + 0.18);
                } catch { }
            };

            ctx.resume?.().catch(() => { });
            beep();
            ringtoneIntervalRef.current = window.setInterval(beep, 900);
        } catch { }
    };

    const cleanupCall = async (stopRemote: boolean = true) => {
        stopRingtone();
        if (callPollIntervalRef.current) {
            window.clearInterval(callPollIntervalRef.current);
            callPollIntervalRef.current = null;
        }
        callSignalsSinceRef.current = 0;

        try {
            callPeerRef.current?.close?.();
        } catch { }
        callPeerRef.current = null;

        if (callLocalStreamRef.current) {
            callLocalStreamRef.current.getTracks().forEach((track) => track.stop());
        }
        callLocalStreamRef.current = null;

        if (stopRemote && callRemoteStreamRef.current) {
            callRemoteStreamRef.current.getTracks().forEach((track) => track.stop());
        }
        callRemoteStreamRef.current = null;

        if (localVideoRef.current) localVideoRef.current.srcObject = null;
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    };

    const createPeerConnection = (callId: number, otherUserId: number) => {
        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" },
                { urls: "stun:stun1.l.google.com:19302" },
            ],
        });

        pc.onicecandidate = (event) => {
            if (!event.candidate) return;
            chatService.sendSignal(callId, otherUserId, "ice-candidate", { candidate: event.candidate }).catch(() => { });
        };

        pc.ontrack = (event) => {
            const stream = event.streams?.[0];
            if (!stream) return;
            callRemoteStreamRef.current = stream;
            if (remoteVideoRef.current) remoteVideoRef.current.srcObject = stream;
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === "connected") setCallPhase("active");
        };

        callPeerRef.current = pc;
        return pc;
    };

    const refreshConversations = async (preferredParticipantId?: string | null, preferredParticipant?: any | null) => {
        try {
            const summaries = await chatService.getConversations();
            const normalizedSummaries = Array.isArray(summaries)
                ? summaries.map((entry: any) => ({
                    ...entry,
                    conversation: [],
                }))
                : [];

            setConversationList(normalizedSummaries);

            const selectedId = String(
                preferredParticipantId ||
                preferredParticipantIdRef.current ||
                activeConversationRef.current?.id ||
                ""
            );
            const preferred = normalizedSummaries.find((entry: any) => String(entry.participant.id) === selectedId);
            const preservedActiveConversation =
                preferredParticipant && String(preferredParticipant.id) === selectedId
                    ? preferredParticipant
                    : activeConversationRef.current && String(activeConversationRef.current.id) === selectedId
                        ? activeConversationRef.current
                    : null;
            const fallback = preferred || preservedActiveConversation || normalizedSummaries[0] || null;

            if (!fallback) {
                setActiveConversation(null);
                activeConversationRef.current = null;
                preferredParticipantIdRef.current = "";
                setMessages([]);
                setParticipantPresence({ status: "offline", lastSeen: null });
                return;
            }

            const nextActiveConversation = preferred
                ? String(activeConversationRef.current?.id || "") === String(preferred.participant.id)
                    ? { ...activeConversationRef.current, ...preferred.participant }
                    : preferred.participant
                : fallback;

            preferredParticipantIdRef.current = String(nextActiveConversation?.id || "");
            activeConversationRef.current = nextActiveConversation;
            setActiveConversation(nextActiveConversation);
            setParticipantPresence({
                status: (preferred?.participant?.status || fallback?.status) === "online" ? "online" : "offline",
                lastSeen: preferred?.participant?.last_seen_at
                    ? new Date(preferred.participant.last_seen_at).getTime()
                    : fallback?.last_seen_at
                        ? new Date(fallback.last_seen_at).getTime()
                        : null,
            });
        } catch (refreshError) {
            console.error("Error loading conversations:", refreshError);
        }
    };

    useEffect(() => {
        const fetchUser = async () => {
            try {
                const profile = await authService.getProfile();
                setCurrentUser(profile);
            } catch (error) {
                console.error("Error loading chats profile:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchUser();
        // Always fetch fresh plan features on mount so sticker/color buttons
        // reflect the current subscription without requiring a full page reload.
        void refreshSubscriptionFeatures();
    }, []);

    useEffect(() => {
        if (!currentUser?.id) return;

        const initialPreferredParticipantId = String(preferredParticipantIdRef.current || searchParams?.get("user") || "");
        if (initialPreferredParticipantId) {
            preferredParticipantIdRef.current = initialPreferredParticipantId;
        }

        refreshConversations(initialPreferredParticipantId);
        const intervalId = window.setInterval(() => {
            refreshConversations(preferredParticipantIdRef.current || searchParams?.get("user") || "");
        }, 2000);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [currentUser?.id, searchParams]);

    useEffect(() => {
        const trimmedQuery = searchQuery.trim();

        if (!currentUser?.id || !trimmedQuery) {
            setSearchResults([]);
            setSearchLoading(false);
            return;
        }

        if (trimmedQuery.length < MIN_CHAT_SEARCH_QUERY_LENGTH) {
            setSearchResults([]);
            setSearchLoading(false);
            return;
        }

        let active = true;
        setSearchLoading(true);

        const timeoutId = window.setTimeout(async () => {
            try {
                const users = await walletService.searchUsers(trimmedQuery);
                if (!active) return;
                setSearchResults((users || []).filter((user: any) => String(user.id) !== String(currentUser.id)));
            } catch (error) {
                if (active) {
                    console.error("Chat search failed:", error);
                    setSearchResults([]);
                }
            } finally {
                if (active) setSearchLoading(false);
            }
        }, 250);

        return () => {
            active = false;
            window.clearTimeout(timeoutId);
        };
    }, [searchQuery, currentUser?.id]);

    useEffect(() => {
        const trimmedQuery = newChatQuery.trim();

        if (!currentUser?.id || !trimmedQuery) {
            setNewChatResults([]);
            setNewChatLoading(false);
            return;
        }

        if (trimmedQuery.length < MIN_CHAT_SEARCH_QUERY_LENGTH) {
            setNewChatResults([]);
            setNewChatLoading(false);
            return;
        }

        let active = true;
        setNewChatLoading(true);

        const timeoutId = window.setTimeout(async () => {
            try {
                const users = await walletService.searchUsers(trimmedQuery);
                if (!active) return;
                setNewChatResults((users || []).filter((user: any) => String(user.id) !== String(currentUser.id)));
            } catch (error) {
                if (active) {
                    console.error("New chat search failed:", error);
                    setNewChatResults([]);
                }
            } finally {
                if (active) setNewChatLoading(false);
            }
        }, 250);

        return () => {
            active = false;
            window.clearTimeout(timeoutId);
        };
    }, [newChatQuery, currentUser?.id]);

    useEffect(() => {
        if (!currentUser?.id) return;

        const writePresence = () => {
            chatService.updatePresence(activeConversation?.id ? Number(activeConversation.id) : null).catch(() => { });
        };

        writePresence();
        const intervalId = window.setInterval(writePresence, 8000);
        window.addEventListener("focus", writePresence);

        return () => {
            window.clearInterval(intervalId);
            window.removeEventListener("focus", writePresence);
        };
    }, [currentUser?.id, activeConversation?.id]);

    useEffect(() => {
        if (!currentUser?.id || !activeConversation?.id) return;

        let mounted = true;

        const loadMessages = async () => {
            try {
                const fetchedMessages = await chatService.getMessages(Number(activeConversation.id), true);
                if (!mounted) return;
                setMessages(Array.isArray(fetchedMessages) ? fetchedMessages : []);
            } catch (messageError) {
                if (mounted) {
                    console.error("Error loading messages:", messageError);
                }
            }
        };

        loadMessages();
        const intervalId = window.setInterval(loadMessages, 1500);

        return () => {
            mounted = false;
            window.clearInterval(intervalId);
        };
    }, [currentUser?.id, activeConversation?.id]);

    const persistMessages = (nextMessages: any[]) => {
        setMessages(nextMessages);
    };

    const visibleMessages = messages.filter(
        (message: any) =>
            !Array.isArray(message.deleted_for) ||
            !message.deleted_for.includes(String(currentUser?.id))
    );

    const callRecordMessages = useMemo(() => {
        if (!Array.isArray(callHistory) || !currentUser?.id || !activeConversation?.id) return [];

        return callHistory.map((call: any) => ({
            id: `call-${call.id}`,
            type: "call_record",
            call_id: call.id,
            call_type: call.call_type,
            call_status: call.call_status,
            caller_id: call.caller_id,
            receiver_id: call.receiver_id,
            sender_id: call.caller_id,
            sender_name: String(call.caller_id) === String(currentUser.id) ? "You" : (activeConversation?.name || "User"),
            text: formatCallRecordText(call),
            status: "delivered",
            created_at: call.created_at,
        }));
    }, [callHistory, currentUser?.id, activeConversation?.id]);

    const combinedMessages = useMemo(() => {
        const all = [...visibleMessages];
        const ids = new Set(all.map((m: any) => String(m.id)));
        for (const record of callRecordMessages) {
            if (!ids.has(String(record.id))) all.push(record);
        }
        return all.sort(
            (a: any, b: any) =>
                new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
        );
    }, [visibleMessages, callRecordMessages]);

    const handleOpenConversation = (participant: any, conversation: any[] = []) => {
        preferredParticipantIdRef.current = String(participant?.id || "");
        activeConversationRef.current = participant;
        setActiveConversation(participant);
        setShowMobileChat(true);
        setMessages(conversation);
        setParticipantPresence({
            status: participant?.status === "online" ? "online" : "offline",
            lastSeen: participant?.last_seen_at ? new Date(participant.last_seen_at).getTime() : null,
        });
        setCallMode(null);
        setShowNewChatPanel(false);
        setCallError(null);
        setPendingAttachments([]);
        setUploadError(null);
    };

    const persistParticipant = (_participant: any) => { };

    const handleStartConversation = (user: any) => {
        if (!currentUser?.id || !user?.id) return;

        const participant = {
            id: user.id,
            name: user.full_name || user.name || user.username || "User",
            profile_picture: user.profile_picture || null,
            roleLabel: user.user_type === "seller" ? "Seller" : "Buyer",
            username: user.username || null,
        };

        handleOpenConversation(participant, []);
        refreshConversations(String(participant.id), participant);
        setSearchQuery("");
        setSearchResults([]);
        setNewChatQuery("");
        setNewChatResults([]);
    };

    useEffect(() => {
        return () => {
            try { speechRecognitionRef.current?.stop?.(); } catch {}
            if (typeof window !== "undefined" && "speechSynthesis" in window) {
                try { window.speechSynthesis.cancel(); } catch {}
            }
        };
    }, []);

    const getEditableContent = (): string => {
        const el = contentEditableRef.current;
        if (!el) return messageInput;
        // Handle both <font color="..."> (execCommand output) and <span style="color:...">
        return el.innerHTML
            .replace(/<font color="([^"]+)">([\s\S]*?)<\/font>/gi, '[c=$1]$2[/c]')
            .replace(/<span[^>]*style="[^"]*color:\s*([^;"]+)[^"]*"[^>]*>([\s\S]*?)<\/span>/gi, '[c=$1]$2[/c]')
            .replace(/<div>/gi, '\n').replace(/<\/div>/gi, '')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
            .trim();
    };

    const clearEditable = () => {
        if (contentEditableRef.current) contentEditableRef.current.innerHTML = "";
        setMessageInput("");
        setActiveTypingColor(null);
    };

    // applyColorTag — uses execCommand so it:
    // 1. Colors any currently selected text
    // 2. Sets the typing color so ALL new text typed after is in that color
    const applyColorTag = (color: string) => {
        const el = contentEditableRef.current;
        if (!el) return;
        el.focus();
        document.execCommand("foreColor", false, color);
        setActiveTypingColor(color);
        setColorPickerOpen(false);
        setMessageInput(getEditableContent());
    };

    const toggleSpeechToText = () => {
        if (typeof window === "undefined") return;
        const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SR) {
            setUploadError("Voice input not supported in this browser.");
            setTimeout(() => setUploadError(null), 3000);
            return;
        }
        if (isListening && speechRecognitionRef.current) {
            try { speechRecognitionRef.current.stop(); } catch {}
            setIsListening(false);
            return;
        }
        const recognition = new SR();
        recognition.lang = "en-US";
        recognition.interimResults = true;
        recognition.continuous = true;
        let baseHTML = contentEditableRef.current?.innerHTML || "";
        recognition.onstart = () => { setIsListening(true); baseHTML = contentEditableRef.current?.innerHTML || ""; };
        recognition.onresult = (event: any) => {
            let finalText = "";
            let interim = "";
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const res = event.results[i];
                if (res.isFinal) finalText += res[0].transcript;
                else             interim   += res[0].transcript;
            }
            const el = contentEditableRef.current;
            if (!el) return;
            if (finalText) {
                el.innerHTML = baseHTML;
                const textNode = document.createTextNode((el.textContent?.trim() ? " " : "") + finalText.trim());
                el.appendChild(textNode);
                baseHTML = el.innerHTML;
                setMessageInput(getEditableContent());
            } else if (interim) {
                el.innerHTML = baseHTML;
                const textNode = document.createTextNode((el.textContent?.trim() ? " " : "") + interim);
                el.appendChild(textNode);
            }
        };
        recognition.onerror = () => { setIsListening(false); };
        recognition.onend   = () => { setIsListening(false); };
        speechRecognitionRef.current = recognition;
        try { recognition.start(); } catch { setIsListening(false); }
    };

    const STICKER_CATEGORIES = [
        { id: "trending", label: "🔥 Trending" },
        { id: "happy",    label: "😄 Happy" },
        { id: "love",     label: "❤️ Love" },
        { id: "funny",    label: "😂 Funny" },
        { id: "cute",     label: "🐱 Cute" },
    ];

    const fetchGiphyStickers = async (category: string) => {
        setGiphyLoading(true);
        setGiphyStickers([]);
        try {
            const token = localStorage.getItem("token") || "";
            const endpoint = category === "trending"
                ? "/api/stickers/trending"
                : `/api/stickers/search?q=${encodeURIComponent(category)}`;
            const resp = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
            if (!resp.ok) throw new Error("fetch failed");
            const json = await resp.json();
            setGiphyStickers(Array.isArray(json.stickers) ? json.stickers.filter((s: any) => s.url) : []);
        } catch {
            setGiphyStickers([]);
        } finally {
            setGiphyLoading(false);
        }
    };

    const handleStickerButtonClick = () => {
        const opening = !stickerPanelOpen;
        setStickerPanelOpen(opening);
        if (opening && features.chat_stickers) {
            fetchGiphyStickers(activeStickerCategory);
        }
    };

    const handleStickerCategoryChange = (cat: string) => {
        setActiveStickerCategory(cat);
        if (features.chat_stickers) fetchGiphyStickers(cat);
    };

    const sendSticker = async (stickerUrl: string) => {
        if (!activeConversation || !currentUser) return;
        const receiverId = Number(activeConversation.id);
        if (!receiverId) return;

        setStickerPanelOpen(false);

        setMessages((prev) => [
            ...prev,
            {
                id: Date.now() + Math.random(),
                type: "sticker",
                sender_id: currentUser.id,
                sender_name: currentUser.username || "You",
                text: stickerUrl,
                status: "sending",
                created_at: new Date().toISOString(),
            },
        ]);

        try {
            await chatService.sendMessage({ receiverId, type: "sticker", text: stickerUrl });
            const fresh = await chatService.getMessages(receiverId, false);
            setMessages(Array.isArray(fresh) ? fresh : []);
            refreshConversations(String(receiverId));
        } catch (err: any) {
            const msg = err?.message || String(err || "");
            if (/higher plan|stickers/i.test(msg)) {
                setStickerLockMessage("Stickers require Plan 02. Please upgrade.");
                setTimeout(() => setStickerLockMessage(null), 3500);
            } else {
                setUploadError(msg || "Unable to send sticker.");
                setTimeout(() => setUploadError(null), 3000);
            }
        }
    };

    const speakMessage = (id: number | string, raw: string) => {
        if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
        if (speakingMessageId === id) {
            window.speechSynthesis.cancel();
            setSpeakingMessageId(null);
            return;
        }
        window.speechSynthesis.cancel();
        const plain = String(raw || "").replace(/\[c=[^\]]+\]/g, "").replace(/\[\/c\]/g, "");
        const utter = new SpeechSynthesisUtterance(plain);
        utter.lang = "en-US";
        utter.onend = () => setSpeakingMessageId(null);
        utter.onerror = () => setSpeakingMessageId(null);
        setSpeakingMessageId(id);
        window.speechSynthesis.speak(utter);
    };

    const handleSendMessage = async () => {
        const trimmed = getEditableContent().trim();
        if ((!trimmed && pendingAttachments.length === 0) || !currentUser?.id || !activeConversation?.id) return;

        const nextMessages = [...messages];
        const receiverId = Number(activeConversation.id);

        if (trimmed) {
            nextMessages.push({
                id: Date.now(),
                type: "text",
                sender_id: currentUser.id,
                sender_name: currentUser.username || "You",
                text: trimmed,
                status: "sending",
                created_at: new Date().toISOString(),
            });
        }

        for (const attachment of pendingAttachments) {
            nextMessages.push({
                id: Date.now() + Math.random(),
                type: "image",
                sender_id: currentUser.id,
                sender_name: currentUser.username || "You",
                image_url: attachment.image_url,
                file_name: attachment.file_name,
                status: "sending",
                created_at: new Date().toISOString(),
            });
        }

        clearEditable();
        setPendingAttachments([]);
        setMessages(nextMessages);

        try {
            if (trimmed) {
                await chatService.sendMessage({
                    receiverId,
                    type: "text",
                    text: trimmed,
                });
            }

            for (const attachment of pendingAttachments) {
                await chatService.sendMessage({
                    receiverId,
                    type: "image",
                    image_url: attachment.image_url,
                    file_name: attachment.file_name,
                });
            }

            const [freshMessages] = await Promise.all([
                chatService.getMessages(receiverId, false),
                refreshConversations(String(receiverId)),
            ]);
            setMessages(Array.isArray(freshMessages) ? freshMessages : []);
        } catch (sendError) {
            console.error("Error sending message:", sendError);
            setUploadError(sendError instanceof Error ? sendError.message : "Unable to send message right now.");
        }
    };

    const appendCallRecordToLocalChat = (participantId: number, call: any) => {
        if (!currentUser?.id) return;
        const conversationKey = getConversationKey(currentUser.id, participantId);
        if (!conversationKey || typeof window === "undefined") return;

        const existing = JSON.parse(window.localStorage.getItem(conversationKey) || "[]");
        const recordId = `call-${call.id}`;
        if (existing.some((m: any) => String(m.id) === recordId)) return;

        const recordMessage = {
            id: recordId,
            type: "call_record",
            call_id: call.id,
            call_type: call.call_type,
            call_status: call.call_status,
            caller_id: call.caller_id,
            receiver_id: call.receiver_id,
            sender_id: call.caller_id,
            sender_name: String(call.caller_id) === String(currentUser.id) ? "You" : (call.participant?.name || "User"),
            text: formatCallRecordText(call),
            status: "delivered",
            created_at: call.created_at || new Date().toISOString(),
        };

        const next = [...existing, recordMessage];
        window.localStorage.setItem(conversationKey, JSON.stringify(next));
        if (String(activeConversation?.id || "") === String(participantId)) {
            setMessages(next);
        }
        refreshConversations(String(participantId));
    };

    const pollSignals = (callId: number) => {
        chatService.getSignals(callId, callSignalsSinceRef.current)
            .then(async (signals: any[]) => {
                if (!signals?.length) return;
                callSignalsSinceRef.current = Math.max(callSignalsSinceRef.current, ...signals.map((s: any) => Number(s.id)));

                for (const signal of signals) {
                    if (!callPeerRef.current) continue;
                    if (signal.signal_type === "answer" && signal.payload) {
                        const desc = new RTCSessionDescription(signal.payload);
                        if (!callPeerRef.current.currentRemoteDescription) {
                            await callPeerRef.current.setRemoteDescription(desc);
                        }
                    }
                    if (signal.signal_type === "ice-candidate" && signal.payload?.candidate) {
                        try {
                            await callPeerRef.current.addIceCandidate(new RTCIceCandidate(signal.payload.candidate));
                        } catch { }
                    }
                }
            })
            .catch(() => { });
    };

    const pollCallStatus = (callId: number) => {
        chatService.getCall(callId)
            .then((call: any) => {
                if (!call) return;
                setActiveCall((prev: any) => ({ ...(prev || {}), ...(call || {}) }));

                if (["missed", "rejected", "completed"].includes(call.call_status)) {
                    setCallPhase("ended");
                    cleanupCall();
                    setActiveCall(null);
                    setIncomingCall(null);

                    const participantId =
                        String(call.caller_id) === String(currentUser?.id)
                            ? Number(call.receiver_id)
                            : Number(call.caller_id);
                    if (participantId) appendCallRecordToLocalChat(participantId, call);
                }
            })
            .catch(() => { });
    };

    const startPollingForCall = (callId: number) => {
        if (callPollIntervalRef.current) {
            window.clearInterval(callPollIntervalRef.current);
            callPollIntervalRef.current = null;
        }
        callPollIntervalRef.current = window.setInterval(() => {
            pollSignals(callId);
            pollCallStatus(callId);
        }, 1200);
    };

    const availableQualities: ("240p" | "360p")[] = (() => {
        const q = String(features.video_call_quality || "");
        const out: ("240p" | "360p")[] = [];
        if (q.includes("240p")) out.push("240p");
        if (q.includes("360p")) out.push("360p");
        return out;
    })();

    const videoConstraints = (quality: "240p" | "360p") =>
        quality === "360p"
            ? { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { max: 30 } }
            : { width: { ideal: 426 }, height: { ideal: 240 }, frameRate: { max: 30 } };

    const handleChangeVideoQuality = async (q: "240p" | "360p") => {
        setVideoQuality(q);
        if (!callLocalStreamRef.current || !callPeerRef.current) return;
        try {
            const newStream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: videoConstraints(q),
            });
            const newTrack = newStream.getVideoTracks()[0];
            if (!newTrack) return;
            const sender = callPeerRef.current.getSenders().find(s => s.track?.kind === "video");
            if (sender) await sender.replaceTrack(newTrack);
            // swap out old video track in local stream
            callLocalStreamRef.current.getVideoTracks().forEach(t => { t.stop(); callLocalStreamRef.current!.removeTrack(t); });
            callLocalStreamRef.current.addTrack(newTrack);
            if (localVideoRef.current) localVideoRef.current.srcObject = callLocalStreamRef.current;
        } catch { /* ignore — keep current quality */ }
    };

    const startOutgoingCall = async (mode: "voice" | "video") => {
        setCallError(null);
        if (!currentUser?.id || !activeConversation?.id) return;

        try {
            setCallMode(mode);
            setCallPhase("connecting");
            await cleanupCall(false);

            const localStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: mode === "video" ? videoConstraints(videoQuality) : false,
            });
            callLocalStreamRef.current = localStream;
            if (localVideoRef.current) localVideoRef.current.srcObject = localStream;

            // Create peer connection and buffer ICE candidates until we have a call id.
            const pendingCandidates: any[] = [];
            const receiverId = Number(activeConversation.id);
            let callId: number | null = null;

            const pc = new RTCPeerConnection({
                iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
            });

            pc.ontrack = (event) => {
                const stream = event.streams?.[0];
                if (!stream) return;
                callRemoteStreamRef.current = stream;
                if (remoteVideoRef.current) remoteVideoRef.current.srcObject = stream;
            };

            pc.onicecandidate = (event) => {
                if (!event.candidate) return;
                if (!callId) {
                    pendingCandidates.push(event.candidate);
                    return;
                }
                chatService.sendSignal(callId, receiverId, "ice-candidate", { candidate: event.candidate }).catch(() => { });
            };

            pc.onconnectionstatechange = () => {
                if (pc.connectionState === "connected") setCallPhase("active");
            };

            callPeerRef.current = pc;
            localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            // Start call (stores offer in DB) and then flush buffered candidates.
            const started = await chatService.startCall(receiverId, mode, offer);
            const call = started?.call;
            if (!call?.id) throw new Error("Call start failed.");

            setActiveCall(call);
            setCallPhase("outgoing");
            callId = Number(call.id);

            if (pendingCandidates.length) {
                for (const candidate of pendingCandidates) {
                    chatService.sendSignal(callId, receiverId, "ice-candidate", { candidate }).catch(() => { });
                }
            }

            startPollingForCall(callId);
        } catch (err: any) {
            setCallError(err?.message || "Failed to start call.");
            setCallPhase("idle");
            await cleanupCall();
        }
    };

    const acceptIncomingCall = async () => {
        setCallError(null);
        if (!currentUser?.id || !incomingCall?.id || !incomingCall?.offer) return;

        try {
            stopRingtone();
            setCallPhase("connecting");
            await cleanupCall(false);

            const localStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: incomingCall.call_type === "video" ? videoConstraints(videoQuality) : false,
            });
            callLocalStreamRef.current = localStream;
            if (localVideoRef.current) localVideoRef.current.srcObject = localStream;

            const pc = createPeerConnection(Number(incomingCall.id), Number(incomingCall.caller_id));
            localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
            await pc.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            const accepted = await chatService.acceptCall(Number(incomingCall.id), answer);
            setActiveCall(accepted);
            setIncomingCall(null);
            setCallPhase("active");

            startPollingForCall(Number(incomingCall.id));
        } catch (err: any) {
            setCallError(err?.message || "Failed to accept call.");
            setCallPhase("idle");
            await cleanupCall();
        }
    };

    const rejectIncomingCall = async () => {
        setCallError(null);
        if (!currentUser?.id || !incomingCall?.id) return;

        try {
            stopRingtone();
            await chatService.rejectCall(Number(incomingCall.id));
            try {
                const updated = await chatService.getCall(Number(incomingCall.id));
                const participantId =
                    String(updated?.caller_id) === String(currentUser.id)
                        ? Number(updated?.receiver_id)
                        : Number(updated?.caller_id);
                if (participantId) appendCallRecordToLocalChat(participantId, updated);
            } catch { }
            setIncomingCall(null);
            setCallPhase("idle");
        } catch (err: any) {
            setCallError(err?.message || "Failed to reject call.");
        }
    };

    const hangUpCall = async () => {
        setCallError(null);
        if (!activeCall?.id) {
            await cleanupCall();
            setCallPhase("idle");
            setActiveCall(null);
            return;
        }

        try {
            await chatService.completeCall(Number(activeCall.id), "completed");
            try {
                const updated = await chatService.getCall(Number(activeCall.id));
                const participantId =
                    String(updated?.caller_id) === String(currentUser?.id)
                        ? Number(updated?.receiver_id)
                        : Number(updated?.caller_id);
                if (participantId) appendCallRecordToLocalChat(participantId, updated);
            } catch { }
        } catch { }

        await cleanupCall();
        setCallMode(null);
        setCallPhase("idle");
        setActiveCall(null);
    };

    const handleStartCall = (mode: "voice" | "video") => {
        if (!currentUser?.id || !activeConversation?.id) return;
        startOutgoingCall(mode);
    };

    const readFileAsDataUrl = (file: File) =>
        new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ""));
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });

    const handleSelectImages = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        event.target.value = "";
        if (!activeConversation?.id || !currentUser?.id || !files.length) return;
        setUploadError(null);
        setIsUploadingAttachments(true);
        const nextAttachments = [...pendingAttachments];

        try {
            for (const file of files) {
                if (file.size > 3 * 1024 * 1024) {
                    setUploadError("Image must be less than 3MB");
                    continue;
                }

                const imageUrl = await readFileAsDataUrl(file);
                nextAttachments.push({
                    id: Date.now() + Math.random(),
                    image_url: imageUrl,
                    file_name: file.name,
                });
            }
        } finally {
            setIsUploadingAttachments(false);
        }
        setPendingAttachments(nextAttachments);
    };

    const handleDeleteMessage = (messageId: number) => {
        const nextMessages = messages.map((message: any) =>
            message.id === messageId
                ? {
                    ...message,
                    deleted_for: [...new Set([...(message.deleted_for || []), String(currentUser?.id)])],
                }
                : message
        );
        persistMessages(nextMessages);
        setPendingDeleteMessageId(null);
    };

    useEffect(() => {
        if (!currentUser?.id || !activeConversation?.id) {
            setCallHistory([]);
            return;
        }

        let mounted = true;
        chatService.getCallHistory(Number(activeConversation.id))
            .then((history) => {
                if (!mounted) return;
                setCallHistory(Array.isArray(history) ? history : []);
            })
            .catch(() => {
                if (mounted) setCallHistory([]);
            });

        return () => {
            mounted = false;
        };
    }, [currentUser?.id, activeConversation?.id]);

    useEffect(() => {
        if (!currentUser?.id) return;

        let mounted = true;
        const pollIncoming = async () => {
            try {
                const calls = await chatService.getIncomingCalls();
                if (!mounted) return;
                const latest = Array.isArray(calls) ? calls[0] : null;
                if (latest?.id && (!incomingCall || String(incomingCall.id) !== String(latest.id))) {
                    setIncomingCall(latest);
                    setCallPhase("incoming");
                    startRingtone();
                }
            } catch { }
        };

        pollIncoming();
        const interval = window.setInterval(pollIncoming, 1500);
        return () => {
            mounted = false;
            window.clearInterval(interval);
        };
    }, [currentUser?.id, incomingCall?.id]);

    useEffect(() => {
        if (!currentUser?.id) return;

        let mounted = true;
        const pollSummaries = async () => {
            try {
                const summaries = await chatService.getCallSummaries();
                if (!mounted || !Array.isArray(summaries)) return;

                for (const entry of summaries) {
                    const participantId = Number(entry?.participant?.id);
                    const lastCall = entry?.last_call;
                    if (!participantId || !lastCall?.id) continue;

                    // Ensure missed/rejected/completed calls appear in chat list preview and history UI.
                    if (["missed", "rejected", "completed"].includes(lastCall.call_status)) {
                        appendCallRecordToLocalChat(participantId, {
                            ...lastCall,
                            participant: entry.participant,
                        });
                    }
                }
            } catch { }
        };

        pollSummaries();
        const interval = window.setInterval(pollSummaries, 4000);
        return () => {
            mounted = false;
            window.clearInterval(interval);
        };
    }, [currentUser?.id]);

    useEffect(() => {
        return () => {
            cleanupCall();
        };
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="w-10 h-10 rounded-full border-2 border-white/10 border-t-white animate-spin" />
            </div>
        );
    }

    return (
        <div className="-mx-3 sm:-mx-4 md:-mx-8 -my-5 sm:-my-6 h-[calc(100dvh-9rem)] md:h-[calc(100dvh-7rem)] overflow-hidden">
            <div className="grid h-full overflow-hidden md:grid-cols-[300px_1fr]">
                <aside className={`border-r border-white/10 bg-white/[0.02] flex-col min-h-0 ${showMobileChat ? "hidden" : "flex"} md:flex`}>
                    <div className="px-4 py-4 border-b border-white/10">
                        <h1 className="text-lg font-black text-white uppercase tracking-[0.2em]">Chats</h1>
                        <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mt-1">
                            Buyers & Sellers
                        </p>
                        <div className="mt-4 flex items-center gap-2">
                            <div className="relative flex-1">
                                <input
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search buyers or sellers"
                                    className="w-full bg-white/[0.03] border border-white/10 rounded-2xl pl-10 pr-4 py-3 text-[11px] text-white outline-none focus:ring-1 focus:ring-white/20 placeholder:text-white/20"
                                />
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30">
                                    <IonIcon name="search-outline" className="text-lg" />
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowNewChatPanel((prev) => !prev);
                                    setNewChatQuery("");
                                    setNewChatResults([]);
                                }}
                                className={`w-12 h-12 rounded-2xl border transition-all flex items-center justify-center ${showNewChatPanel ? "bg-white text-black border-white" : "bg-white/[0.03] text-white/70 border-white/10 hover:bg-white/[0.08]"}`}
                            >
                                <IonIcon name="add-outline" className="text-xl" />
                            </button>
                        </div>
                    </div>

                    {showNewChatPanel && (
                        <div className="px-4 pt-4 pb-3 border-b border-white/10 bg-white/[0.02]">
                            <div className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-3">
                                New Message
                            </div>
                            <div className="relative">
                                <input
                                    value={newChatQuery}
                                    onChange={(e) => setNewChatQuery(e.target.value)}
                                    placeholder="Search any user"
                                    className="w-full bg-white/[0.03] border border-white/10 rounded-2xl pl-10 pr-4 py-3 text-[11px] text-white outline-none focus:ring-1 focus:ring-white/20 placeholder:text-white/20"
                                />
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30">
                                    <IonIcon name="search-outline" className="text-lg" />
                                </div>
                            </div>

                            {newChatQuery.trim() && (
                                <div className="mt-3 space-y-2 max-h-56 overflow-y-auto">
                                    {newChatQuery.trim().length < MIN_CHAT_SEARCH_QUERY_LENGTH ? (
                                        <div className="text-[10px] font-bold text-white/30 uppercase tracking-widest px-2 py-3">
                                            Type at least {MIN_CHAT_SEARCH_QUERY_LENGTH} characters
                                        </div>
                                    ) : newChatLoading ? (
                                        <div className="text-[10px] font-bold text-white/30 uppercase tracking-widest px-2 py-3">
                                            Searching...
                                        </div>
                                    ) : newChatResults.length > 0 ? (
                                        newChatResults.map((user) => (
                                            <button
                                                key={`new-${user.id}`}
                                                type="button"
                                                onClick={() => handleStartConversation(user)}
                                                className="w-full text-left rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] px-3 py-3 transition-all"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="relative w-10 h-10 rounded-xl overflow-hidden bg-white/5 border border-white/10 shrink-0">
                                                        <Image
                                                            src={getProfileImageSrc(user.profile_picture, user.full_name || user.username)}
                                                            alt={user.full_name || user.username}
                                                            fill
                                                            className="object-cover"
                                                        />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="text-[10px] font-black text-white uppercase tracking-widest truncate">
                                                            {user.full_name || user.username}
                                                        </div>
                                                        <div className="text-[9px] text-white/40 font-bold truncate mt-1">
                                                            @{user.username}
                                                        </div>
                                                    </div>
                                                </div>
                                            </button>
                                        ))
                                    ) : (
                                        <div className="text-[10px] font-bold text-white/30 uppercase tracking-widest px-2 py-3">
                                            No users found
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                        {searchQuery.trim() ? (
                            searchQuery.trim().length < MIN_CHAT_SEARCH_QUERY_LENGTH ? (
                                <div className="h-full flex items-center justify-center text-center px-6">
                                    <div>
                                        <IonIcon name="search-outline" className="text-4xl text-white/15 mb-3" />
                                        <p className="text-[10px] font-black text-white/25 uppercase tracking-widest">
                                            Type at least {MIN_CHAT_SEARCH_QUERY_LENGTH} characters
                                        </p>
                                    </div>
                                </div>
                            ) : searchLoading ? (
                                <div className="text-[10px] font-bold text-white/30 uppercase tracking-widest px-3 py-3">
                                    Searching...
                                </div>
                            ) : searchResults.length > 0 ? (
                                searchResults.map((user) => (
                                    <button
                                        key={`search-${user.id}`}
                                        type="button"
                                        onClick={() => handleStartConversation(user)}
                                        className="w-full text-left rounded-[1rem] border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] px-3 py-2.5 transition-all"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="relative w-10 h-10 rounded-xl overflow-hidden bg-white/5 border border-white/10 shrink-0">
                                                <Image
                                                    src={getProfileImageSrc(user.profile_picture, user.full_name || user.username)}
                                                    alt={user.full_name || user.username}
                                                    fill
                                                    className="object-cover"
                                                />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="text-[10px] font-black text-white uppercase tracking-widest truncate">
                                                    {user.full_name || user.username}
                                                </div>
                                                <div className="text-[10px] text-white/45 font-bold truncate mt-1">
                                                    @{user.username}
                                                </div>
                                            </div>
                                        </div>
                                    </button>
                                ))
                            ) : (
                                <div className="h-full flex items-center justify-center text-center px-6">
                                    <div>
                                        <IonIcon name="search-outline" className="text-4xl text-white/15 mb-3" />
                                        <p className="text-[10px] font-black text-white/25 uppercase tracking-widest">
                                            No users found
                                        </p>
                                    </div>
                                </div>
                            )
                        ) : conversationList.length > 0 ? (
                            conversationList.map((entry) => {
                                const isActive = String(activeConversation?.id || "") === String(entry.participant.id);

                                return (
                                    <button
                                        key={entry.participant.id}
                                        type="button"
                                        onClick={() => handleOpenConversation(entry.participant, entry.conversation)}
                                        className={`w-full text-left rounded-[1rem] border px-2.5 py-2.5 transition-all ${isActive
                                            ? "bg-white/10 border-white/20"
                                            : "bg-white/[0.02] border-white/10 hover:bg-white/[0.05]"
                                            }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="relative w-8 h-8 rounded-xl overflow-hidden bg-white/5 border border-white/10 shrink-0">
                                                <Image
                                                    src={getProfileImageSrc(entry.participant.profile_picture, entry.participant.name)}
                                                    alt={entry.participant.name}
                                                    fill
                                                    className="object-cover"
                                                />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="text-[9px] font-black text-white uppercase tracking-widest truncate">
                                                        {entry.participant.name}
                                                    </div>
                                                    {entry.unread_count > 0 && (
                                                        <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-blue-500 text-white text-[8px] font-black flex items-center justify-center shrink-0">
                                                            {entry.unread_count}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-[9px] text-white/45 font-bold truncate mt-1">
                                                    {getMessagePreview(entry.lastMessage)}
                                                </div>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })
                        ) : (
                            <div className="h-full flex items-center justify-center text-center px-6">
                                <div>
                                    <IonIcon name="chatbubbles-outline" className="text-4xl text-white/15 mb-3" />
                                    <p className="text-[10px] font-black text-white/25 uppercase tracking-widest">
                                        No conversations yet
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </aside>

                <section className={`flex-col min-h-0 h-full overflow-hidden bg-transparent ${showMobileChat ? "flex" : "hidden"} md:flex`}>
                    {activeConversation ? (
                        <>
                            {incomingCall && (
                                <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
                                    <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#0f0f12] shadow-2xl overflow-hidden">
                                        <div className="p-5 border-b border-white/10 flex items-center gap-3">
                                            <div className="relative w-12 h-12 rounded-2xl overflow-hidden bg-white/5 border border-white/10 shrink-0">
                                                <Image
                                                    src={getProfileImageSrc(incomingCall.participant?.profile_picture, incomingCall.participant?.name)}
                                                    alt={incomingCall.participant?.name || "Caller"}
                                                    fill
                                                    className="object-cover"
                                                />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="text-[10px] font-black text-white uppercase tracking-[0.18em] truncate">
                                                    {incomingCall.participant?.name || "Incoming Call"}
                                                </div>
                                                <div className="text-[9px] font-black uppercase tracking-widest mt-1 text-white/40">
                                                    Incoming {incomingCall.call_type === "video" ? "Video" : "Voice"} Call
                                                </div>
                                            </div>
                                        </div>

                                        {callError && (
                                            <div className="px-5 pt-4 text-[10px] font-bold text-red-400">
                                                {callError}
                                            </div>
                                        )}

                                        <div className="p-5 flex items-center justify-center gap-3">
                                            <button
                                                type="button"
                                                onClick={rejectIncomingCall}
                                                className="flex-1 h-11 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-300 text-[9px] font-black uppercase tracking-widest hover:bg-red-500/25 transition-all"
                                            >
                                                Reject
                                            </button>
                                            <button
                                                type="button"
                                                onClick={acceptIncomingCall}
                                                className="flex-1 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[9px] font-black uppercase tracking-widest hover:bg-emerald-500/25 transition-all"
                                            >
                                                Accept
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeCall && (
                                <div className="fixed inset-0 z-[55] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
                                    <div className="w-full max-w-3xl rounded-3xl border border-white/10 bg-[#0f0f12] shadow-2xl overflow-hidden">
                                        <div className="p-4 border-b border-white/10 flex items-center justify-between gap-3">
                                            <div className="min-w-0 flex-1">
                                                <div className="text-[10px] font-black text-white uppercase tracking-[0.18em] truncate">
                                                    {activeConversation.name}
                                                </div>
                                                <div className="text-[9px] font-black uppercase tracking-widest mt-1 text-white/40">
                                                    {activeCall.call_type === "video" ? "Video" : "Voice"} Call • {callPhase === "outgoing" ? "Ringing" : callPhase === "connecting" ? "Connecting" : callPhase === "active" ? "Active" : "Ended"}
                                                </div>
                                            </div>
                                            {activeCall.call_type === "video" && availableQualities.length > 1 && (
                                                <div className="flex items-center gap-1 shrink-0">
                                                    {availableQualities.map((q) => (
                                                        <button
                                                            key={q}
                                                            type="button"
                                                            onClick={() => handleChangeVideoQuality(q)}
                                                            className={`px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${
                                                                videoQuality === q
                                                                    ? "bg-white text-black"
                                                                    : "bg-white/10 text-white/50 hover:bg-white/20"
                                                            }`}
                                                        >
                                                            {q}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                            <button
                                                type="button"
                                                onClick={hangUpCall}
                                                className="h-10 px-4 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-300 text-[9px] font-black uppercase tracking-widest hover:bg-red-500/25 transition-all shrink-0"
                                            >
                                                Hang Up
                                            </button>
                                        </div>

                                        {callError && (
                                            <div className="px-4 pt-3 text-[10px] font-bold text-red-400">
                                                {callError}
                                            </div>
                                        )}

                                        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="rounded-2xl border border-white/10 bg-black/40 overflow-hidden relative min-h-[220px]">
                                                {activeCall.call_type === "video" ? (
                                                    <video
                                                        ref={remoteVideoRef}
                                                        autoPlay
                                                        playsInline
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-white/30 text-[10px] font-black uppercase tracking-widest">
                                                        Voice call
                                                    </div>
                                                )}
                                                <div className="absolute left-3 top-3 text-[8px] font-black uppercase tracking-widest text-white/50">
                                                    Remote
                                                </div>
                                            </div>
                                            <div className="rounded-2xl border border-white/10 bg-black/40 overflow-hidden relative min-h-[220px]">
                                                {activeCall.call_type === "video" ? (
                                                    <video
                                                        ref={localVideoRef}
                                                        autoPlay
                                                        playsInline
                                                        muted
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-white/30 text-[10px] font-black uppercase tracking-widest">
                                                        Microphone on
                                                    </div>
                                                )}
                                                <div className="absolute left-3 top-3 text-[8px] font-black uppercase tracking-widest text-white/50">
                                                    You
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {pendingDeleteMessageId !== null && (
                                <div className="fixed inset-0 z-[58] bg-black/55 backdrop-blur-sm flex items-center justify-center p-4">
                                    <div className="w-full max-w-xs rounded-3xl border border-white/10 bg-[#101014] shadow-2xl p-5">
                                        <div className="text-[10px] font-black text-white uppercase tracking-[0.18em]">
                                            Delete This Message?
                                        </div>
                                        <div className="text-[9px] font-bold text-white/45 mt-2 uppercase tracking-widest">
                                            This removes it from your chat view.
                                        </div>
                                        <div className="mt-4 flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setPendingDeleteMessageId(null)}
                                                className="flex-1 h-10 rounded-2xl border border-white/10 bg-white/[0.04] text-white/75 text-[8px] font-black uppercase tracking-widest hover:bg-white/[0.08] transition-all"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteMessage(Number(pendingDeleteMessageId))}
                                                className="flex-1 h-10 rounded-2xl border border-red-500/30 bg-red-500/15 text-red-300 text-[8px] font-black uppercase tracking-widest hover:bg-red-500/25 transition-all"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="px-3 md:px-5 py-3 md:py-4 border-b border-white/10 bg-white/[0.02] flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                    <button
                                        type="button"
                                        onClick={() => setShowMobileChat(false)}
                                        className="md:hidden w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/70 shrink-0"
                                    >
                                        <IonIcon name="arrow-back-outline" className="text-base" />
                                    </button>
                                    <div className="relative w-9 h-9 md:w-11 md:h-11 rounded-xl overflow-hidden bg-white/5 border border-white/10 shrink-0">
                                        <Image
                                            src={getProfileImageSrc(activeConversation.profile_picture, activeConversation.name)}
                                            alt={activeConversation.name || "User"}
                                            fill
                                            className="object-cover"
                                        />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-[10px] font-black text-white uppercase tracking-[0.18em] truncate">
                                            {activeConversation.name}
                                        </div>
                                        <div className="flex items-center gap-1.5 mt-1">
                                            <span
                                                className={`w-1.5 h-1.5 rounded-full ${participantPresence.status === "online" ? "bg-emerald-400" : "bg-white/25"}`}
                                            />
                                            <div className={`text-[8px] font-black uppercase tracking-widest ${participantPresence.status === "online" ? "text-emerald-300" : "text-white/30"}`}>
                                                {participantPresence.status === "online"
                                                    ? "Online"
                                                    : formatLastSeen(participantPresence.lastSeen)}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    {features.video_calls && availableQualities.length > 1 && (
                                        <div className="flex items-center gap-0.5 bg-white/5 border border-white/10 rounded-lg p-0.5">
                                            {availableQualities.map((q) => (
                                                <button
                                                    key={q}
                                                    type="button"
                                                    onClick={() => setVideoQuality(q)}
                                                    className={`px-2 py-1 rounded-md text-[8px] font-black uppercase tracking-widest transition-all ${
                                                        videoQuality === q ? "bg-white text-black" : "text-white/40 hover:text-white/70"
                                                    }`}
                                                >
                                                    {q}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => handleStartCall("voice")}
                                        className={`w-9 h-9 md:w-10 md:h-10 rounded-xl border transition-all flex items-center justify-center ${callMode === "voice" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-white/5 hover:bg-white/10 text-white/70 border-white/10"}`}
                                    >
                                        <IonIcon name="call-outline" className="text-base" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => features.video_calls ? handleStartCall("video") : undefined}
                                        disabled={!features.video_calls}
                                        title={features.video_calls ? `Video call (${videoQuality})` : "Video calls require Plan 03. Please upgrade."}
                                        className={`w-9 h-9 md:w-10 md:h-10 rounded-xl border transition-all flex items-center justify-center ${
                                            !features.video_calls
                                                ? "bg-white/[0.02] text-white/20 border-white/5 cursor-not-allowed opacity-40"
                                                : callMode === "video"
                                                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                                                    : "bg-white/5 hover:bg-white/10 text-white/70 border-white/10"
                                        }`}
                                    >
                                        <IonIcon name="videocam-outline" className="text-base" />
                                    </button>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-3 md:p-5 space-y-3 bg-transparent">
                                {combinedMessages.length > 0 ? (
                                    combinedMessages.map((message) => {
                                        const isMine = String(message.sender_id) === String(currentUser?.id);
                                        const statusTicks = getStatusTicks(message.status);
                                        return (
                                            <div key={message.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                                                <div
                                                    onDoubleClick={() => {
                                                        if (isMine) setPendingDeleteMessageId(message.id);
                                                    }}
                                                    className={`relative max-w-[80%] md:max-w-[68%] rounded-[1.1rem] px-3 py-2.5 border ${message.type === "call"
                                                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                                                    : message.type === "call_record"
                                                        ? "bg-white/5 border-white/10 text-white/70"
                                                    : isMine
                                                        ? "bg-blue-500/15 border-blue-500/20 text-white"
                                                        : "bg-white/5 border-white/10 text-white/80"
                                                    } ${isMine ? "cursor-pointer" : ""}`}
                                                >
                                                    <div className="text-[8px] font-black uppercase tracking-widest opacity-50 mb-1">
                                                        {isMine ? "You" : activeConversation.name}
                                                    </div>
                                                    {message.type === "text" && (
                                                        <div className="flex items-start gap-2">
                                                            <ChatRichText
                                                                text={message.text}
                                                                className="text-[10px] leading-relaxed break-words flex-1"
                                                            />
                                                            {features.text_to_voice && (
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => { e.stopPropagation(); speakMessage(message.id, message.text); }}
                                                                    aria-label={speakingMessageId === message.id ? "Stop" : "Speak message"}
                                                                    className="shrink-0 text-white/40 hover:text-white/80 transition active:scale-90"
                                                                >
                                                                    <IonIcon name={speakingMessageId === message.id ? "volume-mute-outline" : "volume-high-outline"} className="text-xs" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                    {message.type === "sticker" && (
                                                        <div className="p-1">
                                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                                            <img
                                                                src={message.text}
                                                                alt="sticker"
                                                                className="w-16 h-16 object-contain rounded"
                                                                draggable={false}
                                                            />
                                                        </div>
                                                    )}
                                                    {message.type === "call" && (
                                                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
                                                            <IonIcon name={message.call_mode === "voice" ? "call-outline" : "videocam-outline"} className="text-sm" />
                                                            <span>{message.text}</span>
                                                        </div>
                                                    )}
                                                    {message.type === "call_record" && (
                                                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
                                                            <IonIcon name={message.call_type === "video" ? "videocam-outline" : "call-outline"} className="text-sm" />
                                                            <span>{message.text}</span>
                                                        </div>
                                                    )}
                                                    {message.type === "image" && (
                                                        <div className="space-y-2">
                                                            <div className="relative w-32 h-32 rounded-xl overflow-hidden bg-black/40">
                                                                <Image
                                                                    src={message.image_url}
                                                                    alt={message.file_name || "Chat image"}
                                                                    fill
                                                                    className="object-cover"
                                                                />
                                                            </div>
                                                            <div className="text-[7px] font-black uppercase tracking-widest opacity-50">
                                                                {message.file_name || "Image"}
                                                            </div>
                                                            <a
                                                                href={message.image_url}
                                                                download={message.file_name || "chat-image"}
                                                                className="inline-flex items-center gap-1 text-[7px] font-black uppercase tracking-widest text-blue-300 hover:text-blue-200 transition-colors"
                                                            >
                                                                <IonIcon name="download-outline" className="text-[10px]" />
                                                                Download
                                                            </a>
                                                        </div>
                                                    )}
                                                    <div className="text-[7px] font-black uppercase tracking-widest opacity-30 mt-2 flex items-center gap-2">
                                                        <span>{formatMessageTime(message.created_at)}</span>
                                                        {isMine && (
                                                            message.status === "sending" ? (
                                                                <span className="text-[7px] font-black uppercase tracking-widest text-white/35">
                                                                    Sending
                                                                </span>
                                                            ) : (
                                                                <span
                                                                    className={`text-[8px] font-black tracking-tight ${statusTicks.className}`}
                                                                    aria-label={statusTicks.label}
                                                                    title={statusTicks.label}
                                                                >
                                                                    {statusTicks.icon}
                                                                </span>
                                                            )
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="h-full flex items-center justify-center text-center">
                                        <div>
                                            <IonIcon name="chatbubble-ellipses-outline" className="text-4xl text-white/15 mb-3" />
                                            <p className="text-[10px] font-black text-white/25 uppercase tracking-widest">
                                                Start chatting with {activeConversation.name}
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="p-2 md:p-3 border-t border-white/10 bg-white/[0.02]">
                                <input
                                    ref={chatImageInputRef}
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    className="hidden"
                                    onChange={handleSelectImages}
                                />
                                {(uploadError || isUploadingAttachments) && (
                                    <div className={`mb-2 text-[8px] font-black uppercase tracking-widest ${uploadError ? "text-red-300" : "text-blue-300"}`}>
                                        {uploadError || "Uploading..."}
                                    </div>
                                )}
                                {/* Color picker popup */}
                                {features.chat_text_colors && colorPickerOpen && (
                                    <div className="mb-2 rounded-xl border border-white/10 bg-[#0f1115] p-2">
                                        <div className="flex items-center gap-2 mb-2">
                                            <input
                                                type="color"
                                                value={pickedColor}
                                                onMouseDown={(e) => e.preventDefault()}
                                                onChange={(e) => setPickedColor(e.target.value)}
                                                className="w-8 h-8 rounded-lg border-0 cursor-pointer bg-transparent shrink-0"
                                            />
                                            <span className="text-[8px] font-mono text-white/50 flex-1">{pickedColor}</span>
                                            <button
                                                type="button"
                                                onMouseDown={(e) => e.preventDefault()}
                                                onClick={() => { applyColorTag(pickedColor); setColorPickerOpen(false); }}
                                                className="px-3 h-7 rounded-lg text-[8px] font-black uppercase tracking-widest text-white shrink-0"
                                                style={{ backgroundColor: pickedColor }}
                                            >
                                                Apply
                                            </button>
                                            <button
                                                type="button"
                                                onMouseDown={(e) => e.preventDefault()}
                                                onClick={() => setColorPickerOpen(false)}
                                                className="text-white/30 hover:text-white/70 shrink-0"
                                            >
                                                <IonIcon name="close-outline" className="text-sm" />
                                            </button>
                                        </div>
                                        <div className="flex flex-wrap gap-1">
                                            {["#ef4444","#f97316","#eab308","#22c55e","#14b8a6","#3b82f6","#8b5cf6","#ec4899","#ffffff","#9ca3af","#f472b6","#fb923c","#a3e635","#34d399","#38bdf8","#c084fc"].map((hex) => (
                                                <button
                                                    key={hex}
                                                    type="button"
                                                    onMouseDown={(e) => e.preventDefault()}
                                                    onClick={() => setPickedColor(hex)}
                                                    className={`w-5 h-5 rounded-full border-2 transition-all hover:scale-110 ${pickedColor === hex ? "border-white scale-110" : "border-white/10"}`}
                                                    style={{ backgroundColor: hex }}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {stickerLockMessage && (
                                    <div className="mb-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[10px] font-bold text-amber-200">
                                        {stickerLockMessage}
                                    </div>
                                )}
                                {stickerPanelOpen && (
                                    <div className="mb-2 rounded-2xl border border-white/10 bg-[#0f1115] p-2">
                                        {/* Category tabs */}
                                        <div className="mb-2 flex items-center gap-1 overflow-x-auto scrollbar-hide pb-0.5">
                                            {STICKER_CATEGORIES.map((cat) => (
                                                <button
                                                    key={cat.id}
                                                    type="button"
                                                    onClick={() => handleStickerCategoryChange(cat.id)}
                                                    className={`shrink-0 rounded-lg px-2.5 py-1 text-[9px] font-bold transition whitespace-nowrap ${activeStickerCategory === cat.id ? "bg-white text-black" : "bg-white/5 text-white/60 hover:bg-white/10"}`}
                                                >
                                                    {cat.label}
                                                </button>
                                            ))}
                                            <button
                                                type="button"
                                                onClick={() => setStickerPanelOpen(false)}
                                                aria-label="Close stickers"
                                                className="ml-auto shrink-0 rounded-lg bg-white/5 px-2 py-1 text-white/50 hover:bg-white/10"
                                            >
                                                <IonIcon name="close-outline" className="text-xs" />
                                            </button>
                                        </div>

                                        {/* Sticker grid */}
                                        {!features.chat_stickers ? (
                                            <div className="py-5 flex flex-col items-center gap-2 text-center">
                                                <IonIcon name="lock-closed-outline" className="text-2xl text-amber-400/70" />
                                                <p className="text-[10px] font-bold text-amber-300/80">Stickers require Plan 02</p>
                                                <p className="text-[9px] text-white/35">Upgrade to unlock all sticker packs.</p>
                                            </div>
                                        ) : giphyLoading ? (
                                            <div className="py-4 flex justify-center">
                                                <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                                            </div>
                                        ) : giphyStickers.length === 0 ? (
                                            <div className="py-4 text-center text-[10px] text-white/30">No stickers found</div>
                                        ) : (
                                            <div className="grid grid-cols-6 gap-1 max-h-44 overflow-y-auto">
                                                {giphyStickers.map((sticker) => (
                                                    <button
                                                        key={sticker.id}
                                                        type="button"
                                                        title={sticker.title}
                                                        onClick={() => sendSticker(sticker.url)}
                                                        className="w-12 h-12 rounded-md bg-white/[0.04] flex items-center justify-center transition hover:bg-white/10 hover:scale-110 active:scale-95 p-0.5"
                                                    >
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img
                                                            src={sticker.url}
                                                            alt={sticker.title}
                                                            className="w-10 h-10 object-contain"
                                                            draggable={false}
                                                            loading="lazy"
                                                        />
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                                <div className="flex items-end gap-2">
                                    <button
                                        type="button"
                                        onClick={() => chatImageInputRef.current?.click()}
                                        className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 border border-white/10 transition-all flex items-center justify-center shrink-0"
                                    >
                                        <IonIcon name="add-outline" className="text-base" />
                                    </button>
                                    {features.chat_text_colors && (
                                        <button
                                            type="button"
                                            onMouseDown={(e) => e.preventDefault()}
                                            onClick={() => { setColorPickerOpen((v) => !v); setStickerPanelOpen(false); }}
                                            aria-label="Text color picker"
                                            title={activeTypingColor ? `Active color: ${activeTypingColor}` : "Set text color"}
                                            className="w-8 h-8 rounded-xl border transition-all flex items-center justify-center shrink-0 relative"
                                            style={activeTypingColor
                                                ? { backgroundColor: activeTypingColor + "33", borderColor: activeTypingColor, color: activeTypingColor }
                                                : { backgroundColor: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" }
                                            }
                                        >
                                            <IonIcon name="color-palette-outline" className="text-base" />
                                        </button>
                                    )}
                                    {features.voice_to_text && (
                                        <button
                                            type="button"
                                            onClick={toggleSpeechToText}
                                            aria-label={isListening ? "Stop voice input" : "Start voice input (English)"}
                                            title={isListening ? "Stop voice input" : "Speak to type (English)"}
                                            className={`w-8 h-8 rounded-xl border transition-all flex items-center justify-center shrink-0 ${isListening ? "bg-red-500/20 border-red-400/40 text-red-200 animate-pulse" : "bg-white/5 hover:bg-white/10 text-white/70 border-white/10"}`}
                                        >
                                            <IonIcon name={isListening ? "mic" : "mic-outline"} className="text-base" />
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={handleStickerButtonClick}
                                        aria-label="Stickers"
                                        title={features.chat_stickers ? "Stickers" : "Stickers – Plan 02 required"}
                                        className="w-8 h-8 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white/70 transition-all flex items-center justify-center shrink-0 relative"
                                    >
                                        <IonIcon name="happy-outline" className="text-base" />
                                        {!features.chat_stickers && (
                                            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-[#111] border border-white/20 flex items-center justify-center">
                                                <IonIcon name="lock-closed" className="text-[7px] text-white/50" />
                                            </span>
                                        )}
                                    </button>
                                    <div className="flex-1 rounded-[1rem] bg-white/5 border border-white/10 px-3 py-2">
                                        {pendingAttachments.length > 0 && (
                                            <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-2">
                                                {pendingAttachments.map((attachment) => (
                                                    <div
                                                        key={attachment.id}
                                                        className="relative w-12 h-12 rounded-xl overflow-hidden border border-white/10 bg-black/30 shrink-0"
                                                    >
                                                        <Image
                                                            src={attachment.image_url}
                                                            alt={attachment.file_name || "Attachment"}
                                                            fill
                                                            className="object-cover"
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                setPendingAttachments((prev) =>
                                                                    prev.filter((item) => String(item.id) !== String(attachment.id))
                                                                )
                                                            }
                                                            className="absolute top-1 right-1 w-4 h-4 rounded-full bg-black/70 text-white/80 flex items-center justify-center"
                                                        >
                                                            <IonIcon name="close-outline" className="text-[10px]" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        <style>{`.chat-editable:empty:before{content:attr(data-placeholder);color:rgba(255,255,255,0.2);pointer-events:none;display:block}`}</style>
                                        <div
                                            ref={contentEditableRef}
                                            contentEditable
                                            suppressContentEditableWarning
                                            data-placeholder={`Message ${activeConversation.name || "..."}`}
                                            onInput={(e) => setMessageInput((e.currentTarget as HTMLDivElement).textContent || "")}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter" && !e.shiftKey) {
                                                    e.preventDefault();
                                                    handleSendMessage();
                                                }
                                            }}
                                            className="chat-editable w-full bg-transparent outline-none text-[10px] leading-5 text-white max-h-24 overflow-y-auto"
                                        />
                                        <div className="mt-1 text-[6px] font-black uppercase tracking-widest text-white/20">
                                            Images up to 3 MB each
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleSendMessage}
                                        className="px-2.5 h-8 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[7px] font-black uppercase tracking-widest transition-all shrink-0"
                                    >
                                        Send
                                    </button>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-center p-6">
                            <div>
                                <IonIcon name="chatbubbles-outline" className="text-5xl text-white/10 mb-4" />
                                <p className="text-[11px] font-black text-white/25 uppercase tracking-[0.2em]">
                                    Select a conversation
                                </p>
                                <button
                                    type="button"
                                    onClick={() => setShowMobileChat(false)}
                                    className="md:hidden mt-4 px-5 py-2 rounded-full bg-white/5 border border-white/10 text-[10px] font-black text-white/50 uppercase tracking-widest"
                                >
                                    View Chats
                                </button>
                            </div>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
