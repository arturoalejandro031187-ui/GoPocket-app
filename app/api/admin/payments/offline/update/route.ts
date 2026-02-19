import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireAdmin as requireAdminNew } from '@/lib/auth/middleware';
import { handleError } from '@/lib/utils/errors';
import { logActivity } from '@/lib/admin/activity-logger';
import { notifyPaymentApprovedBuyer, notifyPaymentApprovedSellers } from '@/lib/email/notify';

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
  action: 'mark_paid' | 'mark_unpaid' | 'cancel' | 'sync_orders';
  adminName?: string | null;
  force?: boolean; // Opción para forzar aprobación sin verificaciones estrictas
};

export async function POST(req: NextRequest) {
  try {
    const guard = await requireAdmin(req);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
    const { admin, requesterId } = guard;

    const body = (await req.json().catch(() => ({}))) as Partial<Body>;
    let checkoutId = String(body?.checkoutId || '').trim();
    const action = String(body?.action || '').trim() as Body['action'];
    const adminName = String(body?.adminName || '').trim() || null;
    const force = Boolean(body?.force);

    if (!checkoutId) return NextResponse.json({ error: 'checkoutId is required' }, { status: 400 });
    if (!['mark_paid', 'mark_unpaid', 'cancel', 'sync_orders'].includes(action)) return NextResponse.json({ error: 'action inválida' }, { status: 400 });
    if (action === 'mark_paid' && !adminName) return NextResponse.json({ error: 'adminName es requerido para marcar como pagado' }, { status: 400 });
    
    if (force) {
      console.log('[admin/offline-update] ⚠️ MODO FORZADO ACTIVADO');
    }

    // Verificar si es una sesión virtual (empieza con "virtual-")
    const isVirtualSession = checkoutId.startsWith('virtual-');
    let sessionRow: any = null;
    let orderIdsFromVirtual: string[] = [];
    
    if (isVirtualSession) {
      if (action === 'sync_orders') {
        return NextResponse.json({ error: 'No se puede sincronizar una sesión virtual. Primero debe acreditarse.' }, { status: 400 });
      }

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
      checkoutId = newSession.id; // Actualizar checkoutId al real
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

    // Preparar order_ids
    let orderIds: string[] = [];
    const orderIdsRaw = (sessionRow as any)?.order_ids;
    
    if (isVirtualSession) {
      orderIds = orderIdsFromVirtual;
    } else if (Array.isArray(orderIdsRaw)) {
      orderIds = orderIdsRaw;
    } else if (typeof orderIdsRaw === 'string') {
      try {
        if (orderIdsRaw.startsWith('[')) {
          orderIds = JSON.parse(orderIdsRaw);
        } else {
          orderIds = orderIdsRaw.split(',').map((s: string) => s.trim()).filter(Boolean);
        }
      } catch (e) {
        console.error('[admin/offline-update] Error parseando orderIdsRaw string:', e);
      }
    }

    console.log('[admin/offline-update] Datos de sesión:', {
      id: checkoutId,
      action,
      orderIdsCount: orderIds.length,
      orderIds
    });

    let nextStatus = '';
    if (action === 'mark_paid') nextStatus = 'paid';
    else if (action === 'mark_unpaid') nextStatus = 'pending';
    else if (action === 'cancel') nextStatus = 'cancelled';
    
    let upd: any = { data: null, error: null };

    // Si es sync_orders, no actualizamos checkout_sessions, solo ordenes
    if (action !== 'sync_orders') {
      const updatePayload: any = {
        status: nextStatus,
        paid_confirmed_at: action === 'mark_paid' ? new Date().toISOString() : null,
        paid_confirmed_by: action === 'mark_paid' ? requesterId : null,
        paid_confirmed_by_name: action === 'mark_paid' ? adminName : null,
      };

      // Verificar keys de supabase
      const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
      if (!adminKey || adminKey === anonKey) {
        console.error('[admin/offline-update] ⚠️ ERROR CRÍTICO: Configuración de keys inválida');
      }
      
      upd = await admin
        .from('checkout_sessions')
        .update(updatePayload)
        .eq('id', checkoutId)
        .select('id,status,paid_confirmed_at,paid_confirmed_by,updated_at');
      
      // Fallback para columna faltante
      if (upd.error) {
        const msg = String((upd.error as any)?.message || '').toLowerCase();
        if (msg.includes('column') || msg.includes('does not exist')) {
          console.warn('[admin/offline-update] Fallback: quitando paid_confirmed_by_name');
          delete updatePayload.paid_confirmed_by_name;
          upd = await admin.from('checkout_sessions').update(updatePayload).eq('id', checkoutId).select();
        }
      }

      if (upd.error) {
        console.error('[admin/offline-update] Error actualizando checkout_sessions:', upd.error);
        return NextResponse.json({ error: upd.error.message }, { status: 400 });
      }
    } else {
      // Para sync_orders, asumimos que queremos forzar a 'paid' si la sesión está paid
      if (sessionRow.status === 'paid') {
        nextStatus = 'paid';
      } else {
        return NextResponse.json({ error: 'Solo se pueden sincronizar sesiones pagadas.' }, { status: 400 });
      }
    }

    // --- ACTUALIZACIÓN DE ÓRDENES ---
    let updatedOrders = 0;
    let orderUpdateError = null;

    if (orderIds.length > 0 && (action === 'mark_paid' || action === 'sync_orders')) {
      console.log('[admin/offline-update] Sincronizando órdenes a PAID:', orderIds);
      
      const now = new Date().toISOString();
      const orderPayload: any = { 
        status: 'paid',
        paid_at: now
      };

      // Intento 1: Con paid_at
      let oUpd = await admin.from('orders').update(orderPayload).in('id', orderIds).select('id,status');
      
      // Fallback: Sin paid_at si falla
      if (oUpd.error) {
        console.warn('[admin/offline-update] Error actualizando órdenes (con paid_at):', oUpd.error.message);
        delete orderPayload.paid_at;
        oUpd = await admin.from('orders').update(orderPayload).in('id', orderIds).select('id,status');
      }

      if (oUpd.error) {
        console.error('[admin/offline-update] ❌ Error FINAL actualizando órdenes:', oUpd.error);
        orderUpdateError = oUpd.error.message;
      } else {
        updatedOrders = Array.isArray(oUpd.data) ? oUpd.data.length : 0;
        console.log(`[admin/offline-update] ✅ ${updatedOrders} órdenes actualizadas correctamente.`);

        // Enviar notificaciones por email a comprador y vendedores (BACKGROUND)
        if (updatedOrders > 0) {
          console.log('[admin/offline-update] Iniciando notificaciones en background (Fire & Forget)...');
          
          // CRÍTICO: No usamos 'await' aquí para evitar bloquear la respuesta al admin.
          // El usuario reportó delays de ~1 minuto esperando el SMTP.
          // Ejecutamos en background con manejo de errores individual.
          const emailPromises = [];

          // Notificar a comprador
          if (sessionRow?.buyer_id) {
            emailPromises.push(
              notifyPaymentApprovedBuyer({
                buyerId: sessionRow.buyer_id,
                orderIds: orderIds,
                total: sessionRow.amount || 0
              }).catch(e => console.error('[admin/offline-update] Error background comprador:', e))
            );
          }

          // Notificar a vendedores
          emailPromises.push(
            notifyPaymentApprovedSellers({
              admin: admin,
              orderIds: orderIds
            }).catch(e => console.error('[admin/offline-update] Error background vendedores:', e))
          );

          // Log cuando terminen (si el runtime lo permite)
          Promise.allSettled(emailPromises).then(() => {
            console.log('[admin/offline-update] Notificaciones background finalizadas.');
          });
        }
      }
    } else if (orderIds.length > 0 && action === 'mark_unpaid') {
      // Revertir a pending_payment
      await admin.from('orders').update({ status: 'pending_payment', paid_at: null }).in('id', orderIds);
    } else if (orderIds.length > 0 && action === 'cancel') {
      // Cancelar órdenes
      await admin.from('orders').update({ status: 'cancelled' }).in('id', orderIds);
    } else {
      console.warn('[admin/offline-update] No hay order_ids para actualizar.');
    }

    // Registrar actividad
    if (action !== 'sync_orders') {
      await logActivity({
        event_type: `payment_${action}`,
        entity_type: 'checkout_session',
        entity_id: checkoutId,
        admin_id: requesterId || null,
        severity: 'info',
        details: {
          action,
          updated_orders: updatedOrders,
          order_ids: orderIds,
          payment_method: sessionRow.payment_method
        }
      });
    }

    return NextResponse.json({
      ok: true,
      status: nextStatus,
      updatedOrders,
      orderUpdateError,
      message: action === 'sync_orders' 
        ? `Sincronización completada. ${updatedOrders} órdenes actualizadas.` 
        : 'Actualización exitosa'
    });

  } catch (error: any) {
    console.error('[admin/offline-update] Error no controlado:', error);
    return NextResponse.json({ error: error.message || 'Error interno del servidor' }, { status: 500 });
  }
}
