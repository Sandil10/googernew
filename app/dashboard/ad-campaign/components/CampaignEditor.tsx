"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import IonIcon from "@/app/components/IonIcon";
import { authService } from "@/services/authService";
import { walletService } from "@/services/walletService";
import { adsService } from "@/services/adsService";
import { marketService } from "@/services/marketService";
import { subscriptionService } from "@/services/subscriptionService";
import { getProfileShareUrl, getShareUrlForItem } from "@/app/lib/shareLinks";
import { addAdWalletRefund, getUserIdentityKey, getWalletBalanceWithAdAdjustments } from "@/utils/adWallet";
import { calcReach, type ReachTier } from "@/utils/reachCalc";

type PreviewMode = "mobile" | "desktop";
type LinkPreviewType = "image" | "video" | "embed" | "website" | null;
type SocialPlatform = "YouTube" | "Instagram" | "TikTok" | "Facebook" | "X" | "Website";
type GenderTarget = "All" | "Male" | "Female";
type CountryOption = {
    code: string;
    name: string;
    flag: string;
    flagEmoji: string;
    dialCode: string;
};
type CtaTopic =
    | "Visit"
    | "Learn More"
    | "Shop Now"
    | "Buy Now"
    | "Call Now"
    | "WhatsApp"
    | "Message"
    | "Sign Up"
    | "Contact Us"
    | "Apply Now"
    | "Book Now"
    | "No Button";
type LinkPreviewMeta = {
    title: string;
    thumbnail: string;
    isYouTube: boolean;
    platform: SocialPlatform;
    embedUrl: string;
    isPlayable: boolean;
};
type PendingVideoCrop = {
    sourceUrl: string;
    fileName: string;
    duration: number;
    width: number;
    height: number;
};
type PublishedAdReview = {
    adId: string;
    createdAt: string;
    campaignType: string;
    ownerKey?: string;
    ownerId?: string;
    ownerUsername?: string;
    budget?: number;
    durationDays?: number;
    title?: string;
    description?: string;
    mediaPreview?: string;
    mediaGallery?: string[];
    mediaType?: "image" | "video" | "link" | "profile" | "";
    genderTarget?: GenderTarget;
    ageMin?: number;
    ageMax?: number;
    reach?: number;
    impressions?: number;
    clicks?: number;
    spend?: number;
    remainingBudget?: number;
    tierId?: number;
    estimatedReachMin?: number;
    estimatedReachMax?: number;
    maxReachCap?: number;
    promoCode?: string | null;
    promoDiscount?: number | null;
    status?: "Under Review" | "Active" | "Completed" | "Cancelled";
    campaignPath?: string;
    editDraft?: {
        editingAdId?: string;
        promoteAgain?: boolean;
        activeLink: string;
        linkInput: string;
        description: string;
        ctaTopic: CtaTopic;
        ctaValue: string;
        selectedCountryCode: string;
        selectedLocationCodes: string[];
        genderTarget: GenderTarget;
        ageMin: number;
        ageMax: number;
        selectedInterestTopics: string[];
        selectedPlacements: string[];
        budget: number;
        durationDays: number;
        promoCode: string;
        hasPromoCodeAdded: boolean;
        mediaPreview?: string;
        mediaGallery?: string[];
        mediaType?: "image" | "video" | "link" | "profile" | "";
        imageName?: string;
        linkedProductId?: number | string;
    };
};

const CTA_OPTIONS: CtaTopic[] = [
    "Visit",
    "Learn More",
    "Shop Now",
    "Buy Now",
    "Call Now",
    "WhatsApp",
    "Message",
    "Sign Up",
    "Contact Us",
    "Apply Now",
    "Book Now",
    "No Button",
];

const CTA_FIELD_LABELS: Record<CtaTopic, string> = {
    Visit: "Website link",
    "Learn More": "Website link",
    "Shop Now": "Product or website link",
    "Buy Now": "Purchase link",
    "Call Now": "Phone number",
    WhatsApp: "WhatsApp number or link",
    Message: "",
    "Sign Up": "Registration link",
    "Contact Us": "Contact link, email, or phone number",
    "Apply Now": "Application link",
    "Book Now": "Booking link",
    "No Button": "",
};

const CTA_FIELD_PLACEHOLDERS: Record<CtaTopic, string> = {
    Visit: "https://example.com",
    "Learn More": "https://example.com/learn-more",
    "Shop Now": "Product or website URL",
    "Buy Now": "Purchase URL",
    "Call Now": "+1 555 000 0000",
    WhatsApp: "WhatsApp number or https://wa.me/...",
    Message: "",
    "Sign Up": "Registration URL",
    "Contact Us": "Contact page, email, or phone",
    "Apply Now": "Application URL",
    "Book Now": "Booking URL",
    "No Button": "",
};

const PROMO_DURATION_MAX = 7;
const AD_DRAFT_VERSION = 1;
const AD_REVIEW_VERSION = 1;
const AD_ID_COUNTER_KEY = "googer-ad-review-next-id";
const AD_ID_START = 100000000012;
const VIDEO_MAX_DURATION_SECONDS = 60;
const GENDER_OPTIONS: GenderTarget[] = ["All", "Male", "Female"];
const INTEREST_TOPIC_LIMIT = 10;
const INTEREST_TOPIC_OPTIONS = [
    "Fashion",
    "Electronics",
    "Beauty",
    "Fitness",
    "Food",
    "Travel",
    "Gaming",
    "Education",
    "Business",
    "Sports",
    "Home",
    "Music",
    "Movies",
    "Automotive",
    "Health",
    "Technology",
    "Finance",
    "Real Estate",
    "Events",
    "Shopping",
];
const PLACEMENT_OPTIONS = [
    { label: "All", selectable: true },
    { label: "Goog Msg", selectable: true },
    { label: "Feed", selectable: false },
    { label: "Stories", selectable: false },
    { label: "Reels", selectable: false },
    { label: "Search", selectable: false },
    { label: "Profile", selectable: false },
    { label: "Marketplace", selectable: false },
];
const AVAILABLE_PLACEMENT_LABELS = PLACEMENT_OPTIONS.filter((placement) => placement.selectable && placement.label !== "All").map((placement) => placement.label);
const PROFILE_PROMOTE_FEATURED_LIMIT = 3;
const PROFILE_PROMOTE_PICKER_VISIBLE_COUNT = 5;

function normalizePlacementLabel(value: unknown) {
    if (value === "Chat") return "Goog Msg";
    if (typeof value !== "string" || value === "Home" || value === "Shop") return null;
    return value === "All" || AVAILABLE_PLACEMENT_LABELS.includes(value) ? value : null;
}

function getYouTubeEmbedUrl(value: string) {
    const id = getYouTubeVideoId(value);
    return id ? `https://www.youtube.com/embed/${id}` : null;
}

function getYouTubeVideoId(value: string) {
    try {
        const url = new URL(normalizeUrl(value));
        const host = url.hostname.replace(/^www\./i, "").toLowerCase();

        if (host === "youtu.be") {
            const id = url.pathname.split("/").filter(Boolean)[0];
            return id || null;
        }

        if (host.includes("youtube.com")) {
            if (url.pathname.startsWith("/shorts/") || url.pathname.startsWith("/embed/")) {
                return url.pathname.split("/").filter(Boolean)[1] || null;
            }

            return url.searchParams.get("v");
        }
    } catch {
        return null;
    }

    return null;
}

function isBlobUrl(value: string) {
    return value.startsWith("blob:");
}

function isVideoUploadFile(file: File) {
    return file.type.startsWith("video/") || /\.(mp4|mov|avi|mkv|webm|ogg|ogv|m4v|wmv|flv|3gp)$/i.test(file.name);
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function formatVideoTime(value: number) {
    const totalSeconds = Math.max(0, Math.floor(value));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function getSocialPlatform(value: string): SocialPlatform {
    try {
        const host = new URL(normalizeUrl(value)).hostname.replace(/^www\./i, "").toLowerCase();

        if (host === "youtu.be" || host.includes("youtube.com")) return "YouTube";
        if (host.includes("instagram.com")) return "Instagram";
        if (host.includes("tiktok.com")) return "TikTok";
        if (host.includes("facebook.com") || host.includes("fb.watch")) return "Facebook";
        if (host === "x.com" || host.includes("twitter.com")) return "X";
    } catch {
        return "Website";
    }

    return "Website";
}

function getTikTokVideoId(value: string) {
    try {
        const parts = new URL(normalizeUrl(value)).pathname.split("/").filter(Boolean);
        const videoIndex = parts.findIndex((part) => part === "video");
        return videoIndex >= 0 ? parts[videoIndex + 1] || null : null;
    } catch {
        return null;
    }
}

function getSocialEmbedUrl(value: string) {
    const normalized = normalizeUrl(value);
    const platform = getSocialPlatform(normalized);

    if (platform === "YouTube") {
        return getYouTubeEmbedUrl(normalized);
    }

    if (platform === "Instagram") {
        try {
            const url = new URL(normalized);
            const parts = url.pathname.split("/").filter(Boolean);
            const type = parts[0];
            const shortcode = parts[1];

            if (["p", "reel", "tv"].includes(type) && shortcode) {
                return `https://www.instagram.com/${type}/${shortcode}/embed`;
            }
        } catch {
            return null;
        }
    }

    if (platform === "TikTok") {
        const videoId = getTikTokVideoId(normalized);
        return videoId ? `https://www.tiktok.com/embed/v2/${videoId}` : null;
    }

    if (platform === "Facebook") {
        const isVideoUrl = /\/videos\/|\/watch\/|\?v=|fb\.watch/i.test(normalized);
        const plugin = isVideoUrl ? "video.php" : "post.php";
        return `https://www.facebook.com/plugins/${plugin}?href=${encodeURIComponent(normalized)}&show_text=false&width=560`;
    }

    return null;
}

function getLinkPreviewType(value: string): LinkPreviewType {
    const normalized = normalizeUrl(value);
    if (!normalized) return null;

    const socialEmbed = getSocialEmbedUrl(normalized);
    if (socialEmbed) return "embed";

    const imagePattern = /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i;
    const videoPattern = /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i;
    const googleImageSource = getGoogleImageSourceUrl(normalized);

    if (googleImageSource) return "image";
    if (imagePattern.test(normalized)) return "image";
    if (videoPattern.test(normalized)) return "video";
    return "website";
}

function normalizeUrl(value: string) {
    if (!value.trim()) return "";
    return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function getGoogleImageSourceUrl(value: string) {
    try {
        const url = new URL(normalizeUrl(value));
        const host = url.hostname.replace(/^www\./i, "").toLowerCase();
        if (!host.includes("google.") || url.pathname !== "/imgres") return "";
        const imageUrl = url.searchParams.get("imgurl");
        return imageUrl ? decodeURIComponent(imageUrl) : "";
    } catch {
        return "";
    }
}

function getLinkPreviewThumbnail(value: string) {
    const normalized = normalizeUrl(value);
    if (!normalized) return "";

    const googleImageSource = getGoogleImageSourceUrl(normalized);
    if (googleImageSource) return googleImageSource;

    const imagePattern = /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i;
    if (imagePattern.test(normalized)) return normalized;

    const youtubeThumbnail = getYouTubeVideoId(normalized)
        ? `https://img.youtube.com/vi/${getYouTubeVideoId(normalized)}/hqdefault.jpg`
        : "";
    if (youtubeThumbnail) return youtubeThumbnail;

    return `https://api.microlink.io?url=${encodeURIComponent(normalized)}&screenshot=true&meta=false&embed=screenshot.url`;
}

function getDomainLabel(value: string) {
    try {
        return new URL(normalizeUrl(value)).hostname.replace(/^www\./i, "");
    } catch {
        return value;
    }
}

function getDefaultLinkTitle(value: string) {
    const platform = getSocialPlatform(value);
    return platform === "Website" ? getDomainLabel(value) : `${platform} preview`;
}

function getProductImageSrc(product: any) {
    const candidates = [
        product?.image_url,
        product?.media_preview,
        ...(Array.isArray(product?.media_gallery) ? product.media_gallery : []),
    ]
        .map((value) => String(value || "").trim())
        .filter(Boolean);
    const selected = candidates[0] || "https://picsum.photos/400/400";
    if (selected.startsWith("/uploads/") || /^https?:\/\//i.test(selected) || selected.startsWith("data:")) return selected;
    return selected.includes("uploads") || selected.includes("\\")
        ? `/uploads/${selected.split(/[\\/]/).pop()}`
        : selected;
}

function getProductShareTarget(rawLink: string) {
    const trimmed = rawLink.trim();
    if (!trimmed) return null;

    const tryParseUrl = (input: string) => {
        try {
            return new URL(input);
        } catch {
            return null;
        }
    };

    const parsed = tryParseUrl(normalizeUrl(trimmed)) || tryParseUrl(`https://placeholder.local${trimmed.startsWith("/") ? trimmed : `/${trimmed}`}`);
    if (parsed) {
        const parts = parsed.pathname.split("/").filter(Boolean);
        const sectionIndex = parts.findIndex((part) => ["product", "share", "shop"].includes(part.toLowerCase()));
        if (sectionIndex !== -1 && parts[sectionIndex + 1]) {
            const section = parts[sectionIndex].toLowerCase();
            const raw = parts[sectionIndex + 1];
            const value = decodeURIComponent(raw);
            if (section === "shop") {
                return /^\d+$/.test(value) ? { mode: "id" as const, value } : { mode: "code" as const, value };
            }
            return /^\d+$/.test(value) ? { mode: "id" as const, value } : { mode: "code" as const, value };
        }
    }

    // Fallback: treat the raw input as a bare product code/id
    if (/^[A-Za-z0-9_-]+$/.test(trimmed)) {
        return /^\d+$/.test(trimmed) ? { mode: "id" as const, value: trimmed } : { mode: "code" as const, value: trimmed };
    }

    return null;
}

function getProfileUsernameFromLink(rawLink: string) {
    const trimmed = rawLink.trim();
    if (!trimmed) return "";

    try {
        const parsed = new URL(normalizeUrl(trimmed));
        const segments = parsed.pathname.split("/").filter(Boolean);
        const first = (segments[0] || "").toLowerCase();
        const dashboardSection = (segments[1] || "").toLowerCase();
        const queryUsername = parsed.searchParams.get("user");
        const queryId = parsed.searchParams.get("id");

        if (first === "dashboard" && dashboardSection === "profile") {
            return (queryUsername || queryId || "").trim();
        }
        if (first === "u" || first === "profile") return (segments[1] || "").trim();
        if (first && !["dashboard", "share", "product", "shop", "register", "login"].includes(first.toLowerCase())) {
            return (segments[0] || "").trim();
        }
    } catch {
        // Fall back to treating a bare value as a username.
    }

    return trimmed.replace(/^@/, "").replace(/^\/+|\/+$/g, "").split("/").filter(Boolean).pop() || "";
}

function getFlagEmoji(countryCode: string) {
    if (!countryCode || countryCode.length !== 2) return "○";
    return countryCode
        .toUpperCase()
        .split("")
        .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
        .join("");
}

function getCountryFlagUrl(country: CountryOption | undefined) {
    if (!country?.code) return "";
    return country.flag || `https://flagcdn.com/${country.code.toLowerCase()}.svg`;
}

function ctaUsesCountryPhone(topic: CtaTopic) {
    return topic === "Call Now" || topic === "WhatsApp";
}

function ctaNeedsDetailField(topic: CtaTopic) {
    return topic !== "Message" && topic !== "No Button";
}

function renderHighlightedDescription(value: string) {
    if (!value) {
        return <span className="text-white/25">Write a short ad description...</span>;
    }

    const tokenPattern = /(https?:\/\/[^\s]+|www\.[^\s]+|@[a-zA-Z0-9_.]+|#[a-zA-Z0-9_]+)/g;
    const highlightPattern = /^(https?:\/\/[^\s]+|www\.[^\s]+|@[a-zA-Z0-9_.]+|#[a-zA-Z0-9_]+)$/;
    const parts = value.split(tokenPattern);

    return parts.map((part, index) => {
        if (highlightPattern.test(part)) {
            return (
                <span key={`${part}-${index}`} className="text-sky-400">
                    {part}
                </span>
            );
        }

        return <span key={`${part}-${index}`}>{part}</span>;
    });
}

export default function CampaignEditor({ campaignType }: { campaignType: string }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const cropTimelineRef = useRef<HTMLDivElement | null>(null);
    const hasLoadedDraftRef = useRef(false);
    const wasInsufficientBalanceRef = useRef(false);
    const [linkInput, setLinkInput] = useState("");
    const [activeLink, setActiveLink] = useState("");
    const [previewMode, setPreviewMode] = useState<PreviewMode>("mobile");
    const [imagePreview, setImagePreview] = useState("");
    const [historyMediaPreview, setHistoryMediaPreview] = useState("");
    const [imageGalleryPreviews, setImageGalleryPreviews] = useState<string[]>([]);
    const [historyMediaGallery, setHistoryMediaGallery] = useState<string[]>([]);
    const [imageName, setImageName] = useState("");
    const [uploadedMediaType, setUploadedMediaType] = useState<"image" | "video" | "">("");
    const [selectedGalleryIndex, setSelectedGalleryIndex] = useState(0);
    const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
    const [linkPreviewMeta, setLinkPreviewMeta] = useState<LinkPreviewMeta | null>(null);
    const [popupError, setPopupError] = useState("");
    const [publishedAd, setPublishedAd] = useState<PublishedAdReview | null>(null);
    const [showPublishedPopup, setShowPublishedPopup] = useState(false);
    const [isPublishing, setIsPublishing] = useState(false);
    const [adIdCopied, setAdIdCopied] = useState(false);
    const [description, setDescription] = useState("");
    const [ctaTopic, setCtaTopic] = useState<CtaTopic>("Visit");
    const [ctaValue, setCtaValue] = useState("");
    const [countries, setCountries] = useState<CountryOption[]>([]);
    const [selectedCountryCode, setSelectedCountryCode] = useState("US");
    const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false);
    const [countrySearch, setCountrySearch] = useState("");
    const [selectedLocationCodes, setSelectedLocationCodes] = useState<string[]>([]);
    const [draftLocationCodes, setDraftLocationCodes] = useState<string[]>([]);
    const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
    const [locationSearch, setLocationSearch] = useState("");
    const [genderTarget, setGenderTarget] = useState<GenderTarget>("All");
    const [ageMin, setAgeMin] = useState(18);
    const [ageMax, setAgeMax] = useState(65);
    const [selectedInterestTopics, setSelectedInterestTopics] = useState<string[]>([]);
    const [draftInterestTopics, setDraftInterestTopics] = useState<string[]>([]);
    const [isInterestTopicsOpen, setIsInterestTopicsOpen] = useState(false);
    const [selectedPlacements, setSelectedPlacements] = useState<string[]>(["All", ...AVAILABLE_PLACEMENT_LABELS]);
    const [isPlacementDropdownOpen, setIsPlacementDropdownOpen] = useState(false);
    const [budget, setBudget] = useState<number | null>(null);
    const [budgetInput, setBudgetInput] = useState("");
    const [isBudgetEditing, setIsBudgetEditing] = useState(false);
    const [durationDays, setDurationDays] = useState(1);
    const [promoCode, setPromoCode] = useState("");
    const [isPromoEditing, setIsPromoEditing] = useState(true);
    const [hasPromoCodeAdded, setHasPromoCodeAdded] = useState(false);
    const [isValidatingPromo, setIsValidatingPromo] = useState(false);
    const [promoError, setPromoError] = useState("");
    const [promoDiscount, setPromoDiscount] = useState<{ discount_type: string; discount_value: number; reach_cap?: number | null; min_reach_bonus?: number; max_reach_bonus?: number; promo_max_days?: number } | null>(null);
    const [reachTiers, setReachTiers] = useState<ReachTier[]>([]);
    const [walletBalance, setWalletBalance] = useState(0);
    const [walletBalanceLoaded, setWalletBalanceLoaded] = useState(false);
    const [userProfile, setUserProfile] = useState<any | null>(null);
    const [showInsufficientBalanceModal, setShowInsufficientBalanceModal] = useState(false);
    const [isInsufficientBalanceDismissed, setIsInsufficientBalanceDismissed] = useState(false);
    const [showCancelConfirm, setShowCancelConfirm] = useState(false);
    const [acceptedProfileNonRefundable, setAcceptedProfileNonRefundable] = useState(false);
    const [editingAdId, setEditingAdId] = useState("");
    const [editingOriginalBudget, setEditingOriginalBudget] = useState<number | null>(null);
    const [isPromoteAgain, setIsPromoteAgain] = useState(false);
    const [linkedProduct, setLinkedProduct] = useState<any | null>(null);
    const [profilePromoteUser, setProfilePromoteUser] = useState<any | null>(null);
    const [profilePromoteProducts, setProfilePromoteProducts] = useState<any[]>([]);
    const [profilePromoteAvailable, setProfilePromoteAvailable] = useState<any[]>([]);
    const [profilePromoteSlideIndex, setProfilePromoteSlideIndex] = useState(0);
    const [profilePromoteAvailableSlideIndex, setProfilePromoteAvailableSlideIndex] = useState(0);
    const [profileLinkCopied, setProfileLinkCopied] = useState(false);
    const [userHasPaidSubscription, setUserHasPaidSubscription] = useState<boolean | null>(null);
    const [adsExpiryLabel, setAdsExpiryLabel] = useState<string>("30 days");

    useEffect(() => {
        let active = true;
        const fetchSubscription = async () => {
            try {
                const [sub, plan] = await Promise.all([
                    subscriptionService.getMySubscription(),
                    subscriptionService.getMyPlan(),
                ]);
                if (active) {
                    setUserHasPaidSubscription(!!sub && sub.plan_slug !== 'basic');
                    const expiryValue = Number(plan?.extra?.ads_expiry_value ?? plan?.extra?.ads_expiry_days ?? 0);
                    const expiryUnit = String(plan?.extra?.ads_expiry_unit || 'days').toLowerCase();
                    if (expiryValue > 0) {
                        if (expiryUnit === 'minutes') {
                            setAdsExpiryLabel(`${expiryValue} minute${expiryValue === 1 ? '' : 's'}`);
                        } else if (expiryUnit === 'hours') {
                            setAdsExpiryLabel(`${expiryValue} hour${expiryValue === 1 ? '' : 's'}`);
                        } else {
                            setAdsExpiryLabel(`${expiryValue} day${expiryValue === 1 ? '' : 's'}`);
                        }
                    }
                }
            } catch (error) {
                console.error("Failed to load subscription status:", error);
                if (active) {
                    setUserHasPaidSubscription(false);
                }
            }
        };
        void fetchSubscription();
        return () => {
            active = false;
        };
    }, []);
    const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
    const [pendingVideoCrop, setPendingVideoCrop] = useState<PendingVideoCrop | null>(null);
    const [trimStartSeconds, setTrimStartSeconds] = useState(0);
    const [trimEndSeconds, setTrimEndSeconds] = useState(VIDEO_MAX_DURATION_SECONDS);
    const [trimError, setTrimError] = useState("");
    const [isTrimmingVideo, setIsTrimmingVideo] = useState(false);
    const [isDraggingTrimWindow, setIsDraggingTrimWindow] = useState(false);
    const [playingPreview, setPlayingPreview] = useState<Record<PreviewMode, boolean>>({
        mobile: false,
        desktop: false,
    });

    const hasLink = activeLink.trim().length > 0;
    const isProductPromote = campaignType === "Product Promote";
    const isProfilePromote = campaignType === "Profile Promote";
    const profileUsername = (typeof userProfile?.username === "string" && userProfile.username) || "your-handle";
    const profileLink = getProfileShareUrl({ username: profileUsername });
    const promotedProfile = profilePromoteUser || userProfile;
    const promotedProfileLink = getProfileShareUrl({ username: promotedProfile?.username || profileUsername });
    const hasUploadedImage = uploadedMediaType === "image" ? imageGalleryPreviews.length > 0 : imagePreview.trim().length > 0;
    const hasUploadedVideo = uploadedMediaType === "video";
    const activePlatform = useMemo(() => getSocialPlatform(activeLink), [activeLink]);
    const previewTitle = isProductPromote && linkedProduct
        ? String(linkedProduct.title || "")
        : (!hasLink ? "" : linkPreviewMeta?.title || getDefaultLinkTitle(activeLink));
    const previewHref = useMemo(() => normalizeUrl(activeLink), [activeLink]);
    const linkPreviewType = useMemo(() => getLinkPreviewType(activeLink), [activeLink]);
    const isStandardMediaLink = linkPreviewType === "image" || linkPreviewType === "video" || linkPreviewType === "embed";
    const shouldShowRichLinkMeta = hasLink && !isStandardMediaLink;
    const linkPreviewImage = linkPreviewMeta?.thumbnail || (linkPreviewType === "image" ? previewHref : "");
    const selectedPreviewImage = isProductPromote && linkedProduct
        ? getProductImageSrc(linkedProduct)
        : uploadedMediaType === "image"
            ? (imageGalleryPreviews[selectedGalleryIndex] || imageGalleryPreviews[0] || "")
            : (imagePreview || linkPreviewImage);
    const persistedImageGallery = historyMediaGallery.length > 0
        ? historyMediaGallery
        : (historyMediaPreview ? [historyMediaPreview] : []);
    const youtubeEmbedUrl = useMemo(() => getYouTubeEmbedUrl(activeLink), [activeLink]);
    const socialEmbedUrl = useMemo(() => getSocialEmbedUrl(activeLink), [activeLink]);
    const selectedCountry = countries.find((country) => country.code === selectedCountryCode) || countries[0];
    const effectivePaymentAmount = budget === null ? 0
        : hasPromoCodeAdded && isProfilePromote
            ? 0  // Profile Promote + any promo = always free
            : hasPromoCodeAdded && promoDiscount?.discount_type === "rupee"
                ? Math.max(0, budget - promoDiscount.discount_value)
                : hasPromoCodeAdded && promoDiscount?.discount_type === "reach"
                    ? 0
                    // Edit mode (Under Review): only the budget difference is charged, not the full new budget
                    : editingAdId && !isPromoteAgain && editingOriginalBudget !== null
                        ? Math.max(0, budget - editingOriginalBudget)
                        : budget;
    const isFreeProfilePromotePromo = isProfilePromote && hasPromoCodeAdded;
    const showProfileNonRefundableNotice = isProfilePromote && !hasPromoCodeAdded;
    const hasInsufficientBalance = walletBalanceLoaded && budget !== null && effectivePaymentAmount > walletBalance;
    const isPromoLockingBudget = hasPromoCodeAdded && (
        isProfilePromote
            ? true  // Profile Promote: freeze packages the moment any promo is applied
            : budget !== null && (promoDiscount?.discount_type === "rupee" || promoDiscount?.discount_type === "reach")
    );
    const filteredCountries = useMemo(() => {
        const query = countrySearch.trim().toLowerCase();
        if (!query) return countries;

        return countries.filter((country) =>
            country.name.toLowerCase().includes(query) ||
            country.code.toLowerCase().includes(query) ||
            country.dialCode.includes(query)
        );
    }, [countries, countrySearch]);
    const filteredLocationCountries = useMemo(() => {
        const query = locationSearch.trim().toLowerCase();
        if (!query) return countries;

        return countries.filter((country) =>
            country.name.toLowerCase().includes(query) ||
            country.code.toLowerCase().includes(query)
        );
    }, [countries, locationSearch]);

    const formatRuppier = (value: number) => {
        return new Intl.NumberFormat("en-US", {
            maximumFractionDigits: 0,
        }).format(value);
    };

    const formatReachCount = (value: number) => {
        if (value < 1000) return formatRuppier(value);

        const roundedToHundred = Math.round(value / 100) / 10;
        return `${Number.isInteger(roundedToHundred) ? roundedToHundred.toFixed(0) : roundedToHundred.toFixed(1)}K`;
    };

    const budgetOptions = reachTiers.map((t) => ({
        value: Number(t.budget_from),
        tier: t,
    }));
    const tiersLoaded = reachTiers.length > 0;
    const isProfileAd = campaignType === "Profile Promote";
    const globalBudgetMin = tiersLoaded ? Math.min(...reachTiers.map((t) => Number(t.budget_from))) : 1;
    const globalBudgetMax = tiersLoaded ? Math.max(...reachTiers.map((t) => Number(t.budget_to))) : 10000;
    const budgetSliderIndex = budget !== null ? Math.max(0, budgetOptions.findIndex((o) => o.value === budget)) : 0;

    const sanitizePromoCode = (value: string) => value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 15).toUpperCase();
    const missingWalletAmount = Math.max(0, effectivePaymentAmount - walletBalance);
    const isAllDraftLocationsSelected = countries.length > 0 && countries.every((country) => draftLocationCodes.includes(country.code));
    const ageMinProgress = ((ageMin - 18) / (65 - 18)) * 100;
    const ageMaxProgress = ((ageMax - 18) / (65 - 18)) * 100;
    const areAllPlacementsSelected = AVAILABLE_PLACEMENT_LABELS.every((placement) => selectedPlacements.includes(placement));
    const placementDisplayLabel = areAllPlacementsSelected
        ? "All"
        : selectedPlacements.filter((placement) => placement !== "All").join(", ") || "Select placements";
    const shouldShowCtaButton = ctaTopic !== "No Button";
    const ageSummaryLabel = ageMin === 18 && ageMax === 65 ? "All" : `${ageMin}-${ageMax}`;
    const currentAdType = campaignType === "Product Promote" ? "product_promote_ad" : campaignType === "Profile Promote" ? "profile_promote_ad" : "photo_video_ad";
    const activeTier = budget !== null
        ? isProfileAd
            ? (reachTiers.find((t) => Number(t.budget_from) === budget) ?? null)
            : (reachTiers.find((t) => budget >= Number(t.budget_from) && budget <= Number(t.budget_to)) ?? null)
        : null;
    const isBudgetInGap = !isProfileAd && budget !== null && tiersLoaded && activeTier === null;
    const promoMaxDays = hasPromoCodeAdded && promoDiscount?.discount_type === "reach" && promoDiscount.promo_max_days != null
        ? promoDiscount.promo_max_days
        : null;
    const isDurationLocked = (activeTier !== null && activeTier.min_days === activeTier.max_days)
        || (hasPromoCodeAdded && promoDiscount?.discount_type !== "reach");
    const tierMinDays = activeTier?.min_days ?? 1;
    const tierMaxDays = promoMaxDays ?? (activeTier?.max_days ?? 30);
    // Clamp duration inside the active tier range whenever the tier changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (!activeTier) return;
        if (isDurationLocked) {
            setDurationDays(tierMinDays);
        } else {
            setDurationDays((prev) => Math.min(tierMaxDays, Math.max(tierMinDays, prev)));
        }
    }, [activeTier?.id]);

    useEffect(() => {
        if (!showProfileNonRefundableNotice) {
            setAcceptedProfileNonRefundable(false);
        }
    }, [showProfileNonRefundableNotice]);

    // When a "reach" promo is applied, auto-set budget + duration from the promo definition
    useEffect(() => {
        if (!hasPromoCodeAdded || !promoDiscount || promoDiscount.discount_type !== "reach") return;
        const promoValue = Number(promoDiscount.discount_value);
        if (promoValue > 0) {
            setBudget(promoValue);
        }
        if (promoDiscount.promo_max_days != null) {
            setDurationDays((prev) => Math.min(promoDiscount.promo_max_days!, Math.max(1, prev)));
            return;
        }
        // Fallback: derive max_days from the matching reach tier
        if (reachTiers.length === 0) return;
        const promoTier = reachTiers.find((t) =>
            promoValue >= Number(t.budget_from) &&
            promoValue <= Number(t.budget_to)
        );
        if (promoTier) {
            setDurationDays((prev) => Math.min(promoTier!.max_days, Math.max(1, prev)));
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasPromoCodeAdded, promoDiscount?.discount_type, promoDiscount?.discount_value, promoDiscount?.promo_max_days, reachTiers.length]);

    const profilePromoCodeDurationDays = isProfilePromote && hasPromoCodeAdded
        ? Math.max(1, Number(promoDiscount?.promo_max_days ?? promoDiscount?.discount_value ?? 0))
        : null;
    const effectiveDurationDays = profilePromoCodeDurationDays ?? (
        hasPromoCodeAdded && promoDiscount?.discount_type === "days"
            ? durationDays + promoDiscount.discount_value
            : durationDays
    );
    const durationSummaryLabel = `${effectiveDurationDays} ${effectiveDurationDays === 1 ? "day" : "days"}`;

    const effectiveBudget = hasPromoCodeAdded && promoDiscount?.discount_type === "reach"
        ? promoDiscount.discount_value
        : budget;
    const promoReachCap = hasPromoCodeAdded && promoDiscount?.discount_type === "reach" ? (promoDiscount.reach_cap ?? null) : null;

    // For reach-type promos the backend pre-computes the exact reach values — use them directly
    const promoDefinedReach = hasPromoCodeAdded
        && promoDiscount?.discount_type === "reach"
        && promoDiscount.min_reach_bonus != null
        && promoDiscount.max_reach_bonus != null
        ? { minReach: promoDiscount.min_reach_bonus, maxReach: promoDiscount.max_reach_bonus, reachCap: promoReachCap }
        : null;

    const showReach = currentAdType !== "profile_promote_ad"
        && (promoDefinedReach !== null || (activeTier !== null
            && (Number(activeTier.min_multiplier) > 0 || Number(activeTier.max_multiplier) > 0)));

    const reachResult = promoDefinedReach !== null
        ? promoDefinedReach
        : (showReach && effectiveBudget !== null
            ? calcReach(reachTiers, effectiveBudget, 0, 0, promoReachCap)
            : null);
    const estimatedReachMin = reachResult?.minReach ?? null;
    const estimatedReachMax = reachResult?.maxReach ?? null;
    const maxReachCap = reachResult?.reachCap ?? null;
    const estimatedReachLabel = estimatedReachMin !== null && estimatedReachMax !== null
        ? `${formatReachCount(estimatedReachMin)} – ${formatReachCount(estimatedReachMax)}`
        : null;
    const profileDisplayName = promotedProfile?.full_name || [promotedProfile?.first_name, promotedProfile?.last_name].filter(Boolean).join(" ") || promotedProfile?.username || "Your Profile";
    const profileImage = promotedProfile?.profile_picture || "";
    const profileInitial = profileDisplayName.trim().charAt(0).toUpperCase() || "G";
    const previewDescription = description.trim() || "Write a short ad description...";
    const popupErrorTitle = (() => {
        const message = popupError.toLowerCase();
        if (!message) return "Error";
        if (message.includes("insufficient") || message.includes("balance") || message.includes("payment")) return "Payment Error";
        if (message.includes("publish") || message.includes("failed")) return "Publish Error";
        if (message.includes("too many") || message.includes("rate") || message.includes("limit")) return "Too Many Requests";
        return "Required Field";
    })();

    const showPopupError = (message: string) => {
        const lower = message.toLowerCase();
        if (
            lower.includes("too many") ||
            lower.includes("rate limit") ||
            lower.includes("429") ||
            lower.includes("try again later")
        ) return;
        setPopupError(message);
    };

    const closeBudgetEditor = () => {
        setIsBudgetEditing(false);
        const parsed = parseInt(budgetInput.replace(/[^0-9]/g, ""), 10);
        if (!isNaN(parsed)) {
            setBudget(clamp(parsed, globalBudgetMin, globalBudgetMax));
        }
    };

    const applyBudgetInput = (value: string) => {
        const digits = value.replace(/[^0-9]/g, "");
        setBudgetInput(digits);
        const parsed = parseInt(digits, 10);
        if (!isNaN(parsed)) {
            setBudget(clamp(parsed, globalBudgetMin, globalBudgetMax));
        }
    };

    const clearSelectedUpload = () => {
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const revokeVideoPreviewIfNeeded = (previewUrl: string) => {
        if (previewUrl && isBlobUrl(previewUrl)) {
            URL.revokeObjectURL(previewUrl);
        }
    };

    const closeVideoCropModal = () => {
        setPendingVideoCrop((current) => {
            if (current?.sourceUrl) {
                URL.revokeObjectURL(current.sourceUrl);
            }
            return null;
        });
        setTrimStartSeconds(0);
        setTrimEndSeconds(VIDEO_MAX_DURATION_SECONDS);
        setTrimError("");
        setIsTrimmingVideo(false);
        setIsDraggingTrimWindow(false);
        clearSelectedUpload();
    };

    const fileToDataUrl = (file: Blob) => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("File could not be read."));
        reader.onerror = () => reject(new Error("File could not be read."));
        reader.readAsDataURL(file);
    });

    const applyVideoUpload = async (file: Blob, fileName: string, width: number, height: number) => {
        const dataUrl = await fileToDataUrl(file);
        const uploadFile = file instanceof File
            ? file
            : new File([file], fileName, { type: file.type || "video/webm" });
        if (imagePreview && uploadedMediaType === "video") {
            revokeVideoPreviewIfNeeded(imagePreview);
        }

        setImageGalleryPreviews([]);
        setHistoryMediaGallery([]);
        setImagePreview(dataUrl);
        setHistoryMediaPreview(dataUrl);
        setImageName(fileName);
        setUploadedMediaType("video");
        setImageSize({ width, height });
        setSelectedGalleryIndex(0);
        setUploadedFiles([uploadFile]);
        clearSelectedUpload();
    };

    const trimVideoClip = async (sourceUrl: string, startSeconds: number, endSeconds: number) => {
        const video = document.createElement("video");
        video.src = sourceUrl;
        video.muted = true;
        video.playsInline = true;
        video.preload = "auto";

        await new Promise<void>((resolve, reject) => {
            video.onloadedmetadata = () => resolve();
            video.onerror = () => reject(new Error("This video cannot be read for trimming."));
        });

        const supportedMimeType = [
            "video/webm;codecs=vp9",
            "video/webm;codecs=vp8",
            "video/webm",
        ].find((mimeType) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mimeType));

        if (typeof MediaRecorder === "undefined") {
            throw new Error("Video export is unavailable in this browser. Please try Chrome or Edge.");
        }

        const videoEl = video as HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream };
        const nativeStream = videoEl.captureStream?.() || videoEl.mozCaptureStream?.();
        let renderFrameId = 0;
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        const width = video.videoWidth || 1280;
        const height = video.videoHeight || 720;
        canvas.width = width;
        canvas.height = height;

        const captureFn = (canvas as any).captureStream as ((frameRate?: number) => MediaStream) | undefined;
        const canvasStream = !nativeStream && captureFn && context ? captureFn(30) : null;
        if (!nativeStream && !canvasStream) {
            throw new Error("Video export is unavailable in this browser. Please try Chrome or Edge.");
        }

        const stream = nativeStream || canvasStream as MediaStream;
        const chunks: BlobPart[] = [];
        const recorder = supportedMimeType ? new MediaRecorder(stream, { mimeType: supportedMimeType }) : new MediaRecorder(stream);
        recorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                chunks.push(event.data);
            }
        };

        let stopRequested = false;
        const stopRecording = () => {
            if (stopRequested) return;
            stopRequested = true;
            if (recorder.state !== "inactive") {
                recorder.stop();
            }
            if (renderFrameId) {
                cancelAnimationFrame(renderFrameId);
            }
            video.pause();
        };

        await new Promise<void>((resolve, reject) => {
            recorder.onerror = () => reject(new Error("Video trimming failed during export."));
            recorder.onstop = () => resolve();
            recorder.start();
            video.onseeked = () => {
                if (!nativeStream && context) {
                    const drawFrame = () => {
                        context.drawImage(video, 0, 0, width, height);
                        if (!video.paused && !video.ended) {
                            renderFrameId = requestAnimationFrame(drawFrame);
                        }
                    };
                    drawFrame();
                }

                void video.play().catch(() => {
                    stopRecording();
                    reject(new Error("Unable to preview the selected clip."));
                });
            };
            video.currentTime = startSeconds;

            const stopAt = Math.max(startSeconds, endSeconds);
            const interval = window.setInterval(() => {
                if (video.currentTime >= stopAt || video.ended) {
                    window.clearInterval(interval);
                    stopRecording();
                }
            }, 120);

            video.onended = () => {
                window.clearInterval(interval);
                stopRecording();
            };
        });

        const blob = new Blob(chunks, { type: supportedMimeType });
        if (!blob.size) {
            throw new Error("The trimmed video is empty. Please try another clip range.");
        }

        return {
            blob,
            width: video.videoWidth,
            height: video.videoHeight,
        };
    };

    const openVideoCropModal = (sourceUrl: string, fileName: string, duration: number, width: number, height: number) => {
        setPendingVideoCrop({
            sourceUrl,
            fileName,
            duration,
            width,
            height,
        });
        setTrimStartSeconds(0);
        setTrimEndSeconds(Math.min(duration, VIDEO_MAX_DURATION_SECONDS));
        setTrimError("");
        setIsTrimmingVideo(false);
        setIsDraggingTrimWindow(false);
    };

    const getMaxTrimStart = (duration: number) => Math.max(0, duration - VIDEO_MAX_DURATION_SECONDS);

    const setTrimWindowStart = (nextStart: number, duration: number) => {
        const start = clamp(nextStart, 0, getMaxTrimStart(duration));
        setTrimStartSeconds(start);
        setTrimEndSeconds(Math.min(duration, start + VIDEO_MAX_DURATION_SECONDS));
        setTrimError("");
    };

    const setTrimWindowFromPointer = (clientX: number) => {
        if (!pendingVideoCrop || !cropTimelineRef.current) return;

        const rect = cropTimelineRef.current.getBoundingClientRect();
        const pointerRatio = clamp((clientX - rect.left) / rect.width, 0, 1);
        const centeredStart = (pointerRatio * pendingVideoCrop.duration) - (VIDEO_MAX_DURATION_SECONDS / 2);
        setTrimWindowStart(centeredStart, pendingVideoCrop.duration);
    };

    const handleTrimTimelinePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        setIsDraggingTrimWindow(true);
        setTrimWindowFromPointer(event.clientX);
    };

    const handleTrimTimelinePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!isDraggingTrimWindow) return;
        setTrimWindowFromPointer(event.clientX);
    };

    const handleTrimTimelinePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
        setIsDraggingTrimWindow(false);
    };

    const confirmVideoCrop = async () => {
        if (!pendingVideoCrop) return;

        const clampedStart = clamp(trimStartSeconds, 0, Math.max(0, pendingVideoCrop.duration - 1));
        const clampedEnd = clamp(trimEndSeconds, clampedStart + 1, pendingVideoCrop.duration);
        if (clampedEnd - clampedStart > VIDEO_MAX_DURATION_SECONDS) {
            setTrimError("The selected clip must be 60 seconds or shorter.");
            return;
        }

        setIsTrimmingVideo(true);
        setTrimError("");

        try {
            const trimmed = await trimVideoClip(pendingVideoCrop.sourceUrl, clampedStart, clampedEnd);
            const trimmedName = pendingVideoCrop.fileName.replace(/\.[^.]+$/, "") || "trimmed-video";
            await applyVideoUpload(trimmed.blob, `${trimmedName}-trimmed.webm`, trimmed.width || pendingVideoCrop.width, trimmed.height || pendingVideoCrop.height);
            closeVideoCropModal();
        } catch (error) {
            setTrimError(error instanceof Error ? error.message : "Unable to trim this video.");
            setIsTrimmingVideo(false);
        }
    };

    const draftStorageKey = useMemo(() => `googer-ad-draft-${campaignType.toLowerCase().replace(/\s+/g, "-")}`, [campaignType]);

    const createNextAdId = () => {
        let nextAdId = "";

        do {
            const timestampPart = String(Date.now()).slice(-7);
            const randomPart = String(Math.floor(100 + Math.random() * 900));
            nextAdId = `${timestampPart}${randomPart}`.slice(0, 10);
        } while (window.localStorage.getItem(`googer-ad-review-${nextAdId}`));

        window.localStorage.setItem(AD_ID_COUNTER_KEY, nextAdId);
        return nextAdId;
    };

    const copyAdId = async (adId: string) => {
        try {
            await navigator.clipboard.writeText(adId);
        } catch {
            const input = document.createElement("input");
            input.value = adId;
            document.body.appendChild(input);
            input.select();
            document.execCommand("copy");
            document.body.removeChild(input);
        }
        setAdIdCopied(true);
        window.setTimeout(() => setAdIdCopied(false), 1600);
    };

    const closeInsufficientBalanceModal = () => {
        setIsInsufficientBalanceDismissed(true);
        setShowInsufficientBalanceModal(false);
    };

    const openLocationModal = () => {
        setDraftLocationCodes(selectedLocationCodes);
        setLocationSearch("");
        setIsLocationModalOpen(true);
    };

    const closeLocationModal = () => {
        setDraftLocationCodes(selectedLocationCodes);
        setLocationSearch("");
        setIsLocationModalOpen(false);
    };

    const saveLocationSelection = () => {
        setSelectedLocationCodes(draftLocationCodes);
        setLocationSearch("");
        setIsLocationModalOpen(false);
    };

    const selectAllAvailableLocations = () => {
        setDraftLocationCodes((current) => {
            const allCountryCodes = countries.map((country) => country.code);
            const allCountriesSelected = allCountryCodes.length > 0 && allCountryCodes.every((code) => current.includes(code));
            return allCountriesSelected ? [] : allCountryCodes;
        });
    };

    const selectLocationCode = (code: string) => {
        setDraftLocationCodes((current) => {
            if (countries.length > 0 && countries.every((country) => current.includes(country.code)) && current.includes(code)) {
                return current;
            }

            if (current.includes(code)) {
                return current.filter((currentCode) => currentCode !== code);
            }

            return current.length > 0 ? [...current, code] : [code];
        });
    };

    const toggleInterestTopic = (topic: string) => {
        setDraftInterestTopics((current) => {
            if (current.includes(topic)) {
                return current.filter((currentTopic) => currentTopic !== topic);
            }

            if (current.length >= INTEREST_TOPIC_LIMIT) {
                showPopupError(`You can choose up to ${INTEREST_TOPIC_LIMIT} interest topics.`);
                return current;
            }

            return [...current, topic];
        });
    };

    const saveInterestTopics = () => {
        setSelectedInterestTopics(draftInterestTopics);
        setIsInterestTopicsOpen(false);
    };

    const togglePlacement = (placementLabel: string) => {
        if (placementLabel === "All") {
            setSelectedPlacements((current) => {
                const allSelected = AVAILABLE_PLACEMENT_LABELS.every((placement) => current.includes(placement));
                return allSelected ? [] : ["All", ...AVAILABLE_PLACEMENT_LABELS];
            });
            return;
        }

        setSelectedPlacements((current) => {
            const selectedWithoutAll = current.filter((placement) => placement !== "All");
            const nextSelection = selectedWithoutAll.includes(placementLabel)
                ? selectedWithoutAll.filter((placement) => placement !== placementLabel)
                : [...selectedWithoutAll, placementLabel];
            const allSelected = AVAILABLE_PLACEMENT_LABELS.every((placement) => nextSelection.includes(placement));

            return allSelected ? ["All", ...AVAILABLE_PLACEMENT_LABELS] : nextSelection;
        });
    };

    const validateFinalForm = () => {
        if (isProductPromote) {
            if (!linkedProduct) {
                showPopupError("Please apply a product share link first.");
                return false;
            }
        } else if (isProfilePromote) {
            if (!hasLink) {
                showPopupError("Please apply your profile link first.");
                return false;
            }
        } else if (!hasLink && !hasUploadedImage) {
            showPopupError("Please add a link or upload an image.");
            return false;
        }

        // CTA and description are not required for Product Promote / Profile Promote — they are hidden on those pages.
        if (!isProductPromote && !isProfilePromote) {
            if (!ctaTopic) {
                showPopupError("Please select a call to action.");
                return false;
            }

            if (ctaNeedsDetailField(ctaTopic) && !ctaValue.trim()) {
                showPopupError(`Please enter ${CTA_FIELD_LABELS[ctaTopic].toLowerCase()}.`);
                return false;
            }
        }

        if (!tiersLoaded && !isFreeProfilePromotePromo) {
            showPopupError("No ad packages are currently available. Please try again later.");
            return false;
        }

        if (budget === null && !isFreeProfilePromotePromo) {
            showPopupError(isProfileAd ? "Please select a budget package." : "Please set a budget.");
            return false;
        }

        if (isBudgetInGap && !isFreeProfilePromotePromo) {
            showPopupError("This budget amount is not available. Please adjust to a valid range.");
            return false;
        }

        if (!activeTier && !isFreeProfilePromotePromo) {
            showPopupError("Please select a valid budget.");
            return false;
        }

        if (!durationDays || durationDays < 1) {
            showPopupError("Please select a duration.");
            return false;
        }

        if (selectedLocationCodes.length === 0) {
            showPopupError("Please select at least one location.");
            return false;
        }

        if (!genderTarget) {
            showPopupError("Please select gender.");
            return false;
        }

        if (ageMin < 18 || ageMax > 65 || ageMin > ageMax) {
            showPopupError("Please select a valid age range.");
            return false;
        }

        if (showProfileNonRefundableNotice && !acceptedProfileNonRefundable) {
            showPopupError("Please accept the non-refundable profile promotion package condition.");
            return false;
        }

        return true;
    };

    const handlePublish = async () => {
        if (isPublishing) return;
        if (!validateFinalForm()) return;
        if (hasInsufficientBalance && !isFreeProfilePromotePromo) {
            setIsInsufficientBalanceDismissed(false);
            setShowInsufficientBalanceModal(true);
            return;
        }

        const ownerKey = getUserIdentityKey(userProfile);
        const ownerId = userProfile?.id ?? userProfile?._id ?? userProfile?.user_id;
        const ownerUsername = typeof userProfile?.username === "string" ? userProfile.username : "";
        const existingReview = editingAdId ? await adsService.getAdById(editingAdId).catch(() => null) : null;
        // Fall back to editingOriginalBudget from draft if the API fetch failed, so we never charge the full budget on an edit
        const existingBudget = isPromoteAgain ? 0 : Number(existingReview?.budget ?? editingOriginalBudget ?? 0);
        const nextAdId = existingReview?.adId && typeof existingReview.adId === "string" ? existingReview.adId : createNextAdId();
        const selectedBudget = budget ?? 0;
        const publishBudget = effectiveBudget ?? selectedBudget;
        const budgetDifference = selectedBudget - existingBudget;

        const reviewRecord: PublishedAdReview = {
            adId: nextAdId,
            createdAt: typeof existingReview?.createdAt === "string" ? existingReview.createdAt : new Date().toISOString(),
            campaignType,
            ownerKey: ownerKey || undefined,
            ownerId: ownerId !== undefined && ownerId !== null ? String(ownerId) : undefined,
            ownerUsername: ownerUsername || undefined,
            budget: publishBudget,
            durationDays: effectiveDurationDays,
            title: isProductPromote && linkedProduct
                ? linkedProduct.title
                : isProfilePromote
                    ? profileDisplayName
                    : previewTitle,
            description: description.trim(),
            mediaPreview: isProductPromote && linkedProduct
                ? getProductImageSrc(linkedProduct)
                : isProfilePromote
                    ? (profileImage || "")
                    : (persistedImageGallery[0] || historyMediaPreview || selectedPreviewImage),
            mediaGallery: persistedImageGallery,
            mediaType: isProductPromote
                ? "link"
                : isProfilePromote
                    ? "profile"
                    : hasUploadedVideo ? "video" : selectedPreviewImage ? "image" : hasLink ? "link" : "",
            genderTarget,
            ageMin,
            ageMax,
            reach: 0,
            impressions: isPromoteAgain ? Number(existingReview?.impressions || existingReview?.views_count || existingReview?.viewCount || 0) : 0,
            clicks: isPromoteAgain ? Number(existingReview?.clicks || 0) : 0,
            spend: 0,
            remainingBudget: selectedBudget,
            tierId: activeTier?.id ?? undefined,
            estimatedReachMin: estimatedReachMin ?? undefined,
            estimatedReachMax: estimatedReachMax ?? undefined,
            maxReachCap: maxReachCap ?? undefined,
            promoCode: hasPromoCodeAdded && promoCode ? promoCode : null,
            promoDiscount: hasPromoCodeAdded && promoDiscount?.discount_type === "reach" ? promoDiscount.discount_value : null,
            status: "Under Review",
            campaignPath:
                campaignType === "Product Promote"
                    ? "/dashboard/ad-campaign/product-promote"
                    : campaignType === "Profile Promote"
                        ? "/dashboard/ad-campaign/profile-promote"
                        : "/dashboard/ad-campaign/photo-video",
            editDraft: {
                editingAdId: nextAdId,
                promoteAgain: isPromoteAgain,
                activeLink,
                linkInput,
                description,
                ctaTopic,
                ctaValue,
                selectedCountryCode,
                selectedLocationCodes,
                genderTarget,
                ageMin,
                ageMax,
                selectedInterestTopics,
                selectedPlacements,
                budget: selectedBudget,
                durationDays,
                promoCode,
                hasPromoCodeAdded,
                mediaPreview: isProductPromote && linkedProduct
                    ? getProductImageSrc(linkedProduct)
                    : isProfilePromote
                        ? (profileImage || "")
                        : (persistedImageGallery[0] || historyMediaPreview || selectedPreviewImage),
                mediaGallery: persistedImageGallery,
                mediaType: isProductPromote
                    ? "link"
                    : isProfilePromote
                        ? "profile"
                        : hasUploadedVideo ? "video" : selectedPreviewImage ? "image" : hasLink ? "link" : "",
                imageName,
                ...(isProfilePromote ? {
                profileUsername: promotedProfile?.username || profileUsername,
                profileLink: activeLink || profileLink,
                featuredProductIds: profilePromoteProducts.map((p) => p.id),
                promotedProfileUserId: promotedProfile?.id ?? promotedProfile?.user_id ?? null,
            } : {}),
                ...(isProductPromote && linkedProduct ? {
                    linkedProductId: linkedProduct.id,
                } : {}),
            },
        };

        const formData = new FormData();
        formData.append("data", JSON.stringify(reviewRecord));
        if (uploadedFiles.length > 0) {
            uploadedFiles.forEach((file) => {
                formData.append("images", file);
            });
        }

        setIsPublishing(true);
        setPopupError("");
        try {
            const promotionLabel = isProfilePromote
                ? "Profile Promote"
                : isProductPromote
                    ? "Product Promote"
                    : hasUploadedVideo
                        ? "Video Promote"
                        : "Photo Promote";
            let paymentResult: any = null;

            // Payment amount after promo discount
            const discountedBudget = (() => {
                if (!hasPromoCodeAdded || !promoDiscount || (existingReview && !isPromoteAgain)) return publishBudget;
                if (isProfilePromote) return 0; // Profile Promote + any promo = always free
                if (promoDiscount.discount_type === "rupee") {
                    return Math.max(0, publishBudget - promoDiscount.discount_value);
                }
                if (promoDiscount.discount_type === "reach") {
                    return 0;
                }
                return publishBudget; // days promos: full budget charged, bonus is free
            })();

            // isEditMode: editing an existing Under Review ad (not promote-again)
            // Works even if the API fetch for existingReview failed, by falling back to editingOriginalBudget
            const isEditMode = !isPromoteAgain && (!!existingReview || (!!editingAdId && editingOriginalBudget !== null));
            const payAmount = isEditMode ? budgetDifference : discountedBudget;
            if ((isEditMode && budgetDifference > 0) || (!isEditMode && discountedBudget > 0)) {
                if (isProfilePromote) {
                    paymentResult = await walletService.payProfilePromote(payAmount, {
                        orderId: reviewRecord.adId,
                        note: `Ad Hold Summary - Profile Promotion - Ad ID: ${reviewRecord.adId} - Status: Completed - Hold Amount: R ${Number(payAmount || 0).toFixed(2)} - Deducted Amount: R ${Number(payAmount || 0).toFixed(2)}`,
                    });
                } else {
                    paymentResult = await walletService.payOrder(payAmount, {
                        orderId: reviewRecord.adId,
                        note: `${isPromoteAgain ? "Ad Promote" : existingReview ? "Ad Promote Update" : "Ad Promote"} - ${reviewRecord.adId} - ${promotionLabel}`,
                    });
                }
            }

            if (existingReview && isEditMode && budgetDifference < 0 && ownerKey) {
                addAdWalletRefund(reviewRecord.adId, ownerKey, Math.abs(budgetDifference), `Ad Budget Refund - ${reviewRecord.adId}`);
            }

            // Record a $0 wallet entry for free promo ads so they appear in transaction history
            if (!isEditMode && discountedBudget === 0 && hasPromoCodeAdded && promoCode) {
                try {
                    await walletService.recordPromoAd(reviewRecord.adId, promotionLabel);
                } catch {
                    // non-critical — don't block publish
                }
            }

            const currentBalance = Number(paymentResult?.currentBalance);
            if (Number.isFinite(currentBalance)) {
                setWalletBalance(getWalletBalanceWithAdAdjustments(currentBalance, ownerKey));
            } else if (isEditMode && budgetDifference < 0) {
                setWalletBalance((current) => current + Math.abs(budgetDifference));
            } else {
                setWalletBalance((current) => Math.max(0, current - (isEditMode ? Math.max(0, budgetDifference) : discountedBudget)));
            }
            window.dispatchEvent(new Event("googer-wallet-updated"));

            const savedAdPayload = {
                ...reviewRecord,
                walletTransferId: paymentResult?.transferId || existingReview?.walletTransferId,
                promoteAgain: isPromoteAgain,
                spend: isPromoteAgain ? 0 : (typeof existingReview?.spend === "number" ? existingReview.spend : reviewRecord.spend),
                remainingBudget: isPromoteAgain ? (budget ?? 0) : ((budget ?? 0) - (typeof existingReview?.spend === "number" ? existingReview.spend : 0)),
            };
            const uploadAdPayload = uploadedFiles.length > 0
                ? {
                    ...savedAdPayload,
                    mediaPreview: "",
                    mediaGallery: [],
                    editDraft: {
                        ...savedAdPayload.editDraft,
                        mediaPreview: "",
                        mediaGallery: [],
                    },
                }
                : savedAdPayload;

            // Use FormData for create/update to ensure media is uploaded correctly
            const payload = uploadedFiles.length > 0 ? formData : savedAdPayload;
            if (uploadedFiles.length > 0) {
                // Merge the final calculated fields into FormData
                formData.set("data", JSON.stringify(uploadAdPayload));
            }

            const savedAd = existingReview
                ? await adsService.updateAd(reviewRecord.adId, payload as any)
                : await adsService.createAd(payload as any);

            // Redeem promo AFTER ad is successfully created (increments uses_count)
            if (hasPromoCodeAdded && promoCode && (!existingReview || isPromoteAgain)) {
                try {
                    await adsService.redeemPromoCode(promoCode, getAdTypeForCampaign(), reviewRecord.adId);
                } catch {
                    // Non-fatal — ad is already created and paid for; just skip redeem silently
                }
            }

            window.dispatchEvent(new Event("googer-ad-history-updated"));
            window.localStorage.removeItem(draftStorageKey);
            setEditingAdId("");
            setIsPromoteAgain(false);
            setPublishedAd(savedAd || reviewRecord);
            setShowPublishedPopup(true);
        } catch (error: any) {
            const errMsg = error?.message || "";
            const isPromoErr = errMsg.includes("promo") || errMsg.includes("Promo") || errMsg.includes("usage limit") || errMsg.includes("expired") || errMsg.includes("ad type");
            if (!isPromoErr) {
                showPopupError(errMsg || "Could not publish this ad. Please check your wallet balance.");
            }
        } finally {
            setIsPublishing(false);
        }
    };

    const saveDraftAndExit = () => {
        setShowCancelConfirm(false);
        router.back();
    };

    const discardChangesAndExit = () => {
        window.localStorage.removeItem(draftStorageKey);
        setShowCancelConfirm(false);
        router.back();
    };

    const getAdTypeForCampaign = (): string => {
        if (campaignType === "Product Promote") return "product_promote_ad";
        if (campaignType === "Profile Promote") return "profile_promote_ad";
        return "photo_video_ad";
    };

    const addPromoCode = async () => {
        const sanitizedCode = sanitizePromoCode(promoCode);
        if (!sanitizedCode) {
            if (hasPromoCodeAdded) {
                setPromoCode("");
                setHasPromoCodeAdded(false);
                setIsPromoEditing(true);
                setPromoDiscount(null);
                setPromoError("");
                return;
            }
            setPromoError("Please enter a promo code.");
            return;
        }
        setPromoError("");
        setIsValidatingPromo(true);
        try {
            const result = await adsService.validatePromoCode(sanitizedCode, getAdTypeForCampaign());
            setPromoCode(sanitizedCode);
            setHasPromoCodeAdded(true);
            setIsPromoEditing(false);
            setIsBudgetEditing(false);
            setPromoDiscount({ discount_type: result.discount_type, discount_value: result.discount_value, reach_cap: result.reach_cap ?? null, min_reach_bonus: result.min_reach_bonus, max_reach_bonus: result.max_reach_bonus, promo_max_days: result.promo_max_days });
        } catch (err: any) {
            const msg = err?.message || "Invalid promo code.";
            if (msg.includes("doesn't exist") || msg.includes("inactive")) {
                setPromoError("This promo code doesn't exist or is inactive");
            } else if (msg.includes("not valid for this ad type")) {
                setPromoError("This code is not valid for this ad type");
            } else if (msg.includes("expired")) {
                setPromoError("This promo code has expired");
            } else if (msg.includes("usage limit")) {
                setPromoError("This promo code has reached its usage limit");
            } else {
                setPromoError(msg);
            }
        } finally {
            setIsValidatingPromo(false);
        }
    };

    const handleAddLink = async () => {
        if (hasUploadedImage) {
            showPopupError("You have already uploaded an image. Please remove it before adding a link.");
            return;
        }
        if (!linkInput.trim()) return;
        const trimmedLink = linkInput.trim();

        if (isProductPromote) {
            const productTarget = getProductShareTarget(trimmedLink);
            if (!productTarget) {
                showPopupError("Please paste a valid product share link.");
                return;
            }

            const fetchByMode = async (mode: "id" | "code", value: string) => {
                if (mode === "id") {
                    return marketService.getItemById(Number(value));
                }
                return marketService.getItemByCode(value);
            };

            try {
                let product: any = null;
                try {
                    product = await fetchByMode(productTarget.mode, productTarget.value);
                } catch {
                    product = null;
                }

                // Fallback: if first lookup failed, try the alternate mode
                if (!product?.id) {
                    const altMode = productTarget.mode === "id" ? "code" : "id";
                    if (altMode === "id" ? /^\d+$/.test(productTarget.value) : true) {
                        try {
                            product = await fetchByMode(altMode, productTarget.value);
                        } catch {
                            product = null;
                        }
                    }
                }

                if (!product?.id) {
                    showPopupError("That product link could not be found.");
                    return;
                }

                setLinkedProduct(product);
                setActiveLink(normalizeUrl(trimmedLink));
                return;
            } catch {
                showPopupError("Please paste a valid product share link.");
                return;
            }
        }

        if (isProfilePromote) {
            const username = getProfileUsernameFromLink(trimmedLink);
            if (!username) {
                showPopupError("Please paste a valid public profile link.");
                return;
            }

            try {
                const profile = /^\d+$/.test(username)
                    ? await authService.getUserProfile(username).catch(() => authService.getUserByUsername(username))
                    : await authService.getUserByUsername(username);
                if (!profile?.username && !profile?.id && !profile?.user_id) {
                    showPopupError("That profile link could not be found.");
                    return;
                }

                setProfilePromoteUser(profile);
                setProfilePromoteProducts([]);
                setProfilePromoteSlideIndex(0);
                setLinkInput(getProfileShareUrl(profile));
                setActiveLink(getProfileShareUrl(profile));
                return;
            } catch {
                showPopupError("That profile link could not be found.");
                return;
            }
        }

        // Photo/Video (and other non-product) promote: reject product share links
        // that arrive as a real URL with a /product, /share or /shop path segment.
        try {
            const parsedLink = new URL(normalizeUrl(trimmedLink));
            const segments = parsedLink.pathname.split("/").filter(Boolean);
            const hasProductSegment = segments.some((segment, index) =>
                ["product", "share", "shop"].includes(segment.toLowerCase()) && segments[index + 1]
            );
            if (hasProductSegment) {
                showPopupError("Please add a valid link. Product share links can only be used on the Product Promote page.");
                return;
            }
        } catch {
            // If it doesn't parse as a URL, fall through and let the existing flow handle it.
        }

        setActiveLink(trimmedLink);
    };

    const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        const file = files[0];
        if (!file) return;
        if (hasLink) {
            handleRemoveLink();
        }

        const isVideoUpload = files.some((currentFile) => isVideoUploadFile(currentFile));
        const hasMixedTypes = isVideoUpload && files.some((currentFile) => currentFile.type.startsWith("image/"));
        if (hasMixedTypes) {
            showPopupError("Upload either one video or one or more images.");
            clearSelectedUpload();
            return;
        }

        if (isVideoUpload && files.length > 1) {
            showPopupError("Please upload a single video, or switch to multiple images.");
            clearSelectedUpload();
            return;
        }

        if (!isVideoUpload && files.some((currentFile) => !currentFile.type.startsWith("image/"))) {
            showPopupError("Only images can be uploaded together in a gallery.");
            clearSelectedUpload();
            return;
        }

        if (imagePreview && uploadedMediaType === "video") {
            revokeVideoPreviewIfNeeded(imagePreview);
        }

        setImageSize(null);
        setSelectedGalleryIndex(0);

        if (!isVideoUpload) {
            Promise.all(
                files.map((currentFile) => new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Image could not be read."));
                    reader.onerror = () => reject(new Error("Image could not be read."));
                    reader.readAsDataURL(currentFile);
                }))
            )
                .then((dataUrls) => {
                    const [primaryImage] = dataUrls;
                    setImagePreview(primaryImage || "");
                    setHistoryMediaPreview(primaryImage || "");
                    setImageGalleryPreviews(dataUrls);
                    setHistoryMediaGallery(dataUrls);
                    setImageName(files.length === 1 ? files[0].name : `${files.length} images selected`);
                    setUploadedMediaType("image");
                    setUploadedFiles(files);

                    if (primaryImage) {
                        const probeImage = new window.Image();
                        probeImage.onload = () => {
                            setImageSize({
                                width: probeImage.naturalWidth,
                                height: probeImage.naturalHeight,
                            });
                        };
                        probeImage.src = primaryImage;
                    }
                })
                .catch(() => {
                    showPopupError("One or more images could not be read. Please try again.");
                    clearSelectedUpload();
                });
            return;
        }

        const objectUrl = URL.createObjectURL(file);
        setImageGalleryPreviews([]);
        setHistoryMediaGallery([]);

        if (isVideoUpload) {
            const probeVideo = document.createElement("video");
            probeVideo.onloadedmetadata = () => {
                const duration = Number.isFinite(probeVideo.duration) ? probeVideo.duration : 0;
                if (duration > VIDEO_MAX_DURATION_SECONDS) {
                    openVideoCropModal(objectUrl, file.name, duration, probeVideo.videoWidth, probeVideo.videoHeight);
                    return;
                }

                void applyVideoUpload(file, file.name, probeVideo.videoWidth, probeVideo.videoHeight)
                    .catch(() => {
                        URL.revokeObjectURL(objectUrl);
                        showPopupError("This video could not be prepared for upload. Please try again.");
                        clearSelectedUpload();
                    });
                URL.revokeObjectURL(objectUrl);
            };
            probeVideo.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                void applyVideoUpload(file, file.name, 0, 0)
                    .catch(() => {
                        showPopupError("This video could not be prepared for upload. Please try again.");
                        clearSelectedUpload();
                    });
            };
            probeVideo.src = objectUrl;
        }
    };

    const handleUploadClick = () => {
        if (hasLink) {
            handleRemoveLink();
        }

        fileInputRef.current?.click();
    };

    const handleRemoveLink = () => {
        setActiveLink("");
        setLinkInput("");
        setLinkPreviewMeta(null);
        setLinkedProduct(null);
        setProfilePromoteUser(null);
        setProfilePromoteProducts([]);
        setProfilePromoteSlideIndex(0);
    };

    const handleRemoveImage = () => {
        if (imagePreview && uploadedMediaType === "video" && isBlobUrl(imagePreview)) {
            URL.revokeObjectURL(imagePreview);
        }
        setImagePreview("");
        setHistoryMediaPreview("");
        setImageGalleryPreviews([]);
        setHistoryMediaGallery([]);
        setImageName("");
        setUploadedMediaType("");
        setSelectedGalleryIndex(0);
        setImageSize(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    useEffect(() => {
        return () => {
            if (imagePreview && isBlobUrl(imagePreview)) {
                URL.revokeObjectURL(imagePreview);
            }
            if (pendingVideoCrop?.sourceUrl) {
                URL.revokeObjectURL(pendingVideoCrop.sourceUrl);
            }
        };
    }, [imagePreview, pendingVideoCrop]);

    useEffect(() => {
        let active = true;
        const adType = campaignType === "Product Promote" ? "product_promote_ad"
            : campaignType === "Profile Promote" ? "profile_promote_ad"
            : "photo_video_ad";
        adsService.getReachTiersPublic(adType)
            .then((tiers) => {
                if (!active) return;
                setReachTiers(tiers);
                if (tiers.length > 0) {
                    if (adType === "profile_promote_ad") {
                        // Profile: no auto-select, user must pick a chip
                        setBudget(null);
                    } else {
                        // Photo/video & product: auto-init to the global minimum so Order Summary is populated
                        const globalMin = Math.min(...tiers.map((t) => Number(t.budget_from)));
                        setBudget(globalMin);
                        setDurationDays(tiers.find((t) => Number(t.budget_from) === globalMin)?.min_days ?? 1);
                    }
                } else {
                    setBudget(null);
                }
            })
            .catch(() => { /* tiers unavailable — UI will show "no packages" */ });
        return () => { active = false; };
    }, [campaignType]);

    useEffect(() => {
        try {
            Object.keys(window.localStorage)
                .filter((key) => key.startsWith("googer-ad-review-"))
                .forEach((key) => {
                    try {
                        const parsedReview = JSON.parse(window.localStorage.getItem(key) || "{}");
                        if (typeof parsedReview.adId !== "string" || !/^\d{10,12}$/.test(parsedReview.adId)) {
                            window.localStorage.removeItem(key);
                        }
                    } catch {
                        window.localStorage.removeItem(key);
                    }
                });

            const savedDraft = window.localStorage.getItem(draftStorageKey);
            if (!savedDraft) {
                hasLoadedDraftRef.current = true;
                return;
            }

            const parsed = JSON.parse(savedDraft);
            if (parsed?.version !== AD_DRAFT_VERSION) {
                hasLoadedDraftRef.current = true;
                return;
            }

            if (typeof parsed.editingAdId === "string") {
                setEditingAdId(parsed.editingAdId);
                if (typeof parsed.editingOriginalBudget === "number") {
                    setEditingOriginalBudget(parsed.editingOriginalBudget);
                }
            }
            setIsPromoteAgain(parsed.promoteAgain === true);
            // For Product Promote, never restore the previously promoted link/linkInput.
            // The page should always start empty unless the user arrives via query params.
            if (!isProductPromote) {
                if (typeof parsed.activeLink === "string") setActiveLink(parsed.activeLink);
                if (typeof parsed.linkInput === "string") setLinkInput(parsed.linkInput);
            }
            if (typeof parsed.description === "string") setDescription(parsed.description.slice(0, 50));
            if (CTA_OPTIONS.includes(parsed.ctaTopic)) setCtaTopic(parsed.ctaTopic);
            if (typeof parsed.ctaValue === "string") setCtaValue(parsed.ctaValue);
            if (typeof parsed.selectedCountryCode === "string") setSelectedCountryCode(parsed.selectedCountryCode);
            if (Array.isArray(parsed.selectedLocationCodes)) {
                setSelectedLocationCodes(parsed.selectedLocationCodes.filter((code: unknown) => typeof code === "string"));
            } else if (typeof parsed.selectedLocationCode === "string") {
                setSelectedLocationCodes(parsed.selectedLocationCode ? [parsed.selectedLocationCode] : []);
            }
            if (GENDER_OPTIONS.includes(parsed.genderTarget)) setGenderTarget(parsed.genderTarget);
            if (typeof parsed.ageMin === "number") setAgeMin(Math.min(65, Math.max(18, parsed.ageMin)));
            if (typeof parsed.ageMax === "number") setAgeMax(Math.min(65, Math.max(18, parsed.ageMax)));
            else if (typeof parsed.ageTarget === "number") setAgeMax(Math.min(65, Math.max(18, parsed.ageTarget)));
            if (Array.isArray(parsed.selectedInterestTopics)) {
                const savedTopics = parsed.selectedInterestTopics.filter((topic: unknown) => typeof topic === "string" && INTEREST_TOPIC_OPTIONS.includes(topic));
                setSelectedInterestTopics(savedTopics);
                setDraftInterestTopics(savedTopics);
            }
            if (Array.isArray(parsed.selectedPlacements)) {
                const savedPlacements: string[] = parsed.selectedPlacements
                    .map(normalizePlacementLabel)
                    .filter((placement: string | null): placement is string => Boolean(placement));
                const allSavedPlacementsSelected = AVAILABLE_PLACEMENT_LABELS.every((placement) => savedPlacements.includes(placement));
                setSelectedPlacements(allSavedPlacementsSelected ? ["All", ...AVAILABLE_PLACEMENT_LABELS] : savedPlacements.filter((placement) => placement !== "All"));
            } else {
                const savedPlacement = normalizePlacementLabel(parsed.selectedPlacement);
                if (savedPlacement) {
                    setSelectedPlacements(savedPlacement === "All" ? ["All", ...AVAILABLE_PLACEMENT_LABELS] : [savedPlacement]);
                }
            }
            if (typeof parsed.budget === "number") {
                // Only restore if it exactly matches a valid tier option
                setBudget((prev) => {
                    const validOption = reachTiers.find((t) => Number(t.budget_from) === parsed.budget);
                    return validOption ? parsed.budget : prev;
                });
            }
            if (typeof parsed.durationDays === "number") {
                const durationLimit = parsed.hasPromoCodeAdded ? PROMO_DURATION_MAX : 30;
                setDurationDays(Math.min(durationLimit, Math.max(1, parsed.durationDays)));
            }
            if (typeof parsed.promoCode === "string") setPromoCode(sanitizePromoCode(parsed.promoCode));
            if (typeof parsed.hasPromoCodeAdded === "boolean") {
                const hasValidPromoDiscount = parsed.promoDiscount
                    && typeof parsed.promoDiscount === "object"
                    && typeof parsed.promoDiscount.discount_type === "string";
                // Only restore as applied if we have the full discount data — otherwise reset so user re-validates
                const restoredAsApplied = parsed.hasPromoCodeAdded && hasValidPromoDiscount;
                setHasPromoCodeAdded(restoredAsApplied);
                setIsPromoEditing(!restoredAsApplied);
                if (hasValidPromoDiscount) {
                    setPromoDiscount(parsed.promoDiscount);
                }
            }
            const savedMediaGallery = Array.isArray(parsed.mediaGallery)
                ? parsed.mediaGallery.filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0)
                : [];
            if (parsed.mediaType === "image" && savedMediaGallery.length > 0) {
                setUploadedMediaType("image");
                setImageGalleryPreviews(savedMediaGallery);
                setHistoryMediaGallery(savedMediaGallery);
                setImagePreview(savedMediaGallery[0]);
                setHistoryMediaPreview(savedMediaGallery[0]);
                setSelectedGalleryIndex(0);
                setImageName(typeof parsed.imageName === "string" ? parsed.imageName : (savedMediaGallery.length === 1 ? "1 image selected" : `${savedMediaGallery.length} images selected`));
            } else if (parsed.mediaType === "video" && typeof parsed.mediaPreview === "string") {
                setUploadedMediaType("video");
                setImagePreview(parsed.mediaPreview);
                setHistoryMediaPreview(parsed.mediaPreview);
                setImageName(typeof parsed.imageName === "string" ? parsed.imageName : "Uploaded video");
            }
        } catch {
            // Ignore malformed drafts and let the current form continue normally.
        } finally {
            hasLoadedDraftRef.current = true;
        }
    }, [draftStorageKey]);

    useEffect(() => {
        if (!hasLoadedDraftRef.current) return;
        if (publishedAd) return;

        const timeoutId = window.setTimeout(() => {
            window.localStorage.setItem(draftStorageKey, JSON.stringify({
                version: AD_DRAFT_VERSION,
                editingAdId,
                promoteAgain: isPromoteAgain,
                activeLink,
                linkInput,
                description,
                ctaTopic,
                ctaValue,
                selectedCountryCode,
                selectedLocationCodes,
                genderTarget,
                ageMin,
                ageMax,
                selectedInterestTopics,
                selectedPlacements,
                budget,
                durationDays,
                promoCode,
                hasPromoCodeAdded,
                promoDiscount,
                mediaPreview: persistedImageGallery[0] || historyMediaPreview || "",
                mediaGallery: persistedImageGallery,
                mediaType: uploadedMediaType,
                imageName,
            }));
        }, 250);

        return () => window.clearTimeout(timeoutId);
    }, [activeLink, ageMax, ageMin, budget, ctaTopic, ctaValue, description, draftStorageKey, durationDays, editingAdId, genderTarget, hasPromoCodeAdded, historyMediaPreview, imageName, isPromoteAgain, persistedImageGallery, linkInput, promoCode, publishedAd, selectedCountryCode, selectedInterestTopics, selectedLocationCodes, selectedPlacements, uploadedMediaType]);

    useEffect(() => {
        const justCrossedIntoInsufficientBalance = hasInsufficientBalance && !wasInsufficientBalanceRef.current;

        if (justCrossedIntoInsufficientBalance) {
            setIsInsufficientBalanceDismissed(false);
            setShowInsufficientBalanceModal(true);
        }

        if (!hasInsufficientBalance) {
            setIsInsufficientBalanceDismissed(false);
            setShowInsufficientBalanceModal(false);
        }

        if (hasInsufficientBalance && isInsufficientBalanceDismissed) {
            setShowInsufficientBalanceModal(false);
        }

        wasInsufficientBalanceRef.current = hasInsufficientBalance;
    }, [hasInsufficientBalance, isInsufficientBalanceDismissed]);

    useEffect(() => {
        let isCancelled = false;

        authService.getProfile()
            .then((profile) => {
                if (isCancelled) return;
                setUserProfile(profile || null);
                setWalletBalance(getWalletBalanceWithAdAdjustments(Number(profile?.wallet_balance || 0), getUserIdentityKey(profile)));
                setWalletBalanceLoaded(true);
            })
            .catch(() => {
                if (isCancelled) return;
                setUserProfile(null);
                setWalletBalance(0);
                setWalletBalanceLoaded(true);
            });

        return () => {
            isCancelled = true;
        };
    }, []);

    useEffect(() => {
        let isCancelled = false;

        fetch("https://restcountries.com/v3.1/all?fields=name,flags,idd,cca2")
            .then((response) => (response.ok ? response.json() : []))
            .then((data) => {
                if (isCancelled || !Array.isArray(data)) return;

                const countryOptions = data
                    .map((country: any) => {
                        const root = country?.idd?.root || "";
                        const suffix = country?.idd?.suffixes?.[0] || "";
                        const dialCode = `${root}${suffix}`;

                        if (!country?.cca2 || !country?.name?.common || !dialCode) return null;

                        return {
                            code: country.cca2,
                            name: country.name.common,
                            flag: country.flags?.svg || country.flags?.png || "",
                            flagEmoji: country.flag || getFlagEmoji(country.cca2),
                            dialCode,
                        };
                    })
                    .filter((country): country is CountryOption => Boolean(country))
                    .sort((a: CountryOption, b: CountryOption) => a.name.localeCompare(b.name));

                setCountries(countryOptions);
            })
            .catch(() => {
                if (isCancelled) return;
                setCountries([
                    { code: "US", name: "United States", flag: "https://flagcdn.com/us.svg", flagEmoji: "🇺🇸", dialCode: "+1" },
                    { code: "LK", name: "Sri Lanka", flag: "https://flagcdn.com/lk.svg", flagEmoji: "🇱🇰", dialCode: "+94" },
                    { code: "GB", name: "United Kingdom", flag: "https://flagcdn.com/gb.svg", flagEmoji: "🇬🇧", dialCode: "+44" },
                    { code: "IN", name: "India", flag: "https://flagcdn.com/in.svg", flagEmoji: "🇮🇳", dialCode: "+91" },
                ]);
            });

        return () => {
            isCancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!hasLink) {
            setLinkPreviewMeta(null);
            return;
        }

        const normalizedLink = normalizeUrl(activeLink);
        const platform = getSocialPlatform(activeLink);
        const embedUrl = getSocialEmbedUrl(activeLink) || "";
        const videoId = getYouTubeVideoId(activeLink);
        if (!videoId) {
            const thumbnail = getLinkPreviewThumbnail(activeLink);
            setLinkPreviewMeta({
                title: getDefaultLinkTitle(activeLink),
                thumbnail,
                isYouTube: false,
                platform,
                embedUrl,
                isPlayable: Boolean(embedUrl || linkPreviewType === "video"),
            });

            let isCancelled = false;
            const oembedUrl = platform === "TikTok"
                ? `https://www.tiktok.com/oembed?url=${encodeURIComponent(normalizedLink)}`
                : `https://noembed.com/embed?url=${encodeURIComponent(normalizedLink)}`;

            fetch(oembedUrl)
                .then((response) => (response.ok ? response.json() : null))
                .then((data) => {
                    if (isCancelled || !data) return;

                    setLinkPreviewMeta((current) => ({
                        title: data.title || current?.title || getDefaultLinkTitle(activeLink),
                        thumbnail: data.thumbnail_url || current?.thumbnail || thumbnail,
                        isYouTube: false,
                        platform,
                        embedUrl,
                        isPlayable: Boolean(embedUrl || linkPreviewType === "video"),
                    }));
                })
                .catch(() => {
                    // Some platforms require server-side tokens for metadata. The URL still remains usable as a generic social preview.
                });

            return () => {
                isCancelled = true;
            };
        }

        let isCancelled = false;
        const thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

        setLinkPreviewMeta({
            title: "Loading YouTube video...",
            thumbnail,
            isYouTube: true,
            platform: "YouTube",
            embedUrl,
            isPlayable: true,
        });

        fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(normalizedLink)}&format=json`)
            .then((response) => (response.ok ? response.json() : null))
            .then((data) => {
                if (isCancelled) return;
                setLinkPreviewMeta({
                    title: data?.title || "YouTube video",
                    thumbnail,
                    isYouTube: true,
                    platform: "YouTube",
                    embedUrl,
                    isPlayable: true,
                });
            })
            .catch(() => {
                if (isCancelled) return;
                setLinkPreviewMeta({
                    title: "YouTube video",
                    thumbnail,
                    isYouTube: true,
                    platform: "YouTube",
                    embedUrl,
                    isPlayable: true,
                });
            });

        return () => {
            isCancelled = true;
        };
    }, [activeLink, hasLink, linkPreviewType]);

    useEffect(() => {
        return () => {
            if (imagePreview && uploadedMediaType === "video" && isBlobUrl(imagePreview)) {
                URL.revokeObjectURL(imagePreview);
            }
        };
    }, [imagePreview, uploadedMediaType]);

    useEffect(() => {
        setPlayingPreview({
            mobile: false,
            desktop: false,
        });
    }, [activeLink, imagePreview]);

    useEffect(() => {
        if (!isProductPromote) return;
        const incomingProductId = searchParams?.get("productId");
        const incomingLink = searchParams?.get("link");
        if ((!incomingProductId && !incomingLink) || activeLink || linkedProduct) return;

        if (incomingLink) {
            setLinkInput(incomingLink);
        }

        const preloadPromotedProduct = async () => {
            try {
                if (incomingProductId) {
                    const product = await marketService.getItemById(Number(incomingProductId));
                    if (product?.id) {
                        setLinkedProduct(product);
                        if (incomingLink) {
                            setActiveLink(normalizeUrl(incomingLink));
                        } else {
                            const fallbackLink = getShareUrlForItem(product, "product");
                            setLinkInput(fallbackLink);
                            setActiveLink(fallbackLink);
                        }
                        return;
                    }
                }
            } catch {
                // Fall back to link parsing below.
            }

            if (!incomingLink) return;

            const productTarget = getProductShareTarget(incomingLink);
            if (!productTarget) return;

            try {
                const product = productTarget.mode === "id"
                    ? await marketService.getItemById(Number(productTarget.value))
                    : await marketService.getItemByCode(productTarget.value);

                if (!product?.id) return;
                setLinkedProduct(product);
                setActiveLink(normalizeUrl(incomingLink));
            } catch {
                // Ignore preload failures and let the user retry manually.
            }
        };

        void preloadPromotedProduct();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isProductPromote, searchParams, activeLink, linkedProduct]);

    // Profile Promote: pre-fill the link input with the user's profile link and load products
    // for whichever public profile is currently being promoted.
    useEffect(() => {
        if (!isProfilePromote || !userProfile?.username) return;
        if (!linkInput && !activeLink) {
            setLinkInput(profileLink);
        }
        let cancelled = false;
        (async () => {
            try {
                const ownerId = promotedProfile?.id ?? promotedProfile?._id ?? promotedProfile?.user_id;
                if (!ownerId) return;
                const items = await marketService.getItems({ user_id: ownerId, status: "active,approved" });
                if (cancelled) return;
                const visible = (Array.isArray(items) ? items : [])
                    .filter((item: any) => !item?.is_sponsored);
                setProfilePromoteAvailable(visible);
            } catch {
                if (!cancelled) setProfilePromoteAvailable([]);
            }
        })();
        return () => {
            cancelled = true;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isProfilePromote, userProfile?.username, userProfile?.id, promotedProfile?.id, promotedProfile?.user_id]);

    const toggleProfilePromoteProduct = (product: any) => {
        setProfilePromoteProducts((current) => {
            const exists = current.some((p) => String(p.id) === String(product.id));
            if (exists) return current.filter((p) => String(p.id) !== String(product.id));
            if (current.length >= PROFILE_PROMOTE_FEATURED_LIMIT) {
                showPopupError(`You can select up to ${PROFILE_PROMOTE_FEATURED_LIMIT} products.`);
                return current;
            }
            return [...current, product];
        });
    };

    const slideProfilePromoteProducts = (direction: -1 | 1) => {
        setProfilePromoteSlideIndex((current) => {
            const maxIndex = Math.max(0, profilePromoteProducts.length - 3);
            return clamp(current + direction, 0, maxIndex);
        });
    };

    useEffect(() => {
        setProfilePromoteSlideIndex((current) => Math.min(current, Math.max(0, profilePromoteProducts.length - 3)));
    }, [profilePromoteProducts.length]);

    const slideProfilePromoteAvailableProducts = (direction: -1 | 1) => {
        setProfilePromoteAvailableSlideIndex((current) => {
            const maxIndex = Math.max(0, profilePromoteAvailable.length - PROFILE_PROMOTE_PICKER_VISIBLE_COUNT);
            return clamp(current + direction, 0, maxIndex);
        });
    };

    useEffect(() => {
        setProfilePromoteAvailableSlideIndex((current) => Math.min(current, Math.max(0, profilePromoteAvailable.length - PROFILE_PROMOTE_PICKER_VISIBLE_COUNT)));
    }, [profilePromoteAvailable.length]);

    const renderCreative = (context: "mobile" | "desktop") => {
        const iconSize = context === "mobile" ? "text-3xl" : "text-4xl";
        const frameClass = "relative h-full w-full overflow-hidden bg-[radial-gradient(circle_at_30%_20%,rgba(80,96,130,0.38),transparent_34%),linear-gradient(135deg,#15171c_0%,#07080a_100%)]";
        const isPlaying = playingPreview[context];
        const isPlayableLink = Boolean(hasLink && !hasUploadedImage && (linkPreviewMeta?.isPlayable || socialEmbedUrl || linkPreviewType === "video" || linkPreviewType === "embed"));

        const startPlayback = () => {
            setPlayingPreview((current) => ({
                ...current,
                [context]: true,
            }));
        };

        if (isPlaying && (youtubeEmbedUrl || socialEmbedUrl)) {
            const embedSrc = youtubeEmbedUrl ? `${youtubeEmbedUrl}?autoplay=1&rel=0&modestbranding=1` : socialEmbedUrl || undefined;

            return (
                <iframe
                    src={embedSrc}
                    title={previewTitle}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    className="h-full w-full bg-black"
                />
            );
        }

        if (isPlaying && linkPreviewType === "video") {
            return <video src={previewHref} controls autoPlay playsInline className="h-full w-full bg-black object-cover" />;
        }

        if (hasUploadedVideo) {
            return <video src={imagePreview} controls playsInline className="h-full w-full bg-black object-cover" />;
        }

        if (selectedPreviewImage) {
            return (
                <div className={frameClass}>
                    <Image src={selectedPreviewImage} alt={`${context} ad creative`} fill className="object-cover" unoptimized />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/38 via-transparent to-black/10" />
                    {isPlayableLink && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <button
                                type="button"
                                onClick={startPlayback}
                                className="flex h-12 w-12 items-center justify-center rounded-full bg-black/70 text-white shadow-[0_12px_28px_rgba(0,0,0,0.45)] backdrop-blur-sm transition hover:scale-105 hover:bg-black/85"
                                aria-label="Play video preview"
                            >
                                <IonIcon name="play" className="ml-0.5 text-xl" />
                            </button>
                        </div>
                    )}
                </div>
            );
        }

        if (isPlayableLink) {
            return (
                <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_30%_10%,rgba(255,255,255,0.12),transparent_32%),linear-gradient(145deg,#181b22,#050607)] p-4">
                    <button
                        type="button"
                        onClick={startPlayback}
                        className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-black shadow-[0_14px_32px_rgba(0,0,0,0.42)] transition hover:scale-105"
                        aria-label="Play social preview"
                    >
                        <IonIcon name="play" className="ml-0.5 text-xl" />
                    </button>
                </div>
            );
        }

        if (linkPreviewType === "video") {
            return (
                <div className="flex h-full w-full items-center justify-center bg-black text-white/75">
                    <button
                        type="button"
                        onClick={startPlayback}
                        className="flex h-12 w-12 items-center justify-center rounded-full bg-white/12 text-white transition hover:scale-105 hover:bg-white/18"
                        aria-label="Play video preview"
                    >
                        <IonIcon name="play" className="ml-0.5 text-xl" />
                    </button>
                </div>
            );
        }

        if (linkPreviewType === "embed") {
            return (
                <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.12),transparent_42%),#050505] text-white/75">
                    <button
                        type="button"
                        onClick={startPlayback}
                        className="flex h-12 w-12 items-center justify-center rounded-full bg-white/12 text-white transition hover:scale-105 hover:bg-white/18"
                        aria-label="Play video preview"
                    >
                        <IonIcon name="play" className={iconSize} />
                    </button>
                </div>
            );
        }

        return (
            <div className="flex h-full w-full flex-col justify-between bg-[radial-gradient(circle_at_top_left,rgba(74,92,130,0.32),transparent_34%),linear-gradient(145deg,#17191f,#08090b)] p-4">
                <div className="inline-flex w-fit rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-white/45">
                    Live Ad
                </div>
                <div>
                    <div className="text-sm font-black leading-5 text-white/85">{previewTitle}</div>
                    <div className="mt-2 h-2 w-4/5 rounded-full bg-white/12" />
                    <div className="mt-2 h-2 w-3/5 rounded-full bg-white/8" />
                </div>
            </div>
        );
    };

    const renderPreviewAvatar = (sizeClass: string, textClass: string) => {
        if (profileImage) {
            return (
                <div className={`relative shrink-0 overflow-hidden rounded-full bg-white/[0.07] ${sizeClass}`}>
                    <Image src={profileImage} alt={profileDisplayName} fill className="object-cover" unoptimized />
                </div>
            );
        }

        return (
            <div className={`flex shrink-0 items-center justify-center rounded-full bg-white/[0.07] font-black text-white/70 ${sizeClass} ${textClass}`}>
                {profileInitial}
            </div>
        );
    };

    const renderLinkedProductPreviewCard = () => {
        if (!linkedProduct) {
            return (
                <div className="rounded-[1.5rem] border border-dashed border-white/10 bg-white/[0.025] px-4 py-8 text-center text-[11px] font-bold text-white/40">
                    Apply a valid product share link to preview the marketplace card.
                </div>
            );
        }

        const productImage = getProductImageSrc(linkedProduct);
        const productPrice = linkedProduct?.promo_price || linkedProduct?.price;
        const sellerName = linkedProduct?.username || linkedProduct?.owner_username || "Anonymous";
        const sellerImage = linkedProduct?.profile_picture
            ? (String(linkedProduct.profile_picture).startsWith("http") || String(linkedProduct.profile_picture).startsWith("data:")
                ? linkedProduct.profile_picture
                : `/uploads/${String(linkedProduct.profile_picture).split(/[\\/]/).pop()}`)
            : "";

        return (
            <div className="mx-auto w-full max-w-[180px]">
                <div className="group flex flex-col rounded-[1.1rem] border border-white/5 bg-[#1a1a1a] pb-2.5 shadow-[0_12px_28px_rgba(0,0,0,0.28)]">
                    <div className="flex items-center justify-between gap-1.5 px-2.5 py-2">
                        <div className="flex min-w-0 items-center gap-1.5">
                            <div className="relative h-6 w-6 shrink-0 overflow-hidden rounded-full border border-white/10 bg-white/10">
                                {sellerImage ? (
                                    <Image src={sellerImage} alt={sellerName} fill className="object-cover" unoptimized />
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-tr from-blue-600 to-purple-600 text-[8px] font-black text-white">
                                        {sellerName.charAt(0).toUpperCase()}
                                    </div>
                                )}
                            </div>
                            <div className="min-w-0">
                                <div className="truncate text-[9px] font-black uppercase tracking-tight text-white">
                                    {sellerName}
                                </div>
                                <span className="block text-[7px] font-bold uppercase tracking-[0.14em] text-slate-500">
                                    {linkedProduct?.created_at ? "Market" : "Product"}
                                </span>
                            </div>
                        </div>
                        <button
                            type="button"
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/5 text-white/70"
                            aria-label="Preview product options"
                        >
                            <div className="flex flex-col gap-0.5">
                                <div className="h-0.5 w-0.5 rounded-full bg-white" />
                                <div className="h-0.5 w-0.5 rounded-full bg-white" />
                            </div>
                        </button>
                    </div>

                    <div className="relative mx-2 mb-2 aspect-square overflow-hidden rounded-[0.85rem] border border-white/5 bg-black shadow-inner">
                        <Image src={productImage} alt={linkedProduct?.title || "Product preview"} fill className="object-cover" unoptimized />
                    </div>

                    <div className="px-2.5">
                        <h3 className="min-w-0 overflow-hidden text-[9px] font-black uppercase tracking-tight text-white [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] break-words">
                            {linkedProduct?.title || "Product"}
                        </h3>

                        <div className="mt-1.5 flex items-center justify-between gap-2">
                            <div className="flex items-baseline gap-0.5">
                                <span className="text-[7px] font-black text-white/40">R</span>
                                <span className="text-sm font-black tracking-tight text-white">
                                    {productPrice || 0}
                                </span>
                            </div>
                            <div className="flex h-6 w-6 items-center justify-center rounded-lg border border-white/5 bg-white/5 text-white/40">
                                <IonIcon name="cart-outline" className="text-xs" />
                            </div>
                        </div>

                        <div className="mt-2 border-t border-white/5 pt-1.5">
                            <div className="flex items-center justify-between gap-1.5 text-white/80">
                                <div className="flex items-center gap-0.5 text-[7px] font-black">
                                    <IonIcon name="heart-outline" className="text-[12px]" />
                                    <span>{linkedProduct?.likes_count || 0}</span>
                                </div>
                                <div className="flex items-center gap-0.5 text-[7px] font-black">
                                    <IonIcon name="eye-outline" className="text-[12px]" />
                                    <span>{linkedProduct?.views_count || 0}</span>
                                </div>
                                <div className="flex items-center gap-0.5 text-[7px] font-black">
                                    <IonIcon name="chatbubble-outline" className="text-[12px]" />
                                    <span>{linkedProduct?.comments_count || 0}</span>
                                </div>
                                <div className="flex items-center gap-0.5 text-[7px] font-black">
                                    <IonIcon name="share-social-outline" className="text-[12px]" />
                                    <span>{linkedProduct?.shares_count || 0}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    if (publishedAd) {
        return (
            <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4 py-8">
                {showPublishedPopup && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-black/78 backdrop-blur-md animate-in fade-in duration-200" />
                        <div className="relative z-[101] w-full max-w-[380px] rounded-2xl border border-emerald-400/25 bg-[#07140f] p-6 text-center shadow-[0_30px_90px_rgba(0,0,0,0.62)] animate-in zoom-in-95 duration-200">
                            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-400/14 text-emerald-300">
                                <IonIcon name="checkmark-circle-outline" className="text-2xl" />
                            </div>
                            <p className="mt-4 text-[10px] font-black uppercase tracking-[0.24em] text-emerald-300/80">Published</p>
                            <h2 className="mt-2 text-xl font-black text-white">Your ad is under review</h2>
                            <p className="mt-3 text-sm font-bold leading-6 text-white/62">
                                This usually takes up to 24 hours.
                            </p>
                            <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3">
                                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/35">Ad ID</p>
                                <button
                                    type="button"
                                    onClick={() => copyAdId(publishedAd.adId)}
                                    className="mt-1 inline-flex items-center justify-center gap-2 rounded-lg px-2 py-1 text-lg font-black tracking-wide text-white transition hover:bg-white/[0.08]"
                                    aria-label="Copy ad ID"
                                >
                                    <span>{publishedAd.adId}</span>
                                    <IonIcon name={adIdCopied ? "checkmark-outline" : "copy-outline"} className="text-base text-emerald-300" />
                                </button>
                                <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.14em] text-white/32">
                                    {adIdCopied ? "Copied" : "Tap to copy"}
                                </p>
                            </div>
                            <div className="mt-5 grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowPublishedPopup(false)}
                                    className="min-h-10 rounded-xl border border-white/10 bg-white/[0.06] px-4 text-[10px] font-black uppercase tracking-[0.14em] text-white/70 transition hover:bg-white/[0.1] hover:text-white active:scale-[0.98]"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={() => router.push("/dashboard/wallet/ad-center")}
                                    className="min-h-10 rounded-xl bg-white px-4 text-[10px] font-black uppercase tracking-[0.14em] text-black transition hover:bg-zinc-200 active:scale-[0.98]"
                                >
                                    View Ad Center
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <div className="w-full max-w-[440px] rounded-[1.75rem] border border-white/10 bg-[#111114] p-6 text-center shadow-[0_28px_80px_rgba(0,0,0,0.42)]">
                    <button
                        type="button"
                        onClick={() => router.push("/dashboard/shop")}
                        className="mb-5 flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.06] text-white/75 transition hover:bg-white/10 hover:text-white active:scale-95"
                        aria-label="Back to shop"
                    >
                        <IonIcon name="arrow-back-outline" className="text-lg" />
                    </button>
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-400/12 text-emerald-300">
                        <IonIcon name="time-outline" className="text-2xl" />
                    </div>
                    <p className="mt-5 text-[10px] font-black uppercase tracking-[0.24em] text-white/38">Ad Review</p>
                    <h1 className="mt-2 text-2xl font-black text-white">Your ad is under review</h1>
                    <p className="mt-3 text-sm font-bold leading-6 text-white/55">
                        This usually takes up to 24 hours. You cannot edit this ad while it is being reviewed.
                    </p>
                    <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/35">Ad ID</p>
                        <p className="mt-1 text-xl font-black tracking-wide text-white">{publishedAd.adId}</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-[calc(100vh-7rem)] bg-[#1c1917] pb-6 min-[980px]:min-h-[calc(100vh-5.5rem)]">
            <style jsx global>{`
                @keyframes countryDropdownIn {
                    from {
                        opacity: 0;
                        transform: translateY(6px) scale(0.98);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0) scale(1);
                    }
                }
                .age-range-input {
                    pointer-events: none;
                }
                .age-range-input::-webkit-slider-thumb {
                    pointer-events: auto;
                }
                .age-range-input::-moz-range-thumb {
                    pointer-events: auto;
                }
                .age-range-input::-webkit-slider-runnable-track {
                    pointer-events: none;
                }
                .age-range-input::-moz-range-track {
                    pointer-events: none;
                }
                .interest-topic-scroll {
                    scrollbar-width: thin;
                    scrollbar-color: rgba(255,255,255,0.18) rgba(0,0,0,0.55);
                }
                .interest-topic-scroll::-webkit-scrollbar {
                    width: 3px;
                }
                .interest-topic-scroll::-webkit-scrollbar-track {
                    background: rgba(0,0,0,0.55);
                    border-radius: 999px;
                }
                .interest-topic-scroll::-webkit-scrollbar-thumb {
                    background: linear-gradient(180deg, rgba(255,255,255,0.36), rgba(255,255,255,0.12));
                    border-radius: 999px;
                }
            `}</style>

            {popupError && (
                <div className="fixed inset-0 z-[92] flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-black/72 backdrop-blur-sm animate-in fade-in duration-200"
                        onClick={() => setPopupError("")}
                    />
                    <div className="relative z-[93] w-full max-w-[360px] rounded-2xl border border-red-500/25 bg-[#230d12] p-5 text-center shadow-[0_26px_80px_rgba(0,0,0,0.55)] animate-in zoom-in-95 duration-200">
                        <button
                            type="button"
                            onClick={() => setPopupError("")}
                            className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-red-500/10 text-red-300/70 transition hover:bg-red-500/20 hover:text-red-200"
                            aria-label="Close error popup"
                        >
                            <IonIcon name="close-outline" className="text-base" />
                        </button>
                        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-red-500/12 text-red-300">
                            <IonIcon name="alert-circle-outline" className="text-xl" />
                        </div>
                        <h3 className="mt-4 text-[11px] font-black uppercase tracking-[0.24em] text-red-300">
                            {popupErrorTitle}
                        </h3>
                        <p className="mt-3 text-sm font-bold leading-6 text-white/85">
                            {popupError}
                        </p>
                        <div className="mt-5 flex justify-center">
                            <button
                                type="button"
                                onClick={() => setPopupError("")}
                                className="min-h-8 rounded-lg bg-red-500 px-5 text-[9px] font-black uppercase tracking-[0.12em] text-white shadow-[0_10px_22px_rgba(244,63,94,0.18)] transition hover:bg-red-400"
                            >
                                OK
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showInsufficientBalanceModal && (
                <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-in fade-in duration-300"
                        onClick={() => closeInsufficientBalanceModal()}
                    />
                    <div className="relative z-[91] w-full max-w-[400px] rounded-xl border border-red-500/25 bg-[#230d12] px-5 py-6 text-center shadow-2xl shadow-red-950/30 animate-in zoom-in-95 duration-300">
                        <button
                            type="button"
                            onClick={() => closeInsufficientBalanceModal()}
                            className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-red-500/10 text-red-300/70 transition hover:bg-red-500/20 hover:text-red-200"
                            aria-label="Close insufficient balance popup"
                        >
                            <IonIcon name="close-outline" className="text-base" />
                        </button>
                        <h3 className="text-[11px] font-black uppercase tracking-[0.34em] text-red-400">
                            Insufficient Funds
                        </h3>
                        <p className="mt-2 text-[9px] font-black uppercase tracking-[0.16em] text-red-400/75">
                            Missing: R {formatRuppier(missingWalletAmount)}
                        </p>
                        <button
                            type="button"
                            onClick={() => {
                                closeInsufficientBalanceModal();
                                router.push("/dashboard/wallet/topup");
                            }}
                            className="mt-4 w-full rounded-lg border border-red-500/35 bg-red-500/15 px-4 py-3 text-[10px] font-black uppercase tracking-[0.24em] text-red-300 transition hover:bg-red-500/25 hover:text-red-200 active:scale-[0.98]"
                        >
                            Top Up Wallet
                        </button>
                    </div>
                </div>
            )}

            {showCancelConfirm && (
                <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-black/72 backdrop-blur-sm animate-in fade-in duration-200"
                        onClick={() => setShowCancelConfirm(false)}
                    />
                    <div className="relative z-[96] w-full max-w-[360px] rounded-2xl border border-white/10 bg-[#111114] p-5 text-center shadow-[0_26px_80px_rgba(0,0,0,0.55)] animate-in zoom-in-95 duration-200">
                        <button
                            type="button"
                            onClick={() => setShowCancelConfirm(false)}
                            className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.06] text-white/45 transition hover:bg-white/[0.1] hover:text-white"
                            aria-label="Close confirmation popup"
                        >
                            <IonIcon name="close-outline" className="text-base" />
                        </button>
                        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-500/12 text-rose-300">
                            <IonIcon name="document-text-outline" className="text-xl" />
                        </div>
                        <h3 className="mt-4 text-sm font-black uppercase tracking-[0.18em] text-white">
                            Cancel Ad
                        </h3>
                        <p className="mt-2 text-xs leading-5 text-white/45">
                            Save this form as a draft or close it right away.
                        </p>
                        <div className="mt-5 grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={saveDraftAndExit}
                                className="min-h-8 rounded-lg bg-white/[0.06] text-[9px] font-black uppercase tracking-[0.12em] text-white/65 transition hover:bg-white/[0.1] hover:text-white"
                            >
                                Save Draft
                            </button>
                            <button
                                type="button"
                                onClick={discardChangesAndExit}
                                className="min-h-8 rounded-lg bg-rose-500 text-[9px] font-black uppercase tracking-[0.12em] text-white shadow-[0_10px_22px_rgba(244,63,94,0.18)] transition hover:bg-rose-400"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isLocationModalOpen && (
                <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/82 backdrop-blur-md animate-in fade-in duration-300" />
                    <div className="relative z-[96] flex max-h-[86vh] w-full max-w-[430px] flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-[#0A0A0A] shadow-2xl animate-in zoom-in-95 duration-300">
                        <div className="flex items-center justify-center border-b border-white/10 px-4 py-4">
                            <h3 className="text-[12px] font-black uppercase tracking-[0.2em] text-white">Select Locations</h3>
                        </div>

                        <div className="border-b border-white/10 p-3">
                            <div className="flex min-h-10 items-center gap-2 rounded-xl bg-white/[0.06] px-3">
                                <IonIcon name="search-outline" className="text-sm text-white/40" />
                                <input
                                    type="text"
                                    value={locationSearch}
                                    onChange={(event) => setLocationSearch(event.target.value)}
                                    placeholder="Search country"
                                    className="min-w-0 flex-1 bg-transparent text-[11px] font-bold text-white outline-none placeholder:text-white/30"
                                    autoFocus
                                />
                            </div>
                        </div>

                        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3 scroll-smooth [scrollbar-color:rgba(255,255,255,0.25)_transparent] [scrollbar-width:thin]">
                            {(!locationSearch.trim() || "all countries".includes(locationSearch.trim().toLowerCase())) && (
                                <button
                                    type="button"
                                    onClick={selectAllAvailableLocations}
                                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-white/78 transition hover:bg-white/[0.08] hover:text-white"
                                >
                                    <span className={`flex h-5 w-5 items-center justify-center rounded-md border ${isAllDraftLocationsSelected ? "border-white bg-white text-black" : "border-white/20 bg-white/[0.04] text-transparent"}`}>
                                        <IonIcon name="checkmark" className="text-xs" />
                                    </span>
                                    <IonIcon name="globe-outline" className="text-lg" />
                                    <span className="min-w-0 flex-1 truncate text-[11px] font-bold">All Countries</span>
                                </button>
                            )}

                            {filteredLocationCountries
                                .slice()
                                .sort((firstCountry, secondCountry) => {
                                    if (firstCountry.code === "LK") return -1;
                                    if (secondCountry.code === "LK") return 1;
                                    return firstCountry.name.localeCompare(secondCountry.name);
                                })
                                .map((country) => {
                                const isSelected = draftLocationCodes.includes(country.code);

                                return (
                                    <button
                                        key={country.code}
                                        type="button"
                                        onClick={() => selectLocationCode(country.code)}
                                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${isSelected ? "bg-white text-black shadow-[0_8px_24px_rgba(255,255,255,0.08)]" : "text-white/78 hover:bg-white/[0.08] hover:text-white"}`}
                                    >
                                        <span className={`flex h-5 w-5 items-center justify-center rounded-md border ${isSelected ? "border-white bg-white text-black" : "border-white/20 bg-white/[0.04] text-transparent"}`}>
                                            <IonIcon name="checkmark" className="text-xs" />
                                        </span>
                                        <Image
                                            src={getCountryFlagUrl(country)}
                                            alt={country.name}
                                            width={24}
                                            height={16}
                                            className="h-4 w-6 shrink-0 rounded-[3px] object-cover shadow-sm"
                                            unoptimized
                                        />
                                        <span className="min-w-0 flex-1 truncate text-[11px] font-bold">{country.name}</span>
                                    </button>
                                );
                            })}

                            {filteredLocationCountries.length === 0 && (
                                <div className="px-3 py-4 text-center text-[11px] font-bold text-white/45">
                                    No countries found
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-2 border-t border-white/10 p-3">
                            <button
                                type="button"
                                onClick={closeLocationModal}
                                className="min-h-10 rounded-xl bg-white/[0.06] px-3 text-[9px] font-black uppercase tracking-[0.16em] text-white/55 transition hover:bg-white/[0.1] hover:text-white"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={saveLocationSelection}
                                className="min-h-10 rounded-xl bg-white px-3 text-[9px] font-black uppercase tracking-[0.16em] text-black transition hover:bg-zinc-200 active:scale-[0.98]"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="mb-4 flex items-center gap-3">
                <button
                    type="button"
                    onClick={() => router.push("/dashboard/shop")}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-white/75 transition hover:bg-white/10 hover:text-white active:scale-95"
                    aria-label="Back to shop"
                >
                    <IonIcon name="arrow-back-outline" className="text-lg" />
                </button>
                <div className="min-w-0">
                    <p className="text-[9px] font-black uppercase tracking-[0.22em] text-white/35">Ad Bar</p>
                    <h1 className="mt-0.5 truncate text-xl font-black tracking-tight text-white">{campaignType}</h1>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 min-[980px]:h-full min-[980px]:grid-cols-[minmax(0,1.14fr)_minmax(320px,0.8fr)] min-[980px]:items-start">
                <div className="min-w-0 space-y-5 min-[980px]:h-full min-[980px]:overflow-y-auto min-[980px]:pr-3 min-[980px]:[-ms-overflow-style:none] min-[980px]:[scrollbar-width:none] min-[980px]:[&::-webkit-scrollbar]:hidden">
                    {isProfilePromote ? (
                        <section className="space-y-5 border-b border-white/10 pb-5">
                            <div>
                                <div className="mb-3 flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-bold text-white">Share Profile</p>
                                        <p className="mt-1 text-xs text-white/45">{hasLink ? activeLink : "Add your public profile link."}</p>
                                    </div>
                                    {hasLink ? (
                                        <button
                                            type="button"
                                            onClick={handleRemoveLink}
                                            className="flex h-8 items-center justify-center rounded-full bg-white/[0.06] px-3 text-[9px] font-black uppercase tracking-[0.14em] text-white/60 transition hover:bg-white/[0.1] hover:text-white"
                                        >
                                            Remove
                                        </button>
                                    ) : (
                                        <IonIcon name="person-outline" className="text-lg text-white/40" />
                                    )}
                                </div>

                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                    <input
                                        type="text"
                                        value={linkInput}
                                        onChange={(event) => setLinkInput(event.target.value)}
                                        placeholder="https://app.infranex.it.com/username"
                                        className="min-h-10 min-w-0 flex-1 rounded-xl bg-white/[0.06] px-3 text-xs text-white outline-none transition placeholder:text-white/25 focus:bg-white/[0.09]"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleAddLink}
                                        className="flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-white px-4 text-[9px] font-black uppercase tracking-[0.14em] text-black transition hover:bg-zinc-200 active:scale-95"
                                    >
                                        <IonIcon name="checkmark-outline" className="text-xs" />
                                        <span>Apply</span>
                                    </button>
                                </div>

                                <div className="mt-3 flex items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            const value = activeLink || linkInput || promotedProfileLink;
                                            try {
                                                if (navigator.clipboard?.writeText) {
                                                    await navigator.clipboard.writeText(value);
                                                }
                                                setProfileLinkCopied(true);
                                                window.setTimeout(() => setProfileLinkCopied(false), 1600);
                                            } catch {
                                                setProfileLinkCopied(false);
                                            }
                                        }}
                                        className="flex min-h-9 items-center gap-2 rounded-full bg-white/[0.06] px-3 text-[10px] font-black uppercase tracking-[0.14em] text-white/75 transition hover:bg-white/[0.1] hover:text-white active:scale-95"
                                    >
                                        <IonIcon name={profileLinkCopied ? "checkmark-outline" : "copy-outline"} className="text-sm" />
                                        <span>{profileLinkCopied ? "Copied" : "Copy Link"}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setProfilePromoteUser(null);
                                            setProfilePromoteProducts([]);
                                            setProfilePromoteSlideIndex(0);
                                            setLinkInput(profileLink);
                                            setActiveLink(profileLink);
                                        }}
                                        className="flex min-h-9 items-center gap-2 rounded-full bg-white/[0.06] px-3 text-[10px] font-black uppercase tracking-[0.14em] text-white/55 transition hover:bg-white/[0.1] hover:text-white active:scale-95"
                                    >
                                        <IonIcon name="refresh-outline" className="text-sm" />
                                        <span>Use My Profile</span>
                                    </button>
                                </div>
                            </div>

                            {hasLink && (
                                <div>
                                    <div className="mb-2 flex items-center justify-between gap-3">
                                        <div>
                                            <p className="text-sm font-bold text-white">Featured Products</p>
                                            <p className="mt-1 text-xs text-white/45">
                                                Select up to 3 products to feature in this ad. ({profilePromoteProducts.length}/{PROFILE_PROMOTE_FEATURED_LIMIT})
                                            </p>
                                        </div>
                                        {profilePromoteProducts.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => setProfilePromoteProducts([])}
                                                className="flex h-8 items-center justify-center rounded-full bg-white/[0.06] px-3 text-[9px] font-black uppercase tracking-[0.14em] text-white/60 transition hover:bg-white/[0.1] hover:text-white"
                                            >
                                                Clear
                                            </button>
                                        )}
                                    </div>

                                    {profilePromoteAvailable.length === 0 ? (
                                        <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.025] px-4 py-6 text-center text-[11px] font-bold text-white/40">
                                            You have no public products yet. Add products to your marketplace first.
                                        </div>
                                    ) : (
                                        <div className="relative overflow-hidden">
                                            {profilePromoteAvailable.length > PROFILE_PROMOTE_PICKER_VISIBLE_COUNT && (
                                                <div className="absolute right-2 top-2 z-10 flex gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => slideProfilePromoteAvailableProducts(-1)}
                                                        disabled={profilePromoteAvailableSlideIndex === 0}
                                                        className="flex h-6 w-6 items-center justify-center rounded-full bg-black/65 text-[10px] font-black text-white transition hover:bg-black disabled:opacity-35"
                                                        aria-label="Previous available products"
                                                    >
                                                        &lt;
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => slideProfilePromoteAvailableProducts(1)}
                                                        disabled={profilePromoteAvailableSlideIndex >= profilePromoteAvailable.length - PROFILE_PROMOTE_PICKER_VISIBLE_COUNT}
                                                        className="flex h-6 w-6 items-center justify-center rounded-full bg-black/65 text-[10px] font-black text-white transition hover:bg-black disabled:opacity-35"
                                                        aria-label="Next available products"
                                                    >
                                                        &gt;
                                                    </button>
                                                </div>
                                            )}
                                            <div className="overflow-hidden">
                                                <div
                                                    className="flex gap-1.5 transition-transform duration-300 ease-out"
                                                    style={{ transform: `translateX(calc(-${profilePromoteAvailableSlideIndex * 20}% - ${profilePromoteAvailableSlideIndex * 0.3}rem))` }}
                                                >
                                                    {profilePromoteAvailable.map((product) => {
                                                        const selected = profilePromoteProducts.some((p) => String(p.id) === String(product.id));
                                                        const selectionIndex = profilePromoteProducts.findIndex((p) => String(p.id) === String(product.id));
                                                        const img = getProductImageSrc(product);
                                                        const price = product?.promo_price || product?.price;
                                                        return (
                                                            <button
                                                                key={`profile-promote-pick-${product.id}`}
                                                                type="button"
                                                                onClick={() => toggleProfilePromoteProduct(product)}
                                                                className={`relative w-[calc((100%-1.5rem)/5)] shrink-0 overflow-hidden rounded-lg border text-left transition active:scale-[0.99] ${selected ? "border-white/80 bg-white/[0.06] shadow-[0_6px_18px_rgba(255,255,255,0.06)]" : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"}`}
                                                            >
                                                                <div className="relative aspect-square w-full overflow-hidden bg-black">
                                                                    {img ? (
                                                                        <Image src={img} alt={product.title || "Product"} fill className="object-cover" unoptimized />
                                                                    ) : (
                                                                        <div className="flex h-full w-full items-center justify-center bg-white/[0.04]">
                                                                            <IonIcon name="image-outline" className="text-sm text-white/30" />
                                                                        </div>
                                                                    )}
                                                                    {selected && (
                                                                        <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[8px] font-black text-black">
                                                                            {selectionIndex + 1}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div className="px-1.5 py-1">
                                                                    <p className="truncate text-[8px] font-black text-white">{product.title || "Item"}</p>
                                                                    <p className="truncate text-[7px] font-bold text-white/45">
                                                                        {Number(price || 0).toLocaleString()}
                                                                    </p>
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </section>
                    ) : (
                    <section className="border-b border-white/10 pb-5">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                                <p className="text-sm font-bold text-white">Apply Link</p>
                                <p className="mt-1 text-xs text-white/45">{hasLink ? previewTitle : "Add landing destination"}</p>
                            </div>
                            {hasLink ? (
                                <button
                                    type="button"
                                    onClick={handleRemoveLink}
                                    className="flex h-8 items-center justify-center rounded-full bg-white/[0.06] px-3 text-[9px] font-black uppercase tracking-[0.14em] text-white/60 transition hover:bg-white/[0.1] hover:text-white"
                                >
                                    Remove
                                </button>
                            ) : (
                                <IonIcon name="link-outline" className="text-lg text-white/40" />
                            )}
                        </div>

                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <input
                                type="text"
                                value={linkInput}
                                onChange={(event) => setLinkInput(event.target.value)}
                                disabled={hasUploadedImage}
                                placeholder={isProductPromote ? "Paste product share link" : "https://your-landing-page.com"}
                                className={`min-h-10 min-w-0 flex-1 rounded-xl bg-white/[0.06] px-3 text-xs text-white outline-none transition placeholder:text-white/25 focus:bg-white/[0.09] ${hasUploadedImage ? "cursor-not-allowed opacity-45" : ""}`}
                            />
                            <button
                                type="button"
                                onClick={handleAddLink}
                                className={`flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-4 text-[9px] font-black uppercase tracking-[0.14em] transition active:scale-95 ${hasUploadedImage ? "bg-white/15 text-white/35" : "bg-white text-black hover:bg-zinc-200"}`}
                            >
                                <IonIcon name="checkmark-outline" className="text-xs" />
                                <span>Apply</span>
                            </button>
                        </div>
                    </section>
                    )}

                    {!isProductPromote && !isProfilePromote && (
                    <section>
                        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <p className="text-sm font-bold text-white">Select Ad Media</p>
                                <p className="mt-1 text-xs text-white/45">{imageName || "Upload image or video"}</p>
                                <p className="mt-1 text-[10px] font-bold text-white/30">Video: upload directly up to 1 min, crop longer videos</p>
                            </div>
                            <button
                                type="button"
                                onClick={handleUploadClick}
                                className={`flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-xs font-bold transition ${hasLink ? "bg-white/[0.03] text-white/30" : "bg-white/[0.06] text-white/75 hover:bg-white/[0.1] hover:text-white"}`}
                            >
                                <IonIcon name="image-outline" className="text-lg" />
                                <span>Upload Media</span>
                            </button>
                        </div>

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*,video/*,.mov,.avi,.mkv,.wmv,.flv,.m4v,.3gp"
                            multiple
                            onChange={handleImageChange}
                            className="hidden"
                        />

                        {hasUploadedImage ? (
                            <div className="flex items-center gap-3">
                                <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-xl bg-white/[0.06]">
                                    {hasUploadedVideo ? (
                                        <video src={imagePreview} className="h-full w-full object-cover" />
                                    ) : (
                                        <Image src={selectedPreviewImage} alt="Uploaded ad image" fill className="object-cover" unoptimized />
                                    )}
                                </div>

                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-xs font-black leading-5 text-white">
                                        {imageName || `${campaignType} Creative`}
                                    </div>
                                    <div className="text-[11px] leading-5 text-white/45">
                                        {imageSize ? `${imageSize.width} x ${imageSize.height}` : "Creative ready"}
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={handleRemoveImage}
                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-400 transition hover:bg-red-500/20 hover:text-red-300"
                                    aria-label="Remove media"
                                >
                                    <IonIcon name="close-outline" className="text-lg" />
                                </button>
                            </div>
                        ) : null}

                        {uploadedMediaType === "image" && imageGalleryPreviews.length > 1 ? (
                            <div className="mt-3 flex items-center gap-2 overflow-x-auto no-scrollbar">
                                {imageGalleryPreviews.map((preview, index) => (
                                    <button
                                        key={`uploaded-gallery-${index}`}
                                        type="button"
                                        onClick={() => setSelectedGalleryIndex(index)}
                                        className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border transition ${selectedGalleryIndex === index ? "border-white/80 ring-2 ring-white/25" : "border-white/10 hover:border-white/30"}`}
                                        aria-label={`Preview image ${index + 1}`}
                                    >
                                        <Image src={preview} alt={`Uploaded ad image ${index + 1}`} fill className="object-cover" unoptimized />
                                        {index === 0 && (
                                            <div className="absolute inset-x-1 bottom-1 rounded bg-black/65 px-1 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] text-white">
                                                Main
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>
                        ) : !hasUploadedImage ? (
                            <button
                                type="button"
                                onClick={handleUploadClick}
                                className={`flex min-h-24 w-full items-center justify-center rounded-xl text-[11px] font-bold uppercase tracking-[0.16em] transition ${hasLink ? "bg-white/[0.025] text-white/25" : "bg-white/[0.04] text-white/35 hover:bg-white/[0.07] hover:text-white/60"}`}
                            >
                                {hasLink ? "Remove link before uploading media" : "Select image or video to preview"}
                            </button>
                        ) : null}
                    </section>
                    )}

                    <section className="space-y-4">
                        {!isProductPromote && !isProfilePromote && (
                        <div>
                            <div className="mb-2 flex items-center justify-between gap-3">
                                <label htmlFor="ad-description" className="text-sm font-bold text-white">
                                    Description
                                </label>
                                <span className="text-[10px] font-black text-white/35">{description.length}/50</span>
                            </div>
                            <div className="relative min-h-[4.2rem] rounded-xl bg-white/[0.06] px-3 py-2 text-[11px] leading-5">
                                <div className="pointer-events-none absolute inset-0 whitespace-pre-wrap break-words px-3 py-2 text-[11px] leading-5 text-white">
                                    {renderHighlightedDescription(description)}
                                </div>
                                <textarea
                                    id="ad-description"
                                    value={description}
                                    maxLength={50}
                                    onChange={(event) => setDescription(event.target.value.slice(0, 50))}
                                    rows={2}
                                    className="relative z-10 h-full min-h-[3.1rem] w-full resize-none bg-transparent text-transparent caret-white outline-none placeholder:text-transparent"
                                    placeholder="Write a short ad description..."
                                />
                            </div>
                        </div>
                        )}

                        {!isProductPromote && !isProfilePromote && (
                        <div className={`grid grid-cols-1 gap-3 sm:items-end ${ctaNeedsDetailField(ctaTopic) ? "sm:grid-cols-[170px_minmax(0,1fr)]" : "sm:grid-cols-[170px]"}`}>
                            <div>
                                <label htmlFor="button-topic" className="mb-2 block text-sm font-bold text-white">
                                Call to Action
                                </label>
                                <select
                                    id="button-topic"
                                    value={ctaTopic}
                                    onChange={(event) => {
                                        setCtaTopic(event.target.value as CtaTopic);
                                        setCtaValue("");
                                    }}
                                    className="min-h-10 w-full rounded-xl bg-white/[0.06] px-3 text-[11px] font-bold text-white outline-none transition focus:bg-white/[0.09]"
                                >
                                    {CTA_OPTIONS.map((option) => (
                                        <option key={option} value={option} className="bg-zinc-900 text-white">
                                            {option}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {ctaNeedsDetailField(ctaTopic) ? (
                                <div>
                                    <label htmlFor="button-action-value" className="mb-2 block text-[11px] font-bold text-white/55">
                                        {CTA_FIELD_LABELS[ctaTopic]}
                                    </label>
                                    {ctaUsesCountryPhone(ctaTopic) ? (
                                        <div className="grid grid-cols-[minmax(138px,0.9fr)_minmax(0,1.1fr)] gap-2">
                                            <div className="relative">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setIsCountryDropdownOpen((current) => !current);
                                                        setCountrySearch("");
                                                    }}
                                                    className="flex min-h-10 w-full items-center justify-between gap-2 rounded-xl bg-white/[0.06] px-3 text-[11px] font-bold text-white outline-none transition hover:bg-white/[0.09]"
                                                >
                                                    <span className="flex min-w-0 items-center gap-2">
                                                        {getCountryFlagUrl(selectedCountry) ? (
                                                            <Image
                                                                src={getCountryFlagUrl(selectedCountry)}
                                                                alt={selectedCountry?.name || "Country flag"}
                                                                width={22}
                                                                height={16}
                                                                className="h-4 w-6 rounded-[3px] object-cover shadow-sm"
                                                                unoptimized
                                                            />
                                                        ) : (
                                                            <span className="text-[10px] leading-none text-white/45">Flag</span>
                                                        )}
                                                        <span className="shrink-0 text-white/90">{selectedCountry?.dialCode || "+1"}</span>
                                                    </span>
                                                    <IonIcon name="chevron-down-outline" className={`text-sm text-white/45 transition ${isCountryDropdownOpen ? "rotate-180" : ""}`} />
                                                </button>

                                                {isCountryDropdownOpen && (
                                                    <div className="absolute bottom-full left-0 z-50 mb-2 w-[min(340px,calc(100vw-2rem))] origin-bottom animate-[countryDropdownIn_160ms_ease-out] rounded-2xl border border-white/10 bg-[#111216]/98 p-2 shadow-[0_24px_70px_rgba(0,0,0,0.48)] backdrop-blur-xl">
                                                        <div className="mb-2 flex min-h-9 items-center gap-2 rounded-xl bg-white/[0.06] px-3">
                                                            <IonIcon name="search-outline" className="text-sm text-white/40" />
                                                            <input
                                                                type="text"
                                                                value={countrySearch}
                                                                onChange={(event) => setCountrySearch(event.target.value)}
                                                                placeholder="Search country or code"
                                                                className="min-w-0 flex-1 bg-transparent text-[11px] font-bold text-white outline-none placeholder:text-white/30"
                                                                autoFocus
                                                            />
                                                        </div>

                                                        <div className="max-h-64 space-y-1 overflow-y-auto scroll-smooth pr-1 [scrollbar-color:rgba(255,255,255,0.25)_transparent] [scrollbar-width:thin]">
                                                            {filteredCountries.map((country) => (
                                                                <button
                                                                    key={country.code}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setSelectedCountryCode(country.code);
                                                                        setIsCountryDropdownOpen(false);
                                                                        setCountrySearch("");
                                                                    }}
                                                                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${country.code === selectedCountry?.code ? "bg-white text-black shadow-[0_8px_24px_rgba(255,255,255,0.08)]" : "text-white/78 hover:bg-white/[0.08] hover:text-white"}`}
                                                                >
                                                                    <Image
                                                                        src={getCountryFlagUrl(country)}
                                                                        alt={country.name}
                                                                        width={24}
                                                                        height={16}
                                                                        className="h-4 w-6 shrink-0 rounded-[3px] object-cover shadow-sm"
                                                                        unoptimized
                                                                    />
                                                                    <span className="min-w-0 flex-1 truncate text-[11px] font-bold">
                                                                        {country.name}
                                                                    </span>
                                                                    <span className="shrink-0 text-[11px] font-black">
                                                                        ({country.dialCode})
                                                                    </span>
                                                                </button>
                                                            ))}
                                                            {countries.length > 0 && filteredCountries.length === 0 && (
                                                                <div className="px-3 py-3 text-center text-[11px] font-bold text-white/45">
                                                                    No countries found
                                                                </div>
                                                            )}
                                                            {countries.length === 0 && (
                                                                <div className="px-3 py-3 text-center text-[11px] font-bold text-white/45">
                                                                    Loading countries...
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            <input
                                                id="button-action-value"
                                                type="tel"
                                                value={ctaValue}
                                                onChange={(event) => setCtaValue(event.target.value)}
                                                placeholder="Phone number"
                                                className="min-h-10 w-full rounded-xl bg-white/[0.06] px-3 text-[11px] text-white outline-none transition placeholder:text-white/25 focus:bg-white/[0.09]"
                                            />
                                        </div>
                                    ) : (
                                        <input
                                            id="button-action-value"
                                            type={ctaTopic === "Contact Us" ? "text" : "url"}
                                            value={ctaValue}
                                            onChange={(event) => setCtaValue(event.target.value)}
                                            placeholder={CTA_FIELD_PLACEHOLDERS[ctaTopic]}
                                            className="min-h-10 w-full rounded-xl bg-white/[0.06] px-3 text-[11px] text-white outline-none transition placeholder:text-white/25 focus:bg-white/[0.09]"
                                        />
                                    )}
                                </div>
                            ) : null}
                        </div>
                        )}

                        <div className="space-y-4 rounded-2xl bg-white/[0.035] p-4">
                            <div>
                                <div className="flex items-center justify-between gap-3">
                                    <p className="text-sm font-bold text-white">Budget</p>
                                </div>
                            </div>

                            <div>
                                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                                    <div className="flex flex-col gap-1.5">
                                        <div className="flex items-center gap-2 text-base font-black text-white">
                                            <span className="rounded-lg bg-white/[0.07] px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/55">Rupieer</span>
                                            <span>{budget !== null ? formatRuppier(budget) : "—"}</span>
                                            <span className="text-xs font-black text-white/45">Total Budget</span>
                                            {!isProfileAd && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (isPromoLockingBudget) return;
                                                        if (isBudgetEditing) { closeBudgetEditor(); return; }
                                                        setBudgetInput(budget !== null ? String(budget) : "");
                                                        setIsBudgetEditing(true);
                                                    }}
                                                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.06] text-white/75 transition hover:bg-white/[0.1] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                                                    aria-label="Edit budget amount"
                                                    disabled={isPromoLockingBudget}
                                                >
                                                    <IonIcon name={isBudgetEditing ? "checkmark-outline" : "create-outline"} className="text-sm" />
                                                </button>
                                            )}
                                        </div>
                                        {!isProfileAd && isBudgetEditing && (
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                value={budgetInput}
                                                onChange={(event) => applyBudgetInput(event.target.value)}
                                                onBlur={closeBudgetEditor}
                                                onKeyDown={(event) => { if (event.key === "Enter") closeBudgetEditor(); }}
                                                maxLength={6}
                                                className="min-h-8 w-32 rounded-lg border border-white/10 bg-black/20 px-2 text-[10px] font-black text-white outline-none transition focus:border-white/30 focus:bg-white/[0.08]"
                                                disabled={isPromoLockingBudget}
                                                autoFocus
                                            />
                                        )}
                                    </div>
                                    <div className="flex flex-col items-end gap-1">
                                        <div className="flex flex-wrap items-center justify-end gap-2">
                                            <div className={`flex min-h-9 items-center gap-1 rounded-xl border bg-black/20 px-1.5 py-1 transition focus-within:border-white/30 ${promoError ? "border-red-500/60" : "border-white/10"}`}>
                                                <input
                                                    type="text"
                                                    value={promoCode}
                                                    onChange={(event) => {
                                                        setPromoCode(sanitizePromoCode(event.target.value));
                                                        if (promoError) setPromoError("");
                                                    }}
                                                    onKeyDown={(event) => {
                                                        if (event.key === "Enter") addPromoCode();
                                                    }}
                                                    maxLength={15}
                                                    disabled={hasPromoCodeAdded && !isPromoEditing}
                                                    placeholder="Promo Code"
                                                    className="h-7 w-32 bg-transparent px-2 text-[10px] font-black uppercase tracking-[0.08em] text-white outline-none placeholder:text-white/40 disabled:cursor-default disabled:opacity-100"
                                                />
                                                {hasPromoCodeAdded && !isPromoEditing ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setPromoCode("");
                                                            setHasPromoCodeAdded(false);
                                                            setIsPromoEditing(true);
                                                            setPromoDiscount(null);
                                                            setPromoError("");
                                                        }}
                                                        className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-500/15 text-red-400 transition hover:bg-red-500/25 hover:text-red-300"
                                                        aria-label="Remove promo code"
                                                    >
                                                        <IonIcon name="close-outline" className="text-base" />
                                                    </button>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={addPromoCode}
                                                        className="flex h-7 min-w-10 items-center justify-center rounded-lg bg-rose-500 px-2 text-[9px] font-black uppercase tracking-[0.08em] text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-45"
                                                        disabled={(!promoCode.trim() && !hasPromoCodeAdded) || isValidatingPromo}
                                                    >
                                                        {isValidatingPromo ? (
                                                            <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                                                        ) : "Add"}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        {promoError && (
                                            <p className="text-right text-[9px] font-semibold text-red-400">{promoError}</p>
                                        )}
                                        {hasPromoCodeAdded && promoDiscount && !promoError && (
                                            <p className="text-right text-[9px] font-semibold text-emerald-400">
                                                {promoDiscount.discount_type === "rupee"
                                                    ? `–R${promoDiscount.discount_value.toLocaleString()} discount applied`
                                                    : promoDiscount.discount_type === "reach"
                                                        ? "Promo code applied"
                                                        : `+${promoDiscount.discount_value} free day${promoDiscount.discount_value !== 1 ? "s" : ""} added`}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                {/* Budget slider — full width, photo/video & product only */}
                                {!isProfileAd && tiersLoaded && (
                                    <div className={`transition-opacity ${isPromoLockingBudget ? "opacity-45 pointer-events-none" : "opacity-100"}`}>
                                        <input
                                            type="range"
                                            min={globalBudgetMin}
                                            max={globalBudgetMax}
                                            step={1}
                                            value={budget ?? globalBudgetMin}
                                            disabled={isPromoLockingBudget}
                                            onChange={(event) => {
                                                const val = Number(event.target.value);
                                                setBudget(val);
                                                if (isBudgetEditing) setBudgetInput(String(val));
                                            }}
                                            className="h-2 w-full cursor-pointer accent-rose-500 disabled:cursor-not-allowed"
                                        />
                                        <div className="mt-1 flex justify-between text-[9px] font-bold text-white/35">
                                            <span>R{globalBudgetMin.toLocaleString()}</span>
                                            <span>R{globalBudgetMax.toLocaleString()}</span>
                                        </div>
                                    </div>
                                )}
                                {isBudgetInGap && (
                                    <p className="mt-1 text-[9px] font-semibold text-amber-400">
                                        This budget amount is not available. Adjust to a valid range.
                                    </p>
                                )}
                                {/* Profile promote: chip picker */}
                                {isProfileAd && (!tiersLoaded ? (
                                    <p className="mt-3 text-center text-[10px] font-semibold text-white/35">
                                        No budget packages available right now.
                                    </p>
                                ) : (
                                    <div className={`mt-3 flex flex-wrap gap-2 transition-opacity ${isPromoLockingBudget ? "opacity-45 pointer-events-none" : "opacity-100"}`}>
                                        {budgetOptions.map((opt) => (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                onClick={() => {
                                                    setBudget(opt.value);
                                                    setDurationDays(opt.tier.min_days);
                                                }}
                                                className={`rounded-full border px-4 py-1.5 text-[10px] font-black transition active:scale-95 ${
                                                    budget === opt.value
                                                        ? "border-rose-500 bg-rose-500 text-white shadow-[0_6px_18px_rgba(244,63,94,0.35)]"
                                                        : "border-white/15 bg-white/5 text-white/70 hover:border-white/30 hover:text-white"
                                                }`}
                                            >
                                                R{opt.value.toLocaleString()}
                                            </button>
                                        ))}
                                    </div>
                                ))}
                                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                                    <div className="rounded-xl bg-black/20 px-2.5 py-1 text-[10px] font-black text-white/55">
                                        Rupieer Balance: {walletBalanceLoaded ? formatRuppier(walletBalance) : "Loading..."}
                                    </div>
                                    {hasInsufficientBalance && (
                                        <button
                                            type="button"
                                            onClick={() => router.push("/dashboard/wallet/topup")}
                                            className="rounded-lg border border-red-500/35 bg-red-500/15 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-red-300 transition hover:bg-red-500/25 hover:text-red-200 active:scale-[0.98]"
                                        >
                                            Top Up
                                        </button>
                                    )}
                                </div>
                                {hasInsufficientBalance && (
                                    <p className="mt-1 text-center text-[10px] font-bold leading-4 text-red-400">
                                        Insufficient wallet balance. Please top up your wallet.
                                    </p>
                                )}
                            </div>

                            <div className={`transition-opacity ${isDurationLocked ? "opacity-45 pointer-events-none" : "opacity-100"}`}>
                                <p className="text-sm font-bold text-white">Duration</p>
                                <div className="mb-3 mt-3 text-sm font-black text-white">
                                    {durationDays} {durationDays === 1 ? "day" : "days"}
                                    {isDurationLocked && <span className="ml-2 text-[9px] font-semibold text-white/40 uppercase tracking-widest">Fixed</span>}
                                    {hasPromoCodeAdded && promoDiscount?.discount_type === "days" && (
                                        <span className="ml-2 text-[9px] font-semibold text-emerald-400">+{promoDiscount.discount_value} bonus</span>
                                    )}
                                </div>
                                <input
                                    type="range"
                                    min={tierMinDays}
                                    max={tierMaxDays}
                                    step={1}
                                    value={durationDays}
                                    disabled={isDurationLocked}
                                    onChange={(event) => {
                                        const nextDuration = Number(event.target.value);
                                        setDurationDays(Math.min(tierMaxDays, Math.max(tierMinDays, nextDuration)));
                                    }}
                                    className="h-2 w-full cursor-pointer accent-rose-500 disabled:cursor-not-allowed"
                                />
                                <p className="mt-2 text-[9px] font-bold leading-4 text-white/35">
                                    Ads usually complete within your selected time, but may finish sooner or take longer depending on audience reach.
                                </p>
                            </div>
                        </div>

                        <div className="space-y-4 rounded-2xl bg-white/[0.035] p-4">
                            <div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-sm font-bold text-white">Location</p>
                                    {selectedLocationCodes.slice(0, 5).map((code) => {
                                        const country = countries.find((countryOption) => countryOption.code === code);
                                        if (!country) return null;

                                        return (
                                            <span key={code} className="flex min-h-7 items-center gap-1.5 rounded-lg bg-white/[0.08] px-2 text-[10px] font-black text-white/80">
                                                <Image
                                                    src={getCountryFlagUrl(country)}
                                                    alt={country.name}
                                                    width={20}
                                                    height={14}
                                                    className="h-3.5 w-5 rounded-[3px] object-cover"
                                                    unoptimized
                                                />
                                                <span className="max-w-[120px] truncate">{country.name}</span>
                                                <button
                                                    type="button"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        setSelectedLocationCodes((current) => current.filter((currentCode) => currentCode !== code));
                                                    }}
                                                    className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
                                                    aria-label={`Remove ${country.name}`}
                                                >
                                                    <IonIcon name="close-outline" className="text-xs" />
                                                </button>
                                            </span>
                                        );
                                    })}
                                    {selectedLocationCodes.length > 5 && (
                                        <button
                                            type="button"
                                            onClick={openLocationModal}
                                            className="min-h-7 rounded-lg bg-white/[0.08] px-2 text-[10px] font-black text-white/70 transition hover:bg-white/[0.12] hover:text-white"
                                        >
                                            See more +{selectedLocationCodes.length - 5}
                                        </button>
                                    )}
                                </div>
                                <div
                                    role="button"
                                    tabIndex={0}
                                    onClick={openLocationModal}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter" || event.key === " ") openLocationModal();
                                    }}
                                    className="mt-3 flex min-h-10 w-full cursor-pointer items-center justify-between gap-3 rounded-xl bg-white/[0.06] px-3 py-2 text-left text-[11px] font-bold text-white outline-none transition hover:bg-white/[0.09]"
                                >
                                    <div className="flex min-w-0 flex-1 items-center gap-2">
                                        <IonIcon name="globe-outline" className="text-base text-white/45" />
                                        <span className="truncate text-white/60">Select Countries</span>
                                    </div>
                                    <IonIcon name="chevron-forward-outline" className="shrink-0 text-sm text-white/45" />
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="rounded-2xl bg-white/[0.035] p-4">
                                <p className="text-sm font-bold text-white">Gender</p>
                                <div className="mt-3 flex w-fit items-center gap-1 rounded-xl border border-white/10 bg-black/20 p-1">
                                    {GENDER_OPTIONS.map((option) => (
                                        <button
                                            key={option}
                                            type="button"
                                            onClick={() => setGenderTarget(option)}
                                            className={`min-h-7 rounded-lg px-3 text-[9px] font-black uppercase tracking-[0.1em] transition ${genderTarget === option ? "bg-rose-500 text-white shadow-[0_10px_22px_rgba(244,63,94,0.22)]" : "text-white/50 hover:bg-white/[0.08] hover:text-white"}`}
                                        >
                                            {option}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="rounded-2xl bg-white/[0.035] p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <p className="text-sm font-bold text-white">Age</p>
                                    <span className="rounded-lg bg-white/[0.07] px-2 py-1 text-[10px] font-black text-white/70">
                                        {ageMin} - {ageMax}
                                    </span>
                                </div>
                                <div className="relative mt-5 pb-5 pt-3">
                                    <div className="absolute left-0 right-0 top-5 h-2 rounded-full bg-white/15" />
                                    <div
                                        className="absolute top-5 h-2 rounded-full bg-rose-500"
                                        style={{
                                            left: `${ageMinProgress}%`,
                                            width: `${Math.max(0, ageMaxProgress - ageMinProgress)}%`,
                                        }}
                                    />
                                    <div
                                        className="pointer-events-none absolute top-[0.9rem] z-20 h-5 w-5 -translate-x-1/2 rounded-full border-2 border-white bg-rose-500 shadow-[0_6px_16px_rgba(244,63,94,0.45)]"
                                        style={{ left: `${ageMinProgress}%` }}
                                    />
                                    <div
                                        className="pointer-events-none absolute top-[0.9rem] z-20 h-5 w-5 -translate-x-1/2 rounded-full border-2 border-white bg-rose-500 shadow-[0_6px_16px_rgba(244,63,94,0.45)]"
                                        style={{ left: `${ageMaxProgress}%` }}
                                    />
                                    <input
                                        type="range"
                                        min={18}
                                        max={65}
                                        step={1}
                                        value={ageMin}
                                        onChange={(event) => setAgeMin(Math.min(Number(event.target.value), ageMax))}
                                        className="age-range-input absolute inset-x-0 top-2 z-30 h-8 w-full cursor-pointer opacity-0"
                                        aria-label="Minimum age"
                                    />
                                    <input
                                        type="range"
                                        min={18}
                                        max={65}
                                        step={1}
                                        value={ageMax}
                                        onChange={(event) => setAgeMax(Math.max(Number(event.target.value), ageMin))}
                                        className="age-range-input absolute inset-x-0 top-2 z-40 h-8 w-full cursor-pointer opacity-0"
                                        aria-label="Maximum age"
                                    />
                                    <div className="absolute inset-x-0 bottom-0 flex justify-between text-[9px] font-black text-white/35">
                                        <span>18</span>
                                        <span>65</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="rounded-2xl bg-white/[0.035] p-4">
                                <button
                                    type="button"
                                    onClick={() => setIsInterestTopicsOpen((current) => !current)}
                                    className="flex w-full items-center justify-between gap-3 text-left"
                                    aria-expanded={isInterestTopicsOpen}
                                >
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-white">Interest Topics</p>
                                        <p className="mt-1 text-[10px] font-semibold text-white/35">
                                            {draftInterestTopics.length}/{INTEREST_TOPIC_LIMIT} selected
                                        </p>
                                    </div>
                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-white/55 transition hover:bg-white/[0.1]">
                                        <IonIcon name={isInterestTopicsOpen ? "chevron-up-outline" : "chevron-down-outline"} className="text-base" />
                                    </span>
                                </button>

                                <div className={`overflow-hidden transition-all duration-300 ease-out ${isInterestTopicsOpen ? "visible mt-3 max-h-[360px] opacity-100" : "invisible max-h-0 opacity-0"}`}>
                                    <div className="interest-topic-scroll flex max-h-56 flex-wrap gap-2 overflow-y-auto pr-1">
                                        {INTEREST_TOPIC_OPTIONS.map((topic) => {
                                            const isSelected = draftInterestTopics.includes(topic);
                                            const isLocked = !isSelected && draftInterestTopics.length >= INTEREST_TOPIC_LIMIT;

                                            return (
                                                <button
                                                    key={topic}
                                                    type="button"
                                                    onClick={() => toggleInterestTopic(topic)}
                                                    className={`min-h-8 rounded-xl border px-3 text-[10px] font-black transition ${
                                                        isSelected
                                                            ? "border-rose-400/50 bg-rose-500 text-white shadow-[0_10px_24px_rgba(244,63,94,0.2)]"
                                                            : isLocked
                                                                ? "cursor-not-allowed border-white/8 bg-white/[0.025] text-white/25"
                                                                : "border-white/10 bg-white/[0.045] text-white/58 hover:border-white/18 hover:bg-white/[0.08] hover:text-white"
                                                    }`}
                                                    aria-pressed={isSelected}
                                                >
                                                    {topic}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    <div className="mt-4 flex justify-end">
                                        <button
                                            type="button"
                                            onClick={saveInterestTopics}
                                            className="min-h-9 rounded-xl bg-rose-500 px-5 text-[10px] font-black uppercase tracking-[0.14em] text-white shadow-[0_14px_28px_rgba(244,63,94,0.22)] transition hover:bg-rose-400"
                                        >
                                            Save
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="relative rounded-2xl bg-white/[0.035] p-4">
                                <p className="text-sm font-bold text-white">Placements</p>
                                <button
                                    type="button"
                                    onClick={() => setIsPlacementDropdownOpen((current) => !current)}
                                    className="mt-2.5 flex min-h-9 w-full items-center justify-between gap-2 rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-left text-[10px] font-bold text-white transition hover:bg-white/[0.09]"
                                    aria-expanded={isPlacementDropdownOpen}
                                >
                                    <span className="flex min-w-0 items-center gap-2">
                                        <IonIcon name="grid-outline" className="text-sm text-white/45" />
                                        <span className="truncate text-white/70">{placementDisplayLabel}</span>
                                    </span>
                                    <IonIcon name={isPlacementDropdownOpen ? "chevron-up-outline" : "chevron-down-outline"} className="shrink-0 text-xs text-white/45" />
                                </button>

                                {isPlacementDropdownOpen && (
                                    <div className="absolute bottom-[3.9rem] left-4 right-4 z-30 overflow-hidden rounded-xl border border-white/10 bg-[#111114] shadow-[0_20px_44px_rgba(0,0,0,0.4)] animate-[countryDropdownIn_160ms_ease-out]">
                                        <div className="interest-topic-scroll max-h-40 overflow-y-auto p-1">
                                            {PLACEMENT_OPTIONS.map((placement) => {
                                                const isSelectedPlacement = placement.label === "All" ? areAllPlacementsSelected : selectedPlacements.includes(placement.label);

                                                return (
                                                    <button
                                                        key={placement.label}
                                                        type="button"
                                                        disabled={!placement.selectable}
                                                        onClick={() => {
                                                            if (!placement.selectable) return;
                                                            togglePlacement(placement.label);
                                                        }}
                                                        className={`flex min-h-8 w-full items-center justify-between gap-2 rounded-lg px-2.5 text-left text-[10px] font-bold transition ${
                                                            isSelectedPlacement
                                                                ? "bg-rose-500 text-white"
                                                                : placement.selectable
                                                                    ? "text-white/62 hover:bg-white/[0.07] hover:text-white"
                                                                    : "cursor-not-allowed text-white/22"
                                                        }`}
                                                    >
                                                        <span>{placement.label}</span>
                                                        {isSelectedPlacement && <IonIcon name="checkmark-outline" className="text-base" />}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {showProfileNonRefundableNotice && (
                            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-3 text-left">
                                <input
                                    type="checkbox"
                                    checked={acceptedProfileNonRefundable}
                                    onChange={(event) => setAcceptedProfileNonRefundable(event.target.checked)}
                                    className="mt-0.5 h-4 w-4 shrink-0 accent-amber-400"
                                />
                                <span className="text-[10px] font-bold leading-5 text-amber-100">
                                    Profile promotion packages are non-refundable once activated.
                                </span>
                            </label>
                        )}

                        <div className="flex flex-wrap items-center justify-end gap-1.5 border-t border-white/8 pt-4">
                            {campaignType === "Photo and Video" && userHasPaidSubscription === false && (
                                <p className="w-full text-right text-[10px] text-white/40 mb-2 mt-0.5 leading-relaxed">
                                    This ad will be deleted from your profile in {adsExpiryLabel}. Get a subscription package to keep it on your profile.
                                </p>
                            )}
                            <button
                                type="button"
                                onClick={() => setShowCancelConfirm(true)}
                                className="flex min-h-9 items-center justify-center gap-1.5 rounded-[0.9rem] border border-white/10 bg-white/[0.06] px-5 text-[10px] font-black uppercase tracking-[0.14em] text-white/75 transition hover:border-white/18 hover:bg-white/[0.1] hover:text-white active:scale-[0.99]"
                            >
                                <IonIcon name="close-outline" className="text-sm" />
                                <span>Cancel</span>
                            </button>
                            <button
                                type="button"
                                onClick={handlePublish}
                                disabled={isPublishing}
                                className="flex min-h-9 items-center justify-center gap-1.5 rounded-[0.9rem] bg-rose-500 px-5 text-[10px] font-black uppercase tracking-[0.14em] text-white shadow-[0_12px_26px_rgba(244,63,94,0.2)] transition hover:bg-rose-400 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                <IonIcon name={isPublishing ? "hourglass-outline" : "rocket-outline"} className="text-sm" />
                                <span>{isPublishing ? "Publishing" : "Publish"}</span>
                            </button>
                        </div>
                    </section>
                </div>


                <section className="min-w-0 min-[980px]:sticky min-[980px]:top-20 min-[980px]:h-[calc(100vh-6.5rem)]">
                    <div className="flex h-full flex-col gap-3 rounded-[1.75rem] border border-white/8 bg-[linear-gradient(180deg,rgba(18,18,18,0.98),rgba(12,12,12,0.98))] p-4 shadow-[0_28px_64px_rgba(0,0,0,0.36)]">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-base font-bold text-white">Ad Preview</p>
                                <p className="mt-1 text-xs text-white/45">{isProductPromote ? "Marketplace product card" : isProfilePromote ? "Profile promotion card" : "Live device preview"}</p>
                            </div>

                            {!isProductPromote && !isProfilePromote && (
                            <div className="grid grid-cols-2 gap-1 rounded-xl bg-white/[0.04] p-1">
                                <button
                                    type="button"
                                    onClick={() => setPreviewMode("mobile")}
                                    className={`flex min-h-9 items-center justify-center gap-2 rounded-lg px-3 transition ${previewMode === "mobile" ? "bg-white text-black" : "text-white/55 hover:bg-white/[0.05] hover:text-white"}`}
                                >
                                    <IonIcon name="phone-portrait-outline" className="text-base" />
                                    <span className="text-[9px] font-black uppercase tracking-[0.14em]">Mobile</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPreviewMode("desktop")}
                                    className={`flex min-h-9 items-center justify-center gap-2 rounded-lg px-3 transition ${previewMode === "desktop" ? "bg-white text-black" : "text-white/55 hover:bg-white/[0.05] hover:text-white"}`}
                                >
                                    <IonIcon name="desktop-outline" className="text-base" />
                                    <span className="text-[9px] font-black uppercase tracking-[0.14em]">Desktop</span>
                                </button>
                            </div>
                            )}
                        </div>

                        <div className={`min-h-0 flex-1 overflow-y-auto rounded-[1.35rem] border border-white/8 bg-white/[0.025] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden ${isProductPromote ? "px-2.5 py-2.5" : "px-4 py-3.5"}`}>
                            {isProductPromote ? (
                                <div aria-label="Product Preview" className="min-w-0">
                                    <div className="mb-2 flex items-center gap-1.5">
                                        <IonIcon name="cube-outline" className="text-xs text-white/45" />
                                        <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/45">Marketplace Preview</p>
                                    </div>
                                    {renderLinkedProductPreviewCard()}
                                </div>
                            ) : isProfilePromote ? (
                                <div aria-label="Profile Promote Preview" className="min-w-0">
                                    <div className="mb-2 flex items-center gap-1.5">
                                        <IonIcon name="person-outline" className="text-xs text-white/45" />
                                        <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/45">Profile Preview</p>
                                    </div>
                                    <div className="overflow-hidden rounded-[1.25rem] border border-white/10 bg-[#121318] shadow-[0_18px_38px_rgba(0,0,0,0.36)]">
                                        {/* Top: profile + username + Subscribe + 2-dot menu */}
                                        <div className="flex items-center gap-3 border-b border-white/8 px-3 py-2.5">
                                            <div className="relative h-9 w-9 overflow-hidden rounded-full border border-white/10 bg-white/[0.06]">
                                                {profileImage ? (
                                                    <Image src={profileImage} alt={profileDisplayName} fill className="object-cover" unoptimized />
                                                ) : (
                                                    <div className="flex h-full w-full items-center justify-center text-[11px] font-black text-white/70">
                                                        {profileInitial}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-[12px] font-black text-white">{profileDisplayName}</p>
                                                <p className="truncate text-[9px] font-bold text-white/40">@{promotedProfile?.username || profileUsername}</p>
                                            </div>
                                            <button
                                                type="button"
                                                className="rounded-full bg-white px-3 py-1 text-[8px] font-black uppercase tracking-[0.14em] text-black"
                                            >
                                                Subscribe
                                            </button>
                                            <button
                                                type="button"
                                                className="flex h-7 w-7 items-center justify-center rounded-full text-white/55 transition hover:bg-white/[0.08] hover:text-white"
                                                aria-label="More"
                                            >
                                                <IonIcon name="ellipsis-vertical" className="text-sm" />
                                            </button>
                                        </div>

                                        {/* Middle: selected featured products */}
                                        <div className="relative overflow-hidden p-1.5">
                                            {profilePromoteProducts.length > 3 && (
                                                <div className="absolute right-2 top-2 z-10 flex gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => slideProfilePromoteProducts(-1)}
                                                        disabled={profilePromoteSlideIndex === 0}
                                                        className="flex h-6 w-6 items-center justify-center rounded-full bg-black/65 text-[10px] font-black text-white transition hover:bg-black disabled:opacity-35"
                                                        aria-label="Previous featured products"
                                                    >
                                                        &lt;
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => slideProfilePromoteProducts(1)}
                                                        disabled={profilePromoteSlideIndex >= profilePromoteProducts.length - 3}
                                                        className="flex h-6 w-6 items-center justify-center rounded-full bg-black/65 text-[10px] font-black text-white transition hover:bg-black disabled:opacity-35"
                                                        aria-label="Next featured products"
                                                    >
                                                        &gt;
                                                    </button>
                                                </div>
                                            )}
                                            {profilePromoteProducts.length === 0 ? (
                                                <div className="grid grid-cols-3 gap-1">
                                                    {Array.from({ length: 3 }).map((_, idx) => (
                                                        <div key={`profile-promote-empty-${idx}`} className="aspect-[4/5] rounded-[0.5rem] border border-dashed border-white/8 bg-white/[0.025]" />
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="overflow-hidden">
                                                    <div
                                                        className="flex gap-1 transition-transform duration-300 ease-out"
                                                        style={{ transform: `translateX(-${profilePromoteSlideIndex * 33.3333}%)` }}
                                                    >
                                                        {profilePromoteProducts.map((product) => {
                                                            const img = getProductImageSrc(product);
                                                            return (
                                                                <div
                                                                    key={`profile-promote-product-${product.id}`}
                                                                    className="w-1/3 shrink-0 overflow-hidden rounded-[0.5rem] border border-white/8 bg-[#0e1014]"
                                                                >
                                                                    <div className="relative aspect-square w-full overflow-hidden bg-black">
                                                                        {img ? (
                                                                            <Image src={img} alt={product.title || ""} fill className="object-cover" unoptimized />
                                                                        ) : (
                                                                            <div className="flex h-full w-full items-center justify-center bg-white/[0.04]">
                                                                                <IonIcon name="image-outline" className="text-[10px] text-white/30" />
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <div className="px-1 py-1">
                                                                        <p className="truncate text-[7px] font-black text-white/85">{product.title || "Item"}</p>
                                                                        <p className="truncate text-[7px] font-bold text-white/45">
                                                                            {Number(product.promo_price || product.price || 0).toLocaleString()}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                        {Array.from({ length: Math.max(0, 3 - profilePromoteProducts.length) }).map((_, idx) => (
                                                            <div key={`profile-promote-fill-${idx}`} className="w-1/3 shrink-0 aspect-[4/5] rounded-[0.5rem] border border-dashed border-white/8 bg-white/[0.025]" />
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {profilePromoteProducts.length === 0 && (
                                            <p className="px-3 pb-3 text-center text-[9px] font-semibold text-white/35">
                                                Add products to your marketplace to feature them here.
                                            </p>
                                        )}
                                    </div>
                                </div>
                            ) : previewMode === "mobile" ? (
                                <div aria-label="Mobile Preview" className="min-w-0">
                                    <div className="mb-3 flex items-center gap-2">
                                        <IonIcon name="phone-portrait-outline" className="text-sm text-white/45" />
                                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/45">Mobile Preview</p>
                                    </div>

                                    <div className="mx-auto w-[132px] rounded-[1.45rem] border border-white/15 bg-[#050507] p-1.5 shadow-[0_16px_34px_rgba(0,0,0,0.38),inset_0_0_0_1px_rgba(255,255,255,0.05)]">
                                        <div className="relative overflow-hidden rounded-[1.05rem] border border-white/8 bg-[#0b0c10]">
                                            <div className="absolute left-1/2 top-1.5 z-10 h-3.5 w-12 -translate-x-1/2 rounded-b-xl bg-[#050507]" />
                                            <div className="flex h-[265px] flex-col pt-5">
                                                <div className="flex items-center justify-between px-2.5 pb-2 text-[7px] font-black uppercase tracking-[0.12em] text-white/35">
                                                    <span>Ad</span>
                                                    <span>Sponsored</span>
                                                </div>
                                                <div className="mx-1.5 overflow-hidden rounded-[0.9rem] border border-white/8 bg-[#121318] shadow-[0_10px_24px_rgba(0,0,0,0.34)]">
                                                    <div className="flex items-center gap-2 px-2.5 py-2">
                                                        {renderPreviewAvatar("h-6 w-6", "text-[9px]")}
                                                        <div className="min-w-0 flex-1">
                                                            <div className="truncate text-[9px] font-black text-white/80">{profileDisplayName}</div>
                                                            <div className="text-[7px] font-bold text-white/35">Promoted</div>
                                                        </div>
                                                    </div>
                                                    <div className="mx-2 aspect-square overflow-hidden rounded-[0.8rem] border border-white/8 bg-black">
                                                        {renderCreative("mobile")}
                                                    </div>
                                                    <div className="px-2.5 py-2">
                                                        <p className={`line-clamp-2 text-[7px] font-semibold leading-3 ${description.trim() ? "text-white/70" : "text-white/30"}`}>
                                                            {previewDescription}
                                                        </p>
                                                    </div>
                                                    <div className={`flex items-center gap-1.5 px-2 py-1.5 ${shouldShowCtaButton ? "justify-between" : "justify-start"}`}>
                                                        <div className="min-w-0">
                                                            <div className="truncate text-[8px] font-black text-white/82">
                                                                {shouldShowRichLinkMeta ? previewTitle : "Media Ad"}
                                                            </div>
                                                            <div className="truncate text-[7px] text-white/38">
                                                                {shouldShowRichLinkMeta ? previewHref : hasLink ? "Standard media preview" : "Add link to activate landing page"}
                                                            </div>
                                                        </div>
                                                        {shouldShowCtaButton && (
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    if (ctaTopic === "Message") router.push("/dashboard/chats");
                                                                }}
                                                                className="shrink-0 rounded-full bg-white px-2 py-1 text-[7px] font-black uppercase tracking-[0.12em] text-black"
                                                            >
                                                                {ctaTopic}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="mt-auto px-6 pb-2">
                                                    <div className="mx-auto h-1 w-12 rounded-full bg-white/18" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div aria-label="Desktop Preview" className="min-w-0">
                                    <div className="mb-3 flex items-center gap-2">
                                        <IonIcon name="desktop-outline" className="text-sm text-white/45" />
                                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/45">Desktop Preview</p>
                                    </div>

                                    <div className="mx-auto w-full max-w-[420px]">
                                        <div className="rounded-t-[1rem] border border-white/12 bg-[#050507] p-1.5 shadow-[0_16px_34px_rgba(0,0,0,0.34)]">
                                            <div className="overflow-hidden rounded-[0.8rem] border border-white/8 bg-[#0b0c10]">
                                                <div className="flex h-6 items-center gap-1.5 border-b border-white/8 bg-white/[0.03] px-2.5">
                                                    <div className="h-2 w-2 rounded-full bg-red-400/70" />
                                                    <div className="h-2 w-2 rounded-full bg-amber-300/70" />
                                                    <div className="h-2 w-2 rounded-full bg-emerald-400/70" />
                                                    <div className="ml-2 h-2.5 flex-1 rounded-full bg-white/[0.06]" />
                                                </div>

                                                <div className="grid min-h-[126px] grid-cols-[minmax(0,1fr)_118px] gap-2 p-1.5">
                                                    <div className="flex min-w-0 flex-col justify-between rounded-[0.8rem] border border-white/8 bg-[#121318] p-2">
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                {renderPreviewAvatar("h-7 w-7", "text-[10px]")}
                                                                <div className="min-w-0 flex-1">
                                                                    <div className="truncate text-[10px] font-black text-white/82">{profileDisplayName}</div>
                                                            <div className="text-[8px] font-bold text-white/35">Sponsored Ad</div>
                                                                </div>
                                                            </div>
                                                            <h2 className="mt-2.5 break-words text-[13px] font-black leading-4 text-white/88">
                                                                {shouldShowRichLinkMeta ? previewTitle : "Media Ad"}
                                                            </h2>
                                                            <p className="mt-1.5 line-clamp-2 text-[9px] leading-4 text-white/46">
                                                                {shouldShowRichLinkMeta ? previewHref : hasLink ? "Standard media preview" : "Apply a link to show the landing page destination."}
                                                            </p>
                                                        </div>
                                                        <div className={`mt-3 flex items-center gap-2 ${shouldShowCtaButton ? "justify-between" : "justify-start"}`}>
                                                            <div className="min-w-0">
                                                                <div className="h-1.5 w-20 rounded-full bg-white/10" />
                                                                <div className="mt-1.5 h-1.5 w-12 rounded-full bg-white/7" />
                                                            </div>
                                                            {shouldShowCtaButton && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        if (ctaTopic === "Message") router.push("/dashboard/chats");
                                                                    }}
                                                                    className="rounded-full bg-white px-2.5 py-1 text-[7px] font-black uppercase tracking-[0.14em] text-black"
                                                                >
                                                                    {ctaTopic}
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="h-[96px] overflow-hidden rounded-[0.8rem] border border-white/8 bg-[#121318]">
                                                        {renderCreative("desktop")}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mx-auto h-2.5 w-[86%] rounded-b-[1.1rem] bg-[linear-gradient(180deg,#2f3238,#15161a)] shadow-[0_14px_28px_rgba(0,0,0,0.34)]" />
                                        <div className="mx-auto h-1.5 w-[24%] rounded-b-full bg-white/12" />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="rounded-[0.95rem] border border-white/8 bg-white/[0.03] px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                            <div className="flex items-center justify-between gap-2">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/38">Order Summary</p>
                                </div>
                                <div className="rounded-full border border-white/10 bg-white/[0.06] px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.14em] text-white/55">
                                    Live
                                </div>
                            </div>
                            <div className="mt-1.5 grid grid-cols-2 gap-1">
                                <div className="rounded-[0.75rem] bg-black/20 px-2 py-1">
                                    <p className="text-[8px] font-black uppercase tracking-[0.16em] text-white/35">Total Budget</p>
                                    <p className="mt-0.5 truncate text-[9px] font-bold text-white/82">{isProfileAd && hasPromoCodeAdded ? "Rupieer 0" : (effectiveBudget !== null ? `Rupieer ${formatRuppier(effectiveBudget)}` : "—")}</p>
                                </div>
                                <div className="rounded-[0.75rem] bg-black/20 px-2 py-1">
                                    <p className="text-[8px] font-black uppercase tracking-[0.16em] text-white/35">Duration</p>
                                    <p className="mt-0.5 truncate text-[9px] font-bold text-white/82">{durationSummaryLabel}</p>
                                </div>
                                <div className="rounded-[0.75rem] bg-black/20 px-2 py-1">
                                    <p className="text-[8px] font-black uppercase tracking-[0.16em] text-white/35">Age</p>
                                    <p className="mt-0.5 truncate text-[9px] font-bold text-white/82">{ageSummaryLabel}</p>
                                </div>
                                <div className="rounded-[0.75rem] bg-black/20 px-2 py-1">
                                    <p className="text-[8px] font-black uppercase tracking-[0.16em] text-white/35">Gender</p>
                                    <p className="mt-0.5 truncate text-[9px] font-bold text-white/82">{genderTarget}</p>
                                </div>
                                {estimatedReachLabel && (
                                    <div className="col-span-2 rounded-[0.75rem] bg-black/20 px-2 py-1">
                                        <p className="text-[8px] font-black uppercase tracking-[0.16em] text-white/35">Estimated Reach</p>
                                        <p className="mt-0.5 truncate text-[10px] font-black text-white/90">{estimatedReachLabel} people</p>
                                    </div>
                                )}
                                {hasPromoCodeAdded && promoDiscount?.discount_type === "reach" && promoDiscount.promo_max_days != null && (
                                    <div className="col-span-2 rounded-[0.75rem] bg-emerald-500/10 px-2 py-1">
                                        <p className="text-[8px] font-black uppercase tracking-[0.16em] text-emerald-400/70">Promo ({promoCode})</p>
                                        <p className="mt-0.5 text-[9px] font-black text-emerald-400">Max Ad Duration: {promoDiscount.promo_max_days} {promoDiscount.promo_max_days === 1 ? "day" : "days"}</p>
                                    </div>
                                )}
                                {hasPromoCodeAdded && promoDiscount?.discount_type === "days" && (
                                    <div className="col-span-2 rounded-[0.75rem] bg-emerald-500/10 px-2 py-1">
                                        <p className="text-[8px] font-black uppercase tracking-[0.16em] text-emerald-400/70">Promo ({promoCode})</p>
                                        <p className="mt-0.5 text-[9px] font-black text-emerald-400">+{promoDiscount.discount_value} Free {promoDiscount.discount_value === 1 ? "Day" : "Days"}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </section>

                {pendingVideoCrop && (
                    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-black/78 backdrop-blur-md" />
                        <div className="relative z-[121] flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#0d0f14] shadow-[0_30px_90px_rgba(0,0,0,0.62)]">
                            <div className="flex items-start justify-between gap-4 border-b border-white/8 px-5 py-4">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-rose-300/80">Crop Video</p>
                                    <h2 className="mt-1 text-xl font-black text-white">Trim your ad to 1 minute</h2>
                                    <p className="mt-2 text-sm font-semibold text-white/55">
                                        Videos longer than 60 seconds must be trimmed before upload.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={closeVideoCropModal}
                                    disabled={isTrimmingVideo}
                                    className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06] text-white/70 transition hover:bg-white/[0.1] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                                    aria-label="Close crop video modal"
                                >
                                    <IonIcon name="close-outline" className="text-lg" />
                                </button>
                            </div>

                            <div className="grid gap-5 overflow-y-auto p-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
                                <div className="space-y-4">
                                    <div className="overflow-hidden rounded-[1.25rem] border border-white/10 bg-black">
                                        <video
                                            key={pendingVideoCrop.sourceUrl}
                                            src={pendingVideoCrop.sourceUrl}
                                            controls
                                            playsInline
                                            className="aspect-video w-full bg-black object-contain"
                                        />
                                    </div>
                                    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <p className="text-sm font-bold text-white">Selected 60-second clip</p>
                                            <span className="rounded-full bg-rose-500/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-rose-200">
                                                {formatVideoTime(Math.max(0, trimEndSeconds - trimStartSeconds))}
                                            </span>
                                        </div>

                                        <div className="mt-4 grid grid-cols-2 gap-3">
                                            <div className="rounded-xl bg-black/25 px-3 py-2">
                                                <p className="text-[9px] font-black uppercase tracking-[0.16em] text-white/35">Start</p>
                                                <p className="mt-1 text-sm font-black text-white">{formatVideoTime(trimStartSeconds)}</p>
                                            </div>
                                            <div className="rounded-xl bg-black/25 px-3 py-2 text-right">
                                                <p className="text-[9px] font-black uppercase tracking-[0.16em] text-white/35">End</p>
                                                <p className="mt-1 text-sm font-black text-white">{formatVideoTime(trimEndSeconds)}</p>
                                            </div>
                                        </div>

                                        <div
                                            ref={cropTimelineRef}
                                            role="slider"
                                            tabIndex={0}
                                            aria-label="Video trim timeline"
                                            aria-valuemin={0}
                                            aria-valuemax={Math.floor(getMaxTrimStart(pendingVideoCrop.duration))}
                                            aria-valuenow={Math.floor(trimStartSeconds)}
                                            onPointerDown={handleTrimTimelinePointerDown}
                                            onPointerMove={handleTrimTimelinePointerMove}
                                            onPointerUp={handleTrimTimelinePointerEnd}
                                            onPointerCancel={handleTrimTimelinePointerEnd}
                                            onKeyDown={(event) => {
                                                if (event.key === "ArrowLeft") {
                                                    event.preventDefault();
                                                    setTrimWindowStart(trimStartSeconds - 1, pendingVideoCrop.duration);
                                                }
                                                if (event.key === "ArrowRight") {
                                                    event.preventDefault();
                                                    setTrimWindowStart(trimStartSeconds + 1, pendingVideoCrop.duration);
                                                }
                                            }}
                                            className="relative mt-5 h-16 touch-none select-none overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(90deg,rgba(255,255,255,0.08)_0_1px,transparent_1px_10%),linear-gradient(135deg,#111827,#050608)] shadow-inner outline-none focus:border-rose-300/50"
                                        >
                                            <div className="absolute inset-y-3 left-0 right-0 flex items-center">
                                                <div className="h-6 w-full rounded-full bg-white/10" />
                                            </div>
                                            <div
                                                className="absolute inset-y-2 rounded-2xl border-2 border-white bg-rose-500/35 shadow-[0_12px_30px_rgba(244,63,94,0.35)]"
                                                style={{
                                                    left: `${(trimStartSeconds / pendingVideoCrop.duration) * 100}%`,
                                                    width: `${(Math.min(VIDEO_MAX_DURATION_SECONDS, pendingVideoCrop.duration) / pendingVideoCrop.duration) * 100}%`,
                                                }}
                                            >
                                                <div className="absolute left-1 top-1/2 h-8 w-1 -translate-y-1/2 rounded-full bg-white/90" />
                                                <div className="absolute right-1 top-1/2 h-8 w-1 -translate-y-1/2 rounded-full bg-white/90" />
                                                <div className="flex h-full items-center justify-center gap-1 text-[9px] font-black uppercase tracking-[0.14em] text-white drop-shadow">
                                                    <IonIcon name="reorder-two-outline" className="text-base" />
                                                    <span>Drag</span>
                                                </div>
                                            </div>
                                            <div className="pointer-events-none absolute bottom-1 left-3 text-[9px] font-black text-white/45">
                                                0:00
                                            </div>
                                            <div className="pointer-events-none absolute bottom-1 right-3 text-[9px] font-black text-white/45">
                                                {formatVideoTime(pendingVideoCrop.duration)}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                                        <p className="text-sm font-bold text-white">Trim controls</p>
                                        <div className="mt-4 rounded-xl border border-white/8 bg-black/20 p-3 text-sm font-semibold leading-6 text-white/60">
                                            Drag the highlighted window across the timeline to choose any 60-second section.
                                        </div>
                                        <div className="mt-4 rounded-xl border border-white/8 bg-black/20 p-3 text-sm font-semibold text-white/60">
                                            Original length: {formatVideoTime(pendingVideoCrop.duration)}
                                            <br />
                                            Maximum allowed clip: {formatVideoTime(VIDEO_MAX_DURATION_SECONDS)}
                                        </div>
                                        {trimError && (
                                            <p className="mt-3 rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-sm font-bold text-rose-200">
                                                {trimError}
                                            </p>
                                        )}
                                    </div>

                                    <div className="flex gap-3">
                                        <button
                                            type="button"
                                            onClick={closeVideoCropModal}
                                            disabled={isTrimmingVideo}
                                            className="flex-1 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-white/70 transition hover:bg-white/[0.09] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            onClick={confirmVideoCrop}
                                            disabled={isTrimmingVideo}
                                            className="flex-1 rounded-xl bg-rose-500 px-4 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-white shadow-[0_16px_34px_rgba(244,63,94,0.24)] transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {isTrimmingVideo ? "Processing..." : "Confirm Upload"}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
