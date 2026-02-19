import { supabaseAdmin } from '@/lib/supabase/admin';
import { payoutNet } from '@/lib/payouts/calc';

async function main() {
  const id = process.argv[2];
  const dry = process.argv.includes('--dry');
  if (!id) {
    console.error('Usage: node scripts/fix-order-shipping.ts <orderId> [--dry]');
    process.exit(1);
  }
  const admin = supabaseAdmin();

  const { data: order, error } = await admin
    .from('orders')
    .select('id, subtotal, total, commission_fee, shipping_fee, shipping_subsidy, shipping_option_id, shipping_carrier, shipping_label_url, shipping_by_seller, created_at')
    .eq('id', id)
    .maybeSingle();
  if (error || !order) {
    console.error('Order fetch error:', error?.message || 'not found');
    process.exit(2);
  }

  const { data: items } = await admin
    .from('order_items')
    .select('order_id, listings!inner(id, shipping_by_seller)')
    .eq('order_id', id);

  const hasSelfShippingListing = (items || []).some((it: any) => Boolean(it?.listings?.shipping_by_seller));

  const opt = String(order.shipping_option_id || '').trim().toLowerCase();
  const carr = String(order.shipping_carrier || '').trim().toLowerCase();
  const pickup = opt === 'pickup' || carr === 'pickup';
  const hasSignals =
    (!pickup && Boolean(opt) && opt !== 'pickup') ||
    (!pickup && carr === 'gopocket') ||
    Boolean(order.shipping_label_url) ||
    Number(order.shipping_subsidy || 0) > 0 ||
    (!pickup && Number(order.shipping_fee || 0) > 0);

  const desiredBySeller = !pickup && hasSelfShippingListing && !hasSignals;
  const currentBySeller = Boolean(order.shipping_by_seller);

  const netCurrent = payoutNet(order as any);
  const netDerived = payoutNet({ ...order, shipping_by_seller: desiredBySeller } as any);

  console.log(JSON.stringify({
    id,
    pickup,
    hasSelfShippingListing,
    hasSignals,
    shipping_by_seller_current: currentBySeller,
    shipping_by_seller_desired: desiredBySeller,
    subtotal: order.subtotal,
    commission: order.commission_fee,
    shipping_fee: order.shipping_fee,
    shipping_subsidy: order.shipping_subsidy,
    net_current: netCurrent,
    net_derived: netDerived,
    dry
  }, null, 2));

  if (!dry && currentBySeller !== desiredBySeller) {
    const { error: upErr } = await admin
      .from('orders')
      .update({ shipping_by_seller: desiredBySeller })
      .eq('id', id);
    if (upErr) {
      console.error('Update error:', upErr.message);
      process.exit(3);
    }
    console.log('Updated shipping_by_seller to', desiredBySeller);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(99);
});

