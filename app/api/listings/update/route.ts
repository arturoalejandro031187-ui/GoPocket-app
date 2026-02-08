import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { validateTemplateBlocks } from '@/lib/templates/validate';
import { blocksToPlainText } from '@/lib/templates/text';
import { listingPolicyHumanWarning, scanListingContentPolicy } from '@/lib/moderation/listingContentPolicy';
import { getUserAdminState, isRestricted, isSuspended } from '@/lib/userAdminState';

type Body = {
  listingId: string;
  patch: Record<string, any>;
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
    const listingId = String(body.listingId ?? '').trim();
    const patch = (body.patch ?? {}) as Record<string, any>;
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

    const { data: row, error: fetchErr } = await admin
      .from('listings')
      .select('id,seller_id,sale_type,status,price,auction_starting_bid,title,description,description_blocks')
      .eq('id', listingId)
      .maybeSingle();
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 400 });
    if (!row) return NextResponse.json({ error: 'Publicación no encontrada' }, { status: 404 });
    if (String((row as any).seller_id) !== sellerId) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

    const sellerState = await getUserAdminState(admin, sellerId);
    if (isRestricted(sellerState)) {
      const goingActive = typeof patch?.status === 'string' && String(patch.status).toLowerCase() === 'active';
      if (sellerState?.status === 'banned') {
        return NextResponse.json({ error: 'Tu cuenta está bloqueada. No puedes modificar publicaciones.' }, { status: 403 });
      }
      if (isSuspended(sellerState) && goingActive) {
        return NextResponse.json(
          { error: 'Tu cuenta está suspendida. No puedes activar publicaciones hasta que finalice la suspensión.' },
          { status: 403 },
        );
      }
    }

    // Whitelist de campos editables (evitar cambios peligrosos)
    const allowed = new Set([
      'title',
      'description',
      'price',
      'images',
      'gender',
      'size',
      'color',
      'category',
      'free_shipping',
      'description_blocks',
      'description_blocks_meta',
      'sale_type',
      'auction_start_at',
      'auction_end_at',
      'auction_starting_bid',
      'auction_bid_increment',
      'status',
      'is_featured',
      'featured_fee',
      'expires_at',
      'shipping_subsidy',
      'weight_kg',
      'length_cm',
      'width_cm',
      'height_cm',
      'shipping_by_seller',
      'allow_personal_delivery',
      'tags',
      'attributes',
      'subcategory'
    ]);

    const safePatch: Record<string, any> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (allowed.has(k)) safePatch[k] = v;
    }

    // Sanitize Gender (map extended to Unisex)
    if (typeof safePatch.gender === 'string') {
      const validGenders = ['Mujer', 'Hombre', 'Unisex'];
      if (!validGenders.includes(safePatch.gender)) {
         // Add tag for original gender if tags allowed
         const original = safePatch.gender;
         safePatch.gender = 'Unisex';
         
         // If tags are in patch, append; else create new array if we can? 
         // We can't easily append to existing tags in DB without reading them first.
         // But we assume the client sends the FULL list of tags.
         if (Array.isArray(safePatch.tags)) {
            safePatch.tags.push(`gender:${original}`);
         } else {
            // If client didn't send tags, we might overwrite existing tags if we set it.
            // But we don't know existing tags.
            // Safe bet: just map gender to avoid crash. 
            // If client sends tags, we append.
         }
      }
    }

    if (typeof safePatch.title === 'string') safePatch.title = safePatch.title.trim();
    if (typeof safePatch.description === 'string') safePatch.description = safePatch.description.trim();
    if (typeof safePatch.color === 'string') safePatch.color = safePatch.color.trim();
    if (typeof safePatch.category === 'string') safePatch.category = safePatch.category.trim();

    if (Object.prototype.hasOwnProperty.call(safePatch, 'description_blocks')) {
      if (safePatch.description_blocks === null) {
        // allow unset
      } else {
        const v = validateTemplateBlocks(safePatch.description_blocks, { maxBlocks: 80, allowImageSlots: false });
        if (!v.ok) {
          const err = 'error' in v ? v.error : 'Bloques inválidos';
          return NextResponse.json({ error: err }, { status: 400 });
        }
        safePatch.description_blocks = v.blocks as any;
      }
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'description_blocks_meta')) {
      if (safePatch.description_blocks_meta === null) {
        // allow unset
      } else {
        const m = sanitizeBlocksMeta(safePatch.description_blocks_meta);
        safePatch.description_blocks_meta = m;
      }
    }

    if (Object.prototype.hasOwnProperty.call(safePatch, 'images')) {
      const arr = Array.isArray(safePatch.images) ? safePatch.images : [];
      const cleaned = arr
        .filter((x) => typeof x === 'string' && x.trim().length > 0)
        .map((x) => String(x).trim());

      if (cleaned.length < 2) {
        return NextResponse.json({ error: 'Sube mínimo 2 imágenes.' }, { status: 400 });
      }
      if (cleaned.length > 6) {
        return NextResponse.json({ error: 'Máximo 6 imágenes.' }, { status: 400 });
      }

      safePatch.images = cleaned;
    }

    // Si el vendedor está "publicando" un borrador, aplicamos validaciones extra
    const existing: any = row as any;
    const nextStatus = typeof safePatch.status === 'string' ? safePatch.status : String(existing.status || '');
    const nextSaleType = typeof safePatch.sale_type === 'string' ? safePatch.sale_type : String(existing.sale_type || 'direct');

    // Política anti-contacto / anti-links externos:
    // - al pasar a active (publicar)
    // - o al editar contenido mientras está activo
    const isPublishingNow = String(existing.status || '') !== 'active' && nextStatus === 'active';
    const touchesContent =
      Object.prototype.hasOwnProperty.call(safePatch, 'title') ||
      Object.prototype.hasOwnProperty.call(safePatch, 'description') ||
      Object.prototype.hasOwnProperty.call(safePatch, 'description_blocks');
    if (nextStatus === 'active' && (isPublishingNow || touchesContent)) {
      const nextTitle = typeof safePatch.title === 'string' ? String(safePatch.title) : String(existing.title || '');
      const nextDescription =
        typeof safePatch.description === 'string' ? String(safePatch.description) : existing.description ? String(existing.description) : null;
      const nextBlocks =
        Object.prototype.hasOwnProperty.call(safePatch, 'description_blocks') ? safePatch.description_blocks : existing.description_blocks;
      const blocksText = Array.isArray(nextBlocks) ? blocksToPlainText(nextBlocks as any) : '';
      const scan = scanListingContentPolicy({ title: nextTitle, description: nextDescription, blocksText });
      if (!scan.ok) {
        return NextResponse.json(
          { error: listingPolicyHumanWarning(scan.violations), violations: scan.violations },
          { status: 400 },
        );
      }
    }

    if (nextStatus === 'active') {
      const nextPrice = Object.prototype.hasOwnProperty.call(safePatch, 'price') ? numberOrZero(safePatch.price) : numberOrZero(existing.price);

      if (nextSaleType === 'direct') {
        if (nextPrice <= 0) return NextResponse.json({ error: 'El precio debe ser mayor a 0.' }, { status: 400 });
        // Limpieza de campos de subasta cuando se publica como venta directa
        safePatch.auction_start_at = null;
        safePatch.auction_end_at = null;
        safePatch.auction_starting_bid = 0;
        safePatch.auction_bid_increment = 0;
      } else if (nextSaleType === 'auction') {
        const startAt = String(safePatch.auction_start_at ?? '').trim();
        const endAt = String(safePatch.auction_end_at ?? '').trim();
        const startingBid = Object.prototype.hasOwnProperty.call(safePatch, 'auction_starting_bid')
          ? numberOrZero(safePatch.auction_starting_bid)
          : numberOrZero(existing.auction_starting_bid) || nextPrice;
        const inc = Object.prototype.hasOwnProperty.call(safePatch, 'auction_bid_increment') ? numberOrZero(safePatch.auction_bid_increment) : 0;

        if (!startAt || !endAt) return NextResponse.json({ error: 'Faltan fechas de subasta.' }, { status: 400 });
        if (startingBid <= 0) return NextResponse.json({ error: 'La puja inicial debe ser mayor a 0.' }, { status: 400 });
        if (inc <= 0) return NextResponse.json({ error: 'El incremento de puja debe ser mayor a 0.' }, { status: 400 });

        // Asegurar consistencia al publicar subasta
        safePatch.price = startingBid;
        safePatch.auction_starting_bid = startingBid;
        safePatch.auction_highest_bid = startingBid;
        safePatch.auction_highest_bidder_id = null;
      }
    }

    let upd = await admin.from('listings').update(safePatch).eq('id', listingId);
    let updErr = upd.error;
    // Fallback si el esquema no tiene algunas columnas (muy raro, pero evita romper en migraciones incompletas)
    if (updErr) {
      const code = String((updErr as any)?.code || '');
      const msg = String((updErr as any)?.message || '').toLowerCase();
      if (code === '42703' || msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('column')) {
        const fallback: any = { ...safePatch };
        delete fallback.auction_highest_bid;
        delete fallback.auction_highest_bidder_id;
        delete fallback.free_shipping;
        delete fallback.description_blocks;
        delete fallback.description_blocks_meta;
        upd = await admin.from('listings').update(fallback).eq('id', listingId);
        updErr = upd.error;
      }
    }
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unexpected error' }, { status: 500 });
  }
}

