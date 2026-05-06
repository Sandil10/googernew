import { create } from 'zustand';
import { getAdInteractionId } from './adIdentity';

/**
 * Reactive state for ad interactions that needs to be synced across the app.
 */
export interface AdLiveState {
    user_liked?: boolean;
    likes_count?: number;
    like_count?: number;
    ad_coin_collected?: boolean;
    ad_like_locked?: boolean;
    views_count?: number;
    comments_count?: number;
    shares_count?: number;
    is_subscribed?: boolean;
    // New fields for Product Promote ads
    selected_size?: string | null;
    selected_variant_index?: number | null;
    quantity?: number;
}

interface AdStore {
    adStates: Record<string, AdLiveState>;
    
    /**
     * Updates the live state of an ad by its identity.
     */
    updateAdState: (item: any, updates: AdLiveState | ((prev: AdLiveState) => AdLiveState)) => void;
    
    /**
     * Gets the current live state for an ad.
     */
    getAdState: (item: any) => AdLiveState;
    
    /**
     * Initializes or merges multiple ads into the store.
     */
    syncAds: (ads: any[]) => void;
}

export const useAdStore = create<AdStore>((set, get) => ({
    adStates: {},
    
    updateAdState: (item, updates) => {
        const id = getAdInteractionId(item);
        if (!id) return;
        
        set((state) => {
            const current = state.adStates[id] || {};
            const next = typeof updates === 'function' ? updates(current) : updates;
            const normalizedNext = {
                ...next,
                ...(next.like_count !== undefined && next.likes_count === undefined ? { likes_count: next.like_count } : {}),
                ...(next.likes_count !== undefined && next.like_count === undefined ? { like_count: next.likes_count } : {}),
            };
            return {
                adStates: {
                    ...state.adStates,
                    [id]: { ...current, ...normalizedNext }
                }
            };
        });
    },
    
    getAdState: (item) => {
        const id = getAdInteractionId(item);
        if (!id) return {};
        return get().adStates[id] || {};
    },

    syncAds: (ads) => {
        if (!ads || !Array.isArray(ads)) return;
        
        set((state) => {
            const nextStates = { ...state.adStates };
            let hasChanges = false;

            ads.forEach(ad => {
                const id = getAdInteractionId(ad);
                if (!id) return;

                const current = nextStates[id] || {};
                const incoming: AdLiveState = {};
                
                // Seed missing values from API data while preserving live interaction state.
                if (current.user_liked === undefined && ad.user_liked !== undefined) incoming.user_liked = ad.user_liked;
                if (current.likes_count === undefined && ad.likes_count !== undefined) incoming.likes_count = ad.likes_count;
                if (current.likes_count === undefined && ad.like_count !== undefined && incoming.likes_count === undefined) incoming.likes_count = ad.like_count;
                if ((current.like_count === undefined || incoming.likes_count !== undefined) && (incoming.likes_count ?? current.likes_count) !== undefined) {
                    incoming.like_count = incoming.likes_count ?? current.likes_count;
                }
                if (current.ad_coin_collected === undefined && ad.ad_coin_collected !== undefined) incoming.ad_coin_collected = ad.ad_coin_collected;
                if (current.ad_like_locked === undefined && ad.ad_like_locked !== undefined) incoming.ad_like_locked = ad.ad_like_locked;
                if (current.views_count === undefined && ad.views_count !== undefined) incoming.views_count = ad.views_count;
                if (current.comments_count === undefined && ad.comments_count !== undefined) incoming.comments_count = ad.comments_count;
                if (current.shares_count === undefined && ad.shares_count !== undefined) incoming.shares_count = ad.shares_count;

                // Simple shallow comparison to avoid unnecessary state updates
                const merged = { ...current, ...incoming };
                if (JSON.stringify(current) !== JSON.stringify(merged)) {
                    nextStates[id] = merged;
                    hasChanges = true;
                }
            });

            return hasChanges ? { adStates: nextStates } : state;
        });
    }
}));
