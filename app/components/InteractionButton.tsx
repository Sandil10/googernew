"use client";

import type React from "react";
import { memo, useRef } from "react";
import IonIcon from "@/app/components/IonIcon";

interface InteractionButtonProps {
  icon: string;
  activeIcon?: string;
  count: number | string;
  color?: string;
  activeColor?: string;
  isActive?: boolean;
  onSingleClick: () => void;
  onLongPress?: () => void;
  type?: string;
  orientation?: "horizontal" | "vertical";
  iconSize?: string;
  buttonSize?: string;
  countSize?: string;
  className?: string;
  iconWrapperClassName?: string;
  countClassName?: string;
  product?: any;
  appearance?: "default" | "compact";
}

export const InteractionButton = memo(({
  icon,
  activeIcon,
  count,
  color = "text-white/60",
  activeColor = "text-blue-400",
  isActive = false,
  onSingleClick,
  onLongPress,
  type,
  orientation = "horizontal",
  iconSize = "text-[13px] md:text-xl",
  buttonSize = "h-8 w-8",
  countSize = "text-[10px]",
  className = "",
  iconWrapperClassName = "",
  countClassName = "",
  appearance = "default",
}: InteractionButtonProps) => {
  const timerRef = useRef<any>(null);
  const longPressedRef = useRef(false);

  const handleStart = (e: React.PointerEvent) => {
    e.stopPropagation();
    longPressedRef.current = false;
    if (onLongPress) {
      timerRef.current = setTimeout(() => {
        longPressedRef.current = true;
        onLongPress();
      }, 600);
    }
  };

  const handleEnd = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  const handleCancel = (e?: React.PointerEvent) => {
    e?.stopPropagation();
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (longPressedRef.current) {
      longPressedRef.current = false;
      return;
    }
    onSingleClick();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    e.stopPropagation();
    onSingleClick();
  };

  const displayCount = typeof count === "number"
    ? (count > 0 ? (count > 999 ? "999+" : count.toString()) : "")
    : count;
  const isLikeButton = type === "likes";

  const compact = appearance === "compact";
  const resolvedIconSize = compact && iconSize === "text-[13px] md:text-xl" ? "text-[21px]" : iconSize;
  const resolvedCountSize = compact && countSize === "text-[10px]" ? "text-[7px] md:text-[9px]" : countSize;
  const resolvedColor = isLikeButton && isActive ? "text-red-500" : isActive ? activeColor : color;
  const currentIcon = isLikeButton
    ? (isActive ? activeIcon || "heart" : "heart-outline")
    : (isActive && activeIcon ? activeIcon : icon);
  const iconRenderKey = isLikeButton ? `likes-${isActive ? "liked" : "unliked"}` : currentIcon;
  const iconColorStyle = isLikeButton ? { color: isActive ? "#ef4444" : "#ffffff" } : undefined;

  return (
    <button
      type="button"
      data-interaction-type={type}
      onPointerDown={handleStart}
      onPointerUp={handleEnd}
      onPointerCancel={handleCancel}
      onPointerLeave={handleCancel}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`group flex touch-none select-none items-center transition-all duration-300 active:scale-75 focus:outline-none focus:ring-0 ${compact ? "gap-1" : "gap-1.5"} ${
        orientation === "vertical" ? "flex-col" : ""
      } ${className}`}
      aria-pressed={isLikeButton ? isActive : undefined}
    >
      <div
        className={`flex items-center justify-center transition-all ${compact ? "" : `${buttonSize} rounded-full`} ${
          compact ? "" :
          isActive
            ? isLikeButton ? "bg-red-500/15" : "bg-blue-500/20"
            : "bg-white/5 group-hover:bg-white/10"
        } ${iconWrapperClassName}`}
      >
        <IonIcon
          key={iconRenderKey}
          name={currentIcon}
          className={`${resolvedIconSize} shrink-0 transition-colors ${
            isLikeButton ? (isActive ? "text-red-500" : "text-white") : isActive ? activeColor : color
          }`}
          style={iconColorStyle}
        />
      </div>
      {displayCount && (
        <span
          className={`${resolvedCountSize} shrink-0 font-black tracking-tighter transition-colors ${resolvedColor} ${countClassName}`}
        >
          {displayCount}
        </span>
      )}
    </button>
  );
});

InteractionButton.displayName = "InteractionButton";
