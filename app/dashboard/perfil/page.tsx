'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { PageTour } from '@/components/PageTour';
import { pageTours } from '@/lib/tours/config';

type ProfileRow = {
  id: string;
  full_name?: string | null;
  phone?: string | null;
  address_street?: string | null;
  ext_number?: string | null;
  int_number?: string | null;
  neighborhood?: string | null;
  zip_code?: string | null;
  state?: string | null;
  city?: string | null;
  references?: string | null;
  cross_streets?: string | null;
  ine_front_url?: string | null;
  ine_back_url?: string | null;
  payout_bank_name?: string | null;
  payout_account_holder?: string | null;
  payout_clabe?: string | null;
  payout_account_number?: string | null;
  payout_notes?: string | null;
  mercadopago_account?: string | null;
};

export default function DashboardPerfilPage() {
  const [isBooting, setIsBooting] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [email, setEmail] = useState<string>('');
  const [createdAt, setCreatedAt] = useState<string>('');
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [hasSeenTour, setHasSeenTour] = useState<boolean>(true);
  const [isResettingTour, setIsResettingTour] = useState(false);

  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    address_street: '',
    ext_number: '',
    int_number: '',
    neighborhood: '',
    zip_code: '',
    state: '',
    city: '',
    references: '',
    cross_streets: '',
    payout_bank_name: '',
    payout_account_holder: '',
    payout_clabe: '',
    payout_account_number: '',
    payout_notes: '',
    mercadopago_account: '',
  });

  const [returnTo, setReturnTo] = useState<string>('');
  const [reason, setReason] = useState<string>('');

  const docsCount = useMemo(() => {
    const front = String(profile?.ine_front_url || '').trim();
    const back = String(profile?.ine_back_url || '').trim();
    return [front, back].filter(Boolean).length;
  }, [profile]);

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      setReturnTo(String(sp.get('returnTo') || '').trim());
      setReason(String(sp.get('reason') || '').trim());
    } catch {
      // noop
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      try {
        setIsBooting(true);
        setError(null);
        setSuccess(null);

        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr) throw userErr;
        const user = userData.user;
        if (!user) {
          window.location.href = '/login';
          return;
        }

        if (!cancelled) {
          setEmail(user.email || '');
          setCreatedAt(String((user as any).created_at || ''));
        }

        const { data, error: pErr } = await supabase
          .from('profiles')
          .select(
            'id,full_name,phone,address_street,ext_number,int_number,neighborhood,zip_code,state,city,references,cross_streets,ine_front_url,ine_back_url,payout_bank_name,payout_account_holder,payout_clabe,payout_account_number,payout_notes,mercadopago_account,has_seen_onboarding_tour',
          )
          .eq('id', user.id)
          .maybeSingle();

        if (pErr) {
          const anyErr = pErr as any;
          const code = String(anyErr?.code || '');
          const msg = String(anyErr?.message || '');
          if (code === '42703') {
            setError(
              'Tu tabla `profiles` no tiene todas las columnas de perfil/dirección. Ejecuta los SQL de migración (address + INE) y recarga.',
            );
            return;
          }
          throw pErr;
        }

        const row = (data as any) as ProfileRow | null;
        if (!cancelled) {
          setProfile(row);
          setHasSeenTour(Boolean((row as any)?.has_seen_onboarding_tour ?? true));
          setForm({
            full_name: String(row?.full_name || ''),
            phone: String(row?.phone || ''),
            address_street: String(row?.address_street || ''),
            ext_number: String(row?.ext_number || ''),
            int_number: String(row?.int_number || ''),
            neighborhood: String(row?.neighborhood || ''),
            zip_code: String(row?.zip_code || ''),
            state: String(row?.state || ''),
            city: String(row?.city || ''),
            references: String(row?.references || ''),
            cross_streets: String(row?.cross_streets || ''),
            payout_bank_name: String((row as any)?.payout_bank_name || ''),
            payout_account_holder: String((row as any)?.payout_account_holder || ''),
            payout_clabe: String((row as any)?.payout_clabe || ''),
            payout_account_number: String((row as any)?.payout_account_number || ''),
            payout_notes: String((row as any)?.payout_notes || ''),
            mercadopago_account: String((row as any)?.mercadopago_account || ''),
          });
        }
      } catch (e: unknown) {
        console.error(e);
        if (!cancelled) setError(e instanceof Error ? e.message : 'No se pudo cargar tu perfil.');
      } finally {
        if (!cancelled) setIsBooting(false);
      }
    };
    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  const requiredAddressFields = [
    { key: 'full_name' as const, label: 'Nombre' },
    { key: 'phone' as const, label: 'Teléfono' },
    { key: 'address_street' as const, label: 'Calle' },
    { key: 'ext_number' as const, label: 'No. exterior' },
    { key: 'int_number' as const, label: 'No. interior' },
    { key: 'neighborhood' as const, label: 'Colonia' },
    { key: 'zip_code' as const, label: 'CP' },
    { key: 'state' as const, label: 'Estado' },
    { key: 'city' as const, label: 'Ciudad' },
    { key: 'references' as const, label: 'Referencias' },
    { key: 'cross_streets' as const, label: 'Entre calles' },
  ];

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    try {
      const missingLabels = requiredAddressFields.filter((f) => !String(form[f.key] ?? '').trim()).map((f) => f.label);
      if (!String(email ?? '').trim()) missingLabels.push('Email');
      if (missingLabels.length > 0) {
        setError(
          `Para poder vender o publicar, todos los datos de contacto, dirección y email son obligatorios. Faltan: ${missingLabels.join(', ')}.`,
        );
        return;
      }

      setIsSaving(true);
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const user = userData.user;
      if (!user) {
        window.location.href = '/login';
        return;
      }

      const payload: any = {
        id: user.id,
        full_name: form.full_name.trim() || null,
        phone: form.phone.trim() || null,
        address_street: form.address_street.trim() || null,
        ext_number: form.ext_number.trim() || null,
        int_number: form.int_number.trim() || null,
        neighborhood: form.neighborhood.trim() || null,
        zip_code: form.zip_code.trim() || null,
        state: form.state.trim() || null,
        city: form.city.trim() || null,
        references: form.references.trim() || null,
        cross_streets: form.cross_streets.trim() || null,
        payout_bank_name: form.payout_bank_name.trim() || null,
        payout_account_holder: form.payout_account_holder.trim() || null,
        payout_clabe: form.payout_clabe.trim() || null,
        payout_account_number: form.payout_account_number.trim() || null,
        payout_notes: form.payout_notes.trim() || null,
        mercadopago_account: form.mercadopago_account.trim() || null,
      };

      const { data: saved, error: upErr } = await supabase.from('profiles').upsert([payload]).select('*').single();
      if (upErr) throw upErr;
      setProfile(saved as any);
      setSuccess('Perfil actualizado.');

      if (returnTo) {
        setTimeout(() => {
          window.location.href = returnTo;
        }, 700);
      }
    } catch (e: unknown) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'No se pudo guardar tu perfil.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetTour = async () => {
    try {
      setIsResettingTour(true);
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const user = userData.user;
      if (!user) {
        window.location.href = '/login';
        return;
      }

      // Resetear en la base de datos
      const { error: upErr } = await supabase
        .from('profiles')
        .update({ has_seen_onboarding_tour: false })
        .eq('id', user.id);

      if (upErr) throw upErr;

      // Resetear en localStorage - limpiar todos los tours de todas las páginas
      const keys = Object.keys(localStorage);
      keys.forEach((key) => {
        if (key.startsWith(`pocket_tour_`) && key.endsWith(`_${user.id}`)) {
          localStorage.removeItem(key);
        }
      });
      localStorage.removeItem(`pocket_tour_seen_${user.id}`);

      setHasSeenTour(false);
      setSuccess('Tours reactivados. Se mostrarán la próxima vez que visites cada página.');
    } catch (e: unknown) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'No se pudo reactivar el tour.');
    } finally {
      setIsResettingTour(false);
    }
  };

  if (isBooting) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-pink-50 to-white">
        <div className="mx-auto max-w-4xl px-4 py-10">
          <div className="h-14 rounded-2xl bg-white/70 ring-1 ring-black/5" />
          <div className="mt-6 h-80 rounded-2xl bg-white/70 ring-1 ring-black/5" />
        </div>
      </div>
    );
  }

  const healthy = docsCount >= 2;

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 to-white">
      <div className="sticky top-0 z-40 border-b border-black/5 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 items-center justify-center rounded-xl bg-brand-pink px-3 text-white shadow-sm">
              <span className="text-sm font-extrabold tracking-widest">GoPocket</span>
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-gray-900">Mi perfil</div>
              <div className="text-xs text-gray-500">Información de tu cuenta</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/sell" className="rounded-xl bg-brand-pink px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90">
              Vender
            </Link>
            <Link href="/dashboard" className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-black/5 hover:bg-gray-50">
              Volver
            </Link>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-4xl px-4 py-8">
        <PageTour steps={pageTours.perfil || []} pageId="perfil" />
        {error && <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
        {success && <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{success}</div>}
        {reason === 'address_required' ? (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Para vender o publicar, todos los <span className="font-semibold">datos de contacto, dirección y email</span> son obligatorios. Complétalos más abajo y guarda.
          </div>
        ) : null}

        <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8" data-tour="documents">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-bold text-gray-900">Estado de cuenta</div>
              <div className="mt-1 text-sm text-gray-600">
                {healthy ? (
                  <span className="font-semibold text-green-700">Saludable</span>
                ) : (
                  <span className="font-semibold text-amber-700">Pendiente de verificación</span>
                )}
              </div>
              <div className="mt-2 text-xs text-gray-500">
                Email: <span className="font-semibold text-gray-700">{email || '—'}</span> · Ingreso: <span className="font-semibold text-gray-700">{createdAt ? new Date(createdAt).toLocaleDateString('es-MX') : '—'}</span>
              </div>
            </div>
            <Link href="/verificacion" className="rounded-xl bg-brand-pink px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90">
              Verificación
            </Link>
          </div>
        </section>

        {/* Preferencias */}
        <section className="mt-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
          <div className="text-sm font-bold text-gray-900">Preferencias</div>
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <div>
                <div className="text-sm font-semibold text-gray-900">Tours guiados</div>
                <div className="mt-1 text-xs text-gray-600">
                  {hasSeenTour 
                    ? 'Los tours están desactivados. Puedes reactivarlos para verlos en todas las páginas.'
                    : 'Los tours están activados. Se mostrarán en cada página hasta que los desactives.'}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const { data: userData } = await supabase.auth.getUser();
                      if (!userData.user) return;
                      await supabase
                        .from('profiles')
                        .update({ has_seen_onboarding_tour: !hasSeenTour })
                        .eq('id', userData.user.id);
                      setHasSeenTour(!hasSeenTour);
                      setSuccess(!hasSeenTour ? 'Tours desactivados.' : 'Tours activados.');
                    } catch (e) {
                      setError('No se pudo actualizar.');
                    }
                  }}
                  className="rounded-xl bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-200"
                >
                  {hasSeenTour ? 'Activar' : 'Desactivar'}
                </button>
                <button
                  type="button"
                  onClick={handleResetTour}
                  disabled={isResettingTour}
                  className="rounded-xl bg-brand-pink px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isResettingTour ? 'Reactivando…' : 'Reactivar todos'}
                </button>
              </div>
            </div>
          </div>
        </section>

        <form onSubmit={onSave} className="mt-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8 space-y-4" data-tour="personal-info">
          <div className="text-lg font-bold text-gray-900">Editar perfil</div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5 ring-1 ring-amber-100">
            <div className="text-sm font-bold text-gray-900">Datos de contacto <span className="text-amber-700">*</span></div>
            <div className="mt-1 text-xs text-gray-600">Obligatorios para poder vender o publicar.</div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">Nombre <span className="text-red-600">*</span></label>
                <input value={form.full_name} onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))} className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-pink" placeholder="Nombre completo" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Teléfono <span className="text-red-600">*</span></label>
                <input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-pink" placeholder="10 dígitos" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Email <span className="text-red-600">*</span></label>
                <input
                  type="email"
                  value={email}
                  readOnly
                  className="mt-1 w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-600 outline-none"
                  placeholder="Correo de tu cuenta"
                />
                <div className="mt-1 text-xs text-gray-500">Email de tu cuenta (obligatorio). Si no lo tienes, actualízalo en la configuración de tu cuenta o con soporte.</div>
              </div>
            </div>
          </div>

          <div id="datos-cobro" className="mt-4 rounded-3xl border border-pink-100 bg-pink-50/40 p-5 ring-1 ring-pink-100" data-tour="payout-info">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-extrabold text-gray-900">Datos de cobro (para liberación de dinero)</div>
                <div className="mt-1 text-xs text-gray-600">
                  Estos datos se usan para que soporte/admin pueda pagarte cuando se liberen tus ventas. (Ejemplo México: CLABE)
                </div>
              </div>
              <div className="rounded-full bg-white px-3 py-1 text-[11px] font-bold text-brand-pink ring-1 ring-pink-100">PRO</div>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">Banco</label>
                <input
                  value={form.payout_bank_name}
                  onChange={(e) => setForm((p) => ({ ...p, payout_bank_name: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-pink"
                  placeholder="Ej: BBVA, Banamex, Santander…"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Titular</label>
                <input
                  value={form.payout_account_holder}
                  onChange={(e) => setForm((p) => ({ ...p, payout_account_holder: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-pink"
                  placeholder="Nombre del titular de la cuenta"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">CLABE (18 dígitos)</label>
                <input
                  value={form.payout_clabe}
                  onChange={(e) => {
                    const next = e.target.value.replace(/\s+/g, '');
                    setForm((p) => ({ ...p, payout_clabe: next }));
                  }}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-pink"
                  inputMode="numeric"
                  placeholder="000000000000000000"
                />
                <div className="mt-1 text-[11px] text-gray-600">Tip: sin espacios. Si no aplica en tu país, déjalo en blanco.</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Número de cuenta (opcional)</label>
                <input
                  value={form.payout_account_number}
                  onChange={(e) => setForm((p) => ({ ...p, payout_account_number: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-pink"
                  placeholder="Opcional"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Cuenta de MercadoPago</label>
                <input
                  type="email"
                  value={form.mercadopago_account}
                  onChange={(e) => setForm((p) => ({ ...p, mercadopago_account: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-pink"
                  placeholder="tu-email@mercadopago.com o ID de cuenta"
                />
                <div className="mt-1 text-[11px] text-gray-600">
                  Ingresa el email asociado a tu cuenta de MercadoPago o el ID de cuenta para recibir pagos directamente.
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Notas (opcional)</label>
                <textarea
                  value={form.payout_notes}
                  onChange={(e) => setForm((p) => ({ ...p, payout_notes: e.target.value }))}
                  rows={3}
                  className="mt-1 w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-pink"
                  placeholder="Ej: horario de transferencias, referencia, etc."
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5 ring-1 ring-amber-100">
            <div className="text-sm font-bold text-gray-900">Dirección <span className="text-amber-700">*</span></div>
            <div className="mt-1 text-xs text-gray-600">Todos los campos son obligatorios para vender o publicar.</div>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Calle <span className="text-red-600">*</span></label>
                <input value={form.address_street} onChange={(e) => setForm((p) => ({ ...p, address_street: e.target.value }))} className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-pink" placeholder="Calle y número" />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">No. ext <span className="text-red-600">*</span></label>
                  <input value={form.ext_number} onChange={(e) => setForm((p) => ({ ...p, ext_number: e.target.value }))} className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-pink" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">No. int <span className="text-red-600">*</span></label>
                  <input value={form.int_number} onChange={(e) => setForm((p) => ({ ...p, int_number: e.target.value }))} className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-pink" placeholder="O S/N si no aplica" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">CP <span className="text-red-600">*</span></label>
                  <input value={form.zip_code} onChange={(e) => setForm((p) => ({ ...p, zip_code: e.target.value }))} className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-pink" />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Colonia <span className="text-red-600">*</span></label>
                  <input value={form.neighborhood} onChange={(e) => setForm((p) => ({ ...p, neighborhood: e.target.value }))} className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-pink" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Ciudad <span className="text-red-600">*</span></label>
                  <input value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-pink" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Estado <span className="text-red-600">*</span></label>
                <input value={form.state} onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))} className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-pink" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Entre calles <span className="text-red-600">*</span></label>
                <input value={form.cross_streets} onChange={(e) => setForm((p) => ({ ...p, cross_streets: e.target.value }))} className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-pink" placeholder="Ej. entre Juárez y Hidalgo" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Referencias <span className="text-red-600">*</span></label>
                <textarea value={form.references} onChange={(e) => setForm((p) => ({ ...p, references: e.target.value }))} rows={3} className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-pink" placeholder="Ej. edificio color blanco, portón negro" />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button type="submit" disabled={isSaving} className="rounded-xl bg-brand-pink px-6 py-3 text-sm font-semibold text-white shadow-lg hover:opacity-90 disabled:opacity-60">
              {isSaving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

