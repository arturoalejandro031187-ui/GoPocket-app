'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { UserMinus, Store, ArrowLeft, Loader2 } from 'lucide-react';

interface FollowedSeller {
    seller_id: string;
    created_at: string;
    name: string;
    avatar_url?: string | null;
    is_official?: boolean;
    follower_count: number;
    reputation_percent?: number;
    has_active_auction?: boolean;
    is_live?: boolean;
}

export default function SiguiendoPage() {
    const [sellers, setSellers] = useState<FollowedSeller[]>([]);
    const [loading, setLoading] = useState(true);
    const [unfollowing, setUnfollowing] = useState<string | null>(null);

    useEffect(() => {
        loadFollowing();
    }, []);

    const loadFollowing = async () => {
        setLoading(true);
        try {
            const { data: sess } = await supabase.auth.getSession();
            const token = sess.session?.access_token;
            if (!token) return;

            const res = await fetch('/api/follows/my-following', {
                headers: { authorization: `Bearer ${token}` },
            });
            const json = await res.json();
            if (json.ok) setSellers(json.sellers || []);
        } catch (e) {
            console.error('[Siguiendo] Error:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleUnfollow = async (sellerId: string) => {
        setUnfollowing(sellerId);
        try {
            const { data: sess } = await supabase.auth.getSession();
            const token = sess.session?.access_token;
            if (!token) return;

            const res = await fetch('/api/follows/toggle', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ seller_id: sellerId }),
            });
            const json = await res.json();
            if (json.ok && !json.following) {
                setSellers((prev) => prev.filter((s) => s.seller_id !== sellerId));
                // Emit sync event for other components
                window.dispatchEvent(new CustomEvent('follow-sync', {
                    detail: { sellerId, following: false, followerCount: json.follower_count ?? 0 }
                }));
            }
        } catch (e) {
            console.error('[Siguiendo] Unfollow error:', e);
        } finally {
            setUnfollowing(null);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
            <style jsx global>{`
                @keyframes pulse-red {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.7; transform: scale(0.95); }
                }
                .animate-pulse-fast {
                    animation: pulse-red 1.2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
                }
            `}</style>

            <div className="mx-auto max-w-3xl px-4 py-8">
                {/* Header */}
                <div className="mb-8 flex items-center gap-4">
                    <Link
                        href="/dashboard/favoritos"
                        className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-gray-700 shadow-sm ring-1 ring-black/5 hover:bg-gray-50"
                    >
                        <ArrowLeft size={18} />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-extrabold text-gray-900">Vendedores que sigo</h1>
                        <p className="text-sm text-gray-500">
                            {loading ? 'Cargando...' : `${sellers.length} vendedor${sellers.length !== 1 ? 'es' : ''}`}
                        </p>
                    </div>
                </div>

                {/* List */}
                {loading ? (
                    <div className="space-y-3">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="h-24 animate-pulse rounded-2xl bg-white ring-1 ring-black/5" />
                        ))}
                    </div>
                ) : sellers.length === 0 ? (
                    <div className="rounded-3xl bg-white p-10 text-center shadow-sm ring-1 ring-black/5">
                        <div className="text-4xl mb-3">👥</div>
                        <div className="text-lg font-bold text-gray-900">Aún no sigues a nadie</div>
                        <p className="mt-2 text-sm text-gray-600">
                            Sigue a vendedores para recibir notificaciones cuando hagan un Live o tengan ofertas.
                        </p>
                        <Link
                            href="/listings"
                            className="mt-4 inline-flex rounded-xl bg-brand-pink px-5 py-2.5 text-sm font-bold text-white shadow-lg hover:opacity-90"
                        >
                            Explorar productos
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {sellers.map((s) => (
                            <div
                                key={s.seller_id}
                                className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 transition-all hover:shadow-md border-l-4 border-transparent hover:border-brand-pink"
                            >
                                {/* Avatar */}
                                <Link
                                    href={`/tienda/${s.seller_id}`}
                                    className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-pink to-pink-400 text-white font-black text-xl shadow-sm overflow-hidden"
                                >
                                    {s.avatar_url ? (
                                        <img src={s.avatar_url} alt={s.name} className="h-full w-full object-cover" />
                                    ) : (
                                        s.name?.charAt(0)?.toUpperCase() || '?'
                                    )}
                                    {s.is_live && (
                                        <div className="absolute inset-x-0 bottom-0 bg-red-600 text-[8px] font-black text-center py-0.5 animate-pulse">
                                            LIVE
                                        </div>
                                    )}
                                </Link>

                                {/* Info */}
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2 mb-1">
                                        <Link
                                            href={`/tienda/${s.seller_id}`}
                                            className="text-base font-bold text-gray-900 hover:text-brand-pink truncate"
                                        >
                                            {s.name}
                                        </Link>
                                        {s.is_official && (
                                            <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">
                                                Oficial
                                            </span>
                                        )}
                                        {s.is_live && (
                                            <span className="animate-pulse-fast inline-flex items-center rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black text-white shadow-sm ring-2 ring-white">
                                                LIVE
                                            </span>
                                        )}
                                        {s.has_active_auction && !s.is_live && (
                                            <span className="animate-pulse-fast inline-flex items-center rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-black text-white shadow-sm ring-2 ring-white">
                                                SUBASTA
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                                        <span className="flex items-center gap-1">
                                            <Store size={12} className="text-gray-400" />
                                            {s.follower_count} seguidor{s.follower_count !== 1 ? 'es' : ''}
                                        </span>
                                        {typeof s.reputation_percent === 'number' && (
                                            <span className="flex items-center gap-1 font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full ring-1 ring-green-100">
                                                ⭐ {s.reputation_percent}% positivo
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-2">
                                    <Link
                                        href={`/tienda/${s.seller_id}`}
                                        className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-gray-50 px-4 text-xs font-bold text-gray-700 ring-1 ring-black/5 hover:bg-gray-100 transition-colors"
                                    >
                                        Ver tienda
                                    </Link>
                                    <button
                                        type="button"
                                        onClick={() => handleUnfollow(s.seller_id)}
                                        disabled={unfollowing === s.seller_id}
                                        className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600 ring-1 ring-red-100 hover:bg-red-100 transition-colors disabled:opacity-50"
                                        title="Dejar de seguir"
                                    >
                                        {unfollowing === s.seller_id ? (
                                            <Loader2 size={16} className="animate-spin" />
                                        ) : (
                                            <UserMinus size={18} />
                                        )}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
