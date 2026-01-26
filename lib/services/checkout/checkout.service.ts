// Servicio de lógica de negocio para checkout

import { OrdersRepository } from '@/lib/repositories/orders.repository';
import { OrderItemsRepository } from '@/lib/repositories/order-items.repository';
import { ListingsRepository } from '@/lib/repositories/listings.repository';
import { NotificationsRepository } from '@/lib/repositories/notifications.repository';
import { NotificationService } from '@/lib/services/notifications/notification.service';
import { Order, PaymentMethod } from '@/lib/types/domain.types';
import { ValidationError, ForbiddenError } from '@/lib/utils/errors';
import { validateRequired, validateUUID } from '@/lib/utils/validation';
import { getUserAdminState, isRestricted } from '@/lib/userAdminState';
import { applyShippingMarkup } from '@/lib/shippingMarkup';
import { supabaseAdmin } from '@/lib/supabase/admin';

function isFilled(v: unknown): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}

async function fetchCouponDiscountBySeller(params: {
  origin: string;
  token: string;
  code: string;
  cartItems: Array<{ listingId: string; quantity: number }>;
}): Promise<Record<string, number>> {
  const res = await fetch(`${params.origin}/api/coupons/apply`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${params.token}` },
    body: JSON.stringify({ code: params.code, cartItems: params.cartItems }),
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({} as any));
  if (!res.ok) {
    throw new Error(json?.error || 'No se pudo aplicar el cupón.');
  }

  const raw = (json?.discountBySeller ?? json?.discount_by_seller ?? {}) as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const [sid, v] of Object.entries(raw || {})) {
    const n = typeof v === 'number' ? v : Number(v ?? 0);
    out[sid] = Number.isFinite(n) ? n : 0;
  }
  return out;
}

export interface CartItem {
  listingId: string;
  quantity: number;
  selected_size?: string | null;
  selected_color?: string | null;
}

export interface CreateCheckoutParams {
  buyerId: string;
  cartItems: CartItem[];
  paymentMethod: PaymentMethod;
  couponCode?: string | null;
  shippingOptionId?: string | null;
  accessToken: string;
  origin: string;
}

export interface CheckoutResult {
  orderIds: string[];
  amount: number;
}

export class CheckoutService {
  private notificationService?: NotificationService;

  constructor(
    private ordersRepo: OrdersRepository,
    private orderItemsRepo: OrderItemsRepository,
    private listingsRepo: ListingsRepository,
    notificationsRepo?: NotificationsRepository
  ) {
    if (notificationsRepo) {
      this.notificationService = new NotificationService(notificationsRepo);
    }
  }

  /**
   * Crear checkout (órdenes + items)
   */
  async createCheckout(params: CreateCheckoutParams): Promise<CheckoutResult> {
    const { buyerId, cartItems, paymentMethod, couponCode, shippingOptionId, accessToken, origin } = params;

    // Validaciones básicas
    validateRequired(buyerId, 'buyerId');
    validateRequired(cartItems, 'cartItems');
    validateRequired(paymentMethod, 'paymentMethod');

    if (!validateUUID(buyerId)) {
      throw new ValidationError('buyerId debe ser un UUID válido');
    }

    if (cartItems.length === 0) {
      throw new ValidationError('El carrito está vacío');
    }

    const validPaymentMethods: PaymentMethod[] = ['mercadopago', 'bank_transfer', 'bank_deposit', 'oxxo'];
    if (!validPaymentMethods.includes(paymentMethod)) {
      throw new ValidationError('payment_method inválido');
    }

    const admin = supabaseAdmin();

    // Validar estado del comprador
    const buyerState = await getUserAdminState(admin, buyerId);
    if (isRestricted(buyerState)) {
      throw new ForbiddenError(
        buyerState?.status === 'banned'
          ? 'Tu cuenta está bloqueada. No puedes comprar ni vender.'
          : 'Tu cuenta está suspendida. No puedes comprar ni vender hasta que finalice la suspensión.'
      );
    }

    // Obtener configuración
    const { data: settingsRow } = await admin
      .from('app_settings')
      .select('commission_rate, shipping_base, shipping_markup_percent, shipping_markup_fixed')
      .eq('id', 1)
      .maybeSingle();
    const commission_rate = Number((settingsRow as any)?.commission_rate ?? 0.05);
    const shipping_base = Number((settingsRow as any)?.shipping_base ?? 180);
    const shipping_markup_pct = Number((settingsRow as any)?.shipping_markup_percent ?? 0) || 0;
    const shipping_markup_fixed = Number((settingsRow as any)?.shipping_markup_fixed ?? 0) || 0;

    // Obtener opción de envío
    let selectedShippingOption: { id: string; cost: number } | null = null;
    if (shippingOptionId) {
      const { data: shippingOption } = await admin
        .from('shipping_options')
        .select('id, cost')
        .eq('id', shippingOptionId)
        .eq('is_active', true)
        .maybeSingle();
      if (shippingOption) {
        selectedShippingOption = {
          id: shippingOption.id,
          cost: Number(shippingOption.cost) || 0,
        };
      }
    }

    // Obtener perfil para dirección de envío
    const { data: profile } = await admin
      .from('profiles')
      .select('full_name, phone, address_street, ext_number, int_number, neighborhood, zip_code, state, city, references, cross_streets')
      .eq('id', buyerId)
      .maybeSingle();

    const shippingFullName = String((profile as any)?.full_name ?? '').trim();
    const shippingPhone = String((profile as any)?.phone ?? '').trim();
    const shippingAddress = {
      address_street: String((profile as any)?.address_street ?? ''),
      ext_number: String((profile as any)?.ext_number ?? ''),
      int_number: String((profile as any)?.int_number ?? ''),
      neighborhood: String((profile as any)?.neighborhood ?? ''),
      zip_code: String((profile as any)?.zip_code ?? ''),
      state: String((profile as any)?.state ?? ''),
      city: String((profile as any)?.city ?? ''),
      references: String((profile as any)?.references ?? ''),
      cross_streets: String((profile as any)?.cross_streets ?? ''),
    };

    // Validar dirección completa
    const addressOk =
      isFilled(shippingFullName) &&
      isFilled(shippingPhone) &&
      isFilled(shippingAddress.address_street) &&
      isFilled(shippingAddress.ext_number) &&
      isFilled(shippingAddress.neighborhood) &&
      isFilled(shippingAddress.zip_code) &&
      isFilled(shippingAddress.state) &&
      isFilled(shippingAddress.city) &&
      isFilled(shippingAddress.references) &&
      isFilled(shippingAddress.cross_streets);

    if (!addressOk) {
      throw new ValidationError('address_required');
    }

    // Obtener listings
    const listingIds = Array.from(new Set(cartItems.map((c) => c.listingId)));
    let listingsRes: any = await admin
      .from('listings')
      .select('id,title,price,seller_id,free_shipping,status')
      .in('id', listingIds);

    // Fallback si seller_id no existe
    if (listingsRes?.error) {
      const code = String((listingsRes.error as any)?.code || '');
      const msg = String((listingsRes.error as any)?.message || '').toLowerCase();
      if (code === '42703' || msg.includes('column')) {
        listingsRes = await admin.from('listings').select('id,title,price,user_id,free_shipping,status').in('id', listingIds);
      }
    }

    if (listingsRes?.error) {
      throw new Error(`Error obteniendo listings: ${listingsRes.error.message}`);
    }

    const listings = ((listingsRes?.data as any[]) ?? []) as any[];
    const listingById: Record<string, any> = {};
    for (const row of listings) listingById[String(row.id)] = row;

    // Validar listings
    for (const ci of cartItems) {
      const listing = listingById[ci.listingId];
      if (!listing) {
        throw new ValidationError('Publicación no encontrada en carrito.');
      }
      const status = String(listing.status ?? 'active').trim();
      if (status !== 'active') {
        throw new ValidationError('Una publicación de tu carrito ya no está activa.');
      }
    }

    // Aplicar cupón si existe
    let couponDiscountBySeller: Record<string, number> = {};
    if (couponCode) {
      couponDiscountBySeller = await fetchCouponDiscountBySeller({
        origin,
        token: accessToken,
        code: couponCode,
        cartItems: cartItems.map((ci) => ({ listingId: ci.listingId, quantity: ci.quantity })),
      });
    }

    // Agrupar por vendedor
    const groups: Record<string, CartItem[]> = {};
    const sellerIds = new Set<string>();
    for (const ci of cartItems) {
      const listing = listingById[ci.listingId];
      const sellerId = String(listing.seller_id ?? listing.user_id ?? '').trim();
      if (!sellerId) {
        throw new ValidationError('No pude determinar el vendedor de una publicación.');
      }
      sellerIds.add(sellerId);
      if (!groups[sellerId]) groups[sellerId] = [];
      groups[sellerId].push(ci);
    }

    // Validar estado de vendedores
    for (const sellerId of Array.from(sellerIds)) {
      const sellerState = await getUserAdminState(admin, sellerId);
      if (isRestricted(sellerState)) {
        throw new ForbiddenError(
          'Una publicación de tu carrito pertenece a un vendedor suspendido o bloqueado. Quítala del carrito para continuar.'
        );
      }
    }

    // Crear órdenes por vendedor
    const createdOrderIds: string[] = [];
    let totalAmount = 0;

    for (const sellerId of Object.keys(groups)) {
      const groupItems = groups[sellerId];

      // Calcular subtotal
      const groupSubtotal = groupItems.reduce((sum, item) => {
        const listing = listingById[item.listingId];
        const price = typeof listing.price === 'number' ? listing.price : Number(listing.price ?? 0);
        return sum + (Number.isFinite(price) ? price : 0) * item.quantity;
      }, 0);

      // Calcular comisión
      const commissionFee = groupSubtotal * (Number.isFinite(commission_rate) ? commission_rate : 0.05);

      // Calcular envío
      const allFreeShipping = groupItems.every((item) => Boolean(listingById[item.listingId]?.free_shipping));
      const rawCost = selectedShippingOption ? selectedShippingOption.cost : shipping_base;
      const shippingCost = applyShippingMarkup(Number.isFinite(rawCost) ? rawCost : 180, shipping_markup_pct, shipping_markup_fixed);
      const groupShipping = allFreeShipping ? 0 : shippingCost;
      const shippingSubsidy = allFreeShipping ? shippingCost : 0;

      // Aplicar descuento de cupón
      const rawGroupDiscount = couponDiscountBySeller?.[sellerId] ?? 0;
      const groupDiscount = rawGroupDiscount > 0 ? Math.min(groupSubtotal, rawGroupDiscount) : 0;
      const groupTotal = Math.max(0, groupSubtotal - groupDiscount) + groupShipping;

      // Crear orden con fallbacks para columnas faltantes
      const basePayload: any = {
        buyer_id: buyerId,
        seller_id: sellerId,
        shipping_option_id: selectedShippingOption ? selectedShippingOption.id : null,
        status: 'pending_payment',
        payment_method: paymentMethod,
        subtotal: groupSubtotal,
        shipping_fee: groupShipping,
        commission_fee: commissionFee,
        total: groupTotal,
        shipping_full_name: shippingFullName,
        shipping_phone: shippingPhone,
        shipping_address: shippingAddress,
      };

      // Agregar campos opcionales si existen
      if (couponCode) basePayload.coupon_code = couponCode;
      if (groupDiscount > 0) basePayload.coupon_discount = groupDiscount;
      if (shippingSubsidy > 0) basePayload.shipping_subsidy = shippingSubsidy;

      // Crear orden con intentos de fallback
      let order: Order;
      try {
        order = await this.ordersRepo.create(basePayload);
      } catch (error) {
        // Fallback: intentar sin campos opcionales
        const fallbackPayload: any = { ...basePayload };
        delete fallbackPayload.coupon_code;
        delete fallbackPayload.coupon_discount;
        delete fallbackPayload.shipping_subsidy;
        order = await this.ordersRepo.create(fallbackPayload);
      }

      createdOrderIds.push(order.id);
      totalAmount += groupTotal;

      // Crear items de orden
      const orderItems = groupItems.map((item) => {
        const listing = listingById[item.listingId];
        const title = String(listing?.title || 'Publicación');
        const price = typeof listing.price === 'number' ? listing.price : Number(listing.price ?? 0);
        const unitPrice = Number.isFinite(price) ? price : 0;
        return {
          order_id: order.id,
          listing_id: item.listingId,
          title,
          unit_price: unitPrice,
          quantity: item.quantity,
          line_total: unitPrice * item.quantity,
          selected_size: item.selected_size || null,
          selected_color: item.selected_color || null,
        };
      });

      await this.orderItemsRepo.createMany(orderItems);

      // Notificar al vendedor (best-effort)
      if (this.notificationService) {
        try {
          await this.notificationService.create({
            user_id: sellerId,
            type: 'new_sale',
            title: '🛒 ¡Nueva venta!',
            body: `Recibiste una nueva compra. Orden: ${order.id.slice(0, 8)}… Esperando confirmación de pago.`,
            link_to: `/dashboard/ventas?order=${order.id}`,
            data: {
              kind: 'new_sale',
              orderId: order.id,
              status: 'pending_payment',
            },
          });
        } catch (notifyErr) {
          console.warn('[CheckoutService] Error enviando notificación:', notifyErr);
        }
      }
    }

    return {
      orderIds: createdOrderIds,
      amount: totalAmount,
    };
  }
}
