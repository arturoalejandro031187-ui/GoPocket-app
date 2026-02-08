'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { FilterSidebar } from '@/components/FilterSidebar';
import { NEW_CATEGORIES_CONFIG, type Category } from '@/lib/categories';
import { FavoriteButton } from '@/components/FavoriteButton';
import { AuthModal } from '@/components/AuthModal';

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
  gender?: string | null;
  category?: string | null;
  subcategory?: string | null;
  tags?: string[] | null;
  size?: string | null;
};

function formatMoney(value: number) {
  return value.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function formatDate(iso: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

function getPrice(row: ListingRow) {
  const p = typeof row.price === 'number' ? row.price : Number(row.price ?? 0);
  return Number.isFinite(p) ? p : 0;
}

export interface ListingsClientProps {
  q?: string;
  initialGender?: string;
  initialCategory?: string;
  initialSubcategory?: string;
  initialTag?: string;
}

export default function ListingsClient({ 
  q,
  initialGender,
  initialCategory,
  initialSubcategory,
  initialTag
}: ListingsClientProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ListingRow[]>([]);
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  // Filter State
  const [selectedGender, setSelectedGender] = useState<string>(initialGender || '');
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory || '');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>(initialSubcategory || '');
  const [showFiltersMobile, setShowFiltersMobile] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Público: solo activos por RLS
        let query = supabase
          .from('listings')
          .select('id,public_id,title,description,price,currency,images,status,seller_id,created_at,condition,free_shipping,shipping_by_seller,gender,category,subcategory,tags,size')
          .eq('status', 'active')
          .order('created_at', { ascending: false });

        // Apply Search Query
        if (q) {
          // Buscar por título o por ID público (PCK-XXXX...)
          query = query.or(`title.ilike.%${q}%,public_id.ilike.%${q}%`);
        }

        // Apply Tag Filter (if provided via URL)
        if (initialTag) {
          query = query.contains('tags', [initialTag]);
        }

        // Apply Filters (Server-side)
        if (selectedGender) {
          query = query.eq('gender', selectedGender);
        }
        if (selectedCategory) {
          query = query.eq('category', selectedCategory);
        }
        if (selectedSubcategory) {
          query = query.eq('subcategory', selectedSubcategory);
        }

        query = query.limit(100); // Increased limit

        let { data, error: listErr } = await query;
        
        // Fallback for missing columns or search errors
        if (listErr) {
          const code = String((listErr as any)?.code || '');
          const msg = String((listErr as any)?.message || '');
          if (code === '42703' || msg.toLowerCase().includes('does not exist')) {
            // Retry without new columns
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
        
        // Client-side filtering for Smart Filters (Niños logic)
        // Since we can't easily do the size comparison in Supabase query without RPC or complex SQL
        let filteredData = (data as ListingRow[]) ?? [];

        if (selectedGender === 'Niños' || selectedGender === 'Niñas') {
           filteredData = filteredData.filter(p => {
              if (p.size) {
                 const s = parseFloat(p.size);
                 const isFootwear = p.category?.toLowerCase().match(/zapato|calzado|tenis|bota|sandalia/);
                 if (isFootwear && !isNaN(s) && s > 25) return false;
                 if (!isFootwear && !isNaN(s) && s > 16) return false;
              }
              return true;
           });
        }

        if (!cancelled) setRows(filteredData);
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
  }, [q, selectedGender, selectedCategory, selectedSubcategory]);

  const count = useMemo(() => rows.length, [rows]);

  // Derived filter options
  const availableCategories = useMemo(() => {
    if (!selectedGender) return [];
    return NEW_CATEGORIES_CONFIG[selectedGender] || [];
  }, [selectedGender]);

  const availableSubcategories = useMemo(() => {
    if (!selectedCategory) return [];
    const cat = availableCategories.find(c => c.label === selectedCategory);
    return cat?.subcategories || [];
  }, [availableCategories, selectedCategory]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 to-white">
      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
      
      <div className="sticky top-0 z-40 border-b border-black/5 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 items-center justify-center rounded-xl bg-brand-pink px-3 text-white shadow-sm">
              <span className="text-sm font-extrabold tracking-widest">GoPocket</span>
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-gray-900">Resultados</div>
              <div className="text-xs text-gray-500">{isLoading ? 'Cargando…' : `${count} resultados`}</div>
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

      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
           <div>
            {q && (
              <div className="text-lg text-gray-700">
                Resultados para: <span className="font-bold">{q}</span>
              </div>
            )}
           </div>
           <button
               onClick={() => setShowFiltersMobile(!showFiltersMobile)}
               className="sm:hidden rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-black/5 hover:bg-gray-50"
            >
              {showFiltersMobile ? 'Ocultar Filtros' : 'Filtrar'}
            </button>
        </div>

        <div className="flex flex-col gap-8 lg:flex-row">
           {/* Sidebar */}
           <aside className={`w-full lg:w-64 flex-shrink-0 ${showFiltersMobile ? 'block' : 'hidden lg:block'}`}>
            <div className="sticky top-24 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <FilterSidebar
                selectedGender={selectedGender}
                setSelectedGender={setSelectedGender}
                selectedCategory={selectedCategory}
                setSelectedCategory={setSelectedCategory}
                selectedSubcategory={selectedSubcategory}
                setSelectedSubcategory={setSelectedSubcategory}
                availableCategories={availableCategories}
                availableSubcategories={availableSubcategories}
                onClear={() => {
                  setSelectedGender('');
                  setSelectedCategory('');
                  setSelectedSubcategory('');
                }}
              />
            </div>
          </aside>

          {/* Grid/List */}
          <div className="flex-1">
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
              <div className={`grid gap-4 ${view === 'grid' ? 'sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'}`}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-72 rounded-3xl bg-white/70 ring-1 ring-black/5" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <div className="rounded-3xl bg-white p-10 text-center shadow-sm ring-1 ring-black/5">
                <div className="text-lg font-bold text-gray-900">No se encontraron resultados</div>
                <p className="mt-2 text-sm text-gray-600">Intenta con otros términos o filtros.</p>
              </div>
            ) : (
              <div className={`grid gap-4 ${view === 'grid' ? 'sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'}`}>
                {rows.map((p) => {
                  const img = (p.images ?? []).filter(Boolean)[0] ?? null;
                  const price = getPrice(p);
                  
                  if (view === 'list') {
                     return (
                        <Link key={p.id} href={`/listings/${p.id}`} className="block w-full">
                           <div className="flex gap-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5 hover:shadow-md transition-shadow">
                             <div className="h-32 w-32 shrink-0 overflow-hidden rounded-2xl bg-gray-100">
                               {img ? (
                                 // eslint-disable-next-line @next/next/no-img-element
                                 <img src={img} alt={p.title} className="h-full w-full object-cover" />
                               ) : (
                                 <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">Sin img</div>
                               )}
                             </div>
                             <div className="flex flex-1 flex-col justify-between">
                               <div>
                                 <div className="text-lg font-semibold text-gray-900">{p.title}</div>
                                 <div className="mt-1 text-sm text-gray-600 line-clamp-2">{p.description}</div>
                               </div>
                               <div className="mt-2 flex items-center justify-between">
                                  <div className="text-lg font-extrabold text-brand-pink">{formatMoney(price)}</div>
                                  <div className="text-xs text-gray-500">{formatDate(p.created_at)}</div>
                               </div>
                             </div>
                           </div>
                        </Link>
                     );
                  }

                  return (
                    <Link key={p.id} href={`/listings/${p.id}`} className="block w-full">
                      <div className="group h-full overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/5 hover:shadow-md transition-shadow">
                        <div className="relative aspect-[4/5] bg-gray-100">
                          {img ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={img}
                              alt={p.title}
                              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-sm text-gray-500">Sin imagen</div>
                          )}
                           <div className="absolute bottom-2 right-2 z-10 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                              <FavoriteButton listingId={p.id} onLoginRequired={() => setIsAuthOpen(true)} className="hover:bg-white" />
                           </div>
                        </div>
                        <div className="p-4">
                          <div className="line-clamp-1 text-sm font-semibold text-gray-900">{p.title}</div>
                          <div className="mt-1 text-sm font-extrabold text-brand-pink">{formatMoney(price)}</div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
