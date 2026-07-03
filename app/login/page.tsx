"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { authService } from "@/services/authService";
import IonIcon from "@/app/components/IonIcon";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetStep, setResetStep] = useState(0); // 0=none, 1=email, 2=otp, 3=password
  const [resetEmail, setResetEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [deviceApproval, setDeviceApproval] = useState<{ id: string; token: string } | null>(null);
  const [approvalStatus, setApprovalStatus] = useState("Waiting for a trusted device to respond.");
  const [redirectTo, setRedirectTo] = useState("/dashboard");

  useEffect(() => {
    const redirect = new URLSearchParams(window.location.search).get("redirect");
    if (redirect?.startsWith("/")) setRedirectTo(redirect);
  }, []);

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
          const target = redirectTo.startsWith("/") ? redirectTo : "/dashboard";
          window.location.assign(target);
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
  }, [deviceApproval, redirectTo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await authService.login({ email, password });
      console.log("Login successful:", response);
      if (response?.approvalRequired && response?.approval?.id && response?.approval?.token) {
        setDeviceApproval({ id: response.approval.id, token: response.approval.token });
        setApprovalStatus("A new device is trying to access your account. Waiting for approval.");
        return;
      }
      const target = redirectTo.startsWith("/") ? redirectTo : "/dashboard";
      window.location.assign(target);
    } catch (err: any) {
      console.error("Login error:", err);
      setError(err.message || "Login failed. Please check your credentials.");
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
    <div className="flex flex-col min-h-[100dvh] justify-center items-center bg-black py-12">
      <div className="max-w-md mx-auto md:px-10 p-4 w-full">
        <div className="bg-black p-8 rounded-3xl border border-purple-500/20 shadow-[0_0_50px_-12px_rgba(168,85,247,0.1)]">
          {/* Logo */}
          <div className="flex flex-col items-center justify-center mb-6">
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

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-white border border-gray-200 text-black rounded-xl text-sm font-semibold text-center shadow-sm animate-shake">
              {error}
            </div>
          )}

          {/* Form */}
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
            {/* Email Field */}
            <div>
              <input
                className="w-full px-4 py-3 rounded-xl border border-gray-800 bg-[#121212] text-white focus:outline-none focus:ring-1 focus:ring-purple-500/50 placeholder-gray-500 text-sm"
                id="email"
                name="email"
                type="email"
                placeholder="Enter Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            {/* Password Field */}
            <div className="relative">
              <input
                className="w-full px-4 py-3 rounded-xl border border-gray-800 bg-[#121212] text-white focus:outline-none focus:ring-1 focus:ring-purple-500/50 placeholder-gray-500 pr-12 text-sm"
                id="password"
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
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
              >
                <IonIcon name={showPassword ? "eye-outline" : "eye-off-outline"} className="text-xl" />
              </button>
            </div>

            <div className="text-right px-1">
              <button
                type="button"
                onClick={() => setResetStep(1)}
                className="text-purple-400 hover:text-purple-300 text-xs font-light transition-colors"
              >
                Forgot password?
              </button>
            </div>

            {/* Login Button - Black */}
            <button
              type="submit"
              disabled={loading}
              className="font-bold w-full rounded-full bg-white text-black py-3 px-4 shadow-lg hover:bg-gray-200 active:scale-[0.97] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed mt-2 text-sm"
            >
              <span>{loading ? "Logging in..." : "Login"}</span>
            </button>

            {/* Register Link */}
            <div className="text-center mt-4">
              <span className="text-gray-500 text-xs font-normal underline decoration-gray-800 underline-offset-4">Don't have an account? — </span>
              <Link href={`/register${redirectTo !== "/dashboard" ? `?redirect=${encodeURIComponent(redirectTo)}` : ""}`} className="text-purple-400 hover:text-purple-300 text-xs font-bold transition-all ml-1">
                Register
              </Link>
            </div>
          </form>
        </div>
      </div>

      {/* Forgot Password Flow Overlay */}
      {resetStep > 0 && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50 p-6 animate-[fadeIn_0.3s_ease-out]">
          <div className="bg-black border border-purple-500/20 w-full max-w-sm rounded-3xl p-8 relative shadow-[0_0_50px_-12px_rgba(168,85,247,0.1)] overflow-hidden">
            {/* Decorative Pulse */}
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl"></div>

            <button
              onClick={closeResetFlow}
              className="absolute top-6 right-6 text-gray-500 hover:text-white transition-all hover:rotate-90"
            >
              <IonIcon name="close-outline" className="text-2xl" />
            </button>

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

            {/* Step 1: Enter Email */}
            {resetStep === 1 && (
              <div className="animate-[slideIn_0.4s_ease-out]">
                <div className="mb-6 text-center">
                  <div className="w-14 h-14 bg-purple-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-purple-500/20">
                    <IonIcon name="mail-outline" className="text-2xl text-purple-400" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">Reset Password</h3>
                  <p className="text-gray-500 text-xs leading-relaxed">Enter your registered email to receive a secure OTP.</p>
                </div>

                <input
                  type="email"
                  placeholder="Enter Email Address"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  className="w-full bg-[#121212] border border-gray-800 text-white rounded-xl px-4 py-3 mb-4 focus:ring-1 focus:ring-purple-500/50 outline-none text-sm transition-all"
                />

                <button
                  onClick={handleRequestResetOtp}
                  disabled={resetLoading}
                  className="w-full bg-white text-black font-bold py-3 px-4 rounded-full text-sm shadow-lg hover:bg-gray-200 active:scale-[0.97] transition-all disabled:opacity-50"
                >
                  {resetLoading ? "Sending..." : "Send OTP Code"}
                </button>
              </div>
            )}

            {/* Step 2: Enter OTP */}
            {resetStep === 2 && (
              <div className="animate-[slideIn_0.4s_ease-out]">
                <div className="mb-6 text-center">
                  <div className="w-14 h-14 bg-purple-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-purple-500/20">
                    <IonIcon name="keypad-outline" className="text-2xl text-purple-400" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">Verify OTP</h3>
                  <p className="text-gray-500 text-xs leading-relaxed">We've sent a 6-digit code to <br /><span className="text-purple-400 font-bold">{resetEmail}</span></p>
                </div>

                <input
                  type="text"
                  placeholder="Enter 6-Digit OTP"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="w-full bg-[#121212] border border-gray-800 text-white rounded-xl px-4 py-3 mb-4 focus:ring-1 focus:ring-purple-500/50 outline-none text-sm text-center tracking-[0.5em] font-bold"
                />

                <button
                  onClick={handleVerifyResetOtp}
                  disabled={resetLoading}
                  className="w-full bg-white text-black font-bold py-3 px-4 rounded-full text-sm shadow-lg hover:bg-gray-200 active:scale-[0.97] transition-all disabled:opacity-50"
                >
                  {resetLoading ? "Verifying..." : "Verify & Continue"}
                </button>

                <p className="text-center mt-4 text-[10px] text-gray-500 uppercase tracking-widest font-bold">
                  Didn't receive? <button onClick={handleRequestResetOtp} disabled={resetLoading} className="text-purple-400 hover:underline disabled:opacity-50">Resend OTP</button>
                </p>
              </div>
            )}

            {/* Step 3: New Password */}
            {resetStep === 3 && (
              <div className="animate-[slideIn_0.4s_ease-out]">
                <div className="mb-6 text-center">
                  <div className="w-14 h-14 bg-green-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-green-500/20">
                    <IonIcon name="lock-closed-outline" className="text-2xl text-green-400" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">New Password</h3>
                  <p className="text-gray-500 text-xs leading-relaxed">Secure your account with a new strong password.</p>
                </div>

                <div className="space-y-4 mb-6">
                  <input
                    type="password"
                    placeholder="New Password"
                    className="w-full bg-[#121212] border border-gray-800 text-white rounded-xl px-4 py-3 focus:ring-1 focus:ring-green-500/50 outline-none text-sm transition-all"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <input
                    type="password"
                    placeholder="Confirm New Password"
                    className="w-full bg-[#121212] border border-gray-800 text-white rounded-xl px-4 py-3 focus:ring-1 focus:ring-green-500/50 outline-none text-sm transition-all"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>

                <button
                  onClick={handleResetPassword}
                  disabled={resetLoading}
                  className="w-full bg-green-500 text-black font-bold py-3 px-4 rounded-full text-sm shadow-lg hover:bg-green-400 active:scale-[0.97] transition-all disabled:opacity-50"
                >
                  {resetLoading ? "Updating..." : "Update Password"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
