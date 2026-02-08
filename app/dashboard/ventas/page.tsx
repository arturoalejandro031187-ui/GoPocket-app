'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { OrderChatFloating } from '@/components/OrderChatFloating';
import { payoutNet } from '@/lib/payouts/calc';
import { PageTour } from '@/components/PageTour';
import { pageTours } from '@/lib/tours/config';
import { SectionMessage } from '@/components/SectionMessage';

// --- Estilos para animaciones del Modo Tutorial ---
const tutorialStyles = `
  @keyframes subtle-pulse {
    0% { box-shadow: 0 0 0 0 rgba(236, 72, 153, 0.4); }
    70% { box-shadow: 0 0 0 6px rgba(236, 72, 153, 0); }
    100% { box-shadow: 0 0 0 0 rgba(236, 72, 153, 0); }
  }
  .animate-subtle-pulse {
    animation: subtle-pulse 2s infinite;
  }
  @keyframes float-arrow {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-4px); }
  }
  .animate-float {
    animation: float-arrow 2s ease-in-out infinite;
  }
  @keyframes slide-in-tooltip {
    from { opacity: 0; transform: translateY(5px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .animate-slide-in {
    animation: slide-in-tooltip 0.3s ease-out forwards;
  }
  .glow-border {
    box-shadow: 0 0 10px rgba(236, 72, 153, 0.3);
    border-color: rgba(236, 72, 153, 0.5) !important;
  }
`;

// Componente para Tooltips Interactivos
function TutorialTooltip({ text, show }: { text: string; show: boolean }) {
  if (!show) return null;
  return (
    <div className="absolute z-20 animate-slide-in pointer-events-none select-none left-1/2 -translate-x-1/2 -top-10 w-max max-w-[200px]">
      <div className="relative rounded-lg bg-gray-900 px-3 py-1.5 text-[10px] font-bold text-white shadow-xl">
        {text}
        <div className="absolute -bottom-1 left-1/2 -ml-1 h-2 w-2 rotate-45 bg-gray-900" />
      </div>
      <div className="mx-auto mt-1 h-4 w-4 text-brand-pink animate-float flex justify-center">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M19 12l-7 7-7-7"/>
        </svg>
      </div>
    </div>
  );
}

// Componente para contador regresivo de 72 horas
function Countdown72Hours({ startTime, shippedAt }: { startTime: string | null | undefined; shippedAt?: string | null | undefined }) {
  const [timeLeft, setTimeLeft] = useState<{ hours: number; minutes: number; seconds: number; totalMs: number; isFrozen: boolean } | null>(null);

  useEffect(() => {
    if (!startTime) {
      setTimeLeft(null);
      return;
    }

    const start = new Date(startTime).getTime();
    const end = start + 72 * 60 * 60 * 1000; // 72 horas en milisegundos

    // Si ya se envió, calcular el tiempo que quedaba cuando se envió (fijo)
    if (shippedAt) {
      const shipped = new Date(shippedAt).getTime();
      const remainingWhenShipped = end - shipped;

      if (remainingWhenShipped <= 0) {
        setTimeLeft({ hours: 0, minutes: 0, seconds: 0, totalMs: 0, isFrozen: true });
        return;
      }

      const hours = Math.floor(remainingWhenShipped / (1000 * 60 * 60));
      const minutes = Math.floor((remainingWhenShipped % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((remainingWhenShipped % (1000 * 60)) / 1000);

      setTimeLeft({ hours, minutes, seconds, totalMs: remainingWhenShipped, isFrozen: true });
      return;
    }

    // Si no se ha enviado, continuar con el contador regresivo
    const update = () => {
      const now = Date.now();
      const remaining = end - now;

      if (remaining <= 0) {
        setTimeLeft({ hours: 0, minutes: 0, seconds: 0, totalMs: 0, isFrozen: false });
        return;
      }

      const hours = Math.floor(remaining / (1000 * 60 * 60));
      const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((remaining % (1000 * 60)) / 1000);

      setTimeLeft({ hours, minutes, seconds, totalMs: remaining, isFrozen: false });
    };

    update();
    const interval = setInterval(update, 1000);

    return () => clearInterval(interval);
  }, [startTime, shippedAt]);

  if (!timeLeft) return null;

  if (timeLeft.totalMs === 0) {
    return (
      <div className="rounded-xl border border-red-300 bg-red-100 px-3 py-2 animate-pulse">
        <div className="text-xs font-extrabold text-red-900">⏰ Tiempo de envío vencido</div>
        <div className="mt-0.5 text-[10px] text-red-800/80">El plazo de 72 horas ha expirado</div>
      </div>
    );
  }

  const isWarning = timeLeft.totalMs < 24 * 60 * 60 * 1000; // Menos de 24 horas

  return (
    <div className={`rounded-xl border px-3 py-2 transition-colors ${isWarning ? 'border-amber-300 bg-amber-100' : 'border-green-300 bg-green-100'}`}>
      <div className="flex items-center gap-2">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isWarning ? 'text-amber-700' : 'text-green-700'}>
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <div className="flex-1">
          <div className={`text-xs font-extrabold ${isWarning ? 'text-amber-900' : 'text-green-900'}`}>
            {timeLeft.isFrozen ? 'Tiempo restante al enviar:' : 'Tiempo restante:'} {String(timeLeft.hours).padStart(2, '0')}:{String(timeLeft.minutes).padStart(2, '0')}:{String(timeLeft.seconds).padStart(2, '0')}
          </div>
          <div className={`mt-0.5 text-[10px] ${isWarning ? 'text-amber-800/80' : 'text-green-800/80'}`}>
            {timeLeft.isFrozen
              ? 'Tiempo que quedaba cuando se realizó el envío'
              : isWarning ? '¡Atención! Te queda poco tiempo para enviar.' : 'Tienes 72 horas desde la descarga para realizar el envío'}
          </div>
        </div>
      </div>
    </div>
  );
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function toNumber(v: any) {
  const n = typeof v === 'number' ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}
function formatMoney(v: any) {
  return toNumber(v).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}
function formatDateTime(input: string | null | undefined) {
  if (!input) return '—';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-MX', { year: 'numeric', month: 'short', day: '2-digit' });
}

export default function DashboardVentasPage() {
  const [isTutorialMode, setIsTutorialMode] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('tutorial_mode_ventas');
    if (stored !== null) {
      setIsTutorialMode(stored === 'true');
    }
  }, []);

  const toggleTutorialMode = () => {
    const next = !isTutorialMode;
    setIsTutorialMode(next);
    localStorage.setItem('tutorial_mode_ventas', String(next));
  };

  const [isBooting, setIsBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [itemsByOrder, setItemsByOrder] = useState<Record<string, any[]>>({});
  const [buyerNames, setBuyerNames] = useState<Record<string, string>>({});
  const [thumbByListingId, setThumbByListingId] = useState<Record<string, string>>({});

  const [carrierDraft, setCarrierDraft] = useState<Record<string, string>>({});
  const [trackingDraft, setTrackingDraft] = useState<Record<string, string>>({});
  const [isMarking, setIsMarking] = useState<Record<string, boolean>>({});

  const [chatOpen, setChatOpen] = useState(false);
  const [chatOrderId, setChatOrderId] = useState<string | null>(null);
  const [hasUnreadByOrderId, setHasUnreadByOrderId] = useState<Record<string, boolean>>({});

  const [rateOpen, setRateOpen] = useState(false);
  const [rateOrderId, setRateOrderId] = useState<string | null>(null);
  const [rateBuyerId, setRateBuyerId] = useState<string | null>(null);
  const [rateStars, setRateStars] = useState<number>(10);
  const [rateComment, setRateComment] = useState<string>('');
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);
  const [ratedByOrderId, setRatedByOrderId] = useState<Record<string, boolean>>({});
  const [bothRatedByOrderId, setBothRatedByOrderId] = useState<Record<string, boolean>>({});

  // Disputas
  const [disputeByOrderId, setDisputeByOrderId] = useState<Record<string, string>>({});
  const [disputeInfoByOrderId, setDisputeInfoByOrderId] = useState<Record<string, { id: string; status: string; created_at: string; admin_decision?: string | null; admin_note?: string | null }>>({});

  // Estado local para rastrear descargas de guías (optimistic update)
  const [labelDownloadedAtByOrderId, setLabelDownloadedAtByOrderId] = useState<Record<string, string>>({});
  const [proofDownloadedAtByOrderId, setProofDownloadedAtByOrderId] = useState<Record<string, string>>({});
  
  // Contador de tiempo para actualizar cada segundo
  const [currentTime, setCurrentTime] = useState(new Date());
  
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Filtros y búsqueda
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [filtersExpanded, setFiltersExpanded] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [ventasPage, setVentasPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      try {
        setIsBooting(true);
        setError(null);
        setSuccess(null);
        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr) throw userErr;
        const user = userData.user;
        if (!user) {
          window.location.href = '/login';
          return;
        }

        const { data, error } = await supabase
          .from('orders')
          .select('*')
          .eq('seller_id', user.id)
          .order('created_at', { ascending: false })
          .limit(500);
        if (error) throw error;
        const next = (data as any[]) ?? [];
        if (cancelled) return;
        setOrders(next);

        const ids = next.map((o) => String(o?.id || '')).filter(Boolean);

        const loadDisputes = async (orderIds: string[]) => {
          try {
            const { data: sess } = await supabase.auth.getSession();
            const token = sess.session?.access_token;
            if (!token) return;
            const res = await fetch(`/api/disputes/list?limit=200&t=${Date.now()}`, {
              headers: { authorization: `Bearer ${token}` },
              cache: 'no-store',
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) return;
            const list = (json?.disputes ?? []) as any[];
            const wanted = new Set(orderIds.map(String));
            const map: Record<string, string> = {};
            const infoMap: Record<string, { id: string; status: string; created_at: string; admin_decision?: string | null; admin_note?: string | null }> = {};
            for (const d of list) {
              const oid = String(d?.order_id || '').trim();
              const did = String(d?.id || '').trim();
              const status = String(d?.status || 'open').trim();
              const created_at = String(d?.created_at || '').trim();
              const admin_decision = d?.admin_decision ? String(d.admin_decision).trim() : null;
              const admin_note = d?.admin_note ? String(d.admin_note).trim() : null;
              if (oid && did && wanted.has(oid)) {
                map[oid] = did;
                infoMap[oid] = { id: did, status, created_at, admin_decision, admin_note };
              }
            }
            if (!cancelled) {
              setDisputeByOrderId(map);
              setDisputeInfoByOrderId(infoMap);
            }
          } catch (err) {
            console.error('[VENTAS] Error al cargar disputas:', err);
          }
        };
        if (ids.length > 0) {
          const itemsRes: any = await supabase
            .from('order_items')
            .select('order_id,listing_id,title,quantity,line_total,selected_size,selected_color')
            .in('order_id', ids);
          if (!itemsRes.error && Array.isArray(itemsRes.data)) {
            const map: Record<string, any[]> = {};
            for (const it of itemsRes.data as any[]) {
              const oid = String(it?.order_id || '');
              if (!oid) continue;
              if (!map[oid]) map[oid] = [];
              map[oid].push(it);
            }
            setItemsByOrder(map);

            // Miniaturas: best-effort desde `listings.images`
            const listingIds = Array.from(new Set((itemsRes.data as any[]).map((it) => String(it?.listing_id || '')).filter(Boolean)));
            if (listingIds.length > 0) {
              let listRes: any = await supabase.from('listings').select('id,images').in('id', listingIds).limit(300);
              if (listRes.error) {
                const code = String((listRes.error as any)?.code || '');
                const msg = String((listRes.error as any)?.message || '').toLowerCase();
                if (code === '42703' || msg.includes('does not exist') || msg.includes('column')) {
                  listRes = await supabase.from('listings').select('id').in('id', listingIds).limit(300);
                }
              }
              if (!listRes.error && Array.isArray(listRes.data)) {
                const m: Record<string, string> = {};
                for (const r of listRes.data as any[]) {
                  const id = String(r?.id || '').trim();
                  if (!id) continue;
                  const imgs = Array.isArray(r?.images) ? (r.images as any[]).map((x) => String(x || '').trim()).filter(Boolean) : [];
                  const first = imgs[0] || '';
                  if (first) m[id] = first;
                }
                setThumbByListingId(m);
              }
            }
          }
        }

        const buyerIds = Array.from(new Set(next.map((o) => String(o?.buyer_id || '')).filter(Boolean)));
        if (buyerIds.length > 0) {
          let profRes: any = await supabase.from('profiles').select('id,full_name,nickname,username').in('id', buyerIds);
          if (profRes.error) {
            const code = String((profRes.error as any)?.code || '');
            const msg = String((profRes.error as any)?.message || '').toLowerCase();
            // Intentar solo con full_name si hay error de columna o error 400
            if (code === '42703' || msg.includes('does not exist') || msg.includes('column') || code === '400') {
              profRes = await supabase.from('profiles').select('id,full_name').in('id', buyerIds);
            }
          }
          if (!profRes.error && Array.isArray(profRes.data)) {
            const map: Record<string, string> = {};
            for (const p of profRes.data as any[]) {
              const id = String(p?.id || '').trim();
              if (!id) continue;
              const name =
                String(p?.full_name || '').trim() ||
                String(p?.nickname || '').trim() ||
                String(p?.username || '').trim() ||
                `${id.slice(0, 6)}…`;
              map[id] = name;
            }
            setBuyerNames(map);
          }
        }

        // Prefill drafts para rastreo/paquetería
        const cd: Record<string, string> = {};
        const td: Record<string, string> = {};
        for (const o of next) {
          const oid = String(o?.id || '').trim();
          if (!oid) continue;
          cd[oid] = String(o?.shipping_carrier || '');
          td[oid] = String(o?.tracking_number || '');
        }
        setCarrierDraft(cd);
        setTrackingDraft(td);

        // Estado de "pendiente de contestar" (best-effort)
        if (ids.length > 0) {
          const lastBy: Record<string, { sender_id: string; created_at: string }> = {};
          let lm: any = await supabase
            .from('order_messages')
            .select('order_id,sender_id,created_at,sender_role')
            .in('order_id', ids)
            .order('created_at', { ascending: false })
            .limit(5000);
          if (lm?.error) {
            const code = String((lm.error as any)?.code || '');
            const msg = String((lm.error as any)?.message || '').toLowerCase();
            if (code === '42703' || msg.includes('column')) {
              lm = await supabase
                .from('order_messages')
                .select('order_id,sender_id,created_at')
                .in('order_id', ids)
                .order('created_at', { ascending: false })
                .limit(5000);
            }
          }
          if (!lm?.error && Array.isArray(lm.data)) {
            for (const r of lm.data as any[]) {
              const oid = String(r?.order_id || '').trim();
              if (!oid || lastBy[oid]) continue;
              lastBy[oid] = { sender_id: String(r?.sender_id || '').trim(), created_at: String(r?.created_at || '').trim() };
            }
          }

          const reads: Record<string, string> = {};
          const rr: any = await supabase.from('order_chat_reads').select('order_id,last_read_at').eq('user_id', user.id).in('order_id', ids);
          if (!rr?.error && Array.isArray(rr.data)) {
            for (const r of rr.data as any[]) {
              const oid = String(r?.order_id || '').trim();
              if (!oid) continue;
              reads[oid] = String(r?.last_read_at || '').trim();
            }
          }

          const unread: Record<string, boolean> = {};
          for (const oid of ids) {
            const last = lastBy[oid];
            if (!last?.created_at) {
              unread[oid] = false;
              continue;
            }
            if (last.sender_id && last.sender_id === user.id) {
              unread[oid] = false;
              continue;
            }
            const lastAt = Date.parse(last.created_at);
            const readAt = reads[oid] ? Date.parse(reads[oid]) : NaN;
            unread[oid] = Number.isFinite(lastAt) && (!Number.isFinite(readAt) || lastAt > readAt);
          }
          setHasUnreadByOrderId(unread);
        }

        // Calificaciones seller->buyer ya enviadas (best-effort)
        if (ids.length > 0) {
          const map: Record<string, boolean> = {};
          const bothMap: Record<string, boolean> = {};
          
          // Calificaciones del vendedor al comprador
          const rr: any = await supabase
            .from('user_ratings')
            .select('order_id')
            .eq('direction', 'seller_to_buyer')
            .eq('rater_id', user.id)
            .in('order_id', ids)
            .limit(5000);
          if (!rr?.error && Array.isArray(rr.data)) {
            for (const r of rr.data as any[]) {
              const oid = String(r?.order_id || '').trim();
              if (oid) map[oid] = true;
            }
            setRatedByOrderId(map);
          }
          
          // Verificar si ambas calificaciones existen (buyer_to_seller y seller_to_buyer)
          const bothRatingsRes: any = await supabase
            .from('user_ratings')
            .select('order_id,direction')
            .in('order_id', ids)
            .limit(10000);
          if (!bothRatingsRes?.error && Array.isArray(bothRatingsRes.data)) {
            const byOrder: Record<string, Set<string>> = {};
            for (const r of bothRatingsRes.data as any[]) {
              const oid = String(r?.order_id || '').trim();
              const dir = String(r?.direction || '').trim();
              if (oid && dir) {
                if (!byOrder[oid]) byOrder[oid] = new Set();
                byOrder[oid].add(dir);
              }
            }
            for (const [oid, directions] of Object.entries(byOrder)) {
              if (directions.has('buyer_to_seller') && directions.has('seller_to_buyer')) {
                bothMap[oid] = true;
              }
            }
            setBothRatedByOrderId(bothMap);
          }
        }

        // Disputas (best-effort)
        if (ids.length > 0) {
          await loadDisputes(ids);
        }
      } catch (e: unknown) {
        console.error(e);
        if (!cancelled) setError(e instanceof Error ? e.message : 'No se pudieron cargar tus ventas.');
      } finally {
        if (!cancelled) setIsBooting(false);
      }
    };
    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  const submitRateBuyer = async () => {
    setError(null);
    setSuccess(null);
    const orderId = String(rateOrderId || '').trim();
    const buyerId = String(rateBuyerId || '').trim();
    if (!orderId || !buyerId || !isUuid(orderId)) return;

    try {
      setIsSubmittingRating(true);
      const { data: sess, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) throw sessErr;
      const token = sess.session?.access_token;
      if (!token) throw new Error('Auth session missing');

      const res = await fetch('/api/orders/rate-buyer', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderId, stars: rateStars, comment: rateComment }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'No se pudo calificar al comprador.');

      setRatedByOrderId((p) => ({ ...p, [orderId]: true }));
      
      // Verificar si ambas calificaciones existen después de calificar
      if (json.both_rated) {
        setBothRatedByOrderId((p) => ({ ...p, [orderId]: true }));
      }
      
      setSuccess('Listo: calificaste al comprador.');
      setRateOpen(false);
    } catch (e: unknown) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'No se pudo calificar al comprador.');
    } finally {
      setIsSubmittingRating(false);
    }
  };

  // Filtrar órdenes según el filtro activo y búsqueda (optimizado con useMemo)
  const filteredOrders = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    
    return orders.filter((o) => {
      const status = String(o?.status || '').trim();
      const labelUrl = String(o?.shipping_label_url || '').trim();
      const tracking = String(o?.tracking_number || '').trim();
      const orderId = String(o?.id || '').trim();
      const hasRating = Boolean(ratedByOrderId[orderId]);
      const isCompleted = status === 'delivered';

      // Aplicar filtro de estado
      let matchesFilter = true;
      switch (activeFilter) {
        case 'pending_payment':
          matchesFilter = status === 'pending_payment';
          break;
        case 'pending_shipping':
          matchesFilter = (status === 'paid' || Boolean(labelUrl)) && !tracking;
          break;
        case 'shipped':
          matchesFilter = status === 'shipped' || tracking.length > 0;
          break;
        case 'rated':
          matchesFilter = isCompleted && hasRating;
          break;
        case 'not_rated':
          matchesFilter = isCompleted && !hasRating;
          break;
        case 'paid':
          matchesFilter = status === 'paid';
          break;
        case 'no_label':
          matchesFilter = !labelUrl;
          break;
        case 'with_label':
          matchesFilter = Boolean(labelUrl);
          break;
        default:
          matchesFilter = true; // 'all'
      }

      if (!matchesFilter) return false;

      // Aplicar búsqueda si hay query
      if (query) {
        const buyerId = String(o?.buyer_id || '');
        const buyerName = buyerId ? (buyerNames[buyerId] || '').toLowerCase() : '';
        const orderIdLower = orderId.toLowerCase();
        const trackingLower = tracking.toLowerCase();
        
        // Buscar en: ID de orden, nombre del comprador, tracking
        const matchesSearch = 
          orderIdLower.includes(query) ||
          buyerName.includes(query) ||
          trackingLower.includes(query);
        
        return matchesSearch;
      }

      return true;
    });
  }, [orders, activeFilter, ratedByOrderId, searchQuery, buyerNames]);

  // Contadores por filtro
  const filterCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: orders.length,
      pending_payment: 0,
      pending_shipping: 0,
      shipped: 0,
      rated: 0,
      not_rated: 0,
      paid: 0,
      no_label: 0,
      with_label: 0,
    };

    for (const o of orders) {
      const status = String(o?.status || '').trim();
      const labelUrl = String(o?.shipping_label_url || '').trim();
      const tracking = String(o?.tracking_number || '').trim();
      const orderId = String(o?.id || '').trim();
      const hasRating = Boolean(ratedByOrderId[orderId]);
      const isCompleted = status === 'delivered';

      if (status === 'pending_payment') counts.pending_payment++;
      if ((status === 'paid' || labelUrl) && !tracking) counts.pending_shipping++;
      if (status === 'shipped' || tracking.length > 0) counts.shipped++;
      if (isCompleted && hasRating) counts.rated++;
      if (isCompleted && !hasRating) counts.not_rated++;
      if (status === 'paid') counts.paid++;
      if (!labelUrl) counts.no_label++;
      if (labelUrl) counts.with_label++;
    }

    return counts;
  }, [orders, ratedByOrderId]);

  const VENTAS_PAGE_SIZE = 10;
  const ventasTotalPages = Math.max(1, Math.ceil(filteredOrders.length / VENTAS_PAGE_SIZE));
  const ventasPaginated = useMemo(() => {
    const page = Math.min(Math.max(1, ventasPage), ventasTotalPages);
    const start = (page - 1) * VENTAS_PAGE_SIZE;
    return filteredOrders.slice(start, start + VENTAS_PAGE_SIZE);
  }, [filteredOrders, ventasPage, ventasTotalPages]);

  useEffect(() => {
    setVentasPage(1);
  }, [activeFilter, searchQuery]);

  useEffect(() => {
    if (ventasPage > ventasTotalPages && ventasTotalPages >= 1) setVentasPage(1);
  }, [ventasTotalPages, ventasPage]);

  const handleUploadProof = async (orderId: string, file: File) => {
    setError(null);
    setSuccess(null);
    setIsMarking((p) => ({ ...p, [orderId]: true }));
    try {
      const { data: sess, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) throw sessErr;
      const token = sess.session?.access_token;
      if (!token) throw new Error('Auth session missing');

      const fd = new FormData();
      fd.append('orderId', orderId);
      fd.append('file', file);
      
      const res = await fetch('/api/orders/upload-proof', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: fd,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'No se pudo subir la evidencia.');

      const proofUrl = json.url;

      setOrders((prev) =>
        prev.map((o) =>
          String(o?.id || '') === orderId
            ? { ...o, status: 'shipped', delivery_proof_url: proofUrl, shipped_at: new Date().toISOString(), shipping_carrier: 'pickup', tracking_number: 'ENTREGA_PERSONAL' }
            : o,
        ),
      );
      setSuccess('Evidencia subida correctamente. La orden se marcó como entregada/enviada.');
    } catch (e: unknown) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'No se pudo subir la evidencia.');
    } finally {
      setIsMarking((p) => ({ ...p, [orderId]: false }));
    }
  };

  const markShipped = async (orderId: string) => {
    setError(null);
    setSuccess(null);
    setIsMarking((p) => ({ ...p, [orderId]: true }));
    try {
      const tracking = String(trackingDraft[orderId] ?? '').trim();
      const carrier = String(carrierDraft[orderId] ?? '').trim();
      if (tracking.length < 2) {
        setError('Ingresa un código de rastreo/nombre válido.');
        return;
      }

      const { data: sess, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) throw sessErr;
      const token = sess.session?.access_token;
      if (!token) throw new Error('Auth session missing');

      const res = await fetch('/api/orders/mark-shipped', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderId, tracking_number: tracking, shipping_carrier: carrier }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'No se pudo marcar como enviado.');

      setOrders((prev) =>
        prev.map((o) =>
          String(o?.id || '') === orderId
            ? { ...o, status: 'shipped', tracking_number: tracking, shipping_carrier: carrier || null, shipped_at: new Date().toISOString() }
            : o,
        ),
      );
      setSuccess('Listo: marcado como enviado. Se notificó al comprador.');
    } catch (e: unknown) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'No se pudo marcar como enviado.');
    } finally {
      setIsMarking((p) => ({ ...p, [orderId]: false }));
    }
  };

  const handleDownloadProof = async (orderId: string) => {
    // Optimistic update
    const now = new Date().toISOString();
    setProofDownloadedAtByOrderId((prev) => ({ ...prev, [orderId]: now }));
    
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (token) {
        // Call API (fire and forget)
        fetch('/api/orders/proof-downloaded', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify({ orderId }),
        }).catch(console.error);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // --- 1. Sistema de Advertencias Global (Warning System) ---
  const hasLateShipments = useMemo(() => {
    const now = Date.now();
    return orders.some(o => {
      // Si status='paid' y no shipped, y pasaron 72h
      if (o.status === 'paid' && !o.shipped_at) {
         const created = new Date(o.created_at).getTime();
         return (now - created) > 72 * 60 * 60 * 1000;
      }
      return false;
    });
  }, [orders]);

  const hasActiveDisputes = useMemo(() => {
    return Object.keys(disputeByOrderId).length > 0;
  }, [disputeByOrderId]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 to-white pb-10">
      <style>{tutorialStyles}</style>
      
      <div className="sticky top-0 z-40 border-b border-black/5 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-3 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-pink text-white shadow-sm">
               <span className="text-xs font-extrabold tracking-widest">GP</span>
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-gray-900">Ventas</div>
              <div className="text-[10px] text-gray-500">Panel de control</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Toggle Tutorial Mode */}
            <button
              onClick={toggleTutorialMode}
              className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                isTutorialMode
                  ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              title="Activar/Desactivar Guía Interactiva"
            >
              <div className={`relative h-4 w-8 rounded-full transition-colors ${isTutorialMode ? 'bg-indigo-500' : 'bg-gray-300'}`}>
                <div
                  className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform`}
                  style={{ left: isTutorialMode ? 'calc(100% - 14px)' : '2px' }}
                />
              </div>
              <span className="hidden sm:inline">Modo Tutorial</span>
            </button>

            <Link href="/sell" className="rounded-xl bg-brand-pink px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:opacity-90">
              Vender
            </Link>
            <Link href="/dashboard" className="rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-gray-900 shadow-sm ring-1 ring-black/5 hover:bg-gray-50">
              Volver
            </Link>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-3 py-4">
        <PageTour steps={pageTours.ventas || []} pageId="ventas" />
        <SectionMessage section="ventas" />
        
        {/* --- Sistema de Advertencias Global --- */}
        {hasLateShipments && (
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-900 shadow-sm animate-pulse">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-bold">¡Tienes envíos atrasados!</h3>
              <p className="text-xs opacity-90">Algunos pedidos han superado el límite de 72 horas. Envíalos urgente para evitar penalizaciones.</p>
            </div>
          </div>
        )}
        {hasActiveDisputes && (
            <div className="mb-4 flex items-center gap-3 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-orange-900 shadow-sm">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-100">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                </div>
                <div>
                <h3 className="text-sm font-bold">Disputas en curso</h3>
                <p className="text-xs opacity-90">Tienes disputas activas que requieren tu atención. Revisa los detalles en cada pedido.</p>
                </div>
            </div>
        )}

        {error && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
        {success && <div className="mb-4 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{success}</div>}

        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 sm:p-5 relative">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <div className="text-base font-bold text-gray-900">Historial de ventas</div>
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-extrabold text-green-800 ring-1 ring-green-200">
                  TÚ VENDISTE
                </span>
              </div>
              <div className="mt-0.5 text-xs text-gray-600">Gestiona tus envíos y cobros.</div>
            </div>
          </div>

          {!isBooting && orders.length > 0 ? (
            <div className="mt-4">
              {/* Buscador y Filtros */}
              <div className="mb-4 flex flex-col sm:flex-row gap-3">
                 <div className="relative flex-1">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.35-4.35" />
                  </svg>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar..."
                    className="w-full rounded-xl border border-gray-300 bg-white px-9 py-2 text-xs outline-none placeholder:text-gray-400 focus:border-brand-pink focus:ring-2 focus:ring-brand-pink/20"
                  />
                 </div>
              </div>

              <div className="relative flex flex-wrap items-center gap-2 border-b border-gray-200 pb-2">
                {/* Filtro activo siempre visible */}
                {(() => {
                  const filterConfig: Record<string, { label: string; count: number; color: string }> = {
                    all: { label: 'Todas', count: filterCounts.all, color: 'bg-brand-pink text-white shadow-sm' },
                    pending_shipping: { label: 'Pendiente envío', count: filterCounts.pending_shipping, color: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200' },
                    pending_payment: { label: 'Pendiente pago', count: filterCounts.pending_payment, color: 'bg-red-100 text-red-700 ring-1 ring-red-200' },
                    shipped: { label: 'Enviadas', count: filterCounts.shipped, color: 'bg-blue-100 text-blue-700 ring-1 ring-blue-200' },
                    rated: { label: 'Calificadas', count: filterCounts.rated, color: 'bg-purple-100 text-purple-700 ring-1 ring-purple-200' },
                    not_rated: { label: 'Sin Calificar', count: filterCounts.not_rated, color: 'bg-orange-100 text-orange-700 ring-1 ring-orange-200' },
                    paid: { label: 'Pagadas', count: filterCounts.paid, color: 'bg-green-100 text-green-700 ring-1 ring-green-200' },
                    no_label: { label: 'Sin Guía', count: filterCounts.no_label, color: 'bg-gray-200 text-gray-700 ring-1 ring-gray-300' },
                    with_label: { label: 'Con Guía', count: filterCounts.with_label, color: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200' },
                  };
                  const active = filterConfig[activeFilter] || filterConfig.all;
                  return (
                    <button
                      type="button"
                      onClick={() => setActiveFilter('all')}
                      className={`whitespace-nowrap rounded-xl px-3 py-1.5 text-[11px] font-bold transition ${active.color}`}
                    >
                      {active.label} {active.count > 0 ? `(${active.count})` : ''}
                    </button>
                  );
                })()}

                {/* Botón para expandir/colapsar */}
                <button
                  type="button"
                  onClick={() => setFiltersExpanded(!filtersExpanded)}
                  className={`inline-flex items-center gap-1.5 rounded-xl bg-gray-100 px-3 py-1.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-200 transition ${isTutorialMode ? 'animate-subtle-pulse' : ''}`}
                >
                  {filtersExpanded ? 'Menos' : 'Más filtros'}
                </button>

                {/* Filtros adicionales (colapsables) */}
                {filtersExpanded && (
                  <div className="flex flex-wrap gap-2 w-full mt-2 animate-slide-in">
                    {activeFilter !== 'all' && (
                      <button type="button" onClick={() => { setActiveFilter('all'); setFiltersExpanded(false); }} className="whitespace-nowrap rounded-xl px-3 py-1.5 text-[11px] font-bold transition bg-gray-50 text-gray-700 hover:bg-gray-100">
                        Todas {filterCounts.all > 0 ? `(${filterCounts.all})` : ''}
                      </button>
                    )}
                    {activeFilter !== 'pending_shipping' && (
                      <button type="button" onClick={() => { setActiveFilter('pending_shipping'); setFiltersExpanded(false); }} className="whitespace-nowrap rounded-xl px-3 py-1.5 text-[11px] font-bold transition bg-gray-50 text-gray-700 hover:bg-gray-100">
                        Pendiente envío {filterCounts.pending_shipping > 0 ? `(${filterCounts.pending_shipping})` : ''}
                      </button>
                    )}
                     {activeFilter !== 'pending_payment' && (
                      <button type="button" onClick={() => { setActiveFilter('pending_payment'); setFiltersExpanded(false); }} className="whitespace-nowrap rounded-xl px-3 py-1.5 text-[11px] font-bold transition bg-gray-50 text-gray-700 hover:bg-gray-100">
                        Pendiente pago {filterCounts.pending_payment > 0 ? `(${filterCounts.pending_payment})` : ''}
                      </button>
                    )}
                     {activeFilter !== 'shipped' && (
                      <button type="button" onClick={() => { setActiveFilter('shipped'); setFiltersExpanded(false); }} className="whitespace-nowrap rounded-xl px-3 py-1.5 text-[11px] font-bold transition bg-gray-50 text-gray-700 hover:bg-gray-100">
                        Enviadas {filterCounts.shipped > 0 ? `(${filterCounts.shipped})` : ''}
                      </button>
                    )}
                     {activeFilter !== 'rated' && (
                      <button type="button" onClick={() => { setActiveFilter('rated'); setFiltersExpanded(false); }} className="whitespace-nowrap rounded-xl px-3 py-1.5 text-[11px] font-bold transition bg-gray-50 text-gray-700 hover:bg-gray-100">
                        Calificadas {filterCounts.rated > 0 ? `(${filterCounts.rated})` : ''}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {isBooting ? (
            <div className="mt-6 text-sm text-gray-600">Cargando…</div>
          ) : orders.length === 0 ? (
            <div className="mt-6 text-sm text-gray-600">Aún no tienes ventas.</div>
          ) : filteredOrders.length === 0 ? (
            <div className="mt-6 text-sm text-gray-600">No hay ventas que coincidan con este filtro.</div>
          ) : (
            <>
              {/* Leyenda compacta */}
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                <span className="text-[10px] font-bold uppercase text-gray-500">Leyenda:</span>
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 shrink-0 rounded border border-green-500 bg-green-50" />
                  <span className="text-[10px] text-gray-700">Concretada</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 shrink-0 rounded border border-yellow-500 bg-yellow-50" />
                  <span className="text-[10px] text-gray-700">En proceso</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 shrink-0 rounded border border-red-500 bg-red-50" />
                  <span className="text-[10px] text-gray-700">Disputa</span>
                </div>
              </div>
              <div className="mt-4 space-y-2" data-tour="orders-list">
              {ventasPaginated.map((o) => {
                const buyerId = String(o?.buyer_id || '');
                const buyer = buyerId ? buyerNames[buyerId] || `${buyerId.slice(0, 6)}…` : '—';
                const items = itemsByOrder[String(o?.id || '')] ?? [];
                const labelUrl = String(o?.shipping_label_url || '').trim();
                const orderId = String(o?.id || '').trim();
                const labelDownloadedAtFromDb = String(o?.label_downloaded_at || '').trim();
                const labelDownloadedAtLocal = labelDownloadedAtByOrderId[orderId] || '';
                const labelDownloadedAt = labelDownloadedAtLocal || labelDownloadedAtFromDb;
                const isLabelDownloaded = Boolean(labelDownloadedAt);
                
                const proofDownloadedAtFromDb = String(o?.delivery_proof_downloaded_at || '').trim();
                const proofDownloadedAtLocal = proofDownloadedAtByOrderId[orderId] || '';
                const proofDownloadedAt = proofDownloadedAtLocal || proofDownloadedAtFromDb;
                const isProofDownloaded = Boolean(proofDownloadedAt);

                const tracking = String(o?.tracking_number || '').trim();
                const carrier = String(o?.shipping_carrier || '').trim();
                const shippedAt = String(o?.shipped_at || '').trim();
                const canMarkShipped = orderId && (String(o?.status || '') === 'paid' || String(o?.status || '') === 'pending_payment');
                const hasUnread = Boolean(hasUnreadByOrderId[orderId]);
                const status = String(o?.status || '').trim();
                const alreadyRated = Boolean(ratedByOrderId[orderId]);
                const bothRated = Boolean(bothRatedByOrderId[orderId]);
                const canRateBuyer = Boolean(orderId && buyerId && !alreadyRated && (labelUrl || status === 'delivered' || status === 'received'));
                const disputeId = orderId ? disputeByOrderId[orderId] : '';
                
                const getBorderColor = () => {
                  if (disputeId) {
                    const di = disputeInfoByOrderId[orderId];
                    if (di?.status === 'open') {
                      return { border: 'border-red-500 ring-red-200 hover:border-red-600', left: 'border-red-500', bg: 'bg-red-50/30' };
                    }
                  }
                  if (status === 'delivered' || status === 'received') {
                    return { border: 'border-green-500 ring-green-200 hover:border-green-600', left: 'border-green-500', bg: 'bg-green-50/30' };
                  }
                  return { border: 'border-yellow-500 ring-yellow-200 hover:border-yellow-600', left: 'border-yellow-500', bg: 'bg-yellow-50/30' };
                };
                
                const borderColors = getBorderColor();
                
                const isOrderCompleted = status === 'delivered' || status === 'received';
                const daysSinceShipped = shippedAt ? (() => {
                  const shippedDate = new Date(shippedAt);
                  const daysDiff = (currentTime.getTime() - shippedDate.getTime()) / (1000 * 60 * 60 * 24);
                  return daysDiff;
                })() : null;
                const chatDisabled = isOrderCompleted || (daysSinceShipped !== null && daysSinceShipped >= 15);
                
                const netEarnings = payoutNet(o);

                // --- Variables para la guía interactiva ---
                const showLabelGuide = isTutorialMode && labelUrl && !isLabelDownloaded;
                const showProofGuide = isTutorialMode && (o?.shipping_option_id === 'pickup' || o?.shipping_carrier === 'pickup') && !o.delivery_proof_url && status !== 'delivered';
                const showMarkShippedGuide = isTutorialMode && canMarkShipped && !tracking && !showLabelGuide && !(o?.shipping_option_id === 'pickup' || o?.shipping_carrier === 'pickup');
                const showRateGuide = isTutorialMode && canRateBuyer;

                // --- 3. Contadores de tiempo (Restaurado) ---
                const showCountdown = (status === 'paid' || (labelUrl && !tracking)) && status !== 'shipped' && status !== 'delivered' && status !== 'cancelled';
                
                // --- 5. Instrucciones claras (Próximo paso) ---
                const getNextStep = () => {
                  if (status === 'pending_payment') return { text: 'Esperar pago del comprador', color: 'text-gray-500' };
                  if (status === 'paid' && !labelUrl && !(o?.shipping_option_id === 'pickup' || o?.shipping_carrier === 'pickup')) return { text: 'Generando guía...', color: 'text-amber-600' };
                  if (labelUrl && !isLabelDownloaded) return { text: 'Descargar e imprimir guía', color: 'text-brand-pink font-bold' };
                  if (isLabelDownloaded && !tracking) return { text: 'Entregar paquete en paquetería', color: 'text-blue-600 font-bold' };
                  if ((o?.shipping_option_id === 'pickup' || o?.shipping_carrier === 'pickup') && !o.delivery_proof_url) return { text: 'Entregar y subir evidencia', color: 'text-purple-600 font-bold' };
                  if (status === 'shipped') {
                    if (alreadyRated) return { text: 'Felicidades espera que tu comprador reciba su paquete sigue asi', color: 'text-green-600 font-bold' };
                    return { text: 'Tu paquete está en tránsito, califica a tu comprador.', color: 'text-blue-500' };
                  }
                  if (status === 'delivered' && !alreadyRated) return { text: 'Calificar al comprador', color: 'text-green-600 font-bold' };
                  if (status === 'delivered' && alreadyRated) return { text: 'Venta finalizada', color: 'text-gray-400' };
                  return { text: 'Ver detalles', color: 'text-gray-500' };
                };
                const nextStep = getNextStep();

                return (
                  <div
                    key={String(o?.id || Math.random())}
                    className={`rounded-xl border-2 bg-white p-2.5 shadow-sm ring-1 hover:shadow-md transition-all ${borderColors.border} ${hasUnread ? borderColors.bg : ''} relative`}
                  >
                    <div className={`border-l-4 pl-2.5 -ml-2.5 ${borderColors.left}`}>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-green-600 px-2 py-0.5 text-[10px] font-extrabold text-white uppercase">
                            Tu Venta
                          </span>
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-700">
                            {String(o?.id || '').slice(0, 8)}…
                          </span>
                          {status === 'pending_payment' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-800 ring-1 ring-red-300">
                              PENDIENTE PAGO
                            </span>
                          ) : status === 'paid' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-extrabold text-green-800 ring-1 ring-green-300">
                              PAGADO
                            </span>
                          ) : status === 'shipped' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800 ring-1 ring-blue-300">
                              ENVIADO
                            </span>
                          ) : status === 'delivered' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-800 ring-1 ring-purple-300">
                              COMPLETADO
                            </span>
                          ) : status === 'cancelled' ? (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600 ring-1 ring-gray-200">
                              Cancelado
                            </span>
                          ) : (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-700">
                              {String(o?.status || '—')}
                            </span>
                          )}
                          <span className="text-[10px] text-gray-500">{formatDateTime(o?.created_at)}</span>
                          {disputeId && (
                            <Link href={`/dashboard/disputas/${disputeId}`} className="inline-flex items-center gap-1.5 rounded-full border border-red-400 bg-red-50 px-2 py-0.5 text-[10px] font-extrabold text-red-900 shadow-sm hover:bg-red-100 animate-pulse">
                              <span>Disputa Activa</span>
                            </Link>
                          )}
                        </div>

                        {/* --- 5. Instrucciones claras (Stepper) --- */}
                        <div className="mt-2 mb-1 flex items-center gap-2 text-xs">
                          <span className="font-semibold text-gray-500">Siguiente paso:</span>
                          <span className={`${nextStep.color} animate-pulse`}>{nextStep.text}</span>
                        </div>

                        {/* --- 3. Contadores de tiempo (Countdown) --- */}
                        {showCountdown && (
                          <div className="mt-2 max-w-xs">
                             <Countdown72Hours startTime={o?.created_at} shippedAt={o?.shipped_at} />
                          </div>
                        )}

                        <div className={`mt-2 mb-2 flex flex-col gap-1 rounded-lg p-2 ring-1 ${netEarnings < 0 ? 'bg-red-50/50 ring-red-100' : 'bg-green-50/50 ring-green-100'}`}>
                          <div className="flex items-center gap-2 text-xs text-gray-800">
                            <span className="font-medium text-gray-500">Comprador:</span>
                            <span className="font-bold">{buyer}</span>
                          </div>
                          <div className="flex items-center gap-2">
                             <span className={`text-xl font-black drop-shadow-sm ${netEarnings < 0 ? 'text-red-600' : 'text-green-600'}`}>
                               {netEarnings < 0 ? '' : '+'}{formatMoney(netEarnings)}
                             </span>
                             <span className={`text-[10px] font-semibold ${netEarnings < 0 ? 'text-red-700/70' : 'text-green-700/70'}`}>
                               {netEarnings < 0 ? 'Saldo Negativo' : 'Tu ganancia'}
                             </span>
                          </div>
                        </div>

                        {/* Artículos: lista compacta */}
                        {items.length > 0 ? (
                          <div className="mt-2 space-y-1">
                            {items.slice(0, 3).map((it: any, idx: number) => {
                              const lid = String(it?.listing_id || '').trim();
                              const t = String(it?.title || 'Artículo');
                              const img = lid ? thumbByListingId[lid] : '';
                              return (
                                <div key={idx} className="flex gap-2 rounded-lg border border-gray-100 bg-white p-1.5 ring-1 ring-black/5 hover:bg-gray-50 items-center">
                                  {img ? (
                                    <div className="h-8 w-8 shrink-0 overflow-hidden rounded bg-gray-100">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={img} alt={t} className="h-full w-full object-cover" />
                                    </div>
                                  ) : (
                                    <div className="h-8 w-8 shrink-0 rounded bg-gray-100" />
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <Link href={`/listings/${String(it.listing_id)}`} className="text-xs font-bold text-gray-900 hover:text-brand-pink hover:underline line-clamp-1">
                                      {t}
                                    </Link>
                                  </div>
                                </div>
                              );
                            })}
                            {items.length > 3 && <div className="text-[10px] text-gray-500 pl-1">+{items.length - 3} más</div>}
                          </div>
                        ) : null}
                      </div>
                      
                      {/* Columna Derecha: Acciones y Totales */}
                      <div className="shrink-0 w-full sm:w-[260px] rounded-xl bg-gray-50 px-3 py-2.5 text-xs ring-1 ring-black/5">
                        <div className="flex justify-between items-center mb-2 border-b border-gray-200 pb-2">
                            <span className="text-[10px] font-bold text-gray-800">Total Venta (Cliente)</span>
                            <span className="font-extrabold text-gray-900">{formatMoney(o?.total)}</span>
                        </div>

                        {/* Desglose detallado de la venta */}
                        <div className="space-y-1.5 mb-3">
                          {/* Precio base del producto */}
                          <div className="flex justify-between text-[10px] text-gray-600">
                             <span>Precio Producto</span>
                             <span>{formatMoney(o?.subtotal || (Number(o?.total || 0) - Number(o?.shipping_fee || 0)))}</span>
                          </div>

                          {/* Envío */}
                          <div className="flex justify-between text-[10px] text-gray-600">
                             <span>Envío (Cliente)</span>
                             <span>{formatMoney(o?.shipping_fee)}</span>
                          </div>
                          
                          <div className="my-1.5 border-t border-dashed border-gray-200"></div>
                          
                          {/* Deducciones / Costos Vendedor */}
                          <div className="flex justify-between text-[10px] text-gray-600">
                             <span className="text-gray-500">Comisión Venta</span>
                             <span className="text-red-600">-{formatMoney(o?.commission_fee)}</span>
                          </div>

                          {/* Subsidio de envío */}
                          {(Number(o?.shipping_subsidy || 0) > 0) && (
                            <div className="flex justify-between text-[10px] text-gray-600">
                               <span className="text-gray-500">Subsidio Envío</span>
                               <span className="text-red-600">-{formatMoney(o?.shipping_subsidy)}</span>
                            </div>
                          )}

                          {/* Cupón */}
                          {(Number(o?.coupon_discount || 0) > 0) && (
                            <div className="flex justify-between text-[10px] text-gray-600">
                               <span className="text-gray-500">Descuento Cupón</span>
                               <span className="text-red-600">-{formatMoney(o?.coupon_discount)}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                            <span className="text-[10px] font-bold text-gray-900">Tu Ganancia Neta</span>
                            <span className={`font-extrabold ${netEarnings < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                {formatMoney(netEarnings)}
                            </span>
                        </div>
                        
                        <div className="space-y-2">
                          {labelUrl ? (
                            <div className="space-y-2 relative">
                              <TutorialTooltip text="Descarga la guía aquí" show={showLabelGuide} />
                              <div className={isLabelDownloaded ? 'flex items-center gap-1 text-[10px] font-bold text-green-700' : 'flex items-center gap-1 text-[10px] font-bold text-amber-800'}>
                                {isLabelDownloaded ? '✓ Guía descargada' : '⏳ Guía lista'}
                              </div>
                              <button
                                type="button"
                                onClick={async () => {
                                  const orderIdStr = String(o?.id || '');
                                  if (!isLabelDownloaded) {
                                    const now = new Date().toISOString();
                                    setLabelDownloadedAtByOrderId((prev) => ({ ...prev, [orderIdStr]: now }));
                                  }
                                  try {
                                    const { data: sess } = await supabase.auth.getSession();
                                    const token = sess.session?.access_token;
                                    if (token) {
                                      await fetch('/api/orders/label-downloaded', {
                                        method: 'POST',
                                        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
                                        body: JSON.stringify({ orderId: orderIdStr }),
                                      }).catch(() => null);
                                    }
                                  } finally {
                                    window.open(labelUrl, '_blank', 'noopener,noreferrer');
                                  }
                                }}
                                className={`w-full inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold shadow-sm transition ${
                                  isLabelDownloaded
                                    ? 'bg-green-600 text-white ring-1 ring-green-700 hover:bg-green-700'
                                    : 'bg-brand-pink text-white ring-1 ring-brand-pink hover:opacity-90 animate-subtle-pulse'
                                }`}
                              >
                                {isLabelDownloaded ? 'Volver a descargar' : 'Descargar guía'}
                              </button>
                            </div>
                          ) : !(o?.shipping_option_id === 'pickup' || o?.shipping_carrier === 'pickup') ? (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-center">
                              <div className="text-[10px] font-bold text-amber-900">Guía pendiente</div>
                            </div>
                          ) : null}

                          {tracking ? (
                             <div className="rounded-lg border border-gray-100 bg-white px-2 py-1.5 text-[10px]">
                               <div className="text-gray-500">Rastreo ({carrier || '—'}):</div>
                               <div className="font-mono font-bold text-gray-900 truncate">{tracking}</div>
                             </div>
                          ) : canMarkShipped ? (
                            <div className="space-y-2 relative">
                               <TutorialTooltip text="Entrega tu paquete en paqueteria, Ingresa Nombre de la paqueteria, numero de rastreo y Marca como enviado" show={showMarkShippedGuide} />
                               {(o?.shipping_option_id === 'pickup' || o?.shipping_carrier === 'pickup') && (
                                 <div className="rounded-lg border border-pink-200 bg-pink-50 px-2 py-1.5">
                                   <div className="text-[10px] text-pink-900 leading-tight">
                                     Sube la evidencia para procesar el pago.
                                   </div>
                                 </div>
                               )}
                               <div className="grid grid-cols-2 gap-1.5">
                                <input
                                  value={carrierDraft[orderId] ?? ''}
                                  onChange={(e) => setCarrierDraft((p) => ({ ...p, [orderId]: e.target.value }))}
                                  placeholder={(o?.shipping_option_id === 'pickup' || o?.shipping_carrier === 'pickup') ? "Entregado a" : "Paquetería"}
                                  className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-[10px] outline-none focus:ring-1 focus:ring-brand-pink"
                                  disabled={status === 'pending_payment' && !labelUrl}
                                />
                                <input
                                  value={trackingDraft[orderId] ?? ''}
                                  onChange={(e) => setTrackingDraft((p) => ({ ...p, [orderId]: e.target.value }))}
                                  placeholder={(o?.shipping_option_id === 'pickup' || o?.shipping_carrier === 'pickup') ? "Recibió" : "Rastreo"}
                                  className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-[10px] outline-none focus:ring-1 focus:ring-brand-pink"
                                  disabled={status === 'pending_payment' && !labelUrl}
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => markShipped(orderId)}
                                disabled={Boolean(isMarking[orderId]) || String(trackingDraft[orderId] ?? '').trim().length < 2 || (status === 'pending_payment' && !labelUrl)}
                                className="w-full rounded-lg bg-brand-pink px-2.5 py-1.5 text-[10px] font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-60"
                              >
                                {isMarking[orderId] ? '...' : (o?.shipping_option_id === 'pickup' || o?.shipping_carrier === 'pickup') ? 'Confirmar Entrega' : 'Marcar enviado'}
                              </button>
                            </div>
                          ) : null}
                          
                          {(o?.shipping_option_id === 'pickup' || o?.shipping_carrier === 'pickup') && (
                              <div className="relative">
                                <TutorialTooltip text="Sube la evidencia aquí" show={showProofGuide} />
                                <Link
                                  href={`/dashboard/ventas/${orderId}/delivery-format`}
                                  target="_blank"
                                  onClick={() => handleDownloadProof(orderId)}
                                  className={`flex w-full items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-bold mb-1 shadow-sm ring-1 ring-inset ${isProofDownloaded ? 'bg-green-50 text-green-700 ring-green-600/20 hover:bg-green-100' : 'bg-gray-800 text-white ring-black/5 hover:bg-gray-700'}`}
                                >
                                  {isProofDownloaded ? 'Constancia Descargada' : 'Descargar Constancia'}
                                </Link>
                                {!o.delivery_proof_url && status !== 'delivered' && status !== 'completed' ? (
                                  <label className={`flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-purple-600 px-2 py-1.5 text-[10px] font-bold text-white shadow-sm hover:bg-purple-700 ${isMarking[orderId] ? 'opacity-50 cursor-wait' : ''} ${showProofGuide ? 'animate-subtle-pulse ring-2 ring-purple-300' : ''}`}>
                                    {isMarking[orderId] ? 'Subiendo...' : 'Subir Evidencia'}
                                    <input
                                      type="file"
                                      accept="image/*"
                                      className="hidden"
                                      disabled={isMarking[orderId]}
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handleUploadProof(orderId, file);
                                      }}
                                    />
                                  </label>
                                ) : (
                                  <a href={o.delivery_proof_url || '#'} target="_blank" rel="noopener noreferrer" className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-green-50 px-2 py-1.5 text-[10px] font-bold text-green-700 ring-1 ring-green-200">
                                    Evidencia Subida
                                  </a>
                                )}
                              </div>
                          )}

                          {/* --- 4. Calificaciones del comprador (Restaurado) --- */}
                          {canRateBuyer && (
                             <button
                               type="button"
                               onClick={() => {
                                 setRateOrderId(orderId);
                                 setRateBuyerId(buyerId);
                                 setRateOpen(true);
                               }}
                               className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-pink px-2 py-1.5 text-[10px] font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-60 animate-bounce transition-all"
                             >
                               <svg width="15" height="15" viewBox="0 0 24 24" fill="#FDE047" stroke="#FDE047" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 drop-shadow-sm">
                                 <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                               </svg>
                               Calificar Comprador
                             </button>
                          )}
                          {alreadyRated && (
                            <div className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-gray-100 px-2 py-1.5 text-[10px] font-bold text-gray-600 ring-1 ring-black/5">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-yellow-500">
                                 <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                               </svg>
                               Ya calificaste
                            </div>
                          )}

                          {!chatDisabled ? (
                            <button
                              type="button"
                              onClick={() => {
                                setChatOrderId(orderId);
                                setChatOpen(true);
                                setHasUnreadByOrderId((p) => ({ ...p, [orderId]: false }));
                              }}
                              className={`flex w-full items-center justify-center gap-2 rounded-lg bg-white px-2 py-1.5 text-[10px] font-bold text-gray-900 shadow-sm ring-1 hover:bg-gray-50 ${hasUnread ? 'ring-brand-pink' : 'ring-black/10'}`}
                            >
                              Chat {hasUnread && <span className="h-1.5 w-1.5 rounded-full bg-brand-pink"></span>}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    </div>
                  </div>
                );
              })}
              </div>

              {/* Paginación */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                <div className="text-xs text-gray-600">
                  Página {Math.min(ventasPage, ventasTotalPages)} de {ventasTotalPages}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setVentasPage((p) => Math.max(1, p - 1))}
                    disabled={ventasPage <= 1}
                    className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm ring-1 ring-black/10 hover:bg-gray-100 disabled:opacity-50"
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    onClick={() => setVentasPage((p) => Math.min(ventasTotalPages, p + 1))}
                    disabled={ventasPage >= ventasTotalPages}
                    className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm ring-1 ring-black/10 hover:bg-gray-100 disabled:opacity-50"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      <OrderChatFloating
        open={chatOpen}
        orderId={chatOrderId}
        onClose={() => {
          setChatOpen(false);
        }}
      />

      {rateOpen ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-black/10 animate-slide-in">
            <div className="border-b border-black/5 px-5 py-4">
              <div className="text-sm font-extrabold text-gray-900">Calificar comprador</div>
              <div className="mt-1 text-xs text-gray-600">Califica la experiencia de compra (1 a 10).</div>
            </div>

            <div className="px-5 py-4">
              <div className="text-xs font-semibold text-gray-900">Calificación (1 a 10)</div>
              <div className="mt-2 flex flex-wrap gap-1">
                {Array.from({ length: 10 }).map((_, i) => {
                  const v = i + 1;
                  const active = v <= rateStars;
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setRateStars(v)}
                      className={`h-8 w-8 rounded-lg text-xs font-extrabold ring-1 transition ${
                        active ? 'bg-brand-pink text-white ring-brand-pink' : 'bg-white text-gray-700 ring-black/10 hover:bg-pink-50'
                      }`}
                    >
                      {v}
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 text-xs font-semibold text-gray-900">Comentario (opcional)</div>
              <textarea
                value={rateComment}
                onChange={(e) => setRateComment(e.target.value)}
                placeholder="Cuenta tu experiencia..."
                className="mt-2 h-20 w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-brand-pink"
              />
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-black/5 px-5 py-3">
              <button
                type="button"
                onClick={() => setRateOpen(false)}
                className="rounded-xl bg-white px-4 py-2 text-xs font-semibold text-gray-900 shadow-sm ring-1 ring-black/10 hover:bg-gray-50"
                disabled={isSubmittingRating}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void submitRateBuyer()}
                className="rounded-xl bg-brand-pink px-4 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-60"
                disabled={isSubmittingRating || !rateOrderId || rateStars < 1 || rateStars > 10}
              >
                {isSubmittingRating ? 'Enviando…' : 'Enviar calificación'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
