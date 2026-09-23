"use client";

import { useState, useEffect } from "react";
import { getShareUrlForItem, buildPublicUrl } from "@/app/lib/shareLinks";
import { authService } from "@/services/authService";

// ─── Inline SVG Brand Icons (pixel-perfect, official brand colors) ────────────

const WhatsAppIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
);

const FacebookIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
);

const InstagramIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
    </svg>
);

const TwitterXIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
);

const TelegramIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
    </svg>
);

const CopyLinkIcon = ({ copied }: { copied: boolean }) => (
    copied ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
            <path d="M20 6L9 17l-5-5" />
        </svg>
    ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
            <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
        </svg>
    )
);

const ResellIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
    </svg>
);

const BackIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M19 12H5M12 5l-7 7 7 7" />
    </svg>
);

const CloseIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M18 6L6 18M6 6l12 12" />
    </svg>
);

const PersonIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
        <circle cx="12" cy="7" r="4" />
    </svg>
);

const ChevronRightIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M9 18l6-6-6-6" />
    </svg>
);

// ─── Platform Definitions ─────────────────────────────────────────────────────

interface ShareModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    url?: string;
    shareUrl?: string;
    description?: string;
    product?: any;
    initialView?: "share" | "resell";
    onCopyLink?: () => void | Promise<void>;
    resellMode?: "resell" | "repost";
    forceResellOnly?: boolean;
    shareOnly?: boolean;
    shareType?: "goog" | "ad" | "product" | "upload";
}

export default function ShareModal({ isOpen, onClose, title, url, shareUrl, description, product, initialView = "share", onCopyLink, resellMode = "resell", forceResellOnly = false, shareOnly = false, shareType }: ShareModalProps) {
    const [copied, setCopied] = useState(false);
    const [view, setView] = useState<"share" | "resell">(initialView);
    const [resellId, setResellId] = useState("");
    const [resellLink, setResellLink] = useState("");
    const [productCode, setProductCode] = useState("");
    const [resellCopied, setResellCopied] = useState(false);
    const [resellGenerated, setResellGenerated] = useState(false);
    const [isVisible, setIsVisible] = useState(false);
    const [resellOwnUsername, setResellOwnUsername] = useState("");
    const [resellOwnUserId, setResellOwnUserId] = useState("");
    const [resellError, setResellError] = useState("");

    const normalizeIdentifier = (value: string) => String(value || "").trim().replace(/^@+/, "").toLowerCase();

    const isOwnIdentifier = (value: string) => {
        const n = normalizeIdentifier(value);
        if (!n) return false;
        return n === normalizeIdentifier(resellOwnUsername) || n === normalizeIdentifier(resellOwnUserId);
    };
    const providedUrl = shareUrl || url || "";
    const rawProduct = product?.raw || {};
    const productCampaignType = String(product?.campaign_type || product?.campaignType || rawProduct.campaign_type || rawProduct.campaignType || "").trim();
    const isProductPromote = productCampaignType === "Product Promote";
    const hasSponsoredAdIdentity = !!(
        product?.is_sponsored ||
        product?.isAd ||
        product?.adId ||
        product?.ad_id ||
        rawProduct.is_sponsored ||
        rawProduct.isAd ||
        rawProduct.adId ||
        rawProduct.ad_id ||
        productCampaignType
    );
    const isSponsoredAd = shareType === "ad" || (hasSponsoredAdIdentity && !isProductPromote);
    const isGoogShareItem =
        String(product?.id || "").startsWith("goog-") ||
        (!product?.is_sponsored && !product?.campaign_type && typeof product?.text === "string");
    const isUploadShareItem =
        shareType === "upload" ||
        String(product?.id || "").startsWith("upload-") ||
        !!product?.content_type ||
        !!product?.preview_url;
    const effectiveShareType = shareType || (isUploadShareItem ? "upload" : undefined);
    const canShowResellFlow = !shareOnly && !!product && !isSponsoredAd && !isGoogShareItem;
    const resellFlowMode = resellMode === "repost" ? "repost" : "resell";
    const flowActionLabel = isUploadShareItem
        ? (resellFlowMode === "repost" ? "Repost" : "Share")
        : (resellFlowMode === "repost" ? "Repost" : "Resell");
    const flowActionLabelLower = flowActionLabel.toLowerCase();
    const flowEarnLabel = isUploadShareItem
        ? (resellFlowMode === "repost" ? "Repost & Earn" : "Share & Earn")
        : (resellFlowMode === "repost" ? "Repost & Earn" : "Resell & Earn");
    const flowTitle = isUploadShareItem
        ? "Share Link"
        : (resellFlowMode === "repost" ? "Repost Link" : "Resell Link");
    const flowSubtitle = isUploadShareItem
        ? "Share this content and earn when eligible viewers watch through your link"
        : (resellFlowMode === "repost" ? "Create your repost link and earn on every sale" : "Earn commission on every sale");
    const flowCommissionTitle = isUploadShareItem
        ? (resellFlowMode === "repost" ? "Repost Commission" : "Share Commission")
        : (resellFlowMode === "repost" ? "Repost Commission" : "Resell Commission");
    const flowReadyLabel = isUploadShareItem
        ? (resellFlowMode === "repost" ? "Repost link ready" : "Share link ready")
        : (resellFlowMode === "repost" ? "Repost link ready" : "Resell link ready");
    const flowGeneratedLabel = `Your ${flowActionLabel} Link`;
    const flowCopyButtonLabel = `Copy ${flowActionLabel} Link`;
    const flowSharePrompt = `Share your ${flowActionLabelLower} link`;
    const flowGenerateButtonLabel = `Generate ${flowActionLabel}`;
    const showShareView = shareOnly || !forceResellOnly;
    const autoHandleRepostFlow = !shareOnly && forceResellOnly && resellFlowMode === "repost";

    const buildResellLink = (identifier: string) => {
        const trimmedId = String(identifier || "").trim();
        if (!trimmedId) return "";
        let baseUrl = displayUrl.split("?")[0];
        if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
        return `${baseUrl}/${encodeURIComponent(trimmedId)}`;
    };

    // Animate in/out
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => setIsVisible(true), 10);
            const canonicalUrl = providedUrl || (product ? getShareUrlForItem(product, effectiveShareType) : "");
            const canonicalCode = String(canonicalUrl || "").split("/").filter(Boolean).pop() || "";
            setProductCode(canonicalCode);
            setView(shareOnly ? "share" : canShowResellFlow ? (forceResellOnly ? "resell" : initialView) : "share");
            setCopied(false);
            setResellId("");
            setResellLink("");
            setResellCopied(false);
            setResellGenerated(false);
            setResellError("");
            setResellOwnUsername("");
            setResellOwnUserId("");

            // Auto-fill the resell ID with the current user's actual identifier and remember
            // both their username and user_id so we can reject anything else the user types.
            if (canShowResellFlow && authService.isAuthenticated()) {
                authService.getProfile()
                    .then((u: any) => {
                        const username = String(u?.username || "").trim();
                        const userId = String(u?.user_id || u?.userId || "").trim();
                        setResellOwnUsername(username);
                        setResellOwnUserId(userId);
                        const ownIdentifier = userId || username;
                        if (ownIdentifier) {
                            setResellId(ownIdentifier);
                            if (autoHandleRepostFlow) {
                                setResellLink(buildResellLink(ownIdentifier));
                                setResellGenerated(true);
                            }
                        }
                    })
                    .catch(() => {});
            }
        } else {
            setIsVisible(false);
        }
    }, [isOpen]);

    // Construct final share URL with requested public path format.
    const getShareLinks = () => {
        const generatedShareUrl = providedUrl || (product ? getShareUrlForItem(product, effectiveShareType) : "");
        if (generatedShareUrl) {
            return {
                short: generatedShareUrl,
                product: generatedShareUrl,
                original: providedUrl
            };
        }

        const code = productCode;
        return {
            short: providedUrl || (code ? buildPublicUrl(`/share/${code}`) : ""),
            original: providedUrl
        };
    };

    const links = getShareLinks();
    const displayUrl = links.short || links.product || providedUrl;

    const getResellCommission = (): string | null => {
        const uploadAffiliateCommission = Number(product?.affiliate_commission ?? product?.affiliateCommission ?? 0);
        if (uploadAffiliateCommission > 0) return String(uploadAffiliateCommission);
        if (!product?.commission_info) return null;
        try {
            const info = typeof product.commission_info === "string"
                ? JSON.parse(product.commission_info)
                : product.commission_info;
            return info?.resell_percentage || info?.resell_percent || info?.resell_amount || info?.resell_commission || info?.reseller_commission || null;
        } catch { return null; }
    };

    const resellCommission = getResellCommission();

    const fallbackCopyTextToClipboard = (text: string) => {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        try {
            document.execCommand("copy");
        } catch (err) {
            console.error("Fallback copy error:", err);
        }
        document.body.removeChild(ta);
    };

    const copyToClipboard = async (text: string, setFn: (v: boolean) => void) => {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            try {
                await navigator.clipboard.writeText(text);
            } catch {
                fallbackCopyTextToClipboard(text);
            }
        } else {
            fallbackCopyTextToClipboard(text);
        }
        setFn(true);
        setTimeout(() => setFn(false), 2500);
    };

    const handlePrimaryCopyLink = async () => {
        await copyToClipboard(displayUrl, setCopied);
        await onCopyLink?.();
    };

    const handleGenerateResellLink = () => {
        const finalLink = buildResellLink(resellId);
        if (!finalLink) return;
        setResellLink(finalLink);
        setResellGenerated(true);
    };

    const handleClose = () => {
        setIsVisible(false);
        onClose();
    };

    if (!isOpen) return null;

    // Platform configs with inline SVGs
    const platforms = [
        {
            name: "WhatsApp",
            icon: <WhatsAppIcon />,
            bg: "bg-[#25D366]",
            shadow: "shadow-[#25D366]/30",
            action: () => window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(title + "\n\n" + displayUrl)}`, "_blank"),
        },
        {
            name: "Facebook",
            icon: <FacebookIcon />,
            bg: "bg-[#1877F2]",
            shadow: "shadow-[#1877F2]/30",
            action: () => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(displayUrl)}`, "_blank"),
        },
        {
            name: "Instagram",
            icon: <InstagramIcon />,
            bg: "bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF]",
            shadow: "shadow-[#DD2A7B]/30",
            action: () => { void copyToClipboard(displayUrl, setCopied); setTimeout(() => alert("Link copied! Open Instagram and paste it in your story or bio."), 150); },
        },
        {
            name: "X (Twitter)",
            icon: <TwitterXIcon />,
            bg: "bg-[#000000]",
            shadow: "shadow-white/10",
            action: () => window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(displayUrl)}&text=${encodeURIComponent(title)}`, "_blank"),
        },
        {
            name: "Telegram",
            icon: <TelegramIcon />,
            bg: "bg-[#27A7E5]",
            shadow: "shadow-[#27A7E5]/30",
            action: () => window.open(`https://t.me/share/url?url=${encodeURIComponent(displayUrl)}&text=${encodeURIComponent(title)}`, "_blank"),
        },
        {
            name: copied ? "Copied!" : "Copy Link",
            icon: <CopyLinkIcon copied={copied} />,
            bg: copied ? "bg-emerald-500" : "bg-[#2a2a2a]",
            shadow: copied ? "shadow-emerald-500/30" : "shadow-black/20",
            action: () => { void handlePrimaryCopyLink(); },
        },
    ];

    const resellSharePlatforms = [
        {
            name: "WhatsApp",
            icon: <WhatsAppIcon />,
            bg: "bg-[#25D366]",
            action: () => window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent((isUploadShareItem ? "🎬 " : "🛍️ ") + title + "\n\n" + (isUploadShareItem ? "Watch here:\n" : "Check it out & order here:\n") + resellLink)}`, "_blank"),
        },
        {
            name: "Facebook",
            icon: <FacebookIcon />,
            bg: "bg-[#1877F2]",
            action: () => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(resellLink)}`, "_blank"),
        },
        {
            name: "Telegram",
            icon: <TelegramIcon />,
            bg: "bg-[#27A7E5]",
            action: () => window.open(`https://t.me/share/url?url=${encodeURIComponent(resellLink)}&text=${encodeURIComponent(title)}`, "_blank"),
        },
        {
            name: "X",
            icon: <TwitterXIcon />,
            bg: "bg-[#000000]",
            action: () => window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(resellLink)}&text=${encodeURIComponent(title)}`, "_blank"),
        },
    ];

    return (
        <div
            className={`fixed inset-0 z-[300] flex items-end md:items-center justify-center md:p-4 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${isVisible ? "bg-black/60 backdrop-blur-md opacity-100" : "bg-black/0 backdrop-blur-none opacity-0 pointer-events-none"}`}
            onClick={handleClose}
        >
            <div
                className={`w-full md:max-w-[420px] bg-[#0f0f0f] md:rounded-[28px] rounded-t-[28px] border border-white/[0.07] shadow-[0_20px_60px_rgba(0,0,0,0.5)] overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${isVisible ? "translate-y-0 md:scale-100 opacity-100" : "translate-y-full md:translate-y-4 md:scale-95 opacity-0"}`}
                style={{ maxHeight: "92dvh" }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* ── Drag Handle (mobile only) ── */}
                <div className="flex justify-center pt-3 pb-1 md:hidden">
                    <div className="w-10 h-1 rounded-full bg-white/15" />
                </div>

                {/* ── Header ── */}
                <div className="flex items-center gap-3 px-5 pt-4 pb-4 md:pt-5">
                    {view === "resell" && showShareView && (
                        <button
                            onClick={() => { setView("share"); setResellGenerated(false); }}
                            className="w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-all flex-shrink-0"
                        >
                            <BackIcon />
                        </button>
                    )}
                    <div className="flex-1 min-w-0">
                        <h3 className="text-white font-bold text-[15px] leading-tight">
                            {view === "share" ? "Share" : flowTitle}
                        </h3>
                        <p className="mt-0.5 text-[11px] font-medium leading-relaxed text-white/30">
                            {view === "share" ? title : flowSubtitle}
                        </p>
                    </div>
                    <button
                        onClick={handleClose}
                        className="w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all flex-shrink-0"
                    >
                        <CloseIcon />
                    </button>
                </div>

                {/* ── Divider ── */}
                <div className="h-px bg-white/[0.05] mx-5" />

                {/* ── Scrollable Body ── */}
                <div className="overflow-y-auto" style={{ maxHeight: "calc(92dvh - 90px)" }}>

                    {/* ════════════ VIEW 1 — Normal Share ════════════ */}
                    {view === "share" && showShareView && (
                        <div className="p-5 space-y-5">

                            {/* Platform Grid */}
                            <div className="grid grid-cols-3 gap-3">
                                {platforms.map((p) => (
                                    <button
                                        key={p.name}
                                        onClick={p.action}
                                        className="flex flex-col items-center gap-2.5 group"
                                    >
                                        <div className={`w-[58px] h-[58px] ${p.bg} rounded-[18px] flex items-center justify-center text-white shadow-lg ${p.shadow} transition-all duration-200 group-hover:scale-[1.08] group-active:scale-[0.94]`}>
                                            {p.icon}
                                        </div>
                                        <span className="text-[10px] text-white/40 font-semibold group-hover:text-white/70 transition-colors text-center leading-tight">
                                            {p.name}
                                        </span>
                                    </button>
                                ))}
                            </div>

                            {/* Single Product Link Bar */}
                            <div className="space-y-3">
                                <p className="text-[9px] text-white/25 font-black uppercase tracking-[0.2em] px-1">{isSponsoredAd ? "Ad Link" : isUploadShareItem ? "Reel Link" : "Product Link"}</p>
                                <div className="flex items-center gap-3 bg-white/[0.04] border border-white/[0.07] rounded-2xl p-3.5">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[11px] text-blue-400 truncate font-mono block">
                                            {displayUrl}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => { void handlePrimaryCopyLink(); }}
                                        className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-bold transition-all duration-200 ${copied ? "bg-emerald-500 text-white" : "bg-white text-black hover:bg-white/90 active:scale-95"}`}
                                    >
                                        {copied ? "Copied" : "Copy"}
                                    </button>
                                </div>
                            </div>

                            {/* Resell CTA */}
                            {canShowResellFlow && (
                                <button
                                    onClick={() => setView("resell")}
                                    className="w-full flex items-center gap-4 p-4 rounded-2xl border border-amber-500/20 bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-transparent hover:from-amber-500/15 hover:border-amber-500/30 transition-all duration-200 group active:scale-[0.98]"
                                >
                                    <div className="w-11 h-11 rounded-xl bg-amber-500/15 flex items-center justify-center text-amber-400 flex-shrink-0 group-hover:bg-amber-500/20 transition-colors">
                                        <ResellIcon />
                                    </div>
                                    <div className="flex-1 text-left min-w-0">
                                        <p className="text-[13px] font-bold text-white">{flowEarnLabel}</p>
                                        <p className="text-[10px] text-amber-400/60 font-medium mt-0.5">
                                            {resellCommission
                                                ? isUploadShareItem
                                                    ? `${resellCommission}% commission when eligible viewers watch through your link`
                                                    : `${resellCommission}% commission on every sale`
                                                : `Create your personalized ${flowActionLabelLower} link`}
                                        </p>
                                    </div>
                                    <div className="text-white/20 group-hover:text-white/40 transition-colors flex-shrink-0">
                                        <ChevronRightIcon />
                                    </div>
                                </button>
                            )}

                            {canShowResellFlow && (
                                <p className="text-center text-[10px] text-white/15 font-medium pb-2">
                                    {isUploadShareItem ? "Googer Reel · Share & Earn" : "Googer Marketplace · Share & Earn"}
                                </p>
                            )}
                        </div>
                    )}

                    {/* ════════════ VIEW 2 — Resell ════════════ */}
                    {view === "resell" && (
                        <div className="p-5 space-y-4 pb-6">

                            {/* Commission Badge */}
                            {!autoHandleRepostFlow && (
                            <div className={`flex items-center gap-4 p-4 rounded-2xl border ${resellCommission ? "border-amber-500/20 bg-gradient-to-r from-amber-500/10 to-transparent" : "border-white/[0.06] bg-white/[0.03]"}`}>
                                <div className={`px-4 h-16 min-w-[4rem] rounded-2xl flex items-center justify-center flex-shrink-0 ${resellCommission ? "bg-amber-500/15" : "bg-white/5"}`}>
                                    {resellCommission ? (
                                        <span className="text-amber-400 font-black leading-none" style={{ fontSize: Number(resellCommission) >= 100 ? '16px' : '20px' }}>{resellCommission}%</span>
                                    ) : (
                                        <span className="text-white/20 text-2xl font-black">—</span>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[9px] text-white/25 font-semibold uppercase tracking-widest mb-1">{flowCommissionTitle}</p>
                                    {resellCommission ? (
                                        <>
                                            <p className="text-white font-bold text-[15px] truncate">{isUploadShareItem ? `${resellCommission}% per eligible watch` : `${resellCommission}% per sale`}</p>
                                            <p className="text-[10px] text-amber-400/60 font-medium mt-0.5 leading-relaxed">
                                                {isUploadShareItem
                                                    ? "Credited after eligible watch."
                                                    : "Credited to your account on order completion"}
                                            </p>
                                        </>
                                    ) : (
                                        <p className="text-white/40 text-[13px] font-medium">{isUploadShareItem ? "Not set for this content" : "Not set for this product"}</p>
                                    )}
                                </div>
                            </div>
                            )}

                            {/* ID Input */}
                            {!autoHandleRepostFlow && (
                            <div className="space-y-2">
                                <label className="block text-[10px] text-white/35 font-semibold uppercase tracking-widest px-1">
                                    {isUploadShareItem ? "Enter your Googer ID or Username" : "Enter User ID or Username"}
                                </label>
                                <div className="flex flex-col xs:flex-row items-stretch xs:items-center gap-2.5">
                                    <div className="flex-1 relative">
                                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/20">
                                            <PersonIcon />
                                        </span>
                                        <input
                                            type="text"
                                            value={resellId}
                                            onChange={(e) => {
                                                const next = e.target.value;
                                                setResellId(next);
                                                setResellGenerated(false);
                                                if (!next.trim()) {
                                                    setResellError("");
                                                } else if (!isOwnIdentifier(next)) {
                                                    setResellError(
                                                        `You can only use your own Username (${resellOwnUsername || "—"}) or your Googer ID (${resellOwnUserId || "—"}).`
                                                    );
                                                } else {
                                                    setResellError("");
                                                }
                                            }}
                                            placeholder={resellOwnUsername || resellOwnUserId || "Your Username or Googer ID"}
                                            className={`w-full bg-white/[0.05] border ${resellError ? "border-red-500/60 focus:border-red-500" : "border-white/[0.08] hover:border-white/15 focus:border-amber-500/50"} focus:bg-white/[0.07] rounded-2xl pl-11 pr-4 py-3.5 text-white placeholder-white/15 text-[13px] font-medium focus:outline-none transition-all duration-200`}
                                            onKeyDown={(e) => e.key === "Enter" && !resellError && isOwnIdentifier(resellId) && handleGenerateResellLink()}
                                        />
                                    </div>
                                    <button
                                        onClick={handleGenerateResellLink}
                                        disabled={!resellId.trim() || !isOwnIdentifier(resellId)}
                                        className="w-full xs:w-auto flex-shrink-0 px-5 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-black font-bold text-[12px] transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-amber-500 active:scale-95"
                                    >
                                        {flowGenerateButtonLabel}
                                    </button>
                                </div>
                                {resellError ? (
                                    <div className="flex items-start gap-2 px-1 py-2 rounded-xl bg-red-500/10 border border-red-500/20">
                                        <span className="text-red-400 text-base leading-none mt-0.5">⚠</span>
                                        <p className="text-[11px] text-red-400 font-semibold leading-relaxed">{resellError}</p>
                                    </div>
                                ) : (
                                        <p className="text-[10px] text-white/20 px-1 font-medium leading-relaxed italic">
                                            Only your own account identifier is allowed. Final link will combine code <span className="text-amber-400 font-bold">{productCode}</span> with your ID.
                                        </p>
                                )}
                            </div>
                            )}

                            {/* Generated Link Box */}
                            {resellGenerated && resellLink && (
                                <div className="space-y-3 animate-in slide-in-from-bottom-3 duration-300">
                                    {/* Success indicator */}
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                        <span className="text-[10px] text-emerald-400 font-semibold uppercase tracking-widest">{flowReadyLabel}</span>
                                    </div>

                                    {/* Link Display */}
                                    <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-4 space-y-3">
                                        <p className="text-[10px] text-white/25 font-semibold uppercase tracking-widest">{flowGeneratedLabel}</p>
                                        <a href={resellLink} className="text-[12px] text-emerald-400 hover:text-emerald-300 break-all font-mono leading-relaxed bg-black/30 rounded-xl p-3 border border-white/[0.05] block cursor-pointer transition-colors">
                                            {resellLink}
                                        </a>
                                        <button
                                            onClick={() => { void copyToClipboard(resellLink, setResellCopied); }}
                                            className={`w-full py-3 rounded-xl text-[12px] font-bold transition-all duration-200 active:scale-[0.97] ${resellCopied ? "bg-emerald-500 text-white" : "bg-amber-500 hover:bg-amber-400 text-black"}`}
                                        >
                                            {resellCopied ? "Copied to clipboard!" : flowCopyButtonLabel}
                                        </button>
                                    </div>

                                    {/* Quick share resell link */}
                                    <div>
                                        <p className="text-[10px] text-white/20 font-semibold uppercase tracking-widest mb-3 px-1">{flowSharePrompt}</p>
                                        <div className="flex gap-3">
                                            {resellSharePlatforms.map((p) => (
                                                <button
                                                    key={p.name}
                                                    onClick={p.action}
                                                    className="flex flex-col items-center gap-2 flex-1 group"
                                                >
                                                    <div className={`w-13 h-13 w-[52px] h-[52px] ${p.bg} rounded-[16px] flex items-center justify-center text-white shadow-lg transition-all group-hover:scale-[1.08] group-active:scale-[0.94]`}>
                                                        {p.icon}
                                                    </div>
                                                    <span className="text-[9px] text-white/30 font-semibold group-hover:text-white/60 transition-colors">{p.name}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
