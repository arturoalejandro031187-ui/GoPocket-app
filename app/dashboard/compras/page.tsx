'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import Link from 'next/link';
import Image from 'next/image';
import { ShippingBadge, OrderSourceChip } from '@/components/ui/ShippingBadge';

/* ─── Helpers ─── */
const formatCurrency = (v: any) => {
  const n = Number(v || 0);
  return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
};

const STATUS_MAP: Record<string, { label: string; bg: string; text: string; ring: string; icon: string }> = {
  pending_payment: { label: 'Pendiente de pago', bg: 'bg-yellow-50', text: 'text-yellow-700', ring: 'ring-yellow-300', icon: '⏳' },
  paid: { label: 'Pagado', bg: 'bg-blue-50', text: 'text-blue-700', ring: 'ring-blue-300', icon: '💳' },
  shipped: { label: 'Enviado', bg: 'bg-indigo-50', text: 'text-indigo-700', ring: 'ring-indigo-300', icon: '🚚' },
  delivered: { label: 'Entregado', bg: 'bg-green-50', text: 'text-green-700', ring: 'ring-green-300', icon: '✅' },
  cancelled: { label: 'Cancelado', bg: 'bg-red-50', text: 'text-red-700', ring: 'ring-red-300', icon: '❌' },
  refunded: { label: 'Reembolsado', bg: 'bg-gray-50', text: 'text-gray-600', ring: 'ring-gray-300', icon: '↩️' },
  disputed: { label: 'En disputa', bg: 'bg-orange-50', text: 'text-orange-700', ring: 'ring-orange-300', icon: '⚠️' },
  processing: { label: 'Procesando', bg: 'bg-cyan-50', text: 'text-cyan-700', ring: 'ring-cyan-300', icon: '⚙️' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] || { label: status || 'Desconocido', bg: 'bg-gray-50', text: 'text-gray-600', ring: 'ring-gray-300', icon: '📋' };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${s.bg} ${s.text} ring-1 ${s.ring}`}>
      {s.icon} {s.label}
    </span>
  );
}

/* ─── Filter tabs ─── */
const FILTERS = [
  { key: 'all', label: 'Todas' },
  { key: 'paid', label: 'Pagadas' },
  { key: 'shipped', label: 'Enviadas' },
  { key: 'delivered', label: 'Entregadas' },
  { key: 'cancelled', label: 'Canceladas' },
];

export default function ComprasPage() {
  const [user, setUser] = useState<any>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const router = useRouter();
  const [orders, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;

  /* thumbnails & titles from order_items enrichment */
  const [thumbByListingId, setThumbByListingId] = useState<Record<string, string>>({});
  const [titleByListingId, setTitleByListingId] = useState<Record<string, string>>({});
  const [sellerNames, setSellerNames] = useState<Record<string, string>>({});

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data?.user ?? null);
      setIsAuthLoading(false);
    });
  }, []);

  useEffect(() => {
    if (isAuthLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }

    const fetchOrders = async () => {
      try {
        setIsLoading(true);
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) {
          router.replace('/login');
          return;
        }
        const response = await fetch('/api/orders/buyer-dashboard', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        if (data.ok) {
          const ordersData = data.orders || [];
          setOrders(ordersData);

          /* Extract thumbs from shipping_snapshot */
          const thumbs: Record<string, string> = {};
          for (const o of ordersData) {
            const lid = o.shipping_snapshot?.id;
            const thumb = o.shipping_snapshot?.thumb_url || o.thumb_url;
            if (lid && thumb) {
              thumbs[lid] = thumb;
            }
          }
          setThumbByListingId(thumbs);

          /* Load order_items for titles + images */
          const orderIds = ordersData.map((o: any) => String(o.id || '')).filter(Boolean);
          let firstListingByOrder: Record<string, string> = {};
          if (orderIds.length > 0) {
            const batchSize = 25;
            const allItems: any[] = [];
            for (let i = 0; i < orderIds.length; i += batchSize) {
              const batch = orderIds.slice(i, i + batchSize);
              const { data: items, error } = await supabase
                .from('order_items')
                .select('order_id,listing_id,title,quantity,line_total')
                .in('order_id', batch);
              if (!error && Array.isArray(items)) {
                allItems.push(...items);
              }
            }

            /* Build title map from order_items */
            const tMap: Record<string, string> = {};
            for (const it of allItems) {
              const oid = String(it?.order_id || '').trim();
              const lid = String(it?.listing_id || '').trim();
              const title = String(it?.title || '').trim();
              if (oid && lid && !firstListingByOrder[oid]) {
                firstListingByOrder[oid] = lid;
              }
              if (lid && title) {
                tMap[lid] = title;
              }
            }
            setTitleByListingId(tMap);

            /* Fetch listing images + titles from listings table */
            const listingIds = [...new Set(Object.values(firstListingByOrder))];
            if (listingIds.length > 0) {
              const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
              const uuids = listingIds.filter(isUuid);
              const publics = listingIds.filter(x => !isUuid(x));
              const results: any[] = [];

              if (uuids.length > 0) {
                const { data } = await supabase.from('listings').select('id,public_id,images,title,thumb_url').in('id', uuids).limit(300);
                if (Array.isArray(data)) results.push(...data);
              }
              if (publics.length > 0) {
                const { data } = await supabase.from('listings').select('id,public_id,images,title,thumb_url').in('public_id', publics).limit(300);
                if (Array.isArray(data)) results.push(...data);
              }

              const newThumbs: Record<string, string> = {};
              const newTitles: Record<string, string> = {};
              for (const r of results) {
                const k1 = String(r?.id || '').trim();
                const k2 = String(r?.public_id || '').trim();

                /* Get image */
                let imgUrl = String(r?.thumb_url || '').trim();
                if (!imgUrl) {
                  const rawImgs = r?.images;
                  if (Array.isArray(rawImgs) && rawImgs[0]) {
                    imgUrl = String(rawImgs[0]).trim();
                  } else if (typeof rawImgs === 'string') {
                    try {
                      const parsed = JSON.parse(rawImgs);
                      if (Array.isArray(parsed) && parsed[0]) imgUrl = String(parsed[0]).trim();
                    } catch {
                      if (rawImgs.startsWith('http')) imgUrl = rawImgs.trim();
                    }
                  }
                }
                if (imgUrl) {
                  if (k1) newThumbs[k1] = imgUrl;
                  if (k2) newThumbs[k2] = imgUrl;
                }

                const tt = String(r?.title || '').trim();
                if (tt) {
                  if (k1) newTitles[k1] = tt;
                  if (k2) newTitles[k2] = tt;
                }
              }

              if (Object.keys(newThumbs).length > 0) setThumbByListingId(prev => ({ ...prev, ...newThumbs }));
              if (Object.keys(newTitles).length > 0) setTitleByListingId(prev => ({ ...prev, ...newTitles }));
            }

            /* Store firstListingByOrder on each order for later lookups */
            for (const o of ordersData) {
              const oid = String(o.id || '').trim();
              if (firstListingByOrder[oid]) {
                o._firstListingId = firstListingByOrder[oid];
              }
            }
          }

          /* Load seller names */
          const sellerIds = [...new Set(ordersData.map((o: any) => String(o.seller_id || '')).filter(Boolean))];
          if (sellerIds.length > 0) {
            const { data: profiles } = await supabase
              .from('profiles')
              .select('id,full_name,nickname,username')
              .in('id', sellerIds);
            if (Array.isArray(profiles)) {
              const names: Record<string, string> = {};
              for (const p of profiles) {
                const id = String(p?.id || '').trim();
                const name = String(p?.full_name || '').trim() || String(p?.nickname || '').trim() || String(p?.username || '').trim() || `${id.slice(0, 6)}…`;
                if (id) names[id] = name;
              }
              setSellerNames(names);
            }
          }

          /* Enrich via server API for better data */
          try {
            const enrichRes = await fetch('/api/orders/enrich-items', {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                orderIds: orderIds,
                listingIds: [...new Set(Object.values(firstListingByOrder))],
              }),
            });
            if (enrichRes.ok) {
              const enrichData = await enrichRes.json();
              const titles = enrichData?.titles as Record<string, string> || {};
              const enrichedThumbs = enrichData?.thumbs as Record<string, string> || {};
              if (Object.keys(enrichedThumbs).length > 0) setThumbByListingId(prev => ({ ...prev, ...enrichedThumbs }));
              if (Object.keys(titles).length > 0) setTitleByListingId(prev => ({ ...prev, ...titles }));
            }
          } catch { }

        } else {
          toast.error(data.error || 'Error al cargar las compras');
        }
      } catch (error) {
        toast.error('Ocurrió un error inesperado');
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrders();
  }, [user, isAuthLoading, router]);

  /* ─── Filtering ─── */
  const filteredOrders = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return orders.filter(o => {
      const status = String(o?.status || '').trim();
      /* Filter */
      if (activeFilter !== 'all' && status !== activeFilter) return false;
      /* Search */
      if (query) {
        const lid = String(o?._firstListingId || '').trim();
        const title = (lid ? titleByListingId[lid] : '') || '';
        const orderId = String(o?.id || '');
        const seller = sellerNames[o?.seller_id] || '';
        return (
          title.toLowerCase().includes(query) ||
          orderId.toLowerCase().includes(query) ||
          seller.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [orders, activeFilter, searchQuery, titleByListingId, sellerNames]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE));
  const paginatedOrders = useMemo(() => {
    const page = Math.min(Math.max(1, currentPage), totalPages);
    return filteredOrders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  }, [filteredOrders, currentPage, totalPages]);

  useEffect(() => { setCurrentPage(1); }, [activeFilter, searchQuery]);

  /* ─── Filter counts ─── */
  const filterCounts = useMemo(() => {
    const c: Record<string, number> = { all: orders.length };
    for (const o of orders) {
      const s = String(o?.status || '').trim();
      c[s] = (c[s] || 0) + 1;
    }
    return c;
  }, [orders]);

  /* ─── Get order data helpers ─── */
  function getOrderThumb(order: any): string {
    const lid = String(order?._firstListingId || '').trim();
    return thumbByListingId[lid] || order?.thumb_url || order?.shipping_snapshot?.thumb_url || '';
  }

  function getOrderTitle(order: any): string {
    const lid = String(order?._firstListingId || '').trim();
    const t = titleByListingId[lid] || '';
    if (t && t !== 'Producto vendido' && t !== 'Producto') return t;
    return 'Producto';
  }

  function isDigital(order: any): boolean {
    return order?.product_type === 'digital' || order?.shipping_snapshot?.product_type === 'digital';
  }

  function isAuction(order: any): boolean {
    return order?.sale_type === 'auction' || order?.shipping_snapshot?.sale_type === 'auction';
  }

  /* ─── Loading state ─── */
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-pink-200 border-t-pink-500 rounded-full animate-spin" />
          <p className="text-sm text-gray-500 font-medium animate-pulse">Cargando tus compras…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
          🛍️ Mis Compras
        </h1>
        <p className="text-sm text-gray-500 mt-1">{orders.length} {orders.length === 1 ? 'compra' : 'compras'} en total</p>
      </div>

      {/* Search bar */}
      <div className="relative mb-4">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
        </span>
        <input
          type="text"
          placeholder="Buscar por producto, vendedor o ID de orden…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-pink-300 transition-shadow shadow-sm"
        />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1 scrollbar-hide">
        {FILTERS.map(f => {
          const count = filterCounts[f.key] || 0;
          const isActive = activeFilter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setActiveFilter(f.key)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${isActive
                ? 'bg-pink-500 text-white shadow-md shadow-pink-200'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
            >
              {f.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Orders list */}
      {filteredOrders.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-5xl mb-3">📦</p>
          <p className="text-gray-500 font-medium">
            {searchQuery ? 'No se encontraron resultados' : 'No tienes compras aún'}
          </p>
          <Link href="/" className="inline-block mt-4 px-5 py-2 rounded-full bg-pink-500 text-white text-sm font-bold hover:bg-pink-600 transition-colors shadow-md shadow-pink-200">
            Explorar productos
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {paginatedOrders.map((order) => {
            const thumb = getOrderThumb(order);
            const title = getOrderTitle(order);
            const status = String(order.status || '').trim();
            const sellerId = String(order.seller_id || '');
            const sellerName = sellerNames[sellerId] || '';
            const tracking = String(order.tracking_number || '').trim();
            const carrier = String(order.shipping_carrier || '').trim();
            const shippingFee = Number(order.shipping_fee || 0);
            const digital = isDigital(order);
            const auction = isAuction(order);

            return (
              <div
                key={order.id}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden group"
              >
                <div className="flex gap-3 sm:gap-4 p-3 sm:p-4">
                  {/* Product image */}
                  <div className="flex-shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden bg-gray-100 border border-gray-100">
                    {thumb ? (
                      <img
                        src={thumb}
                        alt={title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-3xl text-gray-300">
                        📦
                      </div>
                    )}
                  </div>

                  {/* Order info */}
                  <div className="flex-1 min-w-0">
                    {/* Title */}
                    <h3 className="font-bold text-gray-900 text-sm sm:text-base leading-tight truncate">
                      {title}
                    </h3>

                    {/* Seller */}
                    {sellerName && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                        Vendedor: <span className="font-medium text-gray-600">{sellerName}</span>
                      </p>
                    )}

                    {/* Date */}
                    <p className="text-[11px] text-gray-400 mt-1">
                      {format(new Date(order.created_at), "d 'de' MMMM 'de' yyyy", { locale: es })}
                    </p>

                    {/* Badges row */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <StatusBadge status={status} />
                      {digital && (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200">
                          📱 Digital
                        </span>
                      )}
                      {auction && (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold bg-pink-50 text-pink-700 ring-1 ring-pink-200">
                          🔨 Subasta
                        </span>
                      )}
                    </div>

                    {/* Shipping info */}
                    {!digital && carrier && (
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <ShippingBadge
                          shippingCarrier={carrier}
                          shippingFee={shippingFee}
                          shippingBySeller={order.shipping_snapshot?.shipping_by_seller}
                          isDigital={false}
                          showOrderSource={false}
                          compact
                        />
                      </div>
                    )}

                    {/* Tracking */}
                    {tracking && (
                      <p className="text-[11px] text-gray-500 mt-1 flex items-center gap-1">
                        <span className="text-gray-400">📍</span>
                        Rastreo: <span className="font-mono font-bold text-gray-700">{tracking}</span>
                      </p>
                    )}
                  </div>

                  {/* Price & action */}
                  <div className="flex flex-col items-end justify-between flex-shrink-0">
                    <p className="font-extrabold text-gray-900 text-base sm:text-lg">
                      {formatCurrency(order.total)}
                    </p>
                    {shippingFee > 0 && (
                      <p className="text-[10px] text-gray-400">
                        Envío: {formatCurrency(shippingFee)}
                      </p>
                    )}
                    <Link
                      href={`/dashboard/compras/${order.id}`}
                      className="mt-auto px-3 py-1.5 rounded-lg bg-gradient-to-r from-pink-500 to-rose-500 text-white text-xs font-bold hover:from-pink-600 hover:to-rose-600 transition-all shadow-sm hover:shadow-md"
                    >
                      Ver Detalles
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-bold disabled:opacity-40 hover:bg-gray-200 transition-colors"
          >
            ← Anterior
          </button>
          <span className="text-xs text-gray-500 font-medium">
            Página {currentPage} de {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-bold disabled:opacity-40 hover:bg-gray-200 transition-colors"
          >
            Siguiente →
          </button>
        </div>
      )}
    </div>
  );
}
