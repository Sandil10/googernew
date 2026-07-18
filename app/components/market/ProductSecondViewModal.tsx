"use client";

import Image from "next/image";
import { useState, useRef } from "react";
import IonIcon from "@/app/components/IonIcon";
import SubscribeButton from "@/app/components/SubscribeButton";
import { InteractionButton } from "@/app/components/InteractionButton";
import { NormalizedProductAd } from "@/app/lib/market/adProductAdapter";
import { getItemProfilePicture, getItemUsername } from "@/app/lib/userDisplay";

interface ProductSecondViewModalProps {
  item: NormalizedProductAd;
  source: "shop" | "home";
  onClose: () => void;
  onToggleLike?: (id: string | number) => void;
  onOpenSheet?: (type: string, item: NormalizedProductAd) => void;
  onShare?: (item: NormalizedProductAd) => void;
  onReport?: (item: NormalizedProductAd) => void;
  onNotInterested?: (id: string | number) => void;
  onCollectCoin?: (event: React.MouseEvent, item: NormalizedProductAd) => void;
  canShowCollectCoin?: (item: NormalizedProductAd) => boolean;
  onNavigateToProfile?: (event: React.MouseEvent, userId: any) => void;
  onAddToCart?: (item: NormalizedProductAd, variant?: any) => void;
  currentUser?: any;
  initialImageIndex?: number;
}

export function ProductSecondViewModal({
  item,
  source,
  onClose,
  onToggleLike,
  onOpenSheet,
  onShare,
  onReport,
  onNotInterested,
  onCollectCoin,
  canShowCollectCoin,
  onNavigateToProfile,
  onAddToCart,
  currentUser,
  initialImageIndex = 0,
}: ProductSecondViewModalProps) {
  const [activeImageIndex, setActiveImageIndex] = useState(initialImageIndex);
  const [selectedVariant, setSelectedVariant] = useState<any>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const swipeStartX = useRef<number | null>(null);
  void source;
  void currentUser;
  void swipeStartX;

  const sellerName = getItemUsername(item, item.seller || "Seller");
  const sellerImage = getItemProfilePicture(item) || item.profileImage;
  const images = item.images || [];
  const currentImage = images[activeImageIndex] || sellerImage;

  const colors = item.variants?.filter((v: any) => v.color && v.color !== "None") || [];
  const sizes = item.variants?.filter((v: any) => v.size) || [];
  const showAdCoinButton = !!canShowCollectCoin?.(item);

  const handleImageClick = (index: number) => {
    setActiveImageIndex(index);
  };

  const handlePrevImage = () => {
    setActiveImageIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  const handleNextImage = () => {
    setActiveImageIndex((prev) => (prev + 1) % images.length);
  };

  const handleLikeClick = () => {
    if (onToggleLike) onToggleLike(item.id);
  };

  const handleShareClick = () => {
    if (onShare) onShare(item);
  };

  const handleAddToCart = () => {
    if (onAddToCart) onAddToCart(item, selectedVariant);
  };

  const handleProfileClick = (e: React.MouseEvent) => {
    if (onNavigateToProfile) onNavigateToProfile(e, item.user_id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 md:p-4 bg-black/95 backdrop-blur-xl animate-in fade-in duration-300" onClick={onClose}>
      <div className="bg-[#121212] border border-white/10 rounded-[1.2rem] md:rounded-3xl w-full max-w-[900px] shadow-2xl overflow-hidden flex flex-col md:flex-row h-full md:h-auto max-h-[92vh] md:max-h-[90vh] animate-in zoom-in-95 duration-300" onClick={(e) => e.stopPropagation()}>
        {/* Left Side: Image Gallery */}
        <div className="w-full md:w-[45%] relative flex flex-col shrink-0 p-2 md:p-3">
          {/* Main Image */}
          <div className="relative flex-1 min-h-[160px] md:min-h-[350px] rounded-[1.2rem] md:rounded-[2rem] overflow-hidden border border-white/10 bg-[#0a0a0a] flex flex-col">
            {/* Top Bar */}
            <div className="relative w-full h-14 bg-black flex-shrink-0 rounded-t-[1.2rem] md:rounded-t-[2rem] border-b border-white/5 flex items-center justify-between px-5 z-[70] pointer-events-none">
              <button
                type="button"
                className="flex items-center gap-2.5 pointer-events-auto group/profile cursor-pointer"
                onClick={handleProfileClick}
              >
                <div className="w-8 h-8 rounded-full bg-slate-800 border border-white/10 overflow-hidden relative shadow-lg group-hover/profile:border-blue-400/60 transition-all">
                  {sellerImage ? (
                    <Image src={sellerImage} alt="Seller" fill className="object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/40 bg-white/5">
                      <IonIcon name="person" className="text-base" />
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-start">
                  <span className="mb-0.5 text-[11px] font-black uppercase leading-none tracking-tight text-white transition-colors group-hover/profile:text-blue-400">
                    {sellerName}
                  </span>
                  <span className={`text-[7px] font-black text-white/50 tracking-[0.2em] ${item.isAd ? "" : "uppercase"}`}>
                    {item.isAd ? "Ad" : "Product"}
                  </span>
                </div>
              </button>

              <div className="flex items-center gap-3 pointer-events-auto">
                {item.user_id && (
                  <SubscribeButton userId={item.user_id} initialIsSubscribed={false} size="small" />
                )}
                {showAdCoinButton && onCollectCoin && (
                  <button
                    type="button"
                    onClick={(event) => onCollectCoin(event, item)}
                    className="flex items-center gap-1.5 rounded-full border border-red-400/30 bg-red-600 px-2 py-1 text-[8px] font-black uppercase tracking-[0.1em] text-white shadow-xl transition hover:bg-red-500 active:scale-95"
                  >
                    <span className="flex h-6.5 w-6.5 items-center justify-center overflow-hidden rounded-full bg-white/12 ring-1 ring-white/10">
                      <Image
                        src="/assets/images/rupee.png"
                        alt="Rupieer coin"
                        width={28}
                        height={28}
                        className="h-[1.35rem] w-[1.35rem] object-contain contrast-110 brightness-110"
                        unoptimized
                      />
                    </span>
                    <span className="leading-none">Rupieer</span>
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="w-9 h-9 flex items-center justify-center text-white text-2xl transition-all active:scale-75 hover:bg-white/10 rounded-full"
                >
                  <IonIcon name="close-outline" className="text-2xl" />
                </button>

                <button
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  className="w-9 h-9 flex items-center justify-center text-white text-2xl transition-all active:scale-75 hover:bg-white/10 rounded-full"
                >
                  <div className="flex flex-col gap-1 p-1">
                    <div className="w-1 h-1 rounded-full bg-white shadow-lg" />
                    <div className="w-1 h-1 rounded-full bg-white shadow-lg" />
                  </div>
                </button>

                {isMenuOpen && (
                  <div className="absolute top-full right-0 mt-2 w-56 bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] py-2 z-[80] overflow-hidden animate-in zoom-in-95 fade-in duration-200" onClick={(e) => e.stopPropagation()}>
                    {onShare && (
                      <button
                        onClick={() => { handleShareClick(); setIsMenuOpen(false); }}
                        className="w-full px-5 py-4 text-left text-[11px] font-bold text-white hover:bg-white/5 flex items-center gap-3 transition-colors"
                      >
                        <IonIcon name="share-social-outline" className="text-blue-400 text-lg" />
                        Share Link
                      </button>
                    )}
                    {onReport && (
                      <button
                        onClick={() => { if (onReport) onReport(item); setIsMenuOpen(false); }}
                        className="w-full px-5 py-4 text-left text-[11px] font-bold text-white hover:bg-white/5 flex items-center gap-3 transition-colors border-t border-white/5"
                      >
                        <IonIcon name="alert-circle-outline" className="text-yellow-500 text-lg" />
                        Report
                      </button>
                    )}
                    {onNotInterested && (
                      <button
                        onClick={() => { if (onNotInterested) onNotInterested(item.id); setIsMenuOpen(false); }}
                        className="w-full px-5 py-4 text-left text-[11px] font-bold text-white hover:bg-white/5 flex items-center gap-3 transition-colors border-t border-white/5"
                      >
                        <IonIcon name="eye-off-outline" className="text-slate-500 text-lg" />
                        Not Interested
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Image Display */}
            <div className="relative flex-1 w-full bg-[#0a0a0a] group cursor-pointer flex items-center justify-center">
              {currentImage ? (
                <Image
                  src={currentImage}
                  alt={item.name}
                  fill
                  className="object-cover"
                  unoptimized
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-white/[0.04]">
                  <IonIcon name="image-outline" className="text-4xl text-white/30" />
                </div>
              )}

              {/* Navigation Arrows */}
              {images.length > 1 && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); handlePrevImage(); }}
                    className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <IonIcon name="chevron-back" className="text-xl" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleNextImage(); }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <IonIcon name="chevron-forward" className="text-xl" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Thumbnail Gallery */}
          {images.length > 1 && (
            <div className="flex gap-2 mt-3 overflow-x-auto pb-2">
              {images.map((img, index) => (
                <button
                  key={index}
                  onClick={() => handleImageClick(index)}
                  className={`relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                    index === activeImageIndex ? "border-blue-400" : "border-white/20"
                  }`}
                >
                  <Image
                    src={img}
                    alt={`${item.name} ${index + 1}`}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right Side: Product Details */}
        <div className="w-full md:w-[55%] flex flex-col p-4 md:p-6">
          {/* Title and Price */}
          <div className="mb-6">
            <h2 className="text-xl md:text-2xl font-black uppercase tracking-tight text-white mb-2">
              {item.name}
            </h2>
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-black text-white/40">R</span>
              <span className="text-3xl md:text-4xl font-black tracking-tighter text-white">
                {Number(item.price || 0).toLocaleString()}
              </span>
            </div>
          </div>

          {/* Variants */}
          {(colors.length > 0 || sizes.length > 0) && (
            <div className="mb-6">
              {colors.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-sm font-bold text-white/80 mb-2">Color</h3>
                  <div className="flex flex-wrap gap-2">
                    {colors.map((variant: any, index: number) => (
                      <button
                        key={index}
                        onClick={() => setSelectedVariant(variant)}
                        className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide transition-all ${
                          selectedVariant?.color === variant.color
                            ? "bg-blue-500 text-white"
                            : "bg-white/10 text-white hover:bg-white/20"
                        }`}
                      >
                        {variant.color}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {sizes.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-sm font-bold text-white/80 mb-2">Size</h3>
                  <div className="flex flex-wrap gap-2">
                    {sizes.map((variant: any, index: number) => (
                      <button
                        key={index}
                        onClick={() => setSelectedVariant(variant)}
                        className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide transition-all ${
                          selectedVariant?.size === variant.size
                            ? "bg-blue-500 text-white"
                            : "bg-white/10 text-white hover:bg-white/20"
                        }`}
                      >
                        {variant.size}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Add to Cart Button */}
          {onAddToCart && (
            <button
              onClick={handleAddToCart}
              className="w-full mb-6 bg-blue-500 hover:bg-blue-600 text-white font-black uppercase tracking-wide py-4 rounded-2xl transition-all active:scale-95"
            >
              Add to Cart
            </button>
          )}

          {/* Interaction Buttons */}
          <div className="flex items-center justify-between border-t border-white/5 pt-4">
            <div className="flex items-center gap-4">
              {onToggleLike && (
                <InteractionButton
                  type="likes"
                  icon="heart-outline"
                  activeIcon="heart"
                  isActive={!!item.user_liked}
                  count={item.likes_count || 0}
                  color="text-white"
                  activeColor="text-white"
                  onSingleClick={handleLikeClick}
                  onLongPress={() => onOpenSheet && onOpenSheet("likes", item)}
                  iconSize="text-xl"
                />
              )}
              {onOpenSheet && (
                <InteractionButton
                  type="views"
                  icon="eye-outline"
                  activeIcon="eye"
                  count={item.views_count || 0}
                  color="text-white"
                  activeColor="text-white"
                  onSingleClick={() => onOpenSheet("views", item)}
                  onLongPress={() => onOpenSheet("views", item)}
                  iconSize="text-xl"
                />
              )}
              {onOpenSheet && (
                <InteractionButton
                  type="comments"
                  icon="chatbubble-outline"
                  activeIcon="chatbubble"
                  count={item.comments_count || 0}
                  color="text-white"
                  activeColor="text-white"
                  onSingleClick={() => onOpenSheet("comments", item)}
                  onLongPress={() => onOpenSheet("comments", item)}
                  iconSize="text-xl"
                />
              )}
              {onShare && (
                <InteractionButton
                  type="shares"
                  icon="share-social-outline"
                  activeIcon="share-social"
                  count={item.shares_count || 0}
                  color="text-white"
                  activeColor="text-white"
                  onSingleClick={handleShareClick}
                  onLongPress={() => onOpenSheet && onOpenSheet("shares", item)}
                  iconSize="text-xl"
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
