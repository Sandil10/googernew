"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import IonIcon from "./IonIcon";
import { authService } from "@/services/authService";

interface EditProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: any;
    onUpdate: (updatedUser?: any) => void;
}

const MAX_PROFILE_IMAGE_BYTES = 200 * 1024;
const MAX_PROFILE_IMAGE_DIMENSION = 1200;

const readFileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read image file."));
    reader.readAsDataURL(file);
});

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image."));
    image.src = src;
});

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) => new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
        if (blob) {
            resolve(blob);
            return;
        }
        reject(new Error("Failed to compress image."));
    }, type, quality);
});

async function compressProfileImage(file: File) {
    const dataUrl = await readFileAsDataUrl(file);
    const image = await loadImage(dataUrl);

    const scale = Math.min(1, MAX_PROFILE_IMAGE_DIMENSION / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
        throw new Error("Image compression is not supported in this browser.");
    }

    context.drawImage(image, 0, 0, width, height);

    let outputType = file.type === "image/png" ? "image/webp" : (file.type || "image/jpeg");
    if (!["image/jpeg", "image/webp"].includes(outputType)) {
        outputType = "image/jpeg";
    }

    let quality = 0.9;
    let blob = await canvasToBlob(canvas, outputType, quality);

    while (blob.size > MAX_PROFILE_IMAGE_BYTES && quality > 0.45) {
        quality -= 0.08;
        blob = await canvasToBlob(canvas, outputType, quality);
    }

    if (blob.size > MAX_PROFILE_IMAGE_BYTES) {
        let currentWidth = width;
        let currentHeight = height;

        while (blob.size > MAX_PROFILE_IMAGE_BYTES && currentWidth > 320 && currentHeight > 320) {
            currentWidth = Math.round(currentWidth * 0.9);
            currentHeight = Math.round(currentHeight * 0.9);
            canvas.width = currentWidth;
            canvas.height = currentHeight;
            context.clearRect(0, 0, currentWidth, currentHeight);
            context.drawImage(image, 0, 0, currentWidth, currentHeight);
            blob = await canvasToBlob(canvas, outputType, quality);
        }
    }

    const extension = outputType === "image/webp" ? "webp" : "jpg";
    const compressedFile = new File([blob], `profile-${Date.now()}.${extension}`, { type: outputType });
    const previewUrl = await readFileAsDataUrl(compressedFile);

    return {
        file: compressedFile,
        previewUrl,
    };
}

export default function EditProfileModal({ isOpen, onClose, user, onUpdate }: EditProfileModalProps) {
    const [formData, setFormData] = useState({
        fullName: user?.full_name || "",
        bio: user?.bio || "",
        profilePicture: user?.profile_picture || "",
    });
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewError, setPreviewError] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (user) {
            setFormData({
                fullName: user.full_name || "",
                bio: user.bio || "",
                profilePicture: user.profile_picture || "",
            });
            setSelectedFile(null);
            setPreviewError(false);
            setErrorMessage("");
        }
    }, [user, isOpen]);

    const previewImage = useMemo(() => {
        if (formData.profilePicture) {
            return formData.profilePicture.startsWith("data:") || formData.profilePicture.startsWith("http")
                ? formData.profilePicture
                : `/uploads/${formData.profilePicture.split(/[\\/]/).pop()}`;
        }

        return `https://ui-avatars.com/api/?name=${encodeURIComponent(formData.fullName || user?.username || "User")}&size=240&background=162033&color=ffffff`;
    }, [formData.fullName, formData.profilePicture, user?.username]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setErrorMessage("");

        try {
            const data = new FormData();
            data.append("fullName", formData.fullName.trim());
            data.append("bio", formData.bio);
            data.append("profilePicture", formData.profilePicture);

            if (selectedFile) {
                data.append("profile_picture_file", selectedFile);
            }

            const result = await authService.updateProfile(data);
            const updatedUser = result?.user || null;
            window.dispatchEvent(new CustomEvent("userProfileUpdated", { detail: { user: updatedUser } }));
            onUpdate(updatedUser || undefined);
            onClose();
        } catch (error: any) {
            setErrorMessage(error?.message || "Failed to update profile. Please try again.");
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setErrorMessage("");
        setLoading(true);

        compressProfileImage(file)
            .then(({ file: compressedFile, previewUrl }) => {
                setSelectedFile(compressedFile);
                setFormData((prev) => ({ ...prev, profilePicture: previewUrl }));
                setPreviewError(false);
            })
            .catch((error: any) => {
                setSelectedFile(null);
                setErrorMessage(error?.message || "Failed to compress image. Please try another file.");
            })
            .finally(() => {
                setLoading(false);
            });
    };

    const handleImageUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setSelectedFile(null);
        setErrorMessage("");
        setFormData((prev) => ({ ...prev, profilePicture: value }));
        setPreviewError(false);
    };

    const clearPhoto = () => {
        setSelectedFile(null);
        setPreviewError(false);
        setFormData((prev) => ({ ...prev, profilePicture: "" }));
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    return (
        <div
            className="fixed inset-0 z-[120] flex items-end justify-center bg-black/65 backdrop-blur-md md:items-center md:p-4"
            onClick={loading ? undefined : onClose}
        >
            <div
                className="w-full max-w-[460px] overflow-hidden rounded-t-[28px] border border-white/[0.07] bg-[#0f0f0f] shadow-[0_20px_60px_rgba(0,0,0,0.5)] md:rounded-[28px]"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex justify-center pt-3 pb-1 md:hidden">
                    <div className="h-1 w-10 rounded-full bg-white/15" />
                </div>

                <div className="flex items-center gap-3 px-5 pt-4 pb-4 md:pt-5">
                    <div className="min-w-0 flex-1">
                        <h2 className="text-[15px] font-bold leading-tight text-white">Edit Profile</h2>
                        <p className="mt-0.5 text-[11px] font-medium text-white/30">
                            Update your public profile details
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.06] text-white/50 transition-all hover:bg-white/10 hover:text-white"
                    >
                        <IonIcon name="close-outline" className="text-xl" />
                    </button>
                </div>

                <div className="mx-5 h-px bg-white/[0.05]" />

                <form onSubmit={handleSubmit} className="space-y-5 p-5">
                    <div className="flex items-center gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
                        <div className="relative h-[76px] w-[76px] shrink-0 overflow-hidden rounded-full border border-white/10 bg-[#162033]">
                            {!previewError ? (
                                <Image
                                    src={previewImage}
                                    alt="Profile preview"
                                    fill
                                    className="object-cover"
                                    onError={() => setPreviewError(true)}
                                    unoptimized
                                />
                            ) : (
                                <div className="flex h-full w-full items-center justify-center text-white/40">
                                    <IonIcon name="image-outline" className="text-2xl" />
                                </div>
                            )}
                        </div>

                        <div className="min-w-0 flex-1">
                            <p className="text-[12px] font-bold text-white">Profile Photo</p>
                            <p className="mt-1 text-[10px] leading-4 text-white/35">
                                Upload a new image or paste a direct image link.
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="rounded-xl bg-white px-3 py-2 text-[11px] font-bold text-black transition-all hover:bg-white/90 active:scale-95"
                                >
                                    Upload Photo
                                </button>
                                <button
                                    type="button"
                                    onClick={clearPhoto}
                                    className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] font-bold text-white/75 transition-all hover:bg-white/[0.08]"
                                >
                                    Remove
                                </button>
                            </div>
                        </div>
                    </div>

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleFileChange}
                    />

                    <div className="space-y-2">
                        <label className="block px-1 text-[10px] font-semibold uppercase tracking-widest text-white/35">
                            Photo Link
                        </label>
                        <div className="relative">
                            <input
                                type="text"
                                value={formData.profilePicture.startsWith("data:") ? "" : formData.profilePicture}
                                onChange={handleImageUrlChange}
                                placeholder="Paste image URL..."
                                className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.05] px-4 py-3 pr-11 text-[13px] font-medium text-white placeholder:text-white/15 focus:border-blue-500/50 focus:bg-white/[0.07] focus:outline-none"
                            />
                            <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-white/20">
                                <IonIcon name="link-outline" className="text-base" />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="block px-1 text-[10px] font-semibold uppercase tracking-widest text-white/35">
                            Full Name
                        </label>
                        <input
                            type="text"
                            value={formData.fullName}
                            onChange={(e) => setFormData((prev) => ({ ...prev, fullName: e.target.value }))}
                            placeholder="Your display name"
                            className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.05] px-4 py-3 text-[13px] font-medium text-white placeholder:text-white/15 focus:border-blue-500/50 focus:bg-white/[0.07] focus:outline-none"
                        />
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3 px-1">
                            <label className="block text-[10px] font-semibold uppercase tracking-widest text-white/35">
                                Bio
                            </label>
                            <button
                                type="button"
                                onClick={() => setFormData((prev) => ({ ...prev, bio: "" }))}
                                className="text-[10px] font-semibold uppercase tracking-widest text-white/30 transition hover:text-white/60"
                            >
                                Clear
                            </button>
                        </div>
                        <textarea
                            value={formData.bio}
                            onChange={(e) => setFormData((prev) => ({ ...prev, bio: e.target.value }))}
                            placeholder="Tell people about yourself..."
                            rows={4}
                            className="w-full resize-none rounded-2xl border border-white/[0.08] bg-white/[0.05] px-4 py-3 text-[13px] font-medium leading-6 text-white placeholder:text-white/15 focus:border-blue-500/50 focus:bg-white/[0.07] focus:outline-none"
                        />
                        <p className="px-1 text-[10px] text-white/20">
                            Changes save directly to your profile data.
                        </p>
                    </div>

                    {errorMessage && (
                        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[11px] font-medium text-red-300">
                            {errorMessage}
                        </div>
                    )}

                    <div className="flex gap-3 pt-1">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-white transition-all hover:bg-white/[0.08]"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className={`flex-[1.35] rounded-2xl px-4 py-3 text-[11px] font-bold uppercase tracking-[0.18em] transition-all ${loading ? "cursor-not-allowed bg-white/15 text-white/45" : "bg-blue-600 text-white hover:bg-blue-500 active:scale-[0.98]"}`}
                        >
                            {loading ? "Saving..." : "Save Changes"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
