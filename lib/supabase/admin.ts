import { createClient } from '@supabase/supabase-js';

/**
 * Cliente server-side con Service Role para webhooks / tareas privilegiadas.
 * Requiere variables de entorno (NO públicas):
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 */
export function supabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();

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

  // Validación proactiva del rol del JWT para evitar errores de RLS silenciosos
  try {
    const parts = key.split('.');
    if (parts.length === 3) {
      // Ajuste para base64url vs base64 estándar (reemplazar - por + y _ por /)
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      // Padding para base64 si es necesario
      const pad = base64.length % 4;
      const paddedBase64 = pad ? base64 + '='.repeat(4 - pad) : base64;
      
      const payloadStr = Buffer.from(paddedBase64, 'base64').toString('utf-8');
      const payload = JSON.parse(payloadStr);
      
      if (payload.role && payload.role !== 'service_role') {
        throw new Error(
          `Configuración Incorrecta: SUPABASE_SERVICE_ROLE_KEY tiene el rol '${payload.role}'. Se requiere la clave 'service_role' para omitir las políticas RLS.`,
        );
      }
    }
  } catch (e: any) {
    // Si es nuestro error de configuración, lo relanzamos
    if (e.message && e.message.startsWith('Configuración Incorrecta')) {
      throw e;
    }
    console.warn('[supabaseAdmin] Advertencia al validar key:', e.message);
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

