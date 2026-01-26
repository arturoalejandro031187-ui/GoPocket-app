import { NextRequest, NextResponse } from 'next/server';
import { sendEmailWithResend } from '@/lib/email/resend';

export const dynamic = 'force-dynamic';

/**
 * Endpoint de prueba para verificar que el email funciona
 * POST: { "to": "email@ejemplo.com" }
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { to?: string };
    const to = body?.to?.trim() || 'arturoalejandro031187@gmail.com';

    const result = await sendEmailWithResend({
      to,
      subject: 'Prueba de email desde GoPocket',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #ec4899;">¡Email funcionando! ✅</h1>
          <p>Este es un email de prueba desde <strong>contacto@gopocket.com.mx</strong></p>
          <p>Si recibes este email, la configuración está correcta.</p>
          <hr style="border: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #6b7280; font-size: 12px;">
            Enviado desde GoPocket App<br>
            contacto@gopocket.com.mx
          </p>
        </div>
      `,
      text: 'Este es un email de prueba desde contacto@gopocket.com.mx. Si recibes este email, la configuración está correcta.',
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error || 'Error al enviar email' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: 'Email de prueba enviado correctamente' });
  } catch (e: unknown) {
    console.error('[TEST EMAIL] Error:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error al procesar' }, { status: 500 });
  }
}
