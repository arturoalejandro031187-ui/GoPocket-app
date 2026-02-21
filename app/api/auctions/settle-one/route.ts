import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { notify } from '@/lib/notifications/service';
import { OrdersRepository } from '@/lib/repositories/orders.repository';
import { OrderItemsRepository } from '@/lib/repositories/order-items.repository';
import { getCommissions, getPlan } from '@/lib/plans/limits';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const json = await req.json().catch(() => ({} as any));
    const listingId = String(json?.listing_id || '').trim();
    if (!listingId) {
      return NextResponse.json({ ok: false, error: 'listing_id requerido' }, { status: 400 });
    }

    const admin = supabaseAdmin();
    const ordersRepo = new OrdersRepository();
    const orderItemsRepo = new OrderItemsRepository();
    const nowIso = new Date().toISOString();

    // Try full query first; using * to avoid "column does not exist" errors if schema changes
    let listingRes: any = await admin
      .from('listings')
      .select('*')
      .eq('id', listingId)
      .maybeSingle();

    if (listingRes?.error) {
      const code = String(listingRes.error?.code || '');
      const msg = String(listingRes.error?.message || '').toLowerCase();
      console.error(`[SETTLE-ONE] Query error for ${listingId}:`, { code, message: listingRes.error.message });

      // Retry
      if (code === '42703' || msg.includes('does not exist') || msg.includes('column')) {
        console.log(`[SETTLE-ONE] Retrying select * for ${listingId}...`);
        listingRes = await admin
          .from('listings')
          .select('*')
          .eq('id', listingId)
          .maybeSingle();
      }
    }

    if (listingRes?.error) {
      console.error(`[SETTLE-ONE] Final query error for ${listingId}:`, listingRes.error.message);
      return NextResponse.json({ ok: false, error: `DB error: ${listingRes.error.message}` }, { status: 500 });
    }

    if (!listingRes?.data) {
      console.log(`[SETTLE-ONE] Listing ${listingId} not found in DB`);
      return NextResponse.json({ ok: false, error: 'Listing no encontrado' }, { status: 404 });
    }

    const r = listingRes.data;
    if (r.sale_type !== 'auction') {
      return NextResponse.json({ ok: true, skipped: true, reason: 'not_auction' });
    }
    if (!r.auction_end_at || new Date(r.auction_end_at).toISOString() > nowIso) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'not_ended' });
    }
    // Modificación para permitir reintentos en subastas pausadas si no tienen orden
    if (['sold', 'deleted'].includes(String(r.status))) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'already_processed' });
    }
    // Si está pausada, verificamos si ya tiene orden abajo. Si no, permitimos continuar.

    const { data: existingItems } = await admin
      .from('order_items')
      .select('order_id')
      .eq('listing_id', listingId)
      .limit(1);

    if (existingItems && existingItems.length > 0) {
      await admin.from('listings').update({ status: 'sold' }).eq('id', listingId);
      return NextResponse.json({ ok: true, order_id: existingItems[0].order_id, idempotent: true });
    }

    const title = String(r.title || 'Subasta').trim();
    const sellerId = String(r.seller_id || '').trim();
    const winnerId = String(r.auction_highest_bidder_id || '').trim();
    const highestBid = Number(r.auction_highest_bid || 0);
    const data = { listingId, listing_id: listingId, highestBid: highestBid || null, winnerId: winnerId || null };

    let orderId: string | null = null;

    if (winnerId && sellerId && highestBid > 0) {
      // --- ATOMIC LOCK ---
      // Mark as sold FIRST to prevent race conditions with cron jobs
      const { data: lockedListing } = await admin
        .from('listings')
        .update({ status: 'sold' })
        .eq('id', listingId)
        .neq('status', 'sold')
        .select('id');

      if (!lockedListing || lockedListing.length === 0) {
        console.log(`[SETTLE-ONE] Listing ${listingId} already locked/sold. Checking for existing order...`);
        // Already processed by cron or another call.
        const { data: existingItems } = await admin
          .from('order_items')
          .select('order_id')
          .eq('listing_id', listingId)
          .limit(1);

        if (existingItems && existingItems.length > 0) {
          return NextResponse.json({ ok: true, order_id: existingItems[0].order_id, idempotent: true });
        }
        // Sold but no order yet (race condition in progress), return success/processing
        return NextResponse.json({ ok: true, settled: true, status: 'processing_settlement' });
      }

      try {
        const plan = await getPlan(admin, sellerId);
        const commissions = await getCommissions(admin);
        const percent = plan === 'basic' ? commissions.basic : plan === 'pro' ? commissions.pro : commissions.platinum;
        let commissionFee = Math.round((highestBid * percent) / 100 * 100) / 100;
        const minCommission = Math.round(percent * 100) / 100;
        if (commissionFee < minCommission) {
          commissionFee = minCommission;
        }

        // --- Calcular envío ---
        const isSellerShipping = Boolean(r.shipping_by_seller);
        const isFreeShipping = Boolean(r.free_shipping);
        const allowPersonalDelivery = Boolean(r.allow_personal_delivery);
        const publishedShippingPrice = Number(r.shipping_price || 0);
        const shippingSubsidy = Number(r.shipping_subsidy || 0);
        let shippingFee = 0;
        let shippingOptionId = r.shipping_option_id || null;
        let shippingCarrier: string | null = null;
        let calculatedBaseCost = 0;

        // Determine if GoPocket shipping is available
        const hasGoPocketShipping = !isSellerShipping && !isFreeShipping && (publishedShippingPrice > 0 || Number(r.weight_kg) > 0);

        if (allowPersonalDelivery && !hasGoPocketShipping && !isSellerShipping && !isFreeShipping) {
          shippingFee = 0;
          shippingOptionId = null;
          shippingCarrier = 'pickup';
        } else if (isFreeShipping) {
          // Envío gratis
          if (isSellerShipping) {
            shippingFee = 0;
            shippingOptionId = null;
            shippingCarrier = null;
          } else {
            // Gratis GoPocket: determinar costo base (precio publicado o por peso) para registrar subsidio
            let baseCost = publishedShippingPrice;
            if (!(baseCost > 0)) {
              const { data: settingsRow } = await admin
                .from('app_settings')
                .select('shipping_base, estafeta_config')
                .eq('id', 1)
                .maybeSingle();

              const DEFAULT_WEIGHT_RANGES = [
                { max_weight_kg: 1, price: 175 },
                { max_weight_kg: 5, price: 195 },
                { max_weight_kg: 10, price: 235 },
                { max_weight_kg: 15, price: 255 },
                { max_weight_kg: 20, price: 275 },
                { max_weight_kg: 25, price: 300 },
                { max_weight_kg: 30, price: 325 },
              ];

              const shippingBase = Number((settingsRow as any)?.shipping_base ?? 175);
              const estafetaConfig = ((settingsRow as any)?.estafeta_config as any) || { enabled: true, weight_ranges: DEFAULT_WEIGHT_RANGES };
              const w = Number(r.weight_kg) || 1;
              const len = Number(r.length_cm) || 10;
              const wid = Number(r.width_cm) || 10;
              const h = Number(r.height_cm) || 10;
              const volW = (len * wid * h) / 5000;
              const finalWeight = Math.max(w, volW);

              baseCost = shippingBase;
              const ranges = (estafetaConfig.weight_ranges || DEFAULT_WEIGHT_RANGES).sort((a: any, b: any) => (a.max_weight_kg || 0) - (b.max_weight_kg || 0));
              const match = ranges.find((rng: any) => finalWeight <= (rng.max_weight_kg || 0));
              if (match) baseCost = Number(match.price) || shippingBase;
              else if (ranges.length > 0) baseCost = Number(ranges[ranges.length - 1].price) || shippingBase;
            }
            shippingFee = 0;
            shippingOptionId = null; // native gopocket doesn't need a UUID from shipping_options
            shippingCarrier = 'gopocket';
          }
        } else if (isSellerShipping) {
          // Envío gestionado por el vendedor
          shippingFee = publishedShippingPrice;
        } else if (publishedShippingPrice > 0) {
          // GoPocket con precio fijo: el frontend ya guardó el precio NETO para el comprador
          // (shipping_price = carrier_cost - shipping_subsidy desde el formulario)
          // NO restar el subsidio aquí, ya está incluido en publishedShippingPrice.
          shippingFee = publishedShippingPrice;
          shippingOptionId = null;
          shippingCarrier = 'gopocket';
          console.log(`[SETTLE-ONE] GoPocket fixed price for ${listingId}: publishedPrice=${publishedShippingPrice}, subsidy=${shippingSubsidy} (already factored in by frontend). BuyerPays=${shippingFee}`);
        } else {
          // GoPocket calculado por peso
          shippingOptionId = null;
          shippingCarrier = 'gopocket';
          const { data: settingsRow } = await admin
            .from('app_settings')
            .select('shipping_base, estafeta_config')
            .eq('id', 1)
            .maybeSingle();

          const DEFAULT_WEIGHT_RANGES = [
            { max_weight_kg: 1, price: 175 },
            { max_weight_kg: 5, price: 195 },
            { max_weight_kg: 10, price: 235 },
            { max_weight_kg: 15, price: 255 },
            { max_weight_kg: 20, price: 275 },
            { max_weight_kg: 25, price: 300 },
            { max_weight_kg: 30, price: 325 },
          ];

          const shippingBase = Number((settingsRow as any)?.shipping_base ?? 175);
          const estafetaConfig = ((settingsRow as any)?.estafeta_config as any) || { enabled: true, weight_ranges: DEFAULT_WEIGHT_RANGES };
          const w = Number(r.weight_kg) || 1;
          const len = Number(r.length_cm) || 10;
          const wid = Number(r.width_cm) || 10;
          const h = Number(r.height_cm) || 10;
          const volW = (len * wid * h) / 5000;
          const finalWeight = Math.max(w, volW);

          let baseCost = shippingBase;
          const ranges = (estafetaConfig.weight_ranges || DEFAULT_WEIGHT_RANGES).sort((a: any, b: any) => (a.max_weight_kg || 0) - (b.max_weight_kg || 0));
          const match = ranges.find((rng: any) => finalWeight <= (rng.max_weight_kg || 0));
          if (match) baseCost = Number(match.price) || shippingBase;
          else if (ranges.length > 0) baseCost = Number(ranges[ranges.length - 1].price) || shippingBase;

          // El comprador paga el costo base menos lo que el vendedor decidió subsidiar
          shippingFee = Math.max(0, baseCost - shippingSubsidy);

          console.log(`[SETTLE-ONE] GoPocket shipping for ${listingId}: weight=${finalWeight}kg, cost=${baseCost}, fee=${shippingFee}, seller_subsidy=${shippingSubsidy}`);
        }

        console.log(`[SETTLE-ONE] Final shipping decision for ${listingId}: fee=${shippingFee}, option=${shippingOptionId}, carrier=${shippingCarrier}`);

        const order = await ordersRepo.create({
          buyer_id: winnerId,
          seller_id: sellerId,
          payment_method: 'bank_transfer',
          status: 'pending_payment',
          subtotal: highestBid,
          shipping_fee: shippingFee,
          commission_fee: commissionFee,
          total: highestBid + shippingFee,
          shipping_option_id: shippingOptionId,
          shipping_carrier: shippingCarrier ?? undefined,
          // ⚠️ CRÍTICO: Guardar shipping_by_seller para que payoutNet() distinga
          // entre envío de plataforma (false) y envío por vendedor (true).
          shipping_by_seller: isSellerShipping,
          // Registramos el subsidio para que el sistema lo reste de las ganancias del vendedor
          shipping_subsidy: shippingSubsidy > 0 ? shippingSubsidy : undefined,
        });
        orderId = order.id;

        await orderItemsRepo.createMany([
          {
            order_id: order.id,
            listing_id: listingId,
            title: title,
            unit_price: highestBid,
            quantity: 1,
            line_total: highestBid,
          },
        ]);

        // await admin.from('listings').update({ status: 'sold' }).eq('id', listingId); // ALREADY LOCKED
      } catch (err) {
        console.error(`[SETTLE-ONE] ❌ Failed to create order for ${listingId}:`, err);

        // Revert lock so it can be retried
        await admin.from('listings').update({ status: 'active' }).eq('id', listingId);

        // NO pausar — dejar como está para que el cron y client-side reintenten.
        // Solo dar up después de 7 días.
        const endedAt = new Date(r.auction_end_at).getTime();
        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
        if (Date.now() - endedAt > sevenDaysMs) {
          await admin.from('listings').update({ status: 'paused' }).eq('id', listingId);
        }
        return NextResponse.json({ ok: false, retry: true, error: 'order_creation_failed', detail: String((err as any)?.message || err) }, { status: 500 });
      }
    } else if (!winnerId) {
      // Atomic lock for pause
      const { data: lockedPaused } = await admin.from('listings').update({ status: 'paused' }).eq('id', listingId).neq('status', 'paused').select('id');
      if (!lockedPaused?.length) {
        return NextResponse.json({ ok: true, skipped: true, reason: 'already_paused' });
      }
    }

    if (sellerId) {
      const body = winnerId
        ? `Tu subasta terminó con ganador. Se creó una nueva venta por ${highestBid} (estado: pendiente de pago).`
        : 'Tu subasta terminó sin pujas.';
      await notify(admin, {
        user_id: sellerId,
        type: 'auction_ended',
        title: 'Tu subasta terminó',
        body,
        data,
        is_read: false,
      });
    }

    if (winnerId) {
      await notify(admin, {
        user_id: winnerId,
        type: 'auction_won',
        title: '¡Ganaste una subasta!',
        body: `Ganaste la subasta: ${title}. Ve a "Mis Compras" para completar el pago.`,
        data: { ...data, kind: 'auction_won', orderId: orderId || null },
        is_read: false,
      });

      try {
        const bidsRes: any = await admin.from('bids').select('bidder_id').eq('listing_id', listingId);
        if (!bidsRes?.error && Array.isArray(bidsRes?.data)) {
          const bidderIds = Array.from(
            new Set(
              (bidsRes.data as any[]).map((b: any) => String(b?.bidder_id ?? '').trim()).filter(Boolean),
            ),
          );
          for (const bidderId of bidderIds) {
            if (!bidderId || bidderId === winnerId || bidderId === sellerId) continue;
            await notify(admin, {
              user_id: bidderId,
              type: 'auction_ended',
              title: 'Subasta finalizada',
              body: `La subasta "${title}" terminó. No fuiste el ganador.`,
              data: { ...data, kind: 'auction_ended' },
              is_read: false,
            });
          }
        }
      } catch (err) {
        console.error(`[SETTLE-ONE] Error notifying losers for ${listingId}:`, err);
      }
    }

    return NextResponse.json({ ok: true, settled: true, order_id: orderId });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'unexpected_error' },
      { status: 500 },
    );
  }
}
