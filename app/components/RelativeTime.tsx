"use client";

import React from "react";
import { useRelativeTime } from "@/app/lib/relativeTime";

/**
 * Shared component for rendering a live-updating relative timestamp.
 * This is now in a proper .tsx file to satisfy the build system.
 */
export function RelativeTime({ 
  timestamp, 
  fallback = "just now" 
}: { 
  timestamp: any; 
  fallback?: string 
}) {
  const [mounted, setMounted] = React.useState(false);
  const label = useRelativeTime(timestamp, fallback);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <span className="opacity-0">{fallback}</span>;
  }

  return <>{label}</>;
}
