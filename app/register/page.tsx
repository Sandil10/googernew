"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, Suspense, useEffect } from "react";
import { authService } from "@/services/authService";
import IonIcon from "@/app/components/IonIcon";

function RegisterContent() {
    // State to toggle between User and Seller registration
    const [isSeller, setIsSeller] = useState(false);

    // Common fields
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [acceptedTerms, setAcceptedTerms] = useState(false);

    // Get Referral Code
    const sp = useSearchParams();
    const referralCode = sp ? sp.get('ref') : null;

    // Seller specific fields
    const [shopName, setShopName] = useState("");

    // Password visibility states
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (password !== confirmPassword) {
            setError("Passwords do not match");
            return;
        }

        // Password Policy Check
        const passwordPolicy = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
        if (!passwordPolicy.test(password)) {
            setError("Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, and one number.");
            return;
        }

        if (!acceptedTerms) {
            setError("You must accept the Terms & Conditions");
            return;
        }

        setLoading(true);

        try {
            // Prepare data based on mode
            const userData = {
                email,
                password,
                username: email.split('@')[0], // Default username
                fullName: isSeller ? shopName : email.split('@')[0], // Default Full name
                isSeller: isSeller,
                referralCode: referralCode || undefined, // PASS REFERRAL CODE
                ...(isSeller && { shopName })
            };

            // Register user
            const response = await authService.register(userData);
            console.log("Registration successful:", response);

            // Redirect to dashboard
            router.push("/dashboard");
        } catch (err: any) {
            setError(err.message || "Registration failed. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const toggleMode = () => {
        setIsSeller(!isSeller);
        setError("");
    };

    // State for Referral Badge visibility
    const [showReferralBadge, setShowReferralBadge] = useState(!!referralCode);

    // Auto-hide referral badge after 2 seconds
    useEffect(() => {
        if (referralCode) {
            const timer = setTimeout(() => {
                setShowReferralBadge(false);
            }, 2000);
            return () => clearTimeout(timer);
        }
    }, [referralCode]);

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
                            />
                        </div>
                    </div>

                    {/* Referral Badge */}
                    {showReferralBadge && (
                        <div className="mb-4 p-2 bg-green-900/10 border border-green-800/30 rounded-lg text-center animate-fadeOut">
                            <p className="text-[10px] text-green-400 font-medium">
                                Valid Referral Applied! 🎉
                            </p>
                        </div>
                    )}

                    {/* Error Message */}
                    {error && (
                        <div className="mb-4 p-3 bg-white border border-gray-200 text-black rounded-xl text-xs font-bold text-center shadow-sm animate-shake">
                            {error}
                        </div>
                    )}

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-3">

                        {/* Email Field - Common */}
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

                        {/* Seller Mode: Shop Name */}
                        {isSeller && (
                            <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                                <input
                                    className="w-full px-4 py-3 rounded-xl border border-gray-800 bg-[#121212] text-white focus:outline-none focus:ring-1 focus:ring-purple-500/50 placeholder-gray-500 text-sm"
                                    id="shopName"
                                    name="shopName"
                                    type="text"
                                    placeholder="Enter Shop Name"
                                    value={shopName}
                                    onChange={(e) => setShopName(e.target.value)}
                                    required
                                />
                            </div>
                        )}

                        {/* Password Field */}
                        <div className="space-y-1">
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

                            {/* Password Strength Indicator */}
                            {password.length > 0 && (
                                <div className="px-1 mt-1">
                                    <div className="flex items-center justify-between mb-0">
                                        <span className="text-[7.5px] uppercase font-semibold text-gray-400 tracking-wider">Security Strength</span>
                                        <span className={`text-[7.5px] uppercase font-bold tracking-wider ${password.length < 8 ? 'text-red-500' :
                                            (/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/).test(password) ? 'text-green-500' : 'text-amber-500'
                                            }`}>
                                            {password.length < 8 ? 'Weak' :
                                                (/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/).test(password) ? 'Strong' : 'Medium'}
                                        </span>
                                    </div>
                                    <div className="flex gap-[2px] h-[2px]">
                                        <div className={`flex-1 rounded-full transition-all duration-300 ${password.length > 0 ? (password.length < 8 ? 'bg-red-500' : 'bg-amber-500') : 'bg-gray-200'} ${password.length >= 8 && (/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/).test(password) ? 'bg-green-500' : ''}`}></div>
                                        <div className={`flex-1 rounded-full transition-all duration-300 ${password.length >= 8 ? ((/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/).test(password) ? 'bg-green-500' : 'bg-amber-500') : 'bg-gray-200'}`}></div>
                                        <div className={`flex-1 rounded-full transition-all duration-300 ${password.length >= 8 && (/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/).test(password) ? 'bg-green-500' : 'bg-gray-200'}`}></div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Confirm Password Field */}
                        <div className="relative">
                            <input
                                className="w-full px-4 py-3 rounded-xl border border-gray-800 bg-[#121212] text-white focus:outline-none focus:ring-1 focus:ring-purple-500/50 placeholder-gray-500 pr-12 text-sm"
                                id="confirmPassword"
                                name="confirmPassword"
                                type={showConfirmPassword ? "text" : "password"}
                                placeholder="Confirm Password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                            >
                                <IonIcon name={showConfirmPassword ? "eye-outline" : "eye-off-outline"} className="text-xl" />
                            </button>
                        </div>

                        {/* Terms & Conditions Checkbox */}
                        <div className="flex items-center pt-1">
                            <input
                                id="terms"
                                name="terms"
                                type="checkbox"
                                className="h-4 w-4 bg-[#121212] border-gray-800 rounded text-purple-600 focus:ring-purple-500"
                                checked={acceptedTerms}
                                onChange={(e) => setAcceptedTerms(e.target.checked)}
                            />
                            <label htmlFor="terms" className="ml-2 block text-[10px] text-gray-400">
                                I accept the <span className="text-purple-400 font-bold">Terms & Conditions</span>
                            </label>
                        </div>

                        {/* Create Button - White */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="font-bold w-full rounded-full bg-white text-black py-3 px-4 shadow-lg hover:bg-gray-200 active:scale-[0.97] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed mt-2 text-sm"
                        >
                            <span>{loading ? "Creating..." : "Create"}</span>
                        </button>

                        {/* Login Link */}
                        <div className="text-center mt-4">
                            <span className="text-gray-500 text-xs">Already have account? — </span>
                            <Link href="/" className="text-purple-400 hover:text-purple-300 text-xs font-bold">
                                Login
                            </Link>
                        </div>

                        {/* Register as Seller Link */}
                        {!isSeller && (
                            <div className="text-center mt-2">
                                <button
                                    type="button"
                                    onClick={toggleMode}
                                    className="text-gray-500 hover:text-white text-[10px] font-medium transition-colors"
                                >
                                    Register as a seller
                                </button>
                            </div>
                        )}
                        {isSeller && (
                            <div className="text-center mt-2">
                                <button
                                    type="button"
                                    onClick={toggleMode}
                                    className="text-gray-500 hover:text-white text-[10px] font-medium transition-colors"
                                >
                                    Register as a user
                                </button>
                            </div>
                        )}

                    </form>
                </div>
            </div>
        </div>
    );
}

export default function RegisterPage() {
    return (
        <Suspense fallback={
            <div className="flex flex-col gap-3 justify-center items-center h-screen bg-black">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
                <div className="text-gray-500 font-medium tracking-wide">Loading...</div>
            </div>
        }>
            <RegisterContent />
        </Suspense>
    );
}
