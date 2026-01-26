import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function getBearerToken(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

type Body = {
  quote_id: string;
  guide_file_url: string;
};

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: 'Missing Authorization Bearer token' }, { status: 401 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
    const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    if (!supabaseUrl || !supabaseAnon) {
      return NextResponse.json({ error: 'Supabase env vars missing on server' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseAnon, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr) return NextResponse.json({ error: userErr.message }, { status: 401 });
    if (!userData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Verificar que es admin
    const admin = supabaseAdmin();
    const { data: adminRow } = await admin
      .from('admin_users')
      .select('user_id')
      .eq('user_id', userData.user.id)
      .maybeSingle();

    if (!adminRow) {
      return NextResponse.json({ error: 'No tienes permisos de administrador.' }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as Partial<Body>;
    const quoteId = String(body.quote_id || '').trim();
    const guideFileUrl = String(body.guide_file_url || '').trim();

    if (!quoteId || !guideFileUrl) {
      return NextResponse.json({ error: 'quote_id y guide_file_url son requeridos.' }, { status: 400 });
    }

    // Verificar que la cotización existe y está pagada
    const { data: quote, error: quoteErr } = await admin
      .from('estafeta_quotes')
      .select('id, status')
      .eq('id', quoteId)
      .maybeSingle();

    if (quoteErr || !quote) {
      return NextResponse.json({ error: 'Cotización no encontrada.' }, { status: 404 });
    }

    if (quote.status !== 'paid' && quote.status !== 'processing') {
      return NextResponse.json({ error: 'Solo se pueden subir guías para cotizaciones pagadas.' }, { status: 400 });
    }

    // Actualizar cotización con URL de guía
    const { error: updateErr } = await admin
      .from('estafeta_quotes')
      .update({
        guide_file_url: guideFileUrl,
        guide_uploaded_at: new Date().toISOString(),
        guide_uploaded_by: userData.user.id,
        status: quote.status === 'paid' ? 'processing' : quote.status, // Cambiar a processing si estaba paid
        updated_at: new Date().toISOString(),
      })
      .eq('id', quoteId);

    if (updateErr) {
      console.error('[ADMIN ESTAFETA UPLOAD] Error:', updateErr);
      return NextResponse.json({ error: 'No se pudo actualizar la cotización.' }, { status: 500 });
    }

    // Notificar al usuario que su guía está lista
    const { data: quoteForUser } = await admin
      .from('estafeta_quotes')
      .select('user_id, calculated_cost')
      .eq('id', quoteId)
      .maybeSingle();

    if (quoteForUser?.user_id) {
      const { insertNotificationBestEffort } = await import('@/lib/notifications/insertBestEffort');
      await insertNotificationBestEffort(admin, {
        user_id: quoteForUser.user_id,
        type: 'estafeta_guide_ready',
        title: 'Tu guía Estafeta está lista',
        body: 'Tu guía de envío Estafeta está disponible para descargar en tu panel de compras.',
        data: { quote_id: quoteId, guide_file_url: guideFileUrl, type: 'estafeta_guide' },
        is_read: false,
      });
    }

    const resp = NextResponse.json({
      ok: true,
      message: 'Guía subida correctamente.',
    });
    resp.headers.set('Cache-Control', 'no-store, max-age=0');
    return resp;
  } catch (e: unknown) {
    console.error(e);
    const resp = NextResponse.json({ error: e instanceof Error ? e.message : 'Unexpected error' }, { status: 500 });
    resp.headers.set('Cache-Control', 'no-store, max-age=0');
    return resp;
  }
}
