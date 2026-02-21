import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * GET /api/listings/[id]
 * Obtiene una publicación por ID usando service role (bypass RLS).
 * Devuelve solo publicaciones activas al público; el vendedor puede ver las propias en cualquier estado.
 */
const SELECT_COLS =
  'id,public_id,title,description,description_blocks,price,currency,images,status,seller_id,created_at,sale_type,gender,size,color,color_variants,size_variants,category,tags,auction_start_at,auction_end_at,auction_bid_increment,auction_highest_bid,auction_highest_bidder_id,shipping_by_seller,allow_personal_delivery,free_shipping,shipping_subsidy,shipping_price,weight_kg,length_cm,width_cm,height_cm,attributes,wholesale_tiers,stock,size_stock,product_type';

const SELECT_COLS_FALLBACK =
  'id,public_id,title,description,description_blocks,price,currency,images,status,seller_id,created_at,sale_type,gender,size,color,color_variants,size_variants,category,auction_start_at,auction_end_at,auction_bid_increment,auction_highest_bid,auction_highest_bidder_id';

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const params = await ctx.params;
    const rawId = String(params?.id ?? '').trim();

    if (!rawId) return NextResponse.json({ error: 'ID requerido' }, { status: 400 });

    // Si es public_id (ej: PCK-XXX), resolver a UUID primero
    let listingId = rawId;
    if (!isUuid(rawId)) {
      const admin = supabaseAdmin();
      const { data: resolved } = await admin
        .from('listings')
        .select('id')
        .eq('public_id', rawId)
        .maybeSingle();
      if (!resolved?.id) return NextResponse.json({ error: 'Publicación no encontrada' }, { status: 404 });
      listingId = String(resolved.id);
    }

    const admin = supabaseAdmin();

    // Obtener Authorization header para verificar si es el vendedor (puede ver draft/paused/etc)
    const authHeader = req.headers.get('authorization');
    let viewerId: string | null = null;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (supabaseUrl && supabaseAnon) {
          const client = createClient(supabaseUrl, supabaseAnon);
          const { data: { user } } = await client.auth.getUser(authHeader.slice(7));
          viewerId = user?.id ?? null;
        }
      } catch {
        // Ignorar errores de auth; seguir como anónimo
      }
    }

    let res: any = await admin
      .from('listings')
      .select(SELECT_COLS)
      .eq('id', listingId)
      .maybeSingle();

    if (res?.error) {
      const code = String((res.error as any)?.code || '');
      const msg = String((res.error as any)?.message || '').toLowerCase();
      if (code === '42703' || msg.includes('column') || msg.includes('does not exist')) {
        res = await admin
          .from('listings')
          .select(SELECT_COLS_FALLBACK)
          .eq('id', listingId)
          .maybeSingle();
      }
      if (res?.error) {
        return NextResponse.json({ error: res.error.message }, { status: 400 });
      }
    }

    const row = res?.data;
    if (!row) return NextResponse.json({ error: 'Publicación no encontrada' }, { status: 404 });

    const status = String(row.status ?? '').toLowerCase();
    const sellerId = String(row.seller_id ?? '');

    // Público solo puede ver activas; el vendedor puede ver las propias
    const isOwner = viewerId && sellerId && viewerId === sellerId;
    if (status !== 'active' && !isOwner) {
      return NextResponse.json(
        { error: `Publicación en estado "${status}". Solo visible para el vendedor.` },
        { status: 403 }
      );
    }

    // Joinear con profiles para datos del vendedor
    const { data: profile } = await admin
      .from('profiles')
      .select('full_name,city,state,zip_code,store_logo_url,plan_type,is_official_store,official_store_name,official_store_banner_url,official_store_brand_color,is_verified,is_wholesaler,is_manufacturer,rating_total_count,rating_good_count,reputation_score,manual_reputation_score,manual_sales_count')
      .eq('id', sellerId)
      .maybeSingle();

    const listing = {
      ...row,
      seller: profile ?? undefined,
    };

    return NextResponse.json(listing, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
  } catch (e: unknown) {
    console.error('[api/listings/[id]]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error al cargar la publicación' },
      { status: 500 }
    );
  }
}
