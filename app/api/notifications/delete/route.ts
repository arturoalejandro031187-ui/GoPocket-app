import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function getBearerToken(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

type Body = {
  ids?: string[];
  all?: boolean;
};

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: 'Missing Authorization Bearer token' }, { status: 401 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
    const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    if (!supabaseUrl || !supabaseAnon) return NextResponse.json({ error: 'Supabase env vars missing on server' }, { status: 500 });

    // Validar token (usuario)
    const supabase = createClient(supabaseUrl, supabaseAnon, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr) return NextResponse.json({ error: userErr.message }, { status: 401 });
    if (!userData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const uid = userData.user.id;
    const body = (await req.json().catch(() => ({}))) as Partial<Body>;
    const all = Boolean(body?.all);
    const rawIds = Array.isArray(body?.ids) ? body!.ids! : [];
    const ids = rawIds.map(String).map((x) => x.trim()).filter(Boolean);

    if (!all && ids.length === 0) return NextResponse.json({ error: 'ids o all requerido.' }, { status: 400 });

    // Usar SIEMPRE el admin client para evitar problemas de RLS
    // El admin client tiene permisos completos y puede eliminar sin restricciones
    let db: any = null;
    try {
      db = supabaseAdmin();
      console.log('[DELETE API] ✅ Usando supabaseAdmin() para eliminación (bypass RLS)');
      
      // Verificar que el admin client funciona haciendo una consulta de prueba
      const testQuery: any = await db
        .from('notifications')
        .select('id')
        .eq('user_id', uid)
        .limit(1);
      
      if (testQuery?.error) {
        console.error('[DELETE API] ❌ Error al verificar admin client:', testQuery.error);
        return NextResponse.json({ 
          error: `Error de configuración: ${testQuery.error.message || 'No se pudo acceder a la base de datos'}` 
        }, { status: 500 });
      }
      
      console.log('[DELETE API] ✅ Admin client verificado correctamente');
    } catch (adminErr: any) {
      console.error('[DELETE API] ❌ Error al obtener supabaseAdmin():', adminErr);
      return NextResponse.json({ 
        error: `Error de configuración del servidor: ${adminErr.message || 'No se pudo obtener el cliente admin'}. Verifica que SUPABASE_SERVICE_ROLE_KEY esté configurada.` 
      }, { status: 500 });
    }

    const BATCH_SIZE = 40;

    if (all) {
      // Eliminar TODAS las notificaciones NO LEÍDAS del usuario
      // Usar admin client para bypass RLS y asegurar eliminación permanente
      
      console.log('[DELETE API] Eliminando TODAS las notificaciones no leídas del usuario:', uid);
      
      // Primero obtener TODAS las notificaciones del usuario para diagnóstico
      const allNotifs: any = await db
        .from('notifications')
        .select('id,is_read')
        .eq('user_id', uid)
        .limit(5000);
      
      const allNotifsList = Array.isArray(allNotifs?.data) ? allNotifs.data : [];
      const unreadIds = allNotifsList
        .filter((n: any) => n?.is_read === false)
        .map((n: any) => n?.id)
        .filter(Boolean);
      
      const nullIds = allNotifsList
        .filter((n: any) => n?.is_read === null || n?.is_read === undefined)
        .map((n: any) => n?.id)
        .filter(Boolean);
      
      console.log('[DELETE API] Diagnóstico:', {
        total: allNotifsList.length,
        unread: unreadIds.length,
        nullState: nullIds.length,
        unreadIds: unreadIds.slice(0, 10),
        nullIds: nullIds.slice(0, 10)
      });
      
      // Primero contar cuántas hay antes de eliminar (solo is_read = false explícito)
      const countBefore: any = await db
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', uid)
        .eq('is_read', false);
      
      const countBeforeNum = !countBefore?.error ? Number(countBefore?.count ?? 0) : 0;
      console.log('[DELETE API] Notificaciones no leídas antes de eliminar:', countBeforeNum);
      
      // Si hay notificaciones con is_read = NULL, también eliminarlas (estado inconsistente)
      if (nullIds.length > 0) {
        console.log('[DELETE API] Eliminando notificaciones con is_read = NULL (estado inconsistente):', nullIds.length);
        const delNull: any = await db
          .from('notifications')
          .delete()
          .eq('user_id', uid)
          .is('is_read', null)
          .select('*');
        console.log('[DELETE API] Eliminadas con NULL:', Array.isArray(delNull?.data) ? delNull.data.length : 0);
      }
      
      // Intentar eliminar con delete directo usando admin client (solo is_read = false)
      let del: any = await db
        .from('notifications')
        .delete()
        .eq('user_id', uid)
        .eq('is_read', false)
        .select('*');
      
      // Si falla, intentar sin filtro is_read (por si la columna no existe o tiene otro nombre)
      if (del?.error) {
        const code = String((del.error as any)?.code || '');
        const msg = String((del.error as any)?.message || '').toLowerCase();
        
        if (code === '42P01' || msg.includes('does not exist') || msg.includes('relation') || code === 'PGRST106') {
          const r = NextResponse.json({ ok: true, deleted: 0, remaining: 0, table_missing: true });
          r.headers.set('Cache-Control', 'no-store, max-age=0');
          return r;
        }
        
        // Si falla por columna is_read, intentar sin ese filtro (eliminar todas)
        if (code === '42703' || msg.includes('column') || msg.includes('is_read')) {
          console.log('[DELETE API] Columna is_read no encontrada, eliminando todas las notificaciones...');
          del = await db
            .from('notifications')
            .delete()
            .eq('user_id', uid)
            .select('*');
        }
      }
      
      // Si aún falla, intentar con función RPC
      if (del?.error) {
        const code = String((del.error as any)?.code || '');
        const msg = String((del.error as any)?.message || '').toLowerCase();
        
        console.log('[DELETE API] Error con delete directo, intentando con función RPC...');
        try {
          // Intentar primero con función específica para no leídas
          let rpcResult: any = null;
          
          try {
            rpcResult = await db.rpc('delete_my_unread_notifications', {});
            if (rpcResult && !rpcResult.error) {
              const deleted = Number(rpcResult.data || 0);
              console.log('[DELETE API] ✅ Eliminación exitosa usando delete_my_unread_notifications:', deleted);
              
              // Verificar que realmente se eliminaron
              await new Promise((r) => setTimeout(r, 800));
              const verify: any = await db
                .from('notifications')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', uid)
                .eq('is_read', false);
              
              const remaining = !verify?.error ? Number(verify?.count ?? 0) : 0;
              
              const resp = NextResponse.json({ 
                ok: true, 
                deleted, 
                remaining,
                requested: 'all', 
                message: `${deleted} notificaciones eliminadas${remaining > 0 ? `, ${remaining} aún permanecen` : ''}.` 
              });
              resp.headers.set('Cache-Control', 'no-store, max-age=0');
              return resp;
            }
          } catch (rpcErr1) {
            console.log('[DELETE API] delete_my_unread_notifications no disponible, intentando delete_all_user_notifications...');
          }
          
          // Si no funciona, intentar con delete_all_user_notifications
          rpcResult = await db.rpc('delete_all_user_notifications', {
            p_user_id: uid
          });
          
          if (rpcResult && !rpcResult.error) {
            const deleted = Number(rpcResult.data || 0);
            console.log('[DELETE API] ✅ Eliminación exitosa usando delete_all_user_notifications:', deleted);
            
            // Verificar que realmente se eliminaron
            await new Promise((r) => setTimeout(r, 800));
            const verify: any = await db
              .from('notifications')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', uid)
              .eq('is_read', false);
            
            const remaining = !verify?.error ? Number(verify?.count ?? 0) : 0;
            
            const resp = NextResponse.json({ 
              ok: true, 
              deleted, 
              remaining,
              requested: 'all', 
              message: `${deleted} notificaciones eliminadas${remaining > 0 ? `, ${remaining} aún permanecen` : ''}.` 
            });
            resp.headers.set('Cache-Control', 'no-store, max-age=0');
            return resp;
          } else {
            console.error('[DELETE API] Error en función RPC:', rpcResult?.error);
          }
        } catch (rpcErr) {
          console.error('[DELETE API] Error en función RPC:', rpcErr);
        }
        
        return NextResponse.json({ 
          error: `No se pudo eliminar. Ejecuta ELIMINAR_MIS_NOTIFICACIONES.sql en Supabase. Error: ${(del.error as any)?.message || 'Error desconocido'}` 
        }, { status: 400 });
      }
      
      const verifiedDeleted = Array.isArray(del?.data) ? del.data.length : 0;
      console.log('[DELETE API] Eliminadas directamente:', verifiedDeleted);
      
      // Esperar un momento para que la eliminación se propague
      await new Promise((r) => setTimeout(r, 800));
      
      // Verificar que realmente se eliminaron (múltiples intentos)
      let remaining = countBeforeNum;
      for (let attempt = 0; attempt < 3; attempt++) {
        await new Promise((r) => setTimeout(r, 300 + (attempt * 200)));
        
        const verify: any = await db
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', uid)
          .eq('is_read', false);
        
        remaining = !verify?.error ? Number(verify?.count ?? 0) : countBeforeNum;
        
        if (remaining === 0) {
          break; // Todas eliminadas, salir del loop
        }
        
        console.log(`[DELETE API] Intento ${attempt + 1}: Aún quedan ${remaining} notificaciones`);
        
        // Si aún quedan, intentar eliminarlas de nuevo
        if (remaining > 0 && attempt < 2) {
          const retryDel: any = await db
            .from('notifications')
            .delete()
            .eq('user_id', uid)
            .eq('is_read', false)
            .select('*');
          
          if (!retryDel?.error && Array.isArray(retryDel?.data)) {
            const retryDeleted = retryDel.data.length;
            console.log(`[DELETE API] Reintento ${attempt + 1}: ${retryDeleted} notificaciones eliminadas`);
          }
        }
      }
      
      const finalDeleted = Math.max(verifiedDeleted, countBeforeNum - remaining);
      
      console.log('[DELETE API] Verificación final:', { 
        countBefore: countBeforeNum,
        deleted: finalDeleted, 
        remaining,
        success: remaining === 0
      });
      
      const resp = NextResponse.json({ 
        ok: true, 
        deleted: finalDeleted, 
        remaining,
        requested: 'all', 
        message: `${finalDeleted} notificaciones eliminadas${remaining > 0 ? `, ${remaining} aún permanecen` : ''}.` 
      });
      resp.headers.set('Cache-Control', 'no-store, max-age=0');
      return resp;
    }

    const safeIds = ids.slice(0, clamp(ids.length, 0, 500)).map((x) => String(x).trim()).filter(Boolean);
    if (safeIds.length === 0) {
      return NextResponse.json({ error: 'No hay IDs válidos para eliminar.' }, { status: 400 });
    }

    const check: any = await db
      .from('notifications')
      .select('id')
      .eq('user_id', uid)
      .in('id', safeIds);
    if (check?.error) {
      return NextResponse.json({ error: `Error al verificar: ${(check.error as any)?.message || 'Error desconocido'}` }, { status: 400 });
    }
    const foundIds = Array.isArray(check?.data)
      ? (check.data as any[]).map((r: any) => String(r?.id ?? '').trim()).filter(Boolean)
      : [];
    if (foundIds.length === 0) {
      const r = NextResponse.json({ ok: true, deleted: 0, message: 'No se encontraron notificaciones para eliminar.' });
      r.headers.set('Cache-Control', 'no-store, max-age=0');
      return r;
    }

    let totalDeleted = 0;
    for (let i = 0; i < foundIds.length; i += BATCH_SIZE) {
      const batch = foundIds.slice(i, i + BATCH_SIZE);
      console.log('[DELETE API] Eliminando batch:', { batch, batchSize: batch.length, userId: uid });
      
      // Usar DELETE directo con supabaseAdmin para asegurar eliminación permanente
      const del: any = await db
        .from('notifications')
        .delete()
        .eq('user_id', uid)
        .in('id', batch)
        .select('*');
      
      console.log('[DELETE API] Resultado del delete:', { 
        error: del?.error, 
        dataLength: Array.isArray(del?.data) ? del.data.length : 0,
        deletedIds: Array.isArray(del?.data) ? del.data.map((r: any) => r?.id) : []
      });
      
      if (del?.error) {
        const code = String((del.error as any)?.code || '');
        const msg = String((del.error as any)?.message || '').toLowerCase();
        console.error('[DELETE API] Error al eliminar con delete directo:', { code, msg, error: del.error });
        
        if (code === '42P01' || msg.includes('does not exist') || msg.includes('relation') || code === 'PGRST106') {
          const r = NextResponse.json({ ok: true, deleted: totalDeleted, table_missing: true });
          r.headers.set('Cache-Control', 'no-store, max-age=0');
          return r;
        }
        
        // Si hay error de permisos o cualquier otro error, intentar con función RPC
        if (code === '42501' || msg.includes('permission') || msg.includes('policy') || del?.error) {
          console.log('[DELETE API] Intentando eliminación con función RPC delete_user_notifications...');
          try {
            const sqlResult: any = await db.rpc('delete_user_notifications', {
              p_user_id: uid,
              p_notification_ids: batch
            });
            
            if (sqlResult && !sqlResult.error) {
              const deleted = Number(sqlResult.data || 0);
              if (deleted > 0) {
                console.log('[DELETE API] ✅ Eliminación exitosa usando función RPC:', deleted);
                totalDeleted += deleted;
                continue;
              } else {
                console.warn('[DELETE API] ⚠️ La función RPC retornó 0 eliminadas. Puede que ya no existan.');
                // Continuar aunque sea 0, puede que ya estén eliminadas
                continue;
              }
            } else {
              console.error('[DELETE API] ❌ Error en función RPC:', sqlResult?.error);
            }
          } catch (sqlErr: any) {
            console.error('[DELETE API] ❌ Excepción al llamar función RPC:', sqlErr);
          }
          
          // Si llegamos aquí y aún hay error, reportarlo
          return NextResponse.json({ 
            error: `No se pudo eliminar. Ejecuta RECONSTRUIR_SISTEMA_NOTIFICACIONES.sql en Supabase. Error: ${(del.error as any)?.message || 'Error desconocido'}` 
          }, { status: 400 });
        }
        
        return NextResponse.json({ error: `Error al eliminar: ${(del.error as any)?.message || 'Error desconocido'}` }, { status: 400 });
      }
      totalDeleted += Array.isArray(del?.data) ? del.data.length : 0;
    }

    // Verificar que realmente se eliminaron (con múltiples intentos y métodos alternativos)
    let remaining = foundIds.length;
    let verifiedDeleted = totalDeleted;
    
    // Esperar un momento para que la eliminación se propague
    await new Promise((r) => setTimeout(r, 500));
    
    for (let attempt = 0; attempt < 5; attempt++) {
      await new Promise((r) => setTimeout(r, 300 + (attempt * 200)));
      
      // Verificar con admin client
      const verify: any = await db
        .from('notifications')
        .select('id')
        .eq('user_id', uid)
        .in('id', foundIds);
      
      remaining = !verify?.error && Array.isArray(verify?.data) ? verify.data.length : foundIds.length;
      
      if (remaining === 0) {
        verifiedDeleted = foundIds.length;
        break; // Todas eliminadas, salir del loop
      }
      
      // Si aún quedan, intentar eliminarlas con función RPC
      if (remaining > 0 && attempt < 4) {
        try {
          const remainingIds = Array.isArray(verify?.data) 
            ? verify.data.map((x: any) => x?.id).filter(Boolean)
            : foundIds;
          
          if (remainingIds.length > 0) {
            console.log(`[DELETE API] Intento ${attempt + 1}: Intentando eliminar ${remainingIds.length} notificaciones restantes con RPC...`);
            
            const rpcResult: any = await db.rpc('delete_user_notifications', {
              p_user_id: uid,
              p_notification_ids: remainingIds
            });
            
            if (rpcResult && !rpcResult.error) {
              const rpcDeleted = Number(rpcResult.data || 0);
              console.log(`[DELETE API] Intento ${attempt + 1}: Función RPC eliminó ${rpcDeleted} notificaciones`);
              verifiedDeleted += rpcDeleted;
              
              // Si la función RPC eliminó todas, salir del loop
              if (rpcDeleted >= remainingIds.length) {
                remaining = 0;
                break;
              }
            } else {
              console.error(`[DELETE API] Error en RPC intento ${attempt + 1}:`, rpcResult?.error);
            }
          }
        } catch (rpcErr) {
          console.error(`[DELETE API] Error en intento ${attempt + 1} con RPC:`, rpcErr);
        }
      }
    }
    
    // Verificación final con delay adicional
    await new Promise((r) => setTimeout(r, 500));
    const finalVerify: any = await db
      .from('notifications')
      .select('id')
      .eq('user_id', uid)
      .in('id', foundIds);
    
    const finalRemaining = !finalVerify?.error && Array.isArray(finalVerify?.data) 
      ? finalVerify.data.length 
      : 0;
    
    verifiedDeleted = Math.max(verifiedDeleted, foundIds.length - finalRemaining);
    
    console.log('[DELETE API] Verificación final:', { 
      foundIds: foundIds.length, 
      finalRemaining, 
      verifiedDeleted,
      success: finalRemaining === 0,
      remainingIds: finalRemaining > 0 && Array.isArray(finalVerify?.data) 
        ? finalVerify.data.map((x: any) => x?.id).slice(0, 5) 
        : []
    });

    const resp = NextResponse.json({
      ok: true,
      deleted: verifiedDeleted,
      requested: ids.length,
      remaining: finalRemaining,
      message: verifiedDeleted > 0 
        ? `${verifiedDeleted} notificaciones eliminadas${finalRemaining > 0 ? `, ${finalRemaining} aún permanecen` : ''}.` 
        : 'No se eliminaron notificaciones.',
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
