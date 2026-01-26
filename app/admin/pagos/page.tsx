'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAdminContext } from '@/lib/admin/AdminContext';
import { ContextualNavigation } from '@/components/admin/ContextualNavigation';

export default function AdminPagosPage() {
  const { orders, refreshPayments, refreshOrders } = useAdminContext();
  const [isBooting, setIsBooting] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [statusFilter, setStatusFilter] = useState<string>('');

  const load = useCallback(async () => {
    // No recargar si ya está cargando
    if (isLoading) {
      return;
    }
    
    setError(null);
    setIsLoading(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        window.location.href = '/login?returnTo=/admin/pagos';
        return;
      }
      // Forzar recarga sin caché usando timestamp único y parámetro de caché
      const timestamp = Date.now();
      const url = `/api/admin/payments/offline/list?limit=200${statusFilter ? `&status=${encodeURIComponent(statusFilter)}` : ''}&t=${timestamp}&_nocache=${timestamp}`;
      const res = await fetch(url, {
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error('[ADMIN PAGOS] Error cargando pagos:', { status: res.status, json });
        throw new Error(json?.error || `No se pudieron cargar pagos offline (${res.status}).`);
      }
      const sessions = (json?.sessions ?? []) as any[];
      console.log('[ADMIN PAGOS] Pagos cargados:', { count: sessions.length });
      
      setRows(sessions);
    } catch (e: unknown) {
      console.error(e);
      setRows([]);
      setError(e instanceof Error ? e.message : 'No se pudieron cargar pagos offline.');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, isLoading]);

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      try {
        setIsBooting(true);
        console.log('[ADMIN PAGOS] Iniciando carga inicial...');
        await load();
        console.log('[ADMIN PAGOS] Carga inicial completada');
      } catch (err) {
        console.error('[ADMIN PAGOS] Error en carga inicial:', err);
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Error al cargar datos iniciales');
        }
      } finally {
        if (!cancelled) {
          setIsBooting(false);
          console.log('[ADMIN PAGOS] Boot completado');
        }
      }
    };
    void boot();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const labelMethod = (m: string) => {
    if (m === 'bank_transfer') return 'Transferencia';
    if (m === 'bank_deposit') return 'Depósito bancario';
    if (m === 'oxxo') return 'OXXO';
    return m || '—';
  };

  const fmtDateTime = (d: any) => {
    if (!d) return '—';
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return '—';
    return dt.toLocaleString('es-MX', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const countLabel = useMemo(() => (isLoading ? 'Cargando…' : `${rows.length} pagos offline`), [isLoading, rows.length]);

  const renderStatus = (raw: any) => {
    const s = String(raw || '').trim().toLowerCase();
    if (s === 'paid') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-green-500 to-emerald-600 px-4 py-1.5 text-xs font-bold text-white shadow-md">
          <span>✅</span>
          Pagado
        </span>
      );
    }
    if (s === 'cancelled' || s === 'canceled' || s === 'refunded') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-red-500 to-rose-600 px-4 py-1.5 text-xs font-bold text-white shadow-md">
          <span>❌</span>
          Cancelado
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-600 px-4 py-1.5 text-xs font-bold text-white shadow-md">
        <span>⏳</span>
        Pendiente
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header moderno */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-600 via-pink-600 to-rose-600 p-8 shadow-xl">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="rounded-xl bg-white/20 backdrop-blur-sm p-3">
              <span className="text-3xl">💳</span>
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Pagos Offline</h1>
              <p className="mt-1 text-sm text-white/90">
                Gestión de operaciones, retiros del vendedor, liberación de fondos, reembolsos y penalizaciones.
              </p>
            </div>
          </div>
        </div>
        <div className="absolute inset-0 bg-gradient-to-br from-black/10 to-transparent"></div>
      </div>

      {/* Contenido principal */}
      <div className="rounded-2xl bg-white shadow-lg border border-gray-100 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
          <div className="flex flex-wrap gap-2">
            <Link 
              href="/admin/metricas" 
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:from-blue-600 hover:to-cyan-700 transition-all"
            >
              <span>📊</span>
              Métricas
            </Link>
            <Link 
              href="/admin/negocio" 
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:from-emerald-600 hover:to-teal-700 transition-all"
            >
              <span>⚙️</span>
              Negocio
            </Link>
            <button
              type="button"
              onClick={load}
              disabled={isLoading}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-gray-600 to-gray-700 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:from-gray-700 hover:to-gray-800 transition-all disabled:opacity-60"
            >
              <span>🔄</span>
              {isLoading ? 'Actualizando...' : 'Actualizar'}
            </button>
          </div>
        </div>

        {error ? (
          <div className="mb-6 rounded-xl border-l-4 border-red-500 bg-red-50/80 backdrop-blur-sm px-5 py-4 shadow-md">
            <div className="flex items-start gap-3">
              <span className="text-2xl">⚠️</span>
              <div className="flex-1">
                <div className="font-bold text-red-900">Error</div>
                <div className="mt-1 text-sm text-red-800">{error}</div>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    void load();
                  }}
                  className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 transition"
                >
                  Reintentar
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Filtros modernos */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-700">Filtros:</span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setStatusFilter('')}
                className={`rounded-lg px-4 py-2 text-xs font-bold transition-all ${
                  !statusFilter
                    ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg scale-105'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('pending')}
                className={`rounded-lg px-4 py-2 text-xs font-bold transition-all ${
                  statusFilter === 'pending'
                    ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg scale-105'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                ⏳ Pendientes
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('paid')}
                className={`rounded-lg px-4 py-2 text-xs font-bold transition-all ${
                  statusFilter === 'paid'
                    ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg scale-105'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                ✅ Pagados
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('cancelled')}
                className={`rounded-lg px-4 py-2 text-xs font-bold transition-all ${
                  statusFilter === 'cancelled'
                    ? 'bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-lg scale-105'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                ❌ Cancelados
              </button>
            </div>
          </div>
          <div className="text-sm font-bold text-gray-700 bg-gray-50 px-4 py-2 rounded-lg">
            {countLabel}
          </div>
        </div>

        {isBooting ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-purple-600 border-t-transparent"></div>
              <p className="mt-4 text-sm font-semibold text-gray-600">Cargando pagos...</p>
            </div>
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gradient-to-br from-gray-50 to-gray-100 px-8 py-12 text-center">
            <div className="text-5xl mb-4">💳</div>
            <div className="text-lg font-bold text-gray-900 mb-2">Aún no hay pagos offline registrados</div>
            <div className="text-sm text-gray-600">
              Nota: para generar referencias necesitas ejecutar `supabase_checkout_sessions_offline.sql`.
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
            <div className="overflow-x-auto">
              <table className="min-w-[1500px] w-full divide-y divide-gray-200">
                <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700">Referencia</th>
                  <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700">Producto</th>
                  <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700">Fecha compra</th>
                  <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700">Fecha pago</th>
                  <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700">Método</th>
                  <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700">Pagaron</th>
                  <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700">Comisión</th>
                  <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700">Envío</th>
                  <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700">Sobra</th>
                  <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700">Buyer</th>
                  <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700">Estado</th>
                  <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wider text-gray-700">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {rows.map((r) => (
                  <tr key={String(r?.id)} className="hover:bg-gradient-to-r hover:from-purple-50/50 hover:to-pink-50/50 transition-all">
                    <td className="px-6 py-4">
                      <div className="text-sm font-bold text-gray-900">{String(r?.reference_code || '—')}</div>
                      <div className="mt-1 text-xs font-mono text-gray-500">{String(r?.id || '').slice(0, 8)}…</div>
                    </td>
                    <td className="px-4 py-4">
                      {(() => {
                        const products = Array.isArray((r as any)?.products) ? ((r as any).products as any[]) : [];
                        const productsCount = Number((r as any)?.products_count ?? products.length) || products.length;
                        const primary = (r as any)?.first_product || products[0] || null;
                        const primaryListingId = String(primary?.listing_id || '').trim();
                        const primaryTitle = String(primary?.title || '').trim();
                        const ordersCount = Number((r as any)?.orders_count ?? 0) || 0;

                        const renderItem = (p: any, idx: number) => {
                          const lid = String(p?.listing_id || '').trim();
                          const title = String(p?.title || '').trim() || `Producto ${idx + 1}`;
                          if (lid) {
                            return (
                              <Link
                                key={`${lid}-${idx}`}
                                href={`/listings/${lid}`}
                                target="_blank"
                                className="block rounded-lg px-2 py-1 text-xs font-semibold text-brand-pink hover:bg-pink-50 hover:underline"
                              >
                                {title}
                              </Link>
                            );
                          }
                          return (
                            <div key={`t-${idx}`} className="rounded-lg px-2 py-1 text-xs font-semibold text-gray-900">
                              {title}
                            </div>
                          );
                        };

                        return (
                          <div className="space-y-1">
                            {primaryTitle || primaryListingId ? (
                              primaryListingId ? (
                                <Link
                                  href={`/listings/${primaryListingId}`}
                                  target="_blank"
                                  className="text-sm font-semibold text-brand-pink hover:underline"
                                >
                                  {primaryTitle || 'Ver producto'}
                                </Link>
                              ) : (
                                <div className="text-sm font-semibold text-gray-900">{primaryTitle || 'Producto'}</div>
                              )
                            ) : (
                              <div className="text-xs text-gray-600">—</div>
                            )}

                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
                              <span>
                                Órdenes: <span className="font-semibold text-gray-700">{ordersCount}</span>
                              </span>

                              {productsCount > 1 ? (
                                <details className="group relative">
                                  <summary className="cursor-pointer select-none font-semibold text-gray-600 hover:text-brand-pink">
                                    Ver productos ({productsCount})
                                  </summary>
                                  <div className="absolute left-0 z-20 mt-2 w-80 rounded-2xl bg-white p-3 shadow-lg ring-1 ring-black/10">
                                    <div className="text-xs font-semibold text-gray-900">Productos</div>
                                    <div className="mt-2 grid gap-1">{products.slice(0, 20).map(renderItem)}</div>
                                    {productsCount > 20 ? (
                                      <div className="mt-2 text-[11px] text-gray-500">Mostrando 20 de {productsCount}…</div>
                                    ) : null}
                                  </div>
                                </details>
                              ) : null}
                            </div>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-700">{fmtDateTime((r as any)?.created_at)}</td>
                    <td className="px-6 py-4 text-xs text-gray-700">
                      <div className="font-semibold">{fmtDateTime((r as any)?.paid_confirmed_at)}</div>
                      {(r as any)?.paid_confirmed_by_name && (
                        <div className="mt-1 text-[10px] text-gray-500">
                          Por: <span className="font-bold text-gray-700">{(r as any).paid_confirmed_by_name}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center rounded-lg bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-800">
                        {labelMethod(String(r?.payment_method || ''))}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-gray-900">{Number(r?.amount ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}</td>
                    <td className="px-6 py-4 text-xs font-semibold text-gray-700">{Number((r as any)?.commission_total ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}</td>
                    <td className="px-6 py-4 text-xs font-semibold text-gray-700">{Number((r as any)?.shipping_total ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}</td>
                    <td className="px-6 py-4 text-sm font-extrabold text-gray-900">{Number((r as any)?.net_total ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}</td>
                    <td className="px-6 py-4">
                      <span className="font-mono text-xs text-gray-600">{String(r?.buyer_id || '').slice(0, 8)}…</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-2">
                        {renderStatus(r?.status)}
                        {(() => {
                          const payment = r as any;
                          const orderIds = payment?.order_ids || [];
                          if (orderIds.length > 0) {
                            const relatedOrder = orders.find(o => orderIds.includes(o.id));
                            if (relatedOrder) {
                              return (
                                <Link
                                  href={`/admin/operations?orderId=${relatedOrder.id}`}
                                  className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-800 hover:bg-blue-100 transition"
                                  title={`Ver orden ${relatedOrder.id.slice(0, 8)}`}
                                >
                                  <span>📦</span>
                                  Orden
                                </Link>
                              );
                            }
                          }
                          return null;
                        })()}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex flex-nowrap justify-end gap-2">
                        <Link
                          href={`/pago/${String(r?.id || '').trim()}`}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-slate-600 to-slate-700 px-3 py-1.5 text-xs font-semibold text-white shadow-md hover:from-slate-700 hover:to-slate-800 transition-all"
                        >
                          <span>📋</span>
                          Ver hoja
                        </Link>
                        {(() => {
                          const payment = r as any;
                          const orderIds = payment?.order_ids || [];
                          if (orderIds.length > 0) {
                            const relatedOrder = orders.find(o => orderIds.includes(o.id));
                            if (relatedOrder) {
                              return (
                                <Link
                                  href={`/admin/operations?paymentId=${payment.id}`}
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-md hover:from-purple-600 hover:to-indigo-700 transition-all"
                                  title="Ver operación completa"
                                >
                                  <span>🔗</span>
                                  Ver completo
                                </Link>
                              );
                            }
                          }
                          return null;
                        })()}
                        {String((r as any)?.payment_proof_url || '').trim() ? (
                          <a
                            href={String((r as any)?.payment_proof_url || '').trim()}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-pink-500 to-rose-600 px-3 py-1.5 text-xs font-semibold text-white shadow-md hover:from-pink-600 hover:to-rose-700 transition-all"
                            title="Ver comprobante subido por el comprador"
                          >
                            <span>📄</span>
                            Ver ticket
                          </a>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-500"
                            title="Aún no hay comprobante"
                          >
                            <span>📭</span>
                            Sin ticket
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}

