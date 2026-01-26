import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function getBearerToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

async function requireAdmin(req: NextRequest) {
  const token = getBearerToken(req);
  if (!token) return { ok: false as const, status: 401, error: 'Missing Authorization Bearer token' };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !supabaseAnon) return { ok: false as const, status: 500, error: 'Supabase env vars missing on server' };

  const supabase = createClient(supabaseUrl, supabaseAnon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr) return { ok: false as const, status: 401, error: userErr.message };
  if (!userData.user) return { ok: false as const, status: 401, error: 'Unauthorized' };

  const admin = supabaseAdmin();
  const { data: row, error } = await admin.from('admin_users').select('user_id').eq('user_id', userData.user.id).maybeSingle();
  if (error) return { ok: false as const, status: 400, error: error.message };
  if (!row) return { ok: false as const, status: 403, error: 'No autorizado (admin requerido).' };

  return { ok: true as const, admin, requesterId: userData.user.id };
}

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
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
    console.log('[API LABEL UPLOAD] Iniciando proceso de subida...');
    
    const guard = await requireAdmin(req);
    if (!guard.ok) {
      console.error('[API LABEL UPLOAD] Error de autorización:', guard.error);
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }
    const { admin, requesterId } = guard;
    console.log('[API LABEL UPLOAD] Admin autorizado:', requesterId);

    const form = await req.formData().catch((err) => {
      console.error('[API LABEL UPLOAD] Error parseando FormData:', err);
      return null;
    });
    
    if (!form) {
      return NextResponse.json({ error: 'Error al procesar el formulario.' }, { status: 400 });
    }
    
    const orderId = String(form.get('orderId') || '').trim();
    const file = form.get('file') as File | null;
    
    console.log('[API LABEL UPLOAD] Datos recibidos:', { 
      orderId, 
      hasFile: !!file, 
      fileName: file?.name, 
      fileSize: file?.size, 
      fileType: file?.type 
    });
    
    if (!orderId) {
      console.error('[API LABEL UPLOAD] orderId faltante');
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }
    if (!file) {
      console.error('[API LABEL UPLOAD] Archivo faltante');
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }
    if (file.size === 0) {
      console.error('[API LABEL UPLOAD] Archivo vacío');
      return NextResponse.json({ error: 'El archivo está vacío.' }, { status: 400 });
    }
    if (file.size > 15 * 1024 * 1024) {
      console.error('[API LABEL UPLOAD] Archivo demasiado grande:', file.size);
      return NextResponse.json({ error: 'El PDF es demasiado grande (máx 15MB).' }, { status: 400 });
    }

    // Verificar orden
    const { data: orderRow, error: oErr } = await admin.from('orders').select('id,seller_id').eq('id', orderId).maybeSingle();
    if (oErr) return NextResponse.json({ error: oErr.message }, { status: 400 });
    if (!orderRow) return NextResponse.json({ error: 'Orden no encontrada.' }, { status: 404 });

    // Subir PDF a Storage (bucket: upload, carpeta: labels)
    const bucket = 'upload';
    const exists = await admin.storage.getBucket(bucket).catch(() => null);
    if (!exists?.data) {
      await admin.storage.createBucket(bucket, { public: true }).catch(() => null);
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const safeName = sanitizeFileName(file.name || 'guia.pdf');
    const path = `labels/${orderId}/${Date.now()}-${safeName}`;

    const up = await admin.storage.from(bucket).upload(path, buffer, {
      contentType: file.type || 'application/pdf',
      upsert: false,
    });
    if (up.error) return NextResponse.json({ error: up.error.message }, { status: 400 });

    const pub = admin.storage.from(bucket).getPublicUrl(path);
    const url = pub.data.publicUrl;
    if (!url) return NextResponse.json({ error: 'No se pudo obtener URL pública de la guía.' }, { status: 500 });

    // Guardar en orden
    console.log('[API LABEL UPLOAD] Actualizando orden en BD...', { orderId, url });
    const upd: any = await admin
      .from('orders')
      .update({
        shipping_label_url: url,
        shipping_label_uploaded_at: new Date().toISOString(),
        shipping_label_uploaded_by: requesterId,
      })
      .eq('id', orderId)
      .select('id,shipping_label_url,shipping_label_uploaded_at,shipping_label_uploaded_by'); // CRÍTICO: Seleccionar para verificar

    if (upd.error) {
      const code = String((upd.error as any)?.code || '');
      const msg = String((upd.error as any)?.message || '').toLowerCase();
      console.error('[API LABEL UPLOAD] Error actualizando orden:', { code, msg, error: upd.error });
      
      if (code === '42703' || msg.includes('column')) {
        console.error('[API LABEL UPLOAD] Columnas faltantes en orders. Ejecutar supabase_orders_logistics.sql');
        return NextResponse.json(
          { error: 'Faltan columnas de logística en `orders`. Ejecuta `supabase_orders_logistics.sql`.' },
          { status: 400 },
        );
      }
      return NextResponse.json({ error: `Error al actualizar orden: ${upd.error.message}` }, { status: 400 });
    }

    // CRÍTICO: Verificar que realmente se actualizó
    if (!upd.data || upd.data.length === 0) {
      console.error('[API LABEL UPLOAD] ⚠️ ADVERTENCIA: La actualización no afectó ninguna fila');
      return NextResponse.json({ error: 'No se pudo actualizar la orden. Verifica que existe.' }, { status: 404 });
    }

    const updatedOrder = upd.data[0];
    console.log('[API LABEL UPLOAD] ✅ Orden actualizada en BD:', {
      orderId,
      shipping_label_url: updatedOrder.shipping_label_url,
      shipping_label_uploaded_at: updatedOrder.shipping_label_uploaded_at,
      shipping_label_uploaded_by: updatedOrder.shipping_label_uploaded_by,
    });

    // CRÍTICO: Verificar que la URL se guardó correctamente
    if (String(updatedOrder.shipping_label_url || '').trim() !== url) {
      console.error('[API LABEL UPLOAD] ⚠️ ERROR: La URL guardada no coincide con la subida', {
        expected: url,
        actual: updatedOrder.shipping_label_url,
      });
      return NextResponse.json({ error: 'Error: La URL no se guardó correctamente.' }, { status: 500 });
    }

    // CRÍTICO: Verificación adicional después de actualizar
    const verifyRes: any = await admin
      .from('orders')
      .select('id,shipping_label_url,shipping_label_uploaded_at')
      .eq('id', orderId)
      .maybeSingle();

    if (verifyRes.error) {
      console.error('[API LABEL UPLOAD] Error verificando actualización:', verifyRes.error);
      return NextResponse.json({ error: 'La guía se subió pero no se pudo verificar.' }, { status: 500 });
    }

    if (!verifyRes.data || String(verifyRes.data.shipping_label_url || '').trim() !== url) {
      console.error('[API LABEL UPLOAD] ⚠️ ERROR CRÍTICO: La URL no se guardó correctamente en verificación', {
        expected: url,
        actual: verifyRes.data?.shipping_label_url,
      });
      return NextResponse.json({ error: 'Error: La URL no se guardó correctamente en la base de datos.' }, { status: 500 });
    }

    console.log('[API LABEL UPLOAD] ✅ Verificación exitosa:', {
      orderId,
      shipping_label_url: verifyRes.data.shipping_label_url,
      shipping_label_uploaded_at: verifyRes.data.shipping_label_uploaded_at,
    });

    // Notificar al vendedor (best-effort)
    try {
      const sellerId = String((orderRow as any).seller_id || '').trim();
      if (sellerId) {
        const payload: any = {
          user_id: sellerId,
          type: 'shipping_label_ready',
          title: 'Guía disponible',
          body: `Ya puedes descargar la guía de envío para tu venta (orden ${orderId.slice(0, 8)}…).`,
          data: { orderId },
          is_read: false,
        };
        let ins: any = await admin.from('notifications').insert([payload]);
        if (ins.error) {
          const code = String((ins.error as any)?.code || '');
          const msg = String((ins.error as any)?.message || '').toLowerCase();
          if (code === '42703' || msg.includes('column')) {
            const fb = { ...payload };
            delete fb.data;
            delete fb.is_read;
            await admin.from('notifications').insert([fb]);
          }
        }
      }
    } catch {
      // noop
    }

    // Best-effort: disparar update realtime para Admin → Logística
    void broadcastAdminLogistica(orderId, { kind: 'label_uploaded', shipping_label_url: url });

    return NextResponse.json({ ok: true, url });
  } catch (e: unknown) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unexpected error' }, { status: 500 });
  }
}

