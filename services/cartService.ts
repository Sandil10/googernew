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
};
