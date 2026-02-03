'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { applyShippingMarkup } from '@/lib/shippingMarkup';
import { calculateMercadoPagoFee } from '@/lib/fees';

type CartItemRow = {
  id: string;
  listing_id: string;
  quantity: number;
  selected_size?: string | null;
  selected_color?: string | null;
};

type ListingRow = {
  id: string;
  title?: string | null;
  name?: string | null;
  price?: number | string | null;
  user_id?: string | null;
  seller_id?: string | null;
  free_shipping?: boolean | null;
  shipping_subsidy?: number | null;
  allow_personal_delivery?: boolean | null;
  weight_kg?: number | null;
  length_cm?: number | null;
  width_cm?: number | null;
  height_cm?: number | null;
  shipping_by_seller?: boolean | null;
};

type SettingsRow = {
  commission_rate: number;
  shipping_base: number;
  shipping_markup_percent: number;
  shipping_markup_fixed: number;
  payment_methods: any;
  estafeta_config: any;
};

type PaymentKey = 'mercadopago' | 'bank_transfer' | 'bank_deposit' | 'oxxo' | 'pocketcash';

const PAYMENT_METHOD_LOGO: Partial<Record<PaymentKey, string>> = {
  mercadopago: '/payment-logos/mercadopago.png',
  bank_transfer: '/payment-logos/transferencia.png',
  bank_deposit: '/payment-logos/deposito.png',
  oxxo: '/payment-logos/oxxo.png',
  pocketcash: '/payment-logos/pocketcash.svg',
};

function formatMoney(value: number) {
  return value.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function getErrMessage(err: unknown) {
  if (!err) return '';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  const anyErr = err as any;
  if (typeof anyErr?.message === 'string') return anyErr.message;
  if (typeof anyErr?.error === 'string') return anyErr.error;
  try {
    return JSON.stringify(anyErr);
  } catch {
    return '';
  }
}

function getListingTitle(l: ListingRow) {
  return (l.title ?? l.name ?? 'Publicación').toString();
}

function getListingPrice(l: ListingRow) {
  const raw = l.price;
  const num = typeof raw === 'number' ? raw : Number(raw ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function getSellerId(l: ListingRow) {
  return (l.seller_id ?? l.user_id ?? null) as string | null;
}

export default function CheckoutPage() {
  const [isBooting, setIsBooting] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [isPlacing, setIsPlacing] = useState(false);
  const [showPocketCashSuccess, setShowPocketCashSuccess] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [couponDiscount, setCouponDiscount] = useState<number>(0);
  const [couponInfo, setCouponInfo] = useState<string | null>(null);
  const [couponDiscountBySeller, setCouponDiscountBySeller] = useState<Record<string, number>>({});
  const [didAutoApplyCoupon, setDidAutoApplyCoupon] = useState(false);

  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [cartItems, setCartItems] = useState<CartItemRow[]>([]);
  const [listingsById, setListingsById] = useState<Record<string, ListingRow>>({});
  const [settings, setSettings] = useState<SettingsRow>({
    commission_rate: 0.05,
    shipping_base: 180,
    shipping_markup_percent: 0,
    shipping_markup_fixed: 0,
    payment_methods: {},
    estafeta_config: null,
  });
  const [oldestCartItemDate, setOldestCartItemDate] = useState<string | null>(null);

  const [paymentMethod, setPaymentMethod] = useState<PaymentKey>('mercadopago');
  const [shippingOptions, setShippingOptions] = useState<Array<{ id: string; name: string; logo_url: string; cost: number; delivery_days: number; max_weight_kg?: number | null }>>([]);
  const [selectedShippingOptionId, setSelectedShippingOptionId] = useState<string | null>(null);
  
  // Perfiles para validar entrega personal
  const [buyerProfile, setBuyerProfile] = useState<{ state?: string; city?: string } | null>(null);
  const [sellerProfiles, setSellerProfiles] = useState<Record<string, { state?: string; city?: string; plan_type?: string }>>({});

  const subtotal = useMemo(() => {
    return cartItems.reduce((sum, ci) => {
      const listing = listingsById[ci.listing_id];
      const price = listing ? getListingPrice(listing) : 0;
      return sum + price * ci.quantity;
    }, 0);
  }, [cartItems, listingsById]);

  const potentialCashback = useMemo(() => {
    return subtotal * 0.03;
  }, [subtotal]);

  // Calcular envío basado en opción seleccionada o fallback a base; se aplica margen configurable
  const shippingFee = useMemo(() => {
    if (cartItems.length === 0) return 0;
    const pct = Number(settings.shipping_markup_percent ?? 0) || 0;
    const fix = Number(settings.shipping_markup_fixed ?? 0) || 0;

    // Agrupar por vendedor
    const groups: Record<string, CartItemRow[]> = {};
    for (const ci of cartItems) {
      const listing = listingsById[ci.listing_id];
      const sid = listing ? getSellerId(listing) : null;
      if (!sid) continue;
      if (!groups[sid]) groups[sid] = [];
      groups[sid].push(ci);
    }

    // Configuración de Estafeta (default si no existe)
    const estafetaConfig = settings.estafeta_config || {
      enabled: true,
      weight_ranges: [
        { max_weight_kg: 1, price: 168 },
        { max_weight_kg: 5, price: 170 },
        { max_weight_kg: 10, price: 225 },
        { max_weight_kg: 15, price: 240 },
        { max_weight_kg: 20, price: 260 },
        { max_weight_kg: 25, price: 275 },
        { max_weight_kg: 30, price: 295 },
        { max_weight_kg: 35, price: 295 },
        { max_weight_kg: 40, price: 310 },
        { max_weight_kg: 45, price: 385 },
        { max_weight_kg: 50, price: 435 },
        { max_weight_kg: 55, price: 465 },
        { max_weight_kg: 60, price: 485 },
      ],
    };

    let sum = 0;
    let isPickup = false;

    if (shippingOptions.length > 0 && selectedShippingOptionId === 'pickup') {
      isPickup = true;
    }

    for (const sid of Object.keys(groups)) {
      const groupItems = groups[sid];

      // Si el vendedor gestiona el envío, el costo es 0 (Acordar con vendedor) - SOLO SI ES PRO
      const isPro = sellerProfiles[sid]?.plan_type === 'pro';
      const hasSelfShipping = groupItems.some((ci) => Boolean(listingsById[ci.listing_id]?.shipping_by_seller));
      if (hasSelfShipping && isPro) {
        continue;
      }

      // Lógica de Entrega Personal
      if (isPickup) {
        const normalize = (s: string) => s.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const bState = normalize(buyerProfile?.state || '');
        const bCity = normalize(buyerProfile?.city || '');
        const sProf = sellerProfiles[sid];
        const sState = normalize(sProf?.state || '');
        const sCity = normalize(sProf?.city || '');
        
        const locationMatch = bState === sState && bCity === sCity;
        const allowedByItems = groupItems.every(ci => listingsById[ci.listing_id]?.allow_personal_delivery);
        
        if (locationMatch && allowedByItems) {
           continue; 
        } else {
           // Si no aplica pickup, usamos costo 0 por consistencia con lógica anterior, o debería fallar?
           // Asumimos 0.
           continue;
        }
      }

      // Calcular costo base
      let calculatedBaseCost = Number(settings.shipping_base || 0) || 0;
      let useEstafeta = true;

      if (shippingOptions.length > 0 && selectedShippingOptionId && selectedShippingOptionId !== 'pickup' && selectedShippingOptionId !== 'standard') {
        const selectedOption = shippingOptions.find((opt) => opt.id === selectedShippingOptionId);
        if (selectedOption) {
          calculatedBaseCost = Number(selectedOption.cost) || 0;
          useEstafeta = false;
        }
      }

      if (useEstafeta && estafetaConfig.enabled && Array.isArray(estafetaConfig.weight_ranges)) {
        let totalWeight = 0;
        for (const item of groupItems) {
          const l = listingsById[item.listing_id];
          const w = Number(l?.weight_kg) || 1;
          const len = Number(l?.length_cm) || 10;
          const wid = Number(l?.width_cm) || 10;
          const h = Number(l?.height_cm) || 10;
          
          const volW = (len * wid * h) / 5000;
          const finalW = Math.max(w, volW);
          totalWeight += (finalW * item.quantity);
        }
        
        const ranges = [...estafetaConfig.weight_ranges].sort((a: any, b: any) => (a.max_weight_kg || 0) - (b.max_weight_kg || 0));
        const match = ranges.find((r: any) => totalWeight <= (r.max_weight_kg || 0));
        if (match) {
          calculatedBaseCost = Number(match.price) || calculatedBaseCost;
        } else if (ranges.length > 0) {
          const maxRange = ranges[ranges.length - 1];
          if (totalWeight > (maxRange.max_weight_kg || 0)) {
             calculatedBaseCost = Number(maxRange.price) || calculatedBaseCost;
          }
        }
      }

      const costWithMarkup = applyShippingMarkup(calculatedBaseCost, pct, fix);

      // Cálculo de subsidio (item-level)
      let totalSubsidy = 0;
      for (const item of groupItems) {
        const l = listingsById[item.listing_id];
        const sub = Number(l?.shipping_subsidy) || 0;
        const isFree = Boolean(l?.free_shipping);
        
        if (isFree && sub === 0) {
           totalSubsidy += 999999;
        } else {
           totalSubsidy += (sub * item.quantity);
        }
      }

      const finalSubsidy = Math.min(totalSubsidy, costWithMarkup);
      const finalFee = Math.max(0, costWithMarkup - finalSubsidy);
      sum += finalFee;
    }
    return sum;
  }, [cartItems, listingsById, settings, shippingOptions, selectedShippingOptionId, buyerProfile, sellerProfiles]);
  const allSelfShipping = useMemo(() => {
    if (cartItems.length === 0) return false;
    // Agrupar items por vendedor
    const groups: Record<string, CartItemRow[]> = {};
    for (const ci of cartItems) {
      const listing = listingsById[ci.listing_id];
      const sid = listing ? getSellerId(listing) : null;
      if (!sid) continue;
      if (!groups[sid]) groups[sid] = [];
      groups[sid].push(ci);
    }
    
    const sids = Object.keys(groups);
    if (sids.length === 0) return false;

    // Verificar si TODOS los vendedores tienen shipping_by_seller Y son PRO
    return sids.every((sid) => {
      const groupItems = groups[sid];
      const hasSelfShipping = groupItems.some((ci) => listingsById[ci.listing_id]?.shipping_by_seller);
      const isPro = sellerProfiles[sid]?.plan_type === 'pro';
      return hasSelfShipping && isPro;
    });
  }, [cartItems, listingsById, sellerProfiles]);

  const paymentDetails = useMemo(() => {
    const baseTotal = Math.max(0, subtotal - couponDiscount) + shippingFee;
    if (paymentMethod === 'mercadopago') {
      return calculateMercadoPagoFee(baseTotal);
    }
    return { originalAmount: baseTotal, fee: 0, total: baseTotal };
  }, [subtotal, couponDiscount, shippingFee, paymentMethod]);

  // Calcular tiempo desde que se agregó el primer item al carrito (48 horas para pagar) - actualizado cada segundo
  const [currentTime, setCurrentTime] = useState(new Date());
  
  useEffect(() => {
    if (!oldestCartItemDate) return;
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, [oldestCartItemDate]);

  const timeRemaining = useMemo(() => {
    if (!oldestCartItemDate) return null;
    const created = new Date(oldestCartItemDate);
    const deadline = new Date(created.getTime() + 48 * 60 * 60 * 1000); // 48 horas desde que se agregó al carrito
    const diff = deadline.getTime() - currentTime.getTime();
    if (diff <= 0) return { expired: true, hours: 0, minutes: 0, seconds: 0 };
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    return { expired: false, hours, minutes, seconds };
  }, [oldestCartItemDate, currentTime]);

  const enabledMethods = useMemo(() => {
    const pm = settings.payment_methods || {};
    const list: Array<{ key: PaymentKey; label: string }> = [];
    // MercadoPago incluye pagos con tarjeta (débito/crédito) y opciones según país/cuenta.
    if (pm?.mercadopago?.enabled) list.push({ key: 'mercadopago', label: 'Tarjeta (MercadoPago)' });
    if (pm?.bank_transfer?.enabled) list.push({ key: 'bank_transfer', label: 'Transferencia bancaria' });
    if (pm?.bank_deposit?.enabled) list.push({ key: 'bank_deposit', label: 'Depósito bancario' });
      if (pm?.oxxo?.enabled) list.push({ key: 'oxxo', label: 'OXXO' });
      // PocketCash check
      if (pm?.pocketcash?.enabled) {
        // Solo mostrar si el balance cubre el total (estimado)
        // Nota: El total exacto se calcula en paymentDetails, pero paymentDetails depende del método seleccionado (fees).
        // Para habilitarlo en la lista, usamos el subtotal + envío como referencia base.
        // O mejor: Lo mostramos siempre pero lo deshabilitamos visualmente o mostramos error si se selecciona sin saldo.
        // El usuario pidió: "si se tiene el 100% del valor... agrega la forma de pago".
        // Así que lo agregamos a la lista, pero validaremos al seleccionar.
        list.push({ key: 'pocketcash', label: 'PocketCash' });
      }
      return list;
  }, [settings]);

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
        if (!cancelled) setUserId(userData.user.id);

        const { data: wallet } = await supabase
          .from('wallets')
          .select('balance')
          .eq('user_id', userData.user.id)
          .maybeSingle();
        
        if (wallet) {
          setWalletBalance(Number(wallet.balance) || 0);
        }

        const [{ data: settingsRow }, { data: cartData, error: cartErr }, { data: shippingData }] = await Promise.all([
          supabase.from('app_settings').select('commission_rate, shipping_base, shipping_markup_percent, shipping_markup_fixed, payment_methods, estafeta_config').eq('id', 1).maybeSingle(),
          supabase.from('cart_items').select('id, listing_id, quantity, selected_size, selected_color, created_at').order('created_at', { ascending: true }),
          supabase.from('shipping_options').select('id, name, logo_url, cost, delivery_days, max_weight_kg').eq('is_active', true).order('display_order', { ascending: true }),
        ]);

        if (cartErr) throw cartErr;

        if (!cancelled && settingsRow) {
          setSettings({
            commission_rate: Number((settingsRow as any).commission_rate ?? 0.05),
            shipping_base: Number((settingsRow as any).shipping_base ?? 180),
            shipping_markup_percent: Number((settingsRow as any).shipping_markup_percent ?? 0),
            shipping_markup_fixed: Number((settingsRow as any).shipping_markup_fixed ?? 0),
            payment_methods: (settingsRow as any).payment_methods ?? {},
            estafeta_config: (settingsRow as any).estafeta_config ?? null,
          });
        }

        // Cargar opciones de envío activas
        if (!cancelled && shippingData && Array.isArray(shippingData) && shippingData.length > 0) {
          const opts = [...shippingData];
          setShippingOptions(opts as any);
          // Seleccionar la primera opción por defecto
          setSelectedShippingOptionId((shippingData[0] as any).id);
        }

        const items = (cartData as any[]) ?? [];
        if (cancelled) return;
        setCartItems(items.map((item) => ({ id: item.id, listing_id: item.listing_id, quantity: item.quantity })));
        
        // Obtener la fecha del item más antiguo para calcular el tiempo desde que se agregó al carrito
        if (items.length > 0) {
          const oldest = items[0];
          setOldestCartItemDate(oldest.created_at || null);
        } else {
          setOldestCartItemDate(null);
        }

        const listingIds = Array.from(new Set(items.map((i) => i.listing_id)));
        if (listingIds.length === 0) {
          setListingsById({});
          return;
        }

        const { data: listings, error: listingsErr } = await supabase.from('listings').select('*').in('id', listingIds);
        if (listingsErr) throw listingsErr;

        // Cargar perfiles de vendedores (para validar plan PRO y ubicación)
        const sIds = Array.from(new Set((listings as ListingRow[]).map((l) => getSellerId(l)).filter(Boolean))) as string[];
        if (sIds.length > 0) {
          const { data: sProfs } = await supabase.from('profiles').select('id, state, city, plan_type').in('id', sIds);
          const sMap: Record<string, { state?: string; city?: string; plan_type?: string }> = {};
          sProfs?.forEach((p) => {
            sMap[p.id] = { state: p.state, city: p.city, plan_type: p.plan_type };
          });
          if (!cancelled) setSellerProfiles(sMap);
        }

        // Cargar perfil de comprador (para validar ubicación)
        const { data: bProf } = await supabase.from('profiles').select('state, city').eq('id', userData.user.id).maybeSingle();
        if (!cancelled && bProf) {
          setBuyerProfile(bProf);
        }

        const map: Record<string, ListingRow> = {};
        for (const row of (listings as ListingRow[]) ?? []) map[row.id] = row;
        if (!cancelled) {
          setListingsById(map);
          setCouponDiscount(0);
          setCouponInfo(null);
          setCouponDiscountBySeller({});
        }
      } catch (err: unknown) {
        console.error(err);
        if (!cancelled) setPageError(err instanceof Error ? err.message : 'No se pudo cargar el checkout.');
      } finally {
        if (!cancelled) setIsBooting(false);
      }
    };

    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  // Limpiar error cuando cambia el saldo o método de pago
  useEffect(() => {
    setPageError(null);
  }, [walletBalance, paymentMethod]);

  // Suscripción a cambios en saldo (Realtime) para mantener la UI sincronizada si recarga en otra pestaña
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`wallet-checkout-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'wallets',
          filter: `user_id=eq.${userId}`,
        },
        (payload: any) => {
          if (payload.new && typeof payload.new.balance !== 'undefined') {
            setWalletBalance(Number(payload.new.balance) || 0);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // Si el comprador escribió cupón en Carrito, lo guardamos en localStorage para pre-llenar aquí
  useEffect(() => {
    try {
      const saved = typeof window !== 'undefined' ? window.localStorage.getItem('pocket_coupon_code') : null;
      if (saved && !couponCode) setCouponCode(saved);
    } catch {
      // noop
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Detectar si "Entrega Personal" está disponible y agregarlo a opciones
  useEffect(() => {
    if (cartItems.length === 0 || !buyerProfile) return;
    
    // Verificar si todos los grupos cumplen con ubicación y permiso
    const groups: Record<string, CartItemRow[]> = {};
    for (const ci of cartItems) {
      const listing = listingsById[ci.listing_id];
      const sid = listing ? getSellerId(listing) : null;
      if (!sid) continue;
      if (!groups[sid]) groups[sid] = [];
      groups[sid].push(ci);
    }

    const sellerIds = Object.keys(groups);
    if (sellerIds.length === 0) return;

    const normalize = (s: string) => s.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const bState = normalize(buyerProfile.state || '');
    const bCity = normalize(buyerProfile.city || '');

    let allGroupsEligible = true;
    for (const sid of sellerIds) {
      const sProf = sellerProfiles[sid];
      if (!sProf) {
        allGroupsEligible = false;
        break;
      }
      const sState = normalize(sProf.state || '');
      const sCity = normalize(sProf.city || '');
      
      const isPro = sProf.plan_type === 'pro';
      if (!isPro) {
        allGroupsEligible = false;
        break;
      }
      
      const locationMatch = bState === sState && bCity === sCity;
      if (!locationMatch) {
        allGroupsEligible = false;
        break;
      }

      const groupItems = groups[sid];
      const allowedByItems = groupItems.every(ci => listingsById[ci.listing_id]?.allow_personal_delivery);
      if (!allowedByItems) {
        allGroupsEligible = false;
        break;
      }
    }

    if (allGroupsEligible) {
      setShippingOptions(prev => {
        const hasPickup = prev.some(o => o.id === 'pickup');
        const hasStandard = prev.some(o => o.id === 'standard');
        const hasOther = prev.some(o => o.id !== 'pickup' && o.id !== 'standard');
        
        let newOpts = [...prev];

        // Si no hay otras opciones (modo implícito), agregamos explícitamente "Envío Estándar"
        if (!hasOther && !hasStandard) {
           newOpts.unshift({
              id: 'standard',
              name: 'Envío Estándar',
              logo_url: '',
              cost: settings.shipping_base,
              delivery_days: 3, 
              max_weight_kg: null
           });
        }

        if (!hasPickup) {
           newOpts.push({
            id: 'pickup',
            name: 'Entrega Personal (Gratis)',
            logo_url: '',
            cost: 0,
            delivery_days: 1,
            max_weight_kg: 999
          });
        }
        
        if (!selectedShippingOptionId) {
           // Si acabamos de crear 'standard', preseleccionarlo para mantener comportamiento por defecto
           if (!hasOther && !hasStandard) {
               setTimeout(() => setSelectedShippingOptionId('standard'), 0);
           } else if (!hasPickup) {
               setTimeout(() => setSelectedShippingOptionId('pickup'), 0);
           }
        }
        return newOpts;
      });
    } else {
      setShippingOptions(prev => {
        let next = prev.filter(o => o.id !== 'pickup');
        // Si solo queda 'standard', volver a modo implícito
        const hasOther = next.some(o => o.id !== 'standard');
        if (!hasOther && next.some(o => o.id === 'standard')) {
            next = next.filter(o => o.id !== 'standard');
        }
        return next;
      });
      if (selectedShippingOptionId === 'pickup') {
        setSelectedShippingOptionId(null);
      }
    }
  }, [cartItems, listingsById, buyerProfile, sellerProfiles, selectedShippingOptionId, settings]);

  // Asegurar que el método seleccionado siga habilitado
  useEffect(() => {
    if (enabledMethods.length === 0) return;
    if (!enabledMethods.find((m) => m.key === paymentMethod)) {
      setPaymentMethod(enabledMethods[0].key);
    }
  }, [enabledMethods, paymentMethod]);

  const applyCoupon = async () => {
    setPageError(null);
    setSuccess(null);
    setCouponInfo(null);
    setCouponDiscount(0);
    setCouponDiscountBySeller({});

    const code = couponCode.trim().toUpperCase();
    if (!code) {
      setPageError('Ingresa un cupón.');
      return;
    }
    if (cartItems.length === 0) {
      setPageError('Tu carrito está vacío.');
      return;
    }

    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      if (!userData.user) {
        window.location.href = '/';
        return;
      }

      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) throw sessionErr;
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('No se encontró el token de sesión para aplicar cupón.');

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

      const bySeller = (json?.discountBySeller ?? json?.discount_by_seller ?? {}) as Record<string, any>;
      const normalizedBySeller: Record<string, number> = {};
      let sum = 0;
      for (const [sid, v] of Object.entries(bySeller || {})) {
        const n = typeof v === 'number' ? v : Number(v ?? 0);
        const nn = Number.isFinite(n) ? n : 0;
        if (sid) normalizedBySeller[sid] = nn;
        sum += nn;
      }
      const discount = Number(json?.discount ?? sum ?? 0);
      const finalDiscount = Number.isFinite(discount) ? discount : sum;
      setCouponDiscount(finalDiscount);
      setCouponDiscountBySeller(normalizedBySeller);
      setCouponInfo(`Cupón aplicado. Descuento: ${formatMoney(finalDiscount)}.`);
      setSuccess('Cupón aplicado.');
    } catch (e: unknown) {
      console.error(e);
      setPageError(e instanceof Error ? e.message : 'No se pudo aplicar el cupón.');
    }
  };

  // Auto-aplicar si viene desde Carrito (y ya cargó el carrito)
  useEffect(() => {
    if (didAutoApplyCoupon) return;
    if (!couponCode.trim()) return;
    if (cartItems.length === 0) return;
    setDidAutoApplyCoupon(true);
    void applyCoupon();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [didAutoApplyCoupon, couponCode, cartItems.length]);

  const placeOrder = async () => {
    setPageError(null);
    setSuccess(null);
    setIsPlacing(true);

    try {
      if (cartItems.length === 0) {
        setPageError('Tu carrito está vacío.');
        return;
      }

      // Validar saldo para PocketCash antes de crear nada
      if (paymentMethod === 'pocketcash') {
         if (walletBalance < paymentDetails.total) {
            setPageError(`Saldo insuficiente (${formatMoney(walletBalance)}). Necesitas ${formatMoney(paymentDetails.total)} para completar esta compra.`);
            setIsPlacing(false);
            return;
         }
      }

      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) throw sessionErr;
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        window.location.href = `/login?returnTo=${encodeURIComponent('/checkout')}`;
        return;
      }

      // Crear órdenes en server-side (fuente de verdad de precios/cupón/envío)
      const createRes = await fetch('/api/checkout/create-v2', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          cartItems: cartItems.map((c) => ({ 
            listingId: c.listing_id, 
            quantity: c.quantity,
            selected_size: c.selected_size || null,
            selected_color: c.selected_color || null,
          })),
          payment_method: paymentMethod,
          coupon_code: couponCode.trim().toUpperCase() || null,
          shipping_option_id: selectedShippingOptionId || null,
        }),
      });
      const createJson = await createRes.json().catch(() => ({} as any));
      if (!createRes.ok) {
        const errText = String(createJson?.error || 'No se pudo crear la orden.');
        if (errText === 'address_required') {
          const returnTo = encodeURIComponent('/checkout');
          window.location.href = `/dashboard/perfil?returnTo=${returnTo}&reason=address_required`;
          return;
        }
        throw new Error(errText);
      }

      const createdOrderIds = (createJson?.orderIds as string[] | undefined) ?? [];
      if (createdOrderIds.length === 0) throw new Error('No se recibieron orderIds.');

      if (paymentMethod === 'pocketcash') {
        setSuccess('¡Pago exitoso!');
        
        // Vaciar carrito
        const cartItemIds = cartItems.map((c) => c.id);
        await supabase.from('cart_items').delete().in('id', cartItemIds);
        
        // Mostrar modal de éxito (sin redirigir automáticamente para dar feedback visual)
        setShowPocketCashSuccess(true);
        return;
      }

      if (paymentMethod === 'mercadopago') {
        setSuccess('Orden creada. Redirigiendo a MercadoPago…');

        const prefRes = await fetch('/api/mercadopago/preference', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${accessToken}`,
          },
          // El server calcula el amount real (no confiar en el cliente)
          body: JSON.stringify({ orderIds: createdOrderIds }),
        });

        const prefJson = await prefRes.json().catch(() => ({}));
        if (!prefRes.ok) {
          let errorMsg = prefJson?.error || 'No se pudo crear la preferencia de MercadoPago.';
          if (prefJson?.details && Array.isArray(prefJson.details)) {
            errorMsg += ` Detalle: ${prefJson.details.join(', ')}`;
          }
          throw new Error(errorMsg);
        }

        const redirectUrl = prefJson?.init_point || prefJson?.sandbox_init_point;
        if (!redirectUrl) throw new Error('MercadoPago no devolvió un init_point para redirigir.');

        // No vaciar carrito aquí: se limpia en el webhook cuando el pago se acredita.
        // Si el usuario abandona en MP, conserva su carrito.
        window.location.href = redirectUrl;
        return;
      }

      // Métodos offline: crear hoja de pago con referencia y permitir descargar PDF
      console.log('[CHECKOUT] Creando sesión de pago offline...', { 
        orderIds: createdOrderIds, 
        paymentMethod,
        orderIdsCount: createdOrderIds.length,
      });
      
      const slipRes = await fetch('/api/offline-payment/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
        // El server calcula el amount real (no confiar en el cliente)
        body: JSON.stringify({ orderIds: createdOrderIds, payment_method: paymentMethod }),
      });
      
      console.log('[CHECKOUT] Respuesta de offline-payment/create:', { 
        status: slipRes.status, 
        ok: slipRes.ok,
      });
      
      const slipJson = await slipRes.json().catch((parseErr) => {
        console.error('[CHECKOUT] Error parseando respuesta:', parseErr);
        return { error: 'Error al procesar respuesta del servidor' };
      });
      
      console.log('[CHECKOUT] JSON respuesta:', slipJson);
      
      if (!slipRes.ok) {
        const errorMsg = slipJson?.error || `No se pudo generar la hoja de pago (${slipRes.status}).`;
        console.error('[CHECKOUT] Error creando sesión offline:', errorMsg);
        throw new Error(errorMsg);
      }

      if (!slipJson?.ok) {
        const errorMsg = slipJson?.error || 'No se pudo generar la hoja de pago.';
        console.error('[CHECKOUT] Respuesta no exitosa:', errorMsg);
        throw new Error(errorMsg);
      }

      const checkoutId = String(slipJson?.checkoutId || '').trim();
      if (!checkoutId) {
        console.error('[CHECKOUT] No se recibió checkoutId:', slipJson);
        throw new Error('No se recibió checkoutId para la hoja de pago.');
      }

      console.log('[CHECKOUT] ✅ Sesión offline creada exitosamente:', {
        checkoutId,
        reference_code: slipJson?.reference_code,
        reused: slipJson?.reused || false,
      });

      const cartItemIds = cartItems.map((c) => c.id);
      const { error: clearErr } = await supabase.from('cart_items').delete().in('id', cartItemIds);
      if (clearErr) {
        console.warn('[CHECKOUT] Error vaciando carrito (no crítico):', clearErr);
        // No fallar por esto, solo loguear
      }

      window.location.href = `/pago/${checkoutId}`;
    } catch (err: unknown) {
      console.error(err);
      setSuccess(null);
      setPageError(getErrMessage(err) || 'No se pudo crear la orden.');
    } finally {
      setIsPlacing(false);
    }
  };

  const methodInstructions = useMemo(() => {
    const pm = settings.payment_methods || {};
    if (paymentMethod === 'bank_transfer') return pm?.bank_transfer?.instructions ?? '';
    if (paymentMethod === 'bank_deposit') return pm?.bank_deposit?.instructions ?? '';
    if (paymentMethod === 'oxxo') return pm?.oxxo?.instructions ?? '';
    return '';
  }, [paymentMethod, settings]);

  if (isBooting) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-pink-50 to-white">
        <div className="mx-auto max-w-5xl px-4 py-10">
          <div className="h-12 rounded-2xl bg-white/70 ring-1 ring-black/5" />
          <div className="mt-6 h-80 rounded-2xl bg-white/70 ring-1 ring-black/5" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 to-white">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="flex items-center justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-pink-50 px-3 py-1 text-xs font-semibold text-brand-pink ring-1 ring-pink-100">
              Checkout
            </div>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-gray-900">Pagar</h1>
            <p className="mt-2 text-sm text-gray-600">Elige tu método de pago y confirma tu compra.</p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/cart"
              className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-black/5 hover:bg-gray-50"
            >
              Volver al carrito
            </Link>
          </div>
        </div>

        {pageError && (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {pageError}
          </div>
        )}
        {success && (
          <div className="mt-6 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            {success}
          </div>
        )}

        {/* Advertencia de 48 horas */}
        {cartItems.length > 0 && timeRemaining && (
          <div
            className={`mt-6 rounded-2xl border px-4 py-4 shadow-sm ${
              timeRemaining.expired
                ? 'border-red-300 bg-red-50'
                : timeRemaining.hours < 12
                  ? 'border-amber-300 bg-amber-50'
                  : 'border-orange-300 bg-orange-50'
            }`}
          >
            <div className="flex items-start gap-3">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke={timeRemaining.expired ? '#dc2626' : timeRemaining.hours < 12 ? '#d97706' : '#ea580c'}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mt-0.5 shrink-0"
              >
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <div className="flex-1">
                <div className={`text-sm font-extrabold ${timeRemaining.expired ? 'text-red-900' : timeRemaining.hours < 12 ? 'text-amber-900' : 'text-orange-900'}`}>
                  {timeRemaining.expired
                    ? '⚠️ Tiempo de pago vencido'
                    : `⚠️ Tiempo restante para pagar: ${timeRemaining.hours}h ${timeRemaining.minutes}m ${timeRemaining.seconds}s`}
                </div>
                <div className={`mt-1 text-xs ${timeRemaining.expired ? 'text-red-800' : timeRemaining.hours < 12 ? 'text-amber-800' : 'text-orange-800'}`}>
                  {timeRemaining.expired
                    ? 'El plazo de 48 horas ha expirado. Tu reputación como comprador se verá afectada negativamente si no completas el pago.'
                    : 'Tienes 48 horas desde que agregaste el primer artículo al carrito para completar tu pago. Si no pagas a tiempo, tu reputación como comprador se verá afectada negativamente.'}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
              <h2 className="text-lg font-bold text-gray-900">Método de pago</h2>
              <p className="mt-1 text-sm text-gray-600">Estos métodos son configurables por el administrador.</p>

              {enabledMethods.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  No hay métodos de pago habilitados. Revisa `app_settings.payment_methods`.
                </div>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {enabledMethods.map((m) => (
                    <label
                      key={m.key}
                      className={`cursor-pointer rounded-2xl border p-4 text-sm ${
                        paymentMethod === m.key ? 'border-brand-pink bg-pink-50' : 'border-black/5 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          {PAYMENT_METHOD_LOGO[m.key] ? (
                            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-black/5">
                              <Image
                                src={PAYMENT_METHOD_LOGO[m.key] as string}
                                alt={m.label}
                                width={40}
                                height={40}
                                className="h-7 w-7 object-contain"
                              />
                            </div>
                          ) : null}
                          <div className="min-w-0">
                            <div className="font-semibold text-gray-900">{m.label}</div>
                            <div className="mt-0.5 text-xs text-gray-600">
                              {m.key === 'mercadopago'
                                ? 'Débito / crédito'
                                : m.key === 'oxxo'
                                  ? 'Pago en efectivo'
                                  : m.key === 'bank_transfer'
                                    ? 'SPEI'
                                    : m.key === 'bank_deposit'
                                      ? 'Sucursal / cajero'
                                      : m.key === 'pocketcash'
                                        ? `Saldo disponible: ${formatMoney(walletBalance)}`
                                        : ''}
                            </div>
                          </div>
                        </div>
                        <input
                          type="radio"
                          name="paymentMethod"
                          value={m.key}
                          checked={paymentMethod === m.key}
                          onChange={() => setPaymentMethod(m.key)}
                        />
                      </div>
                    </label>
                  ))}
                </div>
              )}

              {['bank_transfer', 'bank_deposit', 'oxxo'].includes(paymentMethod) && (
                <div className="mt-4 rounded-2xl border border-black/5 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                  {paymentMethod === 'bank_transfer' && settings.payment_methods?.bank_transfer && (
                    <div className="space-y-1 mb-3 pb-3 border-b border-black/5">
                       {settings.payment_methods.bank_transfer.bank_name && <div><span className="font-semibold">Banco:</span> {settings.payment_methods.bank_transfer.bank_name}</div>}
                       {settings.payment_methods.bank_transfer.account_holder && <div><span className="font-semibold">Beneficiario:</span> {settings.payment_methods.bank_transfer.account_holder}</div>}
                       {settings.payment_methods.bank_transfer.clabe && <div><span className="font-semibold">CLABE:</span> <span className="font-mono">{settings.payment_methods.bank_transfer.clabe}</span></div>}
                    </div>
                  )}
                  {paymentMethod === 'bank_deposit' && settings.payment_methods?.bank_deposit && (
                    <div className="space-y-1 mb-3 pb-3 border-b border-black/5">
                       {settings.payment_methods.bank_deposit.bank_name && <div><span className="font-semibold">Banco:</span> {settings.payment_methods.bank_deposit.bank_name}</div>}
                       {settings.payment_methods.bank_deposit.account_holder && <div><span className="font-semibold">Beneficiario:</span> {settings.payment_methods.bank_deposit.account_holder}</div>}
                       {settings.payment_methods.bank_deposit.account_number && <div><span className="font-semibold">Cuenta:</span> <span className="font-mono">{settings.payment_methods.bank_deposit.account_number}</span></div>}
                    </div>
                  )}

                  {methodInstructions && (
                    <div className="whitespace-pre-wrap">
                      <div className="text-xs font-semibold text-gray-700">Instrucciones</div>
                      <div className="mt-1">{methodInstructions}</div>
                    </div>
                  )}
                </div>
              )}

              {paymentMethod === 'mercadopago' && (
                <div className="mt-4 rounded-2xl border border-black/5 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                  <div className="text-xs font-semibold text-gray-700">Tarjeta (MercadoPago)</div>
                  <div className="mt-1">
                    Paga con <span className="font-semibold">tarjeta de débito/crédito</span>. Te redirigiremos a MercadoPago para completar el pago (3DS/seguridad).
                  </div>
                  <div className="mt-2 text-xs text-gray-600">
                    Al acreditarse el pago, te regresamos a GoPocket y se actualiza el estado automáticamente vía webhook.
                  </div>
                </div>
              )}
            </section>

            {shippingOptions.length > 0 && !allSelfShipping && (
              <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
                <h2 className="text-lg font-bold text-gray-900">Opción de envío</h2>
                <p className="mt-1 text-sm text-gray-600">Elige la paquetería y método de envío que prefieras.</p>

                <div className="mt-4 grid gap-3">
                  {shippingOptions.map((option) => (
                    <label
                      key={option.id}
                      className={`cursor-pointer rounded-2xl border p-4 text-sm transition ${
                        selectedShippingOptionId === option.id ? 'border-brand-pink bg-pink-50' : 'border-black/5 bg-white hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          {option.logo_url ? (
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-black/5">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={option.logo_url} alt={option.name} className="h-10 w-10 object-contain" />
                            </div>
                          ) : (
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gray-100 ring-1 ring-black/5">
                              <span className="text-xs font-semibold text-gray-500">{option.name.slice(0, 2).toUpperCase()}</span>
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-gray-900">{option.name}</div>
                            <div className="mt-0.5 text-xs text-gray-600">
                              {option.delivery_days === 1 ? 'Entrega en 1 día' : `Entrega en ${option.delivery_days} días`} · {formatMoney(applyShippingMarkup(option.cost, settings.shipping_markup_percent ?? 0, settings.shipping_markup_fixed ?? 0))}
                              {option.max_weight_kg ? ` · Hasta ${option.max_weight_kg} KG` : ''}
                            </div>
                          </div>
                        </div>
                        <input
                          type="radio"
                          name="shippingOption"
                          value={option.id}
                          checked={selectedShippingOptionId === option.id}
                          onChange={() => setSelectedShippingOptionId(option.id)}
                          className="h-4 w-4 text-brand-pink focus:ring-brand-pink"
                        />
                      </div>
                    </label>
                  ))}
                </div>
              </section>
            )}

            {allSelfShipping && (
              <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
                <h2 className="text-lg font-bold text-gray-900">Opción de envío</h2>
                <div className="mt-4 rounded-2xl border border-black/5 bg-white p-4 text-sm font-bold text-gray-900">
                  ENVIO ACORDAR CON EL VENDEDOR
                </div>
              </section>
            )}

            <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
              <h2 className="text-lg font-bold text-gray-900">Artículos</h2>
              <div className="mt-4 space-y-3">
                {cartItems.length === 0 ? (
                  <div className="text-sm text-gray-600">Tu carrito está vacío.</div>
                ) : (
                  cartItems.map((ci) => {
                    const listing = listingsById[ci.listing_id];
                    const title = listing ? getListingTitle(listing) : 'Publicación';
                    const price = listing ? getListingPrice(listing) : 0;
                    return (
                      <div key={ci.id} className="flex items-center justify-between rounded-2xl border border-black/5 px-4 py-3">
                        <div>
                          <div className="text-sm font-semibold text-gray-900">{title}</div>
                          <div className="mt-1 text-xs text-gray-500">
                            {ci.quantity} × {formatMoney(price)}
                          </div>
                        </div>
                        <div className="text-sm font-bold text-gray-900">{formatMoney(price * ci.quantity)}</div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </div>

          <aside className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
            <div className="text-sm font-semibold text-gray-900">Resumen</div>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-semibold text-gray-900">{formatMoney(subtotal)}</span>
              </div>
              <div className="rounded-2xl border border-black/5 bg-gray-50 p-3">
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
                    disabled={!couponCode.trim() || cartItems.length === 0}
                    className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-60"
                  >
                    Aplicar
                  </button>
                </div>
                {couponInfo && <div className="mt-2 text-xs font-medium text-green-600">{couponInfo}</div>}
              </div>
              {couponDiscount > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Descuento</span>
                  <span className="font-semibold text-gray-900">- {formatMoney(couponDiscount)}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Envío</span>
                <span className="font-semibold text-gray-900">{formatMoney(shippingFee)}</span>
              </div>
              <div className="border-t border-black/5 pt-2 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-gray-900 font-semibold">Total</span>
                  <span className="text-gray-900 font-extrabold">{formatMoney(paymentDetails.total)}</span>
                </div>
                {paymentDetails.fee > 0 && (
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>(Incluye {formatMoney(paymentDetails.fee)} de comisión por pago con tarjeta)</span>
                  </div>
                )}
              </div>
            </div>

            {paymentMethod !== 'pocketcash' && potentialCashback > 0 && (
              <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-3 text-center">
                <div className="text-xs font-bold text-green-800">¡Cashback!</div>
                <div className="text-sm text-green-900">
                  Recibirás <span className="font-bold">{formatMoney(potentialCashback)}</span> en PocketCash por esta compra.
                </div>
                <div className="mt-1 text-[10px] text-green-700 leading-tight">
                  (3% sobre el valor de los productos)
                </div>
              </div>
            )}
            {paymentMethod === 'pocketcash' && (
              <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3 text-center">
                <div className="text-xs text-gray-500">
                  Al pagar con PocketCash no generas nuevo cashback.
                </div>
              </div>
            )}

            <button
              type="button"
              disabled={isPlacing || cartItems.length === 0 || enabledMethods.length === 0}
              onClick={placeOrder}
              className="mt-6 w-full rounded-xl bg-brand-pink px-4 py-3 text-sm font-semibold text-white shadow-lg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPlacing ? 'Creando orden…' : 'Confirmar compra'}
            </button>

            <p className="mt-3 text-xs text-gray-500">
              Se crearán órdenes separadas por vendedor. El método de pago se guarda en cada orden.
            </p>
          </aside>
        </div>
      </div>

      {/* PocketCash Success Modal */}
      {showPocketCashSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl ring-1 ring-black/5 animate-in fade-in zoom-in duration-300">
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 ring-8 ring-green-50">
                <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              
              <h3 className="text-xl font-bold text-gray-900">¡Pago Exitoso!</h3>
              <p className="mt-2 text-sm text-gray-600">
                Tu pago con PocketCash se ha procesado correctamente.
              </p>
              
              <div className="mt-6 w-full space-y-3">
                <Link
                  href="/dashboard/compras"
                  className="flex w-full items-center justify-center rounded-xl bg-brand-pink px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-pink/20 transition hover:bg-pink-600 active:scale-95"
                >
                  Ver mis compras
                </Link>
                <Link
                  href="/"
                  className="flex w-full items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 active:scale-95"
                >
                  Seguir comprando
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

