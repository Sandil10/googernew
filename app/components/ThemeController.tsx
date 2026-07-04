"use client";

import { useThemePreference } from "@/app/lib/themeMode";

export default function ThemeController() {
    useThemePreference();
    return null;
}
