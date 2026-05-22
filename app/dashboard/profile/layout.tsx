"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { authService } from "@/services/authService";
import { openLoginRequired } from "@/app/lib/loginRequired";

export default function ProfileLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const router = useRouter();

    useEffect(() => {
        if (authService.isAuthenticated()) return;

        openLoginRequired({
            message: "Please log in to open your profile.",
        });
        router.replace("/dashboard");
    }, [router]);

    if (!authService.isAuthenticated()) {
        return null;
    }

    return <>{children}</>;
}
