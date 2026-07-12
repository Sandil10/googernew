"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import IonIcon from "@/app/components/IonIcon";
import { InteractionButton } from "@/app/components/InteractionButton";
import UploadContentMedia from "@/app/components/UploadContentMedia";
import UploadContentWatchModal from "@/app/components/UploadContentWatchModal";
import LoginModal from "@/app/components/auth/LoginModal";
import SubscribeButton from "@/app/components/SubscribeButton";
import { UserVerifiedBadge } from "@/app/components/VerifiedBadge";
import { authService } from "@/services/authService";
import { uploadContentService, type UploadContentRecord } from "@/services/uploadContentService";
import { formatRelativeTime } from "@/app/lib/relativeTime";
import { getPublicProfileHref } from "@/app/lib/profileRoute";
import { getSponsoredLinkPreviewImage, normalizeExternalUrl } from "@/app/components/ads/adHelpers";
import {
    AVATAR_IMAGE_SIZES,
    FEED_IMAGE_BLUR_DATA_URL,
    normalizeMediaSrc,
    shouldBypassNextImageOptimization,
} from "@/app/lib/mediaOptimization";

const renderHashtagText = (text: string) =>
    text.split(/(#[\p{L}\p{N}_]+)/gu).map((part, index) =>
        part.startsWith("#")
            ? <span key={index} className="text-red-500">{part}</span>
            : <span key={index}>{part}</span>,
    );

export type UploadContentSheetType = "likes" | "comments" | "shares" | "views";

const VAULT_QUICK_UNLOCK_KEY = "googer-vault-watch-quick-unlock-v1";

const isUploadSupportAccount = (userType?: string | null) => {
    const normalized = String(userType || "").trim().toLowerCase().replace(/-/g, "_");
    return normalized === "super_admin" || normalized === "superadmin";
};

const canModerateUploadInsights = (viewer: any) => {
    const normalized = String(
        viewer?.user_type ??
        viewer?.userType ??
        viewer?.owner_user_type ??
        viewer?.ownerUserType ??
        "",
    ).trim().toLowerCase().replace(/-/g, "_");
    return ["admin", "administrator", "employee", "moderator", "super_admin", "superadmin"].includes(normalized);
};

const parseTimestamp = (value?: string | null) => {
    if (!value) return null;
    const normalized = value.includes("Z") || /[+-]\d{2}:?\d{2}$/.test(value)
        ? value
        : `${value.replace(" ", "T")}Z`;
    const parsed = Date.parse(normalized);
    return Number.isFinite(parsed) ? parsed : null;
};

const getUploadVisibleTimestamp = (item: UploadContentRecord) => {
    // For approved content, show approval time (when admin approved) — but guard against
    // a bad/future approved_at (e.g. a server that mistakenly stores it ahead of real time).
    // A future timestamp would otherwise render as "just now" forever, so fall back to created_at.
    if (item.status === "Approved" && item.approved_at) {
        const approvedAtTs = parseTimestamp(item.approved_at);
        if (approvedAtTs !== null && approvedAtTs <= Date.now() + 60_000) {
            return item.approved_at;
        }
        // approved_at is in the future / unparseable — use creation time instead
        return item.created_at || item.updated_at || null;
    }
    // For non-approved content, show creation time
    if (item.created_at) {
        return item.created_at;
    }
    // Last resort: updated_at
    return item.updated_at || null;
};

export const isUploadOwnedByViewer = (item: UploadContentRecord, viewer: any) => {
    const viewerIds = new Set(
        [viewer?.id, viewer?.user_id, viewer?.owner_user_id]
            .map((value) => String(value ?? "").trim())
            .filter(Boolean),
    );

    if (!viewerIds.size) return false;

    return [item.user_id, item.owner_user_id]
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
        .some((value) => viewerIds.has(value));
};

const getUploadContentStatusMeta = (status?: UploadContentRecord["status"]) => {
    if (status === "Approved") {
        return {
            label: "Approved",
            icon: "checkmark-circle-outline",
            className: "border-emerald-400/25 bg-emerald-500/10 text-emerald-300",
            helper: "Accepted by admin. This can appear on Home while it is active.",
        };
    }
    if (status === "Rejected") {
        return {
            label: "Rejected",
            icon: "close-circle-outline",
            className: "border-red-400/25 bg-red-500/10 text-red-300",
            helper: "Rejected by admin. Only you can see this item here.",
        };
    }
    return {
        label: "Reviewing",
        icon: "time-outline",
        className: "border-amber-400/25 bg-amber-500/10 text-amber-200",
        helper: "Waiting for admin approval. Other users cannot see it yet.",
    };
};

export default function UploadContentFeedCard({
    item,
    currentUser,
    onOpenProfile,
    onToggleLike,
    onOpenSheet,
    onShare,
    onRepost,
    onRemoveRepost,
    onLogView,
    onPin,
    onReport,
    onNotInterested,
    onInsights,
    onAccessChanged,
    onEdit,
    onDelete,
    flashContentAutoPlay,
    flashPreviewSeconds = 5,
    showStatusMeta = false,
    maxWidthClassName,
    articleClassName = "",
    autoOpenWatchKey,
    onFullViewClose,
}: {
    item: UploadContentRecord;
    currentUser: any;
    onOpenProfile: () => void;
    onToggleLike: (item: UploadContentRecord) => void;
    onOpenSheet: (type: UploadContentSheetType, item: UploadContentRecord) => void;
    onShare: (item: UploadContentRecord) => void;
    onRepost: (item: UploadContentRecord) => void | Promise<void | { reposts_count?: number; repostCount?: number }>;
    onRemoveRepost?: (item: UploadContentRecord) => void | Promise<void | { reposts_count?: number; repostCount?: number }>;
    onLogView: (item: UploadContentRecord) => void;
    onPin: (item: UploadContentRecord) => void;
    onReport: (item: UploadContentRecord) => void;
    onNotInterested: (item: UploadContentRecord) => void;
    onInsights: (item: UploadContentRecord) => void;
    onAccessChanged: (item: UploadContentRecord, accessType?: "content" | "creator_subscription") => void;
    onEdit?: (item: UploadContentRecord) => void;
    onDelete?: (item: UploadContentRecord) => void;
    flashContentAutoPlay: boolean;
    flashPreviewSeconds?: number;
    showStatusMeta?: boolean;
    maxWidthClassName?: string;
    articleClassName?: string;
    autoOpenWatchKey?: string | number | null;
    onFullViewClose?: () => void;
}) {
    const router = useRouter();
    const media = item.media_preview || item.media_gallery?.[0] || item.thumbnail_url;
    const showBlur = item.content_access_mode === "blurred";
    const isVideo = String(item.media_type || "").toLowerCase().includes("video");
    const isImage = String(item.media_type || "").toLowerCase().includes("image");
    const videoTrimStartSeconds = Math.max(0, Number(item.video_trim_start_seconds ?? item.videoTrimStartSeconds ?? 0) || 0);
    const videoTrimEndSeconds = Math.max(0, Number(item.video_trim_end_seconds ?? item.videoTrimEndSeconds ?? 0) || 0);
    const isFlashContent = item.content_type === "flash";
    const isLink = String(item.media_type || "").toLowerCase().includes("link");
    const linkPreviewImage = item.external_link ? getSponsoredLinkPreviewImage(item.external_link) : "";
    const isPlayableFlash = isFlashContent && (isVideo || isLink);
    const hasCreatorThumbnail = !!normalizeMediaSrc(item.thumbnail_url || "");
    const normalizedFlashPreviewSeconds = Math.max(1, Math.floor(Number(flashPreviewSeconds || 5)));
    const shouldAutoPlayFeedVideo = isFlashContent && flashContentAutoPlay && isVideo && !showBlur && !hasCreatorThumbnail && !linkPreviewImage;
    const feedPreviewMode = "thumbnail";
    const watchSource = item.external_link && (isVideo || isLink) ? item.external_link : media || "";
    const isSupportAccount = isUploadSupportAccount(item.user_type);
    const creatorName = isSupportAccount ? "Googer Support" : (item.username || item.full_name || "User");
    const canOpenLink = item.show_link_on_home && !!item.external_link;
    const hasLegacySupportAvatar = /ui-avatars\.com\/api\/\?name=G(?:&|$)/i.test(String(item.profile_picture || ""));
    const profileImage = normalizeMediaSrc(!isSupportAccount && hasLegacySupportAvatar ? "" : (item.profile_picture || ""));
    const visibleTimestamp = getUploadVisibleTimestamp(item);
    const createdLabel = visibleTimestamp ? formatRelativeTime(visibleTimestamp) : "Now";
    const likesCount = Number(item.likes_count ?? item.likeCount ?? 0);
    const viewsCount = Number(item.views_count ?? item.viewCount ?? 0);
    const commentsCount = Number(item.comments_count ?? item.commentCount ?? 0);
    const serverRepostsCount = Number(item.reposts_count ?? item.repostCount ?? 0);
    const repostedByName = item.reposted_by_username || item.reposted_by_full_name || "";
    const repostedByUserId = String(item.reposted_by_user_id || "").trim();
    const repostResellerRef = !isFlashContent && repostedByUserId ? repostedByUserId : null;
    const purchaseResellerRef = isFlashContent ? null : (item.reseller_ref || item.resell_ref || repostResellerRef);
    const serverUserReposted = !!(item.user_reposted ?? item.userReposted)
        || String(item.reposted_by_user_id || "") === String(currentUser?.id || currentUser?.user_id || "")
        || (!!item.reposted_by_username && String(item.reposted_by_username).toLowerCase() === String(currentUser?.username || "").toLowerCase())
        || (!!item.reposted_by_full_name && String(item.reposted_by_full_name).toLowerCase() === String(currentUser?.full_name || "").toLowerCase());
    const subscriptionPackages = Array.isArray(item.subscription_packages) ? item.subscription_packages : [];
    const hasSubscriptionPackages = subscriptionPackages.length > 0;
    const [showFullVideo, setShowFullVideo] = useState(false);
    const [showWatchConfirm, setShowWatchConfirm] = useState(false);
    const [watchConfirmBalance, setWatchConfirmBalance] = useState<number | null>(null);
    const [watchConfirmLoading, setWatchConfirmLoading] = useState(false);
    const [watchPurchaseLoading, setWatchPurchaseLoading] = useState(false);
    const [watchConfirmError, setWatchConfirmError] = useState("");
    const [enableQuickUnlock, setEnableQuickUnlock] = useState(false);
    const [showSubscriptionPlans, setShowSubscriptionPlans] = useState(false);
    const [selectedSubscriptionPlanId, setSelectedSubscriptionPlanId] = useState("");
    const [isPurchasingSubscription, setIsPurchasingSubscription] = useState(false);
    const [subscriptionPurchaseError, setSubscriptionPurchaseError] = useState("");
    const [subscriptionPurchaseMessage, setSubscriptionPurchaseMessage] = useState("");
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [showTopUpPrompt, setShowTopUpPrompt] = useState(false);
    const [topUpRequiredAmount, setTopUpRequiredAmount] = useState(0);
    const [hasUnlockedAccess, setHasUnlockedAccess] = useState(() => !!item.user_has_access || !!item.user_purchased);
    const [showLoginModal, setShowLoginModal] = useState(false);
    const [repostNotice, setRepostNotice] = useState("");
    const [repostBusy, setRepostBusy] = useState(false);
    const [showRemoveRepostPrompt, setShowRemoveRepostPrompt] = useState(false);
    const [showConfirmRepostPrompt, setShowConfirmRepostPrompt] = useState(false);
    const [flashPreviewComplete, setFlashPreviewComplete] = useState(false);
    const [flashPreviewStoppedAt, setFlashPreviewStoppedAt] = useState(0);
    const [localPurchaseExpiresAt, setLocalPurchaseExpiresAt] = useState<string | null>(item.user_purchase_expires_at || null);
    const [mediaAspectRatio, setMediaAspectRatio] = useState(1);
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [optimisticReposted, setOptimisticReposted] = useState(serverUserReposted);
    const [optimisticRepostsCount, setOptimisticRepostsCount] = useState(serverRepostsCount);
    const lastAutoOpenWatchKeyRef = useRef<string | number | null>(null);
    const selectedSubscriptionPlan = subscriptionPackages.find((plan) => String(plan.id) === selectedSubscriptionPlanId) || subscriptionPackages[0] || null;
    const isOwnContent = isUploadOwnedByViewer(item, currentUser);
    const canViewInsights = isOwnContent || canModerateUploadInsights(currentUser);
    const statusMeta = getUploadContentStatusMeta(item.status);
    const showStatusDetails = showStatusMeta && isOwnContent && item.status !== "Approved";
    const userReposted = optimisticReposted;
    const repostsCount = optimisticRepostsCount;

    useEffect(() => {
        setOptimisticReposted(serverUserReposted);
        setOptimisticRepostsCount(serverRepostsCount);
    }, [serverUserReposted, serverRepostsCount, item.id, item.reposted_at]);
    const normalizedHashtags = Array.from(
        new Set(
            (Array.isArray(item.hashtags) ? item.hashtags : [])
                .map((tag) => String(tag || "").trim())
                .filter(Boolean)
                .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`)),
        ),
    );

    // Image carousel logic
    const mediaGallery = Array.isArray(item.media_gallery) ? item.media_gallery : [];
    const hasMultipleImages = mediaGallery.length > 1;
    const currentDisplayImage = hasMultipleImages
        ? mediaGallery[currentImageIndex]
        : (item.media_preview || mediaGallery[0] || item.thumbnail_url);
    useEffect(() => {
        setHasUnlockedAccess(!!item.user_has_access || !!item.user_purchased);
        setLocalPurchaseExpiresAt(item.user_purchase_expires_at || null);
    }, [item.user_has_access, item.user_purchased, item.user_purchase_expires_at]);
    useEffect(() => {
        if (!localPurchaseExpiresAt || !hasUnlockedAccess || isOwnContent) return;
        const expiresMs = new Date(localPurchaseExpiresAt).getTime();
        if (!Number.isFinite(expiresMs)) return;
        const delayMs = expiresMs - Date.now();
        if (delayMs <= 0) {
            setHasUnlockedAccess(false);
            setLocalPurchaseExpiresAt(null);
            return;
        }
        const timeoutId = window.setTimeout(() => {
            setHasUnlockedAccess(false);
            setLocalPurchaseExpiresAt(null);
        }, delayMs);
        return () => window.clearTimeout(timeoutId);
    }, [hasUnlockedAccess, isOwnContent, localPurchaseExpiresAt]);
    useEffect(() => {
        setMediaAspectRatio(1);
        setCurrentImageIndex(0);  // Reset to first image when item changes
        setFlashPreviewComplete(false);
    }, [item.id, item.media_preview, item.thumbnail_url, item.media_type]);
    const blurredPreviewMedia = normalizeMediaSrc(
        item.thumbnail_url
        || linkPreviewImage
        || item.media_preview
        || item.media_gallery?.[0]
        || "",
    );
    const feedStaticPreviewMedia = normalizeMediaSrc(
        item.thumbnail_url
        || linkPreviewImage
        || (!isVideo ? (item.media_preview || item.media_gallery?.[0] || "") : "")
        || "",
    );
    const feedVideoFirstFrameSource = isVideo && !feedStaticPreviewMedia
        ? normalizeMediaSrc(item.media_preview || mediaGallery[0] || media || "")
        : "";
    const feedVideoMediaSource = normalizeMediaSrc(item.media_preview || mediaGallery[0] || media || watchSource || "");
    const feedMediaPreviewSource = isVideo
        ? (shouldAutoPlayFeedVideo ? feedVideoMediaSource : (feedStaticPreviewMedia || feedVideoFirstFrameSource))
        : (currentDisplayImage || feedStaticPreviewMedia);
    const clampedMediaAspectRatio = Math.min(1.18, Math.max(0.72, mediaAspectRatio || 1));
    const mediaFrameStyle = { aspectRatio: `${clampedMediaAspectRatio}` };
    const shouldShowWatchOverlay = (showBlur || hasSubscriptionPackages || ((isVideo || isPlayableFlash) && watchSource))
        && (!shouldAutoPlayFeedVideo || flashPreviewComplete || showBlur || hasSubscriptionPackages);
    const watchButtonLabel = shouldAutoPlayFeedVideo && flashPreviewComplete ? "Watch More" : "Watch Now";
    const openWatchContent = () => {
        if (showFullVideo) return;
        onLogView(item);
        if ((isVideo || isPlayableFlash) && watchSource) {
            setShowFullVideo(true);
            return;
        }
        if (isImage && media) {
            setShowFullVideo(true);
            return;
        }
        if (canOpenLink) {
            window.open(normalizeExternalUrl(item.external_link), "_blank", "noopener,noreferrer");
            return;
        }
        onOpenProfile();
    };
    const loadWatchBalance = async () => {
        const profile = await authService.getProfile();
        const balance = Number(profile?.wallet_balance ?? profile?.walletBalance ?? profile?.balance ?? 0);
        const normalizedBalance = Number.isFinite(balance) ? balance : 0;
        setWatchConfirmBalance(normalizedBalance);
        return normalizedBalance;
    };
    const purchaseVaultAndWatch = async () => {
        if (!authService.isAuthenticated()) {
            setWatchConfirmError("Please log in to purchase this content.");
            setShowWatchConfirm(false);
            return;
        }
        setWatchPurchaseLoading(true);
        setWatchConfirmError("");
        try {
            const price = Number(item.price || 0);
            const balance = watchConfirmBalance ?? await loadWatchBalance();
            if (balance < price) {
                setShowWatchConfirm(true);
                setTopUpRequiredAmount(price);
                setShowTopUpPrompt(true);
                return;
            }
            const result = await uploadContentService.purchaseVaultContent(
                item.id,
                purchaseResellerRef,
            );
            setWatchConfirmBalance(result.walletBalance);
            setLocalPurchaseExpiresAt(result.purchase?.expires_at || null);
            window.dispatchEvent(new Event("wallet:changed"));
            if (enableQuickUnlock && typeof window !== "undefined") {
                window.localStorage.setItem(VAULT_QUICK_UNLOCK_KEY, "true");
            }
            setShowWatchConfirm(false);
            setHasUnlockedAccess(true);
            onAccessChanged({
                ...item,
                user_purchased: true,
                user_has_access: true,
                user_purchase_expires_at: result.purchase?.expires_at || null,
            }, "content");
            openWatchContent();
        } catch (error) {
            setShowWatchConfirm(true);
            const message = error instanceof Error ? error.message : "Unable to unlock this content right now.";
            if (message.toLowerCase().includes("insufficient")) {
                setTopUpRequiredAmount(Number(item.price || 0));
                setShowTopUpPrompt(true);
            } else {
                setWatchConfirmError(
                    message.toLowerCase().includes("failed to unlock")
                        ? "Unable to unlock this content right now. Please try again."
                        : message
                );
            }
        } finally {
            setWatchPurchaseLoading(false);
        }
    };
    const openWatchConfirmation = async () => {
        if (!authService.isAuthenticated()) {
            setWatchConfirmError("Please log in to purchase this content.");
            return;
        }
        setShowWatchConfirm(true);
        setWatchConfirmError("");
        setWatchConfirmLoading(true);
        try {
            const balance = await loadWatchBalance();
            if (balance < Number(item.price || 0)) {
                setTopUpRequiredAmount(Number(item.price || 0));
                setShowTopUpPrompt(true);
            }
        } catch (error) {
            setWatchConfirmError(error instanceof Error ? error.message : "Failed to load wallet balance");
            setWatchConfirmBalance(null);
        } finally {
            setWatchConfirmLoading(false);
        }
    };
    const continueWatchNow = () => {
        if (isOwnContent || hasUnlockedAccess) {
            openWatchContent();
            return;
        }
        const quickUnlock = typeof window !== "undefined" && window.localStorage.getItem(VAULT_QUICK_UNLOCK_KEY) === "true";
        if (!quickUnlock) {
            void openWatchConfirmation();
            return;
        }
        void purchaseVaultAndWatch();
    };
    const handleWatchNow = (event?: MouseEvent<HTMLButtonElement>) => {
        event?.preventDefault();
        event?.stopPropagation();
        if (!authService.isAuthenticated()) {
            setShowLoginModal(true);
            return;
        }
        continueWatchNow();
    };
    useEffect(() => {
        if (autoOpenWatchKey === null || autoOpenWatchKey === undefined) return;
        if (lastAutoOpenWatchKeyRef.current === autoOpenWatchKey) return;
        lastAutoOpenWatchKeyRef.current = autoOpenWatchKey;
        window.setTimeout(() => handleWatchNow(), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoOpenWatchKey]);
    const handleConfirmWatch = async () => {
        await purchaseVaultAndWatch();
    };
    const handleOpenSubscriptionPlans = (event: MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();
        setSubscriptionPurchaseError("");
        setSubscriptionPurchaseMessage("");
        setSelectedSubscriptionPlanId(String(subscriptionPackages[0]?.id || ""));
        setShowSubscriptionPlans(true);
    };
    const handlePurchaseSubscription = async () => {
        if (!authService.isAuthenticated()) {
            setSubscriptionPurchaseError("Please log in to purchase a subscription.");
            return;
        }
        if (!selectedSubscriptionPlan) return;
        setIsPurchasingSubscription(true);
        setSubscriptionPurchaseError("");
        setSubscriptionPurchaseMessage("");
        try {
            await uploadContentService.purchaseCreatorSubscription(
                item.id,
                String(selectedSubscriptionPlan.id),
                purchaseResellerRef,
            );
            setSubscriptionPurchaseMessage("Subscription active. You can now watch this creator's content.");
            window.dispatchEvent(new Event("wallet:changed"));
            setHasUnlockedAccess(true);
            onAccessChanged(item, "creator_subscription");
            setTimeout(() => {
                setShowSubscriptionPlans(false);
                if ((isVideo || isPlayableFlash) && watchSource) {
                    setShowFullVideo(true);
                }
            }, 700);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to purchase subscription";
            if (message.toLowerCase().includes("insufficient")) {
                setTopUpRequiredAmount(Number(selectedSubscriptionPlan?.price || item.price || 0));
                setShowTopUpPrompt(true);
            } else {
                setSubscriptionPurchaseError(message);
            }
        } finally {
            setIsPurchasingSubscription(false);
        }
    };
    const executeRepost = async () => {
        if (repostBusy) return;
            setShowConfirmRepostPrompt(false);
            setRepostBusy(true);
            setRepostNotice("Reposting...");
            try {
                const response = await Promise.resolve(onRepost(item));
                const result = response !== undefined && response !== null && typeof response === "object"
                    ? response as { reposts_count?: number; repostCount?: number }
                    : undefined;
                const nextCount = Number(result?.reposts_count ?? result?.repostCount);
                setOptimisticReposted(true);
                setOptimisticRepostsCount((previous) => Number.isFinite(nextCount) ? nextCount : (userReposted ? previous : Math.max(previous + 1, 1)));
                setRepostNotice("Content reposted on your profile.");
        } catch (error) {
            const message = error instanceof Error ? error.message : "Could not repost content.";
            if (message.toLowerCase().includes("already reposted")) {
                setShowRemoveRepostPrompt(true);
                setRepostNotice("");
            } else {
                setRepostNotice(message);
            }
        } finally {
            setRepostBusy(false);
            window.setTimeout(() => setRepostNotice(""), 2600);
        }
    };
    const handleRepostClick = async () => {
        if (repostBusy) return;
        if (isOwnContent) {
            setRepostNotice("You cannot repost your own content.");
            window.setTimeout(() => setRepostNotice(""), 2200);
            return;
        }
        if (userReposted) {
            setRepostNotice("");
            setShowConfirmRepostPrompt(false);
            setShowRemoveRepostPrompt(true);
            return;
        }
        setRepostNotice("");
        setShowRemoveRepostPrompt(false);
        setShowConfirmRepostPrompt(true);
    };
    const handleEditClick = () => {
        if (onEdit) {
            onEdit(item);
            return;
        }
        window.dispatchEvent(new CustomEvent("open-upload-content-edit", { detail: item }));
    };
    const handleDeleteClick = () => {
        if (onDelete) {
            onDelete(item);
            return;
        }
        window.dispatchEvent(new CustomEvent("delete-upload-content", { detail: item }));
    };
    const watchRailIconSurface = "h-8 w-8 rounded-full border border-white/25 bg-zinc-700/35 shadow-[0_6px_18px_rgba(0,0,0,0.28)] backdrop-blur-md group-hover:bg-zinc-500/45";
    const watchRailCountText = "drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]";
    const repostFeedback = (
        <>
            {repostNotice && (
                <div className="mx-4 mb-2 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-center text-[10px] font-black text-emerald-200">
                    {repostNotice}
                </div>
            )}
        </>
    );
    const removeRepostPopup = showRemoveRepostPrompt ? (
        <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/35 px-4 backdrop-blur-[2px]" onClick={() => setShowRemoveRepostPrompt(false)}>
            <div className="w-full max-w-[260px] rounded-3xl border border-white/10 bg-[#151515] p-4 text-center shadow-[0_20px_60px_rgba(0,0,0,0.55)]" onClick={(event) => event.stopPropagation()}>
                <p className="text-[11px] font-black text-white">You already reposted this content.</p>
                <p className="mt-1 text-[9px] font-semibold text-white/45">Remove it from your profile?</p>
                <div className="mt-4 flex gap-2">
                    <button
                        type="button"
                        onClick={() => setShowRemoveRepostPrompt(false)}
                        className="flex-1 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black text-white/75"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        disabled={repostBusy}
                        onClick={async () => {
                            setRepostBusy(true);
                            try {
                                let response: unknown;
                                if (onRemoveRepost) {
                                    response = await Promise.resolve(onRemoveRepost(item));
                                } else {
                                    response = await uploadContentService.removeRepost(item.id);
                                }
                                const result = response !== undefined && response !== null && typeof response === "object"
                                    ? response as { reposts_count?: number; repostCount?: number }
                                    : undefined;
                                const nextCount = Number(result?.reposts_count ?? result?.repostCount);
                                setOptimisticReposted(false);
                                setOptimisticRepostsCount(Number.isFinite(nextCount) ? nextCount : Math.max(0, repostsCount - 1));
                                setShowRemoveRepostPrompt(false);
                                setRepostNotice("Repost removed.");
                            } catch (error) {
                                setRepostNotice(error instanceof Error ? error.message : "Could not remove repost.");
                            } finally {
                                setRepostBusy(false);
                                window.setTimeout(() => setRepostNotice(""), 2200);
                            }
                        }}
                        className="flex-1 rounded-full bg-red-500 px-3 py-2 text-[10px] font-black text-white disabled:opacity-60"
                    >
                        Remove
                    </button>
                </div>
            </div>
        </div>
    ) : null;
    const confirmRepostPopup = showConfirmRepostPrompt ? (
        <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/35 px-4 backdrop-blur-[2px]" onClick={() => setShowConfirmRepostPrompt(false)}>
            <div className="w-full max-w-[260px] rounded-3xl border border-white/10 bg-[#151515] p-4 text-center shadow-[0_20px_60px_rgba(0,0,0,0.55)]" onClick={(event) => event.stopPropagation()}>
                <p className="text-[11px] font-black text-white">Repost this content?</p>
                <p className="mt-1 text-[9px] font-semibold text-white/45">
                    This will add it to your profile.
                </p>
                <div className="mt-4 flex gap-2">
                    <button
                        type="button"
                        onClick={() => setShowConfirmRepostPrompt(false)}
                        className="flex-1 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black text-white/75"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        disabled={repostBusy}
                        onClick={executeRepost}
                        className="flex-1 rounded-full bg-white px-3 py-2 text-[10px] font-black text-black disabled:opacity-60"
                    >
                        Repost
                    </button>
                </div>
            </div>
        </div>
    ) : null;
    const watchActionRail = (
        <>
            <InteractionButton
                type="shares"
                icon="share-social-outline"
                activeIcon="share-social"
                count={isFlashContent ? "" : `${Number(item.affiliate_commission || 0)}%`}
                activeColor="text-white"
                color="text-white"
                onSingleClick={() => onShare(item)}
                onLongPress={() => onOpenSheet("shares", item)}
                appearance="compact"
                orientation="vertical"
                iconSize="text-[17px]"
                countSize="text-[7px]"
                iconWrapperClassName={watchRailIconSurface}
                countClassName={watchRailCountText}
            />
            <InteractionButton
                type="reposts"
                icon="repeat-outline"
                activeIcon="repeat"
                count={repostsCount}
                activeColor="text-emerald-300"
                color="text-white"
                isActive={userReposted}
                onSingleClick={handleRepostClick}
                onLongPress={handleRepostClick}
                appearance="compact"
                orientation="vertical"
                iconSize="text-[17px]"
                countSize="text-[7px]"
                iconWrapperClassName={watchRailIconSurface}
                countClassName={watchRailCountText}
            />
            <InteractionButton
                type="views"
                icon="eye-outline"
                activeIcon="eye"
                count={viewsCount}
                activeColor="text-white"
                color="text-white"
                onSingleClick={() => {
                    onLogView(item);
                    onOpenSheet("views", item);
                }}
                onLongPress={() => onOpenSheet("views", item)}
                appearance="compact"
                orientation="vertical"
                iconSize="text-[17px]"
                countSize="text-[7px]"
                iconWrapperClassName={watchRailIconSurface}
                countClassName={watchRailCountText}
            />
            <InteractionButton
                type="comments"
                icon="chatbubble-outline"
                activeIcon="chatbubble"
                count={commentsCount}
                activeColor="text-white"
                color="text-white"
                onSingleClick={() => onOpenSheet("comments", item)}
                onLongPress={() => onOpenSheet("comments", item)}
                appearance="compact"
                orientation="vertical"
                iconSize="text-[17px]"
                countSize="text-[7px]"
                iconWrapperClassName={watchRailIconSurface}
                countClassName={watchRailCountText}
            />
            <InteractionButton
                type="likes"
                icon="heart-outline"
                activeIcon="heart"
                count={likesCount}
                activeColor="text-white"
                color="text-white"
                isActive={!!item.user_liked}
                onSingleClick={() => onToggleLike(item)}
                onLongPress={() => onOpenSheet("likes", item)}
                appearance="compact"
                orientation="vertical"
                iconSize="text-[17px]"
                countSize="text-[7px]"
                iconWrapperClassName={watchRailIconSurface}
                countClassName={watchRailCountText}
            />
        </>
    );

    return (
        <>
        <article className={`max-w-full overflow-hidden px-1 py-4 transition-colors sm:px-7 ${articleClassName}`.trim()} onClick={() => isMenuOpen && setIsMenuOpen(false)}>
            <div className={`relative group mx-auto flex w-full min-w-0 flex-col overflow-hidden rounded-[1.35rem] border border-white/5 bg-[#1a1a1a] transition-all duration-500 sm:rounded-[1.7rem] md:rounded-[2.3rem] ${showFullVideo ? "max-w-[860px] bg-black pb-0" : `${maxWidthClassName || "max-w-[360px]"} pb-3`}`}>
                <header className="flex items-center justify-between gap-2 p-3">
                    <div className="flex min-w-0 items-center gap-2">
                        <button
                            type="button"
                            onClick={onOpenProfile}
                            className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-gradient-to-tr from-blue-600 to-purple-600 text-[10px] text-white shadow-lg"
                        >
                            {profileImage ? (
                                <Image
                                    src={profileImage}
                                    alt={creatorName}
                                    fill
                                    sizes={AVATAR_IMAGE_SIZES}
                                    className="object-cover"
                                    loading="lazy"
                                    placeholder="blur"
                                    blurDataURL={FEED_IMAGE_BLUR_DATA_URL}
                                    unoptimized={shouldBypassNextImageOptimization(profileImage)}
                                />
                            ) : (
                                <IonIcon name="person" className="text-white" />
                            )}
                        </button>
                        <div className="min-w-0">
                            <button
                                type="button"
                                onClick={onOpenProfile}
                                className="inline-flex max-w-full items-center gap-1 truncate text-[11px] font-black leading-none text-white transition-colors hover:text-blue-400"
                            >
                                <span className="truncate">{creatorName}</span>
                                {!!(item.user_id ?? item.owner_user_id) && (
                                    <UserVerifiedBadge userId={item.user_id ?? item.owner_user_id} size={12} />
                                )}
                            </button>
                            <div className="mt-1 text-[9px] font-bold tracking-[0.18em] text-slate-500">
                                {repostedByName ? (
                                    <button
                                        type="button"
                                        onClick={(event) => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            if (repostedByUserId) {
                                                router.push(getPublicProfileHref(item.reposted_by_username, repostedByUserId));
                                                return;
                                            }
                                            const username = String(item.reposted_by_username || "").trim();
                                            if (username && !/^\d+$/.test(username)) {
                                                router.push(getPublicProfileHref(username, null));
                                            }
                                        }}
                                        className="block truncate text-left text-[9px] font-bold tracking-[0.12em] text-cyan-200/80 transition hover:text-cyan-100"
                                    >
                                        Reposted by {repostedByName} - {item.reposted_at ? formatRelativeTime(item.reposted_at) : createdLabel}
                                    </button>
                                ) : (
                                    createdLabel
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                        <SubscribeButton
                            authorId={item.user_id ?? item.owner_user_id}
                            authorName={creatorName}
                            size="small"
                        />
                        <button
                            type="button"
                            onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                setIsMenuOpen((value) => !value);
                            }}
                            className="flex h-8 w-8 flex-col items-center justify-center gap-1 rounded-full bg-white/[0.06] text-white/60 transition hover:bg-white/[0.1] hover:text-white"
                            aria-label="Open content menu"
                        >
                            <span className="h-1 w-1 rounded-full bg-current" />
                            <span className="h-1 w-1 rounded-full bg-current" />
                        </button>
                    </div>
                </header>
                {isMenuOpen && (
                    <div
                        className="absolute right-3 top-12 z-50 w-48 overflow-hidden rounded-2xl border border-white/10 bg-[#15161a] py-1 shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        {canViewInsights && (
                            <button type="button" onClick={() => { setIsMenuOpen(false); onInsights(item); }} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[11px] font-bold text-white hover:bg-white/5">
                                <IonIcon name="analytics-outline" className="text-base text-cyan-300" />
                                Insights
                            </button>
                        )}
                        {isOwnContent && (
                            <button
                                type="button"
                                onClick={() => { setIsMenuOpen(false); onPin(item); }}
                                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-[11px] font-bold text-white hover:bg-white/5 ${canViewInsights ? "border-t border-white/5" : ""}`}
                            >
                                <IonIcon name={item.pinned_at ? "remove-circle-outline" : "pin-outline"} className="text-base text-emerald-300" />
                                {item.pinned_at ? "Unpin" : "Pin"}
                            </button>
                        )}
                        {isOwnContent && (
                            <>
                                <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); setIsMenuOpen(false); handleEditClick(); }} className="flex w-full items-center gap-3 border-t border-white/5 px-4 py-2.5 text-left text-[11px] font-bold text-white hover:bg-white/5">
                                    <IonIcon name="create-outline" className="text-base text-blue-300" />
                                    Edit
                                </button>
                                <button type="button" onClick={() => { setIsMenuOpen(false); handleDeleteClick(); }} className="flex w-full items-center gap-3 border-t border-white/5 px-4 py-2.5 text-left text-[11px] font-bold text-red-300 hover:bg-white/5">
                                    <IonIcon name="trash-outline" className="text-base" />
                                    Delete
                                </button>
                            </>
                        )}
                        <button type="button" onClick={() => { setIsMenuOpen(false); onShare(item); }} className="flex w-full items-center gap-3 border-t border-white/5 px-4 py-2.5 text-left text-[11px] font-bold text-white hover:bg-white/5">
                            <IonIcon name="share-social-outline" className="text-base text-blue-300" />
                            Share
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setIsMenuOpen(false);
                                try {
                                    window.localStorage.setItem("googer-promote-upload-content", JSON.stringify({
                                        contentId: item.id,
                                        title: item.topic || item.description || "Upload content",
                                        mediaPreview: item.media_preview || item.thumbnail_url || item.media_gallery?.[0] || "",
                                        mediaType: item.media_type || "",
                                    }));
                                } catch {}
                                window.location.href = "/ad-campaign/photo-video";
                            }}
                            className="flex w-full items-center gap-3 border-t border-white/5 px-4 py-2.5 text-left text-[11px] font-bold text-white hover:bg-white/5"
                        >
                            <IonIcon name="megaphone-outline" className="text-base text-amber-300" />
                            Promote
                        </button>
                        <button type="button" onClick={() => { setIsMenuOpen(false); onNotInterested(item); }} className="flex w-full items-center gap-3 border-t border-white/5 px-4 py-2.5 text-left text-[11px] font-bold text-white hover:bg-white/5">
                            <IonIcon name="eye-off-outline" className="text-base text-white/60" />
                            Not Interested
                        </button>
                        {!isOwnContent && (
                            <button type="button" onClick={() => { setIsMenuOpen(false); onReport(item); }} className="flex w-full items-center gap-3 border-t border-white/5 px-4 py-2.5 text-left text-[11px] font-bold text-white hover:bg-white/5">
                                <IonIcon name="flag-outline" className="text-base text-red-300" />
                                Report
                            </button>
                        )}
                    </div>
                )}

                {showFullVideo ? (
                    <div className="bg-black pb-2 relative">
                        <UploadContentWatchModal
                            inline
                            open={showFullVideo}
                            source={isImage ? (mediaGallery[0] || item.media_preview || media || "") : watchSource}
                            images={isImage ? mediaGallery : undefined}
                            poster={item.thumbnail_url}
                            title={item.description || item.topic || "Full Content"}
                            hashtags={normalizedHashtags}
                            mediaType={item.media_type}
                            lockedPrice={isFlashContent ? Number(item.price || 0) : null}
                            autoPlay={!isFlashContent || flashContentAutoPlay}
                            initialTimeSeconds={isFlashContent ? flashPreviewStoppedAt : 0}
                            videoTrimStartSeconds={videoTrimStartSeconds}
                            videoTrimEndSeconds={videoTrimEndSeconds}
                            onClose={() => {
                                setShowFullVideo(false);
                                onFullViewClose?.();
                            }}
                            actionRail={watchActionRail}
                        />
                        {repostFeedback}
                    </div>
                ) : (
                <>
                <div className="px-1 sm:px-3">
                    <div
                        className="relative overflow-hidden rounded-[1.25rem] border border-white/5 bg-black shadow-inner sm:rounded-[1.6rem]"
                        style={mediaFrameStyle}
                    >
                        <div className="absolute left-3 top-3 z-10 rounded-full border border-white/10 bg-black/55 px-3 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-white">
                            {item.topic || "Content"}
                        </div>
                        {showStatusDetails && (
                            <div className={`absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${statusMeta.className}`}>
                                <IonIcon name={statusMeta.icon} className="text-sm" />
                                {statusMeta.label}
                            </div>
                        )}
                        <UploadContentMedia
                            mediaType={item.media_type}
                            mediaPreview={feedMediaPreviewSource}
                            mediaGallery={undefined}
                            thumbnailUrl={feedStaticPreviewMedia}
                            previewMode={feedPreviewMode}
                            previewUrl={feedStaticPreviewMedia}
                            videoTrimStartSeconds={videoTrimStartSeconds}
                            videoTrimEndSeconds={videoTrimEndSeconds}
                            previewFrameSeconds={0.2}
                            previewDurationSeconds={shouldAutoPlayFeedVideo ? normalizedFlashPreviewSeconds : 0}
                            alt={item.description || item.topic || "Upload content"}
                            blurred={showBlur}
                            autoPlayVideo={shouldAutoPlayFeedVideo}
                            autoPlayMuted={false}
                            onPreviewProgress={(currentTime) => setFlashPreviewStoppedAt(currentTime)}
                            onPreviewComplete={() => {
                                setFlashPreviewStoppedAt((current) => current || videoTrimStartSeconds + normalizedFlashPreviewSeconds);
                                setFlashPreviewComplete(true);
                            }}
                            onAspectRatioChange={setMediaAspectRatio}
                        />
                        {showBlur && (
                            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.18),rgba(0,0,0,0.54))]" />
                        )}
                        {(!!item.description || normalizedHashtags.length > 0) && (
                            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/80 via-black/35 to-transparent px-4 pb-4 pt-12">
                                {!!item.description && (
                                    <p className="line-clamp-2 text-[11px] font-black leading-5 text-white drop-shadow-[0_1px_5px_rgba(0,0,0,0.85)]">
                                        {renderHashtagText(item.description)}
                                    </p>
                                )}
                                {normalizedHashtags.length > 0 && (
                                    <p className={`${item.description ? "mt-1" : ""} text-[10px] font-black leading-5 text-red-500 drop-shadow-[0_1px_5px_rgba(0,0,0,0.85)]`}>
                                        {normalizedHashtags.join(" ")}
                                    </p>
                                )}
                            </div>
                        )}
                        {shouldShowWatchOverlay && (
                            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 px-5 text-center">
                                <button
                                    type="button"
                                    onClick={handleWatchNow}
                                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded-full border border-white/15 bg-black/80 px-3 text-white shadow-xl backdrop-blur-md transition hover:bg-black/90"
                                >
                                    <IonIcon name="play" className="text-[10px]" />
                                    <span className="text-[8px] font-black uppercase tracking-[0.12em]">{watchButtonLabel}</span>
                                    {!hasUnlockedAccess && !isOwnContent && (
                                        <>
                                            <span className="mx-0.5 h-3 w-px bg-white/20" />
                                            <span className="text-[8px] font-bold text-white/65">{Number(item.price || 0).toLocaleString()} Coins</span>
                                        </>
                                    )}
                                </button>
                                {hasSubscriptionPackages && (
                                    <button
                                        type="button"
                                        onClick={handleOpenSubscriptionPlans}
                                        className="inline-flex min-h-7 items-center justify-center rounded-full border border-emerald-300/30 bg-black/65 px-3 text-[7px] font-black uppercase tracking-[0.1em] text-emerald-200 backdrop-blur-md transition hover:bg-black/80"
                                    >
                                        Watch all content
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="px-4 pb-1.5 pt-3">
                    <div className="flex items-center justify-between border-t border-white/8 pt-3 text-white/78">
                        <InteractionButton
                            type="likes"
                            icon="heart-outline"
                            activeIcon="heart"
                            count={likesCount}
                            activeColor="text-white"
                            color="text-white"
                            isActive={!!item.user_liked}
                            onSingleClick={() => onToggleLike(item)}
                            onLongPress={() => onOpenSheet("likes", item)}
                            appearance="compact"
                        />
                        <InteractionButton
                            type="reposts"
                            icon="repeat-outline"
                            activeIcon="repeat"
                            count={repostsCount}
                            activeColor="text-emerald-400"
                            color="text-white"
                            isActive={userReposted}
                            onSingleClick={handleRepostClick}
                            onLongPress={handleRepostClick}
                            appearance="compact"
                        />
                        <InteractionButton
                            type="views"
                            icon="eye-outline"
                            activeIcon="eye"
                            count={viewsCount}
                            activeColor="text-white"
                            color="text-white"
                            onSingleClick={() => {
                                onLogView(item);
                                onOpenSheet("views", item);
                            }}
                            onLongPress={() => onOpenSheet("views", item)}
                            appearance="compact"
                        />
                        <InteractionButton
                            type="comments"
                            icon="chatbubble-outline"
                            activeIcon="chatbubble"
                            count={commentsCount}
                            activeColor="text-white"
                            color="text-white"
                            onSingleClick={() => onOpenSheet("comments", item)}
                            onLongPress={() => onOpenSheet("comments", item)}
                            appearance="compact"
                        />
                        <InteractionButton
                            type="shares"
                            icon="share-social-outline"
                            activeIcon="share-social"
                            count={isFlashContent ? "" : `${Number(item.affiliate_commission || 0)}%`}
                            activeColor="text-white"
                            color="text-white"
                            onSingleClick={() => onShare(item)}
                            onLongPress={() => onOpenSheet("shares", item)}
                            appearance="compact"
                        />
                    </div>
                </div>
                {repostFeedback}
                {showStatusDetails && (
                    <p className="mx-4 mb-1 rounded-2xl border border-white/8 bg-white/[0.035] px-3 py-2 text-[10px] font-semibold leading-5 text-white/55">
                        {item.status === "Rejected" && item.rejection_reason ? item.rejection_reason : statusMeta.helper}
                    </p>
                )}
                </>
                )}
            </div>
        </article>
        {confirmRepostPopup}
        {removeRepostPopup}
        {showWatchConfirm && (
            <div
                className="fixed inset-0 z-[230] flex items-center justify-center bg-black/80 px-3 py-4 backdrop-blur-md"
                onClick={() => setShowWatchConfirm(false)}
            >
                <div
                    className="w-full max-w-[320px] overflow-hidden rounded-[1.1rem] border border-white/10 bg-[#111216] shadow-[0_30px_100px_rgba(0,0,0,0.7)]"
                    onClick={(event) => event.stopPropagation()}
                >
                    <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
                        <div>
                            <h3 className="text-[14px] font-black text-white">Watch Content</h3>
                            <p className="mt-1 text-[10px] font-semibold text-white/45">Unlock this vault item before watching.</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowWatchConfirm(false)}
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-white/65 transition hover:bg-white/[0.1] hover:text-white"
                            aria-label="Close watch confirmation"
                        >
                            <IonIcon name="close-outline" className="text-lg" />
                        </button>
                    </div>
                    <div className="space-y-3 px-4 py-4">
                        <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3">
                            <p className="text-[11px] font-black text-white">Cost: {Number(item.price || 0).toLocaleString()} Coins</p>
                            <p className="mt-1.5 text-[10px] font-semibold text-white/55">
                                Your Balance: {watchConfirmLoading ? "Loading..." : `${Number(watchConfirmBalance || 0).toLocaleString()} Coins`}
                            </p>
                        </div>
                        <label className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
                            <input
                                type="checkbox"
                                checked={enableQuickUnlock}
                                onChange={(event) => setEnableQuickUnlock(event.target.checked)}
                                className="mt-0.5 h-4 w-4 accent-emerald-300"
                            />
                            <span>
                                <span className="block text-[9px] font-black uppercase tracking-[0.12em] text-white/70">Skip confirmation next time</span>
                                <span className="mt-1 block text-[10px] font-semibold text-white/45">Enable quick unlock</span>
                            </span>
                        </label>
                        {watchConfirmError && (
                            <p className="rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-[10px] font-bold text-red-200">
                                {watchConfirmError}
                            </p>
                        )}
                    </div>
                    <div className="flex items-center justify-end gap-2 border-t border-white/10 px-4 py-3">
                        <button
                            type="button"
                            onClick={() => setShowWatchConfirm(false)}
                            className="inline-flex h-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-4 text-[9px] font-black uppercase tracking-[0.12em] text-white/70 transition hover:bg-white/[0.08]"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleConfirmWatch}
                            disabled={watchConfirmLoading || watchPurchaseLoading}
                            className="inline-flex h-9 items-center justify-center rounded-full bg-white px-4 text-[9px] font-black uppercase tracking-[0.12em] text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-55"
                        >
                            {watchPurchaseLoading ? "Unlocking..." : "Confirm & Watch"}
                        </button>
                    </div>
                </div>
            </div>
        )}
        {showLoginModal && (
            <LoginModal
                onClose={() => setShowLoginModal(false)}
                onSuccess={() => {
                    setShowLoginModal(false);
                    continueWatchNow();
                }}
            />
        )}
        {showTopUpPrompt && (
            <div
                className="fixed inset-0 z-[240] flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm"
                onClick={() => setShowTopUpPrompt(false)}
            >
                <div
                    className="w-full max-w-[290px] rounded-2xl border border-red-300/25 bg-[#15161a] p-4 text-center shadow-[0_24px_80px_rgba(0,0,0,0.6)]"
                    onClick={(event) => event.stopPropagation()}
                >
                    <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-red-300/12 text-red-200">
                        <IonIcon name="wallet-outline" className="text-xl" />
                    </div>
                    <h3 className="mt-3 text-[13px] font-black text-white">Insufficient Balance</h3>
                    <p className="mt-1 text-[10px] font-semibold leading-5 text-white/55">
                        You need {Number(topUpRequiredAmount || item.price || 0).toLocaleString()} Coins to continue.
                    </p>
                    <div className="mt-4 flex items-center justify-center gap-2">
                        <button
                            type="button"
                            onClick={() => setShowTopUpPrompt(false)}
                            className="inline-flex h-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-4 text-[9px] font-black uppercase tracking-[0.12em] text-white/65"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={() => router.push("/wallet/topup")}
                            className="inline-flex h-8 items-center justify-center rounded-full bg-emerald-300 px-4 text-[9px] font-black uppercase tracking-[0.12em] text-black"
                        >
                            Top Up
                        </button>
                    </div>
                </div>
            </div>
        )}
        {showSubscriptionPlans && (
            <div
                className="fixed inset-0 z-[230] flex items-center justify-center bg-black/80 px-3 py-4 backdrop-blur-md"
                onClick={() => setShowSubscriptionPlans(false)}
            >
                <div
                    className="w-full max-w-[360px] overflow-hidden rounded-[1.25rem] border border-white/10 bg-[#111216] shadow-[0_30px_100px_rgba(0,0,0,0.7)]"
                    onClick={(event) => event.stopPropagation()}
                >
                    <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
                        <div>
                            <h3 className="text-[14px] font-black text-white">Subscribe for full access</h3>
                            <p className="mt-1 text-[10px] font-semibold text-white/45">Watch all content from this creator</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowSubscriptionPlans(false)}
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-white/65 transition hover:bg-white/[0.1] hover:text-white"
                            aria-label="Close subscription plans"
                        >
                            <IonIcon name="close-outline" className="text-lg" />
                        </button>
                    </div>
                    <div className="max-h-[56vh] space-y-2.5 overflow-y-auto px-4 py-4">
                        {subscriptionPackages.map((plan, index) => (
                            <button
                                key={plan.id || `subscription-plan-${index}`}
                                type="button"
                                onClick={() => {
                                    setSelectedSubscriptionPlanId(String(plan.id));
                                    setSubscriptionPurchaseError("");
                                    setSubscriptionPurchaseMessage("");
                                }}
                                className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left transition ${
                                    String(selectedSubscriptionPlan?.id || "") === String(plan.id)
                                        ? "border-emerald-300/55 bg-emerald-300/10"
                                        : "border-white/10 bg-white/[0.04] hover:bg-white/[0.07]"
                                }`}
                            >
                                <div>
                                    <p className="text-[8px] font-black uppercase tracking-[0.12em] text-white/40">Plan {index + 1}</p>
                                    <p className="mt-1 text-[11px] font-bold text-white">
                                        {Number(plan.minutes || plan.days || 0)} Minute{Number(plan.minutes || plan.days || 0) === 1 ? "" : "s"} Full Access
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[8px] font-black uppercase tracking-[0.1em] text-white/35">Price</p>
                                    <p className="mt-1 text-[12px] font-black text-emerald-300">{Number(plan.price || 0).toLocaleString()} Coins</p>
                                </div>
                            </button>
                        ))}
                    </div>
                    <div className="border-t border-white/10 px-4 py-3">
                        {subscriptionPurchaseError && (
                            <p className="mb-3 rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-[10px] font-bold text-red-200">
                                {subscriptionPurchaseError}
                            </p>
                        )}
                        {subscriptionPurchaseMessage && (
                            <p className="mb-3 rounded-xl border border-emerald-300/25 bg-emerald-300/10 px-3 py-2 text-[10px] font-bold text-emerald-200">
                                {subscriptionPurchaseMessage}
                            </p>
                        )}
                        <button
                            type="button"
                            onClick={handlePurchaseSubscription}
                            disabled={!selectedSubscriptionPlan || isPurchasingSubscription}
                            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-emerald-300 px-4 text-[9px] font-black uppercase tracking-[0.13em] text-black transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-55"
                        >
                            {isPurchasingSubscription ? (
                                <>
                                    <IonIcon name="sync-outline" className="text-sm" />
                                    Processing
                                </>
                            ) : (
                                <>
                                    <IonIcon name="wallet-outline" className="text-sm" />
                                    Confirm Subscribe
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
}
