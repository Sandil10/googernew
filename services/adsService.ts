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
    },

    validatePromoCode: async (code: string, ad_type: string) => {
        const response = await fetch(`${API_URL}/promo-codes/validate`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ code, ad_type }),
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || 'Failed to validate promo code');
        return result as { valid: boolean; code: string; ad_type: string; discount_type: string; discount_value: number; reach_cap: number | null; min_reach_bonus?: number; max_reach_bonus?: number; promo_max_days?: number };
    },

    getReachTiersPublic: async (ad_type: string): Promise<Array<{
        id: number; ad_type: string;
        budget_from: string; budget_to: string;
        min_days: number; max_days: number;
        min_multiplier: string; max_multiplier: string;
        max_reach_multiplier: string | null;
    }>> => {
        const response = await fetch(`${API_URL}/admin/customization/reach-tiers/public?ad_type=${encodeURIComponent(ad_type)}`, {
            method: 'GET',
        });
        const result = await safeJson(response);
        if (!response.ok || !Array.isArray(result)) return [];
        return result;
    },

    getReachSettingsPublic: async (): Promise<Array<{ ad_type: string; min_multiplier: number; max_multiplier: number }>> => {
        const response = await fetch(`${API_URL}/admin/customization/reach-settings/public`, {
            method: 'GET',
        });
        const result = await safeJson(response);
        if (!response.ok || !Array.isArray(result)) return [];
        return result;
    },

    redeemPromoCode: async (code: string, ad_type: string, ad_id: string) => {
        const response = await fetch(`${API_URL}/promo-codes/redeem`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ code, ad_type, ad_id }),
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || 'Failed to redeem promo code');
        return result as { redeemed: boolean; code: string; discount_type: string; discount_value: number };
    },
};
