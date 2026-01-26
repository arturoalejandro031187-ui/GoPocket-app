'use client';

import Link from 'next/link';
import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { normalizeReturnTo } from '@/lib/auth/redirect';

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export function AuthModal({ isOpen, onClose }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<'google' | 'facebook' | null>(null);

  if (!isOpen) return null;

  const redirectTo = (() => {
    if (typeof window === 'undefined') return undefined;
    const base = window.location.origin;
    const sp = new URLSearchParams(window.location.search);
    const safe = normalizeReturnTo(sp.get('returnTo'));
    const qp = new URLSearchParams();
    if (safe) qp.set('returnTo', safe);
    // Regresamos al Home; si viene returnTo, Home lo hará redirect una vez autenticado.
    const suffix = qp.toString() ? `/?${qp.toString()}` : '/';
    return `${base}${suffix}`;
  })();

  const signInOAuth = async (provider: 'google' | 'facebook') => {
    setError(null);
    setIsLoading(provider);
    try {
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider,
        options: redirectTo ? { redirectTo } : undefined,
      });
      if (authError) throw authError;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar sesión.');
      setIsLoading(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Registro e inicio de sesión"
    >
      <div className="w-full max-w-xl overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/10">
        <div className="flex items-start justify-between px-6 py-5">
          <div className="mx-auto text-center">
            <div className="text-sm text-gray-600">Vende lo que ya no te pones y compra con descuento todo el año</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mt-1 -mr-1 rounded-xl p-2 text-gray-500 hover:bg-black/5 focus:outline-none focus:ring-2 focus:ring-brand-pink focus:ring-offset-2"
            aria-label="Cerrar"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="px-6 pb-6">
          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => signInOAuth('google')}
              disabled={isLoading !== null}
              className="btn btn-secondary w-full"
            >
              {isLoading === 'google' ? 'Conectando…' : 'Continuar con Google'}
            </button>

            <button
              type="button"
              onClick={() => signInOAuth('facebook')}
              disabled={isLoading !== null}
              className="btn btn-secondary w-full"
            >
              {isLoading === 'facebook' ? 'Conectando…' : 'Continuar con facebook'}
            </button>

            <Link
              href="/register"
              onClick={onClose}
              className="btn btn-secondary w-full border-brand-pink text-brand-pink hover:bg-pink-50"
            >
              Continuar con E-mail
            </Link>
          </div>

          <div className="mt-5 text-center text-sm text-gray-600">
            ¿Ya tienes cuenta?{' '}
            <Link href="/login" onClick={onClose} className="font-semibold text-brand-pink hover:opacity-90">
              Inicia Sesión
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

