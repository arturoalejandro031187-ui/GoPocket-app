'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { DynamicFeaturedCarousel } from '@/components/listings/DynamicFeaturedCarousel';

type Row = {
  id: string;
  title: string;
  description?: string | null;
  price: number | string;
  images: string[] | null;
  public_id?: string | null;
  free_shipping?: boolean | null;
};

function money(v: any) {
  const n = typeof v === 'number' ? v : Number(v ?? 0);
  return (Number.isFinite(n) ? n : 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

export default function EnvioGratisPage() {
  const [isBooting, setIsBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setIsBooting(true);
        setError(null);

        let res: any = await supabase
          .from('listings')
          .select('id,title,description,price,images,public_id,free_shipping')
          .eq('status', 'active')
          .eq('free_shipping', true)
          .order('created_at', { ascending: false })
          .limit(60);

        if (res?.error) {
          const code = String(res.error?.code || '');
          const msg = String(res.error?.message || '');
          if (code === '42703' || msg.toLowerCase().includes('does not exist')) {
            throw new Error('Tu BD aún no tiene `free_shipping`. Ejecuta `supabase_shipping_features.sql` en Supabase y recarga.');
          }
          throw res.error;
        }

        if (!cancelled) setRows((res.data as Row[]) ?? []);
      } catch (e: unknown) {
        console.error(e);
        if (!cancelled) setError(e instanceof Error ? e.message : 'No se pudo cargar Envío gratis.');
      } finally {
        if (!cancelled) setIsBooting(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const items = useMemo(() => rows ?? [], [rows]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 to-white">
      <div className="sticky top-0 z-40 border-b border-black/5 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex h-10 items-center justify-center rounded-xl bg-brand-pink px-3 text-white shadow-sm hover:opacity-95">
              <span className="text-sm font-extrabold tracking-widest">GoPocket</span>
            </Link>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-gray-900">Envío gratis</div>
              <div className="text-xs text-gray-500">Publicaciones con envío gratis</div>
            </div>
          </div>
          <Link href="/" className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-black/5 hover:bg-gray-50">
            Volver
          </Link>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {/* Carrusel de destacados */}
        <section className="mb-8">
          <DynamicFeaturedCarousel type="free_shipping" title="Destacados con Envío Gratis" />
        </section>

        {error && <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-lg font-bold text-gray-900">Selección: Envío gratis</div>
              <div className="mt-1 text-sm text-gray-600">El vendedor absorbe el costo del envío.</div>
            </div>
            <Link href="/listings" className="text-sm font-semibold text-brand-pink hover:opacity-90">
              Explorar todo
            </Link>
          </div>

          {isBooting ? (
            <div className="mt-6 text-sm text-gray-600">Cargando…</div>
          ) : items.length === 0 ? (
            <div className="mt-6 text-sm text-gray-600">Aún no hay publicaciones con envío gratis.</div>
          ) : (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((p) => {
                const img = (p.images ?? []).filter(Boolean)[0] ?? null;
                return (
                  <Link key={p.id} href={`/listings/${p.id}`} className="group overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/5 hover:shadow-md transition-shadow">
                    <div className="relative aspect-[4/5] bg-gray-100">
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={img} alt="" className="h-full w-full object-cover" draggable={false} />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-sm text-gray-500">Sin imagen</div>
                      )}
                      <div className="absolute left-3 top-3 rounded-full bg-gray-900 px-3 py-1 text-xs font-extrabold text-white shadow">
                        Envío gratis
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="line-clamp-1 text-sm font-semibold text-gray-900">{p.title}</div>
                        {p.public_id ? (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">ID: {p.public_id}</span>
                        ) : null}
                      </div>
                      {p.description ? <div className="mt-1 line-clamp-2 text-xs text-gray-600">{p.description}</div> : null}
                      <div className="mt-2 text-sm font-extrabold text-gray-900">{money(p.price)}</div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

