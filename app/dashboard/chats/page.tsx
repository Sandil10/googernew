"use client";

import IonIcon from "@/app/components/IonIcon";

export default function ChatsPage() {
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 bg-[#1a1a1a]/40 rounded-[3rem] border border-white/5 backdrop-blur-sm">
            <div className="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center mb-6 animate-pulse">
                <IonIcon name="chatbubbles-outline" className="text-4xl text-blue-400" />
            </div>
            <h1 className="text-2xl font-black text-white italic uppercase tracking-wider mb-2">Messenger Coming Soon</h1>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest leading-relaxed max-w-md">
                We're currently building a secure, real-time chat system for buyers and sellers to connect directly. Stay tuned!
            </p>
            <div className="mt-8 flex gap-3">
                <button className="px-6 py-3 bg-white text-black text-[10px] font-black uppercase tracking-widest rounded-full hover:scale-105 transition-all">
                    Enable Notifications
                </button>
            </div>
        </div>
    );
}
