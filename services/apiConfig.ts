/**
 * Smart API URL detection:
 * - For localhost: use http://localhost:5000 (direct connection)
 * - For production/Cloudflare domains: use /api (relative path through tunnel)
 * - Use environment variable if explicitly set
 */
export const getApiUrl = (): string => {
    // Check if we're in a browser environment
    const isClient = typeof window !== 'undefined';
    if (!isClient) return '/api'; // SSR fallback
    
    const envUrl = process.env.NEXT_PUBLIC_API_URL;
    // If environment variable is explicitly set and not the default '/api', use it
    if (envUrl && envUrl !== '/api' && envUrl !== 'http://localhost:5000') {
        return envUrl;
    }
    
    const hostname = window.location.hostname;
    
    // For localhost development, use direct connection
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'http://localhost:5000';
    }
    
    // For all other environments (Cloudflare, production), use relative path
    return '/api';
};

// Export as constant for use in service modules
export const API_URL = getApiUrl();
