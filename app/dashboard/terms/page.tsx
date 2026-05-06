"use client";

import { useRouter } from "next/navigation";
import IonIcon from "@/app/components/IonIcon";

const sections = [
    {
        title: "Platform Use",
        body: "Use Googer lawfully and respectfully. Do not upload harmful, deceptive, abusive, or unauthorized content."
    },
    {
        title: "Privacy",
        body: "Your profile and activity settings control visibility, but you are responsible for what you share publicly."
    },
    {
        title: "Payments and Orders",
        body: "Orders, refunds, and delivery expectations depend on the listing terms and the platform payment flow in effect."
    },
    {
        title: "Account Safety",
        body: "Protect your password and device access. Report suspicious activity immediately if you think your account has been compromised."
    }
];

export default function TermsPage() {
    const router = useRouter();

    return (
        <div className="mx-auto max-w-3xl pb-10 text-white">
            <section className="overflow-hidden rounded-[2rem] border border-white/8 bg-[#0c0c0f] shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
                <div className="flex items-center justify-between border-b border-white/8 px-5 py-4 sm:px-6">
                    <div>
                        <h1 className="text-lg font-black tracking-tight text-white">Terms and Policies</h1>
                        <p className="mt-1 text-xs text-white/45">High-level platform terms for account and profile use.</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => router.back()}
                        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-bold text-white transition hover:bg-white/[0.07]"
                    >
                        <IonIcon name="arrow-back-outline" className="text-sm" />
                        Back
                    </button>
                </div>

                <div className="space-y-4 px-5 py-5 sm:px-6">
                    {sections.map((section) => (
                        <article key={section.title} className="rounded-3xl border border-white/8 bg-white/[0.03] p-5">
                            <h2 className="text-sm font-black uppercase tracking-widest text-white">{section.title}</h2>
                            <p className="mt-3 text-sm leading-6 text-zinc-300">{section.body}</p>
                        </article>
                    ))}
                </div>
            </section>
        </div>
    );
}
