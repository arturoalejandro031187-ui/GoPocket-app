'use client';

import { useImpersonation } from './ImpersonationProvider';
import { supabase } from '@/lib/supabase/client';

export function ImpersonationBanner() {
  const { isImpersonating, isLoading, targetUserId, targetData } = useImpersonation();

  if (isLoading || !isImpersonating || !targetUserId) return null;

  const profile = targetData?.profile;
  const wallet = targetData?.wallet;
  const userEmail = targetData?.user?.email;
  const displayName = profile?.full_name || profile?.nickname || userEmail || targetUserId.slice(0, 8);
  const avatarUrl = profile?.avatar_url;
  const balance = wallet?.balance != null ? Number(wallet.balance) : null;

  return (
    <div className="fixed left-1/2 top-2 z-[90] -translate-x-1/2 px-2" style={{ maxWidth: '95vw' }}>
      <div className="flex items-center gap-3 rounded-2xl bg-amber-900 px-4 py-2.5 text-xs text-amber-50 shadow-lg shadow-amber-900/40 ring-1 ring-amber-500/60">
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="h-8 w-8 rounded-full ring-2 ring-amber-400 object-cover"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500 text-[11px] font-extrabold text-amber-950 ring-2 ring-amber-400">
              👁️
            </div>
          )}
          <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-red-500 ring-1 ring-amber-900 animate-pulse" />
        </div>

        {/* Info */}
        <div className="flex flex-col min-w-0">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-200">
            🔍 Modo Espejo Activo
          </span>
          <span className="text-[11px] text-amber-50 truncate">
            <span className="font-semibold">{displayName}</span>
            {userEmail && displayName !== userEmail && (
              <span className="opacity-70"> · {userEmail}</span>
            )}
          </span>
          {balance !== null && (
            <span className="text-[10px] text-amber-300">
              💰 PocketCash: ${balance.toLocaleString('es-MX')} MXN
            </span>
          )}
        </div>

        {/* Stats badges */}
        {targetData && (
          <div className="hidden sm:flex items-center gap-1.5 ml-2">
            <span className="rounded-full bg-amber-800 px-2 py-0.5 text-[10px] font-semibold text-amber-200 ring-1 ring-amber-600/50">
              📦 {targetData.orders?.length || 0} compras
            </span>
            <span className="rounded-full bg-amber-800 px-2 py-0.5 text-[10px] font-semibold text-amber-200 ring-1 ring-amber-600/50">
              🏷️ {targetData.listings?.length || 0} ventas
            </span>
          </div>
        )}

        {/* Exit button */}
        <button
          type="button"
          onClick={async () => {
            try {
              const { data: sess } = await supabase.auth.getSession();
              const token = sess.session?.access_token;
              const headers: HeadersInit = {};
              if (token) headers.authorization = `Bearer ${token}`;
              await fetch('/api/admin/impersonation/stop', { method: 'POST', headers });
            } finally {
              window.location.href = '/admin/usuarios';
            }
          }}
          className="ml-2 flex-shrink-0 rounded-xl bg-amber-100 px-3 py-1.5 text-[11px] font-semibold text-amber-900 hover:bg-amber-50 transition-colors"
        >
          ✕ Salir
        </button>
      </div>
    </div>
  );
}
