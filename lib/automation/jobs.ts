import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendUnifiedNotification } from '@/lib/notifications/unified';

/**
 * Ejecuta jobs automáticos periódicos
 * Llamar desde un cron job o Vercel Cron
 */
export async function runAutomatedJobs(): Promise<{
  ok: boolean;
  results: Record<string, { ok: boolean; count?: number; error?: string }>;
}> {
  const admin = supabaseAdmin();
  const results: Record<string, { ok: boolean; count?: number; error?: string }> = {};

  try {
    // 1. Verificar suspensiones expiradas
    results.checkExpiredSuspensions = await checkExpiredSuspensions(admin);

    // 2. Limpiar sesiones de checkout expiradas
    results.cleanupExpiredCheckouts = await cleanupExpiredCheckouts(admin);

    // 3. Enviar recordatorios de pagos pendientes
    results.sendPaymentReminders = await sendPaymentReminders(admin);

    // 4. Actualizar estados de órdenes (shipped -> delivered después de X días)
    results.updateOrderStatuses = await updateOrderStatuses(admin);

    // 5. Limpiar logs antiguos
    results.cleanupOldLogs = await cleanupOldLogs(admin);

    return { ok: true, results };
  } catch (e) {
    console.error('[AUTOMATION JOBS] Error ejecutando jobs:', e);
    return {
      ok: false,
      results: {
        general: { ok: false, error: e instanceof Error ? e.message : 'Unknown error' },
      },
    };
  }
}

async function checkExpiredSuspensions(
  admin: ReturnType<typeof supabaseAdmin>,
): Promise<{ ok: boolean; count?: number; error?: string }> {
  try {
    const now = new Date().toISOString();

    const { data: expired, error } = await admin
      .from('user_admin_states')
      .select('user_id')
      .eq('status', 'suspended')
      .lte('suspended_until', now);

    if (error) {
      return { ok: false, error: error.message };
    }

    if (!expired || expired.length === 0) {
      return { ok: true, count: 0 };
    }

    let reactivated = 0;
    for (const user of expired) {
      const { error: updateError } = await admin
        .from('user_admin_states')
        .update({ status: 'active', suspended_until: null })
        .eq('user_id', user.user_id);

      if (updateError) {
        console.error(`[AUTOMATION] Error reactivando usuario ${user.user_id}:`, updateError);
        continue;
      }

      // Reactivar publicaciones pausadas
      await admin
        .from('listings')
        .update({ status: 'active' })
        .eq('seller_id', user.user_id)
        .eq('status', 'paused');

      // Notificar al usuario
      await sendUnifiedNotification(admin, {
        userId: user.user_id,
        type: 'user_reactivated',
        title: 'Cuenta Reactivada',
        body: 'Tu suspensión ha expirado y tu cuenta ha sido reactivada.',
        channels: ['both'],
      });

      reactivated++;
    }

    return { ok: true, count: reactivated };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

async function cleanupExpiredCheckouts(
  admin: ReturnType<typeof supabaseAdmin>,
): Promise<{ ok: boolean; count?: number; error?: string }> {
  try {
    // Cancelar sesiones pendientes de más de 7 días
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: expired, error } = await admin
      .from('checkout_sessions')
      .select('id')
      .eq('status', 'pending')
      .lt('created_at', sevenDaysAgo);

    if (error) {
      return { ok: false, error: error.message };
    }

    if (!expired || expired.length === 0) {
      return { ok: true, count: 0 };
    }

    const { data: cancelled, error: cancelError } = await admin
      .from('checkout_sessions')
      .update({ status: 'cancelled' })
      .in(
        'id',
        expired.map((e) => e.id),
      )
      .select('id');

    if (cancelError) {
      return { ok: false, error: cancelError.message };
    }

    return { ok: true, count: cancelled?.length || 0 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

async function sendPaymentReminders(
  admin: ReturnType<typeof supabaseAdmin>,
): Promise<{ ok: boolean; count?: number; error?: string }> {
  try {
    // Enviar recordatorios para pagos offline pendientes de más de 2 días
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

    const { data: pendingPayments, error } = await admin
      .from('checkout_sessions')
      .select('id, buyer_id, amount, reference_code, payment_method')
      .eq('status', 'pending')
      .in('payment_method', ['bank_transfer', 'bank_deposit', 'oxxo'])
      .lt('created_at', twoDaysAgo);

    if (error) {
      return { ok: false, error: error.message };
    }

    if (!pendingPayments || pendingPayments.length === 0) {
      return { ok: true, count: 0 };
    }

    let notified = 0;
    for (const payment of pendingPayments) {
      if (!payment.buyer_id) continue;

      await sendUnifiedNotification(admin, {
        userId: payment.buyer_id,
        type: 'payment_reminder',
        title: '⏰ Recordatorio de Pago Pendiente',
        body: `Tienes un pago pendiente de ${Number(payment.amount || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}. ${payment.reference_code ? `Referencia: ${payment.reference_code}` : ''}`,
        channels: ['both'],
        linkTo: '/dashboard/pagos',
        priority: 'medium',
      });

      notified++;
    }

    return { ok: true, count: notified };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

async function updateOrderStatuses(
  admin: ReturnType<typeof supabaseAdmin>,
): Promise<{ ok: boolean; count?: number; error?: string }> {
  try {
    // Marcar como entregadas las órdenes enviadas hace más de 14 días
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

    const { data: shippedOrders, error } = await admin
      .from('orders')
      .select('id')
      .eq('status', 'shipped')
      .lt('shipped_at', fourteenDaysAgo);

    if (error) {
      return { ok: false, error: error.message };
    }

    if (!shippedOrders || shippedOrders.length === 0) {
      return { ok: true, count: 0 };
    }

    const { data: updated, error: updateError } = await admin
      .from('orders')
      .update({ status: 'delivered', delivered_at: new Date().toISOString() })
      .in(
        'id',
        shippedOrders.map((o) => o.id),
      )
      .select('id');

    if (updateError) {
      return { ok: false, error: updateError.message };
    }

    return { ok: true, count: updated?.length || 0 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

async function cleanupOldLogs(
  admin: ReturnType<typeof supabaseAdmin>,
): Promise<{ ok: boolean; count?: number; error?: string }> {
  try {
    // Eliminar logs de más de 90 días
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    // Limpiar payment_logs antiguos
    const { data: deletedPayments, error: paymentError } = await admin
      .from('payment_logs')
      .delete()
      .lt('created_at', ninetyDaysAgo)
      .select('id');

    if (paymentError) {
      console.error('[AUTOMATION] Error limpiando payment_logs:', paymentError);
    }

    // Limpiar admin_action_logs antiguos (mantener más tiempo, 180 días)
    const oneEightyDaysAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();

    const { data: deletedActions, error: actionError } = await admin
      .from('admin_action_logs')
      .delete()
      .lt('created_at', oneEightyDaysAgo)
      .select('id');

    if (actionError) {
      console.error('[AUTOMATION] Error limpiando admin_action_logs:', actionError);
    }

    const totalDeleted = (deletedPayments?.length || 0) + (deletedActions?.length || 0);

    return { ok: true, count: totalDeleted };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}
