import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Check last few orders for t1_quote_token
const { data, error } = await s
  .from('orders')
  .select('id,shipping_method,shipping_carrier,t1_quote_token,tracking_number,shipping_label_url,created_at')
  .order('created_at', { ascending: false })
  .limit(5);

if (error) {
  console.log('Error:', error.message);
} else {
  for (const o of data) {
    console.log({
      id: o.id?.slice(0, 8),
      method: o.shipping_method,
      carrier: o.shipping_carrier,
      token: o.t1_quote_token ? o.t1_quote_token.slice(0, 20) + '...' : null,
      tracking: o.tracking_number,
      label: o.shipping_label_url ? 'YES' : null,
      created: o.created_at,
    });
  }
}
