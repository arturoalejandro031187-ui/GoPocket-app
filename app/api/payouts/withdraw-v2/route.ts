// API Route refactorizada para retirar usando nueva arquitectura

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { PayoutsRepository } from '@/lib/repositories/payouts.repository';
import { OrdersRepository } from '@/lib/repositories/orders.repository';
import { PayoutService } from '@/lib/services/payouts/payout.service';
import { handleError } from '@/lib/utils/errors';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // Autenticación
    const { userId: sellerId } = await requireAuth(req);

    // Verificar token de MercadoPago
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN || '';
    if (!accessToken) {
      return NextResponse.json(
        { error: 'Retiros por Mercado Pago no configurados (MERCADOPAGO_ACCESS_TOKEN).' },
        { status: 503 }
      );
    }

    // Inicializar servicios
    const payoutsRepo = new PayoutsRepository();
    const ordersRepo = new OrdersRepository();
    const payoutService = new PayoutService(payoutsRepo, ordersRepo);

    // Procesar retiro
    const result = await payoutService.withdraw({
      sellerId,
      accessToken,
    });

    // Respuesta exitosa
    const resp = NextResponse.json({
      ok: true,
      ...result,
    });
    resp.headers.set('Cache-Control', 'no-store, max-age=0');
    return resp;

  } catch (error) {
    const { message, code, statusCode } = handleError(error);
    const resp = NextResponse.json(
      { error: message, code },
      { status: statusCode }
    );
    resp.headers.set('Cache-Control', 'no-store, max-age=0');
    return resp;
  }
}
