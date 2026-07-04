import { API_URL } from "./apiConfig";

const isClient = typeof window !== "undefined";

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

export type UploadContentRecord = {
    id: number;
    contentId: string;
    content_id: string;
    content_type?: "vault" | "flash";
    user_id?: number | string | null;
    reseller_ref?: string | null;
    resell_ref?: string | null;
    description: string;
    topic: string;
    price: number;
    subscription_packages?: Array<{ id: string; price: number; days: number; affiliateCommission?: number }>;
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
        return result?.content as UploadContentRecord;
    },

    getPublicApproved: async (topic?: string) => {
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
    },

    getPublicApprovedByUser: async (userId: string | number) => {
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
    },

    getMine: async () => {
        const response = await fetch(`${API_URL}/upload-content/my`, {
            method: "GET",
            headers: getHeaders(),
            cache: "no-store",
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || "Failed to fetch your upload content");
        return Array.isArray(result?.contents) ? (result.contents as UploadContentRecord[]) : [];
    },

    toggleLike: async (contentId: string | number) => {
        const response = await fetch(`${API_URL}/upload-content/${contentId}/like`, {
            method: "POST",
            headers: getHeaders(),
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || "Failed to update like");
        return {
            liked: !!result?.liked,
            likes_count: Number(result?.likes_count || 0),
        };
    },

    purchaseCreatorSubscription: async (contentId: string | number, packageId: string, resellerRef?: string | null) => {
        const response = await fetch(`${API_URL}/upload-content/${contentId}/subscriptions/purchase`, {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify({ packageId, reseller_ref: resellerRef || null }),
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(getErrorMessage(result, "Failed to purchase subscription"));
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
        return {
            purchase: result?.purchase as UploadContentPurchase,
            walletBalance: Number(result?.walletBalance ?? 0),
            alreadyPurchased: !!result?.alreadyPurchased,
        };
    },

    logShare: async (contentId: string | number) => {
        const response = await fetch(`${API_URL}/upload-content/${contentId}/share`, {
            method: "POST",
            headers: getHeaders(),
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || "Failed to log share");
        return {
            shares_count: Number(result?.shares_count || 0),
        };
    },

    repostContent: async (contentId: string | number) => {
        const response = await fetch(`${API_URL}/upload-content/${contentId}/repost`, {
            method: "POST",
            headers: getHeaders(),
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || "Failed to repost content");
        return {
            reposts_count: Number(result?.reposts_count || 0),
            alreadyReposted: !!result?.alreadyReposted,
        };
    },

    togglePin: async (contentId: string | number) => {
        const response = await fetch(`${API_URL}/upload-content/${contentId}/pin`, {
            method: "POST",
            headers: getHeaders(),
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || "Failed to update pin");
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
        const response = await fetch(`${API_URL}/upload-content/${contentId}/view`, {
            method: "POST",
            headers: getHeaders(),
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || "Failed to log view");
        return {
            views_count: Number(result?.views_count || 0),
        };
    },

    addComment: async (contentId: string | number, comment: string, parentId?: string | number) => {
        const response = await fetch(`${API_URL}/upload-content/${contentId}/comments`, {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify({ comment, parentId }),
        });
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result?.message || "Failed to add comment");
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
