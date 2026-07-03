import type { Metadata } from "next";
import { headers } from "next/headers";
import PublicProfileUsernameClient from "./PublicProfileUsernameClient";

type ProfileUser = {
    username?: string;
    full_name?: string;
    bio?: string;
    profile_picture?: string;
};

const APP_FALLBACK_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "");

function getRequestOrigin(headerStore: Headers) {
    const forwardedProto = headerStore.get("x-forwarded-proto");
    const forwardedHost = headerStore.get("x-forwarded-host");
    const host = forwardedHost || headerStore.get("host");

    if (host) {
        return `${forwardedProto || "https"}://${host}`.replace(/\/+$/, "");
    }

    return APP_FALLBACK_ORIGIN;
}

function getAbsoluteProfileImage(profilePicture: string | undefined, origin: string) {
    const raw = String(profilePicture || "").trim();
    if (!raw || raw.startsWith("data:")) return "";
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith("/uploads/")) return `${origin}${raw}`;
    const fileName = raw.split(/[\\/]/).pop();
    return fileName ? `${origin}/uploads/${fileName}` : "";
}

async function loadProfileUser(username: string, origin: string): Promise<ProfileUser | null> {
    if (!username || !origin) return null;

    try {
        const response = await fetch(`${origin}/api/auth/username/${encodeURIComponent(username)}`, {
            cache: "no-store",
        });
        const result = await response.json().catch(() => null);
        if (!response.ok) return null;
        return result?.user || result?.data || null;
    } catch {
        return null;
    }
}

function getCanonicalProfileUrl(origin: string, username: string) {
    const normalizedOrigin = origin.replace(/\/+$/, "");
    const cleanUsername = String(username || "").trim();
    if (!cleanUsername) return normalizedOrigin || "/";
    return normalizedOrigin ? `${normalizedOrigin}/${encodeURIComponent(cleanUsername)}` : `/${encodeURIComponent(cleanUsername)}`;
}

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
    const { username } = await params;
    const headerStore = await headers();
    const origin = getRequestOrigin(headerStore);
    const decodedUsername = decodeURIComponent(String(username || "").trim());
    const user = await loadProfileUser(decodedUsername, origin);
    const canonicalUrl = getCanonicalProfileUrl(origin, user?.username || decodedUsername);
    const title = user?.full_name || user?.username || decodedUsername || "Googer Profile";
    const description = String(user?.bio || `View ${title}'s Googer profile.`).trim().slice(0, 180);
    const profileImage = getAbsoluteProfileImage(user?.profile_picture, origin);
    const images = profileImage ? [{ url: profileImage, alt: title }] : undefined;

    return {
        title: `${title} | Googer`,
        description,
        alternates: {
            canonical: canonicalUrl,
        },
        openGraph: {
            title: `${title} | Googer`,
            description,
            url: canonicalUrl,
            type: "profile",
            images,
        },
        twitter: {
            card: profileImage ? "summary_large_image" : "summary",
            title: `${title} | Googer`,
            description,
            images: profileImage ? [profileImage] : undefined,
        },
    };
}

export default async function PublicProfileUsernamePage({ params }: { params: Promise<{ username: string }> }) {
    const { username } = await params;
    return <PublicProfileUsernameClient username={String(username || "").trim()} />;
}
