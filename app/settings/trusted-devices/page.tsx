"use client";

import DashboardLayout from "@/app/dashboard/layout";
import SecurityDevicesCenter from "@/app/components/security/SecurityDevicesCenter";

export default function TrustedDevicesPage() {
    return (
        <DashboardLayout>
            <SecurityDevicesCenter
                mode="trustedDevices"
                pageSize={5}
                backHref="/dashboard/settings?tab=security"
                backLabel="Back to Security"
                pageTitle="Trusted Devices"
                pageDescription="Review logged devices only. Current device appears first, with trust/untrust, remove, logout others, and eye-map details."
            />
        </DashboardLayout>
    );
}
