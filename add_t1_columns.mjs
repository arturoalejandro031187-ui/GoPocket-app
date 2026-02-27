import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const orderId = '741be081-9e07-4048-ac61-b7af433b752b';
const { data, error } = await s
  .from('orders')
  .select('id,shipping_method,shipping_carrier,shipping_by_seller,t1_quote_token,tracking_number,shipping_label_url,status,shipping_fee,total')
  .eq('id', orderId)
  .maybeSingle();

if (error) {
  console.log('Error:', error.message);
} else {
  console.log('Order data:', JSON.stringify(data, null, 2));
}
