import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { listingId?: string };
    const listingId = String(body?.listingId || '').trim();
    if (!listingId) return NextResponse.json({ error: 'listingId is required' }, { status: 400 });

    const admin = supabaseAdmin();

    // Intentar con columnas nuevas; si no existen, no romper.
    const { data: row, error } = await admin
      .from('listings')
      .select('id,status,expires_at,view_count')
      .eq('id', listingId)
      .maybeSingle();

    if (error) {
      const code = String((error as any)?.code || '');
      const msg = String((error as any)?.message || '');
      if (code === '42703' || msg.toLowerCase().includes('does not exist')) {
        return NextResponse.json({ ok: true, ignored: true });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (!row) return NextResponse.json({ ok: true, missing: true });

    const now = Date.now();
    const expiresAt = (row as any).expires_at ? Date.parse((row as any).expires_at) : null;
    const current = Number((row as any).view_count ?? 0) || 0;
    const nextCount = current + 1;

    const patch: any = { view_count: nextCount };
    if ((row as any).status === 'active' && expiresAt && now > expiresAt) {
      patch.status = 'paused';
    }

    await admin.from('listings').update(patch).eq('id', listingId);
    return NextResponse.json({ ok: true, view_count: nextCount });
  } catch (e: unknown) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unexpected error' }, { status: 500 });
  }
}

