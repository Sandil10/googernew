"use client";

import DashboardLayout from "@/app/dashboard/layout";

export default function ProfileRouteLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <DashboardLayout>{children}</DashboardLayout>;
}
