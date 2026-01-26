import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/admin';

function getBearerToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: 'Missing Authorization Bearer token' }, { status: 401 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
    const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    if (!supabaseUrl || !supabaseAnon) return NextResponse.json({ error: 'Supabase env vars missing on server' }, { status: 500 });

    const supabase = createClient(supabaseUrl, supabaseAnon, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr) return NextResponse.json({ error: userErr.message }, { status: 401 });
    if (!userData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = supabaseAdmin();
    const sellerId = userData.user.id;

    // Requiere expires_at; si no existe, no hacemos nada.
    const { data: rows, error } = await admin
      .from('listings')
      .select('id,expires_at,status')
      .eq('seller_id', sellerId)
      .eq('status', 'active')
      .limit(500);

    if (error) {
      const code = String((error as any)?.code || '');
      const msg = String((error as any)?.message || '');
      if (code === '42703' || msg.toLowerCase().includes('does not exist')) {
        return NextResponse.json({ ok: true, skipped: true });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const now = Date.now();
    const expiredIds = ((rows as any[]) ?? [])
      .filter((r) => r?.expires_at && Date.parse(r.expires_at) < now)
      .map((r) => r.id);

    if (expiredIds.length === 0) return NextResponse.json({ ok: true, paused: 0 });

    await admin.from('listings').update({ status: 'paused' }).in('id', expiredIds);
    return NextResponse.json({ ok: true, paused: expiredIds.length });
  } catch (e: unknown) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unexpected error' }, { status: 500 });
  }
}

