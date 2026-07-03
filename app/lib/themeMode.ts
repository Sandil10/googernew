"use client";

import { useEffect, useState } from "react";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "googer-theme-mode";

const getSystemTheme = (): ResolvedTheme => {
    if (typeof window === "undefined") return "dark";
    return window.matchMedia?.("(prefers-color-scheme: light)")?.matches ? "light" : "dark";
};

export const resolveThemePreference = (preference: ThemePreference): ResolvedTheme => {
    return preference === "system" ? getSystemTheme() : preference;
};

export const applyThemePreference = (preference: ThemePreference) => {
    if (typeof document === "undefined") return;
    const resolved = resolveThemePreference(preference);
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.themePreference = preference;
    document.documentElement.style.colorScheme = resolved;
    document.documentElement.classList.toggle("light-theme", resolved === "light");
    document.documentElement.classList.toggle("dark-theme", resolved === "dark");
    document.body.dataset.theme = resolved;
    document.body.classList.toggle("light-theme", resolved === "light");
    document.body.classList.toggle("dark-theme", resolved === "dark");
    const themeColor = document.querySelector('meta[name="theme-color"]');
    themeColor?.setAttribute("content", resolved === "light" ? "#f6f7fb" : "#000000");
};

export const getStoredThemePreference = (): ThemePreference => {
    if (typeof window === "undefined") return "system";
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
};

export function useThemePreference() {
    const [preference, setPreferenceState] = useState<ThemePreference>("system");
    const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("dark");

    useEffect(() => {
        const initialPreference = getStoredThemePreference();
        setPreferenceState(initialPreference);
        const initialResolved = resolveThemePreference(initialPreference);
        setResolvedTheme(initialResolved);
        applyThemePreference(initialPreference);

        const media = window.matchMedia?.("(prefers-color-scheme: dark)");
        const handleSystemChange = () => {
            const currentPreference = getStoredThemePreference();
            if (currentPreference !== "system") return;
            const nextResolved = resolveThemePreference("system");
            setResolvedTheme(nextResolved);
            applyThemePreference("system");
        };

        media?.addEventListener?.("change", handleSystemChange);
        return () => media?.removeEventListener?.("change", handleSystemChange);
    }, []);

    const setPreference = (next: ThemePreference) => {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
        setPreferenceState(next);
        const nextResolved = resolveThemePreference(next);
        setResolvedTheme(nextResolved);
        applyThemePreference(next);
    };

    const toggleManualTheme = () => {
        setPreference(resolvedTheme === "dark" ? "light" : "dark");
    };

    return {
        preference,
        resolvedTheme,
        isDark: resolvedTheme === "dark",
        isSystem: preference === "system",
        setPreference,
        toggleManualTheme,
    };
}
