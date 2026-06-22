import { API_URL } from './apiConfig';

const safeJson = async (response: Response) => {
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
        return await response.json();
    }
    return null;
};

const getAuthHeaders = () => {
    const token = typeof window !== 'undefined'
        ? (window.sessionStorage.getItem('token') || window.localStorage.getItem('token'))
        : null;
    return {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
    };
};

const request = async (url: string, options: RequestInit = {}) => {
    const response = await fetch(`${API_URL}${url}`, {
        ...options,
        cache: 'no-store',
        headers: {
            ...getAuthHeaders(),
            'Cache-Control': 'no-cache',
            ...(options.headers || {}),
        },
    });

    const result = await safeJson(response);

    if (!response.ok) {
        throw new Error(result?.message || 'Chat request failed');
    }

    return result?.data;
};

export const chatService = {
    updatePresence: async (
        activeParticipantId?: number | null,
        activeProductStatusId?: string | null,
        activeTopupRequestId?: number | null,
    ) =>
        request('/chat/presence', {
            method: 'POST',
            body: JSON.stringify({
                activeParticipantId: activeParticipantId ?? null,
                activeProductStatusId: activeProductStatusId ?? null,
                activeTopupRequestId: activeTopupRequestId ?? null,
            }),
        }),

    getConversations: async () =>
        request('/chat/conversations'),

    getMessages: async (
        participantId: number,
        markSeen: boolean = false,
        productStatusId?: string | null,
        topupRequestId?: number | null,
        assignedAdminId?: number | null,
    ) =>
        request(
            `/chat/messages/${participantId}?markSeen=${markSeen ? '1' : '0'}`
            + `${productStatusId ? `&productStatusId=${encodeURIComponent(productStatusId)}` : ''}`
            + `${topupRequestId ? `&topupRequestId=${encodeURIComponent(String(topupRequestId))}` : ''}`
            + `${assignedAdminId ? `&assignedAdminId=${encodeURIComponent(String(assignedAdminId))}` : ''}`
        ),

    sendMessage: async (payload: {
        receiverId: number;
        type: 'text' | 'image' | 'video' | 'sticker' | 'voice_tts' | 'voice';
        text?: string;
        image_url?: string;
        file_name?: string;
        reply_to_id?: number | string;
        client_message_id?: string;
        productStatusId?: string;
        topupRequestId?: number;
        assignedAdminId?: number;
    }) =>
        request('/chat/messages', {
            method: 'POST',
            body: JSON.stringify(payload),
        }),

    getProductStatusAssignment: async (productStatusId: string) =>
        request(`/chat/product-status/${encodeURIComponent(productStatusId)}/assignment`),

    getTopupRequestAssignment: async (topupRequestId: number) =>
        request(`/chat/topup-request/${encodeURIComponent(String(topupRequestId))}/assignment`),

    assignProductStatusAdmin: async (productStatusId: string, assignedAdminId: number) =>
        request(`/chat/product-status/${encodeURIComponent(productStatusId)}/assignment`, {
            method: 'PUT',
            body: JSON.stringify({ assignedAdminId }),
        }),

    listAssignedProductStatusChats: async (assignedAdminId?: number | null) =>
        request(`/chat/product-status/assignments${assignedAdminId ? `?assignedAdminId=${assignedAdminId}` : ''}`),

    startCall: async (receiverId: number, callType: 'voice' | 'video', offer: any) =>
        request('/chat/calls/start', {
            method: 'POST',
            body: JSON.stringify({ receiverId, callType, offer }),
        }),

    getIncomingCalls: async () =>
        request('/chat/calls/incoming'),

    getCall: async (callId: number) =>
        request(`/chat/calls/${callId}`),

    acceptCall: async (callId: number, answer: any) =>
        request(`/chat/calls/${callId}/accept`, {
            method: 'POST',
            body: JSON.stringify({ answer }),
        }),

    rejectCall: async (callId: number) =>
        request(`/chat/calls/${callId}/reject`, {
            method: 'POST',
        }),

    completeCall: async (callId: number, status: 'completed' | 'missed' | 'rejected') =>
        request(`/chat/calls/${callId}/complete`, {
            method: 'POST',
            body: JSON.stringify({ status }),
        }),

    sendSignal: async (callId: number, receiverId: number, signalType: 'offer' | 'answer' | 'ice-candidate', payload: any) =>
        request(`/chat/calls/${callId}/signal`, {
            method: 'POST',
            body: JSON.stringify({ receiverId, signalType, payload }),
        }),

    getSignals: async (callId: number, since: number = 0) =>
        request(`/chat/calls/${callId}/signals?since=${since}`),

    getCallHistory: async (participantId: number) =>
        request(`/chat/calls/history/${participantId}`),

    getCallSummaries: async () =>
        request('/chat/calls/summaries'),

    sendTyping: async () =>
        request('/chat/typing', { method: 'POST' }),

    getTyping: async (participantId: number) =>
        request(`/chat/typing/${participantId}`),

    forwardMessage: async (payload: {
        receiverId: number;
        type: 'text' | 'image' | 'video' | 'sticker' | 'voice_tts' | 'voice';
        text?: string;
        image_url?: string;
        file_name?: string;
        client_message_id?: string;
    }) =>
        request('/chat/messages', {
            method: 'POST',
            body: JSON.stringify(payload),
        }),

    deleteMessages: async (messageIds: Array<number | string>, mode: 'me' | 'everyone' = 'me') =>
        request('/chat/messages', {
            method: 'DELETE',
            body: JSON.stringify({ messageIds, mode }),
        }),

    hideConversation: async (participantId: number) =>
        request('/chat/conversations/hide', {
            method: 'POST',
            body: JSON.stringify({ participantId }),
        }),

    deleteConversation: async (participantId: number) =>
        request(`/chat/conversations/${participantId}`, {
            method: 'DELETE',
        }),

    unhideConversation: async (participantId: number) =>
        request('/chat/conversations/unhide', {
            method: 'POST',
            body: JSON.stringify({ participantId }),
        }),

    blockUser: async (userId: number) =>
        request('/chat/block', {
            method: 'POST',
            body: JSON.stringify({ userId }),
        }),

    unblockUser: async (userId: number) =>
        request('/chat/unblock', {
            method: 'POST',
            body: JSON.stringify({ userId }),
        }),

    getBlockedUsers: async () =>
        request('/chat/blocked-users'),
};
