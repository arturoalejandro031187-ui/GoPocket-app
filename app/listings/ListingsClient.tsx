
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
  initialGender?: string | string[];
  initialCategory?: string | string[];
  initialSubcategory?: string | string[];
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
  const [totalCount, setTotalCount] = useState(0);
  const [view, setView] = useState<'list' | 'grid'>('grid');
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  // Filter State (Arrays for Multi-select)
  const [selectedGenders, setSelectedGenders] = useState<string[]>(
    Array.isArray(initialGender) ? initialGender : initialGender ? [initialGender] : []
  );
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    Array.isArray(initialCategory) ? initialCategory : initialCategory ? [initialCategory] : []
  );
  const [selectedSubcategories, setSelectedSubcategories] = useState<string[]>(
    Array.isArray(initialSubcategory) ? initialSubcategory : initialSubcategory ? [initialSubcategory] : []
  );
  const [showFiltersMobile, setShowFiltersMobile] = useState(false);

  // Pagination & Sort
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 24;
  const [sort, setSort] = useState<'date_desc' | 'date_asc' | 'price_asc' | 'price_desc' | 'relevant'>('date_desc');

  // Debounced Search Query (if we want real-time typing)
  // For now, we rely on the prop 'q' passed from the server page, which comes from URL.
  // To support real-time, we would need to update the URL or local state.
  // The user asked for "Search in real time". Let's use local state initialized with q.
  const [searchQuery, setSearchQuery] = useState(q || '');

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [searchQuery, selectedGenders, selectedCategories, selectedSubcategories, sort]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Build Query
        let query = supabase
          .from('listings')
          .select('id,public_id,title,description,price,currency,images,status,seller_id,created_at,condition,free_shipping,shipping_by_seller,gender,category,subcategory,tags,size', { count: 'exact' })
          .eq('status', 'active');

        // Apply Search Query
        if (searchQuery) {
          query = query.or(`title.ilike.%${searchQuery}%,public_id.ilike.%${searchQuery}%`);
        }

        // Apply Tag Filter
        if (initialTag) {
          query = query.contains('tags', [initialTag]);
        }

        // Apply Multi-select Filters
        if (selectedGenders.length > 0) {
          query = query.in('gender', selectedGenders);
        }
        if (selectedCategories.length > 0) {
          query = query.in('category', selectedCategories);
        }
        if (selectedSubcategories.length > 0) {
          query = query.in('subcategory', selectedSubcategories);
        }

        // Apply Sorting
        if (sort === 'price_asc') {
          query = query.order('price', { ascending: true });
        } else if (sort === 'price_desc') {
          query = query.order('price', { ascending: false });
        } else if (sort === 'date_asc') {
          query = query.order('created_at', { ascending: true });
        } else if (sort === 'date_desc' || sort === 'relevant') {
          // Default to newest for relevant for now (unless we have TS_RANK)
          query = query.order('created_at', { ascending: false });
        }

        // Apply Pagination
        const from = (page - 1) * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        query = query.range(from, to);

        const { data, error: listErr, count } = await query;
        
        if (listErr) throw listErr;
        
        let filteredData = (data as ListingRow[]) ?? [];

        // Client-side filtering for Smart Filters (Niños logic)
        // Note: This might mess up pagination counts if we filter heavily on client.
        // Ideally this should be in SQL. For now, keeping as is but aware of limitation.
        if (selectedGenders.includes('Niños') || selectedGenders.includes('Niñas')) {
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

        if (!cancelled) {
          setRows(filteredData);
          setTotalCount(count || 0);
        }
      } catch (err: unknown) {
        console.error(err);
        if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudieron cargar las publicaciones.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    // Debounce load if typing
    const timeoutId = setTimeout(() => {
      load();
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [searchQuery, selectedGenders, selectedCategories, selectedSubcategories, sort, page, initialTag]);

  // Derived filter options
  const availableCategories = useMemo(() => {
    if (selectedGenders.length === 0) return [];
    // Flatten categories from all selected genders
    return selectedGenders.flatMap(g => NEW_CATEGORIES_CONFIG[g] || []);
  }, [selectedGenders]);

  const availableSubcategories = useMemo(() => {
    if (selectedCategories.length === 0) return [];
    // Flatten subcategories from all selected categories (match by label)
    // We need to search across availableCategories
    return availableCategories
      .filter(c => selectedCategories.includes(c.label))
      .flatMap(c => c.subcategories || []);
  }, [availableCategories, selectedCategories]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 to-white pb-20">
      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
      
      {/* Search Header */}
      <div className="sticky top-0 z-40 border-b border-black/5 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-4 flex-1">
             <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
               <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-pink text-white shadow-lg shadow-brand-pink/20">
                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                   <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" />
                 </svg>
               </div>
               <span className="hidden sm:block text-xl font-extrabold tracking-tight text-gray-900">GoPocket</span>
             </Link>

            {/* Real-time Search Input */}
            <div className="relative flex-1 max-w-2xl">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar productos, marcas y más..."
                className="w-full rounded-2xl border-0 bg-gray-100 py-3 pl-11 pr-4 text-gray-900 shadow-inner ring-1 ring-inset ring-gray-200 placeholder:text-gray-500 focus:bg-white focus:ring-2 focus:ring-brand-pink transition-all"
              />
            </div>
          </div>

          <div className="hidden md:flex items-center gap-3 pl-4">
            <Link
              href="/sell"
              className="rounded-xl bg-brand-pink px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-brand-pink/25 hover:shadow-brand-pink/40 hover:-translate-y-0.5 transition-all"
            >
              Vender
            </Link>
            <Link
              href="/cart"
              className="relative rounded-xl p-2.5 text-gray-500 hover:bg-gray-100 transition-colors"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            </Link>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
           <div className="flex items-baseline gap-2">
             <h1 className="text-2xl font-bold text-gray-900">
               {searchQuery ? `Resultados para "${searchQuery}"` : 'Explorar'}
             </h1>
             <span className="text-sm text-gray-500">({totalCount} productos)</span>
           </div>
           
           <div className="flex items-center gap-3">
             {/* Sort Dropdown */}
             <select 
               value={sort} 
               onChange={(e) => setSort(e.target.value as any)}
               className="rounded-xl border-gray-200 bg-white py-2 pl-3 pr-8 text-sm font-semibold text-gray-700 focus:border-brand-pink focus:ring-brand-pink"
             >
               <option value="relevant">Más relevantes</option>
               <option value="price_asc">Menor precio</option>
               <option value="price_desc">Mayor precio</option>
               <option value="date_desc">Más recientes</option>
               <option value="date_asc">Más antiguos</option>
             </select>

             {/* View Toggle */}
             <div className="hidden sm:inline-flex overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-black/5">
                <button
                  onClick={() => setView('list')}
                  className={`p-2 ${view === 'list' ? 'bg-pink-50 text-brand-pink' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                </button>
                <button
                  onClick={() => setView('grid')}
                  className={`p-2 ${view === 'grid' ? 'bg-pink-50 text-brand-pink' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                </button>
             </div>

             <button
                 onClick={() => setShowFiltersMobile(!showFiltersMobile)}
                 className="lg:hidden rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-black/5 hover:bg-gray-50"
              >
                Filtros
              </button>
           </div>
        </div>

        <div className="flex flex-col gap-8 lg:flex-row">
           {/* Sidebar */}
           <aside className={`w-full lg:w-64 flex-shrink-0 ${showFiltersMobile ? 'block' : 'hidden lg:block'}`}>
            <div className="sticky top-28 rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
              <FilterSidebar
                selectedGenders={selectedGenders}
                setSelectedGenders={setSelectedGenders}
                selectedCategories={selectedCategories}
                setSelectedCategories={setSelectedCategories}
                selectedSubcategories={selectedSubcategories}
                setSelectedSubcategories={setSelectedSubcategories}
                availableCategories={availableCategories}
                availableSubcategories={availableSubcategories}
                onClear={() => {
                  setSelectedGenders([]);
                  setSelectedCategories([]);
                  setSelectedSubcategories([]);
                }}
              />
            </div>
          </aside>

          {/* Grid/List */}
          <div className="flex-1">
            {error && (
              <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </div>
            )}

            {isLoading ? (
              <div className={`grid gap-4 ${view === 'grid' ? 'grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'grid-cols-1'}`}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="aspect-[3/4] rounded-3xl bg-white/50 animate-pulse ring-1 ring-black/5" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-3xl bg-white p-12 text-center shadow-sm ring-1 ring-black/5">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
                  <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-900">No encontramos lo que buscas</h3>
                <p className="mt-2 text-gray-500 max-w-sm">Intenta usar términos más generales o elimina algunos filtros.</p>
                <button 
                  onClick={() => {
                    setSelectedGenders([]);
                    setSelectedCategories([]);
                    setSelectedSubcategories([]);
                    setSearchQuery('');
                  }}
                  className="mt-6 text-brand-pink font-semibold hover:underline"
                >
                  Limpiar búsqueda
                </button>
              </div>
            ) : (
              <>
                <div className={`grid gap-4 ${view === 'grid' ? 'grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'grid-cols-1'}`}>
                  {rows.map((p) => {
                    const img = (p.images ?? []).filter(Boolean)[0] ?? null;
                    const price = getPrice(p);
                    
                    if (view === 'list') {
                       return (
                          <Link key={p.id} href={`/listings/${p.id}`} className="block w-full group">
                             <div className="flex gap-4 rounded-3xl bg-white p-3 shadow-sm ring-1 ring-black/5 hover:shadow-lg hover:ring-brand-pink/20 transition-all duration-300">
                               <div className="relative h-40 w-40 shrink-0 overflow-hidden rounded-2xl bg-gray-100">
                                 {img ? (
                                   // eslint-disable-next-line @next/next/no-img-element
                                   <img src={img} alt={p.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" />
                                 ) : (
                                   <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">Sin img</div>
                                 )}
                               </div>
                               <div className="flex flex-1 flex-col justify-between py-1 pr-2">
                                 <div>
                                   <div className="flex items-start justify-between">
                                      <div className="text-xs font-medium text-gray-500 mb-1">{p.category}</div>
                                      <FavoriteButton listingId={p.id} onLoginRequired={() => setIsAuthOpen(true)} className="text-gray-400 hover:text-red-500" />
                                   </div>
                                   <div className="text-lg font-bold text-gray-900 line-clamp-2 group-hover:text-brand-pink transition-colors">{p.title}</div>
                                 </div>
                                 <div className="flex items-end justify-between">
                                    <div className="text-2xl font-extrabold text-gray-900">{formatMoney(price)}</div>
                                    <div className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">{p.condition}</div>
                                 </div>
                               </div>
                             </div>
                          </Link>
                       );
                    }

                    return (
                      <Link key={p.id} href={`/listings/${p.id}`} className="block w-full group">
                        <div className="relative h-full overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/5 hover:shadow-lg hover:ring-brand-pink/20 transition-all duration-300">
                          <div className="relative aspect-[4/5] bg-gray-100 overflow-hidden">
                            {img ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={img}
                                alt={p.title}
                                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-sm text-gray-500">Sin imagen</div>
                            )}
                             <div className="absolute top-3 right-3 z-10" onClick={(e) => e.preventDefault()}>
                                <FavoriteButton listingId={p.id} onLoginRequired={() => setIsAuthOpen(true)} className="bg-white/90 shadow-sm hover:bg-white p-2 rounded-full" />
                             </div>
                             {p.shipping_by_seller && (
                               <div className="absolute bottom-3 left-3 rounded-lg bg-black/70 backdrop-blur px-2 py-1 text-[10px] font-bold text-white">
                                 ENVÍO GRATIS
                               </div>
                             )}
                          </div>
                          <div className="p-4">
                            <div className="text-xs text-gray-500 mb-1 line-clamp-1">{p.category} &rsaquo; {p.subcategory}</div>
                            <div className="line-clamp-2 text-sm font-medium text-gray-900 group-hover:text-brand-pink transition-colors h-10">{p.title}</div>
                            <div className="mt-2 text-lg font-extrabold text-gray-900">{formatMoney(price)}</div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>

                {/* Pagination Controls */}
                {totalCount > PAGE_SIZE && (
                  <div className="mt-12 flex justify-center gap-2">
                    <button
                      disabled={page === 1}
                      onClick={() => setPage(p => p - 1)}
                      className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-600 disabled:opacity-50 hover:bg-gray-50"
                    >
                      Anterior
                    </button>
                    <div className="flex items-center px-4 text-sm font-semibold text-gray-900">
                      Página {page} de {Math.ceil(totalCount / PAGE_SIZE)}
                    </div>
                    <button
                      disabled={page * PAGE_SIZE >= totalCount}
                      onClick={() => setPage(p => p + 1)}
                      className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-600 disabled:opacity-50 hover:bg-gray-50"
                    >
                      Siguiente
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
