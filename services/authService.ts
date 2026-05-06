const isClient = typeof window !== 'undefined';
// Automatically detect if we should use the relative /api path (Vercel) or local dev path
const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

// Safe storage wrapper for Safari/iPhone compatibility
const storage = {
    get: (key: string) => {
        if (!isClient) return null;
        try { return localStorage.getItem(key); } catch (e) { return null; }
    },
    set: (key: string, value: string) => {
        if (!isClient) return;
        try { localStorage.setItem(key, value); } catch (e) { console.warn('Storage blocked'); }
    },
    remove: (key: string) => {
        if (!isClient) return;
        try { localStorage.removeItem(key); } catch (e) { }
    }
};

// Helper to safely parse JSON from a response
const safeJson = async (response: Response) => {
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
        return await response.json();
    }
    return null;
};

export const authService = {
    login: async (data: any) => {
        try {
            const isProd = isClient && window.location.hostname !== 'localhost';

            // If we are on production but API is localhost, warn clearly
            if (isProd && API_URL.includes('localhost')) {
                throw new Error('API not configured. Please set NEXT_PUBLIC_API_URL in Vercel.');
            }

            const response = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            }).catch(() => {
                throw new Error('Server connection failed. Is the backend running?');
            });

            const result = await safeJson(response);

            if (!response.ok) {
                console.error('API Error Response:', result);
                const errorMessage = result?.error || result?.message || `Status: ${response.status}`;
                throw new Error(errorMessage);
            }

            if (result?.token) {
                storage.set('token', result.token);
                storage.set('user', JSON.stringify(result.user));
            }
            return result;
        } catch (error: any) {
            console.error('Login error detail:', error);
            throw error;
        }
    },

    register: async (data: any) => {
        try {
            const isProd = isClient && window.location.hostname !== 'localhost';
            if (isProd && API_URL.includes('localhost')) {
                throw new Error('API not configured for production.');
            }

            const response = await fetch(`${API_URL}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            }).catch(() => {
                throw new Error('Server connection failed.');
            });

            const result = await safeJson(response);

            if (!response.ok) {
                throw new Error(result?.message || `Error: ${response.status}`);
            }

            if (result?.token) {
                storage.set('token', result.token);
                storage.set('user', JSON.stringify(result.user));
            }
            return result;
        } catch (error: any) {
            throw error;
        }
    },

    isAuthenticated: () => !!storage.get('token'),

    getProfile: async () => {
        try {
            const token = storage.get('token');
            if (!token) throw new Error('No session found');

            const response = await fetch(`${API_URL}/auth/profile`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            const result = await safeJson(response);
            if (!response.ok) {
                // If token is invalid/expired, clear storage and force re-login
                if (response.status === 401) {
                    storage.remove('token');
                    storage.remove('user');
                }
                throw new Error(result?.message || 'Failed to fetch profile');
            }

            if (result?.user) storage.set('user', JSON.stringify(result.user));
            return result?.user;
        } catch (error: any) {
            throw error;
        }
    },

    getUserProfile: async (id: string | number) => {
        try {
            const token = storage.get('token');
            const response = await fetch(`${API_URL}/auth/user/${id}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                },
            });
            const result = await safeJson(response);
            if (!response.ok) throw new Error(result?.message || 'Failed to fetch user');
            return result?.user || result?.data;
        } catch (error: any) {
            throw error;
        }
    },

    getUserByUsername: async (username: string) => {
        try {
            const token = storage.get('token');
            const response = await fetch(`${API_URL}/auth/username/${encodeURIComponent(username)}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                },
            });
            const result = await safeJson(response);
            if (!response.ok) throw new Error(result?.message || 'Failed to fetch user by username');
            return result?.user || result?.data;
        } catch (error: any) {
            throw error;
        }
    },

    getSubscriptionStatus: async (id: string | number) => {
        try {
            const token = storage.get('token');
            const response = await fetch(`${API_URL}/auth/user/${id}/subscription`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                },
            });
            const result = await safeJson(response);
            if (!response.ok) throw new Error(result?.message || 'Failed to fetch subscription status');
            return {
                isSubscribed: !!result?.isSubscribed,
                subscriberCount: Number(result?.subscriberCount || 0),
            };
        } catch (error: any) {
            throw error;
        }
    },

    getFollowingUsers: async (id: string | number) => {
        try {
            const token = storage.get('token');
            const response = await fetch(`${API_URL}/auth/user/${id}/following`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                },
            });
            const result = await safeJson(response);
            if (!response.ok) throw new Error(result?.message || 'Failed to fetch following users');
            return result?.data || [];
        } catch (error: any) {
            throw error;
        }
    },

    getFollowerUsers: async (id: string | number) => {
        try {
            const token = storage.get('token');
            const response = await fetch(`${API_URL}/auth/user/${id}/followers`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                },
            });
            const result = await safeJson(response);
            if (!response.ok) throw new Error(result?.message || 'Failed to fetch followers');
            return result?.data || [];
        } catch (error: any) {
            throw error;
        }
    },

    getBlockedUsers: async (id: string | number) => {
        try {
            const token = storage.get('token');
            const response = await fetch(`${API_URL}/auth/user/${id}/blocked`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                },
            });
            const result = await safeJson(response);
            if (!response.ok) throw new Error(result?.message || 'Failed to fetch blocked users');
            return result?.data || [];
        } catch (error: any) {
            throw error;
        }
    },

    logProfileView: async (id: string | number) => {
        try {
            const token = storage.get('token');
            const response = await fetch(`${API_URL}/auth/user/${id}/view`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                },
            });
            const result = await safeJson(response);
            if (!response.ok) throw new Error(result?.message || 'Failed to log profile view');
            return {
                incremented: !!result?.incremented,
                profileViewsCount: Number(result?.profileViewsCount || 0),
            };
        } catch (error: any) {
            throw error;
        }
    },

    getProfileViews: async (id: string | number) => {
        try {
            const token = storage.get('token');
            const response = await fetch(`${API_URL}/auth/user/${id}/views`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                },
            });
            const result = await safeJson(response);
            if (!response.ok) throw new Error(result?.message || 'Failed to fetch profile views');
            return Number(result?.profileViewsCount || 0);
        } catch (error: any) {
            throw error;
        }
    },

    toggleSubscription: async (id: string | number) => {
        try {
            const token = storage.get('token');
            if (!token) throw new Error('No session found');

            const response = await fetch(`${API_URL}/auth/user/${id}/subscribe`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });
            const result = await safeJson(response);
            if (!response.ok) throw new Error(result?.message || 'Failed to update subscription');
            return {
                isSubscribed: !!result?.isSubscribed,
                subscriberCount: Number(result?.subscriberCount || 0),
            };
        } catch (error: any) {
            throw error;
        }
    },

    getWallet: async () => {
        try {
            const token = storage.get('token');
            if (!token) throw new Error('No session found');

            const response = await fetch(`${API_URL}/auth/wallet`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            const result = await safeJson(response);
            if (!response.ok) {
                if (response.status === 401) {
                    storage.remove('token');
                    storage.remove('user');
                }
                throw new Error(result?.message || 'Failed to fetch wallet');
            }
            return result;
        } catch (error: any) {
            throw error;
        }
    },

    verifyPassword: async (password: string) => {
        try {
            const token = storage.get('token');
            if (!token) throw new Error('No session found');

            const response = await fetch(`${API_URL}/auth/verify-password`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ password }),
            });

            const result = await safeJson(response);
            if (!response.ok) throw new Error(result?.message || 'Verification failed');
            return result;
        } catch (error: any) {
            throw error;
        }
    },

    updateProfile: async (data: any) => {
        try {
            const token = storage.get('token');
            if (!token) throw new Error('No session found');

            const isFormData = data instanceof FormData;

            const response = await fetch(`${API_URL}/auth/update-profile`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
                },
                body: isFormData ? data : JSON.stringify(data),
            });

            const result = await safeJson(response);
            if (!response.ok) throw new Error(result?.message || 'Failed to update profile');

            if (result?.user) storage.set('user', JSON.stringify(result.user));
            return result;
        } catch (error: any) {
            throw error;
        }
    },

    updateShippingAddress: async (shippingAddress: any) => {
        try {
            const token = storage.get('token');
            if (!token) throw new Error('No session found');

            const response = await fetch(`${API_URL}/auth/update-shipping-address`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ shippingAddress }),
            });

            const result = await safeJson(response);
            if (!response.ok) throw new Error(result?.message || 'Failed to update shipping address');

            const cachedUser = storage.get('user');
            if (cachedUser) {
                try {
                    const parsedUser = JSON.parse(cachedUser);
                    storage.set('user', JSON.stringify({
                        ...parsedUser,
                        shipping_address: result?.shippingAddress ?? shippingAddress,
                    }));
                } catch {
                    // Ignore malformed cached user payloads and return the server response.
                }
            }

            return result;
        } catch (error: any) {
            throw error;
        }
    },

    checkUsernameAvailability: async (username: string) => {
        try {
            const token = storage.get('token');
            if (!token) throw new Error('No session found');

            const response = await fetch(`${API_URL}/auth/check-username?username=${encodeURIComponent(username)}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            const result = await safeJson(response);
            if (!response.ok) throw new Error(result?.message || 'Failed to check username');
            return !!result?.available;
        } catch (error: any) {
            throw error;
        }
    },

    changePassword: async (currentPassword: string, newPassword: string) => {
        try {
            const token = storage.get('token');
            if (!token) throw new Error('No session found');

            const response = await fetch(`${API_URL}/auth/change-password`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ currentPassword, newPassword }),
            });

            const result = await safeJson(response);
            if (!response.ok) throw new Error(result?.message || 'Failed to change password');
            return result;
        } catch (error: any) {
            throw error;
        }
    },

    logout: () => {
        storage.remove('token');
        storage.remove('user');
        if (isClient) window.location.href = '/';
    }
};
