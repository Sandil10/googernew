
const isClient = typeof window !== 'undefined';
const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';
const getStoredToken = () => (typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null);

const buildApiError = (response: Response, data: any, fallbackMessage: string) => {
    const message = data?.message
        ? data.message + (data?.error ? `: ${data.error}` : '')
        : fallbackMessage;
    const error = new Error(message) as Error & {
        status?: number;
        unauthorized?: boolean;
        locked?: boolean;
        liked?: boolean;
        data?: any;
    };
    error.status = response.status;
    error.unauthorized = response.status === 401;
    error.locked = !!data?.locked;
    error.liked = data?.liked;
    error.data = data;
    return error;
};

const getAuthHeaders = () => {
    const token = getStoredToken();
    return {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
    };
};

export const marketService = {
    // Fetch lightweight paginated product cards
    getProducts: async (filters: any = {}) => {
        try {
            const queryParams = new URLSearchParams(filters).toString();
            const response = await fetch(`${API_URL}/market/products?${queryParams}`, {
                method: 'GET',
                cache: 'no-store',
                headers: getAuthHeaders()
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message + (data.error ? `: ${data.error}` : '') || 'Failed to fetch products');
            return {
                data: data.data || [],
                pagination: data.pagination || { limit: Number(filters.limit || 20), offset: Number(filters.offset || 0), nextOffset: 0, hasMore: false }
            };
        } catch (error) {
            console.error('Error fetching market products:', error);
            throw error;
        }
    },

    // Fetch market items
    getItems: async (filters: any = {}) => {
        try {
            const queryParams = new URLSearchParams(filters).toString();
            const response = await fetch(`${API_URL}/market?${queryParams}`, {
                method: 'GET',
                cache: 'no-store',
                // Optional auth header if we want to support personalized views later, 
                // but getItems is public mostly. However, logged in users might see different things?
                // The backend controller doesn't enforce auth for getItems, but let's send token if available just in case.
                headers: getAuthHeaders()
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message + (data.error ? `: ${data.error}` : '') || 'Failed to fetch items');
            return data.data;
        } catch (error) {
            console.error('Error fetching market items:', error);
            throw error;
        }
    },

    // Create a new item
    createItem: async (itemData: any) => {
        try {
            const isFormData = itemData instanceof FormData;
            const headers = getAuthHeaders();

            if (isFormData) {
                // Let browser set Content-Type for FormData (multipart/form-data)
                // @ts-ignore
                delete headers['Content-Type'];
            }

            const response = await fetch(`${API_URL}/market/create`, {
                method: 'POST',
                headers: headers,
                body: isFormData ? itemData : JSON.stringify(itemData),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message + (data.error ? `: ${data.error}` : '') || 'Failed to create item');
            return data.data;
        } catch (error) {
            console.error('Error creating market item:', error);
            throw error;
        }
    },

    // Get item by ID
    getItemById: async (id: string | number) => {
        const rawId = String(id ?? "");
        // Support common prefixes used across the app: "ad-<id>", "item-<id>", "product-<id>"
        const numericId = rawId
            .trim()
            .replace(/^(ad|item|product|market|promo)-/i, "");

        if (!numericId || !/^\d+$/.test(numericId)) {
            const error = new Error(`Invalid market item id: ${rawId}`);
            console.error("Error fetching market item:", error);
            throw error;
        }

        try {
            const response = await fetch(`${API_URL}/market/${numericId}`, {
                method: "GET",
                headers: getAuthHeaders(),
            });

            // Try to parse JSON error bodies, but still handle non-JSON gracefully.
            let data: unknown = null;
            try {
                data = await response.json();
            } catch {
                // leave data as null; we'll build an error message from status
            }

            if (!response.ok) {
                const message =
                    (data as any)?.message ||
                    (data as any)?.data?.message ||
                    (data as any)?.error ||
                    `Failed to fetch item (HTTP ${response.status})`;
                const error = new Error(message) as Error & { status?: number };
                error.status = response.status;
                console.warn("Error fetching market item:", { numericId, status: response.status, data });
                throw error;
            }

            return (data as any)?.data;
        } catch (error) {
            console.warn("Error fetching market item:", error);
            throw error;
        }
    },

    getAdPublic: async (id: string | number) => {
        try {
            const response = await fetch(`${API_URL}/market/public/${id}`, {
                method: 'GET',
                cache: 'no-store',
            });
            const data = await response.json();
            if (!response.ok) return null;
            return data.ad;
        } catch {
            return null;
        }
    },

    // Get item by alphanumeric product_code (used by share links)
    getItemByCode: async (code: string) => {
        try {
            const response = await fetch(`${API_URL}/market/code/${encodeURIComponent(code)}`, {
                method: 'GET',
                headers: getAuthHeaders(),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Failed to fetch item by code');
            return data.data;
        } catch (error) {
            console.error('Error fetching market item by code:', error);
            throw error;
        }
    },

    getProductByCodePublic: async (code: string) => {
        try {
            const response = await fetch(`${API_URL}/market/product/public/${encodeURIComponent(code)}`, {
                method: 'GET',
                cache: 'no-store',
            });
            const data = await response.json();
            if (!response.ok) return null;
            return data.product;
        } catch {
            return null;
        }
    },

    getUnifiedShareItem: async (shareCode: string) => {
        try {
            const response = await fetch(`${API_URL}/market/share-unified/${encodeURIComponent(shareCode)}`, {
                method: 'GET',
                cache: 'no-store',
            });
            const data = await response.json();
            if (!response.ok) return null;
            return data;
        } catch {
            return null;
        }
    },

    // Update an item
    updateItem: async (id: string | number, itemData: any) => {
        const numericId = String(id).replace(/^ad-/, "");
        try {
            const isFormData = itemData instanceof FormData;
            const headers = getAuthHeaders();

            if (isFormData) {
                // @ts-ignore
                delete headers['Content-Type'];
            }

            const response = await fetch(`${API_URL}/market/${numericId}`, {
                method: 'PUT',
                headers: headers,
                body: isFormData ? itemData : JSON.stringify(itemData),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Failed to update item');
            return data.data;
        } catch (error) {
            console.error('Error updating market item:', error);
            throw error;
        }
    },

    // Delete an item
    deleteItem: async (id: string | number) => {
        const numericId = String(id).replace(/^ad-/, "");
        try {
            const response = await fetch(`${API_URL}/market/${numericId}`, {
                method: 'DELETE',
                headers: getAuthHeaders(),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Failed to delete item');
            return true;
        } catch (error) {
            console.error('Error deleting market item:', error);
            throw error;
        }
    },

    // Update item status (admin: approve / reject / reviewing)
    updateStatus: async (id: string | number, status: string) => {
        const numericId = String(id).replace(/^ad-/, "");
        try {
            const response = await fetch(`${API_URL}/market/${numericId}/status`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({ status }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Failed to update status');
            return data;
        } catch (error) {
            console.error('Error updating market item status:', error);
            throw error;
        }
    },

    // Engagement Features
    toggleLike: async (id: string | number) => {
        const numericId = String(id);
        try {
            const response = await fetch(`${API_URL}/market/${numericId}/like`, {
                method: 'POST',
                headers: getAuthHeaders(),
            });
            const data = await response.json();
            if (!response.ok) throw buildApiError(response, data, 'Failed to like item');
            return data.liked;
        } catch (error) {
            // Locked errors are handled gracefully upstream — don't pollute the console
            if (!(error as any)?.locked) console.error('Error liking market item:', error);
            throw error;
        }
    },

    collectAdCoin: async (id: string | number | Record<string, any>) => {
        const payload = typeof id === 'object' && id !== null
            ? {
                ad_id: String((id as any).ad_id ?? (id as any).adId ?? (id as any).id ?? '').trim(),
                ad_type: String((id as any).ad_type ?? (id as any).campaign_type ?? (id as any).type ?? 'Ads').trim() || 'Ads',
            }
            : {
                ad_id: String(id).trim(),
                ad_type: 'Ads',
            };
        try {
            const response = await fetch(`${API_URL}/market/collect-coin`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(payload),
            });
            const data = await response.json();
            if (!response.ok) throw buildApiError(response, data, 'Failed to collect ad coin');
            return data;
        } catch (error) {
            console.error('Error collecting ad coin:', error);
            throw error;
        }
    },

    markAdVideoWatchEligible: async (id: string | number, watchedSeconds = 5) => {
        const numericId = String(id);
        try {
            const response = await fetch(`${API_URL}/market/${numericId}/video-watch-eligible`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ watchedSeconds }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Failed to confirm ad video watch');
            return data;
        } catch (error) {
            console.error('Error confirming ad video watch:', error);
            throw error;
        }
    },

    addComment: async (id: string | number, text: string, parentId?: string | number) => {
        const engagementId = String(id);
        try {
            const response = await fetch(`${API_URL}/market/${engagementId}/comments`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ text, parent_id: parentId }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Failed to add comment');
            return data.data;
        } catch (error) {
            console.error('Error adding comment:', error);
            throw error;
        }
    },

    deleteComment: async (commentId: string | number) => {
        try {
            const response = await fetch(`${API_URL}/market/comments/${commentId}`, {
                method: 'DELETE',
                headers: getAuthHeaders(),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Failed to delete comment');
            return data;
        } catch (error) {
            console.error('Error deleting comment:', error);
            throw error;
        }
    },

    likeComment: async (commentId: number) => {
        try {
            const response = await fetch(`${API_URL}/market/comments/${commentId}/like`, {
                method: 'POST',
                headers: getAuthHeaders(),
            });
            return await response.json();
        } catch (error) {
            console.error('Error liking comment:', error);
            throw error;
        }
    },

    dislikeComment: async (commentId: number) => {
        try {
            const response = await fetch(`${API_URL}/market/comments/${commentId}/dislike`, {
                method: 'POST',
                headers: getAuthHeaders(),
            });
            return await response.json();
        } catch (error) {
            console.error('Error disliking comment:', error);
            throw error;
        }
    },

    reportComment: async (commentId: number) => {
        try {
            const response = await fetch(`${API_URL}/market/comments/${commentId}/report`, {
                method: 'POST',
                headers: getAuthHeaders(),
            });
            return await response.json();
        } catch (error) {
            console.error('Error reporting comment:', error);
            throw error;
        }
    },

    getComments: async (id: string | number) => {
        const engagementId = String(id);
        try {
            const response = await fetch(`${API_URL}/market/${engagementId}/comments`, {
                method: 'GET',
                headers: getAuthHeaders(),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Failed to fetch comments');
            return data.data;
        } catch (error) {
            console.error('Error fetching comments:', error);
            throw error;
        }
    },

    logShare: async (id: string | number) => {
        const engagementId = String(id);
        try {
            const response = await fetch(`${API_URL}/market/${engagementId}/share`, {
                method: 'POST',
                headers: getAuthHeaders(),
            });
            return await response.json();
        } catch (error) {
            console.error('Error logging share:', error);
        }
    },

    logView: async (id: string | number) => {
        const engagementId = String(id);
        try {
            const response = await fetch(`${API_URL}/market/${engagementId}/view`, {
                method: 'POST',
                headers: getAuthHeaders(),
            });
            return await response.json();
        } catch (error) {
            console.error('Error logging view:', error);
        }
    },

    getLikes: async (id: string | number) => {
        const engagementId = String(id);
        try {
            const response = await fetch(`${API_URL}/market/${engagementId}/likes`, {
                method: 'GET',
                headers: getAuthHeaders(),
            });
            const data = await response.json();
            return data.data || [];
        } catch (error) { console.error(error); return []; }
    },

    getShares: async (id: string | number) => {
        const engagementId = String(id);
        try {
            const response = await fetch(`${API_URL}/market/${engagementId}/shares`, {
                method: 'GET',
                headers: getAuthHeaders(),
            });
            const data = await response.json();
            return data.data || [];
        } catch (error) { console.error(error); return []; }
    },

    getViews: async (id: string | number) => {
        const engagementId = String(id);
        try {
            const response = await fetch(`${API_URL}/market/${engagementId}/views`, {
                method: 'GET',
                headers: getAuthHeaders(),
            });
            const data = await response.json();
            return data.data || [];
        } catch (error) { console.error(error); return []; }
    },

    hasAuthToken: () => !!getStoredToken(),
};
