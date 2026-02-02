'use client';

import Link from 'next/link';
import { VerifiedBadge } from '@/components/VerifiedBadge';

export type SellerDisplayProps = {
  /** ID del vendedor (para enlace a /perfil) */
  sellerId: string;
  /** Nombre a mostrar (fallback "Vendedor") */
  sellerName: string;
  /** Estado de registro (opcional) */
  state?: string | null;
  /** Municipio/ciudad de registro (opcional) */
  city?: string | null;
  /** Mostrar insignia verificado */
  isVerified?: boolean;
  /** Operaciones en el sitio (ventas + compras). Si se pasa, se muestra "N operaciones" */
  operationsCount?: number | null;
  /** Tamaño: sm (compacto) o md */
  size?: 'sm' | 'md';
  /** Mostrar "Ubicado en estado, municipio" cuando existan */
  showUbicado?: boolean;
  /** Clases extra para el contenedor */
  className?: string;
  /** URL del logo de la tienda (Solo PRO) */
  storeLogoUrl?: string | null;
  /** Tipo de plan del vendedor */
  planType?: string | null;
  /** Forzar ocultar logo */
  hideLogo?: boolean;
};

/**
 * Bloque reutilizable: "Vendido por [Nombre en rosa con link a reputación]" + "Ubicado en Estado, Municipio".
 * Usar en listing, tienda, compras, devoluciones, disputas, etc.
 */
export function SellerDisplay({
  sellerId,
  sellerName,
  state,
  city,
  isVerified = false,
  operationsCount,
  size = 'md',
  showUbicado = true,
  className = '',
  storeLogoUrl,
  planType,
  hideLogo = false,
}: SellerDisplayProps) {
  const name = (sellerName || 'Vendedor').trim() || 'Vendedor';
  const hasUbicado = showUbicado && (state || city);
  const ubicado = [state, city].filter(Boolean).join(', ').toUpperCase();
  const ops = typeof operationsCount === 'number' && operationsCount >= 0 ? operationsCount : null;

  const isPro = planType === 'pro';
  const showLogo = !hideLogo && isPro && storeLogoUrl;

  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';
  const linkClass = size === 'sm'
    ? 'font-semibold text-brand-pink hover:opacity-90 hover:underline'
    : 'font-semibold text-brand-pink hover:opacity-90';

  return (
    <div className={`${className} ${showLogo ? 'flex items-start gap-3' : ''}`}>
      {showLogo && (
        <Link href={`/perfil/${sellerId}`} className="shrink-0 overflow-hidden rounded-full border border-gray-100 bg-white shadow-sm hover:opacity-90">
          <img 
            src={storeLogoUrl!} 
            alt={name} 
            className={size === 'sm' ? 'h-10 w-10 object-cover' : 'h-14 w-14 object-cover'} 
          />
        </Link>
      )}
      <div>
        <div className={`flex flex-wrap items-center gap-2 ${textSize}`}>
          <span className="text-gray-600">Vendido por</span>
          <Link href={`/perfil/${sellerId}`} className={linkClass}>
            {name}
          </Link>
          {(isPro || isVerified) && <VerifiedBadge size={size === 'sm' ? 'sm' : 'md'} />}
          {ops !== null && (
            <span className="text-gray-500">
              · {ops} {ops === 1 ? 'operación' : 'operaciones'}
            </span>
          )}
        </div>
        {hasUbicado && ubicado && (
          <div className={`mt-1 ${textSize}`}>
            <span className="text-gray-600">Ubicado en </span>
            <span className="font-semibold text-brand-pink">{ubicado}</span>
          </div>
        )}
      </div>
    </div>
  );
}
