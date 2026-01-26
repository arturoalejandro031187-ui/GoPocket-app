// Middleware de autenticación reutilizable

import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { UnauthorizedError, ForbiddenError } from '@/lib/utils/errors';

function getBearerToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

export interface AuthResult {
  userId: string;
  admin: ReturnType<typeof supabaseAdmin>;
}

/**
 * Requerir autenticación básica (usuario logueado)
 */
export async function requireAuth(req: NextRequest): Promise<AuthResult> {
  const token = getBearerToken(req);
  if (!token) {
    throw new UnauthorizedError('Missing Authorization Bearer token');
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  
  if (!supabaseUrl || !supabaseAnon) {
    throw new Error('Supabase env vars missing on server');
  }

  const supabase = createClient(supabaseUrl, supabaseAnon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  
  if (userErr || !userData.user) {
    throw new UnauthorizedError(userErr?.message || 'Invalid token');
  }

  return {
    userId: userData.user.id,
    admin: supabaseAdmin(),
  };
}

/**
 * Requerir autenticación de administrador
 */
export async function requireAdmin(req: NextRequest): Promise<AuthResult> {
  const auth = await requireAuth(req);
  const admin = supabaseAdmin();

  const { data: row, error } = await admin
    .from('admin_users')
    .select('user_id')
    .eq('user_id', auth.userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Error verificando admin: ${error.message}`);
  }

  if (!row) {
    throw new ForbiddenError('No autorizado (admin requerido)');
  }

  return auth;
}
