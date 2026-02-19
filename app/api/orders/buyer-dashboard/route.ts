import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    const userId = auth.effectiveUserId;
    const admin = auth.admin;

    const { searchParams } = new URL(req.url);
    const limitParam = Number(searchParams.get('limit') || '500');
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 1000) : 500;

    const { data, error } = await admin
      .from('orders')
      .select('*')
      .eq('buyer_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message || 'Error cargando compras' },
        { status: 500 },
      );
    }

    const orders = (data ?? []) as any[];
    const orderIds = orders.map((o) => String(o?.id || '').trim()).filter(Boolean);
    if (orderIds.length > 0) {
      let itemsRes: any = await admin
        .from('order_items')
        .select('order_id,listing_id,created_at')
        .in('order_id', orderIds)
        .order('created_at', { ascending: true })
        .limit(5000);
      if (!itemsRes?.error && Array.isArray(itemsRes.data)) {
        const firstListingByOrder: Record<string, string> = {};
        const listingIdsByOrder: Record<string, string[]> = {};
        const listingIds: string[] = [];
        for (const it of itemsRes.data as any[]) {
          const oid = String(it?.order_id || '').trim();
          const lid = String(it?.listing_id || '').trim();
          if (!oid || !lid) continue;
          if (!firstListingByOrder[oid]) {
            firstListingByOrder[oid] = lid;
            listingIds.push(lid);
          }
          if (!listingIdsByOrder[oid]) {
            listingIdsByOrder[oid] = [];
          }
          if (!listingIdsByOrder[oid].includes(lid)) {
            listingIdsByOrder[oid].push(lid);
          }
        }
        if (listingIds.length > 0) {
          const { data: listings } = await admin
            .from('listings')
            .select('id,shipping_by_seller,allow_personal_delivery,free_shipping,shipping_price,sale_type,product_type')
            .in('id', listingIds)
            .limit(1000);
          const listingMap: Record<string, any> = {};
          for (const l of (listings || []) as any[]) {
            const id = String(l?.id || '').trim();
            if (!id) continue;
            listingMap[id] = {
              shipping_by_seller: Boolean(l?.shipping_by_seller),
              allow_personal_delivery: Boolean(l?.allow_personal_delivery),
              free_shipping: Boolean(l?.free_shipping),
              shipping_price: Number(l?.shipping_price ?? 0),
              sale_type: String(l?.sale_type || '').trim(),
              product_type: String((l as any)?.product_type || 'physical'),
            };
          }
          for (const o of orders) {
            const oid = String(o?.id || '').trim();
            const lid = firstListingByOrder[oid];
            if (lid && listingMap[lid]) {
              (o as any).shipping_snapshot = listingMap[lid];
            }
            const lidsForOrder = listingIdsByOrder[oid] || [];
            const hasDigital = lidsForOrder.some((lid2) => {
              const info = listingMap[lid2];
              return info && info.product_type === 'digital';
            });
            if (hasDigital) {
              (o as any).product_type = 'digital';
            }
          }
        }
      }
    }

    return NextResponse.json({ ok: true, orders });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || 'Error interno cargando compras' },
      { status: 500 },
    );
  }
}

