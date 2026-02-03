'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export function SessionWatcher() {
  const router = useRouter();

  useEffect(() => {
    // Solo ejecutar en cliente
    if (typeof window === 'undefined') return;

    console.log('[SessionWatcher] Iniciando monitor de sesión...');

    // 1. Escuchar cambios de autenticación
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        console.log('[SessionWatcher] Usuario cerró sesión');
      } else if (event === 'TOKEN_REFRESHED') {
        console.log('[SessionWatcher] Token refrescado automáticamente por Supabase');
      } else if (event === 'SIGNED_IN') {
        console.log('[SessionWatcher] Usuario inició sesión');
      }
    });

    // 2. Chequeo periódico (cada 60 segundos)
    // Supabase tiene auto-refresh, pero a veces falla si la pestaña está inactiva mucho tiempo.
    // Este intervalo fuerza un chequeo proactivo.
    const interval = setInterval(async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error('[SessionWatcher] Error obteniendo sesión:', sessionError);
          return;
        }

        if (!session) {
          // No hay sesión activa, no hacemos nada (podría ser página pública)
          return;
        }

        // Verificar expiración
        const expiresAt = session.expires_at; // timestamp en segundos
        if (!expiresAt) return;

        const now = Math.floor(Date.now() / 1000);
        const timeLeft = expiresAt - now;

        // Log discreto (descomentar para debug agresivo)
        // console.log(`[SessionWatcher] Tiempo restante de sesión: ${timeLeft}s`);

        // Si queda menos de 5 minutos (300s), forzar refresco proactivo
        // El token suele durar 1 hora (3600s).
        if (timeLeft < 300) {
          console.log('[SessionWatcher] ⚠️ La sesión expira pronto (< 5 min). Forzando refresco...');
          
          const { data, error } = await supabase.auth.refreshSession();
          
          if (error) {
            console.error('[SessionWatcher] ❌ Error crítico al refrescar sesión:', error);
            // Si el refresh token es inválido, probablemente la sesión murió de verdad.
            // Podríamos forzar reload o logout, pero dejemos que el usuario lo note o el middleware actúe.
          } else if (data.session) {
            console.log('[SessionWatcher] ✅ Sesión refrescada manualmente con éxito. Nuevo token generado.');
          }
        }
      } catch (err) {
        console.error('[SessionWatcher] Error inesperado en intervalo:', err);
      }
    }, 60 * 1000); // Chequear cada minuto

    return () => {
      subscription.unsubscribe();
      clearInterval(interval);
    };
  }, [router]);

  return null;
}
