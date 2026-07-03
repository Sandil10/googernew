"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authService, getStoredUserSync } from "@/services/authService";
import { openLoginRequired } from "@/app/lib/loginRequired";

export default function ProfileLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const router = useRouter();
    const [isChecking, setIsChecking] = useState(true);
    const [hasAccess, setHasAccess] = useState(() => !!(authService.isAuthenticated() || getStoredUserSync()));

    useEffect(() => {
        let active = true;

        const checkAccess = async () => {
            const hasLocalSession = authService.isAuthenticated() || !!getStoredUserSync();
            if (hasLocalSession) {
                if (active) {
                    setHasAccess(true);
                    setIsChecking(false);
                }
                return;
            }

            try {
                const user = await authService.resolveActiveUser();
                if (!active) return;
                setHasAccess(!!user);
            } catch {
                if (!active) return;
                setHasAccess(false);
                openLoginRequired({
                    message: "Please log in to open your profile.",
                });
                router.replace("/dashboard");
            } finally {
                if (active) setIsChecking(false);
            }
        };

        checkAccess();

        return () => {
            active = false;
        };
    }, [router]);

    if (isChecking || !hasAccess) {
        return null;
    }

    return <>{children}</>;
}
