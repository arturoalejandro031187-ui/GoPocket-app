import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getPlan, PLAN_LIMITS } from '@/lib/plans/limits';

export const dynamic = 'force-dynamic';

// GET: List all live sessions (public) or user's sessions
export async function GET(req: NextRequest) {
    try {
        const admin = supabaseAdmin();
        const url = new URL(req.url);
        const status = url.searchParams.get('status') || 'live';
        const hostId = url.searchParams.get('host_id');

        let query = admin
            .from('live_sessions')
            .select('*, profiles:host_id(id, full_name, nickname, avatar_url)')
            .order('created_at', { ascending: false })
            .limit(50);

        if (status === 'all') {
            // no filter
        } else {
            query = query.eq('status', status);
        }

        if (hostId) {
            query = query.eq('host_id', hostId);
        }

        const { data, error } = await query;
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        return NextResponse.json({ sessions: data || [] });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// POST: Create a new live session (platinum only)
export async function POST(req: NextRequest) {
    try {
        const auth = await requireAuth(req);
        const admin = supabaseAdmin();

        // Check platinum
        const plan = await getPlan(admin, auth.effectiveUserId);
        if (!PLAN_LIMITS[plan].allow_live) {
            return NextResponse.json(
                { error: 'GoPocket Live es exclusivo del Plan Platinum. Actualiza tu plan para transmitir en vivo.' },
                { status: 403 }
            );
        }

        const body = await req.json();
        const { title, description, product_ids } = body;

        if (!title || typeof title !== 'string' || title.trim().length < 3) {
            return NextResponse.json({ error: 'El título debe tener al menos 3 caracteres' }, { status: 400 });
        }

        // Check no active session
        const { data: active } = await admin
            .from('live_sessions')
            .select('id')
            .eq('host_id', auth.effectiveUserId)
            .in('status', ['live', 'scheduled'])
            .limit(1);

        if (active && active.length > 0) {
            return NextResponse.json({ error: 'Ya tienes una sesión activa o programada' }, { status: 409 });
        }

        const { data: session, error } = await admin
            .from('live_sessions')
            .insert({
                host_id: auth.effectiveUserId,
                title: title.trim(),
                description: description || null,
                product_ids: product_ids || [],
                status: 'live',
                started_at: new Date().toISOString(),
            })
            .select()
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        // ─── Phase 2: Notify followers about Live ───
        try {
            const { data: followers } = await admin
                .from('follows')
                .select('follower_id')
                .eq('seller_id', auth.effectiveUserId);

            if (followers && followers.length > 0) {
                // Get seller name
                const { data: profile } = await admin
                    .from('profiles')
                    .select('full_name, nickname')
                    .eq('id', auth.effectiveUserId)
                    .single();
                const sellerName = profile?.full_name || profile?.nickname || 'Un vendedor';

                const { insertNotificationBestEffort } = await import('@/lib/notifications/insertBestEffort');
                // Send notifications in parallel (best-effort, don't block response)
                const notifPromises = followers.map((f: any) =>
                    insertNotificationBestEffort(admin, {
                        user_id: f.follower_id,
                        type: 'admin_announcement',
                        title: '🔴 ¡En vivo ahora!',
                        body: `${sellerName} está transmitiendo en vivo: "${title.trim()}"`,
                        link_to: `/live`,
                        data: { kind: 'live_started', seller_id: auth.effectiveUserId, session_id: session.id },
                    }).catch(() => { })
                );
                Promise.allSettled(notifPromises); // fire-and-forget
            }
        } catch (notifErr) {
            console.error('[LIVE] Error notifying followers:', notifErr);
        }

        return NextResponse.json({ ok: true, session });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// PATCH: Update session (end it)
export async function PATCH(req: NextRequest) {
    try {
        const auth = await requireAuth(req);
        const admin = supabaseAdmin();
        const body = await req.json();
        const { session_id, action } = body;

        if (!session_id) {
            return NextResponse.json({ error: 'session_id requerido' }, { status: 400 });
        }

        // Verify ownership
        const { data: session } = await admin
            .from('live_sessions')
            .select('id, host_id')
            .eq('id', session_id)
            .single();

        if (!session || session.host_id !== auth.effectiveUserId) {
            return NextResponse.json({ error: 'Sesión no encontrada o no autorizado' }, { status: 404 });
        }

        if (action === 'end') {
            const { error } = await admin
                .from('live_sessions')
                .update({ status: 'ended', ended_at: new Date().toISOString() })
                .eq('id', session_id);

            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            return NextResponse.json({ ok: true, status: 'ended' });
        }

        return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
