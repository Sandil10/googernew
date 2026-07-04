"use client";

import { useEffect, useState } from "react";
import { getBadgeForUser } from "@/app/lib/badgeCache";

const BADGE_HEX: Record<string, string> = {
    blue:   "#3897F0",
    gold:   "#facc15",
    green:  "#22c55e",
    purple: "#a855f7",
    red:    "#ef4444",
    orange: "#f97316",
    cyan:   "#06b6d4",
    silver: "#94a3b8",
    bronze: "#cd7f32",
    black:  "#3d3d3d",
};

export function resolveHex(color: string): string {
    return BADGE_HEX[color] || (color?.startsWith('#') ? color : "#3897F0");
}

export type VerifiedBadgeData = { color: string; tickColor?: string | null };

export function BadgeSvg({ color, tickColor, size = 14 }: { color: string; tickColor?: string | null; size?: number }) {
    const hex = resolveHex(color);
    const isBlack = hex === "#3d3d3d";
    const isRed   = hex === "#ef4444";
    const shine   = isBlack || isRed;
    const tick    = tickColor || (isBlack ? "#ef4444" : isRed ? "#000000" : "#ffffff");
    const id      = `shine-${hex.replace('#', '')}`;
    return (
        <svg width={size} height={size} viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'inline', flexShrink: 0 }}>
            {shine && (
                <defs>
                    <radialGradient id={id} cx="35%" cy="30%" r="60%">
                        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.45" />
                        <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                    </radialGradient>
                </defs>
            )}
            <path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.438 1.69-.882.445-.47.749-1.055.878-1.688.13-.633.08-1.29-.144-1.896.587-.274 1.087-.705 1.443-1.245.356-.54.555-1.17.574-1.817z" fill={hex} />
            {shine && (
                <path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.438 1.69-.882.445-.47.749-1.055.878-1.688.13-.633.08-1.29-.144-1.896.587-.274 1.087-.705 1.443-1.245.356-.54.555-1.17.574-1.817z" fill={`url(#${id})`} />
            )}
            <path d="M7.5 11l2.5 2.5L15 8.5" stroke={tick} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

// Hook — fetches badge for a userId and returns it
export function useUserBadge(userId: number | string | null | undefined) {
    const [badge, setBadge] = useState<VerifiedBadgeData | null>(null);

    useEffect(() => {
        if (!userId) return;
        let cancelled = false;
        getBadgeForUser(userId).then(b => { if (!cancelled) setBadge(b); });
        return () => { cancelled = true; };
    }, [userId]);

    return badge;
}

// Drop-in component: fetches + renders badge for a userId, positioned as inline-block
export function UserVerifiedBadge({ userId, size = 14 }: { userId: number | string | null | undefined; size?: number }) {
    const badge = useUserBadge(userId);
    if (!badge) return null;
    return <BadgeSvg color={badge.color} tickColor={badge.tickColor} size={size} />;
}
