import { NextRequest, NextResponse } from 'next/server';
import { ImapFlow } from 'imapflow';
import { requireAdmin, getMailboxes } from '@/lib/admin/mail/guard';

export const dynamic = 'force-dynamic';

const MAX_FETCH = 500;
const DEFAULT_LIMIT = 25;

/** GET: ?account=0&page=1&limit=25 */
export async function GET(req: NextRequest) {
  try {
    const guard = await requireAdmin(req);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
    const { admin } = guard;

    const mailboxes = await getMailboxes(admin);
    const account = Math.max(0, Math.min(mailboxes.length - 1, Number(req.nextUrl.searchParams.get('account')) || 0));
    const page = Math.max(1, Number(req.nextUrl.searchParams.get('page')) || 1);
    const limit = Math.max(1, Math.min(100, Number(req.nextUrl.searchParams.get('limit')) || DEFAULT_LIMIT));

    if (mailboxes.length === 0) {
      return NextResponse.json({ ok: true, emails: [], total: 0, page, limit, account });
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
    const emails: { uid: number; from: string; to: string; subject: string; date: string; seen?: boolean }[] = [];

    try {
      let n = 0;
      for await (const msg of client.fetch('1:*', { envelope: true, uid: true, flags: true, internalDate: true })) {
        if (n >= MAX_FETCH) break;
        const env = (msg as any).envelope;
        const from = Array.isArray(env?.from) && env.from[0]
          ? [env.from[0].address, env.from[0].name].filter(Boolean).join(' ').trim() || (env.from[0] as any)?.address || ''
          : '';
        const to = Array.isArray(env?.to)
          ? env.to.map((a: any) => a?.address || a?.name || '').filter(Boolean).join(', ')
          : '';
        emails.push({
          uid: (msg as any).uid,
          from,
          to,
          subject: String(env?.subject ?? '').trim(),
          date: (msg as any).internalDate ? new Date((msg as any).internalDate).toISOString() : '',
          seen: Array.isArray((msg as any).flags) && (msg as any).flags.includes('\\Seen'),
        });
        n++;
      }
    } finally {
      lock.release();
    }
    await client.logout();

    emails.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const start = (page - 1) * limit;
    const pageSlice = emails.slice(start, start + limit);

    const r = NextResponse.json({
      ok: true,
      emails: pageSlice,
      total: emails.length,
      page,
      limit,
      account,
    });
    r.headers.set('Cache-Control', 'no-store, max-age=0');
    return r;
  } catch (e: unknown) {
    console.error('[admin/mail/inbox]', e);
    const msg = e instanceof Error ? e.message : 'Error al cargar buzón';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
