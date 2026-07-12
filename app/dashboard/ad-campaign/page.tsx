"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import IonIcon from "@/app/components/IonIcon";

export default function AdCampaignPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace("/ad-campaign/photo-video");
    }, [router]);

    return (
        <div>
            <div className="mb-6 flex items-center gap-3">
                <button
                    type="button"
                    onClick={() => router.back()}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white active:scale-95"
                >
                    <IonIcon name="arrow-back-outline" className="text-xl" />
                </button>
            </div>

            <div className="min-h-[320px]" />
        </div>
    );
}
