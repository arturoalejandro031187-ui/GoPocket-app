'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

type ListingRow = {
  id: string;
  public_id?: string | null;
  title: string;
  description: string | null;
  price: number | string;
  currency: string;
  images: string[] | null;
  status: 'draft' | 'active' | 'sold' | 'paused' | 'blocked';
  seller_id: string;
  created_at: string;
  condition?: 'nuevo' | 'usado' | 'casi_nuevo' | null;
  free_shipping?: boolean | null;
  shipping_by_seller?: boolean | null;
};

function formatMoney(value: number) {
  return value.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function formatDate(input: string) {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: '2-digit' });
}

function getPrice(row: ListingRow) {
  const p = typeof row.price === 'number' ? row.price : Number(row.price ?? 0);
  return Number.isFinite(p) ? p : 0;
}

export default function ListingsClient({ q }: { q: string }) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ListingRow[]>([]);
  const [view, setView] = useState<'list' | 'grid'>('list');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Público: solo activos por RLS
        let query = supabase
          .from('listings')
          .select('id,public_id,title,description,price,currency,images,status,seller_id,created_at,condition,free_shipping,shipping_by_seller')
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(60);

        if (q) {
          // Buscar por título o por ID público (PCK-XXXX...)
          query = query.or(`title.ilike.%${q}%,public_id.ilike.%${q}%`);
        }

        let { data, error: listErr } = await query;
        // Si aún no existe la columna public_id, fallback a búsqueda por título
        if (listErr) {
          const code = String((listErr as any)?.code || '');
          const msg = String((listErr as any)?.message || '');
          if (code === '42703' || msg.toLowerCase().includes('does not exist')) {
            let q2 = supabase
              .from('listings')
              .select('id,title,description,price,currency,images,status,seller_id,created_at,condition,free_shipping,shipping_by_seller')
              .eq('status', 'active')
              .order('created_at', { ascending: false })
              .limit(60);
            if (q) q2 = q2.ilike('title', `%${q}%`);
            const r2 = await q2;
            data = r2.data as any;
            listErr = r2.error as any;
          }
        }

        if (listErr) throw listErr;
        if (!cancelled) setRows((data as ListingRow[]) ?? []);
      } catch (err: unknown) {
        console.error(err);
        if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudieron cargar las publicaciones.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [q]);

  const count = useMemo(() => rows.length, [rows]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 to-white">
      <div className="sticky top-0 z-40 border-b border-black/5 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 items-center justify-center rounded-xl bg-brand-pink px-3 text-white shadow-sm">
              <span className="text-sm font-extrabold tracking-widest">GoPocket</span>
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-gray-900">Explorar</div>
              <div className="text-xs text-gray-500">{isLoading ? 'Cargando…' : `${count} publicaciones`}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/sell"
              className="rounded-xl bg-brand-pink px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90"
            >
              Vender
            </Link>
            <Link
              href="/"
              className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-black/5 hover:bg-gray-50"
            >
              Inicio
            </Link>
            <Link
              href="/cart"
              className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-black/5 hover:bg-gray-50"
            >
              <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              Carrito
            </Link>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {q && (
          <div className="mb-4 rounded-2xl border border-black/5 bg-white px-4 py-3 text-sm text-gray-700">
            Mostrando resultados para: <span className="font-semibold">{q}</span>
          </div>
        )}

        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-gray-900">{isLoading ? 'Cargando…' : `${count} publicaciones`}</div>
          <div className="inline-flex overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-black/5">
            <button
              type="button"
              onClick={() => setView('list')}
              className={[
                'px-3 py-2 text-sm font-semibold',
                view === 'list' ? 'bg-pink-50 text-brand-pink' : 'text-gray-800 hover:bg-gray-50',
              ].join(' ')}
            >
              Lista
            </button>
            <button
              type="button"
              onClick={() => setView('grid')}
              className={[
                'px-3 py-2 text-sm font-semibold',
                view === 'grid' ? 'bg-pink-50 text-brand-pink' : 'text-gray-800 hover:bg-gray-50',
              ].join(' ')}
            >
              Cuadrícula
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="h-72 rounded-3xl bg-white/70 ring-1 ring-black/5" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-3xl bg-white p-10 text-center shadow-sm ring-1 ring-black/5">
            <div className="text-lg font-bold text-gray-900">Aún no hay publicaciones</div>
            <p className="mt-2 text-sm text-gray-600">Sé el primero en publicar un artículo.</p>
            <div className="mt-6">
              <Link
                href="/sell"
                className="inline-flex rounded-xl bg-brand-pink px-5 py-3 text-sm font-semibold text-white shadow-lg hover:opacity-90"
              >
                Publicar ahora
              </Link>
            </div>
          </div>
        ) : (
          view === 'list' ? (
            <div className="space-y-3">
              {rows.map((r) => {
                const img = (r.images ?? []).filter(Boolean)[0] ?? null;
                const price = getPrice(r);
                return (
                  <Link
                    key={r.id}
                    href={`/listings/${r.id}`}
                    className="flex items-center gap-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5 hover:bg-gray-50"
                  >
                    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-gray-100 ring-1 ring-black/5 sm:h-24 sm:w-24">
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={img} alt={r.title} className="h-full w-full object-cover" draggable={false} />
                      ) : null}
                      {/* Etiquetas de condición y envío gratis */}
                      <div className="absolute top-1 left-1 flex flex-wrap gap-1">
                        {r.condition === 'nuevo' && (
                          <div className="rounded bg-green-500/50 px-1.5 py-0.5 text-[9px] font-extrabold text-white shadow-sm backdrop-blur-sm">
                            Nuevo
                          </div>
                        )}
                        {r.condition === 'casi_nuevo' && (
                          <div className="rounded bg-amber-500/50 px-1.5 py-0.5 text-[9px] font-extrabold text-white shadow-sm backdrop-blur-sm">
                            Casi Nuevo
                          </div>
                        )}
                        {r.condition === 'usado' && (
                          <div className="rounded bg-pink-500/50 px-1.5 py-0.5 text-[9px] font-extrabold text-white shadow-sm backdrop-blur-sm">
                            Usado
                          </div>
                        )}
                        {r.free_shipping && (
                          <div className="rounded bg-blue-500/80 px-1.5 py-0.5 text-[9px] font-extrabold text-white shadow-sm backdrop-blur-sm">
                            Envío gratis
                          </div>
                        )}
                        <div className="rounded bg-gray-800/80 px-1.5 py-0.5 text-[9px] font-extrabold text-white shadow-sm backdrop-blur-sm">
                          {r.shipping_by_seller ? 'ENVIO ACORDAR CON EL VENDEDOR' : 'Envío Enviado por GoPocket'}
                        </div>
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate text-sm font-semibold text-gray-900">{r.title}</div>
                        {r.public_id ? (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
                            ID: {r.public_id}
                          </span>
                        ) : null}
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
                          Inicio: {formatDate(r.created_at)}
                        </span>
                      </div>
                      <div className="mt-1 text-sm font-extrabold text-brand-pink">{formatMoney(price)}</div>
                      <div className="mt-1 line-clamp-1 text-xs text-gray-600">{r.description || '—'}</div>
                    </div>
                    <div className="shrink-0 text-xs font-semibold text-gray-500">Ver</div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((r) => {
                const img = (r.images ?? []).filter(Boolean)[0] ?? null;
                const price = getPrice(r);
                return (
                  <Link
                    key={r.id}
                    href={`/listings/${r.id}`}
                    className="group overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/5 hover:shadow-md transition-shadow"
                  >
                    <div className="relative aspect-[4/5] bg-gray-100">
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={img}
                          alt={r.title}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                          draggable={false}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-sm text-gray-500">Sin imagen</div>
                      )}
                      {r.free_shipping && (
                        <div className="absolute top-2 left-2 z-10 flex flex-col gap-1">
                          <div className="w-fit rounded-lg bg-blue-500/80 px-2 py-1 text-[10px] font-extrabold text-white shadow-sm backdrop-blur-sm">
                            Envío gratis
                          </div>
                          <div className="w-fit rounded-lg bg-gray-800/80 px-2 py-1 text-[10px] font-extrabold text-white shadow-sm backdrop-blur-sm">
                             {r.shipping_by_seller ? 'ENVIO ACORDAR CON EL VENDEDOR' : 'Envío Enviado por GoPocket'}
                          </div>
                        </div>
                      )}
                      {!r.free_shipping && (
                         <div className="absolute top-2 left-2 z-10">
                            <div className="w-fit rounded-lg bg-gray-800/80 px-2 py-1 text-[10px] font-extrabold text-white shadow-sm backdrop-blur-sm">
                               {r.shipping_by_seller ? 'ENVIO ACORDAR CON EL VENDEDOR' : 'Envío Enviado por GoPocket'}
                            </div>
                         </div>
                      )}
                      {r.condition && (
                        <div className="absolute bottom-2 right-2 z-10">
                          {r.condition === 'nuevo' && (
                            <div className="rounded-lg bg-green-500/50 px-2 py-1 text-[10px] font-extrabold text-white shadow-sm backdrop-blur-sm">
                              Nuevo
                            </div>
                          )}
                          {r.condition === 'casi_nuevo' && (
                            <div className="rounded-lg bg-pink-500/50 px-2 py-1 text-[10px] font-extrabold text-white shadow-sm backdrop-blur-sm">
                              Casi Nuevo
                            </div>
                          )}
                          {r.condition === 'usado' && (
                            <div className="rounded-lg bg-yellow-500/50 px-2 py-1 text-[10px] font-extrabold text-white shadow-sm backdrop-blur-sm">
                              Usado
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      <div className="line-clamp-1 text-sm font-semibold text-gray-900">{r.title}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs font-semibold text-gray-500">
                        {r.public_id ? <span>ID: {r.public_id}</span> : null}
                        <span>Inicio: {formatDate(r.created_at)}</span>
                      </div>
                      <div className="mt-1 text-sm font-extrabold text-brand-pink">{formatMoney(price)}</div>
                      <div className="mt-2 line-clamp-2 text-xs text-gray-600">{r.description || '—'}</div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )
        )}
      </main>
    </div>
  );
}

