"use client";

import DashboardLayout from "@/app/dashboard/layout";
import SecurityDevicesCenter from "@/app/components/security/SecurityDevicesCenter";

export default function SecurityAlertsPage() {
    return (
        <DashboardLayout>
            <SecurityDevicesCenter
                mode="loginHistory"
                pageSize={5}
                backHref="/dashboard/settings?tab=security"
                backLabel="Back to Security"
                pageTitle="Security Alerts"
                pageDescription="Review Login History only. Each page shows 5 rows, and each row can be opened for full device and map details."
                securityLinks={[
                    {
                        href: "/settings/change-login-email",
                        title: "Change Login Email",
                        description: "Verify current email OTP before changing login email.",
                    },
                    {
                        href: "/settings/trusted-devices",
                        title: "Trusted Devices",
                        description: "Review logged devices and trust/untrust controls.",
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
