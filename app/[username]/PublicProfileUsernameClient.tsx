"use client";

import ProfilePage from "@/app/dashboard/profile/page";
import DashboardLayout from "@/app/dashboard/layout";

export default function PublicProfileUsernameClient(_props: { username?: string }) {
    return (
        <DashboardLayout>
            <ProfilePage />
        </DashboardLayout>
    );
}
