import { SupabaseClient } from '@supabase/supabase-js';

export type PlanType = 'basic' | 'pro';

export const PLAN_LIMITS = {
  basic: {
    listings: 50,
    commission_percent: 23,
    shipping_included: 0,
    auctions: 15,
    coupons: 25,
    featured: 3,
    allow_personal_delivery: false,
    allow_shipping_by_seller: false,
    withdrawal_hours: 168, // 7 days (Semanales)
  },
  pro: {
    listings: Infinity,
    commission_percent: 18,
    featured: 25,
    shipping_included: 0, // Not mentioned in screenshot as included, but "Permite envío por tu propia cuenta"
    auctions: Infinity,
    coupons: Infinity,
    allow_personal_delivery: true,
    allow_shipping_by_seller: true,
    withdrawal_hours: 48, // 48 hours
  }
};

export async function getCommissions(supabase: SupabaseClient): Promise<{ basic: number; pro: number }> {
  try {
    const { data } = await supabase.from('app_settings').select('commission_basic_percent, commission_pro_percent').single();
    return {
      basic: Number(data?.commission_basic_percent ?? PLAN_LIMITS.basic.commission_percent),
      pro: Number(data?.commission_pro_percent ?? PLAN_LIMITS.pro.commission_percent)
    };
  } catch (err) {
    console.error('Error fetching commissions:', err);
    return {
      basic: PLAN_LIMITS.basic.commission_percent,
      pro: PLAN_LIMITS.pro.commission_percent
    };
  }
}

export async function getPlan(supabase: SupabaseClient, userId: string): Promise<PlanType> {
  const { data } = await supabase.from('profiles').select('plan_type').eq('id', userId).single();
  const p = data?.plan_type;
  if (p === 'pro') return 'pro';
  return 'basic';
}

export async function checkLimit(
  supabase: SupabaseClient,
  userId: string,
  feature: 'auctions' | 'listings' | 'featured' | 'coupons' | 'shipping_included'
): Promise<{ allowed: boolean; usage: number; limit: number; plan: PlanType }> {
  const plan = await getPlan(supabase, userId);
  const limits = PLAN_LIMITS[plan];
  
  const limit = (limits as any)[feature] ?? 0;

  if (limit === Infinity) {
    return { allowed: true, usage: 0, limit, plan };
  }

  // Get start of current month
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  let count = 0;

  if (feature === 'listings') {
      const { count: activeCount } = await supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('seller_id', userId)
        .eq('status', 'active')
        .neq('sale_type', 'auction');
       
      count = activeCount || 0;

  } else if (feature === 'auctions') {
      const { count: activeCount } = await supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('seller_id', userId)
        .eq('status', 'active')
        .eq('sale_type', 'auction');
      count = activeCount || 0;

  } else if (feature === 'coupons') {
    const { count: c } = await supabase
      .from('coupons')
      .select('id', { count: 'exact', head: true })
      .eq('seller_id', userId)
      .gte('created_at', startOfMonth); // Assuming monthly limit for coupons too
    count = c || 0;
  } else if (feature === 'featured') {
      const { count: c } = await supabase
        .from('listings')
        .select('id', { count: 'exact', head: true })
        .eq('seller_id', userId)
        .eq('status', 'active')
        .eq('is_featured', true);
      count = c || 0;
  }

  return { allowed: count < limit, usage: count, limit, plan };
}
