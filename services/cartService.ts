const isClient = typeof window !== 'undefined';
import { API_URL } from './apiConfig';

const getAuthHeaders = () => {
    const token = isClient ? (sessionStorage.getItem('token') || localStorage.getItem('token')) : null;
    return {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
    };
};

const handleResponse = async (response: Response) => {
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.message || 'Cart request failed');
    }
    return data.data;
};

export const cartService = {
    getCart: async () => {
        const response = await fetch(`${API_URL}/cart`, {
            method: 'GET',
            headers: getAuthHeaders(),
            cache: 'no-store',
        });
        return handleResponse(response);
    },

    addItem: async (item: any) => {
        const response = await fetch(`${API_URL}/cart/items`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(item),
        });
        return handleResponse(response);
    },

    updateItem: async (itemId: number, updates: { quantity?: number; selected?: boolean }) => {
        const response = await fetch(`${API_URL}/cart/items/${itemId}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(updates),
        });
        return handleResponse(response);
    },

    deleteItem: async (itemId: number) => {
        const response = await fetch(`${API_URL}/cart/items/${itemId}`, {
            method: 'DELETE',
            headers: getAuthHeaders(),
        });
        return handleResponse(response);
    },

    clearCart: async () => {
        const response = await fetch(`${API_URL}/cart`, {
            method: 'DELETE',
            headers: getAuthHeaders(),
        });
        return handleResponse(response);
    },

    // Shared Googer Manual Payment lock (same account on web and mobile).
    getPaymentIntent: async (): Promise<any | null> => {
        const response = await fetch(`${API_URL}/checkout-intent`, {
            method: 'GET',
            headers: getAuthHeaders(),
            cache: 'no-store',
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Payment state request failed');
        return data.intent || null;
    },

    /** Shared lock plus when it was last cleared (order placed / cancelled). */
    getPaymentIntentState: async (): Promise<{ intent: any | null; clearedAt: string | null }> => {
        const response = await fetch(`${API_URL}/checkout-intent`, {
            method: 'GET',
            headers: getAuthHeaders(),
            cache: 'no-store',
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Payment state request failed');
        return { intent: data.intent || null, clearedAt: data.clearedAt || null };
    },

    savePaymentIntent: async (intent: any) => {
        const response = await fetch(`${API_URL}/checkout-intent`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ intent }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Payment state save failed');
        return data.intent;
    },

    clearPaymentIntent: async () => {
        const response = await fetch(`${API_URL}/checkout-intent`, {
            method: 'DELETE',
            headers: getAuthHeaders(),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Payment state clear failed');
        return true;
    },
};
