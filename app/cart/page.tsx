'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

type CartItemRow = {
  id: string;
  listing_id: string;
  quantity: number;
  selected_color?: string | null;
  selected_size?: string | null;
};

type ListingRow = {
  id: string;
  title?: string | null;
  name?: string | null;
  price?: number | string | null;
  user_id?: string | null;
  seller_id?: string | null;
};

function formatMoney(value: number) {
  return value.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function getListingTitle(l: ListingRow) {
  return (l.title ?? l.name ?? 'Publicación').toString();
}

function getListingPrice(l: ListingRow) {
  const raw = l.price;
  const num = typeof raw === 'number' ? raw : Number(raw ?? 0);
  return Number.isFinite(num) ? num : 0;
}

export default function CartPage() {
  const [isBooting, setIsBooting] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [cartItems, setCartItems] = useState<CartItemRow[]>([]);
  const [listingsById, setListingsById] = useState<Record<string, ListingRow>>({});
  const [isUpdating, setIsUpdating] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [couponInfo, setCouponInfo] = useState<string | null>(null);
  const [couponDiscount, setCouponDiscount] = useState<number>(0);
  const [isApplying, setIsApplying] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const subtotal = useMemo(() => {
    return cartItems.reduce((sum, ci) => {
      const listing = listingsById[ci.listing_id];
      const price = listing ? getListingPrice(listing) : 0;
      return sum + price * ci.quantity;
    }, 0);
  }, [cartItems, listingsById]);

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      try {
        setIsBooting(true);
        setPageError(null);

        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr) throw userErr;
        if (!userData.user) {
          window.location.href = '/';
          return;
        }

        const { data: cartData, error: cartErr } = await supabase
          .from('cart_items')
          .select('id, listing_id, quantity, selected_color, created_at')
          .order('created_at', { ascending: true });
        if (cartErr) throw cartErr;

        const items = (cartData as any[]) ?? [];
        if (cancelled) return;
        setCartItems(items.map((item) => ({ 
          id: item.id, 
          listing_id: item.listing_id, 
          quantity: item.quantity,
          selected_color: item.selected_color || null,
          selected_size: item.selected_size || null,
        })));

        const listingIds = Array.from(new Set(items.map((i) => i.listing_id)));
        if (listingIds.length === 0) {
          setListingsById({});
          return;
        }

        const { data: listings, error: listingsErr } = await supabase
          .from('listings')
          .select('*')
          .in('id', listingIds);
        if (listingsErr) throw listingsErr;

        const map: Record<string, ListingRow> = {};
        for (const row of (listings as ListingRow[]) ?? []) map[row.id] = row;
        if (!cancelled) setListingsById(map);
      } catch (err: unknown) {
        console.error(err);
        if (!cancelled) setPageError(err instanceof Error ? err.message : 'No se pudo cargar tu carrito.');
      } finally {
        if (!cancelled) setIsBooting(false);
      }
    };

    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      const saved = typeof window !== 'undefined' ? window.localStorage.getItem('pocket_coupon_code') : null;
      if (saved && !couponCode) setCouponCode(saved);
    } catch {
      // noop
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyCoupon = async () => {
    setPageError(null);
    setCouponInfo(null);
    setCouponDiscount(0);
    const code = couponCode.trim().toUpperCase();
    if (!code) {
      setPageError('Ingresa un cupón.');
      return;
    }
    if (cartItems.length === 0) {
      setPageError('Tu carrito está vacío.');
      return;
    }
    setIsApplying(true);
    try {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) throw sessionErr;
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        window.location.href = '/login';
        return;
      }
      const res = await fetch('/api/coupons/apply', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          code,
          cartItems: cartItems.map((c) => ({ listingId: c.listing_id, quantity: c.quantity })),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'No se pudo aplicar el cupón.');
      const discount = Number(json?.discount ?? 0);
      const finalDiscount = Number.isFinite(discount) ? discount : 0;
      setCouponDiscount(finalDiscount);
      setCouponInfo(`Cupón válido. Descuento estimado: ${formatMoney(finalDiscount)} (se aplicará al pagar).`);
    } catch (e: unknown) {
      console.error(e);
      setPageError(e instanceof Error ? e.message : 'No se pudo aplicar el cupón.');
    } finally {
      setIsApplying(false);
    }
  };

  const updateQuantity = async (cartItemId: string, nextQuantity: number) => {
    if (nextQuantity < 1) return;
    setIsUpdating(true);
    setPageError(null);
    try {
      const { error } = await supabase.from('cart_items').update({ quantity: nextQuantity }).eq('id', cartItemId);
      if (error) throw error;
      setCartItems((prev) => prev.map((ci) => (ci.id === cartItemId ? { ...ci, quantity: nextQuantity } : ci)));
    } catch (err: unknown) {
      console.error(err);
      setPageError(err instanceof Error ? err.message : 'No se pudo actualizar la cantidad.');
    } finally {
      setIsUpdating(false);
    }
  };

  const removeItem = async (cartItemId: string) => {
    setIsUpdating(true);
    setPageError(null);
    try {
      const { error } = await supabase.from('cart_items').delete().eq('id', cartItemId);
      if (error) throw error;
      setCartItems((prev) => prev.filter((ci) => ci.id !== cartItemId));
    } catch (err: unknown) {
      console.error(err);
      setPageError(err instanceof Error ? err.message : 'No se pudo eliminar del carrito.');
    } finally {
      setIsUpdating(false);
    }
  };

  if (isBooting) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-pink-50 to-white">
        <div className="mx-auto max-w-5xl px-4 py-10">
          <div className="h-12 rounded-2xl bg-white/70 ring-1 ring-black/5" />
          <div className="mt-6 h-72 rounded-2xl bg-white/70 ring-1 ring-black/5" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 to-white">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Logo grande de carrito */}
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-brand-pink/10 ring-1 ring-brand-pink/20">
              <svg className="h-12 w-12 text-brand-pink" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-pink-50 px-3 py-1 text-xs font-semibold text-brand-pink ring-1 ring-pink-100">
                Carrito
              </div>
              <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-gray-900">Tu carrito</h1>
              <p className="mt-2 text-sm text-gray-600">Revisa tus productos antes de pagar.</p>
            </div>
          </div>
          <Link
            href="/dashboard"
            className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-black/5 hover:bg-gray-50"
          >
            Volver
          </Link>
        </div>

        {pageError && (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {pageError}
          </div>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/5">
              <div className="border-b border-black/5 px-6 py-4">
                <div className="text-sm font-semibold text-gray-900">Artículos</div>
              </div>
              <div className="divide-y divide-black/5">
                {cartItems.length === 0 ? (
                  <div className="px-6 py-10 text-center text-sm text-gray-600">Tu carrito está vacío.</div>
                ) : (
                  cartItems.map((ci) => {
                    const listing = listingsById[ci.listing_id];
                    const title = listing ? getListingTitle(listing) : 'Publicación no encontrada';
                    const price = listing ? getListingPrice(listing) : 0;
                    return (
                      <div key={ci.id} className="flex flex-col gap-3 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="text-sm font-semibold text-gray-900">{title}</div>
                          <div className="mt-1 flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-gray-500">{formatMoney(price)} c/u</span>
                            {ci.selected_color && (
                              <>
                                <span className="text-xs text-gray-400">·</span>
                                <span className="text-xs font-medium text-gray-700">Color: {ci.selected_color}</span>
                              </>
                            )}
                            {ci.selected_size && (
                              <>
                                <span className="text-xs text-gray-400">·</span>
                                <span className="text-xs font-medium text-gray-700">Talla: {ci.selected_size}</span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="inline-flex items-center overflow-hidden rounded-xl border border-gray-200">
                            <button
                              type="button"
                              disabled={isUpdating || ci.quantity <= 1}
                              onClick={() => updateQuantity(ci.id, ci.quantity - 1)}
                              className="px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            >
                              −
                            </button>
                            <div className="px-3 py-2 text-sm font-semibold text-gray-900">{ci.quantity}</div>
                            <button
                              type="button"
                              disabled={isUpdating}
                              onClick={() => updateQuantity(ci.id, ci.quantity + 1)}
                              className="px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            >
                              +
                            </button>
                          </div>

                          <div className="text-sm font-bold text-gray-900">{formatMoney(price * ci.quantity)}</div>

                          <button
                            type="button"
                            disabled={isUpdating}
                            onClick={() => removeItem(ci.id)}
                            className="rounded-xl px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                          >
                            Quitar
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <aside className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
            <div className="text-sm font-semibold text-gray-900">Resumen</div>
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-gray-600">Subtotal</span>
              <span className="font-semibold text-gray-900">{formatMoney(subtotal)}</span>
            </div>
            <div className="mt-4 rounded-2xl border border-black/5 bg-gray-50 p-3">
              <div className="text-xs font-semibold text-gray-700">Cupón</div>
              <div className="mt-2 flex gap-2">
                <input
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value)}
                  placeholder="Código de cupón"
                  className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-pink"
                />
                <button
                  type="button"
                  onClick={applyCoupon}
                  disabled={!couponCode.trim() || cartItems.length === 0 || isApplying}
                  className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-60"
                >
                  {isApplying ? '…' : 'Aplicar'}
                </button>
              </div>
              {couponInfo && <div className="mt-2 text-xs text-gray-600">{couponInfo}</div>}
            </div>
            {couponDiscount > 0 && (
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-gray-600">Descuento</span>
                <span className="font-semibold text-gray-900">- {formatMoney(couponDiscount)}</span>
              </div>
            )}
            <div className="mt-6">
              {cartItems.some(ci => {
                 const l = listingsById[ci.listing_id];
                 const sid = l?.seller_id ?? l?.user_id;
                 return userId && sid && userId === sid;
              }) ? (
                <div className="mb-3 rounded-xl bg-red-100 p-3 text-center text-xs font-bold text-red-700">
                  Elimina tus propias publicaciones para continuar.
                </div>
              ) : null}

              <Link
                href="/checkout"
                className={`block w-full rounded-xl bg-brand-pink px-4 py-3 text-center text-sm font-semibold text-white shadow-lg hover:opacity-90 ${
                  cartItems.length === 0 || cartItems.some(ci => {
                    const l = listingsById[ci.listing_id];
                    const sid = l?.seller_id ?? l?.user_id;
                    return userId && sid && userId === sid;
                  }) ? 'pointer-events-none opacity-50' : ''
                }`}
              >
                Ir a pagar
              </Link>
              <p className="mt-3 text-xs font-medium text-brand-pink">
                No te quedes con las ganas procede al pago y sigue disfrutando de tus compras en rosa
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

