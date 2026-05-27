"use client";

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';
import { useCart } from '../context/CartContext';
import IonIcon from './IonIcon';
import { authService } from '@/services/authService';
import { marketService } from '@/services/marketService';
import { orderService } from '@/services/orderService';
import { walletService } from '@/services/walletService';

// Local SVG Icons for constant visibility
const SVG_MAP = {
  cart: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="currentColor" className="w-5 h-5">
      <path d="M451.1,153.9c-8.9-11.2-22.4-17.7-37-17.7H154.2c-1.1,0-2.2,0-3.3,0l-12.8-37C133.5,84.7,121.7,76,108.3,76H56c-11,0-20,9-20,20s9,20,20,20h52.3l61.6,177.3c1.7,4.8,6.3,8,11.3,8h217.1c9.9,0,18.4-7.3,19.9-17l24-154.7C452.9,166.4,452.3,159.2,451.1,153.9z" />
      <circle cx="188" cy="404" r="32" />
      <circle cx="380" cy="404" r="32" />
    </svg>
  ),
  address: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="currentColor" className="w-5 h-5">
      <path d="M256,32C167.8,32,96,103.8,96,192c0,128,160,288,160,288s160-160,160-288C416,103.8,344.2,32,256,32z M256,256c-35.3,0-64-28.7-64-64s28.7-64,64-64s64,28.7,64,64S291.3,256,256,256z" />
    </svg>
  ),
  payment: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="currentColor" className="w-5 h-5">
      <path d="M448,96H64c-35.3,0-64,28.7-64,64v192c0,35.3,28.7,64,64,64h384c35.3,0,64-28.7,64-64V160C512,124.7,483.3,96,448,96z M448,352H64c-8.8,0-16-7.2-16-16V160c0-8.8,7.2-16,16-16h384c8.8,0,16,7.2,16,16v176C464,344.8,456.8,352,448,352z M352,208H96v32h256V208z M352,272H96v32h256V272z" />
    </svg>
  )
};

const MANUAL_PAYMENT_INTENT_STORAGE_KEY = 'googer-manual-payment-intent';
const GOOGER_PAYMENT_INTENT_STORAGE_KEY = 'googer-payment-intent';
const MANUAL_PAYMENT_RESET_EVENT = 'googer-manual-payment-reset';
const RESELL_ATTRIBUTION_STORAGE_KEY = 'googer:resell-attribution';

const getStoredResellRefForProduct = (productId: string | number | null | undefined) => {
  if (typeof window === 'undefined' || productId === null || productId === undefined) return null;
  try {
    const raw = localStorage.getItem(RESELL_ATTRIBUTION_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const entry = parsed?.[String(productId)];
    return entry?.reseller_ref || entry?.resell_ref || null;
  } catch {
    return null;
  }
};

const getSellerPublicGoogerId = (product: any) => {
  const value = product?.owner_public_user_id
    || product?.owner_user_id
    || product?.user?.user_id
    || product?.seller_user_id
    || product?.seller_googer_id;
  if (!value) return '';
  const digits = String(value).replace(/\D/g, '');
  return digits ? digits.padStart(6, '0').slice(-6) : String(value);
};

export default function CartSidebar() {
  const { isCartOpen, setIsCartOpen, isManualPaymentCartLocked, setIsManualPaymentCartLocked, isGoogerPaymentCartLocked, setIsGoogerPaymentCartLocked, cartItems, updateQuantity, removeFromCart, clearCart, cartTotal, cartCount, toggleSelection, toggleAllSelection, selectedTotal, originalSelectedTotal, totalDiscount, selectedCount, isAllSelected, deliveryTotal, setUserCountry, isItemAvailable, userCountry, savedAddress, setSavedAddress } = useCart();
  const router = useRouter();
  const pathname = usePathname();

  const [activeView, setActiveView] = useState<'cart' | 'address' | 'payment'>('cart');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showAddressModal, setShowAddressModal] = useState(false);

  const [paymentMethod, setPaymentMethod] = useState<'wallet' | 'wallet_manual' | 'cod'>('cod');
  const [walletMode, setWalletMode] = useState<'auto' | 'manual'>('manual');
  const [walletAmount, setWalletAmount] = useState('');
  const [manualPaymentStep, setManualPaymentStep] = useState<1 | 2>(1);
  const [manualTransactionId, setManualTransactionId] = useState('');
  const [manualPaymentVerifiedTransferId, setManualPaymentVerifiedTransferId] = useState<string | null>(null);
  const [walletPaymentTransferId, setWalletPaymentTransferId] = useState<string | null>(null);
  const [pendingManualVerifyId, setPendingManualVerifyId] = useState<string | null>(null);
  const [showManualVerifyConfirm, setShowManualVerifyConfirm] = useState(false);
  const [showManualVerifySuccessModal, setShowManualVerifySuccessModal] = useState(false);
  const [showWalletPayConfirm, setShowWalletPayConfirm] = useState(false);
  const [manualSellerIdCopied, setManualSellerIdCopied] = useState(false);
  const [showManualPaymentCancelConfirm, setShowManualPaymentCancelConfirm] = useState(false);
  const [userBalance, setUserBalance] = useState<number>(0);
  const [sellerReadableIds, setSellerReadableIds] = useState<Record<number, string>>({});
  const [stockStatus, setStockStatus] = useState<Record<number, boolean>>({}); // itemId -> isOutOfStock
  const [stockLimits, setStockLimits] = useState<Record<number, number>>({}); // itemId -> available stock count
  const [hitLimitItems, setHitLimitItems] = useState<Set<number>>(new Set()); // itemIds currently showing the transient max-stock message
  const [itemShippingCountries, setItemShippingCountries] = useState<Record<number, string[]>>({}); // itemId -> list of country names
  const [isCheckingStock, setIsCheckingStock] = useState(false);
  const [isPaymentSuccessful, setIsPaymentSuccessful] = useState(false);
  const [showInsufficientModal, setShowInsufficientModal] = useState(false);
  const [showPaymentSuccessModal, setShowPaymentSuccessModal] = useState(false);
  const [showOrderSuccessModal, setShowOrderSuccessModal] = useState(false);
  const [latestOrderNumbers, setLatestOrderNumbers] = useState<string[]>([]);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [showSoldOutError, setShowSoldOutError] = useState(false);
  const [showCountryMismatchModal, setShowCountryMismatchModal] = useState(false);
  const [countryMismatchItems, setCountryMismatchItems] = useState<{ title: string; shipsTo: string[] }[]>([]);
  const [paymentsBlockedCountry, setPaymentsBlockedCountry] = useState<string>('');
  const [isProcessingFinalOrder, setIsProcessingFinalOrder] = useState(false);
  const [finalOrderStats, setFinalOrderStats] = useState({ count: 0, total: 0 });
  const [showCodBlockedModal, setShowCodBlockedModal] = useState(false);
  const [codBlockedItems, setCodBlockedItems] = useState<string[]>([]);
  const [allowedMethodsMap, setAllowedMethodsMap] = useState<Record<number, string[]>>({}); // productId -> allowed methods

  const getShippingFeeForItem = (item: any) => {
    try {
      if (!item?.shipping_info) return 0;

      const parsed = typeof item.shipping_info === 'string'
        ? JSON.parse(item.shipping_info)
        : item.shipping_info;

      if (parsed?.unified) {
        return Number(parsed.charge) || 0;
      }

      const rates = parsed?.rates || parsed?.shipping_rates || [];
      if (!Array.isArray(rates) || rates.length === 0) {
        return 0;
      }

      const activeCountry = (item.selected_shipping_country || userCountry || '').toLowerCase().trim();
      const exactMatch = rates.find((r: any) => r.country?.toLowerCase().trim() === activeCountry);
      if (exactMatch) {
        return Number(exactMatch.charge || exactMatch.price) || 0;
      }

      const globalMatch = rates.find((r: any) =>
        r.country?.toLowerCase().trim().includes('world') ||
        r.country?.toLowerCase().trim().includes('global') ||
        r.isDefault
      );

      return Number(globalMatch?.charge || globalMatch?.price) || 0;
    } catch (err) {
      console.error('Error parsing item.shipping_info', err);
      return 0;
    }
  };


  const flashMaxStock = (itemId: number) => {
    setHitLimitItems(prev => new Set(prev).add(itemId));
    setTimeout(() => {
      setHitLimitItems(prev => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }, 2000);
  };

  const validateShippingCountry = () => {
    const addressCountry = (savedAddress?.country || "None").toLowerCase().trim();

    if (addressCountry === "none") {
      setShowAddressModal(true);
      return false;
    }

    const mismatched: { title: string; shipsTo: string[] }[] = [];

    for (const item of cartItems.filter(i => i.selected !== false)) {
      const selectedChoice = (item.selected_shipping_country || "").toLowerCase().trim();

      // RULE 1: If the user CHOSE a specific country during browsing (SHIPS TO box), 
      // the final address MUST match that choice exactly.
      if (selectedChoice && selectedChoice !== addressCountry) {
        mismatched.push({ title: item.title, shipsTo: [item.selected_shipping_country!] });
        continue;
      }

      // RULE 2: If no specific choice was made (added via generic 'Add to Bag'),
      // check if the product supports the target country.
      const shippingInfo = item.shipping_info;
      if (!shippingInfo) continue;

      try {
        const parsed = typeof shippingInfo === 'string' ? JSON.parse(shippingInfo) : shippingInfo;
        if (parsed?.unified) continue;

        const rates = parsed?.rates || parsed?.shipping_rates || [];
        if (!Array.isArray(rates) || rates.length === 0) continue;

        const countryMatch = rates.find((r: any) =>
          r.country?.toLowerCase().trim() === addressCountry
        );

        if (!countryMatch) {
          const shipsTo = rates.map((r: any) => r.country).filter(Boolean).filter((v: string, i: number, a: string[]) => a.indexOf(v) === i);
          mismatched.push({ title: item.title, shipsTo });
        }
      } catch (e) {
        console.error("Shipping parse error", e);
      }
    }

    if (mismatched.length > 0) {
      setPaymentsBlockedCountry(savedAddress?.country || "This Region");
      setCountryMismatchItems(mismatched);
      setShowCountryMismatchModal(true);
      return false;
    }
    return true;
  };

  const validatePaymentMethods = () => {
    if (paymentMethod !== 'cod') return true;

    const blocked: string[] = [];
    const selectedItems = cartItems.filter(i => i.selected !== false);

    for (const item of selectedItems) {
      // Use real-time data if available, otherwise fallback to item's own data
      const allowedMethods = allowedMethodsMap[item.productId] || item.payment_methods || ['wallet'];
      if (!allowedMethods.includes('cod')) {
        blocked.push(item.title);
      }
    }

    if (blocked.length > 0) {
      setCodBlockedItems(blocked);
      setShowCodBlockedModal(true);
      return false;
    }
    return true;
  };

  const selectedItems = cartItems.filter(i => i.selected !== false);
  const selectedSellerIds = Array.from(
    new Set(
      selectedItems
        .map(item => sellerReadableIds[item.productId] || item.seller_id)
        .filter(Boolean)
    )
  );
  const isSingleSellerCart = selectedSellerIds.length === 1;
  const manualPaymentSellerId = isSingleSellerCart ? selectedSellerIds[0] : null;
  const manualDiscountPercent = selectedTotal > 0 ? ((totalDiscount / selectedTotal) * 100) : 0;
  const manualVerificationDiscountAmount = ((selectedTotal + deliveryTotal) * manualDiscountPercent) / 100;
  const isManualPaymentFlowLocked = paymentMethod === 'wallet_manual' && isManualPaymentCartLocked;
  const isGoogerPaymentFlowLocked = paymentMethod === 'wallet' && isGoogerPaymentCartLocked;
  const isAnyPaymentFlowLocked = isManualPaymentFlowLocked || isGoogerPaymentFlowLocked;
  const payableTotal = selectedTotal + deliveryTotal;

  const persistGoogerPaymentIntent = (transferId: string) => {
    if (typeof window === 'undefined') return;

    localStorage.setItem(GOOGER_PAYMENT_INTENT_STORAGE_KEY, JSON.stringify({
      paymentMethod: 'wallet',
      transferId,
      activeView: 'address',
      paidAt: Date.now(),
    }));
  };

  const clearGoogerPaymentIntent = () => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(GOOGER_PAYMENT_INTENT_STORAGE_KEY);
  };

  const resolveManualPaymentSeller = async () => {
    const selectedProductIds = Array.from(new Set(selectedItems.map(item => item.productId)));

    if (selectedProductIds.length === 0) {
      return null;
    }

    try {
      const productsData = await Promise.all(
        selectedProductIds.map(id => marketService.getItemById(id).catch(() => null))
      );

      const readableIds = productsData
        .filter((product): product is any => product !== null)
        .map(product => getSellerPublicGoogerId(product))
        .filter(Boolean)
        .map(value => String(value));

      const sellerNames = productsData
        .filter((product): product is any => product !== null)
        .map(product => product.username || product.owner_username || product.full_name)
        .filter(Boolean);

      const uniqueReadableIds = Array.from(new Set(readableIds));

      if (uniqueReadableIds.length === 1) {
        const refreshedReadableIds: Record<number, string> = {};
        productsData.forEach((product) => {
          if (!product) return;
          const readableSellerId = getSellerPublicGoogerId(product);
          if (readableSellerId) {
            refreshedReadableIds[product.id] = String(readableSellerId);
          }
        });
        if (Object.keys(refreshedReadableIds).length > 0) {
          setSellerReadableIds(prev => ({ ...prev, ...refreshedReadableIds }));
        }

        return {
          sellerId: uniqueReadableIds[0],
          sellerName: sellerNames[0] ? String(sellerNames[0]) : undefined,
        };
      }
    } catch (error) {
      console.error('Failed to resolve manual payment seller', error);
    }

    if (!manualPaymentSellerId) {
      return null;
    }

    return {
      sellerId: String(manualPaymentSellerId),
      sellerName: undefined,
    };
  };

  const persistManualPaymentIntent = (sellerId: string, sellerName?: string, transactionId = '', verifiedTransferId: string | null = null) => {
    if (typeof window === 'undefined' || !sellerId) return;

    localStorage.setItem(MANUAL_PAYMENT_INTENT_STORAGE_KEY, JSON.stringify({
      sellerId,
      sellerName: sellerName || null,
      transactionId,
      verifiedTransferId,
      amount: Number(payableTotal.toFixed(2)),
      discountPercent: Number(manualDiscountPercent.toFixed(0)),
      createdAt: new Date().toISOString(),
    }));
  };

  const updateManualPaymentIntentTransactionId = (transactionId: string, verifiedTransferId: string | null = null) => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(MANUAL_PAYMENT_INTENT_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed?.sellerId) return;
      persistManualPaymentIntent(String(parsed.sellerId), parsed.sellerName, transactionId, verifiedTransferId);
    } catch (error) {
      console.error('Failed to update manual payment intent', error);
    }
  };

  const clearManualPaymentIntent = () => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(MANUAL_PAYMENT_INTENT_STORAGE_KEY);
  };

  const startManualPaymentFlow = async () => {
    const resolvedSeller = await resolveManualPaymentSeller();
    if (!resolvedSeller?.sellerId) return;

    setPaymentMethod('wallet_manual');
    setManualPaymentStep(2);
    setIsManualPaymentCartLocked(true);
    setManualPaymentVerifiedTransferId(null);
    persistManualPaymentIntent(resolvedSeller.sellerId, resolvedSeller.sellerName, manualTransactionId.trim(), null);
    router.push('/dashboard/wallet/my-wallet');
  };

  const cancelManualPaymentFlow = () => {
    setShowManualPaymentCancelConfirm(false);
    setIsManualPaymentCartLocked(false);
    clearManualPaymentIntent();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(MANUAL_PAYMENT_RESET_EVENT));
    }
    setManualPaymentStep(1);
    setManualTransactionId('');
    setManualPaymentVerifiedTransferId(null);
    setPendingManualVerifyId(null);
    setShowManualVerifyConfirm(false);
    setShowManualVerifySuccessModal(false);
    setManualSellerIdCopied(false);
  };

  const handleWalletPayNow = async () => {
    const amountToPay = payableTotal;

    if (!validateShippingCountry()) {
      setShowCountryMismatchModal(true);
      return;
    }

    try {
      const paymentResult = await walletService.payOrder(amountToPay);
      const transferId = String(paymentResult.transferId);
      setWalletPaymentTransferId(transferId);
      setIsPaymentSuccessful(true);
      setIsGoogerPaymentCartLocked(true);
      persistGoogerPaymentIntent(transferId);
      setActiveView('address');
      setShowPaymentSuccessModal(false);
      setShowWalletPayConfirm(false);
    } catch (err: any) {
      alert(err.message || 'Payment failed');
    }
  };


  const handlePlaceOrder = async (transferId?: string, manualPaymentMeta?: { transactionId?: string; sellerId?: string | null }) => {
    setIsPlacingOrder(true);
    const selectedItems = cartItems.filter(i => i.selected !== false);
    const snapshotCount = selectedCount;
    const snapshotTotal = payableTotal;
    const successfullyOrdered: string[] = [];

    try {
      // Simplified: use a Set to only assign the fee once per seller group
      const assignedGroups = new Set<string>();

      const bulkData = {
        items: selectedItems.map(item => {
          const gid = item.seller_id ? `seller_${item.seller_id}` : `prod_${item.productId}`;
          let itemFee = 0;
          
          if (!assignedGroups.has(gid)) {
            // Find ALL items in this seller group
            const groupItems = selectedItems.filter(si => (si.seller_id ? `seller_${si.seller_id}` : `prod_${si.productId}`) === gid);
            
            // Calculate the MAX shipping fee among all items in this group
            itemFee = Math.max(...groupItems.map((gi) => getShippingFeeForItem(gi)));
            
            assignedGroups.add(gid);
          }

          return {
            item_id: item.productId,
            quantity: item.quantity,
            size: item.size || null,
            color: item.color && item.color !== 'None' ? item.color : null,
            variant_index: item.variantIndex,
            total_price: Number(item.price) * item.quantity,
            shipping_fee: itemFee,
            reseller_ref: item.reseller_ref || getStoredResellRefForProduct(item.productId) || null,
            resell_commission_percentage: item.resell_commission_percentage || 0
          };
        }),
        shipping_address: JSON.stringify({ 
          ...savedAddress, 
          delivery_charge: deliveryTotal,
          total_discount: totalDiscount,
          items_subtotal: selectedTotal,
          ...(paymentMethod === 'wallet_manual' ? {
            manual_payment: {
              seller_id: manualPaymentMeta?.sellerId || null,
              transaction_id: manualPaymentMeta?.transactionId || null,
            }
          } : {})
        }),
        payment_method: paymentMethod || 'wallet',
        total_order_price: payableTotal,
        wallet_transfer_id: transferId
      };

      const result = await orderService.createBulkOrder(bulkData);
      
      // result should be an array of created orders (all sharing same order_number)
      if (Array.isArray(result) && result.length > 0) {
        const orderNumber = result[0].order_number;
        successfullyOrdered.push(orderNumber);
      } else if (result?.order_number) {
        // Single order object returned
        successfullyOrdered.push(result.order_number);
      }

        setLatestOrderNumbers(successfullyOrdered);

      if (successfullyOrdered.length > 0) {
        if (paymentMethod === 'wallet_manual') {
          await Promise.all(selectedItems.map(item => removeFromCart(item.id)));
        } else {
          await clearCart();
        }

        setIsManualPaymentCartLocked(false);
        setIsGoogerPaymentCartLocked(false);
        clearManualPaymentIntent();
        clearGoogerPaymentIntent();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event(MANUAL_PAYMENT_RESET_EVENT));
        }
        setManualPaymentVerifiedTransferId(null);
        setWalletPaymentTransferId(null);
        setPendingManualVerifyId(null);
        setShowManualVerifyConfirm(false);
        setShowManualVerifySuccessModal(false);
        setManualTransactionId('');
        setManualPaymentStep(1);
        setPaymentMethod('cod');
        setManualSellerIdCopied(false);
        setFinalOrderStats({ count: snapshotCount, total: snapshotTotal });
        setShowOrderSuccessModal(true);
        setIsPaymentSuccessful(false);
        setIsCartOpen(false);
      } else {
        alert("No orders were created. Please try again.");
      }
    } catch (err: any) {
      console.error("Failed to place order", err);
      setLatestOrderNumbers(successfullyOrdered);
      alert(`Order placement failed: ${err.message || 'Please try again.'}`);
      // If some succeeded, still show the modal? 
      // User might still want to see the ones that worked.
      if (successfullyOrdered.length > 0) {
        setFinalOrderStats({ count: snapshotCount, total: snapshotTotal });
        setShowOrderSuccessModal(true);
        setIsCartOpen(false);
      }
    } finally {
      setIsPlacingOrder(false);
    }
  };

  useEffect(() => {
    if (!isCartOpen) return;

    // 1. Try Local Storage First (Quick Load)
    const stored = localStorage.getItem('googer-cart-address-1');
    if (stored) {
      try {
        const addr = JSON.parse(stored);
        setSavedAddress(addr);
        if (addr.country) setUserCountry(addr.country);
      } catch (e) {
        console.error("Failed to parse stored address");
      }
    }

    // 2. Try User Profile (Source of Truth)
    if (isCartOpen && authService.isAuthenticated()) {
      authService.getProfile().then(user => {
        if (user?.wallet_balance !== undefined) {
          setUserBalance(Number(user.wallet_balance));
        }
        if (user?.shipping_address) {
          try {
            const addr = typeof user.shipping_address === 'string'
              ? JSON.parse(user.shipping_address)
              : user.shipping_address;
            setSavedAddress(addr);
            if (addr.country) setUserCountry(addr.country);
            localStorage.setItem('googer-cart-address-1', JSON.stringify(addr));
          } catch (e) {
            console.error("Failed to parse profile address", e);
          }
        }
      }).catch(err => {
        console.warn("Could not fetch address from profile", err);
      });
    }

    // 3. Refresh balance specifically for payment flow
    if (isCartOpen && authService.isAuthenticated() && (paymentMethod === 'wallet' || paymentMethod === 'wallet_manual')) {
      authService.getProfile().then(user => {
        if (user?.wallet_balance !== undefined) {
          setUserBalance(Number(user.wallet_balance));
        }
      }).catch(e => console.warn("Balance refresh failed", e));
    }

    // 4. Recheck Stock for all cart items
    if (cartItems.length > 0) {
      recheckStock();
    }
  }, [isCartOpen, paymentMethod, activeView]);

  useEffect(() => {
    if (paymentMethod === 'wallet_manual' && !isSingleSellerCart) {
      setPaymentMethod('cod');
      setManualPaymentStep(1);
      setManualTransactionId('');
      setIsManualPaymentCartLocked(false);
      clearManualPaymentIntent();
    }
  }, [paymentMethod, isSingleSellerCart]);

  // Handle wallet selection and auto-mode popup logic
  useEffect(() => {
    if (paymentMethod === 'wallet' && activeView === 'address') {
      const totalToPay = payableTotal;
      if (userBalance < totalToPay) {
        setShowInsufficientModal(true);
      } else {
        setShowInsufficientModal(false);
      }
    } else {
      setShowInsufficientModal(false);
    }
  }, [paymentMethod, activeView, userBalance, selectedTotal, totalDiscount, deliveryTotal]);

  // Reset payment status if cart items, selection, or total change
  useEffect(() => {
    if (isPaymentSuccessful && !isGoogerPaymentCartLocked) {
      setIsPaymentSuccessful(false);
      setShowPaymentSuccessModal(false);
    }
  }, [cartItems, selectedTotal, isGoogerPaymentCartLocked]);

  useEffect(() => {
    if (isManualPaymentCartLocked || isGoogerPaymentCartLocked) return;
    setManualPaymentStep(1);
    setManualTransactionId('');
    setManualPaymentVerifiedTransferId(null);
    setWalletPaymentTransferId(null);
    setPendingManualVerifyId(null);
    setShowManualVerifyConfirm(false);
    setShowManualVerifySuccessModal(false);
    setManualSellerIdCopied(false);
  }, [selectedCount, selectedTotal, deliveryTotal, totalDiscount, manualPaymentSellerId, isManualPaymentCartLocked, isGoogerPaymentCartLocked]);

  useEffect(() => {
    if (typeof window === 'undefined' || !isManualPaymentCartLocked) return;

    try {
      const storedIntent = localStorage.getItem(MANUAL_PAYMENT_INTENT_STORAGE_KEY);
      if (!storedIntent) return;

      const parsed = JSON.parse(storedIntent);
      setPaymentMethod('wallet_manual');
      setManualPaymentStep(2);
      setManualTransactionId(parsed.transactionId || '');
      setManualPaymentVerifiedTransferId(
        parsed.verifiedTransferId && typeof parsed.verifiedTransferId === 'string'
          ? parsed.verifiedTransferId
          : null
      );
      setActiveView('address');
    } catch (error) {
      console.error('Failed to restore manual payment intent', error);
    }
  }, [isManualPaymentCartLocked]);

  useEffect(() => {
    if (typeof window === 'undefined' || !isGoogerPaymentCartLocked) return;

    try {
      const storedIntent = localStorage.getItem(GOOGER_PAYMENT_INTENT_STORAGE_KEY);
      if (!storedIntent) return;

      const parsed = JSON.parse(storedIntent);
      setPaymentMethod('wallet');
      setWalletPaymentTransferId(parsed.transferId ? String(parsed.transferId) : null);
      setIsPaymentSuccessful(true);
      setActiveView(parsed.activeView === 'cart' ? 'cart' : 'address');
    } catch (error) {
      console.error('Failed to restore Googer payment intent', error);
    }
  }, [isGoogerPaymentCartLocked]);

  const recheckStock = async () => {
    setIsCheckingStock(true);
    const newStatus: Record<number, boolean> = {};
    const newLimits: Record<number, number> = {};

    try {
      // Fetch fresh real-time product data for every unique product in the cart
      const productIds = Array.from(new Set(cartItems.map(item => item.productId)));
      const productsData = await Promise.all(
        productIds.map(id => marketService.getItemById(id).catch(() => null))
      );

      const productsMap = new Map<number, any>(
        productsData
          .filter((p): p is any => p !== null)
          .map(p => [p.id, p])
      );

      // --- Build per-item payment methods map ---
      const newAllowedMethods: Record<number, string[]> = {};
      const nextSellerReadableIds: Record<number, string> = {};
      productsData.forEach(p => {
        if (!p) return;
        let methods = p.payment_methods || p.payment_modes || ['wallet'];
        if (typeof methods === 'string') {
          try { methods = JSON.parse(methods); } catch { methods = ['wallet']; }
        }
        newAllowedMethods[p.id] = Array.isArray(methods) ? methods : ['wallet'];
        const readableSellerId = getSellerPublicGoogerId(p);
        if (readableSellerId) {
          nextSellerReadableIds[p.id] = String(readableSellerId);
        }
      });
      setAllowedMethodsMap(newAllowedMethods);
      setSellerReadableIds(nextSellerReadableIds);

      // Helper: parse any JSON-string or direct value safely
      const safeParse = (val: any, fallback: any) => {
        if (!val) return fallback;
        if (typeof val === 'string') {
          try { return JSON.parse(val); } catch { return fallback; }
        }
        return val;
      };

      // Helper: compute total available stock for a specific size across all variant paths
      const getStockForSize = (variants: any[], size: string | null | undefined, variantIndex: number | null | undefined): number => {
        if (!variants || variants.length === 0) return 0;

        // Path 1: We have a specific variantIndex — look in that variant only
        if (variantIndex !== null && variantIndex !== undefined) {
          const variant = variants[variantIndex];
          if (!variant) return 0;

          if (size) {
            // Try selections array first (most common shape: [{value, stock}])
            const rawSelections = variant.selections;
            const selections: any[] = typeof rawSelections === 'string' ? (() => { try { return JSON.parse(rawSelections) } catch { return [] } })() : (rawSelections || []);
            if (selections.length > 0) {
              const match = selections.find((s: any) =>
                s.value?.toString().toLowerCase().trim() === size.toLowerCase().trim()
              );
              if (match) return Math.max(0, parseInt(match.stock ?? match.quantity ?? '0') || 0);
              // Size not found in this variant's selections → 0 for this item
              return 0;
            }
            // No selections array — check direct variant-level size/stock
            if (variant.size === size || variant.selection === size) {
              return Math.max(0, parseInt(variant.stock ?? variant.quantity ?? '0') || 0);
            }
            return 0;
          } else {
            // No size — check variant-level stock
            const rawSelections = variant.selections;
            const selections: any[] = typeof rawSelections === 'string' ? (() => { try { return JSON.parse(rawSelections) } catch { return [] } })() : (rawSelections || []);
            if (selections.length > 0) {
              return selections.reduce((acc: number, s: any) => acc + (Math.max(0, parseInt(s.stock ?? s.quantity ?? '0') || 0)), 0);
            }
            return Math.max(0, parseInt(variant.stock ?? variant.quantity ?? '0') || 0);
          }
        }

        // Path 2: No variantIndex, but we have a size — search ALL variants for this size
        if (size) {
          let totalForSize = 0;
          let foundSize = false;
          variants.forEach((variant: any) => {
            const rawSelections = variant.selections;
            const selections: any[] = typeof rawSelections === 'string' ? (() => { try { return JSON.parse(rawSelections) } catch { return [] } })() : (rawSelections || []);
            if (selections.length > 0) {
              const match = selections.find((s: any) =>
                s.value?.toString().toLowerCase().trim() === size.toLowerCase().trim()
              );
              if (match) {
                foundSize = true;
                totalForSize += Math.max(0, parseInt(match.stock ?? match.quantity ?? '0') || 0);
              }
            } else if (variant.size === size || variant.selection === size) {
              foundSize = true;
              totalForSize += Math.max(0, parseInt(variant.stock ?? variant.quantity ?? '0') || 0);
            }
          });
          if (foundSize) return totalForSize;
          // Size string exists but wasn't found in any variant → treat as unknown (don't block)
          // Fall through to aggregate
        }

        // Path 3: No variantIndex, no size — sum all variant stocks
        return variants.reduce((acc: number, variant: any) => {
          const rawSelections = variant.selections;
          const selections: any[] = typeof rawSelections === 'string' ? (() => { try { return JSON.parse(rawSelections) } catch { return [] } })() : (rawSelections || []);
          if (selections.length > 0) {
            return acc + selections.reduce((sAcc: number, s: any) =>
              sAcc + (Math.max(0, parseInt(s.stock ?? s.quantity ?? '0') || 0)), 0);
          }
          return acc + (Math.max(0, parseInt(variant.stock ?? variant.quantity ?? '0') || 0));
        }, 0);
      };

      cartItems.forEach(item => {
        const product = productsMap.get(item.productId);

        // Product not found in DB at all (deleted) → mark sold out
        if (!product) {
          newStatus[item.id] = true;
          return;
        }

        const variants: any[] = safeParse(product.variants, []);

        let availableStock = 0;

        if (variants.length > 0) {
          // Real-time stock from variants data (source of truth)
          availableStock = getStockForSize(variants, item.size, item.variantIndex);
        } else {
          // No variants array — fall back to the product-level stock column
          // This handles simple products without size/color variants
          availableStock = Math.max(0, parseInt(product.stock ?? '0') || 0);
        }

        // Mark as sold out only when stock is definitively 0
        newStatus[item.id] = availableStock <= 0;
        newLimits[item.id] = availableStock;
      });

      setStockStatus(newStatus);
      setStockLimits(newLimits);

      // --- Build per-item shipping country lists ---
      const newShippingCountries: Record<number, string[]> = {};
      cartItems.forEach(item => {
        const product = productsMap.get(item.productId);
        if (!product) return;
        try {
          const si = product.shipping_info || product.shipping_data;
          if (!si) return;
          const parsed = typeof si === 'string' ? JSON.parse(si) : si;
          if (parsed?.unified) {
            newShippingCountries[item.id] = ['Worldwide'];
            return;
          }
          const rates = parsed?.rates || parsed?.shipping_rates || [];
          if (Array.isArray(rates) && rates.length > 0) {
            newShippingCountries[item.id] = rates
              .map((r: any) => r.country)
              .filter(Boolean)
              .filter((v: string, i: number, a: string[]) => a.indexOf(v) === i);
          }
        } catch (e) { /* ignore parse errors */ }
      });
      setItemShippingCountries(newShippingCountries);
    } catch (e) {
      console.error('Stock recheck failed:', e);
      // On error, DON'T mark anything as sold out — leave current status unchanged
    } finally {
      setIsCheckingStock(false);
    }
  };

  // Keep component mounted if cart is open OR if any status modal is showing
  if (!isCartOpen && !showOrderSuccessModal && !showCountryMismatchModal && !showSoldOutError) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex justify-end pointer-events-none">
      {/* Backdrop: transparent, no blur, no click capture — user can navigate freely */}
      <div className="absolute inset-0" />

      {/* Sidebar: re-enable pointer events only on the panel itself */}
      <div className="relative w-full max-w-[400px] bg-[#0A0A0A] h-full shadow-2xl border-l border-white/10 flex flex-col animate-in slide-in-from-right duration-500 ease-out pointer-events-auto">

        {/* Top Navigation Bar (Premium Sheet Style) */}
        <div className="px-5 py-3 shrink-0 border-b border-white/[0.05] bg-black/20 backdrop-blur-md sticky top-0 z-50 flex items-center justify-between gap-4">
          <div className="relative flex items-center bg-white/[0.03] rounded-xl p-0.5 gap-0.5 border border-white/[0.05] w-[210px] shrink-0">
            {/* Sliding Indicator */}
            <div
              className={`absolute top-0.5 left-0.5 bottom-0.5 w-[calc(50%-2px)] bg-white/10 rounded-[10px] transition-all duration-500 ease-out shadow-lg shadow-black/20 border border-white/10 ${activeView === 'address' ? 'translate-x-full' : 'translate-x-0'
                }`}
            />

            {[
              { type: 'cart', label: 'Cart' },
              { type: 'address', label: 'Address' },
            ].map((tab) => {
              const active = tab.type === activeView;
              const typeKey = tab.type as keyof typeof SVG_MAP;
              return (
                <button
                  key={tab.type}
                  onClick={() => {
                    if (isAnyPaymentFlowLocked && tab.type === 'cart') {
                      return;
                    }
                    // Only allow switching to Cart view from Address, 
                    // or staying in the same view.
                    // Moving to 'address' MUST go through the Checkout button.
                    if (tab.type === 'cart') {
                      setActiveView('cart');
                    }
                  }}
                  className="flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-lg transition-all duration-300 active:scale-95 group relative z-10"
                >
                  <div className={`transition-all duration-500 ${active ? "text-white scale-90 opacity-100" : "text-white/20"}`}>
                    <div className="scale-[0.65]">
                      {SVG_MAP[typeKey]}
                    </div>
                  </div>
                  <span className={`text-[6.5px] font-black uppercase tracking-[0.05em] transition-all duration-500 ${active ? "text-white" : "text-white/20"}`}>
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setIsCartOpen(false)}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all active:scale-90 shrink-0"
          >
            <IonIcon name="close" className="text-base" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">

          {/* Cart View */}
          {activeView === 'cart' && (
            <div className="flex flex-col flex-1 overflow-hidden">
              {/* Vertical Items List (Box UI) */}
              <div className="flex-1 overflow-y-auto px-5 py-6 space-y-4 custom-scrollbar">
                <div className="flex items-center justify-between pb-2 border-b border-white/5">
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${isAllSelected ? 'bg-white border-white' : 'border-white/20 bg-white/5 group-hover:border-white/40'}`}>
                        {isAllSelected && <IonIcon name="checkmark" className="text-black text-[10px]" />}
                      </div>
                      <input type="checkbox" className="hidden" checked={isAllSelected} disabled={isAnyPaymentFlowLocked} onChange={(e) => toggleAllSelection(e.target.checked)} />
                      <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">Select All</span>
                    </label>
                  </div>
                  <span className="text-[9px] font-black text-white/40 uppercase tracking-widest italic">{selectedCount} Selected</span>
                </div>

                {cartItems.length > 0 ? (
                  cartItems.map((item) => (
                    <div key={item.id} className={`group relative flex gap-4 p-3 rounded-2xl transition-all duration-300 border ${item.selected !== false ? 'bg-white/[0.04] border-white/10 shadow-xl' : 'bg-white/[0.02] border-white/5'}`}>
                      {/* Selectable Area */}
                      <div className="flex items-center shrink-0">
                        <label className="cursor-pointer group/check">
                          <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${item.selected !== false ? 'bg-white border-white' : 'border-white/20 bg-white/5'}`}>
                            {item.selected !== false && <IonIcon name="checkmark" className="text-black text-[10px]" />}
                          </div>
                          <input type="checkbox" className="hidden" checked={item.selected !== false} disabled={isAnyPaymentFlowLocked} onChange={() => toggleSelection(item.id)} />
                        </label>
                      </div>

                      {/* Product Image */}
                      <div
                        onClick={() => {
                          if (pathname !== '/dashboard/shop') {
                            localStorage.setItem('open-shop-product-id', item.productId.toString());
                            router.push('/dashboard/shop');
                          } else {
                            window.dispatchEvent(new CustomEvent('open-shop-product-modal', { detail: { productId: item.productId } }));
                          }
                          setIsCartOpen(false);
                        }}
                        className="relative w-16 h-16 rounded-xl overflow-hidden border border-white/10 shrink-0 bg-black cursor-pointer hover:border-white/20 transition-all"
                      >
                        <Image
                          src={item.image_url.startsWith('http') || item.image_url.startsWith('data:') ? item.image_url : `/uploads/${item.image_url.split(/[\\/]/).pop()}`}
                          alt={item.title}
                          fill
                          className="object-cover"
                        />
                        {stockStatus[item.id] && (
                          <div className="absolute inset-0 bg-red-600/60 backdrop-blur-[2px] flex items-center justify-center z-20">
                            <span className="text-[7px] font-black text-white uppercase tracking-tighter rotate-[-15deg] scale-125 drop-shadow-lg">Sold Out</span>
                          </div>
                        )}
                        {!isItemAvailable(item) && (
                          <div className="absolute inset-0 bg-orange-600/60 backdrop-blur-[2px] flex flex-col items-center justify-center p-1 z-10">
                            <IonIcon name="warning-outline" className="text-white text-xs mb-1" />
                            <span className="text-[6px] font-black text-white uppercase tracking-widest text-center leading-tight">No Shipping To {userCountry}</span>
                          </div>
                        )}
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0 flex flex-col justify-between">
                        <div>
                          <div className="flex justify-between items-start">
                            <h4 className="text-[11px] font-black text-white/90 uppercase truncate tracking-tight">{item.title}</h4>
                            <button onClick={() => removeFromCart(item.id)} disabled={isAnyPaymentFlowLocked} className="text-white/20 hover:text-red-500 transition-colors p-1 disabled:opacity-30 disabled:cursor-not-allowed">
                              <IonIcon name="trash-outline" className="text-[14px]" />
                            </button>
                          </div>
                          <div className="flex flex-col gap-0.5 mt-0.5">
                            <span className="text-[8px] font-bold text-white/40 uppercase tracking-widest">
                              Color: <span className="text-white/60">{item.color && item.color !== 'None' ? item.color : 'None'}</span>
                            </span>
                            {item.size && (
                              <span className="text-[8px] font-bold text-white/40 uppercase tracking-widest">
                                Size: <span className="text-white/60">{item.size}</span>
                              </span>
                            )}
                            {/* Shipping countries removed as per issue 02 & 03 */}
                          </div>
                        </div>

                        <div className="flex items-center justify-between mt-2">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center bg-white/5 rounded-lg border border-white/5 p-0.5">
                              <button
                                onClick={() => updateQuantity(item.id, -1)}
                                disabled={isAnyPaymentFlowLocked}
                                className="w-5 h-5 flex items-center justify-center text-white/40 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                              >-</button>
                              <span className="w-6 text-center text-[10px] font-black text-white">{item.quantity}</span>
                              <button
                                onClick={() => {
                                  if (isAnyPaymentFlowLocked) {
                                    return;
                                  }
                                  const limit = stockLimits[item.id];
                                  if (limit !== undefined && limit > 0 && item.quantity >= limit) {
                                    // Already at max — flash the message transiently
                                    flashMaxStock(item.id);
                                    return;
                                  }
                                  updateQuantity(item.id, 1);
                                }}
                                disabled={isAnyPaymentFlowLocked}
                                className={`w-5 h-5 flex items-center justify-center transition-all ${stockLimits[item.id] !== undefined && stockLimits[item.id] > 0 && item.quantity >= stockLimits[item.id]
                                  ? 'text-white/20 cursor-not-allowed'
                                  : 'text-white/40 hover:text-white'
                                  } ${isAnyPaymentFlowLocked ? 'opacity-30 cursor-not-allowed' : ''}`}
                              >+</button>
                            </div>
                            {/* Transient max-stock flash message */}
                            {hitLimitItems.has(item.id) && (
                              <span className="text-[7px] font-black uppercase tracking-widest text-amber-400 leading-none animate-in fade-in slide-in-from-bottom-1 duration-200">
                                Max stock reached
                              </span>
                            )}
                          </div>
                          <div className="flex flex-col items-end">
                            <p className="text-[12px] font-black text-white tracking-tighter">R {Number(item.promo_price || item.price).toFixed(2)}</p>
                            {Number(item.product_discount || 0) > 0 && (
                              <div className="flex flex-col items-end gap-0">
                                <span className="text-[7px] font-black text-emerald-500 uppercase tracking-widest leading-none">-{item.product_discount}% OFF</span>
                                <span className="text-[7px] font-bold text-emerald-400/40 uppercase tracking-tighter italic leading-none">
                                  {((Number(item.price) - Number(item.promo_price || item.price)) * item.quantity) > 0 ? (
                                    <>Saved R {((Number(item.price) - Number(item.promo_price || item.price)) * item.quantity).toFixed(2)}</>
                                  ) : (
                                    <>Seller Staked: R {(Number(item.promo_price || item.price) * (item.product_discount || 0) / 100 * item.quantity).toFixed(2)}</>
                                  )}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="h-full flex flex-col items-center justify-center opacity-20">
                    <IonIcon name="cart-outline" className="text-5xl mb-4" />
                    <p className="text-[11px] font-black uppercase tracking-[0.2em]">Cart is currently empty</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Address & Payment View */}
          {activeView === 'address' && (
            <div className="flex-1 flex flex-col overflow-hidden animate-in slide-in-from-right-4 duration-300">
              <div className="p-4 flex-1 overflow-y-auto custom-scrollbar">
                <h3 className="text-[9px] font-black text-white uppercase tracking-[0.2em] opacity-40 px-1 mb-3 italic">Address & Payments</h3>
                {savedAddress ? (
                  <div className="space-y-4">
                    {/* Compact Saved Address Box */}
                    <div className="p-3 bg-white/[0.04] border border-white/10 rounded-2xl relative group shadow-lg">
                      <button
                        type="button"
                        onClick={(e) => {
                          if (isAnyPaymentFlowLocked) {
                            return;
                          }
                          e.preventDefault();
                          e.stopPropagation();
                          setShowAddressModal(true);
                        }}
                        disabled={isAnyPaymentFlowLocked}
                        className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/5 text-white/40 flex items-center justify-center hover:text-blue-400 transition-all hover:bg-white/10 z-20 shadow-xl border border-white/5 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Edit Delivery Address"
                      >
                        <IonIcon name="create-outline" className="text-xs" />
                      </button>
                      <div className="flex flex-col gap-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 border border-blue-500/20">
                            <IonIcon name="location-sharp" className="text-xs" />
                          </div>
                          <div>
                            <p className="text-[9px] font-black text-white uppercase tracking-wider">{savedAddress.firstName} {savedAddress.lastName}</p>
                            <p className="text-[8px] text-white/40 font-bold uppercase mt-0.5 tracking-[0.1em]">
                              {[savedAddress.phone, savedAddress.phone2].filter(Boolean).join(' / ')}
                            </p>
                          </div>
                        </div>
                        <div className="p-2.5 bg-black/40 rounded-xl border border-white/5 text-[8px] font-bold text-white/40 uppercase leading-normal tracking-[0.05em] shadow-inner">
                          {savedAddress.addressMode === 'single' ? (
                            <div className="whitespace-pre-wrap">{savedAddress.fullAddress}</div>
                          ) : (
                            <>
                              {savedAddress.houseNo}, {savedAddress.street}, {savedAddress.city}<br />
                              {savedAddress.district}, {savedAddress.province}, {savedAddress.country}
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Compact Horizontal Products Section */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white/30 italic">Items to Deliver</span>
                        <div className="flex items-center gap-2">
                          {/* Back to Cart */}
                          <button
                            onClick={() => {
                              if (isAnyPaymentFlowLocked) {
                                return;
                              }
                              setActiveView('cart');
                            }}
                            disabled={isAnyPaymentFlowLocked}
                            className="flex items-center gap-1 text-[7px] font-black uppercase tracking-widest text-blue-400 hover:text-blue-300 transition-colors active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <IonIcon name="arrow-back" className="text-[8px]" />
                            Cart
                          </button>
                          <div className="w-px h-3 bg-white/10" />
                          <button onClick={() => scrollRef.current?.scrollBy({ left: -140, behavior: 'smooth' })} className="w-5 h-5 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all active:scale-90">
                            <IonIcon name="chevron-back" className="text-[8px]" />
                          </button>
                          <button onClick={() => scrollRef.current?.scrollBy({ left: 140, behavior: 'smooth' })} className="w-5 h-5 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all active:scale-90">
                            <IonIcon name="chevron-forward" className="text-[8px]" />
                          </button>
                        </div>
                      </div>

                      <div ref={scrollRef} className="flex gap-2.5 overflow-x-auto pb-1 custom-scrollbar-thin hide-scrollbar snap-x">
                        {cartItems.filter(i => i.selected !== false).map((item) => (
                          <div key={item.id} className="relative w-20 shrink-0 snap-start bg-white/[0.02] border border-white/5 rounded-xl p-2 shadow-md">
                            {/* Remove from delivery (deselect) — item stays in cart */}
                            <button
                              onClick={(e) => {
                                if (isAnyPaymentFlowLocked) {
                                  return;
                                }
                                e.stopPropagation();
                                toggleSelection(item.id);
                              }}
                              disabled={isAnyPaymentFlowLocked}
                              className="absolute -top-1.5 -right-1.5 z-10 w-4 h-4 rounded-full bg-[#1a1a1a] border border-white/20 flex items-center justify-center text-white/50 hover:text-white hover:bg-red-500/20 hover:border-red-500/40 transition-all active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Remove from this order (stays in cart)"
                            >
                              <IonIcon name="close" className="text-[8px]" />
                            </button>
                            <div className="relative w-full aspect-square rounded-lg overflow-hidden mb-1.5 bg-black border border-white/5">
                              <Image
                                src={item.image_url.startsWith('http') || item.image_url.startsWith('data:') ? item.image_url : `/uploads/${item.image_url.split(/[\\/]/).pop()}`}
                                alt={item.title} fill className="object-cover"
                              />
                              {stockStatus[item.id] && (
                                <div className="absolute inset-0 bg-red-500/80 backdrop-blur-sm flex items-center justify-center z-10">
                                  <span className="text-[6px] font-black text-white uppercase tracking-widest leading-none">Sold Out</span>
                                </div>
                              )}
                            </div>
                            <p className="text-[7px] font-black text-white/70 uppercase truncate px-0.5">{item.title}</p>
                            <p className="text-[9px] font-black text-blue-400 mt-0.5 tracking-tighter">R {Number(item.promo_price || item.price).toFixed(2)}</p>
                            {/* Ships To: removed as per issue 03 */}
                          </div>
                        ))}
                        {/* Empty state when all items deselected */}
                        {cartItems.filter(i => i.selected !== false).length === 0 && (
                          <div className="flex flex-col items-center justify-center w-full py-4 gap-2 opacity-30">
                            <IonIcon name="cart-outline" className="text-2xl" />
                            <p className="text-[7px] font-black uppercase tracking-widest">No items selected</p>
                          </div>
                        )}
                      </div>
                    </div>


                    {/* Payment Selection Section */}
                    <div className="space-y-3 pt-4 border-t border-white/5">
                      <h4 className="text-[8px] font-black uppercase tracking-[0.2em] text-white/30 italic px-1">Payment Method</h4>

                      <div className="space-y-2">
                        {[
                          { id: 'wallet', label: 'Googer Payment', icon: 'wallet-outline' },
                          ...(isSingleSellerCart ? [{ id: 'wallet_manual', label: 'Googer Manual Payment', icon: 'card-outline' }] : []),
                          { id: 'cod', label: 'Cash on Delivery', icon: 'bicycle-outline' }
                        ].map((method) => (
                          <div
                            key={method.id}
                            onClick={() => {
                              if (isAnyPaymentFlowLocked) {
                                return;
                              }
                              setPaymentMethod(method.id as any);
                              if (method.id === 'wallet') { setWalletMode('auto'); setWalletAmount(''); }
                              if (method.id === 'wallet_manual') {
                                setWalletMode('manual');
                                setManualPaymentStep(1);
                                setManualTransactionId('');
                              }
                            }}
                            className={`p-2.5 rounded-xl border transition-all flex items-center justify-between group ${isAnyPaymentFlowLocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${paymentMethod === method.id
                              ? 'bg-white/5 border-white/20 shadow-lg'
                              : 'bg-transparent border-white/5 hover:bg-white/[0.02]'
                              }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${paymentMethod === method.id ? 'bg-blue-500/20 text-blue-400' : 'bg-white/5 text-white/20'
                                }`}>
                                <IonIcon name={method.icon} className="text-sm" />
                              </div>
                              <span className={`text-[9px] font-black uppercase tracking-wider transition-colors ${paymentMethod === method.id ? 'text-white' : 'text-white/40'
                                }`}>
                                {method.label}
                              </span>
                            </div>
                            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${paymentMethod === method.id ? 'border-blue-500 bg-blue-500' : 'border-white/10'
                              }`}>
                              {paymentMethod === method.id && <IonIcon name="checkmark" className="text-white text-[10px]" />}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Googer Wallet Configuration UI */}
                      {(paymentMethod === 'wallet' || paymentMethod === 'wallet_manual') && (
                        <div className="animate-in fade-in slide-in-from-top-2 duration-300 mt-4 space-y-3">
                          <div className="p-4 bg-white/[0.03] border border-white/10 rounded-2xl space-y-4">

                            {/* 1. Shared Order Summary */}
                            {paymentMethod === 'wallet' && (
                              <div className="space-y-3 mb-4">
                                {isGoogerPaymentFlowLocked && (
                                  <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2">
                                    <p className="text-[8px] font-black uppercase tracking-[0.14em] text-emerald-300">
                                      Payment Successful
                                    </p>
                                    <p className="text-[8px] text-white/55 mt-1 leading-relaxed">
                                      Googer Payment is completed. Payment method and cart editing are locked until you place the order.
                                    </p>
                                  </div>
                                )}
                                <div className="p-4 bg-black/50 rounded-2xl border border-white/10 flex flex-col gap-1 shadow-2xl">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-black uppercase tracking-[0.1em] text-white/20">Total Amount</span>
                                    <span className="text-xl font-black text-blue-400 tracking-tighter shrink-0">R {(selectedTotal + deliveryTotal).toFixed(2)}</span>
                                  </div>
                                  {totalDiscount > 0 && (
                                    <div className="flex items-center justify-between border-t border-white/[0.05] pt-1.5 mt-0.5">
                                      <span className="text-[8px] font-black uppercase tracking-[0.2em] text-emerald-500/30 italic">Total Discount</span>
                                      <span className="text-[10px] font-black text-emerald-500 tracking-tight">R {totalDiscount.toFixed(2)}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* 2. Manual Input Field — only if in Manual Mode */}
                            {paymentMethod === 'wallet_manual' && (
                              <div className="space-y-2 pt-2 mb-4 animate-in fade-in slide-in-from-top-1 duration-300">
                                <div className="rounded-2xl border border-white/10 bg-black/40 p-4 space-y-3">
                                  {isManualPaymentFlowLocked && (
                                    <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2">
                                      <p className="text-[8px] font-black uppercase tracking-[0.14em] text-amber-300">
                                        Cart locked for manual payment
                                      </p>
                                      <p className="text-[8px] text-white/55 mt-1 leading-relaxed">
                                        Finish the wallet transfer for this seller or cancel this manual payment flow to unlock the cart.
                                      </p>
                                    </div>
                                  )}
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="text-[9px] font-black uppercase tracking-[0.12em] text-white/25">Total Amount</span>
                                    <span className="text-[16px] font-black text-white tracking-tight">{(selectedTotal + deliveryTotal).toFixed(2)}</span>
                                  </div>
                                  {totalDiscount > 0 && (
                                    <div className="flex items-center justify-between gap-3">
                                      <span className="text-[9px] font-black uppercase tracking-[0.12em] text-white/25">Total Discount</span>
                                      <span className="text-[12px] font-black text-emerald-400">{manualDiscountPercent.toFixed(0)}%</span>
                                    </div>
                                  )}
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="text-[9px] font-black uppercase tracking-[0.12em] text-white/25">Pay to Seller ID</span>
                                    <div className="flex items-center gap-2">
                                      <span className="text-[12px] font-black text-white">{manualPaymentSellerId || 'N/A'}</span>
                                      {manualPaymentSellerId && (
                                        <button
                                          type="button"
                                          onClick={async () => {
                                            try {
                                              await navigator.clipboard.writeText(String(manualPaymentSellerId));
                                              setManualSellerIdCopied(true);
                                              window.setTimeout(() => setManualSellerIdCopied(false), 1500);
                                            } catch (error) {
                                              console.error('Failed to copy seller ID', error);
                                            }
                                          }}
                                          className="text-[8px] font-black uppercase tracking-[0.12em] text-blue-400 hover:text-blue-300 transition-colors"
                                        >
                                          {manualSellerIdCopied ? 'Copied' : 'Copy'}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  {manualPaymentStep === 2 && (
                                    <div className="space-y-2 pt-1">
                                      <span className="block text-[8px] font-black uppercase tracking-[0.14em] text-white/25">
                                        Enter Transaction ID
                                      </span>
                                      <input
                                        type="text"
                                        value={manualTransactionId}
                                        readOnly={!!manualPaymentVerifiedTransferId}
                                        onChange={(e) => {
                                          if (manualPaymentVerifiedTransferId) {
                                            return;
                                          }
                                          const nextValue = e.target.value;
                                          setManualTransactionId(nextValue);
                                          setManualPaymentVerifiedTransferId(null);
                                          if (isManualPaymentFlowLocked) {
                                            updateManualPaymentIntentTransactionId(nextValue.trim(), null);
                                          }
                                        }}
                                        placeholder="5527252788"
                                        className={`w-full border rounded-xl px-4 py-3 text-white text-[11px] font-black tracking-[0.08em] outline-none transition-all placeholder:text-white/10 ${manualPaymentVerifiedTransferId ? 'bg-white/5 border-emerald-500/20 text-white/70 cursor-not-allowed' : 'bg-black/50 border-white/10 focus:border-red-500/50'}`}
                                      />
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {!isPaymentSuccessful ? (
                              (() => {
                                const amountToPay = payableTotal;
                                const hasEnough = userBalance >= amountToPay && amountToPay > 0;
                                const isReady = paymentMethod === 'wallet';

                                if (paymentMethod === 'wallet_manual') {
                                  return (
                                    <div className="flex flex-col items-center mt-4 space-y-3">
                                      {manualPaymentStep === 1 ? (
                                        <button
                                          onClick={() => startManualPaymentFlow()}
                                          disabled={!manualPaymentSellerId}
                                          className="w-auto px-6 py-2 bg-red-600 text-white rounded-xl text-[9px] font-black uppercase tracking-[0.16em] hover:bg-red-500 transition-all active:scale-95 shadow-xl shadow-red-500/20 disabled:opacity-40"
                                        >
                                          Make Payment
                                        </button>
                                      ) : manualPaymentVerifiedTransferId ? (
                                        <div className="px-4 py-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 text-[9px] font-black uppercase tracking-[0.16em] text-emerald-300">
                                          Payment Successful
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-2 flex-wrap justify-center">
                                          <button
                                            onClick={async () => {
                                              if (manualPaymentVerifiedTransferId) {
                                                return;
                                              }
                                              if (!manualTransactionId.trim()) {
                                                alert('Please enter the transaction ID');
                                                return;
                                              }
                                              const parsedTransferId = manualTransactionId.trim();
                                              if (!/^[a-zA-Z0-9]{6,20}$/.test(parsedTransferId)) {
                                                alert('Please enter a valid manual transaction ID.');
                                                return;
                                              }
                                              try {
                                                const verification = await walletService.verifyManualPaymentHold({
                                                  transactionId: parsedTransferId,
                                                  sellerId: manualPaymentSellerId || '',
                                                  amount: payableTotal,
                                                });
                                                const realTransferId = String(verification.transferId || parsedTransferId);
                                                setPendingManualVerifyId(realTransferId);
                                                updateManualPaymentIntentTransactionId(parsedTransferId, realTransferId);
                                                setShowManualVerifyConfirm(true);
                                              } catch (error: any) {
                                                alert(error?.message || 'Manual payment hold transaction not found');
                                              }
                                            }}
                                            className="w-auto px-6 py-2 bg-red-600 text-white rounded-xl text-[9px] font-black uppercase tracking-[0.16em] hover:bg-red-500 transition-all active:scale-95 shadow-xl shadow-red-500/20"
                                          >
                                            Verify Payment
                                          </button>
                                          {!manualPaymentVerifiedTransferId && (
                                            <button
                                              type="button"
                                              onClick={() => setShowManualPaymentCancelConfirm(true)}
                                              className="w-auto px-5 py-2 bg-white/5 text-white rounded-xl border border-white/10 text-[9px] font-black uppercase tracking-[0.16em] hover:bg-white/10 transition-all active:scale-95"
                                            >
                                              Cancel
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                }

                                if (hasEnough && isReady) {
                                  return (
                                    <div className="flex flex-col items-center mt-4 space-y-3">
                                      {isGoogerPaymentFlowLocked ? (
                                        <div className="px-4 py-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 text-[9px] font-black uppercase tracking-[0.16em] text-emerald-300">
                                          Payment Successful
                                        </div>
                                      ) : (
                                        <button
                                          onClick={() => setShowWalletPayConfirm(true)}
                                          className="w-auto px-8 py-2.5 bg-red-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-500 transition-all active:scale-95 shadow-xl shadow-red-500/20"
                                        >
                                          Pay Now
                                        </button>
                                      )}
                                      {paymentMethod === 'wallet' && (
                                        <div className="flex flex-col items-center gap-0.5">
                                          <span className="text-[7px] font-black uppercase tracking-[0.2em] text-white/40">Current Balance</span>
                                          <span className="text-[10px] font-black text-white/70 tracking-tighter">R {userBalance.toFixed(2)}</span>
                                        </div>
                                      )}
                                    </div>
                                  );
                                } else if (paymentMethod === 'wallet' && amountToPay > userBalance) {
                                  return (
                                    <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-center space-y-3 mt-4">
                                      <div className="flex flex-col gap-1">
                                        <p className="text-[9px] font-black text-red-500 uppercase tracking-widest">Insufficient Funds</p>
                                        <p className="text-[7px] font-bold text-red-400/60 uppercase italic">Missing: R {(amountToPay - userBalance).toFixed(2)}</p>
                                      </div>
                                      <button
                                        onClick={() => {
                                          setShowInsufficientModal(false);
                                          setIsCartOpen(false);
                                          router.push('/dashboard/wallet/topup');
                                        }}
                                        className="w-full py-2 bg-red-500/20 hover:bg-red-500/30 text-red-500 border border-red-500/20 rounded-lg text-[8px] font-black uppercase tracking-[0.15em] transition-all"
                                      >
                                        Top Up Wallet
                                      </button>
                                    </div>
                                  );
                                } else {
                                  return (
                                    <button
                                      disabled
                                      className="w-full py-2 bg-white/5 text-white/10 border border-white/5 rounded-xl text-[9px] font-black uppercase tracking-widest cursor-not-allowed mt-3"
                                    >
                                      Calculating...
                                    </button>
                                  );
                                }
                              })()
                            ) : null}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="h-40 flex flex-col items-center justify-center gap-3 border border-dashed border-white/10 rounded-2xl bg-white/[0.01]">
                    <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
                      <IonIcon name="location-outline" className="text-2xl text-white/10" />
                    </div>
                    <div className="text-center group cursor-pointer" onClick={() => setShowAddressModal(true)}>
                      <p className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em] group-hover:text-white transition-colors">Setup Spot</p>
                      <p className="text-[7px] text-blue-500 font-black uppercase mt-1 tracking-widest animate-pulse transition-all">Tap to set delivery spot</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Payment View */}
          {activeView === 'payment' && (
            <div className="p-4">
              <PaymentView selectedTotal={selectedTotal} deliveryTotal={deliveryTotal} />
            </div>
          )}
        </div>

        {/* Footer (Floating/Static) */}
        {cartItems.length > 0 && (
          <div className="p-6 border-t border-white/10 bg-[#0A0A0A] space-y-4">
            {activeView !== 'address' && (
              <div className="space-y-3">
                <div className="flex justify-between items-center px-1">
                  <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40">Item Subtotal</span>
                  <span className="text-[11px] font-black text-white tracking-tight">R {selectedTotal.toFixed(2)}</span>
                </div>
                {totalDiscount > 0 && (
                  <div className="flex justify-between items-center px-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-500/60">Product Discount (Seller Staked)</span>
                      <span className="px-1.5 py-0.5 bg-emerald-500/10 rounded text-[7px] font-black text-emerald-500 uppercase">
                        {(() => {
                          const pct = selectedTotal > 0 ? (totalDiscount / selectedTotal) * 100 : 0;
                          return pct.toFixed(0);
                        })()}%
                      </span>
                    </div>
                    <span className="text-[11px] font-black text-emerald-500 tracking-tight">R {totalDiscount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center px-1">
                  <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40">Delivery Charge</span>
                  <span className="text-[11px] font-black text-white tracking-tight">
                    {deliveryTotal === 0 ? <span className="text-green-500 font-black">Free</span> : `R ${deliveryTotal.toFixed(2)}`}
                  </span>
                </div>
                <div className="pt-4 border-t border-white/10 flex justify-between items-center">
                  <div className="flex flex-col">
                    <span className="text-[12px] font-black uppercase tracking-[0.1em] text-white italic">Grand Total Payable</span>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-black text-white tracking-tighter">R {(selectedTotal + deliveryTotal).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}

            <button
              disabled={
                selectedCount === 0 ||
                isCheckingStock ||
                isPlacingOrder ||
                (activeView === 'address' && (
                  (
                    paymentMethod === 'wallet'
                      ? (savedAddress && !isPaymentSuccessful)
                      : (paymentMethod === 'wallet_manual' ? !manualPaymentVerifiedTransferId : false)
                  ) ||
                  cartItems.some(item => (item.selected !== false) && stockStatus[item.id])
                ))
              }
              onClick={async () => {
                const hasSelectedSoldOut = cartItems.some(item => (item.selected !== false) && stockStatus[item.id]);

                if (activeView === 'cart') {
                  if (hasSelectedSoldOut) {
                    setShowSoldOutError(true);
                  } else {
                    setActiveView('address');
                  }
                } else if (activeView === 'address') {
                  if (!savedAddress) {
                    setShowAddressModal(true);
                    return;
                  }

                  if (!validateShippingCountry()) {
                    setShowCountryMismatchModal(true);
                    return;
                  }

                  if (!validatePaymentMethods()) {
                    return;
                  }

                  if (paymentMethod === 'wallet_manual') {
                    if (!manualPaymentVerifiedTransferId) {
                      alert('Please verify payment first.');
                      return;
                    }

                    await handlePlaceOrder(manualPaymentVerifiedTransferId, {
                      transactionId: manualPaymentVerifiedTransferId,
                      sellerId: manualPaymentSellerId || null,
                    });
                    return;
                  }

                  if (paymentMethod === 'wallet') {
                    if (!walletPaymentTransferId) {
                      alert('Please complete payment first.');
                      return;
                    }

                    await handlePlaceOrder(walletPaymentTransferId);
                    return;
                  }

                  await handlePlaceOrder();
                }
              }}
              className={`w-full py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-3 transition-all shadow-xl group ${(selectedCount === 0 ||
                isPlacingOrder ||
                (activeView === 'address' && (
                  (
                    paymentMethod === 'wallet'
                      ? (savedAddress && !isPaymentSuccessful)
                      : (paymentMethod === 'wallet_manual' ? !manualPaymentVerifiedTransferId : false)
                  ) ||
                  cartItems.some(item => (item.selected !== false) && stockStatus[item.id])
                )))
                ? 'bg-white/5 text-white/10 cursor-not-allowed border border-white/5'
                : 'bg-white text-black hover:bg-blue-50 active:scale-95'
                } animate-in fade-in zoom-in-95 duration-500`}
            >
              {isPlacingOrder ? (
                <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
              ) : (
                <IonIcon
                  name={activeView === 'address' && savedAddress ? 'checkmark-circle' : 'arrow-forward-circle'}
                  className={`text-lg transition-transform group-hover:translate-x-1 ${selectedCount === 0 ? 'opacity-20' : ''}`}
                />
              )}
              {isPlacingOrder ? 'Processing...' : (activeView === 'cart' ? 'Checkout' : (!savedAddress ? 'Set Address' : 'Place Order'))}
            </button>

            {activeView === 'address' && !savedAddress && selectedCount > 0 && (
              <p className="text-[8px] text-center text-red-500 font-black uppercase tracking-widest animate-pulse">Please add a delivery address to checkout</p>
            )}


          </div>
        )}
      </div>

      {showManualPaymentCancelConfirm && (
        <div className="fixed inset-0 z-[1090] flex items-center justify-center p-4 pointer-events-auto">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setShowManualPaymentCancelConfirm(false)}
          />
          <div className="relative w-full max-w-[340px] rounded-3xl border border-white/10 bg-[#111111] p-5 shadow-2xl">
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white">Cancel Manual Payment</p>
              <p className="text-[11px] text-white/65 leading-relaxed">
                Are you sure you want to cancel? This will unlock the cart and let you edit it again.
              </p>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowManualPaymentCancelConfirm(false)}
                className="px-4 py-2 rounded-xl border border-white/10 bg-white/5 text-white/70 text-[9px] font-black uppercase tracking-[0.14em] hover:bg-white/10 transition-all"
              >
                Keep
              </button>
              <button
                type="button"
                onClick={cancelManualPaymentFlow}
                className="px-4 py-2 rounded-xl bg-red-600 text-white text-[9px] font-black uppercase tracking-[0.14em] hover:bg-red-500 transition-all"
              >
                Confirm Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showManualVerifyConfirm && (
        <div className="fixed inset-0 z-[1095] flex items-center justify-center p-4 pointer-events-auto">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => {
              setShowManualVerifyConfirm(false);
              setPendingManualVerifyId(null);
            }}
          />
          <div className="relative w-full max-w-[360px] rounded-3xl border border-white/10 bg-[#111111] p-5 shadow-2xl">
            <div className="space-y-3">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white">Verify Payment</p>
              <p className="text-[11px] text-white/75 leading-relaxed">
                Are you sure you want to verify this payment?
              </p>
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[9px] font-black uppercase tracking-[0.12em] text-white/35">Total Amount</span>
                  <span className="text-[12px] font-black text-white">R {(selectedTotal + deliveryTotal).toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[9px] font-black uppercase tracking-[0.12em] text-white/35">Discount %</span>
                  <span className="text-[12px] font-black text-emerald-400">{manualDiscountPercent.toFixed(0)}%</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[9px] font-black uppercase tracking-[0.12em] text-white/35">Discount Amount</span>
                  <span className="text-[12px] font-black text-emerald-400">R {manualVerificationDiscountAmount.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[9px] font-black uppercase tracking-[0.12em] text-white/35">Status</span>
                  <span className="text-[12px] font-black text-amber-300">Pending</span>
                </div>
              </div>
            </div>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowManualVerifyConfirm(false);
                  setPendingManualVerifyId(null);
                }}
                className="flex-1 py-3 bg-white/5 text-white rounded-2xl border border-white/10 text-[10px] font-black uppercase tracking-[0.16em] hover:bg-white/10 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!pendingManualVerifyId) return;
                  setManualPaymentVerifiedTransferId(pendingManualVerifyId);
                  if (isManualPaymentFlowLocked) {
                    updateManualPaymentIntentTransactionId(manualTransactionId.trim(), pendingManualVerifyId);
                  }
                  setShowManualVerifyConfirm(false);
                  setPendingManualVerifyId(null);
                  setShowManualVerifySuccessModal(true);
                }}
                className="flex-1 py-3 bg-red-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.16em] hover:bg-red-500 transition-all"
              >
                Yes / Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {showManualVerifySuccessModal && (
        <div className="fixed inset-0 z-[1096] flex items-center justify-center p-4 pointer-events-auto">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setShowManualVerifySuccessModal(false)}
          />
          <div className="relative w-full max-w-[360px] rounded-3xl border border-white/10 bg-[#111111] p-5 shadow-2xl">
            <div className="space-y-3 text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300">Payment Successful</p>
              <p className="text-[11px] text-white/75 leading-relaxed">
                Payment verification was successful. You can now place your order.
              </p>
            </div>
            <div className="mt-5">
              <button
                type="button"
                onClick={() => setShowManualVerifySuccessModal(false)}
                className="w-full py-3 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.16em] hover:bg-emerald-500 transition-all"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {showWalletPayConfirm && (
        <div className="fixed inset-0 z-[1094] flex items-center justify-center p-4 pointer-events-auto">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setShowWalletPayConfirm(false)}
          />
          <div className="relative w-full max-w-[360px] rounded-3xl border border-white/10 bg-[#111111] p-5 shadow-2xl">
            <div className="space-y-3">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white">Confirm Payment</p>
              <p className="text-[11px] text-white/75 leading-relaxed">
                Are you sure you want to make this payment?
              </p>
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[9px] font-black uppercase tracking-[0.12em] text-white/35">Payment Method</span>
                  <span className="text-[12px] font-black text-white">Googer Payment</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[9px] font-black uppercase tracking-[0.12em] text-white/35">Total Amount</span>
                  <span className="text-[12px] font-black text-white">R {(selectedTotal + deliveryTotal).toFixed(2)}</span>
                </div>
              </div>
            </div>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setShowWalletPayConfirm(false)}
                className="flex-1 py-3 bg-white/5 text-white rounded-2xl border border-white/10 text-[10px] font-black uppercase tracking-[0.16em] hover:bg-white/10 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleWalletPayNow}
                className="flex-1 py-3 bg-red-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.16em] hover:bg-red-500 transition-all"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Address Form Popup Overlay */}
      {showAddressModal && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 pointer-events-auto">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowAddressModal(false)} />
          <AddressForm
            savedAddress={savedAddress}
            cartItems={cartItems}
            onSave={async (addr: any) => {
              setSavedAddress(addr);

              // Persist permanently in user profile
              if (authService.isAuthenticated()) {
                try {
                  await authService.updateShippingAddress(addr);
                  console.log("✅ Address saved to profile permanently");
                } catch (e) {
                  console.error("❌ Failed to save address to profile:", e);
                }
              }

              setShowAddressModal(false);
              setActiveView('address');
            }}
            onClose={() => setShowAddressModal(false)}
          />
        </div>
      )}

      {/* Insufficient Balance Error Modal */}
      {showInsufficientModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 pointer-events-auto">
          <div className="absolute inset-0 bg-black/95 backdrop-blur-md animate-in fade-in duration-500" onClick={() => setShowInsufficientModal(false)} />
          <div className="relative w-full max-w-[340px] bg-[#0A0A0A] border border-red-500/30 rounded-[2.5rem] p-8 shadow-2xl animate-in zoom-in-95 duration-300 z-[10001]">
            <div className="flex flex-col items-center text-center space-y-6">
              <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20 relative">
                <IonIcon name="wallet" className="text-3xl text-red-500" />
                <div className="absolute -top-1 -right-1 w-7 h-7 bg-red-600 rounded-full flex items-center justify-center border-4 border-[#0A0A0A]">
                  <IonIcon name="alert" className="text-white text-[10px] font-black" />
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-black text-white uppercase tracking-widest">Balance Error</h3>
                <p className="text-[10px] font-bold text-white/30 uppercase tracking-[0.15em] leading-relaxed">
                  Your Googer Wallet does not have enough funds to authorize this transaction.
                </p>
              </div>

              <div className="w-full space-y-3">
                <div className="p-4 bg-white/[0.03] rounded-2xl border border-white/5 space-y-3">
                  <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest italic">
                    <span className="text-white/20">Current Balance</span>
                    <span className="text-white/60">R {userBalance.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest italic pt-2 border-t border-white/[0.03]">
                    <span className="text-red-500/40">Shortfall</span>
                    <span className="text-red-500">R {((selectedTotal + deliveryTotal) - userBalance).toFixed(2)}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-2 pt-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowInsufficientModal(false);
                      setIsCartOpen(false);
                      router.push('/dashboard/wallet/topup');
                    }}
                    className="w-full py-4 bg-red-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-red-600 transition-all active:scale-95 shadow-xl shadow-red-500/20 relative z-[10002]"
                  >
                    Top Up Wallet Now
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowInsufficientModal(false);
                    }}
                    className="w-full py-4 bg-white/5 text-white/30 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:text-white transition-all outline-none"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Order Success Popup */}
      {showOrderSuccessModal && (
        <div className="fixed inset-0 z-[1400] flex items-center justify-center p-4 pointer-events-auto">
          <div className="absolute inset-0 bg-black/95 backdrop-blur-xl animate-in fade-in duration-500" />
          <div className="relative w-full max-w-[340px] bg-[#0A0A0A] border border-white/10 rounded-[2.5rem] p-8 shadow-2xl animate-in zoom-in-95 duration-500">
            <div className="flex flex-col items-center text-center space-y-6">
              <div className="relative">
                <div className="w-24 h-24 rounded-full bg-blue-500/5 animate-ping absolute inset-0" />
                <div className="w-24 h-24 rounded-full bg-white flex items-center justify-center text-black">
                  <IonIcon name="cube-outline" className="text-4xl" />
                </div>
              </div>
              <div className="space-y-4">
                <h3 className="text-xl font-black text-white uppercase tracking-tighter leading-none">Your order has been placed successfully.</h3>
                <p className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] mt-2 italic">Copy your Order ID for reference</p>
                {latestOrderNumbers.length > 0 && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(latestOrderNumbers[0]);
                      alert('Order ID Copied: ' + latestOrderNumbers[0]);
                    }}
                    className="mt-2 w-full py-3 bg-blue-600/10 border border-blue-500/20 text-blue-400 rounded-2xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all group"
                  >
                    <IonIcon name="copy-outline" className="text-sm group-hover:scale-110 transition-transform" />
                    Copy Order ID: {latestOrderNumbers[0]}
                  </button>
                )}
              </div>
              <div className="space-y-4 w-full">
                <div className="p-5 bg-white/[0.03] rounded-3xl border border-white/5 space-y-3">
                  <div className="flex justify-between items-center text-[9px] font-black uppercase text-white/20 italic tracking-widest">
                    <span>Items Ordered</span>
                    <span className="text-white">{finalOrderStats.count} Items</span>
                  </div>
                  <div className="h-[1px] bg-white/[0.05]" />
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-black uppercase text-white/40 tracking-widest">Total Paid</span>
                    <span className="text-lg font-black text-white tracking-tighter">R {finalOrderStats.total.toFixed(2)}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => {
                      setShowOrderSuccessModal(false);
                      router.push('/dashboard/shop?tab=orders');
                    }}
                    className="w-full py-4 bg-white text-black rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-blue-50 transition-all active:scale-95 shadow-xl"
                  >
                    View My Orders
                  </button>
                  <button
                    onClick={() => {
                      setShowOrderSuccessModal(false);
                      router.push('/dashboard/shop');
                    }}
                    className="w-full py-4 bg-white/5 text-white/40 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:text-white hover:bg-white/10 transition-all"
                  >
                    Continue Shopping
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Country Mismatch Error Modal */}
      {showCountryMismatchModal && (
        <div className="fixed inset-0 z-[2500] flex items-center justify-center p-4 pointer-events-auto">
          <div className="absolute inset-0 bg-black/95 backdrop-blur-md animate-in fade-in duration-300" onClick={() => { setShowCountryMismatchModal(false); setPaymentsBlockedCountry(''); }} />
          <div className="relative w-full max-w-[360px] bg-[#0A0A0A] border border-orange-500/30 rounded-[2.5rem] p-7 shadow-2xl animate-in zoom-in-95 duration-500 max-h-[90vh] overflow-y-auto">
            <div className="flex flex-col items-center text-center space-y-5">
              <div className="w-20 h-20 rounded-full bg-orange-500/10 flex items-center justify-center border border-orange-500/20 relative shrink-0">
                <IonIcon name="globe-outline" className="text-3xl text-orange-400" />
                <div className="absolute -top-1 -right-1 w-7 h-7 bg-orange-500 rounded-full flex items-center justify-center border-4 border-[#0A0A0A]">
                  <IonIcon name="alert" className="text-white text-[10px] font-black" />
                </div>
              </div>

              <div className="space-y-1">
                <h3 className="text-base font-black text-white uppercase tracking-widest leading-none">Payment Blocked</h3>
                <p className="text-[9px] font-bold text-orange-400/80 uppercase tracking-tight leading-relaxed">
                  Some products in your cart cannot be delivered to <span className="text-orange-400 font-black">{paymentsBlockedCountry}</span>.
                </p>
              </div>

              {/* Per-product error list */}
              <div className="w-full space-y-2.5 text-left">
                <p className="text-[10px] font-bold text-orange-400 uppercase tracking-wide px-1">
                  This product is not available for delivery to your selected country. Please change your address.
                </p>
                {countryMismatchItems.map((entry, i) => (
                  <div key={i} className="p-3.5 bg-orange-500/[0.06] border border-orange-500/20 rounded-2xl space-y-2">
                    {/* Error headline */}
                    <p className="text-[8px] font-black text-orange-300/90 uppercase tracking-widest leading-none">
                      Shipping Restricted: <span className="text-orange-400">{paymentsBlockedCountry}</span>
                    </p>
                    {/* Product name */}
                    <div className="flex items-start gap-2">
                      <IonIcon name="close-circle" className="text-orange-500 text-sm shrink-0 mt-0.5" />
                      <span className="text-[10px] font-black text-white/80 uppercase tracking-wide leading-tight">Product: {entry.title}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-2 w-full pt-1">
                <button
                  onClick={() => {
                    setPaymentsBlockedCountry('');
                    setShowCountryMismatchModal(false);
                    setShowAddressModal(true);
                    setActiveView('address');
                  }}
                  className="w-full py-4 bg-white text-black rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-orange-50 transition-all active:scale-95 shadow-xl"
                >
                  Change Address
                </button>
                <button
                  onClick={() => {
                    setPaymentsBlockedCountry('');
                    setShowCountryMismatchModal(false);
                    setActiveView('cart');
                  }}
                  className="w-full py-3 bg-white/5 text-white/40 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:text-white hover:bg-white/10 transition-all"
                >
                  Edit Cart
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sold Out Error Modal */}
      {showSoldOutError && (
        <div className="fixed inset-0 z-[2500] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/95 backdrop-blur-md animate-in fade-in duration-300" onClick={() => setShowSoldOutError(false)} />
          <div className="relative w-full max-w-[340px] bg-[#0A0A0A] border border-red-500/30 rounded-[2.5rem] p-8 shadow-2xl animate-in zoom-in-95 duration-500">
            <div className="flex flex-col items-center text-center space-y-6">
              <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20 relative">
                <IonIcon name="cart-outline" className="text-3xl text-red-500" />
                <div className="absolute -top-1 -right-1 w-7 h-7 bg-red-600 rounded-full flex items-center justify-center border-4 border-[#0A0A0A]">
                  <IonIcon name="close" className="text-white text-[10px] font-black" />
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-black text-white uppercase tracking-widest leading-none">Checkout Blocked</h3>
                <p className="text-[10px] font-bold text-red-500/60 uppercase tracking-[0.15em]">Items Sold Out</p>
              </div>

              <p className="text-[10px] font-bold text-white/30 uppercase tracking-[0.15em] leading-relaxed">
                Some selected items are currently out of stock. You must remove or deselect them <span className="text-white/60">before proceeding</span> to delivery details.
              </p>

              <div className="flex flex-col gap-3 w-full">
                <button
                  onClick={() => setShowSoldOutError(false)}
                  className="w-full py-4 bg-white text-black rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-slate-100 transition-all active:scale-95 shadow-xl shadow-red-500/10"
                >
                  Return to Cart
                </button>
                <button
                  onClick={() => {
                    setShowSoldOutError(false);
                    setIsCartOpen(false);
                  }}
                  className="w-full py-4 bg-white/5 border border-white/10 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-white/10 transition-all active:scale-95"
                >
                  Return to Market
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* COD Blocked Modal */}
      {showCodBlockedModal && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 pointer-events-auto">
          <div className="absolute inset-0 bg-black/95 backdrop-blur-md animate-in fade-in duration-300" onClick={() => setShowCodBlockedModal(false)} />
          <div className="relative w-full max-w-[340px] bg-[#0A0A0A] border border-red-500/30 rounded-[2.5rem] p-8 shadow-2xl animate-in zoom-in-95 duration-500">
            <div className="flex flex-col items-center text-center space-y-6">
              <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20 relative">
                <IonIcon name="cash-outline" className="text-3xl text-red-500" />
                <div className="absolute -top-1 -right-1 w-7 h-7 bg-red-600 rounded-full flex items-center justify-center border-4 border-[#0A0A0A]">
                  <IonIcon name="close" className="text-white text-[10px] font-black" />
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-black text-white uppercase tracking-widest leading-none">Payment Error</h3>
                <p className="text-[10px] font-bold text-red-500/60 uppercase tracking-[0.15em]">COD Not Available</p>
              </div>

              <div className="w-full space-y-2 text-left bg-white/[0.03] p-4 rounded-2xl border border-white/5 max-h-[150px] overflow-y-auto custom-scrollbar">
                {codBlockedItems.map((title, i) => (
                  <div key={i} className="flex gap-2 items-start py-1 border-b border-white/[0.03] last:border-0">
                    <IonIcon name="alert-circle" className="text-red-500 text-xs mt-0.5 shrink-0" />
                    <p className="text-[9px] font-black text-white/70 uppercase tracking-tight leading-relaxed">
                      This product is not available for Cash on Delivery: <span className="text-white font-black">{title}</span>
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-2 w-full">
                <button
                  onClick={() => setShowCodBlockedModal(false)}
                  className="w-full py-4 bg-white text-black rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-gray-100 transition-all active:scale-95 shadow-xl shadow-red-500/10"
                >
                  Change Payment Method
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// Payment Methods View Implementation
function PaymentView({ selectedTotal: originalSelectedTotal, deliveryTotal }: any) {
  const [paymentMethod, setPaymentMethod] = useState<'wallet' | 'balance' | 'cod' | null>(null);
  const [walletMode, setWalletMode] = useState<'auto' | 'manual' | null>(null);
  const [deductionAmount, setDeductionAmount] = useState<string>("");

  return (
    <div className="space-y-4 animate-in slide-in-from-right-4 duration-300 pb-10">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-[11px] font-black text-white uppercase tracking-[0.2em] opacity-40 italic">Payment Select</h3>
      </div>
      <div className="space-y-3">
        {[
          { id: 'wallet', title: 'Googer Wallet', icon: 'wallet', desc: 'Secure Digital Vault' },
          { id: 'balance', title: 'Googer Balance', icon: 'flash', desc: 'Direct Settlement' },
          { id: 'cod', title: 'Cash on Delivery', icon: 'cube', desc: 'Pay when delivered' },
        ].map((m) => (
          <div
            key={m.id}
            onClick={() => {
              setPaymentMethod(m.id as any);
              if (m.id !== 'wallet') setWalletMode(null);
            }}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${paymentMethod === m.id ? 'bg-blue-500/10 border-blue-500 shadow-lg shadow-blue-500/10' : 'bg-white/[0.02] border-white/10 hover:border-white/20'}`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg ${paymentMethod === m.id ? 'bg-blue-500 text-white' : 'bg-white/5 text-white/20'}`}>
                <IonIcon name={m.icon} className="text-base" />
              </div>
              <div>
                <p className="text-[10px] font-black text-white uppercase tracking-widest">{m.title}</p>
                <p className="text-[8px] text-white/30 font-bold uppercase mt-0.5">{m.desc}</p>
              </div>
            </div>
            <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${paymentMethod === m.id ? 'bg-blue-500 border-blue-500' : 'border-white/10 bg-black/40'}`}>
              {paymentMethod === m.id && <IonIcon name="checkmark" className="text-white text-[8px]" />}
            </div>
          </div>
        ))}
      </div>

      {/* Dynamic Wallet Configuration Section */}
      {paymentMethod === 'wallet' && (
        <div className="mt-6 p-4 bg-white/[0.03] border border-white/10 rounded-3xl animate-in fade-in zoom-in-95 duration-300">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[9px] font-black text-white/40 uppercase tracking-widest italic">Googer Wallet Config</span>
            <div className="flex gap-2">
              <button
                onClick={() => setWalletMode('auto')}
                className={`px-3 py-1.5 rounded-lg text-[8px] font-black uppercase transition-all ${walletMode === 'auto' ? 'bg-blue-500 text-white shadow-lg' : 'bg-white/5 text-white/30 hover:bg-white/10'}`}
              >
                Auto
              </button>
              <button
                onClick={() => setWalletMode('manual')}
                className={`px-3 py-1.5 rounded-lg text-[8px] font-black uppercase transition-all ${walletMode === 'manual' ? 'bg-blue-500 text-white shadow-lg' : 'bg-white/5 text-white/30 hover:bg-white/10'}`}
              >
                Manual
              </button>
            </div>
          </div>

          {walletMode === 'auto' && (
            <div className="space-y-3 animate-in slide-in-from-top-2 duration-300">
              <div className="flex flex-col gap-2">
                <label className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em] ml-1">Pay My Googer Balance</label>
                <div className="relative">
                  <input
                    type="number" placeholder="Enter Amount" value={deductionAmount}
                    onChange={(e) => setDeductionAmount(e.target.value)}
                    className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-2.5 text-[10px] font-black text-white uppercase outline-none focus:border-blue-500/30 transition-all placeholder:text-white/10"
                  />
                  <span className="absolute right-4 top-2.5 text-[8px] font-black text-white/20 uppercase">Amount</span>
                </div>
              </div>
              <p className="text-[8px] text-blue-400 font-bold uppercase tracking-widest px-1 italic">Deducts directly from your current settlement.</p>
            </div>
          )}

          {walletMode === 'manual' && (
            <div className="p-4 bg-black/40 rounded-2xl border border-white/5 flex justify-between items-center animate-in slide-in-from-top-2 duration-300">
              <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">Payment Amount</span>
              <span className="text-[14px] font-black text-white tracking-tighter">R {(originalSelectedTotal + deliveryTotal).toFixed(2)}</span>
            </div>
          )}

          {!walletMode && (
            <p className="text-[8px] text-white/20 font-bold uppercase text-center py-4 italic">Please select a Wallet mode to continue.</p>
          )}
        </div>
      )}

      {paymentMethod && paymentMethod !== 'wallet' && (
        <p className="text-[8px] text-white/20 font-bold uppercase tracking-[0.15em] text-center italic mt-6 px-4 leading-relaxed animate-in fade-in duration-300">
          Proceed to the final step. Your selected {paymentMethod.toUpperCase()} will be used for calculation.
        </p>
      )}
    </div>
  );
}

// Subcomponent for Address Form
function AddressForm({ savedAddress, onSave, onClose, cartItems }: any) {
  const selectedItems = (cartItems || []).filter((i: any) => i.selected !== false);

  // Calculate final restricted set
  const restrictedCodes = React.useMemo<string[] | null>(() => {
    let intersect: string[] | null = null;
    selectedItems.forEach((item: any) => {
      try {
        const info = typeof item.shipping_info === 'string' ? JSON.parse(item.shipping_info) : item.shipping_info;
        if (info?.type === 'restricted' && Array.isArray(info.countries)) {
          if (intersect === null) {
            intersect = [...info.countries];
          } else {
            intersect = intersect.filter(c => info.countries.includes(c));
          }
        }
      } catch (e) { }
    });
    return intersect;
  }, [selectedItems]);

  const [formData, setFormData] = useState(savedAddress || {
    firstName: '',
    lastName: '',
    addressMode: 'detailed', // 'single' or 'detailed'
    fullAddress: '',
    country: 'Sri Lanka',
    countryCode: 'lk',
    province: '',
    district: '',
    city: '',
    houseNo: '',
    street: '',
    buildingNo: '',
    phone: '',
    phone2: '',
    terms: false
  });

  const [countries, setCountries] = useState<{ code: string; name: string }[]>([]);
  const [countrySearch, setCountrySearch] = useState("");
  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false);

  useEffect(() => {
    // Fetch countries from FlagCDN
    fetch("https://flagcdn.com/en/codes.json")
      .then(res => res.json())
      .then(data => {
        // Convert object to array and filter for standard countries (2-letter codes)
        let countryList = Object.entries(data)
          .filter(([code]) => code.length === 2)
          .map(([code, name]) => ({ code, name: name as string }))
          .sort((a, b) => a.name.localeCompare(b.name));

        // Filter based on product restrictions
        if (restrictedCodes && Array.isArray(restrictedCodes)) {
          countryList = countryList.filter(c =>
            (restrictedCodes as string[]).includes(c.name) ||
            (restrictedCodes as string[]).includes(c.code.toUpperCase())
          );
        }

        setCountries(countryList);

        // If it's a new form, set default country code for Sri Lanka
        if (!savedAddress && !formData.countryCode) {
          const lk = countryList.find(c => c.name === "Sri Lanka");
          if (lk) setFormData((prev: any) => ({ ...prev, countryCode: lk.code }));
        }
      })
      .catch(err => console.error("Error fetching countries:", err));
  }, []);

  useEffect(() => {
    if (!savedAddress) {
      const profile = localStorage.getItem('googer-user-profile');
      if (profile) {
        try {
          const { firstName, lastName } = JSON.parse(profile);
          setFormData((prev: any) => ({
            ...prev,
            firstName: prev.firstName || firstName || '',
            lastName: prev.lastName || lastName || ''
          }));
        } catch (e) { }
      }
    }
  }, [savedAddress]);

  const slProvinces: Record<string, string[]> = {
    "Western": ["Colombo", "Gampaha", "Kalutara"],
    "Central": ["Kandy", "Matale", "Nuwara Eliya"],
    "Southern": ["Galle", "Matara", "Hambantota"],
    "North Western": ["Kurunegala", "Puttalam"],
    "Sabaragamuwa": ["Ratnapura", "Kegalle"],
    "Eastern": ["Trincomalee", "Batticaloa", "Ampara"],
    "North Central": ["Anuradhapura", "Polonnaruwa"],
    "Uva": ["Badulla", "Monaragala"],
    "Northern": ["Jaffna", "Kilinochchi", "Mannar", "Vavuniya", "Mullaitivu"]
  };

  const filteredCountries = countries.filter(c =>
    c.name.toLowerCase().includes(countrySearch.toLowerCase())
  );

  return (
    <div className="relative w-full max-w-[420px] bg-[#0A0A0A] border border-white/10 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300">
      <div className="p-6 border-b border-white/5 bg-black/40 flex justify-between items-center backdrop-blur-md">
        <div>
          <h3 className="text-sm font-black text-white uppercase tracking-[0.2em] mb-0.5 italic">Delivery Pad</h3>
          <p className="text-[9px] text-white/30 uppercase font-black tracking-widest">Set your spot</p>
        </div>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white transition-all active:scale-90">
          <IonIcon name="close" className="text-xs" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 custom-scrollbar space-y-5">
        {/* Mode Selector */}
        <div className="flex bg-white/5 p-1 rounded-2xl border border-white/10">
          <button
            onClick={() => setFormData({ ...formData, addressMode: 'detailed' })}
            className={`flex-1 py-2 text-[8px] font-black uppercase tracking-widest rounded-xl transition-all ${formData.addressMode === 'detailed' ? 'bg-white text-black shadow-lg' : 'text-white/40 hover:text-white'}`}
          >
            Detailed Fields
          </button>
          <button
            onClick={() => setFormData({ ...formData, addressMode: 'single' })}
            className={`flex-1 py-2 text-[8px] font-black uppercase tracking-widest rounded-xl transition-all ${formData.addressMode === 'single' ? 'bg-white text-black shadow-lg' : 'text-white/40 hover:text-white'}`}
          >
            Single Textbox
          </button>
        </div>

        {formData.addressMode === 'single' ? (
          <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
            {/* Country Selector */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsCountryDropdownOpen(!isCountryDropdownOpen)}
                className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-[10px] font-bold text-white flex justify-between items-center text-left hover:bg-white/[0.06] transition-all"
              >
                <div className="flex items-center gap-2 truncate">
                  {formData.countryCode && (
                    <img
                      src={`https://flagcdn.com/w20/${formData.countryCode}.png`}
                      width="16"
                      alt={formData.country}
                      className="rounded-sm opacity-80"
                    />
                  )}
                  <span className="truncate">{formData.country}</span>
                </div>
                <IonIcon name="chevron-down" className="text-[10px] opacity-20" />
              </button>

              {isCountryDropdownOpen && (
                <div className="absolute top-full left-0 w-full mt-2 bg-[#141414] border border-white/10 rounded-2xl shadow-2xl z-[1200] p-2 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="relative mb-2">
                    <input
                      type="text" placeholder="Search Country..." value={countrySearch}
                      onChange={(e) => setCountrySearch(e.target.value)}
                      className="w-full bg-white/5 border border-white/5 rounded-xl px-9 py-2 text-[10px] text-white outline-none focus:bg-white/10 transition-all placeholder:text-white/20"
                    />
                    <IonIcon name="search" className="absolute left-3.5 top-2.5 text-white/20 text-[10px]" />
                  </div>
                  <div className="max-h-48 overflow-y-auto custom-scrollbar-thin px-1">
                    {filteredCountries.map(c => (
                      <button
                        key={c.code}
                        onClick={() => {
                          setFormData({ ...formData, country: c.name, countryCode: c.code });
                          setIsCountryDropdownOpen(false);
                          setCountrySearch("");
                        }}
                        className="w-full text-left px-4 py-2.5 text-[10px] text-white/50 hover:bg-white/10 hover:text-white rounded-xl uppercase font-black transition-all flex items-center gap-3 mb-1 group"
                      >
                        <img
                          src={`https://flagcdn.com/w20/${c.code}.png`}
                          width="16"
                          alt={c.name}
                          className="rounded-sm shadow-sm group-hover:scale-110 transition-transform"
                        />
                        <span>{c.name}</span>
                      </button>
                    ))}
                    {filteredCountries.length === 0 && (
                      <p className="text-center py-4 text-[9px] font-black text-white/20 uppercase tracking-widest italic">No matches found</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <input
                type="text" list="provinces-single" placeholder="Province" value={formData.province}
                onChange={(e) => setFormData({ ...formData, province: e.target.value, district: '' })}
                className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-[10px] font-bold text-white uppercase focus:outline-none focus:border-blue-500/30 transition-all placeholder:text-white/10"
              />
              {formData.country === 'Sri Lanka' && (
                <datalist id="provinces-single">
                  {Object.keys(slProvinces).map(p => <option key={p} value={p} />)}
                </datalist>
              )}
              <input
                type="text" list="districts-single" placeholder="District" value={formData.district}
                onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-[10px] font-bold text-white uppercase focus:outline-none focus:border-blue-500/30 transition-all placeholder:text-white/10"
              />
              {formData.country === 'Sri Lanka' && formData.province && (
                <datalist id="districts-single">
                  {slProvinces[formData.province]?.map(d => <option key={d} value={d} />)}
                </datalist>
              )}
            </div>

            <input type="text" placeholder="City" value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-[10px] font-bold text-white uppercase focus:outline-none focus:border-blue-500/30 placeholder:text-white/10 transition-all" />

            <div className="flex flex-col gap-1.5 pt-1">
              <label className="text-[7px] font-black text-white/20 uppercase tracking-[0.2em] ml-1">Full Delivery Address</label>
              <textarea
                placeholder="House No, Street, Building etc..."
                value={formData.fullAddress}
                onChange={(e) => setFormData({ ...formData, fullAddress: e.target.value })}
                className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-4 py-2.5 text-[10px] font-bold text-white uppercase focus:outline-none focus:border-blue-500/30 transition-all placeholder:text-white/10 min-h-[46px] resize-none"
              ></textarea>
            </div>
          </div>
        ) : (
          <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
            {/* Step 1: Location Details */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsCountryDropdownOpen(!isCountryDropdownOpen)}
                className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-[10px] font-bold text-white flex justify-between items-center text-left hover:bg-white/[0.06] transition-all"
              >
                <div className="flex items-center gap-2 truncate">
                  {formData.countryCode && (
                    <img
                      src={`https://flagcdn.com/w20/${formData.countryCode}.png`}
                      width="16"
                      alt={formData.country}
                      className="rounded-sm opacity-80"
                    />
                  )}
                  <span className="truncate">{formData.country}</span>
                </div>
                <IonIcon name="chevron-down" className="text-[10px] opacity-20" />
              </button>

              {isCountryDropdownOpen && (
                <div className="absolute top-full left-0 w-full mt-2 bg-[#141414] border border-white/10 rounded-2xl shadow-2xl z-[1200] p-2 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="relative mb-2 pointer-events-auto z-50">
                    <input
                      type="text" placeholder="Search Country..." value={countrySearch}
                      onChange={(e) => setCountrySearch(e.target.value)}
                      className="w-full bg-white/5 border border-white/5 rounded-xl px-9 py-2 text-[10px] text-white outline-none focus:bg-white/10 transition-all placeholder:text-white/20 pointer-events-auto"
                    />
                    <IonIcon name="search" className="absolute left-3.5 top-2.5 text-white/20 text-[10px]" />
                  </div>
                  <div className="max-h-48 overflow-y-auto custom-scrollbar-thin px-1 pointer-events-auto">
                    {filteredCountries.map(c => (
                      <button
                        key={c.code}
                        onClick={() => {
                          setFormData({ ...formData, country: c.name, countryCode: c.code });
                          setIsCountryDropdownOpen(false);
                          setCountrySearch("");
                        }}
                        className="w-full text-left px-4 py-2.5 text-[10px] text-white/50 hover:bg-white/10 hover:text-white rounded-xl uppercase font-black transition-all flex items-center gap-3 mb-1 group pointer-events-auto"
                      >
                        <img
                          src={`https://flagcdn.com/w20/${c.code}.png`}
                          width="16"
                          alt={c.name}
                          className="rounded-sm shadow-sm group-hover:scale-110 transition-transform"
                        />
                        <span>{c.name}</span>
                      </button>
                    ))}
                    {filteredCountries.length === 0 && (
                      <p className="text-center py-4 text-[9px] font-black text-white/20 uppercase tracking-widest italic">No matches found</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 relative z-10">
              <div className="space-y-1">
                <input
                  type="text" list="provinces" placeholder="Province" value={formData.province}
                  onChange={(e) => setFormData({ ...formData, province: e.target.value, district: '' })}
                  className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-[10px] font-bold text-white uppercase focus:outline-none focus:border-blue-500/30 transition-all placeholder:text-white/10"
                />
                {formData.country === 'Sri Lanka' && (
                  <datalist id="provinces">
                    {Object.keys(slProvinces).map(p => <option key={p} value={p} />)}
                  </datalist>
                )}
              </div>
              <div className="space-y-1">
                <input
                  type="text" list="districts" placeholder="District" value={formData.district}
                  onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                  className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-[10px] font-bold text-white uppercase focus:outline-none focus:border-blue-500/30 transition-all placeholder:text-white/10"
                />
                {formData.country === 'Sri Lanka' && formData.province && (
                  <datalist id="districts">
                    {slProvinces[formData.province]?.map(d => <option key={d} value={d} />)}
                  </datalist>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 relative z-10">
              <input type="text" placeholder="City" value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-[10px] font-bold text-white uppercase focus:outline-none focus:border-blue-500/30 placeholder:text-white/10 transition-all" />
              <input type="text" placeholder="House No" value={formData.houseNo} onChange={(e) => setFormData({ ...formData, houseNo: e.target.value })} className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-[10px] font-bold text-white uppercase focus:outline-none focus:border-blue-500/30 placeholder:text-white/10 transition-all" />
            </div>

            <div className="grid grid-cols-1 gap-3 relative z-10">
              <input type="text" placeholder="Street Name" value={formData.street} onChange={(e) => setFormData({ ...formData, street: e.target.value })} className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-[10px] font-bold text-white uppercase focus:outline-none focus:border-blue-500/30 placeholder:text-white/10 transition-all" />
              <input type="text" placeholder="Building Number" value={formData.buildingNo} onChange={(e) => setFormData({ ...formData, buildingNo: e.target.value })} className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-[10px] font-bold text-white uppercase focus:outline-none focus:border-blue-500/30 placeholder:text-white/10 transition-all" />
            </div>
          </div>
        )}

        {/* Step 2: Identification (Now below address fields) */}
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/5 relative z-10">
          <input
            type="text" placeholder="First Name" value={formData.firstName}
            onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
            className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-[10px] font-bold text-white uppercase focus:outline-none focus:border-blue-500/30 transition-all placeholder:text-white/10"
          />
          <input
            type="text" placeholder="Last Name" value={formData.lastName}
            onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
            className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-[10px] font-bold text-white uppercase focus:outline-none focus:border-blue-500/30 transition-all placeholder:text-white/10"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[7px] font-black text-white/20 uppercase tracking-widest ml-1 italic">Required</label>
            <input type="tel" placeholder="Phone 01" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-[10px] font-bold text-white uppercase focus:outline-none focus:border-blue-500/30 placeholder:text-white/10 transition-all" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[7px] font-black text-white/20 uppercase tracking-widest ml-1 italic">Optional</label>
            <input type="tel" placeholder="Phone 02" value={formData.phone2} onChange={(e) => setFormData({ ...formData, phone2: e.target.value })} className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-[10px] font-bold text-white uppercase focus:outline-none focus:border-blue-500/30 placeholder:text-white/10 transition-all" />
          </div>
        </div>

        <label className="flex items-start gap-4 p-4 bg-white/[0.02] border border-white/5 rounded-2xl cursor-pointer group hover:bg-white/[0.04] transition-all mt-2">
          <input type="checkbox" checked={formData.terms} onChange={(e) => setFormData({ ...formData, terms: e.target.checked })} className="hidden" />
          <div className={`w-4 h-4 rounded border mt-0.5 flex items-center justify-center transition-all ${formData.terms ? 'bg-blue-500 border-blue-500' : 'border-white/20'}`}>
            {formData.terms && <IonIcon name="checkmark" className="text-white text-[8px]" />}
          </div>
          <p className="text-[9px] font-bold text-white/30 uppercase group-hover:text-white/60 leading-normal tracking-wide">I accept Googer Logistics terms and confirm delivery location.</p>
        </label>
      </div>

      <div className="p-6 border-t border-white/5 bg-black/60 flex gap-3 backdrop-blur-sm">
        <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-white/5 text-white/30 text-[8px] font-black uppercase hover:text-white hover:bg-white/10 transition-all active:scale-[0.98]">Dismiss</button>
        <button
          onClick={() => {
            const commonFields = ['firstName', 'lastName', 'phone'];
            const detailedFields = ['country', 'province', 'district', 'city', 'houseNo', 'street', 'buildingNo'];
            const singleFields = ['fullAddress'];

            const relevantFields = formData.addressMode === 'single'
              ? [...commonFields, 'country', 'province', 'district', 'city', 'fullAddress']
              : [...commonFields, ...detailedFields];

            const missing = relevantFields.some(f => !formData[f]) || !formData.terms;
            if (missing) return alert("Required fields missing. Please complete the form and accept terms.");
            onSave(formData);
          }}
          className="flex-[2] py-2.5 rounded-xl bg-white text-black text-[8px] font-black uppercase hover:bg-blue-50 transition-all shadow-2xl active:scale-[0.98]"
        >
          Confirm Spot
        </button>
      </div>
    </div>
  );
}
