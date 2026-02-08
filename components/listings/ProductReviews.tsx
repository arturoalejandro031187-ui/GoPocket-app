'use client';

import { useEffect, useState } from 'react';
import { ReviewSummary } from './ReviewSummary';
import { ReviewList } from './ReviewList';
import { ReviewForm } from './ReviewForm';
import { supabase } from '@/lib/supabase/client';

interface ProductReviewsProps {
  listingId: string;
  sellerId: string; // To prevent seller from reviewing own item?
}

export function ProductReviews({ listingId, sellerId }: ProductReviewsProps) {
  const [reviews, setReviews] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sort, setSort] = useState('recent'); // recent, helpful, highest, lowest
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [canReview, setCanReview] = useState(false); // Check if user bought it

  // Load reviews
  const loadReviews = async (reset = false) => {
    try {
      setIsLoading(true);
      const currentPage = reset ? 1 : page;
      const res = await fetch(`/api/listings/${listingId}/reviews?page=${currentPage}&sort=${sort}&limit=5`);
      const data = await res.json();

      if (data.reviews) {
        if (reset) {
          setReviews(data.reviews);
        } else {
          setReviews(prev => [...prev, ...data.reviews]);
        }
        setHasMore(data.pagination.page < data.pagination.pages);
        setStats(data.stats);
      }
    } catch (err) {
      console.error('Error loading reviews:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Check if user can review
  useEffect(() => {
    const checkEligibility = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      if (session.user.id === sellerId) return;

      // Check if they have a delivered order
      // We can check this via API or assume the form will validate on submit
      // For UI UX, let's check briefly if we can. 
      // Actually, let's just show the button and let the Form handle validation/error
      setCanReview(true); 
    };
    checkEligibility();
  }, [listingId, sellerId]);

  useEffect(() => {
    loadReviews(true);
  }, [listingId, sort]);

  const handleSortChange = (newSort: string) => {
    setSort(newSort);
    setPage(1);
  };

  const handleLoadMore = () => {
    setPage(prev => prev + 1);
    // Trigger loadReviews in effect? No, better call directly or use effect on page change
    // But effect on page change might trigger twice if reset changes page to 1.
    // Let's use effect on page.
  };

  useEffect(() => {
    if (page > 1) loadReviews();
  }, [page]);

  return (
    <div className="">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Opiniones del producto</h2>
      
      {stats && (
        <div className="grid gap-8 lg:grid-cols-12">
          {/* Summary Column */}
          <div className="lg:col-span-4">
            <ReviewSummary stats={stats} />
            
            {canReview && (
              <div className="mt-6">
                <button
                  onClick={() => setIsFormOpen(true)}
                  className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500"
                >
                  Escribir una opinión
                </button>
              </div>
            )}
          </div>

          {/* List Column */}
          <div className="lg:col-span-8">
            <div className="mb-4 flex items-center justify-end gap-2">
              <label htmlFor="sort" className="text-sm font-medium text-gray-700">Ordenar por:</label>
              <select
                id="sort"
                value={sort}
                onChange={(e) => handleSortChange(e.target.value)}
                className="rounded-md border-gray-300 py-1 pl-3 pr-8 text-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="recent">Más recientes</option>
                <option value="helpful">Más útiles</option>
                <option value="highest">Mayor calificación</option>
                <option value="lowest">Menor calificación</option>
              </select>
            </div>

            <ReviewList reviews={reviews} listingId={listingId} />

            {hasMore && (
              <div className="mt-6 text-center">
                <button
                  onClick={handleLoadMore}
                  disabled={isLoading}
                  className="text-sm font-semibold text-blue-600 hover:text-blue-500 disabled:opacity-50"
                >
                  {isLoading ? 'Cargando...' : 'Mostrar más opiniones'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {isFormOpen && (
        <ReviewForm
          listingId={listingId}
          onClose={() => setIsFormOpen(false)}
          onSuccess={() => {
            setIsFormOpen(false);
            loadReviews(true);
          }}
        />
      )}
    </div>
  );
}
