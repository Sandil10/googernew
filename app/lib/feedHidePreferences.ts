"use client";

export type HiddenFeedItemKind = "ad" | "goog" | "uploadContent";

type HiddenFeedEntry = {
  kind: HiddenFeedItemKind;
  id: string;
  expiresAt: number;
};

const HIDDEN_FEED_ITEMS_EVENT = "googer-hidden-feed-items-updated";
const HIDE_DURATION_MS = 24 * 60 * 60 * 1000;

function getStorageKey(userId: string | number | null | undefined) {
  return `googer-hidden-feed-items-${String(userId || "")}`;
}

function normalizeId(value: string | number | null | undefined) {
  return String(value ?? "").trim();
}

function readEntries(userId: string | number | null | undefined): HiddenFeedEntry[] {
  if (typeof window === "undefined" || !userId) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(getStorageKey(userId)) || "[]");
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.filter((entry) => {
      if (!entry || typeof entry !== "object") return false;
      const id = normalizeId(entry.id);
      const kind = entry.kind === "goog" || entry.kind === "uploadContent" ? entry.kind : "ad";
      const expiresAt = Number(entry.expiresAt || 0);
      return !!id && Number.isFinite(expiresAt) && expiresAt > now && (kind === "ad" || kind === "goog" || kind === "uploadContent");
    });
  } catch {
    return [];
  }
}

function writeEntries(userId: string | number | null | undefined, entries: HiddenFeedEntry[]) {
  if (typeof window === "undefined" || !userId) return;
  try {
    window.localStorage.setItem(getStorageKey(userId), JSON.stringify(entries));
    window.dispatchEvent(new CustomEvent(HIDDEN_FEED_ITEMS_EVENT, { detail: { userId: String(userId) } }));
  } catch {}
}

export function getHiddenFeedItems(userId: string | number | null | undefined) {
  return readEntries(userId);
}

export function getHiddenFeedItemIds(
  userId: string | number | null | undefined,
  kind: HiddenFeedItemKind,
) {
  return new Set(
    readEntries(userId)
      .filter((entry) => entry.kind === kind)
      .map((entry) => entry.id),
  );
}

export function hideFeedItemFor24Hours(
  userId: string | number | null | undefined,
  kind: HiddenFeedItemKind,
  id: string | number | null | undefined,
) {
  const normalizedId = normalizeId(id);
  if (!userId || !normalizedId) return;
  const nextEntries = readEntries(userId).filter(
    (entry) => !(entry.kind === kind && entry.id === normalizedId),
  );
  nextEntries.push({
    kind,
    id: normalizedId,
    expiresAt: Date.now() + HIDE_DURATION_MS,
  });
  writeEntries(userId, nextEntries);
}

export function subscribeToHiddenFeedItems(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(HIDDEN_FEED_ITEMS_EVENT, callback);
  return () => window.removeEventListener(HIDDEN_FEED_ITEMS_EVENT, callback);
}
