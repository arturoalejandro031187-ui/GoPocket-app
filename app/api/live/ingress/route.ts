import { IngressClient, IngressInput } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const auth = await requireAuth(req);
        const { session_id } = await req.json();

        if (!session_id) {
            return NextResponse.json({ error: 'session_id required' }, { status: 400 });
        }

        const apiKey = process.env.LIVEKIT_API_KEY;
        const apiSecret = process.env.LIVEKIT_API_SECRET;
        const livekitUrl = process.env.LIVEKIT_URL;

        if (!apiKey || !apiSecret || !livekitUrl) {
            return NextResponse.json({ error: 'LiveKit not configured' }, { status: 500 });
        }

        // Verify the session belongs to this user
        const admin = supabaseAdmin();
        const { data: session, error: sessionError } = await admin
            .from('live_sessions')
            .select('id, host_id, title')
            .eq('id', session_id)
            .eq('host_id', auth.userId)
            .single();

        if (sessionError || !session) {
            return NextResponse.json({ error: 'Sesión no encontrada o sin permiso' }, { status: 404 });
        }

        const ingressClient = new IngressClient(livekitUrl, apiKey, apiSecret);

        // Create RTMP ingress for this room
        const ingress = await ingressClient.createIngress(IngressInput.RTMP_INPUT, {
            name: `session-${session_id}`,
            roomName: session_id,
            participantIdentity: auth.userId,
            participantName: `Host-${auth.userId.slice(0, 8)}`,
            enableTranscoding: true,
        });

        // Store ingress_id in the live session for later cleanup
        await admin
            .from('live_sessions')
            .update({ ingress_id: String(ingress.ingressId) } as any)
            .eq('id', session_id);

        return NextResponse.json({
            ingress_id: ingress.ingressId,
            rtmp_url: ingress.url,
            stream_key: ingress.streamKey,
        });
    } catch (err: any) {
        console.error('[Ingress] Error:', err);
        return NextResponse.json({ error: err.message || 'Error al crear ingress' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const auth = await requireAuth(req);
        const { searchParams } = new URL(req.url);
        const ingressId = searchParams.get('ingress_id');

        if (!ingressId) {
            return NextResponse.json({ error: 'ingress_id required' }, { status: 400 });
        }

        const apiKey = process.env.LIVEKIT_API_KEY;
        const apiSecret = process.env.LIVEKIT_API_SECRET;
        const livekitUrl = process.env.LIVEKIT_URL;

        if (!apiKey || !apiSecret || !livekitUrl) {
            return NextResponse.json({ error: 'LiveKit not configured' }, { status: 500 });
        }

        const ingressClient = new IngressClient(livekitUrl, apiKey, apiSecret);
        await ingressClient.deleteIngress(ingressId);

        return NextResponse.json({ ok: true });
    } catch (err: any) {
        console.error('[Ingress DELETE] Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
