import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function getBearerToken(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

async function broadcastAdminLogistica(orderId: string, payload: any = {}) {
  try {
    const admin = supabaseAdmin();
    const ch: any = admin.channel('admin-logistica');
    await new Promise<void>((resolve) => {
      let done = false;
      const t = setTimeout(() => {
        if (done) return;
        done = true;
        resolve();
      }, 1200);
      ch.subscribe((status: string) => {
        if (done) return;
        if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          done = true;
          clearTimeout(t);
          resolve();
        }
      });
    });
    await ch.send({ type: 'broadcast', event: 'order_updated', payload: { orderId, ...payload, t: Date.now() } });
    try {
      admin.removeChannel(ch);
    } catch {
      // noop
    }
  } catch {
    // noop
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: 'Missing Authorization Bearer token' }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as { orderId?: string };
    const orderId = String(body?.orderId || '').trim();
    if (!orderId) return NextResponse.json({ error: 'orderId is required' }, { status: 400 });

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

    const { data: row, error: oErr } = await admin.from('orders').select('id,seller_id,shipping_label_url,label_downloaded_at').eq('id', orderId).maybeSingle();
    if (oErr) return NextResponse.json({ error: oErr.message }, { status: 400 });
    if (!row) return NextResponse.json({ error: 'Orden no encontrada.' }, { status: 404 });

    if (String((row as any).seller_id || '') !== userData.user.id) return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
    if (!String((row as any).shipping_label_url || '').trim()) return NextResponse.json({ error: 'La guía aún no está disponible.' }, { status: 400 });

    // Guardar descarga una sola vez (best-effort)
    const upd: any = await admin
      .from('orders')
      .update({ label_downloaded_at: (row as any).label_downloaded_at ?? new Date().toISOString() })
      .eq('id', orderId);

    if (upd.error) {
      const code = String((upd.error as any)?.code || '');
      const msg = String((upd.error as any)?.message || '').toLowerCase();
      if (code === '42703' || msg.includes('column')) {
        return NextResponse.json({ error: 'Faltan columnas de logística en `orders`. Ejecuta `supabase_orders_logistics.sql`.' }, { status: 400 });
      }
      return NextResponse.json({ error: upd.error.message }, { status: 400 });
    }

    // Best-effort: disparar update realtime para Admin → Logística
    void broadcastAdminLogistica(orderId, { kind: 'label_downloaded' });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unexpected error' }, { status: 500 });
  }
}

