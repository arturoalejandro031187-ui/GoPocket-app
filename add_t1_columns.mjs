import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Find all orders that were T1 but don't have shipping_method set
// T1 orders have shipping_carrier like 'DHL Express', 'FedEx', 'Estafeta' etc.
// AND shipping_by_seller = false AND shipping_option_id is null AND t1_quote_token is not null
// OR we can look for orders with specific carriers that are NOT gopocket and NOT seller managed

// First, let's find orders with t1_quote_token set but shipping_method null
const { data: t1Orders, error } = await s
  .from('orders')
  .select('id,shipping_method,shipping_carrier,t1_quote_token,shipping_by_seller,status,created_at')
  .not('t1_quote_token', 'is', null)
  .is('shipping_method', null);

console.log('Orders with t1_quote_token but no shipping_method:', t1Orders?.length || 0);
for (const o of (t1Orders || [])) {
  console.log(`  ${o.id.slice(0, 8)} carrier=${o.shipping_carrier} status=${o.status} created=${o.created_at}`);
}

// Also find orders where carrier is DHL/FedEx etc but not gopocket and not seller managed
const { data: premiumOrders } = await s
  .from('orders')
  .select('id,shipping_method,shipping_carrier,shipping_by_seller,t1_quote_token,status')
  .is('shipping_method', null)
  .eq('shipping_by_seller', false)
  .is('shipping_option_id', null)
  .not('shipping_carrier', 'is', null);

const t1Carriers = (premiumOrders || []).filter(o => {
  const c = (o.shipping_carrier || '').toLowerCase();
  return c.includes('dhl') || c.includes('fedex') || c.includes('estafeta') || c.includes('ups') || c === 'gopocket_premium';
});

console.log('\nOrders with T1-like carriers but no shipping_method:', t1Carriers.length);
for (const o of t1Carriers) {
  console.log(`  ${o.id.slice(0, 8)} carrier=${o.shipping_carrier} status=${o.status}`);
}

// Combine unique IDs
const allIds = [...new Set([
  ...(t1Orders || []).map(o => o.id),
  ...t1Carriers.map(o => o.id),
])];

if (allIds.length > 0) {
  const { error: upErr } = await s
    .from('orders')
    .update({ shipping_method: 'gopocket_premium' })
    .in('id', allIds);
  console.log(`\n✅ Updated ${allIds.length} orders to shipping_method='gopocket_premium':`, upErr ? upErr.message : 'OK');
} else {
  console.log('\nNo orders to update.');
}
