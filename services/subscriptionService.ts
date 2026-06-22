import { API_URL } from './apiConfig';

const getToken = () => {
    if (typeof window === 'undefined') return null;
    try { return sessionStorage.getItem('token') || localStorage.getItem('token'); } catch { return null; }
};

const authHeaders = () => {
    const token = getToken();
    return {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
};

export type SubscriptionPlan = {
    id: number;
    slug: string;
    name: string;
    price: number | string;
    duration_days: number;
    badge_color: string;
    accent_color: string;
    googs_limit: number;
    verified_tick: boolean;
    features: string[];
    extra: Record<string, any>;
    billing_interval_label?: string;
    test_duration_minutes?: number | null;
    is_active?: boolean;
    sort_order?: number;
};

export type SubscriptionFeatures = {
    plan_slug: string;
    is_basic: boolean;
    verified_tick: boolean;
    badge_color: string | null;
    write_goog_limit: number | null;
    write_goog_color_limit: number | null;
    goog_letter_limit: number | null;
    product_upload_limit: number | null;
    video_ads_save_limit: number | null;
    photo_ads_save_limit: number | null;
    save_goog_limit: number | null;
    ads_expiry_days: number | null;
    free_profile_ad_promo: boolean;
    chat_text_colors: boolean;
    chat_stickers: boolean;
    text_messaging: boolean;
    voice_calls: boolean;
    video_calls: boolean;
    voice_to_text: boolean;
    text_to_voice: boolean;
    video_call_quality: string;
    chat_auto_delete_days: number | null;
    chat_auto_delete_value?: number | null;
    chat_auto_delete_unit?: 'minutes' | 'hours' | 'days' | 'lifetime' | string | null;
    extra: Record<string, any>;
};

export type UserSubscription = {
    id: number;
    user_id: number;
    plan_id: number;
    plan_slug: string;
    plan_name: string;
    price_paid: number | string;
    duration_days: number;
    status: 'active' | 'cancelled' | 'expired';
    started_at: string;
    expires_at: string | null;
    grace_ends_at?: string | null;
    in_grace_period?: boolean;
    cancelled_at: string | null;
    auto_renew: boolean;
};

export const subscriptionService = {
    getMySubscription: async (): Promise<UserSubscription | null> => {
        const res = await fetch(`${API_URL}/subscriptions/me`, { headers: authHeaders() });
        if (!res.ok) return null;
        const data = await res.json();
        return data.subscription || null;
    },
    subscribe: async (planId: number, options?: { switchPlan?: boolean }): Promise<{ subscription: UserSubscription } | { error: string; code?: number }> => {
        let res: Response;
        try {
            res = await fetch(`${API_URL}/subscriptions/subscribe`, {
                method: 'POST', headers: authHeaders(), body: JSON.stringify({ plan_id: planId, switch_plan: options?.switchPlan === true }),
            });
        } catch (e: any) {
            return { error: `Network error: ${e.message || 'could not reach server'}` };
        }
        let data: any = null;
        try { data = await res.json(); } catch { /* non-JSON response */ }
        if (!res.ok) {
            const reason = data?.message
                || (res.status === 404 ? 'API route not found — backend may need restart' : `Server returned ${res.status}`);
            return { error: reason, code: res.status };
        }
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('subscription:changed'));
        }
        return { subscription: data.subscription };
    },
    cancelMySubscription: async (): Promise<boolean> => {
        const res = await fetch(`${API_URL}/subscriptions/cancel`, { method: 'POST', headers: authHeaders() });
        if (res.ok && typeof window !== 'undefined') {
            window.dispatchEvent(new Event('subscription:changed'));
        }
        return res.ok;
    },
    setAutoRenew: async (autoRenew: boolean): Promise<UserSubscription | null> => {
        const res = await fetch(`${API_URL}/subscriptions/auto-renew`, {
            method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ auto_renew: autoRenew }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.subscription || null;
    },
    getPublicPlans: async (): Promise<SubscriptionPlan[]> => {
        const res = await fetch(`${API_URL}/admin/customization/subscription-plans/public`);
        if (!res.ok) throw new Error('Failed to load plans');
        const data = await res.json();
        return data.plans || [];
    },
    getAllPlans: async (): Promise<SubscriptionPlan[]> => {
        const res = await fetch(`${API_URL}/admin/customization/subscription-plans`, { headers: authHeaders() });
        if (!res.ok) throw new Error('Failed to load plans');
        const data = await res.json();
        return data.plans || [];
    },
    createPlan: async (plan: Partial<SubscriptionPlan>): Promise<SubscriptionPlan> => {
        const res = await fetch(`${API_URL}/admin/customization/subscription-plans`, {
            method: 'POST', headers: authHeaders(), body: JSON.stringify(plan),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to create plan');
        return data.plan;
    },
    updatePlan: async (id: number, plan: Partial<SubscriptionPlan>): Promise<SubscriptionPlan> => {
        const res = await fetch(`${API_URL}/admin/customization/subscription-plans/${id}`, {
            method: 'PUT', headers: authHeaders(), body: JSON.stringify(plan),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to update plan');
        return data.plan;
    },
    getMyUsage: async (): Promise<{
        googCount: number; productCount: number; savedGoogCount: number;
        savedPhotoAdCount?: number; savedVideoAdCount?: number;
        writeGoogLimit: number; googLetterLimit: number; productUploadLimit: number; saveGoogLimit: number;
        photoAdsSaveLimit?: number | null; videoAdsSaveLimit?: number | null;
        googAtLimit: boolean; productAtLimit: boolean;
    } | null> => {
        try {
            const res = await fetch(`${API_URL}/subscriptions/my-usage`, { headers: authHeaders() });
            if (!res.ok) return null;
            const data = await res.json();
            return data.usage || null;
        } catch {
            return null;
        }
    },

    getMyFeatures: async (): Promise<SubscriptionFeatures | null> => {
        try {
            const res = await fetch(`${API_URL}/subscriptions/features`, { headers: authHeaders() });
            if (!res.ok) return null;
            const data = await res.json();
            return data.features || null;
        } catch {
            return null;
        }
    },

    getMyPlan: async (): Promise<{ extra?: Record<string, any>; plan_slug?: string; slug?: string; price?: number | string; googs_limit?: number | string | null; is_basic?: boolean } | null> => {
        try {
            const res = await fetch(`${API_URL}/subscription-plans/my`, { headers: authHeaders() });
            if (!res.ok) return null;
            const data = await res.json();
            if (!data.data) return null;
            return { ...data.data, is_basic: !!data.is_basic };
        } catch {
            return null;
        }
    },

    getBadgeForUser: async (userId: number | string): Promise<{ color: string; tickColor?: string | null } | null> => {
        try {
            const res = await fetch(`${API_URL}/subscriptions/badge/${userId}`);
            if (!res.ok) return null;
            const data = await res.json();
            return data.badge || null;
        } catch {
            return null;
        }
    },

    deletePlan: async (id: number): Promise<void> => {
        const res = await fetch(`${API_URL}/admin/customization/subscription-plans/${id}`, {
            method: 'DELETE', headers: authHeaders(),
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.message || 'Failed to delete plan');
        }
    },
};
