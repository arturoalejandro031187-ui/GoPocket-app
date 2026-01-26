'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_LEFT = 20;
const DEFAULT_BOTTOM = 20;

// Botones globales flotantes y arrastrables para navegar rápido.
export function GlobalShortcuts() {
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState({ left: DEFAULT_LEFT, bottom: DEFAULT_BOTTOM });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, left: 0, bottom: 0 });
  const router = useRouter();

  useEffect(() => setMounted(true), []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      left: pos.left,
      bottom: pos.bottom,
    };
  }, [pos.left, pos.bottom]);

  useEffect(() => {
    if (!mounted) return;
    const onMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStart.current.x;
      const dy = dragStart.current.y - e.clientY; // bottom: down = decrease
      let left = dragStart.current.left + dx;
      let bottom = dragStart.current.bottom + dy;
      const pad = 8;
      left = Math.max(pad, Math.min(window.innerWidth - 120, left));
      bottom = Math.max(pad, Math.min(window.innerHeight - 140, bottom));
      setPos({ left, bottom });
    };
    const onUp = () => setIsDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [mounted, isDragging]);

  if (!mounted) return null;

  return (
    <div
      className="fixed z-[90] pointer-events-auto flex flex-col gap-2 select-none"
      style={{ left: pos.left, bottom: pos.bottom }}
    >
      <div
        role="button"
        tabIndex={0}
        onMouseDown={handleMouseDown}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.preventDefault(); }}
        className="flex cursor-grab active:cursor-grabbing items-center justify-center rounded-t-2xl bg-gray-100 py-1.5 hover:bg-gray-200"
        aria-label="Arrastrar para mover"
      >
        <span className="text-gray-400 text-xs">⋮⋮</span>
      </div>
      <div className="flex flex-col gap-2 rounded-2xl rounded-t-none bg-white/95 p-2 shadow-xl ring-1 ring-black/10 backdrop-blur">
        <Link href="/dashboard" className="sr-only">
          Ir a mi cuenta
        </Link>
        <button
          type="button"
          onClick={() => router.push('/dashboard')}
          className="inline-flex items-center justify-center rounded-full bg-white px-4 py-3 text-sm font-extrabold text-gray-900 shadow-sm ring-1 ring-black/10 hover:bg-gray-50"
        >
          Mi cuenta
        </button>
        <Link href="/" className="sr-only">
          Ir a inicio
        </Link>
        <button
          type="button"
          onClick={() => router.push('/')}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-pink px-4 py-3 text-sm font-extrabold text-white shadow-sm hover:opacity-95"
        >
          <span>GoPocket</span>
          <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

