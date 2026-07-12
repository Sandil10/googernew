"use client";

import Image from "next/image";
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
        if (videoId) {
            return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?autoplay=${autoPlay ? "1" : "0"}&enablejsapi=1&playsinline=1&rel=0`;
        }
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

const isYouTubeEmbed = (value: string) => /youtube\.com\/embed\//i.test(value);

// Render a caption/title with #hashtags highlighted in red.
const renderWithHashtags = (text: string): ReactNode =>
    text.split(/(#[\p{L}\p{N}_]+)/gu).map((part, index) =>
        part.startsWith("#")
            ? <span key={index} className="text-rose-500">{part}</span>
            : <span key={index}>{part}</span>,
    );

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
    initialTimeSeconds = 0,
    trimStartSeconds = 0,
    trimEndSeconds = 0,
}: {
    src: string;
    poster?: string;
    autoPlay: boolean;
    autoPauseOnLeave: boolean;
    initialTimeSeconds?: number;
    trimStartSeconds?: number;
    trimEndSeconds?: number;
}) {
    const frameRef = useRef<HTMLDivElement | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const hideControlsTimeoutRef = useRef<number | null>(null);
    const [paused, setPaused] = useState(!autoPlay);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [muted, setMuted] = useState(false);
    const [volume, setVolume] = useState(1);
    const [playbackRate, setPlaybackRate] = useState(1);
    const [showControls, setShowControls] = useState(!autoPlay);
    const SPEEDS = [0.5, 1, 1.5, 2];
    const cycleSpeed = () => setPlaybackRate((rate) => SPEEDS[(SPEEDS.indexOf(rate) + 1) % SPEEDS.length]);
    const trimStart = Math.max(0, Number(trimStartSeconds || 0));
    const trimEnd = Math.max(0, Number(trimEndSeconds || 0));
    const requestedInitialTime = Math.max(0, Number(initialTimeSeconds || 0));
    const hasTrim = trimEnd > trimStart;
    const startTime = hasTrim
        ? Math.min(Math.max(trimStart, requestedInitialTime || trimStart), Math.max(trimStart, trimEnd - 0.05))
        : requestedInitialTime;
    const displayCurrentTime = hasTrim ? Math.max(0, currentTime - trimStart) : currentTime;
    const displayDuration = hasTrim ? Math.max(0, trimEnd - trimStart) : duration;
    const progress = displayDuration > 0 ? Math.min(100, (displayCurrentTime / displayDuration) * 100) : 0;

    // Keep the media element in sync with volume / speed controls.
    useEffect(() => {
        const video = videoRef.current;
        if (video) video.volume = volume;
    }, [volume]);
    useEffect(() => {
        const video = videoRef.current;
        if (video) video.playbackRate = playbackRate;
    }, [playbackRate]);

    useEffect(() => () => {
        if (hideControlsTimeoutRef.current !== null) {
            window.clearTimeout(hideControlsTimeoutRef.current);
        }
    }, []);

    const scheduleHideControls = () => {
        if (hideControlsTimeoutRef.current !== null) {
            window.clearTimeout(hideControlsTimeoutRef.current);
        }
        if (paused) {
            setShowControls(true);
            return;
        }
        hideControlsTimeoutRef.current = window.setTimeout(() => {
            setShowControls(false);
        }, 1400);
    };

    const revealControls = () => {
        setShowControls(true);
        scheduleHideControls();
    };


    useEffect(() => {
        const video = videoRef.current;
        if (!video || !autoPlay) return;
        if ((hasTrim && (video.currentTime < trimStart || video.currentTime >= trimEnd)) || startTime > 0) {
            video.currentTime = startTime;
        }
        void video.play().then(() => setPaused(false)).catch(() => setPaused(true));
    }, [autoPlay, hasTrim, src, startTime, trimEnd, trimStart]);

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
        const minTime = hasTrim ? trimStart : 0;
        const maxTime = hasTrim ? trimEnd : (Number.isFinite(video.duration) ? video.duration : duration || 0);
        const target = Math.max(minTime, Math.min(maxTime, video.currentTime + seconds));
        video.currentTime = target;
        setCurrentTime(target);
    };

    const togglePlay = () => {
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) {
            if (hasTrim && (video.currentTime < trimStart || video.currentTime >= trimEnd)) {
                video.currentTime = startTime;
                setCurrentTime(startTime);
            }
            void video.play().then(() => setPaused(false)).catch(() => setPaused(true));
        } else {
            video.pause();
            setPaused(true);
        }
    };

    const handleFrameClick = (event: MouseEvent<HTMLDivElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const x = event.clientX - rect.left;
        revealControls();
        seekBy(x < rect.width / 2 ? -5 : 5);
    };

    useEffect(() => {
        if (paused) {
            setShowControls(true);
            if (hideControlsTimeoutRef.current !== null) {
                window.clearTimeout(hideControlsTimeoutRef.current);
            }
            return;
        }
        scheduleHideControls();
    }, [paused]);

    return (
        <div
            ref={frameRef}
            className="relative h-full w-full bg-black"
            onClick={handleFrameClick}
            onMouseMove={revealControls}
            onTouchStart={revealControls}
        >
            <video
                ref={videoRef}
                src={src}
                poster={poster}
                autoPlay={autoPlay}
                muted={muted}
                playsInline
                preload="metadata"
                controls={false}
                controlsList="nodownload noplaybackrate"
                disablePictureInPicture
                onLoadedMetadata={(event) => {
                    const nativeDuration = Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0;
                    setDuration(hasTrim ? Math.max(0, trimEnd - trimStart) : nativeDuration);
                    if (hasTrim || startTime > 0) {
                        event.currentTarget.currentTime = startTime;
                        setCurrentTime(startTime);
                    } else {
                        setCurrentTime(event.currentTarget.currentTime || 0);
                    }
                }}
                onTimeUpdate={(event) => {
                    if (hasTrim && event.currentTarget.currentTime >= trimEnd) {
                        event.currentTarget.pause();
                        event.currentTarget.currentTime = trimStart;
                        setCurrentTime(trimStart);
                        setPaused(true);
                        return;
                    }
                    setCurrentTime(event.currentTarget.currentTime || 0);
                }}
                onPlay={(event) => {
                    if (hasTrim && (event.currentTarget.currentTime < trimStart || event.currentTarget.currentTime >= trimEnd)) {
                        event.currentTarget.currentTime = trimStart;
                    }
                    setPaused(false);
                }}
                onPause={() => setPaused(true)}
                className="h-full w-full bg-black object-contain"
            />

            {/* Top-right controls (under the card's two-dot menu), compact pill: sound on/off, volume, speed */}
            <div className={`absolute right-3 top-3 z-30 flex items-center gap-2 rounded-full bg-black/50 px-2.5 py-1 shadow-lg backdrop-blur-md transition-all duration-200 ${showControls ? "opacity-100" : "pointer-events-none opacity-0"}`} onClick={(event) => event.stopPropagation()}>
                <button
                    type="button"
                    onClick={() => setMuted((m) => !m)}
                    className="flex h-6 w-6 items-center justify-center rounded-full text-white transition hover:text-white/70"
                    aria-label={muted ? "Unmute" : "Mute"}
                >
                    <IonIcon name={muted || volume === 0 ? "volume-mute" : volume < 0.5 ? "volume-low" : "volume-high"} className="text-base" />
                </button>
                <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={muted ? 0 : volume}
                    onChange={(event) => {
                        const next = Number(event.currentTarget.value);
                        setVolume(next);
                        setMuted(next === 0);
                    }}
                    className="h-1 w-12 cursor-pointer appearance-none rounded-full bg-white/30 accent-rose-500"
                    aria-label="Volume"
                />
                <button
                    type="button"
                    onClick={cycleSpeed}
                    className="min-w-[30px] rounded-full bg-white/15 px-1.5 py-0.5 text-center text-[11px] font-black leading-none text-white transition hover:bg-white/25"
                    aria-label="Playback speed (tap to change)"
                >
                    {playbackRate}x
                </button>
            </div>

            {/* Center controls: skip back 10s, play/pause, skip forward 10s  ( <  ⏸  > ) */}
            <div className={`absolute left-1/2 top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center gap-3 transition-all duration-200 ${showControls ? "opacity-100" : "pointer-events-none opacity-0"}`} onClick={(event) => event.stopPropagation()}>
                <button
                    type="button"
                    onClick={() => seekBy(-5)}
                    className="flex h-7 w-7 flex-col items-center justify-center gap-0 rounded-full bg-black/38 text-white shadow-xl backdrop-blur-md transition hover:bg-black/50"
                    aria-label="Skip back 5 seconds"
                >
                    <IonIcon name="chevron-back" className="text-[11px] leading-none" />
                    <span className="text-[6px] font-black leading-none">5s</span>
                </button>
                <button
                    type="button"
                    onClick={togglePlay}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-black/38 text-white shadow-xl backdrop-blur-md transition hover:bg-black/50"
                    aria-label={paused ? "Play video" : "Pause video"}
                >
                    <Image
                        src="/assets/images/googer.png"
                        alt={paused ? "Play video" : "Pause video"}
                        width={22}
                        height={22}
                        className={`h-[22px] w-[22px] object-contain ${paused ? "" : "animate-pulse"}`}
                    />
                </button>
                <button
                    type="button"
                    onClick={() => seekBy(5)}
                    className="flex h-7 w-7 flex-col items-center justify-center gap-0 rounded-full bg-black/38 text-white shadow-xl backdrop-blur-md transition hover:bg-black/50"
                    aria-label="Skip forward 5 seconds"
                >
                    <IonIcon name="chevron-forward" className="text-[11px] leading-none" />
                    <span className="text-[6px] font-black leading-none">5s</span>
                </button>
            </div>

            <div className={`absolute inset-x-3 bottom-3 z-30 flex items-center gap-2 text-white transition-all duration-200 ${showControls ? "opacity-100" : "pointer-events-none opacity-0"}`} onClick={(event) => event.stopPropagation()}>
                <span className="shrink-0 text-[11px] font-black drop-shadow-[0_1px_4px_rgba(0,0,0,0.85)]">{formatTime(displayCurrentTime)}</span>
                <input
                    type="range"
                    min={0}
                    max={Math.max(1, displayDuration)}
                    step="0.1"
                    value={Math.min(displayCurrentTime, displayDuration || displayCurrentTime)}
                    onChange={(event) => {
                        const nextTime = Number(event.currentTarget.value) + (hasTrim ? trimStart : 0);
                        if (videoRef.current) videoRef.current.currentTime = nextTime;
                        setCurrentTime(nextTime);
                    }}
                    className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/25 accent-rose-600"
                    style={{ background: `linear-gradient(90deg,#e11d48 0%,#e11d48 ${progress}%,rgba(255,255,255,0.28) ${progress}%,rgba(255,255,255,0.28) 100%)` }}
                    aria-label="Video progress"
                />
                <span className="shrink-0 text-[11px] font-black drop-shadow-[0_1px_4px_rgba(0,0,0,0.85)]">{formatTime(displayDuration)}</span>
            </div>
        </div>
    );
}

export default function UploadContentWatchModal({
    open,
    source,
    images,
    poster,
    title,
    hashtags,
    mediaType,
    autoPlay = true,
    actionRail,
    inline = false,
    videoTrimStartSeconds = 0,
    videoTrimEndSeconds = 0,
    initialTimeSeconds = 0,
    onClose,
}: {
    open: boolean;
    source: string;
    images?: string[] | null;
    poster?: string | null;
    title: string;
    hashtags?: string[] | null;
    mediaType?: string | null;
    lockedPrice?: number | null;
    autoPlay?: boolean;
    actionRail?: ReactNode;
    inline?: boolean;
    videoTrimStartSeconds?: number;
    videoTrimEndSeconds?: number;
    initialTimeSeconds?: number;
    onClose: () => void;
}) {
    const [galleryIndex, setGalleryIndex] = useState(0);
    const touchStartX = useRef<number | null>(null);
    const inlineFrameRef = useRef<HTMLDivElement | null>(null);
    const inlineEmbedRef = useRef<HTMLIFrameElement | null>(null);
    const [inlineEmbedActive, setInlineEmbedActive] = useState(true);
    const [inlineEmbedPausedByScroll, setInlineEmbedPausedByScroll] = useState(false);

    useEffect(() => {
        if (!open) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [onClose, open]);

    useEffect(() => {
        setGalleryIndex(0);
    }, [open, source]);

    useEffect(() => {
        if (!open) return;
        setInlineEmbedActive(true);
        setInlineEmbedPausedByScroll(false);
    }, [open, source]);

    if (!open || !source || (!inline && typeof document === "undefined")) return null;
    const videoSource = resolveUploadMediaUrl(source);
    const posterSource = resolveUploadMediaUrl(poster);
    const embedSource = getVideoEmbedUrl(videoSource, autoPlay);
    const embedPosterSource = posterSource || (embedSource && videoSource !== embedSource ? videoSource : "");
    const isImage = String(mediaType || "").toLowerCase().includes("image");
    const galleryImages = Array.from(
        new Set((images || []).filter(Boolean).map(resolveUploadMediaUrl)),
    );
    const hasGallery = isImage && galleryImages.length > 1;
    const safeGalleryIndex = hasGallery ? Math.min(galleryIndex, galleryImages.length - 1) : 0;
    const normalizedHashtags = Array.from(
        new Set(
            (Array.isArray(hashtags) ? hashtags : [])
                .map((tag) => String(tag || "").trim())
                .filter(Boolean)
                .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`)),
        ),
    );
    const goPrevImage = () => setGalleryIndex((i) => (i - 1 + galleryImages.length) % galleryImages.length);
    const goNextImage = () => setGalleryIndex((i) => (i + 1) % galleryImages.length);

    useEffect(() => {
        if (!inline || !open || !inlineFrameRef.current || !embedSource || typeof IntersectionObserver === "undefined") return;

        const pauseEmbeddedVideo = () => {
            if (!inlineEmbedRef.current) return;
            try {
                if (isYouTubeEmbed(embedSource)) {
                    inlineEmbedRef.current.contentWindow?.postMessage(
                        JSON.stringify({ event: "command", func: "pauseVideo", args: [] }),
                        "*",
                    );
                }
            } catch {}
        };

        const observer = new IntersectionObserver(
            ([entry]) => {
                const ratio = entry?.intersectionRatio || 0;
                if (ratio < 0.35) {
                    pauseEmbeddedVideo();
                    setInlineEmbedPausedByScroll(true);
                    if (!isYouTubeEmbed(embedSource)) {
                        setInlineEmbedActive(false);
                    }
                    return;
                }

            },
            { threshold: [0, 0.35, 0.6, 0.85] },
        );

        observer.observe(inlineFrameRef.current);
        return () => observer.disconnect();
    }, [embedSource, inline, open]);

    const watchContent = (
        <div ref={inlineFrameRef} className={`${inline ? "relative h-[min(72vh,680px)] min-h-[420px] w-full rounded-[1.35rem] bg-black max-sm:h-[min(66vh,560px)] max-sm:min-h-[360px]" : "relative h-[min(94vh,820px)] w-full"} max-w-[860px]`} onClick={(event) => event.stopPropagation()}>
            <div className={`relative h-full w-full overflow-hidden bg-black shadow-[0_30px_90px_rgba(0,0,0,0.72)] ${inline ? "rounded-[1.35rem]" : "rounded-[1.35rem] border border-white/10"}`}>
                {isImage ? (
                    hasGallery ? (
                        <div
                            className="relative flex h-full w-full items-center justify-center bg-black"
                            onTouchStart={(event) => {
                                touchStartX.current = event.touches[0]?.clientX ?? null;
                            }}
                            onTouchEnd={(event) => {
                                if (touchStartX.current === null) return;
                                const delta = (event.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
                                if (Math.abs(delta) > 40) {
                                    if (delta < 0) goNextImage();
                                    else goPrevImage();
                                }
                                touchStartX.current = null;
                            }}
                        >
                            <img src={galleryImages[safeGalleryIndex]} alt={title || "Content image"} className="max-h-full max-w-full select-none object-contain" draggable={false} />
                            {/* Bottom-center controls: dots always, arrows on desktop only, swipe on mobile */}
                            <div className="absolute bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3">
                                <button type="button" onClick={goPrevImage} className="hidden h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-black/60 text-white/85 transition hover:bg-black/80 hover:text-white sm:flex" aria-label="Previous image">
                                    <IonIcon name="chevron-back" className="text-base" />
                                </button>
                                <div className="flex items-center gap-1.5">
                                    {galleryImages.map((_, dotIndex) => (
                                        <button
                                            key={dotIndex}
                                            type="button"
                                            onClick={() => setGalleryIndex(dotIndex)}
                                            className={`h-1.5 rounded-full transition-all ${dotIndex === safeGalleryIndex ? "w-4 bg-white" : "w-1.5 bg-white/45"}`}
                                            aria-label={`Show image ${dotIndex + 1}`}
                                        />
                                    ))}
                                </div>
                                <button type="button" onClick={goNextImage} className="hidden h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-black/60 text-white/85 transition hover:bg-black/80 hover:text-white sm:flex" aria-label="Next image">
                                    <IonIcon name="chevron-forward" className="text-base" />
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex h-full w-full items-center justify-center bg-black">
                            <img src={videoSource} alt={title || "Content image"} className="max-h-full max-w-full object-contain" />
                        </div>
                    )
                ) : embedSource ? (
                    <div className="relative h-full w-full bg-black">
                        {(inlineEmbedActive || isYouTubeEmbed(embedSource)) ? (
                            <iframe
                                ref={inlineEmbedRef}
                                src={embedSource}
                                title={title || "Full Content"}
                                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                                allowFullScreen
                                className={`h-full w-full border-0 bg-black ${inlineEmbedPausedByScroll && isYouTubeEmbed(embedSource) ? "pointer-events-none" : ""}`}
                            />
                        ) : null}
                        {inline && inlineEmbedPausedByScroll ? (
                            <button
                                type="button"
                                onClick={() => {
                                    if (!isYouTubeEmbed(embedSource)) {
                                        setInlineEmbedActive(true);
                                    } else {
                                        try {
                                            inlineEmbedRef.current?.contentWindow?.postMessage(
                                                JSON.stringify({ event: "command", func: "playVideo", args: [] }),
                                                "*",
                                            );
                                        } catch {}
                                    }
                                    setInlineEmbedPausedByScroll(false);
                                }}
                                className="absolute inset-0 z-30 flex items-center justify-center bg-black/22"
                                aria-label="Resume link video"
                            >
                                {embedPosterSource ? (
                                    <>
                                        <img
                                            src={embedPosterSource}
                                            alt={title || "Video preview"}
                                            className="absolute inset-0 h-full w-full object-cover opacity-70"
                                        />
                                        <div className="absolute inset-0 bg-black/35 backdrop-blur-[1px]" />
                                    </>
                                ) : (
                                    <div className="absolute inset-0 bg-black/45" />
                                )}
                                <span className="relative z-10 flex h-16 w-16 items-center justify-center rounded-full bg-black/55 text-white shadow-[0_20px_45px_rgba(0,0,0,0.45)] ring-1 ring-white/10 transition hover:bg-black/70">
                                    <IonIcon name="play" className="ml-1 text-3xl" />
                                </span>
                            </button>
                        ) : null}
                    </div>
                ) : (
                    <SystemVideoPlayer
                        src={videoSource}
                        poster={posterSource || undefined}
                        autoPlay={autoPlay}
                        autoPauseOnLeave={inline}
                        initialTimeSeconds={initialTimeSeconds}
                        trimStartSeconds={videoTrimStartSeconds}
                        trimEndSeconds={videoTrimEndSeconds}
                    />
                )}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/88 via-black/30 to-transparent px-4 pb-12 pt-16">
                    <h3 className="line-clamp-2 text-[13px] font-black leading-5 text-white">{title ? renderWithHashtags(title) : "Full Content"}</h3>
                    {normalizedHashtags.length > 0 ? (
                        <p className="mt-1 line-clamp-2 text-[10px] font-black leading-5 text-red-500">
                            {normalizedHashtags.join(" ")}
                        </p>
                    ) : null}
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
