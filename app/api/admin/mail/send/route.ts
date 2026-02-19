import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { requireAdmin, getMailboxes } from '@/lib/admin/mail/guard';

export const dynamic = 'force-dynamic';

type SendBody = {
  fromAccount?: number;
  to?: string;
  subject?: string;
  body?: string;
  html?: string;
};

/** POST: { fromAccount: 0, to: '...', subject: '...', body: '...' } */
export async function POST(req: NextRequest) {
  try {
    const guard = await requireAdmin(req);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
    const { admin } = guard;

    const mailboxes = await getMailboxes(admin);
    const body = (await req.json().catch(() => ({}))) as SendBody;
    const fromAccount = Math.max(0, Math.min(mailboxes.length - 1, Number(body?.fromAccount) || 0));
    const to = String(body?.to ?? '').trim();
    const subject = String(body?.subject ?? '').trim();
    const text = String(body?.body ?? '').trim();
    const html = String(body?.html ?? '').trim();

    if (!to) return NextResponse.json({ error: 'Destinatario (to) requerido' }, { status: 400 });
    if (!subject) return NextResponse.json({ error: 'Asunto requerido' }, { status: 400 });
    if (!text && !html) return NextResponse.json({ error: 'Cuerpo del mensaje requerido' }, { status: 400 });
    if (mailboxes.length === 0) return NextResponse.json({ error: 'Sin cuentas configuradas' }, { status: 400 });

    const mb = mailboxes[fromAccount];
    const transporter = nodemailer.createTransport({
      host: mb.smtp_host,
      port: mb.smtp_port,
      secure: mb.smtp_secure,
      auth: { user: mb.smtp_user, pass: mb.smtp_pass },
    });

    await transporter.sendMail({
      from: `${mb.label || mb.email} <${mb.email}>`,
      to,
      subject,
      text: text || undefined,
      html: html || undefined,
    });

    const r = NextResponse.json({ ok: true, message: 'Correo enviado' });
    r.headers.set('Cache-Control', 'no-store, max-age=0');
    return r;
  } catch (e: unknown) {
    console.error('[admin/mail/send]', e);
    const err = e as any;
    const msg = err?.message || (e instanceof Error ? e.message : 'Error al enviar');
    return NextResponse.json({ error: String(msg) }, { status: 500 });
  }
}
