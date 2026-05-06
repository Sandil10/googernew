
import { useState, useEffect } from "react";

export function formatRelativeTime(timestamp?: string | number | Date | null, fallback = "") {
  if (!timestamp) return fallback;
  const createdTime = new Date(timestamp).getTime();
  if (!Number.isFinite(createdTime)) return fallback;

  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - createdTime) / 1000));
  if (elapsedSeconds < 60) return "just now";

  const minutes = Math.floor(elapsedSeconds / 60);
  if (minutes < 60) return `${minutes} MIN`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} H`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} D`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months} M`;

  const years = Math.floor(months / 12);
  return `${years} Y`;
}

export function useRelativeTime(timestamp?: string | number | Date | null, fallback = "") {
  const [timeLabel, setTimeLabel] = useState(() => formatRelativeTime(timestamp, fallback));

  useEffect(() => {
    if (!timestamp) return;

    const interval = setInterval(() => {
      setTimeLabel(formatRelativeTime(timestamp, fallback));
    }, 60000); // 1 minute

    return () => clearInterval(interval);
  }, [timestamp, fallback]);

  // Update immediately if timestamp changes
  useEffect(() => {
    setTimeLabel(formatRelativeTime(timestamp, fallback));
  }, [timestamp, fallback]);

  return timeLabel;
}
