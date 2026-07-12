"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdCampaignPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace("/ad-campaign/photo-video");
    }, [router]);

    return <div className="min-h-[320px]" />;
}
