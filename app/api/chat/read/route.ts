import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function getBearerToken(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

async function requireUserFromToken(token: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !supabaseAnon) {
    return { ok: false as const, status: 500, error: 'Supabase env vars missing on server' };
  }
  const supabase = createClient(supabaseUrl, supabaseAnon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr) return { ok: false as const, status: 401, error: userErr.message };
  if (!userData.user) return { ok: false as const, status: 401, error: 'Unauthorized' };
  return { ok: true as const, userId: userData.user.id };
}

async function ensureParticipant(admin: any, orderId: string, userId: string) {
  const { data: row, error } = await admin.from('orders').select('id,buyer_id,seller_id').eq('id', orderId).maybeSingle();
  if (error) return { ok: false as const, status: 400, error: error.message };
  if (!row) return { ok: false as const, status: 404, error: 'Orden no encontrada.' };
  const buyerId = String((row as any)?.buyer_id || '').trim();
  const sellerId = String((row as any)?.seller_id || '').trim();
  if (buyerId !== userId && sellerId !== userId) return { ok: false as const, status: 403, error: 'No autorizado.' };
  return { ok: true as const };
}

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: 'Missing Authorization Bearer token' }, { status: 401 });

    const guard = await requireUserFromToken(token);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const body = (await req.json().catch(() => ({}))) as { orderId?: string };
    const orderId = String(body?.orderId || '').trim();
    if (!orderId || !isUuid(orderId)) return NextResponse.json({ error: 'orderId inválido' }, { status: 400 });

    const admin = supabaseAdmin();
    const part = await ensureParticipant(admin, orderId, guard.userId);
    if (!part.ok) return NextResponse.json({ error: part.error }, { status: part.status });

    const now = new Date().toISOString();
    const up: any = await admin
      .from('order_chat_reads')
      .upsert([{ order_id: orderId, user_id: guard.userId, last_read_at: now }], { onConflict: 'order_id,user_id' });

    if (up.error) {
      const code = String((up.error as any)?.code || '');
      const msg = String((up.error as any)?.message || '').toLowerCase();
      if (code === '42P01' || msg.includes('does not exist') || msg.includes('relation')) {
        return NextResponse.json({ error: 'Falta configurar lecturas. Ejecuta `supabase_order_chat_reads.sql` en Supabase.' }, { status: 400 });
      }
      return NextResponse.json({ error: up.error.message }, { status: 400 });
    }

    const resp = NextResponse.json({ ok: true });
    resp.headers.set('Cache-Control', 'no-store, max-age=0');
    return resp;
  } catch (e: unknown) {
    console.error(e);
    const resp = NextResponse.json({ error: e instanceof Error ? e.message : 'Unexpected error' }, { status: 500 });
    resp.headers.set('Cache-Control', 'no-store, max-age=0');
    return resp;
  }
}

