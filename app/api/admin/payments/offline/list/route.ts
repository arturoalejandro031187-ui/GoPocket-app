import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function getBearerToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

async function requireAdmin(req: NextRequest) {
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

  const admin = supabaseAdmin();
  const { data: row, error } = await admin.from('admin_users').select('user_id').eq('user_id', userData.user.id).maybeSingle();
  if (error) return { ok: false as const, status: 400, error: error.message };
  if (!row) return { ok: false as const, status: 403, error: 'No autorizado (admin requerido).' };

  return { ok: true as const, admin, requesterId: userData.user.id };
}

export async function GET(req: NextRequest) {
  try {
    const guard = await requireAdmin(req);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
    const { admin } = guard;

    const status = String(req.nextUrl.searchParams.get('status') || '').trim();
    const limit = Math.max(1, Math.min(500, Number(req.nextUrl.searchParams.get('limit') || 200)));

    console.log('[ADMIN OFFLINE LIST] Iniciando carga de pagos offline...', { status, limit });

    // Intentar incluir paid_confirmed_at y paid_confirmed_by_name (si existen en tu schema)
    const selectFull =
      'id,buyer_id,order_ids,payment_method,status,amount,reference_code,created_at,payment_proof_url,payment_proof_uploaded_at,paid_confirmed_at,paid_confirmed_by_name';
    const selectBase =
      'id,buyer_id,order_ids,payment_method,status,amount,reference_code,created_at,payment_proof_url,payment_proof_uploaded_at';

    // CRÍTICO: Primero verificar cuántas sesiones hay sin filtro
    const countRes: any = await admin
      .from('checkout_sessions')
      .select('id', { count: 'exact', head: true })
      .in('payment_method', ['bank_transfer', 'bank_deposit', 'oxxo', 'mercadopago']);
    
    console.log('[ADMIN OFFLINE LIST] Total sesiones en BD:', countRes.count);

    let q: any = admin
      .from('checkout_sessions')
      .select(selectFull)
      .in('payment_method', ['bank_transfer', 'bank_deposit', 'oxxo', 'mercadopago'])
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status) {
      q = q.eq('status', status);
      console.log('[ADMIN OFFLINE LIST] Filtrando por status:', status);
    }

    // CRÍTICO: Si el filtro es 'pending' (o vacío), TAMBIÉN buscar sesiones 'paid' de MercadoPago recientes que podrían tener inconsistencias
    // Esto asegura que aparezcan en la lista para poder sincronizarlas
    let inconsistencies: any[] = [];
    if (!status || status === 'pending') {
      try {
        const { data: potentialInconsistencies } = await admin
          .from('checkout_sessions')
          .select(selectBase)
          .eq('payment_method', 'mercadopago')
          .eq('status', 'paid')
          .order('created_at', { ascending: false })
          .limit(20); // Revisar las últimas 20 pagadas por si acaso
          
        if (potentialInconsistencies && potentialInconsistencies.length > 0) {
           inconsistencies = potentialInconsistencies;
        }
      } catch (e) {
        console.error('Error buscando inconsistencias:', e);
      }
    }

    let res: any = await q;
    if (res.error) {
      const code = String((res.error as any)?.code || '');
      const msg = String((res.error as any)?.message || '').toLowerCase();
      if (code === '42703' || msg.includes('column')) {
        // Fallback si no existe paid_confirmed_at
        q = admin
          .from('checkout_sessions')
          .select(selectBase)
          .in('payment_method', ['bank_transfer', 'bank_deposit', 'oxxo', 'mercadopago'])
          .order('created_at', { ascending: false })
          .limit(limit);
        if (status) q = q.eq('status', status);
        res = await q;
      }
    }
    if (res.error) {
      console.error('[ADMIN OFFLINE LIST] Error cargando sesiones:', res.error);
      return NextResponse.json({ error: res.error.message }, { status: 400 });
    }

    let sessions = ((res.data as any[]) ?? []) as any[];
    
    // Fusionar inconsistencias potenciales (evitando duplicados)
    if (inconsistencies.length > 0) {
        const existingIds = new Set(sessions.map(s => s.id));
        const newCandidates = inconsistencies.filter(i => !existingIds.has(i.id));
        // Marcar temporalmente para verificar después
        newCandidates.forEach(c => c._check_inconsistency = true);
        sessions = [...sessions, ...newCandidates];
    }

    console.log(`[ADMIN OFFLINE LIST] Sesiones encontradas (incluyendo candidatos): ${sessions.length}`, {
      total_in_db: countRes.count,
      filtered_by_status: status || 'ninguno',
      sample_ids: sessions.slice(0, 3).map((s: any) => ({ 
        id: s?.id, 
        status: s?.status, 
        payment_method: s?.payment_method,
        reference_code: s?.reference_code,
        created_at: s?.created_at,
        order_ids_count: Array.isArray(s?.order_ids) ? s.order_ids.length : 0,
      })),
    });
    
    // CRÍTICO: Verificar que las sesiones tienen order_ids
    const sessionsWithoutOrderIds = sessions.filter((s: any) => {
      const orderIds = ((s as any)?.order_ids as any[]) ?? [];
      return orderIds.length === 0;
    });
    
    if (sessionsWithoutOrderIds.length > 0) {
      console.warn('[ADMIN OFFLINE LIST] ⚠️ ADVERTENCIA: Hay sesiones sin order_ids:', {
        count: sessionsWithoutOrderIds.length,
        sessions: sessionsWithoutOrderIds.map((s: any) => ({
          id: s?.id,
          status: s?.status,
          payment_method: s?.payment_method,
        })),
      });
    }

    // ENRIQUECIMIENTO: Cargar info básica de las órdenes para detectar inconsistencias (Sesión Paid / Orden Pending)
    try {
      const allOrderIds = Array.from(new Set(sessions.flatMap((s: any) => (s?.order_ids as any[]) || [])));
      if (allOrderIds.length > 0) {
        // Loteamos de 200 en 200 por si son muchas
        const chunkSize = 200;
        let fetchedOrders: any[] = [];
        
        for (let i = 0; i < allOrderIds.length; i += chunkSize) {
          const chunk = allOrderIds.slice(i, i + chunkSize);
          const { data: chunkOrders, error: chunkErr } = await admin
            .from('orders')
            .select('id,status,total,payment_method,shipping_address')
            .in('id', chunk);
            
          if (!chunkErr && chunkOrders) {
            fetchedOrders = [...fetchedOrders, ...chunkOrders];
          }
        }
        
        // Obtener items de las órdenes para enriquecer con producto
        const foundOrderIds = fetchedOrders.map((o: any) => o.id);
        let itemsMap = new Map<string, any>();
        
        if (foundOrderIds.length > 0) {
            const { data: items } = await admin
                .from('order_items')
                .select('order_id,listing_id,title,listings(slug)')
                .in('order_id', foundOrderIds);
            
            if (items) {
                items.forEach((item: any) => {
                    // Guardar el primer item encontrado para cada orden
                    if (!itemsMap.has(item.order_id)) {
                        itemsMap.set(item.order_id, {
                            title: item.title,
                            listing_id: item.listing_id,
                            slug: item.listings?.slug
                        });
                    }
                });
            }
        }

        // Mapear órdenes a sesiones
        const ordersMap = new Map(fetchedOrders.map((o: any) => [o.id, o]));
        
        sessions.forEach((s: any) => {
          const sOrderIds = (s?.order_ids as any[]) || [];
          s.orders_data = sOrderIds.map((oid: string) => ordersMap.get(oid)).filter(Boolean);
          
          // Enriquecer con datos del primer producto y snapshot del usuario
          if (s.orders_data.length > 0) {
            const first = s.orders_data[0];
            
            // Intentar obtener datos del producto desde el mapa de items
            const itemData = itemsMap.get(first.id);
            if (itemData) {
               s.first_product_title = itemData.title;
               s.first_product_id = itemData.listing_id;
               s.first_product_slug = itemData.slug;
            }
            
            // Snapshot del comprador desde la dirección de envío (si existe)
            if (first.shipping_address) {
                const sa = first.shipping_address;
                const name = sa.name || sa.full_name || (sa.first_name ? `${sa.first_name} ${sa.last_name || ''}` : null);
                if (name) s.buyer_name_snapshot = name.trim();
                
                if (sa.email) s.buyer_email_snapshot = sa.email;
                if (sa.phone) s.buyer_phone_snapshot = sa.phone;
            }
          }

          // Flag de inconsistencia: Sesión pagada pero órdenes no pagadas
          if (s.status === 'paid') {
             const hasPendingOrders = s.orders_data.some((o: any) => o.status !== 'paid' && o.status !== 'shipped' && o.status !== 'delivered' && o.status !== 'completed');
             if (hasPendingOrders) {
               s.inconsistency = 'paid_session_pending_orders';
             }
          }
        });
      }
    } catch (enrichErr) {
      console.error('[ADMIN OFFLINE LIST] Error enriqueciendo órdenes:', enrichErr);
    }

    // Filtrar candidatos que no resultaron tener inconsistencias
    sessions = sessions.filter(s => {
        if (s._check_inconsistency) {
            // Solo mantener si se confirmó la inconsistencia
            return s.inconsistency === 'paid_session_pending_orders';
        }
        return true; // Mantener los que venían por filtro normal
    });

    // CRÍTICO: Buscar órdenes offline que NO tienen sesión de checkout
    // Esto puede pasar si hubo un error al crear la sesión o si se crearon órdenes directamente
    console.log('[ADMIN OFFLINE LIST] Buscando órdenes sin sesión de checkout...');
    const allOrderIdsFromSessions = new Set(
      sessions.flatMap((s) => {
        const orderIds = ((s as any)?.order_ids as any[]) ?? [];
        return orderIds.map((x) => String(x || '').trim()).filter(Boolean);
      }),
    );
    
    console.log('[ADMIN OFFLINE LIST] Order IDs en sesiones:', {
      total_sessions: sessions.length,
      total_order_ids: allOrderIdsFromSessions.size,
      order_ids: Array.from(allOrderIdsFromSessions).slice(0, 10),
    });

    // Buscar órdenes con payment_method offline que no están en ninguna sesión
    // CRÍTICO: Buscar TODAS las órdenes offline pendientes de pago, sin restricción de tiempo
    // Solo usamos el estado válido del enum: 'pending_payment'
    let orphanOrders: any[] = [];
    try {
      const ordersQuery: any = admin
        .from('orders')
        .select('id,buyer_id,payment_method,status,total,commission_fee,shipping_fee,shipping_option_id,created_at')
        .in('payment_method', ['bank_transfer', 'bank_deposit', 'oxxo', 'mercadopago'])
        .eq('status', 'pending_payment')
        .order('created_at', { ascending: false })
        .limit(500); // Buscar TODAS las órdenes huérfanas sin restricción de tiempo

      const ordersRes: any = await ordersQuery;
      console.log('[ADMIN OFFLINE LIST] Órdenes offline encontradas en BD:', {
        total: ordersRes.data ? (ordersRes.data as any[]).length : 0,
        error: ordersRes.error,
      });
      
      if (!ordersRes.error && Array.isArray(ordersRes.data)) {
        orphanOrders = ordersRes.data.filter((o: any) => {
          const orderId = String(o?.id || '').trim();
          const isOrphan = orderId && !allOrderIdsFromSessions.has(orderId);
          if (isOrphan) {
            console.log('[ADMIN OFFLINE LIST] ⚠️ Orden huérfana detectada:', {
              order_id: orderId,
              payment_method: o?.payment_method,
              status: o?.status,
              created_at: o?.created_at,
            });
          }
          return isOrphan;
        });
        console.log(`[ADMIN OFFLINE LIST] Órdenes huérfanas encontradas: ${orphanOrders.length}`, {
          sample: orphanOrders.slice(0, 3).map((o: any) => ({
            id: o?.id,
            payment_method: o?.payment_method,
            status: o?.status,
            created_at: o?.created_at,
          })),
        });
      } else if (ordersRes.error) {
        console.error('[ADMIN OFFLINE LIST] Error buscando órdenes huérfanas:', ordersRes.error);
      }
    } catch (orphanErr) {
      console.warn('[ADMIN OFFLINE LIST] Error buscando órdenes huérfanas:', orphanErr);
    }

    // Crear sesiones virtuales para órdenes huérfanas
    const virtualSessions = orphanOrders.map((o: any) => {
      const orderId = String(o?.id || '').trim();
      return {
        id: `virtual-${orderId}`,
        buyer_id: String(o?.buyer_id || ''),
        order_ids: [orderId],
        payment_method: String(o?.payment_method || ''),
        status: 'pending',
        amount: typeof o?.total === 'number' ? o.total : Number(o?.total ?? 0) || 0,
        reference_code: null,
        created_at: o?.created_at || new Date().toISOString(),
        payment_proof_url: null,
        payment_proof_uploaded_at: null,
        paid_confirmed_at: null,
        paid_confirmed_by_name: null,
        _is_virtual: true, // Marca para identificar sesiones virtuales
        _needs_sync: true, // Indica que necesita crear sesión real
      };
    });

    // Combinar sesiones reales y virtuales
    const allSessions = [...sessions, ...virtualSessions];

    // Enriquecer con órdenes + primer producto (listing_id/title) + breakdown (comisión/envío/neto)
    const allOrderIds = Array.from(
      new Set(
        allSessions
          .flatMap((s) => (((s as any)?.order_ids as any[]) ?? []) as any[])
          .map((x) => String(x || '').trim())
          .filter(Boolean),
      ),
    );

    const ordersById: Record<
      string,
      { id: string; total: number; commission_fee: number; shipping_fee: number; shipping_option_id?: string | null; shipping_carrier?: string | null; created_at?: string | null }
    > = {};

    if (allOrderIds.length > 0) {
      const oRes: any = await admin
        .from('orders')
        .select('id,total,commission_fee,shipping_fee,shipping_option_id,shipping_carrier,created_at')
        .in('id', allOrderIds)
        .limit(5000);
      if (!oRes.error && Array.isArray(oRes.data)) {
        for (const o of oRes.data as any[]) {
          const id = String(o?.id || '').trim();
          if (!id) continue;
          ordersById[id] = {
            id,
            total: typeof o?.total === 'number' ? o.total : Number(o?.total ?? 0) || 0,
            commission_fee: typeof o?.commission_fee === 'number' ? o.commission_fee : Number(o?.commission_fee ?? 0) || 0,
            shipping_fee: typeof o?.shipping_fee === 'number' ? o.shipping_fee : Number(o?.shipping_fee ?? 0) || 0,
            shipping_option_id: o?.shipping_option_id,
            shipping_carrier: o?.shipping_carrier,
            created_at: (o?.created_at as string | undefined) ?? null,
          };
        }
      }
    }

    const firstProductByOrderId: Record<string, { listing_id?: string | null; title?: string | null }> = {};
    const productsByOrderId: Record<string, { listing_id?: string | null; title?: string | null }[]> = {};
    if (allOrderIds.length > 0) {
      // Best-effort: listing_id puede no existir en algunos schemas
      let itRes: any = await admin
        .from('order_items')
        .select('order_id,listing_id,title')
        .in('order_id', allOrderIds)
        .order('created_at', { ascending: true })
        .limit(5000);
      if (itRes?.error) {
        const code = String((itRes.error as any)?.code || '');
        const msg = String((itRes.error as any)?.message || '').toLowerCase();
        if (code === '42703' || msg.includes('column')) {
          itRes = await admin.from('order_items').select('order_id,title').in('order_id', allOrderIds).limit(5000);
        }
      }
      if (!itRes?.error && Array.isArray(itRes.data)) {
        for (const it of itRes.data as any[]) {
          const oid = String(it?.order_id || '').trim();
          if (!oid) continue;
          const p = {
            listing_id: (it as any)?.listing_id ? String((it as any).listing_id).trim() : null,
            title: (it as any)?.title ? String((it as any).title).trim() : null,
          };
          if (!productsByOrderId[oid]) productsByOrderId[oid] = [];
          productsByOrderId[oid].push(p);

          if (!firstProductByOrderId[oid]) firstProductByOrderId[oid] = p;
        }
      }
    }

    // CRÍTICO: Usar allSessions en lugar de sessions para incluir sesiones virtuales
    const enriched = allSessions.map((s) => {
      // CRÍTICO: Asegurar que orderIds siempre esté definido
      const orderIdsRaw = (s as any)?.order_ids;
      const orderIds = Array.isArray(orderIdsRaw) 
        ? orderIdsRaw.map((x: any) => String(x || '').trim()).filter(Boolean)
        : [];
      
      let commission = 0;
      let shipping = 0;
      let ordersTotal = 0;
      let hasPickup = false;
      
      // CRÍTICO: Solo procesar si hay orderIds
      if (orderIds.length > 0) {
        for (const oid of orderIds) {
          const o = ordersById[oid];
          if (!o) continue;
          ordersTotal += Number(o.total || 0) || 0;
          commission += Number(o.commission_fee || 0) || 0;
          const sFee = Number(o.shipping_fee || 0) || 0;
            if (o.shipping_option_id === 'pickup' || o.shipping_carrier === 'pickup') {
              hasPickup = true;
              // Si es pickup, asumimos envío 0 para efectos visuales del admin, 
              // corrigiendo posibles inconsistencias de datos históricos
            } else {
              shipping += sFee;
            }
        }
      }
      
      const paid = typeof (s as any)?.amount === 'number' ? (s as any).amount : Number((s as any)?.amount ?? 0) || 0;
      const net = paid - commission - shipping;

      const firstOrderId = orderIds.length > 0 ? orderIds[0] : '';
      const firstProduct = firstOrderId ? firstProductByOrderId[firstOrderId] ?? null : null;

      const productsAll: { listing_id?: string | null; title?: string | null }[] = [];
      const seenProducts = new Set<string>();
      
      // CRÍTICO: Solo procesar productos si hay orderIds
      if (orderIds.length > 0) {
        for (const oid of orderIds) {
          const ps = productsByOrderId[oid] ?? [];
          for (const p of ps) {
            const key = `${String(p?.listing_id || '').trim()}::${String(p?.title || '').trim()}`;
            if (seenProducts.has(key)) continue;
            seenProducts.add(key);
            productsAll.push(p);
          }
        }
      }

      return {
        ...s,
        orders_total: ordersTotal,
        commission_total: commission,
        shipping_total: shipping,
        net_total: net,
        first_product: firstProduct,
        orders_count: orderIds.length,
        has_pickup: hasPickup,
        products: productsAll.slice(0, 20),
        products_count: productsAll.length,
        is_virtual: Boolean((s as any)?._is_virtual),
        needs_sync: Boolean((s as any)?._needs_sync),
      };
    });

    // CRÍTICO: Verificar que virtualSessions esté definido antes de usarlo
    const virtualSessionsCount = Array.isArray(virtualSessions) ? virtualSessions.length : 0;
    const sessionsCount = Array.isArray(sessions) ? sessions.length : 0;
    console.log(`[ADMIN OFFLINE LIST] Total sesiones enriquecidas: ${enriched.length} (${sessionsCount} reales, ${virtualSessionsCount} virtuales)`);

    const resp = NextResponse.json({ ok: true, sessions: enriched });
    resp.headers.set('Cache-Control', 'no-store, max-age=0');
    return resp;
  } catch (e: unknown) {
    console.error(e);
    const resp = NextResponse.json({ error: e instanceof Error ? e.message : 'Unexpected error' }, { status: 500 });
    resp.headers.set('Cache-Control', 'no-store, max-age=0');
    return resp;
  }
}

