"use client";

import React from 'react';
import Image from 'next/image';
import { useCart } from '../context/CartContext';
import IonIcon from './IonIcon';

export default function CartSidebar() {
  const { isCartOpen, setIsCartOpen, cartItems, updateQuantity, removeFromCart, cartTotal, cartCount } = useCart();

  if (!isCartOpen) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex justify-end">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={() => setIsCartOpen(false)}
      />

      {/* Sidebar */}
      <div className="relative w-full max-w-md bg-[#111111] h-full shadow-2xl border-l border-white/10 flex flex-col animate-in slide-in-from-right duration-500 ease-out">
        {/* Header */}
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600/10 flex items-center justify-center text-blue-400">
              <IonIcon name="bag-handle" className="text-xl" />
            </div>
            <div>
              <h3 className="text-white font-black text-lg">My Shopping Cart</h3>
              <p className="text-[10px] text-blue-400 font-bold uppercase tracking-[0.2em]">
                {cartCount} {cartCount === 1 ? 'Item' : 'Items'} Ready
              </p>
            </div>
          </div>
          <button 
            onClick={() => setIsCartOpen(false)}
            className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white transition-all active:scale-90"
          >
            <IonIcon name="close" className="text-xl" />
          </button>
        </div>

        {/* Items List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {cartItems.length > 0 ? (
            cartItems.map((item) => (
              <div key={item.id} className="group relative flex gap-4 p-4 bg-white/[0.02] hover:bg-white/[0.04] border border-white/5 rounded-3xl transition-all duration-300">
                {/* Product Image */}
                <div className="relative w-24 h-24 rounded-2xl overflow-hidden border border-white/5 shrink-0 bg-black">
                  <Image 
                    src={item.image_url.startsWith('http') || item.image_url.startsWith('data:') ? item.image_url : `/uploads/${item.image_url.split(/[\\/]/).pop()}`}
                    alt={item.title}
                    fill
                    className="object-cover transition-transform group-hover:scale-110 duration-500"
                  />
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
                  <div>
                    <div className="flex justify-between items-start gap-2 mb-1">
                      <h4 className="text-sm font-black text-white truncate group-hover:text-blue-400 transition-colors uppercase tracking-tight">
                        {item.title}
                      </h4>
                      <button 
                        onClick={() => removeFromCart(item.id)}
                        className="text-white/20 hover:text-red-500 transition-colors p-1"
                      >
                        <IonIcon name="trash-outline" />
                      </button>
                    </div>
                    
                    <div className="flex flex-wrap gap-2">
                       {item.size && (
                         <span className="px-2 py-0.5 bg-white/5 rounded-md text-[9px] font-black text-white/40 border border-white/5 uppercase">
                           Size {item.size}
                         </span>
                       )}
                       {item.color && item.color !== 'None' && (
                         <span className="px-2 py-0.5 bg-white/5 rounded-md text-[9px] font-black text-white/40 border border-white/5 uppercase">
                           {item.color}
                         </span>
                       )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-4">
                    <div className="flex items-center bg-black/40 rounded-xl border border-white/5 p-1">
                      <button 
                        onClick={() => updateQuantity(item.id, -1)}
                        className="w-7 h-7 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5 rounded-lg transition-all"
                      >
                        <IonIcon name="remove" />
                      </button>
                      <span className="w-8 text-center text-[11px] font-black text-white font-mono">
                        {item.quantity}
                      </span>
                      <button 
                        onClick={() => updateQuantity(item.id, 1)}
                        className="w-7 h-7 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5 rounded-lg transition-all font-bold"
                      >
                        <IonIcon name="add" />
                      </button>
                    </div>
                    
                    <p className="text-blue-400 font-mono font-black text-sm">
                      R {Number(item.promo_price || item.price).toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center px-10">
              <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center text-white/10 mb-6">
                <IonIcon name="cart-outline" className="text-4xl" />
              </div>
              <h4 className="text-white font-black uppercase tracking-widest text-sm mb-2">Cart Is Empty</h4>
              <p className="text-[10px] text-white/30 font-bold uppercase leading-relaxed tracking-widest">
                Browse our curated collections to add items here.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        {cartItems.length > 0 && (
          <div className="p-8 border-t border-white/5 bg-white/[0.02] space-y-6">
            <div className="space-y-3">
              <div className="flex justify-between items-center group">
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 group-hover:text-blue-400 transition-colors">Subtotal</span>
                <span className="text-sm font-mono font-black text-white">R {Number(cartTotal).toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center group">
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 group-hover:text-blue-400 transition-colors">Delivery</span>
                <span className="text-[10px] font-black text-green-500 uppercase tracking-widest">Calculated At Checkout</span>
              </div>
              <div className="pt-3 border-t border-white/5 flex justify-between items-center group">
                <span className="text-xs font-black uppercase tracking-[0.4em] text-blue-400">Total Amount</span>
                <span className="text-xl font-mono font-black text-white">R {Number(cartTotal).toFixed(2)}</span>
              </div>
            </div>

            <button className="w-full py-5 bg-white text-black rounded-2xl font-black text-xs uppercase tracking-[0.3em] transition-all flex items-center justify-center gap-3 shadow-[0_20px_40px_rgba(255,255,255,0.1)] hover:scale-[1.02] active:scale-95 group">
              <IonIcon name="lock-closed" className="text-lg" />
              Proceed to Secure Checkout
            </button>
            
            <p className="text-[9px] text-center text-white/20 font-black uppercase tracking-[0.1em]">
              Free returns on all standard domestic orders within 14 days
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
