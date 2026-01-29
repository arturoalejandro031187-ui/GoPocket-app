'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

function formatMoney(v: number) {
  return v.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function fmtDate(input?: string | null) {
  if (!input) return '—';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: '2-digit' });
}

type UserRow = {
  id: string;
  email?: string | null;
  full_name?: string | null;
  nickname?: string | null;
  username?: string | null;
  phone?: string | null;
  ine_front_url?: string | null;
  ine_back_url?: string | null;
  address?: any;
  created_at?: string | null;
  auth_created_at?: string | null;
  last_sign_in_at?: string | null;
  encrypted_password?: string | null;
  admin_state?: any;
  is_verified?: boolean | null;
  stats?: {
    ventas_count: number;
    ventas_total: number;
    compras_count: number;
    compras_total: number;
    comision_total: number;
    envios_total: number;
    ventas_total_count?: number;
    compras_total_count?: number;
    ventas_cancelled_count?: number;
    compras_cancelled_count?: number;
    operations_count?: number;
    disputes_buyer?: number;
    disputes_seller?: number;
    disputes_open?: number;
    disputes_total?: number;
    withdrawn_total?: number;
  } | null;
};

type RatingRow = { id: string; order_id: string; rater_id: string; rater_name?: string; direction: string; stars: number; comment: string; created_at?: string };
type UserDetail = {
  user: {
    id: string;
    email?: string | null;
    auth_created_at?: string | null;
    last_sign_in_at?: string | null;
    profile: any;
    admin_state: any;
    is_verified: boolean;
    stats: {
      ventas_count: number;
      ventas_total: number;
      ventas_total_count: number;
      ventas_cancelled_count: number;
      compras_count: number;
      compras_total: number;
      compras_total_count: number;
      compras_cancelled_count: number;
      operations_count: number;
      disputes_buyer: number;
      disputes_seller: number;
      disputes_open: number;
      disputes_total: number;
      withdrawn_total: number;
    };
    ratings: RatingRow[];
    recent_orders: any[];
    disputes_as_buyer: any[];
    disputes_as_seller: any[];
  };
};

export default function AdminUsuariosPage() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<UserRow[]>([]);
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const [suspendDays, setSuspendDays] = useState('7');
  const [notes, setNotes] = useState('');
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editingRating, setEditingRating] = useState<RatingRow | null>(null);
  const [editStars, setEditStars] = useState('5');
  const [editComment, setEditComment] = useState('');
  const [deletingRatingId, setDeletingRatingId] = useState<string | null>(null);

  const cancelRate = (cancelled: number, total: number) => {
    const t = Number(total || 0) || 0;
    const c = Number(cancelled || 0) || 0;
    if (t <= 0) return 0;
    return Math.round((c / t) * 100);
  };

  const displayName = (u: UserRow) =>
    String(u.full_name || '').trim() ||
    String(u.nickname || '').trim() ||
    String(u.username || '').trim() ||
    `${u.id.slice(0, 6)}…`;

  const currentStateLabel = useMemo(() => {
    if (!selected) return '—';
    const st = String(selected?.admin_state?.status || 'active');
    if (st === 'deleted') return 'Eliminada';
    if (st === 'banned') return 'Bloqueada';
    if (st === 'suspended') return `Suspendida (hasta ${String(selected?.admin_state?.suspended_until || '—')})`;
    return 'Activa';
  }, [selected]);

  const loadDetail = async (userId: string) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) return;
      const res = await fetch(`/api/admin/users/${userId}`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (res.ok && (json as any)?.ok) setDetail(json as UserDetail);
    } catch (e) {
      console.error(e);
    } finally {
      setDetailLoading(false);
    }
  };

  const search = async () => {
    setError(null);
    setSuccess(null);
    setIsLoading(true);
    setSelected(null);
    setDetail(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        window.location.href = '/login?returnTo=/admin/usuarios';
        return;
      }
      const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(q.trim())}&limit=40`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'No se pudieron cargar usuarios.');
      setRows((json?.users ?? []) as UserRow[]);
    } catch (e: unknown) {
      console.error(e);
      setRows([]);
      setError(e instanceof Error ? e.message : 'No se pudieron cargar usuarios.');
    } finally {
      setIsLoading(false);
    }
  };

  // Cargar todos al entrar (sin necesidad de buscar)
  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const { data: sess } = await supabase.auth.getSession();
        const token = sess?.session?.access_token;
        if (!token) {
          window.location.href = '/login?returnTo=/admin/usuarios';
          return;
        }
        const res = await fetch(`/api/admin/users/search?limit=100`, { 
          headers: { authorization: `Bearer ${token}` },
          cache: 'no-store'
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || 'No se pudieron cargar usuarios.');
        if (!cancelled) setRows((json?.users ?? []) as UserRow[]);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'No se pudieron cargar usuarios.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void boot();
    return () => { cancelled = true; };
  }, []);

  const applyState = async (action: 'activate' | 'suspend' | 'ban' | 'delete') => {
    if (!selected) return;
    
    // Confirmación para eliminar
    if (action === 'delete') {
      if (!confirm('⚠️ ¿Estás SEGURO de que quieres ELIMINAR este usuario?\n\nEsta acción:\n- Marcará al usuario como eliminado\n- Bloqueará su acceso permanentemente\n- Ocultará sus listados\n\nNo se recomienda si el usuario tiene transacciones activas.')) {
        return;
      }
    }
    
    setError(null);
    setSuccess(null);
    setIsSaving(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        window.location.href = '/login?returnTo=/admin/usuarios';
        return;
      }
      const days = action === 'suspend' ? Math.max(1, Number(suspendDays || 7)) : 0;
      const res = await fetch('/api/admin/users/state', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ user_id: selected.id, action, days, notes }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'No se pudo actualizar el estado.');
      setSuccess(action === 'delete' ? 'Usuario eliminado correctamente.' : 'Estado actualizado.');
      
      // Si se eliminó, limpiar selección
      if (action === 'delete') {
        setSelected(null);
        setDetail(null);
      }
      
      await search();
    } catch (e: unknown) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'No se pudo actualizar el estado.');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleVerification = async () => {
    if (!selected) return;
    setError(null);
    setSuccess(null);
    setIsSaving(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        window.location.href = '/login?returnTo=/admin/usuarios';
        return;
      }
      const newVerifiedState = !selected.is_verified;
      const res = await fetch('/api/admin/users/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ user_id: selected.id, is_verified: newVerifiedState }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'No se pudo actualizar la verificación.');
      setSuccess(newVerifiedState ? 'Usuario verificado.' : 'Verificación removida.');
      const updatedSelected = { ...selected, is_verified: newVerifiedState };
      setSelected(updatedSelected);
      setRows((prevRows) =>
        prevRows.map((u) => (u.id === selected.id ? { ...u, is_verified: newVerifiedState } : u))
      );
      if (selected.id) void loadDetail(selected.id);
    } catch (e: unknown) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'No se pudo actualizar la verificación.');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteRating = async (ratingId: string) => {
    setError(null);
    setDeletingRatingId(ratingId);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return;
      const res = await fetch(`/api/admin/users/ratings?rating_id=${encodeURIComponent(ratingId)}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as any)?.error || 'No se pudo eliminar.');
      setSuccess('Calificación eliminada.');
      if (selected?.id) void loadDetail(selected.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar la calificación.');
    } finally {
      setDeletingRatingId(null);
    }
  };

  const saveRatingEdit = async () => {
    if (!editingRating) return;
    setError(null);
    setIsSaving(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return;
      const res = await fetch('/api/admin/users/ratings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          rating_id: editingRating.id,
          stars: Math.max(1, Math.min(10, Number(editStars) || 5)),
          comment: editComment.slice(0, 600),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as any)?.error || 'No se pudo guardar.');
      setSuccess('Calificación actualizada.');
      setEditingRating(null);
      if (selected?.id) void loadDetail(selected.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar la calificación.');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteAccount = async () => {
    if (!selected) {
      console.error('[USUARIOS] No hay usuario seleccionado');
      setError('No hay usuario seleccionado.');
      return;
    }
    
    const confirmed = confirm(
      '⚠️ ELIMINACIÓN PERMANENTE\n\n' +
      '¿Estás seguro de eliminar esta cuenta?\n\n' +
      'Esto eliminará:\n' +
      '- Todas las publicaciones del usuario\n' +
      '- Todos los cupones del vendedor\n' +
      '- Todos los favoritos\n' +
      '- La cuenta será marcada como eliminada\n\n' +
      '⚠️ Esta acción NO es reversible.\n\n' +
      '¿Continuar?'
    );
    
    if (!confirmed) {
      console.log('[USUARIOS] Eliminación cancelada por el usuario');
      return;
    }
    
    console.log('[USUARIOS] Iniciando eliminación de cuenta:', selected.id);
    setError(null);
    setSuccess(null);
    setIsSaving(true);
    
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      
      if (!token) {
        console.error('[USUARIOS] No hay token de sesión');
        setError('No hay sesión activa. Por favor, inicia sesión nuevamente.');
        window.location.href = '/login?returnTo=/admin/usuarios';
        return;
      }
      
      console.log('[USUARIOS] Enviando request a API...', { userId: selected.id, notes });
      
      const res = await fetch('/api/admin/users/delete-account', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ user_id: selected.id, notes }),
      });
      
      console.log('[USUARIOS] Respuesta recibida:', { status: res.status, ok: res.ok });
      
      const json = await res.json().catch((parseErr) => {
        console.error('[USUARIOS] Error parseando JSON:', parseErr);
        return { error: 'Error en la respuesta del servidor' };
      });
      
      console.log('[USUARIOS] JSON respuesta:', json);
      
      if (!res.ok) {
        const errorMsg = (json as any)?.error || `No se pudo eliminar la cuenta (${res.status}).`;
        console.error('[USUARIOS] Error del servidor:', { status: res.status, error: errorMsg, json });
        throw new Error(errorMsg);
      }
      
      const deletedListings = (json as any)?.deletedListings ?? 0;
      const successMsg = (json as any)?.message || `Cuenta eliminada completamente. ${deletedListings} publicaciones eliminadas.`;
      
      console.log('[USUARIOS] ✅ Cuenta eliminada exitosamente:', { deletedListings, message: successMsg });
      
      setSuccess(successMsg);
      setSelected(null);
      setDetail(null);
      
      // Recargar lista de usuarios
      await search();
    } catch (e: unknown) {
      console.error('[USUARIOS] Error en deleteAccount:', e);
      setError(e instanceof Error ? e.message : 'No se pudo eliminar la cuenta.');
    } finally {
      setIsSaving(false);
    }
  };


  return (
    <div className="rounded-3xl bg-white/80 p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-lg font-bold text-gray-900">Admin · Usuarios</div>
          <div className="mt-1 text-sm text-gray-600">Busca por nombre/nickname/username o por UUID.</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/metricas" className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-black/5 hover:bg-gray-50">
            Métricas
          </Link>
        </div>
      </div>

      {error ? (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <div className="font-semibold">Error:</div>
          <div className="mt-1">{error}</div>
          <div className="mt-2 text-xs text-red-700">
            Abre la consola del navegador (F12) para ver más detalles.
          </div>
        </div>
      ) : null}
      {success ? <div className="mt-5 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{success}</div> : null}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-pink"
          placeholder="Ej: armando / alejandra / usuario123 / UUID"
        />
        <button
          type="button"
          onClick={search}
          disabled={isLoading}
          className="shrink-0 rounded-xl bg-brand-pink px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-60"
        >
          {isLoading ? 'Buscando…' : 'Buscar'}
        </button>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/5">
          <div className="border-b border-black/5 px-6 py-4">
            <div className="text-sm font-semibold text-gray-900">{rows.length} resultados</div>
          </div>
          {rows.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-gray-600">Aún no hay resultados.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[1100px] w-full divide-y divide-black/5">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Usuario</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Inscripción</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Ventas</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Compras</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Ops</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Disputas</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Retirado</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Cancelación</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Estado</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">Perfil</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5 bg-white">
                  {rows.map((u) => {
                    const st = String(u?.admin_state?.status || 'active');
                    const ventasTotalCount = Number(u?.stats?.ventas_total_count ?? u?.stats?.ventas_count ?? 0) || 0;
                    const comprasTotalCount = Number(u?.stats?.compras_total_count ?? u?.stats?.compras_count ?? 0) || 0;
                    const vCan = Number(u?.stats?.ventas_cancelled_count ?? 0) || 0;
                    const cCan = Number(u?.stats?.compras_cancelled_count ?? 0) || 0;
                    const vRate = cancelRate(vCan, ventasTotalCount);
                    const cRate = cancelRate(cCan, comprasTotalCount);
                    return (
                      <tr
                        key={u.id}
                        className="cursor-pointer hover:bg-gray-50"
                        onClick={() => {
                          setSelected(u);
                          setNotes(String(u?.admin_state?.notes || ''));
                          setShowPassword(false);
                          setEditingRating(null);
                          void loadDetail(u.id);
                        }}
                      >
                        <td className="px-4 py-4">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-gray-900">
                              {displayName(u)}
                              {!u.full_name && !u.nickname && !u.username && (
                                <span className="ml-2 text-xs font-normal text-gray-400">(Sin nombre)</span>
                              )}
                            </div>
                            <div className="flex items-center text-xs text-gray-500">
                              {u.email}
                              <span className="mx-1">·</span>
                              <span className="font-mono">{u.id.slice(0, 8)}...</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(u.id);
                                  const el = e.currentTarget;
                                  const original = el.innerHTML;
                                  el.innerHTML = '✅';
                                  setTimeout(() => {
                                    el.innerHTML = original;
                                  }, 1000);
                                }}
                                className="ml-1 text-gray-400 hover:text-brand-pink focus:outline-none"
                                title="Copiar UUID completo"
                              >
                                📋
                              </button>
                            </div>
                            {(!u.full_name && !u.nickname && !u.username && !u.email) && (
                              <div className="mt-1 text-[10px] text-amber-600">
                                ⚠️ Usuario sin datos completos
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-xs text-gray-700">
                          <div className="font-semibold text-gray-900">{fmtDate(u.auth_created_at || u.created_at)}</div>
                          {u.last_sign_in_at ? <div className="mt-1 text-[11px] text-gray-500">Último acceso: {fmtDate(u.last_sign_in_at)}</div> : null}
                        </td>
                        <td className="px-4 py-4 text-xs text-gray-700">
                          <div className="font-semibold text-gray-900">{u.stats?.ventas_count ?? 0}</div>
                          <div className="mt-1 text-[11px] text-gray-500">{formatMoney(Number(u?.stats?.ventas_total ?? 0))}</div>
                        </td>
                        <td className="px-4 py-4 text-xs text-gray-700">
                          <div className="font-semibold text-gray-900">{u.stats?.compras_count ?? 0}</div>
                          <div className="mt-1 text-[11px] text-gray-500">{formatMoney(Number(u?.stats?.compras_total ?? 0))}</div>
                        </td>
                        <td className="px-4 py-4 text-xs font-semibold text-gray-900">{u.stats?.operations_count ?? 0}</td>
                        <td className="px-4 py-4 text-xs text-gray-700">
                          <span className="font-semibold text-gray-900">{(u.stats?.disputes_total ?? 0) as number}</span>
                          {((u.stats?.disputes_buyer ?? 0) as number) + ((u.stats?.disputes_seller ?? 0) as number) > 0 ? (
                            <div className="mt-0.5 text-[11px] text-gray-500">B:{(u.stats?.disputes_buyer ?? 0) as number} · V:{(u.stats?.disputes_seller ?? 0) as number}</div>
                          ) : null}
                        </td>
                        <td className="px-4 py-4 text-xs font-semibold text-gray-900">{formatMoney(Number(u?.stats?.withdrawn_total ?? 0))}</td>
                        <td className="px-4 py-4 text-xs text-gray-700">
                          <div className="text-[11px] text-gray-600">
                            Ventas: <span className="font-semibold text-gray-900">{vCan}</span> / {ventasTotalCount} ({vRate}%)
                          </div>
                          <div className="mt-1 text-[11px] text-gray-600">
                            Compras: <span className="font-semibold text-gray-900">{cCan}</span> / {comprasTotalCount} ({cRate}%)
                          </div>
                        </td>
                        <td className="px-4 py-4 text-xs">
                          <span
                            className={
                              st === 'deleted'
                                ? 'inline-flex rounded-xl bg-gray-200 px-3 py-2 font-extrabold text-gray-800 ring-1 ring-gray-300'
                                : st === 'banned'
                                  ? 'inline-flex rounded-xl bg-red-50 px-3 py-2 font-extrabold text-red-700 ring-1 ring-red-200'
                                  : st === 'suspended'
                                    ? 'inline-flex rounded-xl bg-amber-50 px-3 py-2 font-extrabold text-amber-900 ring-1 ring-amber-200'
                                    : 'inline-flex rounded-xl bg-green-50 px-3 py-2 font-extrabold text-green-800 ring-1 ring-green-200'
                            }
                          >
                            {st === 'deleted' ? 'Eliminada' : st === 'banned' ? 'Bloqueada' : st === 'suspended' ? 'Suspendida' : 'Activa'}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <Link
                            href={`/perfil/${u.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex rounded-xl bg-white px-3 py-2 text-xs font-semibold text-brand-pink shadow-sm ring-1 ring-pink-200 hover:bg-pink-50"
                          >
                            Ver →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          <div className="text-sm font-bold text-gray-900">Ficha</div>
          {!selected ? (
            <div className="mt-3 text-sm text-gray-600">Selecciona un usuario de la lista.</div>
          ) : (
            <>
              <div className="mt-3">
                <div className="text-lg font-extrabold text-gray-900">{displayName(selected)}</div>
                {(detail?.user?.email ?? selected.email) ? (
                  <div className="mt-1 text-sm font-semibold text-gray-700">📧 {detail?.user?.email ?? selected.email}</div>
                ) : null}
                <div className="mt-1 text-xs text-gray-500">{selected.id}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Link
                    href={`/perfil/${selected.id}`}
                    target="_blank"
                    className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-brand-pink shadow-sm ring-1 ring-pink-200 hover:bg-pink-50"
                  >
                    Abrir perfil público →
                  </Link>
                </div>
                <div className="mt-2 text-sm font-semibold text-gray-700">Estado: {currentStateLabel}</div>
              </div>

              <div className="mt-4 grid gap-2 text-sm">
                <div className="rounded-2xl bg-gray-50 px-4 py-3 ring-1 ring-black/5">
                  <div className="text-xs font-semibold text-gray-600">Fecha de inscripción</div>
                  <div className="mt-1 font-bold text-gray-900">
                    {fmtDate(detail?.user?.auth_created_at ?? selected.auth_created_at ?? selected.created_at)}
                  </div>
                  {(detail?.user?.email ?? selected.email) ? (
                    <div className="mt-1 text-xs text-gray-600">
                      Email: <span className="font-semibold text-gray-900">{detail?.user?.email ?? selected.email}</span>
                    </div>
                  ) : null}
                  {(detail?.user?.last_sign_in_at ?? selected.last_sign_in_at) ? (
                    <div className="mt-1 text-xs text-gray-600">
                      Último acceso: <span className="font-semibold text-gray-900">
                        {fmtDate(detail?.user?.last_sign_in_at ?? selected.last_sign_in_at)}
                      </span>
                    </div>
                  ) : null}
                  {selected.encrypted_password ? (
                    <div className="mt-2">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-semibold text-gray-600">Contraseña (hash)</div>
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="text-xs font-semibold text-brand-pink hover:opacity-80"
                        >
                          {showPassword ? 'Ocultar' : 'Mostrar'}
                        </button>
                      </div>
                      {showPassword ? (
                        <div className="mt-1 break-all rounded-lg bg-white px-3 py-2 font-mono text-[10px] text-gray-700 ring-1 ring-black/10">
                          {selected.encrypted_password}
                        </div>
                      ) : (
                        <div className="mt-1 text-xs text-gray-500">••••••••••••••••</div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-2 text-xs text-gray-500">Sin contraseña configurada</div>
                  )}
                </div>
                <div className="rounded-2xl bg-gray-50 px-4 py-3 ring-1 ring-black/5">
                  <div className="text-xs font-semibold text-gray-600">Ventas</div>
                  <div className="mt-1 font-bold text-gray-900">
                    {selected.stats?.ventas_count ?? 0} · {formatMoney(Number(selected.stats?.ventas_total ?? 0))}
                  </div>
                </div>
                <div className="rounded-2xl bg-gray-50 px-4 py-3 ring-1 ring-black/5">
                  <div className="text-xs font-semibold text-gray-600">Compras</div>
                  <div className="mt-1 font-bold text-gray-900">
                    {selected.stats?.compras_count ?? 0} · {formatMoney(Number(selected.stats?.compras_total ?? 0))}
                  </div>
                </div>
                <div className="rounded-2xl bg-gray-50 px-4 py-3 ring-1 ring-black/5">
                  <div className="text-xs font-semibold text-gray-600">Cancelaciones</div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">
                    Ventas: {Number(selected.stats?.ventas_cancelled_count ?? 0) || 0} / {Number(selected.stats?.ventas_total_count ?? selected.stats?.ventas_count ?? 0) || 0}
                  </div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">
                    Compras: {Number(selected.stats?.compras_cancelled_count ?? 0) || 0} / {Number(selected.stats?.compras_total_count ?? selected.stats?.compras_count ?? 0) || 0}
                  </div>
                </div>
                {(detail?.user?.stats ?? selected.stats) && (
                  <>
                    <div className="rounded-2xl bg-blue-50 px-4 py-3 ring-1 ring-blue-100">
                      <div className="text-xs font-semibold text-blue-900">Operaciones</div>
                      <div className="mt-1 font-bold text-blue-900">{(detail?.user?.stats ?? selected.stats)?.operations_count ?? selected.stats?.operations_count ?? 0}</div>
                      <div className="mt-0.5 text-[11px] text-blue-800">ventas + compras (sin canceladas)</div>
                    </div>
                    <div className="rounded-2xl bg-amber-50 px-4 py-3 ring-1 ring-amber-100">
                      <div className="text-xs font-semibold text-amber-900">Disputas</div>
                      <div className="mt-1 font-bold text-amber-900">
                        {(detail?.user?.stats ?? selected.stats)?.disputes_total ?? selected.stats?.disputes_total ?? 0} total
                        {((detail?.user?.stats ?? selected.stats)?.disputes_open ?? 0) > 0 && (
                          <span className="ml-1 rounded bg-red-200 px-1.5 py-0.5 text-xs text-red-900">
                            {(detail?.user?.stats ?? selected.stats)?.disputes_open ?? 0} abiertas
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-[11px] text-amber-800">
                        comprador: {(detail?.user?.stats ?? selected.stats)?.disputes_buyer ?? selected.stats?.disputes_buyer ?? 0} · vendedor: {(detail?.user?.stats ?? selected.stats)?.disputes_seller ?? selected.stats?.disputes_seller ?? 0}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-green-50 px-4 py-3 ring-1 ring-green-100">
                      <div className="text-xs font-semibold text-green-900">Dinero retirado</div>
                      <div className="mt-1 font-bold text-green-900">
                        {formatMoney((detail?.user?.stats ?? selected.stats)?.withdrawn_total ?? (selected.stats?.withdrawn_total as number) ?? 0)}
                      </div>
                      <div className="mt-0.5 text-[11px] text-green-800">retiros completados a Mercado Pago</div>
                    </div>
                  </>
                )}
              </div>

              {detailLoading && <div className="mt-3 text-xs text-gray-500">Cargando detalle…</div>}

              {detail?.user?.ratings && detail.user.ratings.length > 0 && (
                <div className="mt-4">
                  <div className="text-sm font-semibold text-gray-900">Calificaciones recibidas</div>
                  <div className="mt-2 max-h-48 space-y-2 overflow-y-auto">
                    {editingRating ? (
                      <div className="rounded-2xl border border-brand-pink bg-pink-50/50 p-3">
                        <div className="text-xs font-semibold text-gray-700">Editar: {editingRating.rater_name} · {editingRating.stars}/10</div>
                        <div className="mt-2 flex gap-2">
                          <input
                            type="number"
                            min={1}
                            max={10}
                            value={editStars}
                            onChange={(e) => setEditStars(e.target.value)}
                            className="w-14 rounded-lg border border-gray-300 px-2 py-1 text-sm"
                          />
                          <input
                            type="text"
                            value={editComment}
                            onChange={(e) => setEditComment(e.target.value)}
                            placeholder="Comentario"
                            className="flex-1 rounded-lg border border-gray-300 px-3 py-1 text-sm"
                          />
                        </div>
                        <div className="mt-2 flex gap-2">
                          <button type="button" onClick={saveRatingEdit} disabled={isSaving} className="rounded-lg bg-brand-pink px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
                            Guardar
                          </button>
                          <button type="button" onClick={() => { setEditingRating(null); setEditComment(''); }} className="rounded-lg bg-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-800">
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : null}
                    {detail.user.ratings.map((r: RatingRow) => (
                      <div key={r.id} className="rounded-xl border border-black/5 bg-white px-3 py-2 text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="font-semibold text-gray-900">{r.rater_name ?? '—'}</span>
                            <span className="ml-1 text-gray-600">· {r.stars}/10</span>
                            {r.direction === 'buyer_to_seller' && <span className="ml-1 rounded bg-gray-100 px-1 text-[10px]">comprador→vendedor</span>}
                            {r.direction === 'seller_to_buyer' && <span className="ml-1 rounded bg-gray-100 px-1 text-[10px]">vendedor→comprador</span>}
                            {r.comment ? <p className="mt-1 text-gray-700">{r.comment}</p> : null}
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <button
                              type="button"
                              onClick={() => { setEditingRating(r); setEditStars(String(r.stars)); setEditComment(r.comment ?? ''); }}
                              className="rounded bg-gray-100 px-2 py-1 font-medium text-gray-700 hover:bg-gray-200"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteRating(r.id)}
                              disabled={deletingRatingId === r.id}
                              className="rounded bg-red-100 px-2 py-1 font-medium text-red-700 hover:bg-red-200 disabled:opacity-50"
                            >
                              {deletingRatingId === r.id ? '…' : 'Eliminar'}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4">
                <div className="text-sm font-semibold text-gray-900">Documentos</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {selected.ine_front_url ? (
                    <a
                      href={selected.ine_front_url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-black/5 hover:bg-gray-50"
                    >
                      Ver INE frente
                    </a>
                  ) : null}
                  {selected.ine_back_url ? (
                    <a
                      href={selected.ine_back_url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-black/5 hover:bg-gray-50"
                    >
                      Ver INE reverso
                    </a>
                  ) : null}
                  {!selected.ine_front_url && !selected.ine_back_url ? <div className="text-sm text-gray-600">Sin INE.</div> : null}
                </div>
              </div>

              <div className="mt-4">
                <div className="text-sm font-semibold text-gray-900">Verificación</div>
                <div className="mt-2 flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3 ring-1 ring-black/5">
                  <div>
                    <div className="text-xs font-semibold text-gray-600">Usuario verificado</div>
                    <div className="mt-1 text-xs text-gray-500">
                      {selected.is_verified ? 'Este usuario tiene la insignia de verificado' : 'Este usuario no está verificado'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={toggleVerification}
                    disabled={isSaving}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold shadow-sm transition disabled:opacity-60 ${
                      selected.is_verified
                        ? 'bg-white text-gray-900 ring-1 ring-black/5 hover:bg-gray-50'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {selected.is_verified ? 'Quitar verificación' : 'Verificar usuario'}
                  </button>
                </div>
              </div>

              <div className="mt-4">
                <div className="text-sm font-semibold text-gray-900">Notas del administrador</div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-pink"
                  placeholder="Ej: historial de disputas, comportamiento, acuerdos…"
                />
                <div className="mt-3 grid gap-2">
                  <div className="flex items-center gap-2">
                    <input
                      value={suspendDays}
                      onChange={(e) => setSuspendDays(e.target.value)}
                      className="w-24 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-pink"
                      inputMode="numeric"
                      placeholder="Días"
                    />
                    <button
                      type="button"
                      onClick={() => applyState('suspend')}
                      disabled={isSaving}
                      className="flex-1 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-black/5 hover:bg-gray-50 disabled:opacity-60"
                    >
                      Suspender
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => applyState('activate')}
                    disabled={isSaving}
                    className="rounded-xl bg-brand-pink px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-60"
                  >
                    Activar cuenta
                  </button>
                  <button
                    type="button"
                    onClick={() => applyState('ban')}
                    disabled={isSaving}
                    className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-black disabled:opacity-60"
                  >
                    Bloqueo permanente
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      console.log('[USUARIOS] Botón Eliminar cuenta clickeado');
                      void applyState('delete');
                    }}
                    disabled={isSaving || !selected}
                    className="rounded-xl border-2 border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-100 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isSaving ? 'Eliminando…' : 'Eliminar cuenta'}
                  </button>
                </div>
                <div className="mt-3 text-xs text-gray-600">
                  Suspender/Bloquear afecta listados. Eliminar cuenta = eliminación permanente (NO reversible). Se eliminan todas las publicaciones, cupones y favoritos del usuario.
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={`/perfil/${selected.id}`}
                  className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-black/5 hover:bg-gray-50"
                >
                  Ver perfil
                </Link>
                <Link
                  href={`/tienda/${selected.id}`}
                  className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-black/5 hover:bg-gray-50"
                >
                  Ver tienda
                </Link>
                <Link
                  href={`/admin/supervision?seller_id=${selected.id}`}
                  className="rounded-xl bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-800 ring-1 ring-indigo-200 hover:bg-indigo-100"
                >
                  Supervisión (vendedor)
                </Link>
                <Link
                  href={`/admin/supervision?buyer_id=${selected.id}`}
                  className="rounded-xl bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-800 ring-1 ring-violet-200 hover:bg-violet-100"
                >
                  Supervisión (comprador)
                </Link>
                <Link
                  href="/admin/disputas"
                  className="rounded-xl bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100"
                >
                  Disputas
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

