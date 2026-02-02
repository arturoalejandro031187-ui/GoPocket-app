import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/auth/middleware';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { notifyPaymentApprovedBuyer, notifyPaymentApprovedSellers } from '@/lib/email/notify';

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

    // 1. Obtener órdenes y validar que pertenezcan al usuario y estén pendientes
    const { data: orders, error: ordersError } = await admin
      .from('orders')
      .select('id, total, status')
      .in('id', orderIds)
      .eq('buyer_id', userId)
      .in('status', ['pending', 'pending_payment']); // Permitir pending y pending_payment

    if (ordersError || !orders || orders.length !== orderIds.length) {
      console.error('[Wallet Pay] Error validando órdenes:', {
        requested: orderIds,
        found: orders?.map(o => ({ id: o.id, status: o.status })),
        error: ordersError
      });
      return NextResponse.json({ error: 'Algunas órdenes no son válidas o ya no están pendientes.' }, { status: 400 });
    }

    // 2. Calcular total a pagar
    const totalAmount = orders.reduce((sum, order) => sum + Number(order.total), 0);

    if (totalAmount <= 0) {
      return NextResponse.json({ error: 'El monto total a pagar es inválido.' }, { status: 400 });
    }

    // 3. Ejecutar pago atómico (deducir wallet)
    // Preparamos las transacciones para el RPC
    const transactions = orders.map(order => ({
      amount: order.total,
      concept: `Pago de orden #${order.id.slice(0, 8)}`,
      ref_type: 'order', // Corregido: Debe coincidir con el enum wallet_reference_type ('order', 'refund', etc)
      ref_id: order.id
    }));

    // NOTA: Si 'order_payment' no está en el enum, usaremos 'purchase' o lo que sea apropiado.
    // Asumiremos que el RPC maneja la conversión o que el enum es flexible.
    // Si falla, el error lo indicará.

    const { data: rpcResult, error: rpcError } = await admin.rpc('deduct_wallet_batch', {
      p_user_id: userId,
      p_transactions: transactions
    });

    if (rpcError) {
      console.error('RPC Error:', rpcError);
      return NextResponse.json({ error: 'Error al procesar el pago con wallet.' }, { status: 500 });
    }

    // El RPC devuelve json: { success: boolean, message?: string, new_balance?: number }
    const result = rpcResult as { success: boolean; message?: string; new_balance?: number };

    if (!result.success) {
      return NextResponse.json({ error: result.message || 'Saldo insuficiente o error en wallet.' }, { status: 400 });
    }

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
