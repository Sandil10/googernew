import { API_URL } from './apiConfig';

const VIEWER_KEY_STORAGE_KEY = 'googer-viewer-key';

const getViewerKey = () => {
    if (typeof localStorage === 'undefined') return '';
    let value = localStorage.getItem(VIEWER_KEY_STORAGE_KEY);
    if (!value) {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            value = crypto.randomUUID();
        } else {
            value = `viewer-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
        }
        localStorage.setItem(VIEWER_KEY_STORAGE_KEY, value);
    }
    return value;
};

const getAuthHeaders = () => {
    const token = typeof window !== 'undefined' ? (window.sessionStorage.getItem('token') || window.localStorage.getItem('token')) : null;
    return {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
        'x-googer-viewer-key': getViewerKey(),
    };
};

const googRequestCache = new Map<string, { expiresAt: number; data: any }>();
const googRequestInflight = new Map<string, Promise<any>>();
const googLikeInflight = new Map<string, Promise<boolean>>();
const dedupeGoogRequest = async <T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> => {
    const cached = googRequestCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.data as T;
    }
    const inflight = googRequestInflight.get(key);
    if (inflight) {
        return inflight as Promise<T>;
    }
    const request = loader()
        .then((data) => {
            googRequestCache.set(key, { expiresAt: Date.now() + ttlMs, data });
            return data;
        })
        .finally(() => {
            googRequestInflight.delete(key);
        });
    googRequestInflight.set(key, request);
    return request;
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
    if (!response.ok) {
        const error = new Error(data.message || 'Goog request failed') as Error & { status?: number };
        error.status = response.status;
        throw error;
    }
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

    updatePost: async (id: any, payload: { text: string; textColor: string }) => {
        const cleanId = String(id).replace(/^(goog-|write-)/, "");
        const data = await requestJson(`/googs/${cleanId}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
        });
        return data.data;
    },

    deletePost: async (idOrPost: any) => {
        const rawId = typeof idOrPost === 'object' ? (idOrPost.id ?? idOrPost.goog_id) : idOrPost;
        if (!rawId) throw new Error('No post ID provided for deletion');

        const cleanId = String(rawId).replace(/^(goog-|write-)/, "");
        await requestJson(`/googs/${cleanId}`, { method: 'DELETE' });
        return true;
    },

    toggleLike: async (id: any) => {
        const cleanId = String(id).replace(/^(goog-|write-)/, "");
        const inflight = googLikeInflight.get(cleanId);
        if (inflight) {
            return inflight;
        }
        const request = requestJson(`/googs/${cleanId}/like`, { method: 'POST' })
            .then((data) => !!data.liked)
            .finally(() => {
                googLikeInflight.delete(cleanId);
            });
        googLikeInflight.set(cleanId, request);
        return request;
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
        return dedupeGoogRequest(`share:${id}`, 8000, () => requestJson(`/googs/${id}/share`, { method: 'POST' }));
    },

    createReport: async (id: number, reason: string, custom_reason?: string) => {
        return requestJson(`/googs/${id}/report`, {
            method: 'POST',
            body: JSON.stringify({ reason, custom_reason }),
        });
    },

    reportComment: async (commentId: number) => {
        return requestJson(`/googs/comments/${commentId}/report`, { method: 'POST' });
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
        return dedupeGoogRequest(`view:${id}`, 8000, () => requestJson(`/googs/${id}/view`, { method: 'POST' }));
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

    toggleSave: async (id: number): Promise<{ saved: boolean; message?: string }> => {
        const cleanId = String(id).replace(/^(goog-|write-)/, "");
        try {
            const data = await requestJson(`/googs/${cleanId}/save`, { method: 'POST' });
            return { saved: !!data.saved, message: data.message };
        } catch (e: any) {
            return { saved: false, message: e.message };
        }
    },

    getSavedGoogs: async () => {
        const data = await requestJson('/googs/saved');
        return data.data || [];
    },

    getSavedStatus: async (): Promise<number[]> => {
        try {
            const data = await requestJson('/googs/saved/status');
            return data.savedIds || [];
        } catch {
            return [];
        }
    },
};
