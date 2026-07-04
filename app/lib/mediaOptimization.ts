export const FEED_IMAGE_BLUR_DATA_URL =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0nMTYnIGhlaWdodD0nMTYnIHZpZXdCb3g9JzAgMCAxNiAxNicgeG1sbnM9J2h0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnJz48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9J2cnIHgxPScwJyB5MT0nMCcgeDI9JzEnIHkyPScxJz48c3RvcCBzdG9wLWNvbG9yPScjMTExMzE4Jy8+PHN0b3Agb2Zmc2V0PScxJyBzdG9wLWNvbG9yPScjMjIyNjJmJy8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PHJlY3Qgd2lkdGg9JzE2JyBoZWlnaHQ9JzE2JyBmaWxsPSd1cmwoI2cpJy8+PC9zdmc+";

export const PRODUCT_CARD_IMAGE_SIZES = "(max-width: 768px) 50vw, (max-width: 1024px) 50vw, 25vw";
export const AD_CARD_IMAGE_SIZES = "(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 25vw";
export const HOME_FEED_IMAGE_SIZES = "(max-width: 768px) 100vw, 720px";
export const AVATAR_IMAGE_SIZES = "32px";

export const normalizeMediaSrc = (src?: string | null) => {
  const value = String(src || "").trim();
  if (!value) return "";
  if (value.startsWith("/uploads/") || /^https?:\/\//i.test(value) || value.startsWith("data:")) {
    return value;
  }
  return value.includes("uploads") || value.includes("\\")
    ? `/uploads/${value.split(/[\\/]/).pop()}`
    : value;
};

export const shouldBypassNextImageOptimization = (src?: string | null) => {
  const value = String(src || "").trim().toLowerCase();
  return (
    !value ||
    value.startsWith("data:") ||
    value.endsWith(".svg") ||
    /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/.test(value)
  );
};
