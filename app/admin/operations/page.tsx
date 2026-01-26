'use client';

// Vista unificada de operaciones (orden + pago + disputa)

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAdminContext } from '@/lib/admin/AdminContext';
import { ContextualNavigation } from '@/components/admin/ContextualNavigation';
import { Order, CheckoutSession, Dispute } from '@/lib/types/domain.types';
import Link from 'next/link';

function OperationViewContent() {
  const searchParams = useSearchParams();
  const { orders, payments, disputes, refreshAll } = useAdminContext();
  
  const orderId = searchParams?.get('orderId');
  const paymentId = searchParams?.get('paymentId');
  const disputeId = searchParams?.get('disputeId');
  
  const [order, setOrder] = useState<Order | null>(null);
  const [payment, setPayment] = useState<CheckoutSession | null>(null);
  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      
      // Cargar datos si no están en el contexto
      await refreshAll();
      
      // Buscar orden
      if (orderId) {
        const foundOrder = orders.find(o => o.id === orderId);
        if (foundOrder) {
          setOrder(foundOrder);
          // Buscar pago relacionado
          const relatedPayment = payments.find(p => p.order_ids?.includes(foundOrder.id));
          if (relatedPayment) setPayment(relatedPayment);
          // Buscar disputa relacionada
          const relatedDispute = disputes.find(d => d.order_id === foundOrder.id);
          if (relatedDispute) setDispute(relatedDispute);
        }
      }
      
      // Buscar pago
      if (paymentId) {
        const foundPayment = payments.find(p => p.id === paymentId);
        if (foundPayment) {
          setPayment(foundPayment);
          // Buscar orden relacionada
          if (foundPayment.order_ids && foundPayment.order_ids.length > 0) {
            const relatedOrder = orders.find(o => foundPayment.order_ids!.includes(o.id));
            if (relatedOrder) {
              setOrder(relatedOrder);
              // Buscar disputa relacionada
              const relatedDispute = disputes.find(d => d.order_id === relatedOrder.id);
              if (relatedDispute) setDispute(relatedDispute);
            }
          }
        }
      }
      
      // Buscar disputa
      if (disputeId) {
        const foundDispute = disputes.find(d => d.id === disputeId);
        if (foundDispute) {
          setDispute(foundDispute);
          // Buscar orden relacionada
          const relatedOrder = orders.find(o => o.id === foundDispute.order_id);
          if (relatedOrder) {
            setOrder(relatedOrder);
            // Buscar pago relacionado
            const relatedPayment = payments.find(p => p.order_ids?.includes(relatedOrder.id));
            if (relatedPayment) setPayment(relatedPayment);
          }
        }
      }
      
      setLoading(false);
    };
    
    void load();
  }, [orderId, paymentId, disputeId, orders, payments, disputes, refreshAll]);
  
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-pink"></div>
      </div>
    );
  }
  
  if (!order && !payment && !dispute) {
    return (
      <div className="rounded-3xl bg-white/80 p-6 shadow-sm ring-1 ring-black/5">
        <div className="text-center py-12">
          <p className="text-gray-600">No se encontró la operación solicitada.</p>
          <Link href="/admin" className="mt-4 inline-block text-brand-pink hover:underline">
            Volver al dashboard
          </Link>
        </div>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Vista Unificada de Operación</h1>
          <p className="mt-1 text-sm text-gray-600">
            Información completa de la operación y operaciones relacionadas
          </p>
        </div>
        <Link
          href="/admin"
          className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-black/5 hover:bg-gray-50"
        >
          ← Volver al dashboard
        </Link>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Resumen de Orden */}
          {order && (
            <div className="rounded-3xl bg-white/80 p-6 shadow-sm ring-1 ring-black/5">
              <h2 className="text-lg font-bold text-gray-900 mb-4">📦 Orden</h2>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">ID:</span>
                  <span className="text-sm font-mono">{order.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Estado:</span>
                  <span className={`text-sm font-semibold px-2 py-1 rounded ${
                    order.status === 'paid' ? 'bg-green-100 text-green-800' :
                    order.status === 'shipped' ? 'bg-blue-100 text-blue-800' :
                    order.status === 'delivered' ? 'bg-purple-100 text-purple-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {order.status}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Total:</span>
                  <span className="text-sm font-semibold">${order.total.toLocaleString()}</span>
                </div>
                {order.shipping_label_url && (
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Guía:</span>
                    <a
                      href={order.shipping_label_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-brand-pink hover:underline"
                    >
                      Ver guía
                    </a>
                  </div>
                )}
                <div className="pt-3 border-t">
                  <Link
                    href={`/admin/logistica?orderId=${order.id}`}
                    className="text-sm text-brand-pink hover:underline"
                  >
                    Ver en logística →
                  </Link>
                </div>
              </div>
            </div>
          )}
          
          {/* Resumen de Pago */}
          {payment && (
            <div className="rounded-3xl bg-white/80 p-6 shadow-sm ring-1 ring-black/5">
              <h2 className="text-lg font-bold text-gray-900 mb-4">💰 Pago</h2>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Referencia:</span>
                  <span className="text-sm font-mono">{payment.reference_code || payment.id.slice(0, 8)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Estado:</span>
                  <span className={`text-sm font-semibold px-2 py-1 rounded ${
                    payment.status === 'paid' ? 'bg-green-100 text-green-800' :
                    payment.status === 'pending' ? 'bg-amber-100 text-amber-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {payment.status}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Monto:</span>
                  <span className="text-sm font-semibold">${payment.amount.toLocaleString()}</span>
                </div>
                <div className="pt-3 border-t">
                  <Link
                    href={`/admin/pagos?paymentId=${payment.id}`}
                    className="text-sm text-brand-pink hover:underline"
                  >
                    Ver en pagos →
                  </Link>
                </div>
              </div>
            </div>
          )}
          
          {/* Resumen de Disputa */}
          {dispute && (
            <div className="rounded-3xl bg-white/80 p-6 shadow-sm ring-1 ring-black/5">
              <h2 className="text-lg font-bold text-gray-900 mb-4">⚖️ Disputa</h2>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">ID:</span>
                  <span className="text-sm font-mono">{dispute.id.slice(0, 8)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Estado:</span>
                  <span className={`text-sm font-semibold px-2 py-1 rounded ${
                    dispute.status === 'open' ? 'bg-red-100 text-red-800' :
                    dispute.status === 'resolved' ? 'bg-green-100 text-green-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {dispute.status}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Razón:</span>
                  <span className="text-sm">{dispute.reason_code}</span>
                </div>
                <div className="pt-3 border-t">
                  <Link
                    href={`/admin/disputas/${dispute.id}`}
                    className="text-sm text-brand-pink hover:underline"
                  >
                    Ver disputa completa →
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Sidebar: Navegación contextual */}
        <div className="space-y-6">
          {order && <ContextualNavigation currentItem={order} type="order" />}
          {payment && !order && <ContextualNavigation currentItem={payment} type="payment" />}
          {dispute && !order && !payment && <ContextualNavigation currentItem={dispute} type="dispute" />}
        </div>
      </div>
    </div>
  );
}

export default function OperationsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-pink"></div>
      </div>
    }>
      <OperationViewContent />
    </Suspense>
  );
}
