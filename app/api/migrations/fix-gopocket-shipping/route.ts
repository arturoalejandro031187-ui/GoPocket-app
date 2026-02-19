import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

async function runFix() {
  const admin = supabaseAdmin();

  const limit = 5000;
  const { data: orders, error } = await admin
    .from('orders')
    .select('id')
    .in('payment_method', ['mercadopago', 'bank_transfer', 'bank_deposit', 'oxxo', 'pocketcash'])
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  if (!orders || orders.length === 0) {
    return { updated_true: 0, updated_false: 0, scanned_orders: 0 };
  }

  const orderIds = orders.map((o: any) => String(o.id || '').trim()).filter(Boolean);

  const { data: items, error: itemsErr } = await admin
    .from('order_items')
    .select('order_id, listings!inner(id, shipping_by_seller)')
    .in('order_id', orderIds);

  if (itemsErr) {
    throw new Error(itemsErr.message);
  }

  const map: Record<string, { hasSelfShipping: boolean }> = {};
  for (const it of items || []) {
    const oid = String((it as any).order_id || '').trim();
    if (!oid) continue;
    const listing = (it as any).listings as any;
    const flag = listing && listing.shipping_by_seller === true;
    if (!map[oid]) {
      map[oid] = { hasSelfShipping: flag };
    } else if (flag) {
      map[oid].hasSelfShipping = true;
    }
  }

  const toTrue: string[] = [];
  const toFalse: string[] = [];

  for (const oid of orderIds) {
    const info = map[oid];
    if (!info) continue;
    if (info.hasSelfShipping) {
      toTrue.push(oid);
    } else {
      toFalse.push(oid);
    }
  }

  let updatedTrue = 0;
  let updatedFalse = 0;

  if (toTrue.length > 0) {
    const { error: upErr } = await admin.from('orders').update({ shipping_by_seller: true }).in('id', toTrue);
    if (upErr) throw new Error(upErr.message);
    updatedTrue = toTrue.length;
  }

  if (toFalse.length > 0) {
    const { error: upErr } = await admin.from('orders').update({ shipping_by_seller: false }).in('id', toFalse);
    if (upErr) throw new Error(upErr.message);
    updatedFalse = toFalse.length;
  }

  return {
    updated_true: updatedTrue,
    updated_false: updatedFalse,
    scanned_orders: orderIds.length,
  };
}

export async function POST(req: NextRequest) {
  try {
    const result = await runFix();
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    console.error('[FIX-GOPOCKET-SHIPPING] Error:', e);
    return NextResponse.json({ ok: false, error: e.message || 'unexpected_error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}

