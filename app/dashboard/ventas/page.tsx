'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { OrderChatFloating } from '@/components/OrderChatFloating';
import { payoutNet } from '@/lib/payouts/calc';
import { PageTour } from '@/components/PageTour';
import { pageTours } from '@/lib/tours/config';
import { SectionMessage } from '@/components/SectionMessage';

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
      <div className="rounded-xl border border-red-300 bg-red-100 px-3 py-2">
        <div className="text-xs font-extrabold text-red-900">⏰ Tiempo de envío vencido</div>
        <div className="mt-0.5 text-[10px] text-red-800/80">El plazo de 72 horas ha expirado</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-green-300 bg-green-100 px-3 py-2">
      <div className="flex items-center gap-2">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-700">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <div className="flex-1">
          <div className="text-xs font-extrabold text-green-900">
            {timeLeft.isFrozen ? 'Tiempo restante al enviar:' : 'Tiempo restante:'} {String(timeLeft.hours).padStart(2, '0')}:{String(timeLeft.minutes).padStart(2, '0')}:{String(timeLeft.seconds).padStart(2, '0')}
          </div>
          <div className="mt-0.5 text-[10px] text-green-800/80">
            {timeLeft.isFrozen
              ? 'Tiempo que quedaba cuando se realizó el envío'
              : 'Tienes 72 horas desde la descarga para realizar el envío'}
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
            if (!token) {
              console.warn('[VENTAS] No hay token de sesión para cargar disputas');
              return;
            }
            console.log('[VENTAS] Cargando disputas para órdenes:', orderIds);
            const res = await fetch(`/api/disputes/list?limit=200&t=${Date.now()}`, {
              headers: { authorization: `Bearer ${token}` },
              cache: 'no-store',
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
              console.error('[VENTAS] Error al cargar disputas:', json?.error || res.status);
              return;
            }
            const list = (json?.disputes ?? []) as any[];
            console.log('[VENTAS] Disputas recibidas de la API:', list.length);
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
              console.log('[VENTAS] Procesando disputa:', { oid, did, status, created_at, admin_decision, wanted: wanted.has(oid) });
              if (oid && did && wanted.has(oid)) {
                map[oid] = did;
                infoMap[oid] = { id: did, status, created_at, admin_decision, admin_note };
              }
            }
            console.log('[VENTAS] Disputas mapeadas:', {
              totalDisputes: list.length,
              mappedCount: Object.keys(map).length,
              map,
              infoMap,
            });
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
          } else if (profRes.error) {
            console.warn('[VENTAS] Error al cargar nombres de compradores:', profRes.error);
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

  const markShipped = async (orderId: string) => {
    setError(null);
    setSuccess(null);
    setIsMarking((p) => ({ ...p, [orderId]: true }));
    try {
      const tracking = String(trackingDraft[orderId] ?? '').trim();
      const carrier = String(carrierDraft[orderId] ?? '').trim();
      if (tracking.length < 4) {
        setError('Ingresa un código de rastreo válido.');
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 to-white">
      <div className="sticky top-0 z-40 border-b border-black/5 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 items-center justify-center rounded-xl bg-brand-pink px-3 text-white shadow-sm">
              <span className="text-sm font-extrabold tracking-widest">GoPocket</span>
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-gray-900">Ventas</div>
              <div className="text-xs text-gray-500">Seguimiento de tus ventas</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/sell" className="rounded-xl bg-brand-pink px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90">
              Vender
            </Link>
            <Link href="/dashboard" className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-black/5 hover:bg-gray-50">
              Volver
            </Link>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <PageTour steps={pageTours.ventas || []} pageId="ventas" />
        <SectionMessage section="ventas" />
        {error && <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
        {success && <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{success}</div>}

        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <div className="text-lg font-bold text-gray-900">Historial de ventas</div>
                <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-extrabold text-green-800 ring-1 ring-green-200">
                  TÚ VENDISTE
                </span>
              </div>
              <div className="mt-1 text-sm text-gray-600">Aquí verás tus ventas: comprador, artículos, comisiones y guía cuando esté disponible.</div>
            </div>
          </div>

          {!isBooting && orders.length > 0 ? (
            <div className="mt-4">
              {/* Buscador y Filtros */}
              <div className="mb-4" data-tour="filters">
                <div className="relative">
                  <svg
                    width="16"
                    height="16"
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
                    placeholder="Buscar por ID de orden, comprador o número de rastreo..."
                    className="w-full rounded-xl border border-gray-300 bg-white px-10 py-2.5 text-sm outline-none placeholder:text-gray-400 focus:border-brand-pink focus:ring-2 focus:ring-brand-pink/20"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      aria-label="Limpiar búsqueda"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 pb-2">
                {/* Filtro activo siempre visible */}
                {(() => {
                  const filterConfig: Record<string, { label: string; count: number; color: string }> = {
                    all: { label: 'Todas', count: filterCounts.all, color: 'bg-brand-pink text-white shadow-sm' },
                    pending_shipping: { label: 'Ventas pendiente de envío', count: filterCounts.pending_shipping, color: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200' },
                    pending_payment: { label: 'Ventas pendiente de pago', count: filterCounts.pending_payment, color: 'bg-red-100 text-red-700 ring-1 ring-red-200' },
                    shipped: { label: 'Ventas Enviadas', count: filterCounts.shipped, color: 'bg-blue-100 text-blue-700 ring-1 ring-blue-200' },
                    rated: { label: 'Ventas Calificadas', count: filterCounts.rated, color: 'bg-purple-100 text-purple-700 ring-1 ring-purple-200' },
                    not_rated: { label: 'Ventas Sin Calificar', count: filterCounts.not_rated, color: 'bg-orange-100 text-orange-700 ring-1 ring-orange-200' },
                    paid: { label: 'Ventas Pagadas', count: filterCounts.paid, color: 'bg-green-100 text-green-700 ring-1 ring-green-200' },
                    no_label: { label: 'Ventas Sin Guía', count: filterCounts.no_label, color: 'bg-gray-200 text-gray-700 ring-1 ring-gray-300' },
                    with_label: { label: 'Ventas Con Guía', count: filterCounts.with_label, color: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200' },
                  };
                  const active = filterConfig[activeFilter] || filterConfig.all;
                  return (
                    <button
                      type="button"
                      onClick={() => setActiveFilter('all')}
                      className={`whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-bold transition ${active.color}`}
                    >
                      {active.label} {active.count > 0 ? `(${active.count})` : ''}
                    </button>
                  );
                })()}

                {/* Botón para expandir/colapsar */}
                <button
                  type="button"
                  onClick={() => setFiltersExpanded(!filtersExpanded)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200 transition"
                  aria-label={filtersExpanded ? 'Colapsar filtros' : 'Expandir filtros'}
                >
                  {filtersExpanded ? (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 15l-6-6-6 6" />
                      </svg>
                      Menos
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                      Más filtros
                    </>
                  )}
                </button>

                {/* Filtros adicionales (colapsables) */}
                {filtersExpanded && (
                  <div className="flex flex-wrap gap-2 w-full mt-2">
                    {activeFilter !== 'all' && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveFilter('all');
                          setFiltersExpanded(false);
                        }}
                        className="whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-bold transition bg-gray-50 text-gray-700 hover:bg-gray-100"
                      >
                        Todas {filterCounts.all > 0 ? `(${filterCounts.all})` : ''}
                      </button>
                    )}
                    {activeFilter !== 'pending_shipping' && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveFilter('pending_shipping');
                          setFiltersExpanded(false);
                        }}
                        className="whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-bold transition bg-gray-50 text-gray-700 hover:bg-gray-100"
                      >
                        Ventas pendiente de envío {filterCounts.pending_shipping > 0 ? `(${filterCounts.pending_shipping})` : ''}
                      </button>
                    )}
                    {activeFilter !== 'pending_payment' && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveFilter('pending_payment');
                          setFiltersExpanded(false);
                        }}
                        className="whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-bold transition bg-gray-50 text-gray-700 hover:bg-gray-100"
                      >
                        Ventas pendiente de pago {filterCounts.pending_payment > 0 ? `(${filterCounts.pending_payment})` : ''}
                      </button>
                    )}
                    {activeFilter !== 'shipped' && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveFilter('shipped');
                          setFiltersExpanded(false);
                        }}
                        className="whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-bold transition bg-gray-50 text-gray-700 hover:bg-gray-100"
                      >
                        Ventas Enviadas {filterCounts.shipped > 0 ? `(${filterCounts.shipped})` : ''}
                      </button>
                    )}
                    {activeFilter !== 'rated' && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveFilter('rated');
                          setFiltersExpanded(false);
                        }}
                        className="whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-bold transition bg-gray-50 text-gray-700 hover:bg-gray-100"
                      >
                        Ventas Calificadas {filterCounts.rated > 0 ? `(${filterCounts.rated})` : ''}
                      </button>
                    )}
                    {activeFilter !== 'not_rated' && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveFilter('not_rated');
                          setFiltersExpanded(false);
                        }}
                        className="whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-bold transition bg-gray-50 text-gray-700 hover:bg-gray-100"
                      >
                        Ventas Sin Calificar {filterCounts.not_rated > 0 ? `(${filterCounts.not_rated})` : ''}
                      </button>
                    )}
                    {activeFilter !== 'paid' && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveFilter('paid');
                          setFiltersExpanded(false);
                        }}
                        className="whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-bold transition bg-gray-50 text-gray-700 hover:bg-gray-100"
                      >
                        Ventas Pagadas {filterCounts.paid > 0 ? `(${filterCounts.paid})` : ''}
                      </button>
                    )}
                    {activeFilter !== 'no_label' && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveFilter('no_label');
                          setFiltersExpanded(false);
                        }}
                        className="whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-bold transition bg-gray-50 text-gray-700 hover:bg-gray-100"
                      >
                        Ventas Sin Guía {filterCounts.no_label > 0 ? `(${filterCounts.no_label})` : ''}
                      </button>
                    )}
                    {activeFilter !== 'with_label' && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveFilter('with_label');
                          setFiltersExpanded(false);
                        }}
                        className="whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-bold transition bg-gray-50 text-gray-700 hover:bg-gray-100"
                      >
                        Ventas Con Guía {filterCounts.with_label > 0 ? `(${filterCounts.with_label})` : ''}
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
                <span className="text-[11px] font-bold uppercase text-gray-500">Leyenda:</span>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 shrink-0 rounded border border-green-500 bg-green-50" />
                  <span className="text-xs text-gray-700">Verde: concretada</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 shrink-0 rounded border border-yellow-500 bg-yellow-50" />
                  <span className="text-xs text-gray-700">Amarillo: no concretada</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 shrink-0 rounded border border-red-500 bg-red-50" />
                  <span className="text-xs text-gray-700">Rojo: disputa activa</span>
                </div>
                <span className="text-[11px] text-gray-500">· Filtra y usa Anterior/Siguiente. No se borra ninguna operación.</span>
              </div>
              <div className="mt-4 space-y-3" data-tour="orders-list">
              {ventasPaginated.map((o) => {
                const buyerId = String(o?.buyer_id || '');
                const buyer = buyerId ? buyerNames[buyerId] || `${buyerId.slice(0, 6)}…` : '—';
                const items = itemsByOrder[String(o?.id || '')] ?? [];
                const labelUrl = String(o?.shipping_label_url || '').trim();
                const orderId = String(o?.id || '').trim();
                // Usar estado local si existe (optimistic update), sino usar el de la BD
                const labelDownloadedAtFromDb = String(o?.label_downloaded_at || '').trim();
                const labelDownloadedAtLocal = labelDownloadedAtByOrderId[orderId] || '';
                const labelDownloadedAt = labelDownloadedAtLocal || labelDownloadedAtFromDb;
                const isLabelDownloaded = Boolean(labelDownloadedAt);
                const tracking = String(o?.tracking_number || '').trim();
                const carrier = String(o?.shipping_carrier || '').trim();
                const shippedAt = String(o?.shipped_at || '').trim();
                const canMarkShipped = orderId && (String(o?.status || '') === 'paid' || String(o?.status || '') === 'pending_payment');
                const hasUnread = Boolean(hasUnreadByOrderId[orderId]);
                const status = String(o?.status || '').trim();
                const alreadyRated = Boolean(ratedByOrderId[orderId]);
                const bothRated = Boolean(bothRatedByOrderId[orderId]);
                // Permitir calificar cuando hay guía subida O cuando está completado
                const canRateBuyer = Boolean(orderId && buyerId && !alreadyRated && (labelUrl || status === 'delivered' || status === 'received'));
                const disputeId = orderId ? disputeByOrderId[orderId] : '';
                
                // Determinar el color del marco según el estado
                const getBorderColor = () => {
                  // Si hay disputa activa, rojo
                  if (disputeId) {
                    const di = disputeInfoByOrderId[orderId];
                    if (di?.status === 'open') {
                      return { border: 'border-red-500 ring-red-200 hover:border-red-600', left: 'border-red-500', bg: 'bg-red-50/30' };
                    }
                  }
                  
                  // Si la venta está concretada correctamente, verde
                  if (status === 'delivered' || status === 'received') {
                    return { border: 'border-green-500 ring-green-200 hover:border-green-600', left: 'border-green-500', bg: 'bg-green-50/30' };
                  }
                  
                  // Si no se ha concretado, amarillo (pending_payment, paid, shipped, etc.)
                  return { border: 'border-yellow-500 ring-yellow-200 hover:border-yellow-600', left: 'border-yellow-500', bg: 'bg-yellow-50/30' };
                };
                
                const borderColors = getBorderColor();
                
                // Verificar si el chat debe estar deshabilitado:
                // 1. Si la venta está completada (completed, delivered, received)
                // 2. O si han pasado 15 días desde que se marcó como enviado
                const isOrderCompleted = status === 'delivered' || status === 'received';
                const daysSinceShipped = shippedAt ? (() => {
                  const shippedDate = new Date(shippedAt);
                  const daysDiff = (currentTime.getTime() - shippedDate.getTime()) / (1000 * 60 * 60 * 24);
                  return daysDiff;
                })() : null;
                const chatDisabled = isOrderCompleted || (daysSinceShipped !== null && daysSinceShipped >= 15);
                
                const netEarnings = payoutNet(o);

                return (
                  <div
                    key={String(o?.id || Math.random())}
                    className={`rounded-xl border-2 bg-white p-3 shadow-sm ring-1 hover:shadow-md transition-all ${borderColors.border} ${hasUnread ? borderColors.bg : ''}`}
                  >
                    <div className={`border-l-4 pl-3 -ml-3 ${borderColors.left}`}>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-green-600 px-2.5 py-1 text-[10px] font-extrabold text-white uppercase">
                            Tu Venta
                          </span>
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
                            {String(o?.id || '').slice(0, 8)}…
                          </span>
                          {status === 'pending_payment' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-800 ring-1 ring-red-300 shadow-sm">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                              PENDIENTE DE PAGO
                            </span>
                          ) : status === 'paid' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-extrabold text-green-800 ring-1 ring-green-300 shadow-sm">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                              PAGADO
                            </span>
                          ) : status === 'shipped' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-800 ring-1 ring-blue-300 shadow-sm">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="2" ry="2"/><line x1="16" y1="8" x2="20" y2="8"/><line x1="16" y1="16" x2="23" y2="16"/><line x1="16" y1="12" x2="23" y2="12"/></svg>
                              ENVIADO
                            </span>
                          ) : status === 'delivered' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-1 text-xs font-bold text-purple-800 ring-1 ring-purple-300 shadow-sm">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                              COMPLETADO
                            </span>
                          ) : status === 'cancelled' ? (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600 ring-1 ring-gray-200">
                              Cancelado
                            </span>
                          ) : (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
                              {String(o?.status || '—')}
                            </span>
                          )}
                          <span className="text-xs text-gray-500">{formatDateTime(o?.created_at)}</span>
                          {disputeId ? (() => {
                            const di = disputeInfoByOrderId[orderId];
                            const open = di?.status === 'open';
                            const resolved = di?.status === 'resolved' || di?.status === 'closed';
                            const start = di?.created_at ? new Date(di.created_at).getTime() : 0;
                            const ok = Number.isFinite(start) && start > 0;
                            const end = ok ? start + 72 * 60 * 60 * 1000 : 0;
                            const d = ok ? end - currentTime.getTime() : -1;
                            const ex = d <= 0;
                            const h = Math.max(0, Math.floor(d / (1000 * 60 * 60)));
                            const m = Math.max(0, Math.floor((d % (1000 * 60 * 60)) / (1000 * 60)));
                            const s = Math.max(0, Math.floor((d % (1000 * 60)) / 1000));
                            if (resolved) {
                              const adminDecision = di?.admin_decision;
                              const adminNote = di?.admin_note;
                              
                              // Función para obtener el label de la decisión
                              const getDecisionLabel = (decision: string | null | undefined): string => {
                                if (!decision) return 'Resuelta';
                                const d = String(decision).toLowerCase();
                                if (d === 'release') return 'Pago liberado al vendedor';
                                if (d === 'refund') return 'Reembolso al comprador';
                                if (d === 'close') return 'Disputa cerrada';
                                if (d === 'assign_return_tracking' || d === 'assign_guide_charged_buyer' || d === 'assign_guide_charged_seller') return 'Guía de devolución asignada';
                                if (d === 'keep_money_seller') return 'Dinero mantenido al vendedor';
                                if (d === 'partial_refund_seller') return 'Reembolso parcial al vendedor';
                                if (d === 'partial_refund_buyer') return 'Reembolso parcial al comprador';
                                if (d === 'refund_buyer_minus_fees') return 'Reembolso al comprador (menos comisiones)';
                                if (d === 'refund_seller_minus_fees') return 'Pago al vendedor (menos comisiones)';
                                return decision;
                              };
                              
                              const decisionLabel = getDecisionLabel(adminDecision);
                              
                              return (
                                <div className="space-y-2">
                                  <div className="inline-flex items-center gap-1.5 rounded-full border-2 border-gray-300 bg-gray-100 px-2.5 py-0.5 text-xs font-extrabold text-gray-600 cursor-not-allowed opacity-75">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <circle cx="12" cy="12" r="10" />
                                      <polyline points="12 6 12 12 16 14" />
                                    </svg>
                                    <span>Disputa</span>
                                  </div>
                                  <div className="rounded-xl border-2 border-green-300 bg-green-50 px-3 py-2 shadow-sm">
                                    <div className="text-xs font-extrabold text-green-900">
                                      Disputa resuelta: {decisionLabel}
                                    </div>
                                    {adminNote && (
                                      <div className="mt-1 text-[10px] text-green-800">
                                        {adminNote}
                                      </div>
                                    )}
                                    <div className="mt-2 text-[10px] font-semibold text-green-900">
                                      Esta disputa se finalizó. Agradecemos tu apoyo.
                                    </div>
                                  </div>
                                </div>
                              );
                            }
                            if (!open) return null;
                            return (
                              <Link
                                href={`/dashboard/disputas/${disputeId}`}
                                className="inline-flex items-center gap-1.5 rounded-full border-2 border-red-400 bg-red-50 px-2.5 py-0.5 text-xs font-extrabold text-red-900 shadow-sm hover:bg-red-100 animate-pulse"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <circle cx="12" cy="12" r="10" />
                                  <polyline points="12 6 12 12 16 14" />
                                </svg>
                                {ok && !ex ? (
                                  <span>Disputa · {h}h {m}m {s}s</span>
                                ) : (
                                  <span>Disputa · Admin revisará</span>
                                )}
                              </Link>
                            );
                          })() : status === 'disputed' ? (
                            <Link
                              href="/dashboard/devoluciones"
                              className="inline-flex items-center gap-1.5 rounded-full border-2 border-red-300 bg-red-50 px-2.5 py-0.5 text-xs font-extrabold text-red-900 shadow-sm hover:bg-red-100"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <polyline points="12 6 12 12 16 14" />
                              </svg>
                              <span>Ver disputa</span>
                            </Link>
                          ) : null}
                        </div>

                        <div className="mt-2 mb-3 flex flex-col gap-1 rounded-xl bg-green-50/50 p-3 ring-1 ring-green-100">
                          <div className="flex items-center gap-2 text-sm text-gray-800">
                            <span className="font-medium text-gray-500">Comprador:</span>
                            <span className="font-bold">{buyer}</span>
                          </div>
                          <div className="text-xs font-black text-gray-900 uppercase">
                            POR TU VENTA DE {formatMoney(o.subtotal || o.total || 0)} COBRASTE
                          </div>
                          <div className="flex items-center gap-2">
                             <span className="text-2xl font-black text-green-600 drop-shadow-sm">
                               +{formatMoney(netEarnings)}
                             </span>
                             <span className="text-xs font-semibold text-green-700/70">
                               Recibirás por esta venta
                             </span>
                          </div>
                        </div>

                        {/* Artículos: lista compacta con miniaturas */}
                        {items.length > 0 ? (
                          <div className="mt-2 space-y-1.5">
                            {items.slice(0, 5).map((it: any, idx: number) => {
                              const lid = String(it?.listing_id || '').trim();
                              const t = String(it?.title || 'Artículo');
                              const img = lid ? thumbByListingId[lid] : '';
                              const quantity = Number(it.quantity ?? 1) || 1;
                              return (
                                <div key={idx} className="flex gap-2 rounded-lg border border-gray-200 bg-white p-2 ring-1 ring-black/5 hover:bg-gray-50">
                                  {img ? (
                                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-gray-100 ring-1 ring-black/5">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={img} alt={t} className="h-full w-full object-cover" />
                                    </div>
                                  ) : (
                                    <div className="h-12 w-12 shrink-0 rounded-md bg-gray-100 ring-1 ring-black/5" />
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <Link
                                      href={`/listings/${String(it.listing_id)}`}
                                      className="text-sm font-extrabold text-gray-900 hover:text-brand-pink hover:underline line-clamp-2"
                                    >
                                      {t}
                                    </Link>
                                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-600">
                                      <span className="font-semibold">Cantidad: x{quantity}</span>
                                      {it.selected_size && (
                                        <span className="rounded-full bg-pink-100 px-2 py-0.5 text-pink-800 text-[10px] font-semibold">Talla: {it.selected_size}</span>
                                      )}
                                      {it.selected_color && (
                                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-800 text-[10px] font-semibold">Color: {it.selected_color}</span>
                                      )}
                                    </div>
                                    {it.line_total && (
                                      <div className="mt-1 text-xs font-extrabold text-brand-pink">
                                        {formatMoney(it.line_total)}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                            {items.length > 5 && (
                              <div className="text-[11px] text-gray-500 py-1">
                                +{items.length - 5} artículo{items.length - 5 !== 1 ? 's' : ''} más
                              </div>
                            )}
                          </div>
                        ) : null}
                        {/* Información de estado de pago */}
                        {status === 'pending_payment' ? (
                          <div className="mt-3 space-y-2">
                            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                              <div className="text-xs font-extrabold text-amber-900">Pago en proceso</div>
                              <div className="mt-1 text-[11px] text-amber-800/80">
                                No envíes el producto hasta que te confirmemos y te aparezca la guía.
                              </div>
                            </div>
                            {/* Contador de 48 horas */}
                            {(() => {
                              const created = new Date(o?.created_at || '');
                              const deadline = new Date(created.getTime() + 48 * 60 * 60 * 1000);
                              const diff = deadline.getTime() - currentTime.getTime();
                              if (diff <= 0) return null; // Desaparece después de 48 horas
                              const hours = Math.floor(diff / (1000 * 60 * 60));
                              const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                              const seconds = Math.floor((diff % (1000 * 60)) / 1000);
                              return (
                                <div
                                  className={`rounded-xl border px-3 py-2 ${
                                    hours < 12
                                      ? 'border-red-300 bg-red-50'
                                      : 'border-orange-300 bg-orange-50'
                                  }`}
                                >
                                  <div className="flex items-start gap-2">
                                    <svg
                                      width="16"
                                      height="16"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke={hours < 12 ? '#dc2626' : '#ea580c'}
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      className="mt-0.5 shrink-0"
                                    >
                                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                      <line x1="12" y1="9" x2="12" y2="13" />
                                      <line x1="12" y1="17" x2="12.01" y2="17" />
                                    </svg>
                                    <div className="flex-1">
                                      <div className={`text-xs font-extrabold ${hours < 12 ? 'text-red-900' : 'text-orange-900'}`}>
                                        Tiempo restante: {hours}h {minutes}m {seconds}s
                                      </div>
                                      <div className={`mt-0.5 text-[10px] ${hours < 12 ? 'text-red-800' : 'text-orange-800'}`}>
                                        El comprador tiene 48 horas para completar el pago desde la creación de la orden, en caso de no concretar el pago la operación desaparecerá y no afectará en tu reputación.
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        ) : status === 'paid' || labelUrl ? (
                          <div className="mt-3 rounded-xl border border-green-200 bg-green-50 px-3 py-2">
                            <div className="text-xs font-extrabold text-green-900">Aprobado</div>
                            <div className="mt-1 text-[11px] text-green-800/80">
                              Ya hemos verificado el pago, puedes estar seguro, envía el artículo lo antes posible.
                            </div>
                          </div>
                        ) : null}
                        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5">
                          <span className="text-[10px] font-bold uppercase text-green-800">Vendiste a:</span>
                          {buyerId && isUuid(buyerId) ? (
                            <Link href={`/perfil/${buyerId}`} className="text-sm font-extrabold text-gray-900 text-brand-pink hover:underline">
                              {buyer}
                            </Link>
                          ) : (
                            <span className="text-sm font-extrabold text-gray-900">{buyer}</span>
                          )}
                        </div>

                        {/* Ganancia del vendedor resaltada */}
                        <div className="mt-3 rounded-xl bg-green-50 px-4 py-3 ring-1 ring-green-200">
                           <div className="flex items-center justify-between">
                             <div className="text-xs font-semibold text-green-800">Tú recibes:</div>
                             <div className="text-2xl font-black text-green-700">{formatMoney(netEarnings)}</div>
                           </div>
                           <div className="mt-2 space-y-1 border-t border-green-200 pt-2 text-[10px] text-green-800">
                              <div className="flex justify-between font-bold">
                                <span>Total pagado por cliente:</span>
                                <span>{formatMoney(o?.total)}</span>
                              </div>
                              {toNumber(o?.shipping_fee) > 0 && (
                                <div className="flex justify-between text-red-600">
                                   <span>(-) Envío (cobrado al cliente):</span>
                                   <span>-{formatMoney(o?.shipping_fee)}</span>
                                </div>
                              )}
                              <div className="flex justify-between text-red-600">
                                <span>(-) Comisión:</span>
                                <span>-{formatMoney(o?.commission_fee)}</span>
                              </div>
                              {toNumber(o?.shipping_subsidy) > 0 && (
                                <div className="flex justify-between text-brand-pink font-bold">
                                  <span>(-) Subsidio de envío:</span>
                                  <span>-{formatMoney(o?.shipping_subsidy)}</span>
                                </div>
                              )}
                           </div>
                        </div>

                        {orderId ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {/* Botón Descargar Orden de Compra */}
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const { data: sess } = await supabase.auth.getSession();
                                  const token = sess.session?.access_token;
                                  if (!token) {
                                    setError('Sesión no válida.');
                                    return;
                                  }

                                  const res = await fetch(`/api/orders/${orderId}/download-invoice`, {
                                    headers: { authorization: `Bearer ${token}` },
                                  });

                                  if (!res.ok) {
                                    const json = await res.json().catch(() => ({}));
                                    throw new Error(json?.error || 'No se pudo descargar la orden.');
                                  }

                                  const blob = await res.blob();
                                  const url = window.URL.createObjectURL(blob);
                                  const a = document.createElement('a');
                                  a.href = url;
                                  a.download = `orden-compra-${orderId.slice(0, 8)}.pdf`;
                                  document.body.appendChild(a);
                                  a.click();
                                  document.body.removeChild(a);
                                  window.URL.revokeObjectURL(url);
                                } catch (e: unknown) {
                                  console.error('[DOWNLOAD INVOICE] Error:', e);
                                  setError(e instanceof Error ? e.message : 'No se pudo descargar la orden.');
                                }
                              }}
                              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm ring-1 ring-blue-700 hover:bg-blue-700"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="7 10 12 15 17 10" />
                                <line x1="12" y1="15" x2="12" y2="3" />
                              </svg>
                              Descargar orden de compra
                            </button>
                            {chatDisabled ? (
                              <div className="w-full space-y-2">
                                <button
                                  type="button"
                                  disabled
                                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-500 shadow-sm ring-1 ring-gray-200 cursor-not-allowed"
                                >
                                  Chat con comprador
                                </button>
                                <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-center">
                                  <div className="text-[11px] font-semibold text-gray-700">
                                    {isOrderCompleted 
                                      ? 'El chat está cerrado porque la venta está completada'
                                      : 'El chat está cerrado porque han pasado más de 15 días desde el envío'
                                    }
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setChatOrderId(orderId);
                                  setChatOpen(true);
                                  setHasUnreadByOrderId((p) => ({ ...p, [orderId]: false }));
                                }}
                                className={`inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-gray-900 shadow-sm ring-1 hover:bg-gray-50 ${
                                  hasUnread ? 'ring-brand-pink' : 'ring-black/5'
                                }`}
                              >
                                Chat con comprador
                                {hasUnread ? <span className="rounded-full bg-brand-pink px-2 py-0.5 text-[11px] font-bold text-white">Nuevo</span> : null}
                              </button>
                            )}

                            {canRateBuyer ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setRateOrderId(orderId);
                                  setRateBuyerId(buyerId);
                                  setRateStars(10);
                                  setRateComment('');
                                  setRateOpen(true);
                                }}
                                className="inline-flex items-center gap-2 rounded-xl bg-brand-pink px-3 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-90"
                              >
                                {labelUrl ? '⭐ Calificar comprador' : 'Calificar comprador'}
                              </button>
                            ) : alreadyRated ? (
                              <>
                                <span className="inline-flex items-center rounded-xl bg-green-50 px-3 py-2 text-xs font-semibold text-green-800 ring-1 ring-green-100">
                                  ✅ Comprador calificado
                                </span>
                                {bothRated ? (
                                  <div className="mt-2 rounded-xl border border-green-300 bg-green-100 px-3 py-2">
                                    <div className="text-xs font-extrabold text-green-900">✓ Excelente trabajo Sigue Vendiendo Así</div>
                                  </div>
                                ) : null}
                              </>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                      <div className="shrink-0 rounded-2xl bg-gray-50 px-4 py-3 text-sm ring-1 ring-black/5">
                        <div className="text-xs font-semibold text-gray-900">Total</div>
                        <div className="mt-1 text-sm font-extrabold text-gray-900">{formatMoney(o?.total)}</div>
                        <div className="mt-2 grid gap-1 text-xs text-gray-600">
                          <div className="flex items-center justify-between gap-3">
                            <span>Comisión</span>
                            <span className="font-semibold text-gray-900">{formatMoney(o?.commission_fee)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span>Envío</span>
                            <span className="font-semibold text-gray-900">{formatMoney(o?.shipping_fee)}</span>
                          </div>
                        </div>
                        <div className="mt-3">
                          {labelUrl ? (
                            <div className="space-y-2">
                              <div
                                className={
                                  isLabelDownloaded
                                    ? 'inline-flex items-center rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-xs font-extrabold text-green-800'
                                    : 'inline-flex items-center rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-extrabold text-amber-900'
                                }
                              >
                                {isLabelDownloaded ? 'Guía descargada' : 'Guía lista (en espera)'}
                              </div>
                              {isLabelDownloaded ? (
                                <>
                                  <div className="text-[11px] text-green-800/80">Descargada: {formatDateTime(labelDownloadedAt)}</div>
                                  <Countdown72Hours startTime={labelDownloadedAt || null} shippedAt={shippedAt || null} />
                                </>
                              ) : (
                                <div className="text-[11px] text-amber-900/80">Descárgala para imprimirla.</div>
                              )}
                              <button
                                type="button"
                                onClick={async () => {
                                  const orderIdStr = String(o?.id || '');
                                  // Optimistic update: marcar como descargada inmediatamente
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
                                className={`w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition ${
                                  isLabelDownloaded
                                    ? 'bg-green-600 text-white ring-1 ring-green-700 hover:bg-green-700'
                                    : 'bg-brand-pink text-white ring-1 ring-brand-pink hover:opacity-90'
                                }`}
                              >
                                {isLabelDownloaded ? (
                                  <>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                    Guía descargada
                                  </>
                                ) : (
                                  <>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                      <polyline points="7 10 12 15 17 10" />
                                      <line x1="12" y1="15" x2="12" y2="3" />
                                    </svg>
                                    Descargar guía
                                  </>
                                )}
                              </button>
                            </div>
                          ) : (
                            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                              <div className="text-xs font-extrabold text-amber-900">Guía pendiente</div>
                              <div className="mt-1 text-[11px] text-amber-800/80">La guía de envío estará disponible pronto.</div>
                            </div>
                          )}
                        </div>

                        <div className="mt-3 rounded-2xl bg-white px-3 py-3 text-xs ring-1 ring-black/5">
                          <div className="text-xs font-semibold text-gray-900">Envío</div>
                          {tracking ? (
                            <div className="mt-2 space-y-1 text-xs text-gray-700">
                              <div>
                                <span className="text-gray-500">Paquetería:</span> <span className="font-semibold text-gray-900">{carrier || '—'}</span>
                              </div>
                              <div>
                                <span className="text-gray-500">Rastreo:</span> <span className="font-semibold text-gray-900">{tracking}</span>
                              </div>
                              <div className="text-gray-500">Enviado: {formatDateTime(shippedAt)}</div>
                            </div>
                          ) : canMarkShipped ? (
                            <div className="mt-2 space-y-2">
                              {status === 'pending_payment' && !labelUrl ? (
                                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                                  <div className="text-[11px] font-semibold text-amber-900">⏳ Pago en proceso</div>
                                  <div className="mt-1 text-[10px] text-amber-800/80">
                                    Espera la confirmación del pago y la guía de envío antes de enviar.
                                  </div>
                                </div>
                              ) : status === 'paid' || labelUrl ? (
                                <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-2">
                                  <div className="text-[11px] font-semibold text-green-900">✓ Pago aprobado</div>
                                  <div className="mt-1 text-[10px] text-green-800/80">
                                    El pago está verificado. Puedes enviar el artículo con seguridad.
                                  </div>
                                </div>
                              ) : null}
                              <input
                                value={carrierDraft[orderId] ?? ''}
                                onChange={(e) => setCarrierDraft((p) => ({ ...p, [orderId]: e.target.value }))}
                                placeholder="Paquetería (ej. Estafeta)"
                                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-brand-pink"
                                disabled={status === 'pending_payment' && !labelUrl}
                              />
                              <input
                                value={trackingDraft[orderId] ?? ''}
                                onChange={(e) => setTrackingDraft((p) => ({ ...p, [orderId]: e.target.value }))}
                                placeholder="Código de rastreo"
                                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-brand-pink"
                                disabled={status === 'pending_payment' && !labelUrl}
                              />
                              <button
                                type="button"
                                onClick={() => markShipped(orderId)}
                                disabled={
                                  Boolean(isMarking[orderId]) ||
                                  String(trackingDraft[orderId] ?? '').trim().length < 4 ||
                                  (status === 'pending_payment' && !labelUrl)
                                }
                                className="w-full rounded-xl bg-brand-pink px-3 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-60"
                              >
                                {isMarking[orderId] ? 'Marcando…' : 'Marcar como enviado'}
                              </button>
                              <div className="text-[11px] text-gray-500">Esto notificará al comprador y se verá en Logística.</div>
                            </div>
                          ) : (
                            <div className="mt-2 text-xs text-gray-500">Aún no se registró el envío.</div>
                          )}
                        </div>
                      </div>
                    </div>
                    </div>
                  </div>
                );
              })}
              </div>

              {/* Paginación: no se borra ninguna operación, se agregan páginas para buscarlas */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <div className="text-xs text-gray-600">
                  {filteredOrders.length} venta(s) en total · Página {Math.min(ventasPage, ventasTotalPages)} de {ventasTotalPages}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setVentasPage((p) => Math.max(1, p - 1))}
                    disabled={ventasPage <= 1}
                    className="rounded-xl bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-black/10 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    onClick={() => setVentasPage((p) => Math.min(ventasTotalPages, p + 1))}
                    disabled={ventasPage >= ventasTotalPages}
                    className="rounded-xl bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-black/10 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
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
          <div className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-black/10">
            <div className="border-b border-black/5 px-5 py-4">
              <div className="text-sm font-extrabold text-gray-900">Calificar comprador</div>
              <div className="mt-1 text-xs text-gray-600">Califica la experiencia de compra (1 a 10) con comentario.</div>
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
                      className={`h-9 w-9 rounded-xl text-sm font-extrabold ring-1 transition ${
                        active ? 'bg-brand-pink text-white ring-brand-pink' : 'bg-white text-gray-700 ring-black/10 hover:bg-pink-50'
                      }`}
                      aria-label={`${v} estrellas`}
                    >
                      {v}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 text-xs text-gray-600">
                Seleccionado: <span className="font-semibold text-gray-900">{rateStars}/10</span>
              </div>

              <div className="mt-4 text-xs font-semibold text-gray-900">Comentario (opcional)</div>
              <textarea
                value={rateComment}
                onChange={(e) => setRateComment(e.target.value)}
                placeholder="Cuenta tu experiencia (sin enlaces ni teléfonos)."
                className="mt-2 h-28 w-full resize-none rounded-2xl border border-gray-200 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-pink"
              />
              <div className="mt-1 text-[11px] text-gray-500">Máx. 600 caracteres.</div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-black/5 px-5 py-4">
              <button
                type="button"
                onClick={() => setRateOpen(false)}
                className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-black/10 hover:bg-gray-50"
                disabled={isSubmittingRating}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void submitRateBuyer()}
                className="rounded-xl bg-brand-pink px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-60"
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


