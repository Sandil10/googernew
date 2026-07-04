export const parseWalletTimestamp = (value: string | number | Date | null | undefined) => {
    if (!value) return new Date(NaN);
    if (value instanceof Date) return value;
    if (typeof value === "number") return new Date(value);

    const trimmed = String(value).trim();
    if (!trimmed) return new Date(NaN);

    return new Date(trimmed.includes("T") || trimmed.endsWith("Z") ? trimmed : `${trimmed.replace(" ", "T")}Z`);
};

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZoneName: "short",
});

export const formatWalletTransactionDate = (value: string | number | Date | null | undefined) => {
    const date = parseWalletTimestamp(value);
    return Number.isNaN(date.getTime()) ? "Invalid date" : dateFormatter.format(date);
};

export const formatWalletTransactionTime = (value: string | number | Date | null | undefined) => {
    const date = parseWalletTimestamp(value);
    return Number.isNaN(date.getTime()) ? "Invalid time" : timeFormatter.format(date);
};

export const formatWalletTransactionDateTime = (value: string | number | Date | null | undefined) => {
    const dateLabel = formatWalletTransactionDate(value);
    const timeLabel = formatWalletTransactionTime(value);
    return dateLabel.startsWith("Invalid") || timeLabel.startsWith("Invalid")
        ? "Invalid date and time"
        : `${dateLabel}, ${timeLabel}`;
};

export const isPromoAdRecord = (tx: any) => String(tx?.type || "").toLowerCase() === "promo_ad";

export const isAdCampaignPayment = (tx: any) => {
    const type = String(tx?.type || "").toLowerCase();
    if (type === "promo_ad" || type === "ad_hold_summary") return true;
    if (isPromoAdRecord(tx)) return true;
    const note = String(tx?.note || "");
    return /ad campaign budget|ad promote|profile promote|product promote|video promote|photo promote/i.test(note);
};

export const getAdPaymentMeta = (tx: any) => {
    const note = String(tx?.note || "");
    const adId = note.match(/\b\d{10,12}\b/)?.[0]?.slice(-10) || "";
    const isProfile = /profile promote/i.test(note);
    const isProduct = /product promote/i.test(note);
    const isVideo = /video promote|\bvideo\b/i.test(note);
    const isPromo = isPromoAdRecord(tx) || /promo free/i.test(note) || /\bstatus:\s*free\b/i.test(note);
    const mediaType = isProfile ? "Profile" : isProduct ? "Product" : isVideo ? "Video" : "Photo";

    return { adId, mediaType, isPromo };
};

const extractMoney = (note: string, label: string) => {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = note.match(new RegExp(`${escapedLabel}\\s*:?\\s*(?:R\\s*)?(\\d+(?:\\.\\d+)?)`, "i"));
    return match ? Number(match[1]) : null;
};

const formatMoney = (value: number | null) => (value === null || Number.isNaN(value) ? "R 0.00" : `R ${value.toFixed(2)}`);

export const getAdTransactionSummary = (tx: any) => {
    const note = String(tx?.note || "");
    const { adId, mediaType, isPromo } = getAdPaymentMeta(tx);
    const deductedAmount = extractMoney(note, "Deducted Amount") ?? extractMoney(note, "Deducted") ?? Number(tx?.adChargeTotal || tx?.amount || 0);
    const holdAmount = extractMoney(note, "Hold Amount") ?? extractMoney(note, "Hold") ?? Number(tx?.amount || 0);

    return {
        adId,
        mediaType,
        isPromo,
        title: `Ad Hold Summary - ${mediaType} Promotion${adId ? ` - Ad ID: ${adId}` : ""}`,
        statusLabel: isPromo ? "Free" : String(tx?.status || "hold").replace(/^./, (char: string) => char.toUpperCase()),
        holdAmountLabel: isPromo ? "Free" : formatMoney(holdAmount),
        deductedAmountLabel: isPromo ? "Free" : formatMoney(deductedAmount),
    };
};
