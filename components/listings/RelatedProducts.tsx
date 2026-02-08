'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { formatMoney } from '@/lib/utils/format';

type RelatedListing = {
  id: string;
  title: string;
  price: number;
  images: string[];
  sale_type: string;
  free_shipping: boolean;
};

interface RelatedProductsProps {
  currentListingId: string;
  category?: string | null;
  tags?: string[] | null;
  sellerId: string;
  className?: string;
  gridCols?: string;
  carousel?: boolean;
}

export function RelatedProducts({ currentListingId, category, tags, sellerId, className = '', gridCols = 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6' }: RelatedProductsProps) {
  const [products, setProducts] = useState<RelatedListing[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchRelated() {
      try {
        setLoading(true);
        
        // Base query: active listings, not current one
        let query = supabase
          .from('listings')
          .select('id, title, price, images, sale_type, free_shipping')
          .eq('status', 'active')
          .neq('id', currentListingId)
          .limit(8); // Increased limit slightly

        // Priority 1: Same category
        if (category) {
          query = query.eq('category', category);
        }

        const { data, error } = await query;

        if (!error && data) {
           setProducts(data.map(item => ({
             ...item,
             price: Number(item.price),
             images: item.images || []
           })));
        }
      } catch (err) {
        console.error('Error fetching related products:', err);
      } finally {
        setLoading(false);
      }
    }

    if (currentListingId) {
      fetchRelated();
    }
  }, [currentListingId, category, tags]);

  if (loading) return null;
  if (products.length === 0) return null;

  return (
    <div className={`col-span-full space-y-4 ${className}`}>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Productos relacionados</h2>
        <span className="text-xs text-gray-500">Ad</span>
      </div>
      
      {/* Horizontal Scroll / Carousel */}
      <div className="relative group">
        <div 
          ref={scrollContainerRef}
          className="flex gap-4 overflow-x-auto pb-4 pt-1 snap-x snap-mandatory scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0"
        >
          {products.map((product) => {
            const img = product.images[0];
            return (
              <Link
                key={product.id}
                href={`/listings/${product.id}`}
                className="snap-start shrink-0 w-[160px] sm:w-[180px] group/card relative flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="aspect-square bg-gray-100 relative overflow-hidden">
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={img}
                      alt={product.title}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover/card:scale-105"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-gray-400">
                      Sin imagen
                    </div>
                  )}
                </div>
                
                <div className="flex flex-1 flex-col p-3">
                  <h3 className="line-clamp-2 text-xs font-medium text-gray-900 mb-1 h-8">
                    {product.title}
                  </h3>
                  
                  <div className="mt-auto">
                    <div className="flex items-baseline gap-1">
                      <span className="text-sm font-bold text-gray-900">
                        {formatMoney(product.price)}
                      </span>
                    </div>
                    
                    {product.free_shipping && (
                      <div className="mt-1 text-[9px] font-semibold text-green-600">
                        Envío gratis
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
        
        {/* Gradient overlays for scroll indication */}
        <div className="absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-white to-transparent pointer-events-none sm:hidden" />
        <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white to-transparent pointer-events-none sm:hidden" />
      </div>
    </div>
  );
}
