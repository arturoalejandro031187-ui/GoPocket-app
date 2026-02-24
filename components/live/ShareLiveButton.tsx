'use client';

import { useState, useRef, useEffect } from 'react';
import { Share2, X, Check, Link as LinkIcon } from 'lucide-react';

interface ShareLiveButtonProps {
    sessionId: string;
    title: string;
    hostName: string;
    className?: string;
    /** 'sm' for mobile, 'md' for desktop */
    size?: 'sm' | 'md';
}

const SHARE_TARGETS = [
    {
        key: 'whatsapp',
        label: 'WhatsApp',
        color: '#25D366',
        icon: (
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
        ),
        getUrl: (text: string, url: string) => `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`,
    },
    {
        key: 'facebook',
        label: 'Facebook',
        color: '#1877F2',
        icon: (
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
        ),
        getUrl: (_text: string, url: string) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    },
    {
        key: 'twitter',
        label: 'X / Twitter',
        color: '#000000',
        icon: (
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
        ),
        getUrl: (text: string, url: string) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
    },
    {
        key: 'telegram',
        label: 'Telegram',
        color: '#0088CC',
        icon: (
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
            </svg>
        ),
        getUrl: (text: string, url: string) => `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
    },
];

export default function ShareLiveButton({ sessionId, title, hostName, className = '', size = 'sm' }: ShareLiveButtonProps) {
    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);

    const liveUrl = typeof window !== 'undefined' ? `${window.location.origin}/live/${sessionId}` : `https://www.gopocket.com.mx/live/${sessionId}`;
    const shareText = `🔴 ¡${hostName} está EN VIVO en GoPocket!\n${title}\n¡Entra a ver la transmisión! 👇`;

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(liveUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Fallback for older browsers
            const ta = document.createElement('textarea');
            ta.value = liveUrl;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleNativeShare = async () => {
        if (navigator.share) {
            try {
                await navigator.share({ title: `🔴 ${hostName} EN VIVO`, text: shareText, url: liveUrl });
            } catch { /* user cancelled */ }
        } else {
            setOpen(true);
        }
    };

    const btnSize = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-9 h-9 text-sm';

    return (
        <div className="relative" ref={panelRef}>
            {/* Main share button */}
            <button
                onClick={handleNativeShare}
                className={`${btnSize} flex items-center justify-center rounded-full bg-black/60 backdrop-blur-sm text-white hover:bg-black/80 active:scale-90 transition-all ${className}`}
                title="Compartir"
            >
                <Share2 className={size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'} />
            </button>

            {/* Share Panel */}
            {open && (
                <div
                    className="absolute right-0 top-full mt-2 z-50 bg-gray-900 rounded-2xl shadow-2xl ring-1 ring-white/10 p-3 w-64 animate-in fade-in slide-in-from-top-2 duration-200"
                    style={{ animation: 'shareIn 0.2s ease-out' }}
                >
                    <style>{`@keyframes shareIn { from { opacity:0; transform:translateY(-8px) scale(0.95); } to { opacity:1; transform:translateY(0) scale(1); } }`}</style>

                    {/* Header */}
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-white text-xs font-bold">📤 Compartir Live</span>
                        <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-gray-300">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Social buttons */}
                    <div className="grid grid-cols-4 gap-2 mb-3">
                        {SHARE_TARGETS.map((t) => (
                            <a
                                key={t.key}
                                href={t.getUrl(shareText, liveUrl)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-white/10 transition-colors group"
                                onClick={() => setOpen(false)}
                            >
                                <div
                                    className="w-10 h-10 rounded-full flex items-center justify-center text-white transition-transform group-hover:scale-110 group-active:scale-95"
                                    style={{ backgroundColor: t.color }}
                                >
                                    {t.icon}
                                </div>
                                <span className="text-[10px] text-gray-400 font-medium">{t.label}</span>
                            </a>
                        ))}
                    </div>

                    {/* Copy link */}
                    <button
                        onClick={handleCopy}
                        className={`w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-all active:scale-95 ${copied
                                ? 'bg-green-500/20 text-green-400 ring-1 ring-green-500/30'
                                : 'bg-white/10 text-white hover:bg-white/15 ring-1 ring-white/10'
                            }`}
                    >
                        {copied ? <Check className="w-4 h-4" /> : <LinkIcon className="w-4 h-4" />}
                        {copied ? '¡Enlace copiado!' : 'Copiar enlace'}
                    </button>

                    {/* URL preview */}
                    <p className="text-[9px] text-gray-600 mt-2 text-center truncate">{liveUrl}</p>
                </div>
            )}
        </div>
    );
}
