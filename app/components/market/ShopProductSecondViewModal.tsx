"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import IonIcon from "@/app/components/IonIcon";
import { InteractionButton } from "@/app/components/InteractionButton";
import { useCart } from "@/app/context/CartContext";
import { useRelativeTime } from "@/app/lib/relativeTime";
import { getItemProfilePicture, getItemUsername } from "@/app/lib/userDisplay";
import { useAdStore } from "@/app/lib/ads/adStore";
import { getAdInteractionId } from "@/app/lib/ads/adIdentity";
import { logSponsoredAdClick } from "@/app/lib/ads/adClickTracking";

type SheetType = "likes" | "comments" | "shares" | "views";

interface ShopProductSecondViewModalProps {
  product: any;
  activeTab?: string;
  myListingsTab?: string;
  currentUser?: any;
  justSubscribedSellerId?: string | null;
  onClose: () => void;
  onNavigateToProfile?: (event: React.MouseEvent, product: any) => void;
  showSubscribeForProduct?: (product: any) => boolean;
  getSellerId?: (product: any) => string | null;
  onSubscribeSeller?: (event: React.MouseEvent, product: any) => void | Promise<void>;
  onShare?: (product: any, view?: "share" | "resell") => void;
  onPromote?: (product: any) => void;
  onEdit?: (product: any) => void;
  onDelete?: (product: any) => void;
  onReport?: (product: any) => void;
  onNotInterested?: (productId: string | number) => void;
  onToggleLike?: (product: any) => void;
  onLogView?: (id: any) => void;
  onOpenSheet?: (type: SheetType, product: any) => void;
  onCollectCoin?: (event: React.MouseEvent, product: any) => void;
  canShowCollectCoin?: (product: any) => boolean;
  onAddToBag?: (product: any, quantity: number, variant: any, size: string | null, country: string | null, variantIndex: number | null) => void | Promise<void>;
  onOrderStatusChange?: (product: any, status: string) => void | Promise<void>;
  initialSizeError?: boolean;
  onSizeRequired?: () => void;
}

const safeParse = (data: any) => {
  if (!data) return null;
  if (typeof data !== "string") return data;
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
};

const parseShippingData = (product: any) => {
  const infoRaw = product?.shipping_info || product?.shipping_data || product?.shipping_rates;
  const info = safeParse(infoRaw);
  let standardized: { country: string; price: number; days: string }[] = [];
  const actualRates = info?.rates || (Array.isArray(info) ? info : null);

  if (info?.unified) {
    const charge = parseFloat(info.charge || 0);
    const days = info.days || info.date || "3-5 Business Days";
    const countryList = actualRates && actualRates.length > 0 ? actualRates : [{ country: "Worldwide" }];
    standardized = countryList.map((c: any) => ({ country: c.country || "Worldwide", price: charge, days }));
  } else if (actualRates && Array.isArray(actualRates) && actualRates.length > 0) {
    standardized = actualRates.map((c: any) => ({
      country: c.country || "Unknown",
      price: parseFloat(c.charge || c.price || 0),
      days: c.days || c.date || info?.days || "3-5 Business Days",
    }));
  } else {
    const countries = info?.available_countries || info?.countries || info?.region || "Worldwide";
    const charge = parseFloat(info?.shipping_cost || info?.price || info?.charge || 0);
    const days = info?.days || info?.date || "3-5 Business Days";
    if (typeof countries === "string") {
      standardized = countries.split(",").map((c: string) => ({ country: c.trim(), price: charge, days }));
    } else if (Array.isArray(countries)) {
      standardized = countries.map((c: any) =>
        typeof c === "string"
          ? { country: c, price: charge, days }
          : { country: c.country || c.name || "Unknown", price: parseFloat(c.price || c.cost || c.charge || charge), days: c.days || c.date || days },
      );
    }
  }

  return standardized.length ? standardized : [{ country: "Worldwide", price: 0, days: "3-5 Business Days" }];
};

const getDeliveryDateText = (daysValue: string) => {
  if (!daysValue) return "3-5 Business Days";
  const range = daysValue.split("-").map((d) => parseInt(d.trim())).filter((d) => !Number.isNaN(d));
  if (!range.length) return daysValue;
  const today = new Date();
  const end = new Date(today);
  end.setDate(today.getDate() + range[range.length - 1]);
  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${today.toLocaleDateString("en-US", options)} - ${end.toLocaleDateString("en-US", options)} Delivery`;
};

const normalizeImageSrc = (src?: string) => {
  if (!src) return "https://picsum.photos/400/400";
  if (src.startsWith("/uploads/") || /^https?:\/\//i.test(src) || src.startsWith("data:")) return src;
  return src.includes("uploads") || src.includes("\\") ? `/uploads/${src.split(/[\\/]/).pop()}` : src;
};

const EMPTY_LIVE_STATE = {};

const getProductVariants = (product: any) => {
  const variants = safeParse(product?.variants);
  return Array.isArray(variants) ? variants : [];
};

const getProductImages = (product: any) => {
  const variants = getProductVariants(product);
  return Array.from(
    new Set([product?.image_url, product?.media_preview, ...(variants || []).map((v: any) => v.url || v.image_url || v.image)].filter(Boolean)),
  ) as string[];
};

const renderDescription = (text: string, router: ReturnType<typeof useRouter>) => {
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/g;
  return text.split(urlRegex).map((part, index) => {
    if (urlRegex.test(part)) {
      const href = part.startsWith("http") ? part : `https://${part}`;
      return (
        <button
          type="button"
          key={`${part}-${index}`}
          onClick={(event) => {
            event.stopPropagation();
            router.push(href);
          }}
          className="text-blue-400 underline underline-offset-2"
        >
          {part}
        </button>
      );
    }
    return part;
  });
};

function ShippingSection({
  product,
  selectedCountry,
  onCountryChange,
}: {
  product: any;
  selectedCountry: string | null;
  onCountryChange: (country: string) => void;
}) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const { savedAddress } = useCart();
  const standardized = parseShippingData(product);
  const defaultCountry = standardized[0]?.country || "Worldwide";
  const currentCountry = selectedCountry || savedAddress?.country || defaultCountry;
  const currentRate =
    standardized.find((c: any) => String(c.country).toLowerCase() === String(currentCountry).toLowerCase()) ||
    standardized.find((c: any) => String(c.country).toLowerCase().includes("world"));
  const priceText = !currentRate ? "N/A" : parseFloat(String(currentRate.price || 0)) === 0 ? "FREE" : `R ${parseFloat(String(currentRate.price || 0)).toFixed(2)}`;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsDropdownOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="min-w-0 truncate text-[10px] font-black uppercase tracking-tighter text-black">{currentCountry}</span>
        <span className="shrink-0 text-[9px] font-black text-black/50">{priceText}</span>
      </button>
      {isDropdownOpen && (
        <div className="absolute right-0 top-full z-[220] mt-2 max-h-56 w-56 overflow-y-auto rounded-xl border border-white/10 bg-[#1A1A1A] p-1.5 shadow-2xl">
          {standardized.map((rate) => (
            <button
              type="button"
              key={rate.country}
              onClick={() => {
                onCountryChange(rate.country);
                setIsDropdownOpen(false);
              }}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[10px] font-bold text-white/80 hover:bg-white/10"
            >
              <span>{rate.country}</span>
              <span className="text-white/40">{parseFloat(String(rate.price || 0)) === 0 ? "FREE" : `R ${parseFloat(String(rate.price || 0)).toFixed(2)}`}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ShopProductSecondViewModal({
  product,
  activeTab = "market",
  myListingsTab = "active",
  currentUser,
  justSubscribedSellerId = null,
  onClose,
  onNavigateToProfile,
  showSubscribeForProduct,
  getSellerId,
  onSubscribeSeller,
  onShare,
  onPromote,
  onEdit,
  onDelete,
  onReport,
  onNotInterested,
  onToggleLike,
  onLogView,
  onOpenSheet,
  onCollectCoin,
  canShowCollectCoin,
  onAddToBag,
  onOrderStatusChange,
  initialSizeError = false,
  onSizeRequired,
}: ShopProductSecondViewModalProps) {
  const router = useRouter();
  const interactionId = product?.adId || product?.ad_id
    ? getAdInteractionId({ ...product, is_sponsored: true })
    : getAdInteractionId(product);
  const liveState = useAdStore((state) => state.adStates[interactionId] || EMPTY_LIVE_STATE);
  const displayProduct = {
    ...product,
    user_liked: liveState.user_liked ?? product.user_liked,
    liked: liveState.user_liked ?? product.liked ?? product.user_liked,
    likes_count: liveState.likes_count ?? product.likes_count,
    ad_coin_collected: liveState.ad_coin_collected ?? product.ad_coin_collected,
    views_count: liveState.views_count ?? product.views_count,
    comments_count: liveState.comments_count ?? product.comments_count,
    shares_count: liveState.shares_count ?? product.shares_count,
  };
  const sellerName = getItemUsername(product, "Seller");
  const sellerImage = getItemProfilePicture(product);
  const timeLabel = useRelativeTime(product?.created_at, "Product");
  const [activePreviewIndex, setActivePreviewIndex] = useState(0);
  const [selectedVariantIndex, setSelectedVariantIndex] = useState<number | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedShippingCountry, setSelectedShippingCountry] = useState<string | null>(null);
  const [isSizeDropdownOpen, setIsSizeDropdownOpen] = useState(false);
  const [isColorDropdownOpen, setIsColorDropdownOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [isFullscreenPreviewOpen, setIsFullscreenPreviewOpen] = useState(false);
  const [sizeError, setSizeError] = useState(initialSizeError);

  const productVariants = getProductVariants(product);
  const uniqueImages = getProductImages(product);
  const currentImg = uniqueImages[activePreviewIndex] || uniqueImages[0];
  const isReviewMode = activeTab === "my-products" && myListingsTab === "reviewing";
  const commissionInfo = safeParse(product.commission_info);
  const activeVariant = selectedVariantIndex !== null ? productVariants[selectedVariantIndex] : productVariants[0] || product;
  const sellerId = getSellerId?.(product) || product?.user_id || product?.owner_id || product?.seller_id || product?.user?.id;
  const isProductPromoteSecondView =
    (product?.isProductPromoteSecondView || String(product?.campaign_type || product?.campaignType || "").toLowerCase() === "product promote") &&
    !!(product?.adId || product?.ad_id);
  const showAdCoinButton = isProductPromoteSecondView && !!canShowCollectCoin?.(displayProduct);
  const trackProductPromoteClick = () => {
    if (!isProductPromoteSecondView) return;
    logSponsoredAdClick(displayProduct, "visit");
  };
  const activeSelections = Array.isArray(activeVariant?.selections) ? activeVariant.selections : [];
  const sizeOptions = safeParse(product.sizes);
  const sizeList = activeSelections.map((selection: any) => selection.value).filter(Boolean).length
    ? activeSelections.map((selection: any) => selection.value).filter(Boolean)
    : Array.isArray(sizeOptions)
      ? sizeOptions.map((size: any) => (typeof size === "string" ? size : size.value)).filter(Boolean)
      : [];
  const getAvailableCountForSize = (size: string | null) => {
    const trimmedSize = String(size || "").trim();
    const selections = Array.isArray(activeVariant?.selections) ? activeVariant.selections : [];
    const selection = selections.find((entry: any) => String(entry?.value || "").trim() === trimmedSize);
    if (selection) return parseInt(selection.stock || selection.quantity || 0) || 0;
    const activeColor = activeVariant?.color;
    const matchingVariant = productVariants.find((variant: any) =>
      String(variant?.size || "").trim() === trimmedSize &&
      (!activeColor || !variant?.color || String(variant.color) === String(activeColor))
    );
    if (matchingVariant) return parseInt(matchingVariant.stock || matchingVariant.quantity || 0) || 0;
    return parseInt(activeVariant?.stock || activeVariant?.quantity || product.stock || 0) || 0;
  };
  const currentVariantStock = selectedSize ? getAvailableCountForSize(selectedSize) : (parseInt(activeVariant?.stock || activeVariant?.quantity || product.stock || 0) || 0);

  const handleAddToBag = async () => {
    if (sizeList.length > 0 && (!selectedSize || selectedSize === "Select Size" || selectedSize === "None")) {
      setSizeError(true);
      onSizeRequired?.();
      return;
    }
    if (onAddToBag) {
      trackProductPromoteClick();
      await onAddToBag(product, quantity, activeVariant, selectedSize, selectedShippingCountry, selectedVariantIndex);
      return;
    }
    onClose();
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-2 md:p-4 bg-black/95 backdrop-blur-xl animate-in fade-in duration-300"
        onClick={onClose}
      >
        <div
          className="bg-[#121212] border border-white/10 rounded-[1.2rem] md:rounded-3xl w-full max-w-[900px] shadow-2xl overflow-hidden flex flex-col md:flex-row h-[95dvh] md:h-auto md:max-h-[90vh] animate-in zoom-in-95 duration-300"
          onClick={(event) => event.stopPropagation()}
        >
          {/* Image panel — compact on mobile, 45% width on desktop */}
          <div className="w-full md:w-[45%] relative flex flex-col shrink-0 p-1.5 md:p-3 h-[42%] md:h-auto">
            <div className="relative w-full h-full rounded-[1rem] md:rounded-[2rem] border border-white/10 bg-[#0a0a0a] flex flex-col overflow-visible">
              <div className="relative w-full h-14 bg-black flex-shrink-0 rounded-t-[1rem] md:rounded-t-[2rem] border-b border-white/5 flex items-center justify-between gap-2 px-3 md:px-5 z-[70] pointer-events-none">
                <button
                  type="button"
                  className="flex items-center gap-2.5 pointer-events-auto group/profile cursor-pointer"
                  onClick={(event) => {
                    trackProductPromoteClick();
                    onNavigateToProfile?.(event, product);
                  }}
                >
                  <div className="w-8 h-8 rounded-full bg-slate-800 border border-white/10 overflow-hidden relative shadow-lg group-hover/profile:border-blue-400/60 transition-all">
                    {sellerImage ? (
                      <Image src={sellerImage} alt="Seller" fill className="object-cover" unoptimized />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/40 bg-white/5">
                        <IonIcon name="person" className="text-base" />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-start">
                    <span className="mb-0.5 text-[11px] font-black normal-case leading-none tracking-tight text-white transition-colors group-hover/profile:text-blue-400">
                      {sellerName}
                    </span>
                    <span className="text-[7px] font-black text-white/50 tracking-[0.2em]">
                      {product.is_sponsored || product.isAd ? "Ad" : timeLabel}
                    </span>
                  </div>
                </button>

                  <div className="flex shrink-0 items-center gap-1.5 md:gap-3 pointer-events-auto">
                  {showSubscribeForProduct?.(product) && (
                    <button
                      type="button"
                      onClick={(event) => {
                        trackProductPromoteClick();
                        onSubscribeSeller?.(event, product);
                      }}
                      className="rounded-full bg-white px-4 py-1.5 text-[9px] font-black uppercase tracking-widest text-black shadow-xl transition-all hover:bg-slate-100 active:scale-95"
                    >
                      {justSubscribedSellerId === String(sellerId) ? "Subscribed" : "Subscribe"}
                    </button>
                  )}
                  {showAdCoinButton && onCollectCoin && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onCollectCoin(event, displayProduct);
                      }}
                      className="flex items-center gap-1.5 rounded-full border border-red-400/30 bg-red-600 px-2 py-1 text-[8px] font-black uppercase tracking-[0.1em] text-white shadow-xl transition hover:bg-red-500 active:scale-95"
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
                  )}
                  <div className="relative flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onClose();
                      }}
                      className="w-9 h-9 flex items-center justify-center text-white text-2xl transition-all active:scale-75 hover:bg-white/10 rounded-full"
                    >
                      <IonIcon name="close-outline" className="text-2xl" />
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setIsMenuOpen((value) => !value);
                      }}
                      className="w-9 h-9 flex items-center justify-center text-white text-2xl transition-all active:scale-75 hover:bg-white/10 rounded-full"
                    >
                      <div className="flex flex-col gap-1 p-1">
                        <div className="w-1 h-1 rounded-full bg-white shadow-lg" />
                        <div className="w-1 h-1 rounded-full bg-white shadow-lg" />
                      </div>
                    </button>
                    {isMenuOpen && (
                      <div className="absolute top-full right-0 mt-2 w-56 bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] py-2 z-[80] overflow-hidden animate-in zoom-in-95 fade-in duration-200" onClick={(event) => event.stopPropagation()}>
                        <button type="button" onClick={() => { trackProductPromoteClick(); onShare?.(product, "resell"); setIsMenuOpen(false); }} className="w-full px-5 py-4 text-left text-[11px] font-bold text-white hover:bg-white/5 flex items-center gap-3 transition-colors">
                          <IonIcon name="cash-outline" className="text-amber-500 text-lg" />
                          Resell Commission Link
                        </button>
                        <button type="button" onClick={() => { trackProductPromoteClick(); onShare?.(product, "share"); setIsMenuOpen(false); }} className="w-full px-5 py-4 text-left text-[11px] font-bold text-white hover:bg-white/5 flex items-center gap-3 transition-colors border-t border-white/5">
                          <IonIcon name="share-social-outline" className="text-blue-400 text-lg" />
                          Share Link
                        </button>
                        {onPromote && (
                          <button type="button" onClick={() => { onPromote(product); setIsMenuOpen(false); }} className="w-full px-5 py-4 text-left text-[11px] font-bold text-white hover:bg-white/5 flex items-center gap-3 transition-colors border-t border-white/5">
                            <IonIcon name="megaphone-outline" className="text-emerald-400 text-lg" />
                            Promote
                          </button>
                        )}
                        {String(currentUser?.id || "") === String(product.user_id || "") ? (
                          <>
                            {onEdit && (
                              <button type="button" onClick={() => { onEdit(product); setIsMenuOpen(false); onClose(); }} className="w-full px-5 py-4 text-left text-[11px] font-bold text-white hover:bg-white/5 flex items-center gap-3 transition-colors border-t border-white/5">
                                <IonIcon name="create-outline" className="text-emerald-400 text-lg" />
                                Edit Post
                              </button>
                            )}
                            {onDelete && (
                              <button type="button" onClick={() => { onDelete(product); setIsMenuOpen(false); onClose(); }} className="w-full px-5 py-4 text-left text-[11px] font-bold text-red-500 hover:bg-white/5 flex items-center gap-3 transition-colors border-t border-white/5">
                                <IonIcon name="trash-outline" className="text-lg" />
                                Delete Post
                              </button>
                            )}
                          </>
                        ) : (
                          <>
                            {onReport && (
                              <button type="button" onClick={() => { onReport(product); setIsMenuOpen(false); }} className="w-full px-5 py-4 text-left text-[11px] font-bold text-white hover:bg-white/5 flex items-center gap-3 transition-colors border-t border-white/5">
                                <IonIcon name="alert-circle-outline" className="text-yellow-500 text-lg" />
                                Report
                              </button>
                            )}
                            {onNotInterested && (
                              <button type="button" onClick={() => { onNotInterested(product.id); setIsMenuOpen(false); onClose(); }} className="w-full px-5 py-4 text-left text-[11px] font-bold text-white hover:bg-white/5 flex items-center gap-3 transition-colors border-t border-white/5">
                                <IonIcon name="eye-off-outline" className="text-slate-500 text-lg" />
                                Not Interested
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div
                className="relative w-full bg-[#0a0a0a] group cursor-zoom-in flex items-center justify-center overflow-hidden rounded-b-[1rem] md:rounded-b-[2rem]"
                style={{ flex: "1 1 0", minHeight: 0 }}
                onClick={(event) => {
                  event.stopPropagation();
                  setIsFullscreenPreviewOpen(true);
                }}
              >
                <Image
                  src={normalizeImageSrc(currentImg)}
                  alt={product.title || "Product"}
                  fill
                  className="object-contain transition-all duration-500 group-hover:opacity-80"
                  unoptimized
                />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10 pointer-events-none">
                  <div className="w-14 h-14 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center border border-white/20 shadow-xl">
                    <IonIcon name="search-outline" className="text-white text-2xl" />
                  </div>
                </div>

                {/* Vertical interaction sidebar — inside image, right edge */}
                {activeTab === "market" && (
                  <div
                    className="absolute right-1.5 top-1/2 z-[60] flex max-w-[34px] -translate-y-1/2 flex-col items-center md:right-2 md:max-w-[46px]"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onPointerUp={(e) => e.stopPropagation()}
                  >
                    <div className="flex flex-col items-center gap-1 rounded-full border border-white/10 bg-black/55 px-1 py-1 shadow-xl backdrop-blur-xl md:gap-1.5 md:py-1.5">
                      <button type="button" onClick={(e) => { e.stopPropagation(); onToggleLike?.(displayProduct); }} className="flex flex-col items-center gap-0 active:scale-95 transition-all">
                        <svg viewBox="0 0 24 24" className={`h-6 w-6 rounded-full bg-white/5 p-1.5 transition-colors md:h-8 md:w-8 md:p-2 ${displayProduct.user_liked ? "fill-red-500 text-red-500" : "fill-transparent text-white"}`} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z" />
                        </svg>
                        {!!displayProduct.likes_count && <span className={`text-[7px] font-black leading-none md:text-[10px] ${displayProduct.user_liked ? "text-red-500" : "text-white"}`}>{displayProduct.likes_count > 999 ? "999+" : displayProduct.likes_count}</span>}
                      </button>
                      <InteractionButton type="views" icon="eye-outline" activeIcon="eye" count={displayProduct.views_count} color="text-white" activeColor="text-white" onSingleClick={() => { onLogView?.(displayProduct.id); onOpenSheet?.("views", displayProduct); }} onLongPress={() => onOpenSheet?.("views", displayProduct)} orientation="vertical" iconSize="text-[13px] md:text-[10px]" buttonSize="h-6 w-6 md:h-8 md:w-8" countSize="text-[7px] md:text-[10px]" />
                      <InteractionButton type="comments" icon="chatbubble" activeIcon="chatbubble" count={displayProduct.comments_count} color="text-white" activeColor="text-white" onSingleClick={() => onOpenSheet?.("comments", displayProduct)} onLongPress={() => onOpenSheet?.("comments", displayProduct)} orientation="vertical" iconSize="text-[13px] md:text-[10px]" buttonSize="h-6 w-6 md:h-8 md:w-8" countSize="text-[7px] md:text-[10px]" />
                      <InteractionButton type="shares" icon="share-social" activeIcon="share-social" count={displayProduct.shares_count || 0} color="text-white" activeColor="text-white" onSingleClick={() => { trackProductPromoteClick(); onShare?.(displayProduct); }} onLongPress={() => onOpenSheet?.("shares", displayProduct)} orientation="vertical" iconSize="text-[13px] md:text-[10px]" buttonSize="h-6 w-6 md:h-8 md:w-8" countSize="text-[7px] md:text-[10px]" />
                    </div>
                  </div>
                )}

                {commissionInfo?.discount && parseFloat(commissionInfo.discount) > 0 && (
                  <div className="absolute bottom-4 right-16 z-20">
                    <div className="px-3 py-1 bg-green-500/10 backdrop-blur-md border border-green-500/20 rounded-lg shadow-xl shadow-green-500/10">
                      <span className="text-[10px] md:text-sm font-black text-green-500 tracking-tighter">+{commissionInfo.discount}%</span>
                    </div>
                  </div>
                )}
              </div>
            </div>


            <div className="hidden md:flex p-1.5 md:p-4 bg-transparent rounded-b-[2rem] border-t border-white/5 overflow-x-auto no-scrollbar gap-2">
              {uniqueImages.map((img, idx) => (
                <div
                  key={`${img}-${idx}`}
                  onClick={() => {
                    setActivePreviewIndex(idx);
                    const variantIdx = productVariants.findIndex((variant: any) => (variant.image_url || variant.url || variant.image) === img);
                    setSelectedVariantIndex(variantIdx !== -1 ? variantIdx : null);
                  }}
                  className={`relative w-9 h-9 md:w-16 md:h-16 rounded-md md:rounded-xl overflow-hidden cursor-pointer border-2 transition-all shrink-0 ${activePreviewIndex === idx ? "border-white scale-105 shadow-lg shadow-black/40" : "border-transparent opacity-50 hover:opacity-100"}`}
                >
                  <Image src={normalizeImageSrc(img)} alt="Thumb" fill className="object-cover" unoptimized />
                </div>
              ))}
            </div>
          </div>

          {/* Details panel — remaining 58% on mobile, flex-1 on desktop */}
          <div className="flex-1 flex flex-col overflow-hidden h-[58%] md:h-auto">
            <div className="flex-1 overflow-y-auto p-3 md:p-8 space-y-3 md:space-y-8 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              <div className="space-y-0 px-1 md:px-7 py-1 md:py-2 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {isReviewMode && (
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-xl font-black text-white uppercase tracking-tight">Product Review</h2>
                    <div className="px-3 py-1 bg-blue-500/10 rounded-full border border-blue-500/20">
                      <span className="text-[8px] font-black text-blue-400 uppercase tracking-widest">Awaiting Approval</span>
                    </div>
                  </div>
                )}

                {product.order_number && (
                  <div className="mb-6 p-4 bg-white/5 rounded-[1.5rem] border border-white/5 flex items-center justify-between shadow-inner">
                    <div className="flex flex-col gap-0.5">
                      <p className="text-[7px] font-black text-white/30 uppercase tracking-[0.2em] italic leading-none">Order Reference</p>
                      <p className="text-sm font-black text-white tracking-widest">#{product.order_number}</p>
                    </div>
                    <button type="button" onClick={() => navigator.clipboard.writeText(product.order_number)} className="p-3 bg-white/5 rounded-xl text-white/40 hover:text-white hover:bg-white/10 transition-all border border-white/5 active:scale-95" title="Copy Order ID">
                      <IonIcon name="copy-outline" className="text-sm" />
                    </button>
                  </div>
                )}

                <div className="mb-2">
                  <h2 className="overflow-hidden text-[17px] md:text-[28px] font-black text-white tracking-tight leading-tight mb-1 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] md:[-webkit-line-clamp:3] break-words">
                    {product.title}
                  </h2>
                  <div className="flex flex-wrap items-center gap-y-1">
                    <span className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">{product.category || "General"}</span>
                  </div>
                </div>

                {isReviewMode && (
                  <div className="mb-6 space-y-3">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50 px-1">COMMISSION & PRICING</p>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-[#151515] rounded-2xl border border-white/5 p-4 flex flex-col items-center justify-center gap-1.5 shadow-inner"><IonIcon name="logo-google" className="text-red-500 text-lg mb-1" /><span className="text-[7px] font-black text-slate-500 uppercase tracking-widest">Googer Fee</span><span className="text-sm font-black text-white">{commissionInfo?.googer_commission || 0}%</span></div>
                      <div className="bg-[#151515] rounded-2xl border border-white/5 p-4 flex flex-col items-center justify-center gap-1.5 shadow-inner"><IonIcon name="people-outline" className="text-blue-500 text-lg mb-1" /><span className="text-[7px] font-black text-slate-500 uppercase tracking-widest">Reseller</span><span className="text-sm font-black text-white">{commissionInfo?.resell_percentage || 0}%</span></div>
                      <div className="bg-[#151515] rounded-2xl border border-white/5 p-4 flex flex-col items-center justify-center gap-1.5 shadow-inner"><IonIcon name="copy-outline" className="text-emerald-500 text-lg mb-1" /><span className="text-[7px] font-black text-slate-500 uppercase tracking-widest">Discount</span><span className="text-sm font-black text-white">{commissionInfo?.discount || 0}%</span></div>
                    </div>
                  </div>
                )}

                {product.description && (
                  <div className="mb-5 px-1 w-full overflow-hidden">
                    <p className="w-full bg-slate-800/50 border border-white/10 rounded-xl px-3 py-2 md:py-3 text-[11px] md:text-xs text-white whitespace-pre-wrap break-words max-h-[80px] md:max-h-[180px] overflow-y-auto overflow-x-hidden custom-scrollbar leading-relaxed">
                      {renderDescription(product.description, router)}
                    </p>
                  </div>
                )}

                <div className="mb-5 px-1">
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50 mb-2">RUPIEER</p>
                  <div className="flex flex-wrap items-center gap-4 rounded-[1.5rem] border border-white/10 bg-white/[0.03] px-4 py-3 shadow-inner">
                    <div className="flex items-center gap-2.5 shrink-0">
                      <span className="text-[22px] font-black text-white leading-none">•</span>
                      <div className="flex flex-col">
                        {(() => {
                          const price = parseFloat(activeVariant?.promo_price || activeVariant?.price || product.promo_price || product.price || 0);
                          const mainPrice = parseFloat(activeVariant?.price || product.price || 0);
                          const hasPromo = price < mainPrice;
                          return (
                            <>
                              <span className="text-[20px] md:text-[30px] font-black text-white tracking-tighter leading-none">{price.toFixed(2)}</span>
                              {hasPromo && <span className="text-[10px] font-black text-red-500 line-through tracking-widest mt-0.5 ml-0.5 opacity-80">R {mainPrice.toFixed(2)}</span>}
                            </>
                          );
                        })()}
                      </div>
                    </div>

                    {!isReviewMode && (
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="flex flex-col items-end mr-1">
                          <span className="text-[7px] font-black uppercase tracking-[0.2em] text-slate-500">QTY</span>
                          <span className="text-[6px] font-black uppercase tracking-widest mt-0.5 text-blue-400">{currentVariantStock > 0 ? `${currentVariantStock} IN STOCK` : "OUT OF STOCK"}</span>
                        </div>
                        <div className="flex items-center gap-0 border border-white/20 rounded-full overflow-hidden h-8 bg-black/20">
                          <button type="button" onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-9 h-full flex items-center justify-center text-white hover:bg-white/10 transition-all text-base font-bold">-</button>
                          <span className="w-7 text-center text-[10px] font-black text-white select-none">{quantity}</span>
                          <button type="button" onClick={() => setQuantity(Math.min(currentVariantStock, quantity + 1))} disabled={currentVariantStock <= 0 || quantity >= currentVariantStock} className={`w-9 h-full flex items-center justify-center text-white transition-all text-base font-bold ${currentVariantStock <= 0 || quantity >= currentVariantStock ? "opacity-20 cursor-not-allowed" : "hover:bg-white/10"}`}>+</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {productVariants.length > 0 && (
                  <div className="mb-6 space-y-3">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">AVAILABLE COLORS</span>
                      <span className="text-[8px] font-black text-white/40 uppercase tracking-widest">{selectedVariantIndex !== null ? productVariants[selectedVariantIndex]?.color : "Standard"}</span>
                    </div>
                    <div className="flex gap-2.5 overflow-x-auto no-scrollbar py-1.5">
                      {productVariants.map((variant: any, idx: number) => (
                        <div key={idx} className="flex flex-col items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedVariantIndex(idx);
                              setSelectedSize(null);
                              setSizeError(false);
                              setQuantity(1);
                              const variantImg = variant.url || variant.image_url || variant.image;
                              const imgIndex = uniqueImages.indexOf(variantImg);
                              setActivePreviewIndex(imgIndex !== -1 ? imgIndex : 0);
                            }}
                            className={`relative w-10 h-10 md:w-11 md:h-11 rounded-[14px] border-2 transition-all overflow-hidden shadow-lg ${selectedVariantIndex === idx ? "border-white scale-105 bg-white/10" : "border-white/10 bg-transparent hover:border-white/20"}`}
                          >
                            {variant.image_url || variant.url || variant.image ? (
                              <Image src={normalizeImageSrc(variant.image_url || variant.url || variant.image)} alt="" fill className="object-cover" unoptimized />
                            ) : (
                              <div className="w-full h-full" style={{ backgroundColor: variant.color_hex || "#333" }} />
                            )}
                            {selectedVariantIndex === idx && <div className="absolute inset-0 bg-white/5 backdrop-blur-[0.5px] flex items-center justify-center"><IonIcon name="checkmark-circle" className="text-white text-base" /></div>}
                          </button>
                          <span className={`text-[7px] font-black uppercase tracking-widest transition-colors ${selectedVariantIndex === idx ? "text-white" : "text-slate-600"}`}>{variant.color || variant.description || "Style"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mb-2" />
                <div className="space-y-1">
                  {productVariants.length > 0 && (
                    <div className="flex items-center justify-between py-3 px-1 border-t border-white/5">
                      <span className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-500">AVAILABLE COLORS</span>
                      <div className="relative min-w-[110px] max-w-[200px] md:max-w-[260px] w-auto flex-1 md:flex-none">
                        <button type="button" onClick={() => { setIsColorDropdownOpen(!isColorDropdownOpen); if (!isColorDropdownOpen) setIsSizeDropdownOpen(false); }} className="w-full bg-white text-black border border-white/20 rounded-full px-3 py-1.5 md:py-2 flex items-center justify-between shadow-lg hover:bg-slate-100 active:scale-95 group transition-all">
                          <span className="text-[9px] md:text-[10px] font-medium uppercase tracking-[0.1em] truncate relative top-[0.5px] pl-1">{selectedVariantIndex !== null ? productVariants[selectedVariantIndex]?.color || "Standard" : "Colors"}</span>
                          <div className={`flex items-center justify-center transition-transform duration-300 ${isColorDropdownOpen ? "rotate-180" : ""}`}><IonIcon name="chevron-down" className="text-black text-[9px]" /></div>
                        </button>
                        {isColorDropdownOpen && (
                          <div className="absolute top-full mt-2.5 right-0 w-full min-w-[140px] bg-[#1A1A1A] border border-white/10 rounded-xl p-1.5 shadow-2xl z-[200] animate-in slide-in-from-top-2 fade-in duration-300 backdrop-blur-xl">
                            {productVariants.map((variant: any, idx: number) => (
                              <button key={idx} type="button" onClick={() => { setSelectedVariantIndex(idx); setSelectedSize(null); setSizeError(false); setQuantity(1); setIsColorDropdownOpen(false); }} className={`w-full py-3 px-5 rounded-xl text-[10px] font-medium uppercase tracking-wider text-left transition-all flex items-center justify-between ${selectedVariantIndex === idx ? "bg-white text-black" : "text-white/80 hover:bg-white/10 hover:text-white"}`}>
                                <span>{variant.color || variant.description || `Style ${idx + 1}`}</span>
                                {selectedVariantIndex === idx && <IonIcon name="checkmark" className="text-black text-xs" />}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {(() => {
                    if (!sizeList.length) return null;
                    const activeSelection = activeSelections.find((s: any) => s.value === selectedSize);
                    const selectedSizeDisplay = activeSelection?.detail ? `${selectedSize} (${activeSelection.detail})` : selectedSize;
                    return (
                      <div className="flex items-center justify-between py-3 px-1 border-t border-white/5">
                        <span className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-500">SIZES</span>
                        <div className="relative min-w-[110px] max-w-[200px] md:max-w-[260px] w-auto flex-1 md:flex-none">
                          <button type="button" onClick={() => { setIsSizeDropdownOpen(!isSizeDropdownOpen); if (!isSizeDropdownOpen) setIsColorDropdownOpen(false); }} className={`w-full bg-white text-black border rounded-full px-3 py-1.5 md:py-2 flex items-center justify-between shadow-lg hover:bg-slate-100 active:scale-95 group transition-all ${sizeError ? "border-red-500 ring-2 ring-red-500/40" : "border-white/20"}`}>
                            <span className="text-[9px] md:text-[10px] font-medium uppercase tracking-[0.1em] truncate relative top-[0.5px] pl-1">{selectedSize ? selectedSizeDisplay : "Sizes"}</span>
                            <div className={`flex items-center justify-center transition-transform duration-300 ${isSizeDropdownOpen ? "rotate-180" : ""}`}><IonIcon name="chevron-down" className="text-black text-[9px]" /></div>
                          </button>
                          {isSizeDropdownOpen && (
                            <div className="absolute top-full mt-2.5 right-0 w-full min-w-[140px] bg-[#1A1A1A] border border-white/10 rounded-xl p-1.5 shadow-2xl z-[200] animate-in slide-in-from-top-2 fade-in duration-300 backdrop-blur-xl">
                              {sizeList.map((size: string) => {
                                const trimmedSize = String(size).trim();
                                const availableCount = getAvailableCountForSize(trimmedSize);
                                const isOutOfStock = availableCount <= 0;
                                return (
                                <button key={trimmedSize} type="button" disabled={isOutOfStock} onClick={() => { setSelectedSize(trimmedSize); setSizeError(false); if (quantity > availableCount) setQuantity(Math.max(1, availableCount)); setIsSizeDropdownOpen(false); }} className={`w-full py-3 px-5 rounded-xl text-[10px] font-medium uppercase tracking-wider text-left transition-all flex items-center justify-between ${isOutOfStock ? "opacity-30 cursor-not-allowed text-white/50" : selectedSize === trimmedSize ? "bg-white text-black" : "text-white/80 hover:bg-white/10 hover:text-white"}`}>
                                  <span className="truncate">{`${trimmedSize} (${availableCount})`}</span>
                                </button>
                                );
                              })}
                            </div>
                          )}
                          {sizeError && <p className="mt-2 px-2 text-[9px] font-black uppercase tracking-[0.16em] text-red-500">Select Size</p>}
                        </div>
                      </div>
                    );
                  })()}

                  {(() => {
                    const standardized = parseShippingData(product);
                    if (!standardized.length) return null;
                    const defaultCountry = standardized[0]?.country || "Worldwide";
                    const currentCountry = selectedShippingCountry || defaultCountry;
                    const countryData = standardized.find((country: any) => country.country === currentCountry) || standardized[0];
                    return (
                      <div className="flex items-center justify-between py-3 px-1 border-t border-white/5">
                        <span className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-500">DELIVERY TIME</span>
                        <span className="text-[9px] font-black text-white uppercase tracking-tighter text-right">{getDeliveryDateText(countryData?.days)}</span>
                      </div>
                    );
                  })()}

                  <div className="py-2.5 px-0.5 grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1 px-4 py-2 bg-white/[0.03] border border-white/10 rounded-xl shadow-lg justify-center">
                      <span className="text-[7px] font-black uppercase text-slate-500 tracking-wider">RETURNS & WARRANTY</span>
                      <div className="text-[10px] font-black text-white uppercase tracking-tighter leading-tight">
                        <div className="flex flex-col gap-0.5 mt-0.5">
                          <span className="mb-0">{(safeParse(product.return_policy)?.text || safeParse(product.return_data)?.return_days || "14 Days Return").toString().toUpperCase()}</span>
                          <span className="text-[9px] text-white/50 bg-white/5 w-fit px-1.5 py-[1px] rounded uppercase">{safeParse(product.warranty_info)?.warranty || "No Warranty"}</span>
                        </div>
                      </div>
                    </div>
                    {!isReviewMode && (
                      <div className="flex flex-col gap-0.5">
                        <div className="flex flex-col gap-1 px-4 py-2 bg-white border border-white/20 rounded-xl shadow-2xl relative justify-center">
                          <span className="text-[7px] font-black uppercase text-black/40 tracking-wider mb-0.5">SHIPS TO</span>
                          <ShippingSection product={product} selectedCountry={selectedShippingCountry} onCountryChange={setSelectedShippingCountry} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {!isReviewMode && (
                  <div className="pt-4 flex justify-center">
                    <button type="button" onClick={handleAddToBag} className="text-white text-[11px] md:text-[13px] font-black uppercase tracking-[0.4em] hover:opacity-80 transition-opacity active:scale-95">
                      ADD TO BAG
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="px-3 py-2 md:px-7 md:py-4 border-t border-white/5 bg-transparent mt-auto flex items-center justify-between">
              {activeTab === "my-products" && myListingsTab === "all" && product.status ? (
                <div className="flex-1 flex gap-3">
                  {product.status === "pending" && (
                    <>
                      <button type="button" onClick={() => onOrderStatusChange?.(product, "processing")} className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl active:scale-95">Approve Order</button>
                      <button type="button" onClick={() => onOrderStatusChange?.(product, "cancelled")} className="flex-1 py-3 bg-red-600/20 text-red-500 border border-red-500/20 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] active:scale-95">Cancel Order</button>
                    </>
                  )}
                  {product.status === "processing" && <button type="button" onClick={() => onOrderStatusChange?.(product, "shipped")} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl active:scale-95">Mark as Shipped</button>}
                  {product.status === "shipped" && <button type="button" onClick={() => onOrderStatusChange?.(product, "delivered")} className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl active:scale-95">Mark as Delivered</button>}
                  {product.status === "cancelled" && <div className="flex-1 py-3 bg-white/5 text-slate-500 text-center rounded-xl font-black text-[10px] uppercase tracking-[0.2em]">Order Cancelled & Refunded</div>}
                  {product.status === "received" && <div className="flex-1 py-3 bg-emerald-500/10 text-emerald-500 text-center rounded-xl font-black text-[10px] uppercase tracking-[0.2em]">Order Completed</div>}
                </div>
              ) : activeTab === "my-products" && myListingsTab === "reviewing" ? (
                <div className="flex-1 flex gap-3">
                  <button type="button" onClick={() => { onEdit?.(product); onClose(); }} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-black text-[10px] uppercase tracking-[0.2em] transition-all shadow-xl hover:bg-blue-500 active:scale-95">Edit Product</button>
                  <button type="button" onClick={() => onDelete?.(product)} className="flex-1 py-3 bg-red-600/20 text-red-500 border border-red-500/20 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] transition-all hover:bg-red-600/30 active:scale-95">Delete</button>
                </div>
              ) : (
                <>
                  <span className="text-[10px] font-black text-white uppercase tracking-[0.3em]">RUPIEER</span>
                  <span className="text-[19px] font-black text-white tracking-widest leading-none">
                    {(parseFloat(activeVariant?.promo_price || activeVariant?.price || product.promo_price || product.price || 0) * quantity).toFixed(2)}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {isFullscreenPreviewOpen && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/95 backdrop-blur-xl animate-in fade-in duration-300" onClick={() => setIsFullscreenPreviewOpen(false)}>
          <button type="button" onClick={() => setIsFullscreenPreviewOpen(false)} className="absolute top-6 right-6 w-12 h-12 flex items-center justify-center text-white bg-white/10 hover:bg-white/20 rounded-full transition-all z-50 shadow-2xl active:scale-95">
            <IonIcon name="close-outline" className="text-3xl" />
          </button>
          <div className="relative w-full h-full max-w-6xl max-h-[90vh] p-6">
            <Image src={normalizeImageSrc(currentImg)} alt={product.title || "Product preview"} fill className="object-contain" unoptimized />
          </div>
        </div>
      )}
    </>
  );
}
