"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import IonIcon from "@/app/components/IonIcon";
import { authService } from "@/services/authService";

export default function SuspendedPage() {
    const router = useRouter();
    const [data, setData] = useState<any>(null);
    const [appeal, setAppeal] = useState("");
    const [contactEmail, setContactEmail] = useState("");
    const [phoneNumber, setPhoneNumber] = useState("");
    const [agreementConfirmed, setAgreementConfirmed] = useState(false);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const load = async () => {
        try {
            setLoading(true);
            if (!authService.isAuthenticated()) {
                router.replace("/");
                return;
            }
            const suspension = await authService.getSuspension();
            // Self-deactivated users should never see this page — they were logged out
            if (suspension?.suspension_reason_category === "Self Deactivated" || suspension?.deactivation_reason === "Self Deactivated") {
                authService.logout();
                return;
            }
            setData(suspension);
            setContactEmail(suspension?.appeal_contact_email || "");
            setPhoneNumber(suspension?.appeal_phone_number || "");
            setAgreementConfirmed(Boolean(suspension?.appeal_agreement_confirmed));
            if (!suspension?.is_deactivated && suspension?.appeal_status !== "approved") router.replace("/dashboard");
        } catch (err: any) {
            setError(err?.message || "Failed to load suspension details.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void load(); }, []);

    const submitAppeal = async () => {
        if (!appeal.trim() || !contactEmail.trim() || !phoneNumber.trim() || !agreementConfirmed) return;
        try {
            setSubmitting(true);
            const next = await authService.submitSuspensionAppeal({
                appeal: appeal.trim(),
                contactEmail: contactEmail.trim(),
                phoneNumber: phoneNumber.trim(),
                agreementConfirmed,
            });
            setData((prev: any) => ({ ...prev, ...next }));
            setAppeal("");
        } catch (err: any) {
            setError(err?.message || "Failed to submit appeal.");
        } finally {
            setSubmitting(false);
        }
    };

    const reason = data?.suspension_reason_category || data?.deactivation_reason || "Other";

    return (
        <main className="flex min-h-screen items-center justify-center bg-[#151312] px-4 py-10 text-white">
            <section className="w-full max-w-lg rounded-[2rem] border border-red-500/20 bg-[#09090b] p-6 shadow-2xl">
                <div className="mb-5 flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-red-500/25 bg-red-500/10 text-red-300">
                        <IonIcon name="ban-outline" className="text-2xl" />
                    </div>
                    <div>
                        <h1 className="text-lg font-black tracking-tight">Account Suspended</h1>
                        <p className="text-xs font-bold text-white/40">@{data?.username || "user"}</p>
                    </div>
                </div>

                {loading ? (
                    <div className="py-10 text-center text-sm font-bold text-white/45">Loading...</div>
                ) : (
                    <div className="space-y-5">
                        <p className="text-sm font-semibold leading-6 text-white/75">
                            Your account has been suspended due to a violation of our Community Guidelines.
                        </p>

                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                            <p className="text-[10px] font-black uppercase tracking-widest text-red-300">Reason:</p>
                            <p className="mt-1 text-base font-black text-white">{reason}</p>
                        </div>

                        {data?.suspended_wallet_access && (
                            <button
                                onClick={() => router.push("/wallet/my-wallet")}
                                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-emerald-500/25 bg-emerald-500/15 text-[10px] font-black uppercase tracking-widest text-emerald-200 transition hover:bg-emerald-500/25"
                            >
                                <IonIcon name="wallet-outline" className="text-sm" />
                                Wallet Access
                            </button>
                        )}

                        {data?.appeal_status === "pending" && (
                            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm font-bold text-amber-200">
                                <p>Your appeal has been submitted and is waiting for admin review.</p>
                                {data?.appeal_id && <p className="mt-2 text-xs text-amber-100/70">Appeal ID - {data.appeal_id}</p>}
                            </div>
                        )}

                        {data?.appeal_status === "approved" && (
                            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-200">
                                <p>Your appeal was approved.</p>
                                {data?.appeal_id && <p className="mt-2 text-xs text-emerald-100/70">Appeal ID - {data.appeal_id}</p>}
                                {data?.appeal_admin_note && <p className="mt-2 text-xs text-emerald-100/70">{data.appeal_admin_note}</p>}
                                <button
                                    onClick={() => router.push("/dashboard")}
                                    className="mt-4 h-10 rounded-xl bg-emerald-500 px-4 text-[10px] font-black uppercase tracking-widest text-black"
                                >
                                    Go To Dashboard
                                </button>
                            </div>
                        )}

                        {data?.appeal_status === "rejected" && (
                            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm font-bold text-red-200">
                                <p>Your appeal was rejected.</p>
                                {data?.appeal_id && <p className="mt-2 text-xs text-red-100/70">Appeal ID - {data.appeal_id}</p>}
                                {data?.appeal_admin_note && <p className="mt-2 text-xs text-red-100/70">{data.appeal_admin_note}</p>}
                            </div>
                        )}

                        {!["pending", "approved", "rejected"].includes(data?.appeal_status) && (
                            <div className="space-y-3">
                                <label className="block text-[10px] font-black uppercase tracking-widest text-white/40">Submit Appeal</label>
                                <input
                                    type="text"
                                    value={contactEmail}
                                    onChange={(e) => setContactEmail(e.target.value)}
                                    placeholder="Contact Email"
                                    className="h-12 w-full rounded-2xl border border-white/10 bg-black px-4 text-sm text-white outline-none placeholder:text-white/25 focus:border-red-400/40"
                                />
                                <input
                                    type="tel"
                                    value={phoneNumber}
                                    onChange={(e) => setPhoneNumber(e.target.value)}
                                    placeholder="Phone Number"
                                    className="h-12 w-full rounded-2xl border border-white/10 bg-black px-4 text-sm text-white outline-none placeholder:text-white/25 focus:border-red-400/40"
                                />
                                <textarea
                                    value={appeal}
                                    onChange={(e) => setAppeal(e.target.value)}
                                    maxLength={2000}
                                    rows={4}
                                    placeholder="Explain why this suspension should be reviewed..."
                                    className="w-full resize-none rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-red-400/40"
                                />
                                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-xs font-bold leading-5 text-white/70">
                                    <input
                                        type="checkbox"
                                        checked={agreementConfirmed}
                                        onChange={(e) => setAgreementConfirmed(e.target.checked)}
                                        className="mt-0.5 h-4 w-4 accent-emerald-500"
                                    />
                                    <span>I confirm that the information provided is accurate and complete.</span>
                                </label>
                                <button
                                    onClick={submitAppeal}
                                    disabled={submitting || !appeal.trim() || !contactEmail.trim() || !phoneNumber.trim() || !agreementConfirmed}
                                    className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white text-[10px] font-black uppercase tracking-widest text-black transition hover:bg-zinc-200 disabled:opacity-40"
                                >
                                    <IonIcon name="send-outline" className="text-sm" />
                                    {submitting ? "Submitting..." : "Submit Appeal"}
                                </button>
                            </div>
                        )}

                        {error && <p className="text-xs font-bold text-red-300">{error}</p>}
                    </div>
                )}
            </section>
        </main>
    );
}
