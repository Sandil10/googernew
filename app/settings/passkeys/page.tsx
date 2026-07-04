"use client";

import SecurityActionPage from "../SecurityActionPage";

export default function PasskeysPage() {
    return (
        <SecurityActionPage
            panel="passkey"
            title="6-Digit Passkey"
            description="Verify the current login email by OTP before enabling or changing your 6-digit account passkey."
        />
    );
}
