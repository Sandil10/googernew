"use client";

import DashboardLayout from "@/app/dashboard/layout";
import LegalPage from "@/app/components/legal/LegalPage";

export default function PrivacyPolicyPage() {
    return (
        <DashboardLayout>
            <LegalPage activeTab="privacy" />
        </DashboardLayout>
    );
}
