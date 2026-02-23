import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * Viewer tracking with unique tab IDs to prevent refresh-inflated counts.
 *
 * The client generates a random `viewer_id` (UUID) stored in sessionStorage.
 * - join:  UPSERT into live_viewers(session_id, viewer_id, last_seen). 
 *          viewer_count = count of rows with last_seen > now - 90s
 * - leave: DELETE the row.
 * - heartbeat: UPDATE last_seen.
 *
 * Falls back gracefully if live_viewers table doesn't exist yet
 * (uses simple +/- on viewer_count column).
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { session_id, action, viewer_id } = body; // action: 'join' | 'leave' | 'heartbeat'

        if (!session_id || !['join', 'leave', 'heartbeat', 'sync'].includes(action)) {
            return NextResponse.json({ error: 'session_id and action required' }, { status: 400 });
        }

        const admin = supabaseAdmin();

        // ── Sync action: direct count update from Realtime Presence ──────────
        if (action === 'sync') {
            const count = Math.max(0, Number(body.viewer_count ?? 0));
            await admin.from('live_sessions')
                .update({ viewer_count: count })
                .eq('id', session_id);
            return NextResponse.json({ ok: true, viewer_count: count });
        }

        // Get current session
        const { data: session, error: fetchErr } = await admin
            .from('live_sessions')
            .select('viewer_count, status')
            .eq('id', session_id)
            .maybeSingle();

        if (fetchErr || !session) {
            return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }

        if (session.status !== 'live') {
            return NextResponse.json({ ok: true, viewer_count: session.viewer_count || 0 });
        }

        // Try deduplicated viewer tracking via live_viewers table
        if (viewer_id) {
            try {
                if (action === 'join' || action === 'heartbeat') {
                    await admin.from('live_viewers').upsert(
                        { session_id, viewer_id, last_seen: new Date().toISOString() },
                        { onConflict: 'session_id,viewer_id' }
                    );
                } else if (action === 'leave') {
                    await admin.from('live_viewers')
                        .delete()
                        .eq('session_id', session_id)
                        .eq('viewer_id', viewer_id);
                }

                // Count active viewers (seen in last 90 seconds)
                const cutoff = new Date(Date.now() - 90_000).toISOString();
                const { count } = await admin.from('live_viewers')
                    .select('*', { count: 'exact', head: true })
                    .eq('session_id', session_id)
                    .gte('last_seen', cutoff);

                const realCount = count ?? 0;

                // Keep viewer_count column in sync
                await admin.from('live_sessions')
                    .update({ viewer_count: realCount })
                    .eq('id', session_id);

                return NextResponse.json({ ok: true, viewer_count: realCount });
            } catch {
                // live_viewers table doesn't exist yet — fall through to legacy mode
            }
        }

        // ── Legacy fallback (no deduplication) ────────────────────────────────
        const current = Number(session.viewer_count || 0);
        const newCount = action === 'join' ? current + 1 : Math.max(0, current - 1);
        await admin.from('live_sessions').update({ viewer_count: newCount }).eq('id', session_id);
        return NextResponse.json({ ok: true, viewer_count: newCount });

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
