"use client";

import Image from "next/image";
import { useState, memo, useEffect, useMemo } from "react";
import IonIcon from "@/app/components/IonIcon";
import SubscribeButton from "@/app/components/SubscribeButton";
import { RelativeTime } from "@/app/components/RelativeTime";
import { getItemProfilePicture, getItemUsername, getItemUserId } from "@/app/lib/userDisplay";
import { UserVerifiedBadge } from "@/app/components/VerifiedBadge";
import {
  AVATAR_IMAGE_SIZES,
  FEED_IMAGE_BLUR_DATA_URL,
  PRODUCT_CARD_IMAGE_SIZES,
  normalizeMediaSrc,
  shouldBypassNextImageOptimization,
} from "@/app/lib/mediaOptimization";
import { useAdStore } from "@/app/lib/ads/adStore";
import { getAdInteractionId } from "@/app/lib/ads/adIdentity";
import { AdInteractionButton } from "@/app/components/ads/AdInteractionButton";
import { logSponsoredAdClick } from "@/app/lib/ads/adClickTracking";

export const COLORS = [
  { name: "None", hex: "transparent" },
  { name: "Black", hex: "#000000" },
  { name: "White", hex: "#FFFFFF" },
  { name: "Red", hex: "#ef4444" },
  { name: "Blue", hex: "#3b82f6" },
  { name: "Green", hex: "#10b981" },
  { name: "Yellow", hex: "#f59e0b" },
  { name: "Gray", hex: "#6b7280" },
  { name: "Purple", hex: "#8b5cf6" },
  { name: "Pink", hex: "#ec4899" },
  { name: "Orange", hex: "#f97316" },
  // ... more colors can be added but these are the main ones from ShopPage
];

export interface SharedProductCardProps {
  product: any;
  isAd?: boolean;
  currentUser?: any;
  onProductClick?: (product: any) => void;
  onAddToBagClick?: (product: any) => void;
  onToggleLike?: (product: any) => void;
  onOpenSheet?: (type: string, product: any) => void;
  onShare?: (product: any) => void;
  onLogView?: (id: any) => void;
  onReport?: (product: any) => void;
  onNotInterested?: (id: string | number) => void;
  onCollectCoin?: (event: React.MouseEvent, product: any) => void;
  canShowCollectCoin?: (product: any) => boolean;
  onNavigateToProfile?: (event: React.MouseEvent, userId: any) => void;
  onEditProduct?: (product: any) => void;
  onDeleteProduct?: (product: any) => void;
  onPromoteProduct?: (product: any) => void;
  promoteProductLabel?: string;
  onUpdateOrderStatus?: (id: any, status: string) => void;
  activeTab?: string;
  myListingsTab?: string;
}

const EMPTY_OBJECT = {};

export const SharedProductCard = memo(({
  product,
  isAd = false,
  currentUser,
  onProductClick,
  onAddToBagClick,
  onToggleLike,
  onOpenSheet,
  onShare,
  onLogView,
  onReport,
  onNotInterested,
  onCollectCoin,
  canShowCollectCoin,
  onNavigateToProfile,
  onEditProduct,
  onDeleteProduct,
  onPromoteProduct,
  promoteProductLabel,
  onUpdateOrderStatus,
  activeTab = "market",
  myListingsTab = "active",
}: SharedProductCardProps) => {
  const [openMenu, setOpenMenu] = useState(false);
  const [likeLockMessage, setLikeLockMessage] = useState(false);
  // Connect to global reactive store for both products and ads to ensure parity
  const interactionId = getAdInteractionId(product);
  const liveState = useAdStore((state) => state.adStates[interactionId] || EMPTY_OBJECT);

  // Merge live state (reactive) with initial product data (prop)
  const likePending = !!liveState.like_pending;
  const displayLiked = liveState.user_liked ?? !!product.user_liked;
  const displayLikesCount = liveState.likes_count ?? liveState.likeCount ?? Number(product.likes_count || product.likeCount || 0);
  const displayCoinCollected = liveState.ad_coin_collected ?? !!product.ad_coin_collected;
  const displayLikeLocked = !!(liveState.ad_like_locked ?? product.ad_like_locked ?? displayCoinCollected);
  const displayViewsCount = liveState.views_count ?? liveState.viewCount ?? Number(product.views_count || product.viewCount || 0);
  const displayCommentsCount = liveState.comments_count ?? liveState.commentCount ?? Number(product.comments_count || product.commentCount || 0);
  const displaySharesCount = liveState.shares_count ?? liveState.shareCount ?? Number(product.shares_count || product.shareCount || 0);
  const displayTimestamp = isAd
    ? (product.active_start_time || product.activeStartTime || product.started_at || product.startedAt || product.created_at || product.createdAt)
    : (product.created_at || product.createdAt);

  // For the canShowCollectCoin callback, we want to pass a normalized-like object that has the merged state
  const mergedForCallback = useMemo(() => ({
    ...product,
    user_liked: displayLiked,
    liked: displayLiked,
    likes_count: displayLikesCount,
    likesCount: displayLikesCount,
    ad_coin_collected: displayCoinCollected,
    coinCollected: displayCoinCollected,
    ad_like_locked: displayLikeLocked,
    views_count: displayViewsCount,
    viewsCount: displayViewsCount,
    comments_count: displayCommentsCount,
    commentsCount: displayCommentsCount,
    shares_count: displaySharesCount,
    sharesCount: displaySharesCount,
    raw: product // Important for handlers that check .raw
  }), [product, displayLiked, displayLikesCount, displayCoinCollected, displayLikeLocked, displayViewsCount, displayCommentsCount, displaySharesCount]);

  const sellerName = getItemUsername(product, "Seller");
  const sellerImage = getItemProfilePicture(product);
  const sellerId = getItemUserId(product);

  const primaryImage =
    product.image_url ||
    product.main_image ||
    (Array.isArray(product.images) ? product.images[0] : undefined) ||
    product.media_url ||
    product.thumbnail_url ||
    product.media_preview;
  const img = normalizeMediaSrc(primaryImage);
  
  const showAdCoinButton = isAd && !!canShowCollectCoin?.(mergedForCallback) && !displayCoinCollected;

  const handleCardClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onProductClick?.(mergedForCallback);
  };

  const trackProductPromoteClick = () => {
    if (!isAd) return;
    logSponsoredAdClick(mergedForCallback, "visit");
  };

  const handleProfileClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    trackProductPromoteClick();
    onNavigateToProfile?.(e, product.user_id);
  };

  const handleMenuToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenMenu(!openMenu);
  };

  // Close menu on outside click
  useEffect(() => {
    if (!openMenu) return;
    const close = () => setOpenMenu(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [openMenu]);

  const canOpenProduct = product.status !== "reviewing" && product.status !== "rejected";
  const canUseProductActions = product.status !== "reviewing";
  const productDiscount = useMemo(() => {
    try {
      const comm = typeof product.commission_info === "string" ? JSON.parse(product.commission_info) : product.commission_info;
      const discount = comm?.discount;
      return discount && parseFloat(discount) > 0 ? discount : null;
    } catch {
      return null;
    }
  }, [product.commission_info]);
  const uniqueVariantColors = useMemo(() => {
    try {
      const productVariants = typeof product.variants === "string" ? JSON.parse(product.variants) : product.variants || [];
      return Array.from(new Set(productVariants.map((v: any) => v.color).filter((c: any) => c && c !== "None")));
    } catch {
      return [];
    }
  }, [product.variants]);
  const displayPrice = useMemo(() => {
    const promoCandidate = product.promo_price;
    if (promoCandidate !== null && promoCandidate !== undefined && promoCandidate !== "") {
      const parsedPromo = Number(promoCandidate);
      if (Number.isFinite(parsedPromo)) return parsedPromo;
    }

    const mainCandidate = product.price ?? product.main_price ?? product.product_price;
    const parsedMain = Number(mainCandidate);
    return Number.isFinite(parsedMain) ? parsedMain : 0;
  }, [product.main_price, product.price, product.product_price, product.promo_price]);

  return (
    <div className="relative group flex flex-col transition-all duration-500 hover:z-10 w-full">
      {showAdCoinButton && onCollectCoin && (
        <div className="absolute right-3 top-[57px] z-[25] md:right-4 md:top-[62px]">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onCollectCoin(event, mergedForCallback);
            }}
            className="flex items-center gap-1.5 rounded-full border border-red-400/30 bg-red-600 px-2 py-1 text-[8px] font-black uppercase tracking-[0.1em] text-white shadow-xl transition hover:bg-red-500 active:scale-95"
            aria-label="Collect ad coin"
          >
            <span className="flex h-6.5 w-6.5 items-center justify-center overflow-hidden rounded-full bg-white/12 ring-1 ring-white/10">
              <Image
                src="/assets/images/rupee.png"
                alt="Ruppier coin"
                width={28}
                height={28}
                className="h-[1.35rem] w-[1.35rem] object-contain contrast-110 brightness-110"
                unoptimized
              />
            </span>
            <span className="leading-none">Ruppier</span>
          </button>
        </div>
      )}

      <div
        className="group relative flex min-w-0 cursor-pointer flex-col rounded-[1.5rem] border border-white/5 bg-[#1a1a1a] pb-2 transition-all hover:border-white/20 hover:shadow-2xl md:rounded-[2.5rem] md:pb-4"
        onClick={handleCardClick}
      >
        {/* Header Section */}
        <div className="flex items-center justify-between gap-1 p-1.5 md:p-3 md:px-4">
          <div className="group/profile flex min-w-0 items-center gap-1" onClick={(event) => event.stopPropagation()}>
            <div
              onClick={handleProfileClick}
              className="relative flex h-5 w-5 flex-shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-white/10 bg-gradient-to-tr from-blue-600 to-purple-600 text-[7px] text-white shadow-lg transition-all group-hover/profile:border-white/40 md:h-8 md:w-8 md:text-[10px]"
            >
              {sellerImage ? (
                <Image
                  src={normalizeMediaSrc(sellerImage)}
                  alt="Profile"
                  fill
                  sizes={AVATAR_IMAGE_SIZES}
                  className="object-cover"
                  loading="lazy"
                  placeholder="blur"
                  blurDataURL={FEED_IMAGE_BLUR_DATA_URL}
                  unoptimized={shouldBypassNextImageOptimization(sellerImage)}
                />
              ) : (
                <IonIcon name="person" className="text-white" />
              )}
            </div>
            <div className="flex flex-col min-w-0">
              <span
                onClick={handleProfileClick}
                className="flex items-center gap-1 text-[7px] md:text-[10px] text-white font-black normal-case tracking-tight truncate leading-none group-hover/profile:text-blue-400 transition-colors cursor-pointer"
              >
                {sellerName}
                {sellerId && <UserVerifiedBadge userId={sellerId} size={12} />}
              </span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[5px] md:text-[7px] text-slate-500 font-bold tracking-widest">
                  <RelativeTime timestamp={displayTimestamp} />
                </span>
                {isAd && (
                  <span className="flex items-center gap-0.5 text-[6px] md:text-[8px] font-bold text-emerald-400 px-1">
                    <IonIcon name="megaphone-outline" className="text-[8px] md:text-[10px]" />
                    Ad
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {currentUser?.id !== product.user_id && (
              <SubscribeButton
                userId={product.user_id}
                initialIsSubscribed={false}
                size="small"
                onBeforeSubscribeClick={trackProductPromoteClick}
              />
            )}
            <div className="relative">
              <button
                onClick={handleMenuToggle}
                className="light-theme-option-dots w-5 h-5 md:w-8 md:h-8 rounded-full bg-white/5 hover:bg-white/10 text-white flex items-center justify-center transition-all active:scale-75"
                aria-label="Open product options"
              >
                <div className="flex flex-col gap-0.5">
                  <div data-dot className="w-1 h-1 rounded-full" style={{ backgroundColor: "var(--theme-dot)" }}></div>
                  <div data-dot className="w-1 h-1 rounded-full" style={{ backgroundColor: "var(--theme-dot)" }}></div>
                </div>
              </button>
              {openMenu && (
                <div
                  className="absolute right-0 top-full mt-2 w-56 bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl py-2 z-[100] animate-in slide-in-from-top-2 duration-200 overflow-hidden"
                  onClick={(e) => e.stopPropagation()}
                >
                  {onShare && (
                    <button
                      onClick={() => { trackProductPromoteClick(); onShare(mergedForCallback); setOpenMenu(false); }}
                      className="w-full px-4 py-3 text-left text-[11px] font-bold text-white hover:bg-white/5 flex items-center gap-3 transition-colors"
                    >
                      <IonIcon name="share-social-outline" className="text-blue-400 text-lg" />
                      Share Link
                    </button>
                  )}
                  {onPromoteProduct && product.status !== "reviewing" && (
                    <button
                      onClick={() => { onPromoteProduct(product); setOpenMenu(false); }}
                      className="w-full px-4 py-3 text-left text-[11px] font-bold text-white hover:bg-white/5 flex items-center gap-3 transition-colors border-t border-white/5"
                    >
                      <IonIcon name="megaphone-outline" className="text-emerald-400 text-lg" />
                      {promoteProductLabel || (isAd ? "Promote Again" : "Promote")}
                    </button>
                  )}
                  {onEditProduct && currentUser?.id === product.user_id && (
                    <button
                      onClick={() => { onEditProduct(product); setOpenMenu(false); }}
                      className="w-full px-4 py-3 text-left text-[11px] font-bold text-white hover:bg-white/5 flex items-center gap-3 transition-colors border-t border-white/5"
                    >
                      <IonIcon name="create-outline" className="text-emerald-400 text-lg" />
                      Edit Post
                    </button>
                  )}
                  {onDeleteProduct && currentUser?.id === product.user_id && (
                    <button
                      onClick={() => { onDeleteProduct(product); setOpenMenu(false); }}
                      className="w-full px-4 py-3 text-left text-[11px] font-bold text-red-500 hover:bg-white/5 flex items-center gap-3 transition-colors border-t border-white/5"
                    >
                      <IonIcon name="trash-outline" className="text-lg" />
                      Delete Post
                    </button>
                  )}
                  {currentUser?.id !== product.user_id && (
                    <>
                      <button
                        onClick={() => { onReport?.(mergedForCallback); setOpenMenu(false); }}
                        className="w-full px-4 py-3 text-left text-[11px] font-bold text-white hover:bg-white/5 flex items-center gap-3 transition-colors border-t border-white/5"
                      >
                        <IonIcon name="alert-circle-outline" className="text-yellow-500 text-lg" />
                        Report
                      </button>
                      <button
                        onClick={() => { onNotInterested?.(mergedForCallback.id); setOpenMenu(false); }}
                        className="w-full px-4 py-3 text-left text-[11px] font-bold text-white hover:bg-white/5 flex items-center gap-3 transition-colors border-t border-white/5"
                      >
                        <IonIcon name="eye-off-outline" className="text-slate-500 text-lg" />
                        Not Interested
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Image Section */}
        <div className="relative mx-2 rounded-[1.2rem] md:rounded-[2rem] overflow-hidden mb-1.5 bg-black border border-white/5 shadow-inner aspect-square">
          {img ? (
            <Image
              src={img}
              alt={product.title || "Product"}
              fill
              sizes={PRODUCT_CARD_IMAGE_SIZES}
              quality={58}
              loading="lazy"
              placeholder="blur"
              blurDataURL={FEED_IMAGE_BLUR_DATA_URL}
              className="object-cover group-hover:scale-105 transition-transform duration-500"
              unoptimized={shouldBypassNextImageOptimization(img)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-white/[0.04]">
              <IonIcon name="image-outline" className="text-2xl text-white/30" />
            </div>
          )}

          {!isAd && product.status === "reviewing" && activeTab !== "orders" && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center">
              <div className="flex flex-col items-center gap-2 text-white">
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-full border-2 border-white flex items-center justify-center bg-black/50">
                  <IonIcon name="time" className="text-xl md:text-2xl" />
                </div>
                <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider bg-black/60 px-2 py-1 rounded-full border border-white/30">
                  Reviewing
                </span>
              </div>
            </div>
          )}

          {/* Product Discount Badge */}
          {productDiscount && (
            <div className="absolute bottom-2 right-2 z-10 px-1.5 py-0.5 bg-green-500/10 backdrop-blur-md border border-green-500/20 rounded-lg shadow-[0_0_10px_rgba(34,197,94,0.1)]">
              <span className="text-[8px] md:text-xs font-black text-green-500">+{productDiscount}%</span>
            </div>
          )}

          {!isAd && product.status === "rejected" && (
            <div className="absolute inset-0 bg-red-900/40 backdrop-blur-[2px] flex items-center justify-center">
              <div className="flex flex-col items-center gap-2 text-white">
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-full border-2 border-red-500 flex items-center justify-center bg-red-600/30">
                  <IonIcon name="close" className="text-xl md:text-2xl text-red-100" />
                </div>
                <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider bg-red-600/80 px-2 py-1 rounded-full border border-red-400">
                  Rejected
                </span>
              </div>
            </div>
          )}

          {/* Status Badge */}
          {(activeTab === "orders" || (activeTab === "my-products" && myListingsTab === "all")) && product.status && (
            <div className="absolute top-4 right-4 px-2 py-1 bg-black/60 backdrop-blur-md rounded-lg border border-white/10">
              <span className="text-[8px] font-black uppercase text-white tracking-widest">{product.status}</span>
            </div>
          )}
        </div>

        {/* Content Section */}
        <div className="px-2.5 md:px-5 pb-1.5">
          <div className="mb-1 flex items-start gap-1 flex-wrap">
            <h3 className="text-white text-[9px] md:text-[12px] font-black uppercase tracking-tight group-hover:text-amber-400 transition-colors break-words leading-tight">
              {product.title}
            </h3>
            {uniqueVariantColors.length > 0 && (
              <div className="flex items-center gap-0.5 flex-wrap mt-0.5">
                {uniqueVariantColors.map((colorName: any, idx) => {
                  const colorInfo = COLORS.find((c) => c.name === colorName);
                  if (!colorInfo) return null;
                  return (
                    <div
                      key={idx}
                      className="w-2 h-2 rounded-full border border-white/20 shadow-sm shrink-0"
                      style={{ backgroundColor: colorInfo.hex }}
                      title={colorName}
                    />
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex flex-col mb-0.5">
            <div className="flex items-center justify-between gap-2 mr-[-8px]">
              <div className="flex items-baseline gap-1">
                <span className="text-xs font-black text-white/40">R</span>
                <span className="text-2xl font-black text-white tracking-tighter">
                  {displayPrice}
                </span>
              </div>
              {canUseProductActions && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onAddToBagClick) {
                      trackProductPromoteClick();
                      onAddToBagClick(mergedForCallback);
                    } else {
                      handleCardClick(e);
                    }
                  }}
                  className="w-10 h-10 flex items-center justify-center bg-white/5 hover:bg-white/10 text-white/40 transition-all rounded-2xl border border-white/5 shadow-inner hover:text-blue-400 active:scale-75"
                >
                  <IonIcon name="cart-outline" className="text-xl" />
                </button>
              )}
            </div>
          </div>

          {/* Interaction Bar */}
          <div className="border-t border-white/5 pt-0.5 flex flex-col gap-1">
            <div className="flex items-center justify-between w-full px-0.5">
              {canUseProductActions && (
                <>
                  <div className="relative flex flex-col items-center">
                    <AdInteractionButton
                      type="likes"
                      icon="heart-outline"
                      activeIcon="heart"
                      isActive={displayLiked}
                      count={displayLikesCount}
                      color="text-white"
                      activeColor="text-white"
                      onSingleClick={() => {
                        if (likePending) return;
                        // Read synchronously at click time — avoids stale reactive value between
                        // Zustand set() and React's next render
                        const freshState = useAdStore.getState().getAdState(product);
                        const isLocked = !!(freshState.ad_like_locked ?? freshState.ad_coin_collected ?? displayLikeLocked);
                        const isLiked = !!(freshState.user_liked ?? displayLiked);
                        if (isLiked && isLocked) {
                          setLikeLockMessage(true);
                          setTimeout(() => setLikeLockMessage(false), 3000);
                          return;
                        }
                        onToggleLike?.(mergedForCallback);
                      }}
                      onLongPress={() => onOpenSheet?.("likes", mergedForCallback)}
                    />
                    {likeLockMessage && (
                      <span className="absolute top-full mt-0.5 whitespace-nowrap rounded px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-red-400">
                        Like locked
                      </span>
                    )}
                  </div>
                  <AdInteractionButton
                    type="views"
                    icon="eye-outline"
                    activeIcon="eye"
                    count={displayViewsCount}
                    color="text-white"
                    activeColor="text-white"
                    onSingleClick={() => {
                      if (isAd) {
                        onLogView?.(mergedForCallback);
                        onOpenSheet?.("views", mergedForCallback);
                        return;
                      }
                      onLogView?.(mergedForCallback.id);
                    }}
                    onLongPress={() => onOpenSheet?.("views", mergedForCallback)}
                  />
                  <AdInteractionButton
                    type="comments"
                    icon="chatbubble-outline"
                    activeIcon="chatbubble"
                    count={displayCommentsCount}
                    color="text-white"
                    activeColor="text-white"
                    onSingleClick={() => onOpenSheet?.("comments", mergedForCallback)}
                    onLongPress={() => onOpenSheet?.("comments", mergedForCallback)}
                  />
                  <AdInteractionButton
                    type="shares"
                    icon="share-social-outline"
                    activeIcon="share-social"
                    count={isAd ? displaySharesCount : (() => {
                      try {
                        const info = typeof product.commission_info === "string" ? JSON.parse(product.commission_info) : product.commission_info;
                        const comm = info?.resell_percentage || info?.resell_amount || info?.resell_commission || info?.reseller_commission || info?.googer_commission;
                        return comm ? `${comm}%` : displaySharesCount;
                      } catch { return displaySharesCount; }
                    })()}
                    color="text-white"
                    activeColor="text-white"
                    onSingleClick={() => {
                      trackProductPromoteClick();
                      onShare?.(mergedForCallback);
                    }}
                    onLongPress={() => onOpenSheet?.("shares", mergedForCallback)}
                    iconSize="text-sm md:text-base opacity-90"
                  />
                </>
              )}
            </div>

            {/* Admin Actions */}
            {activeTab === "my-products" && product.status && onUpdateOrderStatus && (
              <div className="flex justify-end mt-1">
                {product.status === "approved" || product.status === "pending" || product.status === "all" ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); onUpdateOrderStatus(product.id, "processing"); }}
                    className="px-2 py-1 bg-white text-black text-[8px] font-black uppercase rounded-lg border border-white whitespace-nowrap"
                  >
                    Process
                  </button>
                ) : product.status === "processing" ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); onUpdateOrderStatus(product.id, "shipped"); }}
                    className="px-2 py-1 bg-blue-600 text-white text-[8px] font-black uppercase rounded-lg whitespace-nowrap"
                  >
                    Ship
                  </button>
                ) : product.status === "shipped" ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); onUpdateOrderStatus(product.id, "delivered"); }}
                    className="px-2 py-1 bg-green-600 text-white text-[8px] font-black uppercase rounded-lg whitespace-nowrap"
                  >
                    Deliver
                  </button>
                ) : null}
              </div>
            )}

            {activeTab === "orders" && product.status === "delivered" && onUpdateOrderStatus && (
              <div className="flex justify-end mt-1">
                <button
                  onClick={(e) => { e.stopPropagation(); onUpdateOrderStatus(product.id, "received"); }}
                  className="px-2 py-1 bg-green-600 text-white text-[8px] font-black uppercase rounded-lg whitespace-nowrap"
                >
                  Received?
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

SharedProductCard.displayName = "SharedProductCard";
