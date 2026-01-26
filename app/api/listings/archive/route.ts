import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/admin';

type Body = {
  listingId: string;
  reason?: string | null;
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
    const reason = typeof body.reason === 'string' ? body.reason.trim() : null;
    if (!listingId) return NextResponse.json({ error: 'listingId is required' }, { status: 400 });

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

    // Traer datos necesarios para reglas (subasta no se puede eliminar hasta que termine)
    const { data: listing, error: lErr } = await admin
      .from('listings')
      .select('id,seller_id,sale_type,auction_end_at,is_deleted')
      .eq('id', listingId)
      .maybeSingle();
    if (lErr) return NextResponse.json({ error: lErr.message }, { status: 400 });
    if (!listing) return NextResponse.json({ error: 'Publicación no encontrada' }, { status: 404 });
    if (String((listing as any).seller_id) !== sellerId) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    if (Boolean((listing as any).is_deleted)) return NextResponse.json({ ok: true, already: true });

    const saleType = String((listing as any).sale_type || 'direct');
    if (saleType === 'auction') {
      const endAt = (listing as any).auction_end_at ? Date.parse((listing as any).auction_end_at) : NaN;
      if (!Number.isFinite(endAt) || Date.now() < endAt) {
        return NextResponse.json({ error: 'No puedes eliminar una subasta hasta que finalice.' }, { status: 400 });
      }
    }

    // Borrado lógico: NO borramos la fila, solo archivamos.
    // Así el panel admin y el historial de operaciones pueden seguir referenciando.
    const patch: any = {
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_reason: reason || null,
      status: 'paused',
    };

    // Si aún no existe la columna is_deleted, fallará con 42703 → mostrar mensaje guía.
    const { error: updErr } = await admin.from('listings').update(patch).eq('id', listingId);
    if (updErr) {
      const code = String((updErr as any)?.code || '');
      const msg = String((updErr as any)?.message || '');
      if (code === '42703' || msg.toLowerCase().includes('does not exist')) {
        return NextResponse.json(
          {
            error:
              "Tu tabla `listings` aún no tiene columnas para borrado lógico. Ejecuta `supabase_listings_soft_delete.sql` en Supabase (SQL Editor) y vuelve a intentar.",
          },
          { status: 400 },
        );
      }
      return NextResponse.json({ error: updErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unexpected error' }, { status: 500 });
  }
}

