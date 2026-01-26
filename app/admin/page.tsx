'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAdminContext } from '@/lib/admin/AdminContext';

type Summary = {
  ok?: boolean;
  disputes_open: number;
  payments_offline_pending: number;
  orders_today: number;
  orders_paid_pending_ship: number;
  payouts_sellers_to_release: number;
  profiles_count: number;
  listings_active: number;
  support_unread_estimate: number;
  estafeta_paid_pending_guide: number;
  estafeta_paid_today: number;
  recent_events_count?: number;
  pending_events_count?: number;
  urgent_events_count?: number;
};

type QuickLink = { label: string; href: string; desc: string; badge?: number };

export default function AdminDashboardPage() {
  const { alerts, metrics: contextMetrics, refreshAll } = useAdminContext();
  const [isBooting, setIsBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setError(null);
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        if (!token) {
          window.location.href = '/login?returnTo=/admin';
          return;
        }
        const res = await fetch('/api/admin/dashboard/summary', {
          headers: { authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const json = (await res.json().catch(() => ({}))) as Summary & { error?: string };
        if (!res.ok) throw new Error(json?.error || 'No se pudo cargar el resumen.');
        if (!cancelled) {
          setSummary(json);
          // Actualizar contexto compartido
          await refreshAll();
        }
      } catch (e: unknown) {
        console.error(e);
        if (!cancelled) setError(e instanceof Error ? e.message : 'No se pudo cargar el resumen.');
      } finally {
        if (!cancelled) setIsBooting(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [refreshAll]);

  const s = summary ?? contextMetrics ?? null;
  const hasAlerts =
    s &&
    (s.disputes_open > 0 ||
      s.payments_offline_pending > 0 ||
      s.orders_paid_pending_ship > 0 ||
      s.payouts_sellers_to_release > 0 ||
      (s.estafeta_paid_pending_guide ?? 0) > 0);
  
  // Usar alertas del contexto si están disponibles
  const criticalAlerts = alerts.filter(a => a.type === 'critical').slice(0, 5);
  const warningAlerts = alerts.filter(a => a.type === 'warning').slice(0, 5);

  const kpis = [
    { label: 'Supervisión', value: 'Ver todo', href: '/admin/supervision' },
    { label: 'Disputas abiertas', value: s?.disputes_open ?? '—', href: '/admin/disputas', alert: (s?.disputes_open ?? 0) > 0 },
    {
      label: 'Pagos offline pendientes',
      value: s?.payments_offline_pending ?? '—',
      href: '/admin/pagos',
      alert: (s?.payments_offline_pending ?? 0) > 0,
      highlight: (s?.payments_offline_pending ?? 0) > 0,
    },
    { label: 'Órdenes hoy', value: s?.orders_today ?? '—', href: '/admin/logistica' },
    {
      label: 'Por enviar (paid)',
      value: s?.orders_paid_pending_ship ?? '—',
      href: '/admin/logistica?status=paid',
      alert: (s?.orders_paid_pending_ship ?? 0) > 0,
    },
    {
      label: 'Vendedores por liberar pago',
      value: s?.payouts_sellers_to_release ?? '—',
      href: '/admin/metricas',
      alert: (s?.payouts_sellers_to_release ?? 0) > 0,
    },
    { label: 'Usuarios', value: s?.profiles_count ?? '—', href: '/admin/usuarios' },
    { label: 'Publicaciones activas', value: s?.listings_active ?? '—', href: '/admin/listings' },
    {
      label: 'Soporte abierto',
      value: s?.support_unread_estimate ?? '—',
      href: '/admin/soporte',
      alert: (s?.support_unread_estimate ?? 0) > 0,
    },
    {
      label: 'Estafeta: pagadas sin guía',
      value: s?.estafeta_paid_pending_guide ?? '—',
      href: '/admin/estafeta?status=paid',
      alert: (s?.estafeta_paid_pending_guide ?? 0) > 0,
    },
    {
      label: 'Estafeta: acreditaciones hoy',
      value: s?.estafeta_paid_today ?? '—',
      href: '/admin/estafeta',
    },
    {
      label: 'Eventos hoy',
      value: s?.recent_events_count ?? '—',
      href: '/admin/supervision',
      alert: (s?.recent_events_count ?? 0) > 0,
    },
    {
      label: 'Eventos urgentes',
      value: s?.urgent_events_count ?? '—',
      href: '/admin/supervision',
      alert: (s?.urgent_events_count ?? 0) > 0,
      highlight: (s?.urgent_events_count ?? 0) > 0,
    },
  ];

  const quickLinks: QuickLink[] = [
    { label: 'Supervisión', href: '/admin/supervision', desc: 'Pagos, compras, ventas, disputas, envíos y cobros en un solo lugar' },
    { label: 'Métricas y payouts', href: '/admin/metricas', desc: 'Ventas, comisiones, liberar pagos a vendedores' },
    { label: 'Usuarios', href: '/admin/usuarios', desc: 'Gestión, suspender, verificar, ver operaciones' },
    { label: 'Logística', href: '/admin/logistica', desc: 'Órdenes, etiquetas, envíos' },
    { label: 'Pagos offline', href: '/admin/pagos', desc: 'Confirmar transferencias, OXXO, depósitos' },
    { label: 'Disputas', href: '/admin/disputas', desc: 'Resolver conflictos comprador / vendedor' },
    { label: 'Devoluciones', href: '/admin/devoluciones', desc: 'Devoluciones y guías' },
    { label: 'Publicaciones', href: '/admin/listings', desc: 'Listados, moderación' },
    { label: 'Soporte', href: '/admin/soporte', desc: 'Conversaciones de ayuda' },
    { label: 'Tienda Estafeta', href: '/admin/estafeta', desc: 'Cotizaciones y guías Estafeta' },
    { label: 'Correo', href: '/admin/correo', desc: 'Bandeja y envío de correos' },
    { label: 'Banners y avisos', href: '/admin/banners', desc: 'Contenido destacado' },
    { label: 'Mensajes flotantes', href: '/admin/mensajes-flotantes', desc: 'Popups por sección' },
    { label: 'Configuración', href: '/admin/settings', desc: 'Comisión, envíos, negocio' },
  ];

  return (
    <div className="space-y-6">
      {/* Header moderno */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 p-8 shadow-xl">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="rounded-xl bg-white/20 backdrop-blur-sm p-3">
              <span className="text-3xl">📊</span>
            </div>
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-white">Panel de Supervisión</h1>
              <p className="mt-1 text-sm text-white/90">
                Resumen operativo para autoadministrar la plataforma. Revisa alertas y accede a cada sección desde aquí.
              </p>
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-xl bg-white/20 backdrop-blur-sm px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/30 transition"
            >
              🔄 Actualizar
            </button>
          </div>
        </div>
        <div className="absolute inset-0 bg-gradient-to-br from-black/10 to-transparent"></div>
      </div>

      {/* Contenido principal */}
      <div className="rounded-2xl bg-white shadow-lg border border-gray-100 p-6">
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

        {isBooting ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent"></div>
              <p className="mt-4 text-sm font-semibold text-gray-600">Cargando...</p>
            </div>
          </div>
        ) : (
          <>
          {(hasAlerts || criticalAlerts.length > 0 || warningAlerts.length > 0) && (
            <div className="mt-6 space-y-3">
              {criticalAlerts.length > 0 && (
                <div className="rounded-2xl border-2 border-red-300 bg-red-50 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-bold text-red-900">
                      <span>🚨</span>
                      {criticalAlerts.length} alerta(s) crítica(s) requiere(n) atención inmediata
                    </div>
                    <Link
                      href="/admin/alerts?type=critical"
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700"
                    >
                      Ver todas →
                    </Link>
                  </div>
                  <div className="mt-2 space-y-1">
                    {criticalAlerts.slice(0, 3).map((alert) => (
                      <Link
                        key={alert.id}
                        href={alert.actionUrl}
                        className="block rounded-lg bg-white/80 px-3 py-2 text-xs hover:bg-white"
                      >
                        <div className="font-semibold text-red-900">{alert.title}</div>
                        <div className="text-red-700">{alert.description}</div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              {warningAlerts.length > 0 && criticalAlerts.length === 0 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                      <span>⚠️</span>
                      {warningAlerts.length} alerta(s) que requieren revisión
                    </div>
                    <Link
                      href="/admin/alerts?type=warning"
                      className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700"
                    >
                      Ver todas →
                    </Link>
                  </div>
                </div>
              )}
              {hasAlerts && criticalAlerts.length === 0 && warningAlerts.length === 0 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                    <span aria-hidden>⚠️</span>
                    Acciones requeridas — Revisa disputas, pagos pendientes, envíos, Estafeta (guías) o liberación de pagos.
                  </div>
                </div>
              )}
            </div>
          )}

            <div className="mb-8">
              <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-4">Indicadores Rápidos</h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4">
                {kpis.map((k) => {
                  const isHighlighted = (k as any).highlight;
                  return (
                    <Link
                      key={k.label}
                      href={k.href}
                      className={`group relative overflow-hidden rounded-xl border-2 p-5 shadow-lg transition-all hover:scale-105 hover:shadow-xl ${
                        isHighlighted
                          ? 'border-purple-500 bg-gradient-to-br from-purple-50 via-pink-50 to-rose-50 ring-2 ring-purple-500/30'
                          : k.alert
                            ? 'border-amber-400 bg-gradient-to-br from-amber-50 to-orange-50 ring-2 ring-amber-400/30'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <div className={`text-3xl font-extrabold mb-2 ${
                        isHighlighted 
                          ? 'bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent' 
                          : 'text-gray-900'
                      }`}>
                        {String(k.value)}
                      </div>
                      <div className={`text-xs font-bold ${isHighlighted ? 'text-gray-800' : k.alert ? 'text-amber-900' : 'text-gray-700'}`}>
                        {k.label}
                      </div>
                      <div className={`mt-2 text-[10px] font-semibold ${
                        isHighlighted 
                          ? 'text-purple-600' 
                          : k.alert 
                            ? 'text-amber-600' 
                            : 'text-gray-400'
                      }`}>
                        {isHighlighted ? '⚡ Acción requerida →' : 'Ver →'}
                      </div>
                      {isHighlighted && (
                        <div className="absolute top-2 right-2">
                          <span className="inline-flex items-center rounded-full bg-purple-600 px-2 py-0.5 text-[10px] font-bold text-white">
                            ⚠️
                          </span>
                        </div>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>

            <div className="mb-6">
              <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-4">Navegación Rápida</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {quickLinks.map((q) => (
                  <Link
                    key={q.href}
                    href={q.href}
                    className={`group relative overflow-hidden flex items-start gap-4 rounded-xl border-2 p-5 shadow-md transition-all hover:scale-[1.02] hover:shadow-xl ${
                      q.badge && q.badge > 0
                        ? 'border-purple-400 bg-gradient-to-br from-purple-50 via-pink-50 to-rose-50 ring-2 ring-purple-400/30 hover:ring-purple-500/40'
                        : 'border-gray-200 bg-white hover:border-purple-300 hover:bg-gradient-to-br hover:from-purple-50/50 hover:to-pink-50/50'
                    }`}
                  >
                    <div className="rounded-lg bg-gradient-to-br from-purple-500 to-pink-600 p-2.5 shadow-md group-hover:scale-110 transition-transform">
                      <span className="text-xl">📋</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`font-bold text-sm ${q.badge && q.badge > 0 ? 'text-purple-700' : 'text-gray-900'}`}>
                          {q.label}
                        </div>
                        {q.badge && q.badge > 0 ? (
                          <span className="inline-flex items-center rounded-full bg-gradient-to-r from-purple-600 to-pink-600 px-2.5 py-0.5 text-xs font-bold text-white shadow-md">
                            {q.badge}
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-gray-600 leading-relaxed">{q.desc}</div>
                    </div>
                    <span className={`text-xl font-bold transition-transform group-hover:translate-x-1 ${
                      q.badge && q.badge > 0 ? 'text-purple-600' : 'text-gray-400'
                    }`}>→</span>
                  </Link>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
