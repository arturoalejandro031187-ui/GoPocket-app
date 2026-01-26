import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { notifyOrderShippedBuyer } from '@/lib/email/notify';

export const dynamic = 'force-dynamic';

function getBearerToken(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
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

async function insertNotificationBestEffort(admin: any, payload: any) {
  let ins: any = await admin.from('notifications').insert([payload]);
  if (!ins?.error) return { ok: true as const };

  const code = String((ins.error as any)?.code || '');
  const msg = String((ins.error as any)?.message || '').toLowerCase();

  if (code === '42P01' || msg.includes('relation') || msg.includes('does not exist') || code === 'PGRST106') {
    return { ok: false as const, code, message: String((ins.error as any)?.message || '') };
  }

  if (code === '42703' || msg.includes('column')) {
    const f1 = { ...payload };
    delete f1.data;
    delete f1.is_read;
    ins = await admin.from('notifications').insert([f1]);
    if (!ins?.error) return { ok: true as const };

    const code2 = String((ins.error as any)?.code || '');
    const msg2 = String((ins.error as any)?.message || '').toLowerCase();
    if (code2 === '42703' || msg2.includes('column')) {
      const f2: any = { ...f1 };
      if ('body' in f2) {
        f2.message = f2.body;
        delete f2.body;
      }
      ins = await admin.from('notifications').insert([f2]);
      if (!ins?.error) return { ok: true as const };
      return { ok: false as const, code: String((ins.error as any)?.code || ''), message: String((ins.error as any)?.message || '') };
    }

    return { ok: false as const, code: code2, message: String((ins.error as any)?.message || '') };
  }

  return { ok: false as const, code, message: String((ins.error as any)?.message || '') };
}

type Body = {
  orderId: string;
  tracking_number: string;
  shipping_carrier?: string;
};

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: 'Missing Authorization Bearer token' }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as Partial<Body>;
    const orderId = String(body?.orderId || '').trim();
    const tracking = String(body?.tracking_number || '').trim();
    const carrier = String(body?.shipping_carrier || '').trim();

    if (!orderId || !isUuid(orderId)) return NextResponse.json({ error: 'orderId inválido' }, { status: 400 });
    if (tracking.length < 4) return NextResponse.json({ error: 'Ingresa un código de rastreo válido.' }, { status: 400 });
    if (tracking.length > 80) return NextResponse.json({ error: 'El código de rastreo es demasiado largo.' }, { status: 400 });
    if (carrier.length > 60) return NextResponse.json({ error: 'La paquetería es demasiado larga.' }, { status: 400 });

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

    const { data: row, error: oErr } = await admin.from('orders').select('id,buyer_id,seller_id,status').eq('id', orderId).maybeSingle();
    if (oErr) return NextResponse.json({ error: oErr.message }, { status: 400 });
    if (!row) return NextResponse.json({ error: 'Orden no encontrada.' }, { status: 404 });
    if (String((row as any).seller_id || '') !== userData.user.id) return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });

    const updatePayload: any = {
      tracking_number: tracking,
      shipping_carrier: carrier || null,
      shipped_at: new Date().toISOString(),
      status: 'shipped',
    };

    const upd: any = await admin.from('orders').update(updatePayload).eq('id', orderId);
    if (upd.error) {
      const code = String((upd.error as any)?.code || '');
      const msg = String((upd.error as any)?.message || '').toLowerCase();
      if (code === '42703' || msg.includes('column')) {
        return NextResponse.json({ error: 'Faltan columnas de logística en `orders`. Ejecuta `supabase_orders_logistics.sql`.' }, { status: 400 });
      }
      return NextResponse.json({ error: String((upd.error as any)?.message || upd.error) }, { status: 400 });
    }

    // Notificar al comprador (best-effort) usando sistema unificado
    let notified = false;
    let notify_error: any = null;
    const buyerId = String((row as any).buyer_id || '').trim();
    try {
      if (buyerId) {
        const { sendUnifiedNotification } = await import('@/lib/notifications/unified');
        const result = await sendUnifiedNotification(admin, {
          userId: buyerId,
          type: 'order_shipped',
          title: '📦 ¡Tu compra fue enviada!',
          body: `Tu compra fue enviada${carrier ? ` por ${carrier}` : ''}. Código de rastreo: ${tracking}`,
          data: { 
            kind: 'order_shipped',
            orderId, 
            tracking_number: tracking, 
            shipping_carrier: carrier || null 
          },
          linkTo: `/dashboard/compras?order=${orderId}`,
          channels: ['both'], // Panel + Email
          priority: 'high',
          emailTemplate: 'order_shipped',
        });
        notified = result.panel.ok || result.email.ok;
        if (!result.panel.ok) notify_error = result.panel.error;
        if (!result.email.ok && !notify_error) notify_error = result.email.error;
      }
    } catch (e: unknown) {
      notify_error = { message: e instanceof Error ? e.message : 'notify_failed' };
      // Fallback a método anterior si falla
      try {
        if (buyerId) {
          const { insertNotificationBestEffort } = await import('@/lib/notifications/insertBestEffort');
          const payload: any = {
            user_id: buyerId,
            type: 'order_shipped',
            title: '📦 ¡Tu compra fue enviada!',
            body: `Tu compra fue enviada${carrier ? ` por ${carrier}` : ''}. Código de rastreo: ${tracking}`,
            data: { 
              kind: 'order_shipped',
              orderId, 
              tracking_number: tracking, 
              shipping_carrier: carrier || null 
            },
            link_to: `/dashboard/compras?order=${orderId}`,
            is_read: false,
          };
          const ins = await insertNotificationBestEffort(admin, payload);
          notified = ins.ok;
          if (!ins.ok) notify_error = ins;
          void notifyOrderShippedBuyer({
            buyerId,
            orderId,
            tracking,
            carrier: carrier || undefined,
          }).catch((e) => console.warn('[mark-shipped] email notifyOrderShippedBuyer:', e));
        }
      } catch (fallbackErr) {
        console.error('[mark-shipped] Error en fallback de notificación:', fallbackErr);
      }
    }

    // Best-effort: disparar update realtime para Admin → Logística
    void broadcastAdminLogistica(orderId, { kind: 'marked_shipped', tracking_number: tracking, shipping_carrier: carrier || null });

    const resp = NextResponse.json({ ok: true, notified, notify_error });
    resp.headers.set('Cache-Control', 'no-store, max-age=0');
    return resp;
  } catch (e: unknown) {
    console.error(e);
    const resp = NextResponse.json({ error: e instanceof Error ? e.message : 'Unexpected error' }, { status: 500 });
    resp.headers.set('Cache-Control', 'no-store, max-age=0');
    return resp;
  }
}

