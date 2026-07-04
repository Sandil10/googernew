"use client";

import SecurityActionPage from "../SecurityActionPage";

export default function ChangeLoginEmailPage() {
    return (
        <SecurityActionPage
            panel="changeEmail"
            title="Change Login Email"
            description="Verify the current login email by OTP first. After the debug/test OTP is verified, save the new login email."
        />
    );
}
