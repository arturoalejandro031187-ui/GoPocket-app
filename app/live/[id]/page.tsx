'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { Radio, Users, Send, ShoppingBag, ArrowLeft, Heart, ExternalLink } from 'lucide-react';

interface ChatMessage {
    id: string;
    message: string;
    created_at: string;
    profiles: {
        id: string;
        full_name: string | null;
        nickname: string | null;
        avatar_url: string | null;
    } | null;
}

interface LiveSession {
    id: string;
    title: string;
    description: string | null;
    status: string;
    viewer_count: number;
    product_ids: string[];
    started_at: string;
    host_id: string;
    profiles: {
        id: string;
        full_name: string | null;
        nickname: string | null;
        avatar_url: string | null;
    } | null;
}

interface Product {
    id: string;
    title: string;
    price: number;
    images: string[];
}

export default function LiveViewerPage() {
    const params = useParams();
    const sessionId = params.id as string;

    const [session, setSession] = useState<LiveSession | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [loading, setLoading] = useState(true);
    const [reactions, setReactions] = useState<{ id: number; x: number }[]>([]);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const reactionId = useRef(0);

    const getToken = async () => {
        const { data } = await supabase.auth.getSession();
        return data.session?.access_token;
    };

    // Load session data
    useEffect(() => {
        const loadSession = async () => {
            try {
                const res = await fetch(`/api/live?status=all`);
                const data = await res.json();
                const found = data.sessions?.find((s: any) => s.id === sessionId);
                if (found) setSession(found);
            } catch { }
            setLoading(false);
        };
        loadSession();
        const interval = setInterval(loadSession, 15_000);
        return () => clearInterval(interval);
    }, [sessionId]);

    // Load chat messages
    const loadMessages = useCallback(async () => {
        try {
            const res = await fetch(`/api/live/chat?session_id=${sessionId}`);
            const data = await res.json();
            setMessages(data.messages || []);
        } catch { }
    }, [sessionId]);

    useEffect(() => {
        loadMessages();
        const interval = setInterval(loadMessages, 3_000);
        return () => clearInterval(interval);
    }, [loadMessages]);

    // Load products
    useEffect(() => {
        if (!session?.product_ids?.length) return;
        const loadProducts = async () => {
            try {
                const admin = supabase;
                const { data } = await admin
                    .from('listings')
                    .select('id, title, price, images')
                    .in('id', session.product_ids);
                if (data) setProducts(data);
            } catch { }
        };
        loadProducts();
    }, [session?.product_ids]);

    // Auto-scroll chat
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const sendMessage = async () => {
        if (!newMessage.trim() || sending) return;
        setSending(true);
        try {
            const token = await getToken();
            if (!token) { alert('Inicia sesión para chatear'); return; }

            await fetch('/api/live/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
                body: JSON.stringify({ session_id: sessionId, message: newMessage.trim() }),
            });
            setNewMessage('');
            await loadMessages();
        } catch { }
        setSending(false);
    };

    const addReaction = () => {
        const id = reactionId.current++;
        const x = 20 + Math.random() * 60;
        setReactions((prev) => [...prev, { id, x }]);
        setTimeout(() => {
            setReactions((prev) => prev.filter((r) => r.id !== id));
        }, 2000);
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-900">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-red-500 border-t-transparent" />
            </div>
        );
    }

    if (!session) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white">
                <Radio className="w-16 h-16 text-gray-600 mb-4" />
                <h2 className="text-xl font-bold mb-2">Transmisión no encontrada</h2>
                <Link href="/live" className="text-red-400 hover:text-red-300">← Volver a Lives</Link>
            </div>
        );
    }

    const host = session.profiles;
    const hostName = host?.full_name || host?.nickname || 'Vendedor';
    const isLive = session.status === 'live';

    return (
        <div className="min-h-screen bg-gray-900">
            <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-0 lg:gap-4 p-0 lg:p-4">

                {/* Video area */}
                <div className="flex-1 relative">
                    {/* Back button */}
                    <Link href="/live" className="absolute top-4 left-4 z-20 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm text-white text-sm px-3 py-1.5 rounded-lg hover:bg-black/80 transition-colors">
                        <ArrowLeft className="w-4 h-4" /> Lives
                    </Link>

                    {/* Video placeholder */}
                    <div className="relative aspect-video bg-gradient-to-br from-gray-800 to-gray-900 rounded-none lg:rounded-2xl overflow-hidden flex items-center justify-center">
                        {/* Host camera placeholder */}
                        <div className="flex flex-col items-center">
                            {host?.avatar_url ? (
                                <img src={host.avatar_url} alt="" className="w-28 h-28 rounded-full ring-4 ring-red-500/40 object-cover mb-3" />
                            ) : (
                                <div className="w-28 h-28 rounded-full bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center text-white text-4xl font-bold ring-4 ring-red-500/40 mb-3">
                                    {hostName.charAt(0).toUpperCase()}
                                </div>
                            )}
                            <h2 className="text-white text-lg font-bold">{hostName}</h2>
                            <p className="text-gray-400 text-sm">{session.title}</p>
                        </div>

                        {/* LIVE badge */}
                        {isLive && (
                            <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-red-600 text-white text-sm font-bold px-3 py-1.5 rounded-lg shadow-lg animate-pulse">
                                <div className="w-2.5 h-2.5 bg-white rounded-full" />
                                EN VIVO
                            </div>
                        )}
                        {!isLive && (
                            <div className="absolute top-4 right-4 bg-gray-700 text-gray-300 text-sm font-bold px-3 py-1.5 rounded-lg">
                                FINALIZADA
                            </div>
                        )}

                        {/* Viewer count */}
                        <div className="absolute bottom-4 left-4 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm text-white text-sm px-3 py-1.5 rounded-lg">
                            <Users className="w-4 h-4" />
                            {session.viewer_count || 0} viendo
                        </div>

                        {/* Reactions */}
                        {reactions.map((r) => (
                            <div
                                key={r.id}
                                className="absolute bottom-20 text-2xl animate-bounce"
                                style={{ left: `${r.x}%`, animation: 'float-up 2s ease-out forwards' }}
                            >
                                ❤️
                            </div>
                        ))}
                    </div>

                    {/* Products showcase */}
                    {products.length > 0 && (
                        <div className="p-4">
                            <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2">
                                <ShoppingBag className="w-4 h-4 text-red-400" />
                                Productos en vivo ({products.length})
                            </h3>
                            <div className="flex gap-3 overflow-x-auto pb-2">
                                {products.map((product) => (
                                    <Link
                                        key={product.id}
                                        href={`/listings/${product.id}`}
                                        target="_blank"
                                        className="flex-shrink-0 w-36 rounded-xl bg-gray-800 overflow-hidden hover:ring-2 hover:ring-red-500 transition-all group"
                                    >
                                        <div className="h-24 bg-gray-700 overflow-hidden">
                                            {product.images?.[0] ? (
                                                <img src={product.images[0]} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-gray-500">
                                                    <ShoppingBag className="w-8 h-8" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="p-2">
                                            <p className="text-white text-xs font-medium line-clamp-1">{product.title}</p>
                                            <p className="text-red-400 text-sm font-bold">${product.price?.toLocaleString('es-MX')}</p>
                                            <span className="text-[10px] text-gray-400 flex items-center gap-0.5 mt-0.5">
                                                <ExternalLink className="w-3 h-3" /> Ver producto
                                            </span>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Chat panel */}
                <div className="w-full lg:w-96 flex flex-col bg-gray-800 lg:rounded-2xl overflow-hidden" style={{ height: 'calc(100vh - 2rem)', maxHeight: '700px' }}>
                    {/* Chat header */}
                    <div className="p-4 border-b border-gray-700 flex items-center justify-between">
                        <h3 className="text-white font-bold flex items-center gap-2">
                            💬 Chat en vivo
                            <span className="bg-gray-700 text-gray-400 text-xs px-2 py-0.5 rounded-full">{messages.length}</span>
                        </h3>
                        <button
                            onClick={addReaction}
                            className="flex items-center gap-1 bg-red-500/20 text-red-400 px-3 py-1.5 rounded-full text-xs font-semibold hover:bg-red-500/30 transition-colors active:scale-95"
                        >
                            <Heart className="w-3.5 h-3.5" />
                            Reaccionar
                        </button>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {messages.length === 0 && (
                            <div className="text-center py-10 text-gray-500 text-sm">
                                <p>Sé el primero en chatear 💬</p>
                            </div>
                        )}

                        {messages.map((msg) => {
                            const sender = msg.profiles;
                            const senderName = sender?.full_name || sender?.nickname || 'Anónimo';
                            const isHost = sender?.id === session.host_id;

                            return (
                                <div key={msg.id} className="flex items-start gap-2">
                                    {sender?.avatar_url ? (
                                        <img src={sender.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0 mt-0.5" />
                                    ) : (
                                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5 ${isHost ? 'bg-red-500 text-white' : 'bg-gray-600 text-gray-300'
                                            }`}>
                                            {senderName.charAt(0).toUpperCase()}
                                        </div>
                                    )}
                                    <div className="min-w-0">
                                        <span className={`text-xs font-semibold ${isHost ? 'text-red-400' : 'text-gray-400'}`}>
                                            {senderName}
                                            {isHost && <span className="ml-1 bg-red-500/20 text-red-300 px-1.5 py-0.5 rounded text-[9px]">HOST</span>}
                                        </span>
                                        <p className="text-white text-sm break-words">{msg.message}</p>
                                    </div>
                                </div>
                            );
                        })}
                        <div ref={chatEndRef} />
                    </div>

                    {/* Input */}
                    {isLive ? (
                        <div className="p-3 border-t border-gray-700">
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                                    placeholder="Escribe un mensaje..."
                                    maxLength={500}
                                    className="flex-1 bg-gray-700 text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-red-500 placeholder-gray-500"
                                />
                                <button
                                    onClick={sendMessage}
                                    disabled={!newMessage.trim() || sending}
                                    className="bg-red-500 text-white rounded-xl px-4 py-2.5 hover:bg-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    <Send className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="p-4 border-t border-gray-700 text-center text-gray-500 text-sm">
                            Esta transmisión ha finalizado
                        </div>
                    )}
                </div>
            </div>

            {/* Floating reactions CSS */}
            <style jsx>{`
        @keyframes float-up {
          0% { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-200px) scale(1.5); }
        }
      `}</style>
        </div>
    );
}
