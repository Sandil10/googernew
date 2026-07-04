"use client";

import { useRouter } from "next/navigation";
import IonIcon from "@/app/components/IonIcon";

const supportTopics = [
    {
        title: "Account & Security",
        icon: "shield-checkmark-outline",
        body: "Login problems, OTP, passkey, trusted devices, suspicious sessions, and account recovery.",
    },
    {
        title: "Orders & Payments",
        icon: "receipt-outline",
        body: "Product orders, top-ups, withdrawals, refunds, wallet balance, and payment verification.",
    },
    {
        title: "Products & Ads",
        icon: "megaphone-outline",
        body: "Product listings, ad campaigns, upload content, blurred previews, reposts, shares, and reach.",
    },
    {
        title: "Profile & Privacy",
        icon: "person-circle-outline",
        body: "Profile uploads, contact visibility, privacy settings, blocked accounts, comments, and reports.",
    },
];

export default function SupportPage() {
    const router = useRouter();

    return (
        <div className="mx-auto max-w-4xl pb-10 text-white">
            <section className="overflow-hidden rounded-[2rem] border border-white/8 bg-[#0c0c0f] shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
                <div className="flex items-center justify-between border-b border-white/8 px-5 py-4 sm:px-6">
                    <div>
                        <h1 className="text-lg font-black tracking-tight text-white">Help & Support</h1>
                        <p className="mt-1 text-xs text-white/45">Choose the issue type and continue from the right Googer support area.</p>
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

                <div className="space-y-5 px-5 py-5 sm:px-6">
                    <div className="rounded-3xl border border-white/8 bg-white/[0.03] p-5">
                        <div className="flex flex-col gap-4 min-[760px]:flex-row min-[760px]:items-center min-[760px]:justify-between">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/35">Googer Support</p>
                                <h2 className="mt-2 text-base font-black text-white">Start from chat for account-specific help</h2>
                                <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
                                    Support conversations appear as Googer Support when an admin or super admin handles your request.
                                    Include order numbers, product links, screenshots, or transaction IDs when they are relevant.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => router.push("/chats")}
                                className="rounded-2xl bg-white px-4 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-black transition hover:bg-zinc-200"
                            >
                                Open Chats
                            </button>
                        </div>
                    </div>

                    <div className="grid gap-4 min-[860px]:grid-cols-2">
                        {supportTopics.map((topic) => (
                            <article key={topic.title} className="rounded-3xl border border-white/8 bg-white/[0.03] p-5">
                                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/[0.06] text-white">
                                    <IonIcon name={topic.icon} className="text-xl" />
                                </div>
                                <h3 className="text-sm font-black uppercase tracking-widest text-white">{topic.title}</h3>
                                <p className="mt-3 text-sm leading-6 text-zinc-300">{topic.body}</p>
                            </article>
                        ))}
                    </div>

                    <div className="rounded-3xl border border-amber-400/20 bg-amber-400/10 p-5">
                        <h3 className="text-sm font-black text-amber-100">Security warning</h3>
                        <p className="mt-2 text-sm leading-6 text-amber-100/75">
                            Googer support will never ask for your password, OTP, passkey, private key, or full card details.
                            If someone asks for those, do not share them and report the conversation.
                        </p>
                    </div>
                </div>
            </section>
        </div>
    );
}
