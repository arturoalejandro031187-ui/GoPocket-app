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
      } else if (type === 'topup') {
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
      } else {
        // wallet transaction
        const concept = String((r as any)?.concept || '').toLowerCase();
        const refId = String((r as any)?.reference_id || '').toLowerCase();
        return (
          pid.includes(term) ||
          concept.includes(term) ||
          refId.includes(term) ||
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

      // Cargar Wallet Transactions (Pagos con PocketCash)
      const walletUrl = `/api/admin/wallet/transactions/list?limit=200`;
      const resWallet = await fetch(walletUrl, {
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const jsonWallet = await resWallet.json().catch(() => ({}));
      const walletList = ((jsonWallet?.transactions ?? []) as any[])
        .map(t => ({ ...t, _type: 'wallet' }));

      // Combinar y ordenar por fecha descendente
      const combined = [...ordersList, ...topupsList, ...walletList].sort((a, b) => {
        const da = new Date(a.created_at).getTime();
        const db = new Date(b.created_at).getTime();
        return db - da;
      });

      setAllOperations(combined);

      // Use profiles returned from APIs (enriched server-side)
      const mergedProfiles: Record<string, any> = {};
      if (jsonOrders?.profiles) {
        Object.entries(jsonOrders.profiles).forEach(([id, p]: [string, any]) => {
          mergedProfiles[id] = p;
        });
      }
      if (jsonTopups?.profiles) {
        Object.entries(jsonTopups.profiles).forEach(([id, p]: [string, any]) => {
          if (!mergedProfiles[id]) mergedProfiles[id] = p;
        });
      }
      if (jsonWallet?.profiles) {
        Object.entries(jsonWallet.profiles).forEach(([id, p]: [string, any]) => {
          if (!mergedProfiles[id]) mergedProfiles[id] = p;
        });
      }
      setProfiles(mergedProfiles);

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


  const renderStatus = (raw: any, row?: any) => {
    const s = String(raw || '').trim().toLowerCase();

    // Check for PocketCash operations (wallet transactions)
    // User requested: "en lugar del boton amarillo un rosado que diga Pago Pocketcash"
    const isPocketCash = row?._type === 'wallet';
    const isPending = !(s === 'paid' || s === 'approved' || s === 'cancelled' || s === 'canceled' || s === 'refunded' || s === 'rejected');

    if (isPocketCash && isPending) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 px-4 py-1.5 text-xs font-bold text-white shadow-md">
          <span>💳</span>
          Pago Pocketcash
        </span>
      );
    }

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

      // Optimistic Update
      setAllOperations(prev => prev.map(op => {
        if (String(op.id) === checkoutId) {
          return { ...op, status: 'paid' };
        }
        return op;
      }));

      // No alert blocking, just background refresh
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

      // Optimistic Update
      setAllOperations(prev => prev.map(op => {
        if (String(op.id) === checkoutId) {
          return { ...op, status: 'cancelled' };
        }
        return op;
      }));

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

      // Optimistic Update
      setAllOperations(prev => prev.map(op => {
        if (String(op.id) === topupId) {
          return { ...op, status: 'approved' };
        }
        return op;
      }));

      void load();
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    } finally {
      setProcessingIds(prev => { const next = new Set(prev); next.delete(topupId); return next; });
    }
  };

  const handleCheckMpStatus = async (checkoutId: string, mpPaymentId: string | null, type: 'order' | 'topup' = 'order') => {
    setProcessingIds(prev => new Set(prev).add(checkoutId));
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error('No hay sesión activa');

      // 1. Intentar verificación automática (backend buscará por ID o referencia)
      const res = await fetch('/api/admin/payments/check-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ checkoutId, paymentId: mpPaymentId, type })
      });
      const json = await res.json();

      if (!res.ok || json.status === 'not_found' || json.status === 'not_found_in_db') {
        // Llamar al diagnóstico automáticamente para mostrar info útil
        let debugInfo = '';
        try {
          const debugRes = await fetch('/api/admin/payments/debug-mp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ sessionId: checkoutId })
          });
          const debugJson = await debugRes.json();
          if (debugJson.log) {
            const s = debugJson.log.session;
            const pasos = debugJson.log.pasos || [];
            debugInfo = `\n\n=== DIAGNÓSTICO ===` +
              `\nSession: ${s?.id || 'N/A'}` +
              `\nMétodo: ${s?.payment_method || 'N/A'}` +
              `\nEstado BD: ${s?.status || 'N/A'}` +
              `\nMP Payment ID: ${s?.mp_payment_id || 'ninguno'}` +
              `\nMP Preference: ${s?.mp_preference_id || 'ninguno'}` +
              `\nMP Status: ${s?.mp_status || 'N/A'}`;

            // Mostrar pagos recientes encontrados en MP
            const recientes = pasos.find((p: any) => p.paso === '4_recientes');
            if (recientes && recientes.results && recientes.results.length > 0) {
              debugInfo += `\n\n--- Pagos recientes en MP (${recientes.total}) ---`;
              recientes.results.slice(0, 5).forEach((p: any) => {
                debugInfo += `\n• ${p.id} | ${p.status} | $${p.transaction_amount} | ${p.payment_method_id} | ref: ${p.external_reference || 'N/A'}`;
              });
            } else {
              debugInfo += `\n\nNo se encontraron pagos recientes en MercadoPago.`;
            }
          }
        } catch (dbgErr) {
          debugInfo = '\n\n(No se pudo obtener diagnóstico adicional)';
        }

        const shouldRetry = confirm(`No se detectó el pago automáticamente.${debugInfo}\n\n¿Deseas ingresar el ID de MercadoPago manualmente?`);

        if (shouldRetry) {
          const manualId = prompt("Ingresa el ID de la transacción de MercadoPago:");

          if (manualId) {
            // Reintento con ID manual
            const res2 = await fetch('/api/admin/payments/check-status', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ checkoutId, paymentId: manualId.trim(), type })
            });
            const json2 = await res2.json();

            if (!res2.ok) {
              throw new Error(json2.message || json2.error || 'Error al verificar con ID manual');
            }

            if (json2.status === 'approved') {
              alert('¡Pago vinculado y aprobado exitosamente!');
            } else {
              alert(`Resultado con ID manual: ${json2.status} (${json2.status_detail})`);
            }
            void load();
            return;
          }
        }
        throw new Error(json.message || json.error || 'Error al verificar estado');
      }

      // Éxito automático
      if (json.status === 'approved') {
        alert('¡Pago detectado y aprobado correctamente!');
      } else {
        alert(`Estado en MercadoPago: ${json.status} (${json.status_detail})`);
      }

      void load();

    } catch (e: any) {
      alert(`Error: ${e.message}`);
    } finally {
      setProcessingIds(prev => { const next = new Set(prev); next.delete(checkoutId); return next; });
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
              <table className="min-w-[1700px] w-full divide-y divide-gray-200">
                <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700">Tipo</th>
                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700">Referencia / ID</th>
                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700">Producto / Concepto</th>
                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700">Comprador / Vendedor</th>
                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700">Envío</th>
                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700">Desglose</th>
                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700">Fecha</th>
                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-700">Estado</th>
                    <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wider text-gray-700">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {filteredOperations.map((r: any) => {
                    const type = r._type;
                    const isOrder = type === 'order';
                    const isTopup = type === 'topup';
                    const isWallet = type === 'wallet';

                    return (
                      <tr key={`${type}-${r.id}`} className={`transition-colors ${isOrder ? 'hover:bg-purple-50' : 'hover:bg-blue-50'}`}>
                        <td className="px-6 py-4">
                          {isOrder ? (
                            <div className="flex flex-col gap-1">
                              <span className="inline-flex items-center gap-1 rounded-md bg-purple-100 px-2 py-1 text-xs font-bold text-purple-700">
                                📦 Pedido
                              </span>
                              {(r as any)?.payment_method === 'mercadopago' && (
                                <span className="inline-flex items-center gap-1 rounded-md bg-sky-100 px-2 py-1 text-[10px] font-bold text-sky-700">
                                  MercadoPago
                                </span>
                              )}
                              {(r as any)?.payment_method === 'pocketcash' && (
                                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-700">
                                  💰 PocketCash
                                </span>
                              )}
                            </div>
                          ) : isWallet && (r as any)._is_order_payment ? (
                            <div className="flex flex-col gap-1">
                              <span className="inline-flex items-center gap-1 rounded-md bg-purple-100 px-2 py-1 text-xs font-bold text-purple-700">
                                📦 Pedido
                              </span>
                              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-700">
                                💰 PocketCash
                              </span>
                            </div>
                          ) : isTopup ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-blue-100 px-2 py-1 text-xs font-bold text-blue-700">
                              💳 Recarga
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-xs font-bold text-gray-600">
                              💰 Wallet
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5">
                            <div className="text-sm font-bold text-gray-900">
                              {isOrder ? String(r.reference_code || '—') : isTopup ? String(r.mercadopago_preference_id || '—').slice(0, 15) + '...' : String(r.reference_id || r.id).slice(0, 12) + '...'}
                            </div>
                            <CopyButton
                              text={isOrder ? String(r.reference_code || '') : isTopup ? String(r.mercadopago_preference_id || '') : String(r.reference_id || r.id)}
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
                        <td className="px-6 py-4 text-sm text-gray-600 max-w-xs">
                          {isOrder ? (
                            <div className="flex items-center gap-2 min-w-0">
                              {r.first_product_thumb ? (
                                <img
                                  src={String(r.first_product_thumb)}
                                  alt={String(r.first_product_title || 'Producto')}
                                  className="h-8 w-8 flex-none rounded object-cover ring-1 ring-black/10"
                                  loading="lazy"
                                  referrerPolicy="no-referrer"
                                />
                              ) : null}
                              <div className="flex flex-col truncate">
                                {r.first_product_id ? (
                                  <Link
                                    href={`/listings/${r.first_product_slug || r.first_product_id}`}
                                    target="_blank"
                                    className="text-brand-pink hover:underline font-medium truncate inline-block max-w-[420px]"
                                    title={String(r.first_product_title || '')}
                                  >
                                    {r.first_product_title || 'Producto sin título'}
                                  </Link>
                                ) : (
                                  <span className="truncate inline-block max-w-[460px]">{String(r.first_product_title || '—')}</span>
                                )}
                                <div className="flex items-center gap-1 mt-1">
                                  {(r as any).is_auction && (
                                    <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold bg-pink-100 text-pink-700 border border-pink-200">
                                      🔨 Subasta
                                    </span>
                                  )}
                                  {!(r as any).is_auction && (
                                    <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold bg-gray-100 text-gray-600 border border-gray-200">
                                      🛒 Venta Directa
                                    </span>
                                  )}
                                </div>
                                {(r as any).seller_id && profiles[(r as any).seller_id] && (
                                  <div className="text-[10px] text-gray-500 mt-0.5">
                                    Vendedor: <span className="font-semibold text-gray-700">{profiles[(r as any).seller_id]?.full_name || 'Desconocido'}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : isWallet && (r as any)._is_order_payment ? (
                            <div className="flex items-center gap-2 min-w-0">
                              {(r as any).product_thumb ? (
                                <img
                                  src={String((r as any).product_thumb)}
                                  alt={String((r as any).product_title || 'Producto')}
                                  className="h-8 w-8 flex-none rounded object-cover ring-1 ring-black/10"
                                  loading="lazy"
                                  referrerPolicy="no-referrer"
                                />
                              ) : null}
                              <div className="flex flex-col truncate">
                                {(r as any).product_id ? (
                                  <Link
                                    href={`/listings/${(r as any).product_slug || (r as any).product_id}`}
                                    target="_blank"
                                    className="text-brand-pink hover:underline font-medium truncate inline-block max-w-[420px]"
                                    title={String((r as any).product_title || '')}
                                  >
                                    {(r as any).product_title || 'Producto sin título'}
                                  </Link>
                                ) : (
                                  <span className="truncate inline-block max-w-[460px]">{String((r as any).concept || 'Pago con PocketCash')}</span>
                                )}
                                <div className="flex items-center gap-1 mt-1">
                                  {(r as any).is_auction && (
                                    <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold bg-pink-100 text-pink-700 border border-pink-200">
                                      🔨 Subasta
                                    </span>
                                  )}
                                  {!(r as any).is_auction && (r as any).product_id && (
                                    <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold bg-gray-100 text-gray-600 border border-gray-200">
                                      🛒 Venta Directa
                                    </span>
                                  )}
                                </div>
                                {(r as any).seller_id && profiles[(r as any).seller_id] && (
                                  <div className="text-[10px] text-gray-500 mt-0.5">
                                    Vendedor: <span className="font-semibold text-gray-700">{profiles[(r as any).seller_id]?.full_name || 'Desconocido'}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : isTopup ? (
                            'Recarga de Saldo'
                          ) : (
                            String(r.concept || 'Pago con PocketCash')
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {isOrder || (isWallet && (r as any)._is_order_payment) ? (
                            <div className="space-y-2">
                              {/* COMPRADOR */}
                              <div>
                                <div className="text-[10px] font-bold uppercase tracking-wider text-blue-500 mb-0.5">Comprador</div>
                                <div className="text-sm font-bold text-gray-900">
                                  {(() => {
                                    const buyerId = isOrder ? r.buyer_id : (r as any).buyer_id;
                                    return profiles[buyerId]?.full_name || (r as any).buyer_name_snapshot || (buyerId ? `Usuario ${buyerId.slice(0, 8)}...` : 'Desconocido');
                                  })()}
                                </div>
                                <div className="text-[11px] text-gray-500">
                                  {(() => {
                                    const buyerId = isOrder ? r.buyer_id : (r as any).buyer_id;
                                    return profiles[buyerId]?.email || (r as any).buyer_email_snapshot || '';
                                  })()}
                                </div>
                              </div>
                              {/* VENDEDOR */}
                              {(() => {
                                const sellerId = (r as any).seller_id;
                                if (!sellerId) return null;
                                return (
                                  <div>
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-orange-500 mb-0.5">Vendedor</div>
                                    <div className="text-sm font-semibold text-gray-800">
                                      {profiles[sellerId]?.full_name || `Vendedor ${sellerId.slice(0, 8)}...`}
                                    </div>
                                    <div className="text-[11px] text-gray-500">
                                      {profiles[sellerId]?.email || ''}
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          ) : (
                            <div>
                              {(() => {
                                const uid = r.user_id || r.wallet_id; return (
                                  <>
                                    <div className="text-sm font-bold text-gray-900">
                                      {profiles[uid]?.full_name || r.user?.full_name || (uid ? `Usuario ${uid.slice(0, 8)}...` : 'Usuario desconocido')}
                                    </div>
                                    <div className="text-xs text-gray-500">{profiles[uid]?.email || r.user?.email || 'Sin email'}</div>
                                    {uid && (
                                      <div className="flex items-center gap-1 text-[10px] text-gray-400 font-mono mt-0.5">
                                        ID: {uid.slice(0, 8)}...
                                        <CopyButton text={uid} size="sm" className="text-gray-400 hover:text-brand-pink" />
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">
                          {isOrder || (isWallet && (r as any)._is_order_payment) ? (
                            (r as any).is_digital ? (
                              <div className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-100 px-2.5 py-1 text-xs font-bold text-indigo-800 ring-1 ring-indigo-600/20 shadow-sm">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>
                                Digital
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <div className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-600/20">
                                  Total: ${Number((isOrder ? (r as any).shipping_gross_total : (r as any).shipping_fee) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                </div>
                                {isOrder && (
                                  <div className="text-[11px] text-gray-600">
                                    Comprador: <span className="font-semibold">${Number((r as any).shipping_total || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span> · Vendedor: <span className="font-semibold">${Number((r as any).shipping_subsidy_total || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                                  </div>
                                )}
                              </div>
                            )
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {isOrder || (isWallet && (r as any)._is_order_payment) ? (
                            <div className="space-y-1 min-w-[160px]">
                              {/* Subtotal */}
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-gray-500">Subtotal:</span>
                                <span className="font-semibold text-gray-800">
                                  ${Number(
                                    isOrder
                                      ? (Number(r.amount || r.orders_total || 0) - Number((r as any).shipping_gross_total || (r as any).shipping_total || 0))
                                      : ((r as any).subtotal || (Number((r as any).order_total || 0) - Number((r as any).shipping_fee || 0)))
                                  ).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                              {/* Comisión */}
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-gray-500">Comisión:</span>
                                <span className="font-semibold text-orange-600">
                                  ${Number(
                                    isOrder ? ((r as any).commission_total || 0) : ((r as any).commission_fee || 0)
                                  ).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                              {/* Envío */}
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-gray-500">Envío:</span>
                                <span className="font-semibold text-blue-600">
                                  ${Number(
                                    isOrder ? ((r as any).shipping_gross_total || (r as any).shipping_total || 0) : ((r as any).shipping_fee || 0)
                                  ).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                              {/* Neto al vendedor */}
                              {isOrder && (
                                <div className="flex justify-between items-center text-xs">
                                  <span className="text-gray-500">Neto vendedor:</span>
                                  <span className="font-semibold text-purple-600">
                                    ${Number((r as any).net_total || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                  </span>
                                </div>
                              )}
                              {/* TOTAL */}
                              <div className="flex justify-between items-center text-sm pt-1 border-t border-gray-200">
                                <span className="font-bold text-gray-700">Total:</span>
                                <span className="font-bold text-green-600">
                                  ${Number(
                                    isOrder ? (r.amount || r.orders_total || 0) : ((r as any).order_total || r.amount || 0)
                                  ).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                            </div>
                          ) : isTopup ? (
                            <div className="text-sm font-bold text-green-600">
                              ${Number(r.amount || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                            </div>
                          ) : (
                            <div className="text-sm font-bold text-green-600">
                              ${Number(r.amount || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">{fmtDateTime(r.created_at)}</td>
                        <td className="px-6 py-4">{renderStatus(r.status, r)}</td>
                        <td className="px-6 py-4 text-right space-x-2">
                          <Link
                            href={isOrder ? `/admin/operations?paymentId=${r.id}` : `/admin/operations?topupId=${r.id}`}
                            className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-xs font-bold inline-block"
                          >
                            Ver Detalle
                          </Link>
                          {isOrder ? (
                            // Actions for Orders
                            <>
                              {r.payment_proof_url && (
                                <a
                                  href={r.payment_proof_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-xs font-bold inline-block"
                                >
                                  Ver Comprobante
                                </a>
                              )}
                              {String(r.status) === 'pending' && (
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
                              )}

                              {/* Botón Verificar MP para pagos pendientes de MP */}
                              {((r as any)?.payment_method === 'mercadopago' && String(r.status) !== 'paid' && String(r.status) !== 'approved') && (
                                <button
                                  onClick={() => handleCheckMpStatus(String(r.id), (r as any)?.mp_payment_id || null, isOrder ? 'order' : 'topup')}
                                  disabled={processingIds.has(String(r.id))}
                                  className="px-3 py-1 bg-sky-100 text-sky-700 rounded-lg hover:bg-sky-200 text-xs font-bold disabled:opacity-50 flex items-center gap-1"
                                >
                                  {processingIds.has(String(r.id)) ? '...' : (
                                    <>
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
                                      Verificar MP
                                    </>
                                  )}
                                </button>
                              )}
                            </>
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
