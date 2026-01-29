import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

function toNumber(v: unknown) {
  const n = typeof v === 'number' ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function badgeForPercent(pct: number): 'plata' | 'gold' | 'platinum' | null {
  if (pct >= 91) return 'platinum';
  if (pct >= 71) return 'gold';
  if (pct >= 51) return 'plata';
  return null;
}

const CANCELLED = ['cancelled', 'canceled', 'refunded'];

async function getOperationsCount(admin: ReturnType<typeof supabaseAdmin>, userId: string): Promise<number> {
  try {
    const r: any = await admin
      .from('orders')
      .select('id,status')
      .or(`seller_id.eq.${userId},buyer_id.eq.${userId}`)
      .limit(5000);
    if (r?.error || !Array.isArray(r?.data)) return 0;
    const rows = (r.data as any[]) ?? [];
    const n = rows.filter((o: any) => !CANCELLED.includes(String(o?.status ?? '').toLowerCase())).length;
    return Math.max(0, n);
  } catch {
    return 0;
  }
}

function minimalSeller(sellerId: string) {
  return {
    id: sellerId,
    name: 'Vendedor',
    state: null as string | null,
    city: null as string | null,
    is_verified: false,
    rating_percent: 100,
    badge: badgeForPercent(100),
    operations_count: 0,
  };
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let sellerId = '';
  try {
    const params = await ctx.params;
    sellerId = String(params?.id ?? '').trim();
  } catch (e) {
    console.error('[sellers] params parse error:', e);
  }
  if (!sellerId || sellerId.length < 10) {
    return NextResponse.json({ error: 'seller id is required' }, { status: 400 });
  }

  try {
    const admin = supabaseAdmin();
    let profileRes: any = await admin
      .from('profiles')
      .select('full_name,reputation_score,rating_good_count,rating_total_count,state,city,is_verified,plan_type,store_logo_url')
      .eq('id', sellerId)
      .maybeSingle();
    if (profileRes?.error) {
      const code = String((profileRes.error as any)?.code || '');
      const msg = String((profileRes.error as any)?.message || '').toLowerCase();
      if (code === '42703' || msg.includes('column') || msg.includes('does not exist')) {
        profileRes = await admin.from('profiles').select('full_name,state,city,is_verified,plan_type,store_logo_url').eq('id', sellerId).maybeSingle();
      }
    }
    const profileData = profileRes?.error ? null : (profileRes?.data as any);
    const name = String(profileData?.full_name || '').trim() || 'Vendedor';
    const state = profileData ? (String(profileData.state || '').trim() || null) : null;
    const city = profileData ? (String(profileData.city || '').trim() || null) : null;
    const isVerified = Boolean(profileData?.is_verified ?? false);
    const planType = String(profileData?.plan_type || 'basic');
    const storeLogoUrl = String(profileData?.store_logo_url || '').trim() || null;

    const operations_count = await getOperationsCount(admin, sellerId);

    const rpc: any = await admin.rpc('get_user_reputation', { p_user: sellerId });
    if (!rpc?.error && rpc?.data) {
      const row = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
      const pct = clamp(toNumber((row as any)?.seller_percent), 0, 100);
      const badge = ((row as any)?.seller_badge as any) ?? badgeForPercent(pct);
      const res = NextResponse.json({
        id: sellerId,
        name,
        state,
        city,
        is_verified: isVerified,
        plan_type: planType,
        store_logo_url: storeLogoUrl,
        rating_percent: pct,
        badge,
        rating_count: toNumber((row as any)?.seller_count),
        avg_stars: (row as any)?.seller_avg_stars ?? null,
        operations_count,
      });
      res.headers.set('Cache-Control', 'no-store, max-age=0');
      return res;
    }

    const total = toNumber(profileData?.rating_total_count);
    const good = toNumber(profileData?.rating_good_count);
    const rep = toNumber(profileData?.reputation_score);
    const pct = total > 0 ? clamp(Math.round((good / total) * 100), 0, 100) : clamp(Math.round(rep || 100), 0, 100);
    const res = NextResponse.json({
      id: sellerId,
      name,
      state,
      city,
      is_verified: isVerified,
      plan_type: planType,
      store_logo_url: storeLogoUrl,
      rating_percent: pct,
      badge: badgeForPercent(pct),
      operations_count,
    });
    res.headers.set('Cache-Control', 'no-store, max-age=0');
    return res;
  } catch (e: unknown) {
    console.error('[sellers] GET error:', e);
    const res = NextResponse.json(minimalSeller(sellerId));
    res.headers.set('Cache-Control', 'no-store, max-age=0');
    return res;
  }
}

