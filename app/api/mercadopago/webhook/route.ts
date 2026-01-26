import { NextRequest, NextResponse } from 'next/server';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { insertNotificationBestEffort } from '@/lib/notifications/insertBestEffort';
import {
  notifyPaymentApprovedBuyer,
  notifyPaymentRejectedBuyer,
  notifyPaymentApprovedSellers,
  notifyEstafetaPaymentApproved,
} from '@/lib/email/notify';

// Webhook simple: valida un token opcional (query param) para evitar spam.
function isAuthorized(req: NextRequest) {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET || '';
  if (!secret) return true; // permitido si no configuraste secret
  return req.nextUrl.searchParams.get('token') === secret;
}

export async function POST(req: NextRequest) {
  try {
    if (!isAuthorized(req)) return NextResponse.json({ ok: false }, { status: 401 });

    const body = await req.json().catch(() => ({}));

    // MercadoPago suele enviar: { type: 'payment', data: { id: '123' } }
    const paymentId =
      (body?.data?.id as string | number | undefined) ??
      (body?.id as string | number | undefined) ??
      req.nextUrl.searchParams.get('id') ??
      null;

    if (!paymentId) return NextResponse.json({ ok: true });

    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN || '';
    if (!accessToken) return NextResponse.json({ ok: false, error: 'Missing MERCADOPAGO_ACCESS_TOKEN' }, { status: 500 });

    const client = new MercadoPagoConfig({ accessToken });
    const payment = new Payment(client);
    const paymentInfo = await payment.get({ id: String(paymentId) });

    const status = (paymentInfo as any)?.status as string | undefined; // approved / pending / rejected ...
    const externalReference = (paymentInfo as any)?.external_reference as string | undefined;
    const metadata = (paymentInfo as any)?.metadata as any;

    // `external_reference` = checkoutId o estafeta_quote_${quoteId}
    if (!externalReference) return NextResponse.json({ ok: true });

    const admin = supabaseAdmin();

    // Verificar si es un pago de guía Estafeta
    const isEstafetaPayment = externalReference.startsWith('estafeta_quote_') || metadata?.type === 'estafeta_guide';
    
    if (isEstafetaPayment) {
      const quoteId = externalReference.replace('estafeta_quote_', '');
      
      if (status === 'approved') {
        // Marcar cotización como pagada
        await admin
          .from('estafeta_quotes')
          .update({
            status: 'paid',
            mp_payment_id: String(paymentId),
            mp_payment_status: status,
            paid_at: new Date().toISOString(),
          })
          .eq('id', quoteId);

        // Obtener datos del usuario para notificación
        const { data: quote } = await admin
          .from('estafeta_quotes')
          .select('user_id, calculated_cost')
          .eq('id', quoteId)
          .maybeSingle();

        if (quote?.user_id) {
          await insertNotificationBestEffort(admin, {
            user_id: quote.user_id,
            type: 'estafeta_payment_approved',
            title: 'Pago de guía Estafeta acreditado',
            body: `Tu pago de ${quote.calculated_cost?.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })} fue acreditado. La guía estará disponible cuando el administrador la suba.`,
            data: { quote_id: quoteId, mp_payment_id: String(paymentId), type: 'estafeta_guide' },
            is_read: false,
          });
          const amount = Number(quote?.calculated_cost ?? 0) || 0;
          void notifyEstafetaPaymentApproved({ userId: quote.user_id, amount }).catch((e) =>
            console.warn('[WEBHOOK] email notifyEstafetaPaymentApproved:', e)
          );
        }

        // Notificar a todos los administradores sobre la nueva compra
        try {
          const { data: quoteDetails } = await admin
            .from('estafeta_quotes')
            .select('sender_name, recipient_name, calculated_cost')
            .eq('id', quoteId)
            .maybeSingle();

          const aRes: any = await admin.from('admin_users').select('user_id').limit(500);
          if (!aRes?.error && Array.isArray(aRes.data)) {
            const costStr = quoteDetails?.calculated_cost?.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }) || 'N/A';
            const senderName = quoteDetails?.sender_name || 'N/A';
            const recipientName = quoteDetails?.recipient_name || 'N/A';
            
            for (const r of aRes.data as any[]) {
              const adminId = String(r?.user_id || '').trim();
              if (!adminId) continue;
              await insertNotificationBestEffort(admin, {
                user_id: adminId,
                type: 'estafeta_new_payment',
                title: 'Nueva compra en Tienda Estafeta',
                body: `Compra de ${costStr} - Remitente: ${senderName}, Destinatario: ${recipientName}`,
                data: { quote_id: quoteId, mp_payment_id: String(paymentId), type: 'estafeta_guide', href: '/admin/estafeta' },
                is_read: false,
              });
            }
          }
        } catch (adminNotifyErr) {
          console.error('[ESTAFETA WEBHOOK] Error al notificar administradores:', adminNotifyErr);
          // No fallar el webhook si falla la notificación a admins
        }
      } else if (status === 'rejected' || status === 'cancelled') {
        // Revertir a quote si el pago falla
        await admin
          .from('estafeta_quotes')
          .update({
            status: 'quote',
            mp_payment_id: String(paymentId),
            mp_payment_status: status,
          })
          .eq('id', quoteId);
      }

      return NextResponse.json({ ok: true });
    }

    // Verificar si es un pago de campaña publicitaria
    const isAdCampaignPayment = externalReference.startsWith('ad_campaign_') || metadata?.type === 'ad_campaign';
    
    if (isAdCampaignPayment) {
      const campaignId = externalReference.replace('ad_campaign_', '');
      
      if (status === 'approved') {
        // Actualizar estado de pago
        await admin
          .from('ad_payments')
          .update({
            payment_status: 'approved',
            mercado_pago_payment_id: String(paymentId),
            paid_at: new Date().toISOString(),
          })
          .eq('external_reference', externalReference);

        // Actualizar campaña como pagada
        await admin
          .from('ad_campaigns')
          .update({
            payment_status: 'paid',
            payment_id: String(paymentId),
            updated_at: new Date().toISOString(),
          })
          .eq('id', campaignId);

        // Notificar al usuario
        const { data: campaign } = await admin
          .from('ad_campaigns')
          .select('user_id, title, total_amount')
          .eq('id', campaignId)
          .maybeSingle();

        if (campaign?.user_id) {
          await insertNotificationBestEffort(admin, {
            user_id: campaign.user_id,
            type: 'ad_payment_approved',
            title: 'Pago de publicidad acreditado',
            body: `Tu pago de ${Number(campaign.total_amount || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })} para la campaña "${campaign.title}" fue acreditado. La campaña está pendiente de aprobación.`,
            data: { campaign_id: campaignId, mp_payment_id: String(paymentId), type: 'ad_campaign' },
            is_read: false,
          });
        }

        // Notificar a administradores
        try {
          const aRes: any = await admin.from('admin_users').select('user_id').limit(500);
          if (!aRes?.error && Array.isArray(aRes.data)) {
            for (const r of aRes.data as any[]) {
              const adminId = String(r?.user_id || '').trim();
              if (!adminId) continue;
              await insertNotificationBestEffort(admin, {
                user_id: adminId,
                type: 'ad_campaign_paid',
                title: 'Nueva campaña publicitaria pagada',
                body: `Campaña "${campaign?.title || 'Sin título'}" pagada. Revisa y aprueba en el panel de publicidad.`,
                data: { campaign_id: campaignId, mp_payment_id: String(paymentId), type: 'ad_campaign', href: '/admin/publicidad' },
                is_read: false,
              });
            }
          }
        } catch (adminNotifyErr) {
          console.error('[AD WEBHOOK] Error al notificar administradores:', adminNotifyErr);
        }
      } else if (status === 'rejected' || status === 'cancelled') {
        await admin
          .from('ad_payments')
          .update({
            payment_status: 'rejected',
            mercado_pago_payment_id: String(paymentId),
          })
          .eq('external_reference', externalReference);
      }

      return NextResponse.json({ ok: true });
    }

    // Verificar si es un pago de verificación
    const isVerificationPayment = externalReference.startsWith('verification_') || metadata?.type === 'verification';
    
    if (isVerificationPayment) {
      const userId = externalReference.replace('verification_', '') || metadata?.user_id;
      
      if (status === 'approved' && userId) {
        // Actualizar estado de pago
        await admin
          .from('verification_payments')
          .update({
            payment_status: 'approved',
            mercado_pago_payment_id: String(paymentId),
            paid_at: new Date().toISOString(),
            verification_granted: true,
          })
          .eq('external_reference', externalReference);

        // Otorgar verificación al usuario
        await admin
          .from('profiles')
          .update({ is_verified: true })
          .eq('id', userId);

        // Notificar al usuario
        await insertNotificationBestEffort(admin, {
          user_id: userId,
          type: 'verification_granted',
          title: '¡Verificación otorgada!',
          body: 'Tu pago fue acreditado y ahora tienes la insignia de verificado en tu perfil.',
          data: { mp_payment_id: String(paymentId), type: 'verification' },
          is_read: false,
        });
      } else if (status === 'rejected' || status === 'cancelled') {
        await admin
          .from('verification_payments')
          .update({
            payment_status: 'rejected',
            mercado_pago_payment_id: String(paymentId),
          })
          .eq('external_reference', externalReference);
      }

      return NextResponse.json({ ok: true });
    }

    // Leer estado previo para evitar duplicar notificaciones en reintentos del webhook
    let prevStatus: string | null = null;
    let prevPaymentId: string | null = null;
    try {
      const prev: any = await admin
        .from('checkout_sessions')
        .select('id,status,mp_payment_id')
        .eq('id', externalReference)
        .maybeSingle();
      if (!prev?.error && prev?.data) {
        prevStatus = String((prev.data as any)?.status ?? '').trim() || null;
        prevPaymentId = String((prev.data as any)?.mp_payment_id ?? '').trim() || null;
      }
    } catch {
      // noop
    }

    const nextSessionStatus =
      status === 'approved' ? 'paid' :
      status === 'rejected' || status === 'cancelled' ? 'failed' :
      'pending';

    // Update idempotente-ish: actualiza la sesión (si no existe, no explota)
    await admin
      .from('checkout_sessions')
      .update({
        mp_payment_id: String(paymentId),
        mp_status: status ?? null,
        status: nextSessionStatus,
      })
      .eq('id', externalReference);

    // Si se aprobó, validar y procesar
    let orderIds: string[] = [];
    let buyerId: string | null = null;

    if (status === 'approved') {
      const now = new Date().toISOString();
      
      // 1. Obtener datos de la sesión para validación
      const { data: session } = await admin
        .from('checkout_sessions')
        .select('buyer_id, order_ids')
        .eq('id', externalReference)
        .maybeSingle();

      buyerId = String((session as any)?.buyer_id ?? '').trim() || null;
      orderIds = (((session as any)?.order_ids as string[]) ?? []).map(String).filter(Boolean);

      if (!buyerId || orderIds.length === 0) {
        console.error('[WEBHOOK] Datos de sesión incompletos:', { checkoutId: externalReference, buyerId, orderIds });
        return NextResponse.json({ ok: true });
      }

      // 2. Calcular monto esperado
      const { data: orders } = await admin.from('orders').select('total').in('id', orderIds);
      const calculatedAmount = ((orders as any[]) ?? []).reduce((sum, o) => sum + (Number(o?.total ?? 0) || 0), 0);

      // 3. VALIDACIÓN CENTRALIZADA DE SEGURIDAD
      const { validatePayment } = await import('@/lib/payments/validation');
      const validation = await validatePayment(admin, {
        buyerId,
        orderIds,
        amount: calculatedAmount,
        paymentMethod: 'mercadopago',
        checkoutId: externalReference,
      });

      if (!validation.valid) {
        // Filtrar errores de "ya pagado" para idempotencia (si MP reenvía el webhook)
        const blockingErrors = validation.errors.filter(e => 
          !e.includes('ya están pagadas') && 
          !e.includes('ya tienen fecha de pago') && 
          !e.includes('ya fue procesado')
        );

        if (blockingErrors.length > 0) {
          console.error('[WEBHOOK] 🛑 ALERTA DE SEGURIDAD: Validación fallida.', { 
            buyerId, 
            errors: blockingErrors,
            warnings: validation.warnings 
          });
          // DETENER PROCESAMIENTO: No liberamos órdenes si hay errores críticos (fraude, usuario baneado, montos manipulados)
          return NextResponse.json({ ok: true }); 
        }
        // Si solo eran errores de "ya pagado", continuamos (idempotencia)
      }

      // 4. Actualizar órdenes (si pasamos validación)
      if (orderIds.length > 0) {
        let ordersUpd: any = await admin
          .from('orders')
          .update({ status: 'paid', paid_at: now, payment_method: 'mercadopago' } as any)
          .in('id', orderIds);
        
        // Fallback para errores de columna o tipo
        if (ordersUpd?.error) {
          const code = String((ordersUpd.error as any)?.code ?? '');
          const msg = String((ordersUpd.error as any)?.message ?? '').toLowerCase();
          if (code === '42703' || msg.includes('column') || msg.includes('paid_at')) {
            ordersUpd = await admin.from('orders').update({ status: 'paid', payment_method: 'mercadopago' } as any).in('id', orderIds);
          }
          if (ordersUpd?.error) {
            await admin.from('orders').update({ status: 'paid' }).in('id', orderIds);
          }
        }
      }

      // 5. Vaciar carrito
      if (buyerId && orderIds.length > 0) {
        try {
          const { data: items } = await admin.from('order_items').select('listing_id').in('order_id', orderIds);
          const listingIds = Array.from(new Set(((items as any[]) ?? []).map((r) => String(r?.listing_id ?? '').trim()).filter(Boolean)));
          if (listingIds.length > 0) {
            await admin.from('cart_items').delete().eq('user_id', buyerId).in('listing_id', listingIds);
          }
        } catch (e) {
           console.warn('[WEBHOOK] Error vaciando carrito (no crítico):', e);
        }
      }
    } else {
       // Si no es approved, inicializamos variables para el bloque de notificaciones (si se requiere)
       // Pero el bloque de notificaciones abajo intenta recuperar buyerId/orderIds de nuevo si faltan.
       // Para mantener compatibilidad con el código existente de notificaciones, no cambiamos nada más.
    }

    // Notificaciones (best-effort) a buyer + sellers
    const shouldNotify =
      (prevStatus && prevStatus !== nextSessionStatus) ||
      (prevPaymentId && prevPaymentId !== String(paymentId)) ||
      (!prevStatus && !prevPaymentId); // primera vez

    if (shouldNotify) {
      if (!buyerId) {
        try {
          const s: any = await admin.from('checkout_sessions').select('buyer_id,order_ids').eq('id', externalReference).maybeSingle();
          if (!s?.error && s?.data) {
            buyerId = String((s.data as any)?.buyer_id ?? '').trim() || null;
            if (orderIds.length === 0) {
              orderIds = (((s.data as any)?.order_ids as string[]) ?? []).map(String).filter(Boolean);
            }
          }
        } catch {
          // noop
        }
      }

      if (buyerId) {
        if (nextSessionStatus === 'paid') {
          // Notificar al comprador usando sistema unificado
          console.log('[WEBHOOK] Creando notificación para comprador:', { buyerId, orderIds });
          try {
            const { sendUnifiedNotification } = await import('@/lib/notifications/unified');
            const firstOrderId = orderIds.length > 0 ? orderIds[0] : null;
            await sendUnifiedNotification(admin, {
              userId: buyerId,
              type: 'payment_approved',
              title: '✅ ¡Pago acreditado!',
              body: `Tu pago fue acreditado exitosamente. ${orderIds.length > 0 ? `Orden${orderIds.length > 1 ? 'es' : ''}: ${orderIds.map(id => id.slice(0, 8)).join(', ')}` : 'Ya puedes dar seguimiento a tu compra.'}`,
              data: { 
                kind: 'payment_approved',
                checkoutId: externalReference, 
                orderId: firstOrderId,
                orderIds: orderIds,
                mp_payment_id: String(paymentId), 
                mp_status: status ?? null 
              },
              linkTo: firstOrderId ? `/dashboard/compras?order=${firstOrderId}` : '/dashboard/compras',
              channels: ['both'], // Panel + Email
              priority: 'high',
              emailTemplate: 'payment_approved',
            });
            console.log('[WEBHOOK] ✅ Notificación unificada enviada para comprador:', { buyerId });
          } catch (unifiedErr) {
            console.error('[WEBHOOK] Error con notificación unificada, usando fallback:', unifiedErr);
            // Fallback a método anterior
            const result = await insertNotificationBestEffort(admin, {
              user_id: buyerId,
              type: 'payment_approved',
              title: '¡Pago acreditado!',
              body: `Tu pago fue acreditado exitosamente. ${orderIds.length > 0 ? `Orden${orderIds.length > 1 ? 'es' : ''}: ${orderIds.map(id => id.slice(0, 8)).join(', ')}` : 'Ya puedes dar seguimiento a tu compra.'}`,
              data: { 
                kind: 'payment_approved',
                checkoutId: externalReference, 
                orderId: orderIds.length > 0 ? orderIds[0] : null,
                orderIds: orderIds,
                mp_payment_id: String(paymentId), 
                mp_status: status ?? null 
              },
              link_to: orderIds.length > 0 ? `/dashboard/compras?order=${orderIds[0]}` : '/dashboard/compras',
              is_read: false,
            });
            if (result.ok) {
              console.log('[WEBHOOK] ✅ Notificación creada exitosamente para comprador (fallback):', { buyerId });
            } else {
              console.error('[WEBHOOK] ❌ Error al crear notificación para comprador:', { buyerId, result });
            }
          }
          void (async () => {
            try {
              let total: number | undefined;
              if (orderIds.length > 0) {
                const { data: ords } = await admin.from('orders').select('total').in('id', orderIds);
                if (Array.isArray(ords)) total = (ords as any[]).reduce((s, o) => s + Number(o?.total ?? 0), 0);
              }
              await notifyPaymentApprovedBuyer({ buyerId, orderIds, total });
            } catch (e) {
              console.warn('[WEBHOOK] email notifyPaymentApprovedBuyer:', e);
            }
          })();
        } else if (nextSessionStatus === 'failed') {
          console.log('[WEBHOOK] Creando notificación de pago rechazado para comprador:', { buyerId });
          try {
            const { sendUnifiedNotification } = await import('@/lib/notifications/unified');
            await sendUnifiedNotification(admin, {
              userId: buyerId,
              type: 'payment_rejected',
              title: '⚠️ Pago rechazado',
              body: 'Tu pago fue rechazado. Intenta de nuevo o elige otro método de pago.',
              data: { 
                kind: 'payment_rejected',
                checkoutId: externalReference, 
                mp_payment_id: String(paymentId), 
                mp_status: status ?? null 
              },
              linkTo: `/pago/${externalReference}`,
              channels: ['both'], // Panel + Email
              priority: 'high',
              emailTemplate: 'payment_rejected',
            });
            console.log('[WEBHOOK] ✅ Notificación de rechazo enviada (unificada):', { buyerId });
          } catch (unifiedErr) {
            console.error('[WEBHOOK] Error con notificación unificada, usando fallback:', unifiedErr);
            // Fallback a método anterior
            const result = await insertNotificationBestEffort(admin, {
              user_id: buyerId,
              type: 'payment_rejected',
              title: '⚠️ Pago rechazado',
              body: 'Tu pago fue rechazado. Intenta de nuevo o elige otro método de pago.',
              data: { 
                kind: 'payment_rejected',
                checkoutId: externalReference, 
                mp_payment_id: String(paymentId), 
                mp_status: status ?? null 
              },
              link_to: `/pago/${externalReference}`,
              is_read: false,
            });
            if (result.ok) {
              console.log('[WEBHOOK] ✅ Notificación de rechazo creada para comprador (fallback):', { buyerId });
            } else {
              console.error('[WEBHOOK] ❌ Error al crear notificación de rechazo:', { buyerId, result });
            }
            void notifyPaymentRejectedBuyer({ buyerId }).catch((e) =>
              console.warn('[WEBHOOK] email notifyPaymentRejectedBuyer:', e)
            );
          }
        }
      } else {
        console.warn('[WEBHOOK] No se encontró buyerId, no se puede notificar al comprador');
      }

      // sellers por órdenes
      if (nextSessionStatus === 'paid' && orderIds.length > 0) {
        try {
          console.log('[WEBHOOK] Intentando notificar vendedores:', { orderIds, orderCount: orderIds.length });
          // Compat: algunas BD usan `user_id` en vez de `seller_id`
          let ores: any = await admin.from('orders').select('id,seller_id,user_id').in('id', orderIds).limit(200);
          if (ores?.error) {
            const code = String((ores.error as any)?.code || '');
            const msg = String((ores.error as any)?.message || '').toLowerCase();
            console.warn('[WEBHOOK] Error al obtener órdenes, intentando fallback:', { code, msg });
            if (code === '42703' || msg.includes('column')) {
              // fallback sin user_id
              ores = await admin.from('orders').select('id,seller_id').in('id', orderIds).limit(200);
              if (ores?.error) {
                // fallback sin seller_id
                ores = await admin.from('orders').select('id,user_id').in('id', orderIds).limit(200);
              }
            }
          }
          if (!ores?.error && Array.isArray(ores.data)) {
            console.log('[WEBHOOK] Órdenes encontradas:', { count: ores.data.length });
            let notifiedCount = 0;
            for (const o of ores.data as any[]) {
              const sellerId = String(o?.seller_id ?? o?.user_id ?? '').trim();
              const orderId = String(o?.id || '').trim();
              if (!sellerId || !orderId) {
                console.warn('[WEBHOOK] Saltando orden sin seller_id o order_id:', { sellerId, orderId });
                continue;
              }
              console.log('[WEBHOOK] Creando notificación para vendedor:', { sellerId, orderId });
              try {
                const { sendUnifiedNotification } = await import('@/lib/notifications/unified');
                await sendUnifiedNotification(admin, {
                  userId: sellerId,
                  type: 'sale_paid',
                  title: '💰 ¡Pago acreditado!',
                  body: `Se acreditó el pago de una compra. Orden: ${orderId.slice(0, 8)}… Ya puedes preparar el envío.`,
                  data: { 
                    kind: 'sale_paid',
                    orderId, 
                    checkoutId: externalReference, 
                    mp_payment_id: String(paymentId) 
                  },
                  linkTo: `/dashboard/ventas?order=${orderId}`,
                  channels: ['both'], // Panel + Email
                  priority: 'high',
                });
                notifiedCount++;
                console.log('[WEBHOOK] ✅ Notificación unificada enviada para vendedor:', { sellerId, orderId });
              } catch (unifiedErr) {
                console.error('[WEBHOOK] Error con notificación unificada, usando fallback:', unifiedErr);
                // Fallback a método anterior
                const result = await insertNotificationBestEffort(admin, {
                  user_id: sellerId,
                  type: 'sale_paid',
                  title: '💰 ¡Pago acreditado!',
                  body: `Se acreditó el pago de una compra. Orden: ${orderId.slice(0, 8)}… Ya puedes preparar el envío.`,
                  data: { 
                    kind: 'sale_paid',
                    orderId, 
                    checkoutId: externalReference, 
                    mp_payment_id: String(paymentId) 
                  },
                  link_to: `/dashboard/ventas?order=${orderId}`,
                  is_read: false,
                });
                if (result.ok) {
                  notifiedCount++;
                  console.log('[WEBHOOK] ✅ Notificación creada exitosamente para vendedor (fallback):', { sellerId, orderId });
                } else {
                  console.error('[WEBHOOK] ❌ Error al crear notificación:', { sellerId, orderId, result });
                }
              }
            }
            console.log('[WEBHOOK] Total notificaciones creadas para vendedores:', { notifiedCount, total: ores.data.length });
          } else {
            console.error('[WEBHOOK] Error al obtener órdenes:', ores?.error);
          }
        } catch (err) {
          console.error('[WEBHOOK] Excepción al notificar vendedores:', err);
        }
        void notifyPaymentApprovedSellers({ admin, orderIds }).catch((e) =>
          console.warn('[WEBHOOK] email notifyPaymentApprovedSellers:', e)
        );

        // Notificar a admins: pago MP acreditado → supervisión puede dar seguimiento
        if (nextSessionStatus === 'paid' && orderIds.length > 0) {
          try {
            const aRes: any = await admin.from('admin_users').select('user_id').limit(500);
            if (!aRes?.error && Array.isArray(aRes.data)) {
              const orderPreview = orderIds.length <= 3
                ? orderIds.map((id) => id.slice(0, 8)).join(', ')
                : `${orderIds.slice(0, 2).map((id) => id.slice(0, 8)).join(', ')} +${orderIds.length - 2} más`;
              for (const r of aRes.data as any[]) {
                const adminId = String(r?.user_id || '').trim();
                if (!adminId) continue;
                await insertNotificationBestEffort(admin, {
                  user_id: adminId,
                  type: 'mp_payment_approved',
                  title: 'Pago Mercado Pago acreditado',
                  body: `${orderIds.length} orden(es) pagada(s). ${orderPreview}. Revisa Supervisión o Logística.`,
                  data: {
                    kind: 'mp_payment_approved',
                    orderIds,
                    checkoutId: externalReference,
                    mp_payment_id: String(paymentId),
                    href: '/admin/supervision',
                  },
                  is_read: false,
                });
              }
            }
          } catch (adminErr) {
            console.error('[WEBHOOK] Error al notificar admins:', adminErr);
          }
          
          // Notificar usando el módulo centralizado
          try {
            const { notifyAdmin } = await import('@/lib/notifications/admin');
            let total: number | undefined;
            if (orderIds.length > 0) {
              const { data: ords } = await admin.from('orders').select('total').in('id', orderIds);
              if (Array.isArray(ords)) total = (ords as any[]).reduce((s, o) => s + Number(o?.total ?? 0), 0);
            }
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
            console.error('[WEBHOOK] Error al notificar administradores (módulo centralizado):', adminNotifyErr);
          }
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error(e);
    return NextResponse.json({ ok: true }); // responder ok para que MP no reintente sin parar
  }
}

