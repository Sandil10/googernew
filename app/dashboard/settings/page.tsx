"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import IonIcon from "@/app/components/IonIcon";
import { authService } from "@/services/authService";
import { formatGoogerId } from "@/app/lib/userDisplay";

type SettingsUser = {
    id?: number;
    user_id?: string | number;
    googer_id?: string | number;
    user_type?: string;
    username?: string;
    full_name?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    contact_email?: string;
    bio?: string;
    profile_picture?: string;
    phone_number?: string;
    country?: string;
    province?: string;
    date_of_birth?: string;
    gender?: string;
    relationship_status?: string;
    who_can_follow_me?: string;
    who_can_see_activity?: string;
    contact_email_visibility?: string;
    contact_phone_visibility?: string;
    shipping_address?: {
        country?: string;
        province?: string;
    };
};

type CountryOption = {
    code: string;
    name: string;
};

const EDIT_TABS = [
    { key: "general", label: "General" },
    { key: "password", label: "Password" },
    { key: "privacy", label: "Privacy" },
    { key: "security", label: "Security" },
] as const;

type EditTabKey = (typeof EDIT_TABS)[number]["key"];

const GENDER_OPTIONS = ["Male", "Female", "Other"];
const RELATIONSHIP_OPTIONS = ["Single", "Married", "In a Relationship", "Prefer not to say"];

const MAX_PROFILE_IMAGE_BYTES = 200 * 1024;
const MAX_PROFILE_IMAGE_DIMENSION = 1200;
const MAX_BIO_LENGTH = 50;
const MAX_BIO_LINKS = 2;
const TODAY_DATE_STRING = new Date().toISOString().slice(0, 10);

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
    if (!context) throw new Error("Image compression is not supported in this browser.");

    context.drawImage(image, 0, 0, width, height);

    let outputType = file.type === "image/png" ? "image/webp" : (file.type || "image/jpeg");
    if (!["image/jpeg", "image/webp"].includes(outputType)) outputType = "image/jpeg";

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

    return { file: compressedFile, previewUrl };
}

function getInitials(name?: string) {
    if (!name) return "G";
    const parts = name.trim().split(/\s+/).slice(0, 2);
    return parts.map((part) => part[0]?.toUpperCase() || "").join("") || "G";
}

function getProfileImageSrc(user: SettingsUser | null, preview?: string | null) {
    if (preview) return preview;
    if (!user) return "";
    if (user.profile_picture) {
        return user.profile_picture.startsWith("http") || user.profile_picture.startsWith("data:")
            ? user.profile_picture
            : `/uploads/${user.profile_picture.split(/[\\/]/).pop()}`;
    }
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(user.full_name || user.username || "Googer")}&size=240&background=111111&color=ffffff`;
}

export default function SettingsPage() {
    const router = useRouter();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [activeTab, setActiveTab] = useState<EditTabKey>("general");
    const [user, setUser] = useState<SettingsUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [savingGeneral, setSavingGeneral] = useState(false);
    const [savingPrivacy, setSavingPrivacy] = useState(false);
    const [savingPassword, setSavingPassword] = useState(false);
    const [notification, setNotification] = useState<{ type: "error" | "success"; message: string } | null>(null);
    const [generalForm, setGeneralForm] = useState({
        username: "",
        firstName: "",
        lastName: "",
        registeredEmail: "",
        contactEmail: "",
        phoneNumber: "",
        country: "",
        province: "",
        dateOfBirth: "",
        bio: "",
        gender: "",
        relationshipStatus: "",
        contactEmailVisibility: "public",
        contactPhoneVisibility: "public",
    });
    const [generalErrors, setGeneralErrors] = useState<{ firstName?: string; username?: string; country?: string; dateOfBirth?: string; gender?: string }>({});
    const [isCheckingUsername, setIsCheckingUsername] = useState(false);
    const [usernameError, setUsernameError] = useState("");
    const [openPicker, setOpenPicker] = useState<null | "gender" | "relationship" | "country">(null);
    const [countries, setCountries] = useState<CountryOption[]>([]);
    const [countrySearch, setCountrySearch] = useState("");
    const [bioLinkDraft, setBioLinkDraft] = useState("");
    const [isUploadLinkModalOpen, setIsUploadLinkModalOpen] = useState(false);
    const [uploadLinkDraft, setUploadLinkDraft] = useState("");
    const [privacyForm, setPrivacyForm] = useState({
        whoCanFollowMe: "everyone",
        whoCanSeeActivity: "followers",
    });
    const [passwordForm, setPasswordForm] = useState({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
    });
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [isDeletingAccount, setIsDeletingAccount] = useState(false);
    const [showDeactivateModal, setShowDeactivateModal] = useState(false);
    const [isDeactivatingAccount, setIsDeactivatingAccount] = useState(false);

    const handleDeactivateAccount = async () => {
        try {
            setIsDeactivatingAccount(true);
            await authService.selfDeactivateAccount();
            authService.logout();
        } catch (err: any) {
            setNotification({ type: "error", message: err?.message || "Could not deactivate your account." });
        } finally {
            setIsDeactivatingAccount(false);
            setShowDeactivateModal(false);
        }
    };

    const handleDeleteAccount = async () => {
        try {
            setIsDeletingAccount(true);
            await authService.selfDeleteAccount();
            router.replace("/");
        } catch (err: any) {
            setNotification({ type: "error", message: err?.message || "Could not delete your account." });
        } finally {
            setIsDeletingAccount(false);
            setShowDeleteModal(false);
        }
    };

    const applyUserToForms = useCallback((profile: SettingsUser) => {
        setGeneralForm({
            username: profile.username || "",
            firstName: profile.first_name || "",
            lastName: profile.last_name || "",
            registeredEmail: profile.email || "",
            contactEmail: profile.contact_email || "",
            phoneNumber: profile.phone_number || "",
            country: profile.country || profile.shipping_address?.country || "",
            province: profile.province || profile.shipping_address?.province || "",
            dateOfBirth: profile.date_of_birth ? String(profile.date_of_birth).slice(0, 10) : "",
            bio: profile.bio || "",
            gender: profile.gender || "",
            relationshipStatus: profile.relationship_status || "",
            contactEmailVisibility: profile.contact_email_visibility || "public",
            contactPhoneVisibility: profile.contact_phone_visibility || "public",
        });
        setPrivacyForm({
            whoCanFollowMe: profile.who_can_follow_me || "everyone",
            whoCanSeeActivity: profile.who_can_see_activity || "followers",
        });
    }, []);

    const fetchProfile = useCallback(async () => {
        try {
            setLoading(true);
            if (!authService.isAuthenticated()) {
                router.push("/");
                return;
            }
            const profile = await authService.getProfile();
            setUser(profile);
            applyUserToForms(profile);
        } catch (error) {
            console.error("Error fetching settings profile:", error);
            router.push("/");
        } finally {
            setLoading(false);
        }
    }, [applyUserToForms, router]);

    useEffect(() => {
        fetchProfile();
    }, [fetchProfile]);

    useEffect(() => {
        if (!notification) return;
        const timer = window.setTimeout(() => setNotification(null), 2600);
        return () => window.clearTimeout(timer);
    }, [notification]);

    useEffect(() => {
        let ignore = false;

        fetch("https://flagcdn.com/en/codes.json")
            .then((res) => res.json())
            .then((data) => {
                if (ignore) return;
                const countryList = Object.entries(data)
                    .filter(([code]) => code.length === 2)
                    .map(([code, name]) => ({ code, name: String(name) }))
                    .sort((a, b) => a.name.localeCompare(b.name));
                setCountries(countryList);
            })
            .catch((error) => console.error("Error fetching countries:", error));

        return () => {
            ignore = true;
        };
    }, []);

    useEffect(() => {
        const nextErrors: { firstName?: string; username?: string; country?: string; dateOfBirth?: string; gender?: string } = {};
        if (!generalForm.firstName.trim()) nextErrors.firstName = "First name is required";
        if (!generalForm.username.trim()) nextErrors.username = "Username is required";
        if (!generalForm.country.trim()) nextErrors.country = "Country is required";
        if (!generalForm.dateOfBirth) nextErrors.dateOfBirth = "Date of birth is required";
        if (generalForm.dateOfBirth && generalForm.dateOfBirth > TODAY_DATE_STRING) nextErrors.dateOfBirth = "Date of birth cannot be in the future";
        if (!generalForm.gender.trim()) nextErrors.gender = "Gender is required";
        setGeneralErrors(nextErrors);
    }, [generalForm.country, generalForm.dateOfBirth, generalForm.firstName, generalForm.gender, generalForm.username]);

    useEffect(() => {
        const username = generalForm.username.trim();
        if (!username) {
            setUsernameError("");
            setIsCheckingUsername(false);
            return;
        }
        if (username === (user?.username || "")) {
            setUsernameError("");
            setIsCheckingUsername(false);
            return;
        }

        const timer = window.setTimeout(async () => {
            try {
                setIsCheckingUsername(true);
                const available = await authService.checkUsernameAvailability(username);
                setUsernameError(available ? "" : "Username already exists");
            } catch {
                setUsernameError("");
            } finally {
                setIsCheckingUsername(false);
            }
        }, 350);

        return () => window.clearTimeout(timer);
    }, [generalForm.username, user?.username]);

    const profileImage = useMemo(() => getProfileImageSrc(user, imagePreview), [user, imagePreview]);
    const filteredCountries = useMemo(() => countries.filter((country) => (
        country.name.toLowerCase().includes(countrySearch.toLowerCase())
    )), [countries, countrySearch]);
    const selectedCountryOption = useMemo(() => countries.find((country) => country.name === generalForm.country) || null, [countries, generalForm.country]);
    const bioLinks = useMemo(() => {
        const matches = generalForm.bio.match(/(https?:\/\/[^\s]+|www\.[^\s]+)/gi) || [];
        return matches.slice(0, MAX_BIO_LINKS);
    }, [generalForm.bio]);
    const bioTextLength = useMemo(() => {
        const stripped = generalForm.bio.replace(/(https?:\/\/[^\s]+|www\.[^\s]+)/gi, "").replace(/\s+/g, " ").trim();
        return stripped.length;
    }, [generalForm.bio]);
    const displayName = useMemo(() => {
        const first = generalForm.firstName.trim();
        const last = generalForm.lastName.trim();
        return [first, last].filter(Boolean).join(" ").trim() || user?.full_name || user?.username || "Googer User";
    }, [generalForm.firstName, generalForm.lastName, user?.full_name, user?.username]);

    const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const { file: compressedFile, previewUrl } = await compressProfileImage(file);
            setSelectedFile(compressedFile);
            setImagePreview(previewUrl);
        } catch (error: any) {
            setNotification({ type: "error", message: error?.message || "Failed to prepare image." });
        }
    };

    const handleUploadLink = () => {
        const trimmed = uploadLinkDraft.trim();
        if (!trimmed) return;
        if (!/^https?:\/\//i.test(trimmed) && !/^data:/i.test(trimmed)) {
            setNotification({ type: "error", message: "Please enter a valid image URL." });
            return;
        }

        setSelectedFile(null);
        setImagePreview(trimmed);
        setUploadLinkDraft("");
        setIsUploadLinkModalOpen(false);
    };

    const handleAddBioLink = () => {
        const trimmed = bioLinkDraft.trim();
        if (!trimmed) return;
        if (bioLinks.length >= MAX_BIO_LINKS) {
            setNotification({ type: "error", message: "You can add a maximum of 2 links." });
            return;
        }

        const normalizedLink = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
        setGeneralForm((prev) => ({
            ...prev,
            bio: prev.bio.trim() ? `${prev.bio.trim()}\n${normalizedLink}` : normalizedLink,
        }));
        setBioLinkDraft("");
    };

    const handleSaveGeneral = async () => {
        if (!generalForm.firstName.trim() || !generalForm.username.trim() || !generalForm.country.trim() || !generalForm.dateOfBirth || !generalForm.gender.trim()) {
            setNotification({ type: "error", message: "First name, username, country, gender, and date of birth are required." });
            return;
        }
        if (generalForm.dateOfBirth > TODAY_DATE_STRING) {
            setNotification({ type: "error", message: "Date of birth cannot be in the future." });
            return;
        }
        if (bioTextLength > MAX_BIO_LENGTH) {
            setNotification({ type: "error", message: "Bio must be 50 characters or less." });
            return;
        }
        if (bioLinks.length > MAX_BIO_LINKS) {
            setNotification({ type: "error", message: "You can add a maximum of 2 links." });
            return;
        }
        if (usernameError) {
            setNotification({ type: "error", message: "Please choose a unique username." });
            return;
        }
        try {
            setSavingGeneral(true);
            const data = new FormData();
            data.append("username", generalForm.username.trim());
            data.append("firstName", generalForm.firstName.trim());
            data.append("lastName", generalForm.lastName.trim());
            data.append("fullName", displayName);
            data.append("email", generalForm.registeredEmail.trim());
            data.append("contactEmail", generalForm.contactEmail.trim());
            data.append("phoneNumber", generalForm.phoneNumber.trim());
            data.append("country", generalForm.country.trim());
            data.append("province", generalForm.province.trim());
            data.append("dateOfBirth", generalForm.dateOfBirth);
            data.append("bio", generalForm.bio);
            data.append("gender", generalForm.gender);
            data.append("relationshipStatus", generalForm.relationshipStatus);
            data.append("contactEmailVisibility", generalForm.contactEmailVisibility);
            data.append("contactPhoneVisibility", generalForm.contactPhoneVisibility);
            data.append("whoCanFollowMe", privacyForm.whoCanFollowMe);
            data.append("whoCanSeeActivity", privacyForm.whoCanSeeActivity);
            if (imagePreview) {
                data.append("profilePicture", imagePreview);
            }
            if (selectedFile) {
                data.append("profile_picture_file", selectedFile);
            }

            const result = await authService.updateProfile(data);
            const updatedUser = result?.user;
            if (updatedUser) {
                setUser((prev) => ({ ...prev, ...updatedUser }));
                applyUserToForms({ ...(user || {}), ...updatedUser });
                window.dispatchEvent(new CustomEvent("userProfileUpdated", { detail: { user: updatedUser } }));
            }
            setSelectedFile(null);
            setImagePreview(null);
            setNotification({ type: "success", message: "General profile details updated." });
        } catch (error: any) {
            setNotification({ type: "error", message: error?.message || "Failed to save profile." });
        } finally {
            setSavingGeneral(false);
        }
    };

    const handleCancelGeneral = () => {
        if (user) applyUserToForms(user);
        setSelectedFile(null);
        setImagePreview(null);
        setBioLinkDraft("");
        setUploadLinkDraft("");
        setIsUploadLinkModalOpen(false);
        setCountrySearch("");
        setOpenPicker(null);
    };

    const handleSavePrivacy = async () => {
        try {
            setSavingPrivacy(true);
            const result = await authService.updateProfile({
                whoCanFollowMe: privacyForm.whoCanFollowMe,
                whoCanSeeActivity: privacyForm.whoCanSeeActivity,
            });
            const updatedUser = result?.user;
            if (updatedUser) {
                setUser((prev) => ({ ...prev, ...updatedUser }));
                applyUserToForms({ ...(user || {}), ...updatedUser });
                window.dispatchEvent(new CustomEvent("userProfileUpdated", { detail: { user: updatedUser } }));
            }
            setNotification({ type: "success", message: "Privacy settings updated." });
        } catch (error: any) {
            setNotification({ type: "error", message: error?.message || "Failed to update privacy settings." });
        } finally {
            setSavingPrivacy(false);
        }
    };

    const handleChangePassword = async () => {
        if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
            setNotification({ type: "error", message: "Please fill in all password fields." });
            return;
        }
        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
            setNotification({ type: "error", message: "New passwords do not match." });
            return;
        }
        try {
            setSavingPassword(true);
            await authService.changePassword(passwordForm.currentPassword, passwordForm.newPassword);
            setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
            setNotification({ type: "success", message: "Password changed successfully." });
        } catch (error: any) {
            setNotification({ type: "error", message: error?.message || "Failed to change password." });
        } finally {
            setSavingPassword(false);
        }
    };

    if (loading) {
        return <div className="flex min-h-[60vh] items-center justify-center text-zinc-400">Loading settings</div>;
    }

    if (!user) return null;

    return (
        <div className="mx-auto max-w-[1280px] pb-10 text-white">
            {notification && (
                <div className={`fixed right-4 top-4 z-[120] rounded-2xl border px-4 py-3 text-sm ${notification.type === "success" ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300" : "border-red-500/30 bg-red-500/15 text-red-300"}`}>
                    {notification.message}
                </div>
            )}

            <section className="overflow-hidden rounded-[2rem] border border-white/8 bg-[#0c0c0f] shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
                <div className="flex items-center justify-between border-b border-white/8 px-5 py-4 min-[960px]:px-6">
                    <div>
                        <h1 className="text-lg font-black tracking-tight text-white">Settings</h1>
                        <p className="mt-1 text-xs text-white/45">Manage your profile and account.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => router.push("/dashboard/profile")}
                            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2 text-xs font-bold text-white transition hover:bg-white/[0.07]"
                        >
                            <IonIcon name="arrow-back-outline" className="text-sm" />
                            Profile
                        </button>
                    </div>
                </div>

                <div className="space-y-5 px-5 py-5 min-[960px]:px-6">
                    <div className="flex flex-col gap-4 rounded-3xl border border-white/8 bg-white/[0.03] p-4 min-[900px]:flex-row min-[900px]:items-center min-[900px]:justify-between">
                        <div className="flex items-center gap-4">
                            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-white/10 bg-white">
                                {profileImage ? (
                                    <Image src={profileImage} alt={displayName} fill className="object-cover" unoptimized />
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center bg-zinc-800 text-xl font-black">
                                        {getInitials(displayName)}
                                    </div>
                                )}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-lg font-black text-white">{displayName}</p>
                                <p className="mt-1 truncate text-sm text-zinc-400">@{generalForm.username || user.username}</p>
                                <p className="mt-1 truncate text-xs text-zinc-500">Googer ID: {formatGoogerId(user.user_id || user.googer_id || user.id)}</p>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-3">
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="rounded-xl bg-white px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-black transition hover:bg-zinc-200"
                            >
                                Upload Photo
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsUploadLinkModalOpen(true)}
                                className="rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white transition hover:bg-white/[0.1]"
                            >
                                Upload Link
                            </button>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="overflow-hidden rounded-3xl border border-white/8 bg-white/[0.03]">
                            <div className="flex flex-nowrap items-center gap-2 overflow-x-auto border-b border-white/8 px-3 py-3 min-[960px]:px-4">
                                {EDIT_TABS.map((tab) => (
                                    <button
                                        key={tab.key}
                                        type="button"
                                        onClick={() => setActiveTab(tab.key)}
                                        aria-selected={activeTab === tab.key}
                                        className={`shrink-0 rounded-2xl px-4 py-2.5 text-sm font-bold transition ${
                                            activeTab === tab.key
                                                ? "bg-white text-black shadow-[0_10px_25px_rgba(255,255,255,0.14)]"
                                                : "border border-white/10 bg-white/[0.02] text-white hover:bg-white/[0.05]"
                                        }`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {activeTab === "general" && (
                            <section className="rounded-3xl border border-white/8 bg-white/[0.03] p-5">
                                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />

                                <div className="grid gap-4 min-[1040px]:grid-cols-[minmax(0,1.35fr)_minmax(240px,0.65fr)]">
                                    <div className="space-y-2">
                                        <div className="flex items-end justify-between gap-3">
                                            <div>
                                            <h3 className="text-sm font-black text-white">Bio</h3>
                                            <p className="mt-1 text-xs text-white/45">Write a short profile intro with links, mentions, or hashtags.</p>
                                            </div>
                                            <span className="text-[11px] font-semibold text-white/45">{bioTextLength}/{MAX_BIO_LENGTH}</span>
                                        </div>
                                        <textarea
                                            rows={7}
                                            value={generalForm.bio}
                                            onChange={(e) => {
                                                const nextValue = e.target.value;
                                                const nextTextLength = nextValue.replace(/(https?:\/\/[^\s]+|www\.[^\s]+)/gi, "").replace(/\s+/g, " ").trim().length;
                                                if (nextTextLength > MAX_BIO_LENGTH) return;
                                                setGeneralForm((prev) => ({ ...prev, bio: nextValue }));
                                            }}
                                            className="w-full resize-none rounded-[1.4rem] border border-white/[0.08] bg-[#111114] px-4 py-3.5 text-sm text-white focus:border-blue-500/50 focus:outline-none"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <div>
                                            <h4 className="text-sm font-black text-white">Add Link</h4>
                                            <p className="mt-1 text-xs text-white/40">Add up to 2 links.</p>
                                        </div>
                                        <div className="rounded-[1.4rem] border border-white/[0.08] bg-white/[0.03] p-4">
                                            <div className="flex items-center gap-2">
                                                <input
                                                    value={bioLinkDraft}
                                                    onChange={(e) => setBioLinkDraft(e.target.value)}
                                                    placeholder="your-site.com"
                                                    className="w-full max-w-[180px] rounded-2xl border border-white/[0.08] bg-[#111114] px-3.5 py-2.5 text-sm text-white placeholder:text-white/20 focus:border-blue-500/50 focus:outline-none"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={handleAddBioLink}
                                                    className="shrink-0 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white transition hover:bg-white/[0.1]"
                                                >
                                                    Add Link
                                                </button>
                                            </div>
                                            <p className="mt-2 text-[10px] font-semibold text-white/35">{bioLinks.length}/{MAX_BIO_LINKS} links added</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid gap-4 min-[860px]:grid-cols-2">
                                    <label className="space-y-2">
                                        <span className="text-[11px] font-semibold uppercase tracking-widest text-white/35">First Name <span className="text-red-400">*</span></span>
                                        <input value={generalForm.firstName} onChange={(e) => setGeneralForm((prev) => ({ ...prev, firstName: e.target.value }))} className={`w-full rounded-2xl border bg-white/[0.05] px-4 py-3 text-sm text-white focus:border-blue-500/50 focus:outline-none ${generalErrors.firstName ? "border-red-500/60" : "border-white/[0.08]"}`} />
                                        {generalErrors.firstName && <p className="text-xs text-red-300">{generalErrors.firstName}</p>}
                                    </label>
                                    <label className="space-y-2">
                                        <span className="text-[11px] font-semibold uppercase tracking-widest text-white/35">Last Name</span>
                                        <input value={generalForm.lastName} onChange={(e) => setGeneralForm((prev) => ({ ...prev, lastName: e.target.value }))} className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.05] px-4 py-3 text-sm text-white focus:border-blue-500/50 focus:outline-none" />
                                    </label>
                                </div>

                                <div className="mt-4 grid gap-4 min-[860px]:grid-cols-2">
                                    <label className="space-y-2">
                                        <span className="text-[11px] font-semibold uppercase tracking-widest text-white/35">Username <span className="text-red-400">*</span></span>
                                        <input value={generalForm.username} onChange={(e) => setGeneralForm((prev) => ({ ...prev, username: e.target.value.toLowerCase() }))} className={`w-full rounded-2xl border bg-white/[0.05] px-4 py-3 text-sm text-white placeholder:text-white/15 focus:border-blue-500/50 focus:outline-none ${generalErrors.username || usernameError ? "border-red-500/60" : "border-white/[0.08]"}`} />
                                        {isCheckingUsername && !usernameError && <p className="text-xs text-white/45">Checking username...</p>}
                                        {usernameError ? <p className="text-xs text-red-300">{usernameError}</p> : generalErrors.username ? <p className="text-xs text-red-300">{generalErrors.username}</p> : null}
                                    </label>
                                    <label className="space-y-2">
                                        <span className="text-[11px] font-semibold uppercase tracking-widest text-white/35">Date of Birth <span className="text-red-400">*</span></span>
                                        <input type="date" max={TODAY_DATE_STRING} value={generalForm.dateOfBirth} onChange={(e) => setGeneralForm((prev) => ({ ...prev, dateOfBirth: e.target.value }))} className={`w-full rounded-2xl border bg-white/[0.05] px-4 py-3 text-sm text-white focus:border-blue-500/50 focus:outline-none ${generalErrors.dateOfBirth ? "border-red-500/60" : "border-white/[0.08]"}`} />
                                        {generalErrors.dateOfBirth && <p className="text-xs text-red-300">{generalErrors.dateOfBirth}</p>}
                                    </label>
                                </div>

                                <div className="mt-4 grid gap-4 min-[860px]:grid-cols-2">
                                    <div className="space-y-2">
                                        <span className="text-[11px] font-semibold uppercase tracking-widest text-white/35">Country <span className="text-red-400">*</span></span>
                                        <div className="relative">
                                            <button
                                                type="button"
                                                onClick={() => setOpenPicker((prev) => prev === "country" ? null : "country")}
                                                className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-sm transition ${generalErrors.country ? "border-red-500/60 bg-white/[0.04]" : "border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03))] hover:bg-white/[0.08]"}`}
                                            >
                                                <div className="flex min-w-0 items-center gap-2">
                                                    {selectedCountryOption && (
                                                        <img
                                                            src={`https://flagcdn.com/w20/${selectedCountryOption.code}.png`}
                                                            width="18"
                                                            alt={generalForm.country}
                                                            className="rounded-sm opacity-90"
                                                        />
                                                    )}
                                                    <span className={generalForm.country ? "truncate text-white" : "truncate text-white/45"}>
                                                        {generalForm.country || "Select country"}
                                                    </span>
                                                </div>
                                                <IonIcon name={openPicker === "country" ? "chevron-up-outline" : "chevron-down-outline"} className="text-base text-white/65" />
                                            </button>
                                            {openPicker === "country" && (
                                                <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-white/10 bg-[#151515] p-2 shadow-2xl">
                                                    <div className="relative mb-2">
                                                        <input
                                                            type="text"
                                                            placeholder="Search Country..."
                                                            value={countrySearch}
                                                            onChange={(e) => setCountrySearch(e.target.value)}
                                                            className="w-full rounded-xl border border-white/5 bg-white/5 px-9 py-2 text-[11px] text-white outline-none transition-all placeholder:text-white/20 focus:bg-white/10"
                                                        />
                                                        <IonIcon name="search" className="absolute left-3.5 top-2.5 text-[10px] text-white/20" />
                                                    </div>
                                                    <div className="max-h-52 overflow-y-auto px-1">
                                                        {filteredCountries.map((country) => (
                                                            <button
                                                                key={country.code}
                                                                type="button"
                                                                onClick={() => {
                                                                    setGeneralForm((prev) => ({ ...prev, country: country.name }));
                                                                    setOpenPicker(null);
                                                                    setCountrySearch("");
                                                                }}
                                                                className="mb-1 flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.1em] text-white/60 transition-all hover:bg-white/10 hover:text-white"
                                                            >
                                                                <img
                                                                    src={`https://flagcdn.com/w20/${country.code}.png`}
                                                                    width="16"
                                                                    alt={country.name}
                                                                    className="rounded-sm"
                                                                />
                                                                <span className="truncate">{country.name}</span>
                                                            </button>
                                                        ))}
                                                        {filteredCountries.length === 0 && (
                                                            <p className="py-4 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-white/25">No matches found</p>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        {generalErrors.country && <p className="text-xs text-red-300">{generalErrors.country}</p>}
                                    </div>
                                    <label className="space-y-2">
                                        <span className="text-[11px] font-semibold uppercase tracking-widest text-white/35">Province</span>
                                        <input value={generalForm.province} onChange={(e) => setGeneralForm((prev) => ({ ...prev, province: e.target.value }))} placeholder="Province / State" className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.05] px-4 py-3 text-sm text-white placeholder:text-white/20 focus:border-blue-500/50 focus:outline-none" />
                                    </label>
                                </div>

                                <div className="mt-4 grid gap-4 min-[860px]:grid-cols-2">
                                    <label className="space-y-2">
                                        <span className="text-[11px] font-semibold uppercase tracking-widest text-white/35">Registered Email</span>
                                        <input type="email" value={generalForm.registeredEmail} readOnly className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-white/70 focus:outline-none" />
                                    </label>
                                    <label className="space-y-2">
                                        <span className="text-[11px] font-semibold uppercase tracking-widest text-white/35">Googer ID</span>
                                        <input value={formatGoogerId(user?.user_id || user?.googer_id || user?.id)} readOnly className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-white/70 focus:outline-none" />
                                    </label>
                                </div>

                                <div className="mt-4 grid gap-4 min-[860px]:grid-cols-2">
                                    <div className="space-y-2">
                                        <span className="text-[11px] font-semibold uppercase tracking-widest text-white/35">Gender <span className="text-red-400">*</span></span>
                                        <div className="relative">
                                            <button
                                                type="button"
                                                onClick={() => setOpenPicker((prev) => prev === "gender" ? null : "gender")}
                                                className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-sm text-white transition ${generalErrors.gender ? "border-red-500/60 bg-white/[0.04]" : "border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03))] hover:bg-white/[0.08]"}`}
                                            >
                                                <span className={generalForm.gender ? "text-white" : "text-white/45"}>{generalForm.gender || "Select gender"}</span>
                                                <IonIcon name={openPicker === "gender" ? "chevron-up-outline" : "chevron-down-outline"} className="text-base text-white/65" />
                                            </button>
                                            {openPicker === "gender" && (
                                                <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-white/10 bg-[#151515] p-2 shadow-2xl">
                                                    {GENDER_OPTIONS.map((option) => (
                                                        <button
                                                            key={option}
                                                            type="button"
                                                            onClick={() => {
                                                                setGeneralForm((prev) => ({ ...prev, gender: option }));
                                                                setOpenPicker(null);
                                                            }}
                                                            className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition ${generalForm.gender === option ? "bg-white text-black" : "text-white hover:bg-white/[0.06]"}`}
                                                        >
                                                            <span>{option}</span>
                                                            {generalForm.gender === option && <IonIcon name="checkmark-outline" className="text-base" />}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        {generalErrors.gender && <p className="text-xs text-red-300">{generalErrors.gender}</p>}
                                    </div>
                                    <div className="space-y-2">
                                        <span className="text-[11px] font-semibold uppercase tracking-widest text-white/35">Relationship Status</span>
                                        <div className="relative">
                                            <button
                                                type="button"
                                                onClick={() => setOpenPicker((prev) => prev === "relationship" ? null : "relationship")}
                                                className="flex w-full items-center justify-between rounded-2xl border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03))] px-4 py-3 text-sm text-white transition hover:bg-white/[0.08]"
                                            >
                                                <span className={generalForm.relationshipStatus ? "text-white" : "text-white/45"}>{generalForm.relationshipStatus || "Select relationship status"}</span>
                                                <IonIcon name={openPicker === "relationship" ? "chevron-up-outline" : "chevron-down-outline"} className="text-base text-white/65" />
                                            </button>
                                            {openPicker === "relationship" && (
                                                <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-white/10 bg-[#151515] p-2 shadow-2xl">
                                                    {RELATIONSHIP_OPTIONS.map((option) => (
                                                        <button
                                                            key={option}
                                                            type="button"
                                                            onClick={() => {
                                                                setGeneralForm((prev) => ({ ...prev, relationshipStatus: option }));
                                                                setOpenPicker(null);
                                                            }}
                                                            className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition ${generalForm.relationshipStatus === option ? "bg-white text-black" : "text-white hover:bg-white/[0.06]"}`}
                                                        >
                                                            <span>{option}</span>
                                                            {generalForm.relationshipStatus === option && <IonIcon name="checkmark-outline" className="text-base" />}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                                    <div className="mb-4">
                                        <h3 className="text-sm font-black text-white">Contacts</h3>
                                        <p className="mt-1 text-xs text-white/45">Manage public contact details separately from your registered email.</p>
                                    </div>
                                    <div className="grid gap-4 min-[860px]:grid-cols-2">
                                        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4">
                                            <div className="mb-3 flex items-center justify-between gap-3">
                                                <span className="text-[11px] font-semibold uppercase tracking-widest text-white/35">Contact Email</span>
                                                <button
                                                    type="button"
                                                    onClick={() => setGeneralForm((prev) => ({ ...prev, contactEmailVisibility: prev.contactEmailVisibility === "public" ? "only_me" : "public" }))}
                                                    className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-[#151515] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white transition hover:bg-white/[0.08]"
                                                >
                                                    <IonIcon name={generalForm.contactEmailVisibility === "public" ? "eye-outline" : "lock-closed-outline"} className="text-xs" />
                                                    {generalForm.contactEmailVisibility === "public" ? "Public" : "Only Me"}
                                                </button>
                                            </div>
                                            <input type="email" value={generalForm.contactEmail} onChange={(e) => setGeneralForm((prev) => ({ ...prev, contactEmail: e.target.value }))} className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.05] px-4 py-3 text-sm text-white focus:border-blue-500/50 focus:outline-none" />
                                        </div>
                                        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4">
                                            <div className="mb-3 flex items-center justify-between gap-3">
                                                <span className="text-[11px] font-semibold uppercase tracking-widest text-white/35">Phone Number</span>
                                                <button
                                                    type="button"
                                                    onClick={() => setGeneralForm((prev) => ({ ...prev, contactPhoneVisibility: prev.contactPhoneVisibility === "public" ? "only_me" : "public" }))}
                                                    className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-[#151515] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white transition hover:bg-white/[0.08]"
                                                >
                                                    <IonIcon name={generalForm.contactPhoneVisibility === "public" ? "eye-outline" : "lock-closed-outline"} className="text-xs" />
                                                    {generalForm.contactPhoneVisibility === "public" ? "Public" : "Only Me"}
                                                </button>
                                            </div>
                                            <input value={generalForm.phoneNumber} onChange={(e) => setGeneralForm((prev) => ({ ...prev, phoneNumber: e.target.value }))} className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.05] px-4 py-3 text-sm text-white focus:border-blue-500/50 focus:outline-none" />
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-5 flex gap-3">
                                    <button type="button" onClick={handleCancelGeneral} className="flex-1 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-white transition hover:bg-white/[0.08]">Cancel</button>
                                    <button type="button" onClick={handleSaveGeneral} disabled={savingGeneral} className="flex-1 rounded-2xl bg-white px-4 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60">{savingGeneral ? "Saving..." : "Save"}</button>
                                </div>
                            </section>
                        )}

                        {activeTab === "password" && (
                            <section className="rounded-3xl border border-white/8 bg-white/[0.03] p-5">
                                <div className="mb-4">
                                    <h2 className="text-base font-black text-white">Password</h2>
                                    <p className="mt-1 text-xs text-white/45">Change your account password.</p>
                                </div>
                                <div className="grid gap-4 min-[960px]:grid-cols-3">
                                    <input type="password" placeholder="Current password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))} className="rounded-2xl border border-white/[0.08] bg-white/[0.05] px-4 py-3 text-sm text-white focus:border-blue-500/50 focus:outline-none" />
                                    <input type="password" placeholder="New password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))} className="rounded-2xl border border-white/[0.08] bg-white/[0.05] px-4 py-3 text-sm text-white focus:border-blue-500/50 focus:outline-none" />
                                    <input type="password" placeholder="Confirm password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))} className="rounded-2xl border border-white/[0.08] bg-white/[0.05] px-4 py-3 text-sm text-white focus:border-blue-500/50 focus:outline-none" />
                                </div>
                                <button type="button" onClick={handleChangePassword} disabled={savingPassword} className="mt-4 rounded-2xl bg-white px-4 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60">{savingPassword ? "Updating..." : "Change Password"}</button>
                            </section>
                        )}

                        {activeTab === "privacy" && (
                            <section className="rounded-3xl border border-white/8 bg-white/[0.03] p-5">
                                <div className="mb-4">
                                    <h2 className="text-base font-black text-white">Privacy</h2>
                                    <p className="mt-1 text-xs text-white/45">Choose who can follow you and see your activity.</p>
                                </div>
                                <div className="grid gap-4 min-[860px]:grid-cols-2">
                                    <label className="space-y-2">
                                        <span className="text-[11px] font-semibold uppercase tracking-widest text-white/35">Who can follow me</span>
                                        <select value={privacyForm.whoCanFollowMe} onChange={(e) => setPrivacyForm((prev) => ({ ...prev, whoCanFollowMe: e.target.value }))} className="w-full rounded-2xl border border-white/[0.08] bg-[#151515] px-4 py-3 text-sm text-white focus:border-blue-500/50 focus:outline-none">
                                            <option value="everyone">Everyone</option>
                                            <option value="followers_only">Approved followers only</option>
                                            <option value="nobody">Nobody</option>
                                        </select>
                                    </label>
                                    <label className="space-y-2">
                                        <span className="text-[11px] font-semibold uppercase tracking-widest text-white/35">Who can see my activity</span>
                                        <select value={privacyForm.whoCanSeeActivity} onChange={(e) => setPrivacyForm((prev) => ({ ...prev, whoCanSeeActivity: e.target.value }))} className="w-full rounded-2xl border border-white/[0.08] bg-[#151515] px-4 py-3 text-sm text-white focus:border-blue-500/50 focus:outline-none">
                                            <option value="everyone">Everyone</option>
                                            <option value="followers">Followers</option>
                                            <option value="only_me">Only me</option>
                                        </select>
                                    </label>
                                </div>
                                <button type="button" onClick={handleSavePrivacy} disabled={savingPrivacy} className="mt-4 rounded-2xl bg-white px-4 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60">{savingPrivacy ? "Saving..." : "Save Privacy"}</button>
                            </section>
                        )}

                        {activeTab === "security" && (
                            <section className="rounded-3xl border border-white/8 bg-white/[0.03] p-5">
                                <div className="mb-4">
                                    <h2 className="text-base font-black text-white">Security</h2>
                                    <p className="mt-1 text-xs text-white/45">High-impact account actions.</p>
                                </div>
                                <div className="flex flex-col gap-3 min-[900px]:flex-row">
                                    <button type="button" onClick={() => setShowDeactivateModal(true)} className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-amber-200 transition hover:bg-amber-500/15">Deactivate Account</button>
                                    <button type="button" onClick={() => setShowDeleteModal(true)} className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-red-300 transition hover:bg-red-500/15">Delete Account</button>
                                </div>
                            </section>
                        )}
                    </div>
                </div>
            </section>

            {showDeactivateModal && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80" onClick={() => setShowDeactivateModal(false)} />
                    <div className="relative w-full max-w-sm rounded-[2rem] border border-white/10 bg-[#141416] p-6 shadow-2xl">
                        <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">Deactivate Account</h3>
                        <p className="mt-3 text-xs leading-5 text-white/55">Your public profile, Googs, products, and running ads will be hidden. You can reactivate anytime by logging back in.</p>
                        <div className="mt-5 flex gap-3">
                            <button type="button" onClick={() => setShowDeactivateModal(false)} className="flex-1 rounded-2xl border border-white/10 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-white/60 transition hover:bg-white/5">Cancel</button>
                            <button type="button" onClick={handleDeactivateAccount} disabled={isDeactivatingAccount} className="flex-1 rounded-2xl bg-amber-500 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-black transition hover:bg-amber-400 disabled:opacity-50">{isDeactivatingAccount ? "Deactivating..." : "Deactivate"}</button>
                        </div>
                    </div>
                </div>
            )}

            {showDeleteModal && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80" onClick={() => setShowDeleteModal(false)} />
                    <div className="relative w-full max-w-sm rounded-[2rem] border border-white/10 bg-[#141416] p-6 shadow-2xl">
                        <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">Delete Account</h3>
                        <p className="mt-3 text-xs leading-5 text-white/55">This is permanent. All your data, Googs, products, and ads will be deleted and cannot be recovered.</p>
                        <div className="mt-5 flex gap-3">
                            <button type="button" onClick={() => setShowDeleteModal(false)} className="flex-1 rounded-2xl border border-white/10 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-white/60 transition hover:bg-white/5">Cancel</button>
                            <button type="button" onClick={handleDeleteAccount} disabled={isDeletingAccount} className="flex-1 rounded-2xl bg-red-500 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-white transition hover:bg-red-600 disabled:opacity-50">{isDeletingAccount ? "Deleting..." : "Delete"}</button>
                        </div>
                    </div>
                </div>
            )}

            {isUploadLinkModalOpen && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80" onClick={() => setIsUploadLinkModalOpen(false)} />
                    <div className="relative w-full max-w-md overflow-hidden rounded-[2rem] border border-white/10 bg-[#141416] shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
                        <div className="border-b border-white/8 px-5 py-4">
                            <div className="flex items-center justify-between gap-4">
                                <div>
                                    <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">Upload Image Link</h3>
                                    <p className="mt-1 text-xs text-white/45">Paste a direct image URL for the profile picture.</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIsUploadLinkModalOpen(false)}
                                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.06] text-white/60 transition hover:bg-white/10 hover:text-white"
                                >
                                    <IonIcon name="close-outline" className="text-lg" />
                                </button>
                            </div>
                        </div>
                        <div className="space-y-4 px-5 py-5">
                            <label className="space-y-2">
                                <span className="text-[11px] font-semibold uppercase tracking-widest text-white/35">Image URL</span>
                                <input
                                    value={uploadLinkDraft}
                                    onChange={(e) => setUploadLinkDraft(e.target.value)}
                                    placeholder="https://example.com/profile.jpg"
                                    className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.05] px-4 py-3 text-sm text-white placeholder:text-white/20 focus:border-blue-500/50 focus:outline-none"
                                />
                            </label>
                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsUploadLinkModalOpen(false)}
                                    className="flex-1 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-white transition hover:bg-white/[0.08]"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleUploadLink}
                                    className="flex-1 rounded-2xl bg-white px-4 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-black transition hover:bg-zinc-200"
                                >
                                    Use Link
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
