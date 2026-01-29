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
    const { userId: sellerId, admin } = await requireAuth(req);
    
    // Leer body para detalles de cuenta (opcional)
    const body = await req.json().catch(() => ({}));
    const accountDetails = body.accountDetails || body.account_details || null;

    // Obtener plan del usuario
    const { data: prof } = await admin
      .from('profiles')
      .select('plan_type')
      .eq('id', sellerId)
      .single();
    const planType = prof?.plan_type === 'pro' ? 'pro' : 'basic';

    // Verificar token de MercadoPago (se usa como variable de entorno, aunque ya no sea obligatorio para el retiro manual, el servicio lo pide o lo usaba)
    // En la nueva logica, el servicio lo hizo opcional.
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN || '';

    // Inicializar servicios
    const payoutsRepo = new PayoutsRepository();
    const ordersRepo = new OrdersRepository();
    const payoutService = new PayoutService(payoutsRepo, ordersRepo);

    // Procesar retiro
    const result = await payoutService.withdraw({
      sellerId,
      accessToken, // Opcional ahora
      accountDetails,
      planType,
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
