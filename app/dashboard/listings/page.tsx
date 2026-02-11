'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { ProExpirationBanner } from '@/components/dashboard/ProExpirationBanner';
import { PLAN_LIMITS } from '@/lib/plans/limits';

type ListingRow = {
  id: string;
  public_id?: string | null;
  title: string;
  price: number | string;
  currency: string;
  status: 'draft' | 'active' | 'sold' | 'paused' | 'blocked';
  is_featured?: boolean | null;
  sale_type?: 'direct' | 'auction' | null;
  created_at: string;
  expires_at?: string | null;
  view_count?: number | null;
  images?: string[] | null;
  auction_end_at?: string | null;
  auction_highest_bid?: number | null;
  auction_highest_bidder_id?: string | null;
  auction_starting_bid?: number | null;
  is_deleted?: boolean | null;
  deleted_at?: string | null;
};

function formatMoney(value: number) {
  return value.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function formatDateTime(input: string | null | undefined) {
  if (!input) return '—';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-MX', { year: 'numeric', month: 'short', day: '2-digit' });
}

function formatTimeLeft(endAt: string | null | undefined) {
  if (!endAt) return '—';
  const end = Date.parse(endAt);
  if (!Number.isFinite(end)) return '—';
  const diff = end - Date.now();
  if (diff <= 0) return 'Finalizada';
  const totalMins = Math.floor(diff / 60000);
  const days = Math.floor(totalMins / (60 * 24));
  const hours = Math.floor((totalMins - days * 60 * 24) / 60);
  const mins = totalMins - days * 60 * 24 - hours * 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  parts.push(`${mins}m`);
  return parts.join(' ');
}

function addDays(iso: string, days: number) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function toNumber(v: number | string | null | undefined) {
  const n = typeof v === 'number' ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function statusLabel(s: ListingRow['status']) {
  if (s === 'active') return 'Activa';
  if (s === 'paused') return 'Pausada';
  if (s === 'sold') return 'Vendida';
  if (s === 'draft') return 'Borrador';
  if (s === 'blocked') return 'Bloqueada';
  return s;
}

function useSuspensionCountdown(adminState: { status: string; suspended_until: string | null } | null, currentTime: number) {
  return useMemo(() => {
    const s = adminState;
    if (!s || s.status !== 'suspended' || !s.suspended_until) return null;
    const end = new Date(s.suspended_until).getTime();
    const diff = Math.max(0, end - currentTime);
    if (diff <= 0) return { days: 0, hours: 0, ended: true };
    const totalHours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    return { days, hours, ended: false };
  }, [adminState, currentTime]);
}

export default function DashboardListingsPage() {
  const [isBooting, setIsBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [rows, setRows] = useState<ListingRow[]>([]);
  const [q, setQ] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [userPlan, setUserPlan] = useState<'basic' | 'pro'>('basic');
  const [bidderNames, setBidderNames] = useState<Record<string, string>>({});
  const [adminState, setAdminState] = useState<{ status: string; suspended_until: string | null } | null>(null);
  const [currentTime, setCurrentTime] = useState(Date.now());

  const suspensionCountdown = useSuspensionCountdown(adminState, currentTime);
  const isSuspended = adminState?.status === 'suspended';
  const isBanned = adminState?.status === 'banned';

  useEffect(() => {
    if (!isSuspended) return;
    const t = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isSuspended]);

  const archiveListing = async (row: ListingRow) => {
    setError(null);
    setSuccess(null);
    if (!confirm('¿Seguro que deseas eliminar esta publicación? Se archivará (no se borra del historial).')) return;
    setIsUpdating(true);
    try {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) throw sessionErr;
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Auth session missing');

      const res = await fetch('/api/listings/archive', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ listingId: row.id, reason: 'seller_archived' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'No se pudo eliminar.');

      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setSuccess('Publicación eliminada (archivada).');
    } catch (e: unknown) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'No se pudo eliminar.');
    } finally {
      setIsUpdating(false);
    }
  };

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
          window.location.href = '/login';
          return;
        }

        // Fetch User Plan
        const { data: profile } = await supabase
          .from('profiles')
          .select('plan_type')
          .eq('id', userData.user.id)
          .single();
        if (!cancelled && profile?.plan_type === 'pro') {
          setUserPlan('pro');
        }

        const { data: stateRow } = await supabase
          .from('user_admin_states')
          .select('status,suspended_until')
          .eq('user_id', userData.user.id)
          .maybeSingle();
        if (!cancelled && stateRow) {
          setAdminState({
            status: String((stateRow as any)?.status ?? 'active'),
            suspended_until: (stateRow as any)?.suspended_until ?? null,
          });
        }

        // Auto-pausa (30 días) si el esquema ya tiene expires_at
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (token) {
          await fetch('/api/listings/autopause', {
            method: 'POST',
            headers: { authorization: `Bearer ${token}` },
          }).catch(() => null);
        }

        // Intentar cargar con columnas nuevas; si no existen, fallback
        let listRes: any = await supabase
          .from('listings')
          .select(
            'id,public_id,title,price,currency,status,is_featured,sale_type,created_at,expires_at,view_count,images,auction_end_at,auction_highest_bid,auction_highest_bidder_id,auction_starting_bid,is_deleted,deleted_at',
          )
          .eq('seller_id', userData.user.id)
          .order('created_at', { ascending: false })
          .limit(200);

        if (listRes.error) {
          const code = String((listRes.error as any)?.code || '');
          const msg = String((listRes.error as any)?.message || '');
          if (code === '42703' || msg.toLowerCase().includes('does not exist')) {
            listRes = await supabase
              .from('listings')
              .select('id,title,price,currency,status,is_featured,sale_type,created_at,images')
              .eq('seller_id', userData.user.id)
              .order('created_at', { ascending: false })
              .limit(200);
          }
        }
        if (listRes.error) throw listRes.error;

        let nextRows = (((listRes.data as ListingRow[]) ?? []) as ListingRow[]) ?? [];
        // Ocultar archivadas (borrado lógico) si la columna existe
        nextRows = nextRows.filter((r: any) => !r?.is_deleted);
        if (!cancelled) setRows(nextRows);

        // Best effort: resolver nombre del usuario que va ganando en subastas
        const bidderIds = Array.from(
          new Set(
            nextRows
              .filter((r) => r.sale_type === 'auction')
              .map((r) => String(r.auction_highest_bidder_id || '').trim())
              .filter(Boolean),
          ),
        );
        if (bidderIds.length > 0) {
          let profRes: any = await supabase.from('profiles').select('id,full_name,nickname,username').in('id', bidderIds);
          if (profRes.error) {
            const code = String((profRes.error as any)?.code || '');
            const msg = String((profRes.error as any)?.message || '');
            if (code === '42703' || msg.toLowerCase().includes('does not exist')) {
              profRes = await supabase.from('profiles').select('id,full_name').in('id', bidderIds);
            }
          }
          if (!profRes.error && Array.isArray(profRes.data)) {
            const map: Record<string, string> = {};
            for (const p of profRes.data as any[]) {
              const id = String(p?.id || '').trim();
              if (!id) continue;
              const name =
                String(p?.full_name || '').trim() ||
                String(p?.nickname || '').trim() ||
                String(p?.username || '').trim() ||
                `${id.slice(0, 6)}…`;
              map[id] = name;
            }
            if (!cancelled) setBidderNames(map);
          }
        }
      } catch (e: unknown) {
        console.error(e);
        if (!cancelled) setError(e instanceof Error ? e.message : 'No se pudieron cargar tus publicaciones.');
      } finally {
        if (!cancelled) setIsBooting(false);
      }
    };
    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => {
      const title = (r.title || '').toLowerCase();
      const pid = String((r as any).public_id || '').toLowerCase();
      return title.includes(needle) || (pid && pid.includes(needle));
    });
  }, [rows, q]);

  const cloneListing = async (listingId: string) => {
    setError(null);
    setSuccess(null);
    setIsUpdating(true);
    try {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) throw sessionErr;
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Auth session missing');

      const res = await fetch('/api/listings/clone', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ listingId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'No se pudo duplicar.');

      const newId = String(json?.id || '').trim();
      if (!newId) throw new Error('Respuesta inválida al duplicar.');
      setSuccess('Borrador creado. Abriendo…');
      window.location.href = `/dashboard/listings/${newId}/edit`;
    } catch (e: unknown) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'No se pudo duplicar.');
    } finally {
      setIsUpdating(false);
    }
  };

  const updateStatus = async (listingId: string, status: 'active' | 'paused' | 'sold') => {
    setError(null);
    setSuccess(null);
    setIsUpdating(true);
    try {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) throw sessionErr;
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Auth session missing');

      const res = await fetch('/api/listings/update-status', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ listingId, status }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'No se pudo actualizar el estado.');

      setRows((prev) => prev.map((r) => (r.id === listingId ? { ...r, status } : r)));
      setSuccess('Cambios guardados.');
    } catch (e: unknown) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'No se pudo actualizar.');
    } finally {
      setIsUpdating(false);
    }
  };

  if (isBooting) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-pink-50 to-white">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <div className="h-14 rounded-2xl bg-white/70 ring-1 ring-black/5" />
          <div className="mt-6 h-72 rounded-2xl bg-white/70 ring-1 ring-black/5" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 to-white">
      <div className="sticky top-0 z-40 border-b border-black/5 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 items-center justify-center rounded-xl bg-brand-pink px-3 text-white shadow-sm">
              <span className="text-sm font-extrabold tracking-widest">GoPocket</span>
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-gray-900">Mis publicaciones</div>
              <div className="text-xs text-gray-500">Gestiona tus artículos</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/sell" className="rounded-xl bg-brand-pink px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90">
              Vender
            </Link>
            <Link
              href="/dashboard"
              className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-black/5 hover:bg-gray-50"
            >
              Volver
            </Link>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <ProExpirationBanner />
        {error && <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
        {success && (
          <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{success}</div>
        )}

        {isBanned && (
          <div className="mb-6 rounded-2xl border border-red-300 bg-red-50 px-5 py-4 text-center text-sm text-red-900">
            <span className="font-extrabold">Cuenta bloqueada.</span> No puedes activar ni publicar.
          </div>
        )}
        {isSuspended && (
          <div className="mb-6 flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 sm:gap-6">
            <span className="text-sm font-extrabold text-amber-900">Cuenta suspendida.</span>
            <span className="text-xs text-amber-800">No puedes activar publicaciones hasta que termine la suspensión.</span>
            {suspensionCountdown && !suspensionCountdown.ended ? (
              <span className="rounded-xl bg-amber-100 px-4 py-2 font-mono text-lg font-bold tabular-nums text-amber-900 ring-1 ring-amber-300">
                {suspensionCountdown.days}d {suspensionCountdown.hours}h
              </span>
            ) : null}
          </div>
        )}

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-semibold text-gray-900">{filtered.length} publicaciones</div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-pink sm:max-w-sm"
            placeholder="Buscar por título..."
          />
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-3xl bg-white p-10 text-center text-sm text-gray-600 shadow-sm ring-1 ring-black/5">
            Aún no tienes publicaciones. Usa <span className="font-semibold">“Publicar”</span> para crear tu primer artículo.
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((r) => {
              const created = r.created_at;
              const fallbackExpires = created ? addDays(created, 30) : null;
              const expiresAt = (r.expires_at ?? fallbackExpires) || null;
              const isExpired = expiresAt ? Date.parse(expiresAt) < Date.now() : false;
              const price = toNumber(r.price);
              
              // Usar comisión basada en plan (23% Basic, 18% Pro)
              const planLimits = PLAN_LIMITS[userPlan] || PLAN_LIMITS.basic;
              const rate = planLimits.commission_percent / 100;
              
              const commission = Math.max(0, price * rate);
              const net = Math.max(0, price - commission);
              const views = Number(r.view_count ?? 0) || 0;
              const thumb = Array.isArray(r.images) && r.images.length > 0 ? r.images[0] : null;

              const isAuction = r.sale_type === 'auction';
              const highestBid = Number(r.auction_highest_bid ?? 0) || 0;
              const startingBid = Number(r.auction_starting_bid ?? 0) || 0;
              const currentBid = highestBid > 0 ? highestBid : startingBid > 0 ? startingBid : price;
              const leaderId = String(r.auction_highest_bidder_id || '').trim();
              const leaderName = leaderId ? bidderNames[leaderId] || `${leaderId.slice(0, 6)}…` : '—';
              const auctionEndMs = r.auction_end_at ? Date.parse(r.auction_end_at) : NaN;
              const auctionEnded = isAuction ? (Number.isFinite(auctionEndMs) ? Date.now() >= auctionEndMs : false) : false;

              return (
                <div
                  key={r.id}
                  className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5 sm:p-5"
                >
                  <div className="flex items-start gap-4">
                    <div className="shrink-0">
                      <div className="h-24 w-24 overflow-hidden rounded-2xl bg-gray-100 ring-1 ring-black/5 sm:h-28 sm:w-28">
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumb} alt="" className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/listings/${r.id}`} className="truncate text-sm font-semibold text-gray-900 hover:underline">
                          {r.title}
                        </Link>
                        {r.public_id ? (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
                            ID: {r.public_id}
                          </span>
                        ) : null}
                        {r.is_featured ? (
                          <span className="rounded-full bg-pink-50 px-2 py-0.5 text-xs font-semibold text-brand-pink ring-1 ring-pink-100">
                            Destacado
                          </span>
                        ) : null}
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
                          {r.sale_type === 'auction' ? 'Subasta' : 'Venta directa'}
                        </span>
                        <span
                          className={[
                            'rounded-full px-2 py-0.5 text-xs font-semibold ring-1',
                            r.status === 'active'
                              ? 'bg-green-50 text-green-800 ring-green-100'
                              : r.status === 'paused'
                                ? 'bg-amber-50 text-amber-800 ring-amber-100'
                                : r.status === 'sold'
                                  ? 'bg-gray-100 text-gray-700 ring-black/5'
                                  : 'bg-gray-100 text-gray-700 ring-black/5',
                          ].join(' ')}
                        >
                          {statusLabel(r.status)}
                        </span>
                        {isExpired ? (
                          <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800 ring-1 ring-red-100">
                            Expirada (30 días)
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-2 grid gap-2 text-xs text-gray-600 sm:grid-cols-2 lg:grid-cols-3">
                        <div className="rounded-2xl bg-gray-50 px-3 py-2 ring-1 ring-black/5">
                          <div className="font-semibold text-gray-900">Inicio</div>
                          <div>{formatDateTime(created)}</div>
                        </div>
                        <div className="rounded-2xl bg-gray-50 px-3 py-2 ring-1 ring-black/5">
                          <div className="font-semibold text-gray-900">Finaliza</div>
                          <div>{expiresAt ? formatDateTime(expiresAt) : '—'}</div>
                        </div>
                        <div className="rounded-2xl bg-gray-50 px-3 py-2 ring-1 ring-black/5">
                          <div className="font-semibold text-gray-900">Vistas</div>
                          <div>{views}</div>
                        </div>
                        <div className="rounded-2xl bg-gray-50 px-3 py-2 ring-1 ring-black/5">
                          <div className="font-semibold text-gray-900">{isAuction ? 'Costo (puja actual)' : 'Costo (precio)'}</div>
                          <div className="text-gray-900 font-semibold">{formatMoney(isAuction ? currentBid : price)}</div>
                        </div>
                        <div className="rounded-2xl bg-gray-50 px-3 py-2 ring-1 ring-black/5">
                          <div className="font-semibold text-gray-900">Comisión ({Math.round(rate * 100)}%)</div>
                          <div>- {formatMoney(commission)}</div>
                        </div>
                        <div className="rounded-2xl bg-gray-50 px-3 py-2 ring-1 ring-black/5">
                          <div className="font-semibold text-gray-900">Te queda</div>
                          <div className="text-gray-900 font-semibold">{formatMoney(net)}</div>
                        </div>
                      </div>

                      {isAuction ? (
                        <div className="mt-2 grid gap-2 text-xs text-gray-600 sm:grid-cols-2 lg:grid-cols-3">
                          <div className="rounded-2xl bg-pink-50 px-3 py-2 ring-1 ring-pink-100">
                            <div className="font-semibold text-gray-900">Tiempo restante</div>
                            <div className="text-gray-900 font-semibold">{formatTimeLeft(r.auction_end_at)}</div>
                          </div>
                          <div className="rounded-2xl bg-pink-50 px-3 py-2 ring-1 ring-pink-100">
                            <div className="font-semibold text-gray-900">Puja actual</div>
                            <div className="text-gray-900 font-semibold">{formatMoney(currentBid)}</div>
                          </div>
                          <div className="rounded-2xl bg-pink-50 px-3 py-2 ring-1 ring-pink-100">
                            <div className="font-semibold text-gray-900">Va ganando</div>
                            <div className="text-gray-900 font-semibold">
                              {leaderId ? (
                                <Link href={`/perfil/${leaderId}`} className="text-brand-pink hover:underline">
                                  {leaderName}
                                </Link>
                              ) : (
                                'Sin pujas'
                              )}
                            </div>
                          </div>
                        </div>
                      ) : null}

                      <div className="mt-4 flex flex-wrap gap-2">
                        <Link
                          href={`/dashboard/listings/${r.id}/edit`}
                          className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-black/5 hover:bg-gray-50"
                        >
                          Editar
                        </Link>
                        <Link
                          href={`/listings/${r.id}`}
                          className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-black/5 hover:bg-gray-50"
                        >
                          Ver
                        </Link>
                        {r.status !== 'sold' && (
                          <button
                            type="button"
                            disabled={isUpdating || (isSuspended && r.status !== 'active')}
                            onClick={() => updateStatus(r.id, r.status === 'active' ? 'paused' : 'active')}
                            className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-black/5 hover:bg-gray-50 disabled:opacity-60"
                            title={isSuspended && r.status !== 'active' ? 'No puedes activar durante la suspensión.' : undefined}
                          >
                            {r.status === 'active' ? 'Pausar' : 'Activar'}
                          </button>
                        )}
                        {r.status !== 'sold' && (
                          <button
                            type="button"
                            disabled={isUpdating}
                            onClick={() => updateStatus(r.id, 'sold')}
                            className="rounded-xl bg-gray-900 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-black disabled:opacity-60"
                          >
                            Marcar vendido
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => cloneListing(r.id)}
                          className="rounded-xl bg-brand-pink px-3 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-60"
                        >
                          Publicar similar
                        </button>
                        <button
                          type="button"
                          disabled={isUpdating || (isAuction && !auctionEnded)}
                          onClick={() => archiveListing(r)}
                          className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-red-700 shadow-sm ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-60"
                          title={isAuction && !auctionEnded ? 'No puedes eliminar una subasta hasta que finalice.' : 'Eliminar (archivar)'}
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

