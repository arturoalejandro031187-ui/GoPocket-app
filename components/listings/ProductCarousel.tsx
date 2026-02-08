'use client';

import { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';

type CarouselItem = {
  id: string;
  title: string;
  price: number;
  currency: string;
  images: string[] | null;
  status?: string;
  free_shipping?: boolean;
  discount?: number; // Optional discount percent
  plan_type?: 'basic' | 'pro'; // Plan type for featured items
};

interface ProductCarouselProps {
  title: string;
  items: CarouselItem[];
  className?: string;
  autoRotate?: boolean;
  rotateInterval?: number;
}

export function ProductCarousel({ title, items, className = '', autoRotate = false, rotateInterval = 4000 }: ProductCarouselProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);
  const [isHovered, setIsHovered] = useState(false);

  const handleScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setShowLeftArrow(scrollLeft > 0);
      setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 10);
    }
  };

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const scrollAmount = container.clientWidth * 0.8;
      container.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  // Auto-rotate logic
  useEffect(() => {
    if (!autoRotate || isHovered || !items || items.length === 0) return;

    const interval = setInterval(() => {
      if (scrollContainerRef.current) {
        const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
        // If we are near the end, scroll back to start
        if (scrollLeft + clientWidth >= scrollWidth - 10) {
          scrollContainerRef.current.scrollTo({ left: 0, behavior: 'smooth' });
        } else {
          scroll('right');
        }
      }
    }, rotateInterval);

    return () => clearInterval(interval);
  }, [autoRotate, rotateInterval, isHovered, items]);

  useEffect(() => {
    if (scrollContainerRef.current) {
      handleScroll();
    }
  }, [items]);

  if (!items || items.length === 0) return null;

  return (
    <div 
      className={`py-6 ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <h2 className="mb-4 text-xl font-semibold text-gray-900">{title}</h2>
      
      <div className="group relative">
        {/* Left Arrow */}
        {showLeftArrow && (
          <button
            onClick={() => scroll('left')}
            className="absolute left-0 top-1/2 z-10 -translate-y-1/2 -translate-x-4 rounded-full bg-white p-2 shadow-lg ring-1 ring-black/5 transition hover:bg-gray-50 focus:outline-none"
            aria-label="Scroll left"
          >
            <svg className="h-6 w-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}

        {/* Carousel Container */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex gap-4 overflow-x-auto scroll-smooth pb-4 scrollbar-hide"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/listings/${item.id}`}
              className="flex min-w-[200px] max-w-[200px] flex-col rounded-lg border border-gray-100 bg-white p-3 transition hover:shadow-md"
            >
              <div className="relative mb-3 aspect-square w-full overflow-hidden rounded-md bg-gray-100">
                {/* Plan Badge */}
                {item.plan_type && (
                  <div className={`absolute left-1 top-1 z-10 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-white shadow-sm ${
                    item.plan_type === 'pro' ? 'bg-gradient-to-r from-yellow-400 to-orange-500' : 'bg-gray-500'
                  }`}>
                    {item.plan_type === 'pro' ? 'PRO' : 'DESTACADO'}
                  </div>
                )}
                
                {item.images && item.images[0] ? (
                  <Image
                    src={item.images[0]}
                    alt={item.title}
                    fill
                    loading="lazy"
                    className="object-cover object-center"
                    sizes="(max-width: 768px) 50vw, 200px"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-gray-400">
                    <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
              </div>

              <div className="flex flex-1 flex-col">
                <h3 className="line-clamp-2 text-sm text-gray-700" title={item.title}>
                  {item.title}
                </h3>
                
                <div className="mt-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold text-gray-900">
                      {item.price.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}
                    </span>
                    {item.discount && (
                      <span className="text-xs font-medium text-green-600">{item.discount}% OFF</span>
                    )}
                  </div>
                  
                  {/* Mock Installments - Logic could be added */}
                  <div className="text-xs text-green-600">
                    en 12x de {(item.price / 12).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}
                  </div>

                  {item.free_shipping && (
                    <div className="mt-1 text-xs font-bold text-green-600">Envío gratis</div>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Right Arrow */}
        {showRightArrow && (
          <button
            onClick={() => scroll('right')}
            className="absolute right-0 top-1/2 z-10 -translate-y-1/2 translate-x-4 rounded-full bg-white p-2 shadow-lg ring-1 ring-black/5 transition hover:bg-gray-50 focus:outline-none"
            aria-label="Scroll right"
          >
            <svg className="h-6 w-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
