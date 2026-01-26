import { NextRequest, NextResponse } from 'next/server';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/admin';

type Body = {
  orderIds: string[];
  // Nota: `amount` puede llegar desde el cliente por compatibilidad,
  // pero NO se usa como fuente de verdad (se recalcula desde la BD).
  amount?: number;
};

function getBearerToken(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: 'Missing Authorization Bearer token' }, { status: 401 });

    const body = (await req.json()) as Body;
    const orderIds = body?.orderIds ?? [];
    const amount = body?.amount;
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json({ error: 'orderIds is required' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
    const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    if (!supabaseUrl || !supabaseAnon) {
      return NextResponse.json({ error: 'Supabase env vars missing on server' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseAnon, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr) return NextResponse.json({ error: userErr.message }, { status: 401 });
    if (!userData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN || '';
    if (!accessToken) {
      return NextResponse.json(
        { error: 'Missing MERCADOPAGO_ACCESS_TOKEN env var' },
        { status: 500 },
      );
    }

    const admin = supabaseAdmin();

    const origin = req.nextUrl.origin;
    const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET || '';
    const notificationUrl = webhookSecret
      ? `${origin}/api/mercadopago/webhook?token=${encodeURIComponent(webhookSecret)}`
      : `${origin}/api/mercadopago/webhook`;

    // Validación robusta con módulo centralizado
    const { validatePayment } = await import('@/lib/payments/validation');
    const validation = await validatePayment(admin, {
      buyerId: userData.user.id,
      orderIds,
      amount, // El validador recalculará el total real de las órdenes y comparará
      paymentMethod: 'mercadopago',
    });

    if (!validation.valid) {
      return NextResponse.json(
        { 
          error: 'Validación de pago fallida', 
          details: validation.errors,
          warnings: validation.warnings 
        }, 
        { status: 400 }
      );
    }
    
    // Si hay warnings, los logueamos pero permitimos continuar (o podríamos detener si es estricto)
    if (validation.warnings.length > 0) {
      console.warn('[MP PREFERENCE] Warnings en validación:', validation.warnings);
    }

    // Crear checkout_session (server-side)
    const { data: sessionRow, error: sessionErr } = await admin
      .from('checkout_sessions')
      .insert([
        {
          buyer_id: userData.user.id,
          order_ids: orderIds,
          payment_method: 'mercadopago',
          status: 'pending',
          amount,
        },
      ])
      .select('id')
      .single();

    if (sessionErr) {
      return NextResponse.json({ error: sessionErr.message }, { status: 500 });
    }

    const checkoutId = (sessionRow as any).id as string;

    const client = new MercadoPagoConfig({ accessToken });
    const preference = new Preference(client);

    const result = await preference.create({
      body: {
        items: [
          {
            id: checkoutId,
            title: 'GoPocket - Compra',
            quantity: 1,
            currency_id: 'MXN',
            unit_price: Number(amount),
          },
        ],
        external_reference: checkoutId,
        notification_url: notificationUrl,
        back_urls: {
          success: `${origin}/compra-exitosa?checkoutId=${encodeURIComponent(checkoutId)}`,
          pending: `${origin}/compra-pendiente?checkoutId=${encodeURIComponent(checkoutId)}`,
          failure: `${origin}/compra-error?checkoutId=${encodeURIComponent(checkoutId)}`,
        },
        auto_return: 'approved',
        metadata: { checkoutId, orderIds },
      },
    });

    const prefId = (result as any)?.id as string | undefined;
    const initPoint = (result as any)?.init_point as string | undefined;
    const sandboxInitPoint = (result as any)?.sandbox_init_point as string | undefined;

    if (prefId) {
      await admin.from('checkout_sessions').update({ mp_preference_id: prefId }).eq('id', checkoutId);
    }

    return NextResponse.json({ checkoutId, preferenceId: prefId, init_point: initPoint, sandbox_init_point: sandboxInitPoint });
  } catch (e: unknown) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unexpected error creating preference' },
      { status: 500 },
    );
  }
}

