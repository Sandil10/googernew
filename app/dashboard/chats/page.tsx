"use client";

import Image from "next/image";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { io, type Socket } from "socket.io-client";
import { authService } from "@/services/authService";
import { adsService } from "@/services/adsService";
import IonIcon from "@/app/components/IonIcon";
import { walletService } from "@/services/walletService";
import { chatService } from "@/services/chatService";
import { useSubscriptionFeatures, refreshSubscriptionFeatures } from "@/app/lib/subscriptionFeatures";
import { ChatRichText, CHAT_COLOR_PALETTE, wrapWithColorTag } from "@/app/components/chat/ChatRichText";
import { SharedAdSecondViewModal, type AdSecondViewKind } from "@/app/components/ads/SharedAdSecondViewModal";
import { normalizeAdData } from "@/app/lib/ads/adNormalizer";
import { ChatAdBox } from "@/app/components/chat/ChatAdBox";
import { canShowCollectCoinButton, useAdActions } from "@/app/lib/ads/useAdActions";
import { useAdStore } from "@/app/lib/ads/adStore";
import { getAdInteractionId } from "@/app/lib/ads/adIdentity";
import InteractionBottomSheet from "@/app/components/InteractionBottomSheet";
import ShareModal from "@/app/components/ShareModal";
import { marketService } from "@/services/marketService";
import { UserVerifiedBadge } from "@/app/components/VerifiedBadge";
import { getShareUrlForItem } from "@/app/lib/shareLinks";
import { useThemePreference } from "@/app/lib/themeMode";
import { getUserDisplayName } from "@/app/lib/userDisplay";
import { getPublicProfileHref } from "@/app/lib/profileRoute";
import { ShopProductSecondViewModal } from "@/app/components/market/ShopProductSecondViewModal";
import { resolveProductPromoteProduct } from "@/app/lib/ads/resolveProductPromoteProduct";
import { filterAdsForViewer } from "@/app/lib/ads/adVisibility";
import {
    getHiddenFeedItemIds,
    hideFeedItemFor24Hours,
    subscribeToHiddenFeedItems,
} from "@/app/lib/feedHidePreferences";
import {
    isProductPromotableAd,
    promoteProductAdAgain,
} from "@/app/lib/ads/promoteAgain";

const DEFAULT_CHAT_AVATAR_SRC =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" rx="100" fill="#101827"/><circle cx="100" cy="82" r="34" fill="#d1d5db" opacity=".9"/><path d="M44 174c8-38 32-58 56-58s48 20 56 58" fill="#d1d5db" opacity=".9"/></svg>`
    );

const getProfileImageSrc = (profilePicture?: string | null, _name?: string) => {
    void _name;
    const normalizedProfilePicture = String(profilePicture || "").trim();
    const isGeneratedAvatar = normalizedProfilePicture.includes("ui-avatars.com/api/");
    if (normalizedProfilePicture && !isGeneratedAvatar) {
        if (normalizedProfilePicture.startsWith("http") || normalizedProfilePicture.startsWith("data:")) {
            return normalizedProfilePicture;
        }
        return `/uploads/${normalizedProfilePicture.split(/[\\/]/).pop()}`;
    }
    return DEFAULT_CHAT_AVATAR_SRC;
};

const handleChatAvatarError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    e.currentTarget.src = DEFAULT_CHAT_AVATAR_SRC;
};

const normalizeChatParticipant = (participant: any) => {
    if (!participant) return participant;
    if (participant.assigned_admin_alias) {
        return {
            ...participant,
            name: participant.name || participant.username || "Admin",
            username: participant.username || participant.name || null,
            user_type: participant.user_type || "admin",
            roleLabel: participant.roleLabel || "Admin",
        };
    }
    return {
        ...participant,
        name: getUserDisplayName(participant, participant.name || "User"),
    };
};

const getScopedParticipantDisplayName = (participant: any, messageList: any[] = []) => {
    const fallbackName = participant?.name || "User";
    const participantId = String(participant?.id || "");
    if (!participantId || !Array.isArray(messageList) || messageList.length === 0) {
        return fallbackName;
    }

    for (let index = messageList.length - 1; index >= 0; index -= 1) {
        const message = messageList[index];
        if (!message?.assigned_admin_id) continue;

        if (String(message.sender_id || "") === participantId && message.sender_name) {
            return message.sender_name;
        }

        if (
            String(message.receiver_id || "") === participantId &&
            message.receiver_name &&
            message.receiver_name !== "Googer Support"
        ) {
            return message.receiver_name;
        }
    }

    return fallbackName;
};

const getChatAccountDisplayName = (participant: any, fallback = "User") => {
    if (!participant) return fallback;
    const userType = String(participant.user_type || participant.userType || "").toLowerCase();
    const username = String(participant.username || "").trim();
    if ((participant.assigned_admin_alias || userType === "admin") && username) {
        return username.startsWith("@") ? username : `@${username}`;
    }
    return participant.name || username || fallback;
};

const getChatConversationKey = (participant: any) => {
    if (!participant?.id) return "";
    return participant.conversation_key || `${participant.id}:${participant.assigned_admin_id || "base"}`;
};

const participantMatchesAssignedAdmin = (participant: any, assignedAdminId?: number | string | null) => {
    if (!participant || !assignedAdminId) return false;
    const participantAssignedAdminId = participant.assigned_admin_id == null ? null : String(participant.assigned_admin_id);
    if (participantAssignedAdminId) return participantAssignedAdminId === String(assignedAdminId);
    return String(participant.id || "") === String(assignedAdminId);
};

const getConversationKey = (currentUserId?: number | string | null, participantId?: number | string | null) => {
    if (!currentUserId || !participantId) return null;
    const members = [String(currentUserId), String(participantId)].sort();
    return `googer-chat-${members.join("-")}`;
};

const getIdentityCandidates = (...values: any[]) =>
    values
        .flat()
        .filter((value) => value !== null && value !== undefined && String(value).trim() !== "")
        .map((value) => String(value).trim());

const getNameCandidates = (...values: any[]) =>
    getIdentityCandidates(...values).map((value) => value.toLowerCase());

const stripColorTags = (text: string) =>
    String(text || "").replace(/\[c=[^\]]+\]/gi, "").replace(/\[\/c\]/gi, "").trim();

const encodeTtsMessage = (text: string, gender: "male" | "female") =>
    `[tts_voice=${gender}]${text}`;

const decodeTtsMessage = (text: string): { text: string; gender: "male" | "female" } => {
    const match = String(text || "").match(/^\[tts_voice=(male|female)\]([\s\S]*)$/i);
    return {
        text: match ? match[2] : String(text || ""),
        gender: match?.[1]?.toLowerCase() === "male" ? "male" : "female",
    };
};

const getReadableMessageText = (message: any) => {
    if (!message) return "";
    if (message.type === "image") return "Image";
    if (message.type === "video") return "Video";
    if (message.type === "sticker") return "Sticker";
    if (message.type === "voice") return "Voice message";
    if (message.type === "voice_tts") return decodeTtsMessage(message.text).text;
    return stripColorTags(message.text || "");
};

const isAssignmentNoticeMessage = (message: any) =>
    String(message?.type || "").toLowerCase() === "text"
    && String(message?.text || "").trim().toLowerCase().startsWith("assigned admin:");

const sanitizeChatMessages = (items: any[]) =>
    Array.isArray(items) ? items.filter((message) => !isAssignmentNoticeMessage(message)) : [];

const sanitizeConversationSummaries = (items: any[]) =>
    (Array.isArray(items) ? items : []).filter((entry) => !isAssignmentNoticeMessage(entry?.lastMessage));

const getMessagePreview = (message: any) => {
    if (!message) return "No messages yet";
    if (message.type === "image") return "Sent an image";
    if (message.type === "video") return "Sent a video";
    if (message.type === "voice") return "Sent a voice message";
    if (message.type === "voice_tts") return "Sent a voice message";
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

const getChatListCacheKey = (userId?: number | string | null) => {
    if (!userId) return null;
    return `googer-chat-list-cache-${userId}`;
};

const getLastOpenChatKey = (userId?: number | string | null) => {
    if (!userId) return null;
    return `googer-chat-last-open-${userId}`;
};

const getChatMobileViewKey = (userId?: number | string | null) => {
    if (!userId) return null;
    return `googer-chat-mobile-view-${userId}`;
};

const MIN_CHAT_SEARCH_QUERY_LENGTH = 1;
const CHAT_MEDIA_MAX_BYTES = 3 * 1024 * 1024;       // photo: 1–3 MB
const CHAT_VIDEO_MAX_BYTES = 20 * 1024 * 1024;      // video: up to 20 MB
const CHAT_VIDEO_MAX_DURATION_SECS = 60;             // video: 1 min
const CHAT_VOICE_MAX_SECS = 120;                     // voice: 2 min
const CHAT_DAILY_MEDIA_LIMIT = 10;                   // 10 photos/videos per day

type ChatSendPayload = Parameters<typeof chatService.sendMessage>[0];

const getChatSocketUrl = () => {
    const explicit = process.env.NEXT_PUBLIC_SOCKET_URL || process.env.NEXT_PUBLIC_BACKEND_URL;
    if (explicit) return explicit.replace(/\/$/, "");
    if (typeof window !== "undefined") {
        const host = window.location.hostname;
        if (host === "localhost" || host === "127.0.0.1") return "http://127.0.0.1:5000";
        return window.location.origin;
    }
    return "http://127.0.0.1:5000";
};

const getTabAuthValue = (key: "token" | "user") => {
    if (typeof window === "undefined") return null;
    try {
        return window.sessionStorage.getItem(key) || window.localStorage.getItem(key);
    } catch {
        return null;
    }
};

const generateClientMessageId = () => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const getConversationSignature = (entries: any[]) =>
    entries.map((e: any) =>
        [
            e.participant?.id ?? "",
            e.participant?.name ?? "",
            e.participant?.username ?? "",
            e.participant?.profile_picture ?? "",
            e.participant?.user_type ?? "",
            e.participant?.roleLabel ?? "",
            e.participant?.assigned_admin_alias ? "assigned" : "",
            e.participant?.assigned_admin_id ?? "",
            (e.lastMessage as any)?.id ?? "",
            (e.lastMessage as any)?.status ?? "",
            (e.lastMessage as any)?.delivered_at ?? "",
            (e.lastMessage as any)?.read_at ?? "",
            (e.lastMessage as any)?.created_at ?? "",
            e.unread_count ?? 0,
            e.participant?.status ?? "",
            e.participant?.last_seen_at ?? "",
        ].join("|")
    ).join("~");

const mergeMessageList = (currentMessages: any[], incomingMessages: any[]) => {
    const byKey = new Map<string, any>();
    const orderKeys: string[] = [];
    const getKeys = (message: any) => [
        message?.client_message_id ? `client:${message.client_message_id}` : "",
        message?.id ? `id:${message.id}` : "",
    ].filter(Boolean);

    for (const message of [...currentMessages, ...incomingMessages]) {
        const keys = getKeys(message);
        const existingKey = keys.find((key) => byKey.has(key)) || keys[0] || `tmp:${orderKeys.length}`;
        const existing = byKey.get(existingKey);
        const merged = existing ? { ...existing, ...message, status: message.status || existing.status } : message;
        if (!byKey.has(existingKey)) orderKeys.push(existingKey);
        byKey.set(existingKey, merged);
        for (const key of keys) byKey.set(key, merged);
    }

    const seen = new Set<any>();
    return orderKeys
        .map((key) => byKey.get(key))
        .filter((message) => {
            if (!message || seen.has(message)) return false;
            seen.add(message);
            return true;
        })
        .sort((a: any, b: any) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
};

const getCallEncryptionMetadata = () => ({
    media_encryption: "webrtc-dtls-srtp",
    end_to_end_encrypted: true,
    created_at: new Date().toISOString(),
});

const getRtcConfiguration = (): RTCConfiguration => {
    const envTurnUrls = (process.env.NEXT_PUBLIC_TURN_URLS || "")
        .split(",")
        .map((url) => url.trim())
        .filter(Boolean);
    const envTurnUsername = process.env.NEXT_PUBLIC_TURN_USERNAME || "";
    const envTurnCredential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL || "";

    const iceServers: RTCIceServer[] = [
        { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302", "stun:stun3.l.google.com:19302"] },
    ];

    if (envTurnUrls.length && envTurnUsername && envTurnCredential) {
        iceServers.push({
            urls: envTurnUrls,
            username: envTurnUsername,
            credential: envTurnCredential,
        });
    } else {
        iceServers.push({
            urls: [
                "turn:openrelay.metered.ca:80",
                "turn:openrelay.metered.ca:443",
                "turn:openrelay.metered.ca:443?transport=tcp",
            ],
            username: "openrelayproject",
            credential: "openrelayproject",
        });
    }

    return {
        iceServers,
        iceCandidatePoolSize: 10,
    };
};

const toRtcSessionDescription = (payload: any): RTCSessionDescriptionInit => ({
    type: payload?.type,
    sdp: payload?.sdp,
});

export default function ChatsPage() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const scopedProductStatusId = String(searchParams?.get("productStatusId") || "").trim() || null;
    const scopedTopupRequestId = Number(searchParams?.get("topupRequestId") || 0) || null;
    const { resolvedTheme, toggleManualTheme } = useThemePreference();
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [conversationList, setConversationList] = useState<any[]>([]);
    const [activeConversation, setActiveConversation] = useState<any>(null);
    const [messages, setMessages] = useState<any[]>([]);
    const [scopedAssignment, setScopedAssignment] = useState<any>(null);
    const scopedAssignedAdminAppliesToActiveConversation = useMemo(
        () => participantMatchesAssignedAdmin(activeConversation, scopedAssignment?.assigned_admin?.id),
        [activeConversation, scopedAssignment?.assigned_admin?.id]
    );
    const activeConversationDisplayName = useMemo(
        () => {
            if (scopedAssignment?.assigned_admin && scopedAssignedAdminAppliesToActiveConversation) {
                return getChatAccountDisplayName({
                    ...scopedAssignment.assigned_admin,
                    user_type: "admin",
                    assigned_admin_alias: true,
                }, "Admin");
            }
            return getChatAccountDisplayName(
                activeConversation,
                getScopedParticipantDisplayName(activeConversation, messages)
            );
        },
        [activeConversation, messages, scopedAssignment, scopedAssignedAdminAppliesToActiveConversation]
    );
    const activeConversationProfilePicture = useMemo(
        () => scopedAssignedAdminAppliesToActiveConversation
            ? scopedAssignment?.assigned_admin?.profile_picture || activeConversation?.profile_picture || null
            : activeConversation?.profile_picture || null,
        [activeConversation?.profile_picture, scopedAssignment, scopedAssignedAdminAppliesToActiveConversation]
    );
    const [messageInput, setMessageInput] = useState("");
    const [callMode, setCallMode] = useState<"voice" | "video" | null>(null);
    const [loading, setLoading] = useState(true);
    const [chatListSyncing, setChatListSyncing] = useState(false);
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
    const speechBaseTextRef = useRef("");
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordingChunksRef = useRef<Blob[]>([]);
    const recordingTimerRef = useRef<number | null>(null);
    const [isListening, setIsListening] = useState(false);
    const [recordingState, setRecordingState] = useState<"idle" | "recording" | "paused" | "ready" | "sending">("idle");
    const [recordingSeconds, setRecordingSeconds] = useState(0);
    const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
    const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
    const [speakingMessageId, setSpeakingMessageId] = useState<number | string | null>(null);
    const features = useSubscriptionFeatures();
    const canUseVoiceCall = features.voice_calls !== false;
    const canUseVideoCall = features.video_calls === true;
    const [ttsEnabled, setTtsEnabled] = useState(false);
    const [ttsVoiceGender, setTtsVoiceGender] = useState<"male" | "female">("female");
    const [ttsSettingsOpen, setTtsSettingsOpen] = useState(false);
    const [composerMode, setComposerMode] = useState<"typed" | "stt">("typed");
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
    // 0-100 while processing/sending media, null when idle
    const [mediaUploadProgress, setMediaUploadProgress] = useState<number | null>(null);
    const [videoCutPrompt, setVideoCutPrompt] = useState<{
        fileName: string;
        previewUrl: string;
        duration: number | null;
        startSec: number;
        endSec: number;
    } | null>(null);
    const [pendingDeleteMessageIds, setPendingDeleteMessageIds] = useState<Array<number | string>>([]);
    const [deleteForEveryoneFlag, setDeleteForEveryoneFlag] = useState(false);
    const [pendingDeleteIsMine, setPendingDeleteIsMine] = useState(false);
    // Alias for single-message delete (hover trash icon) — uses same state
    const setPendingDeleteMessageId = (id: number | string | null, isMine = false) => {
        setPendingDeleteMessageIds(id !== null ? [id] : []);
        setPendingDeleteIsMine(isMine);
    };
    const [imagePreview, setImagePreview] = useState<any>(null);
    const [imageViewerSrc, setImageViewerSrc] = useState<string | null>(null);
    const [imageViewerZoom, setImageViewerZoom] = useState(1);
    const [callHistory, setCallHistory] = useState<any[]>([]);
    const [incomingCall, setIncomingCall] = useState<any>(null);
    const [activeCall, setActiveCall] = useState<any>(null);
    const [callError, setCallError] = useState<string | null>(null);
    const [callPhase, setCallPhase] = useState<"idle" | "outgoing" | "incoming" | "connecting" | "active" | "ended">("idle");
    const [isRinging, setIsRinging] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isCameraOff, setIsCameraOff] = useState(false);
    const [isSpeakerOn, setIsSpeakerOn] = useState(false);
    const [callDurationSecs, setCallDurationSecs] = useState(0);
    const [trimPreviewPlaying, setTrimPreviewPlaying] = useState(false);
    const callDurationTimerRef = useRef<number | null>(null);
    const videoCutPromptResolverRef = useRef<((choice: { action: "cut"; startSec: number; endSec: number } | { action: "cancel" }) => void) | null>(null);
    const videoTrimPreviewRef = useRef<HTMLVideoElement | null>(null);

    const callPeerRef = useRef<RTCPeerConnection | null>(null);
    const callLocalStreamRef = useRef<MediaStream | null>(null);
    const callRemoteStreamRef = useRef<MediaStream | null>(null);
    const callSignalsSinceRef = useRef<number>(0);
    const callPollIntervalRef = useRef<number | null>(null);
    const pendingRemoteIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
    // Tracks call type so ontrack handler works before activeCall state is set
    const callTypeRef = useRef<"voice" | "video" | null>(null);
    const ringtoneIntervalRef = useRef<number | null>(null);
    const ringtoneAudioContextRef = useRef<AudioContext | null>(null);
    const ttsLongPressTimerRef = useRef<number | null>(null);
    const ttsLongPressFiredRef = useRef(false);
    const micLongPressTimerRef = useRef<number | null>(null);
    const micLongPressActiveRef = useRef(false);
    const sttTimerRef = useRef<number | null>(null);
    const speechBaseHtmlRef = useRef("");
    const localVideoRef = useRef<HTMLVideoElement | null>(null);
    const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
    const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
    const messagesEndRef = useRef<HTMLDivElement | null>(null);
    const activeConversationRef = useRef<any>(null);
    const chatSocketRef = useRef<Socket | null>(null);
    const preferredParticipantIdRef = useRef<string>("");
    const preferredConversationKeyRef = useRef<string>("");
    // When true, refreshConversations must NOT call setShowMobileChat(true)
    const mobileBackPressedRef = useRef(false);
    // Frozen conversation order captured the moment a chat is opened — prevents list
    // from reordering while the user is inside a conversation (WhatsApp behaviour)
    const frozenConvOrderRef = useRef<string[]>([]);
    // Per-conversation message cache so switching chats shows last-known messages instantly
    const messagesCacheRef = useRef<Record<string, any[]>>({});
    // Tracks conversations explicitly cleared by the user (deleted) — bypasses anti-flicker protection
    const clearedConversationIds = useRef<Set<string>>(new Set());
    // Fingerprint of last-rendered conversation list — prevents setConversationList on identical data
    const convListSignatureRef = useRef<string>("");
    const chatListSyncStartedAtRef = useRef<number>(0);
    const [remoteMediaVersion, setRemoteMediaVersion] = useState(0);

    const persistConversationListSnapshot = useCallback((nextList: any[]) => {
        const sanitizedList = sanitizeConversationSummaries(nextList);
        convListSignatureRef.current = getConversationSignature(sanitizedList);
        const listCacheKey = getChatListCacheKey(currentUser?.id);
        if (listCacheKey && typeof window !== "undefined") {
            try { window.localStorage.setItem(listCacheKey, JSON.stringify(sanitizedList)); } catch { }
        }
    }, [currentUser?.id]);

    const unhideLocalConversation = useCallback((participantId: number | string) => {
        const id = String(participantId || "");
        if (!id) return;
        setHiddenChatIds((prev) => {
            if (!prev.has(id)) return prev;
            const next = new Set(prev);
            next.delete(id);
            if (currentUser?.id) {
                try { window.localStorage.setItem(`googer-hidden-chats-${currentUser.id}`, JSON.stringify([...next])); } catch { }
            }
            return next;
        });
    }, [currentUser?.id]);

    const beginChatListSync = () => {
        chatListSyncStartedAtRef.current = Date.now();
        setChatListSyncing(true);
    };

    const endChatListSync = () => {
        const elapsed = Date.now() - chatListSyncStartedAtRef.current;
        window.setTimeout(() => setChatListSyncing(false), Math.max(0, 2000 - elapsed));
    };

    // --- New feature state ---
    const [replyTo, setReplyTo] = useState<any>(null);
    const [selectedMessages, setSelectedMessages] = useState<Set<string | number>>(new Set());
    const [selectMode, setSelectMode] = useState(false);
    const [forwardMessage, setForwardMessage] = useState<any>(null);
    const [forwardSearchQuery, setForwardSearchQuery] = useState("");
    const [hoveredMessageId, setHoveredMessageId] = useState<string | number | null>(null);
    const [pinnedChats, setPinnedChats] = useState<Set<string>>(() => {
        try {
            const raw = typeof localStorage !== "undefined" ? localStorage.getItem("googer-pinned-chats") : null;
            return raw ? new Set(JSON.parse(raw)) : new Set();
        } catch { return new Set(); }
    });
    // Which conversation row is swiped open (participant id as string)
    const [swipedConvId, setSwipedConvId] = useState<string | null>(null);
    // Drag state kept in refs to avoid re-renders on every touch/mouse move
    const draggingConvIdRef = useRef<string | null>(null);
    const rowInnerRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const [hiddenChatIds, setHiddenChatIds] = useState<Set<string>>(new Set());
    const [deleteConversationTarget, setDeleteConversationTarget] = useState<any>(null);
    const [blockTarget, setBlockTarget] = useState<any>(null);
    const [blockedUsers, setBlockedUsers] = useState<any[]>([]);
    const [showBlockedPanel, setShowBlockedPanel] = useState(false);
    const [chatListNotice, setChatListNotice] = useState<string | null>(null);
    const [copiedMessageNotice, setCopiedMessageNotice] = useState<string | null>(null);
    const [mediaLimitPopup, setMediaLimitPopup] = useState(false);
    const swipeStartXRef = useRef<number>(0);
    const swipeStartYRef = useRef<number>(0);
    const swipeBaseOffsetRef = useRef<number>(0);
    const swipeCurrentOffsetRef = useRef<number>(0);
    // Stores the pid that had actual movement (> 6px) during a drag gesture.
    // Per-row so dragging Sunil's row never blocks a subsequent click on Nimal's row.
    const swipeMovedRef = useRef<string | null>(null);
    const swipeMouseDraggingRef = useRef(false);
    const [participantTyping, setParticipantTyping] = useState(false);

    // Chat ad state
    const [chatAds, setChatAds] = useState<any[]>([]);
    const [hiddenChatAdIds, setHiddenChatAdIds] = useState<Set<string>>(new Set());
    const [chatAdNotification, setChatAdNotification] = useState<{ type: "error" | "success"; title?: string; message: string } | null>(null);
    const [chatAdSheetOpen, setChatAdSheetOpen] = useState(false);
    const [chatAdSheetType, setChatAdSheetType] = useState<any>("likes");
    const [chatAdSheetItem, setChatAdSheetItem] = useState<any>(null);
    const [chatAdSheetData, setChatAdSheetData] = useState<any[]>([]);
    const [chatAdSheetLoading, setChatAdSheetLoading] = useState(false);
    const [chatAdShareItem, setChatAdShareItem] = useState<any>(null);
    const [chatAdShareOpen, setChatAdShareOpen] = useState(false);
    const [chatAdPendingCoin, setChatAdPendingCoin] = useState<any>(null);
    const [chatProductAdModal, setChatProductAdModal] = useState<any>(null);
    const updateAdState = useAdStore((state) => state.updateAdState);

    useEffect(() => {
        if (!chatAdNotification) return;
        const timeoutId = window.setTimeout(() => setChatAdNotification(null), 2000);
        return () => window.clearTimeout(timeoutId);
    }, [chatAdNotification]);

    const callStartTimeRef = useRef<number | null>(null);
    const longPressTimerRef = useRef<number | null>(null);
    // When true, next handleSendMessage call sends as TTS even though isListening is already false
    const sttSendAsTtsRef = useRef(false);
    const typingTimeoutRef = useRef<number | null>(null);
    const isTypingSentRef = useRef(false);

    const formatMessageTime = (value?: string) =>
        new Date(value || Date.now()).toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
        });

    const formatRecordingTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${String(secs).padStart(2, "0")}`;
    };

    const formatLastSeen = (value?: number | null) => {
        if (!value) return "Offline";
        const now = Date.now();
        const diff = now - value;
        const oneDay = 86_400_000;
        const time = new Date(value).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
        if (diff < oneDay) return `Last seen at ${time}`;
        if (diff < 2 * oneDay) return `Last seen yesterday at ${time}`;
        return `Last seen ${new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
    };

    const getChatDateLabel = (dateStr: string | undefined) => {
        if (!dateStr) return null;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return null;
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const diffDays = Math.round((today.getTime() - msgDay.getTime()) / 86_400_000);
        if (diffDays === 0) return "Today";
        if (diffDays === 1) return "Yesterday";
        return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    };

    const getStatusDots = (status?: string) => {
        // big=outer, mid=middle, inner=inner — original 3-layer ring dot
        if (status === "sending")   return { big: "bg-white/20", mid: "bg-black",    inner: "bg-black/60", label: "Sending" };
        if (status === "delivered") return { big: "bg-white/20", mid: "bg-red-500",  inner: "bg-black/60", label: "Delivered" };
        if (status === "read")      return { big: "bg-red-500",  mid: "bg-black/60", inner: "bg-black/60", label: "Read" };
        return                             { big: "bg-white/20", mid: "bg-white/30", inner: "bg-black/60", label: "Sent" };
    };

    const resolveMessageStatus = (message: any) => {
        if (message?.read_at) return "read";
        if (message?.delivered_at) return "delivered";
        return message?.status || "sent";
    };

    const MessageStatusRing = ({ status, size = "normal" }: { status?: string; size?: "normal" | "list" }) => {
        const dots = getStatusDots(status);
        const outerSize = size === "list" ? "h-3 w-3" : "h-2.5 w-2.5";
        const midSize = size === "list" ? "h-2 w-2" : "h-1.5 w-1.5";
        const innerSize = size === "list" ? "h-1 w-1" : "h-0.5 w-0.5";
        return (
            <span
                className={`relative inline-flex ${outerSize} shrink-0 items-center justify-center rounded-full ${dots.big}`}
                title={dots.label}
                aria-label={dots.label}
            >
                <span className={`absolute ${midSize} rounded-full ${dots.mid}`} />
                <span className={`absolute ${innerSize} rounded-full ${dots.inner}`} />
            </span>
        );
    };

    const formatCallDuration = (answeredAt?: string | null, endedAt?: string | null) => {
        if (!answeredAt || !endedAt) return null;
        const secs = Math.max(0, Math.round((new Date(endedAt).getTime() - new Date(answeredAt).getTime()) / 1000));
        if (secs < 60) return `${secs} sec`;
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return s > 0 ? `${m} min ${s} sec` : `${m} min`;
    };

    const formatVideoDuration = (duration: number) => {
        const secs = Math.max(0, Math.round(duration || 0));
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${m}:${String(s).padStart(2, "0")}`;
    };

    const formatCallRecordText = (call: any) => {
        const base = call.call_type === "video" ? "Video Call" : "Voice Call";
        const duration = call.call_status === "completed" ? formatCallDuration(call.answered_at, call.ended_at) : null;

        if (call.call_status === "missed") return `Missed ${base}`;
        if (call.call_status === "rejected") return `${base} Rejected`;
        if (call.call_status === "completed") return duration ? `${base} · ${duration}` : base;
        if (call.call_status === "active") return `${base} (active)`;
        return `${base} (${call.call_status || "ringing"})`;
    };

    const togglePinChat = (participantId: string) => {
        setSwipedConvId(null);
        setPinnedChats((prev) => {
            const next = new Set(prev);
            if (next.has(participantId)) {
                next.delete(participantId);
            } else {
                if (next.size >= 3) {
                    setChatListNotice("Only 3 chats can be pinned.");
                    window.setTimeout(() => setChatListNotice(null), 2400);
                    return prev;
                }
                next.add(participantId);
            }
            try { localStorage.setItem("googer-pinned-chats", JSON.stringify([...next])); } catch { }
            return next;
        });
    };

    const requestDeleteConversation = (entry: any) => {
        setSwipedConvId(null);
        setDeleteConversationTarget(entry);
    };

    const confirmDeleteConversation = () => {
        const participantId = String(deleteConversationTarget?.participant?.id || "");
        const participantKey = getChatConversationKey(deleteConversationTarget?.participant) || participantId;
        const participantIdNum = Number(participantId);
        if (!participantId || !participantIdNum) return;
        setSwipedConvId(null);
        setDeleteConversationTarget(null);

        // Remove from conversation list and clear all local data immediately
        setConversationList((prev) => prev.filter((e) => (getChatConversationKey(e.participant) || String(e.participant.id)) !== participantKey));
        delete messagesCacheRef.current[participantKey];
        clearedConversationIds.current.add(participantKey);
        setHiddenChatIds((prev) => {
            const next = new Set(prev);
            next.add(participantKey);
            if (currentUser?.id) {
                try { localStorage.setItem(`googer-hidden-chats-${currentUser.id}`, JSON.stringify([...next])); } catch { }
            }
            return next;
        });
        if ((getChatConversationKey(activeConversation) || String(activeConversation?.id || "")) === participantKey) {
            preferredParticipantIdRef.current = "";
            preferredConversationKeyRef.current = "";
            activeConversationRef.current = null;
            setActiveConversation(null);
            setMessages([]);
            setShowMobileChat(false);
        }
        if (currentUser?.id) {
            const key = getConversationKey(currentUser.id, participantId);
            if (key) { try { localStorage.removeItem(key); } catch { } }
            const recentKey = getChatRecentKey(currentUser.id, participantKey);
            if (recentKey) { try { localStorage.removeItem(recentKey); } catch { } }
            const lastOpenKey = getLastOpenChatKey(currentUser.id);
            if (lastOpenKey && String(localStorage.getItem(lastOpenKey) || "") === participantKey) {
                try { localStorage.removeItem(lastOpenKey); } catch { }
            }
            const listCacheKey = getChatListCacheKey(currentUser.id);
            if (listCacheKey) {
                try {
                    const raw = localStorage.getItem(listCacheKey);
                    const cached = raw ? JSON.parse(raw) : [];
                    if (Array.isArray(cached)) {
                        localStorage.setItem(listCacheKey, JSON.stringify(cached.filter((e: any) => (getChatConversationKey(e?.participant) || String(e?.participant?.id || "")) !== participantKey)));
                    }
                } catch { }
            }
        }
        setPinnedChats((prev) => {
            const next = new Set(prev);
            next.delete(participantKey);
            try { localStorage.setItem("googer-pinned-chats", JSON.stringify([...next])); } catch { }
            return next;
        });

        chatService.deleteConversation(participantIdNum).catch(() => {});
    };

    const loadBlockedUsers = async () => {
        try {
            const res = await chatService.getBlockedUsers();
            const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
            setBlockedUsers(list);
        } catch { setBlockedUsers([]); }
    };

    const confirmBlock = () => {
        if (!blockTarget) return;
        const participantId = String(blockTarget?.participant?.id || "");
        const participantKey = getChatConversationKey(blockTarget?.participant) || participantId;
        const participantIdNum = Number(participantId);
        if (!participantId || !participantIdNum) return;
        setBlockTarget(null);
        setSwipedConvId(null);

        // Same local cleanup as delete
        setConversationList((prev) => prev.filter((e) => (getChatConversationKey(e.participant) || String(e.participant.id)) !== participantKey));
        delete messagesCacheRef.current[participantKey];
        clearedConversationIds.current.add(participantKey);
        setHiddenChatIds((prev) => {
            const next = new Set(prev);
            next.add(participantKey);
            if (currentUser?.id) {
                try { localStorage.setItem(`googer-hidden-chats-${currentUser.id}`, JSON.stringify([...next])); } catch { }
            }
            return next;
        });
        if ((getChatConversationKey(activeConversation) || String(activeConversation?.id || "")) === participantKey) {
            preferredParticipantIdRef.current = "";
            preferredConversationKeyRef.current = "";
            activeConversationRef.current = null;
            setActiveConversation(null);
            setMessages([]);
            setShowMobileChat(false);
        }
        if (currentUser?.id) {
            const key = getConversationKey(currentUser.id, participantId);
            if (key) { try { localStorage.removeItem(key); } catch { } }
            const recentKey = getChatRecentKey(currentUser.id, participantKey);
            if (recentKey) { try { localStorage.removeItem(recentKey); } catch { } }
            const listCacheKey = getChatListCacheKey(currentUser.id);
            if (listCacheKey) {
                try {
                    const raw = localStorage.getItem(listCacheKey);
                    const cached = raw ? JSON.parse(raw) : [];
                    if (Array.isArray(cached)) {
                        localStorage.setItem(listCacheKey, JSON.stringify(cached.filter((e: any) => (getChatConversationKey(e?.participant) || String(e?.participant?.id || "")) !== participantKey)));
                    }
                } catch { }
            }
        }

        chatService.blockUser(participantIdNum)
            .then(() => loadBlockedUsers())
            .catch(() => {});
    };

    const handleUnblock = (userId: number) => {
        chatService.unblockUser(userId)
            .then(() => loadBlockedUsers())
            .catch(() => {});
    };

    const enterSelectMode = (messageId: string | number) => {
        setSelectMode(true);
        setSelectedMessages(new Set([messageId]));
    };

    const toggleSelectMessage = (messageId: string | number) => {
        setSelectedMessages((prev) => {
            const next = new Set(prev);
            if (next.has(messageId)) next.delete(messageId);
            else next.add(messageId);
            return next;
        });
    };

    const exitSelectMode = () => {
        setSelectMode(false);
        setSelectedMessages(new Set());
    };

    const handleTypingInput = () => {
        if (!currentUser?.id || !activeConversation?.id) return;
        if (!isTypingSentRef.current) {
            isTypingSentRef.current = true;
            chatSocketRef.current?.emit("chat:typing", { receiverId: Number(activeConversation.id) });
            chatService.sendTyping().catch(() => {});
        }
        if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = window.setTimeout(() => {
            isTypingSentRef.current = false;
        }, 3000);
    };

    const stopRingtone = () => {
        setIsRinging(false);
        try { navigator.vibrate?.(0); } catch { }
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
            navigator.vibrate?.([400, 250, 400, 250, 800]);
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            ringtoneAudioContextRef.current = ctx;

            const beep = () => {
                try {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = "sine";
                    osc.frequency.value = 880;
                    gain.gain.value = 0.12;
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

    const startCallDurationTimer = () => {
        setCallDurationSecs(0);
        if (callDurationTimerRef.current) window.clearInterval(callDurationTimerRef.current);
        callDurationTimerRef.current = window.setInterval(() => setCallDurationSecs((s) => s + 1), 1000);
    };

    const stopCallDurationTimer = () => {
        if (callDurationTimerRef.current) { window.clearInterval(callDurationTimerRef.current); callDurationTimerRef.current = null; }
        setCallDurationSecs(0);
    };

    const formatCallTimer = (secs: number) => {
        const m = Math.floor(secs / 60).toString().padStart(2, "0");
        const s = (secs % 60).toString().padStart(2, "0");
        return `${m}:${s}`;
    };

    const toggleMute = () => {
        const stream = callLocalStreamRef.current;
        if (!stream) return;
        stream.getAudioTracks().forEach((t) => { t.enabled = !t.enabled; });
        setIsMuted((v) => !v);
    };

    const toggleCamera = () => {
        const stream = callLocalStreamRef.current;
        if (!stream) return;
        stream.getVideoTracks().forEach((t) => { t.enabled = !t.enabled; });
        setIsCameraOff((v) => !v);
    };

    const toggleSpeaker = async () => {
        const audio = remoteAudioRef.current as any;
        if (!audio) return;
        const next = !isSpeakerOn;
        setIsSpeakerOn(next);
        // setSinkId routes audio to speakerphone (supported in Chrome/Edge; no-op on others)
        if (typeof audio.setSinkId === "function") {
            try {
                // "" = default (earpiece on mobile), "speaker" routing via audioContext not needed —
                // simply calling setSinkId("") reverts to default; we rely on the browser to pick speaker
                await audio.setSinkId(next ? "speaker" : "");
            } catch {
                // setSinkId with "speaker" ID may fail; fallback: just boost volume
            }
        }
        // Fallback: on mobile browsers that don't support setSinkId, toggle volume hint
        audio.volume = next ? 1 : 0.7;
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
        pendingRemoteIceCandidatesRef.current = [];

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
        if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    };

    const attachRemoteCallStream = useCallback((stream: MediaStream) => {
        callRemoteStreamRef.current = stream;
        stream.getAudioTracks().forEach((track) => { track.enabled = true; });
        stream.getVideoTracks().forEach((track) => { track.enabled = true; });

        const isVideo = callTypeRef.current === "video" || stream.getVideoTracks().length > 0;
        if (isVideo && remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = stream;
            remoteVideoRef.current.muted = true;
            remoteVideoRef.current.play?.().catch(() => { });
        }

        if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = stream;
            remoteAudioRef.current.muted = false;
            remoteAudioRef.current.volume = 1;
            remoteAudioRef.current.play?.().catch(() => {
                // Autoplay blocked — user needs to tap the screen
                setCallError("Tap the call screen to enable audio.");
                setTimeout(() => setCallError(null), 4000);
            });
        }
    }, []);

    const flushPendingRemoteIceCandidates = async () => {
        const pc = callPeerRef.current;
        if (!pc?.remoteDescription) return;

        const candidates = [...pendingRemoteIceCandidatesRef.current];
        pendingRemoteIceCandidatesRef.current = [];

        for (const candidate of candidates) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch {
                pendingRemoteIceCandidatesRef.current.push(candidate);
            }
        }
    };

    const addRemoteIceCandidate = async (candidate: RTCIceCandidateInit) => {
        const pc = callPeerRef.current;
        if (!pc) return;
        if (!pc.remoteDescription) {
            pendingRemoteIceCandidatesRef.current.push(candidate);
            return;
        }

        try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch {
            pendingRemoteIceCandidatesRef.current.push(candidate);
        }
    };

    const getCallAudioConstraints = (): MediaTrackConstraints => ({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        sampleRate: 48000,
        sampleSize: 16,
    });

    const createPeerConnection = (callId: number, otherUserId: number) => {
        const pc = new RTCPeerConnection(getRtcConfiguration());

        pc.onicecandidate = (event) => {
            if (!event.candidate) return;
            chatService.sendSignal(callId, otherUserId, "ice-candidate", { candidate: event.candidate }).catch(() => { });
        };

        pc.ontrack = (event) => {
            const stream = event.streams?.[0] || callRemoteStreamRef.current || new MediaStream();
            if (!event.streams?.[0] && event.track && !stream.getTracks().some((track) => track.id === event.track.id)) {
                stream.addTrack(event.track);
            }
            if (event.track.kind === "audio") event.track.enabled = true;
            attachRemoteCallStream(stream);
            setRemoteMediaVersion((current) => current + 1);
        };

        pc.onconnectionstatechange = () => {
            const state = pc.connectionState;
            if (state === "connected") {
                setCallPhase("active");
                callStartTimeRef.current = Date.now();
                startCallDurationTimer();
            } else if (state === "disconnected" || state === "failed" || state === "closed") {
                // Other side dropped — end the call immediately without waiting for poll
                hangUpCall();
            }
        };

        pc.oniceconnectionstatechange = () => {
            const iceState = pc.iceConnectionState;
            if (iceState === "disconnected" || iceState === "failed" || iceState === "closed") {
                hangUpCall();
            }
        };

        callPeerRef.current = pc;
        return pc;
    };

    const refreshConversations = async (
        preferredParticipantId?: string | null,
        preferredParticipant?: any | null,
        openMobileChat?: boolean,
        showSyncBuffer?: boolean,
    ) => {
        if (showSyncBuffer) beginChatListSync();
        try {
            // Snapshot the intended target BEFORE the async call so we can detect
            // whether the user navigated away while the API was in flight.
            const intentKey = String(preferredConversationKeyRef.current || "");
            const intentId = String(preferredParticipantId || preferredParticipantIdRef.current || "");

            const summaries = await chatService.getConversations();
            const normalizedSummaries = Array.isArray(summaries)
                ? sanitizeConversationSummaries(summaries.map((entry: any) => ({
                    ...entry,
                    conversation: [],
                    participant: normalizeChatParticipant(entry?.participant),
                })))
                : [];

            // Only call setConversationList when data actually changed (Facebook/Instagram pattern:
            // skip re-render if payload is identical to avoid constant list re-renders during polling)
            const newSignature = getConversationSignature(normalizedSummaries);
            if (newSignature !== convListSignatureRef.current) {
                setConversationList(normalizedSummaries);
                persistConversationListSnapshot(normalizedSummaries);
            }

            // ─── STALE GUARD ──────────────────────────────────────────────────────
            // The user may have clicked a different conversation while getConversations
            // was in flight.  If preferredParticipantIdRef has changed since we started,
            // the user's explicit navigation wins — do NOT override it.
            const currentIntentKey = String(preferredConversationKeyRef.current || "");
            const currentIntent = String(preferredParticipantIdRef.current || "");
            if ((intentKey && currentIntentKey && intentKey !== currentIntentKey) || (intentId && currentIntent && intentId !== currentIntent)) {
                // List data is updated above; active conversation is intentionally left alone.
                return;
            }

            // Don't auto-select the first conversation when the user deliberately returned to the
            // list on mobile (mobileBackPressedRef=true). Instagram/Facebook behaviour: back = list view,
            // nothing auto-opened until the user taps a row.
            const userBackedOut = mobileBackPressedRef.current &&
                !preferredParticipantId &&
                !preferredParticipantIdRef.current &&
                !activeConversationRef.current?.id;
            const selectedKey = String(
                preferredConversationKeyRef.current ||
                getChatConversationKey(activeConversationRef.current) ||
                ""
            );
            const selectedId = String(
                preferredParticipantId ||
                preferredParticipantIdRef.current ||
                activeConversationRef.current?.id ||
                ""
            );

            if (!selectedKey && !selectedId) return;

            const preferred = normalizedSummaries.find((entry: any) => {
                const entryKey = getChatConversationKey(entry.participant) || String(entry.participant.id || "");
                return selectedKey ? entryKey === selectedKey : String(entry.participant.id) === selectedId;
            });
            const preservedActiveConversation =
                preferredParticipant && (
                    (selectedKey && (getChatConversationKey(preferredParticipant) || String(preferredParticipant.id || "")) === selectedKey) ||
                    (!selectedKey && String(preferredParticipant.id) === selectedId)
                )
                    ? preferredParticipant
                    : activeConversationRef.current && (
                        (selectedKey && (getChatConversationKey(activeConversationRef.current) || String(activeConversationRef.current.id || "")) === selectedKey) ||
                        (!selectedKey && String(activeConversationRef.current.id) === selectedId)
                    )
                        ? activeConversationRef.current
                        : null;

            const fallback = preferred || preservedActiveConversation || null;
            if (!fallback) return;

            const nextActiveConversation = preferred
                ? (getChatConversationKey(activeConversationRef.current) || String(activeConversationRef.current?.id || "")) ===
                    (getChatConversationKey(preferred.participant) || String(preferred.participant.id || ""))
                    ? normalizeChatParticipant({ ...activeConversationRef.current, ...preferred.participant })
                    : normalizeChatParticipant(preferred.participant)
                : normalizeChatParticipant(fallback);

            preferredParticipantIdRef.current = String(nextActiveConversation?.id || "");
            preferredConversationKeyRef.current = getChatConversationKey(nextActiveConversation) || String(nextActiveConversation?.id || "");
            activeConversationRef.current = nextActiveConversation;
            setActiveConversation(nextActiveConversation);

            // Only open the mobile chat panel on explicit navigation (user click / URL param).
            // Never reopen it on background polling — that caused the back button to be ignored.
            if (openMobileChat && !mobileBackPressedRef.current) {
                setShowMobileChat(true);
            }

            // Always sync presence from the freshest server data
            const freshParticipant = preferred?.participant;
            if (freshParticipant) {
                setParticipantPresence({
                    status: freshParticipant.status === "online" ? "online" : "offline",
                    lastSeen: freshParticipant.last_seen_at
                        ? new Date(freshParticipant.last_seen_at).getTime()
                        : null,
                });
            }
        } catch (refreshError) {
            console.error("Error loading conversations:", refreshError);
        } finally {
            if (showSyncBuffer) endChatListSync();
        }
    };

    // ── Session isolation ────────────────────────────────────────────────────
    // When a second login occurs in the same browser (same localStorage), the
    // 'googer-session-mark' key gets a new value.  This tab captures its own
    // mark in sessionStorage on mount and checks every 3 s.  If the mark has
    // changed, a different account has taken over → self-logout immediately.
    useEffect(() => {
        return;
        const MARK_KEY = "googer-session-mark";
        const SS_KEY   = "googer-my-session-mark";

        const lsMark = window.localStorage.getItem(MARK_KEY) || "";
        if (lsMark && !window.sessionStorage.getItem(SS_KEY)) {
            window.sessionStorage.setItem(SS_KEY, lsMark);
        }

        const guardId = window.setInterval(() => {
            const current = window.localStorage.getItem(MARK_KEY);
            const mine    = window.sessionStorage.getItem(SS_KEY);
            if (current && mine && current !== mine) {
                // A newer login has overwritten our session — log out this tab
                window.clearInterval(guardId);
                return;
            }
        }, 3000);

        return () => window.clearInterval(guardId);
    }, []);

    useEffect(() => {
        const fetchUser = async () => {
            try {
                if (typeof window !== "undefined") {
                    const cachedUser = JSON.parse(getTabAuthValue("user") || "{}");
                    if (cachedUser?.id) {
                        setCurrentUser(cachedUser);
                        setLoading(false);
                    }
                }
                const profile = await authService.getProfile();
                setCurrentUser(profile);
            } catch (error) {
                console.error("Error loading chats profile:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchUser();
        void loadBlockedUsers();
        // Always fetch fresh plan features on mount so sticker/color buttons
        // reflect the current subscription without requiring a full page reload.
        void refreshSubscriptionFeatures();
    }, []);

    useEffect(() => {
        // Fetch ads for chat injection (fire-and-forget, no blocking)
        if (!currentUser?.id) {
            setHiddenChatAdIds(new Set());
            return;
        }
        const syncHiddenFeedItems = () => {
            setHiddenChatAdIds(getHiddenFeedItemIds(currentUser.id, "ad"));
        };
        syncHiddenFeedItems();
        return subscribeToHiddenFeedItems(syncHiddenFeedItems);
    }, [currentUser?.id]);

    useEffect(() => {
        // Fetch ads for chat injection (fire-and-forget, no blocking)
        const token = getTabAuthValue("token");
        let chatAdSeed = "chat-ad-pool";
        try {
            chatAdSeed = window.localStorage.getItem("googer-chat-ad-pool-seed-v1") || "";
            if (!chatAdSeed) {
                chatAdSeed = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
                window.localStorage.setItem("googer-chat-ad-pool-seed-v1", chatAdSeed);
            }
        } catch {}
        fetch(`/api/ads/active-public?limit=20&shuffle=${encodeURIComponent(chatAdSeed)}${token ? "" : ""}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
            .then((r) => r.ok ? r.json() : null)
            .then((data) => {
                const ads = filterAdsForViewer(data?.ads || [], currentUser).filter(
                    (ad: any) => !hiddenChatAdIds.has(getAdInteractionId(ad)),
                );
                if (ads.length > 0) setChatAds(ads);
            })
            .catch(() => {});
    }, [currentUser, hiddenChatAdIds]);

    useEffect(() => {
        if (!currentUser?.id || typeof window === "undefined") return;
        const enabledRaw = window.localStorage.getItem(`googer-chat-tts-enabled-${currentUser.id}`);
        const genderRaw = window.localStorage.getItem(`googer-chat-tts-voice-${currentUser.id}`);
        const colorRaw = window.localStorage.getItem(`googer-chat-active-color-${currentUser.id}`);
        setTtsEnabled(enabledRaw === "1");
        setTtsVoiceGender(genderRaw === "male" ? "male" : "female");
        if (colorRaw) {
            setPickedColor(colorRaw);
            setActiveTypingColor(colorRaw);
        }
    }, [currentUser?.id]);

    useEffect(() => {
        if (!currentUser?.id || typeof window === "undefined") return;
        const pathUsername = pathname?.startsWith("/chats/")
            ? decodeURIComponent(pathname.slice("/chats/".length).split("/")[0] || "").replace(/^@+/, "").trim()
            : "";
        const queryUserId = String(searchParams?.get("user") || pathUsername || "");
        if (queryUserId) return;

        const listCacheKey = getChatListCacheKey(currentUser.id);
        const lastOpenKey = getLastOpenChatKey(currentUser.id);
        const mobileViewKey = getChatMobileViewKey(currentUser.id);
        if (!listCacheKey || !lastOpenKey) return;

        try {
            const cachedListRaw = window.localStorage.getItem(listCacheKey);
            const cachedList = sanitizeConversationSummaries(cachedListRaw ? JSON.parse(cachedListRaw) : []);
            if (!Array.isArray(cachedList) || cachedList.length === 0) return;

            setConversationList(cachedList);
            const lastConversationKey = String(window.localStorage.getItem(lastOpenKey) || "");
            if (!lastConversationKey) return;
            const cachedEntry = cachedList.find((entry: any) =>
                (getChatConversationKey(entry?.participant) || String(entry?.participant?.id || "")) === lastConversationKey
            );
            const participant = cachedEntry?.participant;
            if (!participant?.id) return;

            const pid = getChatConversationKey(participant) || String(participant.id);
            const recentKey = getChatRecentKey(currentUser.id, pid);
            const cachedMessages = recentKey
                ? sanitizeChatMessages(JSON.parse(window.localStorage.getItem(recentKey) || "[]"))
                : [];
            const seedMessages = Array.isArray(cachedMessages) && cachedMessages.length > 0
                ? cachedMessages
                : cachedEntry?.lastMessage && !isAssignmentNoticeMessage(cachedEntry.lastMessage)
                    ? [cachedEntry.lastMessage]
                    : [];

            preferredParticipantIdRef.current = String(participant.id);
            preferredConversationKeyRef.current = pid;
            activeConversationRef.current = normalizeChatParticipant(participant);
            messagesCacheRef.current[pid] = seedMessages;
            setActiveConversation(normalizeChatParticipant(participant));
            setMessages(seedMessages);
            setShowMobileChat(mobileViewKey ? window.localStorage.getItem(mobileViewKey) === "chat" : false);
            setParticipantPresence({
                status: participant?.status === "online" ? "online" : "offline",
                lastSeen: participant?.last_seen_at ? new Date(participant.last_seen_at).getTime() : null,
            });
        } catch {
            // Cache restore is an optimization only; live refresh below remains source of truth.
        }
    }, [currentUser?.id, pathname, searchParams]);

    useEffect(() => {
        if (!currentUser?.id || typeof window === "undefined") return;
        window.localStorage.setItem(`googer-chat-tts-enabled-${currentUser.id}`, ttsEnabled ? "1" : "0");
    }, [currentUser?.id, ttsEnabled]);

    useEffect(() => {
        if (!currentUser?.id || typeof window === "undefined") return;
        window.localStorage.setItem(`googer-chat-tts-voice-${currentUser.id}`, ttsVoiceGender);
    }, [currentUser?.id, ttsVoiceGender]);

    useEffect(() => {
        if (!currentUser?.id || typeof window === "undefined") return;
        if (activeTypingColor) {
            window.localStorage.setItem(`googer-chat-active-color-${currentUser.id}`, activeTypingColor);
        } else {
            window.localStorage.removeItem(`googer-chat-active-color-${currentUser.id}`);
        }
    }, [currentUser?.id, activeTypingColor]);

    useEffect(() => {
        if (!currentUser?.id) return;

        const pathUsername = pathname?.startsWith("/chats/")
            ? decodeURIComponent(pathname.slice("/chats/".length).split("/")[0] || "").replace(/^@+/, "").trim()
            : "";
        const queryParamUser = String(searchParams?.get("user") || "");
        const queryTarget = String(queryParamUser || pathUsername || "");
        const shouldResolveAsUsername = !!pathUsername && !queryParamUser;
        const lastOpenKey = getLastOpenChatKey(currentUser.id);
        const lastOpenId = lastOpenKey && typeof window !== "undefined" ? String(window.localStorage.getItem(lastOpenKey) || "") : "";
        if (lastOpenId && !queryTarget && !preferredParticipantIdRef.current) {
            preferredConversationKeyRef.current = String(lastOpenId);
        } else if (queryTarget) {
            preferredConversationKeyRef.current = "";
        }

        const mobileViewKey = typeof window !== "undefined" ? getChatMobileViewKey(currentUser.id) : null;
        const shouldOpenMobileChat = !!queryTarget || (!!mobileViewKey && window.localStorage.getItem(mobileViewKey) === "chat");

        let cancelled = false;
        const loadInitialConversation = async () => {
            let resolvedTargetId = queryTarget;
            let queryParticipant = queryTarget
                ? normalizeChatParticipant({
                    id: queryTarget,
                    name: searchParams?.get("name") || "User",
                    profile_picture: null,
                    roleLabel: "User",
                    username: pathUsername || null,
                })
                : null;

            if (queryTarget) {
                try {
                    const profile = !shouldResolveAsUsername && /^\d+$/.test(queryTarget)
                        ? await authService.getUserProfile(queryTarget)
                        : await authService.getUserByUsername(queryTarget);
                    if (!cancelled && profile?.id) {
                        resolvedTargetId = String(profile.id);
                        queryParticipant = normalizeChatParticipant({
                            ...profile,
                            id: profile.id,
                            name: profile.full_name || profile.username || queryParticipant?.name || "User",
                            username: profile.username || null,
                            profile_picture: profile.profile_picture || null,
                            roleLabel: "User",
                        });
                    }
                } catch {
                    // Keep the lightweight fallback participant if profile lookup fails.
                }
            }

            const initialPreferredParticipantId = String(preferredParticipantIdRef.current || resolvedTargetId || "");
            if (initialPreferredParticipantId) {
                preferredParticipantIdRef.current = initialPreferredParticipantId;
            }

            if (!cancelled) {
                // Initial load restores data, but only opens mobile chat if the user was inside a chat.
                await refreshConversations(initialPreferredParticipantId, queryParticipant, shouldOpenMobileChat, true);
            }
        };

        void loadInitialConversation();
        const fallbackRefreshId = window.setInterval(() => {
            if (typeof document !== "undefined" && document.hidden) return;
            refreshConversations(preferredParticipantIdRef.current || queryTarget || "", null, false);
        }, 2000);
        const handleVisibilityChange = () => {
            // Skip background poll when tab is hidden — saves connections and prevents stale
            // state racing with active-tab interactions (Instagram/Facebook pattern)
            if (typeof document !== "undefined" && document.hidden) return;
            // Background polling: never force-open mobile chat
            refreshConversations(preferredParticipantIdRef.current || queryTarget || "", null, false);
        };
        window.addEventListener("focus", handleVisibilityChange);
        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            cancelled = true;
            window.clearInterval(fallbackRefreshId);
            window.removeEventListener("focus", handleVisibilityChange);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, [currentUser?.id, pathname, searchParams]);

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
                let users = await walletService.searchUsers(trimmedQuery);
                const exactExists = (users || []).some((user: any) =>
                    String(user.username || "").toLowerCase() === trimmedQuery.toLowerCase()
                );
                if (!exactExists) {
                    try {
                        const exactUser = await authService.getUserByUsername(trimmedQuery);
                        if (exactUser?.id) {
                            users = [exactUser, ...(users || []).filter((user: any) => String(user.id) !== String(exactUser.id))];
                        }
                    } catch { }
                }
                if (!active) return;
                const blockedIds = new Set(blockedUsers.map((u: any) => String(u.id)));
                setSearchResults((users || []).filter((user: any) =>
                    String(user.id) !== String(currentUser.id) && !blockedIds.has(String(user.id))
                ));
            } catch (error) {
                if (active) {
                    console.error("Chat search failed:", error);
                    try {
                        const exactUser = await authService.getUserByUsername(trimmedQuery);
                        const blockedIds = new Set(blockedUsers.map((u: any) => String(u.id)));
                        setSearchResults(exactUser?.id && String(exactUser.id) !== String(currentUser.id) && !blockedIds.has(String(exactUser.id)) ? [exactUser] : []);
                    } catch {
                        setSearchResults([]);
                    }
                }
            } finally {
                if (active) setSearchLoading(false);
            }
        }, 250);

        return () => {
            active = false;
            window.clearTimeout(timeoutId);
        };
    }, [searchQuery, currentUser?.id, blockedUsers]);

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
                let users = await walletService.searchUsers(trimmedQuery);
                const exactExists = (users || []).some((user: any) =>
                    String(user.username || "").toLowerCase() === trimmedQuery.toLowerCase()
                );
                if (!exactExists) {
                    try {
                        const exactUser = await authService.getUserByUsername(trimmedQuery);
                        if (exactUser?.id) {
                            users = [exactUser, ...(users || []).filter((user: any) => String(user.id) !== String(exactUser.id))];
                        }
                    } catch { }
                }
                if (!active) return;
                setNewChatResults((users || []).filter((user: any) => String(user.id) !== String(currentUser.id)));
            } catch (error) {
                if (active) {
                    console.error("New chat search failed:", error);
                    try {
                        const exactUser = await authService.getUserByUsername(trimmedQuery);
                        setNewChatResults(exactUser?.id && String(exactUser.id) !== String(currentUser.id) ? [exactUser] : []);
                    } catch {
                        setNewChatResults([]);
                    }
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
            chatService.updatePresence(
                activeConversation?.id ? Number(activeConversation.id) : null,
                scopedProductStatusId || activeConversation?.product_status_id || null,
                scopedTopupRequestId || activeConversation?.topup_request_id || null,
            ).catch(() => { });
        };

        writePresence();
        // Write own presence every 1500ms so the other party sees us online quickly
        const intervalId = window.setInterval(writePresence, 1500);
        window.addEventListener("focus", writePresence);
        window.addEventListener("visibilitychange", () => {
            if (!document.hidden) writePresence();
        });

        return () => {
            window.clearInterval(intervalId);
            window.removeEventListener("focus", writePresence);
        };
    }, [currentUser?.id, activeConversation?.id]);

    useEffect(() => {
        if (!currentUser?.id || !activeConversation?.id) return;

        let mounted = true;
        const requestedConversationId = String(activeConversation.id);

        const loadMessages = async () => {
            // Instagram/Facebook pattern: don't poll when the tab is hidden — saves server load
            // and prevents a background response from overwriting optimistic UI mid-interaction
            if (typeof document !== "undefined" && document.hidden) return;
            try {
                const [fetchedMessages, typingData] = await Promise.allSettled([
                    chatService.getMessages(
                        Number(requestedConversationId),
                        true,
                        scopedProductStatusId || activeConversationRef.current?.product_status_id || null,
                        scopedTopupRequestId || activeConversationRef.current?.topup_request_id || null,
                        activeConversationRef.current?.assigned_admin_id || null,
                    ),
                    chatService.getTyping(Number(requestedConversationId)),
                ]);
                if (!mounted || String(activeConversationRef.current?.id || "") !== requestedConversationId) return;
                if (fetchedMessages.status === "fulfilled") {
                    const freshMsgs = sanitizeChatMessages(Array.isArray(fetchedMessages.value) ? fetchedMessages.value : []);
                    const requestedConversationKey = getChatConversationKey(activeConversationRef.current) || requestedConversationId;
                    messagesCacheRef.current[requestedConversationKey] = freshMsgs;
                    const recentKey = getChatRecentKey(currentUser.id, requestedConversationKey);
                    if (recentKey) {
                        try { window.localStorage.setItem(recentKey, JSON.stringify(freshMsgs)); } catch { }
                    }
                    setMessages((currentMessages) => {
                        if (String(activeConversationRef.current?.id || "") !== requestedConversationId) return currentMessages;
                        if (freshMsgs.length === 0) {
                            if (clearedConversationIds.current.has(requestedConversationId)) return [];
                            return currentMessages.length > 0 ? currentMessages : freshMsgs;
                        }
                        // Preserve optimistic "sending" messages that the server hasn't confirmed yet
                        // (they were added by handleSendMessage and haven't round-tripped back yet).
                        // This prevents the brief flicker where a just-sent message disappears for 1-2 polls.
                        const serverIds = new Set(freshMsgs.map((m: any) => String(m.id)));
                        const pendingOptimistic = currentMessages.filter(
                            (m: any) =>
                                m.status === "sending" &&
                                !serverIds.has(String(m.id)) &&
                                Date.now() - new Date(m.created_at || 0).getTime() < 8000
                        );
                        if (pendingOptimistic.length === 0) return mergeMessageList(currentMessages, freshMsgs);
                        return mergeMessageList(freshMsgs, pendingOptimistic);
                    });
                }
                if (typingData.status === "fulfilled") {
                    setParticipantTyping(!!(typingData.value as any)?.is_typing);
                }
            } catch (messageError) {
                if (mounted) {
                    console.error("Error loading messages:", messageError);
                }
            }
        };

        loadMessages();
        const fallbackMessageRefreshId = window.setInterval(() => {
            void loadMessages();
        }, 1500);
        // Resume immediately when the tab becomes visible again (back from another app/tab)
        const handleVisibilityChange = () => { if (!document.hidden) void loadMessages(); };
        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () => {
            mounted = false;
            window.clearInterval(fallbackMessageRefreshId);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, [currentUser?.id, activeConversation?.id]);

    useEffect(() => {
        if (!activeConversation?.id) {
            setScopedAssignment(null);
            return;
        }

        if (!scopedProductStatusId && !scopedTopupRequestId) {
            setScopedAssignment(null);
            return;
        }

        let mounted = true;
        const loadScopedAssignment = async () => {
            try {
                const assignment = scopedProductStatusId
                    ? await chatService.getProductStatusAssignment(scopedProductStatusId)
                    : scopedTopupRequestId
                        ? await chatService.getTopupRequestAssignment(scopedTopupRequestId)
                        : null;
                if (mounted) {
                    setScopedAssignment(assignment || null);
                }
            } catch {
                if (mounted) {
                    setScopedAssignment(null);
                }
            }
        };

        void loadScopedAssignment();
        return () => {
            mounted = false;
        };
    }, [activeConversation?.id, scopedProductStatusId, scopedTopupRequestId]);

    useEffect(() => {
        const assignedAdmin = scopedAssignment?.assigned_admin;
        if (!assignedAdmin || !activeConversation?.id) return;
        if (!participantMatchesAssignedAdmin(activeConversation, assignedAdmin.id)) return;

        const patchedParticipant = normalizeChatParticipant({
            ...activeConversation,
            name: assignedAdmin.username || assignedAdmin.name || activeConversation.name,
            username: assignedAdmin.username || activeConversation.username || null,
            profile_picture: assignedAdmin.profile_picture || activeConversation.profile_picture || null,
            user_type: "admin",
            roleLabel: "Admin",
            assigned_admin_alias: true,
            assigned_admin_id: assignedAdmin.id || activeConversation.assigned_admin_id || null,
        });

        activeConversationRef.current = patchedParticipant;
        setActiveConversation((current: any) => {
            if (String(current?.id || "") !== String(patchedParticipant.id)) return current;
            if (
                current.name === patchedParticipant.name &&
                current.username === patchedParticipant.username &&
                current.profile_picture === patchedParticipant.profile_picture &&
                current.assigned_admin_alias === true
            ) {
                return current;
            }
            return patchedParticipant;
        });
        setConversationList((prev) => {
            const next = prev.map((entry) =>
                getChatConversationKey(entry?.participant) === getChatConversationKey(patchedParticipant)
                    ? {
                        ...entry,
                        participant: {
                            ...entry.participant,
                            name: patchedParticipant.name,
                            username: patchedParticipant.username,
                            profile_picture: patchedParticipant.profile_picture,
                            user_type: "admin",
                            roleLabel: "Admin",
                            assigned_admin_alias: true,
                            assigned_admin_id: patchedParticipant.assigned_admin_id,
                        },
                    }
                    : entry
            );
            persistConversationListSnapshot(next);
            return next;
        });
    }, [activeConversation, persistConversationListSnapshot, scopedAssignment]);

    const persistMessages = (nextMessages: any[]) => {
        const sanitizedMessages = sanitizeChatMessages(nextMessages);
        setMessages(sanitizedMessages);
        if (currentUser?.id && activeConversation?.id) {
            const activeId = getChatConversationKey(activeConversation) || String(activeConversation.id);
            messagesCacheRef.current[activeId] = sanitizedMessages;
            const recentKey = getChatRecentKey(currentUser.id, activeId);
            if (recentKey) {
                try { window.localStorage.setItem(recentKey, JSON.stringify(sanitizedMessages)); } catch { }
            }
        }
    };

    const mergeIncomingMessage = useCallback((message: any) => {
        if (!message || !currentUser?.id) return;
        if (isAssignmentNoticeMessage(message)) return;
        const otherUserId = String(message.sender_id) === String(currentUser.id)
            ? String(message.receiver_id)
            : String(message.sender_id);
        clearedConversationIds.current.delete(otherUserId);
        unhideLocalConversation(otherUserId);

        messagesCacheRef.current[otherUserId] = mergeMessageList(messagesCacheRef.current[otherUserId] || [], [message]);
        const recentKey = getChatRecentKey(currentUser.id, otherUserId);
        if (recentKey) {
            try { window.localStorage.setItem(recentKey, JSON.stringify(messagesCacheRef.current[otherUserId])); } catch { }
        }

        if (String(activeConversationRef.current?.id || "") === otherUserId) {
            setMessages((currentMessages) => mergeMessageList(currentMessages, [message]));
        }

        setConversationList((prev) => {
            const existing = prev.find((entry) => String(entry.participant.id) === otherUserId);
            const participant = normalizeChatParticipant(existing?.participant || (
                String(activeConversationRef.current?.id || "") === otherUserId ? activeConversationRef.current : null
            ) || {
                id: otherUserId,
                name: String(message.sender_id) === String(currentUser.id)
                    ? (message.receiver_name || "User")
                    : (message.sender_name || "User"),
                username: null,
                profile_picture: null,
                roleLabel: "User",
            });
            const rest = prev.filter((entry) => String(entry.participant.id) !== otherUserId);
            const isOpen = String(activeConversationRef.current?.id || "") === otherUserId;
            const isIncomingUnread = String(message.receiver_id) === String(currentUser.id) && !isOpen;
            const next = [
                {
                    ...(existing || {}),
                    participant,
                    unread_count: isIncomingUnread ? Number(existing?.unread_count || 0) + 1 : 0,
                    lastMessage: message,
                    conversation: [],
                },
                ...rest,
            ];
            persistConversationListSnapshot(next);
            return next;
        });
    }, [currentUser?.id, persistConversationListSnapshot, unhideLocalConversation]);

    const mergeMessageStatus = useCallback((statusUpdate: any) => {
        if (!statusUpdate?.id && !statusUpdate?.client_message_id) return;
        const updateMessage = (message: any) => {
            const sameServerId = statusUpdate.id && String(message.id) === String(statusUpdate.id);
            const sameClientId = statusUpdate.client_message_id && message.client_message_id === statusUpdate.client_message_id;
            if (!sameServerId && !sameClientId) return message;
            return {
                ...message,
                status: statusUpdate.status || message.status,
                delivered_at: statusUpdate.delivered_at ?? message.delivered_at,
                read_at: statusUpdate.read_at ?? message.read_at,
            };
        };

        setMessages((currentMessages) => mergeMessageList(currentMessages.map(updateMessage), []));

        Object.keys(messagesCacheRef.current).forEach((participantId) => {
            messagesCacheRef.current[participantId] = messagesCacheRef.current[participantId].map(updateMessage);
            const recentKey = getChatRecentKey(currentUser?.id, participantId);
            if (recentKey) {
                try { window.localStorage.setItem(recentKey, JSON.stringify(messagesCacheRef.current[participantId])); } catch { }
            }
        });

        setConversationList((prev) => {
            const next = prev.map((entry) => ({
                ...entry,
                lastMessage: entry.lastMessage ? updateMessage(entry.lastMessage) : entry.lastMessage,
            }));
            persistConversationListSnapshot(next);
            return next;
        });
    }, [currentUser?.id, persistConversationListSnapshot]);

    const mergePresenceUpdate = useCallback((presence: any) => {
        if (!presence?.user_id) return;
        const participantId = String(presence.user_id);
        const status = presence.status === "online" ? "online" : "offline";
        const lastSeen = presence.last_seen_at || new Date().toISOString();

        if (String(activeConversationRef.current?.id || "") === participantId) {
            setParticipantPresence({
                status,
                lastSeen: lastSeen ? new Date(lastSeen).getTime() : null,
            });
            activeConversationRef.current = normalizeChatParticipant({
                ...activeConversationRef.current,
                status,
                last_seen_at: lastSeen,
            });
            setActiveConversation((current: any) =>
                current && String(current.id) === participantId
                    ? normalizeChatParticipant({ ...current, status, last_seen_at: lastSeen })
                    : current
            );
        }

        setConversationList((prev) => {
            let changed = false;
            const next = prev.map((entry) => {
                if (String(entry.participant?.id || "") !== participantId) return entry;
                changed = true;
                return {
                    ...entry,
                    participant: {
                        ...entry.participant,
                        status,
                        last_seen_at: lastSeen,
                    },
                };
            });
            if (changed) persistConversationListSnapshot(next);
            return changed ? next : prev;
        });
    }, [persistConversationListSnapshot]);

    const mergeDeletedMessage = useCallback((payload: any) => {
        if (!payload?.id && !payload?.client_message_id) return;
        const isDeleted = (message: any) =>
            (payload.id && String(message.id) === String(payload.id)) ||
            (payload.client_message_id && message.client_message_id === payload.client_message_id);
        const markDeleted = (message: any) => {
            if (!isDeleted(message)) return message;
            if (payload.mode === "everyone") {
                return { ...message, deleted_for_everyone: true, deleted_for: ["everyone"] };
            }
            return {
                ...message,
                deleted_for: [...new Set([...(message.deleted_for || []), String(currentUser?.id)])],
            };
        };

        setMessages((prev) => prev.map(markDeleted));
        Object.keys(messagesCacheRef.current).forEach((participantId) => {
            messagesCacheRef.current[participantId] = messagesCacheRef.current[participantId].map(markDeleted);
            const recentKey = getChatRecentKey(currentUser?.id, participantId);
            if (recentKey) {
                try { window.localStorage.setItem(recentKey, JSON.stringify(messagesCacheRef.current[participantId])); } catch { }
            }
        });

        setConversationList((prev) => {
            const next = prev.map((entry) => {
                if (!entry.lastMessage || !isDeleted(entry.lastMessage)) return entry;
                return { ...entry, lastMessage: markDeleted(entry.lastMessage) };
            });
            persistConversationListSnapshot(next);
            return next;
        });
    }, [currentUser?.id, persistConversationListSnapshot]);

    const sendRealtimeMessage = useCallback((payload: any) =>
        new Promise<any>((resolve, reject) => {
            const socket = chatSocketRef.current;
            if (!socket?.connected) {
                reject(new Error("Socket disconnected"));
                return;
            }

            socket.timeout(8000).emit("chat:send_message", payload, (err: Error | null, response: any) => {
                if (err) {
                    reject(err);
                    return;
                }
                if (!response?.success) {
                    reject(new Error(response?.message || "Unable to send message."));
                    return;
                }
                resolve(response.data);
            });
        }), []);

    useEffect(() => {
        if (!currentUser?.id || typeof window === "undefined") return;
        const token = getTabAuthValue("token");
        if (!token) return;

        const socketUrl = getChatSocketUrl();
        const socket = io(socketUrl, {
            path: "/socket.io",
            auth: { token },
            transports: ["websocket"],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: 5,
        });
        chatSocketRef.current = socket;

        socket.on("connect", () => {
            console.info("[chat socket] connected", { socketId: socket.id, userId: currentUser.id });
        });
        socket.on("connect_error", (error) => {
            console.warn("[chat socket] connect_error", error?.message || error);
        });
        socket.on("disconnect", (reason) => {
            console.warn("[chat socket] disconnected", reason);
        });
        socket.on("chat:message", mergeIncomingMessage);
        socket.on("chat:message_status", mergeMessageStatus);
        socket.on("chat:message_deleted", mergeDeletedMessage);
        socket.on("chat:presence", mergePresenceUpdate);
        const typingTimeoutRef = { current: null as any };
        socket.on("chat:typing", (payload: any) => {
            if (String(payload?.sender_id || "") === String(activeConversationRef.current?.id || "")) {
                setParticipantTyping(!!payload.is_typing);
                if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                typingTimeoutRef.current = window.setTimeout(() => setParticipantTyping(false), 3500);
            }
        });

        return () => {
            socket.off("connect");
            socket.off("connect_error");
            socket.off("disconnect");
            socket.off("chat:message", mergeIncomingMessage);
            socket.off("chat:message_status", mergeMessageStatus);
            socket.off("chat:message_deleted", mergeDeletedMessage);
            socket.off("chat:presence", mergePresenceUpdate);
            socket.off("chat:typing");
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            socket.disconnect();
            if (chatSocketRef.current === socket) chatSocketRef.current = null;
        };
    }, [currentUser?.id, mergeIncomingMessage, mergeMessageStatus, mergeDeletedMessage, mergePresenceUpdate]);

    const visibleMessages = messages.filter((message: any) => {
        if (message.deleted_for_everyone) return false;
        if (!Array.isArray(message.deleted_for)) return true;
        return !message.deleted_for.includes(String(currentUser?.id)) && !message.deleted_for.includes("everyone");
    });

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

    // --- Chat ad action handlers ---
    const canShowChatAdCollectCoin = useCallback((ad: any) => canShowCollectCoinButton(ad, currentUser), [currentUser]);

    const openChatAdSheet = useCallback(async (type: string, ad: any) => {
        setChatAdSheetType(type);
        setChatAdSheetItem(ad);
        setChatAdSheetOpen(true);
        setChatAdSheetData([]);
        setChatAdSheetLoading(true);
        try {
            let data: any[] = [];
            const id = ad?.id ?? ad?.adId ?? ad?.ad_id;
            if (!id) return;
            if (type === "comments") data = await marketService.getComments(id);
            else if (type === "likes") data = (await marketService.getLikes(id)) || [];
            else if (type === "shares") data = (await marketService.getShares(id)) || [];
            else if (type === "views") data = (await marketService.getViews(id)) || [];
            setChatAdSheetData(data || []);
        } catch (err) {
            console.error("Chat ad sheet error:", err);
        } finally {
            setChatAdSheetLoading(false);
        }
    }, []);

    const chatAdActions = useAdActions(null, {
        currentUser,
        canShowCollectCoin: canShowChatAdCollectCoin,
        onShare: (item) => {
            setChatAdShareItem(item.raw || item);
            setChatAdShareOpen(true);
        },
        onOpenSheet: (type, item) => {
            void openChatAdSheet(type, item.raw || item);
        },
        onCoinCollected: (_ad, _collectionId, result) => {
            const collectedAmount = Number(result?.amount ?? result?.coin_value ?? result?.ad_coin_value ?? 1);
            setChatAdNotification({
                type: "success",
                message: "Coin collected",
            });
            setChatAdPendingCoin(null);
            if (typeof window !== "undefined") window.dispatchEvent(new Event("googer-wallet-updated"));
        },
        onCoinError: (_ad, error: any) => {
            setChatAdNotification({
                type: "error",
                title: "Collection Failed",
                message: error?.message || "Could not collect the ad coin.",
            });
            setChatAdPendingCoin(null);
        },
        onNeedCoinConfirmation: (item) => {
            setChatAdPendingCoin(item.raw || item);
        },
        onNotify: (n) => setChatAdNotification(n),
    });

    useEffect(() => {
        if (!chatAdPendingCoin) return;
        void chatAdActions.collectAdCoin(chatAdPendingCoin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chatAdPendingCoin]);

    const addChatAdComment = useCallback(async (comment: string, parentId?: number) => {
        if (!chatAdSheetItem || !comment.trim()) return;
        try {
            const commentData = await marketService.addComment(chatAdSheetItem.id, comment.trim(), parentId);
            setChatAdSheetData((prev) => [...prev, {
                ...commentData,
                username: currentUser?.username || commentData?.username || "You",
                profile_picture: currentUser?.profile_picture ?? commentData?.profile_picture,
            }]);
            updateAdState(chatAdSheetItem, (prev: any) => ({ comments_count: (prev.comments_count || 0) + 1 }));
        } catch (err) {
            console.error("Chat ad comment error:", err);
        }
    }, [chatAdSheetItem, currentUser, updateAdState]);

    const deleteChatAdComment = useCallback(async (commentId: number | string) => {
        if (!chatAdSheetItem) return;
        try {
            await marketService.deleteComment(commentId);
            const data = await marketService.getComments(chatAdSheetItem.id);
            setChatAdSheetData(data || []);
            updateAdState(chatAdSheetItem, (prev: any) => ({ comments_count: Math.max(0, (prev.comments_count || 0) - 1) }));
        } catch (err) {
            console.error("Chat ad delete comment error:", err);
        }
    }, [chatAdSheetItem, updateAdState]);

    const handleChatAdCopyLink = useCallback(async () => {
        if (!chatAdShareItem?.id) return;
        try {
            const result = await marketService.logShare(chatAdShareItem.id);
            if (result?.incremented === true) {
                updateAdState(chatAdShareItem, (prev: any) => ({ shares_count: (prev.shares_count || 0) + 1 }));
            }
        } catch (err) {
            console.error("Chat ad share error:", err);
        }
    }, [chatAdShareItem, updateAdState]);

    const handleChatAdCollectCoin = useCallback((event: React.MouseEvent, ad: any) => {
        chatAdActions.handleAdCoinClick(event, ad);
    }, [chatAdActions]);

    const handleChatAdNavigateToProfile = useCallback((event: React.MouseEvent, ad: any) => {
        event.stopPropagation();
        const userId = ad?.userId || ad?.user_id || ad?.raw?.user_id || ad?.raw?.userId;
        const username = ad?.username || ad?.owner_username || ad?.raw?.username || ad?.raw?.owner_username || ad?.raw?.user?.username;
        if (userId && typeof window !== "undefined") {
            window.location.href = getPublicProfileHref(username, userId);
        }
    }, []);

    const handleChatAdLogView = useCallback(async (ad: any) => {
        try {
            const adId = ad?.adId || ad?.ad_id || ad?.raw?.adId || ad?.raw?.ad_id;
            if (!adId) return;
            const viewId = `ad-${String(adId).replace(/^ad-/, "")}`;
            const result = await marketService.logView(viewId);
            if (!result?.success) return;
            const nextViewsCount = Number(
                result.views_count ??
                result.viewCount ??
                result.views ??
                ad?.views_count ??
                ad?.viewCount ??
                0
            );
            const nextReach = Number(result.current_reach ?? result.reach ?? 0);
            updateAdState(ad, {
                views_count: nextViewsCount,
                viewCount: nextViewsCount,
                current_reach: nextReach,
                reach: nextReach,
                clicks: Number(result.clicks || result.link_actions || 0),
                link_actions: Number(result.link_actions || result.clicks || 0),
                message_clicks: Number(result.message_clicks || 0),
                visit_clicks: Number(result.visit_clicks || 0),
                call_clicks: Number(result.call_clicks || 0),
            });
        } catch { }
    }, [updateAdState]);

    const handleChatAdLogImpression = useCallback(async (ad: any) => {
        try {
            const adId = ad?.adId || ad?.ad_id || ad?.raw?.adId || ad?.raw?.ad_id;
            if (!adId) return;
            const impressionId = `ad-${String(adId).replace(/^ad-/, "")}`;
            const result = await marketService.logAdImpression(impressionId);
            if (!result?.success) return;
            updateAdState(ad, {
                impressions: Number(result.impressions ?? ad?.impressions ?? ad?.impressions_count ?? 0),
                impressions_count: Number(result.impressions ?? ad?.impressions ?? ad?.impressions_count ?? 0),
                current_reach: Number(result.current_reach ?? result.reach ?? ad?.current_reach ?? ad?.reach ?? 0),
                reach: Number(result.current_reach ?? result.reach ?? ad?.current_reach ?? ad?.reach ?? 0),
            });
        } catch { }
    }, [updateAdState]);

    const openChatProductPromoteSecondView = useCallback(async (ad: any) => {
        const originalProduct = await resolveProductPromoteProduct(ad);
        if (!originalProduct) {
            setChatAdNotification({
                type: "error",
                title: "Product unavailable",
                message: "The promoted product could not be loaded.",
            });
            return;
        }
        setChatProductAdModal(originalProduct);
    }, []);

    const isCurrentUserChatAdOwner = useCallback((ad: any) => {
        const raw = ad?.raw?.raw || ad?.raw || {};
        const ownerIds = getIdentityCandidates(
            ad?.ad_owner_user_id,
            ad?.advertiser_id,
            ad?.owner_user_id,
            ad?.ownerUserId,
            ad?.user_id,
            ad?.userId,
            raw?.ad_owner_user_id,
            raw?.advertiser_id,
            raw?.owner_user_id,
            raw?.ownerUserId,
            raw?.user_id,
            raw?.userId,
        );
        const currentIds = getIdentityCandidates(
            currentUser?.id,
            currentUser?.user_id,
            currentUser?.googer_id,
            currentUser?.userId,
        );
        const ownerNames = getNameCandidates(
            ad?.owner_username,
            ad?.ownerUsername,
            ad?.username,
            raw?.owner_username,
            raw?.ownerUsername,
            raw?.username,
        );
        const currentNames = getNameCandidates(
            currentUser?.username,
            currentUser?.name,
            currentUser?.full_name,
        );

        return (
            ownerIds.length > 0 &&
            currentIds.length > 0 &&
            ownerIds.some((id) => currentIds.includes(id))
        ) || (
            ownerNames.length > 0 &&
            currentNames.length > 0 &&
            ownerNames.some((name) => currentNames.includes(name))
        );
    }, [currentUser]);

    const handleChatAdPromoteAgain = useCallback((ad: any) => {
        const campaignType = String(ad?.campaign_type || ad?.campaignType || ad?.raw?.campaign_type || ad?.raw?.campaignType || "").trim().toLowerCase();
        if (campaignType === "product promote") {
            void promoteProductAdAgain({ ad, router });
        }
    }, [router]);

    const canPromoteChatAd = useCallback((ad: any) => {
        const campaignType = String(ad?.campaign_type || ad?.campaignType || ad?.raw?.campaign_type || ad?.raw?.campaignType || "").trim().toLowerCase();
        if (campaignType === "product promote") return isProductPromotableAd(ad);
        return false;
    }, []);

    const handleChatAdNotInterested = useCallback((adId: any) => {
        const targetAd = chatAds.find((ad) => getAdInteractionId(ad) === getAdInteractionId(adId));
        const interactionId = targetAd ? getAdInteractionId(targetAd) : getAdInteractionId(adId);
        if (!interactionId) return;
        hideFeedItemFor24Hours(currentUser?.id, "ad", interactionId);
        setHiddenChatAdIds((prev) => {
            const next = new Set(prev);
            next.add(interactionId);
            return next;
        });
        setChatAds((currentAds) => currentAds.filter((ad) => getAdInteractionId(ad) !== interactionId));
    }, [chatAds, currentUser?.id]);

    const handleChatAdDelete = useCallback(async (ad: any) => {
        if (!isCurrentUserChatAdOwner(ad)) return;

        try {
            const deletedAd = await adsService.deleteAd(ad);
            const adId = String(deletedAd?.adId || deletedAd?.ad_id || ad?.adId || ad?.ad_id || ad?.raw?.adId || ad?.raw?.ad_id || "").replace(/^ad-/, "");
            const isSameAd = (candidate: any) => {
                const candidateRaw = candidate?.raw?.raw || candidate?.raw || candidate || {};
                const candidateId = String(candidateRaw.ad_id || candidateRaw.adId || candidate?.ad_id || candidate?.adId || candidateRaw.id || candidate?.id || "").replace(/^ad-/, "");
                return candidateId === adId;
            };
            setChatAds((currentAds) => currentAds.filter((item) => !isSameAd(item)));
            adPlacementAssignmentsRef.current = {};
            setChatAdNotification({ type: "success", title: "Deleted", message: "Ad removed from feeds." });
            window.dispatchEvent(new Event("googer-ad-history-updated"));
        } catch (error) {
            setChatAdNotification({
                type: "error",
                title: "Delete failed",
                message: error instanceof Error ? error.message : "Could not delete this ad.",
            });
        }
    }, [isCurrentUserChatAdOwner]);

    type ChatAdPlacementState = { ad: any };
    const adThresholdsRef = useRef<Record<string, number[]>>({});
    const adPlacementAssignmentsRef = useRef<Record<string, Record<number, ChatAdPlacementState>>>({});

    const getAdThresholds = useCallback((convId: string, totalAds: number): number[] => {
        const existingThresholds = adThresholdsRef.current[convId];
        if (existingThresholds?.length) {
            return existingThresholds;
        }
        // Deterministic-ish seed from convId so thresholds are stable per conversation
        let seed = 0;
        for (let i = 0; i < convId.length; i++) seed = (seed * 31 + convId.charCodeAt(i)) >>> 0;
        const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0xffffffff; };

        const rand = (min: number, max: number) => Math.floor(rng() * (max - min + 1)) + min;

        // 1st ad: outgoing message 8–12
        const thresholds: number[] = [];
        // 2nd ad: 20–30 after 1st
        for (let i = 0; i < Math.max(totalAds, 20); i++) {
        // 3rd ad: 45–60 after 2nd
            thresholds.push(i * 10 + rand(1, 10));

        }

        adThresholdsRef.current[convId] = thresholds;
        return thresholds;
    }, []);

    const getAssignedConversationAd = useCallback((convId: string, slotIndex: number, ads: any[]) => {
        if (!ads.length) return null;

        if (!adPlacementAssignmentsRef.current[convId]) {
            adPlacementAssignmentsRef.current[convId] = {};
        }

        const placements = adPlacementAssignmentsRef.current[convId];
        const existing = placements[slotIndex];
        if (existing) return existing;

        const usedAdIds = new Set(
            Object.values(placements).map((assigned: any) =>
                String(assigned?.ad?.adId || assigned?.ad?.ad_id || assigned?.ad?.raw?.adId || assigned?.ad?.raw?.ad_id || assigned?.ad?.id || ""),
            ),
        );

        const nextAd =
            ads.find((candidate) => {
                const candidateAdId = String(candidate?.adId || candidate?.ad_id || candidate?.raw?.adId || candidate?.raw?.ad_id || candidate?.id || "");
                return candidateAdId && !usedAdIds.has(candidateAdId);
            }) ||
            ads[slotIndex % ads.length];

        const placement = { ad: nextAd };
        placements[slotIndex] = placement;
        return placement;
    }, []);

    // Build ad context for the render loop
    const conversationAds = useMemo(() => {
        return chatAds.filter((ad) => {
            if (hiddenChatAdIds.has(getAdInteractionId(ad))) return false;
            const normalized = normalizeAdData(ad);
            const adType = String(normalized?.type || ad?.type || "").trim().toLowerCase();
            return adType !== "profile";
        });
    }, [chatAds, hiddenChatAdIds]);

    const adInjectedMessages = useMemo(() => {
        if (!currentUser?.id || conversationAds.length === 0) return null;
        return { ads: conversationAds, currentUserId: String(currentUser.id) };
    }, [conversationAds, currentUser?.id]);

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

    const visibleConversationList = useMemo(
        () => conversationList.filter((entry) => !hiddenChatIds.has(String(entry.participant.id))),
        [conversationList, hiddenChatIds]
    );

    const scrollMessagesToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
        window.requestAnimationFrame(() => {
            messagesEndRef.current?.scrollIntoView({ behavior, block: "end" });
            });
    }, []);

    useEffect(() => {
        if (!currentUser?.id) {
            setHiddenChatIds(new Set());
            return;
        }
        try {
            const raw = localStorage.getItem(`googer-hidden-chats-${currentUser.id}`);
            setHiddenChatIds(raw ? new Set(JSON.parse(raw)) : new Set());
        } catch {
            setHiddenChatIds(new Set());
        }
    }, [currentUser?.id]);

    useEffect(() => {
        if (!activeConversation?.id) return;
        // Double-rAF: first frame lets React commit the DOM, second ensures the
        // messages container has its final height before we scroll.
        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
                messagesEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
            });
        });
    }, [activeConversation?.id, combinedMessages.length]);

    const handleOpenConversation = (participant: any, conversation: any[] = []) => {
        mobileBackPressedRef.current = false;
        preferredParticipantIdRef.current = String(participant?.id || "");
        const normalizedParticipant = normalizeChatParticipant(participant);
        const conversationKey = getChatConversationKey(normalizedParticipant) || String(participant?.id || "");
        preferredConversationKeyRef.current = conversationKey;
        activeConversationRef.current = normalizedParticipant;
        const lastOpenKey = getLastOpenChatKey(currentUser?.id);
        if (lastOpenKey && conversationKey) {
            try { window.localStorage.setItem(lastOpenKey, conversationKey); } catch { }
        }
        setConversationList((prev) => {
            const next = prev.map((entry) =>
                String(entry.participant?.id || "") === String(participant.id)
                    ? { ...entry, unread_count: 0 }
                    : entry
            );
            persistConversationListSnapshot(next);
            return next;
        });
        chatService.updatePresence(
            participant?.id ? Number(participant.id) : null,
            scopedProductStatusId,
            scopedTopupRequestId,
        ).catch(() => { });
        const mobileViewKey = getChatMobileViewKey(currentUser?.id);
        if (mobileViewKey) {
            try { window.localStorage.setItem(mobileViewKey, "chat"); } catch { }
        }
        // Snapshot the current WhatsApp-style sort order so the list stays frozen
        // while the user is inside this conversation
        frozenConvOrderRef.current = [...visibleConversationList]
            .sort((a, b) => {
                const aPin = pinnedChats.has(String(a.participant.id)) ? 0 : 1;
                const bPin = pinnedChats.has(String(b.participant.id)) ? 0 : 1;
                if (aPin !== bPin) return aPin - bPin;
                const aT = new Date((a.lastMessage as any)?.created_at || 0).getTime();
                const bT = new Date((b.lastMessage as any)?.created_at || 0).getTime();
                return bT - aT;
            })
            .map((e) => String(e.participant.id));
        setActiveConversation(normalizedParticipant);
        setSwipedConvId(null); // clear any accidental swipe reveal on any row
        swipeMovedRef.current = null; // clear any residual movement flag
        setShowMobileChat(true);
        // Instantly show cached messages (or last-known) so the user never sees a blank flash.
        // The loadMessages polling will silently replace them with fresh data within ~200 ms.
        const pid = conversationKey;
        const cached = sanitizeChatMessages(messagesCacheRef.current[pid]);
        const sanitizedConversation = sanitizeChatMessages(conversation);
        if (cached && cached.length > 0) {
            setMessages(cached);
        } else if (sanitizedConversation.length > 0) {
            setMessages(sanitizedConversation);
            messagesCacheRef.current[pid] = sanitizedConversation;
            const recentKey = getChatRecentKey(currentUser?.id, pid);
            if (recentKey) { try { window.localStorage.setItem(recentKey, JSON.stringify(sanitizedConversation)); } catch { } }
        } else {
            setMessages([]);
        }
        setParticipantPresence({
            status: participant?.status === "online" ? "online" : "offline",
            lastSeen: participant?.last_seen_at ? new Date(participant.last_seen_at).getTime() : null,
        });
        setCallMode(null);
        setShowNewChatPanel(false);
        setCallError(null);
        setPendingAttachments([]);
        setUploadError(null);
        setReplyTo(null);
        exitSelectMode();
        setParticipantTyping(false);
        clearEditable();
        resetVoiceRecording();
        if (isListening) stopSpeechToText();
        scrollMessagesToBottom("auto");
    };

    const openActiveConversationProfile = () => {
        if (!activeConversation?.id) return;
        router.push(getPublicProfileHref(activeConversation?.username, activeConversation.id));
    };

    const getCopyableMessageText = (message: any) => {
        if (!message) return "";
        if (message.type === "image") return message.image_url || "";
        if (message.type === "video") return message.image_url || "";
        if (message.type === "voice") return message.image_url || "Voice message";
        if (message.type === "sticker") return message.text || "";
        if (message.type === "voice_tts") return decodeTtsMessage(message.text || "").text;
        return stripColorTags(message.text || "");
    };

    const copyTextToClipboard = async (text: string) => {
        const value = String(text || "").trim();
        if (!value) return;
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(value);
            } else {
                const textarea = document.createElement("textarea");
                textarea.value = value;
                textarea.style.position = "fixed";
                textarea.style.opacity = "0";
                document.body.appendChild(textarea);
                textarea.focus();
                textarea.select();
                document.execCommand("copy");
                document.body.removeChild(textarea);
            }
            setCopiedMessageNotice("Copied");
            window.setTimeout(() => setCopiedMessageNotice(null), 1400);
        } catch {
            setCopiedMessageNotice("Copy failed");
            window.setTimeout(() => setCopiedMessageNotice(null), 1800);
        }
    };

    const copyMessageToClipboard = (message: any) => {
        void copyTextToClipboard(getCopyableMessageText(message));
    };

    const copySelectedMessagesToClipboard = () => {
        const selected = combinedMessages
            .filter((message: any) => selectedMessages.has(message.id))
            .map(getCopyableMessageText)
            .filter(Boolean);
        void copyTextToClipboard(selected.join("\n"));
    };

    const persistParticipant = (_participant: any) => { };

    const handleStartConversation = (user: any) => {
        if (!currentUser?.id || !user?.id) return;

        const participant = {
            id: user.id,
            name: getUserDisplayName(user),
            profile_picture: user.profile_picture || null,
            roleLabel: user.user_type === "seller" ? "Seller" : "Buyer",
            username: user.username || null,
        };

        delete messagesCacheRef.current[String(participant.id)];
        clearedConversationIds.current.add(String(participant.id));
        unhideLocalConversation(participant.id);
        chatService.unhideConversation(Number(participant.id)).catch(() => {});
        handleOpenConversation(participant, []);
        refreshConversations(String(participant.id), participant, false, true);
        setSearchQuery("");
        setSearchResults([]);
        setNewChatQuery("");
        setNewChatResults([]);
    };

    useEffect(() => {
        return () => {
            sttActiveRef.current = false;
            if (sttTimerRef.current) window.clearInterval(sttTimerRef.current);
            try { speechRecognitionRef.current?.stop?.(); } catch {}
            try { mediaRecorderRef.current?.stream?.getTracks?.().forEach((track) => track.stop()); } catch {}
            if (recordingTimerRef.current) {
                window.clearInterval(recordingTimerRef.current);
                recordingTimerRef.current = null;
            }
            if (ttsLongPressTimerRef.current) {
                window.clearTimeout(ttsLongPressTimerRef.current);
                ttsLongPressTimerRef.current = null;
            }
            if (micLongPressTimerRef.current) {
                window.clearTimeout(micLongPressTimerRef.current);
                micLongPressTimerRef.current = null;
            }
            if (callDurationTimerRef.current) {
                window.clearInterval(callDurationTimerRef.current);
                callDurationTimerRef.current = null;
            }
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
        setComposerMode("typed");
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

    const setEditableSpeechText = (value: string) => {
        const el = contentEditableRef.current;
        if (!el) return;
        el.textContent = value;
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        setMessageInput(getEditableContent());
        handleTypingInput();
    };

    // Whether the current device is likely mobile (iOS / Android) — affects STT strategy
    const isMobileBrowser = () => {
        if (typeof navigator === "undefined") return false;
        return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    };

    // Ref so onend handler can read the "user wants to keep listening" intent without stale closures
    const sttActiveRef = useRef(false);

    const startSpeechToTextInstance = () => {
        if (typeof window === "undefined") return;
        const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SR) return;

        const mobile = isMobileBrowser();
        const recognition = new SR();
        // Use the device/browser language so any language is transcribed in real-time
        recognition.lang = navigator.language || "en-US";
        // iOS Safari breaks with continuous=true; use single-shot + auto-restart on mobile
        recognition.continuous = !mobile;
        // Always show interim results for smooth real-time word appearance
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;

        speechBaseHtmlRef.current = contentEditableRef.current?.innerHTML || "";
        speechBaseTextRef.current = contentEditableRef.current?.textContent?.trim() || "";

        recognition.onstart = () => {
            setIsListening(true);
            speechBaseHtmlRef.current = contentEditableRef.current?.innerHTML || "";
            speechBaseTextRef.current = contentEditableRef.current?.textContent?.trim() || "";
            contentEditableRef.current?.focus();
        };
        recognition.onresult = (event: any) => {
            let finalText = "";
            let interim = "";
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const res = event.results[i];
                if (res.isFinal) finalText += res[0].transcript;
                else             interim   += res[0].transcript;
            }
            const base = speechBaseTextRef.current.trim();
            if (finalText) {
                const next = [base, finalText.trim()].filter(Boolean).join(" ");
                // Final: commit to base and fire typing indicator
                const el = contentEditableRef.current;
                if (el) {
                    el.textContent = next;
                    const range = document.createRange();
                    range.selectNodeContents(el);
                    range.collapse(false);
                    window.getSelection()?.removeAllRanges();
                    window.getSelection()?.addRange(range);
                }
                setMessageInput(next);
                handleTypingInput();
                speechBaseTextRef.current = next;
                speechBaseHtmlRef.current = contentEditableRef.current?.innerHTML || "";
            } else if (interim) {
                // Interim: update DOM directly without triggering typing indicator for every keystroke
                const el = contentEditableRef.current;
                if (el) {
                    el.textContent = [base, interim.trim()].filter(Boolean).join(" ");
                    const range = document.createRange();
                    range.selectNodeContents(el);
                    range.collapse(false);
                    window.getSelection()?.removeAllRanges();
                    window.getSelection()?.addRange(range);
                }
            }
        };
        recognition.onerror = (e: any) => {
            // "no-speech" and "audio-capture" are non-fatal on mobile — auto-restart below in onend
            const fatal = e?.error === "not-allowed" || e?.error === "permission-denied" || e?.error === "service-not-allowed";
            if (fatal) {
                sttActiveRef.current = false;
                setIsListening(false);
                speechRecognitionRef.current = null;
                setUploadError("Microphone access denied. Please allow mic permission.");
                setTimeout(() => setUploadError(null), 4000);
            }
            // non-fatal errors: let onend handle restart
        };
        recognition.onend = () => {
            speechRecognitionRef.current = null;
            if (sttActiveRef.current) {
                // Restart immediately: 50 ms on mobile (single-shot mode), 80 ms on desktop
                // This keeps the mic seamlessly open between utterances
                window.setTimeout(() => {
                    if (sttActiveRef.current) startSpeechToTextInstance();
                }, mobile ? 50 : 80);
            } else {
                setIsListening(false);
            }
        };

        speechRecognitionRef.current = recognition;
        try { recognition.start(); } catch { setIsListening(false); sttActiveRef.current = false; }
    };

    const startSpeechToText = async () => {
        if (typeof window === "undefined") return;
        const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SR) {
            setUploadError("Voice input is not supported in this browser. Please use Chrome or Safari.");
            setTimeout(() => setUploadError(null), 4000);
            return;
        }
        if (sttActiveRef.current && speechRecognitionRef.current) return;

        // Pre-request mic permission so the browser shows the allow dialog before we start recognition.
        // This prevents silent failures on Safari where recognition.start() silently dies if mic is denied.
        if (navigator.mediaDevices?.getUserMedia) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                // Immediately release — we only needed the permission grant
                stream.getTracks().forEach((t) => t.stop());
            } catch {
                setUploadError("Microphone access denied. Please allow mic permission in your browser settings.");
                setTimeout(() => setUploadError(null), 5000);
                return;
            }
        }

        // Reset and start the STT timer
        if (sttTimerRef.current) window.clearInterval(sttTimerRef.current);
        setRecordingSeconds(0);
        sttTimerRef.current = window.setInterval(() => {
            setRecordingSeconds((v) => v + 1);
        }, 1000);
        sttActiveRef.current = true;
        setIsListening(true);
        startSpeechToTextInstance();
    };

    const stopSpeechToText = (clearText = false) => {
        sttActiveRef.current = false;
        if (sttTimerRef.current) { window.clearInterval(sttTimerRef.current); sttTimerRef.current = null; }
        setRecordingSeconds(0);
        try { speechRecognitionRef.current?.stop?.(); } catch {}
        speechRecognitionRef.current = null;
        setIsListening(false);
        if (clearText) {
            clearEditable();
        } else {
            setMessageInput(getEditableContent());
        }
        setComposerMode("stt");
    };

    const resetVoiceRecording = () => {
        if (recordingTimerRef.current) {
            window.clearInterval(recordingTimerRef.current);
            recordingTimerRef.current = null;
        }
        try { mediaRecorderRef.current?.stream?.getTracks?.().forEach((track) => track.stop()); } catch {}
        mediaRecorderRef.current = null;
        recordingChunksRef.current = [];
        if (recordingUrl) URL.revokeObjectURL(recordingUrl);
        setRecordingUrl(null);
        setRecordingBlob(null);
        setRecordingSeconds(0);
        setRecordingState("idle");
    };

    const startVoiceRecording = async () => {
        if (recordingState !== "idle") return;
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
            setUploadError("Voice recording is not supported in this browser.");
            setTimeout(() => setUploadError(null), 3000);
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream);
            recordingChunksRef.current = [];

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) recordingChunksRef.current.push(event.data);
            };
            recorder.onstop = () => {
                const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType || "audio/webm" });
                const url = URL.createObjectURL(blob);
                setRecordingBlob(blob);
                setRecordingUrl(url);
                setRecordingState("ready");
                if (recordingTimerRef.current) {
                    window.clearInterval(recordingTimerRef.current);
                    recordingTimerRef.current = null;
                }
                stream.getTracks().forEach((track) => track.stop());
            };

            mediaRecorderRef.current = recorder;
            setRecordingSeconds(0);
            setRecordingState("recording");
            recorder.start();
            recordingTimerRef.current = window.setInterval(() => {
                setRecordingSeconds((prev) => {
                    const next = prev + 1;
                    if (next >= CHAT_VOICE_MAX_SECS) {
                        // Auto-stop at 2-minute limit silently
                        const rec = mediaRecorderRef.current;
                        if (rec && rec.state !== "inactive") rec.stop();
                        if (recordingTimerRef.current) {
                            window.clearInterval(recordingTimerRef.current);
                            recordingTimerRef.current = null;
                        }
                    }
                    return next;
                });
            }, 1000);
        } catch {
            setUploadError("Please allow microphone access to record voice.");
            setTimeout(() => setUploadError(null), 3000);
            resetVoiceRecording();
        }
    };

    const pauseOrResumeVoiceRecording = () => {
        const recorder = mediaRecorderRef.current;
        if (!recorder) return;

        if (recordingState === "recording" && recorder.state === "recording") {
            recorder.pause();
            if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
            recordingTimerRef.current = null;
            setRecordingState("paused");
            return;
        }

        if (recordingState === "paused" && recorder.state === "paused") {
            recorder.resume();
            recordingTimerRef.current = window.setInterval(() => {
                setRecordingSeconds((value) => value + 1);
            }, 1000);
            setRecordingState("recording");
        }
    };

    const finishVoiceRecording = () => {
        const recorder = mediaRecorderRef.current;
        if (!recorder || recorder.state === "inactive") return;
        recorder.stop();
    };

    const handleMicClick = () => {
        if (!ttsEnabled) {
            // Tick OFF → voice recording mode (sends audio message)
            if (recordingState === "idle") startVoiceRecording();
            return;
        }
        // Tick ON → speech-to-text live typing mode
        if (isListening) {
            stopSpeechToText();
        } else {
            startSpeechToText();
        }
    };

    const blobToDataUrl = (blob: Blob) =>
        new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ""));
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });

    const sendVoiceRecording = async () => {
        if (!recordingBlob || !activeConversation?.id || !currentUser?.id) return;

        setRecordingState("sending");
        const receiverId = Number(activeConversation.id);
        unhideLocalConversation(receiverId);
        const localUrl = recordingUrl || URL.createObjectURL(recordingBlob);
        const replyToId = replyTo?.id ?? null;

        setMessages((prev) => [
            ...prev,
            {
                id: Date.now() + Math.random(),
                type: "voice",
                sender_id: currentUser.id,
                sender_name: activeConversationDisplayName || currentUser.username || currentUser.full_name || "You",
                image_url: localUrl,
                file_name: `voice-${Date.now()}.webm`,
                reply_to_id: replyToId,
                status: "sending",
                created_at: new Date().toISOString(),
            },
        ]);
        setReplyTo(null);

        try {
            const audioDataUrl = await blobToDataUrl(recordingBlob);
            await chatService.sendMessage({
                receiverId,
                type: "voice",
                image_url: audioDataUrl,
                file_name: `voice-${Date.now()}.webm`,
                ...(scopedProductStatusId ? { productStatusId: scopedProductStatusId } : {}),
                ...(scopedTopupRequestId ? { topupRequestId: scopedTopupRequestId } : {}),
                ...(activeConversation?.assigned_admin_id ? { assignedAdminId: activeConversation.assigned_admin_id } : {}),
                ...(replyToId ? { reply_to_id: replyToId } : {}),
            });
            resetVoiceRecording();
            const fresh = await chatService.getMessages(receiverId, false, scopedProductStatusId, scopedTopupRequestId, activeConversation?.assigned_admin_id || null);
            setMessages((currentMessages) => {
                const serverMessages = Array.isArray(fresh) ? fresh : [];
                if (serverMessages.length === 0) return currentMessages;
                const serverIds = new Set(serverMessages.map((m: any) => String(m.id)));
                const pending = currentMessages.filter(
                    (m: any) => m.status === "sending" && !serverIds.has(String(m.id)) &&
                        String(m.sender_id) === String(currentUser.id) &&
                        Date.now() - new Date(m.created_at || 0).getTime() < 30000
                );
                return pending.length > 0
                    ? [...serverMessages, ...pending].sort((a: any, b: any) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime())
                    : serverMessages;
            });
            refreshConversations(String(receiverId));
        } catch (error) {
            console.error("Voice send failed:", error);
            setUploadError("Unable to send voice message.");
            setRecordingState("ready");
        }
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
            const token = getTabAuthValue("token") || "";
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
                sender_name: activeConversationDisplayName || currentUser.username || currentUser.full_name || "You",
                text: stickerUrl,
                status: "sending",
                created_at: new Date().toISOString(),
            },
        ]);

        try {
            await chatService.sendMessage({
                receiverId,
                type: "sticker",
                text: stickerUrl,
                ...(scopedProductStatusId ? { productStatusId: scopedProductStatusId } : {}),
                ...(scopedTopupRequestId ? { topupRequestId: scopedTopupRequestId } : {}),
                ...(activeConversation?.assigned_admin_id ? { assignedAdminId: activeConversation.assigned_admin_id } : {}),
            });
            const fresh = await chatService.getMessages(receiverId, false, scopedProductStatusId, scopedTopupRequestId, activeConversation?.assigned_admin_id || null);
            setMessages((currentMessages) => {
                const serverMessages = Array.isArray(fresh) ? fresh : [];
                if (serverMessages.length === 0) return currentMessages;
                const serverIds = new Set(serverMessages.map((m: any) => String(m.id)));
                const pending = currentMessages.filter(
                    (m: any) => m.status === "sending" && !serverIds.has(String(m.id)) &&
                        String(m.sender_id) === String(currentUser.id) &&
                        Date.now() - new Date(m.created_at || 0).getTime() < 30000
                );
                return pending.length > 0
                    ? [...serverMessages, ...pending].sort((a: any, b: any) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime())
                    : serverMessages;
            });
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

    const speakMessage = (id: number | string, raw: string, voiceGender: "male" | "female" = ttsVoiceGender) => {
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
        const voices = window.speechSynthesis.getVoices?.() || [];
        const preferredVoice = voices.find((voice) => {
            const name = `${voice.name} ${voice.voiceURI}`.toLowerCase();
            return voiceGender === "male"
                ? /male|david|mark|george|daniel|alex|fred|tom|aaron/.test(name)
                : /female|zira|samantha|victoria|susan|karen|moira|tessa|sara/.test(name);
        }) || voices.find((voice) => /en[-_]/i.test(voice.lang || ""));
        if (preferredVoice) utter.voice = preferredVoice;
        utter.pitch = voiceGender === "male" ? 0.85 : 1.12;
        utter.rate = 1;
        utter.onend = () => setSpeakingMessageId(null);
        utter.onerror = () => setSpeakingMessageId(null);
        setSpeakingMessageId(id);
        window.speechSynthesis.speak(utter);
    };

    const beginTtsLongPress = () => {
        if (!features.text_to_voice || !ttsEnabled) return;
        ttsLongPressFiredRef.current = false;
        if (ttsLongPressTimerRef.current) window.clearTimeout(ttsLongPressTimerRef.current);
        ttsLongPressTimerRef.current = window.setTimeout(() => {
            ttsLongPressFiredRef.current = true;
            setTtsSettingsOpen(true);
        }, 550);
    };

    const endTtsLongPress = () => {
        if (ttsLongPressTimerRef.current) {
            window.clearTimeout(ttsLongPressTimerRef.current);
            ttsLongPressTimerRef.current = null;
        }
    };

    const toggleTtsEnabled = () => {
        if (ttsLongPressFiredRef.current) {
            ttsLongPressFiredRef.current = false;
            return;
        }
        if (ttsEnabled) {
            // Turning tick OFF: stop STT if running, disable
            if (isListening) stopSpeechToText();
            setTtsEnabled(false);
        } else {
            setTtsEnabled(true);
        }
    };

    const handleSendMessage = async () => {
        const rawTrimmed = getEditableContent().trim();
        const trimmed = activeTypingColor && rawTrimmed && !rawTrimmed.includes("[c=")
            ? `[c=${activeTypingColor}]${rawTrimmed}[/c]`
            : rawTrimmed;
        if ((!trimmed && pendingAttachments.length === 0) || !currentUser?.id || !activeConversation?.id) return;

        const nextMessages = [...messages];
        const receiverId = Number(activeConversation.id);
        const activeConversationKey = getChatConversationKey(activeConversation) || String(receiverId);
        // Send as TTS voice message when tick is ON and:
        //  - still actively listening (send mid-STT), OR
        //  - sttSendAsTtsRef was set (send button clicked while listening, stopped just before), OR
        //  - typed manually with tick on (composerMode !== "stt")
        const wasSttSend = sttSendAsTtsRef.current;
        sttSendAsTtsRef.current = false;
        const sendAsTts = !!(features.text_to_voice && ttsEnabled && trimmed && (isListening || wasSttSend || composerMode !== "stt"));
        const replyToId = replyTo?.id ?? null;

        const hasMediaAttachments = pendingAttachments.length > 0;
        const mediaCaption = hasMediaAttachments ? trimmed : "";
        const textClientMessageId = trimmed && !hasMediaAttachments ? generateClientMessageId() : null;
        const mediaClientMessageIds = pendingAttachments.map(() => generateClientMessageId());
        const optimisticMediaIds = pendingAttachments.map(() => Date.now() + Math.random());
        const activeProductStatusId = scopedProductStatusId || activeConversation?.product_status_id || null;
        const activeTopupRequestId = scopedTopupRequestId || activeConversation?.topup_request_id || null;

        if (trimmed && !hasMediaAttachments) {
            nextMessages.push({
                id: Date.now(),
                client_message_id: textClientMessageId,
                type: sendAsTts ? "voice_tts" : "text",
                sender_id: currentUser.id,
                sender_name: activeConversationDisplayName || currentUser.username || currentUser.full_name || "You",
                text: sendAsTts ? encodeTtsMessage(trimmed, ttsVoiceGender) : trimmed,
                reply_to_id: replyToId,
                status: "sending",
                created_at: new Date().toISOString(),
            });
        }

        for (const [index, attachment] of pendingAttachments.entries()) {
            nextMessages.push({
                id: optimisticMediaIds[index],
                client_message_id: mediaClientMessageIds[index],
                type: attachment.media_type === "video" ? "video" : "image",
                sender_id: currentUser.id,
                sender_name: activeConversationDisplayName || currentUser.username || currentUser.full_name || "You",
                text: index === 0 ? mediaCaption : "",
                image_url: attachment.image_url,
                file_name: attachment.file_name,
                reply_to_id: index === 0 ? replyToId : null,
                status: "sending",
                media_upload_progress: 0,
                created_at: new Date().toISOString(),
            });
        }

        clearEditable();
        setPendingAttachments([]);
        setReplyTo(null);
        setMessages(nextMessages);
        messagesCacheRef.current[activeConversationKey] = nextMessages;
        const optimisticLastMessage = nextMessages[nextMessages.length - 1];
        if (optimisticLastMessage) {
            setConversationList((prev) => {
                const participant = activeConversation;
                const existing = prev.find((entry) => (getChatConversationKey(entry.participant) || String(entry.participant.id)) === activeConversationKey);
                const rest = prev.filter((entry) => (getChatConversationKey(entry.participant) || String(entry.participant.id)) !== activeConversationKey);
                const next = [
                    {
                        ...(existing || {}),
                        participant: existing?.participant || participant,
                        unread_count: Number(existing?.unread_count || 0),
                        lastMessage: optimisticLastMessage,
                        conversation: [],
                    },
                    ...rest,
                ];
                persistConversationListSnapshot(next);
                return next;
            });
        }

        try {
            if (trimmed && !hasMediaAttachments) {
                const payload: ChatSendPayload = {
                    receiverId,
                    type: sendAsTts ? "voice_tts" : "text",
                    text: sendAsTts ? encodeTtsMessage(trimmed, ttsVoiceGender) : trimmed,
                    ...(activeProductStatusId ? { productStatusId: activeProductStatusId } : {}),
                    ...(activeTopupRequestId ? { topupRequestId: activeTopupRequestId } : {}),
                    ...(activeConversation?.assigned_admin_id ? { assignedAdminId: activeConversation.assigned_admin_id } : {}),
                    ...(textClientMessageId ? { client_message_id: textClientMessageId } : {}),
                    ...(replyToId ? { reply_to_id: replyToId } : {}),
                };
                const savedMessage = chatSocketRef.current?.connected
                    ? await sendRealtimeMessage(payload)
                    : await chatService.sendMessage(payload);
                mergeIncomingMessage(savedMessage);
            }

            if (pendingAttachments.length > 0) {
                const updateOptimisticMediaProgress = (progress: number) => {
                    setMessages((prev) => prev.map((message: any) =>
                        optimisticMediaIds.includes(message.id)
                            ? { ...message, media_upload_progress: progress }
                            : message
                    ));
                };
                setMediaUploadProgress(0);
                updateOptimisticMediaProgress(0);
                // Simulated progress — ramps to 90% while sending, jumps to 100% when done
                const progInterval = window.setInterval(() => {
                    setMediaUploadProgress((prev) => {
                        const next = prev !== null && prev < 90 ? prev + 6 : prev;
                        if (typeof next === "number") updateOptimisticMediaProgress(next);
                        return next;
                    });
                }, 220);
                try {
                    for (const [index, attachment] of pendingAttachments.entries()) {
                        const payload: ChatSendPayload = {
                            receiverId,
                            type: attachment.media_type === "video" ? "video" : "image",
                            ...(index === 0 && mediaCaption ? { text: mediaCaption } : {}),
                            image_url: attachment.image_url,
                            file_name: attachment.file_name,
                            ...(activeProductStatusId ? { productStatusId: activeProductStatusId } : {}),
                            ...(activeTopupRequestId ? { topupRequestId: activeTopupRequestId } : {}),
                            ...(activeConversation?.assigned_admin_id ? { assignedAdminId: activeConversation.assigned_admin_id } : {}),
                            client_message_id: mediaClientMessageIds[index],
                            ...(index === 0 && replyToId ? { reply_to_id: replyToId } : {}),
                        };
                        const savedMessage = chatSocketRef.current?.connected
                            ? await sendRealtimeMessage(payload)
                            : await chatService.sendMessage(payload);
                        mergeIncomingMessage(savedMessage);
                    }
                } finally {
                    window.clearInterval(progInterval);
                    setMediaUploadProgress(100);
                    updateOptimisticMediaProgress(100);
                    await new Promise((resolve) => window.setTimeout(resolve, 450));
                    window.setTimeout(() => setMediaUploadProgress(null), 500);
                }
            }

            await refreshConversations(String(receiverId));
        } catch (sendError) {
            console.error("Error sending message:", sendError);
            const message = sendError instanceof Error ? sendError.message : "Unable to send message right now.";
            if (/daily media limit|10 images|24 hours/i.test(message)) {
                setMediaLimitPopup(true);
            } else {
                setUploadError(message);
            }
            if (optimisticMediaIds.length > 0) {
                setMessages((prev) => {
                    const next = prev.map((item: any) =>
                        optimisticMediaIds.includes(item.id)
                            ? { ...item, status: "failed", upload_error: message, media_upload_progress: null }
                            : item
                    );
                    messagesCacheRef.current[activeConversationKey] = next;
                    return next;
                });
            }
        }
    };

    const retryFailedMediaMessage = async (message: any) => {
        if (!currentUser?.id || !activeConversation?.id || !message?.image_url) return;
        const receiverId = Number(activeConversation.id);
        const activeConversationKey = getChatConversationKey(activeConversation) || String(receiverId);
        const messageId = message.id;
        const setRetryProgress = (progress: number) => {
            setMessages((prev) => prev.map((item: any) =>
                String(item.id) === String(messageId)
                    ? { ...item, status: "sending", upload_error: null, media_upload_progress: progress }
                    : item
            ));
        };

        setRetryProgress(0);
        const progInterval = window.setInterval(() => {
            setMessages((prev) => prev.map((item: any) => {
                if (String(item.id) !== String(messageId)) return item;
                const current = typeof item.media_upload_progress === "number" ? item.media_upload_progress : 0;
                return { ...item, media_upload_progress: Math.min(90, current + 6) };
            }));
        }, 220);

        try {
            const activeProductStatusId = scopedProductStatusId || activeConversation?.product_status_id || null;
            const activeTopupRequestId = scopedTopupRequestId || activeConversation?.topup_request_id || null;
            await chatService.sendMessage({
                receiverId,
                type: message.type === "video" ? "video" : "image",
                ...(message.text ? { text: message.text } : {}),
                image_url: message.image_url,
                file_name: message.file_name,
                ...(activeProductStatusId ? { productStatusId: activeProductStatusId } : {}),
                ...(activeTopupRequestId ? { topupRequestId: activeTopupRequestId } : {}),
                ...(activeConversation?.assigned_admin_id ? { assignedAdminId: activeConversation.assigned_admin_id } : {}),
                ...(message.reply_to_id ? { reply_to_id: message.reply_to_id } : {}),
            });
            window.clearInterval(progInterval);
            setRetryProgress(100);
            await new Promise((resolve) => window.setTimeout(resolve, 450));
            const freshMessages = await chatService.getMessages(receiverId, false, activeProductStatusId, activeTopupRequestId, activeConversation?.assigned_admin_id || null);
            setMessages((currentMessages) => {
                const serverMessages = Array.isArray(freshMessages) ? freshMessages : [];
                if (serverMessages.length === 0) return currentMessages;
                const serverIds = new Set(serverMessages.map((m: any) => String(m.id)));
                const pending = currentMessages.filter(
                    (m: any) => (m.status === "sending" || m.media_upload_progress != null) &&
                        !serverIds.has(String(m.id)) &&
                        String(m.sender_id) === String(currentUser?.id) &&
                        Date.now() - new Date(m.created_at || 0).getTime() < 30000
                );
                const next = pending.length > 0
                    ? [...serverMessages, ...pending].sort((a: any, b: any) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime())
                    : serverMessages;
                messagesCacheRef.current[activeConversationKey] = next;
                return next;
            });
            refreshConversations(String(receiverId));
        } catch (retryError) {
            window.clearInterval(progInterval);
            const retryMessage = retryError instanceof Error ? retryError.message : "Upload failed. Try again.";
            setMessages((prev) => prev.map((item: any) =>
                String(item.id) === String(messageId)
                    ? { ...item, status: "failed", upload_error: retryMessage, media_upload_progress: null }
                    : item
            ));
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
        if ((getChatConversationKey(activeConversation) || String(activeConversation?.id || "")) === String(participantId)) {
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
                    if (String(signal.sender_id) === String(currentUser?.id)) continue;
                    if (signal.signal_type === "answer" && signal.payload) {
                        const desc = new RTCSessionDescription(toRtcSessionDescription(signal.payload));
                        if (!callPeerRef.current.currentRemoteDescription) {
                            await callPeerRef.current.setRemoteDescription(desc);
                            await flushPendingRemoteIceCandidates();
                        }
                    }
                    if (signal.signal_type === "ice-candidate" && signal.payload?.candidate) {
                        await addRemoteIceCandidate(signal.payload.candidate);
                    }
                }
            })
            .catch(() => { });
    };

    const pollCallStatus = (callId: number) => {
        chatService.getCall(callId)
            .then(async (call: any) => {
                if (!call) return;
                setActiveCall((prev: any) => ({ ...(prev || {}), ...(call || {}) }));

                if (["missed", "rejected", "completed"].includes(call.call_status)) {
                    const participantId =
                        String(call.caller_id) === String(currentUser?.id)
                            ? Number(call.receiver_id)
                            : Number(call.caller_id);
                    if (participantId) appendCallRecordToLocalChat(participantId, call);
                    await cleanupCall();
                    callTypeRef.current = null;
                    setCallPhase("idle");
                    setCallMode(null);
                    setActiveCall(null);
                    setIncomingCall(null);
                    setIsMuted(false);
                    setIsCameraOff(false);
                    setIsSpeakerOn(false);
                    stopCallDurationTimer();
                }
            })
            .catch(() => { });
    };

    const startPollingForCall = (callId: number) => {
        if (callPollIntervalRef.current) {
            window.clearInterval(callPollIntervalRef.current);
            callPollIntervalRef.current = null;
        }
        pollSignals(callId);
        pollCallStatus(callId);
        callPollIntervalRef.current = window.setInterval(() => {
            pollSignals(callId);
            pollCallStatus(callId);
        }, 400);
    };

    useEffect(() => {
        if (!activeCall || !callRemoteStreamRef.current) return;
        attachRemoteCallStream(callRemoteStreamRef.current);
    }, [activeCall, attachRemoteCallStream, remoteMediaVersion]);

    const availableQualities: ("240p" | "360p")[] = (() => {
        if (!canUseVideoCall) return [];
        const q = String(features.video_call_quality || "");
        const out: ("240p" | "360p")[] = [];
        if (q.includes("240p")) out.push("240p");
        if (q.includes("360p")) out.push("360p");
        return out.length ? out : ["240p"];
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
        if (mode === "video" && !canUseVideoCall) {
            setCallError("Video calls are not enabled on your current plan. Please upgrade.");
            return;
        }

        try {
            setCallMode(mode);
            callTypeRef.current = mode;
            setCallPhase("connecting");
            await cleanupCall(false);

            const localStream = await navigator.mediaDevices.getUserMedia({
                audio: getCallAudioConstraints(),
                video: mode === "video" ? videoConstraints(videoQuality) : false,
            });
            localStream.getAudioTracks().forEach((track) => {
                track.enabled = true;
            });
            callLocalStreamRef.current = localStream;
            if (localVideoRef.current) localVideoRef.current.srcObject = localStream;

            // Create peer connection and buffer ICE candidates until we have a call id.
            const pendingCandidates: any[] = [];
            const receiverId = Number(activeConversation.id);
            let callId: number | null = null;

            const pc = new RTCPeerConnection(getRtcConfiguration());

            pc.ontrack = (event) => {
                const stream = event.streams?.[0] || callRemoteStreamRef.current || new MediaStream();
                if (!event.streams?.[0] && event.track && !stream.getTracks().some((track) => track.id === event.track.id)) {
                    stream.addTrack(event.track);
                }
                if (event.track.kind === "audio") event.track.enabled = true;
                attachRemoteCallStream(stream);
                setRemoteMediaVersion((current) => current + 1);
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
                const state = pc.connectionState;
                if (state === "connected") {
                    setCallPhase("active");
                    callStartTimeRef.current = Date.now();
                    startCallDurationTimer();
                } else if (state === "disconnected" || state === "failed" || state === "closed") {
                    hangUpCall();
                }
            };
            pc.oniceconnectionstatechange = () => {
                const iceState = pc.iceConnectionState;
                if (iceState === "disconnected" || iceState === "failed" || iceState === "closed") {
                    hangUpCall();
                }
            };

            callPeerRef.current = pc;
            localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            const encryptedOffer = { ...offer, encryption: getCallEncryptionMetadata() };

            // Start call (stores offer in DB) and then flush buffered candidates.
            const started = await chatService.startCall(receiverId, mode, encryptedOffer);
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

        const callId = Number(incomingCall.id);
        const callType = incomingCall.call_type === "video" ? "video" : "voice";
        callTypeRef.current = callType;

        try {
            stopRingtone();
            setCallPhase("connecting");
            await cleanupCall(false);

            const localStream = await navigator.mediaDevices.getUserMedia({
                audio: getCallAudioConstraints(),
                video: callType === "video" ? videoConstraints(videoQuality) : false,
            });
            localStream.getAudioTracks().forEach((track) => { track.enabled = true; });
            callLocalStreamRef.current = localStream;
            if (localVideoRef.current) localVideoRef.current.srcObject = localStream;

            const pc = createPeerConnection(callId, Number(incomingCall.caller_id));
            localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
            await pc.setRemoteDescription(new RTCSessionDescription(toRtcSessionDescription(incomingCall.offer)));
            await flushPendingRemoteIceCandidates();

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            const encryptedAnswer = { ...answer, encryption: incomingCall.offer?.encryption || getCallEncryptionMetadata() };

            const accepted = await chatService.acceptCall(callId, encryptedAnswer);
            setActiveCall(accepted ?? { id: callId, call_type: callType });
            setIncomingCall(null);
            // Move to active immediately — onconnectionstatechange is unreliable on some networks
            setCallPhase("active");
            callStartTimeRef.current = Date.now();
            startCallDurationTimer();

            startPollingForCall(callId);
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
            stopCallDurationTimer();
        } catch (err: any) {
            setCallError(err?.message || "Failed to reject call.");
        }
    };

    const hangingUpRef = useRef(false);
    const hangUpCall = async () => {
        if (hangingUpRef.current) return;
        hangingUpRef.current = true;
        setCallError(null);
        if (!activeCall?.id) {
            await cleanupCall();
            callTypeRef.current = null;
            setCallPhase("idle");
            setCallMode(null);
            setActiveCall(null);
            setIsSpeakerOn(false);
            hangingUpRef.current = false;
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
        callTypeRef.current = null;
        setCallMode(null);
        setCallPhase("idle");
        setActiveCall(null);
        setIsMuted(false);
        setIsCameraOff(false);
        setIsSpeakerOn(false);
        stopCallDurationTimer();
        hangingUpRef.current = false;
    };

    const handleStartCall = (mode: "voice" | "video") => {
        if (!currentUser?.id || !activeConversation?.id) return;
        if (mode === "video" && !canUseVideoCall) {
            setCallError("Video calls are not enabled on your current plan. Please upgrade.");
            return;
        }
        startOutgoingCall(mode);
    };

    const readFileAsDataUrl = (file: File) =>
        new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ""));
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });

    const blobToCompressedDataUrl = (blob: Blob) =>
        new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ""));
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });

    const dataUrlByteSize = (dataUrl: string) => {
        const base64 = dataUrl.split(",")[1] || "";
        return Math.ceil((base64.length * 3) / 4);
    };

    const loadImageElement = (src: string) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
            const image = new window.Image();
            image.onload = () => resolve(image);
            image.onerror = reject;
            image.src = src;
        });

    const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
        new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Compression failed")), type, quality);
        });

    const compressImageForChat = async (file: File) => {
        const originalUrl = URL.createObjectURL(file);
        try {
            const image = await loadImageElement(originalUrl);
            let maxSide = Math.min(1600, Math.max(image.width, image.height));
            const outputType = file.type === "image/png" ? "image/jpeg" : (file.type || "image/jpeg");

            for (const quality of [0.82, 0.72, 0.62, 0.52, 0.44]) {
                const ratio = maxSide / Math.max(image.width, image.height);
                const canvas = document.createElement("canvas");
                canvas.width = Math.max(1, Math.round(image.width * ratio));
                canvas.height = Math.max(1, Math.round(image.height * ratio));
                const ctx = canvas.getContext("2d");
                if (!ctx) throw new Error("Image compression is not supported.");
                ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
                const blob = await canvasToBlob(canvas, outputType, quality);
                if (blob.size <= CHAT_MEDIA_MAX_BYTES || quality === 0.44) {
                    const dataUrl = await blobToCompressedDataUrl(blob);
                    if (dataUrlByteSize(dataUrl) <= CHAT_MEDIA_MAX_BYTES) {
                        return {
                            image_url: dataUrl,
                            file_name: file.name.replace(/\.[^.]+$/, ".jpg"),
                            media_type: "image" as const,
                        };
                    }
                }
                maxSide = Math.max(720, Math.floor(maxSide * 0.78));
            }
            throw new Error("This image could not be compressed for chat.");
        } finally {
            URL.revokeObjectURL(originalUrl);
        }
    };

    const getVideoDurationSec = (file: File): Promise<number> =>
        new Promise((resolve) => {
            const vid = document.createElement("video");
            vid.preload = "metadata";
            const url = URL.createObjectURL(file);
            vid.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(vid.duration); };
            vid.onerror = () => { URL.revokeObjectURL(url); resolve(0); };
            vid.src = url;
        });

    // Crops a video file to a selected time range using canvas + MediaRecorder.
    // Returns the original file unchanged if cropping is not needed or not supported.
    const cropVideoToRange = (file: File, startSec: number, endSec: number, onProgress?: (p: number) => void): Promise<File> =>
        new Promise((resolve) => {
            const safeStart = Math.max(0, startSec || 0);
            const safeEnd = Math.max(safeStart + 1, endSec || safeStart + CHAT_VIDEO_MAX_DURATION_SECS);
            const selectedDuration = Math.max(1, safeEnd - safeStart);
            const video = document.createElement("video");
            const src = URL.createObjectURL(file);
            video.src = src;
            video.muted = true;
            video.playsInline = true;
            video.preload = "auto";

            const cleanup = () => { try { URL.revokeObjectURL(src); } catch { } };

            video.oncanplaythrough = () => {
                const canvas = document.createElement("canvas");
                canvas.width = Math.min(video.videoWidth || 640, 1280);
                canvas.height = Math.min(video.videoHeight || 480, 720);
                const ctx = canvas.getContext("2d");
                if (!ctx) { cleanup(); resolve(file); return; }

                const mimeType = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((t) => {
                    try { return MediaRecorder.isTypeSupported(t); } catch { return false; }
                }) || "video/webm";

                let stream: MediaStream;
                try { stream = (canvas as any).captureStream(30); } catch { cleanup(); resolve(file); return; }

                const chunks: Blob[] = [];
                let recorder: MediaRecorder;
                try { recorder = new MediaRecorder(stream, { mimeType }); } catch { cleanup(); resolve(file); return; }

                recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
                recorder.onstop = () => {
                    cleanup();
                    const blob = new Blob(chunks, { type: mimeType });
                    const ext = mimeType.includes("webm") ? ".webm" : ".mp4";
                    resolve(new File([blob], file.name.replace(/\.[^.]+$/, ext), { type: mimeType }));
                };

                let rafId = 0;
                const draw = () => {
                    if (video.paused || video.ended || video.currentTime >= safeEnd) {
                        cancelAnimationFrame(rafId);
                        if (recorder.state === "recording") recorder.stop();
                        video.pause();
                        return;
                    }
                    onProgress?.(Math.min(97, Math.round(((video.currentTime - safeStart) / selectedDuration) * 100)));
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    rafId = requestAnimationFrame(draw);
                };

                recorder.start(250);
                video.currentTime = safeStart;
                video.play().then(() => {
                    rafId = requestAnimationFrame(draw);
                    window.setTimeout(() => {
                        cancelAnimationFrame(rafId);
                        if (recorder.state === "recording") recorder.stop();
                        video.pause();
                    }, (selectedDuration + 1) * 1000);
                }).catch(() => { cleanup(); resolve(file); });
            };
            video.onerror = () => { cleanup(); resolve(file); };
        });

    const isMobileVideoViewport = () => typeof window !== "undefined"
        && (window.matchMedia?.("(max-width: 767px)")?.matches || (window.visualViewport?.width || window.innerWidth) < 768);

    const requestMobileVideoCutChoice = (file: File, duration: number | null): Promise<{ action: "cut"; startSec: number; endSec: number } | { action: "cancel" }> => {
        if (!isMobileVideoViewport()) {
            return Promise.resolve({ action: "cut", startSec: 0, endSec: CHAT_VIDEO_MAX_DURATION_SECS });
        }

        return new Promise((resolve) => {
            const previewUrl = URL.createObjectURL(file);
            const initialDuration = duration && duration > 0 ? duration : null;
            const initialEnd = Math.min(CHAT_VIDEO_MAX_DURATION_SECS, initialDuration || CHAT_VIDEO_MAX_DURATION_SECS);
            setTrimPreviewPlaying(false);
            setMediaUploadProgress(null);
            videoCutPromptResolverRef.current = resolve;
            setVideoCutPrompt({
                fileName: file.name,
                previewUrl,
                duration: initialDuration,
                startSec: 0,
                endSec: initialEnd,
            });
        });
    };

    const resolveVideoCutPrompt = (choice: { action: "cut"; startSec: number; endSec: number } | { action: "cancel" }) => {
        const resolver = videoCutPromptResolverRef.current;
        const previewUrl = videoCutPrompt?.previewUrl;
        videoCutPromptResolverRef.current = null;
        try { videoTrimPreviewRef.current?.pause(); } catch { }
        setTrimPreviewPlaying(false);
        setVideoCutPrompt(null);
        if (previewUrl) {
            window.setTimeout(() => {
                try { URL.revokeObjectURL(previewUrl); } catch { }
            }, 300);
        }
        resolver?.(choice);
    };

    const updateVideoTrimFromPointer = (
        event: React.PointerEvent<HTMLDivElement>,
        handle: "start" | "end",
    ) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const duration = videoCutPrompt?.duration || CHAT_VIDEO_MAX_DURATION_SECS;
        const rawSec = ((event.clientX - rect.left) / Math.max(1, rect.width)) * duration;
        setVideoCutPrompt((prev) => {
            if (!prev) return prev;
            if (handle === "start") {
                const startSec = Math.max(0, Math.min(rawSec, prev.endSec - 1));
                const endSec = Math.min(duration, Math.max(prev.endSec, startSec + 1));
                if (videoTrimPreviewRef.current) videoTrimPreviewRef.current.currentTime = startSec;
                return { ...prev, startSec, endSec };
            }
            const maxEnd = Math.min(duration, prev.startSec + CHAT_VIDEO_MAX_DURATION_SECS);
            const endSec = Math.max(prev.startSec + 1, Math.min(rawSec, maxEnd));
            if (videoTrimPreviewRef.current) videoTrimPreviewRef.current.currentTime = Math.max(prev.startSec, endSec - 0.2);
            return { ...prev, endSec };
        });
    };

    const toggleTrimPreviewPlayback = () => {
        const video = videoTrimPreviewRef.current;
        if (!videoCutPrompt || !video) return;
        if (trimPreviewPlaying) {
            video.pause();
            setTrimPreviewPlaying(false);
            return;
        }
        video.currentTime = videoCutPrompt.startSec;
        video.play().then(() => setTrimPreviewPlaying(true)).catch(() => setTrimPreviewPlaying(false));
    };

    const prepareVideoForChat = async (
        file: File,
        onProgress?: (p: number) => void,
    ): Promise<{ image_url: string; file_name: string; media_type: "video" } | null> => {
        let sourceFile = file;
        if (isMobileVideoViewport()) {
            const duration = await getVideoDurationSec(file);
            if (duration > CHAT_VIDEO_MAX_DURATION_SECS) {
                const choice = await requestMobileVideoCutChoice(file, duration);
                if (choice.action !== "cut") return null;
                onProgress?.(0);
                sourceFile = await cropVideoToRange(file, choice.startSec, choice.endSec, onProgress);
                onProgress?.(98);
                if (sourceFile.size > CHAT_VIDEO_MAX_BYTES) return null;
            }
        } else {
            const duration = await getVideoDurationSec(file);
            if (duration <= 0) return null;

            if (duration > CHAT_VIDEO_MAX_DURATION_SECS) {
                onProgress?.(0);
                sourceFile = await cropVideoToRange(file, 0, CHAT_VIDEO_MAX_DURATION_SECS, onProgress);
                onProgress?.(98);
                if (sourceFile.size > CHAT_VIDEO_MAX_BYTES) return null;
            }
        }

        if (sourceFile.size > CHAT_VIDEO_MAX_BYTES) return null;

        onProgress?.(99);
        const dataUrl = await readFileAsDataUrl(sourceFile);
        onProgress?.(100);
        return {
            image_url: dataUrl,
            file_name: sourceFile.name,
            media_type: "video" as const,
        };
    };

    const handleSelectImages = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        event.target.value = "";
        if (!activeConversation?.id || !currentUser?.id || !files.length) return;
        setUploadError(null);
        setIsUploadingAttachments(true);
        const nextAttachments = [...pendingAttachments];

        try {
            for (const file of files) {
                if (nextAttachments.length >= CHAT_DAILY_MEDIA_LIMIT) {
                    setMediaLimitPopup(true);
                    break;
                }
                if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) continue;
                try {
                    setMediaUploadProgress(0);
                    const prepared = file.type.startsWith("video/")
                        ? await prepareVideoForChat(file, (p) => setMediaUploadProgress(p))
                        : await compressImageForChat(file);
                    setMediaUploadProgress(100);
                    if (prepared) {
                        nextAttachments.push({ id: Date.now() + Math.random(), ...prepared });
                    }
                } catch {
                    // silently skip files that cannot be prepared
                } finally {
                    setMediaUploadProgress(null);
                }
            }
        } finally {
            setIsUploadingAttachments(false);
            setMediaUploadProgress(null);
        }
        setPendingAttachments(nextAttachments);
    };

    const handleDeleteMessages = async (messageIds: Array<number | string>, forEveryone = false) => {
        if (!messageIds.length) return;
        const idSet = new Set(messageIds.map(String));
        const nextMessages = messages.map((message: any) =>
            idSet.has(String(message.id))
                ? forEveryone
                    ? { ...message, deleted_for_everyone: true, deleted_for: ["everyone"] }
                    : {
                        ...message,
                        deleted_for: [...new Set([...(message.deleted_for || []), String(currentUser?.id)])],
                    }
                : message
        );
        persistMessages(nextMessages);
        setPendingDeleteMessageIds([]);
        setDeleteForEveryoneFlag(false);
        exitSelectMode();

        try {
            await chatService.deleteMessages(messageIds, forEveryone ? "everyone" : "me");
            if (activeConversation?.id) {
                const activeId = String(activeConversation.id);
                const activeProductStatusId = scopedProductStatusId || activeConversation.product_status_id || null;
                const activeTopupRequestId = scopedTopupRequestId || activeConversation.topup_request_id || null;
                const fresh = await chatService.getMessages(
                    Number(activeConversation.id),
                    false,
                    activeProductStatusId,
                    activeTopupRequestId,
                    activeConversation.assigned_admin_id || null,
                );
                const freshMessages = Array.isArray(fresh) ? fresh : [];
                persistMessages(freshMessages);
                if (freshMessages.length === 0) {
                    delete messagesCacheRef.current[activeId];
                    setConversationList((prev) => prev.filter((entry) => String(entry.participant.id) !== activeId));
                    if (currentUser?.id) {
                        const recentKey = getChatRecentKey(currentUser.id, activeId);
                        if (recentKey) { try { localStorage.removeItem(recentKey); } catch { } }
                    }
                } else {
                    refreshConversations(activeId, activeConversation, false);
                }
            }
        } catch (error) {
            console.error("Delete failed:", error);
            setUploadError("Unable to delete selected message.");
            if (activeConversation?.id) {
                const activeProductStatusId = scopedProductStatusId || activeConversation.product_status_id || null;
                const activeTopupRequestId = scopedTopupRequestId || activeConversation.topup_request_id || null;
                const fresh = await chatService.getMessages(
                    Number(activeConversation.id),
                    false,
                    activeProductStatusId,
                    activeTopupRequestId,
                    activeConversation.assigned_admin_id || null,
                );
                persistMessages(Array.isArray(fresh) ? fresh : []);
            }
        }
    };

    const doForwardMessage = async (targetParticipantId: number) => {
        if (!forwardMessage || !currentUser?.id) return;
        setForwardMessage(null);
        try {
            await chatService.forwardMessage({
                receiverId: targetParticipantId,
                type: forwardMessage.type === "image" ? "image" : forwardMessage.type === "video" ? "video" : forwardMessage.type === "sticker" ? "sticker" : forwardMessage.type === "voice_tts" ? "voice_tts" : "text",
                text: forwardMessage.text,
                image_url: forwardMessage.image_url,
                file_name: forwardMessage.file_name,
            });
        } catch (err) {
            console.error("Forward failed:", err);
        }
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
        // Track last seen incoming call id so we only ring once per new call
        let lastSeenCallId: string | null = null;

        const pollIncoming = async () => {
            try {
                const calls = await chatService.getIncomingCalls();
                if (!mounted) return;
                const latest = Array.isArray(calls) ? calls[0] : null;
                const latestId = latest?.id ? String(latest.id) : null;

                // Read current phase without triggering re-render — use functional setCallPhase
                setCallPhase((current) => {
                    // If already in a call (connecting / active / ended / outgoing) never show incoming again
                    if (current !== "idle" && current !== "incoming") return current;

                    if (latestId) {
                        // New call arrived
                        if (latestId !== lastSeenCallId) {
                            lastSeenCallId = latestId;
                            setIncomingCall(latest);
                            // Ring only when transitioning from idle
                            if (current === "idle") startRingtone();
                        }
                        return "incoming";
                    } else {
                        // No pending call — clear if we were showing incoming
                        if (current === "incoming") {
                            setIncomingCall(null);
                            return "idle";
                        }
                    }
                    return current;
                });
            } catch { }
        };

        pollIncoming();
        const interval = window.setInterval(pollIncoming, 700);
        return () => {
            mounted = false;
            window.clearInterval(interval);
        };
    }, [currentUser?.id]); // no incomingCall?.id dep — state updates handled via functional setter above

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
        <>
        <div className="-mx-3 sm:-mx-4 md:-mx-8 -my-5 sm:-my-6 h-[calc(100dvh-9rem)] md:h-[calc(100dvh-7rem)] overflow-hidden">
            <div className="grid h-full overflow-hidden md:grid-cols-[300px_1fr]">
                <aside className={`border-r border-white/10 bg-[#171615] flex-col min-h-0 ${showMobileChat ? "hidden" : "flex"} md:flex`}>
                    <div className="px-4 py-4 border-b border-white/10 bg-[#1d1c1b]/95">
                        {/* Current user row */}
                        {currentUser && (
                            <div className="flex items-center gap-2.5 mb-3">
                                <div className="relative w-9 h-9 rounded-full overflow-hidden bg-white/5 border border-white/10 shrink-0">
                                    <Image
                                        src={getProfileImageSrc(currentUser.profile_picture, getUserDisplayName(currentUser, "You"))}
                                        alt={getUserDisplayName(currentUser, "You")}
                                        fill
                                        className="object-cover"
                                        onError={handleChatAvatarError}
                                    />
                                    {currentUser.id && (
                                        <span className="absolute -bottom-0.5 -right-0.5 bg-[#171615] rounded-full p-px z-10">
                                            <UserVerifiedBadge userId={currentUser.id} size={13} />
                                        </span>
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex min-w-0 items-center gap-1">
                                        <div className="text-[10px] font-black text-white uppercase tracking-widest truncate">
                                            {getUserDisplayName(currentUser, "You")}
                                        </div>
                                        {currentUser.id && <UserVerifiedBadge userId={currentUser.id} size={11} />}
                                    </div>
                                    {currentUser.username && (
                                        <div className="text-[9px] text-white/35 font-bold truncate">
                                            @{currentUser.username}
                                        </div>
                                    )}
                                </div>
                                <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" title="Online" />
                            </div>
                        )}
                        <div className="flex items-end justify-between gap-3">
                            <div>
                                <h1 className="text-[22px] font-black text-white uppercase tracking-[0.24em] leading-none">Chats</h1>
                                <div className="mt-1.5 flex items-center gap-3">
                                    <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/35">
                                        {visibleConversationList.length} conversations
                                    </p>
                                    {blockedUsers.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => { setShowBlockedPanel(true); loadBlockedUsers(); }}
                                            className="flex items-center gap-1 rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-orange-400 hover:bg-orange-500/20 transition-all"
                                        >
                                            <IonIcon name="ban-outline" className="text-[9px]" />
                                            {blockedUsers.length} blocked
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="mt-5 flex items-center gap-2.5">
                            <div className="relative flex-1">
                                <input
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search googers"
                                    className="w-full bg-[#232221] border border-white/10 rounded-[1.1rem] pl-10 pr-4 py-3.5 text-[11px] font-bold text-white outline-none focus:border-white/25 focus:ring-2 focus:ring-white/5 placeholder:text-white/25 shadow-inner"
                                />
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30">
                                    <IonIcon name="search-outline" className="text-lg" />
                                </div>
                            </div>
                        </div>
                        {chatListNotice && (
                            <div className="mt-2 rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-[8px] font-black uppercase tracking-widest text-amber-200">
                                {chatListNotice}
                            </div>
                        )}
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
                                            Type to search
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
                                                    <div className="relative w-10 h-10 rounded-full overflow-hidden bg-white/5 border border-white/10 shrink-0">
                                                        <Image
                                                            src={getProfileImageSrc(user.profile_picture, getUserDisplayName(user))}
                                                            alt={getUserDisplayName(user)}
                                                            fill
                                                            className="object-cover"
                                                            onError={handleChatAvatarError}
                                                        />
                                                        {user.id && (
                                                            <span className="absolute -bottom-0.5 -right-0.5 bg-[#171615] rounded-full p-px z-10">
                                                                <UserVerifiedBadge userId={user.id} size={12} />
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-1 text-[10px] font-black text-white uppercase tracking-widest truncate">
                                                            {getUserDisplayName(user)}
                                                            {user.id && <UserVerifiedBadge userId={user.id} size={11} />}
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

                    <div
                        className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-2.5 custom-scrollbar bg-[#171615]"
                        onClick={(e) => {
                            // Close any open swipe row when clicking the list background
                            if ((e.target as HTMLElement).closest("[data-conv-row]") === null) {
                                setSwipedConvId(null);
                            }
                        }}
                    >
                        {chatListSyncing && !searchQuery.trim() ? (
                            <div className="space-y-2.5">
                                {[0, 1, 2, 3].map((item) => (
                                    <div key={item} className="rounded-[1rem] border border-white/10 bg-[#211f1e] px-2.5 py-2">
                                        <div className="flex items-center gap-2.5">
                                            <div className="h-9 w-9 shrink-0 animate-pulse rounded-[0.9rem] bg-white/10" />
                                            <div className="min-w-0 flex-1 space-y-2">
                                                <div className="h-2.5 w-28 animate-pulse rounded-full bg-white/10" />
                                                <div className="h-2 w-40 animate-pulse rounded-full bg-white/5" />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : searchQuery.trim() ? (() => {
                            const q = searchQuery.trim().toLowerCase();
                            const localMatches = conversationList.filter((e) =>
                                (e.participant.name || "").toLowerCase().includes(q) ||
                                (e.participant.username || "").toLowerCase().includes(q) ||
                                String(e.participant.id || "").includes(q) ||
                                String(e.participant.user_id || "").includes(q)
                            );
                            return (
                                <>
                                    {/* Existing conversations that match */}
                                    {localMatches.length > 0 && (
                                        <div className="mb-1">
                                            {[...localMatches].sort((a, b) => {
                                                const aPin = pinnedChats.has(String(a.participant.id)) ? 0 : 1;
                                                const bPin = pinnedChats.has(String(b.participant.id)) ? 0 : 1;
                                                return aPin - bPin;
                                            }).map((entry) => {
                                                const isActive = getChatConversationKey(activeConversation) === getChatConversationKey(entry.participant);
                                                const entryDisplayName = getChatAccountDisplayName(entry.participant);
                                                return (
                                                    <button
                                                        key={`local-${getChatConversationKey(entry.participant)}`}
                                                        type="button"
                                                        onClick={() => {
                                                            if (hiddenChatIds.has(String(entry.participant.id))) {
                                                                delete messagesCacheRef.current[String(entry.participant.id)];
                                                                unhideLocalConversation(entry.participant.id);
                                                                chatService.unhideConversation(Number(entry.participant.id)).catch(() => {});
                                                                handleOpenConversation(entry.participant, []);
                                                            } else {
                                                                handleOpenConversation(entry.participant, entry.lastMessage ? [entry.lastMessage] : []);
                                                            }
                                                        }}
                                                        className={`w-full text-left rounded-[1rem] border px-3 py-2.5 transition-all mb-1 flex items-center gap-3 ${isActive ? "border-red-500/30 bg-red-500/10" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"}`}
                                                    >
                                                        <div className="relative w-10 h-10 rounded-full overflow-hidden bg-white/5 border border-white/10 shrink-0">
                                                            <Image src={getProfileImageSrc(entry.participant.profile_picture, entryDisplayName)} alt={entryDisplayName} fill className="object-cover" onError={handleChatAvatarError} />
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex min-w-0 items-center gap-1">
                                                                <div className="text-[10px] font-black text-white tracking-widest truncate">{entryDisplayName}</div>
                                                                {entry.participant.id && <UserVerifiedBadge userId={entry.participant.id} size={11} />}
                                                            </div>
                                                            {entry.lastMessage && <div className="text-[9px] text-white/40 font-bold truncate mt-0.5">{getMessagePreview(entry.lastMessage)}</div>}
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                    {/* Global user search results */}
                                    {searchLoading ? (
                                        <div className="text-[10px] font-bold text-white/30 uppercase tracking-widest px-3 py-3">Searching...</div>
                                    ) : searchResults
                                        .filter((u: any) => !localMatches.some((e) => String(e.participant.id) === String(u.id)))
                                        .map((user: any) => (
                                        <button
                                            key={`search-${user.id}`}
                                            type="button"
                                            onClick={() => handleStartConversation(user)}
                                            className="w-full text-left rounded-[1rem] border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] px-3 py-2.5 transition-all mb-1"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="relative w-10 h-10 rounded-full overflow-hidden bg-white/5 border border-white/10 shrink-0">
                                                    <Image src={getProfileImageSrc(user.profile_picture, getUserDisplayName(user))} alt={getUserDisplayName(user)} fill className="object-cover" onError={handleChatAvatarError} />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex min-w-0 items-center gap-1">
                                                        <div className="text-[10px] font-black text-white uppercase tracking-widest truncate">{getUserDisplayName(user)}</div>
                                                        {user.id && <UserVerifiedBadge userId={user.id} size={11} />}
                                                    </div>
                                                    <div className="text-[10px] text-white/45 font-bold truncate mt-1">@{user.username}</div>
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                    {!searchLoading && localMatches.length === 0 && searchResults.length === 0 && (
                                        <div className="h-full flex items-center justify-center text-center px-6 py-10">
                                            <div>
                                                <IonIcon name="search-outline" className="text-4xl text-white/15 mb-3" />
                                                {q === (currentUser?.username || "").toLowerCase() ? (
                                                    <p className="text-[10px] font-black text-white/25 uppercase tracking-widest">{"That's your own account"}</p>
                                                ) : (
                                                    <>
                                                        <p className="text-[10px] font-black text-white/25 uppercase tracking-widest">No results found</p>
                                                        <p className="text-[9px] text-white/15 mt-1">Try searching by username or 6-digit Googer ID</p>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </>
                            );
                        })() : visibleConversationList.length > 0 ? (
                            [...visibleConversationList].sort((a, b) => {
                                const aId = String(a.participant.id);
                                const bId = String(b.participant.id);
                                if (activeConversation && frozenConvOrderRef.current.length) {
                                    // ── FROZEN while inside a conversation ───────────────────────
                                    // Use the order that was snapshotted when the chat was opened.
                                    // New entries not in the snapshot go to the bottom.
                                    const aPos = frozenConvOrderRef.current.indexOf(aId);
                                    const bPos = frozenConvOrderRef.current.indexOf(bId);
                                    return (aPos === -1 ? 9999 : aPos) - (bPos === -1 ? 9999 : bPos);
                                }
                                // ── LIVE WhatsApp-style sort on the chat list ─────────────────
                                // 1. Pinned first
                                const aPin = pinnedChats.has(aId) ? 0 : 1;
                                const bPin = pinnedChats.has(bId) ? 0 : 1;
                                if (aPin !== bPin) return aPin - bPin;
                                // 2. Most recent message first
                                const aT = new Date((a.lastMessage as any)?.created_at || 0).getTime();
                                const bT = new Date((b.lastMessage as any)?.created_at || 0).getTime();
                                return bT - aT;
                            }).map((entry) => {
                                const isActive = getChatConversationKey(activeConversation) === getChatConversationKey(entry.participant);
                                const isPinned = pinnedChats.has(String(entry.participant.id));
                                const pid = getChatConversationKey(entry.participant);
                                const isSwiped = swipedConvId === pid;
                                const entryDisplayName = getChatAccountDisplayName(entry.participant);

                                return (
                                    <div
                                        key={getChatConversationKey(entry.participant)}
                                        className="relative overflow-hidden rounded-[1rem] group/conv touch-pan-y"
                                        data-conv-row="1"
                                        onTouchStart={(e) => {
                                            swipeStartXRef.current = e.touches[0].clientX;
                                            swipeStartYRef.current = e.touches[0].clientY;
                                            swipeBaseOffsetRef.current = isSwiped ? -132 : 0;
                                            swipeCurrentOffsetRef.current = swipeBaseOffsetRef.current;
                                            swipeMovedRef.current = null; // clear any previous row's movement
                                            draggingConvIdRef.current = pid;
                                            // Disable CSS transition during drag for smooth real-time tracking
                                            const inner = rowInnerRefs.current[pid];
                                            if (inner) inner.style.transition = "none";
                                        }}
                                        onTouchMove={(e) => {
                                            const dx = e.touches[0].clientX - swipeStartXRef.current;
                                            const dy = Math.abs(e.touches[0].clientY - swipeStartYRef.current);
                                            if (dy > 28) return;
                                            const nextOffset = Math.max(-132, Math.min(0, swipeBaseOffsetRef.current + dx));
                                            if (Math.abs(dx) > 6) {
                                                swipeMovedRef.current = pid; // tag THIS row as moved
                                                e.preventDefault();
                                            }
                                            swipeCurrentOffsetRef.current = nextOffset;
                                            // Direct DOM update — zero React re-renders during drag
                                            const inner = rowInnerRefs.current[pid];
                                            if (inner) inner.style.transform = `translateX(${nextOffset}px)`;
                                        }}
                                        onTouchEnd={(e) => {
                                            const dx = e.changedTouches[0].clientX - swipeStartXRef.current;
                                            const dy = Math.abs(e.changedTouches[0].clientY - swipeStartYRef.current);
                                            // Re-enable CSS transition so the snap animation plays
                                            const inner = rowInnerRefs.current[pid];
                                            if (inner) inner.style.transition = "";
                                            if (dy <= 28) {
                                                const shouldOpen = swipeCurrentOffsetRef.current < -50 || dx < -50;
                                                const shouldClose = swipeCurrentOffsetRef.current > -82 || dx > 28;
                                                setSwipedConvId(shouldOpen && !shouldClose ? pid : shouldOpen ? pid : null);
                                            }
                                            draggingConvIdRef.current = null;
                                        }}
                                        onMouseDown={(e) => {
                                            if (e.button !== 0) return;
                                            swipeStartXRef.current = e.clientX;
                                            swipeStartYRef.current = e.clientY;
                                            swipeBaseOffsetRef.current = isSwiped ? -132 : 0;
                                            swipeCurrentOffsetRef.current = swipeBaseOffsetRef.current;
                                            swipeMovedRef.current = null; // clear any previous row's movement
                                            swipeMouseDraggingRef.current = true;
                                            draggingConvIdRef.current = pid;
                                            const inner = rowInnerRefs.current[pid];
                                            if (inner) inner.style.transition = "none";
                                        }}
                                        onMouseMove={(e) => {
                                            if (!swipeMouseDraggingRef.current) return;
                                            const dx = e.clientX - swipeStartXRef.current;
                                            const dy = Math.abs(e.clientY - swipeStartYRef.current);
                                            if (dy > 28) return;
                                            const nextOffset = Math.max(-132, Math.min(0, swipeBaseOffsetRef.current + dx));
                                            if (Math.abs(dx) > 6) swipeMovedRef.current = pid; // tag THIS row
                                            swipeCurrentOffsetRef.current = nextOffset;
                                            const inner = rowInnerRefs.current[pid];
                                            if (inner) inner.style.transform = `translateX(${nextOffset}px)`;
                                        }}
                                        onMouseUp={(e) => {
                                            const dx = e.clientX - swipeStartXRef.current;
                                            const dy = Math.abs(e.clientY - swipeStartYRef.current);
                                            const inner = rowInnerRefs.current[pid];
                                            if (inner) inner.style.transition = "";
                                            if (dy <= 28) {
                                                const shouldOpen = swipeCurrentOffsetRef.current < -50 || dx < -50;
                                                const shouldClose = swipeCurrentOffsetRef.current > -82 || dx > 24;
                                                setSwipedConvId(shouldOpen && !shouldClose ? pid : shouldOpen ? pid : null);
                                            }
                                            swipeMouseDraggingRef.current = false;
                                            draggingConvIdRef.current = null;
                                        }}
                                        onMouseLeave={() => {
                                            if (!swipeMouseDraggingRef.current) return;
                                            const inner = rowInnerRefs.current[pid];
                                            if (inner) inner.style.transition = "";
                                            setSwipedConvId(swipeCurrentOffsetRef.current < -46 ? pid : null);
                                            swipeMouseDraggingRef.current = false;
                                            draggingConvIdRef.current = null;
                                        }}
                                    >
                                        {/* Action buttons revealed on swipe — behind the row */}
                                        <div className="absolute inset-y-1 right-1 z-0 flex w-[132px] items-stretch justify-end gap-1">
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); togglePinChat(pid); }}
                                                className={`flex w-10 flex-col items-center justify-center gap-0.5 rounded-xl border shadow-sm transition-all ${isPinned ? "border-amber-300/40 bg-[#b87512]" : "border-amber-300/25 bg-[#875713]"} hover:bg-[#b87512]`}
                                                title={isPinned ? "Unpin" : "Pin"}
                                            >
                                                <IonIcon name={isPinned ? "pin" : "pin-outline"} className="text-[13px] text-white" />
                                                <span className="text-[5.5px] font-black text-white uppercase tracking-wider">{isPinned ? "Unpin" : "Pin"}</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); setBlockTarget(entry); setSwipedConvId(null); }}
                                                className="flex w-10 flex-col items-center justify-center gap-0.5 rounded-xl border border-orange-400/30 bg-[#b45309] shadow-sm transition-all hover:bg-[#d97706]"
                                                title="Block user"
                                            >
                                                <IonIcon name="ban-outline" className="text-[13px] text-white" />
                                                <span className="text-[5.5px] font-black text-white uppercase tracking-wider">Block</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); requestDeleteConversation(entry); }}
                                                className="flex w-10 flex-col items-center justify-center gap-0.5 rounded-xl border border-red-300/25 bg-[#e11d2e] shadow-sm transition-all hover:bg-[#f2263a]"
                                                title="Delete chat"
                                            >
                                                <IonIcon name="trash-outline" className="text-[13px] text-white" />
                                                <span className="text-[5.5px] font-black text-white uppercase tracking-wider">Delete</span>
                                            </button>
                                        </div>

                                        {/* Main row — slides left on swipe */}
                                        <div
                                            ref={(el) => { if (el) rowInnerRefs.current[pid] = el; else delete rowInnerRefs.current[pid]; }}
                                            className="relative z-10 transition-transform duration-200"
                                            style={{ transform: `translateX(${isSwiped ? -132 : 0}px)` }}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    // Only block the click if THIS specific row had movement (not another row)
                                                    if (swipeMovedRef.current === pid) { swipeMovedRef.current = null; return; }
                                                    if (isSwiped) { setSwipedConvId(null); return; }
                                                    // On mobile: allow re-tapping the same conversation when the chat panel
                                                    // is hidden (user pressed back). On desktop the panel is always visible.
                                                    if (isActive && showMobileChat) return;
                                                    // Seed with lastMessage so cache-miss opens show something instantly
                                                    const seedMsgs = entry.lastMessage ? [entry.lastMessage] : [];
                                                    handleOpenConversation(entry.participant, seedMsgs);
                                                }}
                                                className={`w-full text-left rounded-[1rem] border px-2.5 py-2 shadow-[0_8px_22px_rgba(0,0,0,0.16)] transition-all ${isActive
                                                    ? "bg-[#26292f] border-blue-400/35 ring-1 ring-blue-400/15"
                                                    : isPinned
                                                        ? "bg-[#242019] border-amber-400/20 hover:border-amber-300/30"
                                                        : "bg-[#211f1e] border-white/10 hover:bg-[#272523] hover:border-white/16"
                                                    }`}
                                            >
                                                <div className="flex items-center gap-2.5">
                                                    <div className="relative w-9 h-9 rounded-full overflow-hidden bg-[#101827] border border-white/10 shrink-0 shadow-inner">
                                                        <Image
                                                            src={getProfileImageSrc(entry.participant.profile_picture, entryDisplayName)}
                                                            alt={entryDisplayName}
                                                            fill
                                                            className="object-cover"
                                                            onError={handleChatAvatarError}
                                                        />
                                                        {isPinned && (
                                                            <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-amber-400 flex items-center justify-center">
                                                                <IonIcon name="pin" className="text-[7px] text-black" />
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <div className="flex min-w-0 items-center gap-1">
                                                                <div className="text-[9px] font-black text-white tracking-[0.13em] truncate">
                                                                    {entryDisplayName}
                                                                </div>
                                                                {entry.participant.id && <UserVerifiedBadge userId={entry.participant.id} size={10} />}
                                                            </div>
                                                            <div className="flex items-center gap-1.5 shrink-0">
                                                                {(() => {
                                                                    const lm = entry.lastMessage;
                                                                    const isLmMine = lm && String(lm.sender_id) === String(currentUser?.id);
                                                                    if (isLmMine && entry.unread_count === 0) {
                                                                        const cachedMessages = messagesCacheRef.current[String(entry.participant.id)] || [];
                                                                        const cachedLatest = cachedMessages.length > 0 ? cachedMessages[cachedMessages.length - 1] : null;
                                                                        const freshest = cachedLatest && String(cachedLatest.id) === String(lm.id) ? cachedLatest : lm;
                                                                        return <MessageStatusRing status={resolveMessageStatus(freshest)} size="list" />;
                                                                    }
                                                                    return null;
                                                                })()}
                                                                {entry.unread_count > 0 && (
                                                                    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[8px] font-black flex items-center justify-center shadow-[0_0_10px_rgba(239,68,68,0.4)]">
                                                                        {entry.unread_count}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center justify-between gap-1 mt-1">
                                                            <div className="text-[8.5px] text-white/45 font-bold truncate">
                                                                {getMessagePreview(entry.lastMessage)}
                                                            </div>
                                                            {entry.participant.last_seen_at && entry.participant.status !== 'online' && (
                                                                <div className="text-[7.5px] text-white/25 font-bold shrink-0">
                                                                    {(() => {
                                                                        const t = new Date(entry.participant.last_seen_at).getTime();
                                                                        const diff = Date.now() - t;
                                                                        if (diff < 60000) return 'just now';
                                                                        if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
                                                                        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
                                                                        return `${Math.floor(diff / 86400000)}d`;
                                                                    })()}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </button>

                                            {/* Desktop hover actions */}
                                            <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover/conv:flex items-center gap-1">
                                                <button
                                                    type="button"
                                                    title={isPinned ? "Unpin chat" : "Pin chat"}
                                                    onClick={(e) => { e.stopPropagation(); togglePinChat(pid); }}
                                                    className="w-6 h-6 rounded-lg bg-white/8 border border-white/10 flex items-center justify-center text-white/40 hover:text-amber-300 hover:bg-amber-500/10 transition-all"
                                                >
                                                    <IonIcon name={isPinned ? "pin" : "pin-outline"} className="text-[10px]" />
                                                </button>
                                                <button
                                                    type="button"
                                                    title="Delete chat"
                                                    onClick={(e) => { e.stopPropagation(); requestDeleteConversation(entry); }}
                                                    className="w-6 h-6 rounded-lg bg-white/8 border border-white/10 flex items-center justify-center text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all"
                                                >
                                                    <IonIcon name="trash-outline" className="text-[10px]" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
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
                    {/* Always-mounted audio element so it's ready before activeCall state is set */}
                    <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: "none" }} />

                    {activeConversation ? (
                        <>
                            {incomingCall && callPhase === "incoming" && (
                                <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center"
                                    style={{ background: "radial-gradient(ellipse at 50% 30%, #5f6068 0%, #313238 58%, #191a1f 100%)" }}
                                >
                                    {/* Animated pulse rings behind avatar */}
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                        <span className="absolute w-56 h-56 rounded-full border border-red-500/10 animate-ping" style={{ animationDuration: "1.8s" }} />
                                        <span className="absolute w-80 h-80 rounded-full border border-red-500/5 animate-ping" style={{ animationDuration: "2.4s" }} />
                                        <span className="absolute w-[28rem] h-[28rem] rounded-full border border-red-500/[0.03] animate-ping" style={{ animationDuration: "3s" }} />
                                    </div>

                                    {/* Call type badge */}
                                    <div className="z-10 mb-8 flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 backdrop-blur-sm">
                                        <IonIcon name={incomingCall.call_type === "video" ? "videocam" : "call"} className="text-sm text-red-400" />
                                        <span className="text-[9px] font-black uppercase tracking-[0.25em] text-white/60">
                                            Incoming {incomingCall.call_type === "video" ? "Video" : "Voice"} Call
                                        </span>
                                    </div>

                                    {/* Avatar */}
                                    <div className="z-10 relative mb-5">
                                        <div className="relative w-32 h-32 rounded-full overflow-hidden border-2 border-white/10 shadow-2xl shadow-black">
                                            <Image
                                                src={getProfileImageSrc(incomingCall.participant?.profile_picture, incomingCall.participant?.name)}
                                                alt={incomingCall.participant?.name || "Caller"}
                                                fill
                                                className="object-cover"
                                                onError={handleChatAvatarError}
                                            />
                                        </div>
                                        {/* Online dot */}
                                        <span className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-red-500 border-2 border-black" />
                                    </div>

                                    {/* Name */}
                                    <div className="z-10 text-center mb-2">
                                        <div className="text-2xl font-black text-white tracking-tight">{incomingCall.participant?.name || "Unknown"}</div>
                                        <div className="mt-1.5 text-[9px] font-bold uppercase tracking-[0.2em] text-white/30">
                                            🔒 End-to-end encrypted
                                        </div>
                                    </div>

                                    {callError && (
                                        <div className="z-10 mt-3 text-[10px] font-bold text-red-400 text-center px-6">{callError}</div>
                                    )}

                                    {/* Decline / Accept */}
                                    <div className="z-10 mt-12 flex items-center gap-20">
                                        <div className="flex flex-col items-center gap-3">
                                            <button
                                                type="button"
                                                onClick={rejectIncomingCall}
                                                className="w-[68px] h-[68px] rounded-full bg-red-600 flex items-center justify-center shadow-xl shadow-red-900/50 hover:bg-red-500 active:scale-90 transition-all"
                                            >
                                                <IonIcon name="call" className="text-[26px] text-white rotate-[135deg]" />
                                            </button>
                                            <span className="text-[9px] font-black uppercase tracking-widest text-white/35">Decline</span>
                                        </div>
                                        <div className="flex flex-col items-center gap-3">
                                            <button
                                                type="button"
                                                onClick={acceptIncomingCall}
                                                className="w-[68px] h-[68px] rounded-full bg-white flex items-center justify-center shadow-xl shadow-white/10 hover:bg-white/90 active:scale-90 transition-all"
                                            >
                                                <IonIcon name={incomingCall.call_type === "video" ? "videocam" : "call"} className="text-[26px] text-black" />
                                            </button>
                                            <span className="text-[9px] font-black uppercase tracking-widest text-white/35">Accept</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeCall && (
                                <div
                                    className="fixed inset-0 z-[55] flex flex-col"
                                    style={{ background: "#24252b" }}
                                    onClick={() => {
                                        remoteAudioRef.current?.play?.().catch(() => {});
                                        remoteVideoRef.current?.play?.().catch(() => {});
                                    }}
                                >
                                    {/* === VIDEO CALL: full-screen remote + pip local === */}
                                    {activeCall.call_type === "video" ? (
                                        <div className="relative flex-1 overflow-hidden" style={{ background: "#24252b" }}>
                                            {/* Remote video — full screen */}
                                            <video
                                                ref={remoteVideoRef}
                                                autoPlay
                                                playsInline
                                                className="absolute inset-0 w-full h-full object-cover"
                                            />
                                            {/* Dim overlay when no remote video yet */}
                                            {callPhase !== "active" && (
                                                <div className="absolute inset-0 bg-zinc-800/80 flex flex-col items-center justify-center gap-4">
                                                    <div className="relative w-24 h-24 rounded-full overflow-hidden border-2 border-white/10">
                                                        <Image src={getProfileImageSrc(activeConversationProfilePicture, activeConversationDisplayName)} alt={activeConversationDisplayName} fill className="object-cover" onError={handleChatAvatarError} />
                                                    </div>
                                                    <div className="flex items-center gap-1.5 text-white font-black text-xl">
                                                        <span>{activeConversationDisplayName}</span>
                                                        {activeConversation.id && <UserVerifiedBadge userId={activeConversation.id} size={14} />}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: "0ms" }} />
                                                        <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: "150ms" }} />
                                                        <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: "300ms" }} />
                                                    </div>
                                                    <div className="text-[10px] font-black uppercase tracking-widest text-white/40">
                                                        {callPhase === "outgoing" ? "Ringing..." : "Connecting..."}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Local video — picture-in-picture bottom right */}
                                            <div className="absolute bottom-24 right-4 w-28 h-40 rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl bg-black/60">
                                                {isCameraOff ? (
                                                    <div className="w-full h-full flex items-center justify-center bg-zinc-700/90">
                                                        <IonIcon name="videocam-off-outline" className="text-2xl text-white/40" />
                                                    </div>
                                                ) : (
                                                    <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                                                )}
                                                <div className="absolute bottom-1.5 left-0 right-0 text-center text-[7px] font-black uppercase tracking-widest text-white/50">You</div>
                                            </div>

                                            {/* Top bar */}
                                            <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-5 pt-safe pt-4 pb-3 bg-gradient-to-b from-zinc-900/75 to-transparent">
                                                <div>
                                                    <div className="flex items-center gap-1.5 text-white font-black text-base">
                                                        <span>{activeConversationDisplayName}</span>
                                                        {activeConversation.id && <UserVerifiedBadge userId={activeConversation.id} size={12} />}
                                                    </div>
                                                    <div className="text-[9px] font-bold text-white/50 mt-0.5">
                                                        {callPhase === "active" ? formatCallTimer(callDurationSecs) : callPhase === "outgoing" ? "Ringing..." : "Connecting..."}
                                                    </div>
                                                </div>
                                                {availableQualities.length > 1 && (
                                                    <div className="flex items-center gap-1">
                                                        {availableQualities.map((q) => (
                                                            <button key={q} type="button" onClick={() => handleChangeVideoQuality(q)}
                                                                className={`px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${videoQuality === q ? "bg-white text-black" : "bg-white/15 text-white/50 hover:bg-white/25"}`}>
                                                                {q}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            {callError && (
                                                <div className="absolute top-20 left-0 right-0 text-center text-[10px] font-bold text-red-400 px-6">{callError}</div>
                                            )}

                                            {/* Bottom controls */}
                                            <div className="absolute bottom-0 left-0 right-0 pb-safe pb-8 pt-6 px-8 bg-gradient-to-t from-zinc-900/85 to-transparent flex items-center justify-center gap-4" onClick={(e) => e.stopPropagation()}>
                                                <button type="button" onClick={toggleMute}
                                                    className={`w-13 h-13 w-[52px] h-[52px] rounded-full border-2 flex items-center justify-center transition-all active:scale-90 ${isMuted ? "bg-white/20 border-white/30 text-white" : "bg-white/10 border-white/20 text-white/80 hover:bg-white/20"}`}>
                                                    <IonIcon name={isMuted ? "mic-off" : "mic"} className="text-xl" />
                                                </button>
                                                <button type="button" onClick={toggleSpeaker}
                                                    className={`w-[52px] h-[52px] rounded-full border-2 flex items-center justify-center transition-all active:scale-90 ${isSpeakerOn ? "bg-white/25 border-white/40 text-white" : "bg-white/10 border-white/20 text-white/70 hover:bg-white/20"}`}>
                                                    <IonIcon name={isSpeakerOn ? "volume-high" : "volume-medium"} className="text-xl" />
                                                </button>
                                                <button type="button" onClick={hangUpCall}
                                                    className="w-16 h-16 rounded-full bg-red-600 border-2 border-red-500 flex items-center justify-center shadow-xl shadow-red-900/60 hover:bg-red-500 active:scale-90 transition-all">
                                                    <IonIcon name="call" className="text-2xl text-white rotate-[135deg]" />
                                                </button>
                                                <button type="button" onClick={toggleCamera}
                                                    className={`w-[52px] h-[52px] rounded-full border-2 flex items-center justify-center transition-all active:scale-90 ${isCameraOff ? "bg-white/20 border-white/30 text-white" : "bg-white/10 border-white/20 text-white/80 hover:bg-white/20"}`}>
                                                    <IonIcon name={isCameraOff ? "videocam-off" : "videocam"} className="text-xl" />
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        /* === VOICE CALL UI === */
                                        <div className="flex-1 flex flex-col items-center justify-between py-16 px-8"
                                            style={{ background: "radial-gradient(ellipse at 50% 20%, #5c5d66 0%, #303139 58%, #191a1f 100%)" }}>
                                            <div className="flex flex-col items-center gap-5 z-10">
                                                {/* Avatar */}
                                                <div className="relative w-32 h-32 rounded-full overflow-hidden border-2 border-white/10 shadow-2xl shadow-black">
                                                    <Image src={getProfileImageSrc(activeConversationProfilePicture, activeConversationDisplayName)} alt={activeConversationDisplayName} fill className="object-cover" onError={handleChatAvatarError} />
                                                </div>
                                                <div className="text-center">
                                                    <div className="flex items-center justify-center gap-1.5 text-2xl font-black text-white">
                                                        <span>{activeConversationDisplayName}</span>
                                                        {activeConversation.id && <UserVerifiedBadge userId={activeConversation.id} size={14} />}
                                                    </div>
                                                    <div className="mt-2 text-[11px] font-bold text-white/50">
                                                        {callPhase === "active" ? formatCallTimer(callDurationSecs) : callPhase === "outgoing" ? "Ringing..." : "Connecting..."}
                                                    </div>
                                                    <div className="mt-1 text-[8px] font-bold uppercase tracking-widest text-white/25">🔒 End-to-end encrypted</div>
                                                </div>
                                                {callError && (
                                                    <div className="text-[10px] font-bold text-red-400 text-center mt-2">{callError}</div>
                                                )}
                                            </div>

                                            {/* Controls */}
                                            <div className="z-10 flex items-center gap-8" onClick={(e) => e.stopPropagation()}>
                                                <button type="button" onClick={toggleMute}
                                                    className={`w-14 h-14 rounded-full border-2 flex items-center justify-center transition-all active:scale-90 ${isMuted ? "bg-white/20 border-white/30 text-white" : "bg-white/10 border-white/20 text-white/70 hover:bg-white/20"}`}>
                                                    <IonIcon name={isMuted ? "mic-off" : "mic"} className="text-xl" />
                                                </button>
                                                <button type="button" onClick={hangUpCall}
                                                    className="w-[72px] h-[72px] rounded-full bg-red-600 border-2 border-red-500 flex items-center justify-center shadow-2xl shadow-red-900/60 hover:bg-red-500 active:scale-90 transition-all">
                                                    <IonIcon name="call" className="text-[28px] text-white rotate-[135deg]" />
                                                </button>
                                                <button type="button" onClick={toggleSpeaker}
                                                    className={`w-14 h-14 rounded-full border-2 flex items-center justify-center transition-all active:scale-90 ${isSpeakerOn ? "bg-white/25 border-white/40 text-white" : "bg-white/10 border-white/20 text-white/70 hover:bg-white/20"}`}>
                                                    <IonIcon name={isSpeakerOn ? "volume-high" : "volume-medium"} className="text-xl" />
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {pendingDeleteMessageIds.length > 0 && (
                                <div className="fixed inset-0 z-[58] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                                    <div className="w-full max-w-[240px] rounded-2xl border border-white/10 bg-[#101014] shadow-2xl overflow-hidden">
                                        <div className="divide-y divide-white/8">
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteMessages(pendingDeleteMessageIds, false)}
                                                className="w-full py-3.5 text-[10px] font-black uppercase tracking-widest text-white/80 hover:bg-white/5 transition-all"
                                            >
                                                Delete for Me
                                            </button>
                                            {pendingDeleteIsMine && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteMessages(pendingDeleteMessageIds, true)}
                                                    className="w-full py-3.5 text-[10px] font-black uppercase tracking-widest text-red-400 hover:bg-red-500/10 transition-all"
                                                >
                                                    Delete for Everyone
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => { setPendingDeleteMessageIds([]); exitSelectMode(); }}
                                                className="w-full py-3.5 text-[10px] font-black uppercase tracking-widest text-white/40 hover:bg-white/5 transition-all"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Forward message modal */}
                            {forwardMessage && (() => {
                                const fwdList = forwardSearchQuery.trim()
                                    ? visibleConversationList.filter((e) =>
                                        (e.participant.name || "").toLowerCase().includes(forwardSearchQuery.trim().toLowerCase()) ||
                                        (e.participant.username || "").toLowerCase().includes(forwardSearchQuery.trim().toLowerCase())
                                      )
                                    : visibleConversationList;
                                return (
                                    <div className="fixed inset-0 z-[59] bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center p-4">
                                        <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#101014] shadow-2xl overflow-hidden">
                                            <div className="px-5 pt-5 pb-3 border-b border-white/10 flex items-center justify-between">
                                                <div className="text-[10px] font-black text-white uppercase tracking-[0.18em]">Forward To</div>
                                                <button type="button" onClick={() => { setForwardMessage(null); setForwardSearchQuery(""); }} className="text-white/30 hover:text-white/70">
                                                    <IonIcon name="close-outline" className="text-lg" />
                                                </button>
                                            </div>
                                            <div className="px-3 pt-3">
                                                <div className="relative">
                                                    <IonIcon name="search-outline" className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm pointer-events-none" />
                                                    <input
                                                        type="text"
                                                        value={forwardSearchQuery}
                                                        onChange={(e) => setForwardSearchQuery(e.target.value)}
                                                        placeholder="Search people..."
                                                        className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-3 py-2 text-[10px] font-bold text-white placeholder:text-white/25 outline-none focus:border-white/25"
                                                        autoFocus
                                                    />
                                                </div>
                                            </div>
                                            <div className="p-3 max-h-64 overflow-y-auto space-y-1.5">
                                                {fwdList.length === 0 ? (
                                                    <p className="text-[9px] font-bold text-white/30 text-center py-4 uppercase tracking-widest">No results</p>
                                                ) : (
                                                    fwdList.map((entry) => {
                                                        const entryDisplayName = getChatAccountDisplayName(entry.participant);
                                                        return (
                                                            <button
                                                                key={getChatConversationKey(entry.participant) || entry.participant.id}
                                                                type="button"
                                                                onClick={() => { doForwardMessage(Number(entry.participant.id)); setForwardSearchQuery(""); }}
                                                                className="w-full flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] px-3 py-2.5 transition-all"
                                                            >
                                                                <div className="relative w-8 h-8 rounded-xl overflow-hidden bg-white/5 border border-white/10 shrink-0">
                                                                    <Image src={getProfileImageSrc(entry.participant.profile_picture, entryDisplayName)} alt={entryDisplayName} fill className="object-cover" onError={handleChatAvatarError} />
                                                                </div>
                                                                <div className="text-[9px] font-black text-white tracking-widest truncate">{entryDisplayName}</div>
                                                            </button>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Image viewer modal */}
                            {imageViewerSrc && (
                                <div
                                    className="fixed inset-0 z-[70] bg-black/95 flex flex-col items-center justify-center"
                                    onClick={() => { setImageViewerSrc(null); setImageViewerZoom(1); }}
                                >
                                    {/* Top controls */}
                                    <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/60 to-transparent z-10" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setImageViewerZoom((z) => Math.max(0.5, z - 0.25))}
                                                className="w-9 h-9 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-white/70 hover:bg-white/20 transition-all"
                                            >
                                                <IonIcon name="remove-outline" className="text-base" />
                                            </button>
                                            <span className="text-[9px] font-black uppercase tracking-widest text-white/50 w-10 text-center">
                                                {Math.round(imageViewerZoom * 100)}%
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setImageViewerZoom((z) => Math.min(4, z + 0.25))}
                                                className="w-9 h-9 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-white/70 hover:bg-white/20 transition-all"
                                            >
                                                <IonIcon name="add-outline" className="text-base" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setImageViewerZoom(1)}
                                                className="px-3 h-9 rounded-full bg-white/10 border border-white/15 text-[9px] font-black uppercase tracking-widest text-white/50 hover:bg-white/20 transition-all"
                                            >
                                                Reset
                                            </button>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <a
                                                href={imageViewerSrc}
                                                download
                                                onClick={(e) => e.stopPropagation()}
                                                className="w-9 h-9 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-white/70 hover:bg-white/20 transition-all"
                                                title="Download"
                                            >
                                                <IonIcon name="download-outline" className="text-base" />
                                            </a>
                                            <button
                                                type="button"
                                                onClick={() => { setImageViewerSrc(null); setImageViewerZoom(1); }}
                                                className="w-9 h-9 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-white/70 hover:bg-white/20 transition-all"
                                            >
                                                <IonIcon name="close-outline" className="text-xl" />
                                            </button>
                                        </div>
                                    </div>
                                    {/* Image */}
                                    <div className="overflow-auto w-full h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={imageViewerSrc}
                                            alt="Chat image"
                                            style={{ transform: `scale(${imageViewerZoom})`, transformOrigin: "center", transition: "transform 0.15s ease", maxWidth: "90vw", maxHeight: "85vh", objectFit: "contain", borderRadius: "0.75rem" }}
                                            draggable={false}
                                        />
                                    </div>
                                    <div className="absolute bottom-4 text-[8px] font-black uppercase tracking-widest text-white/25">
                                        Click outside to close · Scroll to zoom
                                    </div>
                                </div>
                            )}

                            <div className="px-3 md:px-5 py-3 md:py-4 border-b border-white/10 bg-white/[0.02] flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            mobileBackPressedRef.current = true;
                                            preferredParticipantIdRef.current = "";
                                            preferredConversationKeyRef.current = "";
                                            activeConversationRef.current = null;
                                            frozenConvOrderRef.current = []; // unfreeze list
                                            setActiveConversation(null);
                                            setShowMobileChat(false);
                                            const mobileViewKey = getChatMobileViewKey(currentUser?.id);
                                            if (mobileViewKey) { try { window.localStorage.setItem(mobileViewKey, "list"); } catch { } }
                                        }}
                                        className="md:hidden w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/70 shrink-0"
                                    >
                                        <IonIcon name="arrow-back-outline" className="text-base" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={openActiveConversationProfile}
                                        className="relative w-9 h-9 md:w-11 md:h-11 rounded-full overflow-hidden bg-white/5 border border-white/10 shrink-0 hover:border-white/25 transition-all"
                                        title="Open profile"
                                    >
                                        <Image
                                            src={getProfileImageSrc(activeConversationProfilePicture, activeConversationDisplayName)}
                                            alt={activeConversationDisplayName || "User"}
                                            fill
                                            className="object-cover"
                                            onError={handleChatAvatarError}
                                        />
                                    </button>
                                    <button type="button" onClick={openActiveConversationProfile} className="min-w-0 text-left">
                                        <div className="flex min-w-0 items-center gap-1">
                                            <div className="text-[10px] font-black text-white tracking-[0.18em] truncate">
                                                {activeConversationDisplayName}
                                            </div>
                                            {activeConversation.id && <UserVerifiedBadge userId={activeConversation.id} size={11} />}
                                        </div>
                                        <div className="flex items-center gap-1.5 mt-1">
                                            {participantTyping ? (
                                                <>
                                                    <span className="flex gap-0.5 items-end h-3">
                                                        <span className="w-1 h-1 rounded-full bg-red-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                                                        <span className="w-1 h-1 rounded-full bg-red-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                                                        <span className="w-1 h-1 rounded-full bg-red-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                                                    </span>
                                                    <div className="text-[8px] font-black uppercase tracking-widest text-red-300">
                                                        Typing...
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <span
                                                        className={`w-1.5 h-1.5 rounded-full ${participantPresence.status === "online" ? "bg-red-400" : "bg-white/25"}`}
                                                    />
                                                    <div className={`text-[8px] font-black uppercase tracking-widest ${participantPresence.status === "online" ? "text-red-300" : "text-white/30"}`}>
                                                        {participantPresence.status === "online"
                                                            ? "Online"
                                                            : formatLastSeen(participantPresence.lastSeen)}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </button>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <button
                                        type="button"
                                        onClick={toggleManualTheme}
                                        title={resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                                        className="w-9 h-9 md:w-10 md:h-10 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white/70 transition-all flex items-center justify-center"
                                    >
                                        <IonIcon name={resolvedTheme === "dark" ? "moon" : "sunny"} className="text-base" />
                                    </button>
                                    {canUseVideoCall && availableQualities.length > 1 && (
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
                                        disabled={!canUseVoiceCall}
                                        title="Voice call (end-to-end encrypted)"
                                        className={`w-9 h-9 md:w-10 md:h-10 rounded-xl border transition-all flex items-center justify-center ${callMode === "voice" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-white/5 hover:bg-white/10 text-white/70 border-white/10"}`}
                                    >
                                        <IonIcon name="call-outline" className="text-base" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => canUseVideoCall ? handleStartCall("video") : undefined}
                                        disabled={!canUseVideoCall}
                                        title={canUseVideoCall ? `Video call (${videoQuality}, end-to-end encrypted)` : "Video calls are not enabled on your current plan. Please upgrade."}
                                        className={`w-9 h-9 md:w-10 md:h-10 rounded-xl border transition-all flex items-center justify-center ${
                                            !canUseVideoCall
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

                            {/* Select mode bar — fixed at top of message area */}
                            {selectMode && (
                                <div className="flex items-center justify-between border-b border-white/10 bg-[#0d0d10]/95 backdrop-blur-md px-4 py-2.5 z-30">
                                    <span className="text-[9px] font-black uppercase tracking-widest text-white/60">
                                        {selectedMessages.size} selected
                                    </span>
                                    <div className="flex items-center gap-2">
                                        {selectedMessages.size > 0 && (
                                            <button
                                                type="button"
                                                onClick={copySelectedMessagesToClipboard}
                                                className="inline-flex items-center gap-1.5 rounded-full bg-white/8 border border-white/10 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-white/55 hover:bg-white/12 hover:text-white/80 transition-all"
                                            >
                                                <IonIcon name="copy-outline" className="text-[10px]" />
                                                Copy {selectedMessages.size > 1 ? `(${selectedMessages.size})` : ""}
                                            </button>
                                        )}
                                        {selectedMessages.size > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const ids = [...selectedMessages];
                                                    setPendingDeleteMessageIds(ids);
                                                    setPendingDeleteIsMine(ids.every(id => {
                                                        const m = visibleMessages.find((msg: any) => String(msg.id) === String(id));
                                                        return m && String(m.sender_id) === String(currentUser?.id);
                                                    }));
                                                }}
                                                className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 border border-red-500/25 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-red-400 hover:bg-red-500/25 transition-all"
                                            >
                                                <IonIcon name="trash-outline" className="text-[10px]" />
                                                Delete {selectedMessages.size > 1 ? `(${selectedMessages.size})` : ""}
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={exitSelectMode}
                                            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-white/40 hover:bg-white/10 hover:text-white/70 transition-all"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}
                            <div className="flex-1 overflow-y-auto p-3 md:p-5 space-y-1.5 bg-transparent">
                                {combinedMessages.length > 0 ? (
                                    (() => {
                                        let outgoingChatCount = 0;
                                        let adShowCount = 0;
                                        const convId = getChatConversationKey(activeConversation) || String(activeConversation?.id || "default");
                                        const thresholds = adInjectedMessages
                                            ? getAdThresholds(convId, adInjectedMessages.ads.length)
                                            : [];
                                        const elements: React.ReactNode[] = [];
                                        let lastDateLabel: string | null = null;
                                        combinedMessages.forEach((message) => {
                                        // ── Date separator ──────────────────────────────────────
                                        const dateLabel = getChatDateLabel(message.created_at);
                                        if (dateLabel && dateLabel !== lastDateLabel) {
                                            lastDateLabel = dateLabel;
                                            elements.push(
                                                <div key={`date-${message.id}-${dateLabel}`} className="flex items-center justify-center my-4">
                                                    <span className="bg-white/10 rounded-full px-3 py-1 text-[8px] font-black uppercase tracking-widest text-white/45 select-none">
                                                        {dateLabel}
                                                    </span>
                                                </div>
                                            );
                                        }
                                        const isMine = String(message.sender_id) === String(currentUser?.id);
                                        if (isMine) outgoingChatCount++;
                                        if (adInjectedMessages && isMine && thresholds[adShowCount] === outgoingChatCount) {
                                            const placementIndex = adShowCount;
                                            const placement = getAssignedConversationAd(convId, placementIndex, adInjectedMessages.ads);
                                            adShowCount++;
                                            if (placement?.ad) {
                                                elements.push(
                                                    <ChatAdBox
                                                        key={`chat-ad-${convId}-${placementIndex}-${outgoingChatCount}`}
                                                        ad={placement.ad}
                                                        onToggleLike={(a) => chatAdActions.like(a)}
                                                        onOpenSheet={(type, a) => void openChatAdSheet(type, a.raw || a)}
                                                        onShare={(a) => { setChatAdShareItem(a.raw || a); setChatAdShareOpen(true); }}
                                                        onCollectCoin={handleChatAdCollectCoin}
                                                        onNavigateToProfile={handleChatAdNavigateToProfile}
                                                        canShowCollectCoin={canShowChatAdCollectCoin}
                                                        onReport={() => {}}
                                                        onNotInterested={handleChatAdNotInterested}
                                                        onLogView={handleChatAdLogView}
                                                        onLogImpression={handleChatAdLogImpression}
                                                        onOpenProductSecondView={openChatProductPromoteSecondView}
                                                        onPromoteAgain={canPromoteChatAd(placement.ad) ? handleChatAdPromoteAgain : undefined}
                                                        promoteAgainLabel={isCurrentUserChatAdOwner(placement.ad) ? "Promote Again" : "Promote"}
                                                        onDeleteAd={isCurrentUserChatAdOwner(placement.ad) ? handleChatAdDelete : undefined}
                                                    />
                                                );
                                            }
                                        }
                                        const messageStatus = resolveMessageStatus(message);
                                        const isSelected = selectedMessages.has(message.id);
                                        const isHovered = hoveredMessageId === message.id;
                                        const replySource = message.reply_to_id
                                            ? combinedMessages.find((m: any) => String(m.id) === String(message.reply_to_id))
                                            : null;

                                        elements.push(
                                            <div
                                                key={message.id}
                                                className={`flex items-end gap-2 ${isMine ? "justify-end" : "justify-start"}`}
                                                onMouseEnter={() => setHoveredMessageId(message.id)}
                                                onMouseLeave={() => setHoveredMessageId(null)}
                                            >
                                                {/* Select checkbox */}
                                                {selectMode && (
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleSelectMessage(message.id)}
                                                        className={`shrink-0 w-4 h-4 rounded-full border transition-all ${isSelected ? "bg-red-500 border-red-400" : "bg-white/5 border-red-500/40"}`}
                                                    >
                                                        {isSelected && <IonIcon name="checkmark-outline" className="text-[8px] text-white" />}
                                                    </button>
                                                )}

                                                {/* Context action buttons (left side for mine, right side for others) */}
                                                {!selectMode && isHovered && (
                                                    <div className={`flex items-center gap-1 shrink-0 ${isMine ? "order-first" : "order-last"}`}>
                                                        <button
                                                            type="button"
                                                            title="Reply"
                                                            onClick={() => setReplyTo(message)}
                                                            className="w-7 h-7 rounded-full bg-white/8 border border-white/10 flex items-center justify-center text-white/50 hover:text-white/90 hover:bg-white/15 transition-all"
                                                        >
                                                            <IonIcon name="return-down-back-outline" className="text-xs" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            title="Forward"
                                                            onClick={() => setForwardMessage(message)}
                                                            className="w-7 h-7 rounded-full bg-white/8 border border-white/10 flex items-center justify-center text-white/50 hover:text-white/90 hover:bg-white/15 transition-all"
                                                        >
                                                            <IonIcon name="arrow-redo-outline" className="text-xs" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            title="Copy"
                                                            onClick={() => copyMessageToClipboard(message)}
                                                            className="w-7 h-7 rounded-full bg-white/8 border border-white/10 flex items-center justify-center text-white/50 hover:text-white/90 hover:bg-white/15 transition-all"
                                                        >
                                                            <IonIcon name="copy-outline" className="text-xs" />
                                                        </button>
                                                        {isMine && (
                                                            <button
                                                                type="button"
                                                                title="Delete"
                                                                onClick={() => setPendingDeleteMessageId(message.id, isMine)}
                                                                className="w-7 h-7 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400/60 hover:text-red-300 hover:bg-red-500/20 transition-all"
                                                            >
                                                                <IonIcon name="trash-outline" className="text-xs" />
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            title="Select"
                                                            onClick={() => enterSelectMode(message.id)}
                                                            className="w-6 h-6 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 hover:text-red-300 hover:bg-red-500/20 transition-all"
                                                        >
                                                            <IonIcon name="checkmark-circle-outline" className="text-[10px]" />
                                                        </button>
                                                    </div>
                                                )}

                                                <div
                                                    onTouchStart={() => {
                                                        longPressTimerRef.current = window.setTimeout(() => {
                                                            copyMessageToClipboard(message);
                                                            enterSelectMode(message.id);
                                                        }, 500);
                                                    }}
                                                    onTouchEnd={() => {
                                                        if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
                                                    }}
                                                    onContextMenu={(e) => {
                                                        e.preventDefault();
                                                        copyMessageToClipboard(message);
                                                        enterSelectMode(message.id);
                                                    }}
                                                    className={`relative max-w-[80%] md:max-w-[68%] rounded-[1.1rem] px-3 py-2.5 border transition-all bg-black/60 border-white/10 text-white ${isSelected ? "ring-2 ring-red-400/50" : ""}`}
                                                >
                                                    {/* Reply-to quote */}
                                                    {replySource && (
                                                        <div className="mb-2 pl-2 border-l-2 border-white/30 opacity-60">
                                                            <div className="text-[8px] font-black uppercase tracking-widest text-white/50 mb-0.5">
                                                                {String(replySource.sender_id) === String(currentUser?.id) ? "You" : activeConversationDisplayName}
                                                            </div>
                                                            <div className="text-[9px] text-white/60 truncate">
                                                                {getReadableMessageText(replySource)}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {message.type === "text" && (
                                                        <>
                                                            <ChatRichText
                                                                text={message.text}
                                                                className="text-[10px] leading-relaxed break-words"
                                                            />
                                                            {(() => {
                                                                const urlMatch = (message.text || "").match(/(https?:\/\/[^\s]+|www\.[^\s]+)/i);
                                                                if (!urlMatch) return null;
                                                                const raw = urlMatch[0];
                                                                const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
                                                                let host = "", videoThumb: string | null = null;
                                                                try {
                                                                    const p = new URL(href);
                                                                    host = p.hostname.replace(/^www\./i, "");
                                                                    if (host === "youtu.be") {
                                                                        const id = p.pathname.split("/").filter(Boolean)[0];
                                                                        if (id) videoThumb = `https://img.youtube.com/vi/${id}/mqdefault.jpg`;
                                                                    } else if (host.endsWith("youtube.com")) {
                                                                        const id = p.searchParams.get("v") || (p.pathname.startsWith("/shorts/") ? p.pathname.split("/")[2] : null);
                                                                        if (id) videoThumb = `https://img.youtube.com/vi/${id}/mqdefault.jpg`;
                                                                    }
                                                                } catch { return null; }
                                                                return (
                                                                    <a
                                                                        href={href}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        onClick={(e) => e.stopPropagation()}
                                                                        className="mt-2 flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-2.5 py-2 hover:bg-white/10 transition-colors overflow-hidden"
                                                                    >
                                                                        {videoThumb ? (
                                                                            <div className="relative h-10 w-16 shrink-0 overflow-hidden rounded-lg bg-black/30">
                                                                                <Image src={videoThumb} alt={host} fill className="object-cover" loading="lazy" quality={50} />
                                                                                <span className="absolute inset-0 flex items-center justify-center">
                                                                                    <svg width="14" height="14" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="white"/></svg>
                                                                                </span>
                                                                            </div>
                                                                        ) : (
                                                                            <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/5">
                                                                                <Image src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`} alt={host} width={16} height={16} loading="lazy" quality={50} />
                                                                            </div>
                                                                        )}
                                                                        <div className="min-w-0 flex-1">
                                                                            <p className="truncate text-[9px] font-black uppercase tracking-widest text-white/70">{host}</p>
                                                                            <p className="truncate text-[8px] text-white/35">{href.length > 40 ? href.slice(0, 40) + "…" : href}</p>
                                                                        </div>
                                                                        <IonIcon name="open-outline" className="text-[11px] text-white/30 shrink-0" />
                                                                    </a>
                                                                );
                                                            })()}
                                                        </>
                                                    )}
                                                    {message.type === "voice_tts" && (() => {
                                                        const decoded = decodeTtsMessage(message.text);
                                                        return (
                                                            <div className="flex items-center gap-2.5">
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => { e.stopPropagation(); speakMessage(message.id, decoded.text, decoded.gender); }}
                                                                    aria-label={speakingMessageId === message.id ? "Stop voice message" : "Play voice message"}
                                                                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black border border-black/80 text-red-500 transition hover:bg-black/80 active:scale-90 shadow"
                                                                >
                                                                    <IonIcon name={speakingMessageId === message.id ? "pause" : "play"} className="text-base ml-0.5" />
                                                                </button>
                                                                <div className="min-w-0">
                                                                    <div className="text-[9px] font-black uppercase tracking-widest text-red-400">
                                                                        Voice message
                                                                    </div>
                                                                    <div className="mt-0.5 text-[8px] font-bold uppercase tracking-widest text-white/35">
                                                                        {decoded.gender} voice
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })()}
                                                    {message.type === "voice" && (
                                                        <div className="flex items-center gap-2.5 min-w-[160px]">
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    const audioEl = document.getElementById(`voice-audio-${message.id}`) as HTMLAudioElement | null;
                                                                    if (!audioEl) return;
                                                                    if (speakingMessageId === message.id) {
                                                                        audioEl.pause();
                                                                        setSpeakingMessageId(null);
                                                                    } else {
                                                                        document.querySelectorAll("audio[data-voice]").forEach((a) => (a as HTMLAudioElement).pause());
                                                                        setSpeakingMessageId(message.id);
                                                                        audioEl.play().catch(() => {});
                                                                        audioEl.onended = () => setSpeakingMessageId(null);
                                                                    }
                                                                }}
                                                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black border border-black/80 text-red-500 transition hover:bg-black/80 active:scale-90 shadow"
                                                            >
                                                                <IonIcon name={speakingMessageId === message.id ? "pause" : "play"} className="text-base ml-0.5" />
                                                            </button>
                                                            <audio
                                                                id={`voice-audio-${message.id}`}
                                                                data-voice
                                                                src={message.image_url}
                                                                preload="metadata"
                                                                className="hidden"
                                                            />
                                                            <div className="min-w-0">
                                                                <div className="text-[9px] font-black uppercase tracking-widest text-red-400">
                                                                    Voice message
                                                                </div>
                                                                <div className="mt-0.5 text-[8px] font-bold uppercase tracking-widest text-white/35">
                                                                    {speakingMessageId === message.id ? "Playing..." : "Tap to play"}
                                                                </div>
                                                            </div>
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
                                                            <IonIcon
                                                                name={message.call_status === "missed" ? "call-outline" : message.call_type === "video" ? "videocam-outline" : "call-outline"}
                                                                className={`text-sm ${message.call_status === "missed" ? "text-red-400" : ""}`}
                                                            />
                                                            <span className={message.call_status === "missed" ? "text-red-300" : ""}>{message.text}</span>
                                                        </div>
                                                    )}
                                                    {(message.type === "image" || message.type === "video") && (
                                                        <div className="chat-message-media relative w-40 max-w-full space-y-1.5 overflow-hidden">
                                                            {message.type === "video" ? (
                                                                <video
                                                                    src={message.image_url}
                                                                    controls
                                                                    playsInline
                                                                    className="block h-40 w-40 max-w-full shrink-0 rounded-xl border border-white/10 bg-black/40 object-cover"
                                                                />
                                                            ) : (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => { setImageViewerSrc(message.image_url); setImageViewerZoom(1); }}
                                                                    className="relative block h-40 w-40 max-w-full shrink-0 rounded-xl overflow-hidden bg-black/40 group cursor-zoom-in border border-white/10 hover:border-white/25 transition-all"
                                                                    title="Click to view full image"
                                                                >
                                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                    <img
                                                                        src={message.image_url}
                                                                        alt={message.file_name || "Chat image"}
                                                                        width={160}
                                                                        height={160}
                                                                        className="block h-40 w-40 max-w-full object-cover transition-transform group-hover:scale-105"
                                                                        style={{ width: "160px", height: "160px", maxWidth: "100%", objectFit: "cover" }}
                                                                        draggable={false}
                                                                    />
                                                                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                                                                        <IonIcon name="expand-outline" className="text-2xl text-white drop-shadow-lg" />
                                                                    </div>
                                                                </button>
                                                            )}
                                                            <a
                                                                href={message.image_url}
                                                                download={message.file_name || (message.type === "video" ? "chat-video" : "chat-image")}
                                                                title="Download"
                                                                className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/10 border border-white/15 text-white/60 hover:bg-white/20 hover:text-white transition-all"
                                                            >
                                                                <IonIcon name="download-outline" className="text-sm" />
                                                            </a>
                                                            {message.text && (
                                                                <ChatRichText
                                                                    text={message.text}
                                                                    className="pt-1 text-[10px] leading-relaxed break-words text-white/90"
                                                                />
                                                            )}
                                                            {message.status === "failed" && (
                                                                <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-red-500/30 bg-red-500/12 px-2.5 py-2">
                                                                    <div className="flex min-w-0 items-center gap-1.5 text-[8px] font-black uppercase tracking-widest text-red-200">
                                                                        <IonIcon name="alert-circle-outline" className="shrink-0 text-[12px]" />
                                                                        <span className="truncate">Upload failed</span>
                                                                    </div>
                                                                    <button
                                                                        type="button"
                                                                        onClick={(event) => {
                                                                            event.stopPropagation();
                                                                            retryFailedMediaMessage(message);
                                                                        }}
                                                                        className="shrink-0 rounded-lg border border-red-400/40 bg-red-500 px-2 py-1 text-[7px] font-black uppercase tracking-widest text-white"
                                                                    >
                                                                        Try Again
                                                                    </button>
                                                                </div>
                                                            )}
                                                            {message.status === "sending" && typeof message.media_upload_progress === "number" && (
                                                                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-xl bg-black/70 backdrop-blur-[2px]">
                                                                    <svg className="h-12 w-12 -rotate-90" viewBox="0 0 36 36">
                                                                        <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="3" />
                                                                        <circle
                                                                            cx="18"
                                                                            cy="18"
                                                                            r="14"
                                                                            fill="none"
                                                                            stroke="#fff"
                                                                            strokeWidth="3"
                                                                            strokeDasharray={`${(Math.max(0, Math.min(100, message.media_upload_progress)) / 100) * 87.96} 87.96`}
                                                                            strokeLinecap="round"
                                                                        />
                                                                    </svg>
                                                                    <div className="mt-1 flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-white">
                                                                        <IonIcon name="time-outline" className="text-[10px]" />
                                                                        Sending {Math.round(message.media_upload_progress)}%
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* Time + 3-dot status row */}
                                                    <div className="mt-2 flex items-center gap-1.5 opacity-70">
                                                        <span className="text-[7px] font-black uppercase tracking-widest opacity-50">
                                                            {formatMessageTime(message.created_at)}
                                                        </span>
                                                        {isMine && message.type !== "call" && message.type !== "call_record" && (
                                                            message.status === "failed" ? (
                                                                <span title="Upload failed" className="inline-flex items-center justify-center text-red-300">
                                                                    <IonIcon name="alert-circle-outline" className="text-[11px]" />
                                                                </span>
                                                            ) : messageStatus === "sending" ? (
                                                                <span title="Sending" className="inline-flex items-center justify-center">
                                                                    <IonIcon name="time-outline" className="text-[10px] text-white/60" />
                                                                </span>
                                                            ) : (
                                                                <MessageStatusRing status={messageStatus} size="list" />
                                                            )
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                        });
                                        return elements;
                                    })()
                                ) : (
                                    <div className="h-full flex items-center justify-center text-center">
                                        <div>
                                            <IonIcon name="chatbubble-ellipses-outline" className="text-4xl text-white/15 mb-3" />
                                            <p className="text-[10px] font-black text-white/25 uppercase tracking-widest">
                                                Start chatting with {activeConversationDisplayName}
                                            </p>
                                        </div>
                                    </div>
                                )}
                                <div ref={messagesEndRef} className="h-px" />
                            </div>

                            {/* Select mode bottom bar */}
                            {selectMode && (
                                <div className="flex items-center justify-between border-t border-white/10 bg-[#0d0d10]/95 backdrop-blur-md px-4 py-2.5 z-30">
                                    <span className="text-[9px] font-black uppercase tracking-widest text-white/60">
                                        {selectedMessages.size} selected
                                    </span>
                                    <div className="flex items-center gap-2">
                                        {selectedMessages.size > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const ids = [...selectedMessages];
                                                    setPendingDeleteMessageIds(ids);
                                                    setPendingDeleteIsMine(ids.every(id => {
                                                        const m = visibleMessages.find((msg: any) => String(msg.id) === String(id));
                                                        return m && String(m.sender_id) === String(currentUser?.id);
                                                    }));
                                                }}
                                                className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 border border-red-500/25 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-red-400 hover:bg-red-500/25 transition-all"
                                            >
                                                <IonIcon name="trash-outline" className="text-[10px]" />
                                                Delete {selectedMessages.size > 1 ? `(${selectedMessages.size})` : ""}
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={exitSelectMode}
                                            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-white/40 hover:bg-white/10 hover:text-white/70 transition-all"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}
                            <div className="p-2 md:p-3 border-t border-white/10 bg-white/[0.02]">
                                <input
                                    ref={chatImageInputRef}
                                    type="file"
                                    accept="image/*,video/*"
                                    multiple
                                    className="hidden"
                                    onChange={handleSelectImages}
                                />
                                {/* Reply-to banner */}
                                {replyTo && (
                                    <div className="mb-2 flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2">
                                        <div className="w-0.5 self-stretch rounded-full bg-blue-400/60 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[8px] font-black uppercase tracking-widest text-blue-300 mb-0.5">
                                                Replying to {String(replyTo.sender_id) === String(currentUser?.id) ? "yourself" : activeConversation?.name}
                                            </div>
                                            <div className="text-[9px] text-white/55 truncate">
                                                {getReadableMessageText(replyTo)}
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setReplyTo(null)}
                                            className="text-white/30 hover:text-white/70 shrink-0"
                                        >
                                            <IonIcon name="close-outline" className="text-sm" />
                                        </button>
                                    </div>
                                )}

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
                                {ttsSettingsOpen && features.text_to_voice && ttsEnabled && (
                                    <div className="mb-2 rounded-2xl border border-white/10 bg-[#0f1115] p-2">
                                        <div className="mb-2 flex items-center justify-between">
                                            <span className="text-[9px] font-black uppercase tracking-widest text-white/45">Text voice</span>
                                            <button
                                                type="button"
                                                onClick={() => setTtsSettingsOpen(false)}
                                                aria-label="Close text voice settings"
                                                className="rounded-lg bg-white/5 px-2 py-1 text-white/50 hover:bg-white/10"
                                            >
                                                <IonIcon name="close-outline" className="text-xs" />
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            {(["female", "male"] as const).map((gender) => (
                                                <button
                                                    key={gender}
                                                    type="button"
                                                    onClick={() => {
                                                        setTtsVoiceGender(gender);
                                                        setTtsSettingsOpen(false);
                                                    }}
                                                    className={`rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-widest transition ${
                                                        ttsVoiceGender === gender
                                                            ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-200"
                                                            : "border-white/10 bg-white/5 text-white/50 hover:bg-white/10"
                                                    }`}
                                                >
                                                    {gender === "female" ? "Female voice" : "Male voice"}
                                                </button>
                                            ))}
                                        </div>
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
                                {(recordingState !== "idle" || isListening) && (
                                    <div className="mb-2 flex items-center gap-2 rounded-2xl border border-red-500/20 bg-[#121010] px-3 py-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (isListening) {
                                                    // Stop STT and clear the typed speech text
                                                    stopSpeechToText(true);
                                                } else {
                                                    resetVoiceRecording();
                                                }
                                            }}
                                            className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500/10 text-red-300 hover:bg-red-500/20"
                                            title="Delete recording"
                                        >
                                            <IonIcon name="trash-outline" className="text-sm" />
                                        </button>
                                        <div className="flex min-w-0 flex-1 items-center gap-3">
                                            <div className={`flex h-11 w-11 items-center justify-center rounded-full bg-red-600 text-white shadow-lg shadow-red-600/20 ${isListening ? "animate-pulse" : ""}`}>
                                                <IonIcon name={isListening ? "mic" : recordingState === "paused" ? "play-outline" : "pause-outline"} className="text-lg" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="text-[8px] font-black uppercase tracking-widest text-red-200">
                                                    {isListening ? "Listening..." : recordingState === "sending" ? "Voice sending" : recordingState === "ready" ? "Voice ready" : "Recording"}
                                                </div>
                                                <div className="text-sm font-black text-white">{formatRecordingTime(recordingSeconds)}</div>
                                                {recordingUrl && (
                                                    <audio src={recordingUrl} controls className="mt-1 h-7 w-full max-w-[220px]" />
                                                )}
                                            </div>
                                        </div>
                                        {!isListening && (recordingState === "recording" || recordingState === "paused") && (
                                            <button
                                                type="button"
                                                onClick={pauseOrResumeVoiceRecording}
                                                className="flex h-9 w-9 items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-500"
                                                title={recordingState === "paused" ? "Play" : "Pause"}
                                            >
                                                <IonIcon name={recordingState === "paused" ? "play-outline" : "pause-outline"} className="text-base" />
                                            </button>
                                        )}
                                        {isListening && (
                                            <button
                                                type="button"
                                                onClick={() => stopSpeechToText()}
                                                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
                                                title="Pause — keep text, send as normal message"
                                            >
                                                <IonIcon name="pause-outline" className="text-base" />
                                            </button>
                                        )}
                                        {isListening && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    sttSendAsTtsRef.current = ttsEnabled;
                                                    stopSpeechToText();
                                                    window.setTimeout(handleSendMessage, 50);
                                                }}
                                                className="flex h-9 w-9 items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-500"
                                                title="Send as voice message"
                                            >
                                                <IonIcon name="send-outline" className="text-base" />
                                            </button>
                                        )}
                                        {!isListening && recordingState !== "ready" && recordingState !== "sending" && (
                                            <button
                                                type="button"
                                                onClick={finishVoiceRecording}
                                                className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-black hover:bg-zinc-200"
                                                title="Done"
                                            >
                                                <IonIcon name="checkmark-outline" className="text-base" />
                                            </button>
                                        )}
                                        {!isListening && recordingState === "ready" && (
                                            <button
                                                type="button"
                                                onClick={sendVoiceRecording}
                                                className="flex h-9 w-9 items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-500"
                                                title="Send voice"
                                            >
                                                <IonIcon name="send-outline" className="text-base" />
                                            </button>
                                        )}
                                    </div>
                                )}
                                {/* Main composer row — hidden while recording (but shown while listening so text appears) */}
                                {recordingState === "idle" && (
                                <div className="flex items-end gap-2">
                                    {!isListening && (
                                        <>
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
                                        </>
                                    )}
                                    <div className="flex-1 rounded-[1rem] bg-white/5 border border-white/10 px-3 py-2">
                                        <style>{`.chat-editable:empty:before{content:attr(data-placeholder);color:rgba(255,255,255,0.2);pointer-events:none;display:block}`}</style>
                                        <div
                                            ref={contentEditableRef}
                                            contentEditable
                                            suppressContentEditableWarning
                                            data-placeholder={`Message ${activeConversationDisplayName || "..."}`}
                                            onInput={(e) => {
                                                setComposerMode("typed");
                                                setMessageInput((e.currentTarget as HTMLDivElement).textContent || "");
                                                handleTypingInput();
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter" && !e.shiftKey) {
                                                    e.preventDefault();
                                                    handleSendMessage();
                                                }
                                            }}
                                            style={activeTypingColor ? { color: activeTypingColor } : undefined}
                                            className="chat-editable w-full bg-transparent outline-none text-[10px] leading-5 text-white max-h-24 overflow-y-auto"
                                        />
                                        {/* ── Attachment preview strip (image BELOW typed text) ── */}
                                        {(pendingAttachments.length > 0 || (isUploadingAttachments && mediaUploadProgress !== null)) && (
                                            <div className="mt-2 pt-2 border-t border-white/8">
                                                {/* thumbnails */}
                                                {pendingAttachments.length > 0 && (
                                                    <div className="flex gap-2 overflow-x-auto">
                                                        {pendingAttachments.map((attachment) => (
                                                            <div key={attachment.id} className="relative w-16 h-16 rounded-xl overflow-hidden border border-white/15 bg-black/40 shrink-0">
                                                                {attachment.media_type === "video"
                                                                    ? <video src={attachment.image_url} className="h-full w-full object-cover" muted playsInline />
                                                                    // eslint-disable-next-line @next/next/no-img-element
                                                                    : <img src={attachment.image_url} alt={attachment.file_name || "img"} width={64} height={64} className="block h-full w-full object-cover" draggable={false} />
                                                                }
                                                                {mediaUploadProgress !== null ? (
                                                                    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center">
                                                                        <svg className="w-9 h-9 -rotate-90" viewBox="0 0 36 36">
                                                                            <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3"/>
                                                                            <circle cx="18" cy="18" r="14" fill="none" stroke="#fff" strokeWidth="3"
                                                                                strokeDasharray={`${(mediaUploadProgress/100)*87.96} 87.96`} strokeLinecap="round"/>
                                                                        </svg>
                                                                        <span className="text-[7px] font-black text-white mt-0.5">{mediaUploadProgress}%</span>
                                                                    </div>
                                                                ) : (
                                                                    <button type="button"
                                                                        onClick={() => setPendingAttachments((prev) => prev.filter((i) => String(i.id) !== String(attachment.id)))}
                                                                        className="absolute top-1 right-1 w-4 h-4 rounded-full bg-black/70 text-white flex items-center justify-center">
                                                                        <IonIcon name="close-outline" className="text-[10px]" />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                {/* processing spinner (before file added to list) */}
                                                {isUploadingAttachments && mediaUploadProgress !== null && pendingAttachments.length === 0 && (
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-16 h-16 rounded-xl border border-white/15 bg-black/40 flex flex-col items-center justify-center shrink-0">
                                                            <svg className="w-9 h-9 -rotate-90" viewBox="0 0 36 36">
                                                                <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3"/>
                                                                <circle cx="18" cy="18" r="14" fill="none" stroke="#fff" strokeWidth="3"
                                                                    strokeDasharray={`${(mediaUploadProgress/100)*87.96} 87.96`} strokeLinecap="round"/>
                                                            </svg>
                                                            <span className="text-[7px] font-black text-white/60 mt-0.5">{mediaUploadProgress}%</span>
                                                        </div>
                                                        <span className="text-[9px] font-bold text-white/40">Processing…</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    {/* Dynamic Send / Mic — WhatsApp style */}
                                    {(messageInput.trim() || pendingAttachments.length > 0 || isListening) ? (
                                        <button
                                            type="button"
                                            onClick={isListening ? () => { sttSendAsTtsRef.current = ttsEnabled; stopSpeechToText(); window.setTimeout(handleSendMessage, 50); } : handleSendMessage}
                                            className="w-10 h-10 rounded-full bg-red-600 hover:bg-red-500 text-white transition-all shrink-0 flex items-center justify-center shadow-lg shadow-red-600/30"
                                        >
                                            <IonIcon name="send" className="text-base ml-0.5" />
                                        </button>
                                    ) : (
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            {/* TTS toggle tick button — red */}
                                            <button
                                                type="button"
                                                onMouseDown={beginTtsLongPress}
                                                onMouseUp={endTtsLongPress}
                                                onMouseLeave={endTtsLongPress}
                                                onTouchStart={beginTtsLongPress}
                                                onTouchEnd={endTtsLongPress}
                                                onClick={toggleTtsEnabled}
                                                aria-label={ttsEnabled ? "Voice to text on" : "Voice to text off"}
                                                title="Tap: toggle voice-to-text. Long press: choose voice."
                                                className={`w-8 h-8 rounded-xl border transition-all flex items-center justify-center ${
                                                    ttsEnabled
                                                        ? "bg-red-500/20 border-red-400/40 text-red-300"
                                                        : "bg-white/5 hover:bg-white/10 text-white/35 border-white/10"
                                                }`}
                                            >
                                                <IonIcon name={ttsEnabled ? "checkmark-circle" : "ellipse-outline"} className="text-base" />
                                            </button>
                                            {/* Mic button — tap to start/stop voice-to-text */}
                                            <button
                                                type="button"
                                                onClick={handleMicClick}
                                                aria-label="Voice to text"
                                                title="Tap to speak — your words will type automatically"
                                                className={`w-10 h-10 rounded-full border transition-all flex items-center justify-center shadow ${
                                                    isListening
                                                        ? "bg-red-600 border-red-500 text-white animate-pulse"
                                                        : "bg-white/8 hover:bg-white/15 border-white/15 text-white/70"
                                                }`}
                                            >
                                                <IonIcon name={isListening ? "mic" : "mic-outline"} className="text-lg" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                                )}
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
                                    onClick={() => {
                                        mobileBackPressedRef.current = true;
                                        preferredParticipantIdRef.current = "";
                                        preferredConversationKeyRef.current = "";
                                        activeConversationRef.current = null;
                                        frozenConvOrderRef.current = []; // unfreeze list
                                        setActiveConversation(null);
                                        setShowMobileChat(false);
                                        const mobileViewKey = getChatMobileViewKey(currentUser?.id);
                                        if (mobileViewKey) { try { window.localStorage.setItem(mobileViewKey, "list"); } catch { } }
                                    }}
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

        {deleteConversationTarget && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
                <div className="w-full max-w-xs overflow-hidden rounded-3xl border border-white/10 bg-[#101014] shadow-2xl">
                    <div className="border-b border-white/10 px-5 py-4">
                        <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-red-500/25 bg-red-500/15">
                                <IonIcon name="trash-outline" className="text-base text-red-400" />
                            </div>
                            <div className="min-w-0">
                                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white">
                                    Delete Chat?
                                </div>
                                <div className="mt-1 truncate text-[9px] font-bold text-white/40">
                                    {deleteConversationTarget.participant?.name || "This conversation"}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="p-4">
                        <p className="mb-4 text-[9px] font-bold leading-relaxed text-white/45">
                            This removes the chat from your list on this device.
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setDeleteConversationTarget(null)}
                                className="h-11 rounded-2xl border border-white/10 bg-white/[0.04] text-[9px] font-black uppercase tracking-widest text-white/60 transition-all hover:bg-white/[0.08]"
                            >
                                No
                            </button>
                            <button
                                type="button"
                                onClick={confirmDeleteConversation}
                                className="h-11 rounded-2xl border border-red-500/30 bg-red-600 text-[9px] font-black uppercase tracking-widest text-white transition-all hover:bg-red-500"
                            >
                                Yes
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* ── Block confirm dialog ── */}
        {blockTarget && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
                <div className="w-full max-w-xs overflow-hidden rounded-3xl border border-white/10 bg-[#101014] shadow-2xl">
                    <div className="border-b border-white/10 px-5 py-4">
                        <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-orange-500/25 bg-orange-500/15">
                                <IonIcon name="ban-outline" className="text-base text-orange-400" />
                            </div>
                            <div className="min-w-0">
                                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white">Block User?</div>
                                <div className="mt-1 truncate text-[9px] font-bold text-white/40">
                                    {blockTarget.participant?.name || "This user"}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="px-5 py-3">
                        <p className="text-[9px] text-white/40 font-bold leading-relaxed mb-4">
                            Blocking will delete all messages and call history with this user. They cannot message you until unblocked. They will not appear in your search results.
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                            <button type="button" onClick={() => setBlockTarget(null)}
                                className="h-11 rounded-2xl border border-white/10 bg-white/[0.04] text-[9px] font-black uppercase tracking-widest text-white/60 transition-all hover:bg-white/[0.08]">
                                Cancel
                            </button>
                            <button type="button" onClick={confirmBlock}
                                className="h-11 rounded-2xl border border-orange-500/30 bg-orange-600 text-[9px] font-black uppercase tracking-widest text-white transition-all hover:bg-orange-500">
                                Block
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* ── Blocked Users panel ── */}
        {showBlockedPanel && (
            <div className="fixed inset-0 z-[71] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
                <div className="w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-[#101014] shadow-2xl">
                    <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                        <div className="flex items-center gap-2">
                            <IonIcon name="ban-outline" className="text-base text-orange-400" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-white">Blocked Users</span>
                        </div>
                        <button type="button" onClick={() => setShowBlockedPanel(false)}
                            className="text-white/40 hover:text-white transition-colors">
                            <IonIcon name="close-outline" className="text-xl" />
                        </button>
                    </div>
                    <div className="max-h-[60vh] overflow-y-auto">
                        {blockedUsers.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-center">
                                <IonIcon name="checkmark-circle-outline" className="text-4xl text-white/15 mb-3" />
                                <p className="text-[9px] font-black uppercase tracking-widest text-white/25">No blocked users</p>
                            </div>
                        ) : (
                            <div className="p-3 space-y-2">
                                {blockedUsers.map((user: any) => (
                                    <div key={user.id} className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
                                        <div className="relative w-9 h-9 rounded-full overflow-hidden bg-white/5 border border-white/10 shrink-0">
                                            <Image src={getProfileImageSrc(user.profile_picture, getUserDisplayName(user, "User"))} alt={getUserDisplayName(user, "User")} fill className="object-cover"
                                                onError={handleChatAvatarError} />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex min-w-0 items-center gap-1">
                                                <div className="text-[9px] font-black text-white uppercase tracking-widest truncate">{getUserDisplayName(user, "User")}</div>
                                                {user.id && <UserVerifiedBadge userId={user.id} size={10} />}
                                            </div>
                                            {user.username && <div className="text-[8px] text-white/35 font-bold truncate">@{user.username}</div>}
                                        </div>
                                        <button type="button"
                                            onClick={() => handleUnblock(user.id)}
                                            className="shrink-0 rounded-xl border border-green-500/30 bg-green-500/10 px-2.5 py-1.5 text-[8px] font-black uppercase tracking-widest text-green-400 hover:bg-green-500/20 transition-all">
                                            Unblock
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}

        {/* ── Chat Ad: Interaction bottom sheet (Likes / Comments / Shares / Views) ── */}
        {videoCutPrompt && (
            <div className="fixed inset-0 z-[74] flex items-end justify-center bg-black/65 p-3 backdrop-blur-sm md:hidden">
                <div className="w-full max-w-sm overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#101014] shadow-2xl">
                    <div className="border-b border-white/10 px-5 py-4">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-red-500/25 bg-red-500/15">
                                <IonIcon name="cut-outline" className="text-lg text-red-300" />
                            </div>
                            <div className="min-w-0">
                                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white">
                                    Cut Video?
                                </div>
                                <div className="mt-1 truncate text-[9px] font-bold text-white/40">
                                    {videoCutPrompt.fileName}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="p-4">
                        <div className="relative mb-4 h-44 w-full overflow-hidden rounded-2xl border border-white/10 bg-black">
                            <video
                                ref={videoTrimPreviewRef}
                                src={videoCutPrompt.previewUrl}
                                playsInline
                                preload="metadata"
                                onLoadedMetadata={(event) => {
                                    const video = event.currentTarget;
                                    const duration = video.duration;
                                    if (!Number.isFinite(duration) || duration <= 0) return;
                                    setVideoCutPrompt((prev) => prev
                                        ? {
                                            ...prev,
                                            duration,
                                            startSec: Math.min(prev.startSec, Math.max(0, duration - 1)),
                                            endSec: Math.min(duration, Math.max(1, Math.min(prev.endSec || CHAT_VIDEO_MAX_DURATION_SECS, CHAT_VIDEO_MAX_DURATION_SECS))),
                                        }
                                        : prev
                                    );
                                    video.currentTime = videoCutPrompt.startSec;
                                }}
                                onTimeUpdate={(event) => {
                                    const video = event.currentTarget;
                                    if (!videoCutPrompt) return;
                                    if (video.currentTime < videoCutPrompt.startSec) {
                                        video.currentTime = videoCutPrompt.startSec;
                                    }
                                    if (video.currentTime >= videoCutPrompt.endSec) {
                                        video.pause();
                                        video.currentTime = videoCutPrompt.startSec;
                                        setTrimPreviewPlaying(false);
                                    }
                                }}
                                onPause={() => setTrimPreviewPlaying(false)}
                                onPlay={() => setTrimPreviewPlaying(true)}
                                className="h-full w-full object-contain"
                            />
                            <div className="absolute left-3 top-3 rounded-full bg-black/70 px-2 py-1 text-[8px] font-black uppercase tracking-widest text-white/70">
                                Output {formatVideoDuration(videoCutPrompt.endSec - videoCutPrompt.startSec)}
                            </div>
                            <button
                                type="button"
                                onClick={toggleTrimPreviewPlayback}
                                className="absolute inset-0 m-auto flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-black/70 text-white shadow-xl"
                            >
                                <IonIcon name={trimPreviewPlaying ? "pause" : "play"} className="text-xl" />
                            </button>
                        </div>
                        <p className="mb-3 text-[9px] font-bold leading-relaxed text-white/50">
                            Drag to choose the part to send. Max clip length is {formatVideoDuration(CHAT_VIDEO_MAX_DURATION_SECS)}.
                        </p>
                        <div className="mb-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                            <div className="mb-2 flex items-center justify-between text-[8px] font-black uppercase tracking-widest text-white/45">
                                <span>Start {formatVideoDuration(videoCutPrompt.startSec)}</span>
                                <span>End {formatVideoDuration(videoCutPrompt.endSec)}</span>
                            </div>
                            <div
                                className="relative h-16 select-none overflow-hidden rounded-xl border border-white/15 bg-black touch-none"
                                onPointerDown={(event) => {
                                    const duration = videoCutPrompt.duration || CHAT_VIDEO_MAX_DURATION_SECS;
                                    const rect = event.currentTarget.getBoundingClientRect();
                                    const sec = ((event.clientX - rect.left) / Math.max(1, rect.width)) * duration;
                                    const startDistance = Math.abs(sec - videoCutPrompt.startSec);
                                    const endDistance = Math.abs(sec - videoCutPrompt.endSec);
                                    const handle = startDistance <= endDistance ? "start" : "end";
                                    updateVideoTrimFromPointer(event, handle);
                                    const target = event.currentTarget;
                                    target.setPointerCapture(event.pointerId);
                                    target.onpointermove = (moveEvent) => updateVideoTrimFromPointer(moveEvent as any, handle);
                                    target.onpointerup = () => {
                                        target.onpointermove = null;
                                        target.onpointerup = null;
                                    };
                                }}
                            >
                                <div className="absolute inset-0 grid grid-cols-10 gap-px opacity-80">
                                    {Array.from({ length: 10 }).map((_, index) => (
                                        <div key={index} className="bg-gradient-to-br from-zinc-300 via-zinc-500 to-zinc-800" />
                                    ))}
                                </div>
                                {(() => {
                                    const duration = videoCutPrompt.duration || CHAT_VIDEO_MAX_DURATION_SECS;
                                    const left = Math.max(0, Math.min(100, (videoCutPrompt.startSec / duration) * 100));
                                    const right = Math.max(0, Math.min(100, (videoCutPrompt.endSec / duration) * 100));
                                    return (
                                        <>
                                            <div className="absolute inset-y-0 bg-black/55" style={{ left: 0, width: `${left}%` }} />
                                            <div className="absolute inset-y-0 bg-black/55" style={{ left: `${right}%`, right: 0 }} />
                                            <div
                                                className="absolute inset-y-0 rounded-lg border-2 border-orange-400 bg-orange-400/10 shadow-[0_0_0_2px_rgba(0,0,0,.4)]"
                                                style={{ left: `${left}%`, width: `${Math.max(4, right - left)}%` }}
                                            />
                                            <div
                                                className="absolute top-1 bottom-1 w-5 -translate-x-1/2 rounded-lg border-2 border-orange-400 bg-black/85 shadow-lg"
                                                style={{ left: `${left}%` }}
                                            >
                                                <div className="mx-auto mt-2 h-8 w-0.5 rounded-full bg-orange-300" />
                                            </div>
                                            <div
                                                className="absolute top-1 bottom-1 w-5 -translate-x-1/2 rounded-lg border-2 border-orange-400 bg-black/85 shadow-lg"
                                                style={{ left: `${right}%` }}
                                            >
                                                <div className="mx-auto mt-2 h-8 w-0.5 rounded-full bg-orange-300" />
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>
                            <div className="mt-2 text-center text-[8px] font-black uppercase tracking-widest text-red-200">
                                Selected {formatVideoDuration(videoCutPrompt.endSec - videoCutPrompt.startSec)}
                            </div>
                        </div>
                        <div className="grid gap-2">
                            <button
                                type="button"
                                onClick={() => resolveVideoCutPrompt({
                                    action: "cut",
                                    startSec: videoCutPrompt.startSec,
                                    endSec: videoCutPrompt.endSec,
                                })}
                                className="h-12 rounded-2xl border border-red-500/30 bg-red-600 text-[9px] font-black uppercase tracking-widest text-white transition-all active:scale-[0.98]"
                            >
                                Trim & Send
                            </button>
                            <button
                                type="button"
                                onClick={() => resolveVideoCutPrompt({ action: "cancel" })}
                                className="h-12 rounded-2xl border border-white/10 bg-white/[0.05] text-[9px] font-black uppercase tracking-widest text-white/65 transition-all active:scale-[0.98]"
                            >
                                Don't Send
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {mediaLimitPopup && (
            <div className="fixed inset-0 z-[72] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
                <div className="w-full max-w-xs overflow-hidden rounded-3xl border border-white/10 bg-[#101014] shadow-2xl">
                    <div className="border-b border-white/10 px-5 py-4">
                        <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-amber-500/25 bg-amber-500/15">
                                <IonIcon name="images-outline" className="text-base text-amber-300" />
                            </div>
                            <div>
                                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white">
                                    Daily Limit Reached
                                </div>
                                <div className="mt-1 text-[9px] font-bold text-white/40">
                                    Renews after 24 hours
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="p-4">
                        <p className="mb-4 text-[9px] font-bold leading-relaxed text-white/45">
                            You can send 10 images or videos every 24 hours.
                        </p>
                        <button
                            type="button"
                            onClick={() => setMediaLimitPopup(false)}
                            className="h-11 w-full rounded-2xl border border-white/10 bg-white/[0.06] text-[9px] font-black uppercase tracking-widest text-white/70 transition-all hover:bg-white/[0.1]"
                        >
                            OK
                        </button>
                    </div>
                </div>
            </div>
        )}

        <InteractionBottomSheet
            isOpen={chatAdSheetOpen}
            onClose={() => {
                setChatAdSheetOpen(false);
                setChatAdSheetItem(null);
                setChatAdSheetData([]);
            }}
            type={chatAdSheetType}
            product={chatAdSheetItem}
            data={chatAdSheetData}
            onTabChange={(type) => {
                if (chatAdSheetItem) void openChatAdSheet(type, chatAdSheetItem);
            }}
            onAddComment={addChatAdComment}
            onDeleteComment={(commentId) => deleteChatAdComment(commentId)}
            onLikeComment={async (commentId) => {
                try { await marketService.likeComment(Number(commentId)); } catch {}
            }}
            onDislikeComment={async (commentId) => {
                try { await marketService.dislikeComment(Number(commentId)); } catch {}
            }}
            onReportComment={async (commentId) => {
                try { await marketService.reportComment(Number(commentId)); } catch {}
            }}
            onRefresh={async () => {
                if (!chatAdSheetItem || chatAdSheetType !== "comments") return;
                try {
                    const data = await marketService.getComments(chatAdSheetItem.id);
                    setChatAdSheetData(data || []);
                } catch {}
            }}
            onAction={(action) => {
                if (!chatAdSheetItem) return;
                if (action === "star") void chatAdActions.like(chatAdSheetItem);
                if (action === "share" || action === "forward" || action === "upload") {
                    setChatAdShareItem(chatAdSheetItem);
                    setChatAdShareOpen(true);
                }
            }}
            currentUser={currentUser}
            isLoading={chatAdSheetLoading}
        />

        {/* ── Chat Ad: Share modal ── */}
        <ShareModal
            isOpen={chatAdShareOpen}
            onClose={() => setChatAdShareOpen(false)}
            title={chatAdShareItem?.title || chatAdShareItem?.caption || "Sponsored post"}
            url={chatAdShareItem ? getShareUrlForItem(chatAdShareItem, chatAdShareItem?.campaign_type === "Product Promote" ? "product" : "ad") : ""}
            description={chatAdShareItem?.description || `Sponsored by ${chatAdShareItem?.username || chatAdShareItem?.owner_username || "Advertiser"}`}
            product={chatAdShareItem ? { ...chatAdShareItem, is_sponsored: true } : null}
            initialView="share"
            onCopyLink={handleChatAdCopyLink}
        />

        {chatProductAdModal && (
            <ShopProductSecondViewModal
                product={chatProductAdModal}
                activeTab="market"
                currentUser={currentUser}
                onClose={() => setChatProductAdModal(null)}
                onNavigateToProfile={(event, product) => handleChatAdNavigateToProfile(event, product)}
                showSubscribeForProduct={(product) => String(currentUser?.id || "") !== String(product.user_id || "")}
                getSellerId={(product) => String(product.user_id || "")}
                onSubscribeSeller={(event, product) => handleChatAdNavigateToProfile(event, product)}
                onToggleLike={(target) => chatAdActions.like(target)}
                onLogView={(id) => handleChatAdLogView({ ...chatProductAdModal, id })}
                onOpenSheet={(type) => void openChatAdSheet(type, chatProductAdModal)}
                onShare={() => {
                    setChatAdShareItem(chatProductAdModal);
                    setChatAdShareOpen(true);
                }}
                onCollectCoin={handleChatAdCollectCoin}
                canShowCollectCoin={canShowChatAdCollectCoin}
            />
        )}

        {/* ── Chat Ad: Toast notification ── */}
        {chatAdNotification && (
            <div
                className={`fixed bottom-24 right-5 z-[200] flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-lg border px-3 py-2 shadow-2xl transition-all ${
                    chatAdNotification.type === "success"
                        ? "border-black/10 bg-white text-neutral-900"
                        : "border-red-200 bg-white text-red-700"
                }`}
            >
                <IonIcon
                    name={chatAdNotification.type === "success" ? "checkmark-circle-outline" : "alert-circle-outline"}
                    className={`shrink-0 text-base ${chatAdNotification.type === "success" ? "text-neutral-700" : "text-red-600"}`}
                />
                <span className="text-xs font-bold tracking-tight">{chatAdNotification.message}</span>
                <button
                    type="button"
                    onClick={() => setChatAdNotification(null)}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-neutral-500 transition hover:bg-black/5 hover:text-neutral-900"
                    aria-label="Dismiss coin notification"
                >
                    <IonIcon name="close" className="text-sm" />
                </button>
            </div>
        )}
        {copiedMessageNotice && (
            <div className="fixed bottom-6 left-1/2 z-[210] -translate-x-1/2 rounded-2xl border border-white/10 bg-[#101014]/95 px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-white/70 shadow-2xl backdrop-blur-md">
                {copiedMessageNotice}
            </div>
        )}
        </>
    );
}
