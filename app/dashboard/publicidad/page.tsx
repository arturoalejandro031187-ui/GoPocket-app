'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import Link from 'next/link';

type AdCampaign = {
  id: string;
  title: string;
  description?: string | null;
  ad_type: string;
  placement: string;
  image_url?: string | null;
  link_url?: string | null;
  status: string;
  start_date?: string | null;
  end_date?: string | null;
  price_per_day: number;
  total_days: number;
  total_amount: number;
  payment_status: string;
  views_count: number;
  clicks_count: number;
  created_at: string;
};

function formatMoney(v: number) {
  return v.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function fmtDate(input: any) {
  if (!input) return '—';
  const d = new Date(String(input));
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: '2-digit' });
}

export default function DashboardPublicidadPage() {
  const [isBooting, setIsBooting] = useState(true);
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    ad_type: 'banner',
    placement: 'home',
    image_url: '',
    link_url: '',
    start_date: '',
    end_date: '',
    price_per_day: 50,
    total_days: 7,
  });
  const [creatingPayment, setCreatingPayment] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      try {
        setIsBooting(true);
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) {
          window.location.href = '/login?returnTo=/dashboard/publicidad';
          return;
        }
        if (!cancelled) await loadCampaigns();
      } catch (e: unknown) {
        console.error(e);
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error al cargar.');
      } finally {
        if (!cancelled) setIsBooting(false);
      }
    };
    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadCampaigns = async () => {
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return;

      const res = await fetch('/api/ads/list', {
        headers: { authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'No se pudieron cargar las campañas.');
      setCampaigns((json?.campaigns ?? []) as AdCampaign[]);
    } catch (e: unknown) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Error al cargar campañas.');
    }
  };

  const handleCreate = async () => {
    if (!form.title.trim() || !form.placement || !form.price_per_day || !form.total_days) {
      setError('Completa todos los campos requeridos.');
      return;
    }
    setIsCreating(true);
    setError(null);
    setSuccess(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return;

      const res = await fetch('/api/ads/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'No se pudo crear la campaña.');
      setSuccess('Campaña creada. Ahora puedes proceder al pago.');
      setForm({
        title: '',
        description: '',
        ad_type: 'banner',
        placement: 'home',
        image_url: '',
        link_url: '',
        start_date: '',
        end_date: '',
        price_per_day: 50,
        total_days: 7,
      });
      await loadCampaigns();
    } catch (e: unknown) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Error al crear campaña.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreatePayment = async (campaignId: string) => {
    setCreatingPayment(campaignId);
    setError(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return;

      const res = await fetch('/api/ads/create-payment', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ campaign_id: campaignId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'No se pudo crear el pago.');
      const initPoint = json?.init_point;
      if (initPoint) {
        window.location.href = initPoint;
      } else {
        throw new Error('No se recibió URL de pago.');
      }
    } catch (e: unknown) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Error al crear pago.');
      setCreatingPayment(null);
    }
  };

  const totalAmount = form.price_per_day * form.total_days;

  if (isBooting) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-pink-50 to-white">
        <div className="mx-auto max-w-4xl px-4 py-10">
          <div className="h-14 rounded-2xl bg-white/70 shadow-sm ring-1 ring-black/5" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 to-white">
      <div className="mx-auto max-w-4xl px-4 py-10">
        <div className="rounded-3xl bg-white/80 p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
          <div className="text-lg font-bold text-gray-900">Publicidad</div>
          <div className="mt-1 text-sm text-gray-600">Crea campañas publicitarias para promocionar tus productos o servicios.</div>

          {error ? <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div> : null}
          {success ? <div className="mt-5 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{success}</div> : null}

          {/* Formulario de creación */}
          <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6">
            <div className="text-base font-bold text-gray-900">Crear nueva campaña</div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">Título *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink"
                  placeholder="Ej: Promoción de verano"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Tipo de anuncio *</label>
                <select
                  value={form.ad_type}
                  onChange={(e) => setForm((f) => ({ ...f, ad_type: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink"
                >
                  <option value="banner">Banner</option>
                  <option value="featured_listing">Producto destacado</option>
                  <option value="sidebar">Barra lateral</option>
                  <option value="popup">Popup</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Ubicación *</label>
                <select
                  value={form.placement}
                  onChange={(e) => setForm((f) => ({ ...f, placement: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink"
                >
                  <option value="home">Página principal</option>
                  <option value="listings">Listado de productos</option>
                  <option value="profile">Perfiles</option>
                  <option value="checkout">Checkout</option>
                  <option value="all">Todas las páginas</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">URL de imagen</label>
                <input
                  type="url"
                  value={form.image_url}
                  onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink"
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">URL de destino</label>
                <input
                  type="url"
                  value={form.link_url}
                  onChange={(e) => setForm((f) => ({ ...f, link_url: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink"
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Precio por día (MXN) *</label>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={form.price_per_day}
                  onChange={(e) => setForm((f) => ({ ...f, price_per_day: Number(e.target.value) }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Días de duración *</label>
                <input
                  type="number"
                  min="1"
                  value={form.total_days}
                  onChange={(e) => setForm((f) => ({ ...f, total_days: Number(e.target.value) }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Fecha de inicio (opcional)</label>
                <input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Fecha de fin (opcional)</label>
                <input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Descripción</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink"
                  rows={3}
                  placeholder="Describe tu campaña publicitaria..."
                />
              </div>
            </div>
            <div className="mt-4 rounded-xl bg-blue-50 px-4 py-3">
              <div className="text-sm font-semibold text-blue-900">Total: {formatMoney(totalAmount)}</div>
              <div className="mt-1 text-xs text-blue-700">
                {form.total_days} días × {formatMoney(form.price_per_day)}/día
              </div>
            </div>
            <button
              type="button"
              onClick={handleCreate}
              disabled={isCreating}
              className="mt-4 w-full rounded-xl bg-brand-pink px-5 py-3 text-sm font-semibold text-white shadow-lg hover:opacity-90 disabled:opacity-50"
            >
              {isCreating ? 'Creando...' : 'Crear campaña'}
            </button>
          </div>

          {/* Mis campañas */}
          <div className="mt-8">
            <div className="text-base font-bold text-gray-900">Mis campañas</div>
            <div className="mt-4 space-y-4">
              {campaigns.length === 0 ? (
                <div className="rounded-2xl bg-gray-50 px-4 py-8 text-center text-sm text-gray-600">No tienes campañas aún.</div>
              ) : (
                campaigns.map((campaign) => (
                  <div
                    key={campaign.id}
                    className={`rounded-2xl border p-4 ${
                      campaign.status === 'active'
                        ? 'border-green-200 bg-green-50/30'
                        : campaign.status === 'pending'
                          ? 'border-amber-200 bg-amber-50/30'
                          : 'border-black/5 bg-white'
                    }`}
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <div className="font-bold text-gray-900">{campaign.title}</div>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                              campaign.status === 'active'
                                ? 'bg-green-100 text-green-800'
                                : campaign.status === 'pending'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {campaign.status === 'active' ? 'Activa' : campaign.status === 'pending' ? 'Pendiente' : campaign.status}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                              campaign.payment_status === 'paid' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {campaign.payment_status === 'paid' ? 'Pagada' : campaign.payment_status}
                          </span>
                        </div>
                        <div className="mt-2 text-sm text-gray-600">
                          {formatMoney(campaign.total_amount)} · {campaign.total_days} días · {campaign.placement}
                        </div>
                        <div className="mt-2 flex gap-2 text-xs text-gray-500">
                          <span>👁️ {campaign.views_count} vistas</span>
                          <span>🖱️ {campaign.clicks_count} clicks</span>
                        </div>
                      </div>
                      {campaign.payment_status !== 'paid' && campaign.status !== 'active' && (
                        <button
                          type="button"
                          onClick={() => handleCreatePayment(campaign.id)}
                          disabled={creatingPayment === campaign.id}
                          className="rounded-xl bg-brand-pink px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                        >
                          {creatingPayment === campaign.id ? 'Procesando...' : 'Pagar ahora'}
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
