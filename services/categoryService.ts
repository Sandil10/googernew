import { authService } from "@/services/authService";

import { API_URL } from './apiConfig';
const CATEGORY_SYNC_KEY = "googer-categories-sync";

const safeJson = async (response: Response) => {
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
        return await response.json();
    }
    return null;
};

const getAuthHeaders = (): Record<string, string> => {
    const token = authService.getToken?.();
    return token ? { Authorization: `Bearer ${token}` } : {};
};

const buildHeaders = (includeAuth = false) => {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };

    if (includeAuth) {
        Object.assign(headers, getAuthHeaders());
    }

    return headers;
};

export const notifyCategoryTreeChanged = () => {
    if (typeof window === "undefined") return;
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
        window.dispatchEvent(new CustomEvent("googer-categories-updated", { detail: { token } }));
    } catch {
        // ignore
    }
    try {
        window.localStorage.setItem(CATEGORY_SYNC_KEY, token);
    } catch {
        // ignore
    }
};

export const categoryService = {
    getTree: async (includeInactive = false) => {
        const timestamp = Date.now();
        const response = await fetch(
            `${API_URL}/categories/tree?includeInactive=${includeInactive ? "1" : "0"}&t=${timestamp}`,
            {
                method: "GET",
                headers: buildHeaders(false),
                cache: "no-store",
            },
        );
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || "Failed to load categories");
        return result?.categories || [];
    },

    getAdminTree: async () => {
        const timestamp = Date.now();
        const response = await fetch(`${API_URL}/categories/admin/tree?t=${timestamp}`, {
            method: "GET",
            headers: buildHeaders(true),
            cache: "no-store",
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || "Failed to load admin categories");
        return result?.categories || [];
    },

    getGlobalCategoryCommission: async () => {
        const timestamp = Date.now();
        const response = await fetch(`${API_URL}/categories/commission/global?t=${timestamp}`, {
            method: "GET",
            headers: buildHeaders(false),
            cache: "no-store",
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || "Failed to load global category commission");
        return Number(result?.commissionPercentage ?? result?.setting_value ?? 0);
    },

    getManualCategoryCommissionEnabled: async () => {
        const timestamp = Date.now();
        const response = await fetch(`${API_URL}/categories/commission/manual-enabled?t=${timestamp}`, {
            method: "GET",
            headers: buildHeaders(false),
            cache: "no-store",
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || "Failed to load manual category commission setting");
        return Boolean(result?.enabled ?? result?.setting_value);
    },

    setGlobalCategoryCommission: async (commissionPercentage: number | string) => {
        const response = await fetch(`${API_URL}/categories/commission/global`, {
            method: "PUT",
            headers: buildHeaders(true),
            body: JSON.stringify({ commissionPercentage }),
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || "Failed to save global category commission");
        return result;
    },

    setManualCategoryCommissionEnabled: async (enabled: boolean) => {
        const response = await fetch(`${API_URL}/categories/commission/manual-enabled`, {
            method: "PUT",
            headers: buildHeaders(true),
            body: JSON.stringify({ enabled }),
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || "Failed to save manual category commission setting");
        return result;
    },

    createCategory: async (payload: any) => {
        const response = await fetch(`${API_URL}/categories`, {
            method: "POST",
            headers: buildHeaders(true),
            body: JSON.stringify(payload),
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || "Failed to create category");
        return result;
    },

    updateCategory: async (id: string | number, payload: any) => {
        const response = await fetch(`${API_URL}/categories/${encodeURIComponent(String(id))}`, {
            method: "PUT",
            headers: buildHeaders(true),
            body: JSON.stringify(payload),
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || "Failed to update category");
        return result;
    },

    deleteCategory: async (id: string | number) => {
        const response = await fetch(`${API_URL}/categories/${encodeURIComponent(String(id))}`, {
            method: "DELETE",
            headers: buildHeaders(true),
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || "Failed to delete category");
        return result;
    },
};
