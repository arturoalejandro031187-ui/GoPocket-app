import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/auth/middleware';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { notifyPaymentApprovedBuyer, notifyPaymentApprovedSellers } from '@/lib/email/notify';
import { WalletService } from '@/lib/services/wallet/wallet.service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireAuth(req);
    const body = await req.json();
    const { orderIds } = body;

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json({ error: 'No orderIds provided' }, { status: 400 });
    }

    const admin = supabaseAdmin();

    // 1. Obtener órdenes y validar que pertenezcan al usuario
    const { data: orders, error: ordersError } = await admin
      .from('orders')
      .select('id, total, status')
      .in('id', orderIds)
      .eq('buyer_id', userId);

    if (ordersError || !orders) {
      console.error('[Wallet Pay] Error buscando órdenes:', ordersError);
      return NextResponse.json({ error: 'Error consultando órdenes.' }, { status: 500 });
    }

    if (orders.length !== orderIds.length) {
      return NextResponse.json({ error: 'No se encontraron todas las órdenes solicitadas.' }, { status: 400 });
    }

    // Filtrar órdenes que requieren pago
    const ordersToPay = [];
    for (const order of orders) {
      if (order.status === 'paid' || order.status === 'approved') {
        // Ya pagada, ignorar (idempotencia)
        continue;
      }
      if (order.status === 'pending' || order.status === 'pending_payment') {
        ordersToPay.push(order);
        continue;
      }
      // Si está cancelada u otro estado inválido
      return NextResponse.json({ error: `La orden #${order.id.slice(0,8)} no es válida para pago (Estado: ${order.status}).` }, { status: 400 });
    }

    // Si no hay nada que pagar (todas ya estaban pagadas)
    if (ordersToPay.length === 0) {
      return NextResponse.json({ 
        ok: true,
        success: true, 
        message: 'Órdenes ya pagadas previamente.' 
      });
    }

    // 2. Calcular total a pagar
    const totalAmount = ordersToPay.reduce((sum, order) => sum + Number(order.total), 0);

    if (totalAmount <= 0) {
      // Puede pasar si las órdenes tienen total 0? Si es así, se marcan pagadas directo.
      // Pero por seguridad validamos > 0 para uso de wallet.
      // Si total es 0, deberíamos solo actualizar estado? 
      // Asumiremos que si llegan aquí deben pagarse.
    }

    // 3. Ejecutar pago atómico (deducir wallet)
    // Usamos el servicio centralizado que maneja la lógica de saldo y transacciones
    let newBalance = 0;
    try {
      newBalance = await WalletService.payOrdersBatch(
        userId, 
        ordersToPay.map(o => ({ id: o.id, amount: Number(o.total) }))
      );
    } catch (err: any) {
      console.error('[Wallet Pay] Error procesando pago:', err);
      // Si el error es de saldo insuficiente, el servicio lanza un error con mensaje claro
      return NextResponse.json({ error: err.message || 'Error al procesar el pago con wallet.' }, { status: 400 });
    }

    const result = { new_balance: newBalance };

    // 4. Marcar órdenes como pagadas
    // Usamos payment_method = 'pocketcash'
    const { error: updateError } = await admin
      .from('orders')
      .update({ 
        status: 'paid', // O 'approved' según tu flujo
        payment_status: 'paid',
        payment_method: 'pocketcash',
        paid_at: new Date().toISOString()
      })
      .in('id', orderIds);

    if (updateError) {
      console.error('Error updating orders:', updateError);
      // CRÍTICO: El dinero ya se descontó pero la orden no se actualizó.
      // Aquí deberíamos tener un mecanismo de rollback o alerta.
      // Por ahora, retornamos error pero el dinero ya "voló".
      // TODO: Implementar transacción distribuida o compensación.
      return NextResponse.json({ error: 'Pago procesado pero error actualizando órdenes. Contacta soporte.' }, { status: 500 });
    }

    // 5. Notificar a todos (Paneles y Email)
    // Notificar al comprador (Panel)
    await admin.from('notifications').insert({
      user_id: userId,
      type: 'payment_approved',
      title: '¡Pago exitoso con PocketCash!',
      body: `Tu pago de $${totalAmount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })} ha sido procesado correctamente.`,
      data: { kind: 'payment_approved', orderIds },
      link_to: '/dashboard/compras'
    });

    // Enviar emails (async, no bloqueamos respuesta)
    // Usamos Promise.allSettled para que no falle el request si falla el email
    await Promise.allSettled([
      notifyPaymentApprovedBuyer({ buyerId: userId, orderIds, total: totalAmount }),
      notifyPaymentApprovedSellers({ admin, orderIds })
    ]);

    // 6. Crear sesión de checkout para registro (opcional pero recomendado para consistencia)
    // Esto ayuda a que aparezca en "Mis Compras" con un ID de checkout unificado si se usa esa lógica
    await admin.from('checkout_sessions').insert({
      buyer_id: userId,
      order_ids: orderIds,
      payment_method: 'pocketcash',
      status: 'paid',
      amount: totalAmount,
      approved_at: new Date().toISOString()
    });

    return NextResponse.json({ 
      ok: true, 
      new_balance: result.new_balance,
      message: 'Pago realizado con éxito' 
    });

  } catch (error: any) {
    console.error('Wallet Pay Error:', error);
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}
