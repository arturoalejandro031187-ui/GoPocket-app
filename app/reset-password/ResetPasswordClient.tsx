'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

export function ResetPasswordClient() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(true);
  const [isValidToken, setIsValidToken] = useState(false);

  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      try {
        // Verificar si hay sesión activa inicial
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session && mounted) {
          setIsValidToken(true);
          setIsValidating(false);
          return;
        }

        // Si no hay sesión, escuchar cambios de estado (para PKCE flow que intercambia el código)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
          if (mounted && (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') && session) {
            setIsValidToken(true);
            setIsValidating(false);
          }
        });

        // Timeout de seguridad si no se resuelve la sesión
        setTimeout(() => {
          if (mounted && isValidating) {
            // Verificar una última vez
            supabase.auth.getSession().then(({ data: { session } }) => {
              if (mounted) {
                if (session) {
                  setIsValidToken(true);
                } else {
                  // Si hay un código en la URL, quizás tardó más, pero asumimos error tras el timeout
                  const params = new URLSearchParams(window.location.search);
                  const code = params.get('code');
                  const hash = window.location.hash;
                  
                  // Si no hay código ni hash, es inválido seguro. Si hay, falló el intercambio.
                  if (!code && !hash && !session) {
                    setError('El enlace de recuperación no es válido o ha expirado.');
                  } else if (!session) {
                    setError('No se pudo validar el enlace. Intenta solicitar uno nuevo.');
                  }
                }
                setIsValidating(false);
              }
            });
          }
        }, 4000); // Dar tiempo al intercambio de código PKCE

        return () => {
          subscription.unsubscribe();
        };

      } catch (err) {
        if (mounted) {
          setError('Error al validar el enlace de recuperación.');
          setIsValidating(false);
        }
      }
    };

    checkSession();

    return () => {
      mounted = false;
    };
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setIsLoading(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateError) throw updateError;

      // Redirigir al login con mensaje de éxito
      router.push('/login?passwordReset=success');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo restablecer la contraseña.');
      setIsLoading(false);
    }
  };

  if (isValidating) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-pink-50 via-white to-white flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white/90 rounded-3xl shadow-xl ring-1 ring-black/5 p-8 space-y-6">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-brand-pink"></div>
              <p className="text-gray-600 text-sm mt-4">Validando enlace...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isValidToken) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-pink-50 via-white to-white flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white/90 rounded-3xl shadow-xl ring-1 ring-black/5 p-8 space-y-6">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-500 text-white shadow-sm">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <div className="leading-tight">
                <div className="text-sm font-semibold text-gray-900">GoPocket</div>
                <div className="text-xs text-gray-500">Enlace inválido</div>
              </div>
            </div>

            <div>
              <h1 className="text-3xl font-bold text-gray-900">Enlace inválido</h1>
              <p className="text-gray-600 text-sm mt-2">
                {error || 'El enlace de recuperación no es válido o ha expirado.'}
              </p>
            </div>

            <div className="space-y-3">
              <Link
                href="/forgot-password"
                className="block w-full text-center rounded-xl bg-brand-pink text-white py-3 font-semibold hover:opacity-90 transition-opacity shadow-lg"
              >
                Solicitar nuevo enlace
              </Link>
              <Link
                href="/login"
                className="block w-full text-center rounded-xl bg-white border border-gray-300 text-gray-900 py-3 font-semibold hover:bg-gray-50 transition-colors"
              >
                Volver a iniciar sesión
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 via-white to-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white/90 rounded-3xl shadow-xl ring-1 ring-black/5 p-8 space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-pink text-white shadow-sm">
              <span className="text-sm font-extrabold">PO</span>
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-gray-900">GoPocket</div>
              <div className="text-xs text-gray-500">Nueva contraseña</div>
            </div>
          </div>

          <div>
            <h1 className="text-3xl font-bold text-gray-900">Restablecer contraseña</h1>
            <p className="text-gray-600 text-sm mt-1">
              Ingresa tu nueva contraseña. Asegúrate de que tenga al menos 6 caracteres.
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm text-center">
              {error}
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Nueva contraseña</label>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                required
                minLength={6}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-brand-pink focus:border-transparent transition-all text-gray-900 placeholder-gray-400"
                placeholder="Mínimo 6 caracteres"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirmar contraseña</label>
              <input
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                type="password"
                required
                minLength={6}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-brand-pink focus:border-transparent transition-all text-gray-900 placeholder-gray-400"
                placeholder="Confirma tu contraseña"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              style={{ backgroundColor: '#E3127D' }}
              className="w-full text-white py-3 rounded-xl font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity shadow-lg focus:outline-none focus:ring-2 focus:ring-brand-pink focus:ring-offset-2"
            >
              {isLoading ? 'Restableciendo…' : 'Restablecer contraseña'}
            </button>
          </form>

          <p className="text-xs text-gray-600 text-center">
            <Link href="/login" className="font-semibold text-brand-pink hover:opacity-90">
              Volver a iniciar sesión
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
