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
    const [resetStep, setResetStep] = useState(0);
    const [resetEmail, setResetEmail] = useState("");
    const [otp, setOtp] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [resetToken, setResetToken] = useState("");
    const [resetLoading, setResetLoading] = useState(false);
    const [resetError, setResetError] = useState("");
    const [resetMessage, setResetMessage] = useState("");
    const [debugOtp, setDebugOtp] = useState("");

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

    const closeResetFlow = () => {
        setResetStep(0);
        setResetEmail("");
        setOtp("");
        setNewPassword("");
        setConfirmPassword("");
        setResetToken("");
        setResetError("");
        setResetMessage("");
        setDebugOtp("");
        setResetLoading(false);
    };

    const handleRequestResetOtp = async () => {
        setResetError("");
        setResetMessage("");
        if (!resetEmail.trim()) {
            setResetError("Please enter your registered email.");
            return;
        }
        setResetLoading(true);
        try {
            const result = await authService.requestPasswordResetOtp(resetEmail.trim());
            setResetMessage(result?.message || "OTP sent to registered email.");
            setDebugOtp(result?.debugOtp || "");
            setResetStep(2);
        } catch (err: any) {
            setResetError(err?.message || "Could not send OTP.");
        } finally {
            setResetLoading(false);
        }
    };

    const handleVerifyResetOtp = async () => {
        setResetError("");
        setResetMessage("");
        if (!/^\d{6}$/.test(otp.trim())) {
            setResetError("Please enter the 6-digit OTP.");
            return;
        }
        setResetLoading(true);
        try {
            const result = await authService.verifyPasswordResetOtp(resetEmail.trim(), otp.trim());
            setResetToken(result?.resetToken || "");
            setResetMessage(result?.message || "OTP verified.");
            setResetStep(3);
        } catch (err: any) {
            setResetError(err?.message || "Could not verify OTP.");
        } finally {
            setResetLoading(false);
        }
    };

    const handleResetPassword = async () => {
        setResetError("");
        setResetMessage("");
        if (!resetToken) {
            setResetError("Reset session expired. Please request a new OTP.");
            setResetStep(1);
            return;
        }
        if (!newPassword || newPassword !== confirmPassword) {
            setResetError("New password and confirm password must match.");
            return;
        }
        setResetLoading(true);
        try {
            const result = await authService.resetPasswordWithOtp(resetEmail.trim(), resetToken, newPassword);
            setResetMessage(result?.message || "Password reset successfully. Please login.");
            setPassword("");
            window.setTimeout(closeResetFlow, 1400);
        } catch (err: any) {
            setResetError(err?.message || "Could not reset password.");
        } finally {
            setResetLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
            <div className="absolute inset-0" onClick={onClose} />
            <div className="relative w-full max-w-md rounded-3xl border border-gray-800 bg-black p-8 shadow-[0_0_50px_-12px_rgba(255,255,255,0.08)]">
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

                {error && resetStep === 0 && (
                    <div className="mb-4 rounded-xl border border-gray-200 bg-white p-3 text-center text-sm font-semibold text-black shadow-sm">
                        {error}
                    </div>
                )}

                {resetStep === 0 ? (
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
                                className="w-full rounded-xl border border-gray-800 bg-[#121212] px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500/40"
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
                                className="w-full rounded-xl border border-gray-800 bg-[#121212] px-4 py-3 pr-12 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500/40"
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

                        <div className="text-right px-1">
                            <button
                                type="button"
                                className="text-xs font-bold text-red-500 transition-colors hover:text-red-400"
                                onClick={() => {
                                    setResetEmail(email.trim());
                                    setResetStep(1);
                                }}
                            >
                                Forgot Password?
                            </button>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="mt-2 w-full rounded-full bg-gray-200 px-4 py-3 text-sm font-bold text-black shadow-[0_14px_30px_rgba(255,255,255,0.08)] transition-all duration-200 hover:bg-white active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {loading ? "Logging in..." : "Login"}
                        </button>

                        <div className="mt-4 text-center">
                            <span className="text-xs font-normal text-gray-500 underline decoration-gray-800 underline-offset-4">Don't have an account? </span>
                            <Link href="/register" className="ml-1 text-xs font-bold text-red-500 transition-all hover:text-red-400">
                                Register
                            </Link>
                        </div>
                    </form>
                ) : (
                    <div>
                        {resetError && (
                            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-center text-xs font-semibold text-red-200">
                                {resetError}
                            </div>
                        )}

                        {resetMessage && (
                            <div className="mb-4 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-center text-xs font-semibold text-green-200">
                                {resetMessage}
                            </div>
                        )}

                        {resetStep === 1 && (
                            <div className="animate-[slideIn_0.4s_ease-out]">
                                <div className="mb-6 text-center">
                                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                                        <IonIcon name="mail-outline" className="text-2xl text-gray-300" />
                                    </div>
                                    <h3 className="mb-2 text-xl font-bold text-white">Reset Password</h3>
                                    <p className="text-xs leading-relaxed text-gray-500">Enter your registered email to receive a secure OTP.</p>
                                </div>

                                <input
                                    type="email"
                                    placeholder="Enter Email Address"
                                    value={resetEmail}
                                    onChange={(e) => setResetEmail(e.target.value)}
                                    className="mb-4 w-full rounded-xl border border-gray-800 bg-[#121212] px-4 py-3 text-sm text-white outline-none transition-all focus:ring-1 focus:ring-gray-500/40"
                                />

                                <button
                                    onClick={handleRequestResetOtp}
                                    disabled={resetLoading}
                                    className="w-full rounded-full bg-white px-4 py-3 text-sm font-bold text-black shadow-lg transition-all hover:bg-gray-200 active:scale-[0.97] disabled:opacity-50"
                                >
                                    {resetLoading ? "Sending..." : "Send OTP Code"}
                                </button>
                            </div>
                        )}

                        {resetStep === 2 && (
                            <div className="animate-[slideIn_0.4s_ease-out]">
                                <div className="mb-6 text-center">
                                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                                        <IonIcon name="keypad-outline" className="text-2xl text-gray-300" />
                                    </div>
                                    <h3 className="mb-2 text-xl font-bold text-white">Verify OTP</h3>
                                    <p className="text-xs leading-relaxed text-gray-500">We've sent a 6-digit code to <br /><span className="font-bold text-gray-300">{resetEmail}</span></p>
                                </div>

                                <input
                                    type="text"
                                    placeholder="Enter 6-Digit OTP"
                                    maxLength={6}
                                    value={otp}
                                    onChange={(e) => setOtp(e.target.value)}
                                    className="mb-4 w-full rounded-xl border border-gray-800 bg-[#121212] px-4 py-3 text-center text-sm font-bold tracking-[0.5em] text-white outline-none focus:ring-1 focus:ring-gray-500/40"
                                />

                                <button
                                    onClick={handleVerifyResetOtp}
                                    disabled={resetLoading}
                                    className="w-full rounded-full bg-white px-4 py-3 text-sm font-bold text-black shadow-lg transition-all hover:bg-gray-200 active:scale-[0.97] disabled:opacity-50"
                                >
                                    {resetLoading ? "Verifying..." : "Verify & Continue"}
                                </button>

                                {debugOtp && (
                                    <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-center text-[11px] font-bold text-amber-100">
                                        Debug OTP: {debugOtp}
                                    </div>
                                )}

                                <p className="mt-4 text-center text-[10px] font-bold uppercase tracking-widest text-gray-500">
                                    Didn't receive? <button onClick={handleRequestResetOtp} disabled={resetLoading} className="text-red-500 hover:underline disabled:opacity-50">Resend OTP</button>
                                </p>
                            </div>
                        )}

                        {resetStep === 3 && (
                            <div className="animate-[slideIn_0.4s_ease-out]">
                                <div className="mb-6 text-center">
                                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-green-500/20 bg-green-500/10">
                                        <IonIcon name="lock-closed-outline" className="text-2xl text-green-400" />
                                    </div>
                                    <h3 className="mb-2 text-xl font-bold text-white">New Password</h3>
                                    <p className="text-xs leading-relaxed text-gray-500">Secure your account with a new strong password.</p>
                                </div>

                                <div className="mb-6 space-y-4">
                                    <input
                                        type="password"
                                        placeholder="New Password"
                                        className="w-full rounded-xl border border-gray-800 bg-[#121212] px-4 py-3 text-sm text-white outline-none transition-all focus:ring-1 focus:ring-green-500/50"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                    />
                                    <input
                                        type="password"
                                        placeholder="Confirm New Password"
                                        className="w-full rounded-xl border border-gray-800 bg-[#121212] px-4 py-3 text-sm text-white outline-none transition-all focus:ring-1 focus:ring-green-500/50"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                    />
                                </div>

                                <button
                                    onClick={handleResetPassword}
                                    disabled={resetLoading}
                                    className="w-full rounded-full bg-green-500 px-4 py-3 text-sm font-bold text-black shadow-lg transition-all hover:bg-green-400 active:scale-[0.97] disabled:opacity-50"
                                >
                                    {resetLoading ? "Updating..." : "Update Password"}
                                </button>
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={closeResetFlow}
                            className="mt-5 w-full text-center text-[10px] font-bold uppercase tracking-[0.18em] text-white/45 transition hover:text-white"
                        >
                            Back To Login
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
