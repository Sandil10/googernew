"use client";

import DashboardLayout from "@/app/dashboard/layout";
import Link from "next/link";
import IonIcon from "@/app/components/IonIcon";

export default function TwoFactorPage() {
    return (
        <DashboardLayout>
            <div className="mx-auto max-w-4xl pb-10 text-white">
                <section className="overflow-hidden rounded-[2rem] border border-white/8 bg-[#0c0c0f] shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
                    <div className="border-b border-white/8 px-5 py-4 min-[960px]:px-6">
                        <Link href="/dashboard/settings?tab=security" className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-white/55 transition hover:text-white">
                            <IonIcon name="arrow-back-outline" className="text-sm" />
                            Back to Security
                        </Link>
                        <h1 className="mt-3 text-lg font-black tracking-tight text-white">Change Login Email</h1>
                        <p className="mt-1 text-xs text-white/45">Verify your password and current email first, then verify the new email before it becomes your login email everywhere.</p>
                    </div>
                    <div className="space-y-4 px-5 py-5 min-[960px]:px-6">
                        <div className="rounded-3xl border border-white/8 bg-white/[0.03] p-5">
                            <h2 className="text-sm font-black text-white">Step 1: Verify password and current email</h2>
                            <p className="mt-1 text-xs text-white/45">Enter the current password before an OTP can be sent to the current email.</p>
                            <div className="mt-4 space-y-3">
                                <input type="password" placeholder="Enter current password" className="w-full rounded-2xl border border-white/[0.08] bg-[#111114] px-4 py-3 text-sm text-white focus:border-blue-500/50 focus:outline-none" />
                                <button type="button" className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-black transition hover:bg-zinc-200">Send Current Email OTP</button>
                            </div>
                        </div>
                        <div className="rounded-3xl border border-white/8 bg-white/[0.03] p-5">
                            <h2 className="text-sm font-black text-white">Step 2: Verify new email</h2>
                            <p className="mt-1 text-xs text-white/45">After current email verification, enter the new login email and verify its OTP.</p>
                            <div className="mt-4 grid gap-3 min-[760px]:grid-cols-2">
                                <input type="email" placeholder="New login email" className="rounded-2xl border border-white/[0.08] bg-[#111114] px-4 py-3 text-sm text-white focus:border-blue-500/50 focus:outline-none" />
                                <input type="text" placeholder="6-digit OTP" className="rounded-2xl border border-white/[0.08] bg-[#111114] px-4 py-3 text-sm text-white focus:border-blue-500/50 focus:outline-none" />
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </DashboardLayout>
    );
}
