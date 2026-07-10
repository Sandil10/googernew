"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
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

type UploadContentMediaProps = {
    mediaType?: string | null;
    mediaPreview?: string | null;
    mediaGallery?: string[] | null;
    thumbnailUrl?: string | null;
    previewMode?: "thumbnail" | "auto_preview" | null;
    previewUrl?: string | null;
    videoTrimStartSeconds?: number;
    videoTrimEndSeconds?: number;
    previewFrameSeconds?: number;
    previewDurationSeconds?: number;
    alt: string;
    blurred?: boolean;
    autoPlayVideo?: boolean;
    onPreviewComplete?: () => void;
    onAspectRatioChange?: (ratio: number) => void;
};

export default function UploadContentMedia({
    mediaType,
    mediaPreview,
    mediaGallery,
    thumbnailUrl,
    previewMode,
    previewUrl,
    videoTrimStartSeconds = 0,
    videoTrimEndSeconds = 0,
    previewFrameSeconds = 0.2,
    previewDurationSeconds = 0,
    alt,
    blurred = false,
    autoPlayVideo = false,
    onPreviewComplete,
    onAspectRatioChange,
}: UploadContentMediaProps) {
    const isVideo = String(mediaType || "").toLowerCase().includes("video");
    const gallery = Array.from(new Set((mediaGallery || []).filter(Boolean).map(resolveUploadMediaUrl))).slice(0, 5);
    const resolvedMediaPreview = resolveUploadMediaUrl(mediaPreview);
    const resolvedThumbnailUrl = resolveUploadMediaUrl(thumbnailUrl);
    const resolvedPreviewUrl = resolveUploadMediaUrl(previewUrl);
    const images = gallery.length > 0 ? gallery : (resolvedMediaPreview ? [resolvedMediaPreview] : []);
    const [index, setIndex] = useState(0);
    const [generatedPoster, setGeneratedPoster] = useState("");
    const [videoFrameReady, setVideoFrameReady] = useState(false);
    const touchStartX = useRef<number | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const frameRef = useRef<HTMLDivElement | null>(null);
    const previewCompleteRef = useRef(false);
    const autoPreview = isVideo && previewMode === "auto_preview" && autoPlayVideo;
    const trimStart = Math.max(0, Number(videoTrimStartSeconds || 0));
    const trimEnd = Math.max(0, Number(videoTrimEndSeconds || 0));
    const previewFrameAt = Math.max(0.05, Number(previewFrameSeconds || 0.2));
    const previewDuration = Math.max(0, Number(previewDurationSeconds || 0));
    const hasTrim = trimEnd > trimStart;
    const reportAspectRatio = (width: number, height: number) => {
        if (width > 0 && height > 0) onAspectRatioChange?.(width / height);
    };
    const mediaFitClassName = blurred ? "object-cover scale-110 blur-xl" : "object-contain";

    useEffect(() => {
        setIndex(0);
        setGeneratedPoster("");
        setVideoFrameReady(false);
        previewCompleteRef.current = false;
    }, [mediaPreview, mediaGallery]);

    useEffect(() => {
        if (!isVideo || autoPreview || autoPlayVideo || resolvedThumbnailUrl || !resolvedMediaPreview || blurred || typeof document === "undefined") {
            setGeneratedPoster("");
            return;
        }

        let cancelled = false;
        let captured = false;
        let captureOnLoadedData = false;
        let seekAttempts: number[] = [];
        let seekIndex = 0;
        const video = document.createElement("video");
        const cleanup = () => {
            video.removeAttribute("src");
            video.load();
        };
        const isMostlyBlackFrame = (context: CanvasRenderingContext2D, width: number, height: number) => {
            const sampleWidth = Math.min(24, width);
            const sampleHeight = Math.min(24, height);
            const sample = document.createElement("canvas");
            sample.width = sampleWidth;
            sample.height = sampleHeight;
            const sampleContext = sample.getContext("2d");
            if (!sampleContext) return false;
            sampleContext.drawImage(context.canvas, 0, 0, sampleWidth, sampleHeight);
            const pixels = sampleContext.getImageData(0, 0, sampleWidth, sampleHeight).data;
            let brightness = 0;
            for (let index = 0; index < pixels.length; index += 4) {
                brightness += pixels[index] + pixels[index + 1] + pixels[index + 2];
            }
            return brightness / (sampleWidth * sampleHeight * 3) < 18;
        };
        function seekToAttempt() {
            const target = seekAttempts[seekIndex] ?? Math.max(trimStart, previewFrameAt);
            try {
                video.currentTime = target;
            } catch {
                captureFrame();
            }
        }
        function captureFrame() {
            if (cancelled || captured || video.videoWidth <= 0 || video.videoHeight <= 0) return;
            try {
                const canvas = document.createElement("canvas");
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const context = canvas.getContext("2d");
                if (!context) return;
                context.drawImage(video, 0, 0, canvas.width, canvas.height);
                if (isMostlyBlackFrame(context, canvas.width, canvas.height) && seekIndex < seekAttempts.length - 1) {
                    seekIndex += 1;
                    seekToAttempt();
                    return;
                }
                const poster = canvas.toDataURL("image/jpeg", 0.82);
                captured = true;
                if (!cancelled) setGeneratedPoster(poster);
            } catch {
                captured = true;
                if (!cancelled) setGeneratedPoster("");
            }
        }

        video.muted = true;
        video.playsInline = true;
        video.preload = "auto";
        video.addEventListener("loadedmetadata", () => {
            if (cancelled) return;
            reportAspectRatio(video.videoWidth, video.videoHeight);
            const safeDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
            const maxTime = safeDuration > 0 ? Math.max(0, safeDuration - 0.05) : 4;
            seekAttempts = Array.from(new Set([previewFrameAt, 0.8, 1.5, 2.5, 4].map((time) => Math.min(Math.max(trimStart, time), maxTime)))).filter((time) => time >= 0);
            if (seekAttempts.length === 0) seekAttempts = [Math.max(trimStart, previewFrameAt)];
            seekIndex = 0;
            captureOnLoadedData = seekAttempts[0] <= 0.01;
            seekToAttempt();
        });
        video.addEventListener("loadeddata", () => {
            if (captureOnLoadedData) captureFrame();
        });
        video.addEventListener("seeked", captureFrame);
        video.src = resolvedMediaPreview;
        video.load();

        return () => {
            cancelled = true;
            cleanup();
        };
    }, [autoPlayVideo, autoPreview, blurred, isVideo, previewFrameAt, resolvedMediaPreview, resolvedThumbnailUrl, trimStart]);

    useEffect(() => {
        const video = videoRef.current;
        const frame = frameRef.current;
        if (!video || !frame || !((autoPreview && !!resolvedPreviewUrl) || autoPlayVideo) || typeof IntersectionObserver === "undefined") {
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!videoRef.current) return;
                if (entry.intersectionRatio < 0.35 && !videoRef.current.paused) {
                    videoRef.current.pause();
                    return;
                }
                if (entry.intersectionRatio >= 0.6 && videoRef.current.paused && !(previewDuration > 0 && previewCompleteRef.current)) {
                    void videoRef.current.play().catch(() => {});
                }
            },
            { threshold: [0, 0.35, 0.6, 0.85] },
        );

        observer.observe(frame);
        return () => observer.disconnect();
    }, [autoPlayVideo, autoPreview, previewDuration, resolvedPreviewUrl]);

    const move = (direction: number) => {
        if (images.length < 2) return;
        setIndex((current) => (current + direction + images.length) % images.length);
    };

    if (blurred && resolvedThumbnailUrl) {
        return <Image src={resolvedThumbnailUrl} alt={alt} fill className="object-cover scale-110 blur-xl" onLoad={(event) => reportAspectRatio(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)} unoptimized />;
    }

    if (isVideo && previewMode === "thumbnail" && resolvedThumbnailUrl) {
        return <Image src={resolvedThumbnailUrl} alt={alt} fill className={mediaFitClassName} onLoad={(event) => reportAspectRatio(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)} unoptimized />;
    }

    if (isVideo && !autoPreview && !autoPlayVideo) {
        if (resolvedThumbnailUrl) {
            return <Image src={resolvedThumbnailUrl} alt={alt} fill className={mediaFitClassName} onLoad={(event) => reportAspectRatio(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)} unoptimized />;
        }
        if (generatedPoster) {
            return (
                <img
                    src={generatedPoster}
                    alt={alt}
                    className={`absolute inset-0 h-full w-full ${mediaFitClassName}`}
                    draggable={false}
                />
            );
        }
        if (resolvedMediaPreview) {
            return (
                <div ref={frameRef} className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_center,rgba(71,85,105,0.38),rgba(24,24,27,0.92)_58%,rgba(12,12,14,0.98))]">
                    <video
                        ref={videoRef}
                        src={resolvedMediaPreview}
                        muted
                        playsInline
                        preload="auto"
                        className={`h-full w-full transition-opacity duration-200 ${videoFrameReady ? "opacity-100" : "opacity-0"} ${mediaFitClassName}`}
                        onLoadedMetadata={(event) => {
                            reportAspectRatio(event.currentTarget.videoWidth, event.currentTarget.videoHeight);
                            const duration = Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0;
                            const target = duration > 0
                                ? Math.min(Math.max(trimStart, 0.8), Math.max(0, duration - 0.05))
                                : Math.max(trimStart, 0.8);
                            event.currentTarget.currentTime = target;
                            event.currentTarget.pause();
                        }}
                        onSeeked={(event) => {
                            event.currentTarget.pause();
                            setVideoFrameReady(true);
                        }}
                        onCanPlay={(event) => {
                            event.currentTarget.pause();
                            if (event.currentTarget.currentTime > 0) setVideoFrameReady(true);
                        }}
                    />
                </div>
            );
        }
        return <div className="flex h-full items-center justify-center text-sm font-bold text-white/35">No Preview</div>;
    }

    const videoSource = autoPreview && resolvedPreviewUrl ? resolvedPreviewUrl : resolvedMediaPreview;
    if (isVideo && videoSource) {
        return (
            <div ref={frameRef} className="absolute inset-0">
                <video
                    ref={videoRef}
                    src={videoSource}
                    poster={resolvedThumbnailUrl || undefined}
                    muted
                    autoPlay={(autoPreview && !!resolvedPreviewUrl) || autoPlayVideo}
                    loop={autoPlayVideo && !autoPreview && previewDuration <= 0}
                    playsInline
                    preload="metadata"
                    onLoadedMetadata={(event) => {
                        reportAspectRatio(event.currentTarget.videoWidth, event.currentTarget.videoHeight);
                        if (hasTrim) {
                            event.currentTarget.currentTime = trimStart;
                            if ((autoPreview && resolvedPreviewUrl) || autoPlayVideo) {
                                void event.currentTarget.play().catch(() => {});
                            }
                        } else if ((autoPreview && resolvedPreviewUrl) || autoPlayVideo) {
                            event.currentTarget.currentTime = 0;
                            void event.currentTarget.play().catch(() => {});
                        }
                    }}
                    onPlay={(event) => {
                        if (hasTrim && (event.currentTarget.currentTime < trimStart || event.currentTarget.currentTime >= trimEnd)) {
                            event.currentTarget.currentTime = trimStart;
                        }
                    }}
                    onTimeUpdate={(event) => {
                        if (previewDuration > 0 && autoPlayVideo && event.currentTarget.currentTime >= trimStart + previewDuration) {
                            event.currentTarget.pause();
                            event.currentTarget.removeAttribute("autoplay");
                            if (!previewCompleteRef.current) {
                                previewCompleteRef.current = true;
                                onPreviewComplete?.();
                            }
                            return;
                        }
                        if (hasTrim && event.currentTarget.currentTime >= trimEnd) {
                            event.currentTarget.pause();
                            event.currentTarget.currentTime = trimStart;
                            if (!previewCompleteRef.current && autoPlayVideo) {
                                previewCompleteRef.current = true;
                                onPreviewComplete?.();
                            }
                            return;
                        }
                        if (autoPreview && !autoPlayVideo && event.currentTarget.currentTime >= 3) {
                            event.currentTarget.pause();
                        }
                    }}
                    onEnded={() => {
                        if (!previewCompleteRef.current && autoPlayVideo) {
                            previewCompleteRef.current = true;
                            onPreviewComplete?.();
                        }
                    }}
                    className={`h-full w-full ${mediaFitClassName}`}
                />
            </div>
        );
    }

    const currentImage = images[index] || resolvedThumbnailUrl || "";
    if (!currentImage) {
        return <div className="flex h-full items-center justify-center text-sm font-bold text-white/35">No Preview</div>;
    }

    return (
        <div
            className="absolute inset-0"
            onTouchStart={(event) => {
                touchStartX.current = event.touches[0]?.clientX ?? null;
            }}
            onTouchEnd={(event) => {
                if (touchStartX.current === null) return;
                const delta = (event.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
                if (Math.abs(delta) > 35) move(delta < 0 ? 1 : -1);
                touchStartX.current = null;
            }}
        >
            <Image
                src={currentImage}
                alt={`${alt}${images.length > 1 ? ` ${index + 1}` : ""}`}
                fill
                draggable={false}
                className={`select-none ${mediaFitClassName}`}
                onLoad={(event) => reportAspectRatio(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)}
                unoptimized
            />
            {images.length > 1 && (
                <>
                    <button type="button" onClick={(event) => { event.stopPropagation(); move(-1); }} className="absolute left-2 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white backdrop-blur-sm" aria-label="Previous image">
                        <IonIcon name="chevron-back-outline" className="text-sm" />
                    </button>
                    <button type="button" onClick={(event) => { event.stopPropagation(); move(1); }} className="absolute right-2 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white backdrop-blur-sm" aria-label="Next image">
                        <IonIcon name="chevron-forward-outline" className="text-sm" />
                    </button>
                    <div className="absolute inset-x-0 bottom-3 z-20 flex justify-center gap-1.5">
                        {images.map((_, dotIndex) => (
                            <button key={dotIndex} type="button" onClick={(event) => { event.stopPropagation(); setIndex(dotIndex); }} className={`h-1.5 rounded-full transition-all ${dotIndex === index ? "w-4 bg-white" : "w-1.5 bg-white/45"}`} aria-label={`Show image ${dotIndex + 1}`} />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
