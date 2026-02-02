import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { validateTemplateBlocks } from '@/lib/templates/validate';
import { blocksToPlainText } from '@/lib/templates/text';
import { listingPolicyHumanWarning, scanListingContentPolicy } from '@/lib/moderation/listingContentPolicy';
import { getUserAdminState, isRestricted } from '@/lib/userAdminState';

type Body = {
  title: string;
  description?: string | null;
  price: number;
  currency?: string;
  images: string[];
  status?: string;

  gender?: 'Mujer' | 'Hombre' | 'Unisex' | null;
  size?: string | null;
  brand?: string | null;
  model?: string | null;
  color?: string | null;
  category?: string | null;
  free_shipping?: boolean;
  condition?: 'nuevo' | 'usado' | 'casi_nuevo' | null;
  stock?: number | null;
  color_variants?: string[] | null;
  size_variants?: string[] | null;

  weight_kg?: number | null;
  length_cm?: number | null;
  width_cm?: number | null;
  height_cm?: number | null;

  shipping_by_seller?: boolean;
  shipping_subsidy?: number | null;
  allow_personal_delivery?: boolean;
  handling_days?: number | null;

  sale_type?: 'direct' | 'auction';
  is_featured?: boolean;
  featured_fee?: number;

  auction_start_at?: string | null;
  auction_end_at?: string | null;
  auction_starting_bid?: number;
  auction_bid_increment?: number;
  auction_highest_bid?: number;

  description_blocks?: unknown;
  description_blocks_meta?: unknown;
};

function getBearerToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

function numberOrZero(v: unknown) {
  const n = typeof v === 'number' ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function sanitizeBlocksMeta(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const o = input as Record<string, any>;
  const out: Record<string, any> = {};
  const template_id = typeof o.template_id === 'string' ? o.template_id.trim() : '';
  const template_title = typeof o.template_title === 'string' ? o.template_title.trim() : '';
  const applied_at = typeof o.applied_at === 'string' ? o.applied_at.trim() : '';
  const applied_by = typeof o.applied_by === 'string' ? o.applied_by.trim() : '';
  if (template_id) out.template_id = template_id.slice(0, 80);
  if (template_title) out.template_title = template_title.slice(0, 140);
  if (applied_at) out.applied_at = applied_at.slice(0, 64);
  if (applied_by) out.applied_by = applied_by.slice(0, 80);
  return Object.keys(out).length ? out : null;
}

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: 'Missing Authorization Bearer token' }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as Partial<Body>;
    const title = String(body.title ?? '').trim();
    const description = typeof body.description === 'string' ? body.description.trim() : null;
    const images = Array.isArray(body.images) ? body.images.filter((x) => typeof x === 'string' && x.trim()) : [];
    const currency = String(body.currency ?? 'MXN').trim() || 'MXN';
    const saleType = (body.sale_type ?? 'direct') as 'direct' | 'auction';

    const price = numberOrZero(body.price);
    const auctionStartingBid = numberOrZero(body.auction_starting_bid);
    const auctionBidIncrement = numberOrZero(body.auction_bid_increment);

    if (title.length < 3) return NextResponse.json({ error: 'El título debe tener al menos 3 caracteres.' }, { status: 400 });
    if (images.length < 2) return NextResponse.json({ error: 'Sube mínimo 2 imágenes.' }, { status: 400 });
    if (images.length > 6) return NextResponse.json({ error: 'Máximo 6 imágenes.' }, { status: 400 });

    if (saleType === 'direct') {
      if (price <= 0) return NextResponse.json({ error: 'El precio debe ser mayor a 0.' }, { status: 400 });
    } else {
      if (!body.auction_start_at || !body.auction_end_at) {
        return NextResponse.json({ error: 'Faltan fechas de subasta.' }, { status: 400 });
      }
      if (auctionStartingBid <= 0) return NextResponse.json({ error: 'La puja inicial debe ser mayor a 0.' }, { status: 400 });
      if (auctionBidIncrement <= 0) return NextResponse.json({ error: 'El incremento de puja debe ser mayor a 0.' }, { status: 400 });
    }

    // Snapshot de bloques (plantillas) — validación estricta (si viene)
    let descriptionBlocks: any = null;
    if (Object.prototype.hasOwnProperty.call(body, 'description_blocks')) {
      if (body.description_blocks === null) {
        descriptionBlocks = null;
      } else {
        const v = validateTemplateBlocks(body.description_blocks, { maxBlocks: 80, allowImageSlots: false });
        if (!v.ok) {
          const err = 'error' in v ? v.error : 'Bloques inválidos';
          return NextResponse.json({ error: err }, { status: 400 });
        }
        descriptionBlocks = v.blocks as any;
      }
    }
    const blocksMeta = sanitizeBlocksMeta((body as any).description_blocks_meta);

    // Política anti-contacto / anti-links externos (solo al publicar en "active")
    const nextStatus = String(body.status ?? 'active').trim() || 'active';
    if (nextStatus === 'active') {
      const blocksText = Array.isArray(descriptionBlocks) ? blocksToPlainText(descriptionBlocks as any) : '';
      const scan = scanListingContentPolicy({ title, description, blocksText });
      if (!scan.ok) {
        return NextResponse.json(
          { error: listingPolicyHumanWarning(scan.violations), violations: scan.violations },
          { status: 400 },
        );
      }
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
    const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    if (!supabaseUrl || !supabaseAnon) {
      return NextResponse.json({ error: 'Supabase env vars missing on server' }, { status: 500 });
    }

    // Validar token → usuario
    const supabase = createClient(supabaseUrl, supabaseAnon, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr) return NextResponse.json({ error: userErr.message }, { status: 401 });
    if (!userData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let admin: ReturnType<typeof supabaseAdmin> | null = null;
    try {
      admin = supabaseAdmin();
    } catch {
      admin = null;
    }

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

    const payload: any = {
      seller_id: sellerId,
      title,
      description: description || null,
      price: saleType === 'direct' ? price : auctionStartingBid,
      currency,
      images,
      status: body.status ?? 'active',

      gender: body.gender ?? null,
      size: body.size ?? null,
      color: typeof body.color === 'string' ? body.color.trim() : null,
      category: typeof body.category === 'string' ? body.category.trim() : null,
      free_shipping: Boolean((body as any).free_shipping),
      condition: (body as any).condition || null,
      stock: typeof body.stock === 'number' ? (body.stock > 0 ? body.stock : null) : null,
      color_variants: Array.isArray(body.color_variants) && body.color_variants.length > 0 && body.color_variants.length <= 12
        ? body.color_variants.filter((c: any) => typeof c === 'string' && c.trim()).map((c: string) => c.trim())
        : null,
      size_variants: Array.isArray(body.size_variants) && body.size_variants.length > 0 && body.size_variants.length <= 12
        ? body.size_variants.filter((s: any) => typeof s === 'string' && s.trim()).map((s: string) => s.trim())
        : null,

      weight_kg: numberOrZero(body.weight_kg) || 1.0,
      length_cm: numberOrZero(body.length_cm) || 10.0,
      width_cm: numberOrZero(body.width_cm) || 10.0,
      height_cm: numberOrZero(body.height_cm) || 10.0,

      shipping_by_seller: Boolean(body.shipping_by_seller),
      shipping_subsidy: numberOrZero(body.shipping_subsidy),
      allow_personal_delivery: Boolean(body.allow_personal_delivery),
      handling_days: numberOrZero(body.handling_days),

      sale_type: saleType,
      is_featured: Boolean(body.is_featured),
      featured_fee: numberOrZero(body.featured_fee),

      auction_start_at: body.auction_start_at ?? null,
      auction_end_at: body.auction_end_at ?? null,
      auction_starting_bid: saleType === 'auction' ? auctionStartingBid : 0,
      auction_bid_increment: saleType === 'auction' ? auctionBidIncrement : 0,
      auction_highest_bid: saleType === 'auction' ? numberOrZero(body.auction_highest_bid ?? auctionStartingBid) : 0,

  brand: typeof body.brand === 'string' ? body.brand.trim() : null,
  model: typeof body.model === 'string' ? body.model.trim() : null,
};

    if (descriptionBlocks !== null) payload.description_blocks = descriptionBlocks;
    else if (Object.prototype.hasOwnProperty.call(body, 'description_blocks')) payload.description_blocks = null;
    if (blocksMeta) payload.description_blocks_meta = blocksMeta;

    // Intentar incluir lifecycle si existe; si no, reintentar sin esas columnas.
    const payloadWithLifecycle = {
      ...payload,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      view_count: 0,
    };

    let insert;
    if (admin) {
      insert = await admin.from('listings').insert([payloadWithLifecycle]).select('id').single();
    } else {
      const userScoped = createClient(supabaseUrl, supabaseAnon, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      insert = await userScoped.from('listings').insert([payloadWithLifecycle]).select('id').single();
    }
    if (insert.error) {
      const code = String((insert.error as any)?.code || '');
      const msg = String((insert.error as any)?.message || '');
      const low = msg.toLowerCase();
      if (code === '42703' || low.includes('does not exist') || low.includes('schema cache') || low.includes('column')) {
        // 1) reintentar sin lifecycle
        if (admin) {
          insert = await admin.from('listings').insert([payload]).select('id').single();
        } else {
          const userScoped = createClient(supabaseUrl, supabaseAnon, {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
            global: { headers: { Authorization: `Bearer ${token}` } },
          });
          insert = await userScoped.from('listings').insert([payload]).select('id').single();
        }
      }
    }

    // Fallback extra: si tu tabla aún no tiene ciertas columnas, reintentar sin esos campos.
    if (insert.error) {
      const code = String((insert.error as any)?.code || '');
      const msg = String((insert.error as any)?.message || '');
      const low = msg.toLowerCase();
      if (code === '42703' || low.includes('schema cache') || low.includes('column') || low.includes('does not exist')) {
        const fallback: any = { ...payload };
        // Eliminar columnas que podrían no existir
        delete fallback.free_shipping;
        delete fallback.description_blocks;
        delete fallback.description_blocks_meta;
        delete fallback.size_variants;
        delete fallback.color_variants;
        if (admin) {
          insert = await admin.from('listings').insert([fallback]).select('id').single();
        } else {
          const userScoped = createClient(supabaseUrl, supabaseAnon, {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
            global: { headers: { Authorization: `Bearer ${token}` } },
          });
          insert = await userScoped.from('listings').insert([fallback]).select('id').single();
        }
      }
    }

    const { data: listing, error: insertErr } = insert;
    if (insertErr) {
      const msg = String((insertErr as any)?.message || '');
      if (msg.toLowerCase().includes('row-level security')) {
        return NextResponse.json(
          {
            error:
              'RLS está bloqueando el insert incluso en server-side. Esto casi siempre significa que `SUPABASE_SERVICE_ROLE_KEY` es incorrecta (pegaste la anon key) o no reiniciaste el servidor.\n\n' +
              'Ve a Supabase: Settings → API → "service_role" (NO "anon") y pon esa key en `.env.local` como `SUPABASE_SERVICE_ROLE_KEY`, luego reinicia `npm run dev`.',
          },
          { status: 400 },
        );
      }
      return NextResponse.json({ error: msg || 'No se pudo crear la publicación.' }, { status: 400 });
    }

    return NextResponse.json({ ok: true, id: (listing as any).id });
  } catch (e: unknown) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unexpected error creating listing' }, { status: 500 });
  }
}

