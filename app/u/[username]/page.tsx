"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { getPublicProfileHref } from "@/app/lib/profileRoute";

export default function LegacyPublicProfileShortUrlPage() {
    const params = useParams();
    const router = useRouter();
    const username = String(params?.username || "").trim();

    useEffect(() => {
        router.replace(username ? getPublicProfileHref(username) : "/");
    }, [router, username]);

    return (
        <main className="min-h-screen bg-[#1c1917] flex items-center justify-center">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-white" />
        </main>
    );
}
