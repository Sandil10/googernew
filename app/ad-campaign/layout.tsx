"use client";

import type { ReactNode } from "react";
import DashboardLayout from "@/app/dashboard/layout";

export default function AdCampaignLayout({ children }: { children: ReactNode }) {
    return <DashboardLayout>{children}</DashboardLayout>;
}
