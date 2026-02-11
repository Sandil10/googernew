const isClient = typeof window !== 'undefined';
const API_URL = process.env.NEXT_PUBLIC_API_URL ||
    (isClient && window.location.hostname !== 'localhost' ? '/api' : 'http://localhost:5000/api');

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
    searchUsers: async (query: string) => {
        const response = await fetch(`${API_URL}/wallet/search-users?query=${encodeURIComponent(query)}`, {
            headers: getHeaders()
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || 'Search failed');
        return result.users;
    },

    requestMoney: async (receiverId: number, amount: number, note: string, commissionPercentage: number = 0, type: 'sell' | 'request' = 'request') => {
        const response = await fetch(`${API_URL}/wallet/request`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ receiverId, amount, note, commissionPercentage, type })
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
    }
};
