import { API_URL } from "./apiConfig";

const isClient = typeof window !== "undefined";
const uploadInsightsCache = new Map<string, UploadContentInsights>();
const uploadInsightsInflight = new Map<string, Promise<UploadContentInsights>>();
const uploadListCache = new Map<string, { expiresAt: number; data: any }>();
const uploadListInflight = new Map<string, Promise<any>>();
const UPLOAD_LIST_CACHE_TTL_MS = 15_000;
const uploadViewCache = new Map<string, { expiresAt: number; data: { views_count: number } }>();
const uploadViewInflight = new Map<string, Promise<{ views_count: number }>>();
const UPLOAD_VIEW_DEDUPE_MS = 8_000;
const uploadShareCache = new Map<string, { expiresAt: number; data: { shares_count: number } }>();
const uploadShareInflight = new Map<string, Promise<{ shares_count: number }>>();
const UPLOAD_SHARE_DEDUPE_MS = 8_000;
const uploadLikeInflight = new Map<string, Promise<{ liked: boolean; likes_count: number }>>();

const getToken = () => {
    if (!isClient) return null;
    try {
        return window.sessionStorage.getItem("token") || window.localStorage.getItem("token");
    } catch {
        return null;
    }
};

const getHeaders = (isFormData = false) => {
    const token = getToken();
    const headers: Record<string, string> = {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    if (!isFormData) {
        headers["Content-Type"] = "application/json";
    }
    return headers;
};

const safeJson = async (response: Response) => {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
        return response.json();
    }
    const text = await response.text().catch(() => "");
    return text ? { message: text } : null;
};

const getErrorMessage = (result: any, fallback: string) => {
    if (typeof result === "string" && result.trim()) return result.trim();
    return String(
        result?.message ||
        result?.error ||
        result?.details ||
        fallback
    );
};

const createHttpError = (message: string, status?: number) => {
    const error = new Error(message) as Error & { status?: number };
    error.status = status;
    return error;
};

const getCachedList = async <T>(key: string, loader: () => Promise<T>): Promise<T> => {
    const cached = uploadListCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.data as T;
    }

    const inflight = uploadListInflight.get(key);
    if (inflight) {
        return inflight as Promise<T>;
    }

    const request = loader()
        .then((data) => {
            uploadListCache.set(key, {
                expiresAt: Date.now() + UPLOAD_LIST_CACHE_TTL_MS,
                data,
            });
            return data;
        })
        .finally(() => {
            uploadListInflight.delete(key);
        });

    uploadListInflight.set(key, request);
    return request;
};

const clearUploadListCaches = () => {
    uploadListCache.clear();
    uploadListInflight.clear();
};

const getDedupedUploadView = async (contentId: string | number, loader: () => Promise<{ views_count: number }>) => {
    const key = String(contentId);
    const cached = uploadViewCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.data;
    }

    const inflight = uploadViewInflight.get(key);
    if (inflight) {
        return inflight;
    }

    const request = loader()
        .then((data) => {
            uploadViewCache.set(key, {
                expiresAt: Date.now() + UPLOAD_VIEW_DEDUPE_MS,
                data,
            });
            return data;
        })
        .finally(() => {
            uploadViewInflight.delete(key);
        });

    uploadViewInflight.set(key, request);
    return request;
};

const getDedupedUploadShare = async (contentId: string | number, loader: () => Promise<{ shares_count: number }>) => {
    const key = String(contentId);
    const cached = uploadShareCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.data;
    }

    const inflight = uploadShareInflight.get(key);
    if (inflight) {
        return inflight;
    }

    const request = loader()
        .then((data) => {
            uploadShareCache.set(key, {
                expiresAt: Date.now() + UPLOAD_SHARE_DEDUPE_MS,
                data,
            });
            return data;
        })
        .finally(() => {
            uploadShareInflight.delete(key);
        });

    uploadShareInflight.set(key, request);
    return request;
};

const getDedupedUploadLike = async (
    contentId: string | number,
    loader: () => Promise<{ liked: boolean; likes_count: number }>,
) => {
    const key = String(contentId);
    const inflight = uploadLikeInflight.get(key);
    if (inflight) {
        return inflight;
    }

    const request = loader().finally(() => {
        uploadLikeInflight.delete(key);
    });

    uploadLikeInflight.set(key, request);
    return request;
};

export type UploadContentRecord = {
    id: number;
    contentId: string;
    content_id: string;
    content_type?: "vault" | "flash";
    user_id?: number | string | null;
    owner_user_id?: number | string | null;
    reseller_ref?: string | null;
    resell_ref?: string | null;
    description: string;
    topic: string;
    price: number;
    subscription_packages?: Array<{ id: string; price: number; days: number; minutes?: number; affiliateCommission?: number }>;
    affiliate_commission: number;
    hashtags: string[];
    allow_comments: boolean;
    show_link_on_home: boolean;
    external_link: string;
    media_type: string;
    media_preview: string;
    media_gallery: string[];
    thumbnail_url: string;
    content_access_mode: "blurred" | "unblurred";
    visibility: "public" | "subscribers_only" | "private";
    preview_mode?: "thumbnail" | "auto_preview";
    preview_url?: string;
    video_duration_seconds?: number;
    videoDurationSeconds?: number;
    video_trim_start_seconds?: number;
    videoTrimStartSeconds?: number;
    video_trim_end_seconds?: number;
    videoTrimEndSeconds?: number;
    video_original_duration_seconds?: number;
    videoOriginalDurationSeconds?: number;
    status: "Pending Approval" | "Approved" | "Rejected";
    rejection_reason?: string | null;
    admin_note?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    approved_at?: string | null;
    expires_at?: string | null;
    username?: string | null;
    full_name?: string | null;
    profile_picture?: string | null;
    user_type?: string | null;
    reposted_by_username?: string | null;
    reposted_by_user_id?: number | string | null;
    reposted_by_full_name?: string | null;
    reposted_by_profile_picture?: string | null;
    reposted_at?: string | null;
    user_reposted?: boolean;
    userReposted?: boolean;
    likes_count?: number;
    likeCount?: number;
    comments_count?: number;
    commentCount?: number;
    shares_count?: number;
    shareCount?: number;
    reposts_count?: number;
    repostCount?: number;
    views_count?: number;
    viewCount?: number;
    user_liked?: boolean;
    user_purchased?: boolean;
    user_has_access?: boolean;
    user_purchase_expires_at?: string | null;
    pinned_at?: string | null;
    reports_count?: number;
};

export type UploadContentSubscriptionPurchase = {
    id: number;
    buyer_id: number;
    creator_id: number;
    content_id: number;
    package_id: string;
    package_days: number;
    package_minutes?: number;
    amount: number;
    commission_percentage: number;
    commission_amount: number;
    creator_amount: number;
    wallet_transfer_id: number;
    starts_at?: string | null;
    expires_at?: string | null;
};

export type UploadContentPurchase = {
    id: number;
    buyer_id: number;
    creator_id: number;
    content_id: number;
    amount: number;
    commission_percentage: number;
    commission_amount: number;
    creator_amount: number;
    wallet_transfer_id: number;
    created_at?: string | null;
    expires_at?: string | null;
};

export type UploadContentInsightsRange = "today" | "7d" | "30d" | "all";

export type UploadContentInsightRow = {
    label: string;
    count?: number;
    value?: number;
    percentage?: number;
};

export type UploadContentTrendRow = {
    date: string;
    views: number;
    sales: number;
    earnings: number;
    shares: number;
};

export type UploadContentInsights = {
    range: UploadContentInsightsRange;
    totals: {
        views: number;
        earnings: number;
        sales: number;
        shares: number;
    };
    trend: UploadContentTrendRow[];
    countries: UploadContentInsightRow[];
    audienceTypes: UploadContentInsightRow[];
    genders: UploadContentInsightRow[];
    ages: UploadContentInsightRow[];
};

type CreateContentOptions = {
    onUploadProgress?: (percent: number) => void;
};

export const uploadContentService = {
    createContent: async (payload: FormData | Record<string, unknown>, options: CreateContentOptions = {}) => {
        const isFormData = payload instanceof FormData;
        if (isFormData && options.onUploadProgress && isClient) {
            return new Promise<UploadContentRecord>((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open("POST", `${API_URL}/upload-content`);
                const token = getToken();
                if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
                xhr.upload.onprogress = (event) => {
                    if (!event.lengthComputable || event.total <= 0) return;
                    options.onUploadProgress?.(Math.min(99, Math.round((event.loaded / event.total) * 100)));
                };
                xhr.onload = () => {
                    const contentType = xhr.getResponseHeader("content-type") || "";
                    let result: any = { message: xhr.responseText };
                    if (contentType.includes("application/json") && xhr.responseText) {
                        try {
                            result = JSON.parse(xhr.responseText);
                        } catch {
                            result = { message: xhr.responseText };
                        }
                    }
                    if (xhr.status < 200 || xhr.status >= 300) {
                        reject(new Error(getErrorMessage(result, "Failed to submit upload content")));
                        return;
                    }
                    options.onUploadProgress?.(100);
                    clearUploadListCaches();
                    resolve(result?.content as UploadContentRecord);
                };
                xhr.onerror = () => reject(new Error("Upload failed. Please check your connection and try again."));
                xhr.onabort = () => reject(new Error("Upload was cancelled."));
                xhr.send(payload);
            });
        }
        const response = await fetch(`${API_URL}/upload-content`, {
            method: "POST",
            headers: getHeaders(isFormData),
            body: isFormData ? payload : JSON.stringify(payload),
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(getErrorMessage(result, "Failed to submit upload content"));
        clearUploadListCaches();
        return result?.content as UploadContentRecord;
    },

    getPublicApproved: async (topic?: string) => {
        const cacheKey = `public:${topic || "all"}`;
        return getCachedList(cacheKey, async () => {
            const qs = new URLSearchParams();
            if (topic) qs.set("topic", topic);
            const response = await fetch(`${API_URL}/upload-content/public${qs.toString() ? `?${qs.toString()}` : ""}`, {
                method: "GET",
                headers: getHeaders(),
                cache: "no-store",
            });
            const result = await safeJson(response);
            if (!response.ok) throw new Error(result?.message || "Failed to fetch upload content");
            return {
                contents: Array.isArray(result?.contents) ? (result.contents as UploadContentRecord[]) : [],
                topics: Array.isArray(result?.topics) ? (result.topics as string[]) : [],
            };
        });
    },

    getPublicApprovedByUser: async (userId: string | number) => {
        const cacheKey = `public-user:${String(userId)}`;
        return getCachedList(cacheKey, async () => {
            const qs = new URLSearchParams();
            qs.set("userId", String(userId));
            const response = await fetch(`${API_URL}/upload-content/public?${qs.toString()}`, {
                method: "GET",
                headers: getHeaders(),
                cache: "no-store",
            });
            const result = await safeJson(response);
            if (!response.ok) throw new Error(result?.message || "Failed to fetch user upload content");
            return Array.isArray(result?.contents) ? (result.contents as UploadContentRecord[]) : [];
        });
    },

    getPublicApprovedByShareCode: async (shareCode: string) => {
        const normalizedShareCode = String(shareCode || "").trim();
        if (!normalizedShareCode) throw new Error("Share code is required");
        const response = await fetch(`${API_URL}/upload-content/public/reel/${encodeURIComponent(normalizedShareCode)}`, {
            method: "GET",
            headers: getHeaders(),
            cache: "no-store",
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || "Failed to fetch upload content");
        return result?.content as UploadContentRecord;
    },

    getMine: async () => {
        return getCachedList("mine", async () => {
            const response = await fetch(`${API_URL}/upload-content/my`, {
                method: "GET",
                headers: getHeaders(),
                cache: "no-store",
            });
            const result = await safeJson(response);
            if (!response.ok) throw new Error(result?.message || "Failed to fetch your upload content");
            return Array.isArray(result?.contents) ? (result.contents as UploadContentRecord[]) : [];
        });
    },

    toggleLike: async (contentId: string | number) => {
        return getDedupedUploadLike(contentId, async () => {
            const response = await fetch(`${API_URL}/upload-content/${contentId}/like`, {
                method: "POST",
                headers: getHeaders(),
            });
            const result = await safeJson(response);
            if (!response.ok) throw createHttpError(result?.message || "Failed to update like", response.status);
            clearUploadListCaches();
            return {
                liked: !!result?.liked,
                likes_count: Number(result?.likes_count || 0),
            };
        });
    },

    purchaseCreatorSubscription: async (contentId: string | number, packageId: string, resellerRef?: string | null) => {
        const response = await fetch(`${API_URL}/upload-content/${contentId}/subscriptions/purchase`, {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify({ packageId, reseller_ref: resellerRef || null }),
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(getErrorMessage(result, "Failed to purchase subscription"));
        clearUploadListCaches();
        return result?.subscription as UploadContentSubscriptionPurchase;
    },

    purchaseVaultContent: async (contentId: string | number, resellerRef?: string | null) => {
        const response = await fetch(`${API_URL}/upload-content/${contentId}/purchase`, {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify({ reseller_ref: resellerRef || null }),
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(getErrorMessage(result, "Unable to unlock this content right now."));
        clearUploadListCaches();
        return {
            purchase: result?.purchase as UploadContentPurchase,
            walletBalance: Number(result?.walletBalance ?? 0),
            alreadyPurchased: !!result?.alreadyPurchased,
        };
    },

    logShare: async (contentId: string | number) => {
        return getDedupedUploadShare(contentId, async () => {
            const response = await fetch(`${API_URL}/upload-content/${contentId}/share`, {
                method: "POST",
                headers: getHeaders(),
            });
            const result = await safeJson(response);
            if (!response.ok) throw createHttpError(result?.message || "Failed to log share", response.status);
            clearUploadListCaches();
            return {
                shares_count: Number(result?.shares_count || 0),
            };
        });
    },

    repostContent: async (contentId: string | number) => {
        const response = await fetch(`${API_URL}/upload-content/${contentId}/repost`, {
            method: "POST",
            headers: getHeaders(),
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || "Failed to repost content");
        clearUploadListCaches();
        return {
            reposts_count: Number(result?.reposts_count || 0),
            alreadyReposted: !!result?.alreadyReposted,
        };
    },

    removeRepost: async (contentId: string | number) => {
        const response = await fetch(`${API_URL}/upload-content/${contentId}/repost`, {
            method: "DELETE",
            headers: getHeaders(),
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || "Failed to remove repost");
        clearUploadListCaches();
        return {
            reposts_count: Number(result?.reposts_count || 0),
            removed: !!result?.removed,
        };
    },

    deleteContent: async (contentId: string | number) => {
        const response = await fetch(`${API_URL}/upload-content/${contentId}`, {
            method: "DELETE",
            headers: getHeaders(),
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || "Failed to delete content");
        clearUploadListCaches();
        return {
            deleted: !!result?.deleted,
            contentId: result?.contentId ?? contentId,
        };
    },

    getInsights: async (contentId: string | number, range: UploadContentInsightsRange = "7d") => {
        const cacheKey = `${contentId}:${range}`;
        const cached = uploadInsightsCache.get(cacheKey);
        if (cached) return cached;

        const inflight = uploadInsightsInflight.get(cacheKey);
        if (inflight) return inflight;

        const request = (async () => {
            const response = await fetch(`${API_URL}/upload-content/${contentId}/insights?range=${encodeURIComponent(range)}`, {
                method: "GET",
                headers: getHeaders(),
            });
            const result = await safeJson(response);
            if (!response.ok) throw new Error(result?.message || "Failed to load insights");
            const insights = result?.insights as UploadContentInsights;
            uploadInsightsCache.set(cacheKey, insights);
            return insights;
        })().finally(() => {
            uploadInsightsInflight.delete(cacheKey);
        });

        uploadInsightsInflight.set(cacheKey, request);
        return request;
    },

    prefetchInsights: async (contentId: string | number, range: UploadContentInsightsRange = "7d") => {
        try {
            await uploadContentService.getInsights(contentId, range);
        } catch {
            // Prefetch is best-effort only.
        }
    },

    togglePin: async (contentId: string | number) => {
        const response = await fetch(`${API_URL}/upload-content/${contentId}/pin`, {
            method: "POST",
            headers: getHeaders(),
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || "Failed to update pin");
        clearUploadListCaches();
        return result?.content as UploadContentRecord;
    },

    reportContent: async (contentId: string | number, reason: string, customReason?: string) => {
        const response = await fetch(`${API_URL}/upload-content/${contentId}/report`, {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify({ reason, custom_reason: customReason }),
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || "Failed to submit report");
        return result;
    },

    logView: async (contentId: string | number) => {
        return getDedupedUploadView(contentId, async () => {
            const response = await fetch(`${API_URL}/upload-content/${contentId}/view`, {
                method: "POST",
                headers: getHeaders(),
            });
            const result = await safeJson(response);
            if (!response.ok) throw new Error(result?.message || "Failed to log view");
            clearUploadListCaches();
            return {
                views_count: Number(result?.views_count || 0),
            };
        });
    },

    addComment: async (contentId: string | number, comment: string, parentId?: string | number) => {
        const response = await fetch(`${API_URL}/upload-content/${contentId}/comments`, {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify({ comment, parentId }),
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || "Failed to add comment");
        clearUploadListCaches();
        return result?.comment;
    },

    getComments: async (contentId: string | number) => {
        const response = await fetch(`${API_URL}/upload-content/${contentId}/comments`, {
            method: "GET",
            headers: getHeaders(),
            cache: "no-store",
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || "Failed to fetch comments");
        return Array.isArray(result?.comments) ? result.comments : [];
    },

    deleteComment: async (commentId: string | number) => {
        const response = await fetch(`${API_URL}/upload-content/comments/${commentId}`, {
            method: "DELETE",
            headers: getHeaders(),
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || "Failed to delete comment");
        clearUploadListCaches();
        return result;
    },

    likeComment: async (commentId: string | number) => {
        const response = await fetch(`${API_URL}/upload-content/comments/${commentId}/like`, {
            method: "POST",
            headers: getHeaders(),
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || "Failed to like comment");
        return result;
    },

    dislikeComment: async (commentId: string | number) => {
        const response = await fetch(`${API_URL}/upload-content/comments/${commentId}/dislike`, {
            method: "POST",
            headers: getHeaders(),
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || "Failed to dislike comment");
        return result;
    },

    reportComment: async (commentId: string | number) => {
        const response = await fetch(`${API_URL}/upload-content/comments/${commentId}/report`, {
            method: "POST",
            headers: getHeaders(),
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || "Failed to report comment");
        return result;
    },

    getLikes: async (contentId: string | number) => {
        const response = await fetch(`${API_URL}/upload-content/${contentId}/likes`, {
            method: "GET",
            headers: getHeaders(),
            cache: "no-store",
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || "Failed to fetch likes");
        return Array.isArray(result?.likes) ? result.likes : [];
    },

    getShares: async (contentId: string | number) => {
        const response = await fetch(`${API_URL}/upload-content/${contentId}/shares`, {
            method: "GET",
            headers: getHeaders(),
            cache: "no-store",
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || "Failed to fetch shares");
        return Array.isArray(result?.shares) ? result.shares : [];
    },

    getViews: async (contentId: string | number) => {
        const response = await fetch(`${API_URL}/upload-content/${contentId}/views`, {
            method: "GET",
            headers: getHeaders(),
            cache: "no-store",
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || "Failed to fetch views");
        return Array.isArray(result?.views) ? result.views : [];
    },
};
