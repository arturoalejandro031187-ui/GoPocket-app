import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// GET: Obtener mensajes del chat con perfiles (sin FK join para evitar errores de schema cache)
export async function GET(req: NextRequest) {
    try {
        const url = new URL(req.url);
        const sessionId = url.searchParams.get('session_id');

        if (!sessionId) {
            return NextResponse.json({ error: 'session_id requerido' }, { status: 400 });
        }

        const admin = supabaseAdmin();

        // 1. Obtener mensajes sin join de FK (evita error de schema cache)
        const { data: messages, error } = await admin
            .from('live_chat_messages')
            .select('id, session_id, user_id, message, created_at')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true })
            .limit(200);

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        if (!messages || messages.length === 0) return NextResponse.json({ messages: [] });

        // 2. Obtener perfiles de los usuarios únicos
        const userIds = [...new Set(messages.map(m => m.user_id).filter(Boolean))];
        const { data: profiles } = await admin
            .from('profiles')
            .select('id, full_name, nickname, avatar_url')
            .in('id', userIds);

        // 3. Combinar mensajes con perfiles
        const profileMap: Record<string, any> = {};
        for (const p of profiles || []) profileMap[p.id] = p;

        const messagesWithProfiles = messages.map(m => ({
            ...m,
            profiles: profileMap[m.user_id] ?? null,
        }));

        return NextResponse.json({ messages: messagesWithProfiles });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// POST: Enviar mensaje de chat
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

        // Verificar sesión activa
        const { data: session } = await admin
            .from('live_sessions')
            .select('id, status')
            .eq('id', session_id)
            .single();

        if (!session || session.status !== 'live') {
            return NextResponse.json({ error: 'La sesión no está en vivo' }, { status: 400 });
        }

        // Insertar mensaje
        const { data: msg, error } = await admin
            .from('live_chat_messages')
            .insert({
                session_id,
                user_id: auth.effectiveUserId,
                message: message.trim(),
            })
            .select('id, session_id, user_id, message, created_at')
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        // Obtener perfil del usuario para devolver mensaje completo
        const { data: profile } = await admin
            .from('profiles')
            .select('id, full_name, nickname, avatar_url')
            .eq('id', auth.effectiveUserId)
            .maybeSingle();

        return NextResponse.json({
            ok: true,
            message: { ...msg, profiles: profile ?? null },
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
