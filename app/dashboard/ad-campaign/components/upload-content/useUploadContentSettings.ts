"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";

export type UploadContentAccessMode = "blurred" | "unblurred";

type UseUploadContentSettingsParams = {
    canBlurUploadContent: boolean;
    onError: (message: string) => void;
};

export function useUploadContentSettings({ canBlurUploadContent, onError }: UseUploadContentSettingsParams) {
    const thumbnailInputRef = useRef<HTMLInputElement | null>(null);
    const [thumbnailPreview, setThumbnailPreview] = useState("");
    const [thumbnailName, setThumbnailName] = useState("");
    const [contentAccessMode, setContentAccessMode] = useState<UploadContentAccessMode>("unblurred");

    const effectiveContentAccessMode: UploadContentAccessMode = canBlurUploadContent ? contentAccessMode : "unblurred";

    const handleThumbnailUploadClick = () => {
        thumbnailInputRef.current?.click();
    };

    const handleThumbnailChange = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith("image/")) {
            onError("Please upload an image for the thumbnail.");
            if (thumbnailInputRef.current) {
                thumbnailInputRef.current.value = "";
            }
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result !== "string") {
                onError("Thumbnail could not be read. Please try again.");
                return;
            }
            setThumbnailPreview(reader.result);
            setThumbnailName(file.name);
        };
        reader.onerror = () => {
            onError("Thumbnail could not be read. Please try again.");
        };
        reader.readAsDataURL(file);
    };

    const handleRemoveThumbnail = () => {
        setThumbnailPreview("");
        setThumbnailName("");
        if (thumbnailInputRef.current) {
            thumbnailInputRef.current.value = "";
        }
    };

    useEffect(() => {
        if (!canBlurUploadContent && contentAccessMode !== "unblurred") {
            setContentAccessMode("unblurred");
        }
    }, [canBlurUploadContent, contentAccessMode]);

    return {
        thumbnailInputRef,
        thumbnailPreview,
        thumbnailName,
        contentAccessMode,
        effectiveContentAccessMode,
        setThumbnailPreview,
        setThumbnailName,
        setContentAccessMode,
        handleThumbnailUploadClick,
        handleThumbnailChange,
        handleRemoveThumbnail,
    };
}
