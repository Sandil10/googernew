const isClient = typeof window !== 'undefined';
const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

const storage = {
    get: (key: string) => {
        if (!isClient) return null;
        try { return localStorage.getItem(key); } catch (e) { return null; }
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

export const walletService = {
    searchUsers: async (query: string, options?: { includeSelf?: boolean }) => {
        const params = new URLSearchParams({ query });
        if (options?.includeSelf) {
            params.set('includeSelf', 'true');
        }

        const response = await fetch(`${API_URL}/wallet/search-users?${params.toString()}`, {
            headers: getHeaders()
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || 'Search failed');
        return result.users;
    },

    requestMoney: async (
        receiverId: number,
        amount: number,
        note: string,
        commissionPercentage: number = 0,
        type: 'sell' | 'request' = 'request',
        options?: { manualPaymentOrder?: boolean }
    ) => {
        const response = await fetch(`${API_URL}/wallet/request`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ receiverId, amount, note, commissionPercentage, type, ...options })
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || 'Request failed');
        return result;
    },

    getPendingRequests: async () => {
        const response = await fetch(`${API_URL}/wallet/pending-requests`, {
            headers: getHeaders()
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || 'Failed to fetch requests');
        return result.requests;
    },

    respondToRequest: async (requestId: number, action: 'accept' | 'reject') => {
        const response = await fetch(`${API_URL}/wallet/respond`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ requestId, action })
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || 'Response failed');
        return result;
    },

    directTransfer: async (receiverId: number, amount: number, note: string, commissionPercentage: number = 0) => {
        const response = await fetch(`${API_URL}/wallet/transfer`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ receiverId, amount, note, commissionPercentage })
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || 'Transfer failed');
        return result;
    },

    getTransactionHistory: async () => {
        const response = await fetch(`${API_URL}/wallet/history`, {
            headers: getHeaders()
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || 'Failed to fetch history');
        return result.transactions;
    },

    cancelTransaction: async (transactionId: number) => {
        const response = await fetch(`${API_URL}/wallet/cancel`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ transactionId })
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || 'Cancellation failed');
        return result;
    },

    payOrder: async (amount: number, options?: { orderId?: string | number; note?: string }) => {
        const body = JSON.stringify({ amount, ...options });
        let response = await fetch(`${API_URL}/wallet/pay-order`, {
            method: 'POST',
            headers: getHeaders(),
            body,
        });
        if (response.status === 429) {
            await new Promise((r) => setTimeout(r, 1500));
            response = await fetch(`${API_URL}/wallet/pay-order`, {
                method: 'POST',
                headers: getHeaders(),
                body,
            });
        }
        const result = await safeJson(response);
        if (!response.ok) {
            let fallbackMessage = '';
            try {
                const text = await response.text();
                fallbackMessage = text.trim();
            } catch { }
            throw new Error(result?.message || fallbackMessage || `Payment failed (HTTP ${response.status})`);
        }
        return result;
    },

    recordPromoAd: async (adId: string, campaignType?: string, note?: string) => {
        const response = await fetch(`${API_URL}/wallet/record-promo-ad`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ adId, campaignType, note }),
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || 'Failed to record promo ad');
        return result as { success: boolean; transferId: number };
    },

    payProfilePromote: async (amount: number, options?: { orderId?: string | number; note?: string }) => {
        const body = JSON.stringify({ amount, ...options });
        let response = await fetch(`${API_URL}/wallet/pay-profile-promote`, {
            method: 'POST',
            headers: getHeaders(),
            body,
        });
        if (response.status === 429) {
            await new Promise((r) => setTimeout(r, 1500));
            response = await fetch(`${API_URL}/wallet/pay-profile-promote`, {
                method: 'POST',
                headers: getHeaders(),
                body,
            });
        }
        const result = await safeJson(response);
        if (!response.ok) {
            throw new Error(result?.message || `Payment failed (HTTP ${response.status})`);
        }
        return result;
    }
};
