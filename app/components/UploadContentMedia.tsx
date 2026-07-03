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
    alt: string;
    blurred?: boolean;
    autoPlayVideo?: boolean;
    onAspectRatioChange?: (ratio: number) => void;
};

export default function UploadContentMedia({
    mediaType,
    mediaPreview,
    mediaGallery,
    thumbnailUrl,
    previewMode,
    previewUrl,
    alt,
    blurred = false,
    autoPlayVideo = false,
    onAspectRatioChange,
}: UploadContentMediaProps) {
    const isVideo = String(mediaType || "").toLowerCase().includes("video");
    const gallery = Array.from(new Set((mediaGallery || []).filter(Boolean).map(resolveUploadMediaUrl))).slice(0, 5);
    const resolvedMediaPreview = resolveUploadMediaUrl(mediaPreview);
    const resolvedThumbnailUrl = resolveUploadMediaUrl(thumbnailUrl);
    const resolvedPreviewUrl = resolveUploadMediaUrl(previewUrl);
    const images = gallery.length > 0 ? gallery : (resolvedMediaPreview ? [resolvedMediaPreview] : []);
    const [index, setIndex] = useState(0);
    const touchStartX = useRef<number | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const autoPreview = isVideo && previewMode === "auto_preview";
    const reportAspectRatio = (width: number, height: number) => {
        if (width > 0 && height > 0) onAspectRatioChange?.(width / height);
    };

    useEffect(() => {
        setIndex(0);
    }, [mediaPreview, mediaGallery]);

    const move = (direction: number) => {
        if (images.length < 2) return;
        setIndex((current) => (current + direction + images.length) % images.length);
    };

    if (isVideo && previewMode === "thumbnail" && resolvedThumbnailUrl) {
        return <Image src={resolvedThumbnailUrl} alt={alt} fill className={`object-cover ${blurred ? "scale-110 blur-xl" : ""}`} onLoad={(event) => reportAspectRatio(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)} unoptimized />;
    }

    const videoSource = autoPreview && resolvedPreviewUrl ? resolvedPreviewUrl : resolvedMediaPreview;
    if (isVideo && videoSource) {
        return (
            <video
                ref={videoRef}
                src={videoSource}
                poster={resolvedThumbnailUrl || undefined}
                muted
                autoPlay={(autoPreview && !!resolvedPreviewUrl) || autoPlayVideo}
                loop={autoPlayVideo && !autoPreview}
                playsInline
                preload="metadata"
                onLoadedMetadata={(event) => {
                    reportAspectRatio(event.currentTarget.videoWidth, event.currentTarget.videoHeight);
                    if ((autoPreview && resolvedPreviewUrl) || autoPlayVideo) {
                        event.currentTarget.currentTime = 0;
                        void event.currentTarget.play().catch(() => {});
                    }
                }}
                onTimeUpdate={(event) => {
                    if (autoPreview && !autoPlayVideo && event.currentTarget.currentTime >= 3) {
                        event.currentTarget.pause();
                    }
                }}
                className={`h-full w-full object-cover ${blurred ? "scale-110 blur-xl" : ""}`}
            />
        );
    }

    if (!isVideo && blurred && resolvedThumbnailUrl) {
        return <Image src={resolvedThumbnailUrl} alt={alt} fill className="object-cover" onLoad={(event) => reportAspectRatio(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)} unoptimized />;
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
                className={`select-none object-cover ${blurred ? "scale-110 blur-xl" : ""}`}
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
