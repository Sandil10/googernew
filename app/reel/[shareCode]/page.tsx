"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { InteractionButton } from "@/app/components/InteractionButton";
import IonIcon from "@/app/components/IonIcon";
import UploadContentMedia from "@/app/components/UploadContentMedia";
import UploadContentWatchModal from "@/app/components/UploadContentWatchModal";
import { getUploadContentShareCode } from "@/app/lib/shareLinks";
import { uploadContentService, type UploadContentRecord } from "@/services/uploadContentService";

const normalizeExternalUrl = (value?: string | null) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
};

export default function ReelSharePage() {
    const params = useParams();
    const shareCode = String(params?.shareCode || "").trim();
    const [item, setItem] = useState<UploadContentRecord | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [showPlayer, setShowPlayer] = useState(true);
    const [shareCopied, setShareCopied] = useState(false);

    useEffect(() => {
        let mounted = true;
        const loadReel = async () => {
            setLoading(true);
            setNotFound(false);
            try {
                const result = await uploadContentService.getPublicApproved();
                const match = (result.contents || []).find((content) => getUploadContentShareCode(content) === shareCode);
                if (!mounted) return;
                if (!match) {
                    setNotFound(true);
                    setItem(null);
                    return;
                }
                setItem(match);
                uploadContentService.logView(match.id)
                    .then((result) => {
                        if (!mounted) return;
                        setItem((current) => current ? {
                            ...current,
                            views_count: Number(result.views_count || current.views_count || current.viewCount || 0),
                            viewCount: Number(result.views_count || current.views_count || current.viewCount || 0),
                        } : current);
                    })
                    .catch(() => {});
            } catch {
                if (mounted) {
                    setNotFound(true);
                    setItem(null);
                }
            } finally {
                if (mounted) setLoading(false);
            }
        };

        void loadReel();
        return () => {
            mounted = false;
        };
    }, [shareCode]);

    const media = useMemo(() => {
        if (!item) return "";
        return item.media_preview || item.thumbnail_url || item.media_gallery?.[0] || "";
    }, [item]);

    const isVideo = String(item?.media_type || "").toLowerCase().includes("video");
    const isLink = String(item?.media_type || "").toLowerCase().includes("link");
    const watchSource = item?.external_link && (isVideo || isLink) ? normalizeExternalUrl(item.external_link) : media;
    const title = item?.description || item?.topic || "Reel";
    const creatorName = item?.username || item?.full_name || "Googer";
    const likesCount = Number(item?.likes_count ?? item?.likeCount ?? 0);
    const viewsCount = Number(item?.views_count ?? item?.viewCount ?? 0);
    const commentsCount = Number(item?.comments_count ?? item?.commentCount ?? 0);
    const repostsCount = Number(item?.reposts_count ?? item?.repostCount ?? 0);
    const iconSurface = "h-8 w-8 rounded-full border border-white/25 bg-zinc-700/35 shadow-[0_6px_18px_rgba(0,0,0,0.28)] backdrop-blur-md group-hover:bg-zinc-500/45";
    const countText = "drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]";

    const shareReel = async () => {
        const url = typeof window !== "undefined" ? window.location.href : "";
        if (navigator.clipboard?.writeText && url) {
            await navigator.clipboard.writeText(url).catch(() => {});
            setShareCopied(true);
            setTimeout(() => setShareCopied(false), 1600);
        }
        if (!item) return;
        try {
            const result = await uploadContentService.logShare(item.id);
            setItem((current) => current ? {
                ...current,
                shares_count: Number(result.shares_count || current.shares_count || current.shareCount || 0),
                shareCount: Number(result.shares_count || current.shares_count || current.shareCount || 0),
            } : current);
        } catch {}
    };

    const toggleLike = async () => {
        if (!item) return;
        const wasLiked = !!item.user_liked;
        const nextLiked = !wasLiked;
        setItem((current) => current ? {
            ...current,
            user_liked: nextLiked,
            likes_count: Math.max(0, Number(current.likes_count ?? current.likeCount ?? 0) + (nextLiked ? 1 : -1)),
            likeCount: Math.max(0, Number(current.likes_count ?? current.likeCount ?? 0) + (nextLiked ? 1 : -1)),
        } : current);
        try {
            const result = await uploadContentService.toggleLike(item.id);
            setItem((current) => current ? {
                ...current,
                user_liked: !!result.liked,
                likes_count: Number(result.likes_count || 0),
                likeCount: Number(result.likes_count || 0),
            } : current);
        } catch {
            setItem((current) => current ? {
                ...current,
                user_liked: wasLiked,
                likes_count: likesCount,
                likeCount: likesCount,
            } : current);
        }
    };

    const repostReel = async () => {
        if (!item) return;
        try {
            const result = await uploadContentService.repostContent(item.id);
            setItem((current) => current ? {
                ...current,
                reposts_count: Number(result.reposts_count || current.reposts_count || current.repostCount || 0),
                repostCount: Number(result.reposts_count || current.reposts_count || current.repostCount || 0),
            } : current);
        } catch {}
    };

    const logView = async () => {
        if (!item) return;
        try {
            const result = await uploadContentService.logView(item.id);
            setItem((current) => current ? {
                ...current,
                views_count: Number(result.views_count || current.views_count || current.viewCount || 0),
                viewCount: Number(result.views_count || current.views_count || current.viewCount || 0),
            } : current);
        } catch {}
    };

    const actionRail = item ? (
        <>
            <InteractionButton type="shares" icon="share-social-outline" activeIcon="share-social" count={shareCopied ? "Copied" : `${Number(item.affiliate_commission || 0)}%`} activeColor="text-white" color="text-white" onSingleClick={shareReel} onLongPress={shareReel} appearance="compact" orientation="vertical" iconSize="text-[17px]" countSize="text-[7px]" iconWrapperClassName={iconSurface} countClassName={countText} />
            <InteractionButton type="reposts" icon="repeat-outline" activeIcon="repeat" count={repostsCount} activeColor="text-white" color="text-white" onSingleClick={repostReel} onLongPress={repostReel} appearance="compact" orientation="vertical" iconSize="text-[17px]" countSize="text-[7px]" iconWrapperClassName={iconSurface} countClassName={countText} />
            <InteractionButton type="views" icon="eye-outline" activeIcon="eye" count={viewsCount} activeColor="text-white" color="text-white" onSingleClick={logView} onLongPress={logView} appearance="compact" orientation="vertical" iconSize="text-[17px]" countSize="text-[7px]" iconWrapperClassName={iconSurface} countClassName={countText} />
            <InteractionButton type="comments" icon="chatbubble-outline" activeIcon="chatbubble" count={commentsCount} activeColor="text-white" color="text-white" onSingleClick={() => {}} onLongPress={() => {}} appearance="compact" orientation="vertical" iconSize="text-[17px]" countSize="text-[7px]" iconWrapperClassName={iconSurface} countClassName={countText} />
            <InteractionButton type="likes" icon="heart-outline" activeIcon="heart" count={likesCount} activeColor="text-white" color="text-white" isActive={!!item.user_liked} onSingleClick={toggleLike} onLongPress={toggleLike} appearance="compact" orientation="vertical" iconSize="text-[17px]" countSize="text-[7px]" iconWrapperClassName={iconSurface} countClassName={countText} />
        </>
    ) : null;

    if (loading) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-black px-4 text-white">
                <div className="flex items-center gap-3 text-sm font-black uppercase tracking-[0.18em] text-white/55">
                    <IonIcon name="reload-outline" className="animate-spin text-xl" />
                    Loading reel
                </div>
            </main>
        );
    }

    if (notFound || !item) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-black px-4 text-white">
                <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-center">
                    <IonIcon name="alert-circle-outline" className="mx-auto text-4xl text-white/45" />
                    <h1 className="mt-4 text-lg font-black">Reel not found</h1>
                    <p className="mt-2 text-sm font-semibold text-white/50">This reel link may be expired or unavailable.</p>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-black px-3 py-4 text-white sm:px-6">
            <section className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-[860px] flex-col justify-center gap-3">
                <div className="flex items-center justify-between gap-3 px-1">
                    <div className="min-w-0">
                        <p className="truncate text-sm font-black">{creatorName}</p>
                        <p className="mt-0.5 truncate text-[11px] font-bold text-white/45">{item.topic || "Reel"}</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => navigator.clipboard?.writeText(window.location.href).catch(() => {})}
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/15"
                        aria-label="Copy reel link"
                    >
                        <IonIcon name="link-outline" className="text-xl" />
                    </button>
                </div>

                {(isVideo || isLink) && watchSource ? (
                    <UploadContentWatchModal
                        inline
                        open={showPlayer}
                        source={watchSource}
                        poster={item.thumbnail_url}
                        title={title}
                        autoPlay
                        onClose={() => setShowPlayer(false)}
                        actionRail={actionRail}
                    />
                ) : (
                    <div className="relative aspect-square w-full overflow-hidden rounded-[1.35rem] bg-black shadow-[0_30px_90px_rgba(0,0,0,0.72)]">
                        <UploadContentMedia
                            mediaType={item.media_type}
                            mediaPreview={media}
                            mediaGallery={item.media_gallery}
                            thumbnailUrl={item.thumbnail_url}
                            previewMode={item.preview_mode}
                            previewUrl={item.preview_url}
                            alt={title}
                        />
                        <div className="absolute bottom-16 right-3 z-30 flex w-10 flex-col items-center justify-end gap-2.5 text-white">
                            {actionRail}
                        </div>
                    </div>
                )}
            </section>
        </main>
    );
}
