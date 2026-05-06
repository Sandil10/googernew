const trimSlashes = (value: string) => value.replace(/^\/+|\/+$/g, "");
const SHARE_APP_ORIGIN = "https://app.infranex.it.com";

export const getAppOrigin = (): string => {
  return SHARE_APP_ORIGIN;
};

export const getCurrentAppOrigin = (): string => {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, "");
  }
  if (typeof process !== "undefined") {
    const envUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
    if (envUrl) return String(envUrl).replace(/\/+$/, "");
  }
  return "";
};

export const buildPublicUrl = (path: string) => {
  const cleanPath = `/${trimSlashes(path)}`;
  const origin = getAppOrigin();
  return origin ? `${origin}${cleanPath}` : cleanPath;
};

const stripPrefix = (value: string, prefix: string) => (
  value.startsWith(prefix) ? value.slice(prefix.length) : value
);

export const getGoogShareCode = (post: any) => {
  const rawId = String(post?.id ?? post?.goog_id ?? "").trim();
  const id = stripPrefix(rawId, "goog-");
  return id ? `goog-${id}` : "";
};

export const getAdShareCode = (ad: any) => {
  const rawId = String(ad?.adId ?? ad?.ad_id ?? ad?.id ?? "").trim();
  const id = stripPrefix(rawId, "ad-");
  return id ? `ad-${id}` : "";
};

export const getProductShareCode = (product: any) => {
  return String(
    product?.shareCode ??
    product?.share_code ??
    product?.product_code ??
    product?.linked_product_code ??
    product?.productId ??
    product?.product_id ??
    product?.linked_product_id ??
    product?.id ??
    "",
  ).trim();
};

export const getShareCodeForItem = (item: any, type?: "goog" | "ad" | "product") => {
  if (type === "goog") return getGoogShareCode(item);
  if (type === "ad") return getAdShareCode(item);
  if (type === "product") return getProductShareCode(item);

  if (String(item?.id ?? "").startsWith("goog-") || item?.text) return getGoogShareCode(item);
  if (item?.campaign_type === "Product Promote") return getProductShareCode(item);
  if (item?.is_sponsored) return getAdShareCode(item);
  return getProductShareCode(item);
};

export const getShareUrlForItem = (item: any, type?: "goog" | "ad" | "product") => {
  const shareCode = getShareCodeForItem(item, type);
  return shareCode ? buildPublicUrl(`/share/${encodeURIComponent(shareCode)}`) : "";
};

export const getProfileShareUrl = (user: any) => {
  const handle = String(user?.username ?? user?.user_id ?? user?.id ?? "").trim();
  return handle ? buildPublicUrl(`/profile/${encodeURIComponent(handle)}`) : buildPublicUrl("/profile");
};
