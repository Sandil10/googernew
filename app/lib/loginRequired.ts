"use client";

export const LOGIN_REQUIRED_EVENT = "googer-login-required";
export const OPEN_LOGIN_MODAL_EVENT = "googer-open-login-modal";

export type LoginRequiredDetail = {
    title?: string;
    message?: string;
    redirectTo?: string;
};

export function openLoginRequired(detail: LoginRequiredDetail = {}) {
    if (typeof window === "undefined") return;

    window.dispatchEvent(
        new CustomEvent(LOGIN_REQUIRED_EVENT, {
            detail: {
                title: detail.title || "Login Required",
                message: detail.message || "Please log in to continue.",
                redirectTo: detail.redirectTo || "/",
            },
        }),
    );
}

export function openLoginModal() {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(OPEN_LOGIN_MODAL_EVENT));
}
