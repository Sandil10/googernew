"use client";

import Image from "next/image";
import React, { useRef, useState } from "react";
import IonIcon from "@/app/components/IonIcon";
import SubscribeButton from "@/app/components/SubscribeButton";
import { getItemProfilePicture, getItemUsername } from "@/app/lib/userDisplay";
import { AdInteractionButton, AdInteractionType } from "./AdInteractionButton";
import {
    getSponsoredAdImages,
    getSponsoredSocialEmbedUrl,
    normalizeExternalUrl,
} from "./adHelpers";

export type AdSecondViewKind = "image" | "video" | "embed";

export type AdSecondViewHandlers = {
    onClose: () => void;
    onToggleLike: (adId: string | number) => void | Promise<void>;
    onOpenSheet: (type: AdInteractionType, ad: any) => void;
    onShare: (ad: any) => void;
    onReport: (ad: any) => void;
    onNotInterested: (adId: string | number) => void;
    onCollectCoin: (event: React.MouseEvent, ad: any) => void;
    onNavigateToProfile: (event: React.MouseEvent, ad: any) => void;
    canShowCollectCoin: (ad: any) => boolean;
};

export type AdSecondViewModalProps = AdSecondViewHandlers & {
    ad: any;
    kind: AdSecondViewKind;
    /** Pre-computed image list for the gallery. If omitted, derived from the ad. */
    images?: string[];
};

const normalizeMediaUrl = (value: string) => {
    if (!value) return "";
    return value.includes("uploads") || value.includes("\\")
        ? `/uploads/${value.split(/[\\/]/).pop()}`
        : value;
};

export function AdSecondViewModal({
    ad,
    kind,
    images: providedImages,
    onClose,
    onToggleLike,
    onOpenSheet,
    onShare,
    onReport,
    onNotInterested,
    onCollectCoin,
    onNavigateToProfile,
    canShowCollectCoin,
}: AdSecondViewModalProps) {
    const link = normalizeExternalUrl(ad?.active_link || "");
    const advertiserName = getItemUsername(ad, "Ad");
    const advertiserImage = getItemProfilePicture(ad);
    const images = React.useMemo(() => {
        if (providedImages && providedImages.length) return providedImages;
        return getSponsoredAdImages(ad);
    }, [ad, providedImages]);

    const [currentIndex, setCurrentIndex] = useState(0);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const swipeStartX = useRef<number | null>(null);

    const moveSlide = (direction: "prev" | "next") => {
        setCurrentIndex((prev) => {
            if (!images.length) return prev;
            const total = images.length;
            return direction === "next" ? (prev + 1) % total : (prev - 1 + total) % total;
        });
    };

    if (kind !== "image") {
        const uploadedVideoUrl = (/video/i.test(String(ad?.media_type || "")) && ad?.media_preview) ? normalizeMediaUrl(String(ad.media_preview)) : "";
        const videoUrl = uploadedVideoUrl || (kind === "video" ? link : "");
        const embedUrl = kind === "embed" ? (getSponsoredSocialEmbedUrl(link) || link) : "";

        return (
            <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/82 p-4 backdrop-blur-sm">
                <button
                    type="button"
                    onClick={onClose}
                    className="absolute inset-0"
                    aria-label="Close sponsored media preview"
                />
                <div className="relative z-10 w-full max-w-4xl overflow-hidden rounded-[2rem] border border-white/10 bg-[#101114] shadow-[0_30px_90px_rgba(0,0,0,0.45)]">
                    <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
                        <div className="min-w-0">
                            <p className={`truncate text-sm font-black tracking-[0.18em] text-white/88 ${ad?.title ? "uppercase" : ""}`}>
                                {ad?.title || "Ad"}
                            </p>
                            {link && (
                                <a
                                    href={link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="mt-1 block truncate text-xs font-bold text-blue-400 hover:underline"
                                >
                                    {link}
                                </a>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white"
                            >
                                <IonIcon name="close" className="text-xl" />
                            </button>
                        </div>
                    </div>
                    <div className="relative aspect-video bg-black">
                        {canShowCollectCoin(ad) && (
                            <div className="absolute right-3 top-[55px] z-20 md:right-4 md:top-[60px]">
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onCollectCoin(e, ad);
                                    }}
                                    className="flex items-center gap-1.5 rounded-full border border-red-400/30 bg-red-600 px-2 py-1 text-[8px] font-black uppercase tracking-[0.1em] text-white shadow-xl transition hover:bg-red-500 active:scale-95"
                                >
                                    <span className="flex h-6.5 w-6.5 items-center justify-center overflow-hidden rounded-full bg-white/12 ring-1 ring-white/10">
                                        <Image
                                            src="/assets/images/rupee.png"
                                            alt="Ruppier coin"
                                            width={28}
                                            height={28}
                                            className="h-[1.35rem] w-[1.35rem] object-contain contrast-110 brightness-110"
                                            unoptimized
                                        />
                                    </span>
                                    <span className="leading-none">Ruppier</span>
                                </button>
                            </div>
                        )}
                        {kind === "embed" && embedUrl ? (
                            <iframe
                                src={embedUrl}
                                title={ad?.title || "Ad"}
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                allowFullScreen
                                className="h-full w-full"
                            />
                        ) : videoUrl ? (
                            <video
                                src={videoUrl}
                                controls
                                autoPlay
                                playsInline
                                className="h-full w-full object-cover"
                            />
                        ) : null}
                    </div>
                </div>
            </div>
        );
    }

    // Image kind
    return (
        <div className="fixed inset-0 z-[142] flex items-center justify-center bg-black/88 p-4 backdrop-blur-sm">
            <button
                type="button"
                onClick={() => {
                    setIsMenuOpen(false);
                    onClose();
                }}
                className="absolute inset-0"
                aria-label="Close sponsored image modal"
            />
            <div
                className="relative z-10 w-full max-w-[760px] overflow-hidden rounded-[1.6rem] border border-white/10 bg-[#0f1013] shadow-[0_30px_90px_rgba(0,0,0,0.5)]"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                        <button
                            type="button"
                            onClick={(e) => onNavigateToProfile(e, ad)}
                            className="relative h-10 w-10 overflow-hidden rounded-full border border-white/10 bg-white/5 transition hover:border-blue-400/60"
                        >
                            {advertiserImage ? (
                                <Image
                                    src={advertiserImage}
                                    alt={advertiserName}
                                    fill
                                    className="object-cover"
                                    unoptimized
                                />
                            ) : (
                                <div className="flex h-full w-full items-center justify-center text-white/45">
                                    <IonIcon name="person" className="text-lg" />
                                </div>
                            )}
                        </button>
                        <div className="min-w-0">
                            <button
                                type="button"
                                onClick={(e) => onNavigateToProfile(e, ad)}
                                className={`truncate text-sm font-black tracking-[0.16em] text-white/88 transition hover:text-blue-400 ${advertiserName ? "uppercase" : ""}`}
                            >
                                {advertiserName}
                            </button>
                        </div>
                        {ad?.user_id && (
                            <SubscribeButton googId={ad.id} authorId={ad.user_id} authorName={advertiserName} />
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        {canShowCollectCoin(ad) && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onCollectCoin(e, ad);
                                }}
                                className="flex items-center gap-1.5 rounded-full border border-red-400/30 bg-red-600 px-2 py-1 text-[8px] font-black uppercase tracking-[0.1em] text-white shadow-xl transition hover:bg-red-500 active:scale-95"
                            >
                                <span className="flex h-6.5 w-6.5 items-center justify-center overflow-hidden rounded-full bg-white/12 ring-1 ring-white/10">
                                    <Image
                                        src="/assets/images/rupee.png"
                                        alt="Ruppier coin"
                                        width={28}
                                        height={28}
                                        className="h-[1.35rem] w-[1.35rem] object-contain contrast-110 brightness-110"
                                        unoptimized
                                    />
                                </span>
                                <span className="leading-none">Ruppier</span>
                            </button>
                        )}
                        <div className="relative">
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsMenuOpen((current) => !current);
                                }}
                                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-white transition hover:bg-white/10"
                            >
                                <div className="flex flex-col gap-1 p-1">
                                    <div className="h-1 w-1 rounded-full bg-white" />
                                    <div className="h-1 w-1 rounded-full bg-white" />
                                </div>
                            </button>
                            {isMenuOpen && (
                                <div
                                    className="absolute right-0 top-full z-[120] mt-2 w-56 overflow-hidden rounded-2xl border border-white/10 bg-[#1a1a1a] py-2 shadow-[0_20px_50px_rgba(0,0,0,0.5)] animate-in zoom-in-95 fade-in duration-200"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <button
                                        onClick={() => {
                                            onShare(ad);
                                            setIsMenuOpen(false);
                                        }}
                                        className="flex w-full items-center gap-3 px-5 py-4 text-left text-[11px] font-bold text-white transition-colors hover:bg-white/5"
                                    >
                                        <IonIcon name="share-social-outline" className="text-lg text-blue-400" />
                                        Share Link
                                    </button>
                                    <button
                                        onClick={() => {
                                            onReport(ad);
                                            setIsMenuOpen(false);
                                        }}
                                        className="flex w-full items-center gap-3 border-t border-white/5 px-5 py-4 text-left text-[11px] font-bold text-white transition-colors hover:bg-white/5"
                                    >
                                        <IonIcon name="alert-circle-outline" className="text-lg text-yellow-500" />
                                        Report
                                    </button>
                                    <button
                                        onClick={() => {
                                            onNotInterested(ad.id);
                                            setIsMenuOpen(false);
                                            onClose();
                                        }}
                                        className="flex w-full items-center gap-3 border-t border-white/5 px-5 py-4 text-left text-[11px] font-bold text-white transition-colors hover:bg-white/5"
                                    >
                                        <IonIcon name="eye-off-outline" className="text-lg text-slate-500" />
                                        Not Interested
                                    </button>
                                </div>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                setIsMenuOpen(false);
                                onClose();
                            }}
                            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-white transition hover:bg-white/10"
                        >
                            <IonIcon name="close-outline" className="text-2xl" />
                        </button>
                    </div>
                </div>

                <div
                    className="relative h-[68vh] min-h-[360px] w-full bg-black"
                    onTouchStart={(e) => {
                        swipeStartX.current = e.touches[0]?.clientX ?? null;
                    }}
                    onTouchEnd={(e) => {
                        const startX = swipeStartX.current;
                        const endX = e.changedTouches[0]?.clientX ?? null;
                        swipeStartX.current = null;
                        if (startX === null || endX === null || images.length < 2) return;
                        const deltaX = endX - startX;
                        if (Math.abs(deltaX) < 40) return;
                        moveSlide(deltaX < 0 ? "next" : "prev");
                    }}
                >
                    <Image
                        src={images[currentIndex] || ""}
                        alt={ad?.title || "Ad image"}
                        fill
                        className="object-contain"
                        unoptimized
                    />
                    {images.length > 1 && (
                        <>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    moveSlide("prev");
                                }}
                                className="absolute left-3 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/45 text-white transition hover:bg-black/65"
                            >
                                <IonIcon name="chevron-back-outline" className="text-xl" />
                            </button>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    moveSlide("next");
                                }}
                                className="absolute left-16 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/45 text-white transition hover:bg-black/65"
                            >
                                <IonIcon name="chevron-forward-outline" className="text-xl" />
                            </button>
                            <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 backdrop-blur-sm">
                                {images.map((_, index) => (
                                    <button
                                        key={`ad-secondview-dot-${index}`}
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setCurrentIndex(index);
                                        }}
                                        className={`h-2.5 w-2.5 rounded-full transition ${index === currentIndex ? "bg-white" : "bg-white/35 hover:bg-white/60"}`}
                                        aria-label={`View ad image ${index + 1}`}
                                    />
                                ))}
                            </div>
                        </>
                    )}
                    <div className="absolute right-3 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-4 rounded-[1.4rem] border border-white/10 bg-black/45 px-2 py-3 backdrop-blur-md">
                        <AdInteractionButton
                            type="likes"
                            icon="heart-outline"
                            activeIcon="heart"
                            isActive={!!ad.user_liked || !!ad.isLiked || !!ad.liked}
                            count={Number(ad?.likes_count || 0)}
                            color="text-white"
                            activeColor="text-white"
                            onSingleClick={() => onToggleLike(ad.id)}
                            onLongPress={() => onOpenSheet("likes", ad)}
                            iconSize="text-base md:text-xl"
                        />
                        <AdInteractionButton
                            type="views"
                            icon="eye-outline"
                            activeIcon="eye"
                            count={Number(ad?.views_count || 0)}
                            color="text-white"
                            activeColor="text-white"
                            onSingleClick={() => onOpenSheet("views", ad)}
                            onLongPress={() => onOpenSheet("views", ad)}
                            iconSize="text-base md:text-xl"
                        />
                        <AdInteractionButton
                            type="comments"
                            icon="chatbubble"
                            activeIcon="chatbubble"
                            count={Number(ad?.comments_count || 0)}
                            color="text-white"
                            activeColor="text-white"
                            onSingleClick={() => onOpenSheet("comments", ad)}
                            onLongPress={() => onOpenSheet("comments", ad)}
                            iconSize="text-base md:text-xl"
                        />
                        <AdInteractionButton
                            type="shares"
                            icon="share-social"
                            activeIcon="share-social"
                            count={Number(ad?.shares_count || 0)}
                            color="text-white"
                            activeColor="text-white"
                            onSingleClick={() => onShare(ad)}
                            onLongPress={() => onOpenSheet("shares", ad)}
                            iconSize="text-sm md:text-lg opacity-90"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
