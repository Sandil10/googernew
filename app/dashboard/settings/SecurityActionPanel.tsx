"use client";

import { useEffect, useMemo, useState } from "react";
import IonIcon from "@/app/components/IonIcon";
import { authService } from "@/services/authService";

type SecurityPanelKey = "changeEmail" | "loginHistory" | "trustedDevices" | "passkey" | "resetPassword" | "twoFactor" | null;

type CountryDialOption = {
    code: string;
    name: string;
    flag: string;
    dialCode: string;
};

type Props = {
    panel: SecurityPanelKey;
    currentEmail: string;
    currentPhone?: string;
    currentPhoneDialCode?: string;
    preferredOtpDelivery?: "email" | "phone";
    onSaved?: () => void;
};

const PANEL_COPY: Record<Exclude<SecurityPanelKey, "loginHistory" | "trustedDevices" | null>, { purpose: string; title: string; description: string }> = {
    changeEmail: {
        purpose: "change_email",
        title: "Change Login Email",
        description: "First verify the current login email with OTP. After the debug OTP is verified, you can save the new login email.",
    },
    resetPassword: {
        purpose: "reset_password",
        title: "Reset Password",
        description: "Verify by OTP before creating a new password. Email is recommended; phone is optional after it is added.",
    },
    passkey: {
        purpose: "passkey",
        title: "6-Digit Passkey",
        description: "Verify by OTP before enabling or changing your 6-digit passkey. Email is recommended; phone is optional after it is added.",
    },
    twoFactor: {
        purpose: "setup_2fa_email",
        title: "2FA Phone Number",
        description: "Verify your current email first, then add your phone number and choose where future OTPs should arrive.",
    },
};

const fallbackCountries: CountryDialOption[] = [
    { code: "LK", name: "Sri Lanka", flag: "https://flagcdn.com/lk.svg", dialCode: "+94" },
    { code: "US", name: "United States", flag: "https://flagcdn.com/us.svg", dialCode: "+1" },
    { code: "GB", name: "United Kingdom", flag: "https://flagcdn.com/gb.svg", dialCode: "+44" },
    { code: "IN", name: "India", flag: "https://flagcdn.com/in.svg", dialCode: "+91" },
];

function normalizePhone(value: string) {
    return value.replace(/\D/g, "").replace(/^0+/, "");
}

function isActionPanel(panel: SecurityPanelKey): panel is Exclude<SecurityPanelKey, "loginHistory" | "trustedDevices" | null> {
    return panel === "changeEmail" || panel === "resetPassword" || panel === "passkey" || panel === "twoFactor";
}

export default function SecurityActionPanel({ panel, currentEmail, currentPhone = "", currentPhoneDialCode = "", preferredOtpDelivery = "email", onSaved }: Props) {
    const [otp, setOtp] = useState("");
    const [debugOtp, setDebugOtp] = useState("");
    const [securityToken, setSecurityToken] = useState("");
    const [status, setStatus] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [newEmail, setNewEmail] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [passkey, setPasskey] = useState("");
    const [confirmPasskey, setConfirmPasskey] = useState("");
    const [countries, setCountries] = useState<CountryDialOption[]>(fallbackCountries);
    const [countrySearch, setCountrySearch] = useState("");
    const [countryModalOpen, setCountryModalOpen] = useState(false);
    const [selectedCountryCode, setSelectedCountryCode] = useState("LK");
    const [phoneNumber, setPhoneNumber] = useState("");
    const [otpRequestDestination, setOtpRequestDestination] = useState<"email" | "phone">("email");

    const panelCopy = isActionPanel(panel) ? PANEL_COPY[panel] : null;
    const hasSavedPhone = !!currentPhone && !!currentPhoneDialCode;
    const canEditTwoFactorPhone = panel === "twoFactor" ? !!securityToken : true;
    const selectedCountry = useMemo(
        () => countries.find((country) => country.code === selectedCountryCode) || countries[0] || fallbackCountries[0],
        [countries, selectedCountryCode]
    );
    const filteredCountries = useMemo(() => {
        const query = countrySearch.trim().toLowerCase();
        if (!query) return countries;
        return countries.filter((country) => (
            country.name.toLowerCase().includes(query) ||
            country.code.toLowerCase().includes(query) ||
            country.dialCode.includes(query)
        ));
    }, [countries, countrySearch]);

    useEffect(() => {
        let cancelled = false;
        fetch("/country-codes")
            .then((response) => (response.ok ? response.json() : []))
            .then((data) => {
                if (cancelled || !Array.isArray(data?.countries)) return;
                const parsed = data.countries
                    .filter((country: CountryDialOption | null): country is CountryDialOption => Boolean(country?.code && country?.name && country?.dialCode))
                    .sort((a: CountryDialOption, b: CountryDialOption) => a.name.localeCompare(b.name));
                if (parsed.length) setCountries(parsed);
            })
            .catch(() => setCountries(fallbackCountries));
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        setOtp("");
        setDebugOtp("");
        setSecurityToken("");
        setStatus("");
        setError("");
        setOtpRequestDestination("email");
    }, [currentPhone, panel, preferredOtpDelivery]);

    useEffect(() => {
        setOtpRequestDestination("email");
    }, [currentPhone, preferredOtpDelivery]);

    useEffect(() => {
        setPhoneNumber(currentPhone || "");
        if (!currentPhoneDialCode) return;
        const matchedCountry = countries.find((country) => country.dialCode === currentPhoneDialCode);
        if (matchedCountry) setSelectedCountryCode(matchedCountry.code);
    }, [countries, currentPhone, currentPhoneDialCode]);

    if (!panelCopy) return null;

    const requestEmailOtp = async () => {
        try {
            setBusy(true);
            setError("");
            const result = await authService.requestAccountSecurityOtp({ purpose: panelCopy.purpose, destinationType: otpRequestDestination });
            setDebugOtp(result?.debugOtp || "");
            setStatus(result?.message || (otpRequestDestination === "phone" ? "OTP generated for phone." : "OTP sent to current email."));
        } catch (err: any) {
            setError(err?.message || "Could not send OTP.");
        } finally {
            setBusy(false);
        }
    };

    const verifyEmailOtp = async () => {
        try {
            setBusy(true);
            setError("");
            const result = await authService.verifyAccountSecurityOtp({ purpose: panelCopy.purpose, otp });
            setSecurityToken(result?.securityToken || "");
            setStatus(`${otpRequestDestination === "phone" ? "Phone" : "Email"} OTP verified.`);
        } catch (err: any) {
            setError(err?.message || "Could not verify OTP.");
        } finally {
            setBusy(false);
        }
    };

    const savePrimaryAction = async () => {
        try {
            setBusy(true);
            setError("");
            if (!securityToken) throw new Error("Verify OTP first.");
            if (panel === "changeEmail") {
                if (!newEmail.trim()) throw new Error("New login email is required.");
                await authService.changeLoginEmailWithOtp(newEmail.trim(), securityToken);
                setStatus("Login email updated.");
            }
            if (panel === "resetPassword") {
                if (newPassword !== confirmPassword) throw new Error("Passwords do not match.");
                await authService.resetLoggedInPasswordWithOtp(newPassword, securityToken);
                setStatus("Password reset successfully.");
            }
            if (panel === "passkey") {
                if (!/^\d{6}$/.test(passkey) || passkey !== confirmPasskey) throw new Error("Enter the same 6-digit passkey twice.");
                await authService.savePasskeyWithOtp(passkey, securityToken);
                setStatus("6-digit passkey saved.");
            }
            onSaved?.();
        } catch (err: any) {
            setError(err?.message || "Could not save security change.");
        } finally {
            setBusy(false);
        }
    };

    const saveTwoFactor = async () => {
        try {
            setBusy(true);
            setError("");
            if (!securityToken) throw new Error("Verify OTP first.");
            if (!normalizePhone(phoneNumber)) throw new Error("Phone number is required.");
            await authService.saveTwoFactorPhone({
                emailSecurityToken: securityToken,
                countryCode: selectedCountry.code,
                countryName: selectedCountry.name,
                dialCode: selectedCountry.dialCode,
                phoneNumber: normalizePhone(phoneNumber),
                otpDeliveryMethod: "email",
            });
            setStatus("2FA phone number saved.");
            onSaved?.();
        } catch (err: any) {
            setError(err?.message || "Could not save 2FA phone.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="rounded-3xl border border-white/8 bg-white/[0.03] p-5">
            <div className="mb-4">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">Protected Action</p>
                <h2 className="mt-1 text-base font-black text-white">{panelCopy.title}</h2>
                <p className="mt-1 text-xs leading-5 text-white/45">{panelCopy.description}</p>
            </div>

            <div className="rounded-3xl border border-white/[0.08] bg-black/20 p-4">
                <h3 className="text-sm font-black text-white">Step 1: OTP verification</h3>
                <p className="mt-1 text-xs text-white/45">Email is recommended: {currentEmail || "Not available"}</p>
                {currentPhone && (
                    <div className="mt-3 flex flex-wrap gap-2">
                        {(["email", "phone"] as const).map((method) => (
                            <button
                                key={`security-otp-destination-${method}`}
                                type="button"
                                onClick={() => setOtpRequestDestination(method)}
                                className={`rounded-2xl px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] transition ${otpRequestDestination === method ? "bg-white text-black" : "border border-white/10 text-white/60 hover:bg-white/5 hover:text-white"}`}
                            >
                                Send OTP to {method === "phone" ? `${currentPhoneDialCode}${currentPhone}` : "email"}
                            </button>
                        ))}
                    </div>
                )}
                <div className="mt-4 grid gap-3 min-[760px]:grid-cols-[1fr_auto]">
                    <input value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit OTP" className="rounded-2xl border border-white/[0.08] bg-[#111114] px-4 py-3 text-sm text-white focus:border-blue-500/50 focus:outline-none" />
                    <div className="flex gap-2">
                        <button type="button" onClick={requestEmailOtp} disabled={busy} className="rounded-2xl bg-white px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-black transition hover:bg-zinc-200 disabled:opacity-50">Send OTP</button>
                        <button type="button" onClick={verifyEmailOtp} disabled={busy || otp.length !== 6} className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-200 transition hover:bg-emerald-500/15 disabled:opacity-50">Verify</button>
                    </div>
                </div>
                {debugOtp && <p className="mt-3 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs font-bold text-amber-100">Debug OTP: {debugOtp}</p>}
                {securityToken && <p className="mt-3 text-xs font-bold text-emerald-300">OTP verified. Continue below.</p>}
            </div>

            {panel === "changeEmail" && (
                <div className="mt-4 rounded-3xl border border-white/[0.08] bg-black/20 p-4">
                    <h3 className="text-sm font-black text-white">Step 2: New login email</h3>
                    <div className="mt-4 grid gap-3 min-[760px]:grid-cols-[1fr_auto]">
                        <input type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} placeholder="New login email" className="rounded-2xl border border-white/[0.08] bg-[#111114] px-4 py-3 text-sm text-white focus:border-blue-500/50 focus:outline-none" />
                        <button type="button" onClick={savePrimaryAction} disabled={busy || !securityToken} className="rounded-2xl bg-white px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-black transition hover:bg-zinc-200 disabled:opacity-50">Save Email</button>
                    </div>
                </div>
            )}

            {panel === "resetPassword" && (
                <div className="mt-4 rounded-3xl border border-white/[0.08] bg-black/20 p-4">
                    <h3 className="text-sm font-black text-white">Step 2: Create new password</h3>
                    <div className="mt-4 grid gap-3 min-[760px]:grid-cols-2">
                        <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="New password" className="rounded-2xl border border-white/[0.08] bg-[#111114] px-4 py-3 text-sm text-white focus:border-blue-500/50 focus:outline-none" />
                        <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirm new password" className="rounded-2xl border border-white/[0.08] bg-[#111114] px-4 py-3 text-sm text-white focus:border-blue-500/50 focus:outline-none" />
                    </div>
                    <button type="button" onClick={savePrimaryAction} disabled={busy || !securityToken} className="mt-4 rounded-2xl bg-white px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-black transition hover:bg-zinc-200 disabled:opacity-50">Reset Password</button>
                </div>
            )}

            {panel === "passkey" && (
                <div className="mt-4 rounded-3xl border border-white/[0.08] bg-black/20 p-4">
                    <h3 className="text-sm font-black text-white">Step 2: 6-digit passkey</h3>
                    <div className="mt-4 grid gap-3 min-[760px]:grid-cols-2">
                        <input type="password" inputMode="numeric" maxLength={6} value={passkey} onChange={(event) => setPasskey(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Create 6-digit passkey" className="rounded-2xl border border-white/[0.08] bg-[#111114] px-4 py-3 text-sm text-white focus:border-blue-500/50 focus:outline-none" />
                        <input type="password" inputMode="numeric" maxLength={6} value={confirmPasskey} onChange={(event) => setConfirmPasskey(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Confirm passkey" className="rounded-2xl border border-white/[0.08] bg-[#111114] px-4 py-3 text-sm text-white focus:border-blue-500/50 focus:outline-none" />
                    </div>
                    <button type="button" onClick={savePrimaryAction} disabled={busy || !securityToken} className="mt-4 rounded-2xl bg-white px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-black transition hover:bg-zinc-200 disabled:opacity-50">Save Passkey</button>
                </div>
            )}

            {panel === "twoFactor" && (
                <div className="mt-4 space-y-4">
                    {hasSavedPhone && (
                        <div className="rounded-3xl border border-emerald-400/15 bg-emerald-400/5 p-4">
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200/70">Saved phone number</p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                <span className="rounded-2xl border border-white/10 bg-black/25 px-4 py-2 text-sm font-black text-white">
                                    {currentPhoneDialCode}{currentPhone}
                                </span>
                                <span className="text-xs font-semibold text-white/40">Verify OTP first to change this number.</span>
                            </div>
                        </div>
                    )}
                    <div className="rounded-3xl border border-white/[0.08] bg-black/20 p-4">
                        <h3 className="text-sm font-black text-white">Step 2: Country code and phone number</h3>
                        <p className="mt-1 text-xs text-white/45">
                            {canEditTwoFactorPhone ? "Enter the phone number you want to save." : "Verify OTP in Step 1 before adding or changing a phone number."}
                        </p>
                        <div className="mt-4 grid gap-3">
                            <div className="space-y-3">
                                <div className={`flex items-center gap-3 rounded-2xl border border-white/[0.08] px-4 py-3 ${canEditTwoFactorPhone ? "bg-[#111114]" : "bg-white/[0.03] opacity-65"}`}>
                                    <button type="button" disabled={!canEditTwoFactorPhone} onClick={() => setCountryModalOpen(true)} className="flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-2 transition hover:border-white/25 hover:bg-white/[0.08] disabled:cursor-not-allowed">
                                        <img src={selectedCountry.flag} alt="" className="h-4 w-6 rounded-sm object-cover" />
                                        <span className="text-sm font-black text-white">{selectedCountry.dialCode}</span>
                                        <IonIcon name="chevron-down-outline" className="text-sm text-white/45" />
                                    </button>
                                    <input disabled={!canEditTwoFactorPhone} value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value.replace(/[^\d\s-]/g, ""))} placeholder="Phone number" className="min-w-0 flex-1 bg-transparent text-sm text-white focus:outline-none disabled:cursor-not-allowed" />
                                </div>
                            </div>
                        </div>
                    </div>
                    <button type="button" onClick={saveTwoFactor} disabled={busy || !securityToken || !normalizePhone(phoneNumber)} className="rounded-2xl bg-white px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-black transition hover:bg-zinc-200 disabled:opacity-50">Save Phone Number</button>
                </div>
            )}

            {countryModalOpen && (
                <div className="fixed inset-0 z-[190] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
                    <button type="button" className="absolute inset-0" onClick={() => setCountryModalOpen(false)} aria-label="Close country selector" />
                    <div className="relative w-full max-w-xl overflow-hidden rounded-[2rem] border border-white/10 bg-[#111114] shadow-[0_30px_80px_rgba(0,0,0,0.55)]">
                        <div className="border-b border-white/8 px-5 py-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">Select Country Code</h3>
                                    <p className="mt-1 text-xs text-white/45">All countries with flags and dialing codes.</p>
                                </div>
                                <button type="button" onClick={() => setCountryModalOpen(false)} className="text-white/45 transition hover:text-white">
                                    <IonIcon name="close-outline" className="text-2xl" />
                                </button>
                            </div>
                            <div className="mt-4 flex items-center gap-2 rounded-2xl border border-white/[0.08] bg-black/30 px-3 py-2">
                                <IonIcon name="search-outline" className="text-white/35" />
                                <input value={countrySearch} onChange={(event) => setCountrySearch(event.target.value)} placeholder="Search country, LK, +94..." className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-white/25 focus:outline-none" />
                            </div>
                        </div>
                        <div className="max-h-[62vh] overflow-y-auto p-3">
                            {filteredCountries.map((country) => (
                                <button
                                    key={country.code}
                                    type="button"
                                    onClick={() => {
                                        setSelectedCountryCode(country.code);
                                        setCountryModalOpen(false);
                                        setCountrySearch("");
                                    }}
                                    className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${country.code === selectedCountry.code ? "bg-white text-black" : "text-white/75 hover:bg-white/[0.06] hover:text-white"}`}
                                >
                                    <img src={country.flag} alt="" className="h-5 w-7 rounded-sm object-cover" />
                                    <span className="min-w-0 flex-1 truncate text-sm font-bold">{country.name}</span>
                                    <span className="text-xs font-black">{country.dialCode}</span>
                                </button>
                            ))}
                            {filteredCountries.length === 0 && (
                                <div className="px-4 py-8 text-center text-sm text-white/45">No country code found.</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {(status || error) && (
                <div className={`mt-4 rounded-2xl px-4 py-3 text-xs font-bold ${error ? "border border-red-400/20 bg-red-500/10 text-red-200" : "border border-emerald-400/20 bg-emerald-500/10 text-emerald-200"}`}>
                    <IonIcon name={error ? "alert-circle-outline" : "checkmark-circle-outline"} className="mr-2 align-[-2px] text-base" />
                    {error || status}
                </div>
            )}
        </div>
    );
}
