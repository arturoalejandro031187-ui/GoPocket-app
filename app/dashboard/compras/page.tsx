'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { OrderChatFloating } from '@/components/OrderChatFloating';
import { PageTour } from '@/components/PageTour';
import { pageTours } from '@/lib/tours/config';
import { SectionMessage } from '@/components/SectionMessage';
import { SellerDisplay } from '@/components/SellerDisplay';

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

export default function DashboardComprasPage() {
  const [isBooting, setIsBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [itemsByOrder, setItemsByOrder] = useState<Record<string, any[]>>({});
  const [sellerNames, setSellerNames] = useState<Record<string, string>>({});
  const [sellerStateById, setSellerStateById] = useState<Record<string, string | null>>({});
  const [sellerCityById, setSellerCityById] = useState<Record<string, string | null>>({});
  const [sellerOperationsById, setSellerOperationsById] = useState<Record<string, number>>({});
  const [thumbByListingId, setThumbByListingId] = useState<Record<string, string>>({});

  const [chatOpen, setChatOpen] = useState(false);
  const [chatOrderId, setChatOrderId] = useState<string | null>(null);
  const [hasUnreadByOrderId, setHasUnreadByOrderId] = useState<Record<string, boolean>>({});

  const [rateOpen, setRateOpen] = useState(false);
  const [rateOrderId, setRateOrderId] = useState<string | null>(null);
  const [rateSellerId, setRateSellerId] = useState<string | null>(null);
  const [rateStars, setRateStars] = useState<number>(10);
  const [rateComment, setRateComment] = useState<string>('');
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);
  const [ratedByOrderId, setRatedByOrderId] = useState<Record<string, boolean>>({});
  const [bothRatedByOrderId, setBothRatedByOrderId] = useState<Record<string, boolean>>({});

  const [checkoutSessionByOrderId, setCheckoutSessionByOrderId] = useState<Record<string, string>>({});

  // Guías Estafeta
  const [estafetaQuotes, setEstafetaQuotes] = useState<any[]>([]);

  // Disputas
  const [disputeByOrderId, setDisputeByOrderId] = useState<Record<string, string>>({});
  const [disputeInfoByOrderId, setDisputeInfoByOrderId] = useState<Record<string, { id: string; status: string; created_at: string; admin_decision?: string | null; admin_note?: string | null }>>({});
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeOrderId, setDisputeOrderId] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState<'not_received' | 'damaged' | 'not_as_described' | 'missing_items' | 'other'>(
    'not_received',
  );
  const [disputeText, setDisputeText] = useState('');
  const [isOpeningDispute, setIsOpeningDispute] = useState(false);

  // Filtros y búsqueda
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [filtersExpanded, setFiltersExpanded] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [comprasPage, setComprasPage] = useState(1);

  // Contador de tiempo para actualizar cada segundo
  const [currentTime, setCurrentTime] = useState(new Date());
  
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Filtrar órdenes según el filtro activo y búsqueda
  const filteredOrders = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    
    return orders.filter((o) => {
      const status = String(o?.status || '').trim();
      const orderId = String(o?.id || '').trim();
      const tracking = String(o?.tracking_number || '').trim();
      const sellerId = String(o?.seller_id || '');
      const sellerName = sellerId ? (sellerNames[sellerId] || '').toLowerCase() : '';
      const alreadyRated = Boolean(ratedByOrderId[orderId]);
      const isCompleted = status === 'completed' || status === 'delivered';
      const isShipped = status === 'shipped' || Boolean(tracking);
      const isPaid = status === 'paid' || isShipped || isCompleted;

      // Aplicar filtro de estado
      let matchesFilter = true;
      switch (activeFilter) {
        case 'pending_payment':
          matchesFilter = status === 'pending_payment';
          break;
        case 'paid':
          matchesFilter = status === 'paid';
          break;
        case 'shipped':
          matchesFilter = isShipped;
          break;
        case 'delivered':
          matchesFilter = status === 'delivered' || status === 'completed';
          break;
        case 'rated':
          matchesFilter = isCompleted && alreadyRated;
          break;
        case 'not_rated':
          matchesFilter = isCompleted && !alreadyRated;
          break;
        case 'with_dispute':
          matchesFilter = Boolean(disputeByOrderId[orderId]);
          break;
        default:
          matchesFilter = true; // 'all'
      }

      if (!matchesFilter) return false;

      // Aplicar búsqueda si hay query
      if (query) {
        const orderIdLower = orderId.toLowerCase();
        const trackingLower = tracking.toLowerCase();
        
        // Buscar en: ID de orden, nombre del vendedor, tracking
        const matchesSearch = 
          orderIdLower.includes(query) ||
          sellerName.includes(query) ||
          trackingLower.includes(query);
        
        return matchesSearch;
      }

      return true;
    });
  }, [orders, activeFilter, ratedByOrderId, searchQuery, sellerNames, disputeByOrderId]);

  // Contadores por filtro
  const filterCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: orders.length,
      pending_payment: 0,
      paid: 0,
      shipped: 0,
      delivered: 0,
      rated: 0,
      not_rated: 0,
      with_dispute: 0,
    };

    for (const o of orders) {
      const status = String(o?.status || '').trim();
      const orderId = String(o?.id || '').trim();
      const tracking = String(o?.tracking_number || '').trim();
      const alreadyRated = Boolean(ratedByOrderId[orderId]);
      const isCompleted = status === 'completed' || status === 'delivered';
      const isShipped = status === 'shipped' || Boolean(tracking);

      if (status === 'pending_payment') counts.pending_payment++;
      if (status === 'paid') counts.paid++;
      if (isShipped) counts.shipped++;
      if (isCompleted) counts.delivered++;
      if (isCompleted && alreadyRated) counts.rated++;
      if (isCompleted && !alreadyRated) counts.not_rated++;
      if (disputeByOrderId[orderId]) counts.with_dispute++;
    }

    return counts;
  }, [orders, ratedByOrderId, disputeByOrderId]);

  const COMPRAS_PAGE_SIZE = 10;
  const comprasTotalPages = Math.max(1, Math.ceil(filteredOrders.length / COMPRAS_PAGE_SIZE));
  const comprasPaginated = useMemo(() => {
    const page = Math.min(Math.max(1, comprasPage), comprasTotalPages);
    const start = (page - 1) * COMPRAS_PAGE_SIZE;
    return filteredOrders.slice(start, start + COMPRAS_PAGE_SIZE);
  }, [filteredOrders, comprasPage, comprasTotalPages]);

  useEffect(() => {
    setComprasPage(1);
  }, [activeFilter, searchQuery]);

  useEffect(() => {
    if (comprasPage > comprasTotalPages && comprasTotalPages >= 1) setComprasPage(1);
  }, [comprasTotalPages, comprasPage]);

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
          .eq('buyer_id', user.id)
          .order('created_at', { ascending: false })
          .limit(500);
        if (error) throw error;
        const next = (data as any[]) ?? [];
        if (cancelled) return;
        setOrders(next);

        const ids = next.map((o) => String(o?.id || '')).filter(Boolean);

        // Cargar sesiones de pago offline pendientes para subir ticket
        const loadOfflineSessions = async () => {
          try {
            const { data: sessions, error: sessionErr } = await supabase
              .from('checkout_sessions')
              .select('id, order_ids')
              .eq('buyer_id', user.id)
              .eq('status', 'pending');
            
            if (sessions && !sessionErr) {
              const map: Record<string, string> = {};
              for (const sess of sessions) {
                const oids = Array.isArray(sess.order_ids) ? sess.order_ids : [];
                for (const oid of oids) {
                    map[String(oid)] = sess.id;
                }
              }
              if (!cancelled) setCheckoutSessionByOrderId(map);
            }
          } catch (err) {
            console.error('[COMPRAS] Error loading offline sessions:', err);
          }
        };
        await loadOfflineSessions();

        const loadDisputes = async (orderIds: string[]) => {
          try {
            const { data: sess } = await supabase.auth.getSession();
            const token = sess.session?.access_token;
            if (!token) {
              console.warn('[COMPRAS] No hay token de sesión para cargar disputas');
              return;
            }
            console.log('[COMPRAS] Cargando disputas para órdenes:', orderIds);
            const res = await fetch(`/api/disputes/list?limit=200&t=${Date.now()}`, {
              headers: { authorization: `Bearer ${token}` },
              cache: 'no-store',
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
              console.error('[COMPRAS] Error al cargar disputas:', json?.error || res.status);
              return;
            }
            const list = (json?.disputes ?? []) as any[];
            console.log('[COMPRAS] Disputas recibidas de la API:', list.length);
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
              console.log('[COMPRAS] Procesando disputa:', { oid, did, status, created_at, admin_decision, wanted: wanted.has(oid) });
              if (oid && did && wanted.has(oid)) {
                map[oid] = did;
                infoMap[oid] = { id: did, status, created_at, admin_decision, admin_note };
              }
            }
            console.log('[COMPRAS] Disputas mapeadas:', {
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
            console.error('[COMPRAS] Error al cargar disputas:', err);
          }
        };

        if (ids.length > 0) {
          const itemsRes: any = await supabase
            .from('order_items')
            .select('order_id,listing_id,title,quantity,line_total')
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

        const sellerIds = Array.from(new Set(next.map((o) => String(o?.seller_id || '')).filter(Boolean)));
        if (sellerIds.length > 0) {
          let profRes: any = await supabase.from('profiles').select('id,full_name,nickname,username,state,city').in('id', sellerIds);
          if (profRes.error) {
            const code = String((profRes.error as any)?.code || '');
            const msg = String((profRes.error as any)?.message || '').toLowerCase();
            if (code === '42703' || msg.includes('does not exist') || msg.includes('column') || code === '400') {
              profRes = await supabase.from('profiles').select('id,full_name,state,city').in('id', sellerIds);
              if (profRes.error) profRes = await supabase.from('profiles').select('id,full_name').in('id', sellerIds);
            }
          }
          if (!profRes.error && Array.isArray(profRes.data)) {
            const map: Record<string, string> = {};
            const stateMap: Record<string, string | null> = {};
            const cityMap: Record<string, string | null> = {};
            for (const p of profRes.data as any[]) {
              const id = String(p?.id || '').trim();
              if (!id) continue;
              const name =
                String(p?.full_name || '').trim() ||
                String(p?.nickname || '').trim() ||
                String(p?.username || '').trim() ||
                `${id.slice(0, 6)}…`;
              map[id] = name;
              const st = typeof (p as any).state === 'string' ? String((p as any).state).trim() || null : null;
              const ct = typeof (p as any).city === 'string' ? String((p as any).city).trim() || null : null;
              stateMap[id] = st || null;
              cityMap[id] = ct || null;
            }
            setSellerNames(map);
            setSellerStateById(stateMap);
            setSellerCityById(cityMap);
          } else if (profRes.error) {
            console.warn('[COMPRAS] Error al cargar nombres de vendedores:', profRes.error);
          }

          const opsMap: Record<string, number> = {};
          await Promise.all(
            sellerIds.map(async (id) => {
              try {
                const r = await fetch(`/api/sellers/${encodeURIComponent(id)}`, { cache: 'no-store' });
                const j = await r.json().catch(() => ({}));
                if (r.ok && typeof (j as any)?.operations_count === 'number') opsMap[id] = (j as any).operations_count;
              } catch {
                /* ignore */
              }
            }),
          );
          if (!cancelled) setSellerOperationsById(opsMap);
        }

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

        // Calificaciones buyer->seller ya enviadas (best-effort)
        if (ids.length > 0) {
          const map: Record<string, boolean> = {};
          const bothMap: Record<string, boolean> = {};
          
          const rr: any = await supabase
            .from('user_ratings')
            .select('order_id')
            .eq('direction', 'buyer_to_seller')
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
            for (const oid of ids) {
              const dirs = byOrder[oid];
              if (dirs && dirs.has('buyer_to_seller') && dirs.has('seller_to_buyer')) {
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

        // Cargar guías Estafeta del usuario
        const estafetaRes: any = await supabase
          .from('estafeta_quotes')
          .select('*')
          .eq('user_id', user.id)
          .in('status', ['paid', 'processing', 'completed'])
          .order('created_at', { ascending: false })
          .limit(100);
        
        if (!estafetaRes?.error && Array.isArray(estafetaRes?.data)) {
          setEstafetaQuotes(estafetaRes.data);
        }
      } catch (e: unknown) {
        console.error(e);
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : 'No se pudieron cargar tus compras.';
          if (msg.includes('Auth session missing')) {
            window.location.href = '/login';
          } else {
            setError(msg);
          }
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

  const [isPaying, setIsPaying] = useState<Record<string, boolean>>({});

  const handlePayOrder = async (orderId: string, total: number) => {
    try {
      setIsPaying((prev) => ({ ...prev, [orderId]: true }));
      setError(null);
      
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error('No hay sesión activa');

      const res = await fetch('/api/mercadopago/preference', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          orderIds: [orderId],
          amount: total,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        let msg = json.error || 'Error al iniciar el pago';
        if (json.details && Array.isArray(json.details)) {
          msg += `: ${json.details.join(', ')}`;
        }
        throw new Error(msg);
      }

      if (json.init_point) {
        // Redirigir
        window.location.href = json.init_point;
      } else {
        throw new Error('No se recibió el link de pago de MercadoPago');
      }
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Error al procesar el pago';
      setError(msg);
      alert(`No se pudo iniciar el pago: ${msg}`);
    } finally {
      setIsPaying((prev) => ({ ...prev, [orderId]: false }));
    }
  };

  const submitReceivedAndRate = async () => {
    setError(null);
    setSuccess(null);
    const orderId = String(rateOrderId || '').trim();
    const sellerId = String(rateSellerId || '').trim();
    if (!orderId || !sellerId || !isUuid(orderId)) return;

    try {
      setIsSubmittingRating(true);
      const { data: sess, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) throw sessErr;
      const token = sess.session?.access_token;
      if (!token) throw new Error('Auth session missing');

      const res = await fetch('/api/orders/confirm-received', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderId, stars: rateStars, comment: rateComment }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'No se pudo confirmar recepción.');

      setOrders((prev) => prev.map((o) => (String(o?.id || '') === orderId ? { ...o, status: 'completed' } : o)));
      setRatedByOrderId((p) => ({ ...p, [orderId]: true }));
      if (json.both_rated) {
        setBothRatedByOrderId((p) => ({ ...p, [orderId]: true }));
      }
      setSuccess('Listo: confirmaste recepción. Se liberó el pago y se envió tu calificación.');
      setRateOpen(false);
    } catch (e: unknown) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'No se pudo confirmar recepción.');
    } finally {
      setIsSubmittingRating(false);
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
              <div className="text-sm font-semibold text-gray-900">Compras</div>
              <div className="text-xs text-gray-500">Seguimiento de tus compras</div>
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
        <PageTour steps={pageTours.compras || []} pageId="compras" />
        <SectionMessage section="compras" />
        {error && <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
        {success && <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{success}</div>}

        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <div className="text-lg font-bold text-gray-900">Historial de compras</div>
                <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-extrabold text-blue-800 ring-1 ring-blue-200">
                  TÚ COMPRASTE
                </span>
              </div>
              <div className="mt-1 text-sm text-gray-600">Aquí verás tus compras: vendedor, artículos y estatus del envío.</div>
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
                    placeholder="Buscar por código de orden, vendedor o número de rastreo..."
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

              {/* Filtros */}
              <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 pb-2">
                {/* Filtro activo siempre visible */}
                {(() => {
                  const filterConfig: Record<string, { label: string; count: number; color: string }> = {
                    all: { label: 'Todas', count: filterCounts.all, color: 'bg-brand-pink text-white shadow-sm' },
                    pending_payment: { label: 'Pendiente de pago', count: filterCounts.pending_payment, color: 'bg-red-100 text-red-700 ring-1 ring-red-200' },
                    paid: { label: 'Pagadas', count: filterCounts.paid, color: 'bg-green-100 text-green-700 ring-1 ring-green-200' },
                    shipped: { label: 'Enviadas', count: filterCounts.shipped, color: 'bg-blue-100 text-blue-700 ring-1 ring-blue-200' },
                    delivered: { label: 'Entregadas', count: filterCounts.delivered, color: 'bg-purple-100 text-purple-700 ring-1 ring-purple-200' },
                    rated: { label: 'Calificadas', count: filterCounts.rated, color: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200' },
                    not_rated: { label: 'Sin calificar', count: filterCounts.not_rated, color: 'bg-orange-100 text-orange-700 ring-1 ring-orange-200' },
                    with_dispute: { label: 'Con disputa', count: filterCounts.with_dispute, color: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200' },
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
                    {activeFilter !== 'pending_payment' && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveFilter('pending_payment');
                          setFiltersExpanded(false);
                        }}
                        className="whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-bold transition bg-gray-50 text-gray-700 hover:bg-gray-100"
                      >
                        Pendiente de pago {filterCounts.pending_payment > 0 ? `(${filterCounts.pending_payment})` : ''}
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
                        Pagadas {filterCounts.paid > 0 ? `(${filterCounts.paid})` : ''}
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
                        Enviadas {filterCounts.shipped > 0 ? `(${filterCounts.shipped})` : ''}
                      </button>
                    )}
                    {activeFilter !== 'delivered' && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveFilter('delivered');
                          setFiltersExpanded(false);
                        }}
                        className="whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-bold transition bg-gray-50 text-gray-700 hover:bg-gray-100"
                      >
                        Entregadas {filterCounts.delivered > 0 ? `(${filterCounts.delivered})` : ''}
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
                        Calificadas {filterCounts.rated > 0 ? `(${filterCounts.rated})` : ''}
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
                        Sin calificar {filterCounts.not_rated > 0 ? `(${filterCounts.not_rated})` : ''}
                      </button>
                    )}
                    {activeFilter !== 'with_dispute' && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveFilter('with_dispute');
                          setFiltersExpanded(false);
                        }}
                        className="whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-bold transition bg-gray-50 text-gray-700 hover:bg-gray-100"
                      >
                        Con disputa {filterCounts.with_dispute > 0 ? `(${filterCounts.with_dispute})` : ''}
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
            <div className="mt-6 text-sm text-gray-600">Aún no tienes compras.</div>
          ) : filteredOrders.length === 0 ? (
            <div className="mt-6 text-sm text-gray-600">No hay compras que coincidan con este filtro o búsqueda.</div>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                <span className="text-[11px] font-bold uppercase text-gray-500">Compras</span>
                <span className="text-xs text-gray-600">Filtra y usa Anterior/Siguiente para buscar. No se borra ninguna operación.</span>
              </div>
              <div className="mt-4 space-y-3" data-tour="orders-list">
              {comprasPaginated.map((o) => {
                const sellerId = String(o?.seller_id || '');
                const seller = sellerId ? sellerNames[sellerId] || `${sellerId.slice(0, 6)}…` : '—';
                const items = itemsByOrder[String(o?.id || '')] ?? [];
                const orderId = String(o?.id || '').trim();
                const status = String(o?.status || '').trim();
                const tracking = String(o?.tracking_number || '').trim();
                const carrier = String(o?.shipping_carrier || '').trim();
                const shippedAt = String(o?.shipped_at || '').trim();
                const hasUnread = Boolean(hasUnreadByOrderId[orderId]);
                const alreadyRated = Boolean(ratedByOrderId[orderId]);
                const bothRated = Boolean(bothRatedByOrderId[orderId]);
                const canConfirmReceived = Boolean(orderId && sellerId && status === 'shipped' && !alreadyRated);
                const disputeId = orderId ? disputeByOrderId[orderId] : '';
                const canOpenDispute = Boolean(orderId && status === 'shipped' && !disputeId);
                console.log('[COMPRAS] Renderizando orden:', {
                  orderId,
                  disputeId,
                  hasDispute: Boolean(disputeId),
                  disputeInfo: disputeId ? disputeInfoByOrderId[orderId] : null,
                });
                const isPaid = status === 'paid' || status === 'shipped' || status === 'delivered' || status === 'completed';
                return (
                  <div key={String(o?.id || Math.random())} className={`rounded-xl border-2 border-blue-200 bg-white p-3 shadow-sm ring-1 ring-blue-100 hover:shadow-md hover:border-blue-300 transition-all ${hasUnread ? 'bg-blue-50/30 border-blue-300' : ''}`}>
                    <div className="border-l-4 border-blue-500 pl-3 -ml-3">
                      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded-full bg-blue-600 px-2.5 py-1 text-[10px] font-extrabold text-white uppercase">
                            Tu Compra
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
                          ) : (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
                              {status || '—'}
                            </span>
                          )}
                          <span className="text-xs text-gray-500">{formatDateTime(o?.created_at)}</span>
                          {disputeId ? (() => {
                            const di = disputeInfoByOrderId[orderId];
                            const open = di?.status === 'open';
                            const start = di?.created_at ? new Date(di.created_at).getTime() : 0;
                            const ok = Number.isFinite(start) && start > 0;
                            const end = ok ? start + 72 * 60 * 60 * 1000 : 0;
                            const d = ok ? end - currentTime.getTime() : -1;
                            const ex = d <= 0;
                            const h = Math.max(0, Math.floor(d / (1000 * 60 * 60)));
                            const m = Math.max(0, Math.floor((d % (1000 * 60 * 60)) / (1000 * 60)));
                            const s = Math.max(0, Math.floor((d % (1000 * 60)) / 1000));
                            if (!open) return null;
                            return (
                              <Link
                                href={`/dashboard/disputas/${disputeId}`}
                                className="inline-flex items-center gap-1.5 rounded-full border-2 border-red-400 bg-red-50 px-2.5 py-0.5 text-xs font-extrabold text-red-900 shadow-sm hover:bg-red-100"
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
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5">
                          <span className="text-[10px] font-bold uppercase text-blue-800">Comprado a:</span>
                          {sellerId ? (
                              <SellerDisplay
                                sellerId={sellerId}
                                sellerName={seller}
                                state={sellerStateById[sellerId] ?? null}
                                city={sellerCityById[sellerId] ?? null}
                                operationsCount={sellerOperationsById[sellerId] ?? null}
                                size="sm"
                              />
                            ) : (
                              <span className="text-[10px] text-gray-600">—</span>
                            )}
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
                                    <div className="mt-1 flex items-center gap-2 text-xs text-gray-600">
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

                        {/* Información de estado de pago y producto enviado */}
                        {status === 'pending_payment' ? (
                          <div className="mt-3 space-y-2">
                            <div className="rounded-lg border border-pink-200 bg-pink-50/80 p-2.5">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="flex items-start gap-2">
                                  <span className="text-lg">💳</span>
                                  <div>
                                    <h4 className="text-[11px] font-bold text-pink-900">Finaliza tu compra</h4>
                                    <p className="text-[10px] text-pink-800/80 leading-snug max-w-md">
                                      Orden reservada. Paga para que te envíen tus productos.
                                    </p>
                                  </div>
                                </div>
                                
                                {checkoutSessionByOrderId[orderId] ? (
                                  <Link
                                    href={`/pago/${checkoutSessionByOrderId[orderId]}`}
                                    className="shrink-0 rounded-md bg-brand-pink px-4 py-1.5 text-[11px] font-bold text-white shadow-sm hover:bg-brand-pink/90 flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]"
                                  >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                      <polyline points="17 8 12 3 7 8" />
                                      <line x1="12" y1="3" x2="12" y2="15" />
                                    </svg>
                                    Subir comprobante
                                  </Link>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handlePayOrder(orderId, Number(o?.total || 0))}
                                    disabled={isPaying[orderId]}
                                    className="shrink-0 rounded-md bg-brand-pink px-4 py-1.5 text-[11px] font-bold text-white shadow-sm hover:bg-brand-pink/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]"
                                  >
                                    {isPaying[orderId] ? (
                                      <>
                                        <svg className="animate-spin h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Procesando...
                                      </>
                                    ) : (
                                      <>
                                        <span>Pagar ahora</span>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                          <path d="M5 12h14" />
                                          <path d="M12 5l7 7-7 7" />
                                        </svg>
                                      </>
                                    )}
                                  </button>
                                )}
                              </div>
                              <p className="mt-2 text-[9px] text-pink-700/50 flex items-center gap-1">
                                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                </svg>
                                Pago seguro vía MercadoPago. El chat se activa al acreditarse.
                              </p>
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
                                  className={`rounded-lg border px-2.5 py-1.5 ${
                                    hours < 12
                                      ? 'border-red-300 bg-red-50'
                                      : 'border-orange-300 bg-orange-50'
                                  }`}
                                >
                                  <div className="flex items-center gap-1.5">
                                    <svg
                                      width="14"
                                      height="14"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke={hours < 12 ? '#dc2626' : '#ea580c'}
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      className="shrink-0"
                                    >
                                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                      <line x1="12" y1="9" x2="12" y2="13" />
                                      <line x1="12" y1="17" x2="12.01" y2="17" />
                                    </svg>
                                    <div className="flex-1 min-w-0">
                                      <div className={`text-[11px] font-extrabold ${hours < 12 ? 'text-red-900' : 'text-orange-900'}`}>
                                        {hours}h {minutes}m {seconds}s
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        ) : (isPaid || status === 'shipped') ? (
                          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                            {isPaid ? (
                              <div className="flex-1 rounded-xl border border-green-200 bg-green-50 px-3 py-2">
                                <div className="text-xs font-extrabold text-green-900">Tu compra está protegida</div>
                                <div className="mt-1 text-[11px] text-green-800/80">
                                  El dinero se le libera al vendedor hasta que confirmes de Recibido.
                                </div>
                              </div>
                            ) : null}
                            {status === 'shipped' ? (
                              <div className="flex-1 rounded-xl border border-green-200 bg-green-50 px-3 py-2">
                                <div className="text-xs font-extrabold text-green-900">✓ Producto enviado</div>
                                <div className="mt-1 text-[11px] text-green-800/80">
                                  Asegúrate de tomar evidencias del artículo que recibiste en caso de abrir una disputa.
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                      <div className="shrink-0 rounded-xl bg-gray-50 px-3 py-2.5 text-sm ring-1 ring-black/5 w-full sm:w-auto sm:min-w-[200px]">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-[10px] font-semibold text-gray-600">Total</span>
                          <span className="text-sm font-extrabold text-gray-900">{formatMoney(o?.total)}</span>
                        </div>
                        <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-gray-600">
                          <span>Envío</span>
                          <span className="font-semibold text-gray-900">{formatMoney(o?.shipping_fee)}</span>
                        </div>

                        {tracking ? (
                          <div className="mt-2 rounded-lg bg-white px-2.5 py-2 text-[10px] ring-1 ring-black/5">
                            <div className="font-semibold text-gray-900 mb-1">Rastreo</div>
                            <div className="space-y-0.5 text-gray-700">
                              <div><span className="text-gray-500">Paq:</span> <span className="font-semibold">{carrier || '—'}</span></div>
                              <div className="truncate"><span className="text-gray-500">Cód:</span> <span className="font-semibold">{tracking}</span></div>
                              <div className="text-gray-500 text-[9px]">{formatDateTime(shippedAt)}</div>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-2 text-[10px] text-gray-500">Sin rastreo aún</div>
                        )}

                        {orderId ? (
                          <div className="mt-3 flex flex-col gap-2">
                            {alreadyRated && sellerId ? (
                              <Link
                                href={`/tienda/${sellerId}`}
                                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-semibold text-sky-600 shadow-sm ring-1 ring-sky-200 hover:bg-sky-50"
                              >
                                Visita tienda
                              </Link>
                            ) : status === 'pending_payment' ? (
                              <button
                                type="button"
                                disabled
                                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-gray-100 px-2.5 py-1.5 text-[11px] font-semibold text-gray-500 shadow-sm ring-1 ring-gray-200 cursor-not-allowed"
                              >
                                Chat (pendiente pago)
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setChatOrderId(orderId);
                                  setChatOpen(true);
                                  setHasUnreadByOrderId((p) => ({ ...p, [orderId]: false }));
                                }}
                                className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-semibold text-gray-900 shadow-sm ring-1 hover:bg-gray-50 ${
                                  hasUnread ? 'ring-brand-pink' : 'ring-black/5'
                                } ${
                                  isPaid && !alreadyRated ? 'animate-pulse ring-brand-pink bg-pink-50' : ''
                                }`}
                              >
                                Chat
                                {hasUnread ? <span className="rounded-full bg-brand-pink px-1.5 py-0.5 text-[10px] font-bold text-white">Nuevo</span> : null}
                              </button>
                            )}

                            {canConfirmReceived ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setRateOrderId(orderId);
                                  setRateSellerId(sellerId);
                                  setRateStars(10);
                                  setRateComment('');
                                  setRateOpen(true);
                                }}
                                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-pink px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:opacity-90"
                              >
                                Ya recibí
                              </button>
                            ) : alreadyRated ? (
                              <div className="space-y-1">
                                <span className="inline-flex w-full items-center justify-center rounded-lg bg-green-50 px-2.5 py-1.5 text-[11px] font-semibold text-green-800 ring-1 ring-green-100">
                                  ✅ Calificado
                                </span>
                                {bothRated && (
                                  <div className="rounded-lg border border-green-300 bg-green-100 px-2.5 py-1.5">
                                    <div className="text-[10px] font-extrabold text-green-900">✓ Excelente</div>
                                  </div>
                                )}
                              </div>
                            ) : status === 'completed' ? (
                              <span className="inline-flex w-full items-center justify-center rounded-lg bg-green-50 px-2.5 py-1.5 text-[11px] font-semibold text-green-800 ring-1 ring-green-100">
                                Confirmado
                              </span>
                            ) : null}

                            {disputeId ? (() => {
                              const disputeInfo = disputeInfoByOrderId[orderId];
                              const isOpen = disputeInfo?.status === 'open';
                              const isResolved = disputeInfo?.status === 'resolved' || disputeInfo?.status === 'closed';
                              const disputeCreatedAt = disputeInfo?.created_at ? new Date(disputeInfo.created_at).getTime() : 0;
                              const hasValidStart = Number.isFinite(disputeCreatedAt) && disputeCreatedAt > 0;
                              const deadline = hasValidStart ? disputeCreatedAt + 72 * 60 * 60 * 1000 : 0;
                              const diff = hasValidStart ? deadline - currentTime.getTime() : -1;
                              const expired = diff <= 0;
                              const hoursRemaining = Math.max(0, Math.floor(diff / (1000 * 60 * 60)));
                              const minutesRemaining = Math.max(0, Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)));
                              const secondsRemaining = Math.max(0, Math.floor((diff % (1000 * 60)) / 1000));

                              if (isResolved) {
                                const adminDecision = disputeInfo?.admin_decision;
                                const adminNote = disputeInfo?.admin_note;
                                
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
                                    <div className="inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-gray-300 bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-600 cursor-not-allowed opacity-75">
                                      Disputa
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
                              
                              return (
                                <div className="space-y-2">
                                  <Link
                                    href={`/dashboard/disputas/${disputeId}`}
                                    className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-90 ${
                                      isOpen ? 'animate-pulse bg-red-600 ring-2 ring-red-400' : 'bg-red-500'
                                    }`}
                                  >
                                    Disputa
                                  </Link>
                                  {isOpen && hasValidStart && !expired ? (
                                    <div className="rounded-xl border-2 border-red-400 bg-red-50 px-3 py-2 shadow-sm">
                                      <div className="flex items-start gap-2">
                                        <svg
                                          width="16"
                                          height="16"
                                          viewBox="0 0 24 24"
                                          fill="none"
                                          stroke="#dc2626"
                                          strokeWidth="2"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          className="mt-0.5 shrink-0"
                                        >
                                          <circle cx="12" cy="12" r="10" />
                                          <polyline points="12 6 12 12 16 14" />
                                        </svg>
                                        <div className="flex-1">
                                          <div className="text-xs font-extrabold text-red-900">
                                            Tiempo para resolver: {hoursRemaining}h {minutesRemaining}m {secondsRemaining}s
                                          </div>
                                          <div className="mt-0.5 text-[10px] text-red-800">
                                            Tienes 72 horas para resolver con el comprador o el vendedor antes de que un mediador vea tu caso y dé una resolución.
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  ) : isOpen && (expired || !hasValidStart) ? (
                                    <div className="rounded-xl border border-gray-300 bg-gray-50 px-3 py-2">
                                      <div className="text-xs font-extrabold text-gray-900">
                                        El administrador revisará tu caso
                                      </div>
                                      <div className="mt-0.5 text-[10px] text-gray-800">
                                        {expired && hasValidStart
                                          ? 'El tiempo para resolver ha expirado. El administrador tomará una decisión definitiva.'
                                          : 'Puedes ver el estado en el chat de la disputa.'}
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })() : canOpenDispute ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setDisputeOrderId(orderId);
                                  setDisputeReason('not_received');
                                  setDisputeText('');
                                  setDisputeOpen(true);
                                }}
                                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 shadow-sm ring-1 ring-amber-200 hover:opacity-90"
                              >
                                Abrir disputa
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <div className="text-xs text-gray-600">
                {filteredOrders.length} compra(s) en total · Página {Math.min(comprasPage, comprasTotalPages)} de {comprasTotalPages}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setComprasPage((p) => Math.max(1, p - 1))}
                  disabled={comprasPage <= 1}
                  className="rounded-xl bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-black/10 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  onClick={() => setComprasPage((p) => Math.min(comprasTotalPages, p + 1))}
                  disabled={comprasPage >= comprasTotalPages}
                  className="rounded-xl bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-black/10 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Siguiente
                </button>
              </div>
            </div>
            </>
          )}

          {/* Sección de Guías Estafeta */}
          {estafetaQuotes.length > 0 && (
            <div className="mt-8 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
              <div className="mb-4 flex items-center gap-3">
                {/* Logo Estafeta */}
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-50 ring-1 ring-black/5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img 
                    src="/estafeta-logo.png" 
                    alt="Estafeta" 
                    className="h-10 w-auto object-contain"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      if (target.parentElement) {
                        target.parentElement.innerHTML = `
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 7h12v10H3V7Z" />
                            <path d="M15 10h4l2 3v4h-6v-7Z" />
                            <path d="M7 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" fill="currentColor" />
                            <path d="M17 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" fill="currentColor" />
                          </svg>
                        `;
                      }
                    }}
                  />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Guías de envío Estafeta</h2>
                  <p className="mt-0.5 text-sm text-gray-600">Tus guías de envío compradas</p>
                </div>
              </div>

              <div className="space-y-3">
                {estafetaQuotes.map((quote) => {
                  const hasGuide = Boolean(quote.guide_file_url);
                  const isCompleted = quote.status === 'completed';
                  const isProcessing = quote.status === 'processing';
                  
                  return (
                    <div
                      key={quote.id}
                      className="rounded-2xl border-2 border-blue-200 bg-blue-50 p-4 hover:bg-blue-100/50 transition"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <span className="rounded-full bg-blue-600 px-2.5 py-1 text-[10px] font-extrabold text-white uppercase">
                              Guía Estafeta
                            </span>
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
                              {quote.id.slice(0, 8)}…
                            </span>
                            <span className="text-xs text-gray-500">{formatDateTime(quote.created_at)}</span>
                            {quote.paid_at && (
                              <span className="text-xs text-green-700">Pagado: {formatDateTime(quote.paid_at)}</span>
                            )}
                          </div>

                          <div className="grid gap-2 sm:grid-cols-2">
                            <div className="rounded-lg border border-blue-200 bg-white p-2.5">
                              <div className="text-[10px] font-semibold text-gray-600">Paquete</div>
                              <div className="mt-0.5 text-xs text-gray-900">
                                {quote.weight_kg} kg · {quote.length_cm}×{quote.width_cm}×{quote.height_cm} cm
                              </div>
                              <div className="mt-1 text-sm font-extrabold text-brand-pink">{formatMoney(quote.calculated_cost)}</div>
                            </div>

                            <div className="rounded-lg border border-blue-200 bg-white p-2.5">
                              <div className="text-[10px] font-semibold text-gray-600">Ruta</div>
                              <div className="mt-0.5 text-xs text-gray-900">
                                {quote.sender_city}, {quote.sender_state} → {quote.recipient_city}, {quote.recipient_state}
                              </div>
                            </div>
                          </div>

                          {hasGuide && (
                            <div className="mt-3 rounded-lg border-2 border-green-300 bg-green-50 p-3">
                              <div className="flex items-center gap-2">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-700">
                                  <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
                                  <path d="M21 12c-1 0-3-1-3-3s2-3 3-3 3 1 3 3-2 3-3 3" />
                                  <path d="M3 12c1 0 3-1 3-3s-2-3-3-3-3 1-3 3 2 3 3 3" />
                                  <path d="M12 3c0 1-1 3-3 3s-3-2-3-3 1-3 3-3 3 2 3 3" />
                                  <path d="M12 21c0-1 1-3 3-3s3 2 3 3-1 3-3 3-3-2-3-3" />
                                </svg>
                                <div className="flex-1">
                                  <div className="text-xs font-extrabold text-green-900">¡Gracias por tu compra!</div>
                                  <div className="mt-0.5 text-[10px] text-green-800">Tu guía está lista para descargar</div>
                                </div>
                                <a
                                  href={quote.guide_file_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  download
                                  className="rounded-lg bg-green-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-green-700 transition-colors"
                                >
                                  Descargar Guía
                                </a>
                              </div>
                            </div>
                          )}

                          {!hasGuide && isProcessing && (
                            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                              <div className="text-xs font-semibold text-amber-900">⏳ Procesando tu guía</div>
                              <div className="mt-0.5 text-[10px] text-amber-800">Estamos preparando tu guía. Te notificaremos cuando esté lista.</div>
                            </div>
                          )}

                          {!hasGuide && quote.status === 'paid' && (
                            <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
                              <div className="text-xs font-semibold text-blue-900">✓ Pago acreditado</div>
                              <div className="mt-0.5 text-[10px] text-blue-800">Tu guía se está procesando. Estará disponible pronto.</div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
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

      {disputeOpen ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-black/10">
            <div className="border-b border-black/5 px-5 py-4">
              <div className="text-sm font-extrabold text-gray-900">Abrir disputa</div>
              <div className="mt-1 text-xs text-gray-600">
                Esto abrirá un chat con soporte y notificará al vendedor. La operación quedará en revisión.
              </div>
            </div>

            <div className="px-5 py-4">
              <div className="text-xs font-semibold text-gray-900">Motivo</div>
              <select
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value as any)}
                className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-pink"
              >
                <option value="not_received">No recibí mi pedido</option>
                <option value="damaged">Llegó dañado</option>
                <option value="not_as_described">No es como se describía</option>
                <option value="missing_items">Faltan artículos</option>
                <option value="other">Otro</option>
              </select>

              <div className="mt-4 text-xs font-semibold text-gray-900">Detalle (opcional)</div>
              <textarea
                value={disputeText}
                onChange={(e) => setDisputeText(e.target.value)}
                placeholder="Describe el problema (sin enlaces ni teléfonos)."
                className="mt-2 h-28 w-full resize-none rounded-2xl border border-gray-200 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-pink"
              />
              <div className="mt-1 text-[11px] text-gray-500">Máx. 600 caracteres.</div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-black/5 px-5 py-4">
              <button
                type="button"
                onClick={() => setDisputeOpen(false)}
                className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-black/10 hover:bg-gray-50"
                disabled={isOpeningDispute}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  setError(null);
                  setSuccess(null);
                  const orderId = String(disputeOrderId || '').trim();
                  if (!orderId) return;
                  setIsOpeningDispute(true);
                  try {
                    const { data: sess } = await supabase.auth.getSession();
                    const token = sess.session?.access_token;
                    if (!token) throw new Error('Auth session missing');
                    const res = await fetch('/api/disputes/open', {
                      method: 'POST',
                      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
                      cache: 'no-store',
                      body: JSON.stringify({ orderId, reason_code: disputeReason, reason_text: disputeText }),
                    });
                    const json = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(json?.error || 'No se pudo abrir la disputa.');
                    const disputeId = String(json?.disputeId || '').trim();
                    if (disputeId) {
                      setDisputeByOrderId((p) => ({ ...p, [orderId]: disputeId }));
                      setDisputeOpen(false);
                      window.location.href = `/dashboard/devoluciones/${disputeId}`;
                      return;
                    }
                    setSuccess('Disputa creada.');
                    setDisputeOpen(false);
                  } catch (e: unknown) {
                    console.error(e);
                    setError(e instanceof Error ? e.message : 'No se pudo abrir la disputa.');
                  } finally {
                    setIsOpeningDispute(false);
                  }
                }}
                className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-700 disabled:opacity-60"
                disabled={isOpeningDispute || !disputeOrderId}
              >
                {isOpeningDispute ? 'Abriendo…' : 'Abrir disputa'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {rateOpen ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-xl ring-1 ring-black/10">
            <div className="border-b border-black/5 px-5 py-4">
              <div className="text-sm font-extrabold text-gray-900">Confirmar recepción</div>
              <div className="mt-1 text-xs text-gray-600">Esto libera el pago y te permite calificar al vendedor.</div>
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
                onClick={() => void submitReceivedAndRate()}
                className="rounded-xl bg-brand-pink px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-60"
                disabled={isSubmittingRating || !rateOrderId || rateStars < 1 || rateStars > 10}
              >
                {isSubmittingRating ? 'Enviando…' : 'Confirmar y calificar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

