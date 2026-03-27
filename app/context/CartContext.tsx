"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';

export interface CartItem {
  id: number;
  productId: number;
  title: string;
  price: number;
  promo_price?: number;
  image_url: string;
  quantity: number;
  size?: string | null;
  color?: string | null;
  variantIndex?: number | null;
}

interface CartContextType {
  cartItems: CartItem[];
  addToCart: (product: any, quantity: number, size?: string | null, color?: string | null, variantIndex?: number | null) => void;
  removeFromCart: (itemId: number) => void;
  updateQuantity: (itemId: number, delta: number) => void;
  clearCart: () => void;
  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;
  cartCount: number;
  cartTotal: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const savedCart = localStorage.getItem('googer_cart');
    if (savedCart) {
      try {
        setCartItems(JSON.parse(savedCart));
      } catch (e) {
        console.error("Failed to parse cart", e);
      }
    }
  }, []);

  useEffect(() => {
    if (mounted) {
      localStorage.setItem('googer_cart', JSON.stringify(cartItems));
    }
  }, [cartItems, mounted]);

  const addToCart = (product: any, quantity: number, size?: string | null, color?: string | null, variantIndex?: number | null) => {
    setCartItems((prev) => {
      // Check if item with same variant and size already exists
      const existingItemIndex = prev.findIndex(
        (item) => 
          item.productId === product.id && 
          item.size === size && 
          item.color === color
      );

      if (existingItemIndex > -1) {
        const newItems = [...prev];
        newItems[existingItemIndex].quantity += quantity;
        return newItems;
      }

      const newItem: CartItem = {
        id: Date.now(), // Unique ID for cart entry
        productId: product.id,
        title: product.title,
        price: Number(product.price),
        promo_price: product.promo_price ? Number(product.promo_price) : undefined,
        image_url: product.image_url,
        quantity,
        size,
        color,
        variantIndex
      };
      return [...prev, newItem];
    });
    
    // Auto open cart when adding
    setIsCartOpen(true);
  };

  const removeFromCart = (itemId: number) => {
    setCartItems((prev) => prev.filter((item) => item.id !== itemId));
  };

  const updateQuantity = (itemId: number, delta: number) => {
    setCartItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, quantity: Math.max(1, item.quantity + delta) }
          : item
      )
    );
  };

  const clearCart = () => {
    setCartItems([]);
  };

  const cartCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);
  const cartTotal = cartItems.reduce((acc, item) => {
    const p = Number(item.promo_price || item.price);
    return acc + (p * item.quantity);
  }, 0);

  return (
    <CartContext.Provider
      value={{
        cartItems,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        isCartOpen,
        setIsCartOpen,
        cartCount,
        cartTotal
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
