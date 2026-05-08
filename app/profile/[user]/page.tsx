"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authService } from "@/services/authService";
import { marketService } from "@/services/marketService";
import { PublicProfileView } from "@/app/components/profile/PublicProfileView";
import IonIcon from "@/app/components/IonIcon";

export default function ProfileRedirectPage() {
    const params = useParams();
    const router = useRouter();
    const userParam = params?.user as string;
    const [user, setUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);

    useEffect(() => {
        const resolveUser = async () => {
            try {
                if (!userParam) {
                    router.push("/");
                    return;
                }

                const result = await marketService.getUnifiedShareItem(userParam);
                if (result?.success && result?.type === "profile" && result?.data) {
                    setUser(result.data);
                    setLoading(false);
                    return;
                }

                // Check if it's a numeric ID or username
                const isNumericId = /^\d+$/.test(userParam);
                let data;
                
                if (isNumericId) {
                    try {
                        data = await authService.getUserProfile(userParam);
                    } catch {
                        // If numeric but fails, try as username (some usernames could be numbers)
                        try {
                            data = await authService.getUserByUsername(userParam);
                        } catch {
                            setNotFound(true);
                        }
                    }
                } else {
                    try {
                        data = await authService.getUserByUsername(userParam);
                    } catch {
                        setNotFound(true);
                    }
                }

                if (data) {
                    setUser(data);
                } else {
                    setNotFound(true);
                }
            } catch (error) {
                console.error("Error resolving user:", error);
                setNotFound(true);
            } finally {
                setLoading(false);
            }
        };

        resolveUser();
    }, [userParam, router]);

    if (loading) {
        return (
            <main className="min-h-screen bg-[#1c1917] flex items-center justify-center">
                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-white"></div>
            </main>
        );
    }

    if (notFound) {
        return (
            <main className="min-h-screen bg-[#1c1917] text-white flex items-center justify-center px-4">
                <div className="text-center max-w-sm">
                    <div className="mb-4 text-6xl opacity-50">🔍</div>
                    <h1 className="text-2xl font-black mb-2">User Not Found</h1>
                    <p className="text-white/60 mb-6">This profile doesn't exist.</p>
                    <button
                        onClick={() => router.push("/")}
                        className="rounded-xl bg-white/[0.08] hover:bg-white/[0.12] px-6 py-3 text-sm font-black uppercase tracking-[0.14em] text-white transition"
                    >
                        Back to Home
                    </button>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-[#1c1917] text-white">
            <div className="mx-auto max-w-[1280px] p-4">
                <button
                    type="button"
                    onClick={() => router.push("/dashboard")}
                    className="mb-4 inline-flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-[11px] font-black uppercase tracking-[0.14em] text-white/70 transition hover:bg-white/[0.08] hover:text-white"
                >
                    <IonIcon name="grid-outline" className="text-base" />
                    Go to Dashboard
                </button>
                <PublicProfileView user={user} isPublic={true} />
            </div>
        </main>
    );
}
