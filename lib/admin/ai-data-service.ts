
import { supabaseAdmin } from '@/lib/supabase/admin';

type EnhancedContext = {
  summary: any;
  specificData?: any;
  dataType?: 'order' | 'user' | 'withdrawal' | 'payment' | 'search_results' | null;
  dataId?: string;
  // New Lists
  recentOrders?: any[];
  recentUsers?: any[];
  recentWithdrawals?: any[];
  recentDisputes?: any[];
  walletStats?: any;
  searchResults?: any; // Generic search results
};

// Regex for UUID
const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
// Regex for Stripe-like IDs
const STRIPE_REGEX = /(cs|pi|ch|re|py)_[a-zA-Z0-9]+/;
// Regex for Email
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

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

  // 2. Intent Detection & Broad Fetching
  let recentOrders: any[] | undefined;
  let recentUsers: any[] | undefined;
  let recentWithdrawals: any[] | undefined;
  let recentDisputes: any[] | undefined;
  let walletStats: any | undefined;

  try {
    // A. Orders/Sales Intent
    if (lowerMsg.includes('orden') || lowerMsg.includes('venta') || lowerMsg.includes('pedido') || lowerMsg.includes('operacion')) {
      const { data } = await admin.from('orders')
        .select('id, created_at, total, status, buyer_id, seller_id')
        .order('created_at', { ascending: false })
        .limit(15);
      recentOrders = data || [];
    }

    // B. Users Intent
    if (lowerMsg.includes('usuario') || lowerMsg.includes('cliente') || lowerMsg.includes('vendedor') || lowerMsg.includes('perfil')) {
      const { data } = await admin.from('profiles')
        .select('id, email, full_name, created_at, is_seller, store_name')
        .order('created_at', { ascending: false })
        .limit(15);
      recentUsers = data || [];
    }

    // C. Processes/Pending Intent
    if (lowerMsg.includes('proceso') || lowerMsg.includes('pendiente') || lowerMsg.includes('retiro') || lowerMsg.includes('disputa')) {
       const [wdRes, dispRes] = await Promise.all([
         admin.from('seller_withdrawals').select('*').eq('status', 'pending').limit(15),
         admin.from('disputes').select('*').eq('status', 'open').limit(15)
       ]);
       recentWithdrawals = wdRes.data || [];
       recentDisputes = dispRes.data || [];
    }

    // D. Accounting/Wallet Intent
    if (lowerMsg.includes('contabilidad') || lowerMsg.includes('dinero') || lowerMsg.includes('balance') || lowerMsg.includes('wallet') || lowerMsg.includes('saldo')) {
      // Fetch total system balance (sum of all wallets)
      // Note: supabase .sum() might not be directly available in simple client, we fetch all non-zero or use RPC if available. 
      // For safety/speed, let's just fetch recent transactions and maybe a few top wallets.
      // Ideally we would have a 'stats' table or RPC. I'll check if we can just get a quick sum.
      // Since we can't easily sum millions of rows without RPC, we'll fetch recent transactions.
      
      const { data: txs } = await admin.from('wallet_transactions')
        .select('id, amount, type, concept, created_at, reference_type')
        .order('created_at', { ascending: false })
        .limit(15);
        
      walletStats = {
        recent_transactions: txs || [],
        note: "System-wide balance calculation requires specific RPC (not invoked to save resources unless strictly needed)."
      };
    }
  } catch (err) {
    console.error('[AdminAI] Error fetching broad lists:', err);
  }

  // 3. Deep Search Logic (Specific ID)
  let specificData = null;
  let dataType: EnhancedContext['dataType'] = null;
  let dataId = undefined;
  
  // 4. Text/Email Search Logic
  let searchResults: any = null;

  try {
    const emailMatch = message.match(EMAIL_REGEX);
    if (emailMatch) {
      const email = emailMatch[0];
      const { data: user } = await admin.from('profiles').select('*').ilike('email', email).maybeSingle();
      if (user) {
        specificData = user;
        dataType = 'user';
        dataId = user.id;
      }
    } else {
        // If not ID and not Email, check for text search intent
        // Only if message is short enough to be a search query (< 50 chars) or has explicit keywords
        const isSearchIntent = lowerMsg.includes('buscar') || lowerMsg.includes('busca') || lowerMsg.includes('encuentra') || lowerMsg.includes('quien es') || lowerMsg.includes('donde esta');
        
        if (isSearchIntent) {
            // Extract potential query: remove common keywords
            const queryRaw = lowerMsg.replace(/(buscar|busca|encuentra|quien es|donde esta|el usuario|el producto|la orden)/g, '').trim();
            
            if (queryRaw.length > 2) {
                // Parallel search in Profiles and Listings
                const [usersRes, listingsRes] = await Promise.all([
                    admin.from('profiles').select('id, email, full_name, store_name').or(`email.ilike.%${queryRaw}%,full_name.ilike.%${queryRaw}%,store_name.ilike.%${queryRaw}%`).limit(5),
                    admin.from('listings').select('id, title, price, status').ilike('title', `%${queryRaw}%`).limit(5)
                ]);
                
                if ((usersRes.data && usersRes.data.length > 0) || (listingsRes.data && listingsRes.data.length > 0)) {
                    searchResults = {
                        query: queryRaw,
                        users: usersRes.data || [],
                        listings: listingsRes.data || []
                    };
                }
            }
        }
    }
  } catch (err) {
      console.error('[AdminAI] Search error:', err);
  }

  // ID Detection (overrides text search if ID is found)
  try {
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
  } catch (err) {
    console.error('[AdminAI] Deep search error:', err);
  }

  const duration = Date.now() - startTime;
  console.log(`[AdminAI] Context fetch completed in ${duration}ms`);

  return {
    summary,
    specificData,
    dataType,
    dataId,
    // Lists
    recentOrders,
    recentUsers,
    recentWithdrawals,
    recentDisputes,
    walletStats,
    searchResults
  };
}
