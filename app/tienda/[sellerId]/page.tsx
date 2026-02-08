'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { SellerStats } from '@/components/reputation/SellerStats';
import { SellerDisplay } from '@/components/SellerDisplay';

type ListingRow = {
  id: string;
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
};

function formatMoney(value: number) {
  return value.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function getPrice(row: ListingRow) {
  const p = typeof row.price === 'number' ? row.price : Number(row.price ?? 0);
  return Number.isFinite(p) ? p : 0;
}

export default function TiendaVendedorPage() {
  const p = useParams<{ sellerId: string }>();
  const sellerId = p?.sellerId ?? '';
  const [sellerName, setSellerName] = useState<string>('Vendedor');
  const [sellerState, setSellerState] = useState<string | null>(null);
  const [sellerCity, setSellerCity] = useState<string | null>(null);
  const [sellerPct, setSellerPct] = useState<number>(100);
  const [sellerBadge, setSellerBadge] = useState<string | null>(null);
  const [sellerIsVerified, setSellerIsVerified] = useState<boolean>(false);
  const [sellerOperationsCount, setSellerOperationsCount] = useState<number | null>(null);
  const [sellerPlanType, setSellerPlanType] = useState<string>('basic');
  const [sellerStoreLogo, setSellerStoreLogo] = useState<string | null>(null);
  const [sellerIsOfficial, setSellerIsOfficial] = useState<boolean>(false);
  const [sellerOfficialName, setSellerOfficialName] = useState<string | null>(null);
  const [sellerOfficialBanner, setSellerOfficialBanner] = useState<string | null>(null);
  const [sellerOfficialColor, setSellerOfficialColor] = useState<string | null>(null);
  const [sellerStats, setSellerStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ListingRow[]>([]);

  const badgeLabel =
    sellerBadge === 'platinum' ? 'Platinum' : sellerBadge === 'gold' ? 'Gold' : sellerBadge === 'plata' ? 'Plata' : null;

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const [sellerRes, reputationRes, listingsRes] = await Promise.all([
          fetch(`/api/sellers/${encodeURIComponent(sellerId)}`)
            .then(async (r) => {
              const json = await r.json().catch(() => ({}));
              console.log('[tienda] Seller API response:', { status: r.status, ok: r.ok, json });
              if (!r.ok) {
                console.warn('[tienda] Seller API failed:', json);
              }
              return json;
            })
            .catch((e) => {
              console.error('[tienda] Seller API fetch error:', e);
              return {};
            }),
          fetch(`/api/reputation/${encodeURIComponent(sellerId)}`).then((r) => r.json().catch(() => ({}))),
          (async () => {
            const run = async (useSellerCol: 'seller_id' | 'user_id', useStatusFilter: boolean) => {
              let q: any = supabase
                .from('listings')
                .select('id,title,description,price,currency,images,status,seller_id,created_at,condition,free_shipping')
                .eq(useSellerCol, sellerId)
                .order('created_at', { ascending: false })
                .limit(60);
              if (useStatusFilter) q = q.eq('status', 'active');
              return await q;
            };

            let res: any = await run('seller_id', true);
            if (res?.error) {
              const code = String((res.error as any)?.code || '');
              const msg = String((res.error as any)?.message || '').toLowerCase();
              if (code === '42703' || msg.includes('column') || msg.includes('does not exist')) {
                res = await run('user_id', true);
              }
              if (res?.error) {
                const code2 = String((res.error as any)?.code || '');
                const msg2 = String((res.error as any)?.message || '').toLowerCase();
                if (code2 === '22P02' && msg2.includes('enum') && msg2.includes('active')) {
                  res = await run('seller_id', false);
                  if (res?.error) res = await run('user_id', false);
                }
              }
            }
            return res;
          })(),
        ]);

        if (!cancelled) {
          if (sellerRes?.name) setSellerName(String(sellerRes.name));
          const state = sellerRes?.state ? String(sellerRes.state).trim() : null;
          setSellerState(state || null);
          const city = sellerRes?.city ? String(sellerRes.city).trim() : null;
          setSellerCity(city || null);
          const pct = typeof sellerRes?.rating_percent === 'number' ? sellerRes.rating_percent : Number(sellerRes?.rating_percent ?? 100);
          setSellerPct(Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 100);
          setSellerBadge(sellerRes?.badge ? String(sellerRes.badge) : null);
          setSellerIsVerified(Boolean(sellerRes?.is_verified ?? false));
          
          setSellerIsOfficial(Boolean(sellerRes?.is_official_store ?? false));
          setSellerOfficialName(sellerRes?.official_store_name || null);
          setSellerOfficialBanner(sellerRes?.official_store_banner_url || null);
          setSellerOfficialColor(sellerRes?.official_store_brand_color || null);

          const ops = typeof sellerRes?.operations_count === 'number' ? sellerRes.operations_count : typeof reputationRes?.operations_count === 'number' ? reputationRes.operations_count : null;
          setSellerOperationsCount(ops);

          // Cargar estadísticas del vendedor
          if (reputationRes?.stats) {
            setSellerStats(reputationRes.stats);
          } else if (reputationRes?.seller_stats) {
            setSellerStats(reputationRes.seller_stats);
          }
        }

        const { data, error: listErr } = listingsRes;
        if (listErr) throw listErr;
        if (!cancelled) setRows((data as ListingRow[]) ?? []);
      } catch (e: unknown) {
        // console.error(e);
        if (!cancelled) setError(e instanceof Error ? e.message : 'No se pudo cargar la tienda del vendedor.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void boot();
    return () => {
      cancelled = true;
    };
  }, [sellerId]);

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
              <div className="text-sm font-semibold text-gray-900">Tienda</div>
              <div className="text-xs text-gray-500">
                <div className="flex flex-wrap items-center gap-1">
                  <SellerDisplay
                    sellerId={sellerId}
                    sellerName={sellerName}
                    state={sellerState}
                    city={sellerCity}
                    isVerified={sellerIsVerified}
                    size="sm"
                    showUbicado={false}
                    className="inline"
                    hideLogo={true}
                    isOfficialStore={sellerIsOfficial}
                    officialStoreName={sellerOfficialName}
                  />
                  {isLoading ? ' · Cargando…' : ` · ${count} artículos`}
                </div>
                {(sellerState || sellerCity) && (
                  <div className="mt-0.5 text-xs text-gray-500">
                    Ubicado en <span className="font-semibold text-brand-pink">{[sellerState, sellerCity].filter(Boolean).join(', ').toUpperCase()}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/sell" className="rounded-xl bg-brand-pink px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90">
              Vender
            </Link>
            <Link
              href="/listings"
              className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-black/5 hover:bg-gray-50"
            >
              Explorar
            </Link>
            <Link
              href="/"
              className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-black/5 hover:bg-gray-50"
            >
              Inicio
            </Link>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        )}

        {sellerIsOfficial && sellerOfficialBanner && (
          <div className="mb-6 h-32 w-full overflow-hidden rounded-2xl bg-gray-100 sm:h-48">
            <img src={sellerOfficialBanner} alt={sellerName} className="h-full w-full object-cover" />
          </div>
        )}

        <div className="mb-6 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <SellerDisplay
                sellerId={sellerId}
                sellerName={sellerName}
                state={sellerState}
                city={sellerCity}
                isVerified={sellerIsVerified}
                operationsCount={sellerOperationsCount}
                size="md"
                hideLogo={true}
                isOfficialStore={sellerIsOfficial}
                officialStoreName={sellerOfficialName}
              />
            </div>
            <div className="rounded-2xl bg-gray-50 px-4 py-3 ring-1 ring-black/5">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">Reputación</div>
              <div className="mt-1 text-2xl font-extrabold text-gray-900">{Math.round(sellerPct)}%</div>
              {badgeLabel ? <div className="mt-1 text-xs text-gray-700">Insignia: {badgeLabel}</div> : null}
            </div>
          </div>
          <div className="mt-4">
            <Link href={`/perfil/${sellerId}`} className="text-sm font-semibold text-gray-900 hover:text-brand-pink">
              Termómetro de comportamiento →
            </Link>
          </div>
          <div className="mt-2">
            <div className="relative">
              {/* Badge con porcentaje y flecha */}
              <div className="absolute -top-6" style={{ left: `calc(${Math.max(0, Math.min(100, sellerPct))}% - 20px)` }}>
                <div className="flex flex-col items-center">
                  <div className={`rounded-lg px-2.5 py-1 text-xs font-extrabold ring-1 shadow-sm ${
                    sellerPct >= 80 
                      ? 'bg-green-100 text-green-800 ring-green-200' 
                      : sellerPct >= 55 
                      ? 'bg-amber-100 text-amber-800 ring-amber-200' 
                      : sellerPct >= 1
                      ? 'bg-red-100 text-red-800 ring-red-200'
                      : 'bg-gray-100 text-gray-800 ring-gray-200'
                  }`}>
                    {Math.round(sellerPct)}%
                  </div>
                  <div
                    className={`h-0 w-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent ${
                      sellerPct >= 80 
                        ? 'border-t-green-600' 
                        : sellerPct >= 55 
                        ? 'border-t-amber-600' 
                        : sellerPct >= 1
                        ? 'border-t-red-600'
                        : 'border-t-gray-600'
                    }`}
                    aria-hidden="true"
                  />
                </div>
              </div>

              {/* Barra de progreso */}
              <div className="relative h-3 overflow-hidden rounded-full bg-gray-200 ring-1 ring-black/5">
                <div
                  className="absolute inset-0"
                  style={{
                    background: 'linear-gradient(90deg, #ef4444 0%, #f59e0b 35%, #22c55e 100%)',
                    opacity: 0.9,
                  }}
                />
                {/* Línea marcadora */}
                <div 
                  className="absolute inset-y-0 w-[2px] bg-white/90 shadow" 
                  style={{ left: `calc(${Math.max(0, Math.min(100, sellerPct))}% - 1px)` }} 
                  aria-hidden="true" 
                />
              </div>
            </div>
          </div>
          
          {/* Estadísticas del vendedor */}
          {sellerStats && (
            <div className="mt-6">
              <SellerStats stats={sellerStats} />
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="h-72 rounded-3xl bg-white/70 ring-1 ring-black/5" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-3xl bg-white p-10 text-center shadow-sm ring-1 ring-black/5">
            <div className="text-lg font-bold text-gray-900">No hay artículos activos</div>
            <p className="mt-2 text-sm text-gray-600">Este vendedor aún no tiene publicaciones disponibles.</p>
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
                      <div className="absolute top-2 left-2 z-10">
                        <div className="rounded-lg bg-blue-500/80 px-2 py-1 text-[10px] font-extrabold text-white shadow-sm backdrop-blur-sm">
                          Envío gratis
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
                    <div className="mt-1 text-sm font-extrabold text-brand-pink">{formatMoney(price)}</div>
                    <div className="mt-2 line-clamp-2 text-xs text-gray-600">{r.description || '—'}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

