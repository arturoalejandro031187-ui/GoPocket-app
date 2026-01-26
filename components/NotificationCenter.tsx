'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { getNotificationLink } from '@/lib/notifications/getNotificationLink';

export type NotificationRow = {
  id: string;
  title?: string | null;
  body?: string | null;
  type?: string | null;
  kind?: string | null;
  link_to?: string | null;
  data?: Record<string, unknown> | null;
  is_read?: boolean | null;
  created_at?: string | null;
};

function formatTime(input: string | null | undefined) {
  if (!input) return '';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return 'Ahora';
  if (diffMins < 60) return `Hace ${diffMins} min`;
  if (diffHours < 24) return `Hace ${diffHours} h`;
  if (diffDays < 7) return `Hace ${diffDays} días`;
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

function kind(row: NotificationRow) {
  return String((row?.data as any)?.kind ?? row?.type ?? row?.kind ?? '').trim().toLowerCase();
}

function icon(k: string) {
  if (['new_sale', 'sale_paid'].includes(k)) return '💰';
  if (['payment_approved', 'order_completed'].includes(k)) return '✅';
  if (k === 'payment_rejected') return '⚠️';
  if (['order_shipped', 'order_message', 'order_status'].includes(k)) return '📦';
  if (['listing_question', 'listing_answer'].includes(k)) return '💬';
  if (['support_message', 'support_reply', 'support_new_message'].includes(k)) return '🆘';
  if (['auction_won', 'auction_ended', 'outbid', 'bid_received', 'bid_placed'].includes(k)) return '🔨';
  return '🔔';
}

function styleByType(k: string) {
  if (['new_sale', 'sale_paid'].includes(k)) return 'bg-green-50 border-green-200 hover:bg-green-100 text-green-900';
  if (['payment_approved', 'order_completed'].includes(k)) return 'bg-blue-50 border-blue-200 hover:bg-blue-100 text-blue-900';
  if (k === 'payment_rejected') return 'bg-red-50 border-red-200 hover:bg-red-100 text-red-900';
  if (['order_shipped', 'order_message', 'order_status'].includes(k)) return 'bg-purple-50 border-purple-200 hover:bg-purple-100 text-purple-900';
  if (['listing_question', 'listing_answer'].includes(k)) return 'bg-pink-50 border-pink-200 hover:bg-pink-100 text-pink-900';
  if (['auction_won', 'auction_ended', 'outbid', 'bid_received', 'bid_placed'].includes(k)) return 'bg-amber-50 border-amber-200 hover:bg-amber-100 text-amber-900';
  return 'bg-gray-50 border-gray-200 hover:bg-gray-100 text-gray-900';
}

type Props = {
  /** Ocultar en ciertas rutas (ej. /admin) */
  hide?: boolean;
  /** Si el padre ya tiene userId (ej. AccountTopMenu), pasarlo para mostrar la campanita de inmediato */
  userId?: string | null;
};

export function NotificationCenter({ hide = false, userId: userIdProp }: Props) {
  const [open, setOpen] = useState(false);
  const [userIdLocal, setUserIdLocal] = useState<string | null>(null);
  const userId = userIdProp ?? userIdLocal;
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (uid: string) => {
    try {
      setLoading(true);
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        setRows([]);
        setUnreadCount(0);
        return;
      }
      const res = await fetch(`/api/notifications/list?limit=30&_t=${Date.now()}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRows([]);
        setUnreadCount(0);
        return;
      }
      const list = (json?.rows ?? []) as NotificationRow[];
      const unreadInList = list.filter((r) => r.is_read === false);
      const apiCount = Number(json?.unread_count ?? 0) || unreadInList.length;
      setRows(list);
      setUnreadCount(unreadInList.length === 0 ? 0 : apiCount);
    } catch {
      setRows([]);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (userIdProp) {
      setLoading(true);
      void load(userIdProp);
      return;
    }
    const boot = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const uid = data.user?.id ?? null;
        setUserIdLocal(uid ?? null);
        if (uid) {
          void load(uid);
        } else {
          setRows([]);
          setUnreadCount(0);
          setLoading(false);
        }
      } catch {
        setLoading(false);
      }
    };
    void boot();
  }, [load, userIdProp]);

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`notification-center-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => void load(userId))
      .subscribe();
    const t = setInterval(() => void load(userId), 15000);
    return () => {
      supabase.removeChannel(ch);
      clearInterval(t);
    };
  }, [userId, load]);

  useEffect(() => {
    if (!userId) return;
    const onUpdated = (e: Event) => {
      const d = (e as CustomEvent)?.detail;
      if (d?.source === 'notification-center') return;
      void load(userId);
    };
    window.addEventListener('notifications-updated', onUpdated);
    return () => window.removeEventListener('notifications-updated', onUpdated);
  }, [userId, load]);

  useEffect(() => {
    const onBlur = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onBlur);
    return () => window.removeEventListener('mousedown', onBlur);
  }, []);

  const markRead = useCallback(async (ids: string[]): Promise<boolean> => {
    if (!ids.length) return false;
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) return false;
    const res = await fetch('/api/notifications/mark-read', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) return false;
    setRows((prev) => prev.filter((r) => !ids.includes(r.id)));
    setUnreadCount((c) => Math.max(0, c - ids.length));
    window.dispatchEvent(new CustomEvent('notifications-updated', { detail: { markedRead: true, ids, source: 'notification-center' } }));
    return true;
  }, []);

  const markAllRead = useCallback(async (): Promise<boolean> => {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) return false;
    const res = await fetch('/api/notifications/mark-read', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ all: true }),
    });
    if (!res.ok) return false;
    setRows((prev) => prev.filter((r) => r.is_read === true));
    setUnreadCount(0);
    setOpen(false);
    window.dispatchEvent(new CustomEvent('notifications-updated', { detail: { markedRead: true, all: true, source: 'notification-center' } }));
    return true;
  }, []);

  const deleteNotifications = useCallback(async (ids: string[]): Promise<boolean> => {
    if (!ids.length) return false;
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) return false;
    const res = await fetch('/api/notifications/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) return false;
    setRows((prev) => prev.filter((r) => !ids.includes(r.id)));
    setUnreadCount((c) => Math.max(0, c - ids.length));
    window.dispatchEvent(
      new CustomEvent('notifications-updated', { detail: { deleted: true, deletedIds: ids, source: 'notification-center' } }),
    );
    return true;
  }, []);

  const deleteAllUnread = useCallback(async (): Promise<boolean> => {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) return false;
    const res = await fetch('/api/notifications/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ all: true }),
    });
    if (!res.ok) return false;
    setRows((prev) => prev.filter((r) => r.is_read === true));
    setUnreadCount(0);
    setOpen(false);
    window.dispatchEvent(
      new CustomEvent('notifications-updated', { detail: { deleted: true, all: true, source: 'notification-center' } }),
    );
    return true;
  }, []);

  const onItemClick = useCallback(
    async (row: NotificationRow) => {
      const link = getNotificationLink(row);
      if (row.is_read === false) {
        const ok = await markRead([row.id]);
        if (!ok) return;
      }
      setOpen(false);
      if (link) {
        window.location.href = link;
      }
    },
    [markRead],
  );

  if (hide || !userId) return null;

  const unreadRows = rows.filter((r) => r.is_read === false);
  const badgeCount = unreadRows.length === 0 ? 0 : unreadCount;

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-gray-700 shadow-sm ring-1 ring-black/10 hover:bg-gray-50"
        aria-label={badgeCount > 0 ? `${badgeCount} notificaciones sin leer` : 'Notificaciones'}
        aria-expanded={open}
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {badgeCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-pink px-1.5 text-xs font-bold text-white">
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(380px,calc(100vw-24px))] overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/10">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <span className="text-sm font-bold text-gray-900">Notificaciones</span>
            {badgeCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="text-xs font-semibold text-brand-pink hover:underline"
              >
                Marcar todas como leídas
              </button>
            )}
            {badgeCount > 0 && (
              <button
                type="button"
                onClick={() => void deleteAllUnread()}
                className="ml-3 text-xs font-semibold text-red-600 hover:underline"
              >
                Eliminar todas
              </button>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {loading ? (
              <div className="px-4 py-6 text-center text-sm text-gray-500">Cargando…</div>
            ) : unreadRows.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-gray-500">Sin notificaciones nuevas</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {unreadRows.map((row) => {
                  const k = kind(row);
                  const unread = row.is_read === false;
                  return (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => void onItemClick(row)}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${styleByType(k)} ${unread ? 'border-l-4 border-l-brand-pink' : ''}`}
                    >
                      <span className="shrink-0 text-xl">{icon(k)}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">{row.title || 'Notificación'}</span>
                          {unread && (
                            <span className="shrink-0 rounded-full bg-brand-pink/20 px-2 py-0.5 text-[10px] font-bold text-brand-pink">
                              Nuevo
                            </span>
                          )}
                        </div>
                        {row.body && <p className="mt-0.5 line-clamp-2 text-xs opacity-90">{row.body}</p>}
                        <p className="mt-1 text-[11px] opacity-70">{formatTime(row.created_at)}</p>
                      </div>
                      {getNotificationLink(row) && (
                        <span className="shrink-0 text-xs font-semibold text-brand-pink">→</span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void deleteNotifications([row.id]);
                        }}
                        className="ml-2 shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-50"
                      >
                        Borrar
                      </button>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="border-t border-gray-100 px-4 py-2">
            <Link
              href="/dashboard/notificaciones"
              onClick={() => setOpen(false)}
              className="block text-center text-sm font-semibold text-brand-pink hover:underline"
            >
              Ver todas en el panel
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
