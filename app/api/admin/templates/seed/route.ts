import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { TemplateBlock } from '@/lib/templates/blocks';
import { validateTemplateBlocks } from '@/lib/templates/validate';

function getBearerToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: 'Missing Authorization Bearer token' }, { status: 401 });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    if (!url || !anon) return NextResponse.json({ error: 'Supabase env vars missing on server' }, { status: 500 });

    const supabase = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr) return NextResponse.json({ error: userErr.message }, { status: 401 });
    if (!userData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const authed = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const uid = userData.user.id;
    const adminRow: any = await authed.from('admin_users').select('user_id').eq('user_id', uid).maybeSingle();
    const ok = Boolean(adminRow?.data?.user_id) && !adminRow?.error;
    if (!ok) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

    let db: any = authed;
    try {
      db = supabaseAdmin();
    } catch {
      db = authed;
    }

    const defaults: Array<{ title: string; description: string; blocks: TemplateBlock[] }> = [
      {
        title: 'PRO · Básica (rápida y clara)',
        description: 'Ideal para la mayoría de prendas. Corto, directo y con bullets.',
        blocks: [
          { type: 'heading', text: 'Estado y detalles', level: 2 },
          { type: 'bullets', items: ['Condición: (nuevo / como nuevo / usado)', 'Marca:', 'Talla:', 'Color:', 'Medidas:'] },
          { type: 'callout', title: 'Tip', body: 'Entre más claras las medidas y el estado, más conversiones.', tone: 'pink' },
        ],
      },
      {
        title: 'PRO · Envío + Garantía',
        description: 'Incluye recuadros para envío, cambios y compra protegida.',
        blocks: [
          { type: 'heading', text: 'Descripción', level: 2 },
          { type: 'paragraph', text: 'Detalles del producto, condición, material y cualquier defecto (si lo hay).' },
          { type: 'divider' },
          { type: 'callout', title: 'Envío', body: 'Envío rápido. Empaque seguro. Te paso guía cuando se genere.', tone: 'neutral' },
          { type: 'callout', title: 'Compra protegida', body: 'Tu compra está protegida: soporte y seguimiento.', tone: 'success' },
        ],
      },
      {
        title: 'PRO · Storytelling (vende más)',
        description: 'Estructura tipo “anuncio bonito”: título + beneficios + detalles.',
        blocks: [
          { type: 'heading', text: 'Lo que te va a encantar', level: 2 },
          { type: 'bullets', items: ['Tela cómoda', 'Color combinable', 'Súper cuidado', 'Ideal para (ocasión)'] },
          { type: 'heading', text: 'Detalles', level: 3 },
          { type: 'paragraph', text: 'Marca, talla, medidas y condición. Si tiene detalles, los menciono para transparencia.' },
          { type: 'callout', title: 'Pregunta sin pena', body: 'Si quieres más fotos o medidas, pregúntame aquí.', tone: 'pink' },
        ],
      },
    ];

    const existing: any = await db.from('listing_templates').select('title').eq('is_global', true).limit(500);
    if (existing?.error) return NextResponse.json({ error: String(existing.error?.message || 'No se pudo leer templates.') }, { status: 400 });
    const existingTitles = new Set(((existing.data as any[]) ?? []).map((r) => String(r?.title || '').trim()).filter(Boolean));

    let inserted = 0;
    for (const t of defaults) {
      if (existingTitles.has(t.title)) continue;
      const v = validateTemplateBlocks(t.blocks, { maxBlocks: 60 });
      if (!v.ok) continue;
      const ins: any = await db
        .from('listing_templates')
        .insert([
          {
            owner_id: null,
            is_global: true,
            is_active: true,
            title: t.title,
            description: t.description,
            preview_image_url: null,
            blocks: v.blocks as any,
          },
        ])
        .select('id')
        .single();
      if (!ins?.error) inserted += 1;
    }

    return NextResponse.json({ ok: true, inserted });
  } catch (e: unknown) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unexpected error' }, { status: 500 });
  }
}

