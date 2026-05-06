const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

const getAuthHeaders = () => {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    return {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
    };
};

const requestJson = async (path: string, options: RequestInit = {}) => {
    const response = await fetch(`${API_URL}${path}`, {
        cache: 'no-store',
        ...options,
        headers: {
            ...getAuthHeaders(),
            ...(options.headers || {}),
        },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Goog request failed');
    return data;
};

export const googService = {
    getPosts: async () => {
        const data = await requestJson('/googs');
        return data.data || [];
    },

    createPost: async (payload: { text: string; textColor: string }) => {
        const data = await requestJson('/googs', {
            method: 'POST',
            body: JSON.stringify(payload),
        });
        return data.data;
    },

    updatePost: async (id: number, payload: { text: string; textColor: string }) => {
        const data = await requestJson(`/googs/${id}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
        });
        return data.data;
    },

    deletePost: async (id: number) => {
        await requestJson(`/googs/${id}`, { method: 'DELETE' });
        return true;
    },

    toggleLike: async (id: number) => {
        const data = await requestJson(`/googs/${id}/like`, { method: 'POST' });
        return data.liked;
    },

    toggleSubscribe: async (id: number) => {
        const data = await requestJson(`/googs/${id}/subscribe`, { method: 'POST' });
        return data.subscribed;
    },

    checkSubscribe: async (id: number) => {
        const data = await requestJson(`/googs/${id}/subscribe`);
        return data.subscribed;
    },

    logShare: async (id: number) => {
        return requestJson(`/googs/${id}/share`, { method: 'POST' });
    },

    createReport: async (id: number, reason: string, custom_reason?: string) => {
        return requestJson(`/googs/${id}/report`, {
            method: 'POST',
            body: JSON.stringify({ reason, custom_reason }),
        });
    },

    addComment: async (id: number, text: string, parentId?: string | number) => {
        const data = await requestJson(`/googs/${id}/comments`, {
            method: 'POST',
            body: JSON.stringify({ text, parent_id: parentId }),
        });
        return data.data;
    },

    deleteComment: async (commentId: string | number) => {
        const normalizedId = String(commentId).replace('goog-comment-', '');
        return requestJson(`/googs/comments/${normalizedId}`, { method: 'DELETE' });
    },

    getComments: async (id: number) => {
        const data = await requestJson(`/googs/${id}/comments`);
        return data.data || [];
    },

    logView: async (id: number) => {
        return requestJson(`/googs/${id}/view`, { method: 'POST' });
    },

    getLikes: async (id: number) => {
        const data = await requestJson(`/googs/${id}/likes`);
        return data.data || [];
    },

    getShares: async (id: number) => {
        const data = await requestJson(`/googs/${id}/shares`);
        return data.data || [];
    },

    getViews: async (id: number) => {
        const data = await requestJson(`/googs/${id}/views`);
        return data.data || [];
    },

    getPost: async (id: number) => {
        const data = await requestJson(`/googs/${id}`);
        return data.data || data;
    },

    getPostPublic: async (id: number) => {
        try {
            const response = await fetch(`${API_URL}/googs/public/${id}`, {
                method: 'GET',
                cache: 'no-store',
            });
            const data = await response.json();
            if (!response.ok) return null;
            return data.data || data;
        } catch {
            return null;
        }
    },
    getUserPosts: async (userId: number | string) => {
        const data = await requestJson(`/googs/user/${userId}`);
        return data.data || [];
    },
};
