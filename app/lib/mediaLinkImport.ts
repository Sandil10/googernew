import { API_URL } from "@/services/apiConfig";

// Media links from any site — shops, social apps, image search, share links.
// The backend (/api/media-links/import-image-link) finds the real picture
// behind the link and stores a copy on Googer, so the preview and the saved
// listing/ad use that copy (no page screenshots, no hotlink blocks). Video
// page links come back with `video: true` and their thumbnail, and play
// through the platform's own embed player. The mobile app uses the same
// endpoint and embed rules.

const authHeaders = (): Record<string, string> => {
    const token = typeof window !== "undefined"
        ? (sessionStorage.getItem("token") || localStorage.getItem("token"))
        : null;
    return {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
};

export type ImportedLinkMedia = { url: string; video: boolean };

/** Picture (or video thumbnail) behind any link, stored on Googer. */
export async function importLinkMedia(link: string): Promise<ImportedLinkMedia> {
    const response = await fetch(`${API_URL}/media-links/import-image-link`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ url: link.trim() }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.url) {
        throw new Error(data?.message || "Could not get a picture from that link");
    }
    return { url: String(data.url), video: Boolean(data.video) };
}

/** Share links (vt.tiktok.com, fb.watch, youtu.be…) → full canonical URL. */
export async function resolveShareLink(link: string): Promise<{ canonicalUrl: string; videoId: string; thumbnail: string } | null> {
    try {
        const response = await fetch(`${API_URL}/ads/resolve-link?url=${encodeURIComponent(link.trim())}`, {
            headers: authHeaders(),
        });
        if (!response.ok) return null;
        const data = await response.json();
        return {
            canonicalUrl: String(data?.canonicalUrl || ""),
            videoId: String(data?.videoId || ""),
            thumbnail: String(data?.thumbnail || ""),
        };
    } catch {
        return null;
    }
}

const normalize = (value: string) => {
    const v = value.trim();
    return /^https?:\/\//i.test(v) ? v : `https://${v}`;
};

/**
 * Embeddable player URL for a video page link (same rules as the mobile
 * app): YouTube, TikTok, Instagram post/reel, public Facebook video/reel,
 * Vimeo, Dailymotion. Empty when the link has no player.
 */
export function videoEmbedFor(link: string): string {
    let url: URL;
    try {
        url = new URL(normalize(link));
    } catch {
        return "";
    }
    const host = url.hostname.toLowerCase().replace(/^(www|m)\./, "");
    const parts = url.pathname.split("/").filter(Boolean);

    if (host === "youtu.be" || host.endsWith("youtube.com")) {
        const id = host === "youtu.be"
            ? parts[0]
            : (url.searchParams.get("v") || (["shorts", "embed", "live"].includes(parts[0]) ? parts[1] : ""));
        return id ? `https://www.youtube.com/embed/${id}` : "";
    }
    if (host.endsWith("tiktok.com")) {
        const i = parts.indexOf("video");
        return i >= 0 && parts[i + 1] ? `https://www.tiktok.com/embed/v2/${parts[i + 1]}` : "";
    }
    if (host.endsWith("instagram.com")) {
        const kind = parts[0] === "reels" ? "reel" : parts[0];
        return ["p", "reel", "tv"].includes(kind) && parts[1]
            ? `https://www.instagram.com/${kind}/${parts[1]}/embed`
            : "";
    }
    if (host.endsWith("facebook.com") || host === "fb.watch") {
        return /\/videos\/|\/watch|[?&]v=|fb\.watch|\/reel\//i.test(url.toString())
            ? `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url.toString())}&show_text=false&width=560`
            : "";
    }
    if (host.endsWith("vimeo.com")) {
        const id = [...parts].reverse().find((p) => /^\d+$/.test(p));
        return id ? `https://player.vimeo.com/video/${id}` : "";
    }
    if (host.endsWith("dailymotion.com") || host === "dai.ly") {
        const id = host === "dai.ly" ? parts[0] : (parts[0] === "video" ? (parts[1] || "").split("_")[0] : "");
        return id ? `https://www.dailymotion.com/embed/video/${id}` : "";
    }
    return "";
}

/** Embed URL, following a share link's redirect first when needed. */
export async function videoEmbedForAsync(link: string): Promise<string> {
    const direct = videoEmbedFor(link);
    if (direct) return direct;
    const resolved = await resolveShareLink(link);
    if (!resolved) return "";
    if (resolved.videoId && /tiktok/i.test(resolved.canonicalUrl || link)) {
        return `https://www.tiktok.com/embed/v2/${resolved.videoId}`;
    }
    return resolved.canonicalUrl ? videoEmbedFor(resolved.canonicalUrl) : "";
}

/** True when the URL is already a platform embed player. */
export function isEmbedPlayerUrl(value: string): boolean {
    return /youtube\.com\/embed\/|player\.vimeo\.com|tiktok\.com\/embed|instagram\.com\/(p|reel|tv)\/[^/]+\/embed|facebook\.com\/plugins\/|dailymotion\.com\/embed/i.test(value);
}
