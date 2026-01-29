import { SupabaseClient } from '@supabase/supabase-js';

export type PlanType = 'basic' | 'pro';

export const PLAN_LIMITS = {
  basic: {
    auctions: 15,
    listings: 50,
    featured: 3,
    coupons: 25,
    allow_personal_delivery: false,
    allow_shipping_by_seller: false,
    commission_percent: 20,
    withdrawal_hours: 168, // 7 days (Saturdays logic handled separately)
  },
  pro: {
    auctions: Infinity,
    listings: Infinity,
    featured: 15, 
    coupons: Infinity,
    allow_personal_delivery: true,
    allow_shipping_by_seller: true,
    commission_percent: 15,
    withdrawal_hours: 48,
  },
};

export async function getPlan(supabase: SupabaseClient, userId: string): Promise<PlanType> {
  const { data } = await supabase.from('profiles').select('plan_type').eq('id', userId).single();
  // Default to basic if null or invalid
  const p = data?.plan_type;
  return (p === 'pro' ? 'pro' : 'basic');
}

export async function checkLimit(
  supabase: SupabaseClient,
  userId: string,
  feature: 'auctions' | 'listings' | 'featured' | 'coupons'
): Promise<{ allowed: boolean; usage: number; limit: number; plan: PlanType }> {
  const plan = await getPlan(supabase, userId);
  const limits = PLAN_LIMITS[plan];
  const limit = limits[feature];

  if (limit === Infinity) {
    return { allowed: true, usage: 0, limit, plan };
  }

  // Get start of current month
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  let count = 0;

  if (feature === 'listings') {
    const { count: c } = await supabase
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .eq('seller_id', userId)
      .neq('sale_type', 'auction')
      .gte('created_at', startOfMonth);
    count = c || 0;
  } else if (feature === 'auctions') {
    // Assuming auctions are listings with sale_type='auction'
    const { count: c } = await supabase
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .eq('seller_id', userId)
      .eq('sale_type', 'auction')
      .gte('created_at', startOfMonth);
    count = c || 0;
  } else if (feature === 'featured') {
    const { count: c } = await supabase
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .eq('seller_id', userId)
      .eq('is_featured', true)
      .gte('created_at', startOfMonth);
    count = c || 0;
  } else if (feature === 'coupons') {
    const { count: c } = await supabase
      .from('coupons')
      .select('id', { count: 'exact', head: true })
      .eq('seller_id', userId)
      .gte('created_at', startOfMonth);
    count = c || 0;
  }

  return { allowed: count < limit, usage: count, limit, plan };
}
