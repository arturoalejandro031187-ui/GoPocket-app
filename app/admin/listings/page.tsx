'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

type Row = {
  id: string;
  public_id?: string | null;
  title: string;
  status: string;
  sale_type?: string | null;
  price?: number | string | null;
  currency?: string | null;
  seller_id?: string | null;
  created_at?: string | null;
  is_deleted?: boolean | null;
  deleted_at?: string | null;
};

function formatMoney(v: number) {
  return v.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function toNumber(v: unknown) {
  const n = typeof v === 'number' ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function formatDateTime(input: string | null | undefined) {
  if (!input) return '—';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-MX', { year: 'numeric', month: 'short', day: '2-digit' });
}

export default function AdminListingsPage() {
  const [isBooting, setIsBooting] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Row[]>([]);

  const load = async (needle: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) throw sessionErr;
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Auth session missing');

      const res = await fetch(`/api/admin/listings/search?q=${encodeURIComponent(needle)}&limit=100`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'No se pudieron cargar publicaciones.');
      setRows((json?.rows ?? []) as Row[]);
    } catch (e: unknown) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'No se pudieron cargar publicaciones.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      try {
        setIsBooting(true);
        setError(null);

        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;
        if (!userData.user) {
          window.location.href = '/';
          return;
        }

        const { data: adminRow } = await supabase.from('admin_users').select('user_id').eq('user_id', userData.user.id).maybeSingle();
        if (!adminRow) {
          if (!cancelled) {
            setIsAdmin(false);
            setError('No tienes permisos de administrador para ver esta página.');
          }
          return;
        }
        if (!cancelled) setIsAdmin(true);
        await load('');
      } catch (err: unknown) {
        console.error(err);
        if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudo iniciar la página.');
      } finally {
        if (!cancelled) setIsBooting(false);
      }
    };
    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  const countLabel = useMemo(() => (isLoading ? 'Cargando…' : `${rows.length} resultados`), [isLoading, rows.length]);

  if (isBooting) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-pink-50 to-white">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <div className="h-14 rounded-2xl bg-white/70 ring-1 ring-black/5" />
          <div className="mt-6 h-72 rounded-2xl bg-white/70 ring-1 ring-black/5" />
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-pink-50 to-white">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <div className="rounded-3xl bg-white p-10 text-center shadow-sm ring-1 ring-black/5">
            <div className="text-lg font-bold text-gray-900">Acceso denegado</div>
            {error ? <div className="mt-3 text-sm text-red-700">{error}</div> : null}
            <div className="mt-6">
              <Link href="/dashboard" className="inline-flex rounded-xl bg-brand-pink px-5 py-3 text-sm font-semibold text-white hover:opacity-90">
                Volver
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 to-white">
      <div className="sticky top-0 z-40 border-b border-black/5 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 items-center justify-center rounded-xl bg-brand-pink px-3 text-white shadow-sm">
              <span className="text-sm font-extrabold tracking-widest">GoPocket</span>
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-gray-900">Admin · Publicaciones</div>
              <div className="text-xs text-gray-500">Busca por título o por ID (PCK-…)</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/admin/settings" className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-black/5 hover:bg-gray-50">
              Configuración
            </Link>
            <Link href="/admin/banners" className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-black/5 hover:bg-gray-50">
              Banners
            </Link>
            <Link href="/dashboard" className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-black/5 hover:bg-gray-50">
              Dashboard
            </Link>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {error && <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-semibold text-gray-900">{countLabel}</div>
          <div className="flex w-full gap-2 sm:max-w-lg">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-pink"
              placeholder="Buscar por título, UUID o PCK-…"
            />
            <button
              type="button"
              onClick={() => load(q.trim())}
              className="shrink-0 rounded-xl bg-brand-pink px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90"
            >
              Buscar
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/5">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-black/5">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">ID</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Título</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Tipo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Precio</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Estado</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 bg-white">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-600">
                      No hay resultados.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4 text-xs font-semibold text-gray-700 whitespace-nowrap">
                        <div>{r.public_id || '—'}</div>
                        <div className="text-[11px] text-gray-400">{r.id.slice(0, 8)}…</div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className={['text-sm font-semibold', r.is_deleted ? 'text-gray-500 line-through' : 'text-gray-900'].join(' ')}>
                            {r.title}
                          </div>
                          {r.is_deleted ? (
                            <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800 ring-1 ring-red-100">
                              Archivada
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">Seller: {String(r.seller_id || '').slice(0, 8)}…</div>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-700">{r.sale_type === 'auction' ? 'Subasta' : 'Directa'}</td>
                      <td className="px-4 py-4 text-sm font-semibold text-gray-900">{formatMoney(toNumber(r.price))}</td>
                      <td className="px-4 py-4 text-sm text-gray-700">
                        <div>{r.status}</div>
                        {r.is_deleted ? <div className="mt-1 text-xs text-gray-500">Archivada: {formatDateTime(r.deleted_at || null)}</div> : null}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <Link
                          href={`/listings/${r.id}`}
                          className="inline-flex rounded-xl bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-black/5 hover:bg-gray-50"
                        >
                          Ver
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

