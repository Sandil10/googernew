/**
 * Smart API URL detection:
 * - For localhost: use http://127.0.0.1:5000 (direct connection)
 * - For production/Cloudflare domains: use /api (relative path through tunnel)
 * - Use environment variable if explicitly set
 */
export const getApiUrl = (): string => {
    // Check if we're in a browser environment
    const isClient = typeof window !== 'undefined';
    if (!isClient) return '/api'; // SSR fallback

    const hostname = window.location.hostname;
    const isLocalBrowser = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    const envUrl = process.env.NEXT_PUBLIC_API_URL;

    // Public Cloudflare pages must route API calls through the same origin.
    if (!isLocalBrowser) {
        return '/api';
    }

    // If environment variable is explicitly set for local development, use it.
    if (envUrl && envUrl !== '/api') {
        return envUrl;
    }

    // For localhost development, use direct connection
    return 'http://127.0.0.1:5000';
};

// Export as constant for use in service modules
export const API_URL = getApiUrl();
