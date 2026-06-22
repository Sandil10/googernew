import { create } from 'zustand';
import { getAdInteractionId } from './adIdentity';

/**
 * Reactive state for ad interactions that needs to be synced across the app.
 */
export interface AdLiveState {
    user_liked?: boolean;
    likes_count?: number;
    like_count?: number;
    likeCount?: number;
    like_pending?: boolean;
    ad_coin_collected?: boolean;
    ad_like_locked?: boolean;
    views_count?: number;
    viewCount?: number;
    impressions?: number;
    impressions_count?: number;
    impressionsCount?: number;
    comments_count?: number;
    commentCount?: number;
    shares_count?: number;
    shareCount?: number;
    current_reach?: number;
    reach?: number;
    clicks?: number;
    link_actions?: number;
    message_clicks?: number;
    visit_clicks?: number;
    call_clicks?: number;
    is_subscribed?: boolean;
    // New fields for Product Promote ads
    selected_size?: string | null;
    selected_variant_index?: number | null;
    quantity?: number;
}

const numberOrUndefined = (value: any) => {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : undefined;
};

interface AdStore {
    adStates: Record<string, AdLiveState>;
    adStatesByViewer: Record<string, Record<string, AdLiveState>>;
    viewerKey: string | null;
    
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
    setViewer: (viewer: any) => void;
    setViewerContext: (viewer: any) => void;
    resetAdState: () => void;
    resetViewerState: () => void;
    clearAdStore: () => void;
}

export const useAdStore = create<AdStore>((set, get) => ({
    adStates: {},
    adStatesByViewer: {},
    viewerKey: null,
    
    updateAdState: (item, updates) => {
        const id = getAdInteractionId(item);
        if (!id) return;
        
        set((state) => {
            const viewerKey = state.viewerKey || "__guest__";
            const viewerStates = state.adStatesByViewer[viewerKey] || {};
            const current = viewerStates[id] || {};
            const next = typeof updates === 'function' ? updates(current) : updates;
            const normalizedNext = {
                ...next,
                ...((next.like_count !== undefined || next.likeCount !== undefined) && next.likes_count === undefined ? { likes_count: next.like_count ?? next.likeCount } : {}),
                ...(next.likes_count !== undefined && next.like_count === undefined ? { like_count: next.likes_count, likeCount: next.likes_count } : {}),
                ...(next.comments_count !== undefined && next.commentCount === undefined ? { commentCount: next.comments_count } : {}),
                ...(next.commentCount !== undefined && next.comments_count === undefined ? { comments_count: next.commentCount } : {}),
                ...(next.shares_count !== undefined && next.shareCount === undefined ? { shareCount: next.shares_count } : {}),
                ...(next.shareCount !== undefined && next.shares_count === undefined ? { shares_count: next.shareCount } : {}),
                ...(next.views_count !== undefined && next.viewCount === undefined ? { viewCount: next.views_count } : {}),
                ...(next.viewCount !== undefined && next.views_count === undefined ? { views_count: next.viewCount } : {}),
                ...(next.impressions !== undefined && next.impressions_count === undefined ? { impressions_count: next.impressions, impressionsCount: next.impressions } : {}),
                ...(next.impressions_count !== undefined && next.impressions === undefined ? { impressions: next.impressions_count, impressionsCount: next.impressions_count } : {}),
                ...(next.impressionsCount !== undefined && next.impressions === undefined ? { impressions: next.impressionsCount, impressions_count: next.impressionsCount } : {}),
                ...(next.current_reach !== undefined && next.reach === undefined ? { reach: next.current_reach } : {}),
                ...(next.reach !== undefined && next.current_reach === undefined ? { current_reach: next.reach } : {}),
                ...(next.clicks !== undefined && next.link_actions === undefined ? { link_actions: next.clicks } : {}),
                ...(next.link_actions !== undefined && next.clicks === undefined ? { clicks: next.link_actions } : {}),
            };
            const nextViewerStates = {
                ...viewerStates,
                [id]: { ...current, ...normalizedNext }
            };
            return {
                adStates: nextViewerStates,
                adStatesByViewer: {
                    ...state.adStatesByViewer,
                    [viewerKey]: nextViewerStates,
                },
            };
        });
    },
    
    getAdState: (item) => {
        const id = getAdInteractionId(item);
        if (!id) return {};
        const state = get();
        const viewerKey = state.viewerKey || "__guest__";
        return state.adStatesByViewer[viewerKey]?.[id] || state.adStates[id] || {};
    },

    syncAds: (ads) => {
        if (!ads || !Array.isArray(ads)) return;
        
        set((state) => {
            const viewerKey = state.viewerKey || "__guest__";
            const nextStates = { ...(state.adStatesByViewer[viewerKey] || {}) };
            let hasChanges = false;

            ads.forEach(ad => {
                const id = getAdInteractionId(ad);
                if (!id) return;

                const current = nextStates[id] || {};
                const incoming: AdLiveState = {};
                
                // Seed missing values from API data while preserving live interaction state.
                if (!current.like_pending && ad.user_liked !== undefined) incoming.user_liked = ad.user_liked;
                const nextLikesCount = numberOrUndefined(ad.likes_count ?? ad.like_count ?? ad.likeCount);
                if (!current.like_pending && nextLikesCount !== current.likes_count) incoming.likes_count = nextLikesCount;
                if ((current.like_count === undefined || incoming.likes_count !== undefined) && (incoming.likes_count ?? current.likes_count) !== undefined) {
                    incoming.like_count = incoming.likes_count ?? current.likes_count;
                    incoming.likeCount = incoming.likes_count ?? current.likes_count;
                }
                // Never overwrite a collected/locked state with false — the store is the
                // source of truth once a coin is collected, even if stale API data says false
                // (e.g. home feed fetched without auth returns ad_coin_collected = null).
                if (ad.ad_coin_collected !== undefined && !current.ad_coin_collected) incoming.ad_coin_collected = !!ad.ad_coin_collected;
                if (ad.ad_like_locked !== undefined && !current.ad_like_locked) incoming.ad_like_locked = !!ad.ad_like_locked;
                if (!current.like_pending && (incoming.ad_coin_collected || current.ad_coin_collected)) incoming.user_liked = true;
                const nextViewsCount = numberOrUndefined(ad.views_count ?? ad.viewCount);
                if (nextViewsCount !== current.views_count) incoming.views_count = nextViewsCount;
                if (incoming.views_count !== undefined) incoming.viewCount = incoming.views_count;
                const nextImpressions = numberOrUndefined(ad.impressions ?? ad.impressions_count ?? ad.impressionsCount);
                if (nextImpressions !== current.impressions) incoming.impressions = nextImpressions;
                if (incoming.impressions !== undefined) {
                    incoming.impressions_count = incoming.impressions;
                    incoming.impressionsCount = incoming.impressions;
                }
                const nextCommentsCount = numberOrUndefined(ad.comments_count ?? ad.commentCount);
                if (nextCommentsCount !== current.comments_count) incoming.comments_count = nextCommentsCount;
                if (incoming.comments_count !== undefined) incoming.commentCount = incoming.comments_count;
                const nextSharesCount = numberOrUndefined(ad.shares_count ?? ad.shareCount);
                if (nextSharesCount !== current.shares_count) incoming.shares_count = nextSharesCount;
                if (incoming.shares_count !== undefined) incoming.shareCount = incoming.shares_count;
                const nextReach = numberOrUndefined(ad.current_reach ?? ad.reach);
                if (nextReach !== current.current_reach) incoming.current_reach = nextReach;
                if (incoming.current_reach !== undefined) incoming.reach = incoming.current_reach;
                const nextClicks = numberOrUndefined(ad.clicks ?? ad.link_actions);
                if (nextClicks !== current.clicks) incoming.clicks = nextClicks;
                if (incoming.clicks !== undefined) incoming.link_actions = incoming.clicks;
                const nextMessageClicks = numberOrUndefined(ad.message_clicks);
                if (nextMessageClicks !== current.message_clicks) incoming.message_clicks = nextMessageClicks;
                const nextVisitClicks = numberOrUndefined(ad.visit_clicks);
                if (nextVisitClicks !== current.visit_clicks) incoming.visit_clicks = nextVisitClicks;
                const nextCallClicks = numberOrUndefined(ad.call_clicks);
                if (nextCallClicks !== current.call_clicks) incoming.call_clicks = nextCallClicks;

                // Simple shallow comparison to avoid unnecessary state updates
                const merged = { ...current, ...incoming };
                if (JSON.stringify(current) !== JSON.stringify(merged)) {
                    nextStates[id] = merged;
                    hasChanges = true;
                }
            });

            return hasChanges ? {
                adStates: nextStates,
                adStatesByViewer: {
                    ...state.adStatesByViewer,
                    [viewerKey]: nextStates,
                },
            } : state;
        });
    },

    setViewer: (viewer) => {
        const nextViewerKey =
            viewer === null || viewer === undefined || viewer === ""
                ? null
                : String(viewer?.id ?? viewer?.user_id ?? viewer);

        set((state) => {
            if (state.viewerKey === nextViewerKey) return state;
            // Merge any guest-session state into the viewer partition so that
            // actions taken before setViewer was called (e.g. coin collected on
            // home feed before shop page sets viewer) are not silently lost.
            const guestStates = state.adStatesByViewer["__guest__"] || {};
            const viewerStates = state.adStatesByViewer[nextViewerKey || "__guest__"] || {};
            const merged = { ...guestStates, ...viewerStates };
            return {
                viewerKey: nextViewerKey,
                adStates: merged,
                adStatesByViewer: {
                    ...state.adStatesByViewer,
                    [nextViewerKey || "__guest__"]: merged,
                },
            };
        });
    },

    setViewerContext: (viewer) => {
        get().setViewer(viewer);
    },

    resetAdState: () => {
        const viewerKey = get().viewerKey || "__guest__";
        set((state) => ({
            adStates: {},
            adStatesByViewer: {
                ...state.adStatesByViewer,
                [viewerKey]: {},
            },
        }));
    },

    resetViewerState: () => {
        const viewerKey = get().viewerKey || "__guest__";
        set((state) => ({
            adStates: {},
            adStatesByViewer: {
                ...state.adStatesByViewer,
                [viewerKey]: {},
            },
        }));
    },

    clearAdStore: () => set({
        adStates: {},
        adStatesByViewer: {},
        viewerKey: null,
    }),
}));
