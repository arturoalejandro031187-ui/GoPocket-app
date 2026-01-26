import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireAdmin as requireAdminNew } from '@/lib/auth/middleware';
import { PaymentsRepository } from '@/lib/repositories/payments.repository';
import { OrdersRepository } from '@/lib/repositories/orders.repository';
import { OfflinePaymentService } from '@/lib/services/payments/offline-payment.service';
import { insertNotificationBestEffort } from '@/lib/notifications/insertBestEffort';
import {
  notifyPaymentApprovedBuyer,
  notifyPaymentRejectedBuyer,
  notifyPaymentApprovedSellers,
} from '@/lib/email/notify';
import { handleError } from '@/lib/utils/errors';

export const dynamic = 'force-dynamic';

// Mantener función antigua para compatibilidad con sesiones virtuales
function getBearerToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

async function requireAdmin(req: NextRequest) {
  try {
    const { userId, admin } = await requireAdminNew(req);
    return { ok: true as const, admin, requesterId: userId };
  } catch (error) {
    const { message, statusCode } = handleError(error);
    return { ok: false as const, status: statusCode, error: message };
  }
}

type Body = {
  checkoutId: string;
  action: 'mark_paid' | 'mark_unpaid' | 'cancel';
  adminName?: string | null;
  force?: boolean; // Opción para forzar aprobación sin verificaciones estrictas
};

export async function POST(req: NextRequest) {
  try {
    const guard = await requireAdmin(req);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
    const { admin, requesterId } = guard;

    const body = (await req.json().catch(() => ({}))) as Partial<Body>;
    let checkoutId = String(body?.checkoutId || '').trim(); // Cambiar a 'let' para permitir reasignación
    const action = String(body?.action || '').trim() as Body['action'];
    const adminName = String(body?.adminName || '').trim() || null;
    const force = Boolean(body?.force); // Extraer parámetro force
    if (!checkoutId) return NextResponse.json({ error: 'checkoutId is required' }, { status: 400 });
    if (!['mark_paid', 'mark_unpaid', 'cancel'].includes(action)) return NextResponse.json({ error: 'action inválida' }, { status: 400 });
    if (action === 'mark_paid' && !adminName) return NextResponse.json({ error: 'adminName es requerido para marcar como pagado' }, { status: 400 });
    
    if (force) {
      console.log('[admin/offline-update] ⚠️ MODO FORZADO: Se omitirán verificaciones estrictas para forzar la aprobación');
    }

    // Verificar si es una sesión virtual (empieza con "virtual-")
    const isVirtualSession = checkoutId.startsWith('virtual-');
    let sessionRow: any = null;
    let orderIdsFromVirtual: string[] = [];
    
    if (isVirtualSession) {
      // Es una sesión virtual, extraer orderId y crear sesión real
      const orderId = checkoutId.replace('virtual-', '');
      console.log('[admin/offline-update] Sesión virtual detectada, creando sesión real para orden:', orderId);
      
      // Obtener datos de la orden
      const { data: orderData, error: orderErr } = await admin
        .from('orders')
        .select('id,buyer_id,payment_method,status,total,commission_fee,shipping_fee,created_at')
        .eq('id', orderId)
        .maybeSingle();
      
      if (orderErr || !orderData) {
        console.error('[admin/offline-update] Error obteniendo orden para sesión virtual:', orderErr);
        return NextResponse.json({ error: 'Orden no encontrada para sesión virtual.' }, { status: 404 });
      }
      
      const paymentMethod = String((orderData as any)?.payment_method || '').trim();
      if (!['bank_transfer', 'bank_deposit', 'oxxo'].includes(paymentMethod)) {
        return NextResponse.json({ error: 'La orden no es un pago offline.' }, { status: 400 });
      }
      
      // Obtener instrucciones de pago
      const { data: settingsRow } = await admin.from('app_settings').select('payment_methods').eq('id', 1).maybeSingle();
      const pm = (settingsRow as any)?.payment_methods ?? {};
      const instructions =
        paymentMethod === 'bank_transfer'
          ? pm?.bank_transfer ?? {}
          : paymentMethod === 'bank_deposit'
            ? pm?.bank_deposit ?? {}
            : pm?.oxxo ?? {};
      
      // Generar referencia
      const d = new Date();
      const yy = String(d.getUTCFullYear()).slice(-2);
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(d.getUTCDate()).padStart(2, '0');
      const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
      const reference_code = `PCK-${yy}${mm}${dd}-${rand}`;
      
      const amount = typeof (orderData as any)?.total === 'number' 
        ? (orderData as any).total 
        : Number((orderData as any)?.total ?? 0) || 0;
      
      // Crear sesión real
      const newSessionPayload: any = {
        buyer_id: (orderData as any).buyer_id,
        order_ids: [orderId],
        payment_method: paymentMethod,
        status: 'pending',
        amount,
        reference_code,
        offline_instructions: instructions,
      };
      
      const { data: newSession, error: createErr } = await admin
        .from('checkout_sessions')
        .insert([newSessionPayload])
        .select('id,buyer_id,order_ids,status,payment_method,reference_code')
        .single();
      
      if (createErr || !newSession) {
        console.error('[admin/offline-update] Error creando sesión real desde virtual:', createErr);
        return NextResponse.json({ error: `No se pudo crear sesión real: ${createErr?.message || 'Error desconocido'}` }, { status: 400 });
      }
      
      console.log('[admin/offline-update] ✅ Sesión real creada desde virtual:', { id: newSession.id, orderId });
      sessionRow = newSession;
      orderIdsFromVirtual = [orderId];
    } else {
      // Sesión real, obtener normalmente
      const { data: session, error: sErr } = await admin
        .from('checkout_sessions')
        .select('id,buyer_id,order_ids,status,payment_method,reference_code')
        .eq('id', checkoutId)
        .maybeSingle();
      
      if (sErr) {
        console.error('[admin/offline-update] Error obteniendo sesión:', sErr);
        return NextResponse.json({ error: sErr.message }, { status: 400 });
      }
      if (!session) {
        console.error('[admin/offline-update] Sesión no encontrada:', checkoutId);
        return NextResponse.json({ error: 'Sesión no encontrada.' }, { status: 404 });
      }
      sessionRow = session;
    }
    
    if (isVirtualSession && sessionRow) {
      checkoutId = (sessionRow as any).id;
    }
    
    const nextStatus = action === 'mark_paid' ? 'paid' : action === 'mark_unpaid' ? 'pending' : 'cancelled';
    const updatePayload: any = {
      status: nextStatus,
      paid_confirmed_at: action === 'mark_paid' ? new Date().toISOString() : null,
      paid_confirmed_by: action === 'mark_paid' ? requesterId : null,
      paid_confirmed_by_name: action === 'mark_paid' ? adminName : null,
    };
    
    // Verificar que el cliente admin está configurado correctamente
    const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    if (!adminKey) {
      console.error('[admin/offline-update] ⚠️ ERROR CRÍTICO: SUPABASE_SERVICE_ROLE_KEY no está configurada');
      return NextResponse.json({ 
        error: 'Error de configuración del servidor: SUPABASE_SERVICE_ROLE_KEY no está configurada. Verifica las variables de entorno en Vercel.' 
      }, { status: 500 });
    }
    if (adminKey === anonKey) {
      console.error('[admin/offline-update] ⚠️ ERROR CRÍTICO: SUPABASE_SERVICE_ROLE_KEY es igual a ANON_KEY');
      return NextResponse.json({ 
        error: 'Error de configuración: SUPABASE_SERVICE_ROLE_KEY es igual a ANON_KEY. Debe ser la key "service_role" de Supabase, no la "anon".' 
      }, { status: 500 });
    }
    
    // CRÍTICO: Hacer el update y verificar inmediatamente que funcionó
    let upd: any = await admin
      .from('checkout_sessions')
      .update(updatePayload)
      .eq('id', checkoutId)
      .select('id,status,paid_confirmed_at,paid_confirmed_by,updated_at'); // Seleccionar para verificar
    
    if (upd.error) {
      console.error('[admin/offline-update] Error actualizando checkout_sessions:', upd.error);
    } else if (!upd.data || (Array.isArray(upd.data) && upd.data.length === 0)) {
      console.error('[admin/offline-update] ⚠️ ADVERTENCIA: Update no devolvió datos');
    }
    
    if (upd.error) {
      const code = String((upd.error as any)?.code || '');
      const msg = String((upd.error as any)?.message || '').toLowerCase();
      if (code === '42703' || msg.includes('column') || msg.includes('does not exist')) {
        // Fallback: si no existe paid_confirmed_by_name, intentar sin ese campo
        const fallbackPayload: any = {
          status: nextStatus,
          paid_confirmed_at: action === 'mark_paid' ? new Date().toISOString() : null,
          paid_confirmed_by: action === 'mark_paid' ? requesterId : null,
        };
        const upd2: any = await admin.from('checkout_sessions').update(fallbackPayload).eq('id', checkoutId);
        if (upd2.error) {
          // Si aún falla, solo actualizar status
          const upd3: any = await admin.from('checkout_sessions').update({ status: nextStatus }).eq('id', checkoutId);
          if (upd3.error) {
            const resp = NextResponse.json(
              { error: `No se pudo actualizar checkout_sessions: ${String((upd3.error as any)?.message || upd3.error)}` },
              { status: 400 },
            );
            resp.headers.set('Cache-Control', 'no-store, max-age=0');
            return resp;
          }
        }
      } else {
        const resp = NextResponse.json({ error: upd.error.message }, { status: 400 });
        resp.headers.set('Cache-Control', 'no-store, max-age=0');
        return resp;
      }
    }

    const orderIdsRaw = (sessionRow as any)?.order_ids;
    let orderIds: string[] = [];
    
    if (isVirtualSession) {
      orderIds = orderIdsFromVirtual;
    } else if (Array.isArray(orderIdsRaw)) {
      orderIds = orderIdsRaw;
    }

    const paymentMethod = String((sessionRow as any)?.payment_method || '').trim();
    
    let updatedOrders = 0;
    let orderUpdateError: string | null = null;

    if (orderIds.length === 0) {
      console.warn('[admin/offline-update] ⚠️ ADVERTENCIA: La sesión no tiene order_ids asociados. Esto puede causar que las órdenes no se actualicen.');
      // Continuar con la actualización de checkout_sessions aunque no haya order_ids
    }

    if (orderIds.length > 0) {
      const now = new Date().toISOString();
      const nextOrderStatus = action === 'mark_paid' ? 'paid' : action === 'mark_unpaid' ? 'pending_payment' : 'cancelled';
      
      // Actualizar órdenes con status y paid_at (si existe la columna)
      const orderUpdatePayload: any = { status: nextOrderStatus };
      if (action === 'mark_paid') {
        orderUpdatePayload.paid_at = now;
      } else if (action === 'mark_unpaid') {
        orderUpdatePayload.paid_at = null;
      }
      
      
      // CRÍTICO: Actualizar órdenes de forma atómica y verificar inmediatamente
      // CRÍTICO: Usar .select() después de update para obtener los datos actualizados
      // También forzar la actualización sin condiciones adicionales que puedan fallar
      const oUpd: any = await admin
        .from('orders')
        .update(orderUpdatePayload)
        .in('id', orderIds)
        .select('id,status,paid_at');
      
      if (oUpd.error) {
        const code = String((oUpd.error as any)?.code || '');
        const msg = String((oUpd.error as any)?.message || '').toLowerCase();
        const details = String((oUpd.error as any)?.details || '');
        const hint = String((oUpd.error as any)?.hint || '');
        console.error('[admin/offline-update] Error actualizando órdenes:', { code, msg, details, hint, error: oUpd.error });
        
        // Si falla por columna faltante, intentar solo con status
        if (code === '42703' || msg.includes('column') || msg.includes('does not exist')) {
          console.warn('[admin/offline-update] Columna paid_at no existe, usando fallback solo con status');
          const fallbackPayload: any = { status: nextOrderStatus };
          const oUpd2: any = await admin.from('orders').update(fallbackPayload).in('id', orderIds).select('id,status');
          if (oUpd2.error) {
            console.error('[admin/offline-update] Error en fallback:', oUpd2.error);
            orderUpdateError = String((oUpd2.error as any)?.message || oUpd2.error);
          } else {
            updatedOrders = Array.isArray(oUpd2.data) ? oUpd2.data.length : 0;
            console.log('[admin/offline-update] Fallback exitoso, órdenes actualizadas:', updatedOrders);
          }
        } else {
          orderUpdateError = `${msg} (Code: ${code}). ${details ? `Details: ${details}` : ''}`;
        }
      } else {
        updatedOrders = Array.isArray(oUpd.data) ? oUpd.data.length : 0;
        
        if (updatedOrders === 0) {
          console.error('[admin/offline-update] ⚠️ ERROR: No se actualizó ninguna orden');
          orderUpdateError = 'No se actualizó ninguna orden. Verifica que los order_ids sean correctos.';
        } else if (Array.isArray(oUpd.data) && oUpd.data.length > 0) {
          const statuses = oUpd.data.map((o: any) => String(o?.status || '')).filter(Boolean);
          const uniqueStatuses = Array.from(new Set(statuses));
          if (uniqueStatuses.length === 1 && uniqueStatuses[0] !== nextOrderStatus) {
            console.error('[admin/offline-update] ⚠️ ERROR: El status no coincide. Esperado:', nextOrderStatus, 'Obtenido:', uniqueStatuses[0]);
            orderUpdateError = `El status no se actualizó correctamente. Esperado: ${nextOrderStatus}, pero se obtuvo: ${uniqueStatuses[0]}`;
          }
        }
        
      }
    }

    if (orderUpdateError) {
      // CRÍTICO: NO REVERTIR la sesión automáticamente - esto causa que el pago vuelva a aparecer como pendiente
      // En su lugar, continuar con la actualización de la sesión y reportar el error en la respuesta
      // El admin puede corregir las órdenes manualmente si es necesario, pero el pago quedará marcado como pagado
      console.warn('[admin/offline-update] ⚠️ ADVERTENCIA: Las órdenes no se actualizaron correctamente, pero NO revirtiendo la sesión:', {
        orderUpdateError,
        checkoutId,
        force,
      });
      
      // Solo fallar si NO es force y el error es crítico (no es solo una advertencia)
      if (!force && orderUpdateError.includes('ERROR CRÍTICO')) {
        const resp = NextResponse.json({ 
          error: `No se pudieron actualizar las órdenes: ${orderUpdateError}. La sesión se mantiene como pagada. Usa el botón "Forzar" si el pago ya fue confirmado y necesitas actualizar las órdenes manualmente.`,
          ok: false,
          debug: {
            checkoutId,
            paymentMethod,
            orderIds,
            orderIdsCount: orderIds.length,
            orderUpdateError,
          }
        }, { status: 400 });
        resp.headers.set('Cache-Control', 'no-store, max-age=0');
        return resp;
      }
      
      // Si es force o es solo una advertencia, continuar pero reportar el error
      console.warn('[admin/offline-update] Continuando con la actualización de la sesión a pesar del error en órdenes');
    }
    
    // Si no hay orderIds pero la sesión se actualizó, devolver éxito parcial
    if (orderIds.length === 0) {
      console.warn('[admin/offline-update] Sesión actualizada pero sin order_ids. Esto puede indicar un problema en la creación de la sesión.');
      const resp = NextResponse.json({
        ok: true,
        status: verifiedStatus,
        updatedOrders: 0,
        notifiedSellers: 0,
        notifyErrors: [],
        session: verify.data,
        warning: 'La sesión se actualizó pero no se encontraron órdenes asociadas. Verifica que las órdenes estén correctamente vinculadas a esta sesión de checkout.',
        paidAtStatus: null,
      });
      resp.headers.set('Cache-Control', 'no-store, max-age=0');
      return resp;
    }

    // Notificar al vendedor cuando se confirma el pago
    let notifiedSellers = 0;
    const notifyErrors: Array<{ seller_id?: string; order_id?: string; code?: string; message?: string }> = [];
    if (action === 'mark_paid' && orderIds.length > 0) {
      const ordersRes: any = await admin.from('orders').select('id,seller_id,total').in('id', orderIds).limit(200);
      if (ordersRes.error) {
        console.log('[admin/offline-update] notifications skipped: cannot read seller_id from orders', {
          code: String((ordersRes.error as any)?.code || ''),
          message: String((ordersRes.error as any)?.message || ''),
        });
      }
      if (!ordersRes.error && Array.isArray(ordersRes.data)) {
        for (const o of ordersRes.data as any[]) {
          const sellerId = String(o?.seller_id || '').trim();
          const orderId = String(o?.id || '').trim();
          if (!sellerId || !orderId) continue;
          const ref = String((sessionRow as any)?.reference_code || '').trim();
          const pm = String((sessionRow as any)?.payment_method || '').trim();
          // Usar sistema unificado de notificaciones
          try {
            const { sendUnifiedNotification } = await import('@/lib/notifications/unified');
            const result = await sendUnifiedNotification(admin, {
              userId: sellerId,
              type: 'sale_paid',
              title: '💰 Pago confirmado',
              body: `Se confirmó el pago (${pm || 'offline'}) de una compra. Orden: ${orderId.slice(0, 8)}…${ref ? ` · Ref: ${ref}` : ''}`,
              data: { 
                kind: 'sale_paid',
                orderId, 
                checkoutId, 
                reference_code: ref || null, 
                payment_method: pm || null 
              },
              linkTo: `/dashboard/ventas?order=${orderId}`,
              channels: ['both'], // Panel + Email
              priority: 'high',
            });
            if (result.panel.ok || result.email.ok) {
              notifiedSellers += 1;
            } else {
              notifyErrors.push({ 
                seller_id: sellerId, 
                order_id: orderId, 
                code: 'unified_failed', 
                message: result.panel.error || result.email.error 
              });
            }
          } catch (unifiedErr) {
            // Fallback a método anterior
            const { insertNotificationBestEffort } = await import('@/lib/notifications/insertBestEffort');
            const payload: any = {
              user_id: sellerId,
              type: 'sale_paid',
              title: 'Pago confirmado',
              body: `Se confirmó el pago (${pm || 'offline'}) de una compra. Orden: ${orderId.slice(0, 8)}…${ref ? ` · Ref: ${ref}` : ''}`,
              data: { 
                kind: 'sale_paid',
                orderId, 
                checkoutId, 
                reference_code: ref || null, 
                payment_method: pm || null 
              },
              link_to: `/dashboard/ventas?order=${orderId}`,
              is_read: false,
            };
            const ins = await insertNotificationBestEffort(admin, payload);
            if (ins.ok) notifiedSellers += 1;
            else notifyErrors.push({ seller_id: sellerId, order_id: orderId, code: (ins as any).code, message: (ins as any).message });
          }
        }
      }
      void notifyPaymentApprovedSellers({ admin, orderIds }).catch((e) =>
        console.warn('[offline-update] email notifyPaymentApprovedSellers:', e)
      );
    }

    // Notificar al comprador (pago acreditado / cancelado) - best-effort
    const buyerId = String((sessionRow as any)?.buyer_id || '').trim();
    const ref = String((sessionRow as any)?.reference_code || '').trim();
    const pm = String((sessionRow as any)?.payment_method || '').trim();
    try {
      if (buyerId) {
        if (action === 'mark_paid') {
          // Usar sistema unificado de notificaciones
          try {
            const { sendUnifiedNotification } = await import('@/lib/notifications/unified');
            await sendUnifiedNotification(admin, {
              userId: buyerId,
              type: 'payment_approved',
              title: '✅ Pago acreditado',
              body: `Tu pago fue confirmado (${pm || 'offline'})${ref ? ` · Ref: ${ref}` : ''}.`,
              data: { 
                kind: 'payment_approved',
                checkoutId, 
                reference_code: ref || null, 
                payment_method: pm || null,
                orderIds: orderIds.length > 0 ? orderIds : undefined,
              },
              linkTo: orderIds.length > 0 ? `/dashboard/compras?order=${orderIds[0]}` : '/dashboard/compras',
              channels: ['both'], // Panel + Email
              priority: 'high',
              emailTemplate: 'payment_approved',
            });
          } catch (unifiedErr) {
            // Fallback a método anterior
            const { insertNotificationBestEffort } = await import('@/lib/notifications/insertBestEffort');
            await insertNotificationBestEffort(admin, {
              user_id: buyerId,
              type: 'payment_approved',
              title: 'Pago acreditado',
              body: `Tu pago fue confirmado (${pm || 'offline'})${ref ? ` · Ref: ${ref}` : ''}.`,
              data: { 
                kind: 'payment_approved',
                checkoutId, 
                reference_code: ref || null, 
                payment_method: pm || null 
              },
              link_to: orderIds.length > 0 ? `/dashboard/compras?order=${orderIds[0]}` : '/dashboard/compras',
              is_read: false,
            });
          }
          if (orderIds.length > 0) {
            let total: number | undefined;
            const { data: ords } = await admin.from('orders').select('total').in('id', orderIds);
            if (Array.isArray(ords)) total = (ords as any[]).reduce((s, o) => s + Number(o?.total ?? 0), 0);
            void notifyPaymentApprovedBuyer({ buyerId, orderIds, total }).catch((e) =>
              console.warn('[offline-update] email notifyPaymentApprovedBuyer:', e)
            );
          }
        } else if (action === 'mark_unpaid') {
          await insertNotificationBestEffort(admin, {
            user_id: buyerId,
            type: 'payment_rejected',
            title: 'Pago en revisión',
            body: `Tu pago quedó en revisión${ref ? ` · Ref: ${ref}` : ''}. Si ya pagaste, revisa con soporte.`,
            data: { checkoutId, reference_code: ref || null, payment_method: pm || null },
            is_read: false,
          });
        } else if (action === 'cancel') {
          await insertNotificationBestEffort(admin, {
            user_id: buyerId,
            type: 'payment_rejected',
            title: 'Pago cancelado',
            body: `Tu pago fue cancelado${ref ? ` · Ref: ${ref}` : ''}.`,
            data: { checkoutId, reference_code: ref || null, payment_method: pm || null },
            is_read: false,
          });
        }
      }
    } catch {
      // noop
    }

    // Verificar que la sesión se actualizó correctamente
    await new Promise(resolve => setTimeout(resolve, 150));
    
    let verify: any = await admin
      .from('checkout_sessions')
      .select('id,status,paid_confirmed_at,paid_confirmed_by,updated_at')
      .eq('id', checkoutId)
      .maybeSingle();
    
    if (verify.error) {
      const code = String((verify.error as any)?.code || '');
      const msg = String((verify.error as any)?.message || '').toLowerCase();
      if (code === '42703' || msg.includes('column')) {
        verify = await admin.from('checkout_sessions').select('id,status').eq('id', checkoutId).maybeSingle();
      }
    }
    
    if (verify.error || !verify.data) {
      const resp = NextResponse.json(
        { error: `No se pudo verificar el estado final: ${verify.error ? String((verify.error as any)?.message || verify.error) : 'Sesión no encontrada'}` },
        { status: 400 },
      );
      resp.headers.set('Cache-Control', 'no-store, max-age=0');
      return resp;
    }

    // Notificar a administradores cuando se marca un pago offline como pagado
    if (action === 'mark_paid' && orderIds.length > 0) {
      try {
        // Import dinámico para evitar errores de build
        const { notifyAdmin } = await import('@/lib/notifications/admin');
        let total: number | undefined;
        const { data: ords } = await admin.from('orders').select('total').in('id', orderIds);
        if (Array.isArray(ords)) total = (ords as any[]).reduce((s, o) => s + Number(o?.total ?? 0), 0);
        const firstOrderId = orderIds[0];
        const { data: firstOrder } = await admin.from('orders').select('buyer_id, seller_id').eq('id', firstOrderId).maybeSingle();
        if (firstOrder && total) {
          await notifyAdmin.paymentApproved({
            orderId: firstOrderId,
            amount: total,
            buyerId: String(firstOrder.buyer_id || ''),
            sellerId: String(firstOrder.seller_id || ''),
          });
        }
      } catch (adminNotifyErr) {
        // Si falla el import o la notificación, solo loguear (no crítico)
        console.warn('[offline-update] No se pudo notificar a administradores (no crítico):', adminNotifyErr);
      }
    }

    // CRÍTICO: Registrar evento para panel de admin (después de verificar que funcionó)
    try {
      const { recordAdminEvent } = await import('@/lib/admin/events');
      await recordAdminEvent(admin, {
        event_type: action === 'mark_paid' ? 'payment_offline_confirmed' : action === 'mark_unpaid' ? 'payment_offline_unconfirmed' : 'payment_offline_cancelled',
        entity_type: 'payment',
        entity_id: checkoutId,
        admin_id: requesterId,
        status: action === 'mark_paid' ? 'completed' : 'pending',
        metadata: {
          action,
          payment_method: paymentMethod,
          order_ids: orderIds,
          amount: typeof (sessionRow as any)?.amount === 'number' ? (sessionRow as any).amount : 0,
          reference_code: String((sessionRow as any)?.reference_code || ''),
          updated_orders: updatedOrders,
        },
      });
    } catch (eventErr) {
      console.error('[admin/offline-update] Error registrando evento admin:', eventErr);
    }

    const verifiedStatus = String((verify.data as any)?.status || '').trim();
    if (!verifiedStatus || verifiedStatus !== nextStatus) {
      const resp = NextResponse.json(
        {
          error: verifiedStatus ? `La sesión no cambió de estado (sigue en "${verifiedStatus}").` : 'No se pudo leer el estado de la sesión.',
          ok: false,
          verifiedStatus,
          expectedStatus: nextStatus,
          updatedOrders,
        },
        { status: 400 },
      );
      resp.headers.set('Cache-Control', 'no-store, max-age=0');
      return resp;
    }
    
    // VERIFICACIÓN CRÍTICA: Si hay orderIds, verificar que las órdenes realmente se actualizaron
    if (orderIds.length > 0 && action === 'mark_paid' && !force) {
      const finalOrderCheck: any = await admin
        .from('orders')
        .select('id,status,paid_at')
        .in('id', orderIds)
        .limit(100);
      
      if (!finalOrderCheck.error && Array.isArray(finalOrderCheck.data)) {
        const ordersWithCorrectStatus = finalOrderCheck.data.filter((o: any) => {
          const oStatus = String(o?.status || '').trim().toLowerCase();
          return oStatus === 'paid';
        });
        
        console.log('[admin/offline-update] Verificación final de órdenes:', {
          total: finalOrderCheck.data.length,
          expected: orderIds.length,
          withStatusPaid: ordersWithCorrectStatus.length,
        });
        
        // Si ninguna orden tiene status 'paid', es un error pero NO revertimos para evitar loops
        if (ordersWithCorrectStatus.length === 0) {
          console.error('[admin/offline-update] ⚠️ ERROR: Ninguna orden se actualizó a "paid".');
          // No fallamos la petición para que el pago quede registrado, pero logueamos el error.
        }
      }
    }

    // Verificar paid_at (solo para reportar advertencia, no crítico)
    let paidAtStatus: { verified: boolean; warning?: string } | null = null;
    if (action === 'mark_paid' && orderIds.length > 0) {
      try {
        const paidAtCheck: any = await admin
          .from('orders')
          .select('id,paid_at')
          .in('id', orderIds)
          .limit(5);
        if (!paidAtCheck.error && Array.isArray(paidAtCheck.data)) {
          const withPaidAt = paidAtCheck.data.filter((o: any) => o?.paid_at != null);
          paidAtStatus = {
            verified: withPaidAt.length > 0,
            warning: withPaidAt.length === 0 ? 'La columna paid_at no se actualizó. Ejecuta supabase_orders_paid_at.sql en Supabase.' : undefined,
          };
        }
      } catch (e) {
        // No crítico, solo loguear
        console.warn('[admin/offline-update] Error verificando paid_at:', e);
      }
    }
    
    const responseData: any = {
      ok: true,
      status: verifiedStatus,
      updatedOrders,
      notifiedSellers,
      notifyErrors,
      session: verify.data,
      paidAtStatus,
    };
    
    // Si era sesión virtual, indicarlo en la respuesta
    if (isVirtualSession && sessionRow) {
      responseData.was_virtual = true;
      responseData.created_session_id = (sessionRow as any)?.id;
      console.log('[admin/offline-update] ✅ Sesión virtual convertida a real y procesada:', {
        originalCheckoutId: checkoutId,
        newSessionId: (sessionRow as any)?.id,
      });
    }
    
    const resp = NextResponse.json(responseData);
    resp.headers.set('Cache-Control', 'no-store, max-age=0');
    return resp;
  } catch (e: unknown) {
    console.error(e);
    const resp = NextResponse.json({ error: e instanceof Error ? e.message : 'Unexpected error' }, { status: 500 });
    resp.headers.set('Cache-Control', 'no-store, max-age=0');
    return resp;
  }
}

