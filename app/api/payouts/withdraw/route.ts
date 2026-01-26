import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { transferToMercadoPagoUser } from '@/lib/mercadopago/transfer';
import { payoutNet, toNumber } from '@/lib/payouts/calc';

export const dynamic = 'force-dynamic';

function getBearerToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: 'Falta Authorization Bearer' }, { status: 401 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
    const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    if (!supabaseUrl || !supabaseAnon) {
      return NextResponse.json({ error: 'Configuración Supabase incompleta' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseAnon, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr) return NextResponse.json({ error: userErr.message }, { status: 401 });
    if (!userData.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const sellerId = userData.user.id;
    const admin = supabaseAdmin();
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN || '';
    if (!accessToken) {
      return NextResponse.json({ error: 'Retiros por Mercado Pago no configurados (MERCADOPAGO_ACCESS_TOKEN).' }, { status: 503 });
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('mercadopago_account')
      .eq('id', sellerId)
      .maybeSingle();
    const mpAccount = String((profile as any)?.mercadopago_account ?? '').trim();
    if (!mpAccount) {
      return NextResponse.json(
        { error: 'Agrega tu cuenta de Mercado Pago en Mi perfil → Datos de cobro para poder retirar.' },
        { status: 400 },
      );
    }

    const disputedRes: any = await admin
      .from('disputes')
      .select('order_id')
      .eq('seller_id', sellerId)
      .eq('status', 'open');
    const disputedSet = new Set<string>(
      (Array.isArray(disputedRes?.data) ? disputedRes.data : []).map((d: any) => String(d?.order_id ?? '').trim()).filter(Boolean),
    );

    let withdrawnOrderIds: string[] = [];
    try {
      const wRes: any = await admin
        .from('seller_withdrawals')
        .select('order_ids')
        .eq('seller_id', sellerId)
        .eq('status', 'completed');
      if (!wRes?.error && Array.isArray(wRes.data)) {
        for (const w of wRes.data as any[]) {
          const arr = Array.isArray(w?.order_ids) ? w.order_ids : [];
          withdrawnOrderIds = withdrawnOrderIds.concat(arr.map((x: unknown) => String(x ?? '').trim()).filter(Boolean));
        }
      }
    } catch {
      return NextResponse.json(
        { error: 'Falta la tabla seller_withdrawals. Ejecuta supabase_seller_withdrawals.sql en Supabase.' },
        { status: 503 },
      );
    }
    const withdrawnSet = new Set(withdrawnOrderIds);

    const ordersRes: any = await admin
      .from('orders')
      .select('id,status,subtotal,total,shipping_fee,commission_fee,coupon_discount,shipping_subsidy')
      .eq('seller_id', sellerId)
      .not('paid_to_seller_at', 'is', null)
      .limit(500);
    if (ordersRes?.error) return NextResponse.json({ error: ordersRes.error.message }, { status: 400 });

    const orders = (Array.isArray(ordersRes?.data) ? ordersRes.data : []) as any[];
    const candidates = orders.filter((o) => {
      const id = String(o?.id ?? '').trim();
      if (!id) return false;
      if (withdrawnSet.has(id)) return false;
      if (disputedSet.has(id)) return false;
      const st = String(o?.status ?? '').toLowerCase();
      if (['cancelled', 'canceled', 'refunded'].includes(st)) return false;
      return true;
    });

    let total = 0;
    for (const o of candidates) total += payoutNet(o);

    let guideDeduction = 0;
    try {
      const gRes: any = await admin
        .from('disputes')
        .select('order_id,return_guide_cost')
        .eq('seller_id', sellerId)
        .eq('status', 'resolved')
        .eq('admin_decision', 'assign_guide_charged_seller');
      if (!gRes?.error && Array.isArray(gRes.data)) {
        for (const r of gRes.data as any[]) {
          const c = toNumber(r?.return_guide_cost);
          if (c > 0) guideDeduction += c;
        }
      }
    } catch {
      // noop
    }
    const amountMxn = Math.max(0, total - guideDeduction);
    if (amountMxn < 0.01) {
      return NextResponse.json(
        { error: 'No hay saldo disponible para retirar. Confirma que el comprador haya marcado "Recibido" en las órdenes entregadas.' },
        { status: 400 },
      );
    }

    const orderIds = candidates.map((o) => String(o?.id ?? '').trim()).filter(Boolean);
    const amountCents = Math.round(amountMxn * 100);

    let ins: any;
    try {
      ins = await admin.from('seller_withdrawals').insert({
        seller_id: sellerId,
        amount_cents: amountCents,
        order_ids: orderIds,
        status: 'pending',
      }).select('id').single();
    } catch (e) {
      return NextResponse.json(
        { error: 'No se pudo registrar el retiro. Ejecuta supabase_seller_withdrawals.sql en Supabase.' },
        { status: 503 },
      );
    }
    if (ins?.error) {
      const code = String((ins.error as any)?.code ?? '');
      if (code === '42P01') {
        return NextResponse.json(
          { error: 'Falta la tabla seller_withdrawals. Ejecuta supabase_seller_withdrawals.sql en Supabase.' },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: (ins.error as any)?.message ?? 'Error al crear retiro' }, { status: 400 });
    }

    const withdrawalId = (ins.data as any)?.id as string;
    const transfer = await transferToMercadoPagoUser({
      accessToken,
      amountMxn,
      recipientEmail: mpAccount,
      description: `GoPocket retiro · ${orderIds.length} venta(s)`,
    });

    const now = new Date().toISOString();
    if (transfer.ok) {
      await admin
        .from('seller_withdrawals')
        .update({ status: 'completed', mp_transfer_id: transfer.mp_transfer_id, updated_at: now })
        .eq('id', withdrawalId);
    } else {
      await admin
        .from('seller_withdrawals')
        .update({ status: 'failed', error_message: transfer.error, updated_at: now })
        .eq('id', withdrawalId);
      return NextResponse.json(
        { error: `No se pudo completar la transferencia: ${transfer.error}. El retiro quedó registrado como fallido.` },
        { status: 502 },
      );
    }

    const resp = NextResponse.json({
      ok: true,
      withdrawalId,
      amountMxn,
      mpTransferId: transfer.mp_transfer_id,
      message: 'Transferencia enviada a tu cuenta de Mercado Pago.',
    });
    resp.headers.set('Cache-Control', 'no-store, max-age=0');
    return resp;
  } catch (e: unknown) {
    console.error(e);
    const resp = NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error al procesar retiro' },
      { status: 500 },
    );
    resp.headers.set('Cache-Control', 'no-store, max-age=0');
    return resp;
  }
}
