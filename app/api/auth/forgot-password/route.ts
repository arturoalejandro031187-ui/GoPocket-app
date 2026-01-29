import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { notifyResetPassword } from '@/lib/email/notify';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { email } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email requerido' }, { status: 400 });
    }

    const admin = supabaseAdmin();
    const origin = req.nextUrl.origin;
    // La página de reset password maneja el token en el hash
    const redirectTo = `${origin}/reset-password`;

    // Generar link de recuperación
    // generateLink retorna un link que al visitarlo verifica el token y redirige a redirectTo
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: {
        redirectTo,
      },
    });

    if (error) {
      console.error('[ForgotPassword] Error generating link:', error);
      // Si el usuario no existe, Supabase devuelve error.
      // Por seguridad, simulamos éxito para no revelar correos.
      // Pero si es rate limit, podríamos avisar.
      if (error.message.includes('User not found')) {
         return NextResponse.json({ ok: true });
      }
      if (error.status === 429) {
        return NextResponse.json({ error: 'Demasiados intentos. Intenta más tarde.' }, { status: 429 });
      }
      // Otros errores
      return NextResponse.json({ error: 'Error al procesar solicitud' }, { status: 500 });
    }

    const resetLink = data.properties?.action_link;
    if (!resetLink) {
      console.error('[ForgotPassword] No link returned from generateLink');
      return NextResponse.json({ error: 'Error interno' }, { status: 500 });
    }

    // Enviar email con Resend
    console.log('[ForgotPassword] Sending reset email via Resend to:', email);
    await notifyResetPassword({
      email,
      resetLink,
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[ForgotPassword] Unexpected error:', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
