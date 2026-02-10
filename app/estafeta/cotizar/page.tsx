'use client';

import Link from 'next/link';
import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase/client';

type EstafetaWeightRange = {
  max_weight_kg: number;
  price: number;
};

type EstafetaConfig = {
  enabled: boolean;
  weight_ranges: EstafetaWeightRange[];
  min_weight_kg?: number;
  max_weight_kg?: number;
};

function formatMoney(v: number) {
  return v.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

// Componente helper para campos con límite de 25 caracteres y checkmark
function LimitedInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  className = '',
  ...props
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
  className?: string;
  [key: string]: any;
}) {
  const maxLength = 25;
  const hasContent = value.length > 0;
  const isComplete = value.length === maxLength;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Limitar estrictamente a 25 caracteres
    const newValue = e.target.value.slice(0, maxLength);
    const syntheticEvent = {
      ...e,
      target: { ...e.target, value: newValue },
      currentTarget: { ...e.currentTarget, value: newValue },
    } as React.ChangeEvent<HTMLInputElement>;
    onChange(syntheticEvent);
  };

  return (
    <div className="relative">
      <input
        type={type}
        value={value}
        onChange={handleChange}
        maxLength={maxLength}
        placeholder={placeholder}
        className={`${className} ${hasContent ? 'border-green-500 focus:border-green-500 pr-10' : ''}`}
        {...props}
      />
      {hasContent && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-green-600"
          >
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
      )}
    </div>
  );
}

export default function EstafetaCotizarPage() {
  const [isBooting, setIsBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [config, setConfig] = useState<EstafetaConfig | null>(null);
  const [calculatedCost, setCalculatedCost] = useState<number | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isCreatingPayment, setIsCreatingPayment] = useState(false);
  const [volumetricWeight, setVolumetricWeight] = useState<number | null>(null);
  const [physicalWeight, setPhysicalWeight] = useState<number | null>(null);
  const [finalWeight, setFinalWeight] = useState<number | null>(null);
  const [weightUsed, setWeightUsed] = useState<'physical' | 'volumetric' | null>(null);

  // Datos del paquete
  const [weight, setWeight] = useState<string>('1');
  const [length, setLength] = useState<string>('20');
  const [width, setWidth] = useState<string>('20');
  const [height, setHeight] = useState<string>('20');

  // Datos del remitente
  const [senderName, setSenderName] = useState('');
  const [senderPhone, setSenderPhone] = useState('');
  const [senderEmail, setSenderEmail] = useState('');
  const [senderAddress, setSenderAddress] = useState('');
  const [senderBetweenStreets, setSenderBetweenStreets] = useState('');
  const [senderReferences, setSenderReferences] = useState('');
  const [senderCity, setSenderCity] = useState('');
  const [senderState, setSenderState] = useState('');
  const [senderPostalCode, setSenderPostalCode] = useState('');
  const [senderMunicipio, setSenderMunicipio] = useState('');

  // Datos del destinatario
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [recipientBetweenStreets, setRecipientBetweenStreets] = useState('');
  const [recipientReferences, setRecipientReferences] = useState('');
  const [recipientCity, setRecipientCity] = useState('');
  const [recipientState, setRecipientState] = useState('');
  const [recipientPostalCode, setRecipientPostalCode] = useState('');
  const [recipientMunicipio, setRecipientMunicipio] = useState('');

  const [quoteId, setQuoteId] = useState<string | null>(null);

  // Banner de Estafeta
  const [banners, setBanners] = useState<any[]>([]);
  const [bannerIdx, setBannerIdx] = useState(0);


  // Validar si todos los campos están completos para habilitar el botón de pago
  const canPay = useMemo(() => {
    return (
      calculatedCost !== null &&
      quoteId !== null &&
      senderName.trim() !== '' &&
      senderPhone.trim() !== '' &&
      senderEmail.trim() !== '' &&
      senderAddress.trim() !== '' &&
      senderBetweenStreets.trim() !== '' &&
      senderReferences.trim() !== '' &&
      senderCity.trim() !== '' &&
      senderState.trim() !== '' &&
      senderPostalCode.trim() !== '' &&
      recipientName.trim() !== '' &&
      recipientPhone.trim() !== '' &&
      recipientEmail.trim() !== '' &&
      recipientAddress.trim() !== '' &&
      recipientBetweenStreets.trim() !== '' &&
      recipientReferences.trim() !== '' &&
      recipientCity.trim() !== '' &&
      recipientState.trim() !== '' &&
      recipientPostalCode.trim() !== ''
    );
  }, [
    calculatedCost,
    quoteId,
    senderName,
    senderPhone,
    senderEmail,
    senderAddress,
    senderBetweenStreets,
    senderReferences,
    senderCity,
    senderState,
    senderPostalCode,
    recipientName,
    recipientPhone,
    recipientEmail,
    recipientAddress,
    recipientBetweenStreets,
    recipientReferences,
    recipientCity,
    recipientState,
    recipientPostalCode,
  ]);

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      try {
        setIsBooting(true);
        setError(null);

        // Cargar configuración de Estafeta
        const { data: settingsRes, error: settingsErr } = await supabase
          .from('app_settings')
          .select('estafeta_config')
          .eq('id', 1)
          .maybeSingle();

        if (settingsErr) throw settingsErr;

        const estafetaConfig = (settingsRes?.estafeta_config as EstafetaConfig) || {
          enabled: true,
          weight_ranges: [
            { max_weight_kg: 1, price: 175 },
            { max_weight_kg: 5, price: 195 },
            { max_weight_kg: 10, price: 235 },
            { max_weight_kg: 15, price: 255 },
            { max_weight_kg: 20, price: 275 },
            { max_weight_kg: 25, price: 300 },
            { max_weight_kg: 30, price: 325 },
            { max_weight_kg: 35, price: 340 },
            { max_weight_kg: 40, price: 355 },
            { max_weight_kg: 45, price: 385 },
            { max_weight_kg: 50, price: 415 },
            { max_weight_kg: 55, price: 435 },
            { max_weight_kg: 60, price: 455 },
          ],
        };

        if (!cancelled) {
          setConfig(estafetaConfig);
          if (!estafetaConfig.enabled) {
            setError('El servicio de cotización Estafeta está temporalmente deshabilitado.');
          }
        }

        // Cargar datos del usuario si está logueado
        const { data: userData } = await supabase.auth.getUser();
        if (userData?.user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, phone, email, address, city, state, postal_code')
            .eq('id', userData.user.id)
            .maybeSingle();

          if (profile && !cancelled) {
            setSenderName(String(profile.full_name || '').trim());
            setSenderPhone(String(profile.phone || '').trim());
            setSenderEmail(String(profile.email || userData.user.email || '').trim());
            setSenderAddress(String(profile.address || '').trim());
            setSenderCity(String(profile.city || '').trim());
            setSenderState(String(profile.state || '').trim());
            setSenderPostalCode(String(profile.postal_code || '').trim());
            setSenderMunicipio('');
          }
        }

        // Cargar banners de Estafeta
        let bannerRes: any = await supabase
          .from('home_banners')
          .select('id,title,subtitle,image_url,cta_text,cta_href,placement,image_fit,image_position,is_active,sort_order')
          .eq('is_active', true)
          .eq('placement', 'estafeta')
          .order('sort_order', { ascending: true })
          .limit(10);

        if (bannerRes?.error) {
          const err = bannerRes.error;
          const code = String(err?.code || '');
          const msg = String(err?.message || '').toLowerCase();
          if (code === '42703' || msg.includes('does not exist') || msg.includes('column')) {
            bannerRes = await supabase
              .from('home_banners')
              .select('id,title,subtitle,image_url,cta_text,cta_href,placement,is_active,sort_order')
              .eq('is_active', true)
              .eq('placement', 'estafeta')
              .order('sort_order', { ascending: true })
              .limit(10);
          }
        }

        if (!cancelled && !bannerRes?.error) {
          const all = (bannerRes.data as any[]) ?? [];
          setBanners(
            all.map((b: any) => ({
              id: b.id,
              title: b.title,
              subtitle: b.subtitle,
              image_url: b.image_url,
              cta_text: b.cta_text,
              cta_href: b.cta_href,
              image_fit: b.image_fit ?? 'cover',
              image_position: b.image_position ?? 'center',
            })),
          );
        }
      } catch (e: unknown) {
        console.error(e);
        if (!cancelled) setError(e instanceof Error ? e.message : 'No se pudo cargar la configuración.');
      } finally {
        if (!cancelled) setIsBooting(false);
      }
    };

    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  const calculateCost = async () => {
    if (!config) return;

    setError(null);
    setIsCalculating(true);

    try {
      const weightNum = Number(weight) || 0;
      const lengthNum = Number(length) || 0;
      const widthNum = Number(width) || 0;
      const heightNum = Number(height) || 0;

      const weightRanges = Array.isArray(config.weight_ranges) ? config.weight_ranges : [];
      if (weightRanges.length === 0) {
        setError('No hay rangos de peso configurados.');
        setIsCalculating(false);
        return;
      }

      const sortedRanges = [...weightRanges].sort((a, b) => Number(a.max_weight_kg || 0) - Number(b.max_weight_kg || 0));
      const minWeight = 0.01;
      const maxWeight = sortedRanges[sortedRanges.length - 1]?.max_weight_kg || 60;

      if (weightNum < minWeight || weightNum > maxWeight) {
        setError(`El peso debe estar entre ${minWeight} kg y ${maxWeight} kg.`);
        setIsCalculating(false);
        return;
      }

      if (lengthNum <= 0 || widthNum <= 0 || heightNum <= 0) {
        setError('Las dimensiones deben ser mayores a 0.');
        setIsCalculating(false);
        return;
      }

      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        window.location.href = `/?auth=1&returnTo=${encodeURIComponent('/estafeta/cotizar')}`;
        return;
      }

      const res = await fetch('/api/estafeta/calculate', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          weight_kg: weightNum,
          length_cm: lengthNum,
          width_cm: widthNum,
          height_cm: heightNum,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'No se pudo calcular el costo.');

      setCalculatedCost(Number(json.cost || 0));
      setQuoteId(json.quote_id || null);
      setPhysicalWeight(Number(json.physical_weight || 0));
      setVolumetricWeight(Number(json.volumetric_weight || 0));
      setFinalWeight(Number(json.final_weight || 0));
      setWeightUsed(json.weight_used || null);
    } catch (e: unknown) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'No se pudo calcular el costo.');
    } finally {
      setIsCalculating(false);
    }
  };

  const createPayment = async () => {
    if (!calculatedCost || !quoteId) {
      setError('Primero calcula el costo del envío.');
      return;
    }

    // Validar campos requeridos
    if (
      !senderName.trim() ||
      !senderPhone.trim() ||
      !senderEmail.trim() ||
      !senderAddress.trim() ||
      !senderBetweenStreets.trim() ||
      !senderReferences.trim() ||
      !senderCity.trim() ||
      !senderState.trim() ||
      !senderPostalCode.trim() ||
      !recipientName.trim() ||
      !recipientPhone.trim() ||
      !recipientEmail.trim() ||
      !recipientAddress.trim() ||
      !recipientBetweenStreets.trim() ||
      !recipientReferences.trim() ||
      !recipientCity.trim() ||
      !recipientState.trim() ||
      !recipientPostalCode.trim()
    ) {
      setError('Por favor completa todos los campos requeridos.');
      return;
    }

    setError(null);
    setIsCreatingPayment(true);

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        window.location.href = `/?auth=1&returnTo=${encodeURIComponent('/estafeta/cotizar')}`;
        return;
      }

      // Actualizar cotización con datos completos
      const updateRes = await fetch('/api/estafeta/update-quote', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          quote_id: quoteId,
          sender_name: senderName.trim(),
          sender_phone: senderPhone.trim(),
          sender_email: senderEmail.trim(),
          sender_address: senderAddress.trim(),
          sender_between_streets: senderBetweenStreets.trim(),
          sender_references: senderReferences.trim(),
          sender_city: senderCity.trim(),
          sender_state: senderState.trim(),
          sender_postal_code: senderPostalCode.trim(),
          recipient_name: recipientName.trim(),
          recipient_phone: recipientPhone.trim(),
          recipient_email: recipientEmail.trim(),
          recipient_address: recipientAddress.trim(),
          recipient_between_streets: recipientBetweenStreets.trim(),
          recipient_references: recipientReferences.trim(),
          recipient_city: recipientCity.trim(),
          recipient_state: recipientState.trim(),
          recipient_postal_code: recipientPostalCode.trim(),
        }),
      });

      const updateJson = await updateRes.json().catch(() => ({}));
      if (!updateRes.ok) throw new Error(updateJson?.error || 'No se pudo actualizar la cotización.');

      // Crear preferencia de pago en MercadoPago
      const paymentRes = await fetch('/api/estafeta/create-payment', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ quote_id: quoteId }),
      });

      const paymentJson = await paymentRes.json().catch(() => ({}));
      if (!paymentRes.ok) throw new Error(paymentJson?.error || 'No se pudo crear el pago.');

      const redirectUrl = paymentJson?.init_point || paymentJson?.sandbox_init_point;
      if (!redirectUrl) throw new Error('MercadoPago no devolvió un init_point para redirigir.');

      // Redirigir a MercadoPago
      window.location.href = redirectUrl;
    } catch (e: unknown) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'No se pudo crear el pago.');
      setIsCreatingPayment(false);
    }
  };

  // Hooks y funciones deben estar ANTES de cualquier return condicional
  const currentBanner = useMemo(() => banners[bannerIdx] ?? null, [banners, bannerIdx]);
  const nextBanner = () => setBannerIdx((i) => (banners.length ? (i + 1) % banners.length : 0));
  const prevBanner = () => setBannerIdx((i) => (banners.length ? (i - 1 + banners.length) % banners.length : 0));

  useEffect(() => {
    if (banners.length <= 1) return;
    const t = setInterval(() => {
      setBannerIdx((i) => (banners.length ? (i + 1) % banners.length : 0));
    }, 6500);
    return () => clearInterval(t);
  }, [banners.length]);

  // Return condicional debe estar DESPUÉS de todos los hooks
  if (isBooting) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-pink-50 to-white">
        <div className="mx-auto max-w-4xl px-4 py-10">
          <div className="h-14 rounded-2xl bg-white/70 shadow-sm ring-1 ring-black/5" />
          <div className="mt-6 h-80 rounded-2xl bg-white/70 shadow-sm ring-1 ring-black/5" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 to-white">
      {/* Banner de Estafeta */}
      {banners.length > 0 && (
        <div className="w-full">
          <div className="relative w-full overflow-hidden bg-gray-100" style={{ aspectRatio: '24/9' }}>
            {currentBanner?.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={currentBanner.image_url}
                alt={currentBanner.title}
                className="h-full w-full object-cover"
                style={{
                  objectFit: (currentBanner.image_fit ?? 'cover') as any,
                  objectPosition: (currentBanner.image_position ?? 'center') as any,
                }}
                draggable={false}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-gray-500">Sin imagen</div>
            )}

            {currentBanner && (
              <>
                <div className="absolute inset-0 bg-gradient-to-r from-black/35 via-black/0 to-black/0" />
                <div className="absolute left-5 top-1/2 -translate-y-1/2 sm:left-8">
                  {currentBanner.title && (
                    <div className="mt-3 max-w-xl text-2xl font-extrabold tracking-tight text-white sm:text-4xl">
                      {currentBanner.title}
                    </div>
                  )}
                  {currentBanner.subtitle && (
                    <div className="mt-2 max-w-xl text-sm font-semibold text-white/90 sm:text-base">{currentBanner.subtitle}</div>
                  )}
                  {currentBanner.cta_text && currentBanner.cta_href && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link
                        href={currentBanner.cta_href}
                        className="rounded-full bg-white px-5 py-3 text-sm font-extrabold text-gray-900 shadow-sm hover:bg-gray-50"
                      >
                        {currentBanner.cta_text}
                      </Link>
                    </div>
                  )}
                </div>

                {banners.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={prevBanner}
                      className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 px-3 py-2 text-sm font-extrabold text-gray-900 shadow-sm hover:bg-white"
                      aria-label="Anterior"
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      onClick={nextBanner}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 px-3 py-2 text-sm font-extrabold text-gray-900 shadow-sm hover:bg-white"
                      aria-label="Siguiente"
                    >
                      ›
                    </button>
                    <div className="absolute bottom-4 left-0 right-0 flex items-center justify-center gap-2">
                      {banners.map((b, idx) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setBannerIdx(idx)}
                          className={`h-2 w-2 rounded-full ${idx === bannerIdx ? 'bg-white' : 'bg-white/40'}`}
                          aria-label={`Banner ${idx + 1}`}
                        />
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <div className="sticky top-0 z-40 border-b border-black/5 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            {/* Logo de Estafeta en el header */}
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white ring-1 ring-black/5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                src="/estafeta-logo.png" 
                alt="Estafeta" 
                className="h-10 w-auto object-contain"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  if (target.parentElement) {
                    target.parentElement.innerHTML = `
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 7h12v10H3V7Z" />
                        <path d="M15 10h4l2 3v4h-6v-7Z" />
                        <path d="M7 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" fill="currentColor" />
                        <path d="M17 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" fill="currentColor" />
                      </svg>
                    `;
                  }
                }}
              />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-gray-900">Tienda Estafeta</div>
              <div className="text-xs text-gray-500">Cotiza tus envíos</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/sell" className="rounded-xl bg-brand-pink px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90">
              Vender
            </Link>
            <Link href="/" className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-black/5 hover:bg-gray-50">
              Volver
            </Link>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-4xl px-4 py-8">
        {error && <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
        {success && <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{success}</div>}

        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
          <div className="mb-6 flex items-center gap-3">
            {/* Logo de Estafeta */}
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-50 ring-1 ring-black/5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                src="/estafeta-logo.png" 
                alt="Estafeta" 
                className="h-12 w-auto object-contain"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  if (target.parentElement) {
                    target.parentElement.innerHTML = `
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 7h12v10H3V7Z" />
                        <path d="M15 10h4l2 3v4h-6v-7Z" />
                        <path d="M7 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" fill="currentColor" />
                        <path d="M17 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" fill="currentColor" />
                      </svg>
                    `;
                  }
                }}
              />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-gray-900">Cotiza tu envío Estafeta</h1>
              <p className="mt-1 text-sm text-gray-600">Ingresa los datos de tu paquete y direcciones para calcular el costo</p>
            </div>
          </div>

          {/* Datos del remitente */}
          <div className="mb-6 rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <h2 className="mb-4 text-lg font-bold text-gray-900">Datos del remitente</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Nombre completo *</label>
                <LimitedInput
                  type="text"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-brand-pink focus:ring-2 focus:ring-brand-pink/20"
                  placeholder="Juan Pérez"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Teléfono *</label>
                <LimitedInput
                  type="tel"
                  value={senderPhone}
                  onChange={(e) => setSenderPhone(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-brand-pink focus:ring-2 focus:ring-brand-pink/20"
                  placeholder="5551234567"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Email *</label>
                <LimitedInput
                  type="email"
                  value={senderEmail}
                  onChange={(e) => setSenderEmail(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-brand-pink focus:ring-2 focus:ring-brand-pink/20"
                  placeholder="correo@ejemplo.com"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Dirección completa *</label>
                <LimitedInput
                  type="text"
                  value={senderAddress}
                  onChange={(e) => setSenderAddress(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-brand-pink focus:ring-2 focus:ring-brand-pink/20"
                  placeholder="Calle, número, colonia"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Entre calles *</label>
                <LimitedInput
                  type="text"
                  value={senderBetweenStreets}
                  onChange={(e) => setSenderBetweenStreets(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-brand-pink focus:ring-2 focus:ring-brand-pink/20"
                  placeholder="Entre calle A y calle B"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Referencias *</label>
                <LimitedInput
                  type="text"
                  value={senderReferences}
                  onChange={(e) => setSenderReferences(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-brand-pink focus:ring-2 focus:ring-brand-pink/20"
                  placeholder="Casa color azul, portón negro, etc."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Código postal *</label>
                <input
                  type="text"
                  maxLength={5}
                  value={senderPostalCode}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '').slice(0, 5);
                    setSenderPostalCode(value);
                  }}
                  className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-brand-pink focus:ring-2 focus:ring-brand-pink/20"
                  placeholder="01234"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Municipio *</label>
                <LimitedInput
                  type="text"
                  value={senderMunicipio}
                  onChange={(e) => setSenderMunicipio(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-brand-pink focus:ring-2 focus:ring-brand-pink/20"
                  placeholder="Municipio"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Colonia *</label>
                <LimitedInput
                  type="text"
                  value={senderCity}
                  onChange={(e) => setSenderCity(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-brand-pink focus:ring-2 focus:ring-brand-pink/20"
                  placeholder="Colonia"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Estado *</label>
                <LimitedInput
                  type="text"
                  value={senderState}
                  onChange={(e) => setSenderState(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-brand-pink focus:ring-2 focus:ring-brand-pink/20"
                  placeholder="Estado"
                />
              </div>
            </div>
          </div>

          {/* Datos del destinatario */}
          <div className="mb-6 rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <h2 className="mb-4 text-lg font-bold text-gray-900">Datos del destinatario</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Nombre completo *</label>
                <LimitedInput
                  type="text"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-brand-pink focus:ring-2 focus:ring-brand-pink/20"
                  placeholder="María González"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Teléfono *</label>
                <LimitedInput
                  type="tel"
                  value={recipientPhone}
                  onChange={(e) => setRecipientPhone(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-brand-pink focus:ring-2 focus:ring-brand-pink/20"
                  placeholder="5559876543"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Email *</label>
                <LimitedInput
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-brand-pink focus:ring-2 focus:ring-brand-pink/20"
                  placeholder="correo@ejemplo.com"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Dirección completa *</label>
                <LimitedInput
                  type="text"
                  value={recipientAddress}
                  onChange={(e) => setRecipientAddress(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-brand-pink focus:ring-2 focus:ring-brand-pink/20"
                  placeholder="Calle, número, colonia"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Entre calles *</label>
                <LimitedInput
                  type="text"
                  value={recipientBetweenStreets}
                  onChange={(e) => setRecipientBetweenStreets(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-brand-pink focus:ring-2 focus:ring-brand-pink/20"
                  placeholder="Entre calle A y calle B"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Referencias *</label>
                <LimitedInput
                  type="text"
                  value={recipientReferences}
                  onChange={(e) => setRecipientReferences(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-brand-pink focus:ring-2 focus:ring-brand-pink/20"
                  placeholder="Casa color azul, portón negro, etc."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Código postal *</label>
                <input
                  type="text"
                  maxLength={5}
                  value={recipientPostalCode}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '').slice(0, 5);
                    setRecipientPostalCode(value);
                  }}
                  className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-brand-pink focus:ring-2 focus:ring-brand-pink/20"
                  placeholder="44100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Municipio *</label>
                <LimitedInput
                  type="text"
                  value={recipientMunicipio}
                  onChange={(e) => setRecipientMunicipio(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-brand-pink focus:ring-2 focus:ring-brand-pink/20"
                  placeholder="Municipio"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Colonia *</label>
                <LimitedInput
                  type="text"
                  value={recipientCity}
                  onChange={(e) => setRecipientCity(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-brand-pink focus:ring-2 focus:ring-brand-pink/20"
                  placeholder="Colonia"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Estado *</label>
                <LimitedInput
                  type="text"
                  value={recipientState}
                  onChange={(e) => setRecipientState(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-brand-pink focus:ring-2 focus:ring-brand-pink/20"
                  placeholder="Estado"
                />
              </div>
            </div>
          </div>

          {/* Datos del paquete */}
          <div className="mb-6 rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <h2 className="mb-4 text-lg font-bold text-gray-900">Datos del paquete</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">Peso (kg) *</label>
                <input
                  type="number"
                  step="0.1"
                  min={config?.min_weight_kg || 0.5}
                  max={config?.max_weight_kg || 30}
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-brand-pink focus:ring-2 focus:ring-brand-pink/20"
                  placeholder="1.0"
                />
                {config && config.weight_ranges && config.weight_ranges.length > 0 && (
                  <div className="mt-1 text-xs text-gray-500">
                    Mín: 0.01 kg - Máx: {Math.max(...config.weight_ranges.map((r) => r.max_weight_kg))} kg
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Largo (cm) *</label>
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  value={length}
                  onChange={(e) => setLength(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-brand-pink focus:ring-2 focus:ring-brand-pink/20"
                  placeholder="20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Ancho (cm) *</label>
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  value={width}
                  onChange={(e) => setWidth(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-brand-pink focus:ring-2 focus:ring-brand-pink/20"
                  placeholder="20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Alto (cm) *</label>
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-brand-pink focus:ring-2 focus:ring-brand-pink/20"
                  placeholder="20"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => void calculateCost()}
              disabled={isCalculating || !config?.enabled}
              className="mt-4 w-full rounded-xl bg-brand-pink px-3 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
            >
              {isCalculating ? 'Calculando...' : 'Calcular costo'}
            </button>
            {calculatedCost !== null && (
              <div className="mt-4 rounded-xl border-2 border-green-200 bg-green-50 px-4 py-4">
                <div className="text-sm font-semibold text-green-900">Total a pagar:</div>
                <div className="mt-1 text-3xl font-extrabold text-green-900">{formatMoney(calculatedCost)}</div>
                {volumetricWeight !== null && physicalWeight !== null && finalWeight !== null && weightUsed && (
                  <div className="mt-3 space-y-1 border-t border-green-300 pt-3 text-xs">
                    <div className="flex justify-between text-gray-700">
                      <span>Peso físico:</span>
                      <span className="font-semibold">{physicalWeight.toFixed(2)} kg</span>
                    </div>
                    <div className="flex justify-between text-gray-700">
                      <span>Peso volumétrico:</span>
                      <span className="font-semibold">{volumetricWeight.toFixed(2)} kg</span>
                    </div>
                    <div className="flex justify-between font-semibold text-green-800">
                      <span>Peso utilizado:</span>
                      <span>
                        {finalWeight.toFixed(2)} kg ({weightUsed === 'volumetric' ? 'volumétrico' : 'físico'})
                      </span>
                    </div>
                  </div>
                )}
                {quoteId && (
                  <>
                    <button
                      type="button"
                      onClick={() => void createPayment()}
                      disabled={isCreatingPayment || !canPay}
                      className="mt-4 w-full rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-50 disabled:hover:bg-red-600 disabled:cursor-not-allowed"
                    >
                      {isCreatingPayment ? 'Procesando...' : canPay ? 'Pagar con MercadoPago' : 'Completa todos los campos para pagar'}
                    </button>
                    <div className="mt-4 space-y-2 border-t border-green-300 pt-3">
                      <div className="text-[10px] leading-relaxed text-gray-700">
                        <div className="mb-1.5">1. El costo no incluye zona extendida; el cargo de zona extendida se paga en sucursal.</div>
                        <div className="mb-1.5">2. Si tu paquete no coincide con lo que declaras, tendrás que pagar en sucursal el sobrepeso.</div>
                        <div className="mb-1.5">3. Estas guías son únicamente aceptadas en sucursales Estafeta, no en locales con varias paqueterías en un solo lugar.</div>
                        <div className="mb-1.5">4. No incluyen recolección; es forzoso llevar el paquete a sucursal.</div>
                        <div>5. Dependiendo de la saturación del sistema, puede tardar hasta 24 horas en aparecer la guía en la sección de tus compras.</div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
