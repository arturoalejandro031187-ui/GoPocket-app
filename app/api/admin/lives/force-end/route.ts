import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// POST: Admin force-ends any live session (bypasses host check)
export async function POST(req: NextRequest) {
    try {
        const { userId } = await requireAuth(req);
        const admin = supabaseAdmin();

        // Verify admin role
        const { data: profile } = await admin
            .from('profiles')
            .select('role')
            .eq('id', userId)
            .maybeSingle();

        if ((profile as any)?.role !== 'admin') {
            return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
        }

        const body = await req.json();
        const { session_id } = body;

        if (!session_id) {
            return NextResponse.json({ error: 'session_id requerido' }, { status: 400 });
        }

        const { error } = await admin
            .from('live_sessions')
            .update({ status: 'ended', ended_at: new Date().toISOString() })
            .eq('id', session_id);

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        return NextResponse.json({ ok: true });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
