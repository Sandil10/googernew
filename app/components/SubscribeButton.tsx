"use client";

import { useEffect, useState } from "react";
import { authService } from "@/services/authService";

interface SubscribeButtonProps {
  googId?: number;
  authorId?: number | string | null;
  authorName?: string;
  userId?: number | string | null;
  initialIsSubscribed?: boolean;
  size?: "small" | "default";
  onBeforeSubscribeClick?: () => void;
}

export default function SubscribeButton({
  googId,
  authorId,
  authorName,
  userId,
  initialIsSubscribed = false,
  size = "default",
  onBeforeSubscribeClick,
}: SubscribeButtonProps) {
  const [subscribedIds, setSubscribedIds] = useState<Set<string>>(new Set());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Support both authorId and userId props
  const effectiveAuthorId = authorId ?? userId;
  const sellerId = effectiveAuthorId ? String(effectiveAuthorId) : null;

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const user = JSON.parse((sessionStorage.getItem("user") || localStorage.getItem("user")) || "{}");
        const userId = user?.id ? String(user.id) : null;
        setCurrentUserId(userId);

        if (!userId || !sellerId || sellerId === userId) {
          setReady(true);
          return;
        }

        const following = await authService.getFollowingUsers(userId);
        const followingIds = new Set(
          (Array.isArray(following) ? following : [])
            .map((entry: any) => String(entry?.id || entry?.user_id || entry?.following_id || ""))
            .filter(Boolean),
        );

        if (!cancelled) {
          setSubscribedIds(followingIds);
          setReady(true);
        }
      } catch {
        if (!cancelled) setReady(true);
      }
    };

    init();
    return () => {
      cancelled = true;
    };
  }, [sellerId]);

  useEffect(() => {
    if (!sellerId || !currentUserId) return;

    const handleUpdate = async () => {
      try {
        const status = await authService.getSubscriptionStatus(sellerId);
        if (!status.isSubscribed) return;

        setSubscribedIds((prev) => {
          const next = new Set(prev);
          next.add(sellerId);
          return next;
        });
      } catch { }
    };

    window.addEventListener("googer-subscription-updated", handleUpdate);
    return () => window.removeEventListener("googer-subscription-updated", handleUpdate);
  }, [sellerId, currentUserId]);

  const shouldShow = () => {
    if (!currentUserId || !sellerId) return false;
    if (currentUserId === sellerId) return false;
    return !subscribedIds.has(sellerId);
  };

  if (!ready || !shouldShow()) return null;

  const handleSubscribe = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!sellerId || pendingId === sellerId) return;
    onBeforeSubscribeClick?.();

    try {
      setPendingId(sellerId);
      setSubscribedIds((prev) => {
        const next = new Set(prev);
        next.add(sellerId);
        return next;
      });

      const currentStatus = await authService.getSubscriptionStatus(sellerId);
      if (currentStatus.isSubscribed) {
        setSubscribedIds((prev) => {
          const next = new Set(prev);
          next.add(sellerId);
          return next;
        });
        window.dispatchEvent(new CustomEvent("googer-subscription-updated", { detail: { sellerId, authorName } }));
        return;
      }

      const result = await authService.toggleSubscription(sellerId);
      if (!result.isSubscribed) return;

      setSubscribedIds((prev) => {
        const next = new Set(prev);
        next.add(sellerId);
        return next;
      });
      window.dispatchEvent(new CustomEvent("googer-subscription-updated", { detail: { sellerId, authorName } }));
    } catch (error) {
      console.error("SubscribeButton: toggleSubscription failed", error);
      setSubscribedIds((prev) => {
        const next = new Set(prev);
        next.delete(sellerId);
        return next;
      });
    } finally {
      setPendingId((current) => (current === sellerId ? null : current));
    }
  };

  return (
    <button
      type="button"
      onClick={handleSubscribe}
      className="light-theme-action-border flex-shrink-0 rounded-full border border-white/10 bg-white px-2.5 py-0.5 text-[7px] font-black uppercase text-black shadow-lg transition-all hover:bg-slate-200 active:scale-95 md:px-3 md:py-1 md:text-[8px]"
    >
      Subscribe
    </button>
  );
}
