'use client';

// Página de alertas unificadas

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAdminContext } from '@/lib/admin/AdminContext';
import { groupAlerts } from '@/lib/admin/alerts';

function AlertsContent() {
  const searchParams = useSearchParams();
  const { alerts, refreshAll } = useAdminContext();
  const [mounted, setMounted] = useState(false);
  
  const typeFilter = searchParams?.get('type') || 'all';
  
  useEffect(() => {
    setMounted(true);
    void refreshAll();
  }, [refreshAll]);
  
  if (!mounted) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-pink"></div>
      </div>
    );
  }
  
  const filteredAlerts = typeFilter === 'all'
    ? alerts
    : typeFilter === 'critical'
    ? alerts.filter(a => a.type === 'critical')
    : alerts.filter(a => a.type === 'warning');
  
  const grouped = groupAlerts(filteredAlerts);
  const criticalCount = alerts.filter(a => a.type === 'critical').length;
  const warningCount = alerts.filter(a => a.type === 'warning').length;
  
  return (
    <div className="rounded-3xl bg-white/80 p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Alertas del Sistema</h1>
          <p className="mt-1 text-sm text-gray-600">
            Todas las alertas que requieren atención en la plataforma
          </p>
        </div>
        <Link
          href="/admin"
          className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-black/5 hover:bg-gray-50"
        >
          ← Dashboard
        </Link>
      </div>
      
      {/* Filtros */}
      <div className="mt-6 flex flex-wrap gap-2">
        <Link
          href="/admin/alerts"
          className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
            typeFilter === 'all'
              ? 'bg-brand-pink text-white shadow-sm'
              : 'bg-white text-gray-700 shadow-sm ring-1 ring-black/5 hover:bg-gray-50'
          }`}
        >
          Todas ({alerts.length})
        </Link>
        <Link
          href="/admin/alerts?type=critical"
          className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
            typeFilter === 'critical'
              ? 'bg-red-600 text-white shadow-sm'
              : 'bg-white text-gray-700 shadow-sm ring-1 ring-black/5 hover:bg-gray-50'
          }`}
        >
          Críticas ({criticalCount})
        </Link>
        <Link
          href="/admin/alerts?type=warning"
          className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
            typeFilter === 'warning'
              ? 'bg-amber-500 text-white shadow-sm'
              : 'bg-white text-gray-700 shadow-sm ring-1 ring-black/5 hover:bg-gray-50'
          }`}
        >
          Advertencias ({warningCount})
        </Link>
      </div>
      
      {/* Lista de alertas */}
      {filteredAlerts.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-green-200 bg-green-50 px-6 py-8 text-center">
          <div className="text-4xl mb-3">✅</div>
          <div className="text-lg font-semibold text-green-900">No hay alertas pendientes</div>
          <div className="mt-1 text-sm text-green-700">Todo está en orden</div>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {grouped.map((group) => (
            <div key={group.category} className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold uppercase tracking-wide text-gray-600">
                  {group.category === 'payment' ? '💰 Pagos' :
                   group.category === 'order' ? '📦 Órdenes' :
                   group.category === 'logistics' ? '🚚 Logística' :
                   group.category === 'dispute' ? '⚖️ Disputas' :
                   group.category === 'support' ? '💬 Soporte' :
                   group.category}
                </h3>
                <span className="text-xs font-semibold text-gray-500">
                  {group.items.length} alerta(s) · Prioridad: {group.totalPriority}
                </span>
              </div>
              <div className="space-y-2">
                {group.items.map((alert) => (
                  <Link
                    key={alert.id}
                    href={alert.actionUrl}
                    className={`block rounded-lg border p-3 transition hover:shadow-md ${
                      alert.type === 'critical'
                        ? 'border-red-300 bg-red-50 hover:bg-red-100'
                        : alert.type === 'warning'
                        ? 'border-amber-300 bg-amber-50 hover:bg-amber-100'
                        : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className={`font-semibold ${
                          alert.type === 'critical' ? 'text-red-900' :
                          alert.type === 'warning' ? 'text-amber-900' :
                          'text-gray-900'
                        }`}>
                          {alert.title}
                        </div>
                        <div className={`mt-1 text-sm ${
                          alert.type === 'critical' ? 'text-red-700' :
                          alert.type === 'warning' ? 'text-amber-700' :
                          'text-gray-700'
                        }`}>
                          {alert.description}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {alert.relatedIds.orderId && (
                            <span className="rounded-md bg-white/80 px-2 py-0.5 text-xs font-semibold text-gray-700">
                              Orden: {alert.relatedIds.orderId.slice(0, 8)}
                            </span>
                          )}
                          {alert.relatedIds.paymentId && (
                            <span className="rounded-md bg-white/80 px-2 py-0.5 text-xs font-semibold text-gray-700">
                              Pago: {alert.relatedIds.paymentId.slice(0, 8)}
                            </span>
                          )}
                          {alert.relatedIds.disputeId && (
                            <span className="rounded-md bg-white/80 px-2 py-0.5 text-xs font-semibold text-gray-700">
                              Disputa: {alert.relatedIds.disputeId.slice(0, 8)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-xs font-bold ${
                          alert.type === 'critical' ? 'text-red-600' :
                          alert.type === 'warning' ? 'text-amber-600' :
                          'text-gray-600'
                        }`}>
                          P{alert.priority}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          {new Date(alert.createdAt).toLocaleDateString('es-MX', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AlertsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-pink"></div>
      </div>
    }>
      <AlertsContent />
    </Suspense>
  );
}
