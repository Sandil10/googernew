"use client";

import React from "react";

// Allowed named colors mapped to their CSS values. Hex codes (#RRGGBB / #RGB)
// are accepted as-is. Anything else falls back to inherit, so user-supplied
// values can't inject arbitrary CSS.
const NAMED_COLORS: Record<string, string> = {
    red:    "#ef4444",
    orange: "#f97316",
    yellow: "#eab308",
    green:  "#22c55e",
    teal:   "#14b8a6",
    blue:   "#3b82f6",
    indigo: "#6366f1",
    purple: "#a855f7",
    pink:   "#ec4899",
    white:  "#ffffff",
    gray:   "#9ca3af",
    black:  "#000000",
};

const safeColor = (raw: string): string | null => {
    const v = raw.trim().toLowerCase();
    if (NAMED_COLORS[v]) return NAMED_COLORS[v];
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(v)) return v;
    return null;
};

// Parses BBCode-style `[c=NAME]text[/c]` segments. Unknown tags are rendered
// verbatim so the message is never lost. Plain text without tags returns as-is.
export function ChatRichText({ text, className }: { text?: string | null; className?: string }) {
    const value = text || "";
    if (!value.includes("[c=") && !value.includes("[/c]")) {
        return <p className={className}>{value}</p>;
    }

    const out: React.ReactNode[] = [];
    const regex = /\[c=([^\]]+)\]([\s\S]*?)\[\/c\]/g;
    let cursor = 0;
    let match: RegExpExecArray | null;
    let key = 0;
    while ((match = regex.exec(value)) !== null) {
        if (match.index > cursor) out.push(value.slice(cursor, match.index));
        const color = safeColor(match[1]);
        if (color) {
            out.push(
                <span key={`c-${key++}`} style={{ color }}>{match[2]}</span>
            );
        } else {
            out.push(match[0]);
        }
        cursor = regex.lastIndex;
    }
    if (cursor < value.length) out.push(value.slice(cursor));

    return <p className={className}>{out}</p>;
}

export const CHAT_COLOR_PALETTE: { name: string; hex: string }[] = Object.keys(NAMED_COLORS)
    .filter((n) => n !== "black")
    .map((n) => ({ name: n, hex: NAMED_COLORS[n] }));

// Wraps the given selection range of `text` in a [c=color]...[/c] tag.
// If selection is empty, inserts an empty tag at the caret position.
export function wrapWithColorTag(
    text: string,
    selStart: number,
    selEnd: number,
    color: string,
): { value: string; cursor: number } {
    const before = text.slice(0, selStart);
    const middle = text.slice(selStart, selEnd);
    const after  = text.slice(selEnd);
    const tagged = `[c=${color}]${middle}[/c]`;
    return {
        value: before + tagged + after,
        cursor: before.length + tagged.length,
    };
}
