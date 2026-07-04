"use client";

import { useEffect, useRef, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import IonIcon from "@/app/components/IonIcon";
import { API_URL } from "@/services/apiConfig";

const resolveUploadMediaUrl = (value?: string | null) => {
    const raw = String(value || "").trim();
    if (!raw || /^(data:|blob:|https?:\/\/)/i.test(raw)) return raw;
    const normalized = raw.replace(/\\/g, "/");
    const uploadIndex = normalized.toLowerCase().indexOf("/uploads/");
    const uploadPath = uploadIndex >= 0 ? normalized.slice(uploadIndex) : normalized.startsWith("uploads/") ? `/${normalized}` : normalized;
    const apiBase = API_URL.replace(/\/api\/?$/i, "");
    return uploadPath.startsWith("/uploads/") ? `${apiBase}${uploadPath}` : uploadPath;
};

const getVideoEmbedUrl = (value: string, autoPlay = true) => {
    try {
        const url = new URL(value);
        const host = url.hostname.replace(/^www\./i, "").toLowerCase();
        let videoId = "";
        if (host === "youtu.be") videoId = url.pathname.split("/").filter(Boolean)[0] || "";
        if (host.endsWith("youtube.com")) {
            videoId = url.searchParams.get("v") || "";
            const parts = url.pathname.split("/").filter(Boolean);
            if (!videoId && ["embed", "shorts", "live"].includes(parts[0])) videoId = parts[1] || "";
        }
        if (videoId) return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?autoplay=${autoPlay ? "1" : "0"}`;
        const parts = url.pathname.split("/").filter(Boolean);
        if (host.includes("instagram.com") && ["p", "reel", "tv"].includes(parts[0]) && parts[1]) {
            return `https://www.instagram.com/${parts[0]}/${parts[1]}/embed`;
        }
        const tikTokVideoIndex = parts.findIndex((part) => part === "video");
        if (host.includes("tiktok.com") && tikTokVideoIndex >= 0 && parts[tikTokVideoIndex + 1]) {
            return `https://www.tiktok.com/embed/v2/${encodeURIComponent(parts[tikTokVideoIndex + 1])}`;
        }
        if (host.includes("facebook.com") || host.includes("fb.watch")) {
            return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(value)}&show_text=false&autoplay=${autoPlay ? "true" : "false"}&width=560`;
        }
        return "";
    } catch {
        return "";
    }
};

const formatTime = (value: number) => {
    const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
    const minutes = Math.floor(safeValue / 60);
    const seconds = Math.floor(safeValue % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

function SystemVideoPlayer({
    src,
    poster,
    autoPlay,
    autoPauseOnLeave,
}: {
    src: string;
    poster?: string;
    autoPlay: boolean;
    autoPauseOnLeave: boolean;
}) {
    const frameRef = useRef<HTMLDivElement | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [paused, setPaused] = useState(!autoPlay);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

    useEffect(() => {
        const video = videoRef.current;
        if (!video || !autoPlay) return;
        void video.play().then(() => setPaused(false)).catch(() => setPaused(true));
    }, [autoPlay, src]);

    useEffect(() => {
        if (!autoPauseOnLeave || !frameRef.current) return;
        const observer = new IntersectionObserver(
            ([entry]) => {
                const video = videoRef.current;
                if (!video) return;
                if (entry.intersectionRatio < 0.35 && !video.paused) {
                    video.pause();
                    setPaused(true);
                }
            },
            { threshold: [0, 0.35, 0.7] },
        );
        observer.observe(frameRef.current);
        return () => observer.disconnect();
    }, [autoPauseOnLeave]);

    const seekBy = (seconds: number) => {
        const video = videoRef.current;
        if (!video) return;
        const target = Math.max(0, Math.min(Number.isFinite(video.duration) ? video.duration : duration || 0, video.currentTime + seconds));
        video.currentTime = target;
        setCurrentTime(target);
    };

    const togglePlay = () => {
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) {
            void video.play().then(() => setPaused(false)).catch(() => setPaused(true));
        } else {
            video.pause();
            setPaused(true);
        }
    };

    const handleFrameClick = (event: MouseEvent<HTMLDivElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const x = event.clientX - rect.left;
        seekBy(x < rect.width / 2 ? -5 : 5);
    };

    return (
        <div ref={frameRef} className="relative h-full w-full bg-black" onClick={handleFrameClick}>
            <video
                ref={videoRef}
                src={src}
                poster={poster}
                autoPlay={autoPlay}
                playsInline
                preload="metadata"
                controls={false}
                controlsList="nodownload noplaybackrate"
                disablePictureInPicture
                onLoadedMetadata={(event) => {
                    setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0);
                    setCurrentTime(event.currentTarget.currentTime || 0);
                }}
                onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime || 0)}
                onPlay={() => setPaused(false)}
                onPause={() => setPaused(true)}
                className="h-full w-full bg-black object-cover"
            />

            <button
                type="button"
                onClick={(event) => {
                    event.stopPropagation();
                    togglePlay();
                }}
                className="absolute left-1/2 top-1/2 z-20 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/38 text-white shadow-xl backdrop-blur-md transition hover:bg-black/50"
                aria-label={paused ? "Play video" : "Pause video"}
            >
                <IonIcon name={paused ? "play" : "pause"} className="text-4xl" />
            </button>

            <div className="absolute inset-x-3 bottom-3 z-30 space-y-1.5 text-white" onClick={(event) => event.stopPropagation()}>
                <div className="flex items-center justify-between gap-3 text-[11px] font-black drop-shadow-[0_1px_4px_rgba(0,0,0,0.85)]">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                </div>
                <input
                    type="range"
                    min={0}
                    max={Math.max(1, duration)}
                    step="0.1"
                    value={Math.min(currentTime, duration || currentTime)}
                    onChange={(event) => {
                        const nextTime = Number(event.currentTarget.value);
                        if (videoRef.current) videoRef.current.currentTime = nextTime;
                        setCurrentTime(nextTime);
                    }}
                    className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/25 accent-rose-600"
                    style={{ background: `linear-gradient(90deg,#e11d48 0%,#e11d48 ${progress}%,rgba(255,255,255,0.28) ${progress}%,rgba(255,255,255,0.28) 100%)` }}
                    aria-label="Video progress"
                />
            </div>
        </div>
    );
}

export default function UploadContentWatchModal({
    open,
    source,
    poster,
    title,
    autoPlay = true,
    actionRail,
    inline = false,
    onClose,
}: {
    open: boolean;
    source: string;
    poster?: string | null;
    title: string;
    lockedPrice?: number | null;
    autoPlay?: boolean;
    actionRail?: ReactNode;
    inline?: boolean;
    onClose: () => void;
}) {
    useEffect(() => {
        if (!open) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [onClose, open]);

    if (!open || !source || (!inline && typeof document === "undefined")) return null;
    const videoSource = resolveUploadMediaUrl(source);
    const posterSource = resolveUploadMediaUrl(poster);
    const embedSource = getVideoEmbedUrl(videoSource, autoPlay);

    const watchContent = (
        <div className={`${inline ? "relative h-[min(72vh,680px)] min-h-[420px] w-full rounded-[1.35rem] bg-black max-sm:h-[min(66vh,560px)] max-sm:min-h-[360px]" : "relative h-[min(94vh,820px)] w-full"} max-w-[860px]`} onClick={(event) => event.stopPropagation()}>
            <div className={`relative h-full w-full overflow-hidden bg-black shadow-[0_30px_90px_rgba(0,0,0,0.72)] ${inline ? "rounded-[1.35rem]" : "rounded-[1.35rem] border border-white/10"}`}>
                {embedSource ? (
                    <iframe
                        src={embedSource}
                        title={title || "Full Content"}
                        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                        allowFullScreen
                        className="h-full w-full border-0 bg-black"
                    />
                ) : (
                    <SystemVideoPlayer src={videoSource} poster={posterSource || undefined} autoPlay={autoPlay} autoPauseOnLeave={inline} />
                )}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/88 via-black/30 to-transparent px-4 pb-14 pt-16">
                    <h3 className="line-clamp-2 text-[13px] font-black leading-5 text-white">{title || "Full Content"}</h3>
                </div>
                <div className="absolute bottom-16 right-3 z-30 flex w-10 flex-col items-center justify-end gap-2.5 text-white">
                    {!inline && (
                        <button type="button" onClick={onClose} className="mb-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/45 text-white/85 shadow-lg backdrop-blur-md transition hover:bg-black/65 hover:text-white" aria-label="Close full video">
                            <IonIcon name="close-outline" className="text-2xl" />
                        </button>
                    )}
                    {actionRail}
                </div>
            </div>
        </div>
    );

    if (inline) return watchContent;

    return createPortal(
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/90 px-2 py-3 backdrop-blur-md sm:px-4" onClick={onClose}>
            {watchContent}
        </div>,
        document.body,
    );
}
