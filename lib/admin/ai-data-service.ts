
import { supabaseAdmin } from '@/lib/supabase/admin';

type EnhancedContext = {
  summary: any;
  specificData?: any;
  dataType?: 'order' | 'user' | 'withdrawal' | 'payment' | 'search_results' | null;
  dataId?: string;
};

// Regex for UUID
const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
// Regex for Stripe-like IDs (cs_, pi_, ch_, re_, py_)
const STRIPE_REGEX = /(cs|pi|ch|re|py)_[a-zA-Z0-9]+/;

export async function getEnhancedAdminContext(message: string): Promise<EnhancedContext> {
  const startTime = Date.now();
  console.log(`[AdminAI] Context fetch started for: "${message.substring(0, 50)}..."`);
  
  const admin = supabaseAdmin();
  const lowerMsg = message.toLowerCase();
  
  // 1. Base Summary Stats (Always useful)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

  // Parallel basic fetch with error handling
  // We use Promise.allSettled to prevent one failure from blocking everything, 
  // but for simplicity/type safety in this existing structure, we'll wrap the Promise.all in a try/catch
  // and log specific errors if we can.
  
  let ordersCount = 0, ordersData: any[] = [];
  let paymentsPending = 0;
  let disputesOpen = 0;
  let usersNew = 0;
  let supportPending = 0;
  let withdrawalsPending = 0;

  try {
      const results = await Promise.all([
        admin.from('orders').select('total', { count: 'exact' }).gte('created_at', todayIso),
        admin.from('checkout_sessions').select('*', { count: 'exact', head: true }).eq('payment_method', 'offline').eq('status', 'pending'),
        admin.from('disputes').select('*', { count: 'exact', head: true }).eq('status', 'open'),
        admin.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', todayIso),
        admin.from('support_conversations').select('*', { count: 'exact', head: true }).eq('status', 'open'),
        admin.from('seller_withdrawals').select('*', { count: 'exact', head: true }).eq('status', 'pending')
      ]);

      // Check for errors in results
      results.forEach((res, idx) => {
          if (res.error) {
              console.error(`[AdminAI] Summary Query ${idx} failed:`, res.error);
          }
      });

      ordersCount = results[0].count || 0;
      ordersData = results[0].data || [];
      paymentsPending = results[1].count || 0;
      disputesOpen = results[2].count || 0;
      usersNew = results[3].count || 0;
      supportPending = results[4].count || 0;
      withdrawalsPending = results[5].count || 0;

  } catch (err) {
      console.error('[AdminAI] Critical error fetching summary stats:', err);
      // Continue with zero values rather than crashing
  }

  const salesToday = ordersData?.reduce((acc, o) => acc + (o.total || 0), 0) || 0;

  const summary = {
    orders_today: ordersCount,
    sales_today: salesToday,
    payments_pending: paymentsPending,
    disputes_open: disputesOpen,
    users_new_today: usersNew,
    support_pending: supportPending,
    withdrawals_pending: withdrawalsPending
  };

  // 2. Deep Search Logic
  let specificData = null;
  let dataType: EnhancedContext['dataType'] = null;
  let dataId = undefined;

  try {
      // A. Check for UUID
      const uuidMatch = message.match(UUID_REGEX);
      // B. Check for Stripe ID
      const stripeMatch = message.match(STRIPE_REGEX);
      // C. Check for Pocket Reference (Offline Payment)
      const pckMatch = message.match(/PCK-\d{6}-[A-F0-9]+/i);

      if (pckMatch) {
        const ref = pckMatch[0].toUpperCase();
        dataId = ref;
        
        // Search in checkout_sessions by reference_code
        const { data: payment } = await admin
            .from('checkout_sessions')
            .select('*')
            .eq('reference_code', ref)
            .maybeSingle();

        if (payment) {
            specificData = payment;
            dataType = 'payment';
        }
      }
      else if (uuidMatch) {
        const id = uuidMatch[0];
        dataId = id;
        
        // Try Order (Fetch base order first to avoid relation errors)
        const { data: order, error: orderError } = await admin.from('orders').select('*').eq('id', id).maybeSingle();
        
        if (order) {
          // Fetch details manually for safety
          const [resItems, resSeller, resBuyer] = await Promise.all([
            admin.from('order_items').select('*').eq('order_id', id),
            admin.from('profiles').select('full_name, email, phone').eq('id', order.seller_id).maybeSingle(),
            admin.from('profiles').select('full_name, email').eq('id', order.buyer_id).maybeSingle()
          ]);

          specificData = {
            ...order,
            items: resItems.data || [],
            seller: resSeller.data || { id: order.seller_id, note: 'Profile not found' },
            buyer: resBuyer.data || { id: order.buyer_id, note: 'Profile not found' }
          };
          dataType = 'order';
        } else {
          // Try User (Profile)
          const { data: profile } = await admin.from('profiles').select('*').eq('id', id).maybeSingle();
          if (profile) {
            // Fetch extra user stats
            const [resUserOrders, resUserSales] = await Promise.all([
                 admin.from('orders').select('*', { count: 'exact', head: true }).eq('buyer_id', id),
                 admin.from('orders').select('*', { count: 'exact', head: true }).eq('seller_id', id)
            ]);
            
            specificData = { ...profile, stats: { orders_bought: resUserOrders.count, orders_sold: resUserSales.count } };
            dataType = 'user';
          } else {
            // Try Withdrawal
            const { data: withdrawal } = await admin.from('seller_withdrawals').select('*').eq('id', id).maybeSingle();
            if (withdrawal) {
              // Fetch seller manually
              const userId = withdrawal.user_id || withdrawal.seller_id;
              let seller = null;
              if (userId) {
                 const { data: s } = await admin.from('profiles').select('full_name, email').eq('id', userId).maybeSingle();
                 seller = s;
              }
              specificData = { ...withdrawal, seller };
              dataType = 'withdrawal';
            } else {
                // Try Payment (Checkout Session) - UUID case
                const { data: payment } = await admin.from('checkout_sessions').select('*').eq('id', id).maybeSingle();
                if (payment) {
                    specificData = payment;
                    dataType = 'payment';
                }
            }
          }
        }
      }
      else if (stripeMatch) {
          const id = stripeMatch[0];
          dataId = id;
          // Try Payment (Checkout Session) - Stripe ID case
          const { data: payment } = await admin.from('checkout_sessions').select('*').eq('id', id).maybeSingle();
          if (payment) {
              specificData = payment;
              dataType = 'payment';
          }
      } 
      // C. Check for Email search
      else if (lowerMsg.includes('@') && (lowerMsg.includes('usuario') || lowerMsg.includes('email') || lowerMsg.includes('correo'))) {
        const emailMatch = message.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        if (emailMatch) {
            const email = emailMatch[0];
            const { data: profile } = await admin.from('profiles').select('*').eq('email', email).maybeSingle();
            if (profile) {
                const [resUserOrders, resUserSales] = await Promise.all([
                     admin.from('orders').select('*', { count: 'exact', head: true }).eq('buyer_id', profile.id),
                     admin.from('orders').select('*', { count: 'exact', head: true }).eq('seller_id', profile.id)
                ]);
                specificData = { ...profile, stats: { orders_bought: resUserOrders.count, orders_sold: resUserSales.count } };
                dataType = 'user';
                dataId = profile.id;
            }
        }
      }
  } catch (err) {
      console.error('[AdminAI] Error fetching specific data:', err);
      // Fallback: don't fail the whole request, just return no specific data
  }

  const duration = Date.now() - startTime;
  console.log(`[AdminAI] Context fetch completed in ${duration}ms`);

  return {
    summary,
    specificData,
    dataType,
    dataId
  };
}
