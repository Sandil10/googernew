import { useState, useEffect, useMemo } from "react";

/**
 * Safely converts various timestamp formats into a number (ms).
 * This version is ultra-robust against the "5h" offset issue.
 */
/**
 * Safely converts various timestamp formats into a number (ms).
 * Assumes input is a UTC ISO string, number, or Date.
 */
export function toSafeTimestamp(raw: any): number | null {
  if (!raw) return null;
  
  try {
    let normalized = raw;
    if (typeof raw === "string") {
      const value = raw.trim();
      // Treat timezone-less DB timestamps as UTC.
      if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value)) {
        normalized = `${value.replace(" ", "T")}Z`;
      } else {
        normalized = value;
      }
    }

    const d = new Date(normalized);
    const ts = d.getTime();
    return Number.isFinite(ts) ? ts : null;
  } catch {
    return null;
  }
}

/**
 * Formats a timestamp into a compact relative string.
 */
export function formatRelativeTime(timestamp?: string | number | Date | null, fallback = "") {
  const ts = toSafeTimestamp(timestamp);
  if (ts === null) return fallback;

  const now = Date.now();
  const elapsedSeconds = Math.floor((now - ts) / 1000);

  // Tiny clock drift should still read as fresh. Larger future skew usually
  // means a timezone-less DB value was interpreted in the wrong zone, so show
  // a useful relative age instead of pinning the UI to "just now" forever.
  const absoluteElapsedSeconds = Math.abs(elapsedSeconds);
  if (absoluteElapsedSeconds < 60) return "just now";

  const minutes = Math.floor(absoluteElapsedSeconds / 60);
  if (minutes < 60) return `${minutes} MIN`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} H`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} D`;

  const months = Math.floor(days / 30);
  return `${Math.max(1, months)} M`;
}

/**
 * Hook for live-updating time labels.
 */
export function useRelativeTime(timestamp?: string | number | Date | null, fallback = "just now") {
  const initialLabel = useMemo(() => formatRelativeTime(timestamp, fallback), [timestamp, fallback]);
  const [timeLabel, setTimeLabel] = useState(initialLabel);

  useEffect(() => {
    setTimeLabel(formatRelativeTime(timestamp, fallback));
    if (!timestamp) return;

    const interval = setInterval(() => {
      setTimeLabel(formatRelativeTime(timestamp, fallback));
    }, 30000);

    return () => clearInterval(interval);
  }, [timestamp, fallback]);

  return timeLabel;
}
