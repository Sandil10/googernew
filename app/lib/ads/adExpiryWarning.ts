// A finished photo/video ad stays on its owner's profile for the retention
// window their plan grants, measured from when the ad started running, and is
// then taken away — unless they saved it, which keeps it indefinitely.
//
// Nothing used to tell the owner that was about to happen: the profile card
// carried a permanent "will expire soon" label that said nothing about when.
// These helpers work out which ads are genuinely close to the edge so the
// owner can be warned in time to save the ones they want to keep.

/**
 * How much of the window has to be left before we warn.
 *
 * The owner asked for two days' notice on a ten-day window. Storing that as a
 * share of the window rather than a fixed two days keeps the notice meaningful
 * when the window is short — a five-hour window warns with an hour to go
 * instead of warning from the moment the ad finishes.
 */
export const EXPIRY_WARNING_FRACTION = 0.2;

const DAY_MS = 24 * 60 * 60 * 1000;

export type AdExpiryInfo = {
    /** When the ad drops off the profile. */
    expiresAt: Date;
    /** Time left until that moment; negative once it has passed. */
    remainingMs: number;
    /** Length of the whole retention window. */
    windowMs: number;
    /** Inside the warning threshold and not yet gone. */
    isExpiringSoon: boolean;
};

const readStatus = (ad: any): string =>
    String(ad?.status ?? ad?.raw?.status ?? '')
        .trim()
        .replace(/[_-]+/g, ' ')
        .toLowerCase();

const readActiveStart = (ad: any): number | null => {
    const raw = ad?.activeStartTime ?? ad?.active_start_time
        ?? ad?.raw?.activeStartTime ?? ad?.raw?.active_start_time
        ?? ad?.startedAt ?? ad?.started_at;
    if (!raw) return null;
    const ms = new Date(raw).getTime();
    return Number.isFinite(ms) ? ms : null;
};

/**
 * Expiry maths for one ad, or null when the ad cannot expire: no retention
 * window on the plan, never ran, or has not finished running (expiry never
 * cuts a live ad short).
 */
export function getAdExpiryInfo(
    ad: any,
    expiryDays: number | null | undefined,
    now: number = Date.now(),
): AdExpiryInfo | null {
    const days = Number(expiryDays);
    if (!Number.isFinite(days) || days <= 0) return null;
    if (readStatus(ad) !== 'completed') return null;

    const startedAt = readActiveStart(ad);
    if (startedAt === null) return null;

    const windowMs = days * DAY_MS;
    const expiresAtMs = startedAt + windowMs;
    const remainingMs = expiresAtMs - now;

    return {
        expiresAt: new Date(expiresAtMs),
        remainingMs,
        windowMs,
        isExpiringSoon: remainingMs > 0 && remainingMs <= windowMs * EXPIRY_WARNING_FRACTION,
    };
}

/**
 * The standing note under the save button on the owner's own photo/video ads:
 * this ad will be taken off the profile, and saving it is what keeps it.
 *
 * Deliberately not time-based. The note is there to explain what the save
 * button is for, so it has to be readable long before the window closes —
 * tying it to the warning threshold meant it appeared only in the last
 * fraction of the window, which on a short window is never in practice. The
 * timed threshold belongs to the popup, which interrupts and so must not.
 *
 * A saved ad outlives its window, so the note would be a lie there.
 */
export function shouldWarnAboutAdExpiry(args: {
    ad: any;
    isOwn: boolean;
    isSaved: boolean;
}): boolean {
    const { ad, isOwn, isSaved } = args;
    if (!isOwn || isSaved) return false;
    const type = String(ad?.type ?? '').toLowerCase();
    return type === 'photo' || type === 'video';
}

/** "2 days", "5 hours", "12 minutes" — the roughest unit that still reads true. */
export function formatRemaining(remainingMs: number): string {
    const ms = Math.max(0, remainingMs);
    const minutes = Math.round(ms / 60000);
    if (minutes < 60) return `${Math.max(1, minutes)} minute${minutes === 1 ? '' : 's'}`;
    const hours = Math.round(minutes / 60);
    if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'}`;
    const days = Math.round(hours / 24);
    return `${days} day${days === 1 ? '' : 's'}`;
}
