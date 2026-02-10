'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAdminContext } from '@/lib/admin/AdminContext';
import { ContextualNavigation } from '@/components/admin/ContextualNavigation';
import { CopyButton } from '@/components/ui/CopyButton';

type Tab = 'orders' | 'topups';

export default function AdminPagosPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500">Cargando pagos...</div>}>
      <AdminPagosContent />
    </Suspense>
  );
}

function AdminPagosContent() {
  const { orders, refreshPayments, refreshOrders } = useAdminContext();
  const searchParams = useSearchParams();
  // Unificamos en una sola vista
  const [isBooting, setIsBooting] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Combined State
  const [allOperations, setAllOperations] = useState<Array<Record<string, unknown>>>([]);

  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get('status') || '');
  
  useEffect(() => {
    const s = searchParams.get('status');
    if (s !== null) setStatusFilter(s);
  }, [searchParams]);

  const [searchTerm, setSearchTerm] = useState(''); // Estado para búsqueda
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());


  // Filtrado cliente-side unificado
  const filteredOperations = useMemo(() => {
    let result = allOperations;

    // 1. Filtrar por status
    if (statusFilter) {
      if (statusFilter === 'paid' || statusFilter === 'approved') {
        result = result.filter(r => {
           const s = String(r.status || '').toLowerCase();
           return s === 'paid' || s === 'approved';
        });
      } else if (statusFilter === 'pending') {
        result = result.filter(r => {
           const s = String(r.status || '').toLowerCase();
           return s === 'pending' || s === 'pending_approval';
        });
      } else {
         // Otros filtros específicos si los hubiera
         result = result.filter(r => String(r.status || '').toLowerCase() === statusFilter);
      }
    }

    // 2. Filtrar por search term
    if (!searchTerm.trim()) return result;
    const term = searchTerm.toLowerCase().trim();
    
    return result.filter((r) => {
      const type = (r as any)._type || ''; // 'order' | 'topup'
      const pid = String(r?.id || '').toLowerCase();
      const status = String(r?.status || '').toLowerCase();
      
      if (type === 'order') {
        const ref = String(r?.reference_code || '').toLowerCase();
        const buyerEmail = String((r as any)?.buyer_email || '').toLowerCase();
        return (
          pid.includes(term) ||
          ref.includes(term) ||
          buyerEmail.includes(term) ||
          status.includes(term)
        );
      } else {
        // topup
        const pref = String((r as any)?.mercadopago_preference_id || '').toLowerCase();
        const user = (r as any)?.user;
        const email = String(user?.email || '').toLowerCase();
        const name = String(user?.full_name || '').toLowerCase();
        return (
          pid.includes(term) ||
          pref.includes(term) ||
          email.includes(term) ||
          name.includes(term) ||
          status.includes(term)
        );
      }
    });
  }, [allOperations, searchTerm, statusFilter]);

  const [profiles, setProfiles] = useState<Record<string, any>>({});

  const load = useCallback(async () => {
    if (isLoading) return;
    
    setError(null);
    setIsLoading(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        window.location.href = '/login?returnTo=/admin/pagos';
        return;
      }

      // Cargar Orders
      const ordersUrl = `/api/admin/payments/offline/list?limit=200`; // Traemos todo y filtramos en cliente para unificar
      const resOrders = await fetch(ordersUrl, {
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const jsonOrders = await resOrders.json().catch(() => ({}));
      const ordersList = ((jsonOrders?.sessions ?? []) as any[]).map(o => ({ ...o, _type: 'order' }));

      // Cargar Topups
      const topupsUrl = `/api/admin/wallet/topups/list?limit=100`;
      const resTopups = await fetch(topupsUrl, {
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const jsonTopups = await resTopups.json().catch(() => ({}));
      const topupsList = ((jsonTopups?.topups ?? []) as any[]).map(t => ({ ...t, _type: 'topup' }));

      // Combinar y ordenar por fecha descendente
      const combined = [...ordersList, ...topupsList].sort((a, b) => {
        const da = new Date(a.created_at).getTime();
        const db = new Date(b.created_at).getTime();
        return db - da;
      });

      setAllOperations(combined);

      // Fetch Profiles using Sync API to ensure completeness
      const userIds = new Set<string>();
      combined.forEach(op => {
        if (op._type === 'order' && op.buyer_id) userIds.add(op.buyer_id);
        if (op._type === 'topup' && op.user_id) userIds.add(op.user_id);
      });

      if (userIds.size > 0) {
        const syncRes = await fetch('/api/admin/users/sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ userIds: Array.from(userIds) })
        });
        
        const syncJson = await syncRes.json();
        
        if (syncJson.profiles) {
          const map: Record<string, any> = {};
          syncJson.profiles.forEach((p: any) => {
            map[p.id] = p;
          });
          setProfiles(map);

          // Notification for data integrity restoration
          if (syncJson.restoredCount > 0) {
            // Non-intrusive notification via console or custom toast logic if available
            console.log(`✅ Integridad de datos restaurada: Se recuperaron ${syncJson.restoredCount} perfiles faltantes.`);
          }
        }
      }

    } catch (e: unknown) {
      console.error(e);
      setAllOperations([]);
      setError(e instanceof Error ? e.message : 'No se pudieron cargar datos.');
    } finally {
      setIsLoading(false);
    }
  }, []); // Remove dependencies to avoid loops, called on mount/refresh

  // Efecto inicial
  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      try {
        setIsBooting(true);
        await load();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Error al cargar datos iniciales');
        }
      } finally {
        if (!cancelled) {
          setIsBooting(false);
        }
      }
    };
    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  const fmtDateTime = (d: any) => {
    if (!d) return '—';
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return '—';
    return dt.toLocaleString('es-MX', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const countLabel = useMemo(() => {
    if (isLoading) return 'Cargando…';
    return `${filteredOperations.length} operaciones`;
  }, [isLoading, filteredOperations.length]);


  const renderStatus = (raw: any) => {
    const s = String(raw || '').trim().toLowerCase();
    if (s === 'paid' || s === 'approved') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-green-500 to-emerald-600 px-4 py-1.5 text-xs font-bold text-white shadow-md">
          <span>✅</span>
          {s === 'approved' ? 'Aprobado' : 'Pagado'}
        </span>
      );
    }
    if (s === 'cancelled' || s === 'canceled' || s === 'refunded' || s === 'rejected') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-red-500 to-rose-600 px-4 py-1.5 text-xs font-bold text-white shadow-md">
          <span>❌</span>
          {s === 'rejected' ? 'Rechazado' : 'Cancelado'}
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

  // --- Actions for Orders ---
  const handleAccreditOrder = async (checkoutId: string) => {
    if (!confirm('¿Estás seguro de acreditar este pago manualmente? Esto marcará las órdenes como PAGADAS y enviará notificaciones.')) return;
    
    setProcessingIds(prev => new Set(prev).add(checkoutId));
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error('No hay sesión activa');
      const { data: { user } } = await supabase.auth.getUser();
      const adminName = user?.user_metadata?.full_name || user?.email || 'Admin';

      const res = await fetch('/api/admin/payments/offline/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ checkoutId, action: 'mark_paid', adminName })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error al acreditar');
      alert('Pago acreditado correctamente.');
      void load();
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    } finally {
      setProcessingIds(prev => { const next = new Set(prev); next.delete(checkoutId); return next; });
    }
  };

  const handleRejectOrder = async (checkoutId: string) => {
    if (!confirm('¿Estás seguro de RECHAZAR este pago?')) return;
    setProcessingIds(prev => new Set(prev).add(checkoutId));
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error('No hay sesión activa');
      const res = await fetch('/api/admin/payments/offline/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ checkoutId, action: 'cancel' })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error al rechazar');
      alert('Pago rechazado correctamente.');
      void load();
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    } finally {
      setProcessingIds(prev => { const next = new Set(prev); next.delete(checkoutId); return next; });
    }
  };

  // --- Actions for Topups ---
  const handleApproveTopup = async (topupId: string) => {
    if (!confirm('¿Estás seguro de acreditar esta recarga manualmente? Se agregará el saldo al usuario.')) return;
    setProcessingIds(prev => new Set(prev).add(topupId));
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error('No hay sesión activa');

      const res = await fetch('/api/admin/wallet/topups/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ topupId })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Error al aprobar recarga');
      alert('Recarga aprobada y saldo acreditado.');
      void load();
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    } finally {
      setProcessingIds(prev => { const next = new Set(prev); next.delete(topupId); return next; });
    }
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
              <h1 className="text-3xl font-bold text-white">Gestión de Pagos</h1>
              <p className="mt-1 text-sm text-white/90">
                Administra pagos offline de pedidos y recargas de saldo PocketCash.
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
            <div className="relative">
              <input
                type="text"
                placeholder="Buscar referencia, usuario, ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-64 rounded-xl border border-gray-300 px-4 py-2.5 pl-10 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
              <span className="absolute left-3 top-2.5 text-gray-400">🔍</span>
            </div>
            <button
              type="button"
              onClick={() => load()}
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
              </div>
            </div>
          </div>
        ) : null}

        {/* Filtros */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-700">Filtros:</span>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setStatusFilter('')} className={`rounded-lg px-4 py-2 text-xs font-bold transition-all ${!statusFilter ? 'bg-purple-600 text-white shadow-lg' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>Todos</button>
              <button onClick={() => setStatusFilter('pending')} className={`rounded-lg px-4 py-2 text-xs font-bold transition-all ${statusFilter === 'pending' ? 'bg-amber-500 text-white shadow-lg' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>⏳ Pendientes</button>
              <button onClick={() => setStatusFilter('paid')} className={`rounded-lg px-4 py-2 text-xs font-bold transition-all ${statusFilter === 'paid' || statusFilter === 'approved' ? 'bg-green-500 text-white shadow-lg' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>✅ Pagados/Aprobados</button>
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
              <p className="mt-4 text-sm font-semibold text-gray-600">Cargando...</p>
            </div>
          </div>
        ) : filteredOperations.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gradient-to-br from-gray-50 to-gray-100 px-8 py-12 text-center">
            <div className="text-5xl mb-4">🔍</div>
            <div className="text-lg font-bold text-gray-900 mb-2">No se encontraron resultados</div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
            <div className="overflow-x-auto">
              <table className="min-w-[1500px] w-full divide-y divide-gray-200">
                <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700">Tipo</th>
                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700">Referencia / ID</th>
                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700">Producto / Concepto</th>
                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700">Usuario</th>
                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700">Monto</th>
                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700">Fecha</th>
                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700">Estado</th>
                    <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wider text-gray-700">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {filteredOperations.map((r: any) => {
                    const type = r._type;
                    const isOrder = type === 'order';
                    
                    return (
                      <tr key={`${type}-${r.id}`} className={`transition-colors ${isOrder ? 'hover:bg-purple-50' : 'hover:bg-blue-50'}`}>
                        <td className="px-6 py-4">
                           {isOrder ? (
                             <span className="inline-flex items-center gap-1 rounded-md bg-purple-100 px-2 py-1 text-xs font-bold text-purple-700">
                               📦 Pedido
                             </span>
                           ) : (
                             <span className="inline-flex items-center gap-1 rounded-md bg-blue-100 px-2 py-1 text-xs font-bold text-blue-700">
                               💳 Recarga
                             </span>
                           )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5">
                            <div className="text-sm font-bold text-gray-900">
                              {isOrder ? String(r.reference_code || '—') : String(r.mercadopago_preference_id || '—').slice(0, 15) + '...'}
                            </div>
                            <CopyButton 
                              text={isOrder ? String(r.reference_code || '') : String(r.mercadopago_preference_id || '')} 
                              className="text-gray-400 hover:text-brand-pink"
                              iconSize={14}
                            />
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-gray-500 font-mono">
                            {String(r.id).slice(0, 8)}...
                            <CopyButton 
                              text={String(r.id)} 
                              className="text-gray-300 hover:text-gray-600"
                              iconSize={12}
                            />
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">
                          {isOrder ? (
                            r.first_product_id ? (
                              <Link href={`/listings/${r.first_product_slug || r.first_product_id}`} target="_blank" className="text-brand-pink hover:underline font-medium">
                                {r.first_product_title || 'Producto sin título'}
                              </Link>
                            ) : (
                              String(r.first_product_title || '—')
                            )
                          ) : 'Recarga de Saldo'}
                        </td>
                        <td className="px-6 py-4">
                          {isOrder ? (
                            <div>
                              <div className="text-sm font-bold text-gray-900">
                                {profiles[r.buyer_id]?.full_name || r.buyer_name_snapshot || (r.buyer_id ? `Usuario ${r.buyer_id.slice(0, 8)}...` : 'Usuario desconocido')}
                              </div>
                              <div className="text-xs text-gray-500">{profiles[r.buyer_id]?.email || r.buyer_email_snapshot || 'Sin email'}</div>
                              {r.buyer_id && (
                                <div className="flex items-center gap-1 text-[10px] text-gray-400 font-mono mt-0.5">
                                  ID: {r.buyer_id.slice(0, 8)}...
                                  <CopyButton text={r.buyer_id} size="sm" className="text-gray-400 hover:text-brand-pink" />
                                </div>
                              )}
                            </div>
                          ) : (
                            <div>
                              <div className="text-sm font-bold text-gray-900">
                                {profiles[r.user_id]?.full_name || r.user?.full_name || 'Usuario desconocido'}
                              </div>
                              <div className="text-xs text-gray-500">{profiles[r.user_id]?.email || r.user?.email || '—'}</div>
                              {(r.user_id || r.user?.id) && (
                                <div className="flex items-center gap-1 text-[10px] text-gray-400 font-mono mt-0.5">
                                  ID: {(r.user_id || r.user?.id).slice(0, 8)}...
                                  <CopyButton text={r.user_id || r.user?.id} size="sm" className="text-gray-400 hover:text-brand-pink" />
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm font-bold text-green-600">
                          ${Number(r.amount || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">{fmtDateTime(r.created_at)}</td>
                        <td className="px-6 py-4">{renderStatus(r.status)}</td>
                        <td className="px-6 py-4 text-right space-x-2">
                          <Link
                            href={isOrder ? `/admin/operations?paymentId=${r.id}` : `/admin/operations?topupId=${r.id}`}
                            className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-xs font-bold inline-block"
                          >
                            Ver Detalle
                          </Link>
                          {isOrder ? (
                            // Actions for Orders
                            String(r.status) === 'pending' && (
                              <>
                                <button
                                  onClick={() => handleAccreditOrder(String(r.id))}
                                  disabled={processingIds.has(String(r.id))}
                                  className="px-3 py-1 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 text-xs font-bold disabled:opacity-50"
                                >
                                  {processingIds.has(String(r.id)) ? '...' : 'Aprobar'}
                                </button>
                                <button
                                  onClick={() => handleRejectOrder(String(r.id))}
                                  disabled={processingIds.has(String(r.id))}
                                  className="px-3 py-1 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-xs font-bold disabled:opacity-50"
                                >
                                  {processingIds.has(String(r.id)) ? '...' : 'Rechazar'}
                                </button>
                              </>
                            )
                          ) : (
                            // Actions for Topups
                            <>
                                {r.metadata?.proof_url && (
                                  <a
                                    href={r.metadata.proof_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-xs font-bold inline-block"
                                  >
                                    Ver Nota
                                  </a>
                                )}
                                {(String(r.status) === 'pending' || String(r.status) === 'pending_approval') && (
                                  <button
                                    onClick={() => handleApproveTopup(String(r.id))}
                                    disabled={processingIds.has(String(r.id))}
                                    className="px-3 py-1 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 text-xs font-bold disabled:opacity-50"
                                  >
                                    {processingIds.has(String(r.id)) ? '...' : 'Aprobar'}
                                  </button>
                                )}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
