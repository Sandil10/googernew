// Shared helpers for sponsored ad rendering.
// These are pure functions used by both the home feed and the shop page
// so the two pages share exactly the same preview logic.

export const safeParse = (data: any) => {
    if (!data) return null;
    if (typeof data !== "string") return data;
    try {
        return JSON.parse(data);
    } catch {
        return data;
    }
};

export const normalizeExternalUrl = (value: string) => {
    if (!value?.trim()) return "";
    return /^https?:\/\//i.test(value) ? value : `https://${value}`;
};

const getNormalizedUrl = (value: string) => {
    const normalized = normalizeExternalUrl(value);
    if (!normalized) return null;

    try {
        return new URL(normalized);
    } catch {
        return null;
    }
};

const getGoogleImageSourceUrl = (value: string) => {
    const url = getNormalizedUrl(value);
    if (!url) return "";

    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    if (!host.includes("google.") || url.pathname !== "/imgres") return "";

    const imageUrl = url.searchParams.get("imgurl");
    return imageUrl ? decodeURIComponent(imageUrl) : "";
};

const getYouTubeThumbnailUrl = (value: string) => {
    try {
        const url = new URL(normalizeExternalUrl(value));
        const host = url.hostname.replace(/^www\./i, "").toLowerCase();

        let videoId = "";
        if (host === "youtu.be") {
            videoId = url.pathname.split("/").filter(Boolean)[0] || "";
        } else if (host.includes("youtube.com")) {
            if (url.pathname.startsWith("/shorts/") || url.pathname.startsWith("/embed/")) {
                videoId = url.pathname.split("/").filter(Boolean)[1] || "";
            } else {
                videoId = url.searchParams.get("v") || "";
            }
        }

        return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : "";
    } catch {
        return "";
    }
};

const getMicrolinkScreenshotUrl = (value: string) => {
    const normalized = normalizeExternalUrl(value);
    if (!normalized) return "";
    return `https://api.microlink.io?url=${encodeURIComponent(normalized)}&screenshot=true&meta=false&embed=screenshot.url`;
};

export const getSponsoredLinkPreviewImage = (value: string) => {
    const normalized = normalizeExternalUrl(value);
    if (!normalized) return "";

    const imagePattern = /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i;
    const googleImageSource = getGoogleImageSourceUrl(normalized);
    if (googleImageSource) return googleImageSource;
    if (imagePattern.test(normalized)) return normalized;

    const youtubeThumbnail = getYouTubeThumbnailUrl(normalized);
    if (youtubeThumbnail) return youtubeThumbnail;

    return getMicrolinkScreenshotUrl(normalized);
};

export const getYouTubeEmbedUrl = (value: string) => {
    try {
        const url = new URL(normalizeExternalUrl(value));
        const host = url.hostname.replace(/^www\./i, "").toLowerCase();

        if (host === "youtu.be") {
            const id = url.pathname.split("/").filter(Boolean)[0];
            return id ? `https://www.youtube.com/embed/${id}` : null;
        }

        if (host.includes("youtube.com")) {
            const id = url.searchParams.get("v");
            if (id) return `https://www.youtube.com/embed/${id}`;
            const parts = url.pathname.split("/").filter(Boolean);
            const embedIndex = parts.findIndex((part) => part === "embed");
            if (embedIndex >= 0 && parts[embedIndex + 1]) {
                return `https://www.youtube.com/embed/${parts[embedIndex + 1]}`;
            }
        }
    } catch {
        return null;
    }

    return null;
};

export const getSponsoredSocialEmbedUrl = (value: string) => {
    const normalized = normalizeExternalUrl(value);
    if (!normalized) return null;

    const youtube = getYouTubeEmbedUrl(normalized);
    if (youtube) return youtube;

    try {
        const url = new URL(normalized);
        const host = url.hostname.replace(/^www\./i, "").toLowerCase();
        const parts = url.pathname.split("/").filter(Boolean);

        if (host.includes("instagram.com")) {
            const type = parts[0];
            const shortcode = parts[1];
            if (["p", "reel", "tv"].includes(type) && shortcode) {
                return `https://www.instagram.com/${type}/${shortcode}/embed`;
            }
        }

        if (host.includes("tiktok.com")) {
            const videoIndex = parts.findIndex((part) => part === "video");
            const videoId = videoIndex >= 0 ? parts[videoIndex + 1] : null;
            return videoId ? `https://www.tiktok.com/embed/v2/${videoId}` : null;
        }

        if (host.includes("facebook.com") || host.includes("fb.watch")) {
            const isVideoUrl = /\/videos\/|\/watch\/|\?v=|fb\.watch/i.test(normalized);
            const plugin = isVideoUrl ? "video.php" : "post.php";
            return `https://www.facebook.com/plugins/${plugin}?href=${encodeURIComponent(normalized)}&show_text=false&width=560`;
        }
    } catch {
        return null;
    }

    return null;
};

export const getSponsoredLinkPreviewType = (value: string) => {
    const normalized = normalizeExternalUrl(value);
    if (!normalized) return null;

    const imagePattern = /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i;
    const videoPattern = /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i;

    if (getGoogleImageSourceUrl(normalized)) return "image";
    if (imagePattern.test(normalized)) return "image";
    if (videoPattern.test(normalized)) return "video";
    if (getSponsoredSocialEmbedUrl(normalized)) return "embed";
    return "website";
};

export const getSponsoredCtaHref = (ctaTopic?: string, ctaValue?: string) => {
    const trimmedValue = String(ctaValue || "").trim();
    if (!trimmedValue || ctaTopic === "No Button" || ctaTopic === "Message") return "";
    if (ctaTopic === "Call Now") return `tel:${trimmedValue.replace(/[^\d+]/g, "")}`;
    if (ctaTopic === "WhatsApp") {
        if (/^https?:\/\//i.test(trimmedValue)) return trimmedValue;
        const digits = trimmedValue.replace(/[^\d]/g, "");
        return digits ? `https://wa.me/${digits}` : "";
    }
    if (trimmedValue.includes("@") && !/^https?:\/\//i.test(trimmedValue) && ctaTopic === "Contact Us") {
        return `mailto:${trimmedValue}`;
    }
    return normalizeExternalUrl(trimmedValue);
};

export const getSponsoredCallHref = (ad: any) => {
    const directValues = [
        ad?.cta_topic === "Call Now" ? ad?.cta_value : "",
        ad?.phone_number,
        ad?.contact_phone,
        ad?.phone,
    ]
        .map((value) => String(value || "").trim())
        .filter(Boolean);

    for (const value of directValues) {
        if (/^tel:/i.test(value)) return value;
        const digits = value.replace(/[^\d+]/g, "");
        if (digits.replace(/\D/g, "").length >= 7) {
            return `tel:${digits}`;
        }
    }

    return "";
};

export const getSponsoredCtaClassName = (ctaTopic?: string, enabled = true) => {
    if (!enabled) return "cursor-not-allowed bg-white/10 text-white/35";

    switch (String(ctaTopic || "").trim()) {
        case "WhatsApp":
            return "cursor-pointer bg-green-300 text-black hover:bg-green-200 active:scale-95";
        case "Call Now":
        case "Message":
        case "Visit":
            return "cursor-pointer bg-red-400 text-white hover:bg-red-300 active:scale-95";
        default:
            return "cursor-pointer bg-red-300 text-white hover:bg-red-200 active:scale-95";
    }
};

const normalizeUploadPath = (src: string) => {
    if (!src) return "";
    if (src.startsWith("/uploads/") || /^https?:\/\//i.test(src) || src.startsWith("data:")) return src;
    return src.includes("uploads") || src.includes("\\")
        ? `/uploads/${src.split(/[\\/]/).pop()}`
        : src;
};

const extractMediaValue = (item: any) => {
    if (!item) return "";
    if (typeof item === "string") return item;
    return item.url || item.image_url || item.image || item.src || "";
};

const getAdMediaGallery = (ad: any) => {
    const gallerySources = [
        ad?.mediaGallery,
        ad?.media_gallery,
        safeParse(ad?.mediaGallery),
        safeParse(ad?.media_gallery),
        ad?.raw?.mediaGallery,
        ad?.raw?.media_gallery,
        safeParse(ad?.raw?.mediaGallery),
        safeParse(ad?.raw?.media_gallery),
    ];

    for (const source of gallerySources) {
        if (Array.isArray(source)) return source;
    }

    return [];
};

export const getAdPreviewImage = (ad: any, previewType: string | null) => {
    const activeLink = normalizeExternalUrl(ad?.active_link || "");
    const linkPreviewImage = getSponsoredLinkPreviewImage(activeLink);
    if (previewType === "image" && linkPreviewImage) return linkPreviewImage;

    const gallery = getAdMediaGallery(ad);

    const value = [
        ad?.mediaPreview,
        ad?.raw?.mediaPreview,
        ad?.image_url,
        ad?.main_image,
        ad?.thumbnail_url,
        ad?.media_preview,
        ad?.raw?.image_url,
        ad?.raw?.main_image,
        ad?.raw?.thumbnail_url,
        ad?.raw?.media_preview,
        ad?.media_url,
        ad?.video_url,
        linkPreviewImage,
        ...gallery.map(extractMediaValue),
    ].find((item) => String(item || "").trim());
    const image = String(value || "https://picsum.photos/400/400").trim();
    return normalizeUploadPath(image);
};

export const getSponsoredAdImages = (ad: any, fallbackImage?: string): string[] => {
    const gallery = getAdMediaGallery(ad);

    const activeLink = normalizeExternalUrl(ad?.active_link || "");
    const linkImage = getSponsoredLinkPreviewImage(activeLink);

    return Array.from(
        new Set(
            [
                fallbackImage,
                ad?.mediaPreview,
                ad?.raw?.mediaPreview,
                ad?.image_url,
                ad?.main_image,
                ad?.thumbnail_url,
                ad?.media_preview,
                ad?.media_url,
                ad?.raw?.image_url,
                ad?.raw?.main_image,
                ad?.raw?.thumbnail_url,
                ad?.raw?.media_preview,
                ad?.raw?.media_url,
                linkImage,
                ...gallery.map(extractMediaValue),
            ]
                .map((item) => normalizeUploadPath(String(item || "").trim()))
                .filter(Boolean) as string[],
        ),
    );
};
