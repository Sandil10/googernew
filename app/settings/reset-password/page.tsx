"use client";

import SecurityActionPage from "../SecurityActionPage";

export default function ResetPasswordPage() {
    return (
        <SecurityActionPage
            panel="resetPassword"
            title="Reset Password"
            description="Verify the current login email by OTP before creating a new password."
        />
    );
}
