const trimSlashes = (value: string) => value.replace(/^\/+|\/+$/g, "");
const SHARE_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const DIGITS = "0123456789";
const UPPERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWERS = "abcdefghijklmnopqrstuvwxyz";

export const getAppOrigin = (): string => {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, "");
  }
  if (typeof process !== "undefined") {
    const envUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
    if (envUrl) return String(envUrl).replace(/\/+$/, "");
  }
  return "";
};

export const getCurrentAppOrigin = (): string => {
  return getAppOrigin();
};

export const buildPublicUrl = (path: string) => {
  const cleanPath = `/${trimSlashes(path)}`;
  const origin = getAppOrigin();
  return origin ? `${origin}${cleanPath}` : cleanPath;
};

const stripPrefix = (value: string, prefix: string) => (
  value.startsWith(prefix) ? value.slice(prefix.length) : value
);

const isCanonicalShareCode = (value: any) => /^[0-9A-Za-z]{8}$/.test(String(value || "").trim());

const firstCanonicalCode = (...values: any[]) => {
  for (const value of values) {
    const code = String(value || "").trim();
    if (isCanonicalShareCode(code)) return code;
  }
  return "";
};

const hash32 = (input: string, seed = 0x811c9dc5) => {
  let hash = seed >>> 0;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
};

const positiveModulo = (value: number, modulus: number) => {
  const normalized = Number(value) >>> 0;
  return normalized % modulus;
};

const toShareCode = (type: "g" | "a" | "p" | "u", target: string, length = 8) => {
  const normalizedTarget = String(target || "").trim();
  if (!normalizedTarget) return "";
  const payload = `${type}:${normalizedTarget}`;
  let stateA = hash32(payload, 0x9e3779b9);
  let stateB = hash32(payload, 0x85ebca6b);

  const chars: string[] = [];
  for (let index = 0; index < length; index += 1) {
    stateA = (Math.imul(stateA ^ (stateA >>> 15), 2246822519) + stateB + index) >>> 0;
    stateB = (Math.imul(stateB ^ (stateB >>> 13), 3266489917) + stateA + index * 17) >>> 0;
    const nextIndex = positiveModulo(stateA ^ stateB, SHARE_ALPHABET.length);
    chars.push(SHARE_ALPHABET[nextIndex]);
  }

  const codeChars = [...chars];
  const hasDigit = codeChars.some((char) => DIGITS.includes(char));
  const hasUpper = codeChars.some((char) => UPPERS.includes(char));
  const hasLower = codeChars.some((char) => LOWERS.includes(char));

  if (!hasDigit) codeChars[positiveModulo(stateA + 1, length)] = DIGITS[positiveModulo(stateB, DIGITS.length)];
  if (!hasUpper) codeChars[positiveModulo(stateB + 3, length)] = UPPERS[positiveModulo(stateA, UPPERS.length)];
  if (!hasLower) codeChars[positiveModulo(stateA + stateB + 5, length)] = LOWERS[positiveModulo(stateA ^ stateB, LOWERS.length)];

  return codeChars.join("");
};

export const getGoogShareCode = (post: any) => {
  const storedCode = firstCanonicalCode(
    post?.canonical_share_code,
    post?.googShareCode,
    post?.goog_share_code,
    post?.share_code,
    post?.shareCode,
  );
  if (storedCode) return storedCode;

  const rawId = String(post?.id ?? post?.goog_id ?? "").trim();
  const id = stripPrefix(rawId, "goog-");
  return id ? toShareCode("g", id) : "";
};

export const getAdShareCode = (ad: any) => {
  const rawId = String(ad?.adId ?? ad?.ad_id ?? ad?.id ?? "").trim();
  const id = stripPrefix(rawId, "ad-");
  return id ? toShareCode("a", id) : "";
};

export const getProductShareCode = (product: any) => {
  const storedCode = firstCanonicalCode(
    product?.canonical_share_code,
    product?.productShareCode,
    product?.product_share_code,
    product?.linked_product_code,
    product?.product_code,
    product?.share_code,
    product?.shareCode,
  );
  if (storedCode) return storedCode;

  const target = String(
    product?.linked_product_id ??
    product?.product_id ??
    product?.productId ??
    product?.id ??
    "",
  ).trim();
  return target ? toShareCode("p", target) : "";
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
  if (!shareCode) return "";
  const isGoogLike = type === "goog" || String(item?.id ?? "").startsWith("goog-") || typeof item?.text === "string";
  const isAdLike = type === "ad" || (!!item?.is_sponsored && item?.campaign_type !== "Product Promote");
  const isProductLike =
    type === "product" ||
    item?.campaign_type === "Product Promote" ||
    (!isGoogLike && !isAdLike && (
      item?.product_code ||
      item?.share_code ||
      item?.shareCode ||
      item?.linked_product_code ||
      item?.product_id ||
      item?.productId ||
      item?.price !== undefined ||
      item?.promo_price !== undefined
    ));

  if (isProductLike) {
    return buildPublicUrl(`/product/${encodeURIComponent(shareCode)}`);
  }
  return buildPublicUrl(`/share/${encodeURIComponent(shareCode)}`);
};

export const getProfileShareUrl = (user: any) => {
  const username = String(user?.username || "").trim().toLowerCase();
  if (username) return buildPublicUrl(`/u/${encodeURIComponent(username)}`);

  const target = String(user?.user_id ?? user?.id ?? "").trim();
  if (!target) return buildPublicUrl("/u");
  return buildPublicUrl(`/u/${encodeURIComponent(target)}`);
};
