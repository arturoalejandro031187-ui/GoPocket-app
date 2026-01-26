import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { insertNotificationBestEffort } from '@/lib/notifications/insertBestEffort';
import { getUserAdminState, isRestricted } from '@/lib/userAdminState';
import { applyShippingMarkup } from '@/lib/shippingMarkup';

export const dynamic = 'force-dynamic';

type PaymentKey = 'mercadopago' | 'bank_transfer' | 'bank_deposit' | 'oxxo';

type Body = {
  cartItems: Array<{ listingId: string; quantity: number; selected_size?: string | null; selected_color?: string | null }>;
  payment_method: PaymentKey;
  coupon_code?: string | null;
  shipping_option_id?: string | null;
};

function getBearerToken(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function isFilled(v: unknown) {
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
    // Evitar cache en runtime edge/node
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({} as any));
  if (!res.ok) {
    // Si el cupón es inválido, preferimos fallar duro para no crear órdenes con un descuento “fantasma”.
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

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: 'Missing Authorization Bearer token' }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as Partial<Body>;
    const cartItemsRaw = Array.isArray(body.cartItems) ? body.cartItems : [];
    const cartItems = cartItemsRaw
      .map((c) => ({ 
        listingId: String((c as any)?.listingId || '').trim(), 
        quantity: Number((c as any)?.quantity ?? 1),
        selected_size: String((c as any)?.selected_size || '').trim() || null,
        selected_color: String((c as any)?.selected_color || '').trim() || null,
      }))
      .filter((c) => c.listingId);
    const payment_method = String(body.payment_method || '').trim() as PaymentKey;
    const coupon_code = String(body.coupon_code || '').trim().toUpperCase();
    const shipping_option_id = String(body.shipping_option_id || '').trim() || null;

    if (cartItems.length === 0) return NextResponse.json({ error: 'cartItems is required' }, { status: 400 });
    if (!['mercadopago', 'bank_transfer', 'bank_deposit', 'oxxo'].includes(payment_method)) {
      return NextResponse.json({ error: 'payment_method inválido' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
    const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    if (!supabaseUrl || !supabaseAnon) return NextResponse.json({ error: 'Supabase env vars missing on server' }, { status: 500 });

    // Auth user (anon client + JWT)
    const supabase = createClient(supabaseUrl, supabaseAnon, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr) return NextResponse.json({ error: userErr.message }, { status: 401 });
    if (!userData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = supabaseAdmin();

    const buyerState = await getUserAdminState(admin, userData.user.id);
    if (isRestricted(buyerState)) {
      return NextResponse.json(
        { error: buyerState?.status === 'banned' ? 'Tu cuenta está bloqueada. No puedes comprar ni vender.' : 'Tu cuenta está suspendida. No puedes comprar ni vender hasta que finalice la suspensión.' },
        { status: 403 },
      );
    }

    // Settings (commission + shipping + markup)
    const { data: settingsRow } = await admin
      .from('app_settings')
      .select('commission_rate, shipping_base, shipping_markup_percent, shipping_markup_fixed')
      .eq('id', 1)
      .maybeSingle();
    const commission_rate = Number((settingsRow as any)?.commission_rate ?? 0.05);
    const shipping_base = Number((settingsRow as any)?.shipping_base ?? 180);
    const shipping_markup_pct = Number((settingsRow as any)?.shipping_markup_percent ?? 0) || 0;
    const shipping_markup_fixed = Number((settingsRow as any)?.shipping_markup_fixed ?? 0) || 0;

    // Obtener opción de envío seleccionada si existe
    let selectedShippingOption: { id: string; cost: number } | null = null;
    if (shipping_option_id) {
      const { data: shippingOption } = await admin
        .from('shipping_options')
        .select('id, cost')
        .eq('id', shipping_option_id)
        .eq('is_active', true)
        .maybeSingle();
      if (shippingOption) {
        selectedShippingOption = {
          id: shippingOption.id,
          cost: Number(shippingOption.cost) || 0,
        };
      }
    }

    // Perfil para snapshot de envío
    const { data: profile } = await admin
      .from('profiles')
      .select('full_name, phone, address_street, ext_number, int_number, neighborhood, zip_code, state, city, references, cross_streets')
      .eq('id', userData.user.id)
      .maybeSingle();

    const shippingFullName = String((profile as any)?.full_name ?? (userData.user.user_metadata?.full_name as string | undefined) ?? '').trim();
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
      return NextResponse.json({ error: 'address_required' }, { status: 400 });
    }

    // Traer listings reales (precio, vendedor, free_shipping, status)
    const ids = Array.from(new Set(cartItems.map((c) => c.listingId)));
    let lres: any = await admin.from('listings').select('id,title,price,seller_id,free_shipping,status').in('id', ids);
    if (lres?.error) {
      const code = String((lres.error as any)?.code || '');
      const msg = String((lres.error as any)?.message || '').toLowerCase();
      // fallback si `seller_id` no existe
      if (code === '42703' || msg.includes('column')) {
        lres = await admin.from('listings').select('id,title,price,user_id,free_shipping,status').in('id', ids);
      }
    }
    if (lres?.error) return NextResponse.json({ error: lres.error.message }, { status: 400 });
    const listings = ((lres?.data as any[]) ?? []) as any[];
    const listingById: Record<string, any> = {};
    for (const row of listings) listingById[String(row.id)] = row;

    // Validar que todas existan y estén activas
    for (const ci of cartItems) {
      const row = listingById[ci.listingId];
      if (!row) return NextResponse.json({ error: 'Publicación no encontrada en carrito.' }, { status: 404 });
      const st = String(row.status ?? 'active').trim();
      if (st !== 'active') return NextResponse.json({ error: 'Una publicación de tu carrito ya no está activa.' }, { status: 400 });
    }

    // Cupón (opcional): lo calculamos server-side reutilizando el endpoint existente
    let couponDiscountBySeller: Record<string, number> = {};
    if (coupon_code) {
      couponDiscountBySeller = await fetchCouponDiscountBySeller({
        origin: req.nextUrl.origin,
        token,
        code: coupon_code,
        cartItems,
      });
    }

    // Agrupar por vendedor y crear órdenes + items
    const groups: Record<string, Array<{ listingId: string; quantity: number; selected_size: string | null; selected_color: string | null }>> = {};
    const sellerIds = new Set<string>();
    for (const ci of cartItems) {
      const row = listingById[ci.listingId];
      const sid = String(row.seller_id ?? row.user_id ?? '').trim();
      if (!sid) return NextResponse.json({ error: 'No pude determinar el vendedor de una publicación.' }, { status: 400 });
      sellerIds.add(sid);
      if (!groups[sid]) groups[sid] = [];
      groups[sid].push({ 
        listingId: ci.listingId, 
        quantity: Math.max(1, Number(ci.quantity || 1)),
        selected_size: ci.selected_size,
        selected_color: ci.selected_color,
      });
    }
    for (const sid of Array.from(sellerIds)) {
      const sellerState = await getUserAdminState(admin, sid);
      if (isRestricted(sellerState)) {
        return NextResponse.json(
          { error: 'Una publicación de tu carrito pertenece a un vendedor suspendido o bloqueado. Quítala del carrito para continuar.' },
          { status: 403 },
        );
      }
    }

    const createdOrderIds: string[] = [];
    let amount = 0;

    const tryInsertOrder = async (payload: any) => admin.from('orders').insert([payload]).select('id').single();

    for (const sellerId of Object.keys(groups)) {
      const groupItems = groups[sellerId];
      const groupSubtotal = groupItems.reduce((s, it) => {
        const row = listingById[it.listingId];
        const p = typeof row.price === 'number' ? row.price : Number(row.price ?? 0);
        const price = Number.isFinite(p) ? p : 0;
        return s + price * it.quantity;
      }, 0);

      const commissionFee = groupSubtotal * (Number.isFinite(commission_rate) ? commission_rate : 0.05);
      const allFreeShipping = groupItems.every((it) => Boolean(listingById[it.listingId]?.free_shipping));
      
      const rawCost = selectedShippingOption ? selectedShippingOption.cost : shipping_base;
      const shippingCost = applyShippingMarkup(Number.isFinite(rawCost) ? rawCost : 180, shipping_markup_pct, shipping_markup_fixed);
      const groupShipping = allFreeShipping ? 0 : shippingCost;
      const shippingSubsidy = allFreeShipping ? shippingCost : 0;
      const rawGroupDiscount = couponDiscountBySeller?.[sellerId] ?? 0;
      const groupDiscount = rawGroupDiscount > 0 ? Math.min(groupSubtotal, rawGroupDiscount) : 0;
      const groupTotal = Math.max(0, groupSubtotal - groupDiscount) + groupShipping;

      const basePayload: any = {
        buyer_id: userData.user.id,
        seller_id: sellerId,
        shipping_option_id: selectedShippingOption ? selectedShippingOption.id : null,
        status: 'pending_payment',
        payment_method,
        subtotal: groupSubtotal,
        shipping_fee: groupShipping,
        commission_fee: commissionFee,
        total: groupTotal,
        coupon_code: coupon_code || null,
        coupon_discount: groupDiscount,
        shipping_full_name: shippingFullName,
        shipping_phone: shippingPhone,
        shipping_address: shippingAddress,
        shipping_subsidy: shippingSubsidy,
      };

      // Insert robusto por compatibilidad de columnas
      let payload = { ...basePayload };
      let insert: any = await tryInsertOrder(payload);
      for (let attempt = 0; attempt < 6 && insert?.error; attempt++) {
        const code = String((insert.error as any)?.code || '');
        const msgLower = String((insert.error as any)?.message || '').toLowerCase();
        if (code === '42703' || msgLower.includes('does not exist') || msgLower.includes('column')) {
          const beforeKeys = Object.keys(payload).length;
          if (msgLower.includes('shipping_subsidy')) delete (payload as any).shipping_subsidy;
          if (msgLower.includes('coupon_code')) delete (payload as any).coupon_code;
          if (msgLower.includes('coupon_discount')) delete (payload as any).coupon_discount;

          const m1 = msgLower.match(/column\s+"?([a-z0-9_]+)"?\s+of\s+relation\s+"?orders"?\s+does not exist/);
          const m2 = msgLower.match(/column\s+orders\.([a-z0-9_]+)\s+does not exist/);
          const col = (m1?.[1] || m2?.[1] || '').trim();
          if (col) delete (payload as any)[col];

          if (Object.keys(payload).length === beforeKeys) break;
          insert = await tryInsertOrder(payload);
          continue;
        }
        break;
      }

      if (insert?.error) {
        return NextResponse.json({ error: String((insert.error as any)?.message || 'No se pudo crear la orden.') }, { status: 400 });
      }

      const orderId = String((insert.data as any)?.id || '').trim();
      if (!orderId) return NextResponse.json({ error: 'No se recibió id de la orden.' }, { status: 500 });
      createdOrderIds.push(orderId);
      amount += groupTotal;

      const lines = groupItems.map((it) => {
        const row = listingById[it.listingId];
        const title = String(row?.title || 'Publicación');
        const p = typeof row.price === 'number' ? row.price : Number(row.price ?? 0);
        const unitPrice = Number.isFinite(p) ? p : 0;
        return {
          order_id: orderId,
          listing_id: it.listingId,
          title,
          unit_price: unitPrice,
          quantity: it.quantity,
          line_total: unitPrice * it.quantity,
          selected_size: it.selected_size || null,
          selected_color: it.selected_color || null,
        };
      });

      const itemsIns = await admin.from('order_items').insert(lines);
      if (itemsIns?.error) {
        return NextResponse.json({ error: String((itemsIns.error as any)?.message || 'No se pudo crear los items de la orden.') }, { status: 400 });
      }

      // Notificar al vendedor (best-effort) sin depender del webhook de pago
      try {
        console.log('[CHECKOUT] Creando notificación de nueva venta para vendedor:', { sellerId, orderId });
        const { sendUnifiedNotification } = await import('@/lib/notifications/unified');
        await sendUnifiedNotification(admin, {
          userId: sellerId,
          type: 'new_sale',
          title: '🛒 ¡Nueva venta!',
          body: `Recibiste una nueva compra. Orden: ${orderId.slice(0, 8)}… Esperando confirmación de pago.`,
          data: { 
            kind: 'new_sale',
            orderId, 
            status: 'pending_payment' 
          },
          linkTo: `/dashboard/ventas?order=${orderId}`,
          channels: ['panel'], // Panel primero, email opcional
          priority: 'medium',
        });
        console.log('[CHECKOUT] ✅ Notificación de nueva venta enviada:', { sellerId, orderId });
      } catch (err) {
        console.error('[CHECKOUT] Excepción al crear notificación de nueva venta:', { sellerId, orderId, error: err });
        // Fallback a método anterior si falla
        try {
          const { insertNotificationBestEffort } = await import('@/lib/notifications/insertBestEffort');
          await insertNotificationBestEffort(admin, {
            user_id: sellerId,
            type: 'new_sale',
            title: '🛒 ¡Nueva venta!',
            body: `Recibiste una nueva compra. Orden: ${orderId.slice(0, 8)}… Esperando confirmación de pago.`,
            data: { 
              kind: 'new_sale',
              orderId, 
              status: 'pending_payment' 
            },
            link_to: `/dashboard/ventas?order=${orderId}`,
            is_read: false,
          });
        } catch (fallbackErr) {
          console.error('[CHECKOUT] Error en fallback de notificación:', fallbackErr);
        }
      }
    }

    console.log('[CHECKOUT CREATE] ✅ Órdenes creadas exitosamente:', {
      orderIds: createdOrderIds,
      orderIdsCount: createdOrderIds.length,
      amount,
      payment_method: payment_method,
      isOffline: ['bank_transfer', 'bank_deposit', 'oxxo'].includes(payment_method),
      buyer_id: userData.user.id,
    });
    
    // CRÍTICO: Registrar eventos para panel de admin
    try {
      const { recordAdminEvent } = await import('@/lib/admin/events');
      const { notifyAllAdmins, AdminEventTypes } = await import('@/lib/notifications/admin');
      
      // Registrar evento por cada orden creada
      for (const orderId of createdOrderIds) {
        await recordAdminEvent(admin, {
          event_type: 'order_created',
          entity_type: 'order',
          entity_id: orderId,
          user_id: userData.user.id,
          status: 'pending_payment',
          metadata: {
            payment_method: payment_method,
            amount: amount,
            is_offline: ['bank_transfer', 'bank_deposit', 'oxxo'].includes(payment_method),
            order_ids: createdOrderIds,
          },
        });
      }
      
      // Notificar a admins sobre nueva orden (solo si es de alto valor o offline)
      if (amount >= 5000 || ['bank_transfer', 'bank_deposit', 'oxxo'].includes(payment_method)) {
        await notifyAllAdmins({
          type: AdminEventTypes.ORDER_CREATED,
          title: '🛒 Nueva Orden Creada',
          body: `Orden por ${amount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })} - ${payment_method === 'mercadopago' ? 'MercadoPago' : 'Pago Offline'}`,
          linkTo: `/admin/logistica?order=${createdOrderIds[0]}`,
          data: {
            orderIds: createdOrderIds,
            amount,
            payment_method,
            buyer_id: userData.user.id,
          },
        });
      }
    } catch (eventErr) {
      // No interrumpir el flujo si falla el registro de eventos
      console.error('[CHECKOUT CREATE] Error registrando evento admin:', eventErr);
    }
    
    // CRÍTICO: Verificar que las órdenes realmente se crearon
    if (createdOrderIds.length > 0) {
      const verifyRes: any = await admin
        .from('orders')
        .select('id,payment_method,status')
        .in('id', createdOrderIds)
        .limit(10);
      
      if (!verifyRes.error && Array.isArray(verifyRes.data)) {
        console.log('[CHECKOUT CREATE] ✅ Verificación de órdenes creadas:', {
          expected: createdOrderIds.length,
          found: verifyRes.data.length,
          orders: verifyRes.data.map((o: any) => ({
            id: o?.id,
            payment_method: o?.payment_method,
            status: o?.status,
          })),
        });
        
        // Verificar que todas tienen el payment_method correcto
        const correctPaymentMethod = verifyRes.data.filter((o: any) => 
          String(o?.payment_method || '').trim() === payment_method
        );
        
        if (correctPaymentMethod.length !== verifyRes.data.length) {
          console.error('[CHECKOUT CREATE] ⚠️ ADVERTENCIA: Algunas órdenes no tienen el payment_method correcto:', {
            expected: payment_method,
            orders: verifyRes.data.map((o: any) => ({
              id: o?.id,
              payment_method: o?.payment_method,
            })),
          });
        }
      } else {
        console.error('[CHECKOUT CREATE] ⚠️ ERROR: No se pudieron verificar las órdenes creadas:', verifyRes.error);
      }
    }
    
    const resp = NextResponse.json({ ok: true, orderIds: createdOrderIds, amount });
    resp.headers.set('Cache-Control', 'no-store, max-age=0');
    return resp;
  } catch (e: unknown) {
    console.error(e);
    const resp = NextResponse.json({ error: e instanceof Error ? e.message : 'Unexpected error creating checkout' }, { status: 500 });
    resp.headers.set('Cache-Control', 'no-store, max-age=0');
    return resp;
  }
}

