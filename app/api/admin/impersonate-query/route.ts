import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/middleware';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/impersonate-query
 * 
 * Proxy endpoint that lets admins query Supabase data AS a target user.
 * Uses service_role key to bypass RLS and filter by the impersonated userId.
 * 
 * Body: { table, select, filters?, order?, limit? }
 */
export async function POST(req: NextRequest) {
    try {
        const auth = await requireAdmin(req);

        if (!auth.impersonating || !auth.impersonatedUserId) {
            return NextResponse.json({ error: 'No estás impersonando a ningún usuario' }, { status: 400 });
        }

        const body = await req.json();
        const { table, select, filters, order, limit, single } = body;

        if (!table || typeof table !== 'string') {
            return NextResponse.json({ error: 'Se requiere el campo "table"' }, { status: 400 });
        }

        const admin = supabaseAdmin();
        const targetUserId = auth.impersonatedUserId;

        // Build query - use any because columns come from dynamic input
        let query: any = admin.from(table).select(select || '*');

        // Apply user filter if specified
        if (filters?.userColumn) {
            query = query.eq(filters.userColumn, targetUserId);
        }

        // Apply additional filters
        if (filters?.eq) {
            for (const [col, val] of Object.entries(filters.eq)) {
                query = query.eq(col, val as string);
            }
        }
        if (filters?.in) {
            for (const [col, vals] of Object.entries(filters.in)) {
                query = query.in(col, vals as string[]);
            }
        }
        if (filters?.gte) {
            for (const [col, val] of Object.entries(filters.gte)) {
                query = query.gte(col, val as string);
            }
        }
        if (filters?.lte) {
            for (const [col, val] of Object.entries(filters.lte)) {
                query = query.lte(col, val as string);
            }
        }

        // Order
        if (order) {
            const orderCol = typeof order === 'string' ? order : order.column;
            const ascending = typeof order === 'string' ? false : (order.ascending ?? false);
            query = query.order(orderCol, { ascending });
        }

        // Limit
        if (limit && Number(limit) > 0) {
            query = query.limit(Number(limit));
        }

        // Execute
        if (single) {
            const { data, error } = await query.maybeSingle();
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            return NextResponse.json({ data, targetUserId });
        }

        const { data, error, count } = await query;
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        return NextResponse.json({ data, count, targetUserId });
    } catch (e: any) {
        return NextResponse.json({ error: e.message || 'Error en query impersonada' }, { status: 500 });
    }
}

/**
 * GET /api/admin/impersonate-query?userId=xxx
 * 
 * Returns complete profile + wallet + stats for the impersonated user.
 */
export async function GET(req: NextRequest) {
    try {
        const auth = await requireAdmin(req);

        if (!auth.impersonating || !auth.impersonatedUserId) {
            return NextResponse.json({ error: 'No estás impersonando a ningún usuario' }, { status: 400 });
        }

        const admin = supabaseAdmin();
        const targetUserId = auth.impersonatedUserId;

        // Fetch all user data in parallel
        const [profileRes, walletRes, ordersRes, listingsRes, reviewsRes] = await Promise.all([
            admin.from('profiles').select('*').eq('id', targetUserId).maybeSingle(),
            admin.from('wallets').select('*').eq('user_id', targetUserId).maybeSingle(),
            admin.from('orders').select('id, status, total, created_at').eq('buyer_id', targetUserId).order('created_at', { ascending: false }).limit(20),
            admin.from('listings').select('id, title, price, status, created_at').eq('user_id', targetUserId).order('created_at', { ascending: false }).limit(20),
            admin.from('reviews').select('id, rating, comment, created_at').eq('reviewer_id', targetUserId).order('created_at', { ascending: false }).limit(10),
        ]);

        // Get auth user info
        const { data: authUser } = await admin.auth.admin.getUserById(targetUserId);

        return NextResponse.json({
            ok: true,
            targetUserId,
            user: {
                email: authUser?.user?.email || null,
                phone: authUser?.user?.phone || null,
                created_at: authUser?.user?.created_at || null,
                last_sign_in_at: authUser?.user?.last_sign_in_at || null,
                email_confirmed_at: authUser?.user?.email_confirmed_at || null,
            },
            profile: profileRes.data || null,
            wallet: walletRes.data || null,
            orders: ordersRes.data || [],
            listings: listingsRes.data || [],
            reviews: reviewsRes.data || [],
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message || 'Error obteniendo datos impersonados' }, { status: 500 });
    }
}
