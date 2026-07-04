import { API_URL } from './apiConfig';

const isClient = typeof window !== 'undefined';
let activeUserRequest: Promise<any | null> | null = null;

// Safe storage wrapper for Safari/iPhone compatibility
const storage = {
    get: (key: string) => {
        if (!isClient) return null;
        try { return sessionStorage.getItem(key) || localStorage.getItem(key); } catch { return null; }
    },
    set: (key: string, value: string) => {
        if (!isClient) return;
        let wrote = false;
        try {
            sessionStorage.setItem(key, value);
            wrote = true;
        } catch {}
        try {
            localStorage.setItem(key, value);
            wrote = true;
        } catch {}
        if (!wrote) {
            console.warn('Storage blocked');
        }
    },
    remove: (key: string) => {
        if (!isClient) return;
        try {
            sessionStorage.removeItem(key);
            localStorage.removeItem(key);
        } catch { }
    }
};

const emitAuthChanged = (user: any) => {
    if (!isClient) return;
    try {
        window.dispatchEvent(new CustomEvent('googer-auth-changed', { detail: { user: user || null } }));
    } catch {
        // ignore event dispatch issues
    }
};

// Helper to safely parse JSON from a response
const safeJson = async (response: Response) => {
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
        return await response.json();
    }
    const text = await response.text().catch(() => "");
    if (!text.trim()) return null;
    if (!response.ok) {
        console.error(`Non-JSON response from ${response.url}:`, {
            status: response.status,
            contentType,
            preview: text.substring(0, 200)
        });
    }
    return null;
};

const getStoredToken = () => storage.get('token');

const getOrCreateDeviceId = () => {
    if (!isClient) return "";
    const key = "googer-device-id";
    let value = storage.get(key);
    if (!value) {
        const random = typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        value = `web-${random}`;
        storage.set(key, value);
    }
    return value;
};

const getCachedUser = () => {
    const raw = storage.get('user');
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        storage.remove('user');
        return null;
    }
};

export const getStoredUserSync = () => getCachedUser();

const clearStoredSession = () => {
    storage.remove('token');
    storage.remove('user');
    emitAuthChanged(null);
};

const isAuthFailure = (message: string) =>
    /401|403|invalid authentication token|session expired|authentication required|no token provided|session has been invalidated|user not found/i.test(message);

const buildErrorMessage = (result: any, response: Response) => {
    const payloadMessage =
        result?.message ||
        result?.error ||
        result?.errors?.[0]?.message ||
        result?.errors?.[0];

    return payloadMessage || `HTTP ${response.status}`;
};

const resolveActiveUserSession = async (options?: { silent?: boolean }) => {
    const token = getStoredToken();
    if (!token) {
        storage.remove('user');
        emitAuthChanged(null);
        return null;
    }

    if (activeUserRequest) {
        return activeUserRequest;
    }

    activeUserRequest = (async () => {
        try {
            const response = await fetch(`${API_URL}/auth/profile`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            const result = await safeJson(response);

            if (!response.ok) {
                const errorMsg = buildErrorMessage(result, response);
                if (response.status === 401 || response.status === 403 || response.status === 404) {
                    clearStoredSession();
                }
                throw new Error(errorMsg);
            }

            if (!result) {
                throw new Error(`Invalid response: expected JSON but got ${response.headers.get("content-type")} from ${API_URL}`);
            }

            const user = result?.user || result?.data || null;
            if (user) {
                storage.set('user', JSON.stringify(user));
            } else {
                storage.remove('user');
            }
            emitAuthChanged(user);
            return user;
        } catch (error: any) {
            const message = String(error?.message || error || "Unknown profile error");
            const cachedUser = getCachedUser();

            if (cachedUser) {
                if (!options?.silent) {
                    console.warn(isAuthFailure(message) ? 'Profile auth fallback to cached user:' : 'Profile fetch fallback to cached user:', {
                        url: `${API_URL}/auth/profile`,
                        error: message,
                        hasToken: !!getStoredToken(),
                    });
                }
                emitAuthChanged(cachedUser);
                return cachedUser;
            }

            if (isAuthFailure(message)) {
                if (!options?.silent) {
                    console.warn('Profile session reset:', {
                        url: `${API_URL}/auth/profile`,
                        error: message,
                        hasToken: !!getStoredToken(),
                    });
                }
                clearStoredSession();
                return null;
            }

            if (!options?.silent) {
                console.error('Profile fetch error:', {
                    url: `${API_URL}/auth/profile`,
                    error: message,
                    hasToken: !!getStoredToken()
                });
            }

            throw error;
        } finally {
            activeUserRequest = null;
        }
    })();

    return activeUserRequest;
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
                body: JSON.stringify({ ...data, deviceId: getOrCreateDeviceId() }),
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
                emitAuthChanged(result.user);
            }
            return result;
        } catch (error: any) {
            console.error('Login error detail:', error);
            throw error;
        }
    },

    getDeviceApprovalStatus: async (payload: { approvalId: string; approvalToken: string }) => {
        const response = await fetch(`${API_URL}/auth/login/device-approval/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const result = await safeJson(response);
        if (!response.ok && response.status !== 202) {
            throw new Error(buildErrorMessage(result, response));
        }
        if (result?.token) {
            storage.set('token', result.token);
            storage.set('user', JSON.stringify(result.user));
            emitAuthChanged(result.user);
        }
        return result;
    },

    requestPasswordResetOtp: async (email: string) => {
        const response = await fetch(`${API_URL}/auth/forgot-password/request-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
        });
        const result = await safeJson(response);
        if (!response.ok) {
            throw new Error(buildErrorMessage(result, response));
        }
        return result;
    },

    verifyPasswordResetOtp: async (email: string, otp: string) => {
        const response = await fetch(`${API_URL}/auth/forgot-password/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, otp }),
        });
        const result = await safeJson(response);
        if (!response.ok) {
            throw new Error(buildErrorMessage(result, response));
        }
        return result;
    },

    resetPasswordWithOtp: async (email: string, resetToken: string, newPassword: string) => {
        const response = await fetch(`${API_URL}/auth/forgot-password/reset`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, resetToken, newPassword }),
        });
        const result = await safeJson(response);
        if (!response.ok) {
            throw new Error(buildErrorMessage(result, response));
        }
        return result;
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
                emitAuthChanged(result.user);
            }
            return result;
        } catch (error: any) {
            throw error;
        }
    },

    isAuthenticated: () => !!storage.get('token'),
    getToken: () => getStoredToken(),
    clearSession: () => clearStoredSession(),
    resolveActiveUser: async () => {
        try {
            return await resolveActiveUserSession({ silent: true });
        } catch (error: any) {
            throw error;
        }
    },

    getProfile: async () => {
        try {
            const user = await resolveActiveUserSession({ silent: true });
            if (!user) throw new Error('No session found');
            return user;
        } catch (error: any) {
            throw error;
        }
    },

    getSuspension: async () => {
        const token = storage.get('token');
        if (!token) throw new Error('No session found');
        const response = await fetch(`${API_URL}/auth/suspension`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || 'Failed to fetch suspension');
        return result?.suspension;
    },

    submitSuspensionAppeal: async (payload: {
        appeal: string;
        contactEmail: string;
        phoneNumber: string;
        agreementConfirmed: boolean;
    }) => {
        const token = storage.get('token');
        if (!token) throw new Error('No session found');
        const response = await fetch(`${API_URL}/auth/suspension/appeal`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || 'Failed to submit appeal');
        return result?.suspension;
    },

    selfDeactivateAccount: async () => {
        const token = storage.get('token');
        if (!token) throw new Error('No session found');
        const response = await fetch(`${API_URL}/auth/self-deactivate`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || 'Failed to deactivate account');
        storage.remove('token');
        storage.remove('user');
        emitAuthChanged(null);
        return result;
    },

    selfDeleteAccount: async () => {
        const token = storage.get('token');
        if (!token) throw new Error('No session found');
        const response = await fetch(`${API_URL}/auth/self-delete`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || 'Failed to delete account');
        storage.remove('token');
        storage.remove('user');
        emitAuthChanged(null);
        return result;
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

    getAuthSessions: async () => {
        const token = storage.get('token');
        if (!token) throw new Error('No session found');
        const response = await fetch(`${API_URL}/auth/sessions`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(buildErrorMessage(result, response));
        return result;
    },

    getAuthSessionHistory: async () => {
        const token = storage.get('token');
        if (!token) throw new Error('No session found');
        const response = await fetch(`${API_URL}/auth/sessions/history`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(buildErrorMessage(result, response));
        return result;
    },

    logoutOtherAuthSessions: async () => {
        const token = storage.get('token');
        if (!token) throw new Error('No session found');
        const response = await fetch(`${API_URL}/auth/sessions/logout-others`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({}),
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(buildErrorMessage(result, response));
        return result;
    },

    updateAuthSession: async (id: string, payload: { trusted?: boolean; deviceName?: string }) => {
        const token = storage.get('token');
        if (!token) throw new Error('No session found');
        const response = await fetch(`${API_URL}/auth/sessions/${encodeURIComponent(id)}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(buildErrorMessage(result, response));
        return result;
    },

    requestAccountSecurityOtp: async (payload: {
        purpose: string;
        destinationType?: 'email' | 'phone';
        phoneNumber?: string;
        dialCode?: string;
    }) => {
        const token = storage.get('token');
        if (!token) throw new Error('No session found');
        const response = await fetch(`${API_URL}/auth/security/request-otp`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(buildErrorMessage(result, response));
        return result;
    },

    verifyAccountSecurityOtp: async (payload: { purpose: string; otp: string }) => {
        const token = storage.get('token');
        if (!token) throw new Error('No session found');
        const response = await fetch(`${API_URL}/auth/security/verify-otp`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(buildErrorMessage(result, response));
        return result;
    },

    changeLoginEmailWithOtp: async (newEmail: string, securityToken: string) => {
        const token = storage.get('token');
        if (!token) throw new Error('No session found');
        const response = await fetch(`${API_URL}/auth/security/change-email`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ newEmail, securityToken }),
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(buildErrorMessage(result, response));
        if (result?.user) storage.set('user', JSON.stringify(result.user));
        if (result?.user) emitAuthChanged(result.user);
        return result;
    },

    resetLoggedInPasswordWithOtp: async (newPassword: string, securityToken: string) => {
        const token = storage.get('token');
        if (!token) throw new Error('No session found');
        const response = await fetch(`${API_URL}/auth/security/reset-password`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ newPassword, securityToken }),
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(buildErrorMessage(result, response));
        return result;
    },

    savePasskeyWithOtp: async (passkey: string, securityToken: string) => {
        const token = storage.get('token');
        if (!token) throw new Error('No session found');
        const response = await fetch(`${API_URL}/auth/security/passkey`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ passkey, securityToken }),
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(buildErrorMessage(result, response));
        return result;
    },

    saveTwoFactorPhone: async (payload: {
        emailSecurityToken: string;
        phoneSecurityToken: string;
        countryCode: string;
        countryName: string;
        dialCode: string;
        phoneNumber: string;
        otpDeliveryMethod: 'email' | 'phone';
    }) => {
        const token = storage.get('token');
        if (!token) throw new Error('No session found');
        const response = await fetch(`${API_URL}/auth/security/two-factor-phone`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(buildErrorMessage(result, response));
        if (result?.user) emitAuthChanged(result.user);
        return result;
    },

    updateOtpDeliveryMethod: async (otpDeliveryMethod: 'email' | 'phone') => {
        const token = storage.get('token');
        if (!token) throw new Error('No session found');
        const response = await fetch(`${API_URL}/auth/security/otp-delivery`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ otpDeliveryMethod }),
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(buildErrorMessage(result, response));
        return result;
    },

    removeAuthSession: async (id: string) => {
        const token = storage.get('token');
        if (!token) throw new Error('No session found');
        const response = await fetch(`${API_URL}/auth/sessions/${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(buildErrorMessage(result, response));
        return result;
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
            if (result?.user) emitAuthChanged(result.user);
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
        emitAuthChanged(null);
        if (isClient) window.location.href = '/';
    }
};
