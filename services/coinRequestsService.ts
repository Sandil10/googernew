const isClient = typeof window !== 'undefined';
import { API_URL } from './apiConfig';

const getToken = () => (isClient ? (sessionStorage.getItem('token') || localStorage.getItem('token')) : null);
const authHeaders = () => ({ Authorization: `Bearer ${getToken()}` });

export type CoinRequestStatus = 'Pending' | 'Verified' | 'Rejected';

export type CoinRequest = {
    id: number;
    user_id: number;
    method_category: string;
    method_name: string;
    bank_name: string | null;
    amount: string;
    notes: string | null;
    status: CoinRequestStatus;
    rejection_reason: string | null;
    reviewed_at: string | null;
    created_at: string;
    username?: string;
    email?: string;
    full_name?: string;
    profile_picture?: string;
};

export const coinRequestsService = {
    submit: async (payload: {
        method_category: string;
        method_name: string;
        bank_name?: string | null;
        amount: number;
        notes?: string | null;
    }): Promise<{ id: number; status: string; created_at: string }> => {
        const res = await fetch(`${API_URL}/coin-requests`, {
            method: 'POST',
            headers: { ...authHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || 'Failed to submit request');
        return data.request;
    },

    getMyRequests: async (): Promise<CoinRequest[]> => {
        const res = await fetch(`${API_URL}/coin-requests/my`, { headers: authHeaders() });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || 'Failed to fetch requests');
        return data.requests || [];
    },

    adminGetAll: async (status?: string): Promise<CoinRequest[]> => {
        const qs = status && status !== 'All' ? `?status=${encodeURIComponent(status)}` : '';
        const res = await fetch(`${API_URL}/coin-requests/admin${qs}`, { headers: authHeaders() });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || 'Failed to fetch requests');
        return data.requests || [];
    },

    adminReview: async (id: number, action: 'approve' | 'reject', rejection_reason?: string): Promise<void> => {
        const res = await fetch(`${API_URL}/coin-requests/admin/${id}/review`, {
            method: 'PUT',
            headers: { ...authHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, rejection_reason }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || 'Review failed');
    },
};
