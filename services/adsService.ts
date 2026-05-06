const isClient = typeof window !== 'undefined';
const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

const storage = {
    get: (key: string) => {
        if (!isClient) return null;
        try { return localStorage.getItem(key); } catch { return null; }
    }
};

const safeJson = async (response: Response) => {
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
        return await response.json();
    }
    return null;
};

const getHeaders = () => {
    const token = storage.get('token');
    return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
    };
};

export const adsService = {
    getMyAds: async () => {
        const response = await fetch(`${API_URL}/ads/my`, {
            method: 'GET',
            headers: getHeaders(),
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || 'Failed to fetch ads');
        return result?.ads || [];
    },

    getAdById: async (adId: string) => {
        const response = await fetch(`${API_URL}/ads/${encodeURIComponent(adId)}`, {
            method: 'GET',
            headers: getHeaders(),
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || 'Failed to fetch ad');
        return result?.ad;
    },

    createAd: async (payload: Record<string, unknown> | FormData) => {
        const isFormData = payload instanceof FormData;
        const headers: any = getHeaders();
        if (isFormData) {
            delete headers['Content-Type'];
        }

        const response = await fetch(`${API_URL}/ads`, {
            method: 'POST',
            headers: headers,
            body: isFormData ? payload : JSON.stringify(payload),
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || 'Failed to create ad');
        return result?.ad;
    },

    updateAd: async (adId: string, payload: Record<string, unknown> | FormData) => {
        const isFormData = payload instanceof FormData;
        const headers: any = getHeaders();
        if (isFormData) {
            delete headers['Content-Type'];
        }

        const response = await fetch(`${API_URL}/ads/${encodeURIComponent(adId)}`, {
            method: 'PUT',
            headers: headers,
            body: isFormData ? payload : JSON.stringify(payload),
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || 'Failed to update ad');
        return result?.ad;
    },

    getAllAds: async () => {
        const response = await fetch(`${API_URL}/ads/all`, {
            method: 'GET',
            headers: getHeaders(),
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || 'Failed to fetch all ads');
        return result?.ads || [];
    }
};
