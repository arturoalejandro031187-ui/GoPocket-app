import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// GET: Fetch chat messages for a session
export async function GET(req: NextRequest) {
    try {
        const url = new URL(req.url);
        const sessionId = url.searchParams.get('session_id');

        if (!sessionId) {
            return NextResponse.json({ error: 'session_id requerido' }, { status: 400 });
        }

        const admin = supabaseAdmin();
        const { data, error } = await admin
            .from('live_chat_messages')
            .select('*, profiles:user_id(id, full_name, nickname, avatar_url)')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true })
            .limit(200);

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        return NextResponse.json({ messages: data || [] });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// POST: Send a chat message
export async function POST(req: NextRequest) {
    try {
        const auth = await requireAuth(req);
        const admin = supabaseAdmin();
        const body = await req.json();
        const { session_id, message } = body;

        if (!session_id || !message || typeof message !== 'string') {
            return NextResponse.json({ error: 'session_id y message requeridos' }, { status: 400 });
        }

        if (message.trim().length === 0 || message.length > 500) {
            return NextResponse.json({ error: 'Mensaje debe ser entre 1 y 500 caracteres' }, { status: 400 });
        }

        // Verify session is live
        const { data: session } = await admin
            .from('live_sessions')
            .select('id, status')
            .eq('id', session_id)
            .single();

        if (!session || session.status !== 'live') {
            return NextResponse.json({ error: 'La sesión no está en vivo' }, { status: 400 });
        }

        const { data: msg, error } = await admin
            .from('live_chat_messages')
            .insert({
                session_id,
                user_id: auth.effectiveUserId,
                message: message.trim(),
            })
            .select('*, profiles:user_id(id, full_name, nickname, avatar_url)')
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        // Update viewer count
        try { await admin.rpc('increment_viewer_count', { sid: session_id }); } catch { }

        return NextResponse.json({ ok: true, message: msg });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
