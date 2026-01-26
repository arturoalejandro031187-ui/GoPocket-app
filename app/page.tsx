'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, useCallback, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase/client';
import { AuthModal } from '@/components/AuthModal';
import { FavoriteButton } from '@/components/FavoriteButton';
import { normalizeReturnTo } from '@/lib/auth/redirect';
import { CategoryDropdownMenu } from '@/components/CategoryDropdownMenu';
import { AdBanner } from '@/components/AdBanner';

type HomeBanner = {
  id: string;
  title: string;
  subtitle: string;
  image_url: string;
  cta_text: string;
  cta_href: string;
  // Nuevos slots soportados:
  // - floating: banner flotante cerrable (X)
  // - mid2: banners extra (sección adicional)
  // - mid3: banners extra (sección adicional)
  placement?: 'hero' | 'top' | 'mid' | 'mid2' | 'mid3' | 'bottom' | 'floating' | 'estafeta';
  image_fit?: 'cover' | 'contain';
  image_position?: 'center' | 'top' | 'bottom' | 'left' | 'right';
  floating_frequency?: 'session' | '24h' | '7d';
  floating_position?: 'bottom_right' | 'bottom_left' | 'top_right' | 'top_left';
  floating_delay_ms?: number;
};

const FLOATING_DISMISS_KEY = 'pocket_dismissed_floating_banners_v1';
const FLOATING_DISMISS_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 días
const FLOATING_SESSION_DISMISS_KEY = 'pocket_dismissed_floating_banners_session_v1';

type ListingPreview = {
  id: string;
  title: string;
  description?: string | null;
  price: number | string;
  images: string[] | null;
  public_id?: string | null;
  sale_type?: 'direct' | 'auction' | null;
  auction_end_at?: string | null;
  auction_highest_bid?: number | null;
  auction_starting_bid?: number | null;
  is_featured?: boolean | null;
  condition?: 'nuevo' | 'usado' | 'casi_nuevo' | null;
  free_shipping?: boolean | null;
};

function formatMoney(value: number) {
  return value.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function getPrice(value: number | string) {
  const n = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function formatTimeLeft(endAt: string | null | undefined) {
  if (!endAt) return '—';
  const end = Date.parse(endAt);
  if (!Number.isFinite(end)) return '—';
  const diff = end - Date.now();
  if (diff <= 0) return 'Finalizada';
  const totalMins = Math.floor(diff / 60000);
  const days = Math.floor(totalMins / (60 * 24));
  const hours = Math.floor((totalMins - days * 60 * 24) / 60);
  const mins = totalMins - days * 60 * 24 - hours * 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  parts.push(`${mins}m`);
  return parts.join(' ');
}

function IconCard({
  title,
  subtitle,
  href,
  icon,
}: {
  title: string;
  subtitle: string;
  href?: string;
  icon: ReactNode;
}) {
  const content = (
    <div className="flex items-center gap-4 rounded-3xl bg-white px-5 py-4 shadow-sm ring-1 ring-black/5 hover:shadow-md transition-shadow">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-pink-50 text-brand-pink ring-1 ring-pink-100">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-extrabold text-gray-900">{title}</div>
        <div className="mt-0.5 text-xs text-gray-600">{subtitle}</div>
      </div>
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

function ListingCard({
  p,
  badge,
  meta,
  onLoginRequired,
}: {
  p: ListingPreview;
  badge?: React.ReactNode;
  meta?: React.ReactNode;
  onLoginRequired?: () => void;
}) {
  const img = (p.images ?? []).filter(Boolean)[0] ?? null;
  const isAuction = p.sale_type === 'auction';
  const highestBid = typeof p.auction_highest_bid === 'number' ? p.auction_highest_bid : Number(p.auction_highest_bid ?? 0);
  const startingBid = typeof p.auction_starting_bid === 'number' ? p.auction_starting_bid : Number(p.auction_starting_bid ?? 0);
  const currentBid = highestBid > 0 ? highestBid : startingBid > 0 ? startingBid : getPrice(p.price);
  const price = isAuction ? currentBid : getPrice(p.price);
  
  return (
    <Link href={`/listings/${p.id}`} className="block snap-start">
      <div className="group w-56 overflow-hidden rounded-2xl bg-white shadow-soft ring-1 ring-black/5 hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
        <div className="relative aspect-[4/5] bg-gray-100">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt={p.title} className="h-full w-full object-cover" draggable={false} style={{ userSelect: 'none' }} />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-gray-500">Sin imagen</div>
          )}
          {p.free_shipping ? (
            <div className="absolute top-2 left-2 z-10">
              <div className="rounded-lg bg-blue-500/80 px-2 py-1 text-[10px] font-extrabold text-white shadow-sm backdrop-blur-sm">
                Envío gratis
              </div>
            </div>
          ) : badge ? (
            <div className="absolute left-3 top-3 z-20">{badge}</div>
          ) : null}
          {isAuction && p.auction_end_at ? (
            <div className="absolute bottom-3 left-3 z-20 flex items-center gap-2 rounded-full bg-brand-pink/95 px-3 py-1.5 text-xs font-bold text-white shadow-lg backdrop-blur-sm">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{formatTimeLeft(p.auction_end_at)}</span>
            </div>
          ) : null}
          <div className="absolute bottom-3 right-3 flex flex-col items-end gap-2 z-10" onClick={(e) => e.stopPropagation()}>
            <FavoriteButton
              listingId={p.id}
              onLoginRequired={onLoginRequired}
              className="hover:bg-white"
            />
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
          </div>
        </div>
        <div className="p-3">
          <div className="line-clamp-1 text-sm font-semibold text-gray-900">{p.title}</div>
          <div className="mt-1 text-sm font-extrabold text-gray-900">
            {isAuction ? `Puja: ${formatMoney(price)}` : formatMoney(price)}
          </div>
          {meta ? <div className="mt-2 text-xs text-gray-600">{meta}</div> : null}
        </div>
      </div>
    </Link>
  );
}

function Carousel({
  items,
  title,
  rightLink,
  renderItem,
  autoRotate = false,
  rotateInterval = 5000,
}: {
  items: ListingPreview[];
  title: string;
  rightLink?: { href: string; label: string };
  renderItem: (p: ListingPreview) => ReactNode;
  autoRotate?: boolean;
  rotateInterval?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const cardWidth = 240; // w-56 (224px) + gap-4 (16px) = 240px por card

  const scrollBy = (dx: number) => {
    if (ref.current) {
      ref.current.scrollBy({ left: dx, behavior: 'smooth' });
    }
  };

  const scrollToIndex = useCallback((index: number) => {
    if (ref.current && items.length > 0) {
      const clampedIndex = Math.max(0, Math.min(index, items.length - 1));
      const scrollPosition = clampedIndex * cardWidth;
      ref.current.scrollTo({ left: scrollPosition, behavior: 'smooth' });
      setCurrentIndex(clampedIndex);
    }
  }, [items.length, cardWidth]);

  // Auto-rotación
  useEffect(() => {
    if (!autoRotate || items.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => {
        const next = (prev + 1) % items.length;
        scrollToIndex(next);
        return next;
      });
    }, rotateInterval);

    return () => clearInterval(interval);
  }, [autoRotate, items.length, rotateInterval, scrollToIndex]);

  // Detectar scroll manual para actualizar índice
  useEffect(() => {
    if (!ref.current) return;

    const handleScroll = () => {
      if (ref.current && items.length > 0) {
        const scrollLeft = ref.current.scrollLeft;
        const newIndex = Math.round(scrollLeft / cardWidth);
        const clampedIndex = Math.max(0, Math.min(newIndex, items.length - 1));
        setCurrentIndex(clampedIndex);
      }
    };

    const element = ref.current;
    element.addEventListener('scroll', handleScroll);
    return () => element.removeEventListener('scroll', handleScroll);
  }, [cardWidth, items.length]);

  return (
    <section className="mt-10">
      <div className="flex items-end justify-between gap-3">
        <h2 className="text-xl font-extrabold tracking-tight text-gray-900 sm:text-2xl">{title}</h2>
        {rightLink ? (
          <Link href={rightLink.href} className="text-sm font-semibold text-brand-pink hover:opacity-90">
            {rightLink.label}
          </Link>
        ) : null}
      </div>

      <div className="mt-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              const prevIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
              scrollToIndex(prevIndex);
            }}
            className="hidden rounded-xl bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-black/5 hover:bg-gray-50 sm:inline-flex"
          >
            ‹
          </button>
          <div
            ref={ref}
            className="flex flex-1 gap-4 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide"
            style={{ scrollSnapType: 'x mandatory', scrollBehavior: 'smooth' }}
          >
            {items.map((p) => renderItem(p))}
          </div>
          <button
            type="button"
            onClick={() => {
              const nextIndex = (currentIndex + 1) % items.length;
              scrollToIndex(nextIndex);
            }}
            className="hidden rounded-xl bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-black/5 hover:bg-gray-50 sm:inline-flex"
          >
            ›
          </button>
        </div>
        {/* Indicadores de posición (opcional, solo si hay auto-rotación) */}
        {autoRotate && items.length > 1 && (
          <div className="mt-3 flex justify-center gap-2">
            {items.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => scrollToIndex(idx)}
                className={`h-2 rounded-full transition-all ${
                  idx === currentIndex ? 'w-8 bg-brand-pink' : 'w-2 bg-gray-300'
                }`}
                aria-label={`Ir a slide ${idx + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default function HomePage() {
  const [isBooting, setIsBooting] = useState(true);
  const [userName, setUserName] = useState<string | null>(null);
  const [banners, setBanners] = useState<HomeBanner[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [topIdx, setTopIdx] = useState(0);
  const [gender, setGender] = useState<'Mujer' | 'Hombre'>('Mujer');
  const [search, setSearch] = useState('');
  const [featured, setFeatured] = useState<ListingPreview[]>([]);
  const [auctions, setAuctions] = useState<ListingPreview[]>([]);
  const [newArrivals, setNewArrivals] = useState<ListingPreview[]>([]);
  const [explore, setExplore] = useState<ListingPreview[]>([]);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [dismissedFloating, setDismissedFloating] = useState<Record<string, number>>({});
  const [dismissedFloatingSession, setDismissedFloatingSession] = useState<Record<string, number>>({});
  const [floatingTick, setFloatingTick] = useState(0);
  const mountedAtRef = useRef<number>(Date.now());
  const [pendingReturnTo, setPendingReturnTo] = useState<string | null>(null);


  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      setIsBooting(true);
      try {
        // 1) Usuario
        const { data: userData } = await supabase.auth.getUser();
        if (!cancelled) {
          const user = userData.user;
          if (user) {
            const metaName =
              (user.user_metadata?.full_name as string | undefined) ||
              (user.user_metadata?.username as string | undefined) ||
              '';
            setUserName(metaName || (user.email ? user.email.split('@')[0] : ''));
          } else {
            setUserName(null);
          }
        }

        // 2) Banners (compatibilidad por fases: pro -> placement -> legacy)
        // Intento 1: schema pro (frequency/position/delay)
        let bannerRes: any = await supabase
          .from('home_banners')
          .select(
            'id,title,subtitle,image_url,cta_text,cta_href,placement,image_fit,image_position,floating_frequency,floating_position,floating_delay_ms,is_active,sort_order',
          )
          .order('sort_order', { ascending: true })
          .limit(50);

        // Si faltan columnas pro, reintentar sin pro (manteniendo placement)
        if ((bannerRes as any)?.error) {
          const err = (bannerRes as any).error;
          const code = String(err?.code || '');
          const msg = String(err?.message || '').toLowerCase();
          if (code === '42703' || msg.includes('does not exist') || msg.includes('column')) {
            bannerRes = await supabase
              .from('home_banners')
              .select('id,title,subtitle,image_url,cta_text,cta_href,placement,image_fit,image_position,is_active,sort_order')
              .order('sort_order', { ascending: true })
              .limit(50);
          }
        }

        // Si todavía falla (DB legacy sin placement), fallback legacy
        if ((bannerRes as any)?.error) {
          const err = (bannerRes as any).error;
          const code = String(err?.code || '');
          const msg = String(err?.message || '').toLowerCase();
          if (code === '42703' || msg.includes('does not exist') || msg.includes('column')) {
            bannerRes = await supabase
              .from('home_banners')
              .select('id,title,subtitle,image_url,cta_text,cta_href')
              .order('sort_order', { ascending: true })
              .limit(50);
          }
        }

        if (!cancelled) {
          const all = ((bannerRes as any).data as any[]) ?? [];
          setBanners(
            all
              .filter((b: any) => b?.is_active !== false)
              .map((b: any) => ({
                id: b.id,
                title: b.title,
                subtitle: b.subtitle,
                image_url: b.image_url,
                cta_text: b.cta_text,
                cta_href: b.cta_href,
                placement: b.placement ?? 'hero',
                image_fit: b.image_fit ?? 'cover',
                image_position: b.image_position ?? 'center',
                floating_frequency: b.floating_frequency ?? '7d',
                floating_position: b.floating_position ?? 'bottom_right',
                floating_delay_ms: typeof b.floating_delay_ms === 'number' ? b.floating_delay_ms : Number(b.floating_delay_ms ?? 0) || 0,
              })),
          );
        }

        // 3) Listings
        const nowIso = new Date().toISOString();

        // Destacados (pueden fallar si is_featured no existe aún)
        let featuredRes: any = await supabase
          .from('listings')
          .select('id,title,description,price,images,public_id,sale_type,is_featured,condition,free_shipping')
          .eq('status', 'active')
          .eq('is_featured', true)
          .order('created_at', { ascending: false })
          .limit(12);
        if (featuredRes?.error) {
          const err = featuredRes.error;
          const code = String(err?.code || '');
          const msg = String(err?.message || '');
          if (code === '42703' || msg.toLowerCase().includes('does not exist')) {
            featuredRes = { data: [] };
          }
        }

        // Subastas por terminar (pueden fallar si sale_type / auction_* no existen)
        // Obtener más subastas para rotación continua
        let auctionRes: any = await supabase
          .from('listings')
          .select('id,title,description,price,images,public_id,sale_type,auction_end_at,auction_highest_bid,auction_starting_bid,condition,free_shipping')
          .eq('status', 'active')
          .eq('sale_type', 'auction')
          .gt('auction_end_at', nowIso)
          .order('auction_end_at', { ascending: true })
          .limit(50); // Más subastas para rotación continua
        if (auctionRes?.error) {
          const err = auctionRes.error;
          const code = String(err?.code || '');
          const msg = String(err?.message || '');
          if (code === '42703' || msg.toLowerCase().includes('does not exist')) {
            auctionRes = { data: [] };
          }
        }

        // Novedades + Explorar
        const [newRes, exploreRes] = await Promise.all([
          supabase
            .from('listings')
            .select('id,title,description,price,images,public_id,sale_type,auction_end_at,condition,free_shipping')
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(12),
          supabase
            .from('listings')
            .select('id,title,description,price,images,public_id,sale_type,auction_end_at,condition,free_shipping')
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(24),
        ]);

        if (!cancelled) {
          setFeatured(((featuredRes as any).data as ListingPreview[]) ?? []);
          setAuctions(((auctionRes as any).data as ListingPreview[]) ?? []);
          setNewArrivals((newRes.data as ListingPreview[]) ?? []);
          setExplore((exploreRes.data as ListingPreview[]) ?? []);
        }
      } catch (e) {
        // No romper home si algo falla; dejamos arrays vacíos
        console.error(e);
        if (!cancelled) {
          setBanners([]);
          setFeatured([]);
          setAuctions([]);
          setNewArrivals([]);
          setExplore([]);
        }
      } finally {
        if (!cancelled) setIsBooting(false);
      }
    };

    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  // Home-first: si llega `/?auth=1&returnTo=/...` abrimos modal y guardamos returnTo.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const sp = new URLSearchParams(window.location.search);
      const auth = sp.get('auth');
      const safe = normalizeReturnTo(sp.get('returnTo'));
      if (safe) setPendingReturnTo(safe);
      if (auth === '1') setIsAuthOpen(true);
      // Limpieza visual: quitar auth=1 de la URL (evita reabrir modal al refrescar)
      if (auth === '1') {
        sp.delete('auth');
        const next = `${window.location.pathname}${sp.toString() ? `?${sp.toString()}` : ''}${window.location.hash}`;
        window.history.replaceState({}, '', next);
      }
    } catch {
      // noop
    }
  }, []);

  // Si ya hay sesión y venimos con returnTo, redirigir.
  useEffect(() => {
    if (!pendingReturnTo) return;
    if (!userName) return;
    if (pendingReturnTo === '/') return;
    window.location.href = pendingReturnTo;
  }, [pendingReturnTo, userName]);

  // Redirigir administradores al panel de administrador después del login (solo si no hay returnTo)
  // NO redirigir si el admin quiere ver como usuario (parámetro ?view=user o localStorage)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (pendingReturnTo) return; // Si hay returnTo pendiente, no hacer nada
    if (!userName) return; // Esperar a que el usuario esté cargado
    
    // Verificar si el admin quiere ver como usuario (parámetro URL o localStorage)
    const urlParams = new URLSearchParams(window.location.search);
    const viewAsUserParam = urlParams.get('view') === 'user';
    const viewAsUserStorage = window.localStorage.getItem('admin_view_as_user') === 'true';
    
    // Si viene con el parámetro, guardarlo en localStorage
    if (viewAsUserParam) {
      try {
        window.localStorage.setItem('admin_view_as_user', 'true');
      } catch {
        // noop
      }
    }
    
    // No redirigir si el admin quiere ver como usuario
    if (viewAsUserParam || viewAsUserStorage) return;
    
    // Solo redirigir si estamos en la ruta raíz exacta (sin parámetros de búsqueda relevantes)
    // Esto evita redirecciones cuando el usuario está navegando normalmente
    const currentPath = window.location.pathname;
    const currentSearch = window.location.search;
    // Ignorar el parámetro view=user al verificar
    const searchWithoutView = new URLSearchParams(currentSearch);
    searchWithoutView.delete('view');
    if (currentPath !== '/' || searchWithoutView.toString()) return;
    
    let cancelled = false;
    const checkAdmin = async () => {
      try {
        // Pequeño delay para evitar redirecciones inmediatas
        await new Promise(resolve => setTimeout(resolve, 500));
        if (cancelled) return;
        
        const { data: userData } = await supabase.auth.getUser();
        if (cancelled || !userData?.user) return;
        
        const { data: adminRow } = await supabase
          .from('admin_users')
          .select('user_id')
          .eq('user_id', userData.user.id)
          .maybeSingle();
        
        // Si es admin, redirigir al panel de administrador
        if (adminRow && !cancelled) {
          window.location.href = '/admin/metricas';
        }
      } catch (e) {
        // Silenciar errores, no queremos interrumpir la experiencia del usuario
        console.error('[HOME] Error al verificar admin:', e);
      }
    };
    
    // Ejecutar solo una vez cuando el usuario está autenticado y no hay returnTo
    void checkAdmin();
    
    return () => {
      cancelled = true;
    };
  }, [userName, pendingReturnTo]);

  const heroBanners = useMemo(() => banners.filter((b) => (b.placement ?? 'hero') === 'hero'), [banners]);
  const topBanners = useMemo(() => banners.filter((b) => (b.placement ?? 'hero') === 'top'), [banners]);
  const midBanners = useMemo(() => banners.filter((b) => (b.placement ?? 'hero') === 'mid'), [banners]);
  const mid2Banners = useMemo(() => banners.filter((b) => (b.placement ?? 'hero') === 'mid2'), [banners]);
  const mid3Banners = useMemo(() => banners.filter((b) => (b.placement ?? 'hero') === 'mid3'), [banners]);
  const bottomBanners = useMemo(() => banners.filter((b) => (b.placement ?? 'hero') === 'bottom'), [banners]);
  const floatingBanners = useMemo(() => banners.filter((b) => (b.placement ?? 'hero') === 'floating'), [banners]);
  const hero = useMemo(() => heroBanners[activeIdx] ?? null, [heroBanners, activeIdx]);
  const topHero = useMemo(() => topBanners[topIdx] ?? null, [topBanners, topIdx]);

  // Persistir banners flotantes cerrados (X)
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FLOATING_DISMISS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, number>;
      const now = Date.now();
      const cleaned: Record<string, number> = {};
      for (const [id, ts] of Object.entries(parsed || {})) {
        const n = typeof ts === 'number' ? ts : Number(ts ?? 0);
        if (!id) continue;
        if (!Number.isFinite(n) || n <= 0) continue;
        if (now - n > FLOATING_DISMISS_TTL_MS) continue;
        cleaned[id] = n;
      }
      setDismissedFloating(cleaned);
      window.localStorage.setItem(FLOATING_DISMISS_KEY, JSON.stringify(cleaned));
    } catch {
      // noop
    }
  }, []);

  // Dismiss por sesión (para frequency=session)
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(FLOATING_SESSION_DISMISS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, number>;
      const cleaned: Record<string, number> = {};
      for (const [id, ts] of Object.entries(parsed || {})) {
        const n = typeof ts === 'number' ? ts : Number(ts ?? 0);
        if (!id) continue;
        if (!Number.isFinite(n) || n <= 0) continue;
        cleaned[id] = n;
      }
      setDismissedFloatingSession(cleaned);
      window.sessionStorage.setItem(FLOATING_SESSION_DISMISS_KEY, JSON.stringify(cleaned));
    } catch {
      // noop
    }
  }, []);

  const visibleFloating = useMemo(() => {
    const now = Date.now();
    const sinceMount = now - mountedAtRef.current;

    const getTtl = (freq: HomeBanner['floating_frequency']) => {
      if (freq === '24h') return 1000 * 60 * 60 * 24;
      if (freq === '7d') return FLOATING_DISMISS_TTL_MS;
      return FLOATING_DISMISS_TTL_MS;
    };

    return floatingBanners
      .filter((b) => {
        const delay = Math.max(0, Number(b.floating_delay_ms ?? 0) || 0);
        if (delay > 0 && sinceMount < delay) return false;

        const freq = b.floating_frequency ?? '7d';
        if (freq === 'session') {
          return !dismissedFloatingSession[b.id];
        }
        const ts = dismissedFloating[b.id];
        if (!ts) return true;
        return now - ts > getTtl(freq);
      })
      .slice(0, 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floatingBanners, dismissedFloating, dismissedFloatingSession, floatingTick]);

  const dismissFloating = (b: HomeBanner) => {
    const id = b.id;
    const freq = b.floating_frequency ?? '7d';
    if (freq === 'session') {
      setDismissedFloatingSession((prev) => {
        const next = { ...prev, [id]: Date.now() };
        try {
          window.sessionStorage.setItem(FLOATING_SESSION_DISMISS_KEY, JSON.stringify(next));
        } catch {
          // noop
        }
        return next;
      });
      return;
    }

    setDismissedFloating((prev) => {
      const next = { ...prev, [id]: Date.now() };
      try {
        window.localStorage.setItem(FLOATING_DISMISS_KEY, JSON.stringify(next));
      } catch {
        // noop
      }
      return next;
    });
  };

  // Re-render cuando existan banners flotantes con delay pendiente
  useEffect(() => {
    const now = Date.now();
    const sinceMount = now - mountedAtRef.current;
    const pending = floatingBanners
      .map((b) => Math.max(0, Number(b.floating_delay_ms ?? 0) || 0))
      .filter((d) => d > sinceMount);
    if (pending.length === 0) return;
    const nextIn = Math.min(...pending) - sinceMount;
    const t = window.setTimeout(() => setFloatingTick((x) => x + 1), Math.max(0, nextIn) + 20);
    return () => window.clearTimeout(t);
  }, [floatingBanners, floatingTick]);

  const next = () => setActiveIdx((i) => (heroBanners.length ? (i + 1) % heroBanners.length : 0));
  const prev = () => setActiveIdx((i) => (heroBanners.length ? (i - 1 + heroBanners.length) % heroBanners.length : 0));
  const nextTop = () => setTopIdx((i) => (topBanners.length ? (i + 1) % topBanners.length : 0));
  const prevTop = () => setTopIdx((i) => (topBanners.length ? (i - 1 + topBanners.length) % topBanners.length : 0));

  useEffect(() => {
    // Mantener índice válido al cambiar la data
    setTopIdx(0);
  }, [topBanners.length]);

  useEffect(() => {
    // Auto-rotación estilo carrusel (Liverpool)
    if (topBanners.length <= 1) return;
    const t = setInterval(() => {
      setTopIdx((i) => (topBanners.length ? (i + 1) % topBanners.length : 0));
    }, 6500);
    return () => clearInterval(t);
  }, [topBanners.length]);

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = search.trim();
    const qp = q ? `?q=${encodeURIComponent(q)}` : '';
    window.location.href = `/listings${qp}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 to-white">
      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
      {/* Banners flotantes (cerrables) */}
      {visibleFloating.length > 0 ? (
        <div
          className={[
            'fixed z-[60] flex flex-col gap-3',
            // default: bottom_right
            (visibleFloating[0]?.floating_position ?? 'bottom_right') === 'bottom_left'
              ? 'bottom-4 left-4 right-4 sm:right-auto sm:left-5 sm:w-[380px]'
              : (visibleFloating[0]?.floating_position ?? 'bottom_right') === 'top_right'
                ? 'top-24 left-4 right-4 sm:left-auto sm:right-5 sm:w-[380px]'
                : (visibleFloating[0]?.floating_position ?? 'bottom_right') === 'top_left'
                  ? 'top-24 left-4 right-4 sm:right-auto sm:left-5 sm:w-[380px]'
                  : 'bottom-4 left-4 right-4 sm:left-auto sm:right-5 sm:w-[380px]',
          ].join(' ')}
        >
          {visibleFloating.map((b) => (
            <div
              key={b.id}
              className="relative overflow-hidden rounded-3xl bg-white shadow-lg ring-1 ring-black/10"
            >
              <button
                type="button"
                onClick={() => dismissFloating(b)}
                className="absolute right-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-gray-700 shadow-sm ring-1 ring-black/10 hover:bg-white"
                aria-label="Cerrar banner"
              >
                ×
              </button>
              <Link href={b.cta_href === '/listings' || !b.cta_href ? '/explorar' : b.cta_href} className="block">
                <div className="grid grid-cols-[88px_1fr] gap-3 p-4">
                  <div className="h-20 w-20 overflow-hidden rounded-2xl bg-gray-100 ring-1 ring-black/5">
                    {b.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={b.image_url}
                        alt={b.title}
                        className="h-full w-full"
                        style={{
                          objectFit: (b.image_fit ?? 'cover') as any,
                          objectPosition: (b.image_position ?? 'center') as any,
                        }}
                        draggable={false}
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-extrabold text-gray-900 line-clamp-1 pr-10">{b.title}</div>
                    {b.subtitle ? <div className="mt-0.5 text-xs text-gray-600 line-clamp-2 pr-10">{b.subtitle}</div> : null}
                    <div className="mt-3 inline-flex rounded-full bg-brand-pink px-4 py-2 text-xs font-extrabold text-white shadow-sm">
                      {b.cta_text || 'Ver'}
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </div>
      ) : null}
      {/* Barra promo (estilo Mercado Libre, con nuestro color) */}
      <div className="bg-brand-pink text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2">
          <div className="text-xs font-semibold">
            GoPocket — Compra y vende con estilo
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <span className="rounded-full bg-white/15 px-3 py-1 text-[11px] font-extrabold tracking-wide">
              ENVÍO GRATIS
            </span>
            <span className="text-[11px] font-semibold text-white/90">en artículos seleccionados:</span>
          </div>
        </div>
      </div>

      <header className="sticky top-0 z-40 border-b border-black/5 bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Link href="/" className="flex items-center gap-3">
              <div className="flex h-10 items-center justify-center rounded-xl bg-brand-pink px-3 text-white shadow-sm">
                <span className="text-sm font-extrabold tracking-widest">GoPocket</span>
              </div>
            </Link>

            <form onSubmit={onSearch} className="flex flex-1 items-center gap-2 sm:mx-6">
              <div className="relative w-full">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar productos, marcas y más…"
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-2 pr-10 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-brand-pink"
                />
                <button
                  type="submit"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl bg-brand-pink px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
                >
                  Buscar
                </button>
              </div>
            </form>

            <div className="flex items-center justify-between gap-2 sm:justify-end">
              <Link href="/cart" className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-black/5">
                <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                Carrito
              </Link>
              {userName ? (
                <Link href="/dashboard" className="rounded-xl px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-black/5">
                  Mi cuenta
                </Link>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAuthOpen(true)}
                    className="rounded-xl bg-brand-pink px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90"
                  >
                    Registrarte
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAuthOpen(true)}
                    className="rounded-xl px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-black/5"
                  >
                    Ingresar
                  </button>
                </div>
              )}
            </div>
          </div>

          <nav className="mt-2 hidden items-center justify-between gap-6 text-sm sm:flex">
            <div className="flex items-center gap-5">
              <CategoryDropdownMenu />
              <Link href="/explorar" className="font-semibold text-gray-700 hover:text-brand-pink">
                Explorar
              </Link>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/sell" className="rounded-xl bg-brand-pink px-3 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-90">
                Vender
              </Link>
              {userName ? <span className="text-xs font-semibold text-gray-500">Hola, {userName}</span> : null}
            </div>
          </nav>
        </div>
      </header>

      {/* Publicidad */}
      <section className="mx-auto max-w-6xl px-4 pt-5">
        <AdBanner placement="home" />
      </section>

      {/* Carrusel superior (Liverpool) - configurable en /admin/banners (slot: top) */}
      {topBanners.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pt-5">
          <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/5">
            <div className="relative aspect-[18/9] sm:aspect-[24/9] bg-gray-100">
              {topHero?.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={topHero.image_url}
                  alt={topHero.title}
                  className="h-full w-full"
                  style={{
                    objectFit: (topHero.image_fit ?? 'cover') as any,
                    objectPosition: (topHero.image_position ?? 'center') as any,
                  }}
                  draggable={false}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm text-gray-500">Sin imagen</div>
              )}

              <div className="absolute inset-0 bg-gradient-to-r from-black/35 via-black/0 to-black/0" />
              <div className="absolute left-5 top-1/2 -translate-y-1/2 sm:left-8">
                <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[11px] font-extrabold tracking-wide text-white ring-1 ring-white/20">
                  GoPocket
                </div>
                <div className="mt-3 max-w-xl text-2xl font-extrabold tracking-tight text-white sm:text-4xl">
                  {topHero?.title || 'Banners configurables'}
                </div>
                {topHero?.subtitle ? (
                  <div className="mt-2 max-w-xl text-sm font-semibold text-white/90 sm:text-base">{topHero.subtitle}</div>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={topHero?.cta_href === '/listings' || !topHero?.cta_href ? '/explorar' : topHero.cta_href}
                    className="rounded-full bg-white px-5 py-3 text-sm font-extrabold text-gray-900 shadow-sm hover:bg-gray-50"
                  >
                    {topHero?.cta_text || 'Explorar'}
                  </Link>
                </div>
              </div>

              {topBanners.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={prevTop}
                    className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 px-3 py-2 text-sm font-extrabold text-gray-900 shadow-sm hover:bg-white"
                    aria-label="Anterior"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={nextTop}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 px-3 py-2 text-sm font-extrabold text-gray-900 shadow-sm hover:bg-white"
                    aria-label="Siguiente"
                  >
                    ›
                  </button>
                  <div className="absolute bottom-4 left-0 right-0 flex items-center justify-center gap-2">
                    {topBanners.map((b, idx) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setTopIdx(idx)}
                        className={`h-2 w-2 rounded-full ${idx === topIdx ? 'bg-white' : 'bg-white/40'}`}
                        aria-label={`Banner ${idx + 1}`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      )}

      <main className="mx-auto max-w-6xl px-4 py-8">

        {/* Accesos rápidos (tarjetas como Mercado Libre) */}
        <section className="mb-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <IconCard
              title="Envío gratis"
              subtitle="Beneficios en compras seleccionadas."
              href="/envio-gratis"
              icon={
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M3 7h12v10H3V7Z" stroke="currentColor" strokeWidth="2" />
                  <path d="M15 10h4l2 3v4h-6v-7Z" stroke="currentColor" strokeWidth="2" />
                  <path d="M7 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" fill="currentColor" />
                  <path d="M17 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" fill="currentColor" />
                </svg>
              }
            />
            <IconCard
              title="Tienda Estafeta Cotiza tus envios"
              subtitle="Calcula el costo de tu envío y compra tu guía."
              href="/estafeta/cotizar"
              icon={
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-pink-100 to-rose-200/80 p-2 shadow-sm ring-1 ring-pink-200/50">
                  <svg
                    width="28"
                    height="28"
                    viewBox="0 0 48 48"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-7 w-7 text-brand-pink"
                    aria-hidden="true"
                  >
                    <defs>
                      <linearGradient id="estafeta-home-icon" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="currentColor" stopOpacity="1" />
                        <stop offset="100%" stopColor="currentColor" stopOpacity="0.8" />
                      </linearGradient>
                    </defs>
                    {/* Cabina */}
                    <path d="M6 32V20h14l4 4v8H6z" fill="url(#estafeta-home-icon)" />
                    {/* Caja de carga */}
                    <path d="M24 24h14v8H24v-8z" fill="url(#estafeta-home-icon)" opacity="0.9" />
                    {/* Ventana */}
                    <path d="M8 22h8v6H8v-6z" fill="white" fillOpacity="0.35" rx="1" />
                    {/* Ruedas */}
                    <circle cx="12" cy="38" r="4" fill="white" fillOpacity="0.5" stroke="currentColor" strokeWidth="1.5" />
                    <circle cx="12" cy="38" r="2" fill="currentColor" />
                    <circle cx="36" cy="38" r="4" fill="white" fillOpacity="0.5" stroke="currentColor" strokeWidth="1.5" />
                    <circle cx="36" cy="38" r="2" fill="currentColor" />
                    <path d="M16 38h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
                  </svg>
                </div>
              }
            />
            <IconCard
              title="Productos destacados"
              subtitle="Más vistos + pagaron $25.00."
              href="/productos-destacados"
              icon={
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M12 17.3 6.2 20l1.1-6.2L3 9.5l6.2-.9L12 3l2.8 5.6 6.2.9-4.3 4.3 1.1 6.2L12 17.3Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                </svg>
              }
            />
            <IconCard
              title="Subastas"
              subtitle="Todas las subastas, ordenadas por finalización."
              href="/subastas"
              icon={
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M21 12a9 9 0 1 1-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              }
            />
            <IconCard
              title="Más vistos"
              subtitle="Artículos con más vistas/compartidos."
              href="/mas-vistos"
              icon={
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" stroke="currentColor" strokeWidth="2" />
                  <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" fill="currentColor" />
                </svg>
              }
            />
            <IconCard
              title="Compra protegida"
              subtitle="Te explicamos cómo funciona."
              href="/compra-protegida"
              icon={
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M12 22s8-3 8-10V6l-8-3-8 3v6c0 7 8 10 8 10Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                  <path d="M9 12l2 2 4-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              }
            />
          </div>
        </section>

        {/* HERO (banners como Mercado Libre, con nuestro estilo) */}
        <section className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/5">
          <div className="grid items-stretch lg:grid-cols-2">
            <div className="p-6 sm:p-10">
              <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">{hero?.title || 'Compra y vende como en grande'}</h1>
              <p className="mt-3 text-sm text-gray-700 sm:text-base">
                {hero?.subtitle || 'Marketplace GoPocket: publicaciones de toda la comunidad, subastas y destacados.'}
              </p>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/sell"
                  className="rounded-full bg-brand-pink px-6 py-3 text-center text-sm font-semibold text-white shadow-lg hover:opacity-90"
                >
                  Empezar a vender &gt;
                </Link>
                <Link
                  href={hero?.cta_href === '/listings' || !hero?.cta_href ? '/explorar' : hero.cta_href}
                  className="rounded-full bg-white px-6 py-3 text-center text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-black/5 hover:bg-gray-50"
                >
                  {hero?.cta_text || 'Explorar'}
                </Link>
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-black/5 bg-gray-50 px-4 py-3">
                  <div className="text-xs font-semibold text-gray-900">Publica en minutos</div>
                  <div className="mt-1 text-xs text-gray-600">Sube 2–6 fotos y listo.</div>
                </div>
                <div className="rounded-2xl border border-black/5 bg-gray-50 px-4 py-3">
                  <div className="text-xs font-semibold text-gray-900">Subastas y destacados</div>
                  <div className="mt-1 text-xs text-gray-600">Carruseles especiales como Mercado Libre.</div>
                </div>
              </div>
            </div>

            <div className="relative min-h-[240px] bg-gradient-to-br from-brand-pink via-liverpool-700 to-liverpool-900">
              {hero?.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={hero.image_url}
                  alt={hero.title}
                  className="h-full w-full"
                  style={{
                    objectFit: (hero.image_fit ?? 'cover') as any,
                    objectPosition: (hero.image_position ?? 'center') as any,
                  }}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center p-10 text-center text-white">
                  <div>
                    <div className="text-xs font-semibold tracking-widest">GoPocket</div>
                    <div className="mt-2 text-2xl font-extrabold">Banners configurables</div>
                    <div className="mt-2 text-sm text-white/85">Administra en `/admin/banners`.</div>
                  </div>
                </div>
              )}

              {heroBanners.length > 1 && (
                <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={prev}
                    className="rounded-full bg-white/90 px-4 py-2 text-xs font-semibold text-gray-900 shadow-sm hover:bg-white"
                  >
                    Anterior
                  </button>
                  <div className="flex gap-2">
                    {heroBanners.map((b, idx) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setActiveIdx(idx)}
                        className={`h-2 w-2 rounded-full ${idx === activeIdx ? 'bg-white' : 'bg-white/40'}`}
                        aria-label={`Banner ${idx + 1}`}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={next}
                    className="rounded-full bg-white/90 px-4 py-2 text-xs font-semibold text-gray-900 shadow-sm hover:bg-white"
                  >
                    Siguiente
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Banners tipo strip (como los de Mercado Libre) */}
        {midBanners.length > 0 ? (
          <section className="mt-8">
            <div className="grid gap-4 sm:grid-cols-2">
              {midBanners.map((b) => (
                <Link
                  key={b.id}
                  href={b.cta_href === '/listings' || !b.cta_href ? '/explorar' : b.cta_href}
                  className="group overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/5 hover:shadow-md transition-shadow"
                >
                  <div className="relative aspect-[21/9] bg-gray-100">
                    {b.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={b.image_url}
                        alt={b.title}
                        className="h-full w-full"
                        style={{
                          objectFit: (b.image_fit ?? 'cover') as any,
                          objectPosition: (b.image_position ?? 'center') as any,
                        }}
                        draggable={false}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm text-gray-500">Sin imagen</div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-r from-black/45 via-black/0 to-black/0" />
                    <div className="absolute left-5 top-1/2 -translate-y-1/2">
                      <div className="text-sm font-extrabold text-white">{b.title}</div>
                      {b.subtitle ? <div className="mt-1 text-xs text-white/85">{b.subtitle}</div> : null}
                      <div className="mt-3 inline-flex rounded-full bg-white/90 px-4 py-2 text-xs font-semibold text-gray-900 shadow-sm">
                        {b.cta_text || 'Ver más'}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {/* Banners extra (slot mid2) */}
        {mid2Banners.length > 0 ? (
          <section className="mt-10">
            <div className="grid gap-4 lg:grid-cols-2">
              {mid2Banners.map((b) => (
                <Link
                  key={b.id}
                  href={b.cta_href === '/listings' || !b.cta_href ? '/explorar' : b.cta_href}
                  className="group overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/5 hover:shadow-md transition-shadow"
                >
                  <div className="relative aspect-[24/9] bg-gray-100">
                    {b.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={b.image_url}
                        alt={b.title}
                        className="h-full w-full"
                        style={{
                          objectFit: (b.image_fit ?? 'cover') as any,
                          objectPosition: (b.image_position ?? 'center') as any,
                        }}
                        draggable={false}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm text-gray-500">Sin imagen</div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-r from-black/45 via-black/0 to-black/0" />
                    <div className="absolute left-5 top-1/2 -translate-y-1/2">
                      <div className="text-sm font-extrabold text-white">{b.title}</div>
                      {b.subtitle ? <div className="mt-1 text-xs text-white/85">{b.subtitle}</div> : null}
                      <div className="mt-3 inline-flex rounded-full bg-white/90 px-4 py-2 text-xs font-semibold text-gray-900 shadow-sm">
                        {b.cta_text || 'Ver más'}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {/* Carrusel de Subastas por Terminar - Arriba de Destacados */}
        {auctions.length > 0 ? (
          <Carousel
            title="Subastas por Terminar"
            rightLink={{ href: '/subastas', label: 'Ver todo' }}
            items={auctions}
            autoRotate={true}
            rotateInterval={5000}
            renderItem={(p) => (
              <ListingCard
                key={p.id}
                p={p}
                onLoginRequired={() => setIsAuthOpen(true)}
                badge={
                  <span className="rounded-full bg-gray-900 px-3 py-1 text-xs font-extrabold text-white shadow">
                    Subasta
                  </span>
                }
                meta={null}
              />
            )}
          />
        ) : null}

        {/* Carrusel de Destacados ($25) */}
        {featured.length > 0 ? (
          <Carousel
            title="Destacados"
            rightLink={{ href: '/listings', label: 'Ver todo' }}
            items={featured}
            autoRotate={true}
            rotateInterval={4000}
            renderItem={(p) => (
              <ListingCard
                key={p.id}
                p={p}
                onLoginRequired={() => setIsAuthOpen(true)}
                badge={
                  <span className="rounded-full bg-brand-pink px-3 py-1 text-xs font-extrabold text-white shadow">
                    Destacado
                  </span>
                }
              />
            )}
          />
        ) : null}

        {/* Novedades */}
        <section className="mt-10">
          <div className="flex items-end justify-between">
            <h2 className="text-2xl font-extrabold tracking-tight text-gray-900">Novedades</h2>
            <Link href="/listings" className="text-sm font-semibold text-brand-pink hover:opacity-90">
              Ver todo
            </Link>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(newArrivals.length ? newArrivals : Array.from({ length: 8 }).map((_, i) => ({ id: `s-${i}`, title: '', price: 0, images: null } as ListingPreview))).map((p) => {
              const img = (p.images ?? []).filter(Boolean)[0] ?? null;
              const price = getPrice(p.price);
              const isSkeleton = !p.title;

              const Card = (
                <div className="group overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 hover:shadow-md transition-shadow">
                  <div className="relative aspect-[4/5] bg-gray-100">
                    {isSkeleton ? (
                      <div className="h-full w-full animate-pulse bg-gray-200" />
                    ) : img ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img}
                          alt={p.title}
                          className="h-full w-full object-cover"
                          draggable={false}
                          style={{ userSelect: 'none' }}
                        />
                        {p.free_shipping && (
                          <div className="absolute top-2 left-2 z-10">
                            <div className="rounded-lg bg-blue-500/80 px-2 py-1 text-[10px] font-extrabold text-white shadow-sm backdrop-blur-sm">
                              Envío gratis
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm text-gray-500">
                        Sin imagen
                      </div>
                    )}

                    {!isSkeleton && (
                      <div className="absolute bottom-3 right-3 flex flex-col items-end gap-2 z-20" onClick={(e) => e.stopPropagation()}>
                        <FavoriteButton
                          listingId={p.id}
                          onLoginRequired={() => setIsAuthOpen(true)}
                          className="hover:bg-white"
                        />
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
                      </div>
                    )}
                  </div>

                  <div className="p-3">
                    {isSkeleton ? (
                      <div className="space-y-2">
                        <div className="h-4 w-3/4 animate-pulse rounded bg-gray-200" />
                        <div className="h-4 w-1/3 animate-pulse rounded bg-gray-200" />
                      </div>
                    ) : (
                      <>
                        <div className="line-clamp-1 text-sm font-semibold text-gray-900">{p.title}</div>
                        <div className="mt-1 text-sm font-extrabold text-gray-900">{formatMoney(price)}</div>
                      </>
                    )}
                  </div>
                </div>
              );

              return isSkeleton ? (
                <div key={p.id}>{Card}</div>
              ) : (
                <Link key={p.id} href={`/listings/${p.id}`} className="block">
                  {Card}
                </Link>
              );
            })}
          </div>
        </section>

        {/* Explorar: publicaciones de toda la comunidad (mismo estilo que Novedades) */}
        <section className="mt-10">
          <div className="flex items-end justify-between">
            <h2 className="text-2xl font-extrabold tracking-tight text-gray-900">Explorar</h2>
            <Link href="/listings" className="text-sm font-semibold text-brand-pink hover:opacity-90">
              Ver todas
            </Link>
          </div>
          {explore.length === 0 ? (
            <div className="mt-5 rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-black/5">
              <div className="text-sm text-gray-600">{isBooting ? 'Cargando…' : 'Aún no hay publicaciones activas.'}</div>
            </div>
          ) : (
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {explore.map((p) => {
                const img = (p.images ?? []).filter(Boolean)[0] ?? null;
                const price = getPrice(p.price);
                return (
                  <Link key={p.id} href={`/listings/${p.id}`} className="block">
                    <div className="group overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 hover:shadow-md transition-shadow">
                      <div className="relative aspect-[4/5] bg-gray-100">
                        {img ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={img}
                              alt={p.title}
                              className="h-full w-full object-cover"
                              draggable={false}
                              style={{ userSelect: 'none' }}
                            />
                            {p.free_shipping && (
                              <div className="absolute top-2 left-2 z-10">
                                <div className="rounded-lg bg-blue-500/80 px-2 py-1 text-[10px] font-extrabold text-white shadow-sm backdrop-blur-sm">
                                  Envío gratis
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-sm text-gray-500">
                            Sin imagen
                          </div>
                        )}
                        <div className="absolute bottom-3 right-3 flex flex-col items-end gap-2 z-20" onClick={(e) => e.stopPropagation()}>
                          <FavoriteButton
                            listingId={p.id}
                            onLoginRequired={() => setIsAuthOpen(true)}
                            className="hover:bg-white"
                          />
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
                        </div>
                      </div>
                      <div className="p-3">
                        <div className="line-clamp-1 text-sm font-semibold text-gray-900">{p.title}</div>
                        <div className="mt-1 text-sm font-extrabold text-gray-900">{formatMoney(price)}</div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* Banners extra (slot mid3) */}
        {mid3Banners.length > 0 ? (
          <section className="mt-10">
            <div className="grid gap-4">
              {mid3Banners.map((b) => (
                <Link
                  key={b.id}
                  href={b.cta_href === '/listings' || !b.cta_href ? '/explorar' : b.cta_href}
                  className="group block overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/5 hover:shadow-md transition-shadow"
                >
                  <div className="relative aspect-[24/7] bg-gray-100">
                    {b.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={b.image_url}
                        alt={b.title}
                        className="h-full w-full"
                        style={{
                          objectFit: (b.image_fit ?? 'cover') as any,
                          objectPosition: (b.image_position ?? 'center') as any,
                        }}
                        draggable={false}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm text-gray-500">Sin imagen</div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/0 to-black/0" />
                    <div className="absolute bottom-4 left-4 right-4">
                      <div className="text-sm font-extrabold text-white">{b.title}</div>
                      {b.subtitle ? <div className="mt-1 text-xs text-white/85">{b.subtitle}</div> : null}
                      {b.cta_text ? (
                        <div className="mt-3 inline-flex rounded-full bg-white/90 px-4 py-2 text-xs font-semibold text-gray-900 shadow-sm">
                          {b.cta_text}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {/* Banner final ancho (bottom) */}
        {bottomBanners.length > 0 ? (
          <section className="mt-10">
            <div className="grid gap-4">
              {bottomBanners.map((b) => (
                <Link
                  key={b.id}
                  href={b.cta_href === '/listings' || !b.cta_href ? '/explorar' : b.cta_href}
                  className="group block overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/5 hover:shadow-md transition-shadow"
                >
                  <div className="relative aspect-[24/7] bg-gray-100">
                    {b.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={b.image_url}
                        alt={b.title}
                        className="h-full w-full"
                        style={{
                          objectFit: (b.image_fit ?? 'cover') as any,
                          objectPosition: (b.image_position ?? 'center') as any,
                        }}
                        draggable={false}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm text-gray-500">Sin imagen</div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/0 to-black/0" />
                    <div className="absolute bottom-4 left-4 right-4">
                      <div className="text-sm font-extrabold text-white">{b.title}</div>
                      {b.subtitle ? <div className="mt-1 text-xs text-white/85">{b.subtitle}</div> : null}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

      </main>
    </div>
  );
}