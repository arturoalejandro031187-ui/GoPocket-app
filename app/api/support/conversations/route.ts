import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function getBearerToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

async function requireUser(req: NextRequest) {
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

  return { ok: true as const, userId: userData.user.id };
}

export async function GET(req: NextRequest) {
  try {
    const guard = await requireUser(req);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const admin = supabaseAdmin();
    const res: any = await admin
      .from('support_conversations')
      .select('id,created_by,subject,status,last_message_at,created_at,updated_at')
      .eq('created_by', guard.userId)
      .order('last_message_at', { ascending: false })
      .limit(50);

    if (res.error) {
      const code = String((res.error as any)?.code || '');
      const msg = String((res.error as any)?.message || '').toLowerCase();
      if (code === '42P01' || msg.includes('does not exist') || msg.includes('relation')) {
        return NextResponse.json({ error: 'Falta configurar soporte. Ejecuta `supabase_support_chat.sql` en Supabase.' }, { status: 400 });
      }
      return NextResponse.json({ error: res.error.message }, { status: 400 });
    }

    const resp = NextResponse.json({ ok: true, conversations: (res.data as any[]) ?? [] });
    resp.headers.set('Cache-Control', 'no-store, max-age=0');
    return resp;
  } catch (e: unknown) {
    console.error(e);
    const resp = NextResponse.json({ error: e instanceof Error ? e.message : 'Unexpected error' }, { status: 500 });
    resp.headers.set('Cache-Control', 'no-store, max-age=0');
    return resp;
  }
}

export async function POST(req: NextRequest) {
  try {
    const guard = await requireUser(req);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

    const body = (await req.json().catch(() => ({}))) as { subject?: string };
    const subject = String(body?.subject || '').trim();
    if (subject.length < 3) return NextResponse.json({ error: 'Escribe un asunto (mínimo 3 caracteres).' }, { status: 400 });
    if (subject.length > 120) return NextResponse.json({ error: 'Asunto demasiado largo (máx. 120).' }, { status: 400 });

    const admin = supabaseAdmin();
    const ins: any = await admin
      .from('support_conversations')
      .insert([{ created_by: guard.userId, subject, status: 'open' }])
      .select('id,created_by,subject,status,last_message_at,created_at,updated_at')
      .single();

    if (ins.error) {
      const code = String((ins.error as any)?.code || '');
      const msg = String((ins.error as any)?.message || '').toLowerCase();
      if (code === '42P01' || msg.includes('does not exist') || msg.includes('relation')) {
        return NextResponse.json({ error: 'Falta configurar soporte. Ejecuta `supabase_support_chat.sql` en Supabase.' }, { status: 400 });
      }
      return NextResponse.json({ error: ins.error.message }, { status: 400 });
    }

    const resp = NextResponse.json({ ok: true, conversation: ins.data });
    resp.headers.set('Cache-Control', 'no-store, max-age=0');
    return resp;
  } catch (e: unknown) {
    console.error(e);
    const resp = NextResponse.json({ error: e instanceof Error ? e.message : 'Unexpected error' }, { status: 500 });
    resp.headers.set('Cache-Control', 'no-store, max-age=0');
    return resp;
  }
}

