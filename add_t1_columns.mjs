import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Test the exact same query that the mark_paid code uses
const orderIds = ['f1a56eef-2498-417b-ad3e-a12fbd853c4a'];
const { data, error } = await s
  .from('orders')
  .select('id,seller_id,buyer_id,shipping_method,shipping_carrier,t1_quote_token,shipping_full_name,shipping_phone,shipping_address')
  .in('id', orderIds)
  .eq('shipping_method', 'gopocket_premium');

console.log('Query result:', error ? error.message : JSON.stringify(data, null, 2));
