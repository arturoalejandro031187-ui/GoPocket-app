import nodemailer from 'nodemailer';

export type SendEmailOptions = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  from?: string; // Dirección de email personalizada (opcional)
  fromName?: string; // Nombre personalizado (opcional)
};

/**
 * Envía email usando Resend con contacto@gopocket.com.mx
 * Requiere: RESEND_API_KEY en variables de entorno
 */
export async function sendEmailWithResend(opts: SendEmailOptions): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[EMAIL RESEND] RESEND_API_KEY no configurado');
    return { ok: false, error: 'RESEND_API_KEY no configurado' };
  }

  // Usar dirección personalizada si se proporciona, sino usar la de variables de entorno
  // Si no hay EMAIL_FROM, usar contacto@gopocket.com.mx como default ahora que el dominio está verificado
  const fromEmail = opts.from || process.env.EMAIL_FROM || 'contacto@gopocket.com.mx';
  const fromName = opts.fromName || process.env.EMAIL_FROM_NAME || 'GoPocket';

  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.resend.com',
      port: 465, // Usar puerto seguro 465
      secure: true,
      auth: {
        user: 'resend',
        pass: apiKey,
      },
    });

    console.log(`[EMAIL RESEND] Intentando enviar a: ${opts.to} desde: ${fromEmail}`);

    await transporter.sendMail({
      from: `${fromName} <${fromEmail}>`,
      to: opts.to.trim(),
      subject: opts.subject,
      text: opts.text || undefined,
      html: opts.html,
      replyTo: opts.replyTo || fromEmail,
    });

    return { ok: true };
  } catch (e: unknown) {
    const err = e as Error;
    console.error('[EMAIL RESEND] Error:', err);
    return { ok: false, error: err.message || 'Error al enviar email' };
  }
}
