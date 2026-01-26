import { NextRequest, NextResponse } from 'next/server';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { requireAdmin, getMailboxes } from '@/lib/admin/mail/guard';

export const dynamic = 'force-dynamic';

/** GET: ?account=0&uid=123 */
export async function GET(req: NextRequest) {
  try {
    const guard = await requireAdmin(req);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
    const { admin } = guard;

    const mailboxes = await getMailboxes(admin);
    const account = Math.max(0, Math.min(mailboxes.length - 1, Number(req.nextUrl.searchParams.get('account')) || 0));
    const uid = Number(req.nextUrl.searchParams.get('uid'));
    if (!Number.isFinite(uid) || uid < 1) {
      return NextResponse.json({ error: 'uid requerido' }, { status: 400 });
    }

    if (mailboxes.length === 0) {
      return NextResponse.json({ error: 'Sin cuentas configuradas' }, { status: 400 });
    }

    const mb = mailboxes[account];
    const client = new ImapFlow({
      host: mb.imap_host,
      port: mb.imap_port,
      secure: mb.imap_secure,
      auth: { user: mb.imap_user, pass: mb.imap_pass },
      logger: false,
    });

    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    let parsed: {
      from: string;
      to: string;
      subject: string;
      date?: string;
      text?: string;
      html?: string;
    } | null = null;

    try {
      for await (const msg of client.fetch(String(uid), { source: true, envelope: true, uid: true })) {
        const raw = (msg as any).source;
        const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw ?? ''), 'utf-8');
        const mail = await simpleParser(buf);
        parsed = {
          from: Array.isArray(mail.from) ? mail.from[0]?.text || '' : mail.from?.text || '',
          to: Array.isArray(mail.to) ? mail.to.map((addr: any) => addr?.text || '').join(', ') : mail.to?.text || '',
          subject: mail.subject || '',
          date: mail.date?.toISOString(),
          text: mail.text || undefined,
          html: mail.html || undefined,
        };
        break;
      }
    } finally {
      lock.release();
    }
    await client.logout();

    if (!parsed) {
      return NextResponse.json({ error: 'Correo no encontrado' }, { status: 404 });
    }

    const r = NextResponse.json({ ok: true, email: parsed });
    r.headers.set('Cache-Control', 'no-store, max-age=0');
    return r;
  } catch (e: unknown) {
    console.error('[admin/mail/email]', e);
    const msg = e instanceof Error ? e.message : 'Error al cargar correo';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
