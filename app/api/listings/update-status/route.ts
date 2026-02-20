import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { ListingsRepository } from '@/lib/repositories/listings.repository';
import { OrdersRepository } from '@/lib/repositories/orders.repository';
import { OrderItemsRepository } from '@/lib/repositories/order-items.repository';
import { getCommissions, getPlan } from '@/lib/plans/limits';
import { notify } from '@/lib/notifications/service';
import { getUserAdminState, isSuspended } from '@/lib/userAdminState';

type Body = {
  listingId: string;
  status: 'active' | 'paused' | 'sold';
};

function getBearerToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: 'Missing Authorization Bearer token' }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as Partial<Body>;
    const listingId = String(body.listingId ?? '').trim();
    const status = body.status as Body['status'];

    if (!listingId) return NextResponse.json({ error: 'listingId is required' }, { status: 400 });
    if (!status || !['active', 'paused', 'sold'].includes(status)) {
      return NextResponse.json({ error: 'status inválido' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
    const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

    // Auth check
    const supabase = createClient(supabaseUrl, supabaseAnon, {
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr) return NextResponse.json({ error: userErr.message }, { status: 401 });
    if (!userData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const sellerId = userData.user.id;
    const admin = supabaseAdmin();
    const repo = new ListingsRepository();

    // Permissions check
    const listing = await repo.findById(listingId);
    if (!listing) return NextResponse.json({ error: 'Publicación no encontrada' }, { status: 404 });
    if (String(listing.seller_id) !== sellerId) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

    // --- Validar regla de subastas: No pausar activas ---
    const saleType = String(listing.sale_type || 'direct');
    if (saleType === 'auction' && status === 'paused') {
      const endAt = listing.auction_end_at ? Date.parse(listing.auction_end_at) : NaN;
      if (Number.isFinite(endAt) && Date.now() < endAt) {
        return NextResponse.json({ error: 'No puedes pausar una subasta activa.' }, { status: 400 });
      }
    }

    // --- LOGICA DE SUBASTA: Si se marca como SOLD, crear orden si falta ---
    if (status === 'sold' && (listing as any).sale_type === 'auction') {
      const winnerId = (listing as any).auction_highest_bidder_id;
      const highestBid = Number((listing as any).auction_highest_bid || 0);

      if (winnerId && highestBid > 0) {
        // Verificar si ya existe orden
        const { data: existingItems } = await admin
          .from('order_items')
          .select('order_id')
          .eq('listing_id', listingId)
          .limit(1);

        if (!existingItems || existingItems.length === 0) {
          console.log(`[update-status] Creando orden faltante para subasta ${listingId}`);
          try {
            const ordersRepo = new OrdersRepository();
            const orderItemsRepo = new OrderItemsRepository();

            // Calcular comisiones desde BD (respeta configuración del panel admin)
            const plan = await getPlan(admin, sellerId);
            const commissions = await getCommissions(admin);
            const commissionRate = plan === 'basic' ? commissions.basic : plan === 'pro' ? commissions.pro : commissions.platinum;
            const commissionFee = Math.round((highestBid * commissionRate) / 100 * 100) / 100;

            const isSellerShipping = Boolean((listing as any).shipping_by_seller);
            const isFreeShipping = Boolean((listing as any).free_shipping);
            const customShippingPrice = Number((listing as any).shipping_price || 0);
            let shippingFee = 0;
            if (isSellerShipping && !isFreeShipping && customShippingPrice > 0) {
              shippingFee = customShippingPrice;
            }

            // Crear orden
            const order = await ordersRepo.create({
              buyer_id: winnerId,
              seller_id: sellerId,
              payment_method: 'mercadopago',
              status: 'pending_payment',
              subtotal: highestBid,
              shipping_fee: shippingFee,
              commission_fee: commissionFee,
              total: highestBid + shippingFee,
              shipping_option_id: (listing as any).shipping_option_id || null,
            });

            // Crear items
            await orderItemsRepo.createMany([{
              order_id: order.id,
              listing_id: listingId,
              title: listing.title,
              unit_price: highestBid,
              quantity: 1,
              line_total: highestBid,
            }]);

            // Notificar al ganador y vendedor
            const data = { listingId, listing_id: listingId, highestBid, winnerId };

            // Vendedor
            await notify(admin, {
              user_id: sellerId,
              type: 'auction_ended',
              title: 'Subasta vendida manualmente',
              body: `Has marcado tu subasta como vendida. Se creó la orden por ${highestBid}.`,
              data,
              is_read: false,
            });

            // Comprador
            await notify(admin, {
              user_id: winnerId,
              type: 'auction_won',
              title: '¡Ganaste una subasta!',
              body: `El vendedor marcó la subasta "${listing.title}" como vendida. Ve a "Mis Compras" para pagar.`,
              data: { ...data, kind: 'auction_won' },
              is_read: false,
            });

          } catch (err) {
            console.error(`[update-status] Error creating order:`, err);
          }
        }
      }
    }
    // ---------------------------------------------------------------------

    // Admin state check
    const sellerState = await getUserAdminState(admin, sellerId);
    if (sellerState?.status === 'banned') {
      return NextResponse.json({ error: 'Tu cuenta está bloqueada. No puedes modificar publicaciones.' }, { status: 403 });
    }
    if (isSuspended(sellerState) && status === 'active') {
      return NextResponse.json(
        { error: 'Tu cuenta está suspendida. No puedes activar publicaciones hasta que finalice la suspensión.' },
        { status: 403 },
      );
    }

    // Regla: No se pueden pausar subastas activas
    if (status === 'paused' && (listing as any).sale_type === 'auction') {
      const now = Date.now();
      const endAt = (listing as any).auction_end_at ? Date.parse((listing as any).auction_end_at) : NaN;
      const isActive = Number.isFinite(endAt) && now < endAt;

      if (isActive) {
        return NextResponse.json({ error: 'No puedes pausar una subasta activa.' }, { status: 400 });
      }
    }

    // Update with Repository (includes fallbacks and service role bypass)
    const patch: any = { status };

    // Si se activa, renovar fecha de expiración (lifecycle)
    if (status === 'active') {
      const isAuction = (listing as any)?.sale_type === 'auction';
      const auctionEnd = (listing as any)?.auction_end_at;

      if (isAuction && auctionEnd) {
        const d = new Date(auctionEnd);
        d.setHours(d.getHours() + 1); // 1 hora de margen
        patch.expires_at = d.toISOString();
      } else {
        patch.expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      }
      console.log(`[update-status] Activating listing ${listingId}: isAuction=${isAuction}, auctionEnd=${auctionEnd}, setting expires_at=${patch.expires_at}`);
    }

    const updated = await repo.update(listingId, patch);

    // Audit log opcional si estamos debugueando
    if (status === 'active' && patch.expires_at) {
      const updatedExpires = updated.expires_at ? Date.parse(String(updated.expires_at)) : NaN;
      const expiresInvalid = !updated.expires_at || !Number.isFinite(updatedExpires) || updatedExpires <= Date.now();
      if (updated.status !== 'active' || expiresInvalid) {
        console.warn(`[update-status] Advertencia: Listing ${listingId} no se actualizó correctamente en el primer intento.`, {
          status: updated.status,
          expires_at: updated.expires_at
        });

        await admin.from('listings').update({
          status: 'active',
          expires_at: patch.expires_at
        }).eq('id', listingId);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error('[update-status] Error:', e);
    const msg = e instanceof Error ? e.message : 'Unexpected error';

    // Helpful error for RLS/Service Role issues
    if (msg.toLowerCase().includes('row-level security')) {
      return NextResponse.json({
        error: 'Error de permisos (RLS). Asegúrate de que SUPABASE_SERVICE_ROLE_KEY sea correcta y reinicia el servidor.'
      }, { status: 403 });
    }

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}



