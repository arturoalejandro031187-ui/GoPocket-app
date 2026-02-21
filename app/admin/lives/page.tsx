'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import Link from 'next/link';

type LiveSession = {
    id: string;
    host_id: string;
    title: string;
    description?: string | null;
    status: 'live' | 'scheduled' | 'ended';
    started_at?: string | null;
    ended_at?: string | null;
    created_at: string;
    viewer_count?: number | null;
    profiles?: {
        id: string;
        full_name?: string | null;
        nickname?: string | null;
        avatar_url?: string | null;
    } | null;
};

function fmtDate(iso?: string | null) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('es-MX', {
        year: 'numeric', month: 'short', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
    });
}

function durationStr(start?: string | null, end?: string | null) {
    const s = start ? new Date(start).getTime() : null;
    const e = end ? new Date(end).getTime() : Date.now();
    if (!s) return '—';
    const diff = Math.floor((e - s) / 1000);
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const sec = diff % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${sec}s`;
    return `${sec}s`;
}

const STATUS_BADGE: Record<string, string> = {
    live: 'bg-red-100 text-red-700 ring-1 ring-red-300',
    scheduled: 'bg-yellow-100 text-yellow-700 ring-1 ring-yellow-300',
    ended: 'bg-gray-100 text-gray-500 ring-1 ring-gray-200',
};

const STATUS_LABEL: Record<string, string> = {
    live: '🔴 En vivo',
    scheduled: '⏰ Programado',
    ended: '⚫ Terminado',
};

export default function AdminLivesPage() {
    const [sessions, setSessions] = useState<LiveSession[]>([]);
    const [filter, setFilter] = useState<'all' | 'live' | 'ended'>('all');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [ending, setEnding] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const status = filter === 'all' ? 'all' : filter;
            const { data: { session: sess } } = await supabase.auth.getSession();
            const res = await fetch(`/api/live?status=${status}&limit=100`, {
                headers: sess?.access_token ? { authorization: `Bearer ${sess.access_token}` } : {},
                cache: 'no-store',
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Error cargando sesiones');
            setSessions((json.sessions ?? []) as LiveSession[]);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [filter]);

    useEffect(() => { void load(); }, [load]);

    const forceEnd = async (sessionId: string) => {
        if (!confirm('¿Terminar forzosamente este live?')) return;
        setEnding(sessionId);
        setError(null);
        setSuccess(null);
        try {
            // Use admin supabase to force-end (bypass host check)
            const { data: { session: sess } } = await supabase.auth.getSession();
            const res = await fetch('/api/admin/lives/force-end', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    authorization: `Bearer ${sess?.access_token}`,
                },
                body: JSON.stringify({ session_id: sessionId }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json.error || 'No se pudo terminar el live');
            setSuccess('Live terminado correctamente.');
            void load();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setEnding(null);
        }
    };

    const live = sessions.filter(s => s.status === 'live');
    const ended = sessions.filter(s => s.status === 'ended');
    const scheduled = sessions.filter(s => s.status === 'scheduled');

    return (
        <div className="rounded-3xl bg-white/80 p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
                <div>
                    <div className="text-lg font-bold text-gray-900">Admin · Lives</div>
                    <div className="mt-1 text-sm text-gray-500">
                        Monitoreo de transmisiones en vivo (exclusivo Plan Platinum).
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => void load()}
                        disabled={loading}
                        className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-black/10 hover:bg-gray-50 disabled:opacity-50"
                    >
                        {loading ? '⏳ Cargando…' : '🔄 Actualizar'}
                    </button>
                    <Link
                        href="/admin"
                        className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-black/10 hover:bg-gray-50"
                    >
                        ← Admin
                    </Link>
                </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="rounded-2xl bg-red-50 ring-1 ring-red-100 p-4 text-center">
                    <div className="text-2xl font-black text-red-600">{live.length}</div>
                    <div className="text-xs font-semibold text-red-500 mt-0.5">🔴 En vivo ahora</div>
                </div>
                <div className="rounded-2xl bg-yellow-50 ring-1 ring-yellow-100 p-4 text-center">
                    <div className="text-2xl font-black text-yellow-600">{scheduled.length}</div>
                    <div className="text-xs font-semibold text-yellow-600 mt-0.5">⏰ Programados</div>
                </div>
                <div className="rounded-2xl bg-gray-50 ring-1 ring-gray-100 p-4 text-center">
                    <div className="text-2xl font-black text-gray-600">{ended.length}</div>
                    <div className="text-xs font-semibold text-gray-500 mt-0.5">⚫ Terminados</div>
                </div>
            </div>

            {/* Filters */}
            <div className="flex gap-2 mb-5">
                {(['all', 'live', 'ended'] as const).map(f => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${filter === f
                                ? 'bg-gray-900 text-white shadow'
                                : 'bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50'
                            }`}
                    >
                        {f === 'all' ? 'Todos' : f === 'live' ? '🔴 Activos' : '⚫ Terminados'}
                    </button>
                ))}
            </div>

            {/* Alerts */}
            {error && (
                <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
                    ⚠️ {error}
                </div>
            )}
            {success && (
                <div className="mb-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700 ring-1 ring-green-200">
                    ✅ {success}
                </div>
            )}

            {/* Sessions list */}
            {loading && sessions.length === 0 ? (
                <div className="py-16 text-center text-gray-400 text-sm">Cargando sesiones…</div>
            ) : sessions.length === 0 ? (
                <div className="py-16 text-center">
                    <div className="text-4xl mb-2">📡</div>
                    <div className="text-gray-500 text-sm font-medium">No hay sesiones para mostrar.</div>
                    <div className="text-gray-400 text-xs mt-1">Los lives de usuarios Platinum aparecerán aquí.</div>
                </div>
            ) : (
                <div className="space-y-3">
                    {sessions.map(s => {
                        const name =
                            s.profiles?.full_name ||
                            s.profiles?.nickname ||
                            s.host_id.slice(0, 8) + '…';

                        const isLive = s.status === 'live';

                        return (
                            <div
                                key={s.id}
                                className={`flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl p-4 ring-1 transition-all ${isLive
                                        ? 'bg-red-50/60 ring-red-200'
                                        : 'bg-white ring-gray-100'
                                    }`}
                            >
                                {/* Avatar + Name */}
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                    <div className="relative shrink-0">
                                        {s.profiles?.avatar_url ? (
                                            <img
                                                src={s.profiles.avatar_url}
                                                alt={name}
                                                className="w-10 h-10 rounded-full object-cover ring-2 ring-white"
                                            />
                                        ) : (
                                            <div className="w-10 h-10 rounded-full bg-purple-100 ring-2 ring-white flex items-center justify-center text-purple-600 font-bold text-sm">
                                                {name[0]?.toUpperCase() || '?'}
                                            </div>
                                        )}
                                        {isLive && (
                                            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-red-500 ring-2 ring-white animate-pulse" />
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="font-semibold text-sm text-gray-900 truncate">{name}</div>
                                        <div className="text-xs text-gray-500 truncate" title={s.title}>
                                            📣 {s.title}
                                        </div>
                                        {s.description && (
                                            <div className="text-xs text-gray-400 truncate">{s.description}</div>
                                        )}
                                    </div>
                                </div>

                                {/* Meta */}
                                <div className="flex flex-wrap items-center gap-2 text-xs shrink-0">
                                    <span className={`rounded-full px-2 py-0.5 font-semibold text-[11px] ${STATUS_BADGE[s.status] || STATUS_BADGE.ended}`}>
                                        {STATUS_LABEL[s.status] || s.status}
                                    </span>
                                    <span className="text-gray-400">
                                        ⏱ {isLive ? `Inicio: ${fmtDate(s.started_at)}` : `Duración: ${durationStr(s.started_at, s.ended_at)}`}
                                    </span>
                                    {!isLive && s.ended_at && (
                                        <span className="text-gray-400">· Fin: {fmtDate(s.ended_at)}</span>
                                    )}
                                </div>

                                {/* Actions */}
                                {isLive && (
                                    <button
                                        onClick={() => void forceEnd(s.id)}
                                        disabled={ending === s.id}
                                        className="shrink-0 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-1.5 transition-colors disabled:opacity-50"
                                    >
                                        {ending === s.id ? '⏳ Terminando…' : '⛔ Forzar Fin'}
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
