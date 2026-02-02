// Servicio de lógica de negocio para checkout

import { OrdersRepository } from '@/lib/repositories/orders.repository';
import { OrderItemsRepository } from '@/lib/repositories/order-items.repository';
import { ListingsRepository } from '@/lib/repositories/listings.repository';
import { NotificationsRepository } from '@/lib/repositories/notifications.repository';
import { NotificationService } from '@/lib/services/notifications/notification.service';
import { WalletService } from '@/lib/services/wallet/wallet.service';
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

    const validPaymentMethods: PaymentMethod[] = ['mercadopago', 'bank_transfer', 'bank_deposit', 'oxxo', 'pocketcash'];
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
      .select('commission_rate, shipping_base, shipping_markup_percent, shipping_markup_fixed, estafeta_config')
      .eq('id', 1)
      .maybeSingle();
    const commission_rate = Number((settingsRow as any)?.commission_rate ?? 0.05);
    const shipping_base = Number((settingsRow as any)?.shipping_base ?? 180);
    const shipping_markup_pct = Number((settingsRow as any)?.shipping_markup_percent ?? 0) || 0;
    const shipping_markup_fixed = Number((settingsRow as any)?.shipping_markup_fixed ?? 0) || 0;
    const estafeta_config = ((settingsRow as any)?.estafeta_config as any) || {
      enabled: true,
      weight_ranges: [
        { max_weight_kg: 1, price: 168 },
        { max_weight_kg: 5, price: 170 },
        { max_weight_kg: 10, price: 225 },
        { max_weight_kg: 15, price: 240 },
        { max_weight_kg: 20, price: 260 },
        { max_weight_kg: 25, price: 275 },
        { max_weight_kg: 30, price: 295 },
        { max_weight_kg: 35, price: 295 },
        { max_weight_kg: 40, price: 310 },
        { max_weight_kg: 45, price: 385 },
        { max_weight_kg: 50, price: 435 },
        { max_weight_kg: 55, price: 465 },
        { max_weight_kg: 60, price: 485 },
      ],
    };

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
      .select('id,title,price,seller_id,free_shipping,status,weight_kg,shipping_by_seller,shipping_subsidy,allow_personal_delivery,length_cm,width_cm,height_cm')
      .in('id', listingIds);

    // Fallback si seller_id no existe
    if (listingsRes?.error) {
      const code = String((listingsRes.error as any)?.code || '');
      const msg = String((listingsRes.error as any)?.message || '').toLowerCase();
      if (code === '42703' || msg.includes('column')) {
        // Intentar sin columnas nuevas si falla
        listingsRes = await admin.from('listings').select('id,title,price,user_id,free_shipping,status,weight_kg,shipping_by_seller').in('id', listingIds);
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

      // Validar Stock
      // Si stock es null, asumimos que es artículo único (1) o que no se gestiona stock numérico?
      // Por seguridad, si hay un campo stock, lo respetamos.
      const currentStock = typeof listing.stock === 'number' ? listing.stock : (listing.stock ? Number(listing.stock) : null);
      if (currentStock !== null && currentStock < ci.quantity) {
        throw new ValidationError(`El artículo "${listing.title.slice(0, 20)}..." ya no está disponible (stock insuficiente).`);
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
    const { data: sellerProfiles } = await admin
      .from('profiles')
      .select('id, state, city, plan_type')
      .in('id', Array.from(sellerIds));
    
    const sellerProfileById: Record<string, any> = {};
    sellerProfiles?.forEach((p: any) => { sellerProfileById[p.id] = p; });

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
    const createdOrdersInfo: { id: string; amount: number }[] = [];
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
      const sellerPlan = sellerProfileById[sellerId]?.plan_type || 'basic';
      const appliedRate = sellerPlan === 'pro' ? 0.15 : 0.20;
      const commissionFee = groupSubtotal * appliedRate;

      // Calcular envío (lógica de peso)
      const allFreeShipping = groupItems.every((item) => Boolean(listingById[item.listingId]?.free_shipping));
      
      // Calcular peso total del grupo (considerando volumétrico)
      const totalWeight = groupItems.reduce((sum, item) => {
         const l = listingById[item.listingId];
         // Si no tiene peso definido, asumimos 1kg
         const w = Number(l.weight_kg) || 1; 
         const len = Number(l.length_cm) || 10;
         const wid = Number(l.width_cm) || 10;
         const h = Number(l.height_cm) || 10;
         
         // Cálculo volumétrico: (Largo * Ancho * Alto) / 5000
         const volW = (len * wid * h) / 5000;
         
         // Usar el mayor entre peso físico y volumétrico (igual que en cotizador)
         const finalW = Math.max(w, volW);
         
         return sum + (finalW * item.quantity);
      }, 0);

      // Determinar costo base según rangos de peso (si existe configuración)
      let calculatedBaseCost = shipping_base;
      if (estafeta_config?.enabled && Array.isArray(estafeta_config.weight_ranges)) {
        const ranges = estafeta_config.weight_ranges.sort((a: any, b: any) => (a.max_weight_kg || 0) - (b.max_weight_kg || 0));
        const match = ranges.find((r: any) => totalWeight <= (r.max_weight_kg || 0));
        if (match) {
          calculatedBaseCost = Number(match.price) || shipping_base;
        } else if (ranges.length > 0) {
          // Si excede el máximo, usar el precio del rango más alto (o podrías sumar extra)
          calculatedBaseCost = Number(ranges[ranges.length - 1].price) || shipping_base;
        }
      }

      const rawCost = selectedShippingOption ? selectedShippingOption.cost : calculatedBaseCost;
      const shippingCost = applyShippingMarkup(Number.isFinite(rawCost) ? rawCost : 180, shipping_markup_pct, shipping_markup_fixed);
      
      const hasSelfShipping = groupItems.some((item) => Boolean(listingById[item.listingId]?.shipping_by_seller));
      
      // Validar que si usa envío propio, sea PRO
      if (hasSelfShipping && sellerPlan !== 'pro') {
         throw new ForbiddenError('El envío por cuenta propia solo está disponible para vendedores PRO.');
      }

      let finalShippingFee = 0;
      let finalShippingSubsidy = 0;

      // Lógica de Entrega Personal (pickup)
      let isPickup = false;
      if (shippingOptionId === 'pickup') {
         const sProf = sellerProfileById[sellerId];
         const normalize = (s: string) => s.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
         
         const bState = normalize(shippingAddress.state);
         const bCity = normalize(shippingAddress.city);
         const sState = normalize(String(sProf?.state || ''));
         const sCity = normalize(String(sProf?.city || ''));
         
         const locationMatch = bState === sState && bCity === sCity;
         const allowedByItems = groupItems.every(i => listingById[i.listingId]?.allow_personal_delivery);
         
         console.log('[CheckoutService] Validando pickup:', {
            sellerId,
            plan: sellerPlan,
            bLoc: `${bCity}, ${bState}`,
            sLoc: `${sCity}, ${sState}`,
            match: locationMatch,
            allowedByItems
         });

         // Solo permitir pickup si es PRO, hay match de ubicación y los items lo permiten
         if (locationMatch && allowedByItems && sellerPlan === 'pro') {
            isPickup = true;
         } else {
            console.warn('[CheckoutService] Pickup rechazado:', { locationMatch, allowedByItems, isPro: sellerPlan === 'pro' });
         }
      }

      if (hasSelfShipping || isPickup) {
        finalShippingFee = 0;
        finalShippingSubsidy = 0;
      } else {
        let totalSubsidy = 0;
        for (const item of groupItems) {
          const l = listingById[item.listingId];
          const sub = Number(l.shipping_subsidy) || 0;
          
          if (l.free_shipping && sub === 0) {
             // Legacy Free Shipping: asume cobertura total si no hay subsidio explícito
             totalSubsidy += 999999; 
          } else {
             totalSubsidy += (sub * item.quantity);
          }
        }

        finalShippingSubsidy = Math.min(totalSubsidy, shippingCost);
        finalShippingFee = Math.max(0, shippingCost - finalShippingSubsidy);
      }

      const groupShipping = finalShippingFee;
      const shippingSubsidy = finalShippingSubsidy;

      // Aplicar descuento de cupón
      const rawGroupDiscount = couponDiscountBySeller?.[sellerId] ?? 0;
      const groupDiscount = rawGroupDiscount > 0 ? Math.min(groupSubtotal, rawGroupDiscount) : 0;
      // Redondear a 2 decimales para asegurar precisión financiera
      const groupTotal = Number((Math.max(0, groupSubtotal - groupDiscount) + groupShipping).toFixed(2));

      // --- VALIDACIONES FINANCIERAS ---
      
      // 1. Validación de Ganancias del Vendedor (Anti-Pérdidas Generales)
      // El vendedor debe ser capaz de cubrir costos de envío (si aplica) y comisión con el precio del producto.
      // Esta validación bloquea CUALQUIER transacción que resulte en saldo negativo para el vendedor,
      // ya sea por cupones, envío gratis mal configurado, o precios demasiado bajos.
      
      const platformShippingCost = (isPickup || hasSelfShipping) ? 0 : shippingCost;
      // Costo de envío que el vendedor "subsidia" (Real - Lo que paga el cliente)
      const sellerShippingSubsidy = Math.max(0, platformShippingCost - groupShipping);
      
      // Ganancia proyectada (Ingreso Neto del Vendedor)
      // Subtotal - Comisión - Subsidio de Envío - Descuento Cupón
      const projectedEarnings = groupSubtotal - commissionFee - sellerShippingSubsidy - groupDiscount;
      
      if (projectedEarnings < 0) {
         if (groupDiscount > 0) {
            throw new ValidationError(
              `No se puede aplicar el cupón: El descuento ($${groupDiscount.toFixed(2)}) excede las ganancias. El vendedor perdería dinero en esta venta.`
            );
         } else {
            // Caso: Precio muy bajo + Envío Gratis (sin cupón)
            throw new ValidationError(
               `No se puede procesar la compra: El precio del producto no cubre los costos de envío y comisión. El vendedor tendría saldo negativo.`
            );
         }
      }

      // 2. Validación de Flujo de Caja (Legacy / Safety Net)
      // Evitar que la plataforma desembolse más en envío de lo que recibe en total.
      // (Esto protege principalmente ventas sin cupón mal configuradas o errores de cálculo).
      if (!isPickup && !hasSelfShipping && groupTotal < shippingCost) {
        throw new ValidationError(
          `No se puede procesar la compra: El total ($${groupTotal.toFixed(2)}) es insuficiente para cubrir el costo de envío ($${shippingCost.toFixed(2)}).`
        );
      }

      // Crear orden con fallbacks para columnas faltantes
      const basePayload: any = {
        buyer_id: buyerId,
        seller_id: sellerId,
        shipping_option_id: isPickup ? null : (selectedShippingOption ? selectedShippingOption.id : null),
        shipping_carrier: isPickup ? 'pickup' : null,
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
        // No eliminar shipping_subsidy aquí, ya que es crítico para el balance del vendedor.
        // El repositorio ya maneja la ausencia de la columna si es necesario.
        order = await this.ordersRepo.create(fallbackPayload);
      }

      createdOrderIds.push(order.id);
      createdOrdersInfo.push({ id: order.id, amount: groupTotal });
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

    // Procesar pago con PocketCash
    if (paymentMethod === 'pocketcash') {
      const wallet = await WalletService.getWallet(buyerId);
      const balance = Number(wallet?.balance || 0);
      
      if (balance < totalAmount) {
        // Nota: Las órdenes ya se crearon como pending_payment.
        // El frontend deberá manejar este error y redirigir al usuario a pagar/recargar.
        throw new ValidationError(`Saldo insuficiente en PocketCash. Tienes $${balance.toFixed(2)} pero se requieren $${totalAmount.toFixed(2)}`);
      }

      // Procesar deducción y marcar como pagado (Batch Atómico)
      const ordersToPay = createdOrdersInfo.filter(o => o.amount > 0);
      
      // Intentar cobrar todo junto. Si falla por saldo insuficiente, lanza error y no se actualiza ninguna orden.
      if (ordersToPay.length > 0) {
        await WalletService.payOrdersBatch(buyerId, ordersToPay);
      }

      // Si el pago fue exitoso (o era monto 0), actualizar estados
      for (const info of createdOrdersInfo) {
        // Actualizar estado de orden
        await admin
          .from('orders')
          .update({
            status: 'paid',
            paid_at: new Date().toISOString(),
          })
          .eq('id', info.id);
      }
    }

    return {
      orderIds: createdOrderIds,
      amount: totalAmount,
    };
  }
}
