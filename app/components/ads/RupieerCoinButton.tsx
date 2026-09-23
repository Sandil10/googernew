"use client";

import Image from "next/image";
import type React from "react";

type RupieerCoinButtonProps = {
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
    /** Positioning / spacing only — the look itself is fixed here. */
    className?: string;
    /** Smaller pill for the tight card layouts. */
    compact?: boolean;
    ariaLabel?: string;
};

/**
 * The one "collect ad coin" pill every ad surface uses, and the same button
 * the mobile app draws: a plain red pill (no outline ring), a coin badge, and
 * the word "Rupieer" with only the R capitalised.
 *
 * rupee.png is a wide canvas whose coin covers under half of its width, so at
 * "contain" size inside a badge it read as a speck. It is drawn about twice
 * the badge's width and clipped to the circle instead, which puts the coin
 * itself edge to edge in the badge without making the pill any taller.
 */
export default function RupieerCoinButton({
    onClick,
    className = "",
    compact = false,
    ariaLabel = "Collect ad coin",
}: RupieerCoinButtonProps) {
    const badge = compact ? 20 : 24;
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={ariaLabel}
            className={`flex items-center rounded-full bg-red-600 font-black text-white shadow-xl transition hover:bg-red-500 active:scale-95 ${
                compact ? "gap-1 py-0.5 pl-0.5 pr-2 text-[9px]" : "gap-1.5 py-0.5 pl-0.5 pr-2.5 text-[10px]"
            } ${className}`}
        >
            <span
                className="relative block flex-none overflow-hidden rounded-full"
                style={{ width: badge, height: badge }}
            >
                <Image
                    src="/assets/images/rupee.png"
                    alt="Rupieer coin"
                    width={200}
                    height={150}
                    unoptimized
                    className="pointer-events-none absolute left-1/2 top-1/2 max-w-none -translate-x-1/2 -translate-y-1/2"
                    style={{ width: Math.round(badge * 2.05), height: "auto" }}
                />
            </span>
            <span className="leading-none tracking-[0.02em]">Rupieer</span>
        </button>
    );
}
