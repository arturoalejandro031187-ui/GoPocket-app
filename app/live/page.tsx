'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Radio, Users, Clock, ShoppingBag } from 'lucide-react';

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

export default function LiveListPage() {
    const [sessions, setSessions] = useState<LiveSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'live' | 'ended'>('live');

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/live?status=${filter}`);
                const data = await res.json();
                setSessions(data.sessions || []);
            } catch { }
            setLoading(false);
        };
        load();
        // Poll every 10s for live updates
        const interval = setInterval(load, 10_000);
        return () => clearInterval(interval);
    }, [filter]);

    const getElapsed = (startedAt: string) => {
        const ms = Date.now() - new Date(startedAt).getTime();
        const mins = Math.floor(ms / 60000);
        if (mins < 60) return `${mins}m`;
        const hrs = Math.floor(mins / 60);
        return `${hrs}h ${mins % 60}m`;
    };

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-gradient-to-r from-red-600 via-red-500 to-orange-500 py-12 px-4">
                <div className="max-w-6xl mx-auto text-center">
                    <div className="flex items-center justify-center gap-3 mb-3">
                        <div className="relative">
                            <Radio className="w-10 h-10 text-white" />
                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-white rounded-full animate-ping" />
                        </div>
                        <h1 className="text-4xl font-extrabold text-white tracking-tight">GoPocket Live</h1>
                    </div>
                    <p className="text-red-100 text-lg max-w-xl mx-auto">
                        Compra en vivo directamente de vendedores verificados. Chat, ofertas exclusivas y productos al momento.
                    </p>
                </div>
            </div>

            <div className="max-w-6xl mx-auto px-4 py-8">
                {/* Filter tabs */}
                <div className="flex gap-2 mb-8">
                    <button
                        onClick={() => setFilter('live')}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold text-sm transition-all ${filter === 'live'
                                ? 'bg-red-500 text-white shadow-lg shadow-red-200'
                                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                            }`}
                    >
                        <div className={`w-2 h-2 rounded-full ${filter === 'live' ? 'bg-white animate-pulse' : 'bg-red-500'}`} />
                        En Vivo
                    </button>
                    <button
                        onClick={() => setFilter('ended')}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold text-sm transition-all ${filter === 'ended'
                                ? 'bg-gray-800 text-white shadow-lg'
                                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                            }`}
                    >
                        <Clock className="w-4 h-4" />
                        Anteriores
                    </button>
                </div>

                {/* Loading */}
                {loading && (
                    <div className="flex items-center justify-center py-20">
                        <div className="h-10 w-10 animate-spin rounded-full border-4 border-red-500 border-t-transparent" />
                    </div>
                )}

                {/* Empty state */}
                {!loading && sessions.length === 0 && (
                    <div className="text-center py-20">
                        <Radio className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                        <h2 className="text-xl font-bold text-gray-900 mb-2">
                            {filter === 'live' ? 'No hay transmisiones en vivo' : 'No hay transmisiones anteriores'}
                        </h2>
                        <p className="text-gray-500">
                            {filter === 'live'
                                ? 'Los vendedores Platinum pueden iniciar transmisiones en vivo. ¡Vuelve pronto!'
                                : 'Aún no se ha realizado ninguna transmisión.'}
                        </p>
                    </div>
                )}

                {/* Grid */}
                {!loading && sessions.length > 0 && (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {sessions.map((session) => {
                            const host = session.profiles;
                            const hostName = host?.full_name || host?.nickname || 'Vendedor';

                            return (
                                <Link
                                    key={session.id}
                                    href={`/live/${session.id}`}
                                    className="group rounded-2xl overflow-hidden bg-white shadow-sm border border-gray-100 hover:shadow-xl transition-all hover:-translate-y-1"
                                >
                                    {/* Video placeholder */}
                                    <div className="relative aspect-video bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center">
                                        {/* Host avatar large */}
                                        <div className="flex flex-col items-center">
                                            {host?.avatar_url ? (
                                                <img src={host.avatar_url} alt="" className="w-20 h-20 rounded-full ring-4 ring-white/20 object-cover mb-2" />
                                            ) : (
                                                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center text-white text-2xl font-bold ring-4 ring-white/20 mb-2">
                                                    {hostName.charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                            <span className="text-white/60 text-sm">{hostName}</span>
                                        </div>

                                        {/* LIVE badge */}
                                        {session.status === 'live' && (
                                            <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-red-600 text-white text-xs font-bold px-2.5 py-1 rounded-lg shadow-lg">
                                                <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                                                EN VIVO
                                            </div>
                                        )}
                                        {session.status === 'ended' && (
                                            <div className="absolute top-3 left-3 bg-gray-700 text-gray-300 text-xs font-bold px-2.5 py-1 rounded-lg">
                                                FINALIZADA
                                            </div>
                                        )}

                                        {/* Viewer count */}
                                        <div className="absolute top-3 right-3 flex items-center gap-1 bg-black/50 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-lg">
                                            <Users className="w-3.5 h-3.5" />
                                            {session.viewer_count || 0}
                                        </div>

                                        {/* Duration */}
                                        {session.started_at && (
                                            <div className="absolute bottom-3 right-3 bg-black/50 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-lg">
                                                ⏱ {getElapsed(session.started_at)}
                                            </div>
                                        )}
                                    </div>

                                    {/* Info */}
                                    <div className="p-4">
                                        <h3 className="font-bold text-gray-900 group-hover:text-red-600 transition-colors line-clamp-1">
                                            {session.title}
                                        </h3>
                                        {session.description && (
                                            <p className="text-sm text-gray-500 mt-1 line-clamp-2">{session.description}</p>
                                        )}
                                        <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
                                            {session.product_ids?.length > 0 && (
                                                <span className="flex items-center gap-1">
                                                    <ShoppingBag className="w-3.5 h-3.5" />
                                                    {session.product_ids.length} productos
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
