'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';

type PaymentMethodsConfig = any;

export default function AdminNegocioPage() {
  const [isBooting, setIsBooting] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodsConfig>({ mercadopago: { enabled: true } });
  const [mpBaseAccount, setMpBaseAccount] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1000);
    });
  };

  const [carrierEstafeta, setCarrierEstafeta] = useState('180');
  const [carrierFedex, setCarrierFedex] = useState('0');
  const [carrierDhl, setCarrierDhl] = useState('0');
  const [extendedExtra, setExtendedExtra] = useState('200');

  const computed = useMemo(() => {
    const n = (v: string) => {
      const x = Number(v ?? 0);
      return Number.isFinite(x) ? x : 0;
    };
    return {
      estafeta: n(carrierEstafeta),
      fedex: n(carrierFedex),
      dhl: n(carrierDhl),
      extended: n(extendedExtra),
    };
  }, [carrierDhl, carrierEstafeta, carrierFedex, extendedExtra]);

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      try {
        setIsBooting(true);
        setError(null);
        setSuccess(null);

        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr) throw userErr;
        if (!userData.user) {
          window.location.href = '/login?returnTo=/admin/negocio';
          return;
        }

        const { data: adminRow } = await supabase.from('admin_users').select('user_id').eq('user_id', userData.user.id).maybeSingle();
        if (!adminRow) {
          setError('No tienes permisos de administrador para ver esta página.');
          return;
        }

        const { data: settingsRow, error: sErr } = await supabase
          .from('app_settings')
          .select('payment_methods, shipping_base, shipping_extended')
          .eq('id', 1)
          .maybeSingle();
        if (sErr) throw sErr;

        const pm = (settingsRow as any)?.payment_methods ?? { mercadopago: { enabled: true } };
        setPaymentMethods(pm);

        const baseAccount = String(pm?.mercadopago?.base_account ?? '').trim();
        setMpBaseAccount(baseAccount);

        setCarrierEstafeta(String((settingsRow as any)?.shipping_base ?? 180));
        setExtendedExtra(String((settingsRow as any)?.shipping_extended ?? 200));

        const carriers = (pm?.shipping_carriers ?? {}) as any;
        setCarrierFedex(String(carriers?.fedex?.base ?? 0));
        setCarrierDhl(String(carriers?.dhl?.base ?? 0));
      } catch (e: unknown) {
        console.error(e);
        if (!cancelled) setError(e instanceof Error ? e.message : 'No se pudo cargar Negocio.');
      } finally {
        if (!cancelled) setIsBooting(false);
      }
    };
    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    setError(null);
    setSuccess(null);
    setIsSaving(true);
    try {
      const pmNext: any = { ...(paymentMethods ?? {}) };
      pmNext.mercadopago = { ...(pmNext.mercadopago ?? {}), base_account: mpBaseAccount.trim() };
      pmNext.shipping_carriers = {
        ...(pmNext.shipping_carriers ?? {}),
        estafeta: { base: computed.estafeta },
        fedex: { base: computed.fedex },
        dhl: { base: computed.dhl },
      };

      const payload: any = {
        payment_methods: pmNext,
        shipping_base: computed.estafeta,
        shipping_extended: computed.extended,
        updated_at: new Date().toISOString(),
      };

      const { error: updErr } = await supabase.from('app_settings').update(payload).eq('id', 1);
      if (updErr) throw updErr;
      setSuccess('Configuración de Negocio guardada.');
      setPaymentMethods(pmNext);
    } catch (e: unknown) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'No se pudo guardar Negocio.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isBooting) {
    return (
      <div className="rounded-3xl bg-white/80 p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
        <div className="h-6 w-40 rounded-xl bg-white/70 ring-1 ring-black/5" />
        <div className="mt-6 h-40 rounded-3xl bg-white/70 ring-1 ring-black/5" />
      </div>
    );
  }

  return (
    <div className="rounded-3xl bg-white/80 p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-lg font-bold text-gray-900">Admin · Negocio</div>
          <div className="mt-1 text-sm text-gray-600">Configura cuenta base de MercadoPago y costos de envíos.</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/settings" className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-black/5 hover:bg-gray-50">
            Configuración (general)
          </Link>
        </div>
      </div>

      {error ? <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div> : null}
      {success ? <div className="mt-5 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{success}</div> : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          <div className="text-sm font-bold text-gray-900">MercadoPago (cuenta base)</div>
          <div className="mt-2 text-sm text-gray-600">
            Aquí defines la cuenta base donde se resguardan fondos (referencia interna: alias/email/ID).
          </div>
          <div className="relative mt-3">
            <input
              value={mpBaseAccount}
              onChange={(e) => setMpBaseAccount(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2 pr-10 text-sm outline-none focus:ring-2 focus:ring-brand-pink"
              placeholder="Ej: cuenta_base@correo.com o alias"
            />
            <button
              type="button"
              onClick={() => copyToClipboard(mpBaseAccount, 'mpBaseAccount')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-brand-pink focus:outline-none"
              title="Copiar cuenta base"
            >
              {copiedId === 'mpBaseAccount' ? '✅' : '📋'}
            </button>
          </div>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          <div className="text-sm font-bold text-gray-900">Envíos</div>
          <div className="mt-2 text-sm text-gray-600">Configura costos base por paquetería (5 kg) y zona extendida.</div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-gray-700">Estafeta (base)</label>
              <input
                value={carrierEstafeta}
                onChange={(e) => setCarrierEstafeta(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-pink"
                inputMode="numeric"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700">FedEx (base)</label>
              <input
                value={carrierFedex}
                onChange={(e) => setCarrierFedex(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-pink"
                inputMode="numeric"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700">DHL (base)</label>
              <input
                value={carrierDhl}
                onChange={(e) => setCarrierDhl(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-pink"
                inputMode="numeric"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700">Zona extendida (extra)</label>
              <input
                value={extendedExtra}
                onChange={(e) => setExtendedExtra(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-pink"
                inputMode="numeric"
              />
            </div>
          </div>

          <div className="mt-3 text-xs text-gray-600">
            Para detectar “zona extendida” por CP (DHL/FedEx/Estafeta) hace falta una tabla de códigos postales extendidos. Te la dejo como siguiente paso.
          </div>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={isSaving}
          className="rounded-xl bg-brand-pink px-5 py-3 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-60"
        >
          {isSaving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}

