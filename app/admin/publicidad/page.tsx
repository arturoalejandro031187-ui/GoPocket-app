'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

type AdCampaign = {
  id: string;
  user_id: string;
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
  priority: number;
  created_at: string;
  approved_by?: string | null;
  approved_at?: string | null;
  rejection_reason?: string | null;
  user_email?: string | null;
};

function formatMoney(v: number) {
  return v.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function fmtDate(input: any) {
  if (!input) return '—';
  const d = new Date(String(input));
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-MX', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function AdminPublicidadPage() {
  const [isBooting, setIsBooting] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      try {
        setIsBooting(true);
        setError(null);

        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr) throw userErr;
        if (!userData.user) {
          window.location.href = '/login?returnTo=/admin/publicidad';
          return;
        }

        const { data: adminRow } = await supabase
          .from('admin_users')
          .select('user_id')
          .eq('user_id', userData.user.id)
          .maybeSingle();

        if (!adminRow) {
          setError('No tienes permisos de administrador.');
          return;
        }

        if (!cancelled) setIsAdmin(true);
        await loadCampaigns();
      } catch (e: unknown) {
        console.error(e);
        if (!cancelled) setError(e instanceof Error ? e.message : 'No se pudo cargar el panel.');
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

      const statusParam = filterStatus !== 'all' ? `&status=${encodeURIComponent(filterStatus)}` : '';
      const res = await fetch(`/api/ads/list?limit=100${statusParam}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'No se pudieron cargar las campañas.');

      // Enriquecer con emails de usuarios (usando API)
      const campaignsWithEmails = await Promise.all(
        ((json?.campaigns ?? []) as AdCampaign[]).map(async (campaign) => {
          try {
            // Obtener email desde el endpoint de usuarios
            const userRes = await fetch(`/api/admin/users/search?q=${encodeURIComponent(campaign.user_id)}&limit=1`, {
              headers: { authorization: `Bearer ${token}` },
            });
            const userJson = await userRes.json().catch(() => ({}));
            const user = ((userJson?.users ?? []) as any[])[0];
            return { ...campaign, user_email: user?.email || null };
          } catch {
            return { ...campaign, user_email: null };
          }
        })
      );

      setCampaigns(campaignsWithEmails);
    } catch (e: unknown) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Error al cargar campañas.');
    }
  };

  useEffect(() => {
    if (isAdmin) void loadCampaigns();
  }, [filterStatus, isAdmin]);

  const handleApprove = async (campaignId: string) => {
    setApprovingId(campaignId);
    setError(null);
    setSuccess(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return;

      const res = await fetch('/api/admin/ads/approve', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ campaign_id: campaignId, action: 'approve' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'No se pudo aprobar la campaña.');
      setSuccess('Campaña aprobada.');
      await loadCampaigns();
    } catch (e: unknown) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Error al aprobar campaña.');
    } finally {
      setApprovingId(null);
    }
  };

  const handleReject = async (campaignId: string) => {
    if (!rejectionReason.trim()) {
      setError('Debes proporcionar una razón para rechazar.');
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return;

      const res = await fetch('/api/admin/ads/approve', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ campaign_id: campaignId, action: 'reject', rejection_reason: rejectionReason.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'No se pudo rechazar la campaña.');
      setSuccess('Campaña rechazada.');
      setRejectingId(null);
      setRejectionReason('');
      await loadCampaigns();
    } catch (e: unknown) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Error al rechazar campaña.');
    }
  };

  const filteredCampaigns = useMemo(() => {
    return campaigns;
  }, [campaigns]);

  const stats = useMemo(() => {
    const total = campaigns.length;
    const pending = campaigns.filter((c) => c.status === 'pending' && c.payment_status === 'paid').length;
    const active = campaigns.filter((c) => c.status === 'active').length;
    const totalRevenue = campaigns.filter((c) => c.payment_status === 'paid').reduce((sum, c) => sum + Number(c.total_amount || 0), 0);
    return { total, pending, active, totalRevenue };
  }, [campaigns]);

  if (isBooting) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-pink-50 to-white">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <div className="h-14 rounded-2xl bg-white/70 shadow-sm ring-1 ring-black/5" />
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-pink-50 to-white">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error || 'No autorizado'}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 to-white">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="rounded-3xl bg-white/80 p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-lg font-bold text-gray-900">Panel de Publicidad</div>
              <div className="mt-1 text-sm text-gray-600">Gestiona campañas publicitarias y verifica pagos.</div>
            </div>
          </div>

          {error ? <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div> : null}
          {success ? <div className="mt-5 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{success}</div> : null}

          {/* Estadísticas */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
              <div className="text-xs font-semibold text-gray-600">Total campañas</div>
              <div className="mt-1 text-2xl font-extrabold text-gray-900">{stats.total}</div>
            </div>
            <div className="rounded-2xl bg-amber-50 p-4 shadow-sm ring-1 ring-amber-200">
              <div className="text-xs font-semibold text-amber-900">Pendientes de aprobación</div>
              <div className="mt-1 text-2xl font-extrabold text-amber-900">{stats.pending}</div>
            </div>
            <div className="rounded-2xl bg-green-50 p-4 shadow-sm ring-1 ring-green-200">
              <div className="text-xs font-semibold text-green-900">Campañas activas</div>
              <div className="mt-1 text-2xl font-extrabold text-green-900">{stats.active}</div>
            </div>
            <div className="rounded-2xl bg-blue-50 p-4 shadow-sm ring-1 ring-blue-200">
              <div className="text-xs font-semibold text-blue-900">Ingresos totales</div>
              <div className="mt-1 text-2xl font-extrabold text-blue-900">{formatMoney(stats.totalRevenue)}</div>
            </div>
          </div>

          {/* Filtros */}
          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setFilterStatus('all')}
              className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                filterStatus === 'all' ? 'bg-brand-pink text-white' : 'bg-white text-gray-900 shadow-sm ring-1 ring-black/5'
              }`}
            >
              Todas
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('pending')}
              className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                filterStatus === 'pending' ? 'bg-amber-500 text-white' : 'bg-white text-gray-900 shadow-sm ring-1 ring-black/5'
              }`}
            >
              Pendientes
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('active')}
              className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                filterStatus === 'active' ? 'bg-green-500 text-white' : 'bg-white text-gray-900 shadow-sm ring-1 ring-black/5'
              }`}
            >
              Activas
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('rejected')}
              className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                filterStatus === 'rejected' ? 'bg-red-500 text-white' : 'bg-white text-gray-900 shadow-sm ring-1 ring-black/5'
              }`}
            >
              Rechazadas
            </button>
          </div>

          {/* Lista de campañas */}
          <div className="mt-6 space-y-4">
            {filteredCampaigns.length === 0 ? (
              <div className="rounded-2xl bg-gray-50 px-4 py-8 text-center text-sm text-gray-600">No hay campañas para mostrar.</div>
            ) : (
              filteredCampaigns.map((campaign) => (
                <div
                  key={campaign.id}
                  className={`rounded-2xl border p-4 shadow-sm ${
                    campaign.status === 'active'
                      ? 'border-green-200 bg-green-50/30'
                      : campaign.status === 'pending'
                        ? 'border-amber-200 bg-amber-50/30'
                        : campaign.status === 'rejected'
                          ? 'border-red-200 bg-red-50/30'
                          : 'border-black/5 bg-white'
                  }`}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex-1">
                      <div className="flex items-start gap-3">
                        {campaign.image_url && (
                          <img src={campaign.image_url} alt={campaign.title} className="h-20 w-20 rounded-xl object-cover" />
                        )}
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <div className="text-base font-bold text-gray-900">{campaign.title}</div>
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                campaign.status === 'active'
                                  ? 'bg-green-100 text-green-800'
                                  : campaign.status === 'pending'
                                    ? 'bg-amber-100 text-amber-800'
                                    : campaign.status === 'rejected'
                                      ? 'bg-red-100 text-red-800'
                                      : 'bg-gray-100 text-gray-800'
                              }`}
                            >
                              {campaign.status === 'active' ? 'Activa' : campaign.status === 'pending' ? 'Pendiente' : campaign.status === 'rejected' ? 'Rechazada' : campaign.status}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                campaign.payment_status === 'paid' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                              }`}
                            >
                              {campaign.payment_status === 'paid' ? 'Pagada' : campaign.payment_status}
                            </span>
                          </div>
                          {campaign.description && <div className="mt-1 text-sm text-gray-600">{campaign.description}</div>}
                          <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-500">
                            <span>Tipo: {campaign.ad_type}</span>
                            <span>Ubicación: {campaign.placement}</span>
                            <span>Días: {campaign.total_days}</span>
                            <span>Precio/día: {formatMoney(campaign.price_per_day)}</span>
                            <span className="font-semibold text-gray-900">Total: {formatMoney(campaign.total_amount)}</span>
                          </div>
                          <div className="mt-2 text-xs text-gray-500">
                            Usuario: {campaign.user_email || campaign.user_id.slice(0, 8)} · Creada: {fmtDate(campaign.created_at)}
                          </div>
                          {campaign.start_date && campaign.end_date && (
                            <div className="mt-1 text-xs text-gray-500">
                              Período: {fmtDate(campaign.start_date)} - {fmtDate(campaign.end_date)}
                            </div>
                          )}
                          {campaign.rejection_reason && (
                            <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                              <strong>Razón de rechazo:</strong> {campaign.rejection_reason}
                            </div>
                          )}
                          <div className="mt-2 flex gap-2 text-xs text-gray-500">
                            <span>👁️ {campaign.views_count} vistas</span>
                            <span>🖱️ {campaign.clicks_count} clicks</span>
                            {campaign.clicks_count > 0 && campaign.views_count > 0 && (
                              <span>📊 CTR: {((campaign.clicks_count / campaign.views_count) * 100).toFixed(2)}%</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-shrink-0">
                      {campaign.status === 'pending' && campaign.payment_status === 'paid' && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleApprove(campaign.id)}
                            disabled={approvingId === campaign.id}
                            className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                          >
                            {approvingId === campaign.id ? 'Aprobando...' : '✓ Aprobar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setRejectingId(campaign.id)}
                            className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
                          >
                            ✗ Rechazar
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Modal para rechazar */}
        {rejectingId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-lg">
              <h3 className="text-lg font-bold text-gray-900">Rechazar campaña</h3>
              <p className="mt-2 text-sm text-gray-600">Proporciona una razón para rechazar esta campaña publicitaria.</p>
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700">Razón de rechazo *</label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink"
                  placeholder="Ej: Contenido inapropiado, imagen de baja calidad, etc."
                  rows={4}
                />
              </div>
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setRejectingId(null);
                    setRejectionReason('');
                  }}
                  className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => handleReject(rejectingId)}
                  className="flex-1 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
                >
                  Rechazar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
