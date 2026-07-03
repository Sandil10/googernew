"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { authService } from "@/services/authService";
import IonIcon from "@/app/components/IonIcon";

export default function LoginModal({
    onClose,
    onSuccess,
}: {
    onClose: () => void;
    onSuccess: () => void;
}) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [deviceApproval, setDeviceApproval] = useState<{ id: string; token: string } | null>(null);
    const [approvalStatus, setApprovalStatus] = useState("Waiting for a trusted device to respond.");

    useEffect(() => {
        if (!deviceApproval) return;
        let cancelled = false;
        const checkApproval = async () => {
            try {
                const result = await authService.getDeviceApprovalStatus({
                    approvalId: deviceApproval.id,
                    approvalToken: deviceApproval.token,
                });
                if (cancelled) return;
                if (result?.token || result?.status === "approved") {
                    onSuccess();
                    return;
                }
                setApprovalStatus(result?.message || "Waiting for a trusted device to respond.");
            } catch (err: any) {
                if (cancelled) return;
                setError(err?.message || "Login request denied.");
                setApprovalStatus("Approval did not complete.");
                setDeviceApproval(null);
            }
        };
        void checkApproval();
        const timer = window.setInterval(checkApproval, 2000);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, [deviceApproval, onSuccess]);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError("");
        setLoading(true);

        try {
            const result = await authService.login({ email, password });
            if (result?.approvalRequired && result?.approval?.id && result?.approval?.token) {
                setDeviceApproval({ id: result.approval.id, token: result.approval.token });
                setApprovalStatus("A new device is trying to access your account. Waiting for approval.");
                return;
            }
            onSuccess();
        } catch (err: any) {
            setError(err?.message || "Login failed. Please check your credentials.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
            <div className="absolute inset-0" onClick={onClose} />
            <div className="relative w-full max-w-md rounded-3xl border border-purple-500/20 bg-black p-8 shadow-[0_0_50px_-12px_rgba(168,85,247,0.1)]">
                <button
                    type="button"
                    onClick={onClose}
                    className="absolute right-5 top-5 text-gray-500 transition-colors hover:text-white"
                    aria-label="Close login form"
                >
                    <IonIcon name="close-outline" className="text-2xl" />
                </button>

                <div className="mb-6 flex flex-col items-center justify-center">
                    <div className="mb-2">
                        <Image
                            src="/assets/images/googer.png"
                            alt="Googer Logo"
                            width={80}
                            height={80}
                            className="object-contain"
                            priority
                        />
                    </div>
                </div>

                {error && (
                    <div className="mb-4 rounded-xl border border-gray-200 bg-white p-3 text-center text-sm font-semibold text-black shadow-sm">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    {deviceApproval && (
                        <div className="rounded-2xl border border-amber-400/25 bg-amber-400/10 px-4 py-4 text-center">
                            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400/10 text-amber-200">
                                <IonIcon name="shield-checkmark-outline" className="text-2xl" />
                            </div>
                            <h3 className="text-sm font-black text-white">Device Approval Required</h3>
                            <p className="mt-2 text-xs leading-relaxed text-amber-100/80">{approvalStatus}</p>
                            <button
                                type="button"
                                onClick={() => setDeviceApproval(null)}
                                className="mt-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/45 hover:text-white"
                            >
                                Cancel Request
                            </button>
                        </div>
                    )}
                    <div>
                        <input
                            className="w-full rounded-xl border border-gray-800 bg-[#121212] px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                            id="modal-email"
                            name="email"
                            type="email"
                            placeholder="Enter Email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>

                    <div className="relative">
                        <input
                            className="w-full rounded-xl border border-gray-800 bg-[#121212] px-4 py-3 pr-12 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                            id="modal-password"
                            name="password"
                            type={showPassword ? "text" : "password"}
                            placeholder="Enter Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 transition-colors hover:text-white"
                        >
                            <IonIcon name={showPassword ? "eye-outline" : "eye-off-outline"} className="text-xl" />
                        </button>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="mt-2 w-full rounded-full bg-white px-4 py-3 text-sm font-bold text-black shadow-lg transition-all duration-200 hover:bg-gray-200 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {loading ? "Logging in..." : "Login"}
                    </button>

                    <div className="mt-4 text-center">
                        <span className="text-xs font-normal text-gray-500 underline decoration-gray-800 underline-offset-4">Don't have an account? </span>
                        <Link href="/register" className="ml-1 text-xs font-bold text-purple-400 transition-all hover:text-purple-300">
                            Register
                        </Link>
                    </div>
                </form>
            </div>
        </div>
    );
}
