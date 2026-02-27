import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const orderId = 'f1a56eef-2498-417b-ad3e-a12fbd853c4a';

// Find session
const { data: sessions } = await s.from('checkout_sessions').select('id,order_ids,status').order('created_at', { ascending: false }).limit(10);
let sessionId = null;
for (const sess of (sessions || [])) {
  if ((sess.order_ids || []).includes(orderId)) { sessionId = sess.id; break; }
}

// Revert
await s.from('orders').update({ status: 'pending_payment', tracking_number: null, shipping_label_url: null }).eq('id', orderId);
if (sessionId) await s.from('checkout_sessions').update({ status: 'pending' }).eq('id', sessionId);
console.log('Revertido OK. Aprueba de nuevo en Gestión de Pagos.');
