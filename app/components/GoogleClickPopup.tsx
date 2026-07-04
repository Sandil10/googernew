"use client";

import { useState } from "react";
import IonIcon from "./IonIcon";

interface GoogleClickPopupProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  type?: "info" | "success" | "warning" | "error";
  showIcon?: boolean;
  size?: "sm" | "md" | "lg";
}

export default function GoogleClickPopup({
  isOpen,
  onClose,
  title = "Confirm Action",
  message = "Are you sure you want to proceed?",
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  type = "info",
  showIcon = true,
  size = "md",
}: GoogleClickPopupProps) {
  const [isClosing, setIsClosing] = useState(false);

  if (!isOpen) return null;

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 150);
  };

  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm();
    }
    handleClose();
  };

  const sizeConfig = {
    sm: { width: "max-w-[280px]", padding: "p-4", iconSize: "text-lg", titleSize: "text-[11px]", messageSize: "text-[9px]", btnText: "text-[9px]" },
    md: { width: "max-w-[320px]", padding: "p-5", iconSize: "text-xl", titleSize: "text-[12px]", messageSize: "text-[10px]", btnText: "text-[10px]" },
    lg: { width: "max-w-[380px]", padding: "p-6", iconSize: "text-2xl", titleSize: "text-[13px]", messageSize: "text-[11px]", btnText: "text-[11px]" },
  };

  const config = sizeConfig[size];

  const getIconConfig = () => {
    switch (type) {
      case "success":
        return { icon: "checkmark-circle-outline", color: "text-green-400", bg: "bg-green-500/10" };
      case "warning":
        return { icon: "alert-circle-outline", color: "text-amber-400", bg: "bg-amber-500/10" };
      case "error":
        return { icon: "close-circle-outline", color: "text-red-400", bg: "bg-red-500/10" };
      default:
        return { icon: "information-circle-outline", color: "text-blue-400", bg: "bg-blue-500/10" };
    }
  };

  const iconConfig = getIconConfig();

  return (
    <div
      className={`fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4
        animate-in fade-in duration-200 ${
          isClosing ? "animate-out fade-out duration-150" : ""
        }`}
      style={{ backdropFilter: "blur(4px)" }}
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/60 transition-opacity duration-200"
        onClick={handleClose}
      />

      {/* Popup Container */}
      <div
        className={`relative ${config.width} overflow-hidden rounded-2xl border
          border-white/10 bg-[#0f1419] shadow-[0_8px_32px_rgba(0,0,0,0.4)]
          animate-in zoom-in-95 duration-200 ${
            isClosing ? "animate-out zoom-out-95 duration-150" : ""
          }`}
      >
        {/* Content */}
        <div className={`${config.padding} text-center`}>
          {/* Icon */}
          {showIcon && (
            <div className={`mb-3 flex justify-center`}>
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full ${iconConfig.bg}`}
              >
                <IonIcon
                  name={iconConfig.icon}
                  className={`${config.iconSize} ${iconConfig.color}`}
                />
              </div>
            </div>
          )}

          {/* Title */}
          <h3
            className={`font-bold tracking-tight text-white mb-1.5
              ${config.titleSize}`}
          >
            {title}
          </h3>

          {/* Message */}
          <p
            className={`text-gray-400 leading-relaxed mb-6
              ${config.messageSize}`}
          >
            {message}
          </p>

          {/* Buttons */}
          <div className="flex gap-2.5 pt-1">
            <button
              onClick={handleClose}
              className={`flex-1 py-2.5 rounded-xl font-bold uppercase
                tracking-wider transition-all duration-150
                bg-white/5 hover:bg-white/10 border border-white/5
                ${config.btnText} text-gray-400 hover:text-white
                active:scale-95`}
            >
              {cancelText}
            </button>
            <button
              onClick={handleConfirm}
              className={`flex-1 py-2.5 rounded-xl font-bold uppercase
                tracking-wider transition-all duration-150
                active:scale-95 shadow-lg
                ${config.btnText}
                ${
                  type === "error"
                    ? "bg-red-500 hover:bg-red-600 text-white shadow-red-500/30"
                    : type === "warning"
                    ? "bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/30"
                    : type === "success"
                    ? "bg-green-500 hover:bg-green-600 text-white shadow-green-500/30"
                    : "bg-blue-500 hover:bg-blue-600 text-white shadow-blue-500/30"
                }`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
