import { getAdShareCode, getProductShareCode } from "@/app/lib/shareLinks";

export type PromotedAdType = "product" | "profile" | "photo" | "video";

export type NormalizedAd = {
  id: string | number;
  type: PromotedAdType;
  title: string;
  image: string;
  video: string;
  user: any;
  createdAt?: string;
  productId?: string | number;
  profileId?: string | number;
  postId?: string | number;
  shareCode: string;
  raw: any;
  [key: string]: any;
};

const parseArray = (value: any): any[] => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const normalizeMediaUrl = (value: any) => {
  const src = String(value || "").trim();
  if (!src) return "";
  return src.includes("uploads") || src.includes("\\") ? `/uploads/${src.split(/[\\/]/).pop()}` : src;
};

const inferAdType = (ad: any): PromotedAdType => {
  const explicitType = String(ad?.type || "").toLowerCase();
  const campaignType = String(ad?.campaign_type || ad?.campaignType || "").toLowerCase();
  const mediaType = String(ad?.media_type || ad?.mediaType || "").toLowerCase();

  if (explicitType === "product" || campaignType.includes("product")) return "product";
  if (explicitType === "profile" || campaignType.includes("profile")) return "profile";
  if (explicitType === "video" || mediaType.includes("video")) return "video";
  return "photo";
};

export function normalizeAd(ad: any): NormalizedAd {
  const type = inferAdType(ad);
  const gallery = [...parseArray(ad?.media_gallery), ...parseArray(ad?.variants)];
  const image = normalizeMediaUrl(
    ad?.image ||
      ad?.image_url ||
      ad?.media_preview ||
      gallery.map((item) => item?.url || item?.image_url || item).find(Boolean) ||
      ad?.profile_picture ||
      ad?.user?.profile_picture,
  );
  const video = normalizeMediaUrl(ad?.video || ad?.video_url || (type === "video" ? ad?.media_preview : ""));
  const productId = ad?.productId ?? ad?.product_id ?? ad?.linked_product_id ?? (type === "product" ? ad?.id : undefined);
  const profileId = ad?.profileId ?? ad?.profile_id ?? ad?.owner_user_id ?? ad?.user_id ?? ad?.user?.id;
  const postId = ad?.postId ?? ad?.post_id ?? ad?.goog_id ?? (type === "photo" || type === "video" ? ad?.id : undefined);
  const shareCode =
    String(ad?.shareCode || ad?.share_code || "").trim() ||
    (type === "product" ? getProductShareCode(ad) : getAdShareCode(ad));

  return {
    ...ad,
    id: ad?.id ?? ad?.adId ?? ad?.ad_id ?? productId ?? profileId ?? postId ?? shareCode,
    type,
    title: ad?.title || ad?.name || ad?.description || "Sponsored",
    image,
    video,
    user: ad?.user || {
      id: ad?.user_id ?? ad?.owner_user_id ?? ad?.owner_id,
      username: ad?.username ?? ad?.owner_username,
      profile_picture: ad?.profile_picture,
    },
    createdAt: ad?.createdAt || ad?.created_at,
    productId,
    profileId,
    postId,
    shareCode,
    raw: ad,
  };
}

export function getAdLink(ad: Pick<NormalizedAd, "shareCode" | "type">) {
  if (!ad?.shareCode) return "";
  if (ad.type === "product") return `/share/${encodeURIComponent(ad.shareCode)}`;
  if (ad.type === "profile") return `/share/${encodeURIComponent(ad.shareCode)}`;
  if (ad.type === "photo") return `/share/${encodeURIComponent(ad.shareCode)}`;
  if (ad.type === "video") return `/share/${encodeURIComponent(ad.shareCode)}`;
  return "";
}
