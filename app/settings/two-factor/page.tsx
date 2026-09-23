"use client";

import SecurityActionPage from "../SecurityActionPage";

export default function TwoFactorPage() {
    return (
        <SecurityActionPage
            panel="twoFactor"
            title="2FA"
            description="Verify your current email first, then add a phone number with a full country-code and flag selector. After saving, choose email or phone for future OTPs."
        />
    );
}
