"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { cartService } from '@/services/cartService';

export interface CartItem {
  id: number;
  productId: number;
  title: string;
  price: number;
  promo_price?: number | null;
  image_url: string;
  quantity: number;
  size?: string | null;
  color?: string | null;
  variantIndex?: number | null;
  selected?: boolean;
  seller_id?: string;
  shipping_info?: any;
  product_discount?: number;
  selected_shipping_country?: string | null;
  payment_methods?: string[];
  reseller_ref?: string | null;
  resell_commission_percentage?: number;
}

interface CartContextType {
  cartItems: CartItem[];
  addToCart: (product: any, quantity: number, size?: string | null, color?: string | null, variantIndex?: number | null, selectedShippingCountry?: string | null) => Promise<void>;
  removeFromCart: (itemId: number) => Promise<void>;
  updateQuantity: (itemId: number, delta: number) => Promise<void>;
  toggleSelection: (itemId: number) => Promise<void>;
  toggleAllSelection: (selected: boolean) => Promise<void>;
  clearCart: () => Promise<void>;
  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;
  isManualPaymentCartLocked: boolean;
  setIsManualPaymentCartLocked: (locked: boolean) => void;
  isGoogerPaymentCartLocked: boolean;
  setIsGoogerPaymentCartLocked: (locked: boolean) => void;
  cartCount: number;
  cartTotal: number;
  selectedCount: number;
  selectedTotal: number;
  originalSelectedTotal: number;
  totalDiscount: number;
  deliveryTotal: number;
  userCountry: string;
  setUserCountry: (country: string) => void;
  savedAddress: any;
  setSavedAddress: (address: any) => void;
  isAllSelected: boolean;
  isItemAvailable: (item: CartItem) => boolean;
}

const CART_STORAGE_KEY = 'googer_cart';
const RESELL_ATTRIBUTION_STORAGE_KEY = 'googer:resell-attribution';
const ADDRESS_STORAGE_KEY = 'googer-cart-address-1';
const MANUAL_PAYMENT_LOCK_STORAGE_KEY = 'googer-manual-payment-lock';
const GOOGER_PAYMENT_LOCK_STORAGE_KEY = 'googer-payment-lock';
const CART_POLL_INTERVAL_MS = 15000;

const CartContext = createContext<CartContextType | undefined>(undefined);

const normalizeCartItems = (items: any[]): CartItem[] =>
  (Array.isArray(items) ? items : []).map((item: any) => ({
    ...item,
    id: Number(item.id),
    productId: Number(item.productId ?? item.product_id ?? item.id),
    price: Number(item.price || 0),
    promo_price: item.promo_price !== undefined && item.promo_price !== null ? Number(item.promo_price) : null,
    quantity: Math.max(1, Number(item.quantity || 1)),
    variantIndex: item.variantIndex ?? item.variant_index ?? null,
    selected: item.selected !== false,
    selected_shipping_country: item.selected_shipping_country ?? null,
    reseller_ref: item.reseller_ref ?? item.resell_ref ?? item.resellerRef ?? null,
    resell_commission_percentage: Number(item.resell_commission_percentage ?? item.resell_percentage ?? 0),
    payment_methods: Array.isArray(item.payment_methods)
      ? item.payment_methods
      : (() => {
          try {
            return typeof item.payment_methods === 'string'
              ? JSON.parse(item.payment_methods)
              : (item.payment_methods || []);
          } catch {
            return [];
          }
        })(),
  }));

const safeParseJson = (value: string | null) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const getAuthToken = () =>
  typeof window !== 'undefined' ? (sessionStorage.getItem('token') || localStorage.getItem('token')) : null;

const hasAuthenticatedSession = () => Boolean(getAuthToken());

const serializeCart = (items: CartItem[]) => JSON.stringify(normalizeCartItems(items));

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

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpenState, setIsCartOpenState] = useState(false);
  const [isManualPaymentCartLocked, setIsManualPaymentCartLockedState] = useState(false);
  const [isGoogerPaymentCartLocked, setIsGoogerPaymentCartLockedState] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [userCountry, setUserCountry] = useState<string>('Sri Lanka');
  const [savedAddress, setSavedAddress] = useState<any>(null);

  const cartItemsRef = useRef<CartItem[]>([]);
  const serializedCartRef = useRef<string>('[]');
  const authTokenRef = useRef<string | null>(null);
  const isCartOpen = isCartOpenState;

  const setIsCartOpen = useCallback((open: boolean) => {
    setIsCartOpenState(open);
  }, []);

  const setIsManualPaymentCartLocked = useCallback((locked: boolean) => {
    setIsManualPaymentCartLockedState(locked);
    if (typeof window === 'undefined') return;

    if (locked) {
      localStorage.setItem(MANUAL_PAYMENT_LOCK_STORAGE_KEY, 'true');
      setIsCartOpenState(true);
      return;
    }

    localStorage.removeItem(MANUAL_PAYMENT_LOCK_STORAGE_KEY);
  }, []);

  const setIsGoogerPaymentCartLocked = useCallback((locked: boolean) => {
    setIsGoogerPaymentCartLockedState(locked);
    if (typeof window === 'undefined') return;

    if (locked) {
      localStorage.setItem(GOOGER_PAYMENT_LOCK_STORAGE_KEY, 'true');
      setIsCartOpenState(true);
      return;
    }

    localStorage.removeItem(GOOGER_PAYMENT_LOCK_STORAGE_KEY);
  }, []);

  const setCartItemsIfChanged = useCallback((nextItems: CartItem[]) => {
    const normalized = normalizeCartItems(nextItems);
    const serialized = serializeCart(normalized);

    if (serialized === serializedCartRef.current) {
      return;
    }

    serializedCartRef.current = serialized;
    cartItemsRef.current = normalized;
    setCartItems(normalized);
  }, []);

  const readLocalCart = useCallback(() => {
    const parsed = safeParseJson(typeof window !== 'undefined' ? localStorage.getItem(CART_STORAGE_KEY) : null);
    return normalizeCartItems(parsed || []);
  }, []);

  const syncCartFromServer = useCallback(async (options?: { mergeLocalIfRemoteEmpty?: boolean }) => {
    if (!hasAuthenticatedSession()) return;

    const remoteCart = normalizeCartItems(await cartService.getCart());

    if (options?.mergeLocalIfRemoteEmpty && remoteCart.length === 0 && cartItemsRef.current.length > 0) {
      for (const item of cartItemsRef.current) {
        await cartService.addItem({
          productId: item.productId,
          title: item.title,
          price: item.price,
          promo_price: item.promo_price,
          image_url: item.image_url,
          quantity: item.quantity,
          size: item.size ?? null,
          color: item.color ?? null,
          variantIndex: item.variantIndex ?? null,
          selected: item.selected !== false,
          seller_id: item.seller_id || null,
          shipping_info: item.shipping_info || null,
          product_discount: item.product_discount || 0,
          selected_shipping_country: item.selected_shipping_country ?? null,
          payment_methods: item.payment_methods || [],
        });
      }

      const mergedCart = normalizeCartItems(await cartService.getCart());
      setCartItemsIfChanged(mergedCart);
      return;
    }

    setCartItemsIfChanged(remoteCart);
  }, [setCartItemsIfChanged]);

  useEffect(() => {
    setMounted(true);

    const localCart = readLocalCart();
    setCartItemsIfChanged(localCart);

    const parsedAddress = safeParseJson(typeof window !== 'undefined' ? localStorage.getItem(ADDRESS_STORAGE_KEY) : null);
    if (parsedAddress) {
      setSavedAddress(parsedAddress);
      if (parsedAddress.country) setUserCountry(parsedAddress.country);
    }

    if (typeof window !== 'undefined' && localStorage.getItem(MANUAL_PAYMENT_LOCK_STORAGE_KEY) === 'true') {
      setIsManualPaymentCartLockedState(true);
      setIsCartOpenState(true);
    }

    if (typeof window !== 'undefined' && localStorage.getItem(GOOGER_PAYMENT_LOCK_STORAGE_KEY) === 'true') {
      setIsGoogerPaymentCartLockedState(true);
      setIsCartOpenState(true);
    }

    authTokenRef.current = getAuthToken();
  }, [readLocalCart, setCartItemsIfChanged]);

  useEffect(() => {
    cartItemsRef.current = cartItems;
    serializedCartRef.current = serializeCart(cartItems);

    if (!mounted || typeof window === 'undefined') return;
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
  }, [cartItems, mounted]);

  useEffect(() => {
    if (!mounted || typeof window === 'undefined' || !savedAddress) return;
    localStorage.setItem(ADDRESS_STORAGE_KEY, JSON.stringify(savedAddress));
  }, [savedAddress, mounted]);

  useEffect(() => {
    if (!mounted || typeof window === 'undefined') return;

    const handleAuthOrFocusRefresh = async (force = false) => {
      const nextToken = getAuthToken();
      const previousToken = authTokenRef.current;
      authTokenRef.current = nextToken;

      if (nextToken && nextToken !== previousToken) {
        await syncCartFromServer({ mergeLocalIfRemoteEmpty: true });
        return;
      }

      if (nextToken && (force || isCartOpenState)) {
        await syncCartFromServer();
      }
    };

    handleAuthOrFocusRefresh(true).catch(() => {});

    const intervalId = isCartOpenState
      ? window.setInterval(() => {
          if (document.visibilityState === 'visible') {
            handleAuthOrFocusRefresh().catch(() => {});
          }
        }, CART_POLL_INTERVAL_MS)
      : null;

    const handleWindowFocus = () => {
      handleAuthOrFocusRefresh(true).catch(() => {});
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleAuthOrFocusRefresh(true).catch(() => {});
      }
    };

    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (intervalId) window.clearInterval(intervalId);
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isCartOpenState, mounted, syncCartFromServer]);

  const buildCartItemFromProduct = useCallback((
    product: any,
    quantity: number,
    size?: string | null,
    color?: string | null,
    variantIndex?: number | null,
    selectedShippingCountry?: string | null
  ): CartItem => {
    let productDiscountPct = 0;
    let resellCommissionPct = 0;
    try {
      const commInfo = typeof product.commission_info === 'string'
        ? JSON.parse(product.commission_info)
        : product.commission_info;
      productDiscountPct = parseFloat(commInfo?.discount || '0');
      resellCommissionPct = parseFloat(commInfo?.resell_percentage ?? commInfo?.resell_percent ?? commInfo?.resell_commission ?? '0');
    } catch {}
    const productId = Number(product.id || product.productId || product.product_id);
    const resellerRef = product.reseller_ref
      || product.resell_ref
      || product.resellerRef
      || product?.resell?.reseller_ref
      || getStoredResellRefForProduct(product.id || product.productId || product.product_id)
      || null;

    return {
      id: Date.now(),
      productId,
      title: product.title,
      price: Number(product.price),
      promo_price: product.promo_price ? Number(product.promo_price) : Number(product.price),
      image_url: product.image_url,
      quantity,
      size: size ?? null,
      color: color ?? null,
      variantIndex: variantIndex ?? null,
      selected: true,
      seller_id: product.owner_user_id || product.user_id?.toString(),
      shipping_info: product.shipping_info || product.shipping_data,
      product_discount: productDiscountPct,
      selected_shipping_country: selectedShippingCountry || null,
      reseller_ref: resellerRef ? String(resellerRef) : null,
      resell_commission_percentage: Number.isFinite(resellCommissionPct) ? resellCommissionPct : 0,
      payment_methods: typeof product.payment_methods === 'string'
        ? JSON.parse(product.payment_methods)
        : (product.payment_methods || (product.payment_data ? (typeof product.payment_data === 'string' ? JSON.parse(product.payment_data) : product.payment_data) : ['wallet']))
    };
  }, []);

  const addToCart = useCallback(async (
    product: any,
    quantity: number,
    size?: string | null,
    color?: string | null,
    variantIndex?: number | null,
    selectedShippingCountry?: string | null
  ) => {
    const newItem = buildCartItemFromProduct(product, quantity, size, color, variantIndex, selectedShippingCountry);

    setCartItemsIfChanged((() => {
      const prev = cartItemsRef.current;
      const existingItemIndex = prev.findIndex(
        (item) =>
          item.productId === newItem.productId &&
          item.size === newItem.size &&
          item.color === newItem.color &&
          item.variantIndex === newItem.variantIndex &&
          (item.selected_shipping_country || null) === (newItem.selected_shipping_country || null) &&
          (item.reseller_ref || null) === (newItem.reseller_ref || null)
      );

      if (existingItemIndex > -1) {
        return prev.map((item, index) =>
          index === existingItemIndex
            ? { ...item, quantity: item.quantity + quantity, selected: true }
            : item
        );
      }

      return [...prev, newItem];
    })());

    if (!hasAuthenticatedSession()) return;

    try {
      await cartService.addItem({
        productId: newItem.productId,
        title: newItem.title,
        price: newItem.price,
        promo_price: newItem.promo_price,
        image_url: newItem.image_url,
        quantity: newItem.quantity,
        size: newItem.size,
        color: newItem.color,
        variantIndex: newItem.variantIndex,
        selected: newItem.selected,
        seller_id: newItem.seller_id,
        shipping_info: newItem.shipping_info,
        product_discount: newItem.product_discount,
        selected_shipping_country: newItem.selected_shipping_country,
        reseller_ref: newItem.reseller_ref,
        resell_commission_percentage: newItem.resell_commission_percentage,
        payment_methods: newItem.payment_methods,
      });
      await syncCartFromServer();
    } catch (error) {
      console.error('Failed to sync addToCart:', error);
      await syncCartFromServer();
    }
  }, [buildCartItemFromProduct, setCartItemsIfChanged, syncCartFromServer]);

  const removeFromCart = useCallback(async (itemId: number) => {
    const previous = cartItemsRef.current;
    setCartItemsIfChanged(previous.filter((item) => item.id !== itemId));

    if (!hasAuthenticatedSession()) return;

    try {
      await cartService.deleteItem(itemId);
      await syncCartFromServer();
    } catch (error) {
      console.error('Failed to sync removeFromCart:', error);
      setCartItemsIfChanged(previous);
      await syncCartFromServer();
    }
  }, [setCartItemsIfChanged, syncCartFromServer]);

  const updateQuantity = useCallback(async (itemId: number, delta: number) => {
    const previous = cartItemsRef.current;
    const nextItems = previous.map((item) =>
      item.id === itemId
        ? { ...item, quantity: Math.max(1, item.quantity + delta) }
        : item
    );

    const updatedItem = nextItems.find((item) => item.id === itemId);
    setCartItemsIfChanged(nextItems);

    if (!hasAuthenticatedSession() || !updatedItem) return;

    try {
      await cartService.updateItem(itemId, { quantity: updatedItem.quantity });
      await syncCartFromServer();
    } catch (error) {
      console.error('Failed to sync updateQuantity:', error);
      setCartItemsIfChanged(previous);
      await syncCartFromServer();
    }
  }, [setCartItemsIfChanged, syncCartFromServer]);

  const toggleSelection = useCallback(async (itemId: number) => {
    const previous = cartItemsRef.current;
    const nextItems = previous.map((item) =>
      item.id === itemId
        ? { ...item, selected: !item.selected }
        : item
    );
    const updatedItem = nextItems.find((item) => item.id === itemId);
    setCartItemsIfChanged(nextItems);

    if (!hasAuthenticatedSession() || !updatedItem) return;

    try {
      await cartService.updateItem(itemId, { selected: updatedItem.selected !== false });
      await syncCartFromServer();
    } catch (error) {
      console.error('Failed to sync toggleSelection:', error);
      setCartItemsIfChanged(previous);
      await syncCartFromServer();
    }
  }, [setCartItemsIfChanged, syncCartFromServer]);

  const toggleAllSelection = useCallback(async (selected: boolean) => {
    const previous = cartItemsRef.current;
    const nextItems = previous.map((item) => ({ ...item, selected }));
    setCartItemsIfChanged(nextItems);

    if (!hasAuthenticatedSession()) return;

    try {
      await Promise.all(
        nextItems.map((item) => cartService.updateItem(item.id, { selected }))
      );
      await syncCartFromServer();
    } catch (error) {
      console.error('Failed to sync toggleAllSelection:', error);
      setCartItemsIfChanged(previous);
      await syncCartFromServer();
    }
  }, [setCartItemsIfChanged, syncCartFromServer]);

  const clearCart = useCallback(async () => {
    const previous = cartItemsRef.current;
    setCartItemsIfChanged([]);

    if (!hasAuthenticatedSession()) return;

    try {
      await cartService.clearCart();
      await syncCartFromServer();
    } catch (error) {
      console.error('Failed to sync clearCart:', error);
      setCartItemsIfChanged(previous);
      await syncCartFromServer();
    }
  }, [setCartItemsIfChanged, syncCartFromServer]);

  const selectedItems = useMemo(
    () => cartItems.filter((item) => item.selected !== false),
    [cartItems]
  );

  const cartCount = useMemo(
    () => cartItems.reduce((acc, item) => acc + item.quantity, 0),
    [cartItems]
  );

  const cartTotal = useMemo(
    () => cartItems.reduce((acc, item) => acc + (Number(item.promo_price || item.price) * item.quantity), 0),
    [cartItems]
  );

  const selectedCount = useMemo(
    () => selectedItems.reduce((acc, item) => acc + item.quantity, 0),
    [selectedItems]
  );

  const selectedTotal = useMemo(
    () => selectedItems.reduce((acc, item) => acc + (Number(item.promo_price || item.price) * item.quantity), 0),
    [selectedItems]
  );

  const totalDiscount = useMemo(
    () => selectedItems.reduce((acc, item) => {
      const promo = Number(item.promo_price || item.price);
      const pct = item.product_discount || 0;
      return acc + (((promo * pct) / 100) * item.quantity);
    }, 0),
    [selectedItems]
  );

  const originalSelectedTotal = useMemo(
    () => selectedItems.reduce((acc, item) => acc + (Number(item.price) * item.quantity), 0),
    [selectedItems]
  );

  const isAllSelected = cartItems.length > 0 && selectedItems.length === cartItems.length;

  const getProductDeliveryInfo = useCallback((shipping_info: any, selectedCountry?: string | null) => {
    if (!shipping_info) return { fee: 0, isAvailable: true };
    try {
      const parsed = typeof shipping_info === 'string' ? JSON.parse(shipping_info) : shipping_info;
      const activeCountry = (selectedCountry || userCountry || '').toLowerCase().trim();

      if (parsed?.unified) {
        return { fee: Number(parsed.charge) || 0, isAvailable: true };
      }

      const rates = parsed?.rates || parsed?.shipping_rates || [];
      if (Array.isArray(rates) && rates.length > 0) {
        const countryRate = rates.find((r: any) =>
          r.country?.toLowerCase().trim() === activeCountry
        );

        if (countryRate) {
          return { fee: Number(countryRate.charge || countryRate.price) || 0, isAvailable: true };
        }

        const worldWideRate = rates.find((r: any) =>
          r.country?.toLowerCase().trim().includes('world') ||
          r.country?.toLowerCase().trim().includes('global') ||
          r.isDefault
        );

        if (worldWideRate) {
          return { fee: Number(worldWideRate.charge || worldWideRate.price) || 0, isAvailable: true };
        }

        return { fee: 0, isAvailable: false };
      }
    } catch (e) {
      console.error('Error parsing shipping info', e);
    }

    return { fee: 0, isAvailable: true };
  }, [userCountry]);

  const isItemAvailable = useCallback((item: CartItem) => {
    return getProductDeliveryInfo(item.shipping_info, item.selected_shipping_country).isAvailable;
  }, [getProductDeliveryInfo]);

  const deliveryTotal = useMemo(() => {
    const sellerDeliveryFees = new Map<string, number>();

    selectedItems.forEach((item) => {
      const groupId = item.seller_id ? `seller_${item.seller_id}` : `prod_${item.productId}`;
      const { fee, isAvailable } = getProductDeliveryInfo(item.shipping_info, item.selected_shipping_country);

      if (isAvailable) {
        const existingFee = sellerDeliveryFees.get(groupId) || 0;
        if (fee > existingFee) {
          sellerDeliveryFees.set(groupId, fee);
        }
      }
    });

    let total = 0;
    sellerDeliveryFees.forEach((fee) => {
      total += fee;
    });
    return total;
  }, [getProductDeliveryInfo, selectedItems]);

  return (
    <CartContext.Provider
      value={{
        cartItems,
        addToCart,
        removeFromCart,
        updateQuantity,
        toggleSelection,
        toggleAllSelection,
        clearCart,
        isCartOpen,
        setIsCartOpen,
        isManualPaymentCartLocked,
        setIsManualPaymentCartLocked,
        isGoogerPaymentCartLocked,
        setIsGoogerPaymentCartLocked,
        cartCount,
        cartTotal,
        selectedCount,
        selectedTotal,
        originalSelectedTotal,
        totalDiscount,
        deliveryTotal,
        userCountry,
        setUserCountry,
        savedAddress,
        setSavedAddress,
        isAllSelected,
        isItemAvailable,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
