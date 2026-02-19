import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function getBearerToken(req: NextRequest) {
    const auth = req.headers.get('authorization') || '';
    const match = auth.match(/^Bearer\s+(.+)$/i);
    return match?.[1] ?? null;
}

export async function GET(req: NextRequest) {
    try {
        const token = getBearerToken(req);
        if (!token) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
        const sb = createClient(supabaseUrl, supabaseAnon, {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        });

        const { data: userData, error: userErr } = await sb.auth.getUser(token);
        if (userErr || !userData.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

        const userId = userData.user.id;
        const admin = supabaseAdmin();

        // Get all follows for this user
        const { data: follows, error: followsErr } = await admin
            .from('follows')
            .select('seller_id, created_at')
            .eq('follower_id', userId)
            .order('created_at', { ascending: false });

        if (followsErr) {
            console.error('[MY-FOLLOWING] Error:', followsErr);
            return NextResponse.json({ error: 'Error al cargar seguidos' }, { status: 500 });
        }

        if (!follows || follows.length === 0) {
            return NextResponse.json({ ok: true, sellers: [] });
        }

        const sellerIds = follows.map((f: any) => f.seller_id);
        if (sellerIds.length === 0) return NextResponse.json({ ok: true, sellers: [] });

        // Fetch seller profiles with a very safe select and fallbacks
        let profiles: any[] = [];
        const { data: profData, error: profError } = await admin
            .from('profiles')
            .select('id, full_name, reputation_score, rating_good_count, rating_total_count')
            .in('id', sellerIds);

        if (profError) {
            const { data: fallbackData } = await admin
                .from('profiles')
                .select('id, full_name')
                .in('id', sellerIds);
            profiles = fallbackData || [];
        } else {
            profiles = profData || [];
        }

        // Fetch active auctions for these sellers
        const { data: activeAuctions } = await admin
            .from('listings')
            .select('seller_id')
            .in('seller_id', sellerIds)
            .eq('status', 'active')
            .eq('sale_type', 'auction');

        // Fetch live sessions
        const { data: activeLives } = await admin
            .from('live_sessions')
            .select('host_id')
            .in('host_id', sellerIds)
            .eq('status', 'live');

        // Get follower counts for each seller
        const sellers = await Promise.all(
            follows.map(async (f: any) => {
                const profile = (profiles || []).find((p: any) => p.id === f.seller_id) as any;

                const { count } = await admin
                    .from('follows')
                    .select('*', { count: 'exact', head: true })
                    .eq('seller_id', f.seller_id);

                // Calculate reputation percent
                const total = Number(profile?.rating_total_count || 0);
                const good = Number(profile?.rating_good_count || 0);
                const score = Number(profile?.reputation_score || 100);
                const repPercent = total > 0 ? Math.round((good / total) * 100) : Math.round(score);

                const hasAuction = (activeAuctions || []).some((a: any) => a.seller_id === f.seller_id);
                const isLive = (activeLives || []).some((l: any) => l.host_id === f.seller_id);

                return {
                    seller_id: f.seller_id,
                    created_at: f.created_at,
                    name:
                        (profile?.full_name && String(profile.full_name).trim()) ||
                        'Vendedor',
                    avatar_url: profile?.avatar_url || null,
                    is_official: Boolean((profile as any)?.is_official_store || (profile as any)?.is_official),
                    follower_count: count || 0,
                    reputation_percent: repPercent,
                    has_active_auction: hasAuction,
                    is_live: isLive,
                };
            })
        );

        return NextResponse.json({ ok: true, sellers });
    } catch (e: any) {
        console.error('[MY-FOLLOWING] Exception:', e);
        return NextResponse.json({ error: e.message || 'Error' }, { status: 500 });
    }
}
