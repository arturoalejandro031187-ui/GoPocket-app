/**
 * Lógica compartida de pagos a vendedores.
 * Una sola fuente de verdad para cálculo de neto, estados y filtros.
 * Usado por: /api/payouts/balance, /api/payouts/statement, /api/payouts/withdraw,
 * Dashboard Pagos, Admin payouts report.
 */

export function toNumber(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function isCancelledStatus(s: string): boolean {
  const low = String(s || '').toLowerCase();
  return low === 'cancelled' || low === 'canceled' || low === 'refunded';
}

export function isPaidStatus(s: string): boolean {
  const low = String(s || '').toLowerCase();
  return ['paid', 'shipped', 'delivered', 'disputed'].includes(low);
}

export function isReleasedStatus(s: string): boolean {
  const low = String(s || '').toLowerCase();
  return low === 'delivered';
}

export type OrderLike = {
  subtotal?: unknown;
  total?: unknown;
  shipping_fee?: unknown;
  commission_fee?: unknown;
  coupon_discount?: unknown;
  shipping_subsidy?: unknown;
  shipping_option_id?: unknown;
};

/**
 * Neto a pagar al vendedor por una orden (después de comisión, envío, descuentos).
 * Misma fórmula en toda la app para que los números coincidan en usuario y admin.
 */
export function payoutNet(o: OrderLike): number {
  const subtotal = toNumber(o?.subtotal);
  const discount = toNumber((o as any)?.coupon_discount);
  const commission = toNumber(o?.commission_fee);
  const subsidy = toNumber((o as any)?.shipping_subsidy);
  
  // Detectar si el envío es gestionado por plataforma (tiene ID de opción)
   // Si NO tiene ID (es null), es Pickup o Envío por cuenta propia.
   const shippingFee = toNumber(o?.shipping_fee);
   const isPlatformLabel = Boolean((o as any)?.shipping_option_id);

   // Si usamos subtotal (precio item):
   // - Platform Shipping: El vendedor recibe Subtotal. (Shipping fee es aparte y se lo queda la plataforma).
   // - Custom Shipping: El vendedor recibe Subtotal + Shipping Fee (para pagar su envío).
   if (subtotal > 0) {
      const extraShippingIncome = isPlatformLabel ? 0 : shippingFee;
      return Math.max(0, subtotal - discount - commission - subsidy + extraShippingIncome);
   }
   
   // Si usamos total (incluye shipping):
   // - Platform Shipping: Deducimos Shipping Fee (se lo queda plataforma).
   // - Custom Shipping: NO deducimos Shipping Fee (se lo queda vendedor).
   const total = toNumber(o?.total);
   if (total > 0) {
      const shippingDeduction = isPlatformLabel ? shippingFee : 0;
      return Math.max(0, total - commission - subsidy - shippingDeduction);
   }
  
  return 0;
}

export function statusLabel(s: string): string {
  const low = String(s || '').toLowerCase();
  if (low === 'pending_payment') return 'Pendiente de pago';
  if (low === 'paid') return 'Pagado';
  if (low === 'shipped') return 'Enviado';
  if (low === 'delivered') return 'Completado';
  if (low === 'cancelled' || low === 'canceled') return 'Cancelado';
  if (low === 'refunded') return 'Reembolsado';
  if (low === 'disputed') return 'En disputa';
  return s || '—';
}
