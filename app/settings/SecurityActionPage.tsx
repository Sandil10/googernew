"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DashboardLayout from "@/app/dashboard/layout";
import IonIcon from "@/app/components/IonIcon";
import SecurityActionPanel from "@/app/dashboard/settings/SecurityActionPanel";
import { authService } from "@/services/authService";

type ActionPanel = "changeEmail" | "passkey" | "resetPassword" | "twoFactor";

type Props = {
    panel: ActionPanel;
    title: string;
    description: string;
};

export default function SecurityActionPage({ panel, title, description }: Props) {
    const [currentEmail, setCurrentEmail] = useState("");
    const [securityProfile, setSecurityProfile] = useState<any>(null);

    useEffect(() => {
        let cancelled = false;
        authService.getProfile()
            .then((profile) => {
                if (!cancelled) {
                    setCurrentEmail(profile?.email || "");
                    setSecurityProfile(profile || null);
                }
            })
            .catch(() => {
                if (!cancelled) setCurrentEmail("");
            });
        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <DashboardLayout>
            <div className="mx-auto max-w-4xl pb-10 text-white">
                <section className="overflow-hidden rounded-[2rem] border border-white/8 bg-[#0c0c0f] shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
                    <div className="border-b border-white/8 px-5 py-4 min-[960px]:px-6">
                        <Link href="/dashboard/settings?tab=security" className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-white/55 transition hover:text-white">
                            <IonIcon name="arrow-back-outline" className="text-sm" />
                            Back to Security
                        </Link>
                        <h1 className="mt-3 text-lg font-black tracking-tight text-white">{title}</h1>
                        <p className="mt-1 max-w-2xl text-xs leading-5 text-white/45">{description}</p>
                    </div>
                    <div className="space-y-4 px-5 py-5 min-[960px]:px-6">
                        <SecurityActionPanel
                            panel={panel}
                            currentEmail={currentEmail}
                            currentPhone={securityProfile?.two_factor_phone_number || ""}
                            currentPhoneDialCode={securityProfile?.two_factor_phone_dial_code || ""}
                            preferredOtpDelivery={securityProfile?.otp_delivery_method || "email"}
                        />
                    </div>
                </section>
            </div>
        </DashboardLayout>
    );
}
