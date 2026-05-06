const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

const safeJson = async (response: Response) => {
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
        return await response.json();
    }
    return null;
};

const getAuthHeaders = () => {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    return {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
    };
};

const request = async (url: string, options: RequestInit = {}) => {
    const response = await fetch(`${API_URL}${url}`, {
        ...options,
        headers: {
            ...getAuthHeaders(),
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
    updatePresence: async (activeParticipantId?: number | null) =>
        request('/chat/presence', {
            method: 'POST',
            body: JSON.stringify({ activeParticipantId: activeParticipantId ?? null }),
        }),

    getConversations: async () =>
        request('/chat/conversations'),

    getMessages: async (participantId: number, markSeen: boolean = false) =>
        request(`/chat/messages/${participantId}?markSeen=${markSeen ? '1' : '0'}`),

    sendMessage: async (payload: {
        receiverId: number;
        type: 'text' | 'image';
        text?: string;
        image_url?: string;
        file_name?: string;
    }) =>
        request('/chat/messages', {
            method: 'POST',
            body: JSON.stringify(payload),
        }),

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
};
