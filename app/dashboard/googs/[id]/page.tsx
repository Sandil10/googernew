"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import IonIcon from "@/app/components/IonIcon";

type TrendingPostDetail = {
    id: string;
    title: string;
    description: string;
    image: string;
    views: number;
    likes: number;
    source: "write" | "ad";
};

export default function GoogDetailsPage() {
    const router = useRouter();
    const [post, setPost] = useState<TrendingPostDetail | null>(null);

    useEffect(() => {
        try {
            const parsed = JSON.parse(window.localStorage.getItem("googer-selected-trending-post") || "null");
            setPost(parsed?.title ? parsed : null);
        } catch {
            setPost(null);
        }
    }, []);

    return (
        <main className="-mx-3 -my-5 min-h-[calc(100vh-7rem)] bg-[#1c1917] px-4 py-5 text-white sm:-mx-4 md:-mx-8 md:-my-6 md:px-6">
            <div className="mx-auto w-full max-w-3xl">
                <button
                    type="button"
                    onClick={() => router.back()}
                    className="mb-4 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-white/65 transition hover:bg-white/[0.08] hover:text-white"
                >
                    <IonIcon name="chevron-back-outline" className="text-base" />
                    Back
                </button>

                <article className="overflow-hidden rounded-2xl border border-white/10 bg-[#211d1a] shadow-[0_22px_70px_rgba(0,0,0,0.28)]">
                    {post ? (
                        <>
                            <div className="relative aspect-video bg-black">
                                <Image src={post.image} alt={post.title} fill sizes="768px" className="object-cover" unoptimized />
                            </div>
                            <div className="p-5 sm:p-6">
                                <span className="rounded-full bg-white/8 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/50">
                                    Daily Trending
                                </span>
                                <h1 className="mt-4 text-xl font-black leading-7 text-white sm:text-2xl">{post.title}</h1>
                                <p className="mt-3 text-sm leading-6 text-white/58">{post.description}</p>
                                <div className="mt-6 flex flex-wrap items-center gap-4 text-xs font-bold text-white/50">
                                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] px-3 py-2">
                                        <IonIcon name="eye-outline" className="text-base" />
                                        {post.views} views
                                    </span>
                                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] px-3 py-2">
                                        <IonIcon name="heart-outline" className="text-base" />
                                        {post.likes} likes
                                    </span>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="p-8 text-center">
                            <h1 className="text-lg font-black text-white">Post details unavailable</h1>
                            <p className="mt-2 text-sm text-white/45">Open a trending post from Home to view its details.</p>
                        </div>
                    )}
                </article>
            </div>
        </main>
    );
}
