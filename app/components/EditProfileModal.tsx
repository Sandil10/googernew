"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import IonIcon from "./IonIcon";
import { authService } from "@/services/authService";

interface EditProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: any;
    onUpdate: () => void;
}

export default function EditProfileModal({ isOpen, onClose, user, onUpdate }: EditProfileModalProps) {
    const [formData, setFormData] = useState({
        fullName: user?.full_name || "",
        bio: user?.bio || "",
        profilePicture: user?.profile_picture || "",
    });
    const [loading, setLoading] = useState(false);
    const [previewError, setPreviewError] = useState(false);

    // Update form data if user changes
    useEffect(() => {
        if (user) {
            setFormData({
                fullName: user.full_name || "",
                bio: user.bio || "",
                profilePicture: user.profile_picture || "",
            });
        }
    }, [user]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await authService.updateProfile(formData);

            // Trigger sync across components
            window.dispatchEvent(new Event('userProfileUpdated'));

            onUpdate();
            onClose();
        } catch (error) {
            alert("Failed to update profile. Please try again.");
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleImageError = () => {
        setPreviewError(true);
    };

    const handleImageUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setFormData({ ...formData, profilePicture: val });
        setPreviewError(false);
    };

    // Calculate preview image
    const previewImage = formData.profilePicture || "https://ui-avatars.com/api/?name=" + encodeURIComponent(formData.fullName || user.username) + "&size=200&background=random";

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 pb-20 sm:pb-6">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose}></div>

            <div className="relative w-full max-w-xl bg-[#111] rounded-[2.5rem] border border-white/10 shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/5 bg-white/5">
                    <h2 className="text-xl font-black text-white italic uppercase tracking-wider">Edit Profile</h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/10 rounded-full transition-colors"
                    >
                        <IonIcon name="close-outline" className="text-2xl text-white" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6">
                    <div className="flex flex-col md:flex-row gap-8">
                        {/* Image Preview & URL Section */}
                        <div className="flex flex-col items-center gap-4 shrink-0">
                            <div className="relative group">
                                <div className="w-32 h-32 rounded-full p-1 bg-gradient-to-tr from-blue-500 via-purple-500 to-pink-500 shadow-xl overflow-hidden">
                                    <div className="w-full h-full rounded-full border-4 border-[#111] overflow-hidden relative bg-gray-900">
                                        {!previewError ? (
                                            <Image
                                                src={previewImage}
                                                alt="Preview"
                                                fill
                                                className="object-cover"
                                                onError={handleImageError}
                                                unoptimized={true}
                                            />
                                        ) : (
                                            <div className="w-full h-full flex flex-col items-center justify-center text-gray-600 p-4 text-center">
                                                <IonIcon name="image-outline" className="text-2xl mb-1" />
                                                <span className="text-[10px] font-bold uppercase">Invalid Link</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                {formData.profilePicture && (
                                    <div className="absolute -top-1 -right-1 bg-green-500 text-white p-1 rounded-full text-[10px] animate-bounce">
                                        <IonIcon name="checkmark" />
                                    </div>
                                )}
                            </div>
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest italic">Live Preview</span>
                        </div>

                        {/* Fields Section */}
                        <div className="flex-1 space-y-4">
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2 ml-1">Profile Photo Link (Paste from Social Media)</label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={formData.profilePicture}
                                        onChange={handleImageUrlChange}
                                        placeholder="https://facebook.com/images/..."
                                        className="w-full bg-[#1c1c1c] border border-white/5 rounded-2xl px-5 py-4 text-white text-xs font-bold focus:outline-none focus:border-blue-500/50 transition-all placeholder:text-gray-700"
                                    />
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-600">
                                        <IonIcon name="link-outline" />
                                    </div>
                                </div>
                                <p className="mt-2 text-[9px] text-gray-500 italic px-2">Copy your profile photo link from Facebook or Instagram and paste it here.</p>
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2 ml-1">Full Name</label>
                                <input
                                    type="text"
                                    value={formData.fullName}
                                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                                    placeholder="Your Display Name"
                                    className="w-full bg-[#1c1c1c] border border-white/5 rounded-2xl px-5 py-4 text-white text-xs font-bold focus:outline-none focus:border-blue-500/50 transition-all placeholder:text-gray-700"
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2 ml-1">Bio / About Me</label>
                                <textarea
                                    value={formData.bio}
                                    onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                                    placeholder="Tell us about yourself..."
                                    rows={3}
                                    className="w-full bg-[#1c1c1c] border border-white/5 rounded-2xl px-5 py-4 text-white text-xs font-bold focus:outline-none focus:border-blue-500/50 transition-all placeholder:text-gray-700 resize-none"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="mt-10 flex gap-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-8 py-5 bg-[#1c1c1c] text-white text-[11px] font-black uppercase tracking-[0.2em] rounded-full border border-white/5 hover:bg-white/5 transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className={`flex-[2] px-8 py-5 ${loading ? 'bg-gray-700 cursor-not-allowed' : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:scale-[1.02]'} text-white text-[11px] font-black uppercase tracking-[0.2em] rounded-full shadow-lg shadow-blue-900/20 transition-all flex items-center justify-center gap-2`}
                        >
                            {loading ? (
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                            ) : (
                                <>
                                    <IonIcon name="cloud-upload-outline" className="text-base" />
                                    Save Changes
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
