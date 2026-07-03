"use client";

import DashboardLayout from "@/app/dashboard/layout";
import Link from "next/link";
import IonIcon from "@/app/components/IonIcon";

export default function PasskeysPage() {
    return (
        <DashboardLayout>
            <div className="mx-auto max-w-4xl pb-10 text-white">
                <section className="overflow-hidden rounded-[2rem] border border-white/8 bg-[#0c0c0f] shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
                    <div className="border-b border-white/8 px-5 py-4 min-[960px]:px-6">
                        <Link href="/dashboard/settings?tab=security" className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-white/55 transition hover:text-white">
                            <IonIcon name="arrow-back-outline" className="text-sm" />
                            Back to Security
                        </Link>
                        <h1 className="mt-3 text-lg font-black tracking-tight text-white">6-Digit Passkey</h1>
                        <p className="mt-1 text-xs text-white/45">Enable, change, or remove your account passkey.</p>
                    </div>
                    <div className="space-y-4 px-5 py-5 min-[960px]:px-6">
                        <div className="rounded-3xl border border-white/8 bg-white/[0.03] p-5">
                            <h2 className="text-sm font-black text-white">Passkey Status</h2>
                            <p className="mt-2 text-sm text-white/65">Optional, not enabled yet.</p>
                            <div className="mt-4 grid gap-3 min-[760px]:grid-cols-2">
                                <input type="password" maxLength={6} placeholder="Create 6-digit passkey" className="rounded-2xl border border-white/[0.08] bg-[#111114] px-4 py-3 text-sm text-white focus:border-blue-500/50 focus:outline-none" />
                                <input type="password" maxLength={6} placeholder="Confirm passkey" className="rounded-2xl border border-white/[0.08] bg-[#111114] px-4 py-3 text-sm text-white focus:border-blue-500/50 focus:outline-none" />
                            </div>
                            <button type="button" className="mt-4 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-black transition hover:bg-zinc-200">Save Passkey</button>
                        </div>
                    </div>
                </section>
            </div>
        </DashboardLayout>
    );
}
