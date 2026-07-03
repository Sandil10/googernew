const isClient = typeof window !== 'undefined';
import { API_URL } from './apiConfig';

const storage = {
    get: (key: string) => {
        if (!isClient) return null;
        try { return sessionStorage.getItem(key) || localStorage.getItem(key); } catch { return null; }
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

const normalizeUploadControlSettings = (result: any) => {
    if (!result) return null;
    return {
        min_upload_price: Number(result.min_upload_price ?? 100),
        max_upload_price: Number(result.max_upload_price ?? 10000),
        flash_content_price: Number(result.flash_content_price ?? 100),
        flash_preview_seconds: Number(result.flash_preview_seconds ?? 5),
        flash_auto_play: Boolean(result.flash_auto_play ?? false),
        default_topic: String(result.default_topic || 'Technology'),
        default_content_access_mode: result.default_content_access_mode === 'blurred' ? 'blurred' as const : 'unblurred' as const,
        normal_user_video_limit_seconds: Number(result.normal_user_video_limit_seconds ?? 60),
        subscribed_user_video_limit_seconds: Number(result.subscribed_user_video_limit_seconds ?? 180),
        commission_tiers: Array.isArray(result.commission_tiers) ? result.commission_tiers : [],
        subscription_commission_tiers: Array.isArray(result.subscription_commission_tiers) ? result.subscription_commission_tiers : [],
    };
};

const getAdminPanelPublicApiUrl = () => {
    if (typeof window === 'undefined') return '';
    const explicitApiUrl = process.env.NEXT_PUBLIC_ADMIN_API_URL;
    if (explicitApiUrl) return explicitApiUrl.replace(/\/$/, '');

    const explicitPanelUrl = process.env.NEXT_PUBLIC_ADMIN_PANEL_URL;
    if (explicitPanelUrl) return `${explicitPanelUrl.replace(/\/$/, '')}/api`;

    const { protocol, hostname } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'http://localhost:3002/api';
    }
    if (hostname.startsWith('app.')) {
        return `${protocol}//${hostname.replace(/^app\./, 'appadmin.')}/api`;
    }
    return '';
};

const fetchUploadControlSettingsFromUrl = async (url: string) => {
    if (!url) return null;
    try {
        const response = await fetch(url, {
            method: 'GET',
            cache: 'no-store',
        });
        const result = await safeJson(response);
        if (!response.ok || !result) return null;
        return normalizeUploadControlSettings(result);
    } catch {
        return null;
    }
};

const fetchUploadControlSettings = (baseUrl: string) => (
    fetchUploadControlSettingsFromUrl(`${baseUrl}/admin/customization/upload-control/public`)
);

export const adsService = {
    getActiveAdsByUser: async (userId: string | number) => {
        const response = await fetch(`${API_URL}/ads/active-public?user_id=${encodeURIComponent(userId)}&limit=50`, {
            method: 'GET',
        });
        const result = await safeJson(response);
        return result?.ads || [];
    },

    toggleSave: async (adId: string | number): Promise<{ ok: boolean; saved: boolean; message?: string; limit?: number; mediaType?: string }> => {
        const response = await fetch(`${API_URL}/ads/${encodeURIComponent(String(adId))}/save`, {
            method: 'POST',
            headers: getHeaders(),
        });
        const data = await safeJson(response);
        if (!response.ok) {
            return {
                ok: false,
                saved: false,
                message: data?.message || 'Failed to save ad',
                limit: data?.limit,
                mediaType: data?.media_type,
            };
        }
        return { ok: true, saved: !!data?.saved, mediaType: data?.ad_media_type };
    },

    getSavedAdIds: async (): Promise<string[]> => {
        const response = await fetch(`${API_URL}/ads/saves/ids`, {
            method: 'GET',
            headers: getHeaders(),
        });
        const data = await safeJson(response);
        return data?.savedAdIds || [];
    },

    getSavedAds: async () => {
        const response = await fetch(`${API_URL}/ads/saves`, {
            method: 'GET',
            headers: getHeaders(),
        });
        const data = await safeJson(response);
        if (!response.ok) return [];
        return data?.ads || [];
    },

    getPublicSavedAdsByUser: async (userId: string | number) => {
        const response = await fetch(`${API_URL}/ads/saved-public/${encodeURIComponent(String(userId))}`, {
            method: 'GET',
        });
        const data = await safeJson(response);
        if (!response.ok) return [];
        return data?.ads || [];
    },

    getSavedAdCounts: async (): Promise<{ counts: { photo: number; video: number }; limits: { photo: number | null; video: number | null } } | null> => {
        const response = await fetch(`${API_URL}/ads/saves/counts`, {
            method: 'GET',
            headers: getHeaders(),
        });
        if (!response.ok) return null;
        const data = await safeJson(response);
        if (!data?.success) return null;
        return { counts: data.counts, limits: data.limits };
    },

    getMyAds: async () => {
        const response = await fetch(`${API_URL}/ads/my`, {
            method: 'GET',
            headers: getHeaders(),
            cache: 'no-store',
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
        const response = await fetch(`${API_URL}/ads/all?include_all=true`, {
            method: 'GET',
            headers: getHeaders(),
            cache: 'no-store',
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

    getUploadControlSettingsPublic: async (): Promise<{
        min_upload_price: number;
        max_upload_price: number;
        flash_content_price: number;
        flash_preview_seconds: number;
        flash_auto_play: boolean;
        default_topic: string;
        default_content_access_mode: 'blurred' | 'unblurred';
        normal_user_video_limit_seconds: number;
        subscribed_user_video_limit_seconds: number;
        commission_tiers?: Array<{ min: number; max: number; commission: number }>;
        subscription_commission_tiers?: Array<{ min: number; max: number; commission: number }>;
    } | null> => {
        const bridgeSettings = await fetchUploadControlSettingsFromUrl('/api/upload-control-settings');
        if (bridgeSettings) return bridgeSettings;

        const adminPanelUrl = getAdminPanelPublicApiUrl();
        const adminSettings = adminPanelUrl ? await fetchUploadControlSettings(adminPanelUrl) : null;
        if (adminSettings) return adminSettings;

        return fetchUploadControlSettings(API_URL);
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

    getAdAnalytics: async (adId: string) => {
        const response = await fetch(`${API_URL}/ads/${encodeURIComponent(adId)}/analytics`, {
            method: 'GET',
            headers: getHeaders(),
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || 'Failed to fetch analytics');
        return result?.analytics as AdAnalytics;
    },
};

export type AnalyticsBreakdown = { label: string; reach: number; impressions: number };
export type ClickBreakdown = { label: string; clicks: number };
export type LikeBreakdown = { label: string; likes: number };

export type AdAnalytics = {
    adId: string;
    totals: { views: number; reach: number; impressions: number; clicks: number; likes: number };
    byGender: AnalyticsBreakdown[];
    byCountry: AnalyticsBreakdown[];
    byAge: AnalyticsBreakdown[];
    byClickType: ClickBreakdown[];
    likesByGender: LikeBreakdown[];
    likesByCountry: LikeBreakdown[];
    clicksByGender: ClickBreakdown[];
    adTargeting: { gender: string; ageMin: number; ageMax: number; campaignType: string };
};
