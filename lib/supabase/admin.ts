import { createClient } from '@supabase/supabase-js';

/**
 * Cliente server-side con Service Role para webhooks / tareas privilegiadas.
 * Requiere variables de entorno (NO públicas):
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 */
export function supabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  if (!url || !key) {
    throw new Error(
      'Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY para operaciones server-side (webhooks/pagos).',
    );
  }

  // Error común: pegar la anon key donde va la service_role key
  if (anon && key.trim() === anon.trim()) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY es igual a NEXT_PUBLIC_SUPABASE_ANON_KEY. Debe ser la key "service_role" (Settings → API → service_role).',
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

