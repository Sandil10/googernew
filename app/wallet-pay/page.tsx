"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { authService } from "@/services/authService";

export default function WalletPayRedirectPage() {
    const router = useRouter();

    useEffect(() => {
        const targetId = new URLSearchParams(window.location.search).get("to") || "";
        const targetPath = targetId
            ? `/dashboard/wallet/my-wallet?to=${encodeURIComponent(targetId)}`
            : "/dashboard/wallet/my-wallet";

        if (authService.isAuthenticated()) {
            router.replace(targetPath);
            return;
        }

        router.replace(`/login?redirect=${encodeURIComponent(targetPath)}`);
    }, [router]);

    return (
        <div className="flex min-h-screen items-center justify-center bg-black px-4 text-center text-white">
            <div>
                <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-white"></div>
                <p className="text-sm font-semibold text-white/70">Opening wallet...</p>
            </div>
        </div>
    );
}
