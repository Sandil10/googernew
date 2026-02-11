"use client";

import Image from "next/image";
import { useRouter, useParams } from "next/navigation";
import { useState } from "react";
import IonIcon from "@/app/components/IonIcon";

export default function ProductDetailsPage() {
    const router = useRouter();
    const params = useParams();
    const [quantity, setQuantity] = useState(1);

    // Mock product data
    const product = {
        id: params.id,
        title: "Facial Cleanser",
        subtitle: "Size: 7.60 fl oz / 225ml",
        price: 49.95,
        img: "https://picsum.photos/seed/cleanse/800/1000",
        rating: 5,
        reviews: 132,
        size: "M",
        color: "Black",
        delivery: "Apr 1 - Apr 5",
        features: [
            { icon: "leaf-outline", label: "Vegan" },
            { icon: "earth-outline", label: "Natural" },
            { icon: "checkmark-circle-outline", label: "C-Neutral" }
        ]
    };

    return (
        <div className="min-h-screen bg-[#1c1917] text-white pb-20 px-4 font-normal">
            <div className="max-w-4xl mx-auto pt-4 md:pt-14">

                {/* Mobile Back Button - Outside Image */}
                <div className="md:hidden flex items-center mb-4">
                    <button
                        onClick={() => router.back()}
                        className="flex items-center gap-2 text-white/60 hover:text-white transition-colors"
                    >
                        <IonIcon name="chevron-back-outline" className="text-xl" />
                        <span className="text-[11px] font-bold uppercase tracking-widest">Back</span>
                    </button>
                </div>

                {/* Compact Specially Rounded Container */}
                <div className="rounded-[40px] md:rounded-[60px] border border-white/20 p-5 md:p-10 transition-all bg-white/[0.01]">
                    <div className="flex flex-col md:flex-row gap-6 md:gap-14 items-center md:items-start text-center md:text-left">

                        {/* More Compact Cute Image Box */}
                        <div className="relative w-36 h-36 md:w-56 md:h-56 rounded-[32px] md:rounded-[40px] overflow-hidden border border-white/10 shadow-2xl shrink-0 bg-white/[0.05]">
                            <Image
                                src={product.img}
                                alt={product.title}
                                fill
                                className="object-cover"
                            />

                            {/* Desktop-only Back button (inside image) */}
                            <button
                                onClick={() => router.back()}
                                className="hidden md:flex absolute top-3 left-3 w-8 h-8 bg-black/60 backdrop-blur-md rounded-full items-center justify-center text-white border border-white/20 active:scale-95 transition-all text-sm"
                            >
                                <IonIcon name="chevron-back-outline" />
                            </button>
                        </div>

                        {/* Content Section - Compact & Sharp */}
                        <div className="flex-1 w-full max-w-sm">
                            {/* Header */}
                            <div className="mb-5 w-full">
                                <h1 className="text-lg md:text-2xl font-bold text-white mb-1 tracking-tight">{product.title}</h1>
                                <p className="text-white/40 text-[8px] md:text-xs font-bold uppercase tracking-[0.2em]">{product.subtitle}</p>

                                <div className="flex items-center justify-center md:justify-start gap-1.5 mt-2.5">
                                    <div className="flex text-yellow-500 gap-0.5">
                                        {[...Array(5)].map((_, i) => (
                                            <IonIcon key={i} name="star" className="text-[9px]" />
                                        ))}
                                    </div>
                                    <span className="text-[8px] font-bold text-white/20 tracking-widest uppercase">({product.reviews} REVIEWS)</span>
                                </div>
                            </div>

                            {/* Price & Quantity Area */}
                            <div className="w-full flex items-center justify-between mb-6 pb-5 border-b border-white/10">
                                <div className="flex flex-col items-start gap-0.5">
                                    <span className="text-[9px] font-bold text-white/40 uppercase tracking-[0.2em]">Rupieer</span>
                                    <div className="flex items-center gap-2">
                                        <div className="relative w-5 h-4">
                                            <Image src="/assets/images/rupee.png" alt="R" fill className="object-contain invert opacity-100" />
                                        </div>
                                        <span className="text-xl md:text-3xl font-bold tracking-tighter text-white">{product.price.toFixed(2)}</span>
                                    </div>
                                </div>

                                {/* More Compact Literal Selector */}
                                <div className="flex items-center bg-white/5 rounded-xl border border-white/20 p-1 shadow-inner">
                                    <button
                                        onClick={() => setQuantity(Math.max(1, quantity - 1))}
                                        className="w-6 h-6 md:w-8 md:h-8 rounded-lg flex items-center justify-center text-white font-bold text-base hover:bg-white/10 transition-all active:scale-90"
                                    >
                                        -
                                    </button>
                                    <span className="px-3 md:px-4 font-bold text-xs md:text-sm text-white">{quantity}</span>
                                    <button
                                        onClick={() => setQuantity(quantity + 1)}
                                        className="w-6 h-6 md:w-8 md:h-8 rounded-lg flex items-center justify-center text-white font-bold text-base hover:bg-white/10 transition-all active:scale-90"
                                    >
                                        +
                                    </button>
                                </div>
                            </div>

                            {/* Detail List */}
                            <div className="w-full space-y-3.5 mb-8 px-1">
                                <div className="flex justify-between items-center text-[9px] md:text-xs">
                                    <span className="font-bold text-white/50 uppercase tracking-[0.2em]">Quantity</span>
                                    <span className="text-white font-bold">{quantity}</span>
                                </div>
                                <div className="flex justify-between items-center text-[9px] md:text-xs">
                                    <span className="font-bold text-white/50 uppercase tracking-[0.2em]">Size</span>
                                    <span className="text-blue-500 font-bold">{product.size}</span>
                                </div>
                                <div className="flex justify-between items-center text-[9px] md:text-xs">
                                    <span className="font-bold text-white/50 uppercase tracking-[0.2em]">Color</span>
                                    <span className="text-white font-bold">{product.color}</span>
                                </div>
                                <div className="flex justify-between items-center text-[9px] md:text-xs">
                                    <span className="font-bold text-white/50 uppercase tracking-[0.2em]">Delivery</span>
                                    <span className="text-white font-bold">{product.delivery}</span>
                                </div>
                            </div>

                            {/* Balanced High Contrast Button */}
                            <button className="w-full md:w-fit md:px-12 bg-white text-[#1c1917] hover:bg-gray-100 py-3 rounded-xl font-bold text-[9px] md:text-[10px] uppercase tracking-[0.25em] transition-all active:scale-95 shadow-xl flex items-center justify-center gap-2 mb-2">
                                Add to Bag
                            </button>

                            {/* Final Area */}
                            <div className="w-full mt-6 pt-5 border-t border-white/5 flex justify-end items-baseline gap-2 opacity-30">
                                <span className="text-[8px] font-bold uppercase tracking-[0.2em]">Rupieer</span>
                                <span className="text-lg font-bold tracking-tighter text-white">{(product.price * quantity).toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
