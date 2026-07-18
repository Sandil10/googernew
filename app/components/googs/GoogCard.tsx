"use client";

import Image from "next/image";
import { memo, useEffect, useRef } from "react";
import IonIcon from "@/app/components/IonIcon";
import { RelativeTime } from "@/app/components/RelativeTime";
import SubscribeButton from "@/app/components/SubscribeButton";
import { UserVerifiedBadge, BadgeSvg } from "@/app/components/VerifiedBadge";
import { getUserDisplayName } from "@/app/lib/userDisplay";

export type WritePost = {
    id: number;
    text: string;
    textColor?: string;
    createdAt?: string;
    user: {
        id?: number | string | null;
        username?: string;
        name: string;
        img: string;
        badge_color?: string | null;
        badge_tick_color?: string | null;
    };
    likes: number;
    likes_count?: number;
    comments: number;
    views: number;
    views_count?: number;
    reposts: number;
    shares: number;
    liked: boolean;
    user_liked?: boolean;
    homeExpansionStage?: string;
    home_expansion_stage?: string;
    homeCanExpand?: boolean;
    home_can_expand?: boolean;
    topic?: string;
    category?: string;
};

type GoogLinkPreview = {
    href: string;
    host: string;
    pathLabel: string;
    favicon: string;
    isVideo: boolean;
    videoThumbnail: string | null;
    videoLabel: string | null;
};

const GOOGLE_RICH_TEXT_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+|@[A-Za-z0-9_]+|#[A-Za-z0-9_]+)/g;

function getGoogLinkPreview(text?: string): GoogLinkPreview | null {
    if (!text) return null;
    const match = text.match(/(https?:\/\/[^\s]+|www\.[^\s]+)/i);
    const raw = match?.[0];
    if (!raw) return null;
    const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
        const parsed = new URL(normalized);
        const host = parsed.hostname.replace(/^www\./i, "");
        const pathLabel = parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : "";

        let videoThumbnail: string | null = null;
        let videoLabel: string | null = null;

        if (host === "youtu.be") {
            const id = parsed.pathname.split("/").filter(Boolean)[0];
            if (id) {
                videoThumbnail = `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
                videoLabel = "YouTube";
            }
        } else if (host.endsWith("youtube.com")) {
            const id = parsed.searchParams.get("v")
                || (parsed.pathname.startsWith("/embed/") ? parsed.pathname.split("/")[2] : null)
                || (parsed.pathname.startsWith("/shorts/") ? parsed.pathname.split("/")[2] : null);
            if (id) {
                videoThumbnail = `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
                videoLabel = "YouTube";
            }
        } else if (host.endsWith("vimeo.com")) {
            videoLabel = "Vimeo";
        } else if (host.endsWith("tiktok.com")) {
            videoLabel = "TikTok";
        } else if (/\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i.test(parsed.pathname)) {
            videoLabel = "Video";
        }

        return {
            href: normalized,
            host,
            pathLabel,
            favicon: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`,
            isVideo: !!videoLabel,
            videoThumbnail,
            videoLabel,
        };
    } catch {
        return null;
    }
}

function GoogLinkPreviewCard({ preview }: { preview: GoogLinkPreview }) {
    return (
        <a
            href={preview.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="mt-3 flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 transition hover:bg-white/[0.07]"
        >
            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/[0.05]">
                {preview.isVideo && preview.videoThumbnail ? (
                    <>
                        <Image src={preview.videoThumbnail} alt={preview.host} fill className="object-cover" unoptimized />
                        <span className="absolute inset-0 flex items-center justify-center bg-black/35">
                            <IonIcon name="play" className="text-[12px] text-white" />
                        </span>
                    </>
                ) : preview.isVideo ? (
                    <IonIcon name="videocam" className="text-[16px] text-white/70" />
                ) : (
                    <Image src={preview.favicon} alt={preview.host} width={28} height={28} className="h-7 w-7 object-contain" unoptimized />
                )}
            </div>
            <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-black uppercase tracking-[0.12em] text-white/85">
                    {preview.host}
                    {preview.videoLabel ? (
                        <span className="ml-1.5 rounded-full bg-white/10 px-1.5 py-[1px] text-[8px] font-black tracking-[0.14em] text-white/70">
                            {preview.videoLabel}
                        </span>
                    ) : null}
                </p>
                <p className="truncate text-[10px] font-semibold text-white/45">{preview.pathLabel || preview.href}</p>
            </div>
            <IonIcon name="open-outline" className="text-base text-white/40" />
        </a>
    );
}

function renderGoogText(text: string) {
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;

    const regex = new RegExp(GOOGLE_RICH_TEXT_REGEX);
    let match;
    while ((match = regex.exec(text)) !== null) {
        const offset = match.index;
        if (offset > lastIndex) {
            parts.push(text.slice(lastIndex, offset));
        }

        const m = match[0];
        if (/^(https?:\/\/|www\.)/i.test(m)) {
            const href = /^https?:\/\//i.test(m) ? m : `https://${m}`;
            parts.push(
                <a
                    key={`${m}-${offset}`}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 underline decoration-blue-400/50 underline-offset-2 hover:text-blue-300"
                >
                    {m}
                </a>,
            );
        } else if (m.startsWith("@") || m.startsWith("#")) {
            parts.push(
                <span key={`${m}-${offset}`} className="text-red-400">
                    {m}
                </span>,
            );
        }
        lastIndex = offset + m.length;
    }

    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
    }

    return parts;
}

const InteractionButton = ({
    icon,
    activeIcon,
    count,
    color,
    activeColor,
    isActive,
    onSingleClick,
    onLongPress,
    type,
    iconSize = "text-[13px] md:text-xl",
}: any) => {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const didLongPressRef = useRef(false);
    const lastClickAtRef = useRef(0);

    const handlePointerDown = () => {
        didLongPressRef.current = false;
        if (!onLongPress) return;
        timerRef.current = setTimeout(() => {
            didLongPressRef.current = true;
            onLongPress();
        }, 500);
    };

    const cancelTimer = () => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    };

    const handleClick = (event: React.MouseEvent) => {
        event.stopPropagation();
        cancelTimer();
        const now = Date.now();
        if (now - lastClickAtRef.current < 250) return;
        lastClickAtRef.current = now;
        if (!didLongPressRef.current) {
            onSingleClick?.();
        }
    };

    const isLikeButton = type === "likes";
    const currentIcon = isLikeButton
        ? (isActive ? activeIcon || "heart" : "heart-outline")
        : (isActive && activeIcon ? activeIcon : icon);
    const hasCount = typeof count === "number" ? count > 0 : !!count;
    const currentColorClass = isLikeButton
        ? (isActive ? "text-red-500" : "text-white")
        : (isActive ? activeColor || color || "text-white" : color || "text-white");
    const iconColorStyle = isLikeButton ? { color: isActive ? "#ef4444" : "var(--theme-icon)" } : undefined;
    const iconRenderKey = isLikeButton ? `likes-${isActive ? "liked" : "unliked"}` : currentIcon;

    return (
        <button
            type="button"
            data-interaction-type={type}
            onPointerDown={handlePointerDown}
            onPointerUp={cancelTimer}
            onPointerLeave={cancelTimer}
            onClick={handleClick}
            onContextMenu={(event) => event.preventDefault()}
            className={`${currentColorClass} flex touch-none select-none items-center gap-1 transition-all duration-300 active:scale-75 focus:outline-none focus:ring-0`}
            aria-pressed={isLikeButton ? !!isActive : undefined}
        >
            <IonIcon key={iconRenderKey} name={currentIcon} className={`${iconSize} ${currentColorClass} shrink-0`} style={iconColorStyle} />
            {hasCount && <span className="shrink-0 text-[7px] font-black tracking-tighter md:text-[9px]">{count}</span>}
        </button>
    );
};

interface GoogCardProps {
    post: WritePost;
    onNavigateToProfile?: (event: React.MouseEvent, post: WritePost) => void;
    onToggleLike?: (postId: number) => void;
    onOpenSheet?: (type: "likes" | "comments" | "shares" | "views", post: WritePost) => void;
    onViewPost?: (postId: number) => void;
    onSharePost?: (postId: number) => void;
    onToggleMenu?: (event: React.MouseEvent<HTMLButtonElement>, post: WritePost) => void;
    onToggleSave?: (postId: number) => void;
    isSaved?: boolean;
    saveAtLimit?: boolean;
    showSubscribe?: boolean;
}

export const GoogCard = memo(function GoogCard({
    post,
    onNavigateToProfile,
    onToggleLike,
    onOpenSheet,
    onViewPost,
    onSharePost,
    onToggleMenu,
    onToggleSave,
    isSaved = false,
    saveAtLimit = false,
    showSubscribe = true,
}: GoogCardProps) {
    const preview = getGoogLinkPreview(post.text);
    const articleRef = useRef<HTMLElement>(null);
    const viewedRef = useRef(false);
    const reachStage = String(post.homeExpansionStage || post.home_expansion_stage || "").trim();
    const showSuggestedLabel = Boolean(post.homeCanExpand ?? post.home_can_expand ?? reachStage);
    const suggestedTopic = String(post.topic || post.category || reachStage || "Suggested").trim();
    const authorDisplayName = getUserDisplayName(post.user, post.user.name || "User");

    useEffect(() => {
        viewedRef.current = false;
    }, [post.id]);

    useEffect(() => {
        const el = articleRef.current;
        if (!el || !onViewPost) return;
        if (typeof IntersectionObserver === "undefined") {
            if (!viewedRef.current) {
                viewedRef.current = true;
                onViewPost(post.id);
            }
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry.isIntersecting || viewedRef.current) return;
                viewedRef.current = true;
                onViewPost(post.id);
                observer.disconnect();
            },
            { threshold: 0.5 },
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [onViewPost, post.id]);


    return (
        <article ref={articleRef} className="max-w-full overflow-hidden border-b border-white/10 px-2 py-4 transition-colors last:border-b-0 hover:bg-white/[0.025] sm:px-7 sm:py-5">
            <header className="flex min-w-0 max-w-full items-start justify-between gap-2 sm:gap-4">
                <div className="flex min-w-0 gap-3">
                    <button
                        type="button"
                        onClick={(event) => onNavigateToProfile?.(event, post)}
                        className="relative h-5 w-5 shrink-0 overflow-hidden rounded-full bg-white/10 transition hover:ring-2 hover:ring-white/20 md:h-8 md:w-8"
                        aria-label="Open profile"
                    >
                        <Image src={post.user.img} alt={authorDisplayName} fill className="object-cover" unoptimized />
                    </button>
                    <div className="min-w-0 max-w-full">
                        <div className="flex min-w-0 items-center gap-2">
                            <button
                                type="button"
                                onClick={(event) => onNavigateToProfile?.(event, post)}
                                className="truncate text-left text-[13px] font-black text-white transition hover:text-blue-400"
                            >
                                {authorDisplayName}
                            </button>
                            {post.user.badge_color && <BadgeSvg color={post.user.badge_color} tickColor={post.user.badge_tick_color} size={12} />}
                            {!post.user.badge_color && post.user.id && <UserVerifiedBadge userId={post.user.id} size={12} />}
                            <span className="text-xs text-white/35">
                                <RelativeTime timestamp={post.createdAt || (post as any).created_at} />
                            </span>
                        </div>
                        {showSuggestedLabel && (
                            <div className="mt-0.5 inline-flex max-w-full items-center gap-1 text-[7px] font-black uppercase tracking-[0.12em] text-yellow-300/80">
                                <IonIcon name="trending-up-outline" className="text-[8px]" />
                                <span className="truncate">Suggested · {suggestedTopic}</span>
                            </div>
                        )}
                        <div
                            className="mt-1.5 whitespace-pre-wrap break-words text-[14px] leading-6"
                            style={{ color: post.textColor || "var(--theme-text)" }}
                        >
                            {renderGoogText(post.text)}
                        </div>
                        {preview && <GoogLinkPreviewCard preview={preview} />}
                        <div className="mt-4 flex max-w-full flex-wrap items-center gap-4 text-white/80 sm:gap-5">
                            <InteractionButton
                                type="likes"
                                icon="heart-outline"
                                activeIcon="heart"
                                isActive={post.liked}
                                count={post.likes}
                                color="text-white"
                                activeColor="text-white"
                                onSingleClick={() => onToggleLike?.(post.id)}
                                onLongPress={() => onOpenSheet?.("likes", post)}
                                iconSize="text-[21px]"
                            />
                            <InteractionButton
                                type="views"
                                icon="eye-outline"
                                activeIcon="eye"
                                count={Number(post.views ?? post.views_count ?? 0)}
                                color="text-white"
                                activeColor="text-white"
                                onSingleClick={() => onOpenSheet?.("views", post)}
                                onLongPress={() => onOpenSheet?.("views", post)}
                                iconSize="text-[21px]"
                            />
                            <InteractionButton
                                type="comments"
                                icon="chatbubble-outline"
                                activeIcon="chatbubble"
                                count={post.comments}
                                color="text-white"
                                activeColor="text-white"
                                onSingleClick={() => onOpenSheet?.("comments", post)}
                                onLongPress={() => onOpenSheet?.("comments", post)}
                                iconSize="text-[21px]"
                            />
                            <InteractionButton
                                type="shares"
                                icon="share-social-outline"
                                activeIcon="share-social"
                                count={post.shares}
                                color="text-white"
                                activeColor="text-white"
                                onSingleClick={() => onSharePost?.(post.id)}
                                onLongPress={() => onOpenSheet?.("shares", post)}
                                iconSize="text-[21px]"
                            />
                            {onToggleSave && (
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); if (!saveAtLimit || isSaved) onToggleSave(post.id); }}
                                    className={`flex touch-none select-none items-center gap-1 transition-all duration-300 active:scale-75 focus:outline-none ${isSaved ? "text-amber-400" : saveAtLimit ? "text-white/20 cursor-not-allowed" : "text-white/50 hover:text-white"}`}
                                    aria-label={isSaved ? "Unsave" : saveAtLimit ? "Save limit reached" : "Save"}
                                    title={isSaved ? "Unsave" : saveAtLimit ? "Goog save limit reached — upgrade your plan" : "Save"}
                                >
                                    <IonIcon name={isSaved ? "bookmark" : "bookmark-outline"} className="text-[21px]" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    {showSubscribe && (
                        <SubscribeButton googId={post.id} authorId={post.user.id as any} authorName={authorDisplayName} />
                    )}
                    <button
                        type="button"
                        onClick={(event) => onToggleMenu?.(event, post)}
                        className="light-theme-option-button light-theme-option-dots flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-white transition-all hover:bg-white/10 active:scale-75"
                        aria-label="Open post options"
                    >
                        <div className="flex flex-col gap-0.5">
                            <div data-dot className="h-1 w-1 rounded-full" style={{ backgroundColor: "var(--theme-dot)" }} />
                            <div data-dot className="h-1 w-1 rounded-full" style={{ backgroundColor: "var(--theme-dot)" }} />
                        </div>
                    </button>
                </div>
            </header>
        </article>
    );
});

GoogCard.displayName = "GoogCard";
