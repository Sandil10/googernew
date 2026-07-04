export type AdType = "product" | "photo" | "video" | "profile";

export interface NormalizedAd {
  [key: string]: any;
  id: string; // The primary ID used for interaction (e.g., "ad-123")
  type: AdType;
  shareCode: string;
  targetId: string; // The numeric ID of the underlying entity (product_id, profile_id, etc.)
  productId?: string;
  profileId?: string;
  postId?: string;
  userId?: string;
  title?: string;
  image?: string;
  video?: string;
  liked: boolean;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  viewCount: number;
  coinCollected?: boolean;
  raw?: any; // Keep original object for fallback or deep props
}
