"use client";

import Image from "next/image";
import { useState } from "react";
import IonIcon from "@/app/components/IonIcon";
import SubscribeButton from "@/app/components/SubscribeButton";
import { useRelativeTime } from "@/app/lib/relativeTime";
import { AdInteractionButton } from "@/app/components/ads/AdInteractionButton";
import { NormalizedProductAd } from "@/app/lib/market/adProductAdapter";
import { getItemProfilePicture, getItemUsername } from "@/app/lib/userDisplay";
import {
  AVATAR_IMAGE_SIZES,
  FEED_IMAGE_BLUR_DATA_URL,
  HOME_FEED_IMAGE_SIZES,
  PRODUCT_CARD_IMAGE_SIZES,
  normalizeMediaSrc,
  shouldBypassNextImageOptimization,
} from "@/app/lib/mediaOptimization";

interface PromotedProductCardProps {
  item: NormalizedProductAd;
  source: "shop" | "home";
  onClick?: (item: NormalizedProductAd) => void;
  onAddToBagClick?: (item: NormalizedProductAd) => void;
  onToggleLike?: (id: string | number) => void;
  onOpenSheet?: (type: string, item: NormalizedProductAd) => void;
  onShare?: (item: NormalizedProductAd) => void;
  onLogView?: (id: number) => void;
  onReport?: (item: NormalizedProductAd) => void;
  onNotInterested?: (id: string | number) => void;
  onCollectCoin?: (event: React.MouseEvent, item: NormalizedProductAd) => void;
  canShowCollectCoin?: (item: NormalizedProductAd) => boolean;
  onNavigateToProfile?: (event: React.MouseEvent, userId: any) => void;
  currentUser?: any;
  compact?: boolean;
}

export function PromotedProductCard({
  item,
  source,
  onClick,
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
  currentUser,
  compact = false,
}: PromotedProductCardProps) {
  const [openMenu, setOpenMenu] = useState(false);

  const sellerName = getItemUsername(item, item.seller || "Seller");
  const sellerImage = getItemProfilePicture(item) || item.profileImage;
  const timeLabel = useRelativeTime(item.created_at, "just now");
  const img = normalizeMediaSrc(item.images?.[0] || sellerImage);
  const price = item.price;
  const colors = item.variants?.filter((v: any) => v.color && v.color !== "None").map((v: any) => v.color) || [];
  const showAdCoinButton = !!canShowCollectCoin?.(item);
  void currentUser;
  void compact;

  const handleCardClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (item.name && onClick) onClick(item);
  };

  const handleLikeClick = () => {
    if (onToggleLike) onToggleLike(item.id);
  };

  const handleViewClick = () => {
    if (onLogView) onLogView(Number(item.id));
  };

  const handleCommentClick = () => {
    if (onOpenSheet) onOpenSheet("comments", item);
  };

  const handleShareClick = () => {
    if (onShare) onShare(item);
  };

  const handleMenuToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenMenu(!openMenu);
  };

  const handleProfileClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onNavigateToProfile) onNavigateToProfile(e, item.user_id);
  };

  return (
    <div className={`relative group flex flex-col transition-all duration-500 hover:z-10 ${source === "shop" ? "w-full" : ""}`}>
      {showAdCoinButton && onCollectCoin && (
        <div className="absolute right-3 top-[57px] z-[25] md:right-4 md:top-[62px]">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onCollectCoin(event, item);
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
        className="group relative flex min-w-0 cursor-pointer flex-col rounded-[1.5rem] border border-white/5 bg-[#1a1a1a] pb-4 transition-all hover:border-white/20 hover:shadow-2xl md:rounded-[2.5rem] md:pb-8"
        onClick={handleCardClick}
      >
      <div className="flex items-center justify-between gap-1 p-2 md:p-4 md:px-5">
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
              <span className="flex h-full w-full items-center justify-center bg-gradient-to-tr from-blue-700 to-purple-700">
                <IonIcon name="person" className="text-xs text-white" />
              </span>
            )}
          </div>
          <div className="flex flex-col min-w-0">
            <span
              onClick={handleProfileClick}
              className="cursor-pointer truncate text-[7px] font-black uppercase leading-none tracking-tight text-white transition-colors group-hover/profile:text-blue-400 md:text-[10px]"
            >
              {sellerName}
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[5px] font-bold tracking-widest text-slate-500 md:text-[7px]">
                {item.isAd ? "Ad" : "Product"}
              </span>
              <div className="w-0.5 h-0.5 rounded-full bg-slate-700 shrink-0" />
              <span className="text-[5px] font-bold tracking-widest text-slate-500 md:text-[7px]">
                {timeLabel}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
        {item.user_id && <SubscribeButton userId={item.user_id} initialIsSubscribed={false} size="small" />}
        <div className="relative">
          <button
            type="button"
            onClick={handleMenuToggle}
            className="flex h-5 w-5 items-center justify-center rounded-full bg-white/5 text-white transition-all hover:bg-white/10 active:scale-75 md:h-8 md:w-8"
          >
            <div className="flex flex-col gap-0.5">
              <div className="h-1 w-1 rounded-full bg-white"></div>
              <div className="h-1 w-1 rounded-full bg-white"></div>
            </div>
          </button>
          {openMenu && (
            <div className="absolute right-0 top-full z-[100] mt-2 w-52 overflow-hidden rounded-2xl border border-white/10 bg-[#1a1a1a] py-2 shadow-2xl animate-in slide-in-from-top-2 duration-200">
              {onShare && (
                <button
                  type="button"
                  onClick={() => { handleShareClick(); setOpenMenu(false); }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-[11px] font-bold text-white transition hover:bg-white/5"
                >
                  <IonIcon name="share-social-outline" className="text-lg text-blue-400" />
                  Share Link
                </button>
              )}
              {onReport && (
                <button
                  type="button"
                  onClick={() => { if (onReport) onReport(item); setOpenMenu(false); }}
                  className="flex w-full items-center gap-3 border-t border-white/5 px-4 py-3 text-left text-[11px] font-bold text-white transition hover:bg-white/5"
                >
                  <IonIcon name="alert-circle-outline" className="text-lg text-yellow-500" />
                  Report
                </button>
              )}
              {onNotInterested && (
                <button
                  type="button"
                  onClick={() => { if (onNotInterested) onNotInterested(item.id); setOpenMenu(false); }}
                  className="flex w-full items-center gap-3 border-t border-white/5 px-4 py-3 text-left text-[11px] font-bold text-white transition hover:bg-white/5"
                >
                  <IonIcon name="eye-off-outline" className="text-lg text-slate-500" />
                  Not Interested
                </button>
              )}
            </div>
          )}
        </div>
        </div>
      </div>

      <div
        onClick={handleCardClick}
        className={source === "home" ? "relative w-full aspect-[4/3] overflow-hidden rounded-[28px]" : "relative mx-2 mb-3 aspect-square cursor-pointer overflow-hidden rounded-[1.2rem] border border-white/5 bg-black shadow-inner md:rounded-[2rem]"}
      >
        {img ? (
          <Image
            src={img}
            alt={item.name}
            fill
            sizes={source === "home" ? HOME_FEED_IMAGE_SIZES : PRODUCT_CARD_IMAGE_SIZES}
            quality={58}
            loading="lazy"
            placeholder="blur"
            blurDataURL={FEED_IMAGE_BLUR_DATA_URL}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            unoptimized={shouldBypassNextImageOptimization(img)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-white/[0.04]">
            <IonIcon name="image-outline" className="text-2xl text-white/30" />
          </div>
        )}
      </div>

      <div className="px-3 pb-2 md:px-6">
        <div className="mb-2 flex items-start justify-between gap-2">
          <h3
            onClick={handleCardClick}
            className="min-w-0 flex-1 cursor-pointer overflow-hidden break-words text-[9px] font-black uppercase tracking-tight text-white transition-colors [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] hover:text-amber-400 md:text-[12px]"
          >
            {item.name}
          </h3>
        </div>

        {colors.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {colors.slice(0, 6).map((colorName: string, idx: number) => {
              // Simple color mapping - you might want to expand this
              const colorMap: { [key: string]: string } = {
                "Red": "#ef4444",
                "Blue": "#3b82f6",
                "Green": "#10b981",
                "Yellow": "#f59e0b",
                "Black": "#000000",
                "White": "#ffffff",
                "Gray": "#6b7280",
                "Purple": "#8b5cf6",
                "Pink": "#ec4899",
                "Orange": "#f97316",
              };
              return (
                <div
                  key={idx}
                  className="h-2.5 w-2.5 rounded-full border border-white/20 shadow-sm"
                  style={{ backgroundColor: colorMap[colorName] || colorName }}
                  title={colorName}
                />
              );
            })}
          </div>
        )}

        <div className="mb-3 flex flex-col">
          <div className="mr-[-8px] flex items-center justify-between gap-2">
            <div className="flex items-baseline gap-1">
              <span className="text-xs font-black text-white/40">R</span>
              <span className="text-2xl font-black tracking-tighter text-white">
                {Number(price || 0).toLocaleString()}
              </span>
            </div>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                if (onAddToBagClick) {
                  onAddToBagClick(item);
                  return;
                }
                handleCardClick(event);
              }}
              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/5 bg-white/5 text-white/40 shadow-inner transition-all hover:bg-white/10 hover:text-blue-400 active:scale-75"
            >
              <IonIcon name="cart-outline" className="text-xl" />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-white/5 pt-1.5 md:pt-2">
          <div className="flex w-full items-center justify-between px-0.5">
            {onToggleLike && (
              <AdInteractionButton
                type="likes"
                icon="heart-outline"
                activeIcon="heart"
                isActive={!!item.user_liked}
                count={item.likes_count || 0}
                color="text-white"
                activeColor="text-white"
                onSingleClick={handleLikeClick}
                onLongPress={() => onOpenSheet && onOpenSheet("likes", item)}
              />
            )}
            {onLogView && (
              <AdInteractionButton
                type="views"
                icon="eye-outline"
                activeIcon="eye"
                count={item.views_count || 0}
                color="text-white"
                activeColor="text-white"
                onSingleClick={handleViewClick}
                onLongPress={() => onLogView && onLogView(Number(item.id))}
              />
            )}
            {onOpenSheet && (
              <AdInteractionButton
                type="comments"
                icon="chatbubble-outline"
                activeIcon="chatbubble"
                count={item.comments_count || 0}
                color="text-white"
                activeColor="text-white"
                onSingleClick={handleCommentClick}
                onLongPress={handleCommentClick}
              />
            )}
            {onShare && (
              <AdInteractionButton
                type="shares"
                icon="share-social-outline"
                activeIcon="share-social"
                count={item.shares_count || 0}
                color="text-white"
                activeColor="text-white"
                onSingleClick={handleShareClick}
                onLongPress={() => onOpenSheet && onOpenSheet("shares", item)}
                iconSize="text-sm md:text-base opacity-90"
              />
            )}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
