import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { notify } from '@/lib/notifications/service';

export const dynamic = 'force-dynamic';

function isAuthorized(req: NextRequest) {
  const secret = process.env.AUCTION_SETTLE_SECRET || '';
  if (!secret) return false; // por seguridad, requiere secret
  return req.nextUrl.searchParams.get('token') === secret;
}

export async function POST(req: NextRequest) {
  try {
    if (!isAuthorized(req)) return NextResponse.json({ ok: false }, { status: 401 });

    const admin = supabaseAdmin();
    const nowIso = new Date().toISOString();

    // Traer subastas vencidas (best-effort si columnas no existen)
    const res: any = await admin
      .from('listings')
      .select('id,title,seller_id,status,sale_type,auction_end_at,auction_highest_bid,auction_highest_bidder_id')
      .eq('sale_type', 'auction')
      .eq('status', 'active')
      .lte('auction_end_at', nowIso)
      .limit(500);

    if (res.error) {
      const code = String((res.error as any)?.code || '');
      const msg = String((res.error as any)?.message || '').toLowerCase();
      if (code === '42703' || msg.includes('column') || code === '42P01' || msg.includes('relation') || msg.includes('does not exist')) {
        return NextResponse.json({ ok: true, skipped: true, reason: 'missing_columns_or_table' });
      }
      return NextResponse.json({ error: res.error.message }, { status: 400 });
    }

    const rows = (res.data as any[]) ?? [];
    if (rows.length === 0) return NextResponse.json({ ok: true, settled: 0 });

    // Pausar para sacarlas de "activas" (idempotente-ish: solo las que vienen como active)
    const ids = rows.map((r) => String(r?.id || '').trim()).filter(Boolean);
    if (ids.length > 0) {
      await admin.from('listings').update({ status: 'paused' }).in('id', ids);
    }

    let notified = 0;
    for (const r of rows) {
      const listingId = String(r?.id || '').trim();
      const title = String(r?.title || 'Subasta').trim();
      const sellerId = String(r?.seller_id || '').trim();
      const winnerId = String(r?.auction_highest_bidder_id || '').trim();
      const highest = typeof r?.auction_highest_bid === 'number' ? r.auction_highest_bid : Number(r?.auction_highest_bid ?? 0);
      const highestBid = Number.isFinite(highest) ? highest : 0;
      const data = { listingId, listing_id: listingId, highestBid: highestBid || null, winnerId: winnerId || null };

      // Vendedor: subasta finalizada
      if (sellerId) {
        const rr = await notify(admin, {
          user_id: sellerId,
          type: 'auction_ended',
          title: 'Tu subasta terminó',
          body: winnerId ? `Tu subasta terminó. Mejor oferta: ${highestBid}.` : 'Tu subasta terminó sin pujas.',
          data,
          is_read: false,
        });
        if (rr.ok) notified += 1;
      }

      // Ganador: auction_won
      if (winnerId) {
        const rr = await notify(admin, {
          user_id: winnerId,
          type: 'auction_won',
          title: '¡Ganaste una subasta!',
          body: `Ganaste la subasta: ${title}. Oferta: ${highestBid}.`,
          data: { ...data, kind: 'auction_won' },
          is_read: false,
        });
        if (rr.ok) notified += 1;
      }

      // Perdedores: subasta finalizada (no ganaron)
      try {
        const bidsRes: any = await admin.from('bids').select('bidder_id').eq('listing_id', listingId);
        if (!bidsRes?.error && Array.isArray(bidsRes?.data)) {
          const bidderIds = Array.from(new Set((bidsRes.data as any[]).map((b: any) => String(b?.bidder_id ?? '').trim()).filter(Boolean)));
          for (const bidderId of bidderIds) {
            if (!bidderId || bidderId === winnerId || bidderId === sellerId) continue;
            const rr = await notify(admin, {
              user_id: bidderId,
              type: 'auction_ended',
              title: 'Subasta finalizada',
              body: `La subasta "${title}" terminó. No fuiste el ganador.`,
              data: { ...data, kind: 'auction_ended' },
              is_read: false,
            });
            if (rr.ok) notified += 1;
          }
        }
      } catch {
        // best-effort; no bloquear settle
      }
    }

    const resp = NextResponse.json({ ok: true, settled: rows.length, notified });
    resp.headers.set('Cache-Control', 'no-store, max-age=0');
    return resp;
  } catch (e: unknown) {
    console.error(e);
    const resp = NextResponse.json({ error: e instanceof Error ? e.message : 'Unexpected error settling auctions' }, { status: 500 });
    resp.headers.set('Cache-Control', 'no-store, max-age=0');
    return resp;
  }
}

