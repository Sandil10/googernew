"use client";

import { useState } from "react";
import IonIcon from "./IonIcon";

interface ShareModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    url: string;
    description?: string;
}

export default function ShareModal({ isOpen, onClose, title, url, description }: ShareModalProps) {
    const [copied, setCopied] = useState(false);

    if (!isOpen) return null;

    const handleCopy = () => {
        navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const platforms = [
        {
            name: 'Facebook',
            icon: 'logo-facebook',
            color: 'bg-[#1877F2]',
            action: () => {
                handleCopy();
                window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank');
            }
        },
        {
            name: 'WhatsApp',
            icon: 'logo-whatsapp',
            color: 'bg-[#25D366]',
            action: () => {
                handleCopy();
                window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(title + ' ' + url)}`, '_blank');
            }
        },
        {
            name: 'Twitter',
            icon: 'logo-twitter',
            color: 'bg-[#1DA1F2]',
            action: () => {
                handleCopy();
                window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`, '_blank');
            }
        },
        {
            name: 'Instagram',
            icon: 'logo-instagram',
            color: 'bg-gradient-to-tr from-[#f9ce34] via-[#ee2a7b] to-[#6228d7]',
            action: () => {
                handleCopy();
                alert('Link copied! You can now paste it in your Instagram story or bio.');
            }
        },
        {
            name: 'Messenger',
            icon: 'chatbubble-ellipses',
            color: 'bg-[#0084FF]',
            action: () => {
                handleCopy();
                window.open(`https://www.facebook.com/dialog/send?app_id=123456789&link=${encodeURIComponent(url)}&redirect_uri=${encodeURIComponent(url)}`, '_blank');
            }
        }
    ];

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={onClose}>
            <div
                className="bg-[#121212] border border-white/10 rounded-[2rem] w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6 border-b border-white/5 flex items-center justify-between">
                    <div>
                        <h3 className="text-white font-bold text-lg">Share Listing</h3>
                        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-black">Spred the word</p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:text-white transition-colors">
                        <IonIcon name="close" />
                    </button>
                </div>

                <div className="p-6">
                    <div className="grid grid-cols-3 gap-4 mb-8">
                        {platforms.map((p) => (
                            <button
                                key={p.name}
                                onClick={p.action}
                                className="flex flex-col items-center gap-2 group"
                            >
                                <div className={`w-12 h-12 ${p.color} rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg transition-transform group-hover:scale-110 active:scale-95`}>
                                    <IonIcon name={p.icon} />
                                </div>
                                <span className="text-[10px] text-gray-400 font-bold group-hover:text-white transition-colors uppercase tracking-tight">{p.name}</span>
                            </button>
                        ))}
                    </div>

                    <div className="bg-white/5 border border-white/10 rounded-2xl p-3 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Direct Link</p>
                            <p className="text-xs text-white truncate font-medium">{url}</p>
                        </div>
                        <button
                            onClick={handleCopy}
                            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${copied ? 'bg-green-500 text-white' : 'bg-blue-600 text-white hover:bg-blue-500'}`}
                        >
                            {copied ? 'Copied' : 'Copy'}
                        </button>
                    </div>
                </div>

                <div className="p-4 bg-black/40 text-center">
                    <p className="text-[9px] text-gray-600 font-bold uppercase tracking-[0.2em]">Googer Marketplace • Share & Earn</p>
                </div>
            </div>
        </div>
    );
}
