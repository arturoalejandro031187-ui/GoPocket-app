import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const section = req.nextUrl.searchParams.get('section') || 'all';
    const now = new Date();
    const nowISO = now.toISOString();

    // Obtener mensajes activos para la sección actual
    // IMPORTANTE: Filtrar por is_active=true, sección, y rango de fechas
    // Un mensaje está activo si:
    // 1. is_active = true
    // 2. section = 'all' o section = sección actual
    // 3. starts_at <= ahora
    // 4. ends_at es NULL o ends_at >= ahora
    
    const { data: allMessages, error: fetchError } = await supabaseAdmin()
      .from('admin_floating_messages')
      .select('*')
      .eq('is_active', true)
      .or(`section.eq.all,section.eq.${section}`)
      .order('created_at', { ascending: false });

    if (fetchError) {
      console.error('[FLOATING MESSAGES ACTIVE] Error al obtener mensajes:', fetchError);
      throw fetchError;
    }

    console.log(`[FLOATING MESSAGES ACTIVE] Sección: ${section}, Mensajes encontrados: ${allMessages?.length || 0}`);

    // Filtrar por rango de fechas en memoria (más confiable que múltiples .or() en Supabase)
    const messages = (allMessages || []).filter((m: any) => {
      try {
        const startsAt = new Date(m.starts_at);
        const endsAt = m.ends_at ? new Date(m.ends_at) : null;
        
        // Validar que las fechas sean válidas
        if (isNaN(startsAt.getTime())) {
          console.warn(`[FLOATING MESSAGES ACTIVE] Fecha de inicio inválida para mensaje ${m.id}: ${m.starts_at}`);
          return false;
        }
        
        if (endsAt && isNaN(endsAt.getTime())) {
          console.warn(`[FLOATING MESSAGES ACTIVE] Fecha de fin inválida para mensaje ${m.id}: ${m.ends_at}`);
          return false;
        }
        
        // Debe haber iniciado (starts_at <= ahora)
        if (startsAt > now) {
          console.log(`[FLOATING MESSAGES ACTIVE] Mensaje ${m.id} aún no inicia: ${startsAt.toISOString()} > ${nowISO}`);
          return false;
        }
        
        // Si tiene fecha de fin, no debe haber expirado (ends_at >= ahora)
        if (endsAt && endsAt < now) {
          console.log(`[FLOATING MESSAGES ACTIVE] Mensaje ${m.id} ya expiró: ${endsAt.toISOString()} < ${nowISO}`);
          return false;
        }
        
        console.log(`[FLOATING MESSAGES ACTIVE] Mensaje ${m.id} es vigente`);
        return true;
      } catch (err) {
        console.error(`[FLOATING MESSAGES ACTIVE] Error al procesar mensaje ${m.id}:`, err);
        return false;
      }
    });
    
    console.log(`[FLOATING MESSAGES ACTIVE] Mensajes vigentes después de filtrar: ${messages.length}`);

    // Obtener el usuario actual para filtrar mensajes cerrados
    const authHeader = req.headers.get('authorization');
    let closedMessageIds: string[] = [];

    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
        const supabase = createClient(supabaseUrl, supabaseKey, {
          global: { headers: { Authorization: authHeader } },
        });

        const { data: userData } = await supabase.auth.getUser();
        if (userData.user) {
          const { data: closed } = await supabaseAdmin()
            .from('user_closed_messages')
            .select('message_id')
            .eq('user_id', userData.user.id);

          closedMessageIds = (closed || []).map((c) => c.message_id);
        }
      } catch (err) {
        // Si hay error obteniendo el usuario, simplemente no filtrar
        console.warn('[FLOATING MESSAGES ACTIVE] Error obteniendo usuario:', err);
      }
    }

    // Filtrar mensajes cerrados por el usuario
    let activeMessages = (messages || []).filter((m) => !closedMessageIds.includes(m.id));

    // Filtrar por usuarios específicos si el mensaje tiene target_user_ids
    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
        const supabase = createClient(supabaseUrl, supabaseKey, {
          global: { headers: { Authorization: authHeader } },
        });

        const { data: userData } = await supabase.auth.getUser();
        if (userData.user) {
          activeMessages = activeMessages.filter((m: any) => {
            // Si el mensaje tiene usuarios específicos, verificar que el usuario actual esté en la lista
            if (m.target_user_ids && Array.isArray(m.target_user_ids) && m.target_user_ids.length > 0) {
              return m.target_user_ids.includes(userData.user.id);
            }
            // Si no tiene usuarios específicos, mostrar a todos
            return true;
          });
        }
      } catch (err) {
        console.warn('[FLOATING MESSAGES ACTIVE] Error al filtrar por usuarios:', err);
      }
    }

    console.log(`[FLOATING MESSAGES ACTIVE] Mensajes finales (después de filtrar cerrados y usuarios): ${activeMessages.length}`);
    
    const resp = NextResponse.json({ messages: activeMessages });
    // Headers para evitar cache y asegurar que se respeten los horarios exactos
    resp.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    resp.headers.set('Pragma', 'no-cache');
    resp.headers.set('Expires', '0');
    return resp;
  } catch (err: any) {
    console.error('[FLOATING MESSAGES ACTIVE] Error:', err);
    const resp = NextResponse.json({ error: err?.message || 'Error al cargar mensajes' }, { status: 500 });
    resp.headers.set('Cache-Control', 'no-store, max-age=0');
    return resp;
  }
}
