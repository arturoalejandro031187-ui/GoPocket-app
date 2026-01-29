import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function getBearerToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: 'Missing Authorization Bearer token' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { listingId, action } = body;

    if (!listingId || !action) {
      return NextResponse.json({ error: 'Faltan parámetros requeridos (listingId, action)' }, { status: 400 });
    }

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
    const { data: adminRow } = await admin.from('admin_users').select('user_id').eq('user_id', userData.user.id).maybeSingle();
    if (!adminRow) return NextResponse.json({ error: 'No tienes permisos de administrador.' }, { status: 403 });

    let updateData: any = {};

    switch (action) {
      case 'delete':
        updateData = {
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          status: 'blocked' // Usamos 'blocked' ya que 'archived' no existe en el enum
        };
        break;
      case 'suspend':
        updateData = {
          status: 'paused'
        };
        break;
      case 'reactivate':
        updateData = {
          status: 'active',
          is_deleted: false,
          deleted_at: null
        };
        break;
      default:
        return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
    }

    const { error: updateErr } = await admin
      .from('listings')
      .update(updateData)
      .eq('id', listingId);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, listingId, action, updates: updateData });
  } catch (e: unknown) {
    console.error(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error inesperado' }, { status: 500 });
  }
}
