import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getUserAdminState, isSuspended } from '@/lib/userAdminState';

type Body = {
  listingId: string;
  status: 'active' | 'paused' | 'sold';
};

function getBearerToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: 'Missing Authorization Bearer token' }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as Partial<Body>;
    const listingId = String(body.listingId ?? '').trim();
    const status = body.status as Body['status'];
    if (!listingId) return NextResponse.json({ error: 'listingId is required' }, { status: 400 });
    if (!status || !['active', 'paused', 'sold'].includes(status)) {
      return NextResponse.json({ error: 'status inválido' }, { status: 400 });
    }

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

    const { data: listing, error: lErr } = await admin.from('listings').select('id,seller_id').eq('id', listingId).maybeSingle();
    if (lErr) return NextResponse.json({ error: lErr.message }, { status: 400 });
    if (!listing) return NextResponse.json({ error: 'Publicación no encontrada' }, { status: 404 });
    if (String((listing as any).seller_id) !== sellerId) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

    const sellerState = await getUserAdminState(admin, sellerId);
    if (sellerState?.status === 'banned') {
      return NextResponse.json({ error: 'Tu cuenta está bloqueada. No puedes modificar publicaciones.' }, { status: 403 });
    }
    if (isSuspended(sellerState) && status === 'active') {
      return NextResponse.json(
        { error: 'Tu cuenta está suspendida. No puedes activar publicaciones hasta que finalice la suspensión.' },
        { status: 403 },
      );
    }

    const { error: updErr } = await admin.from('listings').update({ status }).eq('id', listingId);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unexpected error' }, { status: 500 });
  }
}

