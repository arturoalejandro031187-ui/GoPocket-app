import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getUserAdminState, isRestricted } from '@/lib/userAdminState';

function getBearerToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

function toNumber(v: unknown) {
  const n = typeof v === 'number' ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: 'Missing Authorization Bearer token' }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as { listingId?: string };
    const listingId = String(body?.listingId || '').trim();
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

    const sellerState = await getUserAdminState(admin, sellerId);
    if (isRestricted(sellerState)) {
      return NextResponse.json(
        {
          error:
            sellerState?.status === 'banned'
              ? 'Tu cuenta está bloqueada. No puedes publicar.'
              : 'Tu cuenta está suspendida. No puedes publicar hasta que finalice la suspensión.',
        },
        { status: 403 },
      );
    }

    let fetch: any = await admin
      .from('listings')
      .select(
        'id,seller_id,title,description,price,currency,images,status,gender,size,color,category,free_shipping,condition,stock,color_variants,size_variants,sale_type,is_featured,featured_fee,auction_start_at,auction_end_at,auction_starting_bid,auction_bid_increment',
      )
      .eq('id', listingId)
      .maybeSingle();
    if (fetch.error) {
      const code = String((fetch.error as any)?.code || '');
      const msg = String((fetch.error as any)?.message || '').toLowerCase();
      if (code === '42703' || msg.includes('does not exist')) {
        fetch = await admin
          .from('listings')
          .select(
            'id,seller_id,title,description,price,currency,images,status,gender,size,color,category,sale_type,is_featured,featured_fee,auction_start_at,auction_end_at,auction_starting_bid,auction_bid_increment',
          )
          .eq('id', listingId)
          .maybeSingle();
      }
    }
    if (fetch.error) return NextResponse.json({ error: fetch.error.message }, { status: 400 });
    const row = fetch.data;
    if (!row) return NextResponse.json({ error: 'Publicación no encontrada' }, { status: 404 });
    if (String((row as any).seller_id) !== sellerId) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

    const original: any = row as any;
    const saleType = String(original.sale_type || 'direct');

    // Clonar solo campos "insertables" (evita columnas GENERATED como public_id)
    const now = Date.now();
    const payload: any = {
      seller_id: sellerId,
      title: `${String(original.title || 'Artículo').trim()} (copia)`,
      description: typeof original.description === 'string' ? original.description : null,
      currency: String(original.currency || 'MXN'),
      images: Array.isArray(original.images) ? (original.images as any[]).slice(0, 6) : [],
      // La copia nace como "nueva publicación" en borrador: se publica cuando el vendedor presiona "Publicar"
      status: 'draft',
      gender: original.gender ?? null,
      size: original.size ?? null,
      color: original.color ?? null,
      category: original.category ?? null,
      free_shipping: Boolean(original.free_shipping),
      condition: original.condition ?? null,
      stock: typeof original.stock === 'number' ? original.stock : null,
      color_variants: Array.isArray(original.color_variants) && original.color_variants.length > 0 ? original.color_variants : null,
      size_variants: Array.isArray(original.size_variants) && original.size_variants.length > 0 ? original.size_variants : null,
      sale_type: saleType,
      is_featured: Boolean(original.is_featured),
      featured_fee: toNumber(original.featured_fee),
      // lifecycle
      view_count: 0,
      expires_at: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(),
      // soft-delete defaults
      is_deleted: false,
      deleted_at: null,
      deleted_reason: null,
    };

    if (saleType === 'auction') {
      const starting = toNumber(original.auction_starting_bid) || toNumber(original.price) || 1;
      const inc = Math.max(1, toNumber(original.auction_bid_increment) || 10);

      payload.price = starting;
      payload.auction_starting_bid = starting;
      payload.auction_bid_increment = inc;
      payload.auction_highest_bid = 0;
      payload.auction_highest_bidder_id = null;

      // La ventana se configura en el borrador antes de publicar
      payload.auction_start_at = null;
      payload.auction_end_at = null;
    } else {
      payload.price = toNumber(original.price);
      payload.auction_start_at = null;
      payload.auction_end_at = null;
      payload.auction_starting_bid = 0;
      payload.auction_bid_increment = 0;
      payload.auction_highest_bid = 0;
      payload.auction_highest_bidder_id = null;
    }

    // Insert con fallback si columnas no existen (por ejemplo: view_count/expires_at/is_deleted)
    let insert = await admin.from('listings').insert([payload]).select('id').single();
    if (insert.error) {
      const code = String((insert.error as any)?.code || '');
      const msg = String((insert.error as any)?.message || '');
      if (code === '42703' || msg.toLowerCase().includes('does not exist') || msg.toLowerCase().includes('schema cache') || msg.toLowerCase().includes('column')) {
        const fallback: any = { ...payload };
        delete fallback.view_count;
        delete fallback.expires_at;
        delete fallback.is_deleted;
        delete fallback.deleted_at;
        delete fallback.deleted_reason;
        delete fallback.free_shipping;
        insert = await admin.from('listings').insert([fallback]).select('id').single();
      }
    }
    if (insert.error) return NextResponse.json({ error: insert.error.message }, { status: 400 });

    return NextResponse.json({ ok: true, id: (insert.data as any).id });
  } catch (e: unknown) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unexpected error' }, { status: 500 });
  }
}

