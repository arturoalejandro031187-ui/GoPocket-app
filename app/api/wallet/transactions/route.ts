import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { WalletService } from '@/lib/services/wallet/wallet.service';

export const dynamic = 'force-dynamic';

function getBearerToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

export async function GET(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 401 });

    const admin = supabaseAdmin();
    const { data: { user }, error } = await admin.auth.getUser(token);
    
    if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const transactions = await WalletService.getTransactions(user.id);
    return NextResponse.json({ transactions });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
