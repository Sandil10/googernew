"use client";

import DashboardLayout from "@/app/dashboard/layout";
import SecurityDevicesCenter from "@/app/components/security/SecurityDevicesCenter";

export default function SecurityAlertsPage() {
    return (
        <DashboardLayout>
            <SecurityDevicesCenter
                backHref="/dashboard/settings?tab=security"
                backLabel="Back to Security"
                pageTitle="Security Alerts"
                pageDescription="Review login history, new-device attempts, browser and operating-system details, trust status, approximate location, and map previews."
                securityLinks={[
                    {
                        href: "/settings/two-factor",
                        title: "Change Login Email",
                        description: "Verify your password, current email, and new email.",
                    },
                    {
                        href: "/settings/passkeys",
                        title: "6-Digit Passkey",
                        description: "Enable, change, or remove your passkey.",
                    },
                    {
                        href: "/settings/reset-password",
                        title: "Reset Password",
                        description: "Verify your password and OTP before updating it.",
                    },
                ]}
            />
        </DashboardLayout>
    );
}
