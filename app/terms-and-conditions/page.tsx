"use client";

import DashboardLayout from "@/app/dashboard/layout";
import LegalPage from "@/app/components/legal/LegalPage";

export default function TermsAndConditionsPage() {
    return (
        <DashboardLayout>
            <LegalPage activeTab="terms" />
        </DashboardLayout>
    );
}
