"use client";

import type React from "react";
import { memo, useRef } from "react";
import IonIcon from "@/app/components/IonIcon";

interface InteractionButtonProps {
  icon: string;
  activeIcon?: string;
  count: number;
  color?: string;
  activeColor?: string;
  isActive?: boolean;
  onSingleClick: () => void;
  onLongPress?: () => void;
  type?: string;
  orientation?: "horizontal" | "vertical";
  iconSize?: string;
  product?: any;
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
  product,
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
    if (!longPressedRef.current) {
      onSingleClick();
    }
  };

  const handleCancel = (e?: React.PointerEvent) => {
    e?.stopPropagation();
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  const displayCount = count > 0 ? (count > 999 ? "999+" : count.toString()) : "";
  const isLikeButton = type === "likes";

  return (
    <button
      type="button"
      onPointerDown={handleStart}
      onPointerUp={handleEnd}
      onPointerCancel={handleCancel}
      onPointerLeave={handleCancel}
      className={`group flex items-center gap-1.5 transition-all active:scale-95 ${
        orientation === "vertical" ? "flex-col" : ""
      }`}
    >
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-full transition-all ${
          isActive
            ? isLikeButton ? "bg-red-500/15" : "bg-blue-500/20"
            : "bg-white/5 group-hover:bg-white/10"
        }`}
      >
        <IonIcon
          name={isActive && activeIcon ? activeIcon : icon}
          className={`${iconSize} transition-colors ${
            isLikeButton ? (isActive ? "text-red-500" : "text-white") : isActive ? activeColor : color
          }`}
        />
      </div>
      {displayCount && (
        <span
          className={`text-[10px] font-black uppercase tracking-widest transition-colors ${
            isActive ? activeColor : color
          }`}
        >
          {displayCount}
        </span>
      )}
    </button>
  );
});

InteractionButton.displayName = "InteractionButton";
