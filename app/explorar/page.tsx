'use client';

import Link from 'next/link';
import { useEffect, useState, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { FavoriteButton } from '@/components/FavoriteButton';
import { AuthModal } from '@/components/AuthModal';

type ListingPreview = {
  id: string;
  title: string;
  description: string | null;
  price: number | string;
  images: string[] | null;
  condition?: 'nuevo' | 'usado' | 'casi_nuevo' | null;
  free_shipping?: boolean | null;
};

const ITEMS_PER_PAGE = 24;

function formatMoney(value: number) {
  return value.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function getPrice(value: number | string) {
  const n = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

// Función para mezclar array aleatoriamente (Fisher-Yates)
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function ExplorarContent() {
  const searchParams = useSearchParams();
  const currentPage = parseInt(searchParams.get('page') || '1', 10);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allListings, setAllListings] = useState<ListingPreview[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Obtener el conteo total
        const { count, error: countErr } = await supabase
          .from('listings')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'active');

        if (countErr) {
          console.error('Error al contar:', countErr);
        } else if (!cancelled) {
          setTotalCount(count || 0);
        }

        // Obtener todos los productos activos
        let query = supabase
          .from('listings')
          .select('id,title,description,price,images,condition,free_shipping')
          .eq('status', 'active')
          .order('created_at', { ascending: false });

        const { data, error: listErr } = await query;

        if (listErr) {
          const code = String((listErr as any)?.code || '');
          const msg = String((listErr as any)?.message || '');
          if (code === '42703' || msg.toLowerCase().includes('does not exist')) {
            // Fallback sin campos nuevos
            let q2 = supabase
              .from('listings')
              .select('id,title,description,price,images')
              .eq('status', 'active')
              .order('created_at', { ascending: false });
            const r2 = await q2;
            if (r2.error) throw r2.error;
            if (!cancelled) {
              const shuffled = shuffleArray((r2.data as ListingPreview[]) ?? []);
              setAllListings(shuffled);
            }
            return;
          }
          throw listErr;
        }

        if (!cancelled) {
          // Mezclar los productos aleatoriamente una sola vez
          const shuffled = shuffleArray((data as ListingPreview[]) ?? []);
          setAllListings(shuffled);
        }
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
  }, []);

  // Calcular productos de la página actual
  const paginatedListings = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return allListings.slice(startIndex, endIndex);
  }, [allListings, currentPage]);

  // Calcular total de páginas
  const totalPages = useMemo(() => {
    return Math.ceil(allListings.length / ITEMS_PER_PAGE);
  }, [allListings.length]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 py-10">
          <div className="text-center">
            <div className="text-lg font-semibold text-gray-900">Cargando productos...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 py-10">
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
      
      <div className="mx-auto max-w-7xl px-4 py-6 sm:py-10">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl">Explorar productos</h1>
            <p className="mt-1 text-sm text-gray-600">Descubre ofertas y prendas únicas</p>
          </div>
          <Link
            href="/"
            className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-black/5 hover:bg-gray-50"
          >
            Volver
          </Link>
        </div>

        {allListings.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center">
            <div className="text-lg font-semibold text-gray-900">No hay productos disponibles</div>
            <div className="mt-2 text-sm text-gray-600">Vuelve más tarde para ver nuevas publicaciones.</div>
          </div>
        ) : (
          <>
            <div className="mb-4 text-sm text-gray-600">
              Mostrando {paginatedListings.length} de {allListings.length} productos
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {paginatedListings.map((p) => {
              const img = (p.images ?? []).filter(Boolean)[0] ?? null;
              const price = getPrice(p.price);
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
                          draggable={false}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-sm text-gray-500">Sin imagen</div>
                      )}
                      {/* Etiquetas de condición y envío gratis */}
                      <div className="absolute top-2 left-2 flex flex-wrap gap-2 z-10">
                        {p.free_shipping && (
                          <div className="rounded-lg bg-blue-500/50 px-2 py-1 text-[10px] font-extrabold text-white shadow-sm backdrop-blur-sm">
                            Envío gratis
                          </div>
                        )}
                      </div>
                      <div className="absolute bottom-2 right-2 z-10 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        {p.condition === 'nuevo' && (
                          <div className="rounded-lg bg-green-500/50 px-2 py-1 text-[10px] font-extrabold text-white shadow-sm backdrop-blur-sm">
                            Nuevo
                          </div>
                        )}
                        {p.condition === 'casi_nuevo' && (
                          <div className="rounded-lg bg-pink-500/50 px-2 py-1 text-[10px] font-extrabold text-white shadow-sm backdrop-blur-sm">
                            Casi Nuevo
                          </div>
                        )}
                        {p.condition === 'usado' && (
                          <div className="rounded-lg bg-yellow-500/50 px-2 py-1 text-[10px] font-extrabold text-white shadow-sm backdrop-blur-sm">
                            Usado
                          </div>
                        )}
                        <FavoriteButton
                          listingId={p.id}
                          onLoginRequired={() => setIsAuthOpen(true)}
                          className="hover:bg-white"
                        />
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

            {/* Paginación */}
            {totalPages > 1 && (
              <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
                {/* Botón Anterior */}
                {currentPage > 1 && (
                  <Link
                    href={`/explorar?page=${currentPage - 1}`}
                    className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-black/5 hover:bg-gray-50"
                  >
                    ‹ Anterior
                  </Link>
                )}

                {/* Números de página */}
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
                  // Mostrar siempre la primera y última página
                  // Mostrar páginas cercanas a la actual (2 páginas antes y después)
                  const showPage =
                    pageNum === 1 ||
                    pageNum === totalPages ||
                    (pageNum >= currentPage - 2 && pageNum <= currentPage + 2);

                  if (!showPage) {
                    // Mostrar puntos suspensivos
                    if (pageNum === currentPage - 3 || pageNum === currentPage + 3) {
                      return (
                        <span key={pageNum} className="px-2 text-sm text-gray-500">
                          ...
                        </span>
                      );
                    }
                    return null;
                  }

                  return (
                    <Link
                      key={pageNum}
                      href={`/explorar?page=${pageNum}`}
                      className={`rounded-xl px-4 py-2 text-sm font-semibold shadow-sm ring-1 transition-colors ${
                        pageNum === currentPage
                          ? 'bg-brand-pink text-white ring-brand-pink'
                          : 'bg-white text-gray-900 ring-black/5 hover:bg-gray-50'
                      }`}
                    >
                      {pageNum}
                    </Link>
                  );
                })}

                {/* Botón Siguiente */}
                {currentPage < totalPages && (
                  <Link
                    href={`/explorar?page=${currentPage + 1}`}
                    className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-black/5 hover:bg-gray-50"
                  >
                    Siguiente ›
                  </Link>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function ExplorarPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 py-10">
          <div className="text-center">
            <div className="text-lg font-semibold text-gray-900">Cargando productos...</div>
          </div>
        </div>
      </div>
    }>
      <ExplorarContent />
    </Suspense>
  );
}
