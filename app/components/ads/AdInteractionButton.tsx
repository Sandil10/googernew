"use client";

import React, { useRef } from "react";
import IonIcon from "@/app/components/IonIcon";

export type AdInteractionType = "likes" | "views" | "comments" | "shares";

export type AdInteractionButtonProps = {
    type: AdInteractionType;
    icon: string;
    activeIcon?: string;
    count?: number | string;
    color?: string;
    activeColor?: string;
    isActive?: boolean;
    onSingleClick?: () => void;
    onLongPress?: () => void;
    iconSize?: string;
};

export function AdInteractionButton({
    icon,
    activeIcon,
    count,
    color,
    activeColor,
    isActive,
    onSingleClick,
    onLongPress,
    type,
    iconSize = "text-[13px] md:text-xl",
}: AdInteractionButtonProps) {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const didLongPressRef = useRef(false);
    const isLikeButton = type === "likes";

    const handlePointerDown = (event: React.PointerEvent) => {
        event.stopPropagation();
        didLongPressRef.current = false;
        if (isLikeButton || !onLongPress) return;
        timerRef.current = setTimeout(() => {
            didLongPressRef.current = true;
            onLongPress();
        }, 500);
    };

    const cancelTimer = () => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    };

    const handlePointerEnd = (event: React.PointerEvent) => {
        event.stopPropagation();
        cancelTimer();
    };

    const handleClick = (event: React.MouseEvent) => {
        event.stopPropagation();
        cancelTimer();
        if (!didLongPressRef.current) {
            onSingleClick?.();
        }
    };

    const currentIcon = isLikeButton
        ? (isActive ? activeIcon || "heart" : "heart-outline")
        : (isActive && activeIcon ? activeIcon : icon);
    const hasCount = typeof count === "number" ? count > 0 : !!count;
    const currentColorClass = isLikeButton
        ? (isActive ? "text-red-500" : "text-white")
        : (isActive ? activeColor || color || "text-white" : color || "text-white");
    const iconColorStyle = isLikeButton ? { color: isActive ? "#ef4444" : "#ffffff" } : undefined;
    const iconRenderKey = isLikeButton ? `likes-${isActive ? "liked" : "unliked"}` : currentIcon;

    return (
        <button
            type="button"
            data-interaction-type={type}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerEnd}
            onPointerLeave={handlePointerEnd}
            onClick={handleClick}
            onContextMenu={(event) => event.preventDefault()}
            className={`${currentColorClass} flex touch-none select-none items-center gap-1 transition-all duration-300 active:scale-75 focus:outline-none focus:ring-0`}
            aria-pressed={isLikeButton ? !!isActive : undefined}
        >
            <IonIcon key={iconRenderKey} name={currentIcon} className={`${iconSize} ${currentColorClass} shrink-0`} style={iconColorStyle} />
            {hasCount && <span className="shrink-0 text-[7px] font-black tracking-tighter md:text-[9px]">{count}</span>}
        </button>
    );
}
