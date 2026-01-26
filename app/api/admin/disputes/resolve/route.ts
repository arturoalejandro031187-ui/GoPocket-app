import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { insertNotificationBestEffort } from '@/lib/notifications/insertBestEffort';
import { notifyDisputeResolved } from '@/lib/email/notify';

export const dynamic = 'force-dynamic';

function getBearerToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

async function requireAdmin(req: NextRequest) {
  const token = getBearerToken(req);
  if (!token) return { ok: false as const, status: 401, error: 'Missing Authorization Bearer token' };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !supabaseAnon) return { ok: false as const, status: 500, error: 'Supabase env vars missing on server' };

  const supabase = createClient(supabaseUrl, supabaseAnon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr) return { ok: false as const, status: 401, error: userErr.message };
  if (!userData.user) return { ok: false as const, status: 401, error: 'Unauthorized' };

  const admin = supabaseAdmin();
  const { data: row, error } = await admin.from('admin_users').select('user_id').eq('user_id', userData.user.id).maybeSingle();
  if (error) return { ok: false as const, status: 400, error: error.message };
  if (!row) return { ok: false as const, status: 403, error: 'No autorizado (admin requerido).' };

  return { ok: true as const, admin, requesterId: userData.user.id };
}

const VALID_DECISIONS = [
  'release',
  'refund',
  'close',
  'assign_return_tracking',
  'keep_money_seller',
  'partial_refund_seller',
  'partial_refund_buyer',
  'refund_buyer_minus_fees',
  'refund_seller_minus_fees',
  'assign_guide_charged_buyer',
  'assign_guide_charged_seller',
] as const;

type Body = {
  disputeId: string;
  decision: (typeof VALID_DECISIONS)[number];
  note?: string;
  return_tracking?: string;
  return_guide_url?: string;
  return_guide_cost?: number;
  partial_amount?: number;
  admin_name_confirm?: string;
};

function n(v: unknown): number {
  const x = typeof v === 'number' ? v : Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

export async function POST(req: NextRequest) {
  let orderUpdateError: string | null = null;
  try {
    const guard = await requireAdmin(req);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
    const { admin, requesterId } = guard;

    const body = (await req.json().catch(() => ({}))) as Partial<Body>;
    const disputeId = String(body?.disputeId || '').trim();
    const decision = String(body?.decision || '').trim() as Body['decision'];
    const note = String(body?.note || '').trim();
    const partialAmount = n(body?.partial_amount);
    const adminNameConfirm = String(body?.admin_name_confirm ?? '').trim();

    if (!disputeId || !isUuid(disputeId)) return NextResponse.json({ error: 'disputeId inválido' }, { status: 400 });
    if (!VALID_DECISIONS.includes(decision as any)) {
      return NextResponse.json({ error: 'decision inválida' }, { status: 400 });
    }
    if (note.length > 800) return NextResponse.json({ error: 'note demasiado larga (máx. 800).' }, { status: 400 });
    const returnTracking = String(body?.return_tracking || '').trim();
    const returnGuideUrl = String(body?.return_guide_url || '').trim();
    const returnGuideCost = n(body?.return_guide_cost);

    const { data: d, error: dErr } = await admin
      .from('disputes')
      .select('id,order_id,buyer_id,seller_id,status,created_at')
      .eq('id', disputeId)
      .maybeSingle();
    if (dErr) return NextResponse.json({ error: dErr.message }, { status: 400 });
    if (!d) return NextResponse.json({ error: 'Disputa no encontrada.' }, { status: 404 });

    const orderId = String((d as any)?.order_id || '').trim();
    const buyerId = String((d as any)?.buyer_id || '').trim();
    const sellerId = String((d as any)?.seller_id || '').trim();
    const disputeCreatedAt = String((d as any)?.created_at || '').trim();

    const canUse72h = disputeCreatedAt ? (Date.now() - new Date(disputeCreatedAt).getTime()) >= 72 * 60 * 60 * 1000 : false;
    const requires72h = ['assign_return_tracking', 'keep_money_seller'];
    if (requires72h.includes(decision) && !canUse72h) {
      return NextResponse.json({ error: 'Las resoluciones definitivas solo están disponibles después de 72 horas desde la apertura de la disputa.' }, { status: 400 });
    }
    if (decision === 'assign_return_tracking' && !returnTracking) {
      return NextResponse.json({ error: 'Se requiere el código de rastreo de devolución.' }, { status: 400 });
    }
    if ((decision === 'assign_guide_charged_buyer' || decision === 'assign_guide_charged_seller') && (!returnGuideUrl || !returnTracking)) {
      return NextResponse.json({ error: 'Se requiere subir la guía de devolución y escribir el número de rastreo.' }, { status: 400 });
    }
    if ((decision === 'assign_guide_charged_buyer' || decision === 'assign_guide_charged_seller') && (returnGuideCost <= 0 || !Number.isFinite(returnGuideCost))) {
      return NextResponse.json({ error: 'Se requiere el costo de la guía (MXN) mayor a 0.' }, { status: 400 });
    }

    const needsAdminName = [
      'partial_refund_seller',
      'partial_refund_buyer',
      'refund_buyer_minus_fees',
      'refund_seller_minus_fees',
      'assign_guide_charged_buyer',
      'assign_guide_charged_seller',
    ].includes(decision);
    if (needsAdminName) {
      const { data: prof } = await admin.from('profiles').select('full_name').eq('id', requesterId).maybeSingle();
      const adminFullName = String((prof as any)?.full_name ?? '').trim().toLowerCase();
      const typed = adminNameConfirm.trim().toLowerCase();
      if (!adminFullName || !typed) {
        return NextResponse.json({ error: 'Debes escribir tu nombre (asesor) para confirmar esta resolución.' }, { status: 400 });
      }
      if (!adminFullName.includes(typed) && !typed.includes(adminFullName)) {
        return NextResponse.json({ error: 'El nombre no coincide con tu perfil.' }, { status: 400 });
      }
    }

    let orderSubtotal = 0;
    let orderShipping = 0;
    let orderCommission = 0;
    let orderTotal = 0;
    let availableSeller = 0;
    let availableBuyer = 0;
    let refundMinusFees = 0;
    if (orderId) {
      const ord: any = await admin.from('orders').select('subtotal,shipping_fee,commission_fee,total').eq('id', orderId).maybeSingle();
      if (ord.error) {
        console.error('[DISPUTES/RESOLVE] Error obteniendo orden:', ord.error);
      } else {
        const o = ord.data; // Corregir: usar ord.data directamente, no (ord as any)?.data
        if (o) {
          orderSubtotal = n(o.subtotal);
          orderShipping = n(o.shipping_fee);
          orderCommission = n(o.commission_fee);
          orderTotal = n(o.total);
          availableSeller = Math.max(0, orderSubtotal + orderShipping - orderCommission);
          availableBuyer = orderTotal;
          refundMinusFees = Math.max(0, orderTotal - orderCommission - orderShipping);
          
          console.log('[DISPUTES/RESOLVE] Datos de orden obtenidos:', {
            orderId,
            subtotal: orderSubtotal,
            shipping: orderShipping,
            commission: orderCommission,
            total: orderTotal,
            availableSeller,
            availableBuyer,
            refundMinusFees,
          });
        } else {
          console.warn('[DISPUTES/RESOLVE] Orden no encontrada:', orderId);
        }
      }
    }

    if (decision === 'partial_refund_seller') {
      if (partialAmount <= 0) return NextResponse.json({ error: 'Indica el monto parcial a devolver al vendedor.' }, { status: 400 });
      if (partialAmount > availableSeller) {
        return NextResponse.json({ error: `El monto no puede superar lo disponible para el vendedor ($${availableSeller.toFixed(2)}).` }, { status: 400 });
      }
    }
    if (decision === 'partial_refund_buyer') {
      if (partialAmount <= 0) return NextResponse.json({ error: 'Indica el monto parcial a devolver al comprador.' }, { status: 400 });
      if (partialAmount > availableBuyer) {
        return NextResponse.json({ error: `El monto no puede superar lo disponible para reembolso ($${availableBuyer.toFixed(2)}).` }, { status: 400 });
      }
    }

    const noteWithPartial =
      decision === 'partial_refund_seller' || decision === 'partial_refund_buyer'
        ? (note ? `${note}\n\nMonto: $${partialAmount.toFixed(2)}` : `Monto: $${partialAmount.toFixed(2)}`)
        : note;

    const nextDisputeStatus = decision === 'close' ? 'closed' : 'resolved';
    const updatePayload: Record<string, unknown> = {
      status: nextDisputeStatus,
      admin_decision: decision,
      admin_note: noteWithPartial || null,
    };
    if (decision === 'assign_guide_charged_buyer' || decision === 'assign_guide_charged_seller') {
      updatePayload.return_guide_url = returnGuideUrl;
      updatePayload.return_tracking = returnTracking;
      updatePayload.return_guide_charged_to = decision === 'assign_guide_charged_buyer' ? 'buyer' : 'seller';
      updatePayload.return_guide_cost = Math.max(0, returnGuideCost);
    }
    
    console.log('[DISPUTES/RESOLVE] Actualizando disputa:', {
      disputeId,
      decision,
      nextDisputeStatus,
      updatePayload,
    });
    
    // CRÍTICO: Actualizar y seleccionar para verificar inmediatamente
    const upd: any = await admin
      .from('disputes')
      .update(updatePayload)
      .eq('id', disputeId)
      .select('id,status,admin_decision,updated_at');
    
    console.log('[DISPUTES/RESOLVE] Resultado de update:', {
      error: upd.error,
      data: upd.data,
      dataCount: Array.isArray(upd.data) ? upd.data.length : 0,
    });
    
    if (upd.error) {
      console.error('[DISPUTES/RESOLVE] Error actualizando disputa:', upd.error);
      return NextResponse.json({ error: upd.error.message }, { status: 400 });
    }
    
    // Verificar que el update realmente funcionó
    if (!upd.error && Array.isArray(upd.data) && upd.data.length > 0) {
      const updatedRow = upd.data[0];
      const updatedStatus = String((updatedRow as any)?.status || '').trim();
      console.log('[DISPUTES/RESOLVE] ✅ Disputa actualizada:', {
        disputeId,
        expectedStatus: nextDisputeStatus,
        actualStatus: updatedStatus,
        matches: updatedStatus === nextDisputeStatus,
      });
      
      if (updatedStatus !== nextDisputeStatus) {
        console.error('[DISPUTES/RESOLVE] ⚠️ ERROR: El status no coincide:', {
          expected: nextDisputeStatus,
          actual: updatedStatus,
        });
      }
    } else if (!upd.error && (!upd.data || (Array.isArray(upd.data) && upd.data.length === 0))) {
      console.error('[DISPUTES/RESOLVE] ⚠️ ADVERTENCIA: Update no devolvió datos');
    }

    // CRÍTICO: Registrar evento para panel de admin
    try {
      const { recordAdminEvent } = await import('@/lib/admin/events');
      await recordAdminEvent(admin, {
        event_type: 'dispute_resolved',
        entity_type: 'dispute',
        entity_id: disputeId,
        admin_id: requesterId,
        status: 'completed',
        metadata: {
          decision,
          order_id: orderId,
          buyer_id: buyerId,
          seller_id: sellerId,
          note: noteWithPartial || null,
          return_tracking: returnTracking || null,
          return_guide_url: returnGuideUrl || null,
        },
      });
    } catch (eventErr) {
      console.error('[DISPUTES/RESOLVE] Error registrando evento admin:', eventErr);
    }

    const now = new Date().toISOString();
    try {
      if (orderId) {
        if (['release', 'keep_money_seller', 'partial_refund_seller', 'refund_seller_minus_fees'].includes(decision)) {
          await admin.from('orders').update({ status: 'paid' }).eq('id', orderId);
        }
        if (['refund', 'assign_return_tracking', 'assign_guide_charged_buyer', 'assign_guide_charged_seller', 'partial_refund_buyer', 'refund_buyer_minus_fees'].includes(decision)) {
          await admin.from('orders').update({ status: 'refunded' }).eq('id', orderId);
        }
        // Aplicar al saldo del vendedor: liberar pago cuando la resolución lo determina.
        // release, keep_money_seller, refund_seller_minus_fees = dinero al vendedor → paid_to_seller_at.
        // partial_refund_seller = monto parcial; no marcamos liberado para evitar sobrecontar en balance.
        if (['release', 'keep_money_seller', 'refund_seller_minus_fees'].includes(decision)) {
          await admin
            .from('orders')
            .update({ paid_to_seller_at: now, paid_to_seller_by: requesterId } as any)
            .eq('id', orderId);
        }
      }
    } catch (err: any) {
      try {
        orderUpdateError = String(err?.message ?? err ?? 'order_update_failed');
      } catch {
        orderUpdateError = 'order_update_failed';
      }
    }

    let text = '';
    if (decision === 'release') {
      text = 'Soporte resolvió: se libera el pago al vendedor.';
    } else if (decision === 'refund') {
      text = 'Soporte resolvió: se realiza reembolso al comprador.';
    } else if (decision === 'assign_return_tracking') {
      text = `Soporte resolvió: se asigna guía de devolución ${returnTracking}. El comprador debe devolver el producto. Una vez recibido, se procesará el reembolso.`;
    } else if (decision === 'assign_guide_charged_buyer') {
      text = `Soporte resolvió: se asigna guía de devolución con cargo al comprador. Costo: $${returnGuideCost.toFixed(2)} MXN (se descontará del reembolso). Rastreo: ${returnTracking}. La guía está disponible para descargar en este panel.`;
    } else if (decision === 'assign_guide_charged_seller') {
      text = `Soporte resolvió: se asigna guía de devolución con cargo al vendedor. Costo: $${returnGuideCost.toFixed(2)} MXN (se descontará del pago al vendedor). Rastreo: ${returnTracking}. La guía está disponible para descargar en este panel.`;
    } else if (decision === 'keep_money_seller') {
      text = 'Soporte resolvió: el vendedor mantiene el dinero debido a su trayectoria.';
    } else if (decision === 'partial_refund_seller') {
      text = `Soporte resolvió: devolución parcial al vendedor de $${partialAmount.toFixed(2)}.`;
    } else if (decision === 'partial_refund_buyer') {
      text = `Soporte resolvió: reembolso parcial al comprador de $${partialAmount.toFixed(2)}.`;
    } else if (decision === 'refund_buyer_minus_fees') {
      text = `Soporte resolvió: reembolso al comprador descontando comisión y envío ($${refundMinusFees.toFixed(2)}).`;
    } else if (decision === 'refund_seller_minus_fees') {
      text = `Soporte resolvió: devolución al vendedor descontando comisión y envío ($${refundMinusFees.toFixed(2)}).`;
    } else {
      text = 'Soporte cerró la disputa.';
    }
    const trackingNote =
      returnTracking && (decision === 'assign_return_tracking' || decision === 'assign_guide_charged_buyer' || decision === 'assign_guide_charged_seller')
        ? `Código de rastreo: ${returnTracking}`
        : '';
    const finalNote = note ? (trackingNote ? `${note}\n\n${trackingNote}` : note) : trackingNote;

    try {
      await admin.from('dispute_messages').insert([
        {
          dispute_id: disputeId,
          sender_id: requesterId,
          sender_role: 'admin',
          body: `${text}${finalNote ? `\n\nNota: ${finalNote}` : ''}`,
          attachments: [],
        },
      ]);
      await admin.from('disputes').update({ last_message_at: new Date().toISOString() }).eq('id', disputeId);
    } catch {
      // noop
    }

    let title = '';
    let bodyText = '';
    if (decision === 'release') {
      title = 'Disputa resuelta (pago liberado)';
      bodyText = 'Soporte resolvió la disputa y liberó el pago.';
    } else if (decision === 'refund') {
      title = 'Disputa resuelta (reembolso)';
      bodyText = 'Soporte resolvió la disputa y procesó un reembolso.';
    } else if (decision === 'assign_return_tracking') {
      title = 'Disputa resuelta (devolución requerida)';
      bodyText = `Soporte asignó una guía de devolución (${returnTracking}). Debes devolver el producto para recibir el reembolso.`;
    } else if (decision === 'assign_guide_charged_buyer') {
      title = 'Disputa resuelta (guía con cargo al comprador)';
      bodyText = `Soporte asignó una guía de devolución con cargo al comprador. Costo: $${returnGuideCost.toFixed(2)} MXN (se descontará de tu reembolso). Rastreo: ${returnTracking}. Descarga la guía en el panel de la disputa.`;
    } else if (decision === 'assign_guide_charged_seller') {
      title = 'Disputa resuelta (guía con cargo al vendedor)';
      bodyText = `Soporte asignó una guía de devolución con cargo al vendedor. Costo: $${returnGuideCost.toFixed(2)} MXN (se descontará de tu pago). Rastreo: ${returnTracking}. Descarga la guía en el panel de la disputa.`;
    } else if (decision === 'keep_money_seller') {
      title = 'Disputa resuelta (pago al vendedor)';
      bodyText = 'Soporte resolvió la disputa a favor del vendedor. El vendedor mantiene el dinero.';
    } else if (decision === 'partial_refund_seller') {
      title = 'Disputa resuelta (pago parcial al vendedor)';
      bodyText = `Soporte resolvió: devolución parcial al vendedor de $${partialAmount.toFixed(2)}.`;
    } else if (decision === 'partial_refund_buyer') {
      title = 'Disputa resuelta (reembolso parcial)';
      bodyText = `Soporte resolvió: reembolso parcial al comprador de $${partialAmount.toFixed(2)}.`;
    } else if (decision === 'refund_buyer_minus_fees') {
      title = 'Disputa resuelta (reembolso descontando comisión y envío)';
      bodyText = `Soporte resolvió: reembolso al comprador de $${refundMinusFees.toFixed(2)} (descontando comisión y envío).`;
    } else if (decision === 'refund_seller_minus_fees') {
      title = 'Disputa resuelta (pago al vendedor descontando comisión y envío)';
      bodyText = `Soporte resolvió: devolución al vendedor de $${refundMinusFees.toFixed(2)} (descontando comisión y envío).`;
    } else {
      title = 'Disputa cerrada';
      bodyText = 'Soporte cerró la disputa.';
    }

    const disputeLink = `/dashboard/disputas/${disputeId}`;
    const notifData = { disputeId, orderId, decision, link: disputeLink };

    if (buyerId) {
      await insertNotificationBestEffort(admin, {
        user_id: buyerId,
        type: 'dispute_resolved',
        title,
        body: bodyText,
        data: notifData,
        is_read: false,
      });
    }
    if (sellerId) {
      await insertNotificationBestEffort(admin, {
        user_id: sellerId,
        type: 'dispute_resolved',
        title,
        body: bodyText,
        data: notifData,
        is_read: false,
      });
    }

    void notifyDisputeResolved({
      buyerId,
      sellerId,
      orderId,
      decision: title || decision,
    }).catch((e) => console.warn('[disputes/resolve] email notifyDisputeResolved:', e));

    // VERIFICACIÓN FINAL: Leer la disputa una vez más para confirmar que el cambio persistió
    await new Promise(resolve => setTimeout(resolve, 150));
    
    let finalVerify: any = await admin
      .from('disputes')
      .select('id,status,admin_decision')
      .eq('id', disputeId)
      .maybeSingle();
    
    console.log('[DISPUTES/RESOLVE] Verificación final:', {
      error: finalVerify.error,
      data: finalVerify.data,
      expectedStatus: nextDisputeStatus,
      actualStatus: finalVerify.data ? String((finalVerify.data as any)?.status || '') : null,
    });
    
    if (!finalVerify.error && finalVerify.data) {
      const finalStatus = String((finalVerify.data as any)?.status || '').trim();
      if (finalStatus !== nextDisputeStatus) {
        console.error('[DISPUTES/RESOLVE] ⚠️ ERROR CRÍTICO: El status se revirtió después de actualizar');
        // Intentar actualizar nuevamente
        try {
          await admin
            .from('disputes')
            .update({ status: nextDisputeStatus, admin_decision: decision })
            .eq('id', disputeId);
          console.log('[DISPUTES/RESOLVE] Reintentando actualización...');
        } catch (retryErr) {
          console.error('[DISPUTES/RESOLVE] Error en reintento:', retryErr);
        }
      }
    }
    
    const resp = NextResponse.json({ 
      ok: true, 
      disputeId, 
      status: nextDisputeStatus, 
      decision,
      orderUpdateError: orderUpdateError || undefined, // Incluir si hubo error con la orden
    });
    resp.headers.set('Cache-Control', 'no-store, max-age=0');
    return resp;
  } catch (e: unknown) {
    console.error(e);
    const resp = NextResponse.json({ error: e instanceof Error ? e.message : 'Unexpected error resolving dispute' }, { status: 500 });
    resp.headers.set('Cache-Control', 'no-store, max-age=0');
    return resp;
  }
}

